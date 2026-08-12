import { describe, it, expect } from "vitest";
import { isSafeToReload } from "./useAppUpdate.js";

// Applying a service-worker update RELOADS the page. This app persists on a
// 1500ms debounce, so a reload while somebody is typing a guest's name throws
// away the last keystrokes for real — the rule below is what stands between the
// fix for a stale build and a new way to lose data.
const fakeDoc = (visibilityState, activeElement) => ({ visibilityState, activeElement, body: BODY });
const BODY = { tagName: "BODY", isContentEditable: false };
const el = (tagName, isContentEditable = false) => ({ tagName, isContentEditable });

describe("isSafeToReload", () => {
  it("is safe when nobody is looking at the tab", () => {
    // The most common case on a phone: it is in a pocket. Reload now and the
    // person comes back to the current version having never seen it happen.
    expect(isSafeToReload(fakeDoc("hidden", el("INPUT")))).toBe(true);
    expect(isSafeToReload(fakeDoc("hidden", el("TEXTAREA")))).toBe(true);
  });

  it("is NOT safe while a field has focus", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isSafeToReload(fakeDoc("visible", el(tag)))).toBe(false);
    }
    expect(isSafeToReload(fakeDoc("visible", el("DIV", true)))).toBe(false);
  });

  it("is safe on a visible tab with nothing focused", () => {
    expect(isSafeToReload(fakeDoc("visible", BODY))).toBe(true);
    expect(isSafeToReload(fakeDoc("visible", null))).toBe(true);
    expect(isSafeToReload(fakeDoc("visible", el("DIV")))).toBe(true);
    expect(isSafeToReload(fakeDoc("visible", el("BUTTON")))).toBe(true);
  });

  it("treats a focused button as safe — a click is not an unsaved edit", () => {
    expect(isSafeToReload(fakeDoc("visible", el("A")))).toBe(true);
  });
});
