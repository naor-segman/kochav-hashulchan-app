// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "../test/dom.js";
import { toastDuration, useToast } from "./useToast.js";

// Review 6.10: the seating run's explanation (~150 characters) closed after
// the flat 3.2s every toast had — before it could be read.
describe("toastDuration", () => {
  it("keeps 3.2s for a short message", () => {
    expect(toastDuration("נשמר ✓")).toBe(3200);
  });
  it("gives a long message time to be read, up to 9s", () => {
    expect(toastDuration("א".repeat(100))).toBe(6000);
    expect(toastDuration("א".repeat(400))).toBe(9000);
  });
});

describe("useToast uses it", () => {
  it("a long message is still up after 3.2s, gone after its own time", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useToast());
      const long = "א".repeat(100);   // 6s
      act(() => result.current.showToast(long, "err"));
      act(() => { vi.advanceTimersByTime(3300); });
      expect(result.current.toast?.msg).toBe(long);
      act(() => { vi.advanceTimersByTime(2800); });
      expect(result.current.toast).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
