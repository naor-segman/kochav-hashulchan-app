// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* WORKPLAN מ2: the gift page sent no analytics event at all. It now sends one,
 * after the server accepted the gift, carrying nothing that identifies the
 * guest: no name, no message text, no token, and the amount only as a band. */

const track = vi.fn();
const submitGift = vi.fn();
vi.mock("../lib/analytics.js", async (orig) => ({ ...(await orig()), track: (...a) => track(...a) }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", brideName: "דנה", groomName: "יוסי" }),
  submitGift: (...a) => submitGift(...a),
}));
const { default: GiftScreen } = await import("./GiftScreen.jsx");

beforeEach(() => { track.mockReset(); submitGift.mockReset(); });

const fill = async () => {
  render(<MemoryRouter initialEntries={["/gift/tok12345"]}><Routes>
    <Route path="/gift/:token" element={<GiftScreen />} />
  </Routes></MemoryRouter>);
  await screen.findByLabelText(/שמכם המלא/);
  fireEvent.change(screen.getByLabelText(/סכום המתנה/), { target: { value: "360" } });
  fireEvent.change(screen.getByLabelText(/שמכם המלא/), { target: { value: "משפחת כהן" } });
  fireEvent.change(screen.getByLabelText(/ברכה אישית/), { target: { value: "מזל טוב!" } });
  fireEvent.click(screen.getAllByRole("button").at(-1));
};

describe("gift page analytics", () => {
  it("sends gift_declared once the server accepted it — band, no identity", async () => {
    submitGift.mockResolvedValue(undefined);
    await fill();
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    const [name, props] = track.mock.calls[0];
    expect(name).toBe("gift_declared");
    expect(props).toEqual({ amount_band: "200-499", with_message: true });
    expect(JSON.stringify(props)).not.toMatch(/כהן|מזל טוב|tok12345|360/);
  });

  it("sends nothing when the server refused it", async () => {
    submitGift.mockRejectedValue(new Error("nope"));
    await fill();
    await screen.findByText(/אירעה שגיאה/);
    expect(track).not.toHaveBeenCalled();
  });
});
