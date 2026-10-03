import { pointerWithin, rectIntersection } from "@dnd-kit/core";

/**
 * Where a dragged guest lands — shared by the seating screen and the floor
 * plan, which had drifted apart (סב34c).
 *
 * Prefer whatever is under the pointer; when the pointer sits in a gap, fall
 * back to rectIntersection so a drag whose card clearly overlaps a table still
 * lands.
 *
 * Deliberately NOT closestCenter as the fallback: closestCenter always returns
 * something, so releasing over blank space seated the guest at whichever table
 * happened to be nearest. The seating screen fixed that long ago; the floor
 * plan kept closestCenter, so letting go on an empty part of the sketch seated
 * the guest at the nearest chip, silently. Dropping on empty space has to keep
 * meaning "never mind".
 */
export function pointerThenOverlap(args) {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
}
