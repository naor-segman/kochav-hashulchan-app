import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchRSVPResponses } from "../utils/publicTokens.js";
import { pickMeal, pickCompanions, normName, normPhone, respStatus, latestPerRespondent } from "../utils/rsvpApply.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { uid } from "../utils/uid.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import { fmtDateTime } from "../utils/dateFormat.js";
import Banner from "../components/feedback/Banner.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import Loading from "../components/feedback/Loading.jsx";
import Icon from "../components/ui/Icon.jsx";
import styles from "./RSVPResponsesScreen.module.css";

// Map an RSVP answer to a guest-list rsvp value.
const GUEST_RSVP = { yes: "confirmed", maybe: "maybe", no: "declined" };

export default function RSVPResponsesScreen({ activeEvent: ev, patchEvent, go, showToast, syncStatus }) {
  const [responses, setResponses] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // "loading" | "ready" | "error" | "offline"
  const [showForecast, setShowForecast] = useState(false);
  // The response whose "+ הוסיפו לרשימה" is asking which side (owner, 3.10:
  // a guest added from an answer always landed on the first side).
  const [sidePickFor, setSidePickFor] = useState(null);
  const sideLabels = useMemo(() => getSideLabels(ev), [ev]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !ev.cloudId) {
      setLoadState("offline");
      return;
    }
    setLoadState("loading");
    try {
      const rows = await fetchRSVPResponses(ev.cloudId);
      setResponses(rows);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [ev.cloudId]);

  useEffect(() => { load(); }, [load]);

  // Match responses to guest-list rows by phone (strong) then name.
  const guestIndex = useMemo(() => {
    const byPhone = new Map(), byName = new Map(), nameCount = new Map();
    (ev.guests || []).forEach(g => {
      const p = normPhone(g.phone); if (p) byPhone.set(p, g);
      const n = normName(g.name);
      byName.set(n, g);
      nameCount.set(n, (nameCount.get(n) || 0) + 1);
    });
    return { byPhone, byName, nameCount };
  }, [ev.guests]);
  const matchGuest = useCallback((r) => {
    const p = normPhone(r.phone);
    if (p && guestIndex.byPhone.get(p)) return guestIndex.byPhone.get(p);
    // Name-only match: skip when the name is ambiguous (two guests share it) —
    // auto-applying to the wrong one would corrupt the list. Leave for manual add.
    const n = normName(r.guest_name);
    if (n && guestIndex.nameCount.get(n) === 1) return guestIndex.byName.get(n) || null;
    return null;
  }, [guestIndex]);
  // Was the match by phone? A name alone is not proof — anyone holding the
  // public link can type a guest's name — so a name-only match is applied by
  // the host with one tap, never automatically (סב63, owner 2.10).
  const matchedByPhone = useCallback((r) => {
    const p = normPhone(r.phone);
    return !!(p && guestIndex.byPhone.get(p));
  }, [guestIndex]);

  // A guest who answers twice is two rows — on purpose: the newest wins and
  // the auto-sync below keys on row ids. But every COUNT on this screen summed
  // all rows, so "maybe" then "yes" read as one maybe AND one yes, with the
  // party counted twice for catering and twice on the bus (107/ת4, 28.9).
  // Counts use each respondent's latest answer; the list below keeps history.
  const current = useMemo(() => latestPerRespondent(responses), [responses]);
  // Rows a later answer from the same respondent replaced. They stay on the
  // list — this screen is what people actually wrote — but nothing may be
  // APPLIED from them: "עדכנו אורח קיים" on an older "maybe" set a guest who
  // later said yes back to maybe (29.9 review).
  const currentIds = useMemo(() => new Set(current.map(r => r.id)), [current]);
  const stats = useMemo(() => {
    const confirmed = current.filter(r => respStatus(r) === "yes");
    const maybe     = current.filter(r => respStatus(r) === "maybe");
    const declined  = current.filter(r => respStatus(r) === "no");
    const coming    = confirmed.reduce((s, r) => s + (r.guests_count || 1), 0);
    return { total: current.length, confirmed: confirmed.length, maybe: maybe.length, declined: declined.length, coming,
             repeats: responses.length - current.length };
  }, [current, responses.length]);

  // Who has not answered at all. A non-answer produces no response row, so
  // this comes from the GUEST LIST — the nav promised "מי עוד לא ענה" and the
  // screen had no such number (ת).
  const unanswered = useMemo(
    () => (ev.guests || []).filter(g => (g?.rsvp || "pending") === "pending").length,
    [ev.guests],
  );

  // ── Shuttle registrations ────────────────────────────────────────────────
  // Guests pick a shuttle on the RSVP form; the host needs seats-per-pickup to
  // book the buses. A shuttle the host later deleted leaves stale ids behind,
  // which simply stop resolving to a name.
  const shuttleList = Array.isArray(ev?.eventSite?.shuttles) ? ev.eventSite.shuttles : [];
  const shuttleCounts = useMemo(() => shuttleList
    .map(sh => ({
      id: sh.id,
      label: [sh.place, sh.time].filter(Boolean).join(" · ") || "הסעה",
      // Whole party per responder — one RSVP can bring four people onto a bus.
      seats: current
        .filter(r => r.shuttle_id === sh.id && respStatus(r) !== "no")
        .reduce((n, r) => n + (r.guests_count || 1), 0),
    }))
    .filter(sh => sh.seats > 0),
    [current, ev?.eventSite?.shuttles], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Meal forecast — count confirmed seats across the guest list (manual +
  // synced RSVPs), then apply the no-show factor to recommend meals to order.
  const confirmedSeats = useMemo(
    () => (ev.guests || []).filter(g => g.rsvp === "confirmed").reduce((s, g) => s + (g.count || 1), 0),
    [ev.guests],
  );
  const noShowPct = Number.isFinite(ev.noShowPct) ? ev.noShowPct : 10;
  const recommendedMeals = Math.round(confirmedSeats * (1 - noShowPct / 100));

  // A response is "applied" when the matched guest already reflects it.
  const isApplied = useCallback((r, guest) => {
    if (!guest) return false;
    const wantStatus = GUEST_RSVP[respStatus(r)];
    if ((guest.rsvp || "pending") !== wantStatus) return false;
    if (respStatus(r) !== "no" && (guest.count || 1) !== (r.guests_count || 1)) return false;
    return true;
  }, []);

  /* A "yes" for more seats than the invitation was for used to land in silence
   * (third review 30.9, E5): invited for 1, answered 6, the list said 6, table
   * 3 went to 12 of 10, and this screen said "מעודכן ברשימה". The answer still
   * applies — a guest's answer is data — but the first invited number is kept
   * on the row, so the difference can be shown here and the table checked. */
  const invitedFor = (guest, newCount) =>
    newCount > (guest.count || 1) ? { invitedCount: guest.invitedCount ?? (guest.count || 1) } : {};

  // Seats taken at a guest's table, against its capacity — null when unseated.
  const tableLoad = useCallback((guest) => {
    const tid = ev.seating?.[guest.id];
    const t = tid && (ev.tables || []).find(x => x.id === tid);
    if (!t) return null;
    const used = (ev.guests || []).reduce((s, g) => s + (ev.seating[g.id] === tid ? (g.count || 1) : 0), 0);
    return { name: t.name, used, cap: t.capacity || 0 };
  }, [ev.seating, ev.tables, ev.guests]);

  const applyToGuest = useCallback((r, guest) => {
    const hasCount = respStatus(r) !== "no"; // yes + maybe carry a party size
    // Functional updater so rapid successive edits don't clobber each other
    // over a stale ev.guests snapshot.
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        g.id === guest.id
          ? {
              ...g,
              ...(hasCount ? invitedFor(g, r.guests_count || 1) : {}),
              rsvp:  GUEST_RSVP[respStatus(r)],
              count: hasCount ? (r.guests_count || 1) : (g.count || 1),
              phone: g.phone || r.phone || "",
              companions: pickCompanions(r, g.companions),
              meal: pickMeal(r, g.meal),
            }
          : g,
      ),
    }));
    showToast(`"${guest.name}" עודכן ברשימת האורחים ✓`);
  }, [patchEvent, showToast]);

  const addAsGuest = useCallback((r, side) => {
    const hasCount = respStatus(r) !== "no";
    const newGuest = {
      id: uid(),
      name: (r.guest_name || "").trim(),
      side,
      group: "אחר",
      count: hasCount ? (r.guests_count || 1) : 1,
      phone: r.phone || "",
      notes: "",
      rsvp: GUEST_RSVP[respStatus(r)],
      companions: pickCompanions(r, []),
      meal: (r.meal || "").trim() || undefined,
    };
    // Same rule as the shared table: a guest who answered is data, not an
    // action the plan gets to refuse. The cap applies to what the host adds.
    patchEvent(e => ({ ...e, guests: [...e.guests, newGuest] }));
    showToast(`"${newGuest.name}" נוסף לרשימת האורחים ✓`);
  }, [patchEvent, showToast]);

  // Auto-sync: a link-RSVP that matches a guest (by phone/name) updates that
  // guest's status automatically — once. Unmatched responses stay for a manual
  // "+ הוסיפו לרשימה" (avoids duplicates); host manual overrides afterwards stick.
  // Durable across remounts (localStorage) so navigating away and back doesn't
  // re-apply a response and clobber a manual host override made afterwards.
  /* Did the host change this guest by hand since the last answer was applied?
   * (סב63, owner 2.10.) An answer used to overwrite whatever the row said —
   * including what the host had just set after a phone call. Now an answer is
   * applied automatically only to a row that still reflects the previous
   * applied answer, or that has no answer yet; otherwise it waits on this
   * screen for the host, with the difference said. Nothing goes through us. */
  const handEdited = useCallback((r, guest, applied) => {
    const t = new Date(r.created_at).getTime() || 0;
    const prev = responses
      .filter(x => x.id !== r.id && applied.has(x.id) && matchGuest(x)?.id === guest.id
                && (new Date(x.created_at).getTime() || 0) <= t)
      .sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0))[0];
    if (prev) return !isApplied(prev, guest);
    return (guest.rsvp || "pending") !== "pending";
  }, [responses, matchGuest, isApplied]);
  const appliedKey = `rsvp_applied_${ev.cloudId || ev.id || "local"}`;
  const autoDone = useRef(new Set());
  const hydrated = useRef(false);
  // Reset the applied-set when the event changes (the screen may be reused across
  // events without remounting) so event B never carries event A's applied ids.
  useEffect(() => {
    hydrated.current = false;
    autoDone.current = new Set();
  }, [appliedKey]);
  useEffect(() => {
    // The synced list (ת3, 28.9) is what the OTHER device applied — read on
    // EVERY run, not once at mount. This screen is a URL route: reloaded on
    // it, the event shows its LOCAL copy first and the cloud copy's list
    // arrives a moment later; read once, that list was never seen and the
    // other device's answers were applied again over the host's manual
    // changes (29.9 review).
    (ev.rsvpApplied || []).forEach(id => autoDone.current.add(id));
    if (!hydrated.current) {
      hydrated.current = true;
      // The old per-browser list is still read once, so nothing this browser
      // applied before the change is applied again; it is no longer written.
      try { JSON.parse(localStorage.getItem(appliedKey) || "[]").forEach(id => autoDone.current.add(id)); }
      catch { /* ignore */ }
    }
    // And nothing is applied while the cloud copy is still on its way: the
    // answers can arrive before it, and then the list above is the stale one.
    if (syncStatus === "syncing") return;
    if (loadState !== "ready" || responses.length === 0) return;

    // Pick the NEWEST not-yet-applied response per matched guest — a later "yes"
    // must win over an earlier "maybe" regardless of the fetch order.
    const chosen = new Map(); // guestId -> { r, guest, ts }
    const priorApplied = new Set(autoDone.current);
    let changed = false;
    responses.forEach(r => {
      if (autoDone.current.has(r.id)) return;
      const guest = matchGuest(r);
      if (!guest) return;                       // unmatched → manual add
      if (!matchedByPhone(r)) return;           // name only → the host taps (סב63)
      autoDone.current.add(r.id); changed = true;
      const ts = new Date(r.created_at).getTime() || 0;
      const prev = chosen.get(guest.id);
      if (!prev || ts >= prev.ts) chosen.set(guest.id, { r, guest, ts });
    });

    const updates = new Map();
    let n = 0, grew = 0, held = 0;
    chosen.forEach(({ r, guest }) => {
      if (isApplied(r, guest)) return;          // already reflects it
      if (handEdited(r, guest, priorApplied)) { held++; return; }   // the host decides
      const status = respStatus(r), hasCount = status !== "no";
      const more = hasCount ? invitedFor(guest, r.guests_count || 1) : {};
      if (more.invitedCount !== undefined) grew++;
      updates.set(guest.id, {
        ...more,
        rsvp:  GUEST_RSVP[status],
        count: hasCount ? (r.guests_count || 1) : (guest.count || 1),
        phone: guest.phone || r.phone || "",
        companions: pickCompanions(r, guest.companions),
        meal: pickMeal(r, guest.meal),
      });
      n++;
    });

    if (held > 0) {
      showToast(held === 1
        ? "תשובה אחת שונה ממה שעדכנתם ידנית — היא מחכה לכם ברשימה למטה"
        : `${held} תשובות שונות ממה שעדכנתם ידנית — הן מחכות לכם ברשימה למטה`, "warn");
    }
    if (!changed && n === 0) return;
    const applied = [...autoDone.current];
    patchEvent(e => ({
      ...e,
      rsvpApplied: [...new Set([...(e.rsvpApplied || []), ...applied])],
      guests: n === 0 ? e.guests : e.guests.map(g => updates.has(g.id) ? { ...g, ...updates.get(g.id) } : g),
    }));
    if (grew > 0) {
      showToast(`${n} אישורי הגעה סונכרנו — ${grew === 1 ? "אחד מהם אישר" : `${grew} מהם אישרו`} יותר מקומות ממה שהוזמנו. בדקו ברשימה למטה`, "warn");
    } else if (n > 0) showToast(`${n} אישורי הגעה סונכרנו לרשימה אוטומטית ✓`);
  }, [responses, loadState, matchGuest, matchedByPhone, handEdited, isApplied, patchEvent, showToast, appliedKey, ev.rsvpApplied, syncStatus]);

  const rsvpLink = ev.tokens?.rsvp
    ? window.location.origin + "/rsvp/" + ev.tokens.rsvp
    : null;

  return (
    <div className={base.page}>
      <PageHeader
        title="תשובות אישורי הגעה"
        mark="rsvp"
        /* ת: it said every answer "נכנס אוטומטית לרשימת האורחים". Only an
           answer MATCHED to a guest on the list is applied, and only when this
           screen opens; the rest wait below for a tap. */
        sub="תשובה שזוהתה לפי טלפון מתעדכנת ברשימה כשנכנסים למסך הזה. תשובה שזוהתה רק לפי שם, או של אורח ששיניתם ידנית, מחכה כאן ללחיצה שלכם. תשובה שלא זוהתה מחכה כאן לשיוך. כאן גם תמונת מצב ותחזית מנות."
      />

      {/* ── Summary stats ── */}
      {loadState === "ready" && (
        <div data-tour="rsvps.stats" className={styles.statsRow}>
          <div className={styles.statTile}>
            <span className={styles.statNum}>{stats.total}</span>
            <span className={styles.statLabel}>תשובות</span>
          </div>
          <div className={[styles.statTile, styles.statOk].join(" ")}>
            <span className={styles.statNum}>{stats.confirmed}</span>
            <span className={styles.statLabel}>אישרו הגעה</span>
          </div>
          <div className={[styles.statTile, styles.statOk].join(" ")}>
            <span className={styles.statNum}>{stats.coming}</span>
            <span className={styles.statLabel}>אורחים מגיעים</span>
          </div>
          <div className={[styles.statTile, styles.statMaybe].join(" ")}>
            <span className={styles.statNum}>{stats.maybe}</span>
            <span className={styles.statLabel}>אולי</span>
          </div>
          <div className={[styles.statTile, styles.statNo].join(" ")}>
            <span className={styles.statNum}>{stats.declined}</span>
            <span className={styles.statLabel}>לא מגיעים</span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statNum}>{unanswered}</span>
            <span className={styles.statLabel}>ברשימה וטרם ענו</span>
          </div>
        </div>
      )}
      {loadState === "ready" && stats.repeats > 0 && (
        <p className={base.fieldHint}>
          {stats.repeats === 1
            ? "אורח אחד ענה יותר מפעם אחת — נספרה רק התשובה האחרונה שלו."
            : `${stats.repeats} תשובות הוחלפו בתשובה חדשה יותר של אותו אורח — נספרה רק האחרונה.`}
        </p>
      )}

      {/* ── Meal forecast (optional — collapsed by default) ── */}
      {confirmedSeats > 0 && !showForecast && (
        <button data-tour="rsvps.forecast" className={base.btnSecondary} style={{ marginBottom: 14 }} onClick={() => setShowForecast(true)}>
          <Icon name="food" /> הציגו תחזית מנות (אופציונלי)
        </button>
      )}
      {shuttleCounts.length > 0 && (
        <div data-tour="rsvps.shuttles" className={base.card}>
          <SectionLabel>הרשמה להסעות</SectionLabel>
          <p className={base.fieldHint}>
            כמה מקומות להזמין בכל הסעה, לפי מה שהאורחים סימנו בטופס אישור ההגעה.
            נספרת כל הרשומה — אורח שמגיע עם שלושה נוספים תופס ארבעה מקומות.
          </p>
          <div className={styles.shuttleGrid}>
            {shuttleCounts.map(sh => (
              <div key={sh.id} className={styles.shuttleCard}>
                <span className={styles.shuttleSeats}>{sh.seats}</span>
                <span className={styles.shuttleName}>{sh.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmedSeats > 0 && showForecast && (
        <div className={base.card}>
          <SectionLabel>כמה מנות להזמין?</SectionLabel>
          <p className={base.fieldHint}>
            לא כל מי שאישר מגיע בפועל. הזינו את מקדם אי-ההגעה המשוער וקבלו המלצה
            כמה מנות לסגור מול האולם — כדי לא לשלם על מנות מיותרות.
          </p>
          <div className={styles.forecastRow}>
            <div className={styles.forecastField}>
              <label className={styles.forecastLabel}>מקדם אי-הגעה</label>
              <div className={styles.forecastInputWrap}>
                <input
                  className={base.input}
                  type="number" min="0" max="40"
                  value={noShowPct}
                  onChange={e => {
                    const v = Math.max(0, Math.min(40, parseInt(e.target.value) || 0));
                    patchEvent({ noShowPct: v });
                  }}
                />
                <span className={styles.forecastPct}>%</span>
              </div>
            </div>
            <div className={styles.forecastResult}>
              <span className={styles.forecastNum}>{recommendedMeals}</span>
              <span className={styles.forecastResultLabel}>מנות מומלצות</span>
            </div>
            <div className={styles.forecastMeta}>
              מתוך {confirmedSeats} שסומנו כ״מגיעים״ ברשימת האורחים
            </div>
          </div>
        </div>
      )}

      {/* ── Offline / error states ── */}
      {loadState === "offline" && (
        <div data-tour="rsvps.offline">
          <Banner variant="warn">
            {isSupabaseConfigured
              ? "האירוע עדיין לא סונכרן לענן — תשובות יופיעו כאן לאחר הסנכרון הראשון (התחברו לחשבון אם עוד לא)."
              : "סנכרון ענן אינו מוגדר בסביבה זו."}
          </Banner>
        </div>
      )}
      {loadState === "error" && (
        <Banner variant="err">
          שגיאה בטעינת התשובות —
          <button className={base.btnSm} onClick={load}>נסו שוב</button>
        </Banner>
      )}
      {loadState === "loading" && (
        <Loading rows={4} label="טוען תשובות…" />
      )}

      {/* ── Empty state with share link ── */}
      {loadState === "ready" && responses.length === 0 && (
        <div data-tour="rsvps.share" className={base.card}>
          <SectionLabel>עדיין אין תשובות</SectionLabel>
          <p className={base.fieldHint}>
            שתפו את קישור אישור ההגעה עם האורחים — כל תשובה תופיע כאן אוטומטית.
          </p>
          {rsvpLink && (
            <div className={styles.shareRow}>
              <input className={base.input} readOnly value={rsvpLink} dir="ltr" aria-label="קישור לאישור הגעה" />
              <button
                className={base.btnSm}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(rsvpLink);
                    showToast("הקישור הועתק ✓");
                  } catch {
                    showToast("לא ניתן להעתיק — העתיקו ידנית", "err");
                  }
                }}
              >העתיקו קישור</button>
            </div>
          )}
        </div>
      )}

      {/* ── Responses list ── */}
      {loadState === "ready" && responses.length > 0 && (
        <>
          <div className={base.actionBar}>
            <button className={base.btnSecondary} onClick={load}>רעננו ↺</button>
            <span className={base.fieldHint}>מתעדכן בכל כניסה למסך</span>
          </div>
          <div data-tour="rsvps.list" className={base.gList}>
            {responses.map(r => {
              const guest   = matchGuest(r);
              const applied = isApplied(r, guest);
              return (
                <div key={r.id} className={base.gRow}>
                  <div className={base.gInfo}>
                    <span className={base.gName}>
                      {r.guest_name}
                      {respStatus(r) === "yes"   && <span className={styles.badgeYes}>מגיעים · {r.guests_count || 1}</span>}
                      {respStatus(r) === "maybe" && <span className={styles.badgeMaybe}>אולי</span>}
                      {respStatus(r) === "no"    && <span className={styles.badgeNo}>לא מגיעים</span>}
                    </span>
                    {/* The names the guest actually typed.
                     *
                     * `companions` was already being SELECTed by
                     * fetchRSVPResponses and already being written into the
                     * guest row — it was simply never shown here, so this
                     * screen said "מגיעים · 2" and dropped the fact that the
                     * second one is ירדן. Reported after the first real
                     * end-to-end RSVP.
                     *
                     * This screen is the raw responses, and it is where the
                     * host looks to see what people actually wrote. Showing a
                     * count while hiding the words behind it is a loss in the
                     * one view whose job is not to lose anything.
                     *
                     * Guarded on the array rather than on length alone: the
                     * column is jsonb and an older row can hold null. */}
                    {Array.isArray(r.companions) && r.companions.length > 0 && (
                      <span className={base.gMeta}>
                        עם {r.companions.join(", ")}
                      </span>
                    )}
                    <span className={base.gMeta}>
                      {r.phone ? r.phone + " · " : ""}{fmtDateTime(r.created_at)}
                    </span>
                    {applied && guest.invitedCount && (guest.count || 1) > guest.invitedCount && (() => {
                      const load = tableLoad(guest);
                      return (
                        <span className={styles.partyGrew}>
                          הוזמנו {guest.invitedCount === 1 ? "למקום אחד" : `ל-${guest.invitedCount} מקומות`}, אישרו {guest.count}
                          {load && load.cap > 0 && load.used > load.cap
                            ? ` · ${load.name} עכשיו ${load.used} מתוך ${load.cap}` : ""}
                        </span>
                      );
                    })()}
                  </div>
                  {applied ? (
                    <span className={base.tagSeated}>מעודכן ברשימה <Icon name="check" size={12} /></span>
                  ) : !currentIds.has(r.id) ? (
                    <span className={base.gMeta}>הוחלפה בתשובה מאוחרת יותר</span>
                  ) : guest ? (
                    <span className={styles.applyCol}>
                      {/* Why this one waits for a tap (סב63): matched by name
                          only, or the row was changed by hand after the last
                          answer. */}
                      <span className={base.gMeta}>
                        {!matchedByPhone(r)
                          ? `זוהה לפי שם — ${guest.name}?`
                          : handEdited(r, guest, new Set(ev.rsvpApplied || [])) ? "שונה ממה שעדכנתם ידנית" : ""}
                      </span>
                      <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => applyToGuest(r, guest)}>
                        עדכנו אורח קיים
                      </button>
                    </span>
                  ) : sidePickFor === r.id ? (
                    /* Which side — the one thing an answer cannot say and the
                       seating needs. Not a default the host fixes later. */
                    <span className={styles.sidePick} role="group" aria-label={`לאיזה צד להוסיף את ${r.guest_name || "האורח"}`}>
                      <span className={base.gMeta}>לאיזה צד?</span>
                      {["bride", "groom"].map(sd => (
                        <button key={sd} className={[base.btnSm, base.btnGhost].join(" ")}
                          onClick={() => { addAsGuest(r, sd); setSidePickFor(null); }}>
                          {sideLabels[sd]}
                        </button>
                      ))}
                      <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => setSidePickFor(null)}>ביטול</button>
                    </span>
                  ) : (
                    <button
                      className={[base.btnSm, base.btnGhost].join(" ")}
                      onClick={() => setSidePickFor(r.id)}
                    >
                      + הוסיפו לרשימה
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.footerActions}>
            <button className={base.btnSecondary} onClick={() => go("guests")}>
              <Icon name="arrowLeft" size={15} /> לרשימת האורחים המלאה
            </button>
          </div>
        </>
      )}
    </div>
  );
}
