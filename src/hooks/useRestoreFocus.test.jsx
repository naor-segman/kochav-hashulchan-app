// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "../test/dom.js";
import { useRestoreFocus } from "./useRestoreFocus.js";

/* useRestoreFocus re-checks focus 0ms and 300ms after a dialog closes. In
 * CI (PR #100, 3.10) the 300ms timer fired after jsdom had been torn down for
 * the next test file, threw "document is not defined", and Vitest failed a
 * run in which all 2,389 tests had passed. The timer must survive having no
 * document to look at. */

function Dialog() { useRestoreFocus(); return <div role="dialog">x</div>; }

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("useRestoreFocus — its timers outlive the page", () => {
  it("a recheck that fires after the document is gone does nothing, and does not throw", () => {
    vi.useFakeTimers();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Dialog />);
    unmount();                                  // schedules the rechecks
    opener.remove();
    vi.stubGlobal("document", undefined);       // the environment is torn down
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
  });
});
