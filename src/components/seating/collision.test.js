import { describe, it, expect } from "vitest";
import { pointerThenOverlap } from "./collision.js";

/* סב34c (1.10): letting go on empty sketch space seated the guest at the
 * nearest chip — the floor plan used closestCenter, which always answers. */
const rect = (left, top, w, h) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h });
const container = (id, r) => ({ id, rect: { current: r }, data: { current: {} }, disabled: false });

function args({ pointer, drag }) {
  const t1 = rect(0, 0, 120, 60), t2 = rect(400, 0, 120, 60);
  return {
    active: { id: "g1" },
    collisionRect: drag,
    droppableRects: new Map([["t1", t1], ["t2", t2]]),
    droppableContainers: [container("t1", t1), container("t2", t2)],
    pointerCoordinates: pointer,
  };
}

describe("drop target (shared by seating screen and floor plan)", () => {
  it("empty space → no target", () => {
    expect(pointerThenOverlap(args({ pointer: { x: 250, y: 300 }, drag: rect(230, 280, 40, 20) }))).toEqual([]);
  });
  it("pointer over a table → that table", () => {
    expect(pointerThenOverlap(args({ pointer: { x: 450, y: 30 }, drag: rect(430, 20, 40, 20) })).map(c => c.id)).toEqual(["t2"]);
  });
  it("pointer in a gap but the card overlaps a table → it still lands", () => {
    expect(pointerThenOverlap(args({ pointer: { x: 130, y: 30 }, drag: rect(100, 20, 60, 20) })).map(c => c.id)).toEqual(["t1"]);
  });
});
