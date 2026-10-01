// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { floorPlanAnnouncements, FLOOR_PLAN_SCREEN_READER_INSTRUCTIONS } from "./floorPlanAnnouncements.js";
import { RowKeyboardSensor } from "../seating/rowSensors.js";

// AX8 — the venue sketch spoke dnd-kit's English defaults with raw ids, and
// its instructions promised "press space" with no keyboard sensor behind it.

const guests = [
  { id: "g1", name: "דנה כהן", count: 2 },
  { id: "g2", name: "יוסי לוי", count: 1 },
];
const tables = [{ id: "t1", name: "שולחן 1", capacity: 2 }, { id: "t2", name: "משפחה", capacity: 10 }];
const seating = { g1: "t1" };
const a = floorPlanAnnouncements(guests, tables, seating);
const hebrewOnly = (s) => expect(s).not.toMatch(/[A-Za-z]{3,}/);

describe("floorPlanAnnouncements — Hebrew, with names", () => {
  it("a guest pill dropped on a table chip names the guest and the table", () => {
    const s = a.onDragEnd({ active: { id: "g2" }, over: { id: "chip-t2" } });
    expect(s).toBe("יוסי לוי — הושבה בשולחן משפחה.");
    hebrewOnly(s);
  });
  it("a pill over a full table chip says it is full", () => {
    expect(a.onDragEnd({ active: { id: "g2" }, over: { id: "chip-t1" } })).toMatch(/^שולחן 1 מלא/);
  });
  it("a pill over a chip says which table", () => {
    expect(a.onDragOver({ active: { id: "g2" }, over: { id: "chip-t2" } })).toBe("יוסי לוי מעל שולחן משפחה.");
  });
  it("a table chip being moved has its own lines", () => {
    for (const s of [
      a.onDragStart({ active: { id: "chip-t1" } }),
      a.onDragEnd({ active: { id: "chip-t1" }, over: { id: "chip-t1" } }),
      a.onDragCancel({ active: { id: "chip-t1" } }),
    ]) { expect(s).toContain("שולחן 1"); hebrewOnly(s); }
    expect(a.onDragOver({ active: { id: "chip-t1" }, over: { id: "chip-t2" } })).toBeUndefined();
  });
  it("the instructions are Hebrew and describe the keyboard", () => {
    expect(FLOOR_PLAN_SCREEN_READER_INSTRUCTIONS.draggable).toMatch(/רווח.*חיצים/);
  });
});

describe("RowKeyboardSensor — Space on a control inside a chip is that control's", () => {
  function chip() {
    const r = document.createElement("div");
    r.setAttribute("role", "button");
    r.innerHTML = `<span class="name">שולחן 1</span><button aria-label="הסירו מהסקיצה">✕</button>`;
    document.body.appendChild(r);
    return r;
  }
  const key = (row, target, code = "Space") => ({
    currentTarget: row, target, code, preventDefault() {},
    nativeEvent: { target, code, preventDefault() {} },
  });
  it("does not lift the chip from its ✕ button, and does from the chip", () => {
    const r = chip();
    const [{ handler }] = RowKeyboardSensor.activators;
    let lifted = 0;
    const opts = { keyboardCodes: { start: ["Space", "Enter"], cancel: ["Escape"], end: ["Space", "Enter"] }, onActivation: () => { lifted++; } };
    const ctx = { active: { activatorNode: { current: null } } };
    expect(handler(key(r, r.querySelector("button")), opts, ctx)).toBe(false);
    expect(handler(key(r, r), opts, ctx)).toBe(true);
    expect(lifted).toBe(1);
  });
});
