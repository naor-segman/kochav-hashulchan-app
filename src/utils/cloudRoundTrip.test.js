import { describe, it, expect } from "vitest";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "./cloudSync.js";
import { normalizeEvent } from "./eventHelpers.js";

/* The round-trip test that actually bites.
 *
 * `cloudSync.test.js` asserts individual fields, and its `roundTrip()` helper
 * skips `normalizeEvent` on both ends and feeds the payload blob straight back
 * in. An audit ran 92 destructive mutations against the mappers and
 * `normalizeEvent`; **43 of them left the whole 334-test suite green** —
 * including the name column always `""`, the date always null, the type
 * hardcoded, and dropping constraints, vendors, messagesSent, messageTemplates,
 * coupleType, celebrantName, organizationName, contactName, ownerName,
 * albumToken, and the event site's gallery / coverPhoto / shuttles / story.
 *
 * Six of those are `payload->>` keys that public RPCs and RLS policies read, so
 * dropping one breaks the guest-facing pages served straight from Postgres —
 * with no test and no client error.
 *
 * This file closes that. It drives the REAL four stages:
 *
 *   local → normalizeEvent → toCloud → (JSONB) → fromCloud → normalizeEvent
 *
 * and asserts the whole object, so a field deleted from EITHER mapper or from
 * the normalizer fails here. Adding a new field to the app means adding it to
 * MAXIMAL below — which is the point.
 */

// Everything a screen can write, with values that are all distinguishable from
// their defaults (a field that defaults to "" would survive being dropped).
const MAXIMAL = {
  id: "e-local-1",
  name: "החתונה של דנה ויוסי",
  type: "חתונה",
  date: "2027-06-01",
  venue: "אולמי הגן",
  startTime: "19:00",
  brideName: "דנה",
  groomName: "יוסי",
  coupleType: "bride-bride",
  sideLabels: { bride: "צד דנה", groom: "צד יוסי" },
  celebrantName: "עידו",
  organizationName: "חברת אלפא",
  contactName: "רותי",
  ownerName: "נאור",
  noShowPct: 7,
  guests: [
    { id: "g1", name: "טל שוורץ", side: "bride", group: "משפחה", count: 3,
      phone: "0501234567", rsvp: "confirmed", meal: "vegan", notes: "ליד ההורים",
      arrived: true, arrivedSeats: [0, 2], giftAmount: 500, estGift: 750,
      companions: ["רון", "מיה"] },
    { id: "g2", name: "רון לוי", side: "groom", group: "חברים", count: 1,
      phone: "0521234567", rsvp: "pending", meal: "regular", notes: "",
      arrived: false, giftAmount: 0, companions: [] },
  ],
  tables: [
    { id: "t1", name: "שולחן 1", capacity: 10, type: "regular", shape: "round" },
    { id: "t2", name: "אביר", capacity: 12, type: "vip", shape: "rect" },
  ],
  seating: { g1: "t1", g2: "t2" },
  constraints: [{ id: "c1", type: "together", guestA: "g1", guestB: "g2" }],
  lockedGuests: ["g1"],
  lockedTables: ["t2"],
  customGroups: ["שכנים", "צבא"],
  customTableTypes: ["ילדים"],
  tasks: [{ id: "k1", title: "לסגור אולם", status: "doing", priority: "high",
            due: "2027-05-01", note: "לבקש הנחה" }],
  vendors: [{ id: "v1", name: "להקת הכוכבים", category: "music", status: "booked",
              payment: "partial", price: 6000, paid: 2000, phone: "0501112233",
              contact: "אבי", note: "כולל הגברה" }],
  costs: { catering: { planned: 90000, actual: 88000 } },
  messagesSent: { g1: { invite: 1700000000000 } },
  messageTemplates: { invite: "בואו לחגוג {{אירוע}}" },
  collabActive: false,
  hostessWriteActive: false,
  tokensRotatedAt: 1_700_000_500_000,
  giftBitPhone: "0501234567",
  giftPayboxLink: "https://payboxapp.page.link/abc",
  tokens: { rsvp: "TK-rsvp", album: "TK-album", invite: "TK-invite",
            gift: "TK-gift", hostess: "TK-hostess", collab: "TK-collab" },
  eventSite: {
    published: true, heroTitle: "דנה ויוסי", heroEn: "Dana & Yossi",
    coverPhoto: "data:image/png;base64,COVER", story: "אחרי שבע שנים",
    gallery: ["data:image/png;base64,G1", "data:image/png;base64,G2"],
    countdown: true, dressCode: "אלגנטי",
    schedule: [{ id: "s1", time: "19:00", title: "קבלת פנים", icon: "🥂" }],
    shuttles: [{ id: "sh1", from: "תל אביב", time: "18:00", contact: "רן",
                 phone: "0500000000", note: "ליד התחנה" }],
    wazeUrl: "https://waze.com/ul/abc",
    themeKey: "plum", fontKey: "display", customDomain: "dana-yossi.co.il",
    faq: [{ id: "f1", q: "חניה?", a: "יש" }],
    contactPhone: "0509998877",
  },
  announcements: {
    invitation: { themeKey: "plum", fontKey: "display", layout: "card",
                  headline: "אתם מוזמנים", body: "נשמח לראותכם",
                  photo: "data:image/png;base64,PH", published: true },
    saveTheDate: { themeKey: "sand", fontKey: "serif", layout: "centered",
                   headline: "שמרו את התאריך", body: "בקרוב",
                   photo: null, published: false },
  },
  floorPlan: {
    image: "data:image/png;base64,PLAN",
    tablePositions: { t1: { x: 0.1, y: 0.2, size: 1.4 } },
    elements: [{ id: "el1", kind: "chuppah", x: 0.5, y: 0.5 }],
  },
  createdAt: 1700000000000,
  updatedAt: 1700000900000,
  version: 4,
  cloudId: null,
};

