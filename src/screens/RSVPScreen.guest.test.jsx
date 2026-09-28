// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, waitFor, fireEvent } from "../test/dom.js";

/* 106 (28.9): the RSVP page printed the raw type "אחר" as a pill, its browser
 * tab carried the product's title instead of the event's, and its headcount
 * field could not be emptied. */

vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "הערב של דנה ויוסי", type: "אחר",
    brideName: "דנה", groomName: "יוסי", date: "2027-06-01", venue: "אולמי הגן" }),
}));
const { default: RSVPScreen } = await import("./RSVPScreen.jsx");

const open = () => render(<MemoryRouter initialEntries={["/rsvp/tok12345"]}><Routes>
  <Route path="/rsvp/:token" element={<RSVPScreen />} />
</Routes></MemoryRouter>);

describe("RSVP page, as a guest sees it", () => {
  it("does not print 'אחר' and names the event in the tab", async () => {
    document.title = "the default product title";
    open();
    await screen.findByText("הערב של דנה ויוסי");
    expect(screen.queryByText("אחר")).toBeNull();
    await waitFor(() => expect(document.title).toBe("אישור הגעה · דנה ויוסי"));
  });

  it("the headcount field can be emptied and retyped — it snapped back to 1 (13 instead of 3)", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /כן, אגיע בשמחה/ }));
    const count = await screen.findByLabelText("כמה מגיעים?");
    fireEvent.change(count, { target: { value: "" } });
    expect(count.value).toBe("");
    fireEvent.change(count, { target: { value: "3" } });
    expect(count.value).toBe("3");
    fireEvent.blur(count);
    expect(count.value).toBe("3");
    fireEvent.change(count, { target: { value: "" } });
    fireEvent.blur(count);
    expect(count.value).toBe("1");          // an empty field means one person
  });
});
