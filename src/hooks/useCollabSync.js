import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { MEAL_DEFAULT } from "../data/constants.js";
import { createRetryQueue } from "../utils/retryQueue.js";
import { normalizePhone } from "../utils/parseGuestList.js";
import { collabRowMissing } from "../utils/exportHelpers.js";
import {
  fetchCollabGuestsOwner, upsertCollabGuestOwner,
  deleteCollabGuestsOwner, subscribeCollabGuests,
} from "../utils/publicTokens.js";

// ── Two-way sync: shared collab table ⇄ the event's guest list ────────────────
//
// Keyed by a shared row id. A collab row that is COMPLETE (name + phone + side +
// group) is mirrored into guests; owner edits/adds/deletes in the app are pushed
// back to the collab table. Loops are broken with a per-id "last synced"
// signature: a change is only propagated when it actually differs from what we
// last reconciled, so an echo of our own write is a no-op.

const norm = (s) => (s || "").toString().trim();
const sideOf = (s) => (s === "groom" ? "groom" : "bride");
// The guest list's own phone normaliser — not a copy of it (audit 3.10, L3).
const normPhone = normalizePhone;

// A collab row is complete enough to become a real guest.
//
// ONE definition, shared with the badge on the public table and with the סטטוס
// column of the export (utils/exportHelpers.js). It used to be a fourth
// hand-maintained copy, and the moment the rule grew a fifth clause — every
// extra seat must be named (12.8) — the copy here would have started syncing
// rows that the public screen was, at that same second, telling a relative are
// not synced. A badge that lies is worse than a missing badge.
export const collabComplete = (r) => collabRowMissing(r).length === 0;

// Which existing guest a collab row should merge into: the same shared id, or
// else a guest matching on BOTH phone and name. Requiring both prevents merging
// two different people who share a phone (a household line, a reused number) or
// who share a name. Returns null when it should become a brand-new guest.
export function matchExistingGuest(guests, row) {
  const byId = (guests || []).find((g) => g.id === row.id);
  if (byId) return byId;
  const p = normPhone(row.phone);
  const n = norm(row.name);
  if (!p) return null;
  return (guests || []).find((g) => normPhone(g.phone) === p && norm(g.name) === n) || null;
}

// Companion names, clamped to the extra seats (count-1) and normalized, so a
// row with count 3 keeps at most 2 companion names in stable positions.
const clampComp = (arr, count) =>
  (Array.isArray(arr) ? arr : [])
    .slice(0, Math.max(0, (count || 1) - 1))
    .map((c) => (c || "").toString());
const compSig = (arr) => (Array.isArray(arr) ? arr.map((c) => norm(c)).join("~") : "");

// Signature of the shared fields — same string ⇒ no real change.
//
// Exported (with the two mappers below) for the same reason matchExistingGuest
// and pickCompanions are: a mutation run showed that dropping `notes` from
// either signature, or from either mapper, passed the entire test suite — four
// separate silent-data-loss edits, none of them noticed. That is the third bug
// class in CLAUDE.md, and the only defence against it is a test that reads the
// mapper output field by field.
//
// `notes` is IN the signature, and it has to be: the signature is the only
// thing that decides whether an owner edit is pushed to the table at all. A
// host who opens a guest and types "אלרגיה לאגוזים" changes nothing else about
// the row, so a signature without notes reads "unchanged" and the note never
// leaves the app. That is the same shape as the three fields that have already
// been lost on this project by being absent from a mapper.
export const sigCollab = (r) =>
  `${norm(r.name)}|${norm(r.phone)}|${sideOf(r.side)}|${norm(r.guest_group)}|${r.guests_count || 1}|${compSig(clampComp(r.companions, r.guests_count))}|${norm(r.notes)}`;
// A guest's signature is that of the row the TABLE can hold for it — clipped to
// the table's widths by guestToCollab. Signed as typed, a 49-character phone
// never matched the 40-character echo of its own push, so the echo was applied
// back over the host's list and the full number was replaced by the clipped one
// (fourth review 30.9 — a regression from סב44, which added the clipping).
export const sigGuest = (g) => sigCollab(guestToCollab(g));