// What the pipeline is ALLOWED to change, each with the reason it is allowed.
const EXPECTED_DIFFS = {
  // The floor-plan image is deliberately withheld from the cloud (base64 is far
  // too large for a JSONB payload); it stays in localStorage.
  "floorPlan.image": null,
  // Assigned by the DB row, not by the client.
  cloudId: "cloud-uuid-1",
  // This client's knowledge of the row, set by the fromCloud mapper.
  syncedVersion: 4,
};

function pipeline(local) {
  const n1  = normalizeEvent(local);
  const row = mapLocalEventToCloudPayload(n1, "user-1");
  // Simulate what Postgres stores and returns: the payload goes through JSONB,
  // the scalars come back as columns.
  const dbRow = {
    id: "cloud-uuid-1",
    user_id: row.user_id,
    name: row.name, type: row.type, date: row.date, venue: row.venue,
    guest_count: row.guest_count, table_count: row.table_count,
    seated_pct: row.seated_pct, version: row.version,
    rsvp_token: row.rsvp_token, invite_token: row.invite_token,
    gift_token: row.gift_token, hostess_token: row.hostess_token,
    collab_token: row.collab_token,
    created_at: new Date(n1.createdAt).toISOString(),
    updated_at: row.updated_at,
    payload: JSON.parse(JSON.stringify(row.payload)),
  };
  return { n1, row, dbRow, n2: normalizeEvent(mapCloudEventToLocalEvent(dbRow)) };
}

// Walk two objects and return every path whose value differs.
function diffPaths(a, b, path = "", out = []) {
  const ta = a === null ? "null" : Array.isArray(a) ? "array" : typeof a;
  const tb = b === null ? "null" : Array.isArray(b) ? "array" : typeof b;
  if (ta !== tb) { out.push(path); return out; }
  if (ta === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffPaths(a[k], b[k], path ? `${path}.${k}` : k, out);
    }
    return out;
  }
  if (ta === "array") {
    if (a.length !== b.length) { out.push(path); return out; }
    a.forEach((v, i) => diffPaths(v, b[i], `${path}.${i}`, out));
    return out;
  }
  if (a !== b) out.push(path);
  return out;
}

