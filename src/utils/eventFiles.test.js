import { describe, it, expect, vi, beforeEach } from "vitest";

/* An event's files go with it (1.10, checklist 103). An in-memory storage:
 * list() is one level deep and returns folders with id null, remove() resolves
 * with { error } — both as Supabase's client does. */
let files;      // bucket -> Set(path)
let failList;   // bucket that errors on list
let calls;
function storageFor(bucket) {
  return {
    async list(prefix, { limit, offset }) {
      calls.push(["list", bucket, prefix, offset]);
      if (failList === bucket) return { data: null, error: new Error("offline") };
      const seen = new Map();
      for (const p of files[bucket]) {
        if (!p.startsWith(prefix + "/")) continue;
        const [head, ...rest] = p.slice(prefix.length + 1).split("/");
        seen.set(head, rest.length ? { name: head, id: null } : { name: head, id: "id-" + head });
      }
      return { data: [...seen.values()].slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      calls.push(["remove", bucket, paths.length]);
      paths.forEach(p => files[bucket].delete(p));
      return { data: [], error: null };
    },
  };
}
vi.mock("../lib/supabase.js", () => ({
  supabase: { storage: { from: (b) => storageFor(b) } },
  isSupabaseConfigured: true,
}));
const { purgeEventFiles } = await import("./eventFiles.js");

beforeEach(() => {
  calls = []; failList = null;
  files = {
    "event-site": new Set(["ev1/cover.jpg", "ev1/g1.jpg", "ev2/cover.jpg"]),
    "event-album": new Set(["ev1/tokA/a.jpg", "ev1/tokA/b.jpg", "ev1/tokB/c.jpg", "ev2/tokZ/z.jpg"]),
  };
});

describe("purgeEventFiles", () => {
  it("removes the event's site photos and every album folder — and nothing of another event", async () => {
    expect(await purgeEventFiles("ev1")).toBe(5);
    expect([...files["event-site"]]).toEqual(["ev2/cover.jpg"]);
    expect([...files["event-album"]]).toEqual(["ev2/tokZ/z.jpg"]);
  });

  it("pages through a folder longer than one list() page", async () => {
    for (let i = 0; i < 250; i++) files["event-site"].add(`ev1/p${i}.jpg`);
    expect(await purgeEventFiles("ev1")).toBe(255);
    expect([...files["event-site"]]).toEqual(["ev2/cover.jpg"]);
  });

  it("throws when storage cannot be listed, and removes nothing", async () => {
    failList = "event-album";
    await expect(purgeEventFiles("ev1")).rejects.toThrow("offline");
    expect(files["event-site"].size).toBe(3);
  });
});
