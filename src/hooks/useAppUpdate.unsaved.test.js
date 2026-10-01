import { describe, it, expect, afterEach } from "vitest";
import { isSafeToReload } from "./useAppUpdate.js";
import { setUnsavedWork, hasUnsavedWork } from "../utils/unsavedWork.js";

/* 71d: the update reload only protected a FOCUSED field. A host form whose
 * edits live in component state until "שמירה" (EventSetupScreen) lost them the
 * moment the phone went into a pocket — "hidden" counted as safe. */
const hidden = { visibilityState: "hidden", activeElement: null };
const idle   = { visibilityState: "visible", activeElement: null };

afterEach(() => { setUnsavedWork("event-setup", false); setUnsavedWork("other", false); });

describe("unsaved host work holds the update reload", () => {
  it("not safe while a screen holds unsaved work — not even hidden", () => {
    setUnsavedWork("event-setup", true);
    expect(isSafeToReload(hidden)).toBe(false);
    expect(isSafeToReload(idle)).toBe(false);
  });

  it("safe again once the screen saved or left", () => {
    setUnsavedWork("event-setup", true);
    setUnsavedWork("event-setup", false);
    expect(isSafeToReload(hidden)).toBe(true);
  });

  it("one holder clearing does not clear another's", () => {
    setUnsavedWork("event-setup", true);
    setUnsavedWork("other", true);
    setUnsavedWork("other", false);
    expect(hasUnsavedWork()).toBe(true);
    expect(isSafeToReload(hidden)).toBe(false);
  });
});
