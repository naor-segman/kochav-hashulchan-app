import { describe, it, expect } from "vitest";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "./cloudSync.js";

// Simulate the DB round-trip: local → cloud payload → (DB assigns id/created_at)
// → back to local. Any field written but not read (the customTableTypes-class
// bug) shows up here as a lost value.
const roundTrip = (local) => {
  const payload = mapLocalEventToCloudPayload(local, "user-1");
  const cloudRow = { ...payload, id: "cloud-uuid", created_at: new Date(local.createdAt ?? 0).toISOString() };
  return mapCloudEventToLocalEvent(cloudRow);
};

const richEvent = {
  id: "evt-1", name: "החתונה", type: "חתונה", date: "2026-09-15", venue: "אולם",
  brideName: "דנה", groomName: "יוסי", coupleType: "bride-groom",
  sideLabels: { bride: "משפחת כהן", groom: "משפחת לוי" },
  customGroups: ["חברים מהצבא"], customTableTypes: ["שולחן ילדים"],
  tables: [{ id: "t1", name: "1", capacity: 10, type: "knight" }],
  guests: [{ id: "g1", name: "א", side: "bride", group: "חברים", count: 3 }],
  seating: { g1: "t1" },
  constraints: [{ id: "c1", type: "together", guestA: "g1", guestB: "g1" }],
  lockedGuests: ["g1"], lockedTables: ["t1"],
  tokens: { rsvp: "r1", invite: "i1", gift: "gf1", hostess: "h1", collab: "c1" },
  costs: { categories: [{ id: "co1", name: "אולם", budget: "40000" }] },
  giftBitPhone: "0501234567", giftPayboxLink: "https://payboxapp.page.link/x",
  eventSite: { enabled: true, schedule: [{ id: "s1", time: "18:00", title: "קבלה" }], sections: {} },
  noShowPct: 0,
  floorPlan: { image: "data:image/png;base64,AAA", tablePositions: { t1: { x: 0.3, y: 0.4, size: 1.4 } } },
  createdAt: 1700000000000, updatedAt: 1700000005000, version: 2,
};

describe("cloudSync round-trip (local → cloud → local)", () => {
  const out = roundTrip(richEvent);

  it("preserves customGroups and customTableTypes", () => {
    expect(out.customGroups).toEqual(["חברים מהצבא"]);
    expect(out.customTableTypes).toEqual(["שולחן ילדים"]);
  });

  it("preserves all five public tokens", () => {
    expect(out.tokens).toEqual(richEvent.tokens);
  });

  it("preserves eventSite, costs, gift links, side labels and locks", () => {
    expect(out.eventSite).toEqual(richEvent.eventSite);
    expect(out.costs).toEqual(richEvent.costs);
    expect(out.giftBitPhone).toBe("0501234567");
    expect(out.giftPayboxLink).toBe(richEvent.giftPayboxLink);
    expect(out.sideLabels).toEqual(richEvent.sideLabels);
    expect(out.lockedGuests).toEqual(["g1"]);
    expect(out.lockedTables).toEqual(["t1"]);
  });

  it("preserves floor-plan positions (image stays local, so it's null on the cloud side)", () => {
    expect(out.floorPlan.tablePositions).toEqual({ t1: { x: 0.3, y: 0.4, size: 1.4 } });
    expect(out.floorPlan.image).toBeNull();
  });

  it("keeps a real noShowPct of 0 (not defaulted to 10)", () => {
    expect(out.noShowPct).toBe(0);
  });

  it("carries the cloud row id as cloudId and keeps tables/guests/seating", () => {
    expect(out.cloudId).toBe("cloud-uuid");
    expect(out.tables).toEqual(richEvent.tables);
    expect(out.guests).toEqual(richEvent.guests);
    expect(out.seating).toEqual(richEvent.seating);
  });
});

describe("cloudSync token-column NULL fallback", () => {
  it("does not lose a token whose scalar column is NULL but exists in payload.tokens", () => {
    // Simulates a row created before the collab_token column existed.
    const cloudRow = {
      id: "cloud-2", name: "x", type: "חתונה",
      rsvp_token: "r1", invite_token: "i1", gift_token: "gf1", hostess_token: "h1",
      collab_token: null,                          // column NULL
      created_at: new Date(0).toISOString(),
      payload: { tokens: { rsvp: "r1", invite: "i1", gift: "gf1", hostess: "h1", collab: "c-SHARED" } },
    };
    const out = mapCloudEventToLocalEvent(cloudRow);
    expect(out.tokens.collab).toBe("c-SHARED"); // must not be null (would break the shared link)
  });
});

describe("cloud round-trip — floor plan fixtures", () => {
  it("carries venue elements to the cloud and back", () => {
    const local = {
      id: "e1", name: "אירוע", type: "wedding", date: "2026-09-01",
      guests: [], tables: [], seating: {}, constraints: [],
      floorPlan: {
        image: null,
        tablePositions: { t1: { x: 0.3, y: 0.4 } },
        elements: [{ id: "el1", kind: "chuppah", x: 0.5, y: 0.2, size: 1 }],
      },
    };
    const back = mapCloudEventToLocalEvent({
      id: "cloud-1", user_id: "u1", name: local.name, event_date: local.date,
      payload: mapLocalEventToCloudPayload(local, "u1").payload,
    });
    expect(back.floorPlan.elements).toEqual(local.floorPlan.elements);
    expect(back.floorPlan.tablePositions).toEqual(local.floorPlan.tablePositions);
  });

  it("still round-trips a plan that has positions but no fixtures", () => {
    const local = {
      id: "e1", name: "אירוע", type: "wedding", date: "2026-09-01",
      guests: [], tables: [], seating: {}, constraints: [],
      floorPlan: { image: null, tablePositions: { t1: { x: 0.1, y: 0.1 } }, elements: [] },
    };
    const back = mapCloudEventToLocalEvent({
      id: "cloud-1", user_id: "u1", name: local.name, event_date: local.date,
      payload: mapLocalEventToCloudPayload(local, "u1").payload,
    });
    expect(back.floorPlan.tablePositions).toEqual({ t1: { x: 0.1, y: 0.1 } });
    expect(back.floorPlan.elements).toEqual([]);
  });
});

describe("cloud round-trip — tasks", () => {
  it("carries the task board to the cloud and back", () => {
    const tasks = [
      { id: "t1", title: "לסגור אולם", note: "", due: "2026-08-01", priority: "high", status: "doing", doneAt: null },
    ];
    const local = {
      id: "e1", name: "אירוע", type: "wedding", date: "2026-09-01",
      guests: [], tables: [], seating: {}, constraints: [], tasks,
    };
    const back = mapCloudEventToLocalEvent({
      id: "cloud-1", user_id: "u1", name: local.name, event_date: local.date,
      payload: mapLocalEventToCloudPayload(local, "u1").payload,
    });
    expect(back.tasks).toEqual(tasks);
  });

  it("defaults to an empty board when the payload has none", () => {
    const back = mapCloudEventToLocalEvent({
      id: "cloud-1", user_id: "u1", name: "אירוע", event_date: "2026-09-01",
      payload: mapLocalEventToCloudPayload(
        { id: "e1", name: "אירוע", type: "wedding", date: "2026-09-01", guests: [], tables: [], seating: {}, constraints: [] },
        "u1",
      ).payload,
    });
    expect(back.tasks).toEqual([]);
  });
});
