import { describe, it, expect, vi, beforeEach } from "vitest";

// Six edits to publicTokens.js passed the whole suite in the third-review
// mutation run (29.9). Two of them are on the album's delete/upload pair, where
// the order and the checking of two non-transactional writes is the entire
// design — and the storage stub in publicTokens.test.js always answers "ok", so
// neither failure branch had ever run. Two more are wire-contract rules the
// server re-applies (marked below).
//
// Two survivors are argued equivalent in the report rather than tested: the
// PGRST204 clause (PostgREST's PGRST204 message is always "Could not find the
// '<col>' column of '<table>' in the schema cache" — read out of the 12.2.3
// binary — which the regex clause already matches), and exactlyOne's `!== 1`
// vs `< 1` (every caller filters on the primary key, so more than one row
// cannot come back).

const rpc = vi.fn();
const fromFn = vi.fn();
const storage = { upload: vi.fn(), remove: vi.fn() };
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: (...a) => fromFn(...a),
    storage: { from: () => ({ upload: (...a) => storage.upload(...a), remove: (...a) => storage.remove(...a) }) },
  },
  isSupabaseConfigured: true,
}));

const { submitRSVP, markArrivalByToken, deleteAlbumPhoto, uploadAlbumPhoto } = await import("./publicTokens.js");

beforeEach(() => {
  rpc.mockReset(); fromFn.mockReset(); storage.upload.mockReset(); storage.remove.mockReset();
});

// ── Wire-contract tests ─────────────────────────────────────────────────────
// The next two guard rules the SERVER re-applies (submit_rsvp_by_token nulls
// the meal for "no"; hostess_mark_arrival_by_token re-bounds seats to
// `v < seat_count`), so the stored row is the same without them. They pin what
// this module SENDS — the same kind of assertion publicTokens.test.js makes
// about column bounds — because "this is not the boundary, the RPC is" only
// holds while each side keeps its half. Kill a mutant that is equivalent in the
// database; the review report lists them separately so they can be dropped.

describe("submitRSVP: someone who is not coming does not eat", () => {
  // A guest who picked "טבעוני" and then switched the form to "לא מגיע" must
  // not send the meal. (The RPC nulls it as well — see above.)
  it("status no → meal null, whatever was picked", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await submitRSVP("tok", { name: "א", status: "no", meal: "טבעוני" });
    expect(rpc.mock.calls.at(-1)[1].meal).toBeNull();
  });
});

describe("markArrivalByToken: seat indices are bounded before the round-trip", () => {
  // "Bounded here so an oversized array is rejected before the round-trip, and
  // bounded again in SQL" — the function's own comment. Both lists, the seats
  // and the base the screen showed.
  it("indices ≥ 200 never leave the device", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await markArrivalByToken("tok", "g1", [0, 1, 250, 999], [0, 300]);
    const args = rpc.mock.calls.at(-1)[1];
    expect(args.seats).toEqual([0, 1]);
    expect(args.base).toEqual([0]);
  });
});

describe("deleteAlbumPhoto: a failed FILE delete stops everything", () => {
  // The file goes first because "row gone, file left" leaves a photo publicly
  // reachable at its URL and off every list — the host asked for it to be gone,
  // it is not, and nothing says so. `remove()` RESOLVES with { error }, so
  // unless it is checked the row delete runs anyway and the screen reports
  // success.
  it("storage error → rejects, and the row is never touched", async () => {
    storage.remove.mockResolvedValue({ data: null, error: new Error("storage down") });
    // A row delete that WOULD succeed, so the only way this test passes is the
    // code refusing to reach it — not the stub happening to be broken.
    const chain = { delete: () => chain, eq: () => chain, select: async () => ({ data: [{ id: "p1" }], error: null }) };
    fromFn.mockReturnValue(chain);
    await expect(deleteAlbumPhoto({ id: "p1", storagePath: "ev/1.jpg" })).rejects.toThrow("storage down");
    expect(fromFn).not.toHaveBeenCalled();
  });
});

describe("uploadAlbumPhoto: a row that fails to write cleans up its file", () => {
  // The file is uploaded before the row is indexed. If the index fails and the
  // file stays, it is a public object in the bucket that no list shows and no
  // delete button reaches — a guest's photo on the internet with no owner.
  it("album_add_photo error → the uploaded path is removed, then the error surfaces", async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null });
    storage.remove.mockResolvedValue({ data: [], error: null });
    rpc.mockResolvedValue({ data: null, error: { message: "invalid token" } });
    await expect(uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה")).rejects.toMatchObject({ message: "invalid token" });
    const uploaded = storage.upload.mock.calls[0][0];
    expect(storage.remove).toHaveBeenCalledWith([uploaded]);
  });
  // And when the cleanup itself fails, the host is told the file is still
  // there — the only trace of it anywhere.
  it("cleanup also fails → the message says the file was left behind", async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null });
    storage.remove.mockResolvedValue({ data: null, error: new Error("nope") });
    rpc.mockResolvedValue({ data: null, error: { message: "invalid token" } });
    await expect(uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה"))
      .rejects.toMatchObject({ message: "invalid token (הקובץ נשאר באחסון ולא נוקה)" });
  });
});

// Sixth review 30.9 (סב90r): a retry after a slow upload added the photo twice.
describe("uploadAlbumPhoto with a file key: a retry of the same photo is safe", () => {
  it("the same key gives the same path on every attempt", async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null });
    rpc.mockResolvedValue({ data: "id", error: null });
    await uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה", "p-abc123");
    await uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה", "p-abc123");
    expect(storage.upload.mock.calls[0][0]).toBe("ev1/albtok/p-abc123.jpg");
    expect(storage.upload.mock.calls[1][0]).toBe("ev1/albtok/p-abc123.jpg");
  });
  it("file already there (the earlier attempt landed) → indexed, not an error", async () => {
    storage.upload.mockResolvedValue({ data: null, error: { statusCode: "409", message: "The resource already exists" } });
    rpc.mockResolvedValue({ data: "id", error: null });
    await expect(uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה", "p-abc123")).resolves.toBe("ev1/albtok/p-abc123.jpg");
  });
  it("index row already there → done, and the file is NOT removed", async () => {
    storage.upload.mockResolvedValue({ data: null, error: { statusCode: "409", message: "The resource already exists" } });
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value" } });
    await expect(uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה", "p-abc123")).resolves.toBe("ev1/albtok/p-abc123.jpg");
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it("without a key a conflict is still an error", async () => {
    storage.upload.mockResolvedValue({ data: null, error: { statusCode: "409", message: "The resource already exists" } });
    await expect(uploadAlbumPhoto("ev1", "albtok", { name: "a.jpg" }, "דנה")).rejects.toMatchObject({ statusCode: "409" });
  });
});
