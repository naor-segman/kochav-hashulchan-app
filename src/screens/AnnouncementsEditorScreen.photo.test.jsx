// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* 136 stage D (31.10): a photo that cannot be read is said under the photo
 * button, as on the event-site editor — it was a toast. */
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../utils/imageCompress.js", async (orig) => ({
  ...(await orig()), compressImage: async () => { throw new Error("bad image"); },
}));
const AnnouncementsEditorScreen = (await import("./AnnouncementsEditorScreen.jsx")).default;

describe("AnnouncementsEditorScreen — photo errors", () => {
  it("an unreadable photo: under the button, not a toast", async () => {
    const showToast = vi.fn();
    const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה", tokens: { saveTheDate: "s1" } });
    render(<MemoryRouter><AnnouncementsEditorScreen activeEvent={ev} patchEvent={vi.fn()} showToast={showToast} go={vi.fn()} /></MemoryRouter>);
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    });
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), "err");
    expect(screen.getByRole("alert").textContent).toBe("לא הצלחנו לקרוא את התמונה");
  });
});
