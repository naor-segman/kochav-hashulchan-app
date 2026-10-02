// The guided tour's two pieces of pure logic (WORKPLAN 124, owner 2.10 #13):
// which screens this browser has already been walked through, and where the
// explanation card goes relative to the part it is explaining.

const KEY = "kochav_tour_v1";

function readSeen() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Has this browser already been shown the tour of `screen`? */
export function hasSeenTour(screen) {
  return readSeen()[screen] === 1;
}

/** Finished OR skipped — either way, never opened by itself again. */
export function markTourSeen(screen) {
  const seen = readSeen();
  seen[screen] = 1;
  // Private mode can refuse the write. Then the tour shows again next visit,
  // which is the lesser failure of the two.
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* best effort */ }
}

/**
 * Where the card sits, in viewport pixels.
 *
 * Below the part when it fits, else above it, else pinned to the bottom edge
 * over the part (a part taller than the screen — a long list — has no "below").
 * Horizontally centred on the part and clamped inside the gutters, so on a
 * 390px phone the card is the full width less the gutters and never runs off.
 *
 * @param {{top:number,bottom:number,left:number,width:number}|null} target
 * @param {{w:number,h:number}} card
 * @param {{w:number,h:number}} view
 */
export function placeCard(target, card, view, { gutter = 16, gap = 14 } = {}) {
  const clampX = (x) => Math.min(Math.max(x, gutter), Math.max(gutter, view.w - gutter - card.w));
  if (!target) {
    return { top: Math.max(gutter, (view.h - card.h) / 2), left: clampX((view.w - card.w) / 2), side: "center" };
  }
  const below = target.bottom + gap;
  const above = target.top - gap - card.h;
  let side, top;
  if (below + card.h <= view.h - gutter) { side = "below"; top = below; }
  else if (above >= gutter) { side = "above"; top = above; }
  else { side = "over"; top = view.h - gutter - card.h; }
  return { top: Math.max(gutter, top), left: clampX(target.left + target.width / 2 - card.w / 2), side };
}