/**
 * Which companion names win when a collab row meets an existing guest.
 *
 * ONE rule, and both halves of this feature obey it (the other half is
 * `mergePolled` in CollabScreen.jsx):
 *
 *   A `companions` ARRAY on the wire is the shared table's answer and wins,
 *   INCLUDING an empty one. Only an ABSENT key means "no opinion", and then
 *   whatever we already hold survives.
 *
 * Why this rule and not the other. The previous rule tried to treat `[]` as
 * "no opinion" unless the last row we saw carried names, so a deletion could
 * only propagate to a tab that had personally watched it happen. `prev` is
 * undefined on the first pull, so the "genuinely cleared" branch could never
 * fire for a clear that happened while the app was closed — measured in a
 * browser: table `companions: []`, app holding eight names, and on the next app
 * open the app kept its eight AND pushed them straight back into the shared
 * table. A relative deleted eight names and the host's app silently undid it.
 * Meanwhile CollabScreen was already treating `[]` as a clear, so the identical
 * wire value blanked eight inputs on one screen and resurrected them on the
 * other. An asymmetry like that is not a preference; it is two features.
 *
 * The cost is honest and bounded: companions become an ORDINARY field of the
 * shared row. Every other field here — name, phone, side, group, count — is
 * already overwritten from the table unconditionally, so a push that failed
 * (venue wifi) already loses those edits on the next pull. Companions had a
 * private exemption from that, and the exemption is what broke deletion. The
 * real fix for the failed-push case is retrying the push, not one field
 * quietly outranking the table.
 *
 * What the wire genuinely cannot say is "leave that column alone": both write
 * paths (`upsertCollabGuest`, `upsertCollabGuestOwner`) coerce a missing
 * `companions` to `[]`, so a client that never knew about the column can write
 * an empty list it did not mean. Fixing THAT needs the write side to be able to
 * omit the field — a change to `collab_upsert_by_token` (treat a NULL
 * `row_data->'companions'` as "keep the existing value") plus dropping the
 * coercion in publicTokens.js. That is a migration, and migrations are not this
 * file's to make — flagged, not done.
 */
export function pickCompanions(r, existing) {
  const count = r.guests_count || 1;
  // Absent key → the table has no opinion; keep ours (clamped to the seats the
  // table says this row has).
  if (!Array.isArray(r.companions)) return clampComp(existing?.companions ?? [], count);
  return clampComp(r.companions, count);
}

/**
 * Which note wins when a collab row meets an existing guest.
 *
 * The same ONE rule as pickCompanions above, applied to a scalar:
 *
 *   A `notes` STRING on the wire is the shared table's answer and wins,
 *   INCLUDING an empty one. Only an ABSENT (or non-string) value means "no
 *   opinion", and then whatever the app already holds survives.
 *
 * The two halves of that rule are not symmetric by accident:
 *   * `undefined` is what a database that has not run
 *     20260812000000_collab_notes.sql yet returns for every row — the column is
 *     simply not in the RPC's jsonb. Reading that silence as "the relative
 *     cleared the note" would delete the host's own notes on the first pull.
 *     Silence is never an instruction to delete; that is exactly how eight
 *     companion names were destroyed in August.
 *   * `""` is a person who selected the text in the notes box and pressed
 *     backspace. That IS an instruction, and refusing to honour it would give
 *     the field the private exemption that broke companion deletion — the note
 *     would come back on the next poll and the relative would watch their own
 *     edit be undone.
 *
 * The write side is what makes the distinction real: publicTokens.js omits the
 * key entirely unless the caller holds a string, and the RPC keeps the stored
 * value when the key is absent (`row_data ? 'notes'`). So an old client that
 * has never heard of notes cannot blank a note it does not know exists — which
 * is the hole this file's companion comment flagged and could not fix without
 * a migration. This field is born with it closed.
 */
export function pickNotes(r, existing) {
  if (typeof r?.notes !== "string") return existing?.notes ?? "";
  return r.notes.trim();
}

// Build/merge a guest row from a collab row, preserving app-only fields.
export const sameGuest = (a, b) =>
  Object.keys({ ...a, ...b }).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

// The table holds at most `n` characters of a field. When what it holds is
// exactly the host's value clipped, it has no newer opinion — the host's full
// value stands. Per field: a relative who edits only the notes of a row sends
// the row whole, clipped phone included, and taking it replaced the host's
// 45-character phone with 39 characters (fourth review 30.9; סב64 covered the
// echo, not this).
const fuller = (existingVal, rowVal, n) =>
  typeof existingVal === "string" && norm(clip(existingVal, n)) === norm(rowVal) ? existingVal : norm(rowVal);

