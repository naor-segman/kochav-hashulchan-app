// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";

/* 106 leftovers on the guest pages:
 *  - the blessing counter counted UTF-16 units: an emoji is two, so a
 *    blessing of hearts stopped at 300 while the server takes 600 characters;
 *  - a custom group longer than the shared table can store was offered to the
 *    family and reached the host clipped, as a phantom second group;
 *  - with no Supabase env, four guest pages showed a made-up wedding in
 *    PRODUCTION builds (a branch preview, a misconfigured deploy). */

let EVENT = null, COLLAB = null;
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: false }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => EVENT,
  fetchCollabEvent: async () => COLLAB,
  fetchCollabGuests: async () => [],
}));
const { default: GiftScreen } = await import("./GiftScreen.jsx");
const { default: CollabScreen } = await import("./CollabScreen.jsx");
const { default: EventSiteScreen } = await import("./EventSiteScreen.jsx");
const { default: InviteScreen } = await import("./InviteScreen.jsx");
const { default: AnnouncementScreen } = await import("./AnnouncementScreen.jsx");

afterEach(() => { vi.unstubAllEnvs(); EVENT = null; COLLAB = null; });

const at = (path, route, el) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

describe("the blessing counter", () => {
  it("counts characters, not UTF-16 units, and stops at 600 characters", async () => {
    EVENT = { cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי" };
    at("/gift/tok12345", "/gift/:token", <GiftScreen />);
    const box = await screen.findByLabelText("ברכה אישית");
    fireEvent.change(box, { target: { value: "💛".repeat(550) } });
    expect(screen.getByText(/550 מתוך 600 תווים/)).toBeTruthy();
    fireEvent.change(box, { target: { value: "💛".repeat(650) } });
    expect([...box.value].length).toBe(600);
    expect(box.getAttribute("maxlength")).toBeNull();      // maxLength counts units, and would stop at 300
  });
});

describe("the shared table's group list", () => {
  it("does not offer a custom group longer than the table can store", async () => {
    const long = "ח".repeat(70);
    COLLAB = { cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי", customGroups: [long, "שכנים"] };
    at("/collab/tok12345", "/collab/:token", <CollabScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /הוסיפו שורה/ }));
    const opts = [...screen.getByLabelText("קבוצה").querySelectorAll("option")].map(o => o.value);
    expect(opts).toContain("שכנים");
    expect(opts).not.toContain(long);
  });
});

describe("no made-up event outside dev", () => {
  const MOCK_NAME = /נועה|טל/;
  it("event site", async () => {
    vi.stubEnv("DEV", false);
    at("/invite/tok12345", "/invite/:token", <EventSiteScreen />);
    expect(await screen.findByText(/הקישור אינו תקין/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(MOCK_NAME);
  });
  it("shared table", async () => {
    vi.stubEnv("DEV", false);
    at("/collab/tok12345", "/collab/:token", <CollabScreen />);
    expect(await screen.findByText(/הקישור אינו פעיל/)).toBeTruthy();
  });
  it("invite card", async () => {
    vi.stubEnv("DEV", false);
    at("/i/tok12345", "/i/:token", <InviteScreen />);
    expect(await screen.findByText("ההזמנה לא נמצאה")).toBeTruthy();
  });
  it("invitation / save-the-date", async () => {
    vi.stubEnv("DEV", false);
    at("/s/tok12345", "/s/:token", <AnnouncementScreen kind="invitation" />);
    expect(await screen.findByText("הדף לא נמצא")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(MOCK_NAME);
  });
});
