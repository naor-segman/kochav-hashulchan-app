// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";

/* Fifth review 30.9: a closed link, a full event and an amount out of range
 * all said "אנא נסו שוב" — retrying could never help. */
let reason = "invalid token";
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", brideName: "דנה", groomName: "יוסי" }),
  submitGift: async () => { throw { message: reason }; },
}));
const { default: GiftScreen } = await import("./GiftScreen.jsx");

const send = async () => {
  render(<MemoryRouter initialEntries={["/gift/tok12345"]}><Routes>
    <Route path="/gift/:token" element={<GiftScreen />} />
  </Routes></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText(/שמכם המלא/), { target: { value: "משפחת כהן" } });
  fireEvent.change(screen.getByLabelText(/סכום המתנה/), { target: { value: "360" } });
  fireEvent.click(screen.getByRole("button", { name: /שלחו|שליחה/ }));
};

describe("gift errors a guest can act on", () => {
  it("a closed link says so", async () => {
    reason = "invalid token";
    await send();
    expect(await screen.findByText(/הקישור כבר לא פעיל/)).toBeTruthy();
  });
  it("a rate limit says when to retry", async () => {
    reason = "rate limited";
    await send();
    expect(await screen.findByText(/בעוד דקה/)).toBeTruthy();
  });
});