export function guestFromCollab(r, existing) {
  const notes = pickNotes(r, existing);
  return {
    ...(existing || {}),
    id:    r.id,
    name:  fuller(existing?.name, r.name, 120),
    phone: fuller(existing?.phone, r.phone, 40),
    side:  sideOf(r.side),
    group: fuller(existing?.group, r.guest_group, 60) || "משפחה קרובה",
    count: r.guests_count || 1,
    meal:       existing?.meal       ?? MEAL_DEFAULT,
    rsvp:       existing?.rsvp       ?? "pending",
    // No longer app-only. "הערות" is where the dietary need, the wheelchair and
    // the "יושבים עם הסבים" live, and a relative filling in the shared table
    // had nowhere to put any of it — so the host had to chase it by phone,
    // which is the one thing the shared table exists to prevent.
    notes:      typeof existing?.notes === "string" && norm(clip(existing.notes, 500)) === notes ? existing.notes : notes,
    companions: pickCompanions(r, existing),
  };
}
// Clipped to the table's own widths (collab_guests CHECKs). The guest-link path
// clips in SQL; this path sent values as typed, and one over-long field was
// refused on every retry while the host was told to check their connection —
// the family never reached the table (30.9 review, סב44).
const clip = (v, n) => norm(v).slice(0, n);
export const guestToCollab = (g) => ({
  id: g.id, name: clip(g.name, 120), phone: clip(g.phone, 40),
  side: sideOf(g.side), guest_group: clip(g.group, 60),
  guests_count: Math.min(50, Math.max(1, g.count || 1)), // DB CHECK caps at 50
  companions: clampComp(g.companions, g.count || 1),
  notes: clip(g.notes, 500),
});

/**
 * Move every reference to a guest from one id to another, across the whole
 * event. Exported because it is the piece worth testing on its own.
 *
 * WHY IT EXISTS: when a family submission dedups onto an existing guest, the
 * guest is re-keyed to the collab row's id so `collab-row-id === guest-id`
 * stays true — the family's row is never deleted-and-recreated, so there is no
 * flicker and the two-way sync needs no special cases.
 *
 * THE BUG: this used to remap `seating`, `constraints` and `lockedGuests` and
 * FORGET `messagesSent`, which is keyed by guest id two levels down —
 * `{ [stage]: { [guestId]: ts } }`. MessagesScreen reads
 * `sent[stage]?.[g.id]`, so the guest silently reverted to "never messaged"
 * and the host re-sent the invitation to somebody who already had it. That is
 * the failure useEvents' own merge calls out as costing "real money and real
 * goodwill", reached through a different door.
 *
 * `lockedTables` is deliberately untouched: it holds TABLE ids, which this
 * never changes. Saying so is the point — the next id-keyed structure added to
 * an event has to be considered here on purpose.
 */
export function remapGuestId(ev, fromId, toId) {
  const remap = (id) => (id === fromId ? toId : id);

  const seating = { ...(ev.seating || {}) };
  if (seating[fromId] !== undefined) {
    seating[toId] = seating[fromId];
    delete seating[fromId];
  }

  const messagesSent = {};
  for (const [stage, byGuest] of Object.entries(ev.messagesSent || {})) {
    messagesSent[stage] = {};
    for (const [gid, ts] of Object.entries(byGuest || {})) {
      messagesSent[stage][remap(gid)] = ts;
    }
  }

  return {
    ...ev,
    seating,
    messagesSent,
    constraints: (ev.constraints || []).map((c) => ({ ...c, guestA: remap(c.guestA), guestB: remap(c.guestB) })),
    lockedGuests: (ev.lockedGuests || []).map(remap),
  };
}

/* Writes to the table that have not landed, kept across a reload (fifth
 * review 30.9, סב88). The retry queue lives in memory: the host edits a guest
 * at the venue, the push fails, the page is reloaded — and the next visit's
 * pull, with nothing to say this guest was waiting to be sent, took the table's
 * older copy over the host's edit. That is the failure the queue was written to
 * stop, one reload later. An id here means "this guest's latest edit is ours to
 * send": the pull leaves it alone and the push effect sends it.
 *
 * Not forever. While a mark stands, every change the family makes to that row
 * is kept out of the host's list — and a write the table keeps refusing held
 * it out indefinitely, in silence (sixth review 30.9). A mark lapses after
 * UNSENT_TTL_MS; after that the table's copy is taken again, as before any of
 * this. The host was already told, at the time, that the change had not been
 * saved. */
