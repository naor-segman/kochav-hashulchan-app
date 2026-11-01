import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Square corners on every screen the host works in (136 stage D, 6.10: 254
 * corners in 42 files). A pass that edits by hand leaves some behind: on 31.10
 * the name-cards screen still had five rounded panels, feedback four, and four
 * round icon buttons were left in tasks, vendors, the floor plan and the site
 * editor. A circle (50%) is still allowed — dots, avatars, switch knobs.
 *
 * Outside the rule, each for a reason: pages a GUEST sees wear the host's
 * theme; the cookie banner was left alone on purpose (stage D); the device
 * frames on the home page draw real phones and laptops; admin is not touched. */
const EXEMPT = [
  /^src\/admin\//,
  /^src\/screens\/(EventSite|Invite|Announcement|RSVP|Album|Gift|GiftWall|Collab|SampleInvitation)Screen\.module\.css$/,
  /^src\/components\/(guest|consent|marketing)\//,
  /^src\/components\/support\/SupportButton\.module\.css$/,
];

function cssFiles(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".module.css") ? [p] : [];
  });
}

describe("square corners on the host's screens", () => {
  const files = cssFiles("src").filter(f => !EXEMPT.some(rx => rx.test(f)));

  it("checks a real number of files", () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it("no rounded corner except a full circle", () => {
    const bad = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const m = line.replace(/\/\*.*?\*\//g, "").match(/border(?:-[a-z-]+)?-radius\s*:\s*([^;]+);/);
        if (!m) return;
        const parts = m[1].trim().split(/\s+/);
        if (parts.every(v => v === "0" || v === "50%" || v === "inherit")) return;
        bad.push(`${f}:${i + 1}  ${m[1].trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
