// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../test/dom.js";
import { useScreenTour } from "./useScreenTour.js";
import { markTourSeen } from "../utils/tourState.js";

/**
 * When the guided tour (124) opens by itself. Every rule here was a bug or a
 * near-miss in a browser run: a tour over another dialog, a tour that decided
 * its steps before the screen's data arrived, a tour inside every qa/ harness.
 */

const after = async (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
let blocker;
const block = (attr) => { blocker = document.createElement("div"); blocker.setAttribute(attr, "true"); document.body.appendChild(blocker); };

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { blocker?.remove(); blocker = null; vi.useRealTimers(); });

describe("useScreenTour", () => {
  it("opens by itself on a first visit, after the screen has painted", async () => {
    const { result } = renderHook(() => useScreenTour("guests"));
    expect(result.current.open).toBe(false);
    await after(700);
    expect(result.current.open).toBe(true);
  });

  it("not on a screen this browser has already been walked through", async () => {
    markTourSeen("guests");
    const { result } = renderHook(() => useScreenTour("guests"));
    await after(2000);
    expect(result.current.open).toBe(false);
  });

  it("waits while the screen is still loading (aria-busy), then opens", async () => {
    // RSVP, the collab table and the album load from the cloud; opening
    // before their parts arrive drops those steps for good.
    block("aria-busy");
    const { result } = renderHook(() => useScreenTour("rsvps"));
    await after(3000);
    expect(result.current.open).toBe(false);
    blocker.remove();
    await after(800);
    expect(result.current.open).toBe(true);
  });

  it("waits for another dialog to close", async () => {
    block("aria-modal");
    const { result } = renderHook(() => useScreenTour("guests"));
    await after(3000);
    expect(result.current.open).toBe(false);
    blocker.remove();
    await after(800);
    expect(result.current.open).toBe(true);
  });

  it("gives up after ~30s rather than open on top of something still there", async () => {
    block("aria-modal");
    const { result } = renderHook(() => useScreenTour("guests"));
    await after(40000);
    expect(result.current.open).toBe(false);
  });

  it("never in an automated browser (every qa/ harness)", async () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    try {
      const { result } = renderHook(() => useScreenTour("guests"));
      await after(2000);
      expect(result.current.open).toBe(false);
      expect(result.current.available).toBe(true);   // the button still works
    } finally {
      Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    }
  });

  it("closing remembers it; start() opens it again on demand", async () => {
    const { result } = renderHook(() => useScreenTour("guests"));
    await after(700);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(JSON.parse(localStorage.getItem("kochav_tour_v1")).guests).toBe(1);
    act(() => result.current.start());
    expect(result.current.open).toBe(true);
  });

  it("nothing for a key without a tour, or a null key", async () => {
    for (const key of [null, "no-such-screen"]) {
      const { result } = renderHook(() => useScreenTour(key));
      await after(2000);
      expect(result.current).toMatchObject({ open: false, available: false });
    }
  });
});
