import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";

// Hydration decides which copy of an event survives a page load. Getting it
// wrong is not a display bug — it deletes the customer's work and then persists
// the deletion. These pin the rule that was missing entirely.

const ev = (over = {}) => ({
  id: "e1", name: "החתונה", type: "חתונה", date: "2027-06-01", venue: "אולם",
  guests: [], tables: [], seating: {}, constraints: [],
  createdAt: 1000, updatedAt: 1000, version: 1, ...over,
});

const guests = n => Array.from({ length: n }, (_, i) => ({
  id: "g" + i, name: "אורח " + i, side: "bride", group: "משפחה", count: 1,
}));

describe("mergeCloudWithLocal", () => {
  it("keeps the LOCAL copy when it was written more recently than the cloud", () => {
    // The venue-wifi case: 50 guests entered, the debounced push never landed,
    // the host reloads. Taking the cloud copy here lost the 48 newer rows.
    const local = [ev({ guests: guests(50), updatedAt: 9_000_000, version: 6, cloudId: "c1" })];
    const cloud = [ev({ guests: guests(2),  updatedAt: 1_000,     version: 5, cloudId: "c1" })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests).toHaveLength(50);
    expect(out.updatedAt).toBe(9_000_000);
  });

  it("keeps the CLOUD copy when it is the newer side", () => {
    // The other device edited it — that work must not be thrown away either.
    const local = [ev({ guests: guests(2),  updatedAt: 1_000,     cloudId: "c1" })];
    const cloud = [ev({ guests: guests(40), updatedAt: 9_000_000, cloudId: "c1" })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests).toHaveLength(40);
  });

  it("always takes cloudId from the cloud, even when local wins on freshness", () => {
    // Otherwise a newer local copy with no cloudId detaches the event from its
    // cloud row and it starts syncing as a second, duplicate event.
    const local = [ev({ guests: guests(9), updatedAt: 9_000_000, cloudId: null })];
    const cloud = [ev({ guests: guests(1), updatedAt: 1_000,     cloudId: "c1" })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.cloudId).toBe("c1");
    expect(out.guests).toHaveLength(9);
  });

  it("never lets a stale local copy resurrect a null public token", () => {
    // Tokens are minted on first sync. A local copy that predates that push has
    // none; restoring it would break every printed QR code and shared link.
    const local = [ev({ updatedAt: 9_000_000, cloudId: "c1", tokens: null })];
    const cloud = [ev({
      updatedAt: 1_000, cloudId: "c1",
      tokens: { rsvp: "r1", invite: "i1", gift: "g1", hostess: "h1", collab: "c1", album: "a1" },
    })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.rsvp).toBe("r1");
    expect(out.tokens.invite).toBe("i1");
  });

  it("keeps a local-only event that the cloud has never seen", () => {
    const local = [ev({ id: "draft", cloudId: null })];
    const out = mergeCloudWithLocal(local, []);
    expect(out.map(e => e.id)).toEqual(["draft"]);
  });

  it("treats a missing updatedAt as oldest rather than throwing", () => {
    const local = [ev({ guests: guests(3), updatedAt: undefined, cloudId: "c1" })];
    const cloud = [ev({ guests: guests(7), updatedAt: 5_000,     cloudId: "c1" })];
    expect(mergeCloudWithLocal(local, cloud)[0].guests).toHaveLength(7);
  });
});

