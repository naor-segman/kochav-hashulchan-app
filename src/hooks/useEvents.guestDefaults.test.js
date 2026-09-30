/* Sixth review 30.9: a row missing notes / rsvp / meal read the edit form's
 * defaults as a change, so the other device's real edit lost to the newer one. */
import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";
import { syncBaseOf } from "../utils/syncBase.js";
import { normalizeEvent } from "../utils/eventHelpers.js";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "../utils/cloudSync.js";
import { applyGuestForm, guestToForm } from "../utils/guestForm.js";

const T = 1_790_000_000_000;
function rowOf(ev, version) {
  const p = mapLocalEventToCloudPayload({ ...ev, version }, "u1");
  return { ...mapCloudEventToLocalEvent(JSON.parse(JSON.stringify({ ...p, id: ev.cloudId, version, updated_at: new Date(ev.updatedAt).toISOString() }))), syncedVersion: version };
}
const S = normalizeEvent({
  id: "e1", cloudId: "c-1", name: "חתונה", type: "חתונה", date: "2027-05-20", venue: "גן",
  guests: [{ id: "g1", name: "רון", count: 1 }],
  customGroups: ["עבודה", "צבא"], customTableTypes: ["בר"],
  messagesSent: { invite: { g1: T - 100 } }, messageTemplates: { invite: "שלום" },
  version: 5, syncedVersion: 5, updatedAt: T, createdAt: T - 1000,
});
describe("the edit form's defaults are not an edit (sixth review 30.9, סב90m)", () => {
  // A guest row without notes / rsvp / meal (older rows; the fuzz's own rows;
  // RSVPResponses.addAsGuest leaves meal undefined).
  const base = normalizeEvent({ ...S, guests: [{ id: "g1", name: "רון", phone: "0501111111", count: 1 }] });
  it("phone confirms the guest; laptop fixes the phone number via the form, later → RSVP kept?", () => {
    const cloud = rowOf({ ...base, guests: [{ ...base.guests[0], rsvp: "confirmed", notes: "אלרגיה לאגוזים" }], updatedAt: T + 10 }, 6);
    const g = base.guests[0];
    const edited = applyGuestForm(g, { ...guestToForm(g, "משפחה"), phone: "0502222222" }, g.group ?? "משפחה");
    const laptop = { ...base, syncBase: syncBaseOf(rowOf(base, 5)), guests: [edited], version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([laptop], [cloud]);
    expect(m.guests[0].phone).toBe("0502222222");
    expect(m.guests[0].rsvp).toBe("confirmed");
    expect(m.guests[0].notes).toBe("אלרגיה לאגוזים");
  });
  it("control: same, but the stored row already carried rsvp/notes/meal/group", () => {
    const full = normalizeEvent({ ...S, guests: [{ id: "g1", name: "רון", phone: "0501111111", count: 1, rsvp: "pending", notes: "", meal: "regular", group: "משפחה", side: "bride", companions: [] }] });
    const cloud = rowOf({ ...full, guests: [{ ...full.guests[0], rsvp: "confirmed", notes: "אלרגיה לאגוזים" }], updatedAt: T + 10 }, 6);
    const g = full.guests[0];
    const edited = applyGuestForm(g, { ...guestToForm(g, "משפחה"), phone: "0502222222" }, g.group);
    const laptop = { ...full, syncBase: syncBaseOf(rowOf(full, 5)), guests: [edited], version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([laptop], [cloud]);
    expect(m.guests[0].rsvp).toBe("confirmed");
    expect(m.guests[0].notes).toBe("אלרגיה לאגוזים");
  });
});

describe("a guest added from an RSVP answer with no meal (סב90m)", () => {
  it("phone sets meal via the form; laptop fixes the phone number via the form later → meal kept?", () => {
    // RSVPResponsesScreen.addAsGuest, answer with no meal: meal: undefined
    const g0 = { id: "g1", name: "דנה", side: "bride", group: "אחר", count: 1, phone: "0501111111", notes: "", rsvp: "confirmed", companions: [], meal: undefined };
    const base = normalizeEvent({ ...S, guests: [g0] });
    const g = base.guests[0];
    const onPhone = applyGuestForm(g, { ...guestToForm(g, "אחר"), meal: "vegan" }, g.group);
    const cloud = rowOf({ ...base, guests: [onPhone], updatedAt: T + 10 }, 6);
    const onLaptop = applyGuestForm(g, { ...guestToForm(g, "אחר"), phone: "0502222222" }, g.group);
    const laptop = { ...base, syncBase: syncBaseOf(rowOf(base, 5)), guests: [onLaptop], version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([laptop], [cloud]);
    expect(m.guests[0].phone).toBe("0502222222");
    expect(m.guests[0].meal).toBe("vegan");
  });
});
