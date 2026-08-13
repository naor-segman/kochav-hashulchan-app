import { describe, it, expect } from "vitest";
import {
  matchExistingGuest, pickCompanions, pickNotes,
  guestFromCollab, guestToCollab, sigCollab, sigGuest, collabComplete,
} from "./useCollabSync.js";

const guest = (id, name, phone) => ({ id, name, phone, side: "bride", group: "משפחה", count: 1 });

describe("matchExistingGuest (collab dedup)", () => {
  const list = [
    guest("g1", "דוד כהן", "0501234567"),
    guest("g2", "רותי לוי", "0527654321"),
  ];

  it("matches the same shared row id", () => {
    expect(matchExistingGuest(list, { id: "g2", name: "משהו אחר", phone: "0500000000" })).toBe(list[1]);
  });

  it("merges a family submission of the same person (phone + name match)", () => {
    const m = matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "0501234567" });
    expect(m).toBe(list[0]);
  });

  it("does NOT merge two different people who share a phone", () => {
    // same phone as דוד כהן, different person → must stay separate (the bug fix)
    expect(matchExistingGuest(list, { id: "new", name: "מיכל כהן", phone: "0501234567" })).toBeNull();
  });

  it("does NOT merge two people with the same name but different phones", () => {
    expect(matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "0539999999" })).toBeNull();
  });

  it("treats +972 / leading-zero phone formats as equal", () => {
    const m = matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "+972-50-123-4567" });
    expect(m).toBe(list[0]);
  });

  it("returns null (new guest) when phone is missing", () => {
    expect(matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "" })).toBeNull();
  });
});

// The shared table is the only place in this product where a person who is not
// the customer types data that cannot be reconstructed. These pin the ONE rule
// both halves of the feature obey: an array on the wire — empty or not — is the
// table's answer; only an ABSENT key means "no opinion".
describe("pickCompanions (collab → app)", () => {
  const row = (companions, count = 9) => ({ id: "r1", guests_count: count, companions });
  const EIGHT = ["אבי", "בני", "גילי", "דנה", "הדס", "ורד", "זהר", "חן"];
  const withNames = { id: "r1", companions: [...EIGHT] };

  it("takes the names the table actually carries", () => {
    expect(pickCompanions(row(["רונית", "טל"], 3), null)).toEqual(["רונית", "טל"]);
  });

  it("keeps the app's names when the table sends no companions field at all", () => {
    // A database still running the pre-restore RPC: the column is simply absent.
    // Silence is not an instruction to delete.
    expect(pickCompanions({ id: "r1", guests_count: 9 }, withNames)).toEqual(EIGHT);
  });

  it("clears when the table sends an EMPTY list, even on the very first pull", () => {
    // The bug this replaces: the app kept its eight and pushed them back, so a
    // deletion made while the app was closed was silently undone. `[]` is a
    // value the table can only hold because a client wrote it.
    expect(pickCompanions(row([]), withNames)).toEqual([]);
  });

  it("treats a list of blank strings as cleared too — no name survives it", () => {
    expect(pickCompanions(row(["", "", ""]), withNames).filter(Boolean)).toEqual([]);
  });

  it("clamps names kept from the app to the seat count the table reports", () => {
    expect(pickCompanions({ id: "r1", guests_count: 3 }, withNames)).toEqual(["אבי", "בני"]);
  });

  it("clamps incoming names to the seat count as well", () => {
    expect(pickCompanions(row([...EIGHT], 3), null)).toEqual(["אבי", "בני"]);
  });

  it("returns an empty list, not undefined, for a brand-new single-seat row", () => {
    expect(pickCompanions(row([], 1), null)).toEqual([]);
    expect(pickCompanions({ id: "r1", guests_count: 1 }, null)).toEqual([]);
  });
});

// ── הערות on the shared table (12.8) ─────────────────────────────────────────
//
// A relative could fill in a name, a phone and eight companions but had nowhere
// to write "אלרגיה לאגוזים" — so the host had to chase it by phone, which is
// the one thing the shared table exists to prevent.
//
// The merge rule is the same ONE rule as pickCompanions, applied to a scalar:
// a STRING on the wire is the table's answer and wins (including ""); anything
// that is not a string is "no opinion" and the app keeps what it holds. The two
// halves are not decoration — a database that has not run the migration returns
// no `notes` key at all, and reading that silence as a clear is exactly how
// eight companion names were destroyed in August.
describe("pickNotes (collab → app)", () => {
  const held = { notes: "אלרגיה לאגוזים" };

  it("takes the note the table carries", () => {
    expect(pickNotes({ notes: "כיסא גלגלים" }, held)).toBe("כיסא גלגלים");
  });

  it("keeps the app's note when the table sends no notes field at all", () => {
    // A database still running the pre-notes RPC. Silence is not a delete.
    expect(pickNotes({ id: "r1" }, held)).toBe("אלרגיה לאגוזים");
    expect(pickNotes({ id: "r1", notes: null }, held)).toBe("אלרגיה לאגוזים");
  });

  it("clears when the table sends an EMPTY string — someone emptied the box", () => {
    expect(pickNotes({ notes: "" }, held)).toBe("");
    expect(pickNotes({ notes: "   " }, held)).toBe("");
  });

  it("trims, so a stray space is not a note", () => {
    expect(pickNotes({ notes: "  יושבים עם הסבים  " }, held)).toBe("יושבים עם הסבים");
  });

  it("returns a string, not undefined, for a brand-new row with no note anywhere", () => {
    expect(pickNotes({ id: "r1" }, null)).toBe("");
  });
});

