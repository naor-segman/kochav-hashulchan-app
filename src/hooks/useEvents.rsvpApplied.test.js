import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";
import { normalizeEvent, RSVP_APPLIED_MAX } from "../utils/eventHelpers.js";

/* ב5: applied RSVP ids. The cloud-wins merge stored the union un-normalised
 * (4,000 long), and the cap keeps the LAST ids — so the next normalise kept
 * this device's old ids and dropped every id the cloud held. */
const T = 1_790_000_000_000;
const ids = (p, n, from = 0) => Array.from({ length: n }, (_, i) => `${p}${from + i}`);
const base = { tables: [], guests: [], id: "e1", cloudId: "c-1", name: "x", type: "חתונה", version: 5, syncedVersion: 5, createdAt: T - 1000 };

describe("rsvpApplied merge (ב5)", () => {
  it("cloud newer: the result is capped, and the cloud's ids survive", () => {
    const cloud = { ...base, rsvpApplied: ids("c", RSVP_APPLIED_MAX), version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...base, rsvpApplied: ids("old", RSVP_APPLIED_MAX), updatedAt: T };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.rsvpApplied.length).toBe(RSVP_APPLIED_MAX);
    expect(m.rsvpApplied.filter(x => x.startsWith("c")).length).toBe(RSVP_APPLIED_MAX);
    // and a localStorage round-trip keeps them
    expect(normalizeEvent(m).rsvpApplied).toEqual(m.rsvpApplied);
  });

  it("local newer: same", () => {
    const cloud = { ...base, rsvpApplied: ids("c", RSVP_APPLIED_MAX), version: 6, syncedVersion: 6, updatedAt: T };
    const local = { ...base, rsvpApplied: ids("old", RSVP_APPLIED_MAX), updatedAt: T + 10 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.rsvpApplied.filter(x => x.startsWith("c")).length).toBe(RSVP_APPLIED_MAX);
  });

  it("an id this device applied after the shared ones is kept, even at the cap", () => {
    const shared = ids("s", RSVP_APPLIED_MAX);
    const cloud = { ...base, rsvpApplied: shared, version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...base, rsvpApplied: [...shared.slice(1), "mine"], updatedAt: T };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.rsvpApplied.length).toBe(RSVP_APPLIED_MAX);
    expect(m.rsvpApplied.at(-1)).toBe("mine");
    expect(m.rsvpApplied).not.toContain("s0");   // the oldest is what the cap drops
  });

  it("an id the cloud already trimmed does not come back", () => {
    const cloud = { ...base, rsvpApplied: ids("s", 3, 1), version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...base, rsvpApplied: ids("s", 3, 0), updatedAt: T };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.rsvpApplied).toEqual(["s0", "s1", "s2", "s3"]);   // in order; the cap is not hit
  });
});
