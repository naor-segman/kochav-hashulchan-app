import { describe, it, expect, vi, beforeEach } from "vitest";

// The entrance link's ONE write. What reaches Postgres matters more than the
// call itself: an out-of-range seat index inflates the number the host gives
// the caterer, and `writes_open` is what stops the greeter's phone from
// silently failing on every tap after the host closes the link.
const rpc = vi.fn();
vi.mock("../lib/supabase.js", () => ({
  supabase: { rpc: (...args) => rpc(...args) },
  isSupabaseConfigured: true,
}));

const { markArrivalByToken, fetchHostessData } = await import("./publicTokens.js");

const ok   = data  => rpc.mockResolvedValue({ data, error: null });
const sent = () => rpc.mock.calls.at(-1)[1];

beforeEach(() => rpc.mockReset());

describe("markArrivalByToken — what actually reaches the database", () => {
  it("sends the token, the row id and a clean seat array", async () => {
    ok(null);
    await markArrivalByToken("tok", "g1", [2, 0]);
    expect(rpc.mock.calls.at(-1)[0]).toBe("hostess_mark_arrival_by_token");
    expect(sent()).toEqual({ token_value: "tok", guest_id: "g1", seats: [0, 2] });
  });

  it("drops duplicates, negatives, fractions and junk", async () => {
    ok(null);
    await markArrivalByToken("tok", "g1", [1, 1, -4, 2.5, "3", null, undefined, NaN]);
    expect(sent().seats).toEqual([1, 3]);
  });

  it("caps the array so a leaked link cannot post a thousand seats", async () => {
    ok(null);
    await markArrivalByToken("tok", "g1", Array.from({ length: 400 }, (_, i) => i));
    expect(sent().seats).toHaveLength(50);
  });

  it("bounds the guest id to the column width", async () => {
    ok(null);
    await markArrivalByToken("tok", "g".repeat(200), [0]);
    expect(sent().guest_id).toHaveLength(64);
  });

  it("an empty array is a legal message — it means nobody came after all", async () => {
    ok(null);
    await markArrivalByToken("tok", "g1", []);
    expect(sent().seats).toEqual([]);
  });

  it("throws when the database refuses, so the UI can say so", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("invalid token") });
    await expect(markArrivalByToken("tok", "g1", [0])).rejects.toThrow();
  });
});

describe("fetchHostessData — the switch and the new fields", () => {
  it("absent writes_open means OPEN, so an untouched event still works", async () => {
    ok({ id: "c1", name: "אירוע", guests: [], tables: [], seating: {} });
    expect((await fetchHostessData("tok")).writesOpen).toBe(true);
  });

  it("an explicit false closes it", async () => {
    ok({ id: "c1", name: "אירוע", guests: [], tables: [], seating: {}, writes_open: false });
    expect((await fetchHostessData("tok")).writesOpen).toBe(false);
  });

  it("passes companions and arrivedSeats through untouched", async () => {
    ok({
      id: "c1", name: "אירוע", seating: { g1: "t1" },
      guests: [{ id: "g1", name: "דודה רחל", count: 5, companions: ["משה"], arrivedSeats: [0, 1] }],
      tables: [{ id: "t1", name: "שולחן 1", capacity: 10, shape: "round" }],
    });
    const d = await fetchHostessData("tok");
    expect(d.guests[0].arrivedSeats).toEqual([0, 1]);
    expect(d.guests[0].companions).toEqual(["משה"]);
    // The glyph on this screen was already being drawn with shape/capacity the
    // RPC never returned.
    expect(d.tables[0]).toMatchObject({ capacity: 10, shape: "round" });
  });

  it("a malformed response never crashes a page a stranger opened", async () => {
    ok({ id: "c1", guests: "nope", tables: null, seating: 7 });
    expect(await fetchHostessData("tok")).toMatchObject({ guests: [], tables: [], seating: {} });
  });
});
