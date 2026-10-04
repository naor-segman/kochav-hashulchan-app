import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Audit 3.10, P2-9 — two conventions, pinned.
 *
 * 1. No italic on the guest pages. Hebrew has no italic and Heebo ships
 *    none, so `font-style: italic` makes the browser slant the letters
 *    itself — on the blessing wall, the gift thank-you and the RSVP message.
 *
 * 2. A forward arrow goes AFTER its label: "לאתר האירוע ←". That is how
 *    ~30 calls to action in the product read; four said "← לאתר האירוע",
 *    two of them on the same RSVP page as buttons written the other way. */

const GUEST_SHEETS = [
  "GiftWallScreen", "GiftScreen", "RSVPScreen", "EventSiteScreen", "InviteScreen",
  "AlbumScreen", "AnnouncementScreen", "EntranceScreen", "CollabScreen",
].map(n => `src/screens/${n}.module.css`).concat("src/components/guest/GuestPrivacyNote.module.css");

describe("guest pages: upright type", () => {
  for (const f of GUEST_SHEETS) {
    it(f, () => {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css).not.toMatch(/font-style:\s*italic/);
    });
  }
});

const walk = (dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (n === "admin" ? [] : walk(p)) : (/\.jsx$/.test(n) && !/\.test\./.test(n) ? [p] : []);
});

describe("a forward arrow follows its label", () => {
  it("no link or button text in the customer app starts with '← '", () => {
    const offenders = [];
    for (const f of walk("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/>\s*←\s+[\p{L}]/gu)) offenders.push(`${f}: ${src.slice(m.index, m.index + 30)}`);
    }
    expect(offenders).toEqual([]);
  });
});