// ── Arrivals marked at the door survive the host's next edit ─────────────────
// The one field on this row written by SOMEONE ELSE, on a device this tab never
// sees. Whole-event last-write-wins cannot be right for it: the host edits the
// venue at 20:32, their copy is newer by definition, and everyone the greeter
// checked in at 20:31 is dropped and then pushed back over the cloud. Measured
// before the fix: the venue edit survived, three arrivals did not.
describe("mergeCloudWithLocal — arrivals marked at the door", () => {
  const withArrivals = (over = {}) => ({
    ...ev(over),
    guests: [
      { id: "g1", name: "דודה רחל", side: "bride", group: "משפחה", count: 5 },
      { id: "g2", name: "משה כהן",  side: "groom", group: "חברים", count: 2 },
    ],
  });
  const cloudSide = () => {
    const e = withArrivals({ updatedAt: 20_310, cloudId: "c1" });
    e.guests[0] = { ...e.guests[0], arrivedSeats: [0, 1, 2], arrived: true };
    return e;
  };

  it("keeps the greeter's arrivals when the host edited something else after", () => {
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1", venue: "אולמי הגן" })];
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.venue).toBe("אולמי הגן");            // the host's edit still wins
    expect(out.guests[0].arrivedSeats).toEqual([0, 1, 2]);
    expect(out.guests[0].arrived).toBe(true);
  });

  it("does NOT resurrect someone the host deliberately un-marked", () => {
    // [] is an opinion — "nobody from this row" — and must not lose to the
    // cloud. undefined is silence, and that is the only thing we override.
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    local[0].guests[0] = { ...local[0].guests[0], arrivedSeats: [], arrived: false };
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.guests[0].arrivedSeats).toEqual([]);
    expect(out.guests[0].arrived).toBe(false);
  });

  it("leaves the host's own marking alone", () => {
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    local[0].guests[0] = { ...local[0].guests[0], arrivedSeats: [4], arrived: true };
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.guests[0].arrivedSeats).toEqual([4]);
  });

  // DELIBERATELY CHANGED, 12.8. This used to assert that a cloud-only row is
  // NOT added — "never adds or removes a guest row". That is the right contract
  // for `mergeArrivals`, which only ever touches two fields on rows both sides
  // already have, and it is still true of that function. It was the wrong
  // contract for the merge as a whole: it is what silently deleted 37 guests
  // added on a second device (see the union tests at the bottom of this file).
  // A row present only in the cloud is another device's work, not an intruder.
  it("brings over a row that exists only in the cloud, arrivals and all", () => {
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    const cloud = [cloudSide()];
    cloud[0].guests.push({ id: "g9", name: "אורחת שנוספה בטלפון", side: "bride", group: "אחר",
      count: 1, arrivedSeats: [0], arrived: true });
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests.map(g => g.id)).toEqual(["g1", "g2", "g9"]);
    // …and it is not seated, because `seating` stays local. A newly imported
    // guest belongs in "ממתינים לשיבוץ", which is where the host looks for one.
    expect(out.seating.g9).toBeUndefined();
  });

  it("still never REMOVES a row the local copy has", () => {
    // The half of the old contract that was always right.
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    const cloud = [cloudSide()];
    cloud[0].guests = [cloud[0].guests[0]];         // the cloud is missing g2
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests.map(g => g.id)).toEqual(["g1", "g2"]);
  });

  it("touches nothing when the cloud is the side that wins", () => {
    const local = [withArrivals({ updatedAt: 1_000, cloudId: "c1" })];
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.guests[0].arrivedSeats).toEqual([0, 1, 2]);
  });
});

