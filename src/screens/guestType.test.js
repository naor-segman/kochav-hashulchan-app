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

const walkExt = (dir, ext) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (n === "admin" ? [] : walkExt(p, ext)) : (ext.test(n) && !/\.test\./.test(n) ? [p] : []);
});
const walk = (dir) => walkExt(dir, /\.jsx$/);

/* The host app too (audit 3.10, P2-9 leftovers). The guest fix left eight
 * rules in Seating, the suggestions panel, Dashboard and Account — every one
 * on a Hebrew sentence ("שולחן ריק", "ללא שם", "לא נרכשה חבילה…", the
 * suggestions' disclaimer). Every user-facing string in the customer app is
 * Hebrew, so the rule is simply: no synthetic slant anywhere outside admin
 * (the owner has not reviewed that panel yet; it is left alone). */
describe("customer app: upright type everywhere", () => {
  it("no stylesheet sets font-style italic or oblique", () => {
    const offenders = walkExt("src", /\.css$/).filter(f =>
      /font-style:\s*(italic|oblique)/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
    expect(offenders).toEqual([]);
  });
  it("no component sets fontStyle italic inline", () => {
    const offenders = walkExt("src", /\.jsx?$/).filter(f => /fontStyle\s*:\s*["'](italic|oblique)/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

/* WORKPLAN ב9 (audit 3.10, leftovers): "לדף הבית" on a dead guest link was
 * one rule copied into seven sheets, and the copies drifted (P2-5 fixed six
 * of seven). Each sheet now composes src/styles/homeLink.module.css; a sheet
 * that writes its own colour, display or height again is a new copy. */
describe("the guest 'לדף הבית' link has one definition", () => {
  it("every guest .homeLink composes the shared rule and restates none of it", () => {
    const offenders = [];
    for (const f of walkExt("src/screens", /\.module\.css$/)) {
      if (/LoginScreen|SignupScreen/.test(f)) continue;   // the auth pages' back link is a different control
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/\.homeLink\s*\{([^}]*)\}/g)) {
        const body = m[1];
        if (!/composes:\s*homeLink(OnDark)?\s+from\s+"\.\.\/styles\/homeLink\.module\.css"/.test(body)
            || /(^|;)\s*(color|display|min-height|font-weight|text-decoration)\s*:/.test(body)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
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
