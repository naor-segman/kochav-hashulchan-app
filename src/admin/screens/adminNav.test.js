import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { NAV_ITEMS } from "../lib/adminNav.js";

// THE DEFECT: "יומן פעילות" sat in the admin nav as a live link for as long as
// the panel has existed. Its screen queries `activity_logs` — a table with no
// migration anywhere in supabase/ and no code that writes a row to it. So the
// link always landed on a setup box which then told the operator to "run the
// activity log migration", a file nobody ever wrote. One person runs this
// panel; that is an afternoon spent hunting for something that does not exist.
//
// The narrow fix is one word in one array. What this test pins is the CLASS:
// a nav item is a promise that the screen behind it has data. Every live entry
// is resolved to its screen through AdminApp's route table, every `.from("…")`
// in that screen is collected, and every table named must actually be created
// somewhere in supabase/. That check would have caught this on the day the nav
// item was added, and it un-fails on its own the day the migration lands.

const here = (p) => new URL(p, import.meta.url);
const SRC = (p) => readFileSync(here(p), "utf8");

const APP = SRC("../AdminApp.jsx");
const DASH = SRC("./AdminDashboardScreen.jsx");

/** component name → screen file, from AdminApp's own imports. */
const IMPORTS = new Map(
  [...APP.matchAll(/import\s+(Admin\w+Screen)\s+from\s+"\.\/screens\/([\w.]+)"/g)]
    .map((m) => [m[1], m[2]]),
);

/** route segment → component name, from AdminApp's own <Route> tree. */
const ROUTES = new Map(
  [...APP.matchAll(/path="([\w:/]+)"[\s\S]{0,180}?<(Admin\w+Screen)\s*\/>/g)]
    .map((m) => [m[1], m[2]]),
);

/** Every table created anywhere in supabase/ — migrations and setup_full alike. */
function createdTables() {
  const found = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".sql")) {
        for (const m of readFileSync(full, "utf8")
          .matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
          found.add(m[1]);
        }
      }
    }
  };
  walk(new URL("../../../supabase", import.meta.url).pathname);
  return found;
}

describe("the admin nav's route table is intact", () => {
  it("parsed AdminApp — if this is empty every assertion below is vacuous", () => {
    // The regexes above read a file this test does not own. If AdminApp is
    // reformatted and they stop matching, the suite must fail loudly here
    // rather than quietly pass with nothing to check.
    expect(ROUTES.size).toBeGreaterThanOrEqual(9);
    expect(IMPORTS.size).toBeGreaterThanOrEqual(9);
  });

  it("every nav item points at a route that exists", () => {
    for (const item of NAV_ITEMS) {
      const seg = item.path.replace(/^\/admin\//, "");
      expect(ROUTES.has(seg), `${item.path} has no <Route> in AdminApp`).toBe(true);
    }
  });
});

describe("a live nav item has data behind it", () => {
  const TABLES = createdTables();

  it("read the migrations — an empty set would pass everything", () => {
    expect(TABLES.size).toBeGreaterThanOrEqual(10);
    expect(TABLES.has("events")).toBe(true);
  });

  it("every table a live screen queries is created in supabase/", () => {
    const missing = [];
    for (const item of NAV_ITEMS) {
      if (!item.live) continue;
      const file = IMPORTS.get(ROUTES.get(item.path.replace(/^\/admin\//, "")));
      const screen = SRC(`./${file}`);
      for (const m of screen.matchAll(/\.from\("(\w+)"\)/g)) {
        if (!TABLES.has(m[1])) missing.push(`${item.label} (${file}) → ${m[1]}`);
      }
    }
    expect(missing, "live nav item whose screen queries a table with no migration").toEqual([]);
  });

  it("keeps יומן פעילות out of the nav until activity_logs exists", () => {
    // Deliberately two-sided. The row must not be deleted — the operator should
    // still see that the screen is planned — and it must not be clickable.
    const activity = NAV_ITEMS.find((i) => i.path === "/admin/activity");
    expect(activity, "the row was removed instead of being marked").toBeTruthy();
    expect(activity.live).toBeFalsy();
    expect(activity.badge).toBeTruthy();
    expect(TABLES.has("activity_logs"), "activity_logs now exists — make it live again").toBe(false);
  });

  it("stops the screen itself sending the operator after a missing migration", () => {
    // The nav no longer points here, but a bookmark still does, and the route
    // is deliberately kept so it lands somewhere honest rather than 404-ing.
    // This is asserted at source level on purpose: qa/supabaseMock.js serves
    // seven fake `activity_logs` rows, so no browser pass can ever reach the
    // branch this text lives in.
    const screen = SRC("./AdminActivityScreen.jsx");
    // Comments stripped first, and that is not tidiness: the comment left in
    // place of the old sentence QUOTES it, so the raw slice matched and this
    // assertion failed on the very edit that fixed the bug. A source-level
    // string check has to read what renders, not what is written about it.
    const box = screen
      .slice(screen.indexOf("styles.setupBox"), screen.indexOf("actionTypeGrid"))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(box).not.toContain("הפעל את מיגרציית");
    expect(box).toContain("טרם נבנה");
  });

  it("renders the badge the item carries, not an invented phase number", () => {
    // The dead branch this revives used to print `Phase {item.phase}`. No row
    // ever set `phase`, and there is no phase 5 to name — the checklist
    // replaced phases as the planning surface months ago.
    expect(DASH).toContain("{item.badge}");
    expect(DASH).not.toContain("Phase {item.phase}");
  });
});
