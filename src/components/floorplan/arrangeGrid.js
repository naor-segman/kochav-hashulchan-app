/**
 * The grid "סדרו על הסקיצה" lays unplaced tables on (סב34d).
 *
 * It used to be sized from the table count alone — √(n·1.4) columns across 64%
 * of the width — with no idea how wide a chip is. A chip is 120–180px (100–150
 * on a phone); at 768px with 20 tables that put chip centres 98px apart, and
 * the host got a pile of chips on top of each other.
 *
 * Now the columns come from the sketch's width divided by a chip's width, and
 * the rows grow: they start in the middle band (the edges are where the walls,
 * the stage and the entrance usually are) and widen toward the full height
 * only when they need to. When even the full height cannot hold every row
 * apart — a very wide, very short sketch — rows overlap vertically and say so
 * in `fits: false`; that is a fact about the photo, not a layout choice.
 *
 * Positions are fractions of the sketch (0–1), the chip's CENTRE, Hebrew
 * reading order: slot 0 is top-RIGHT.
 *
 * @param {number} total   slots needed (the whole room, not just the missing)
 * @param {object} [box]   { width, height, chipW, chipH, gap } in px. Without a
 *                         measured box (no layout, e.g. a test DOM) it falls
 *                         back to the previous proportions.
 */
export function arrangeGrid(total, box = {}) {
  const n = Math.max(1, total | 0);
  const { width: W = 0, height: H = 0, chipW = 0, chipH = 0, gap = 8 } = box;

  if (!(W > 0 && H > 0 && chipW > 0 && chipH > 0)) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.4)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const dx   = cols > 1 ? 0.64 / (cols - 1) : 1;
    const dy   = rows > 1 ? 0.52 / (rows - 1) : 1;
    const slot = (i) => {
      const col = i % cols, row = Math.floor(i / cols);
      return clamp({ x: cols === 1 ? 0.5 : 0.82 - col * dx, y: rows === 1 ? 0.5 : 0.24 + row * dy }, 0.06);
    };
    return { cols, rows, dx, dy, slot, fits: true };
  }

  const pitchX = chipW + gap, pitchY = chipH + gap;
  // A chip's centre must stay half a chip from the edge, or it hangs off.
  const spanX = Math.max(0, W - chipW);
  const spanY = Math.max(0, H - chipH);
  const cols  = Math.max(1, Math.min(n, Math.floor(spanX / pitchX) + 1));
  const rows  = Math.max(1, Math.ceil(n / cols));

  // Middle band first (as before: 64% of the width, 52% of the height), grown
  // to what the chips need, never past the sketch.
  const bandX = Math.min(spanX, Math.max(0.64 * W, (cols - 1) * pitchX));
  const bandY = Math.min(spanY, Math.max(0.52 * H, (rows - 1) * pitchY));
  const dxPx  = cols > 1 ? bandX / (cols - 1) : 0;
  const dyPx  = rows > 1 ? bandY / (rows - 1) : 0;
  const right = cols === 1 ? W / 2 : (W + bandX) / 2;
  const top   = rows === 1 ? H / 2 : (H - bandY) / 2;

  const slot = (i) => {
    const col = i % cols, row = Math.floor(i / cols);
    return clamp({ x: (right - col * dxPx) / W, y: (top + row * dyPx) / H }, 0);
  };
  return {
    cols, rows,
    dx: cols > 1 ? dxPx / W : 1,
    dy: rows > 1 ? dyPx / H : 1,
    slot,
    // Touching is not overlapping: the gap is a nicety, the chip is the limit.
    fits: rows === 1 || dyPx >= chipH - 0.5,
  };
}

function clamp(p, m) {
  return { x: Math.min(1 - m, Math.max(m, p.x)), y: Math.min(1 - m, Math.max(m, p.y)) };
}
