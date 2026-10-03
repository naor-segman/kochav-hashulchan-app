// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStorageWarnings } from "./useStorageWarnings.js";
import { FLOORPLAN_NOT_SAVED_EVENT } from "../utils/storage.js";

/* 33b (1.10): over the quota the event now saves without its floor-plan
 * sketch — which the host must be told, once, not on every keystroke. */
describe("useStorageWarnings", () => {
  it("says the sketch was not saved, once a minute at most", () => {
    const showToast = vi.fn();
    renderHook(() => useStorageWarnings(showToast));
    window.dispatchEvent(new CustomEvent(FLOORPLAN_NOT_SAVED_EVENT, { detail: { eventIds: ["e1"] } }));
    window.dispatchEvent(new CustomEvent(FLOORPLAN_NOT_SAVED_EVENT, { detail: { eventIds: ["e1"] } }));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/סקיצת האולם לא נשמרה/);
  });
  it("still says when nothing could be saved", () => {
    const showToast = vi.fn();
    renderHook(() => useStorageWarnings(showToast));
    window.dispatchEvent(new CustomEvent("storage-quota-exceeded"));
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/הנתונים לא נשמרו/), "err");
  });
});
