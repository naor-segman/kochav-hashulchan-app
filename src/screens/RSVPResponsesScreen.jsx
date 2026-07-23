import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Icon from "../components/ui/Icon.jsx";
import { fetchRSVPResponses } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { uid } from "../utils/uid.js";
import Banner from "../components/feedback/Banner.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./RSVPResponsesScreen.module.css";

// Normalize a display name for fuzzy matching between an RSVP response and a
// guest-list row: trim, collapse inner whitespace, lowercase.
function normName(s) {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Normalize an Israeli phone to a comparable local form (05x…) for matching.
function normPhone(p) {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

// A response's answer: prefer the new status column, fall back to the boolean.
const respStatus = (r) => r.status || (r.attending ? "yes" : "no");
// Map an RSVP answer to a guest-list rsvp value.
const GUEST_RSVP = { yes: "confirmed", maybe: "maybe", no: "declined" };

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RSVPResponsesScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [responses, setResponses] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // "loading" | "ready" | "error" | "offline"
  const [showForecast, setShowForecast] = useState(false);

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
    const byPhone = new Map(), byName = new Map();
    (ev.guests || []).forEach(g => {
      const p = normPhone(g.phone); if (p) byPhone.set(p, g);
      byName.set(normName(g.name), g);
    });
    return { byPhone, byName };
  }, [ev.guests]);
  const matchGuest = useCallback((r) => {
    const p = normPhone(r.phone);
    return (p && guestIndex.byPhone.get(p)) || guestIndex.byName.get(normName(r.guest_name)) || null;
  }, [guestIndex]);

  const stats = useMemo(() => {
    const confirmed = responses.filter(r => respStatus(r) === "yes");
    const maybe     = responses.filter(r => respStatus(r) === "maybe");
    const declined  = responses.filter(r => respStatus(r) === "no");
    const coming    = confirmed.reduce((s, r) => s + (r.guests_count || 1), 0);
    return { total: responses.length, confirmed: confirmed.length, maybe: maybe.length, declined: declined.length, coming };
  }, [responses]);

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

  const applyToGuest = useCallback((r, guest) => {
    const hasCount = respStatus(r) !== "no"; // yes + maybe carry a party size
    const comps = Array.isArray(r.companions) ? r.companions.filter(Boolean) : [];
    // Functional updater so rapid successive edits don't clobber each other
    // over a stale ev.guests snapshot.
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        g.id === guest.id
          ? {
              ...g,
              rsvp:  GUEST_RSVP[respStatus(r)],
              count: hasCount ? (r.guests_count || 1) : (g.count || 1),
              phone: g.phone || r.phone || "",
              companions: comps.length ? comps : (g.companions || []),
            }
          : g,
      ),
    }));
    showToast(`"${guest.name}" עודכן ברשימת האורחים ✓`);
  }, [patchEvent, showToast]);

  const addAsGuest = useCallback((r) => {
    const hasCount = respStatus(r) !== "no";
    const newGuest = {
      id: uid(),
      name: (r.guest_name || "").trim(),
      side: "bride",
      group: "אחר",
      count: hasCount ? (r.guests_count || 1) : 1,
      phone: r.phone || "",
      notes: "",
      rsvp: GUEST_RSVP[respStatus(r)],
      companions: Array.isArray(r.companions) ? r.companions.filter(Boolean) : [],
    };
    patchEvent(e => ({ ...e, guests: [...e.guests, newGuest] }));
    showToast(`"${newGuest.name}" נוסף לרשימת האורחים ✓`);
  }, [patchEvent, showToast]);

  // Auto-sync: a link-RSVP that matches a guest (by phone/name) updates that
  // guest's status automatically — once. Unmatched responses stay for a manual
  // "+ הוסיפו לרשימה" (avoids duplicates); host manual overrides afterwards stick.
  // Durable across remounts (localStorage) so navigating away and back doesn't
  // re-apply a response and clobber a manual host override made afterwards.
  const appliedKey = `rsvp_applied_${ev.cloudId || ev.id || "local"}`;
  const autoDone = useRef(new Set());
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      try { JSON.parse(localStorage.getItem(appliedKey) || "[]").forEach(id => autoDone.current.add(id)); }
      catch { /* ignore */ }
    }
    if (loadState !== "ready" || responses.length === 0) return;
    const updates = new Map();
    let n = 0, changed = false;
    responses.forEach(r => {
      if (autoDone.current.has(r.id)) return;
      const guest = matchGuest(r);
      if (!guest) return;                       // unmatched → manual add
      autoDone.current.add(r.id); changed = true;
      if (isApplied(r, guest)) return;          // already reflects it
      const status = respStatus(r), hasCount = status !== "no";
      const comps = Array.isArray(r.companions) ? r.companions.filter(Boolean) : [];
      updates.set(guest.id, {
        rsvp:  GUEST_RSVP[status],
        count: hasCount ? (r.guests_count || 1) : (guest.count || 1),
        phone: guest.phone || r.phone || "",
        companions: comps.length ? comps : (guest.companions || []),
      });
      n++;
    });
    if (changed) { try { localStorage.setItem(appliedKey, JSON.stringify([...autoDone.current])); } catch { /* ignore */ } }
    if (n === 0) return;
    patchEvent(e => ({ ...e, guests: e.guests.map(g => updates.has(g.id) ? { ...g, ...updates.get(g.id) } : g) }));
    showToast(`${n} אישורי הגעה סונכרנו לרשימה אוטומטית ✓`);
  }, [responses, loadState, matchGuest, isApplied, patchEvent, showToast, appliedKey]);

  const rsvpLink = ev.tokens?.rsvp
    ? window.location.origin + "/rsvp/" + ev.tokens.rsvp
    : null;

  return (
    <div className={base.page}>
      <PageHeader
        title="תשובות אישורי הגעה"
        icon={<Icon name="clipboard" />}
        sub="כל מי שמאשר דרך הקישור נכנס אוטומטית לרשימת האורחים. כאן רואים תמונת מצב ותחזית מנות."
      />

      {/* ── Summary stats ── */}
      {loadState === "ready" && (
        <div className={styles.statsRow}>
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
        </div>
      )}

      {/* ── Meal forecast (optional — collapsed by default) ── */}
      {confirmedSeats > 0 && !showForecast && (
        <button className={base.btnSecondary} style={{ marginBottom: 14 }} onClick={() => setShowForecast(true)}>
          🍽 הציגו תחזית מנות (אופציונלי)
        </button>
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
        <Banner variant="warn">
          {isSupabaseConfigured
            ? "האירוע עדיין לא סונכרן לענן — תשובות יופיעו כאן לאחר הסנכרון הראשון (התחברו לחשבון אם עוד לא)."
            : "סנכרון ענן אינו מוגדר בסביבה זו."}
        </Banner>
      )}
      {loadState === "error" && (
        <Banner variant="err">
          שגיאה בטעינת התשובות —
          <button className={base.btnSm} onClick={load}>נסו שוב</button>
        </Banner>
      )}
      {loadState === "loading" && (
        <div className={styles.loadingNote}>טוען תשובות…</div>
      )}

      {/* ── Empty state with share link ── */}
      {loadState === "ready" && responses.length === 0 && (
        <div className={base.card}>
          <SectionLabel>עדיין אין תשובות</SectionLabel>
          <p className={base.fieldHint}>
            שתפו את קישור אישור ההגעה עם האורחים — כל תשובה תופיע כאן אוטומטית.
          </p>
          {rsvpLink && (
            <div className={styles.shareRow}>
              <input className={base.input} readOnly value={rsvpLink} dir="ltr" />
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
          <div className={base.gList}>
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
                    <span className={base.gMeta}>
                      {r.phone ? r.phone + " · " : ""}{formatDate(r.created_at)}
                    </span>
                  </div>
                  {applied ? (
                    <span className={base.tagSeated}>מעודכן ברשימה ✓</span>
                  ) : guest ? (
                    <button className={base.btnSm} onClick={() => applyToGuest(r, guest)}>
                      עדכנו אורח קיים
                    </button>
                  ) : (
                    <button
                      className={[base.btnSm, base.btnGhost].join(" ")}
                      onClick={() => addAsGuest(r)}
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
              → לרשימת האורחים המלאה
            </button>
          </div>
        </>
      )}
    </div>
  );
}
