import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ownedPaths } from "../functions/_shared/purgePaths.js";

/* The rule that decides what the nightly photo purge deletes — with the SERVICE
 * ROLE, which bypasses every RLS policy in the project.
 *
 * Kept OUTSIDE supabase/functions/, like netlify/tests/: a test file inside a
 * deployed function directory is the shape that once killed every Netlify build
 * for eleven days (an `import … from "vitest"` a Deno bundler cannot resolve).
 *
 * THE ATTACK this pins shut (28.9 security audit, B2): the URLs come from the
 * due event's payload, which its owner can write. Paste another customer's
 * public photo URLs into your own gallery, set your date in the past, and the
 * old code deleted THEIR files on the next run. */

const BUCKET = "event-site";
const MINE   = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";
const url = (path) => `https://proj.supabase.co/storage/v1/object/public/${BUCKET}/${path}`;

describe("ownedPaths — the purge deletes only this event's own files", () => {
  it("keeps a photo inside this event's folder", () => {
    expect(ownedPaths([url(`${MINE}/cover.jpg`)], MINE, BUCKET)).toEqual([`${MINE}/cover.jpg`]);
  });

  it("REFUSES another customer's photo pasted into this payload", () => {
    // The attack, exactly.
    expect(ownedPaths([url(`${THEIRS}/cover.jpg`)], MINE, BUCKET)).toEqual([]);
  });

  it("refuses a path that climbs out of the folder", () => {
    // A first-segment check means nothing if the rest can walk out of it.
    expect(ownedPaths([url(`${MINE}/../${THEIRS}/cover.jpg`)], MINE, BUCKET)).toEqual([]);
    expect(ownedPaths([url(`${MINE}/%2E%2E/${THEIRS}/x.jpg`)], MINE, BUCKET)).toEqual([]);
    expect(ownedPaths([url(`${MINE}//x.jpg`)], MINE, BUCKET)).toEqual([]);
  });

  it("refuses the bare folder itself", () => {
    expect(ownedPaths([url(`${MINE}`)], MINE, BUCKET)).toEqual([]);
  });

  it("ignores other buckets, data URLs, junk and a missing event id", () => {
    expect(ownedPaths([`https://x/storage/v1/object/public/event-album/${MINE}/a.jpg`], MINE, BUCKET)).toEqual([]);
    expect(ownedPaths(["data:image/png;base64,AAAA", "", null, 42], MINE, BUCKET)).toEqual([]);
    expect(ownedPaths([url(`${MINE}/a.jpg`)], "", BUCKET)).toEqual([]);
    expect(ownedPaths(null, MINE, BUCKET)).toEqual([]);
  });

  it("strips a query string and a fragment", () => {
    expect(ownedPaths([url(`${MINE}/a.jpg?t=1#x`)], MINE, BUCKET)).toEqual([`${MINE}/a.jpg`]);
  });

  it("keeps the good paths from a payload that mixes both", () => {
    const got = ownedPaths([url(`${MINE}/a.jpg`), url(`${THEIRS}/b.jpg`), url(`${MINE}/g/c.jpg`)], MINE, BUCKET);
    expect(got).toEqual([`${MINE}/a.jpg`, `${MINE}/g/c.jpg`]);
  });
});

describe("the purge function actually uses the fence", () => {
  // A correct helper that the function does not call protects nothing.
  const fn = readFileSync("supabase/functions/purge-event-photos/index.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("imports ownedPaths and passes it the event id", () => {
    expect(fn).toMatch(/import \{ ownedPaths \} from "\.\.\/_shared\/purgePaths\.js"/);
    expect(fn).toMatch(/ownedPaths\(row\.urls \?\? \[\], row\.event_id, BUCKET\)/);
  });

  it("has no second, unfenced path extractor left behind", () => {
    expect(fn).not.toMatch(/function storagePath/);
  });
});
