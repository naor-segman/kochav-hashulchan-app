import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { MEAL_DEFAULT } from "../data/constants.js";
import { createRetryQueue } from "../utils/retryQueue.js";
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
const normPhone = (p) => {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
};

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
export const sigGuest = (g) =>
  `${norm(g.name)}|${norm(g.phone)}|${sideOf(g.side)}|${norm(g.group)}|${g.count || 1}|${compSig(clampComp(g.companions, g.count))}|${norm(g.notes)}`;

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
export function guestFromCollab(r, existing) {
  return {
    ...(existing || {}),
    id:    r.id,
    name:  norm(r.name),
    phone: norm(r.phone),
    side:  sideOf(r.side),
    group: norm(r.guest_group) || "משפחה קרובה",
    count: r.guests_count || 1,
    meal:       existing?.meal       ?? MEAL_DEFAULT,
    rsvp:       existing?.rsvp       ?? "pending",
    // No longer app-only. "הערות" is where the dietary need, the wheelchair and
    // the "יושבים עם הסבים" live, and a relative filling in the shared table
    // had nowhere to put any of it — so the host had to chase it by phone,
    // which is the one thing the shared table exists to prevent.
    notes:      pickNotes(r, existing),
    companions: pickCompanions(r, existing),
  };
}
export const guestToCollab = (g) => ({
  id: g.id, name: norm(g.name), phone: norm(g.phone),
  side: sideOf(g.side), guest_group: norm(g.group),
  guests_count: Math.min(50, Math.max(1, g.count || 1)), // DB CHECK caps at 50
  companions: clampComp(g.companions, g.count || 1),
  notes: norm(g.notes),
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

    const applyRow = (row) => {
      mirror.current.set(row.id, row);
      if (!collabComplete(row)) return;
      const sig = sigCollab(row);
      if (applied.current.get(row.id) === sig) return; // already reflected
      applied.current.set(row.id, sig);
      patchEvent((e) => {
        const guests = e.guests || [];
        // Match by shared id, else dedup a family addition of someone already on
        // the list (phone + name) so it updates them instead of duplicating.
        const existing = matchExistingGuest(guests, row);

        // Same row → straightforward in-place update.
        if (existing && existing.id === row.id) {
          const merged = guestFromCollab(row, existing);
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
      if (!applied.current.has(id)) return; // was only a draft, never a guest
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

    (async () => {
      try {
        const rows = await fetchCollabGuestsOwner(cloudId);
        if (cancelled) return;
        rows.forEach(applyRow);
      } catch { /* offline — retry on next mount */ }
      if (cancelled) return;
      ready.current = true;
      setReadyTick((t) => t + 1); // re-run the push effect now that we're ready
      unsub = subscribeCollabGuests(cloudId, (payload) => {
        if (payload.eventType === "DELETE") removeRow(payload.old?.id);
        else if (payload.new) applyRow(payload.new);
      });
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
      if (m && sigCollab(m) === sig) { applied.current.set(g.id, sig); return; } // already matches table
      // NOT marked applied yet. `applied` means "the table has this", and it
      // only has it once the write lands — otherwise a failed push leaves the
      // row looking reconciled and it is never sent again.
      const row = guestToCollab(g);
      queue.current.push(g.id, () =>
        upsertCollabGuestOwner(cloudId, row).then(() => {
          applied.current.set(g.id, sig);
          mirror.current.set(g.id, { ...row });
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
      });
      queue.current.push("delete:" + toDelete.join(","), () =>
        deleteCollabGuestsOwner(cloudId, toDelete));
    }
  }, [guests, cloudId, collabOn, readyTick]);
}
