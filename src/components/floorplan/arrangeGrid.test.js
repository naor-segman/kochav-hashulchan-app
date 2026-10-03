import { describe, it, expect } from "vitest";
import { arrangeGrid } from "./arrangeGrid.js";

// סב34d — "סדרו על הסקיצה" piled chips on top of each other: the grid was
// sized from the table count alone, 64% of the width across √(n·1.4) columns,
// whatever the screen and the chip. At 768px with 20 tables the chip centres
// were 98px apart and a chip is 120–180px wide.

const overlaps = (a, b, box) =>
  Math.abs(a.x - b.x) * box.width < box.chipW && Math.abs(a.y - b.y) * box.height < box.chipH;

function pairsOverlapping(n, box) {
  const g = arrangeGrid(n, box);
  const pts = [...Array(n)].map((_, i) => g.slot(i));
  let bad = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (overlaps(pts[i], pts[j], box)) bad++;
  return { bad, g, pts };
}

describe("arrangeGrid — chips laid out by the sketch's width, not the table count", () => {
  for (const [label, box] of [
    ["tablet 768 × 512, desktop chip", { width: 734, height: 512, chipW: 180, chipH: 72 }],
    ["desktop 1100 × 700",             { width: 1100, height: 700, chipW: 180, chipH: 72 }],
    ["phone 360 × 480, phone chip",    { width: 340, height: 480, chipW: 150, chipH: 72, n: 10 }],
  ]) {
    const n = box.n || 20;
    it(`${n} tables, no two chips overlap — ${label}`, () => {
      const { bad, g } = pairsOverlapping(n, box);
      expect(g.fits).toBe(true);
      expect(bad).toBe(0);
    });
  }

  it("every chip centre stays half a chip inside the sketch", () => {
    const box = { width: 734, height: 512, chipW: 180, chipH: 72 };
    const { pts } = pairsOverlapping(20, box);
    for (const p of pts) {
      expect(p.x * box.width).toBeGreaterThanOrEqual(box.chipW / 2);
      expect((1 - p.x) * box.width).toBeGreaterThanOrEqual(box.chipW / 2);
      expect(p.y * box.height).toBeGreaterThanOrEqual(box.chipH / 2);
      expect((1 - p.y) * box.height).toBeGreaterThanOrEqual(box.chipH / 2);
    }
  });

  it("slot 0 is top-right (Hebrew reading order) and rows keep to the middle when there is room", () => {
    const g = arrangeGrid(12, { width: 1100, height: 700, chipW: 180, chipH: 72 });
    const s0 = g.slot(0), s1 = g.slot(1);
    expect(s0.x).toBeGreaterThan(s1.x);
    expect(s0.y).toBeCloseTo(0.24, 2);
  });

  it("a sketch too short for every row says so instead of pretending", () => {
    const g = arrangeGrid(40, { width: 400, height: 200, chipW: 180, chipH: 72 });
    expect(g.fits).toBe(false);
  });

  it("without a measured box (no layout) keeps the previous proportions", () => {
    const g = arrangeGrid(14);
    expect(g.cols).toBe(5);
    expect(g.slot(0)).toEqual({ x: 0.82, y: 0.24 });
  });
});
