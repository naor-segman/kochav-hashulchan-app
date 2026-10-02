// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { placeCard, hasSeenTour, markTourSeen } from "./tourState.js";

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
