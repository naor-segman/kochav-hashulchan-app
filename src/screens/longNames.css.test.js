import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* FZ5: a 120-character unbroken name scrolled the RSVP, album, shared-table
 * and hub pages sideways at 390px (scrollX -922…-1777) and was clipped
 * mid-letter on the site hero, the invite card, the invitation and the gift
 * page. Measured in Chromium before and after (W1 harness, scratchpad
 * wrap.mjs: 9 of 9 failing → 9 of 9 passing). This pins the rules that fixed
 * it, so a restyle of one of these titles cannot quietly drop them. */
const RULES = {
  "EventHubScreen.module.css":     ["title"],
  "AlbumScreen.module.css":        ["title"],
  "EventSiteScreen.module.css":    ["heroNames", "heroEn"],
  "RSVPScreen.module.css":         ["eventName", "eventBannerName", "successTitle", "eventTag"],
  "AnnouncementScreen.module.css": ["names"],
  "InviteScreen.module.css":       ["coupleName"],
  "GiftScreen.module.css":         ["eventName", "successTitle"],
  "CollabScreen.module.css":       ["headerName", "title", "sub"],
};

describe("long names wrap instead of widening the page", () => {
  for (const [file, classes] of Object.entries(RULES)) {
    const css = readFileSync(new URL("./" + file, import.meta.url), "utf8");
    for (const c of classes) {
      it(`${file} .${c}`, () => {
        const m = new RegExp(`^\\.${c} \\{([^}]*)\\}`, "m").exec(css);
        expect(m, `.${c} not found`).toBeTruthy();
        expect(m[1]).toMatch(/overflow-wrap:\s*anywhere/);
      });
    }
  }
});
