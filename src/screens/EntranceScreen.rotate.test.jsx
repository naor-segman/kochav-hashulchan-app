// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* 102 (28.9): the greeter's door link could be made read-only but never
 * revoked. The host can now replace it, after saying what is lost. */

const patchEventById = vi.fn();
const EV = {
  id: "e1", name: "החתונה", guests: [], tables: [], seating: {}, cloudId: null,
  tokens: { hostess: "oldhostesstok" },
};
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const open = () => render(
  <AuthProvider><MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
    <Route path="/events/:eventId/entrance" element={
      <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={patchEventById} />} />
  </Routes></MemoryRouter></AuthProvider>
);

describe("the host can revoke the door link", () => {
  it("asks first, then rotates only the hostess token", async () => {
    localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 }));
    open();
    fireEvent.click(await screen.findByRole("button", { name: /קישור לדיילת/ }));
    fireEvent.click(screen.getByRole("button", { name: /החליפו קישור/ }));
    expect(patchEventById).not.toHaveBeenCalled();           // nothing before the answer
    expect(await screen.findByText(/יפסיק לעבוד ברגע שהשינוי יישמר/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "החליפו את הקישור" }));
    await waitFor(() => expect(patchEventById).toHaveBeenCalledTimes(1));
    const [id, fn] = patchEventById.mock.calls[0];
    const out = fn(EV);
    expect(id).toBe("e1");
    expect(out.tokens.hostess).not.toBe("oldhostesstok");
    expect(out.tokensRotatedAt).toBeTypeOf("number");
  });

  it("cancelling leaves the link as it is", async () => {
    patchEventById.mockReset();
    open();
    fireEvent.click(await screen.findByRole("button", { name: /קישור לדיילת/ }));
    fireEvent.click(screen.getByRole("button", { name: /החליפו קישור/ }));
    fireEvent.click(await screen.findByRole("button", { name: "ביטול" }));
    await new Promise(r => setTimeout(r, 20));
    expect(patchEventById).not.toHaveBeenCalled();
  });
});