export const UNSENT_TTL_MS = 6 * 60 * 60 * 1000;
const unsentKey = (cloudId) => `kh_collab_unsent:${cloudId}`;
function readUnsent(cloudId, now = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(unsentKey(cloudId)) || "{}");
    // The first version stored a bare list of ids: read as marked now.
    const entries = Array.isArray(v) ? v.map(id => [id, now]) : Object.entries(v || {});
    return new Map(entries.filter(([id, at]) =>
      typeof id === "string" && Number.isFinite(at) && now - at < UNSENT_TTL_MS));
  } catch { return new Map(); }
}
function writeUnsent(cloudId, marks) {
  try {
    if (marks.size) localStorage.setItem(unsentKey(cloudId), JSON.stringify(Object.fromEntries(marks)));
    else localStorage.removeItem(unsentKey(cloudId));
  } catch { /* storage full or blocked: the in-memory queue still retries */ }
}

/* ── The last row both sides agreed on, per guest, across reloads (89) ───────
 *
 * Every decision here used to be "the table's copy, or the host's, whole":
 *   • a relative half-way through an edit (a third seat not named yet — an
 *     INCOMPLETE row, which is never applied) had it overwritten by the host's
 *     copy on the host's next visit (#6);
 *   • a host edit still owed to the table beat a relative's NEWER note on
 *     another field of the same row, and the note was lost (#host-wins);
 *   • a row a relative deleted while the host's app was closed came back,
 *     because nothing remembered that the row had ever been in step (57b).
 * The missing piece is the common ancestor, as for the event merge
 * (syncBase.js): per field, the side that moved since the last agreed row
 * wins. Stored per event in localStorage, so it outlives the reload — which is
 * exactly when all three happened. */
const COLLAB_FIELDS = ["name", "phone", "side", "guest_group", "guests_count", "companions", "notes"];
const fieldSig = (r, f) => {
  if (!r) return "";
  if (f === "side") return sideOf(r.side);
  if (f === "guests_count") return String(r.guests_count || 1);
  if (f === "companions") return compSig(clampComp(r.companions, r.guests_count));
  return norm(r[f]);
};
const agreedKey = (cloudId) => `kh_collab_synced:${cloudId}`;
function readAgreed(cloudId) {
  try {
    const v = JSON.parse(localStorage.getItem(agreedKey(cloudId)) || "{}");
    return new Map(Object.entries(v && typeof v === "object" ? v : {})
      .filter(([id, r]) => typeof id === "string" && r && typeof r === "object"));
  } catch { return new Map(); }
}
function writeAgreed(cloudId, map) {
  try {
    if (map.size) localStorage.setItem(agreedKey(cloudId), JSON.stringify(Object.fromEntries(map)));
    else localStorage.removeItem(agreedKey(cloudId));
  } catch { /* storage full or blocked: in memory still works for this visit */ }
}

/**
 * Per field: whichever of `host` / `table` moved away from `agreed` wins; a
 * field both moved goes to the host when `hostWinsBoth` (its edit is still
 * owed), else to the table. Returns the merged row (table shape).
 */
export function mergeCollabRow(host, table, agreed, hostWinsBoth) {
  const out = { ...table };
  for (const f of COLLAB_FIELDS) {
    const h = fieldSig(host, f), t = fieldSig(table, f);
    if (h === t) continue;
    const a = fieldSig(agreed, f);
    const hMoved = h !== a, tMoved = t !== a;
    if (hMoved && (!tMoved || hostWinsBoth)) out[f] = host[f];
  }
  return out;
}

/** The agreed row after `a` and `b` were reconciled: a field they agree on is
 *  agreed; a field they still differ on keeps the previous agreement. */
export function advanceAgreed(prev, a, b) {
  const out = { id: a.id };
  for (const f of COLLAB_FIELDS) {
    out[f] = fieldSig(a, f) === fieldSig(b, f) || !prev ? a[f] : prev[f];
  }
  return out;
}

