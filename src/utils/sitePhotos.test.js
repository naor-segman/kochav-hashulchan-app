import { describe, it, expect, vi, beforeEach } from "vitest";

// The gallery moved from base64-inside-the-event to a URL pointing at Storage.
// What makes that safe to ship without migrating anything is that BOTH shapes
// are strings that render in <img src> — so the rules about telling them apart,
// and about recovering a path from a URL in order to delete, are the whole
// contract. Getting `storagePathFromUrl` wrong means either deleting the wrong
// object or silently never deleting at all, and the bucket only grows.

const upload = vi.fn();
const remove = vi.fn();
const getPublicUrl = vi.fn();

// `auth` is part of the mock because the failure path reads the session to say
// WHO the refused write was made as — the fact that distinguishes a wrong
// folder from a request that went out anonymously.
let session = { user: { id: "aaaaaaaa-1111-2222-3333-444444444444" } };
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    storage: { from: () => ({ upload, remove, getPublicUrl }) },
    auth: { getSession: async () => ({ data: { session } }) },
  },
  isSupabaseConfigured: true,
}));

const { isStoredPhoto, storagePathFromUrl, uploadSitePhoto, deleteSitePhoto } =
  await import("./sitePhotos.js");

const PUBLIC = "https://xyz.supabase.co/storage/v1/object/public/event-site";
const EVENT  = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  getPublicUrl.mockReset().mockImplementation(p => ({ data: { publicUrl: `${PUBLIC}/${p}` } }));
});

describe("telling a stored photo from a legacy one", () => {
  it("calls a data URL legacy and a http URL stored", () => {
    expect(isStoredPhoto("data:image/jpeg;base64,/9j/4AAQ")).toBe(false);
    expect(isStoredPhoto(`${PUBLIC}/${EVENT}/x.jpg`)).toBe(true);
  });

  it("never throws on the shapes an event can actually hold", () => {
    for (const bad of [null, undefined, "", 0, {}, []]) {
      expect(() => isStoredPhoto(bad), String(bad)).not.toThrow();
      expect(isStoredPhoto(bad), String(bad)).toBe(false);
    }
  });
});

describe("storagePathFromUrl — what delete depends on", () => {
  it("recovers the object path from a public URL", () => {
    expect(storagePathFromUrl(`${PUBLIC}/${EVENT}/1755-ab12.jpg`)).toBe(`${EVENT}/1755-ab12.jpg`);
  });

  // Supabase appends a cache-busting query on some URLs; the path must stop at
  // the `?` or `remove()` is handed a key that does not exist and quietly
  // deletes nothing.
  it("stops at a query string", () => {
    expect(storagePathFromUrl(`${PUBLIC}/${EVENT}/a.jpg?t=123`)).toBe(`${EVENT}/a.jpg`);
  });

  // Returning null rather than a guess is what lets the caller tell "nothing to
  // delete" from "delete this" — a legacy data URL has no object behind it.
  it("returns null for anything that is not an object in this bucket", () => {
    expect(storagePathFromUrl("data:image/jpeg;base64,/9j/")).toBeNull();
    expect(storagePathFromUrl("https://example.com/photo.jpg")).toBeNull();
    expect(storagePathFromUrl("https://xyz.supabase.co/storage/v1/object/public/event-album/e/1.jpg")).toBeNull();
    expect(storagePathFromUrl(null)).toBeNull();
    expect(storagePathFromUrl("")).toBeNull();
  });

  it("round-trips whatever upload produced", async () => {
    const url = await uploadSitePhoto(EVENT, new Blob(["x"], { type: "image/jpeg" }));
    expect(storagePathFromUrl(url)).toBe(upload.mock.calls[0][0]);
  });
});

describe("uploadSitePhoto", () => {
  it("writes into the event's own folder, which is what RLS keys on", async () => {
    await uploadSitePhoto(EVENT, new Blob(["x"], { type: "image/jpeg" }));
    expect(upload.mock.calls[0][0].startsWith(`${EVENT}/`)).toBe(true);
  });

  // Two photos picked in one batch land in the same millisecond, and
  // `upsert: false` turns a collision into a failed upload rather than an
  // overwrite — so the name cannot be the timestamp alone.
  it("does not collide when two photos are uploaded in the same millisecond", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    await Promise.all([uploadSitePhoto(EVENT, blob), uploadSitePhoto(EVENT, blob)]);
    const [a, b] = upload.mock.calls.map(c => c[0]);
    expect(a).not.toBe(b);
  });

  it("refuses without an event id rather than writing to a stray folder", async () => {
    await expect(uploadSitePhoto(null, new Blob(["x"]))).rejects.toThrow();
    await expect(uploadSitePhoto("", new Blob(["x"]))).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });

  it("surfaces an upload failure instead of returning a broken URL", async () => {
    upload.mockResolvedValue({ error: new Error("network down") });
    await expect(uploadSitePhoto(EVENT, new Blob(["x"]))).rejects.toThrow("network down");
  });

  // A refusal names the path and the caller, because "new row violates
  // row-level security policy" is true and says neither — and those are the
  // only two things the policy actually looks at.
  it("names the path and the signed-in user when the write is refused", async () => {
    upload.mockResolvedValue({ error: new Error("new row violates row-level security policy") });
    await expect(uploadSitePhoto(EVENT, new Blob(["x"]))).rejects.toThrow(/event-site\/11111111/);
    await expect(uploadSitePhoto(EVENT, new Blob(["x"]))).rejects.toThrow(/aaaaaaaa/);
  });

  // The case that would explain everything, and the one the message has to
  // state outright rather than leave to be inferred from a missing id.
  it("says so plainly when the request is going out with no session at all", async () => {
    session = null;
    upload.mockResolvedValue({ error: new Error("new row violates row-level security policy") });
    await expect(uploadSitePhoto(EVENT, new Blob(["x"]))).rejects.toThrow(/אנונימית/);
    session = { user: { id: "aaaaaaaa-1111-2222-3333-444444444444" } };
  });

  // Diagnosis must never become the failure. If reading the session throws,
  // the real error still has to reach the caller.
  it("still throws the original error when the session cannot be read", async () => {
    session = undefined;
    upload.mockResolvedValue({ error: new Error("boom") });
    await expect(uploadSitePhoto(EVENT, new Blob(["x"]))).rejects.toThrow("boom");
    session = { user: { id: "aaaaaaaa-1111-2222-3333-444444444444" } };
  });
});

describe("deleteSitePhoto", () => {
  it("removes the object the URL points at", async () => {
    await deleteSitePhoto(`${PUBLIC}/${EVENT}/a.jpg`);
    expect(remove).toHaveBeenCalledWith([`${EVENT}/a.jpg`]);
  });

  it("does nothing for a legacy data URL — there is no object to remove", async () => {
    expect(await deleteSitePhoto("data:image/jpeg;base64,/9j/")).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  // The gallery entry is already gone by the time this runs, so a rejection
  // here would leave the host looking at a photo they deleted. It reports
  // failure, it does not throw.
  it("reports failure rather than throwing into the click handler", async () => {
    remove.mockResolvedValue({ error: new Error("gone") });
    await expect(deleteSitePhoto(`${PUBLIC}/${EVENT}/a.jpg`)).resolves.toBe(false);
  });

  it("returns true only when something was actually removed", async () => {
    expect(await deleteSitePhoto(`${PUBLIC}/${EVENT}/a.jpg`)).toBe(true);
    expect(await deleteSitePhoto(null)).toBe(false);
  });
});
