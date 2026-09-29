// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor, act } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* סב23 (second review, 29.9): the host closed the door link while the
 * greeter's camera was open. The scan still said "3 סומנו כהגיעו" and sent
 * nothing. The camera now closes with the link. */

let writesOpen = true;
const mark = vi.fn(async () => {});
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostessData: vi.fn(async () => ({
    cloudId: "c1", name: "החתונה", writesOpen,
    guests: [{ id: "g1", name: "יעל כהן", count: 3 }], tables: [], seating: {},
  })),
  markArrivalByToken: (...a) => mark(...a),
}));
vi.mock("../utils/scanPayload.js", async (orig) => ({ ...(await orig()), isScanSupported: () => true }));
vi.mock("../components/ui/QrScanner.jsx", () => ({
  default: ({ onScan }) => <button onClick={() => onScan("g1")}>fake-scan</button>,
}));
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

describe("the camera closes with the door link", () => {
  it("writes closed while scanning: no scanner, nothing claimed, nothing sent", async () => {
    render(
      <AuthProvider><MemoryRouter initialEntries={["/entrance/tok12345678"]}><Routes>
        <Route path="/entrance/:token" element={<EntranceScreen mode="token" />} />
      </Routes></MemoryRouter></AuthProvider>
    );
    fireEvent.click(await screen.findByText(/סרקו קוד/));
    expect(screen.getByText("fake-scan")).toBeTruthy();
    writesOpen = false;
    await act(async () => { window.dispatchEvent(new Event("online")); });   // a refresh
    await waitFor(() => expect(screen.queryByText("fake-scan")).toBeNull());
    expect(document.body.textContent).not.toContain("סומנו כהגיעו");
    expect(mark).not.toHaveBeenCalled();
  });
});
