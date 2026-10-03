// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "../../test/dom.js";

/* 33b — when the device is full, persist() keeps the event but leaves the
 * sketch out, and the app warns. The editor said "הסקיצה הועלתה בהצלחה ✓"
 * over that warning, about an image that is gone on the next reload. */

const notSaved = vi.hoisted(() => ({ ids: new Set() }));
vi.mock("../../utils/storage.js", async (orig) => ({ ...(await orig()), floorPlansNotSaved: () => notSaved.ids }));
vi.mock("../../hooks/usePlan.js", () => ({ usePlan: () => ({ plan: "free", limits: {} }) }));
vi.mock("../../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const { default: FloorPlanEditor } = await import("./FloorPlanEditor.jsx");

// jsdom has no image decoding or canvas: just enough of both for compressImage.
beforeAll(() => {
  globalThis.Image = class { constructor() { this.naturalWidth = 800; this.naturalHeight = 600; } set src(_) { setTimeout(() => this.onload?.(), 0); } };
  HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,AAAA";
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => { notSaved.ids = new Set(); });

const EV = { id: "e1", name: "e", guests: [], tables: [], seating: {}, floorPlan: { image: null, tablePositions: {} } };

function upload() {
  const showToast = vi.fn();
  const patchEvent = vi.fn();
  const { container } = render(<FloorPlanEditor ev={EV} patchEvent={patchEvent} showToast={showToast} />);
  const input = container.querySelector("input[type=file]");
  fireEvent.change(input, { target: { files: [new File(["x"], "hall.png", { type: "image/png" })] } });
  return { showToast, patchEvent };
}

describe("the sketch upload toast", () => {
  it("says it worked when the write kept the image", async () => {
    const { showToast, patchEvent } = upload();
    await waitFor(() => expect(patchEvent).toHaveBeenCalled());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("הסקיצה הועלתה בהצלחה ✓"));
  });

  it("says nothing of success when the device could not keep it", async () => {
    notSaved.ids = new Set(["e1"]);
    const { showToast, patchEvent } = upload();
    await waitFor(() => expect(patchEvent).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 600));
    expect(showToast).not.toHaveBeenCalledWith("הסקיצה הועלתה בהצלחה ✓");
  });
});
