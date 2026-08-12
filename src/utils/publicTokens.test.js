import { describe, it, expect, vi, beforeEach } from "vitest";

// Every public page — RSVP, gift, wall, hostess, album, collab — reaches the
// database through this module and nothing else, and it had no tests at all.
// The interesting part is not the network call but what it sends and what it
// hands back: a value that exceeds a column CHECK is rejected by Postgres and
// surfaces to the guest as a generic "try again" that can never succeed, and a
// shape it fails to defend turns into a crash on a page that a stranger opened
// from a WhatsApp link.
const rpc = vi.fn();
// The owner-side reads go through `.from(...)`, not through an RPC.
const fromFn = vi.fn();
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    from: (...args) => fromFn(...args),
  },
  isSupabaseConfigured: true,
}));

const {
  fetchEventByToken, fetchHostessData, fetchGiftWall, submitRSVP, submitGift,
  upsertCollabGuest, fetchCollabGuestsOwner,
} = await import("./publicTokens.js");

const ok   = data  => rpc.mockResolvedValue({ data, error: null });
const fail = error => rpc.mockResolvedValue({ data: null, error });
const sent = () => rpc.mock.calls.at(-1)[1];

beforeEach(() => rpc.mockReset());

describe("submitRSVP — what actually reaches the database", () => {
  it("bounds the fields to the column limits instead of failing forever", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א".repeat(500), phone: "0".repeat(90), status: "yes", guestsCount: 999 });
    expect(sent().guest_name).toHaveLength(200);
    expect(sent().phone).toHaveLength(40);
    expect(sent().guests_count).toBe(50);
  });

  it("never sends a negative party size", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", status: "yes", guestsCount: -5 });
    expect(sent().guests_count).toBe(0);
  });

  it("sends null rather than an empty phone, so the column stays clean", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", phone: "", status: "yes" });
    expect(sent().phone).toBeNull();
  });

  // "Not coming" must not carry a seat count or a shuttle seat — those numbers
  // are what the host gives the venue and the shuttle company.
  it("zeroes the count and drops the shuttle for a 'no'", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", status: "no", guestsCount: 4, shuttleId: "s1" });
    expect(sent().guests_count).toBe(0);
    expect(sent().shuttle_id).toBeNull();
  });

  it("keeps the count and the shuttle for a 'maybe'", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", status: "maybe", guestsCount: 3, shuttleId: "s1" });
    expect(sent().guests_count).toBe(3);
    expect(sent().shuttle_id).toBe("s1");
  });

  it("defaults a party of one when the guest never touched the field", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", status: "yes" });
    expect(sent().guests_count).toBe(1);
  });

  it("still understands the old boolean form", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", attending: true });
    expect(sent().status).toBe("yes");
    rpc.mockReset(); ok(null);
    await submitRSVP("tok", { name: "א", attending: false });
    expect(sent().status).toBe("no");
  });

  it("drops blank companion rows and caps the list", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", status: "yes",
      companions: ["  רונית  ", "", "   ", "טל", ...Array(60).fill("x")] });
    const c = sent().companions;
    expect(c[0]).toBe("רונית");
    expect(c[1]).toBe("טל");
    expect(c).toHaveLength(50);
  });

  it("sends an empty companion list when the field is not an array", async () => {
    ok(null);
    await submitRSVP("tok", { name: "א", status: "yes", companions: "רונית" });
    expect(sent().companions).toEqual([]);
  });

  it("throws when the database rejects the write, so the guest is not told it worked", async () => {
    fail({ message: "invalid token" });
    await expect(submitRSVP("bad", { name: "א", status: "yes" })).rejects.toBeTruthy();
  });
});