// ── The mappers, field by field ──────────────────────────────────────────────
//
// Written after a mutation run: deleting `notes` from guestToCollab, from
// guestFromCollab, from sigCollab OR from sigGuest each passed the whole suite.
// Four one-line edits, four silent data losses, zero red tests — the same shape
// as the three fields already lost through cloudSync.js. A mapper that nothing
// reads field by field is a mapper that will quietly stop carrying something.
describe("guestFromCollab — table row → guest row", () => {
  const row = {
    id: "r1", name: " יעל כהן ", phone: " 0521112222 ", side: "groom",
    guest_group: "חברים", guests_count: 3, companions: ["בעל", "חבר"],
    notes: "אלרגיה לאגוזים",
  };

  it("carries every shared field, notes included", () => {
    expect(guestFromCollab(row, null)).toMatchObject({
      id: "r1", name: "יעל כהן", phone: "0521112222", side: "groom",
      group: "חברים", count: 3, companions: ["בעל", "חבר"],
      notes: "אלרגיה לאגוזים",
    });
  });

  it("keeps the app-only fields of the guest it merges into", () => {
    const existing = { id: "r1", meal: "vegan", rsvp: "confirmed", estGift: 500, arrived: true };
    const out = guestFromCollab(row, existing);
    expect(out.meal).toBe("vegan");
    expect(out.rsvp).toBe("confirmed");
    expect(out.estGift).toBe(500);
    expect(out.arrived).toBe(true);
  });

  it("keeps the guest's note when the table has no notes field (pre-migration DB)", () => {
    const { notes, ...noNotes } = row;   // eslint-disable-line no-unused-vars
    expect(guestFromCollab(noNotes, { notes: "כיסא גלגלים" }).notes).toBe("כיסא גלגלים");
  });
});

describe("guestToCollab — guest row → table row", () => {
  const guest = {
    id: "g1", name: "יעל כהן", phone: "0521112222", side: "groom", group: "חברים",
    count: 3, companions: ["בעל", "חבר"], notes: "אלרגיה לאגוזים",
    meal: "vegan", estGift: 500,       // app-only: must NOT be sent
  };

  it("sends every shared field, notes included", () => {
    expect(guestToCollab(guest)).toEqual({
      id: "g1", name: "יעל כהן", phone: "0521112222", side: "groom",
      guest_group: "חברים", guests_count: 3, companions: ["בעל", "חבר"],
      notes: "אלרגיה לאגוזים",
    });
  });

  it("caps the seat count at the column CHECK rather than being rejected forever", () => {
    expect(guestToCollab({ ...guest, count: 900 }).guests_count).toBe(50);
    expect(guestToCollab({ ...guest, count: 0 }).guests_count).toBe(1);
  });
});

// The signature is the ONLY thing that decides whether an owner edit is pushed
// to the shared table. A field missing from it is a field the host can change
// and watch never arrive.
describe("signatures — what counts as a change", () => {
  const row   = { id: "x", name: "יעל", phone: "052", side: "bride", guest_group: "חברים", guests_count: 2, companions: ["בעל"], notes: "אלרגיה" };
  const guest = { id: "x", name: "יעל", phone: "052", side: "bride", group: "חברים", count: 2, companions: ["בעל"], notes: "אלרגיה" };

  it("a table row and the guest it maps to have the SAME signature", () => {
    expect(sigCollab(row)).toBe(sigGuest(guest));
  });

  it("editing only the note IS a change, on both sides", () => {
    expect(sigCollab({ ...row, notes: "כיסא גלגלים" })).not.toBe(sigCollab(row));
    expect(sigGuest({ ...guest, notes: "כיסא גלגלים" })).not.toBe(sigGuest(guest));
  });

  it("clearing the note is a change too", () => {
    expect(sigGuest({ ...guest, notes: "" })).not.toBe(sigGuest(guest));
  });

  it("every other shared field still moves the signature", () => {
    for (const patch of [{ name: "טל" }, { phone: "053" }, { side: "groom" }, { group: "עבודה" }, { count: 3 }, { companions: ["אישה"] }]) {
      expect(sigGuest({ ...guest, ...patch })).not.toBe(sigGuest(guest));
    }
  });

  it("an app-only field does NOT move it — those are not the table's business", () => {
    expect(sigGuest({ ...guest, meal: "vegan", estGift: 900, arrived: true })).toBe(sigGuest(guest));
  });
});

// One definition of "complete", shared with the public badge and the export.
describe("collabComplete — what may enter the guest list", () => {
  const full = { name: "יעל", phone: "052", side: "bride", guest_group: "חברים", guests_count: 1 };

  it("a complete single-seat row syncs", () => {
    expect(collabComplete(full)).toBe(true);
  });

  it("a party with an unnamed seat does NOT sync — the badge says so too", () => {
    expect(collabComplete({ ...full, guests_count: 3, companions: ["בעל"] })).toBe(false);
    expect(collabComplete({ ...full, guests_count: 3, companions: ["בעל", "חבר"] })).toBe(true);
  });

  it("still refuses the rows it always refused", () => {
    expect(collabComplete({ ...full, phone: "" })).toBe(false);
    expect(collabComplete({ ...full, guest_group: "" })).toBe(false);
  });
});
