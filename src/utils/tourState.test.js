// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { placeCard, hasSeenTour, markTourSeen, litBox, unionRect } from "./tourState.js";

const VIEW = { w: 390, h: 844 };
const CARD = { w: 358, h: 220 };
const part = (top, height, left = 16, width = 358) => ({ top, bottom: top + height, left, width });

describe("placeCard — where the explanation goes", () => {
  it("goes BELOW the part when it fits", () => {
    const p = placeCard(part(100, 120), CARD, VIEW);
    expect(p.side).toBe("below");
    expect(p.top).toBe(220 + 14);
  });

  it("goes ABOVE a part near the bottom of the screen", () => {
    const p = placeCard(part(600, 150), CARD, VIEW);
    expect(p.side).toBe("above");
    expect(p.top + CARD.h).toBeLessThanOrEqual(600);
  });

  it("is pinned to the bottom edge, over a part taller than the screen", () => {
    const p = placeCard(part(0, 844), CARD, VIEW);
    expect(p.side).toBe("over");
    expect(p.top + CARD.h).toBe(844 - 16);
  });

  it("never runs off either side, whatever the part's position", () => {
    for (const left of [-200, 0, 300, 600]) {
      const p = placeCard(part(100, 40, left, 40), CARD, VIEW);
      expect(p.left).toBeGreaterThanOrEqual(16);
      expect(p.left + CARD.w).toBeLessThanOrEqual(390 - 16);
    }
  });

  it("is centred when there is no part to point at", () => {
    const p = placeCard(null, { w: 300, h: 200 }, { w: 1280, h: 860 });
    expect(p).toEqual({ side: "center", top: 330, left: 490 });
  });
});

describe("which tours this browser has seen", () => {
  beforeEach(() => localStorage.clear());

  it("remembers each screen on its own", () => {
    markTourSeen("guests");
    expect(hasSeenTour("guests")).toBe(true);
    expect(hasSeenTour("seating")).toBe(false);
  });

  it("a corrupted value reads as nothing seen, and is repaired by the next write", () => {
    // Broken JSON, and JSON that parses to something that is not a map — "null"
    // would otherwise throw on the property read, inside the Shell's effect.
    for (const bad of ["[1,2", "null", "[1,2]", "7"]) {
      localStorage.setItem("kochav_tour_v1", bad);
      expect(hasSeenTour("hub")).toBe(false);
      markTourSeen("hub");
      expect(hasSeenTour("hub")).toBe(true);
    }
  });
});

describe("litBox — the light stays where it can be seen", () => {
  const VIEW = { w: 390, h: 844 };
  it("pads the part all round", () => {
    expect(litBox({ top: 200, bottom: 300, left: 40, right: 300 }, VIEW))
      .toMatchObject({ top: 194, bottom: 306, left: 34, right: 306 });
  });
  it("keeps an edge-to-edge part's ring on the screen", () => {
    const b = litBox({ top: 200, bottom: 300, left: 0, right: 390 }, VIEW);
    expect(b.left).toBe(8);
    expect(b.right).toBe(382);
  });
  it("never rises under the sticky bars", () => {
    const b = litBox({ top: 90, bottom: 400, left: 16, right: 374 }, VIEW, { topLimit: 103 });
    expect(b.top).toBe(107);
  });
});

describe("unionRect", () => {
  it("is the box around the content, not the row", () => {
    expect(unionRect([
      { top: 10, bottom: 40, left: 200, right: 260, width: 60, height: 30 },
      { top: 10, bottom: 40, left: 270, right: 375, width: 105, height: 30 },
      { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 },
    ])).toMatchObject({ left: 200, right: 375, top: 10, bottom: 40 });
  });
});
