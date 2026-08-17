import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { SHARE_GROUPS, SHARE_LINKS, shareUrl } from "./shareLinks.js";
import { TOKEN_KEYS } from "../../utils/eventHelpers.js";

// ── The door test ─────────────────────────────────────────────────────────────
//
// This file exists because the same failure has now happened twice: a
// guest-facing page was built, routed, given an RPC and a storage bucket, and
// then appeared in NO share group — so the host had no way to obtain its URL.
// A finished feature with no door on it.
//
//   `album`    — caught and fixed; the comment in shareLinks.js records it.
//   `giftWall` — the identical thing, one screen over, and it survived that
//                fix. Found 17.8 by sweeping App.jsx against the share list.
//
// Nobody noticed either one, because nothing failed. The page worked
// perfectly for anyone who already had the link, and no test asked the only
// question that mattered: can a host actually get to it?
//
// So the test does not check that a particular row exists — that would pass
// forever and catch the third one never. It reads the ROUTE TABLE and asserts
// that every public token route has a way in.
// ─────────────────────────────────────────────────────────────────────────────

const APP = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");

/**
 * Every `/x/:token…` route App.jsx actually declares, as its literal prefix.
 * Read from the source rather than restated here: a list maintained beside the
 * thing it describes drifts from it, which is the whole bug.
 */
function publicTokenRoutes() {
  const out = [];
  for (const m of APP.matchAll(/path="(\/[^"]*\/:token[^"]*)"/g)) out.push(m[1]);
  return out;
}

/**
 * Routes that deliberately have no share link, each with the reason.
 * An exemption has to be argued here, in the open, rather than by omission.
 */
const NO_LINK_BY_DESIGN = {
  // A compatibility shim. `/entrance/:token` is the canonical address and IS
  // shared; HostessScreen only exists so older links keep resolving, and its
  // own docblock says nothing new should be added to it.
  "/hostess/:token": "shim for /entrance/:token, which is shared",
};

describe("every public page has a door", () => {
  it("accounts for every route it finds, exactly", () => {
    // Not `> 8`. An inequality tolerates the regex silently narrowing — and
    // orphan detection is one-directional, so a route dropping out of the sweep
    // is always a quiet pass, never a failure. The exact identity also catches a
    // typo in a `path`, which would otherwise add a bogus `covered` entry and
    // hide a real orphan behind it.
    const covered = new Set(SHARE_LINKS.map(l => l.path + ":token" + (l.suffix || "")));
    expect(publicTokenRoutes().length).toBe(covered.size + Object.keys(NO_LINK_BY_DESIGN).length);
  });

  it("gives every public token route a share link, or an argued exemption", () => {
    const covered = SHARE_LINKS.map(l => l.path + ":token" + (l.suffix || ""));
    const orphans = publicTokenRoutes()
      .filter(r => !covered.includes(r))
      .filter(r => !(r in NO_LINK_BY_DESIGN));

    expect(
      orphans,
      `these routes exist and no host can reach them:\n  ${orphans.join("\n  ")}\n` +
      "Add a row to SHARE_GROUPS, or an entry to NO_LINK_BY_DESIGN with the reason.",
    ).toEqual([]);
  });

  it("does not exempt a route that no longer exists", () => {
    // A stale exemption is how a real orphan hides: the route gets renamed, the
    // exemption keeps matching nothing, and the new path is silently uncovered.
    const routes = publicTokenRoutes();
    for (const r of Object.keys(NO_LINK_BY_DESIGN)) {
      expect(routes, `${r} is exempted but not routed`).toContain(r);
    }
  });
});

describe("the shape every consumer relies on", () => {
  it("points every link at a token the event actually mints", () => {
    // A link whose tokenKey is not in TOKEN_KEYS resolves to "" and produces a
    // URL ending in a bare slash — a live, copyable, broken link.
    for (const l of SHARE_LINKS) {
      expect(TOKEN_KEYS, `${l.key} → tokens.${l.tokenKey}`).toContain(l.tokenKey);
    }
  });

  it("carries the fields ShareLinksScreen renders", () => {
    for (const l of SHARE_LINKS) {
      for (const f of ["key", "tokenKey", "path", "label", "mark", "say"]) {
        expect(l[f], `${l.key}.${f}`).toBeTruthy();
      }
      expect(l.path.startsWith("/"), `${l.key}.path`).toBe(true);
      expect(l.path.endsWith("/"), `${l.key}.path must end in / — the token is appended raw`).toBe(true);
      // The new field is the whole point of the change and was the one field
      // with no shape rule: it is appended straight after the token.
      if (l.suffix !== undefined) {
        expect(l.suffix.startsWith("/"), `${l.key}.suffix must start with /`).toBe(true);
        expect(l.suffix.endsWith("/"), `${l.key}.suffix must not end with /`).toBe(false);
      }
    }
  });

  it("keeps keys unique, since React renders them as list keys", () => {
    const keys = SHARE_LINKS.map(l => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("builds the blessing wall's address through the code the screen uses", () => {
    // Through shareUrl, NOT by re-concatenating here. The first version of this
    // test did the arithmetic itself, so deleting the suffix from
    // ShareLinksScreen left all 1109 tests green while every host was sent to
    // the gift FORM instead of the projection wall. Verified by applying that
    // exact mutation and watching the suite pass.
    const wall = SHARE_LINKS.find(l => l.key === "giftWall");
    expect(wall).toBeDefined();
    expect(shareUrl(wall, "https://x.test", "TK")).toBe("https://x.test/gift/TK/wall");
  });

  it("leaves every other address at prefix+token", () => {
    for (const l of SHARE_LINKS.filter(l => l.key !== "giftWall")) {
      expect(shareUrl(l, "https://x.test", "TK"), l.key).toBe("https://x.test" + l.path + "TK");
    }
  });

  it("has no suffix on any other link", () => {
    for (const l of SHARE_LINKS.filter(l => l.key !== "giftWall")) {
      expect(l.suffix, `${l.key} should not need a suffix`).toBeUndefined();
    }
  });

  it("keeps group ids unique and every group non-empty", () => {
    const ids = SHARE_GROUPS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of SHARE_GROUPS) {
      expect(g.links.length, `${g.id} is empty`).toBeGreaterThan(0);
      expect(g.title && g.sub, `${g.id} needs a title and sub`).toBeTruthy();
    }
  });
});
