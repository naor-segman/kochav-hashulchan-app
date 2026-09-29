import { describe, it, expect, vi } from "vitest";

// fetchCloudEventGuests is the one CRUD call here; the builder below stands in
// for supabase.from(...) exactly as in cloudSyncWrite.test.js — every method
// returns `this` and the chain is thenable, so the real call chain runs.
let response;
const builder = {
  from() { return this; }, select() { return this; }, eq() { return this; }, maybeSingle() { return this; },
  then(res, rej) { return Promise.resolve(response).then(res, rej); },
};
vi.mock("../lib/supabase.js", () => ({ supabase: { from: () => builder }, isSupabaseConfigured: true }));

const { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent, fetchCloudEventGuests } = await import("./cloudSync.js");

// WHY THIS FILE EXISTS
//
// A mutation run (third review, 29.9) made destructive edits to cloudSync.js
// one at a time and ran the whole suite against each. Six of them passed every
// test in the repo. They are not typos a reviewer would catch — each one reads
// as a reasonable simplification — and each is pinned below by the behaviour
// it would break, not by the line it touches.
//
// The common thread is that the CLOUD ROW'S COLUMNS and the PAYLOAD are two
// copies of the same facts, and the server writes only one of them. Every
// definer function that marks an arrival or purges photos bumps `version` on the
// COLUMN and leaves `payload.version` where the last client push put it; a
// token column added by a later migration is NULL on older rows while the
// payload still holds the token. The mapper has to know which copy is the
// authority for each field, and that knowledge was untested.
//
// Deliberately NOT here, because no input can tell them apart (argued in the
// review report, not guessed): `date ?? ""` for `|| null` (the column is text and
// every reader — the down-mapper, the admin list, the public RPCs, the retention
// job's regex — treats "" and NULL alike), and `createCloudEvent` returning the
// local version instead of the server's (no trigger touches `version` on insert,
// so the server echoes the value it was sent).
//
// fetchCloudEventGuests returning [] for null was on that list too, argued as
// "its one caller overlays nothing either way". Wrong — see the last test.

const row = (over = {}, payloadOver = {}) => ({
  id: "cloud-1", name: "החתונה", type: "חתונה", date: "2026-10-01", venue: "אולם",
  version: 7, updated_at: "2026-09-20T10:00:00.000Z", created_at: "2026-09-01T10:00:00.000Z",
  rsvp_token: "r1", invite_token: "i1", gift_token: "g1", hostess_token: "h1", collab_token: "c1",
  ...over,
  payload: { localId: "e1", guests: [], tables: [], seating: {}, updatedAt: 1000, createdAt: 500,
    version: 3, tokens: { rsvp: "r1", invite: "i1", gift: "g1", hostess: "h1", collab: "c1", album: "al1" },
    albumToken: "al1", ...payloadOver },
});

describe("down: the version COLUMN is the authority, not payload.version", () => {
  // The greeter marks a family at the door. The RPC bumps events.version 3 → 7
  // (four marks) and does not touch payload.version. If this device then reads
  // 3, its next push is `.eq("version", 3)` against a row at 7 — it conflicts,
  // re-reads, maps 3 again, and conflicts forever. And `version` itself is what
  // the next push writes back: 3 over a row at 7 re-issues numbers the server
  // already handed out.
  it("version comes from the column", () => {
    expect(mapCloudEventToLocalEvent(row()).version).toBe(7);
  });
  it("syncedVersion — the concurrency base — comes from the column", () => {
    expect(mapCloudEventToLocalEvent(row()).syncedVersion).toBe(7);
  });
  it("the payload is only the fallback for a row with no column value", () => {
    const e = mapCloudEventToLocalEvent(row({ version: null }));
    expect(e.version).toBe(3);
    expect(e.syncedVersion).toBe(3);
  });
});