describe("submitGift", () => {
  it("sends agorot, not shekels — a rounding slip here is a wrong gift amount", async () => {
    ok(null);
    await submitGift("tok", { donorName: "דנה", amountILS: 350.55, message: "מזל טוב" });
    expect(sent().amount).toBe(35055);
  });

  it("rounds rather than truncating a fractional agora", async () => {
    ok(null);
    await submitGift("tok", { donorName: "דנה", amountILS: 0.005 });
    expect(sent().amount).toBe(1);
  });

  it("bounds the donor name and the blessing to their columns", async () => {
    ok(null);
    await submitGift("tok", { donorName: "ד".repeat(400), amountILS: 100, message: "ב".repeat(2000) });
    expect(sent().donor_name).toHaveLength(200);
    expect(sent().message).toHaveLength(1000);
  });

  it("sends null for an empty blessing", async () => {
    ok(null);
    await submitGift("tok", { donorName: "דנה", amountILS: 100, message: "" });
    expect(sent().message).toBeNull();
  });

  it("throws when the write fails", async () => {
    fail({ message: "nope" });
    await expect(submitGift("tok", { donorName: "ד", amountILS: 1 })).rejects.toBeTruthy();
  });
});

describe("fetchEventByToken — a partial row must not crash a public page", () => {
  it("fills every missing field with a safe empty value", async () => {
    ok({ id: "cloud-1" });
    const ev = await fetchEventByToken("rsvp", "tok");
    expect(ev.cloudId).toBe("cloud-1");
    expect(ev.name).toBe("");
    expect(ev.type).toBe("חתונה");          // the Hebrew default the app compares against
    expect(ev.brideName).toBe("");
    expect(ev.giftBitPhone).toBe("");
    expect(ev.site).toBeNull();
    expect(ev.announcements).toBeNull();
    expect(ev.rsvpToken).toBeNull();
  });

  it("passes the token type through untouched", async () => {
    ok({ id: "x" });
    await fetchEventByToken("album", "tok");
    expect(sent()).toEqual({ token_type: "album", token_value: "tok" });
  });

  it("returns null for an unknown token instead of a half-built event", async () => {
    ok(null);
    expect(await fetchEventByToken("rsvp", "nope")).toBeNull();
    fail({ message: "boom" });
    expect(await fetchEventByToken("rsvp", "tok")).toBeNull();
  });

  it("does not call the database at all without a token", async () => {
    expect(await fetchEventByToken("rsvp", "")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-object site rather than handing it to the renderer", async () => {
    ok({ id: "x", site: "not-an-object", announcements: 7 });
    const ev = await fetchEventByToken("rsvp", "tok");
    expect(ev.site).toBeNull();
    expect(ev.announcements).toBeNull();
  });
});

describe("fetchHostessData", () => {
  it("always returns iterable collections, whatever the row contained", async () => {
    ok({ id: "e1", guests: null, tables: "x", seating: 5 });
    const d = await fetchHostessData("tok");
    expect(d.guests).toEqual([]);
    expect(d.tables).toEqual([]);
    expect(d.seating).toEqual({});
  });

  it("returns null on error, so the screen shows its own empty state", async () => {
    fail({ message: "boom" });
    expect(await fetchHostessData("tok")).toBeNull();
  });
});

describe("fetchGiftWall", () => {
  it("returns an array even when the call fails — the wall is projected in a hall", async () => {
    fail({ message: "network" });
    expect(await fetchGiftWall("tok")).toEqual([]);
    ok("not-an-array");
    expect(await fetchGiftWall("tok")).toEqual([]);
  });

  it("passes the rows through untouched when they are well formed", async () => {
    const rows = [{ id: "1", donor_name: "דנה", message: "מזל טוב", created_at: "2026-07-01" }];
    ok(rows);
    expect(await fetchGiftWall("tok")).toEqual(rows);
  });
});

// ── The shared table's notes column (12.8) ───────────────────────────────────
//
// The wire has to be able to say three different things, and the difference
// between two of them is the difference between "keep it" and "delete it":
//   * a string      → that is the answer, and "" clears the note;
//   * no key at all → no opinion, the database keeps what it has.
// A client that predates this column sends no key. If that arrived as NULL,
// every old tab and every cached PWA would quietly wipe notes typed by someone
// on a newer build — the exact shape of the bug that destroyed eight companion
// names in August, one column over.
describe("upsertCollabGuest — notes", () => {
  const row = { id: "r1", name: "יעל", phone: "050", side: "bride", guest_group: "משפחה", guests_count: 1, companions: [] };

  it("sends the note the caller holds", async () => {
    ok(null);
    await upsertCollabGuest("token123", { ...row, notes: "אלרגיה לאגוזים" });
    expect(sent().row_data.notes).toBe("אלרגיה לאגוזים");
  });

  it("sends an EMPTY string when the box was emptied — that is a real clear", async () => {
    ok(null);
    await upsertCollabGuest("token123", { ...row, notes: "" });
    expect(sent().row_data).toHaveProperty("notes", "");
  });

  it("OMITS the key entirely when the caller has no note field at all", async () => {
    ok(null);
    await upsertCollabGuest("token123", row);
    expect("notes" in sent().row_data).toBe(false);
  });

  it("omits it for null/undefined too — never sends null, which reads as a clear", async () => {
    ok(null);
    await upsertCollabGuest("token123", { ...row, notes: null });
    expect("notes" in sent().row_data).toBe(false);
    await upsertCollabGuest("token123", { ...row, notes: undefined });
    expect("notes" in sent().row_data).toBe(false);
  });

  it("still carries every other field of the row", async () => {
    ok(null);
    await upsertCollabGuest("token123", { ...row, guests_count: 3, companions: ["בעל", "חבר"], updated_by: "רונית" });
    const d = sent().row_data;
    expect(d.id).toBe("r1");
    expect(d.name).toBe("יעל");
    expect(d.phone).toBe("050");
    expect(d.side).toBe("bride");
    expect(d.guest_group).toBe("משפחה");
    expect(d.guests_count).toBe(3);
    expect(d.companions).toEqual(["בעל", "חבר"]);
    expect(d.updated_by).toBe("רונית");
  });
});

// ── The deploy order must not decide whether the product works ───────────────
// Migrations here are run by hand, by one person, in a browser. "Ship the
// migration before the code" is a footgun, not a plan: new code asking a
// pre-migration database for `notes` gets a 400, and the host's entire shared
// table goes dark behind an offline banner with no clue why.
describe("fetchCollabGuestsOwner tolerates a database without the notes column", () => {
  const rows = [{ id: "r1", name: "יעל", companions: [] }];
  let cols;

  const answering = (behaviour) => {
    cols = [];
    fromFn.mockReset();
    fromFn.mockImplementation(() => ({
      select: (c) => { cols.push(c); return { eq: async () => behaviour(c) }; },
    }));
  };

  it("asks for notes first, and that is the only call when it works", async () => {
    answering(() => ({ data: rows, error: null }));
    expect(await fetchCollabGuestsOwner("e1")).toEqual(rows);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toContain("notes");
  });

  it("retries without notes when the column is missing", async () => {
    answering(c => c.includes("notes")
      ? { data: null, error: { code: "42703", message: "column collab_guests.notes does not exist" } }
      : { data: rows, error: null });
    expect(await fetchCollabGuestsOwner("e1")).toEqual(rows);
    expect(cols).toHaveLength(2);
    expect(cols[1]).not.toContain("notes");
  });

  it("does NOT swallow a real failure into a degraded read", async () => {
    // Retrying without a column would turn "you are not allowed to read this"
    // into "there is nothing here", which is the worse of the two lies.
    answering(() => ({ data: null, error: { code: "42501", message: "permission denied" } }));
    await expect(fetchCollabGuestsOwner("e1")).rejects.toMatchObject({ code: "42501" });
    expect(cols).toHaveLength(1);
  });

  it("surfaces a failure on the retry too", async () => {
    answering(c => c.includes("notes")
      ? { data: null, error: { code: "42703", message: "column does not exist" } }
      : { data: null, error: { code: "08006", message: "connection failure" } });
    await expect(fetchCollabGuestsOwner("e1")).rejects.toMatchObject({ code: "08006" });
  });
});