export function useCollabSync(activeEvent, patchEvent, showToast) {
  const cloudId  = activeEvent?.cloudId || null;
  const collabOn = !!activeEvent?.tokens?.collab;

  const applied = useRef(new Map()); // id -> signature we last reconciled
  // Writes that have not landed yet. See src/utils/retryQueue.js — the push used
  // to be `.catch(() => {})` with the row marked reconciled BEFORE it resolved,
  // so a push lost to venue wifi was swallowed twice: nothing retried it, and
  // nothing would push it again either. The next pull then overwrote the host's
  // edit with the table's older copy, in silence.
  const queue   = useRef(null);
  const toldRef = useRef(false);   // one warning per outage, not one per row
  const mirror  = useRef(new Map()); // id -> latest known collab row
  const ready   = useRef(false);
  // Bumped when the initial pull finishes. `ready` is a ref (for synchronous
  // checks), so a state tick is what actually re-runs the app→table push effect
  // — otherwise existing guests aren't sent to a freshly-enabled table until the
  // owner's next edit.
  const [readyTick, setReadyTick] = useState(0);

  // The queue is created inside the pull effect below, not here: React forbids
  // touching a ref during render, and that effect is already the place where a
  // change of event or account resets everything.
  const toastRef = useRef(showToast);
  useEffect(() => { toastRef.current = showToast; });
  // The event as last rendered — the pull reads its tombstones.
  const eventRef = useRef(activeEvent);
  useEffect(() => { eventRef.current = activeEvent; });
  const unsent = useRef(new Map());   // guest id -> when it was first owed
  const agreed = useRef(new Map());   // guest id -> last row both sides agreed on (89)

  // ── table → app: initial pull + live subscription ──
  useEffect(() => {
    if (!isSupabaseConfigured || !cloudId || !collabOn) { ready.current = false; return; }
    let cancelled = false;
    let unsub = () => {};
    const stopQueue = () => queue.current?.stop();
    ready.current = false;
    applied.current = new Map();
    mirror.current = new Map();
    // Switching event or account: anything still queued belongs to the old one.
    queue.current?.stop();
    queue.current = createRetryQueue({
      onGiveUp: () => {
        if (toldRef.current) return;
        toldRef.current = true;
        toastRef.current?.(
          "חלק מהשינויים לא נשמרו בטבלה השיתופית — בדקו חיבור. הם יישלחו שוב בעריכה הבאה.",
          "err",
        );
      },
    });
    toldRef.current = false;

    unsent.current = readUnsent(cloudId);
    agreed.current = readAgreed(cloudId);
    const agree = (id, a, b) => {
      agreed.current.set(id, advanceAgreed(agreed.current.get(id), a, b));
      writeAgreed(cloudId, agreed.current);
    };
    const forget = (id) => { if (agreed.current.delete(id)) writeAgreed(cloudId, agreed.current); };

    const applyRow = (row) => {
      mirror.current.set(row.id, row);
      // A guest the host deleted, whose row is still in the table — the delete
      // was never sent (made offline, or the page closed before it landed).
      // Taken back in, it came back on every open (fifth review 30.9, סב88).
      // The tombstone says it was deleted here; send the delete instead.
      const ev = eventRef.current;
      if (ev?.deletedRows?.guests?.[row.id] && !(ev.guests || []).some(g => g.id === row.id)) {
        queue.current?.push("delete:" + row.id, () => deleteCollabGuestsOwner(cloudId, [row.id]));
        return;
      }
      if (!collabComplete(row)) return;
      const host = (ev?.guests || []).find(g => g.id === row.id);
      const base = agreed.current.get(row.id);
      // Our edit is still waiting to be sent: the table's copy is the older one
      // — for the fields WE changed. With a last-agreed row, the fields only
      // the family changed are still theirs (89: a relative's note was lost to
      // the host's unsent phone fix). Without one, the old whole-row rule.
      if (unsent.current.has(row.id) && host && !base) return;
      const sig = sigCollab(row);
      if (applied.current.get(row.id) === sig) return; // already reflected
      applied.current.set(row.id, sig);
      const take = host && base ? mergeCollabRow(guestToCollab(host), row, base, unsent.current.has(row.id)) : row;
      if (host) agree(row.id, row, take); else agree(row.id, row, row);
      patchEvent((e) => {
        const guests = e.guests || [];
        // Match by shared id, else dedup a family addition of someone already on
        // the list (phone + name) so it updates them instead of duplicating.
        const existing = matchExistingGuest(guests, row);

        // Same row → straightforward in-place update.
        if (existing && existing.id === row.id) {
          // The table holds exactly what this guest clips to: nothing to take,
          // and taking it would replace the host's full value with the clipped one.
          if (sigCollab(take) === sigGuest(existing)) return e;
          const merged = guestFromCollab(take, existing);
          // Already reflected: the same event back, so nothing is written. The
          // pull runs on every visit with `applied` empty, and each row used to
          // be a real edit — about a dozen version bumps and a cloud write per
          // page load, with nothing changed (third review 30.9, סב56).
          if (sameGuest(merged, existing)) return e;
          return { ...e, guests: guests.map((g) => (g.id === row.id ? merged : g)) };
        }

        // Deduped a family submission (row.id) onto an existing guest
        // (existing.id). Re-key the guest to the collab row id so
        // collab-row-id === guest-id stays true: the family's row is never
        // deleted-and-recreated (no flicker), and the two-way sync + removeRow
        // keep working without special cases. Migrate seating / constraints /
        // locks off the old guest id.
        if (existing) {
          const merged = { ...guestFromCollab(row, existing), id: row.id };
          return {
            ...remapGuestId(e, existing.id, row.id),
            guests: guests.map((g) => (g.id === existing.id ? merged : g)),
          };
        }

        // Deliberately not subject to the plan's guest cap. This row is a
        // relative filling in the shared table; dropping it would delete data
        // the host never saw, to enforce a limit the host is the one paying.
        // If PLAN_GATES_ENFORCED is ever turned on, the answer here is to warn
        // the host that the list has outgrown the plan — never to discard.
        return { ...e, guests: [...guests, guestFromCollab(row, null)] };
      });
    };

    const removeRow = (id) => {
      mirror.current.delete(id);
      if (unsent.current.delete(id)) writeUnsent(cloudId, unsent.current);
      // Known as a guest in this visit, or agreed in an earlier one (after a
      // reload `applied` is empty until each row is seen again).
      const known = applied.current.has(id) || agreed.current.has(id);
      forget(id);
      if (!known) return; // was only a draft, never a guest
      applied.current.delete(id);
      let removedName = "";
      patchEvent((e) => {
        const g = (e.guests || []).find((x) => x.id === id);
        removedName = g?.name || "";
        // Mirror the normal delete path: also strip the seating assignment and
        // any constraints referencing this guest, so nothing is left orphaned.
        const seating = { ...(e.seating || {}) };
        delete seating[id];
        return {
          ...e,
          guests: (e.guests || []).filter((x) => x.id !== id),
          seating,
          constraints: (e.constraints || []).filter((c) => c.guestA !== id && c.guestB !== id),
        };
      });
      if (removedName && showToast) showToast(`"${removedName}" הוסר — סונכרן מהטבלה השיתופית`);
    };

    const onChange = (payload) => {
      if (payload.eventType === "DELETE") removeRow(payload.old?.id);
      else if (payload.new) applyRow(payload.new);
    };
    // Subscribed BEFORE the first read (89 #10). It used to start only after
    // the pull had been applied, so a change a relative made in between —
    // read too early to be in the pull, too early for the subscription — was
    // missed until the next visit. Changes that arrive while the read is in
    // flight are held and applied after it, in order.
    let held = [];
    unsub = subscribeCollabGuests(cloudId, (payload) => {
      if (held) held.push(payload); else onChange(payload);
    });

    (async () => {
      try {
        const rows = await fetchCollabGuestsOwner(cloudId);
        if (cancelled) return;
        rows.forEach(applyRow);
        // A row this device had agreed on that is no longer in the table was
        // deleted there while the app was closed (57b, the reverse direction):
        // a relative removed it, and the host's copy used to be pushed straight
        // back. Not when the read came back EMPTY — an empty answer is also
        // what an expired session reads under RLS, and taking it as "the
        // family deleted everyone" would empty the guest list. And not when
        // the host has changed that guest since: an edit beats a delete, the
        // row is sent again (the recoverable side). And not when the read may
        // have been cut short (`complete === false`, see readAllCollab in
        // publicTokens.js): a row missing from a partial answer is not a row
        // the family deleted (audit 3.10).
        if (rows.length && rows.complete !== false) {
          const inTable = new Set(rows.map(r => r.id));
          for (const [id, base] of [...agreed.current]) {
            if (inTable.has(id) || unsent.current.has(id)) continue;
            const g = (eventRef.current?.guests || []).find(x => x.id === id);
            if (!g) { forget(id); continue; }
            if (sigGuest(g) === sigCollab(base)) removeRow(id);
          }
        }
      } catch { /* offline — retry on next mount */ }
      if (cancelled) return;
      const pending = held || [];
      held = null;
      pending.forEach(onChange);
      ready.current = true;
      setReadyTick((t) => t + 1); // re-run the push effect now that we're ready
    })();

    return () => { cancelled = true; unsub(); ready.current = false; stopQueue(); };
  }, [cloudId, collabOn, patchEvent, showToast]);

  // ── app → table: push owner add/edit/delete of guests ──
  const guests = activeEvent?.guests;
  useEffect(() => {
    if (!ready.current || !isSupabaseConfigured || !cloudId || !collabOn) return;
    if (!queue.current) return;   // the pull effect owns its lifetime
    const list = guests || [];
    const seen = new Set();

    list.forEach((g) => {
      seen.add(g.id);
      if (!norm(g.name)) return; // don't push nameless rows
      const sig = sigGuest(g);
      if (applied.current.get(g.id) === sig) return;            // unchanged since last sync
      const m = mirror.current.get(g.id);
      if (m && sigCollab(m) === sig) {                           // already matches table
        applied.current.set(g.id, sig);
        agreed.current.set(g.id, advanceAgreed(agreed.current.get(g.id), m, m));
        writeAgreed(cloudId, agreed.current);
        // It landed, even if the page closed before we heard: nothing owed.
        if (unsent.current.delete(g.id)) writeUnsent(cloudId, unsent.current);
        return;
      }
      const base = agreed.current.get(g.id);
      // The table moved and the host did not (89 #6): a relative half-way
      // through an edit — an incomplete row, which is never applied — had it
      // overwritten by the host's unchanged copy. Nothing of ours to send; the
      // family's row comes in once it is complete.
      if (m && base && sig === sigCollab(base) && !unsent.current.has(g.id)) return;
      // NOT marked applied yet. `applied` means "the table has this", and it
      // only has it once the write lands — otherwise a failed push leaves the
      // row looking reconciled and it is never sent again.
      // With a last-agreed row, only the fields the HOST changed are sent over
      // the table's copy; what the family changed meanwhile stays (89).
      const own = guestToCollab(g);
      const row = m && base ? mergeCollabRow(own, m, base, true) : own;
      if (!unsent.current.has(g.id)) { unsent.current.set(g.id, Date.now()); writeUnsent(cloudId, unsent.current); }
      queue.current.push(g.id, () =>
        upsertCollabGuestOwner(cloudId, row).then(() => {
          applied.current.set(g.id, sig);
          mirror.current.set(g.id, { ...row });
          agreed.current.set(g.id, advanceAgreed(agreed.current.get(g.id), row, own));
          writeAgreed(cloudId, agreed.current);
          // Only if this is still the newest copy: a later edit owes its own write.
          if (sigGuest((eventRef.current?.guests || []).find(x => x.id === g.id) || {}) === sig) {
            unsent.current.delete(g.id); writeUnsent(cloudId, unsent.current);
          }
          toldRef.current = false;   // the link is back; a later outage may warn again
        }));
    });

    // A guest that was previously synced (in `applied`) and is now gone → delete
    // its collab row. Draft collab rows that never became guests are untouched.
    const toDelete = [...applied.current.keys()].filter((id) => !seen.has(id));
    if (toDelete.length) {
      toDelete.forEach((id) => {
        applied.current.delete(id);
        mirror.current.delete(id);
        // A pending write for a row that no longer exists is moot, and letting
        // it land would recreate the row the host just deleted.
        queue.current.cancel(id);
        unsent.current.delete(id);
        agreed.current.delete(id);
      });
      writeUnsent(cloudId, unsent.current);
      writeAgreed(cloudId, agreed.current);
      queue.current.push("delete:" + toDelete.join(","), () =>
        deleteCollabGuestsOwner(cloudId, toDelete));
    }
  }, [guests, cloudId, collabOn, readyTick]);
}
