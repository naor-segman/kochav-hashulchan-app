// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "../test/dom.js";

/* Fourth review 30.9 — a regression from סב47. A failed lazy chunk reloaded
 * the page whatever was on it; analytics, the Excel export and the QR decoder
 * are lazy chunks too, so a guest's half-typed form (and a focused field) was
 * reloaded away. Right after a navigation it is the requested screen that
 * failed, and the reload is still the recovery. */

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], updateServiceWorker: () => {} }),
}));
const { useAppUpdate } = await import("./useAppUpdate.js");

const reload = vi.fn();
const at = (pathname) =>
  Object.defineProperty(window, "location", { configurable: true, value: { pathname, reload } });
beforeEach(() => {
  reload.mockReset();
  sessionStorage.clear();
  document.body.innerHTML = "";
  at("/");
});
const chunkFails = () => window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
const focusAField = () => {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  return input;
};

describe("a failed chunk load", () => {
  it("reloads when nothing is being typed (the stale-build case)", () => {
    renderHook(() => useAppUpdate());
    chunkFails();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a focused field away (analytics / export / scanner chunk)", () => {
    renderHook(() => useAppUpdate());
    focusAField();
    chunkFails();
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload a guest page that has been typed into", () => {
    at("/collab/abcdefgh1234");
    renderHook(() => useAppUpdate());
    const input = focusAField();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    chunkFails();
    expect(reload).not.toHaveBeenCalled();
  });

  it("right after a navigation, the requested screen failed — reload", () => {
    renderHook(() => useAppUpdate());
    focusAField();
    window.dispatchEvent(new PopStateEvent("popstate"));
    chunkFails();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

// Fifth review 30.9: a guest page used by TAPPING (RSVP "כן", a gift chip,
// the greeter's check-ins) counted as untouched and was reloaded away.
describe("a guest page that was tapped", () => {
  it("counts as in use, like one that was typed into", () => {
    at("/rsvp/abcdefgh1234");
    renderHook(() => useAppUpdate());
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    chunkFails();
    expect(reload).not.toHaveBeenCalled();
  });
});