// ── A revoked link stays revoked ─────────────────────────────────────────────
// Rotation is the only way to take back a public link. This merge used to let
// the CLOUD's token win per key, so a host who killed a leaked link and then
// reloaded before the debounced push landed got the dead link back — and a
// second device holding the old token pushed it back over the new one.
// Revocation that can be silently undone is not revocation.
describe("mergeCloudWithLocal — a rotated token is not resurrected", () => {
  const withTokens = (collab, rotatedAt, over = {}) => ({
    ...ev(over),
    cloudId: "c1",
    tokensRotatedAt: rotatedAt,
    tokens: { rsvp: "R", invite: "I", gift: "G", hostess: "H", album: "A", collab },
  });

  it("keeps the NEW token when this device is the one that rotated", () => {
    const local = [withTokens("new-token", 9_000, { updatedAt: 9_000 })];
    const cloud = [withTokens("leaked-token", null, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
    expect(out.tokensRotatedAt).toBe(9_000);
  });

  it("takes the rotation from the cloud when the OTHER device rotated", () => {
    // The host killed the link on their phone; this laptop still holds the old
    // one and happens to have a newer updatedAt for unrelated reasons.
    const local = [withTokens("leaked-token", null,  { updatedAt: 9_000 })];
    const cloud = [withTokens("new-token",    8_000, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
  });

  it("the most recent rotation wins when both sides rotated", () => {
    const local = [withTokens("phone-token",  7_000, { updatedAt: 9_000 })];
    const cloud = [withTokens("laptop-token", 8_000, { updatedAt: 1_000 })];
    expect(mergeCloudWithLocal(local, cloud)[0].tokens.collab).toBe("laptop-token");
  });

  it("on an exact tie the cloud wins, same as with no rotation at all", () => {
    // Two devices stamped the same millisecond. Either answer is defensible;
    // what is not defensible is leaving it unpinned, so it follows the
    // no-rotation rule rather than inventing a second one.
    const local = [withTokens("phone-token",  8_000, { updatedAt: 9_000 })];
    const cloud = [withTokens("laptop-token", 8_000, { updatedAt: 1_000 })];
    expect(mergeCloudWithLocal(local, cloud)[0].tokens.collab).toBe("laptop-token");
  });

  it("carries the rotation stamp forward even when the token came from the cloud", () => {
    // Local wins on updatedAt but never rotated; the cloud did. If the merged
    // event forgets WHEN, the next merge has no way to know the cloud's token
    // is the deliberate one.
    const local = [withTokens("leaked-token", null,  { updatedAt: 9_000 })];
    const cloud = [withTokens("new-token",    8_000, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
    expect(out.tokensRotatedAt).toBe(8_000);
  });

  it("with no rotation on either side, the cloud still wins — unchanged", () => {
    const local = [withTokens("older", null, { updatedAt: 9_000 })];
    const cloud = [withTokens("cloud", null, { updatedAt: 1_000 })];
    expect(mergeCloudWithLocal(local, cloud)[0].tokens.collab).toBe("cloud");
  });

  it("a rotation never resurrects a token the other side has and it does not", () => {
    // The guard that was there before: a local copy predating a token must not
    // erase it. Rotating one key must not drop the others.
    const local = [{ ...withTokens("new-token", 9_000, { updatedAt: 9_000 }),
      tokens: { rsvp: null, invite: null, gift: null, hostess: null, album: null, collab: "new-token" } }];
    const cloud = [withTokens("leaked-token", null, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
    expect(out.tokens.rsvp).toBe("R");
    expect(out.tokens.album).toBe("A");
  });
});

// ── From the 12.8 data-integrity review ──────────────────────────────────────
describe("mergeCloudWithLocal — rows another device added are not thrown away", () => {
  // Reproduced end to end before the fix. Both devices hold cloud v5. The phone
  // adds 37 guests at 20:00 and pushes → cloud v6. The laptop edits the venue
  // at 20:05, its push conflicts (correctly — that is the version check doing
  // its job), it re-fetches, and THIS function decided the laptop's 20:05 beat
  // the phone's 20:00 and kept the laptop's copy whole. 37 guests gone from
  // screen and localStorage, syncedVersion advanced to 6, and the laptop's next
  // edit wrote 3 guests over the cloud unopposed.
  const phone = () => ({
    ...ev({ updatedAt: 20_000, cloudId: "c1", version: 6, syncedVersion: 6 }),
    guests: guests(40),
  });
  const laptop = () => ({
    ...ev({ updatedAt: 20_500, cloudId: "c1", version: 6, syncedVersion: 5, venue: "אולם ב" }),
    guests: guests(3),
  });

  it("keeps the 37 guests the other device added, and the local edit too", () => {
    const [out] = mergeCloudWithLocal([laptop()], [phone()]);
    expect(out.venue).toBe("אולם ב");                 // this tab's edit still wins
    expect(out.guests).toHaveLength(40);
    for (let i = 0; i < 40; i++) {
      expect(out.guests.some(g => g.id === "g" + i)).toBe(true);
    }
  });

  it("does not duplicate a row both sides already have", () => {
    const [out] = mergeCloudWithLocal([laptop()], [phone()]);
    expect(new Set(out.guests.map(g => g.id)).size).toBe(out.guests.length);
  });

  it("the local copy of a shared row wins — it is the newer one", () => {
    const local = { ...laptop() };
    local.guests = [{ ...guests(1)[0], name: "השם החדש" }];
    const [out] = mergeCloudWithLocal([local], [phone()]);
    expect(out.guests.find(g => g.id === "g0").name).toBe("השם החדש");
  });

  it("keeps tables the other device added, without touching the local seating", () => {
    const local = { ...laptop(), tables: [{ id: "t1", name: "שולחן 1", capacity: 10 }], seating: { g0: "t1" } };
    const cloud = { ...phone(), tables: [
      { id: "t1", name: "שולחן 1", capacity: 10 },
      { id: "t2", name: "שולחן 2", capacity: 12 },
    ] };
    const [out] = mergeCloudWithLocal([local], [cloud]);
    expect(out.tables.map(t => t.id).sort()).toEqual(["t1", "t2"]);
    expect(out.seating).toEqual({ g0: "t1" });
  });

  it("still keeps the greeter's arrivals on a row the union just brought over", () => {
    // The two merges answer different questions and neither subsumes the other:
    // one keeps ROWS, the other keeps two FIELDS on rows that already exist.
    const cloud = { ...phone() };
    cloud.guests = cloud.guests.map((g, i) =>
      i === 39 ? { ...g, arrivedSeats: [0], arrived: true } : g);
    const [out] = mergeCloudWithLocal([laptop()], [cloud]);
    const brought = out.guests.find(g => g.id === "g39");
    expect(brought.arrived).toBe(true);
    expect(brought.arrivedSeats).toEqual([0]);
  });

  it("changes nothing when the cloud has no rows the local copy is missing", () => {
    const local = { ...laptop(), guests: guests(40) };
    const [out] = mergeCloudWithLocal([local], [phone()]);
    expect(out.guests).toHaveLength(40);
  });
});

describe("mergeCloudWithLocal — the union runs in BOTH directions", () => {
  // The asymmetric version is a second, worse bug. `useCollabSync` holds its
  // `applied` map in a ref that survives a merge and computes its delete list
  // as `applied − activeEvent.guests`. So a cloud copy predating the family's
  // shared-table rows made the app conclude the HOST had deleted them, and it
  // issued a real delete against the shared table — the one part of this
  // product that cannot be reconstructed from anywhere else.
  const local = () => ({
    ...ev({ updatedAt: 1_000, cloudId: "c1" }),
    guests: [
      { id: "r1", name: "דודה רחל", side: "bride", group: "משפחה", count: 2 },
      { id: "r2", name: "משה כהן",  side: "groom", group: "חברים", count: 1 },
    ],
    tables: [{ id: "t9", name: "שולחן מקומי", capacity: 8 }],
  });
  const cloudNewerButOlderContent = () => ({
    ...ev({ updatedAt: 9_000, cloudId: "c1", venue: "אולם מהענן" }),
    guests: [{ id: "r3", name: "יעל", side: "bride", group: "משפחה", count: 1 }],
    tables: [],
  });

  it("keeps the local-only rows even when the cloud wins the event", () => {
    const [out] = mergeCloudWithLocal([local()], [cloudNewerButOlderContent()]);
    expect(out.venue).toBe("אולם מהענן");                     // the cloud still wins
    expect(out.guests.map(g => g.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(out.tables.map(t => t.id)).toEqual(["t9"]);
  });

  it("leaves the ordinary fresh-device pull completely alone", () => {
    // Local has nothing, so the union has nothing to contribute and the cloud
    // copy must come through untouched.
    const cloud = cloudNewerButOlderContent();
    const [out] = mergeCloudWithLocal([], [cloud]);
    expect(out.guests.map(g => g.id)).toEqual(["r3"]);
    expect(out.tables).toEqual([]);
  });

  it("does not duplicate rows both sides hold", () => {
    const cloud = { ...cloudNewerButOlderContent() };
    cloud.guests = [...cloud.guests, { id: "r1", name: "דודה רחל", side: "bride", group: "משפחה", count: 2 }];
    const [out] = mergeCloudWithLocal([local()], [cloud]);
    expect(new Set(out.guests.map(g => g.id)).size).toBe(out.guests.length);
  });
});

// ── The second wave (12.8) ───────────────────────────────────────────────────
// Arrivals are the only field on a guest written by SOMEONE ELSE, from a device
// this tab never sees. The old rule asked "has the local copy said anything
// about this guest?" — which cannot tell a local opinion from a value the
// client COPIED FROM THE CLOUD a minute earlier. So after the first merge the
// local copy was never silent again, every later cloud update for that row was
// dropped, and the drop was then pushed back over the cloud.
describe("mergeCloudWithLocal — a party that arrives in two waves", () => {
  const row = (over = {}) => ({ id: "g1", name: "משפחת לוי", side: "bride", group: "משפחה", count: 4, ...over });
  const local = (guest, updatedAt = 20_500) => [{ ...ev({ updatedAt, cloudId: "c1" }), guests: [guest] }];
  const cloud = (guest, updatedAt = 20_000) => [{ ...ev({ updatedAt, cloudId: "c1" }), guests: [guest] }];

  it("takes the greeter's LATER marking over the copy this tab already holds", () => {
    // Wave 1 was merged in at t=100, so the local copy is no longer silent.
    // Wave 2 lands in the cloud at t=200 and must win.
    const [out] = mergeCloudWithLocal(
      local(row({ arrivedSeats: [0],    arrived: true, arrivedAt: 100 })),
      cloud(row({ arrivedSeats: [0, 1], arrived: true, arrivedAt: 200 })),
    );
    expect(out.guests[0].arrivedSeats).toEqual([0, 1]);
    expect(out.guests[0].arrivedAt).toBe(200);
  });

  it("keeps the host's marking when THEIRS is the later one", () => {
    const [out] = mergeCloudWithLocal(
      local(row({ arrivedSeats: [0, 1, 2], arrived: true, arrivedAt: 300 })),
      cloud(row({ arrivedSeats: [0],       arrived: true, arrivedAt: 200 })),
    );
    expect(out.guests[0].arrivedSeats).toEqual([0, 1, 2]);
  });

  it("lets a later un-marking win too — it is an edit like any other", () => {
    // [] is an opinion ("nobody from this row"), and with a stamp it no longer
    // needs a special case to survive.
    const [out] = mergeCloudWithLocal(
      local(row({ arrivedSeats: [0, 1], arrived: true, arrivedAt: 100 })),
      cloud(row({ arrivedSeats: [],     arrived: false, arrivedAt: 200 })),
    );
    expect(out.guests[0].arrivedSeats).toEqual([]);
    expect(out.guests[0].arrived).toBe(false);
  });

  it("takes a stamped cloud value over an UNstamped local one", () => {
    // The upgrade path: the greeter's phone has the new build, the host's tab
    // is holding a row written before this shipped.
    const [out] = mergeCloudWithLocal(
      local(row({ arrivedSeats: [0], arrived: true })),
      cloud(row({ arrivedSeats: [0, 1, 2], arrived: true, arrivedAt: 200 })),
    );
    expect(out.guests[0].arrivedSeats).toEqual([0, 1, 2]);
  });

  it("keeps a stamped local value over an UNstamped cloud one", () => {
    const [out] = mergeCloudWithLocal(
      local(row({ arrivedSeats: [0, 1], arrived: true, arrivedAt: 200 })),
      cloud(row({ arrivedSeats: [0],    arrived: true })),
    );
    expect(out.guests[0].arrivedSeats).toEqual([0, 1]);
  });

  it("falls back to exactly the old rule when NEITHER side is stamped", () => {
    // Nothing about existing data changes behaviour until it is next touched.
    const silentLocal = mergeCloudWithLocal(
      local(row({})),
      cloud(row({ arrivedSeats: [0, 1], arrived: true })),
    )[0];
    expect(silentLocal.guests[0].arrivedSeats).toEqual([0, 1]);   // silence yields

    const opinionated = mergeCloudWithLocal(
      local(row({ arrivedSeats: [], arrived: false })),
      cloud(row({ arrivedSeats: [0, 1], arrived: true })),
    )[0];
    expect(opinionated.guests[0].arrivedSeats).toEqual([]);       // an opinion holds
  });

  it("leaves a guest the cloud says nothing about completely alone", () => {
    const [out] = mergeCloudWithLocal(
      local(row({ arrivedSeats: [0], arrived: true, arrivedAt: 100 })),
      cloud(row({})),
    );
    expect(out.guests[0].arrivedSeats).toEqual([0]);
    expect(out.guests[0].arrivedAt).toBe(100);
  });
});

// The union that saves rows the other device added was written for guests, then
// extended to tables — and stopped there. Five other collections stayed on
// whole-event last-write-wins, so the partner who spent an evening entering the
// eleven "must sit together" rules on their phone lost all of them the moment
// the host renamed the venue on the laptop. Measured on the code before the
// fix: constraints 0, tasks 0, vendors 0, costs {}, messagesSent {}.
describe("mergeCloudWithLocal — every collection, not just guests and tables", () => {
  const full = over => ev({
    tasks: [], vendors: [], costs: {}, messagesSent: {}, messageTemplates: {}, ...over,
  });

  // The other device pushed one of everything; this device then edited a scalar.
  const otherDevice = {
    guests:      [{ id: "g1", name: "דוד", side: "bride", group: "משפחה", count: 1 }],
    tables:      [{ id: "t1", name: "שולחן 1", capacity: 10, type: "regular" }],
    constraints: [{ id: "c1", type: "together", guestA: "g1", guestB: "g2" }],
    tasks:       [{ id: "k1", title: "לסגור צלם", done: false }],
    vendors:     [{ id: "v1", name: "צלם", phone: "0501111111" }],
    costs:       { categories: [{ id: "dj", name: "תקליטן", budget: 9000, actual: 0 }] },
    messagesSent:     { invitation: { g1: 1700 } },
    messageTemplates: { invitation: "שלום {{שם}}" },
  };

  // Both directions: whichever side happens to be newer, nothing is dropped.
  for (const [label, localAt, cloudAt] of [
    ["local is newer", 3000, 2000],
    ["cloud is newer", 2000, 3000],
  ]) {
    it(`keeps rows the other device added when ${label}`, () => {
      const [out] = mergeCloudWithLocal(
        [full({ updatedAt: localAt, venue: "אולם ב" })],
        [full({ ...otherDevice, updatedAt: cloudAt, cloudId: "c1" })],
      );
      expect(out.constraints, "constraints").toHaveLength(1);
      expect(out.tasks,       "tasks").toHaveLength(1);
      expect(out.vendors,     "vendors").toHaveLength(1);
      expect(out.costs.categories, "costs").toHaveLength(1);
      expect(out.messageTemplates.invitation, "templates").toBe("שלום {{שם}}");
      expect(out.messagesSent.invitation?.g1, "sent").toBe(1700);
    });
  }

  // Both sides hold rows the other has never seen. This is the case that
  // actually pins the union: asserting only that the WINNER's rows survive
  // passes even with the loser's union deleted, which a mutation run caught —
  // dropping the cloud-branch union left the suite green until this test
  // existed in both directions.
  for (const [label, localAt, cloudAt] of [
    ["local is newer", 3000, 2000],
    ["cloud is newer", 2000, 3000],
  ]) {
    it(`unions rows from BOTH devices when ${label}`, () => {
      const [out] = mergeCloudWithLocal(
        [full({ updatedAt: localAt,
                constraints: [{ id: "mine", type: "apart", guestA: "a", guestB: "b" }],
                tasks:       [{ id: "kx", title: "שלי", done: false }],
                vendors:     [{ id: "vx", name: "דיג׳יי", phone: "0502222222" }],
                messageTemplates: { reminder1: "תזכורת ששיניתי" } })],
        [full({ ...otherDevice, updatedAt: cloudAt, cloudId: "c1" })],
      );
      expect(out.constraints.map(c => c.id).sort()).toEqual(["c1", "mine"]);
      expect(out.tasks.map(t => t.id).sort()).toEqual(["k1", "kx"]);
      expect(out.vendors.map(v => v.id).sort()).toEqual(["v1", "vx"]);
      // A template the host rewrote on one device and a different stage they
      // rewrote on the other: both are hand-written text nothing can rebuild.
      expect(Object.keys(out.messageTemplates).sort()).toEqual(["invitation", "reminder1"]);
    });
  }

  // A send is a fact about the world — the guest's phone buzzed. Losing the
  // record means the host re-sends the invitation to everyone who already got
  // it, which is the one mistake this product cannot apologise its way out of.
  for (const [label, localAt, cloudAt] of [
    ["local is newer", 3000, 2000],
    ["cloud is newer", 2000, 3000],
  ]) {
    it(`unions who was already messaged, keeping the earliest stamp — ${label}`, () => {
      const [out] = mergeCloudWithLocal(
        [full({ updatedAt: localAt,
                messagesSent: { invitation: { g1: 900 }, reminder1: { g2: 50 } } })],
        [full({ updatedAt: cloudAt, cloudId: "c1",
                messagesSent: { invitation: { g1: 700, g3: 800 } } })],
      );
      expect(out.messagesSent.invitation.g1).toBe(700);  // the send that really happened first
      expect(out.messagesSent.invitation.g3).toBe(800);  // only the other device knew about g3
      expect(out.messagesSent.reminder1.g2).toBe(50);    // and only this one knew about g2
    });
  }

  // The budget is edited as a whole by CostScreen, so merging it category by
  // category would build a budget neither device ever saw. Only the total loss
  // is prevented.
  it("never lets an empty budget overwrite a filled one, in either direction", () => {
    const filled = { categories: [{ id: "dj", name: "תקליטן", budget: 9000, actual: 0 }] };
    const [a] = mergeCloudWithLocal([full({ updatedAt: 3000 })],
                                    [full({ updatedAt: 2000, cloudId: "c1", costs: filled })]);
    expect(a.costs.categories).toHaveLength(1);
    const [b] = mergeCloudWithLocal([full({ updatedAt: 2000, costs: filled })],
                                    [full({ updatedAt: 3000, cloudId: "c1" })]);
    expect(b.costs.categories).toHaveLength(1);
  });

  // mergeArrivals ran in the local-wins branch only. The greeter's marks live
  // in `guests`, so the cloud-wins branch took the cloud array whole and threw
  // away check-ins made at the door that had not been pushed yet — even though
  // those rows carried the newer arrivedAt and the merge would have kept them.
  it("keeps door check-ins even when the cloud copy is the newer one", () => {
    const row = extra => ({ id: "g1", name: "משפחת כהן", side: "bride",
                            group: "משפחה", count: 4, ...extra });
    const [out] = mergeCloudWithLocal(
      [full({ updatedAt: 2000, guests: [row({ arrivedSeats: [0, 1], arrived: true, arrivedAt: 999 })] })],
      [full({ updatedAt: 3000, cloudId: "c1", guests: [row({ arrivedSeats: [], arrived: false, arrivedAt: 100 })] })],
    );
    expect(out.guests[0].arrivedSeats).toEqual([0, 1]);
    expect(out.guests[0].arrivedAt).toBe(999);
  });
});

// ── Deleting an event, from either device ────────────────────────────────────
//
// Reported from a real account: events deleted on the desktop were still on the
// phone. The merge kept every local event the cloud did not return, which both
// resurrected it here AND let the next debounced push recreate the cloud row —
// so the delete was undone on the device that performed it, too.
//
// The rule these pin: a `cloudId` means the server has seen this event, so its
// absence from a COMPLETE fetch means it was deleted. No cloudId means it was
// never pushed, so its absence says nothing.
describe("mergeCloudWithLocal — a delete on one device reaches the other", () => {
  const AUTH = { cloudIsAuthoritative: true };
  const synced = (over = {}) => ev({ cloudId: "c-1", syncedVersion: 3, ...over });

  it("drops a synced event the cloud no longer has", () => {
    expect(mergeCloudWithLocal([synced()], [], AUTH)).toEqual([]);
  });

  it("drops only the deleted one, keeping the account's other events", () => {
    const kept = synced({ id: "e2", cloudId: "c-2" });
    const out = mergeCloudWithLocal([synced(), kept], [kept], AUTH);
    expect(out.map(e => e.id)).toEqual(["e2"]);
  });

  // The other half of the rule, and the one that loses work if it breaks:
  // an event drafted offline or before signing in has no cloudId, and the
  // cloud has never heard of it because it was never pushed — not because
  // anyone deleted it.
  it("keeps an event that was never pushed, even when the cloud is empty", () => {
    const draft = ev({ id: "draft", cloudId: null, syncedVersion: null });
    expect(mergeCloudWithLocal([draft], [], AUTH).map(e => e.id)).toEqual(["draft"]);
  });

  it("keeps unsynced drafts while dropping deleted synced events, in one pass", () => {
    const draft = ev({ id: "draft", cloudId: null });
    const out = mergeCloudWithLocal([synced(), draft], [], AUTH);
    expect(out.map(e => e.id)).toEqual(["draft"]);
  });

  // Authority is opt-in precisely so that a caller who cannot prove the fetch
  // was complete cannot delete anything. A failed or truncated read must leave
  // the local copy alone.
  it("deletes NOTHING when the caller does not claim the fetch was complete", () => {
    expect(mergeCloudWithLocal([synced()], []).map(e => e.id)).toEqual(["e1"]);
    expect(mergeCloudWithLocal([synced()], [], { cloudIsAuthoritative: false }).map(e => e.id))
      .toEqual(["e1"]);
  });

  // A local event whose id is in the cloud under a different cloudId, or whose
  // cloudId matches, is present either way — matching on both is what stops a
  // freshly-created row being read as deleted in the window before its cloudId
  // is written back locally.
  it("recognises the event by local id even when the cloudId has not landed yet", () => {
    const local = ev({ cloudId: null });
    const cloud = ev({ cloudId: "c-1", updatedAt: 2000 });
    expect(mergeCloudWithLocal([local], [cloud], AUTH).map(e => e.id)).toEqual(["e1"]);
  });

  it("recognises the event by cloudId even if the local id differs", () => {
    const local = synced({ id: "local-id" });
    const cloud = ev({ id: "server-id", cloudId: "c-1", updatedAt: 2000 });
    expect(mergeCloudWithLocal([local], [cloud], AUTH)).toHaveLength(1);
  });
});

// A fetch can only speak for what existed when it RAN. This is the race the
// authority flag alone leaves open: hydration issues the read, the host taps
// "אירוע חדש" while it is in flight, the create lands in the cloud, and the
// response — queried before any of that — comes back without it. Read as a
// deletion, that wipes the new event locally while its cloud row survives: an
// orphan nobody sees until the next device syncs.
describe("mergeCloudWithLocal — an event created while the fetch was in flight", () => {
  const at = (t) => ({ cloudIsAuthoritative: true, fetchedAt: t });
  const synced = (over = {}) => ev({ cloudId: "c-1", syncedVersion: 3, ...over });

  it("keeps an event touched after the read was issued", () => {
    const justCreated = synced({ createdAt: 5000, updatedAt: 5000 });
    expect(mergeCloudWithLocal([justCreated], [], at(4000)).map(e => e.id)).toEqual(["e1"]);
  });

  it("still deletes one that predates the read", () => {
    const old = synced({ createdAt: 1000, updatedAt: 2000 });
    expect(mergeCloudWithLocal([old], [], at(4000))).toEqual([]);
  });

  // createdAt is checked alongside updatedAt because a freshly created event
  // that has not been edited since carries the older of the two in updatedAt
  // on some paths; the newer of the pair is what the fetch has to beat.
  it("uses whichever of createdAt/updatedAt is newer", () => {
    const created = synced({ createdAt: 5000, updatedAt: 0 });
    expect(mergeCloudWithLocal([created], [], at(4000))).toHaveLength(1);
  });

  // Without a fetchedAt the caller is making no claim about timing, so the
  // guard must not silently start deleting on the strength of a default.
  it("falls back to deleting only on the cloudId rule when no time is given", () => {
    const anyTime = synced({ updatedAt: Date.now() + 60_000 });
    expect(mergeCloudWithLocal([anyTime], [], { cloudIsAuthoritative: true })).toEqual([]);
  });
});