describe("full cloud round-trip", () => {
  it("changes nothing except the documented exceptions", () => {
    const { n1, n2 } = pipeline(MAXIMAL);
    const differing = diffPaths(n1, n2);
    expect(differing.sort()).toEqual(Object.keys(EXPECTED_DIFFS).sort());
    for (const [path, expected] of Object.entries(EXPECTED_DIFFS)) {
      const got = path.split(".").reduce((o, k) => o?.[k], n2);
      expect(got, path).toEqual(expected);
    }
  });

  it("carries every scalar COLUMN, not just the payload blob", () => {
    // The old round-trip helper fed the payload straight back in, so a dropped
    // column was invisible. These four are read by the admin panel and by the
    // public-token RPCs directly from the columns.
    const { row } = pipeline(MAXIMAL);
    expect(row.name).toBe("החתונה של דנה ויוסי");
    expect(row.type).toBe("חתונה");
    expect(row.date).toBe("2027-06-01");
    expect(row.venue).toBe("אולמי הגן");
    expect(row.collab_token).toBe("TK-collab");
    expect(row.rsvp_token).toBe("TK-rsvp");
    expect(row.guest_count).toBe(4);   // 3 + 1 seats, not 2 rows
    expect(row.table_count).toBe(2);
  });

  it("keeps the payload keys the database itself reads", () => {
    // Public RPCs and RLS policies select these out of the JSONB. Dropping one
    // breaks a guest-facing page with no client-side error at all.
    const { row } = pipeline(MAXIMAL);
    for (const k of ["localId", "coupleType", "celebrantName", "organizationName",
                     "contactName", "ownerName", "albumToken"]) {
      expect(row.payload[k], k).toBeTruthy();
    }
  });

  it("brings the actual VALUES back, not just a symmetric shape", () => {
    // The diff above compares n1 to n2, and both pass through normalizeEvent —
    // so a mutation INSIDE the normalizer hits both sides equally and the diff
    // stays empty. (Verified: dropping gallery / story / coverPhoto from
    // normalizeEventSite survived the diff test.) These assert the literals.
    const { n2 } = pipeline(MAXIMAL);
    expect(n2.eventSite.gallery).toEqual(MAXIMAL.eventSite.gallery);
    expect(n2.eventSite.story).toBe("אחרי שבע שנים");
    expect(n2.eventSite.coverPhoto).toBe("data:image/png;base64,COVER");
    expect(n2.eventSite.shuttles).toEqual(MAXIMAL.eventSite.shuttles);
    expect(n2.eventSite.schedule).toEqual(MAXIMAL.eventSite.schedule);
    expect(n2.eventSite.customDomain).toBe("dana-yossi.co.il");
    expect(n2.announcements.invitation.photo).toBe("data:image/png;base64,PH");
    expect(n2.constraints).toEqual(MAXIMAL.constraints);
    expect(n2.vendors).toEqual(MAXIMAL.vendors);
    expect(n2.tasks).toEqual(MAXIMAL.tasks);
    expect(n2.messagesSent).toEqual(MAXIMAL.messagesSent);
    expect(n2.messageTemplates).toEqual(MAXIMAL.messageTemplates);
    expect(n2.costs).toEqual(MAXIMAL.costs);
    expect(n2.lockedGuests).toEqual(["g1"]);
    expect(n2.lockedTables).toEqual(["t2"]);
    expect(n2.customGroups).toEqual(["שכנים", "צבא"]);
    expect(n2.customTableTypes).toEqual(["ילדים"]);
    expect(n2.floorPlan.elements).toEqual(MAXIMAL.floorPlan.elements);
    expect(n2.floorPlan.tablePositions).toEqual(MAXIMAL.floorPlan.tablePositions);
    expect(n2.noShowPct).toBe(7);
    expect(n2.coupleType).toBe("bride-bride");
    // The shared-table switch. It is read by a public RPC out of the payload,
    // so losing it silently re-opens a link the host closed.
    expect(n2.collabActive).toBe(false);
    // The entrance link's write switch, same story: enforced by
    // hostess_writes_active(e) out of the payload, so dropping it here re-opens
    // a door the host closed.
    expect(n2.hostessWriteActive).toBe(false);
    // Losing this makes a revoked public link come back: the merge uses it to
    // decide which side rotated deliberately.
    expect(n2.tokensRotatedAt).toBe(1_700_000_500_000);
    // Per-person arrival. `guests` passes through whole, which is exactly why
    // this needs pinning — nothing else would notice if it stopped.
    expect(n2.guests[0].arrivedSeats).toEqual([0, 2]);
    // estGift is one of the ten fields the guest form writes and it was missing
    // from this fixture. It survives today because guests pass through both
    // mappers whole — which is exactly why nothing would notice if that stopped.
    expect(n2.guests[0].estGift).toBe(750);
    expect(n2.sideLabels).toEqual(MAXIMAL.sideLabels);
  });

  it("carries a NON-default event type", () => {
    // "חתונה" is also the fallback, so a hardcoded type column passes a fixture
    // that happens to be a wedding. Event types are the Hebrew strings in
    // constants.js EVENT_TYPES — CLAUDE.md bug class #1.
    const { row, n2 } = pipeline({ ...MAXIMAL, type: "בר מצווה" });
    expect(row.type).toBe("בר מצווה");
    expect(n2.type).toBe("בר מצווה");
  });

  it("survives a cloud row written before the album token existed", () => {
    // The album token has no column; a pre-album row carries neither the column
    // nor payload.albumToken, and reading it back must not mint a new one here.
    const { dbRow } = pipeline(MAXIMAL);
    delete dbRow.payload.albumToken;
    delete dbRow.payload.tokens;
    const back = mapCloudEventToLocalEvent(dbRow);
    expect(back.tokens.album).toBeNull();     // absent, not invented
    expect(back.tokens.rsvp).toBe("TK-rsvp"); // the columns still carry theirs
  });
});