describe("down: tokens survive a NULL rsvp_token column", () => {
  // The comment on the mapper says it: a column added by a later migration is
  // NULL on every row written before it, while payload.tokens already holds the
  // links the host sent out. Gating the whole object on the column returned
  // `tokens: null`, and normalizeEvent then MINTED FRESH TOKENS — every RSVP link
  // already on a guest's phone stops resolving.
  it("rsvp_token NULL, payload.tokens present → the payload's tokens, not null", () => {
    const e = mapCloudEventToLocalEvent(row({ rsvp_token: null, invite_token: null }));
    expect(e.tokens).not.toBeNull();
    expect(e.tokens.rsvp).toBe("r1");
    expect(e.tokens.invite).toBe("i1");
  });
});

describe("down: the album token falls back to payload.albumToken", () => {
  // payload.albumToken is the copy the SERVER checks — the album RPCs
  // authorise uploads with `payload->>'albumToken' = token_value`. So when
  // payload.tokens has no album key, albumToken IS the link that works, and
  // dropping it lets normalizeEvent mint a different one: the QR printed on the
  // invitation keeps working on the server and this device shows the host a
  // link that does not.
  it("tokens without album + albumToken → album comes from albumToken", () => {
    const e = mapCloudEventToLocalEvent(row({}, {
      tokens: { rsvp: "r1", invite: "i1", gift: "g1", hostess: "h1", collab: "c1" },
      albumToken: "AL-printed",
    }));
    expect(e.tokens.album).toBe("AL-printed");
  });
});

describe("up: seated_pct counts SEATS, like every other counter in the product", () => {
  // A guest row is a group; `count` is how many chairs it takes. The admin
  // dashboard's "seated" column (eventStatus.js reads seated_pct) said 50% for a
  // wedding where 4 of 5 people were at a table, because it counted rows.
  it("a family of 4 seated and 1 single unseated → 80, not 50", () => {
    const out = mapLocalEventToCloudPayload({
      id: "e1", guests: [{ id: "a", count: 4 }, { id: "b", count: 1 }], tables: [{ id: "t1" }],
      seating: { a: "t1" }, updatedAt: 1000,
    }, "u1");
    expect(out.guest_count).toBe(5);
    expect(out.seated_pct).toBe(80);
  });
});

describe("up: updated_at is the EDIT time, not the push time", () => {
  // fetchCloudEvents orders by updated_at and cuts at CLOUD_EVENTS_LIMIT, and
  // the down-mapper falls back to the column when a payload has no updatedAt.
  // Stamping `now` made a migration of forty old events look like forty edits
  // made this second, and an offline edit pushed an hour later look an hour
  // newer than it is.
  it("updated_at mirrors localEvent.updatedAt", () => {
    const at = Date.UTC(2026, 8, 1, 12, 0, 0);
    const out = mapLocalEventToCloudPayload({ id: "e1", guests: [], tables: [], updatedAt: at }, "u1");
    expect(out.updated_at).toBe("2026-09-01T12:00:00.000Z");
  });
});

describe("fetchCloudEventGuests: 'nothing to read' is null, not an empty guest list", () => {
  // The host's door screen polls this every 25s and overlays the greeter's
  // marks. Its rule is "a failed read keeps the last good overlay", and it
  // tells "nothing to read" apart by the null (`if (alive && g)`). A read that
  // returns NO ROW is not an error in PostgREST — a row RLS no longer shows this
  // session, or one gone from under it, comes back as data null, error null.
  // Returning [] for that replaced the overlay with an empty one, and every
  // check-in the greeter had made vanished from the host's screen until the
  // next good read. Rare to trigger; cheap to hold, and it is the contract the
  // function's own doc states.
  it("no row → null", async () => {
    response = { data: null, error: null };
    expect(await fetchCloudEventGuests("c1")).toBeNull();
  });
  it("a row whose payload has no guests array → null", async () => {
    response = { data: { payload: {} }, error: null };
    expect(await fetchCloudEventGuests("c1")).toBeNull();
  });
  it("a real list comes back as it is", async () => {
    response = { data: { payload: { guests: [{ id: "g1", arrivedSeats: [0] }] } }, error: null };
    expect(await fetchCloudEventGuests("c1")).toEqual([{ id: "g1", arrivedSeats: [0] }]);
  });
});
