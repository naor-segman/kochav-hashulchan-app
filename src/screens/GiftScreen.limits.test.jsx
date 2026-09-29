// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";

/* 106 (28.9): the ₪50 minimum was said only in the error after pressing send,
 * and the blessing stopped taking text at 600 characters with no sign why. */

vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", brideName: "דנה", groomName: "יוסי" }),
}));
const { default: GiftScreen } = await import("./GiftScreen.jsx");

const open = async () => {
  render(<MemoryRouter initialEntries={["/gift/tok12345"]}><Routes>
    <Route path="/gift/:token" element={<GiftScreen />} />
  </Routes></MemoryRouter>);
  await screen.findByLabelText(/שמכם המלא/);
};

describe("gift page limits, said before they bite", () => {
  it("states the minimum where the amount is typed", async () => {
    await open();
    expect(screen.getByLabelText(/סכום המתנה/)).toHaveAttribute("placeholder", "₪50 ומעלה");
  });

  it("counts the blessing near the limit, and only there", async () => {
    await open();
    const msg = screen.getByLabelText(/ברכה אישית/);
    fireEvent.change(msg, { target: { value: "א".repeat(100) } });
    expect(screen.queryByText(/מתוך 600 תווים/)).toBeNull();
    fireEvent.change(msg, { target: { value: "א".repeat(520) } });
    expect(screen.getByText("520 מתוך 600 תווים")).toBeInTheDocument();
  });

  it("refuses more than ₪100,000 before sending, and says so (סב36)", async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/שמכם המלא/), { target: { value: "משפחת כהן" } });
    fireEvent.change(screen.getByLabelText(/סכום המתנה/), { target: { value: "150000" } });
    fireEvent.click(screen.getByRole("button", { name: /שלחו|שליחה/ }));
    expect(await screen.findByText("הסכום המרבי הוא ₪100,000")).toBeInTheDocument();
  });
});
