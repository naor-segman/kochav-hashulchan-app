import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { isNameGated, makeOpenScreen, NAME_GATE_MESSAGE, NAME_GATE_EXEMPT } from "./eventNameGate.js";

// This gate existed twice — in Shell.jsx and in EventHubScreen.jsx — because it
// had ALREADY drifted once: the same click was blocked from the nav and allowed
// from the hub. Re-typing it a second time fixed that instance and left the
// mechanism intact, which is what this codebase's own note about hand-maintained
// duplicates says will happen again.
//
// So there are two kinds of assertion here: the behaviour, and the fact that
// there is only one copy of it.

describe("what the gate blocks", () => {
  it("blocks a tool when the event has no name", () => {
    expect(isNameGated({ name: "" }, "seating")).toBe(true);
    expect(isNameGated({}, "seating")).toBe(true);
  });

  it("treats whitespace as no name", () => {
    // The setup field accepts "   " before submit, and `!event.name` would let
    // it through — the whole product then keys off a blank string.
    expect(isNameGated({ name: "   " }, "seating")).toBe(true);
    expect(isNameGated({ name: "\t\n " }, "seating")).toBe(true);
  });

  it("lets a named event through", () => {
    expect(isNameGated({ name: "החתונה של דנה ויוסי" }, "seating")).toBe(false);
  });

  it("never blocks setup, which is where the name is entered", () => {
    // Without the exemption the gate sends an unnamed event to setup, and setup
    // is gated, so it sends it to setup — the host cannot reach the one screen
    // that would let them out.
    expect(isNameGated({ name: "" }, NAME_GATE_EXEMPT)).toBe(false);
    expect(isNameGated(undefined, NAME_GATE_EXEMPT)).toBe(false);
  });

  it("survives an event that is not there yet", () => {
    // `activeEvent` is undefined while auth resolves. Throwing here would blank
    // the rail on every cold load.
    expect(isNameGated(undefined, "seating")).toBe(true);
    expect(isNameGated(null, "seating")).toBe(true);
  });
});

describe("what the handler does", () => {
  const run = (event, id, opts = {}) => {
    const go = vi.fn();
    const showToast = opts.noToast ? undefined : vi.fn();
    makeOpenScreen(event, { go, showToast })(id);
    return { go, showToast };
  };

  it("sends a nameless event to setup and says why", () => {
    const { go, showToast } = run({ name: "" }, "seating");
    expect(go).toHaveBeenCalledWith("setup");
    expect(go).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(NAME_GATE_MESSAGE, "err");
  });

  it("opens the screen that was asked for when the event is named", () => {
    const { go, showToast } = run({ name: "כנס לקוחות" }, "seating");
    expect(go).toHaveBeenCalledWith("seating");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("does not crash a caller that has no toast", () => {
    // The rail has showToast; a future caller might not, and the optional call
    // is the only thing standing between that and a blank screen on click.
    expect(() => run({ name: "" }, "seating", { noToast: true })).not.toThrow();
  });

  it("does not navigate twice", () => {
    // The blocked path used to `return` after go("setup"). A missing return
    // would fire go("setup") then go("seating") — landing on the very screen
    // the gate exists to keep the host off.
    const { go } = run({ name: "" }, "seating");
    expect(go.mock.calls).toEqual([["setup"]]);
  });
});

describe("there is exactly one copy of it", () => {
  const SHELL = readFileSync(new URL("../components/layout/Shell.jsx", import.meta.url), "utf8");
  const HUB   = readFileSync(new URL("../screens/EventHubScreen.jsx", import.meta.url), "utf8");

  it("both entry points call the shared gate", () => {
    for (const [name, src] of [["Shell.jsx", SHELL], ["EventHubScreen.jsx", HUB]]) {
      expect(src, `${name} no longer imports the gate`).toContain("makeOpenScreen");
      expect(src, `${name} imports it from somewhere else`).toContain("eventNameGate.js");
    }
  });

  it("neither has re-inlined the rule", () => {
    // The exact shape of the duplicate that was removed. If someone pastes the
    // check back into a screen, this is what says so.
    for (const [name, src] of [["Shell.jsx", SHELL], ["EventHubScreen.jsx", HUB]]) {
      expect(src, `${name} has the message inline again`).not.toContain(NAME_GATE_MESSAGE);
      expect(src, `${name} has the condition inline again`).not.toMatch(/!==\s*"setup"\s*&&/);
    }
  });
});
