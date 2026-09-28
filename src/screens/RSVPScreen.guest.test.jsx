// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, waitFor } from "../test/dom.js";

/* 106 (28.9): the RSVP page printed the raw type "אחר" as a pill, and its
 * browser tab carried the product's title instead of the event's. */

vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "הערב של דנה ויוסי", type: "אחר",
    brideName: "דנה", groomName: "יוסי", date: "2027-06-01", venue: "אולמי הגן" }),
}));
const { default: RSVPScreen } = await import("./RSVPScreen.jsx");

describe("RSVP page, as a guest sees it", () => {
  it("does not print 'אחר' and names the event in the tab", async () => {
    document.title = "the default product title";
    render(<MemoryRouter initialEntries={["/rsvp/tok12345"]}><Routes>
      <Route path="/rsvp/:token" element={<RSVPScreen />} />
    </Routes></MemoryRouter>);
    await screen.findByText("הערב של דנה ויוסי");
    expect(screen.queryByText("אחר")).toBeNull();
    await waitFor(() => expect(document.title).toBe("אישור הגעה · דנה ויוסי"));
  });
});
