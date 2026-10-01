// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* Three guest-page defects the 29.9 review found, on the rendered pages:
 *  - the invitation's calendar button wrote 19:00 while the site's said 21:00
 *  - the RSVP page's calendar entry linked the event site even when the site
 *    was not published (a guest's calendar keeps "not published yet" for good)
 *  - the gift page printed the raw type "אחר" */

const downloads = [];
vi.mock("../utils/calendarFile.js", async (orig) => ({ ...(await orig()), downloadIcs: (ics) => downloads.push(ics) }));
let EVENT;
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => EVENT,
  submitRSVP: async () => {},
}));
const { default: AnnouncementScreen } = await import("./AnnouncementScreen.jsx");
const { default: RSVPScreen } = await import("./RSVPScreen.jsx");
const { default: GiftScreen } = await import("./GiftScreen.jsx");

beforeEach(() => { downloads.length = 0; });

describe("the invitation's calendar button", () => {
  it("writes the event's own start time, like the site", async () => {
    render(<MemoryRouter><AnnouncementScreen kind="invitation" localEvent={{
      name: "החתונה", date: "2027-06-01", venue: "אולמי הגן", type: "חתונה", brideName: "דנה", groomName: "יוסי",
      eventSite: { schedule: [{ id: "s1", time: "21:00", title: "חופה" }] }, tokens: {},
    }} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /הוסיפו ליומן/ }));
    // 21:00 in Israel in June (+3) is 18:00 UTC — the file carries the instant (61).
    expect(downloads[0]).toMatch(/DTSTART:20270601T180000Z/);
  });

  it("with no time in the schedule, writes an all-day entry, not an invented 19:00 (36b)", async () => {
    render(<MemoryRouter><AnnouncementScreen kind="invitation" localEvent={{
      name: "החתונה", date: "2027-06-01", venue: "אולמי הגן", type: "חתונה", brideName: "דנה", groomName: "יוסי",
      tokens: {},
    }} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /הוסיפו ליומן/ }));
    expect(downloads[0]).toMatch(/DTSTART;VALUE=DATE:20270601\r\n/);
    expect(downloads[0]).not.toMatch(/T190000/);
  });
});

describe("the RSVP page's calendar entry", () => {
  it("does not link a site that is not published", async () => {
    EVENT = { cloudId: "c1", name: "החתונה", date: "2027-06-01", brideName: "דנה", groomName: "יוסי",
      inviteToken: "inv12345", site: { enabled: false } };
    render(<MemoryRouter initialEntries={["/rsvp/tok12345"]}><Routes>
      <Route path="/rsvp/:token" element={<RSVPScreen />} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /כן, אגיע בשמחה/ }));
    const count = await screen.findByLabelText("כמה מגיעים?");
    fireEvent.change(screen.getByLabelText(/שם/, { selector: "input" }), { target: { value: "יעל כהן" } });
    fireEvent.submit(count.closest("form"));
    fireEvent.click(await screen.findByRole("button", { name: /הוסיפו את התאריך ליומן/ }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).not.toContain("/invite/");
  });
});

describe("the gift page", () => {
  it("does not print 'אחר'", async () => {
    EVENT = { cloudId: "c1", name: "הערב", type: "אחר", brideName: "דנה", groomName: "יוסי" };
    render(<MemoryRouter initialEntries={["/gift/tok12345"]}><Routes>
      <Route path="/gift/:token" element={<GiftScreen />} /></Routes></MemoryRouter>);
    await screen.findByText("ברכה ומתנה");
    expect(document.body.textContent).not.toContain("אחר ·");
  });
});
