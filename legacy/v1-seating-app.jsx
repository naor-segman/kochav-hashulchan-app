// ─── כוכב השולחן — V6 Excel Import ──────────────────────────────────────────
// Added: Excel/CSV import with smart mapping flow.
// Data model change: guest gains `count` field (number of seats in party).
// Algorithm updated: count-aware seating.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
// SheetJS loaded via CDN in styleTag below

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const EVENT_TYPES = [
  "חתונה","בר מצווה","בת מצווה","חינה","אירוס",
  "אירוע משפחתי","אירוע עסקי","יום הולדת","אחר",
];
const GROUP_OPTIONS = [
  "הורים","אחים ואחיות","סבים וסבתות","דודים ודודות",
  "בני דודים","חברים","חברים מהלימודים","חברים מהצבא",
  "חברים מהעבודה","משפחה קרובה","משפחה רחוקה","עמיתים","אחר",
];
const TABLE_TYPES = [
  { value:"regular", label:"רגיל" },
  { value:"vip",     label:"VIP" },
  { value:"head",    label:"שולחן ראשי" },
];
const STORAGE_KEY = "kochav_hashulchan_v1";

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return { events: [] };
}
function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ═══════════════════════════════════════════════════════════════
// ID FACTORY
// ═══════════════════════════════════════════════════════════════

let _id = Date.now();
const uid = () => String(++_id);

// ═══════════════════════════════════════════════════════════════
// AUTO-ASSIGNMENT
// ═══════════════════════════════════════════════════════════════

function buildClusters(guests, constraints) {
  const parent = {};
  const find = id => {
    if (parent[id] === undefined) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  constraints.filter(c => c.type === "together").forEach(c => union(c.guestA, c.guestB));
  const clusterMap = {};
  guests.forEach(g => {
    const root = find(g.id);
    if (!clusterMap[root]) clusterMap[root] = [];
    clusterMap[root].push(g.id);
  });
  return Object.values(clusterMap);
}

function buildApartSet(constraints) {
  const s = new Set();
  constraints.filter(c => c.type === "apart").forEach(c => {
    s.add([c.guestA, c.guestB].sort().join("___"));
  });
  return s;
}

function apartConflict(apartSet, guestId, tableGuestIds) {
  return tableGuestIds.some(existing =>
    apartSet.has([guestId, existing].sort().join("___"))
  );
}

function affinityScore(guest, tableGuestIds, guestMap) {
  let score = 0;
  tableGuestIds.forEach(id => {
    const other = guestMap[id];
    if (!other) return;
    if (other.side === guest.side && other.group === guest.group) score += 3;
    else if (other.side === guest.side) score += 1;
  });
  return score;
}

function guestSeats(g) { return g.count || 1; }

function seatedCount(tState_entry, guestMap) {
  return tState_entry.seated.reduce((s, id) => s + guestSeats(guestMap[id] || {}), 0);
}

function autoAssign(guests, tables, constraints) {
  if (!guests.length || !tables.length) return {};
  const guestMap = Object.fromEntries(guests.map(g => [g.id, g]));
  const apartSet = buildApartSet(constraints);
  const clusters = buildClusters(guests, constraints);
  const tState   = tables.map(t => ({ id:t.id, capacity:t.capacity, seated:[] }));
  const seating  = {};

  const clusterSeats = ids => ids.reduce((s, id) => s + guestSeats(guestMap[id] || {}), 0);

  const seatCluster = (ids) => {
    const sorted = [...tState].sort((a, b) =>
      affinityScore(guestMap[ids[0]], b.seated, guestMap) -
      affinityScore(guestMap[ids[0]], a.seated, guestMap)
    );
    for (const t of sorted) {
      const used = seatedCount(t, guestMap);
      if (used + clusterSeats(ids) > t.capacity) continue;
      let ok = true;
      const combined = [...t.seated];
      for (const id of ids) {
        if (apartConflict(apartSet, id, combined)) { ok = false; break; }
        combined.push(id);
      }
      if (!ok) continue;
      ids.forEach(id => { t.seated.push(id); seating[id] = t.id; });
      return true;
    }
    return false;
  };

  [...clusters].sort((a, b) => b.length - a.length).forEach(cluster => {
    if (cluster.every(id => seating[id])) return;
    seatCluster(cluster);
  });

  const unseated = guests.filter(g => !seating[g.id]);
  unseated.sort((a, b) => (a.side + a.group).localeCompare(b.side + b.group));
  unseated.forEach(g => {
    let best = null, bestScore = -Infinity;
    for (const t of tState) {
      const used = seatedCount(t, guestMap);
      if (used + guestSeats(g) > t.capacity) continue;
      if (apartConflict(apartSet, g.id, t.seated)) continue;
      const score = affinityScore(g, t.seated, guestMap);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (best) { best.seated.push(g.id); seating[g.id] = best.id; }
  });

  return seating;
}

// ═══════════════════════════════════════════════════════════════
// VIOLATION ENGINE
// ═══════════════════════════════════════════════════════════════

function computeViolations(guests, tables, constraints, seating) {
  const violations = [];
  const guestMap   = Object.fromEntries(guests.map(g => [g.id, g]));
  const tableMap   = Object.fromEntries(tables.map(t => [t.id, t]));

  constraints.forEach(c => {
    const ga = guestMap[c.guestA];
    const gb = guestMap[c.guestB];
    if (!ga || !gb) return;
    const ta = seating[c.guestA];
    const tb = seating[c.guestB];

    if (c.type === "together") {
      if (ta && tb && ta !== tb)
        violations.push({ type:"together",
          text: ga.name + " ו" + gb.name + " צריכים לשבת יחד, אך שובצו לשולחנות שונים (" + (tableMap[ta]?.name || "?") + " ו" + (tableMap[tb]?.name || "?") + ")",
          tableA: tableMap[ta]?.name, tableB: tableMap[tb]?.name });
      if (ta && !tb)
        violations.push({ type:"together", text: ga.name + " ו" + gb.name + " צריכים לשבת יחד — " + gb.name + " עדיין לא שובץ" });
      if (!ta && tb)
        violations.push({ type:"together", text: ga.name + " ו" + gb.name + " צריכים לשבת יחד — " + ga.name + " עדיין לא שובץ" });
    }
    if (c.type === "apart") {
      if (ta && tb && ta === tb)
        violations.push({ type:"apart",
          text: ga.name + " ו" + gb.name + " לא יכולים לשבת יחד — שניהם שובצו ל" + (tableMap[ta]?.name || "אותו שולחן"),
          tableA: tableMap[ta]?.name });
    }
  });

  tables.forEach(t => {
    const seated = guests.filter(g => seating[g.id] === t.id);
    const count  = seated.reduce((s, g) => s + (g.count || 1), 0);
    if (count > t.capacity)
      violations.push({ type:"capacity",
        text: t.name + ": " + count + " מושבים על " + t.capacity + " מקומות (חריגה של " + (count - t.capacity) + ")" });
  });

  return violations;
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [events, setEvents]               = useState([]);
  const [activeEventId, setActiveEventId] = useState(null);
  const [screen, setScreen]               = useState("dashboard");
  const [toast, setToast]                 = useState(null);
  const toastTimer                        = useRef(null);

  useEffect(() => { const s = loadState(); setEvents(s.events || []); }, []);
  useEffect(() => { persist({ events }); }, [events]);

  const showToast = (msg, variant) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, variant: variant || "ok" });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const activeEvent = events.find(e => e.id === activeEventId) || null;

  const patchEvent = useCallback((patch) => {
    setEvents(prev => prev.map(e =>
      e.id === activeEventId
        ? (typeof patch === "function" ? patch(e) : Object.assign({}, e, patch))
        : e
    ));
  }, [activeEventId]);

  const go = (s, eventId) => {
    if (eventId !== undefined) setActiveEventId(eventId);
    setScreen(s);
    window.scrollTo(0, 0);
  };

  const createEvent = () => {
    const ev = {
      id: uid(), name: "", type: "חתונה", date: "", venue: "",
      brideName: "", groomName: "",
      tables: [], guests: [], seating: {}, constraints: [],
      createdAt: Date.now(),
    };
    setEvents(prev => [ev, ...prev]);
    go("setup", ev.id);
  };

  const deleteEvent = (id) => {
    if (!confirm("למחוק את האירוע לצמיתות? לא ניתן לשחזר.")) return;
    setEvents(prev => prev.filter(e => e.id !== id));
    if (activeEventId === id) { setActiveEventId(null); setScreen("dashboard"); }
    showToast("האירוע נמחק");
  };

  const sp = { activeEvent, patchEvent, go, showToast };

  return (
    <Shell screen={screen} activeEvent={activeEvent} go={go}>
      {screen === "dashboard"   && <Dashboard events={events} onCreateEvent={createEvent} onOpenEvent={id => go("setup", id)} onDeleteEvent={deleteEvent}/>}
      {screen === "setup"       && activeEvent && <EventSetup       {...sp}/>}
      {screen === "tables"      && activeEvent && <TableBuilder      {...sp}/>}
      {screen === "guests"      && activeEvent && <GuestManager      {...sp}/>}
      {screen === "constraints" && activeEvent && <ConstraintsScreen {...sp}/>}
      {screen === "seating"     && activeEvent && <SeatingScreen     {...sp}/>}
      {toast && <Toast msg={toast.msg} variant={toast.variant}/>}
    </Shell>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHELL
// FIX: subnav uses scrollable flex row with proper padding,
//      nav buttons don't overlap because they use whiteSpace:nowrap,
//      autoSave label only shown outside setup screen.
// ═══════════════════════════════════════════════════════════════

function Shell({ screen, activeEvent, go, children }) {
  const inEvent = !!activeEvent && screen !== "dashboard";

  const NAV = [
    { id:"setup",       label:"האירוע",  num:1 },
    { id:"tables",      label:"שולחנות", num:2 },
    { id:"guests",      label:"אורחים",  num:3 },
    { id:"constraints", label:"אילוצים", num:4 },
    { id:"seating",     label:"הושבה",   num:5 },
  ];

  const violationCount = useMemo(() => {
    if (!activeEvent) return 0;
    return computeViolations(
      activeEvent.guests, activeEvent.tables,
      activeEvent.constraints, activeEvent.seating
    ).length;
  }, [activeEvent]);

  const stepDone = (id) => {
    if (!activeEvent) return false;
    if (id === "setup")   return !!activeEvent.name;
    if (id === "tables")  return activeEvent.tables.length > 0;
    if (id === "guests")  return activeEvent.guests.length > 0;
    if (id === "seating") return Object.keys(activeEvent.seating).length > 0;
    return false;
  };

  const showAutoSave = inEvent && screen !== "setup";

  return (
    <div style={S.root}>
      <header style={S.topbar}>
        <button style={S.logo} onClick={() => go("dashboard")}>
          <span style={S.logoMark}>✦</span>
          <span style={S.logoName}>כוכב השולחן</span>
        </button>

        {inEvent && (
          <div style={S.breadcrumb}>
            <button style={S.bcBack} onClick={() => go("dashboard")}>← כל האירועים</button>
            <span style={S.bcSep}>/</span>
            <span style={S.bcCurrent}>
              {activeEvent.name || "אירוע חדש"}
            </span>
          </div>
        )}

        {showAutoSave && <span style={S.autoSave}>✓ נשמר</span>}
      </header>

      {inEvent && (
        <nav style={S.subnav}>
          <div style={S.subnavInner}>
            {NAV.map((n) => {
              const isActive = screen === n.id;
              const done     = stepDone(n.id);
              const showViol = n.id === "seating" && violationCount > 0;
              return (
                <button
                  key={n.id}
                  style={Object.assign({}, S.subnavBtn, isActive ? S.subnavActive : {})}
                  onClick={() => go(n.id)}
                >
                  <span style={Object.assign({}, S.stepDot,
                    done && !isActive ? S.stepDotDone : {},
                    isActive ? S.stepDotActive : {}
                  )}>
                    {done && !isActive ? "✓" : n.num}
                  </span>
                  <span style={S.subnavLabel}>{n.label}</span>
                  {n.id === "tables"      && activeEvent.tables.length > 0      && <NavBadge n={activeEvent.tables.length}/>}
                  {n.id === "guests"      && activeEvent.guests.length > 0      && <NavBadge n={activeEvent.guests.length}/>}
                  {n.id === "constraints" && activeEvent.constraints.length > 0 && <NavBadge n={activeEvent.constraints.length}/>}
                  {showViol && <NavBadge n={violationCount} color="var(--red)"/>}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main style={S.main}>{children}</main>
    </div>
  );
}

function NavBadge({ n, color }) {
  return (
    <span style={Object.assign({}, S.navBadge, color ? { background: color + "22", color } : {})}>
      {color ? ("⚠ " + n) : n}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 1 — DASHBOARD
// FIX: heroCompact now correctly switches layout without inheriting
//      broken textAlign; event cards are divs not buttons (buttons
//      can't contain buttons); delete and open are separate actions.
// ═══════════════════════════════════════════════════════════════

function Dashboard({ events, onCreateEvent, onOpenEvent, onDeleteEvent }) {
  const MONTHS = ["","ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  const fmtDate = d => {
    if (!d) return null;
    const parts = d.split("-");
    return Number(parts[2]) + " ב" + MONTHS[Number(parts[1])] + " " + parts[0];
  };

  const eventStatus = (ev) => {
    const seated = Object.keys(ev.seating || {}).length;
    const total  = ev.guests.length;
    const viols  = computeViolations(ev.guests, ev.tables, ev.constraints, ev.seating).length;
    if (total === 0)    return { label:"טרם נוספו אורחים",             color:"var(--muted)", pct:0 };
    if (seated === 0)   return { label:"ממתין לסידור הושבה",            color:"var(--warn)",  pct:0 };
    if (seated < total) return { label: seated + " מתוך " + total + " שובצו", color:"var(--accent)", pct: seated/total };
    if (viols > 0)      return { label:"הושבה מלאה — יש הפרות",         color:"var(--warn)",  pct:1 };
    return { label:"הושבה מלאה ✓", color:"var(--green)", pct:1 };
  };

  const hasEvents = events.length > 0;

  return (
    <div style={S.page}>
      {hasEvents ? (
        <div style={S.heroBar}>
          <div>
            <span style={S.logoMark}>✦</span>
            <span style={Object.assign({}, S.logoName, { marginRight:8, fontSize:20 })}>כוכב השולחן</span>
            <span style={S.heroBarSub}>ניהול הושבה לאירועים</span>
          </div>
          <button style={S.heroCta} onClick={onCreateEvent}>+ אירוע חדש</button>
        </div>
      ) : (
        <div style={S.hero}>
          <p style={S.heroEye}>ניהול הושבה חכם לאירועים</p>
          <h1 style={S.heroTitle}>כוכב השולחן</h1>
          <p style={S.heroSub}>הכלי המקצועי לסידור הושבה לחתונות ואירועים בישראל.</p>
          <button style={S.heroCta} onClick={onCreateEvent}>+ צור אירוע חדש</button>
        </div>
      )}

      {hasEvents && (
        <section>
          <h2 style={S.sectionHead}>האירועים שלי ({events.length})</h2>
          <div style={S.eventGrid}>
            {events.map(ev => {
              const st  = eventStatus(ev);
              const cap = ev.tables.reduce((s, t) => s + t.capacity, 0);
              return (
                <div key={ev.id} style={S.eventCard}>
                  <div style={S.eventCardTop}>
                    <span style={S.eventType}>{ev.type}</span>
                    <button
                      style={S.deleteBtn}
                      title="מחק אירוע"
                      onClick={() => onDeleteEvent(ev.id)}
                    >✕</button>
                  </div>

                  <div style={S.eventName}>
                    {ev.name || <span style={{ opacity:.4, fontStyle:"italic", fontWeight:400 }}>ללא שם</span>}
                  </div>

                  {(ev.date || ev.venue) && (
                    <div style={S.eventDate}>
                      {ev.date && <span>📅 {fmtDate(ev.date)}</span>}
                      {ev.date && ev.venue && <span style={{ opacity:.4 }}> · </span>}
                      {ev.venue && <span>📍 {ev.venue}</span>}
                    </div>
                  )}

                  {ev.guests.length > 0 && (
                    <div style={S.eventProgress}>
                      <div style={Object.assign({}, S.eventProgressFill, { width: (st.pct*100) + "%", background: st.color })}/>
                    </div>
                  )}

                  <div style={S.eventFooter}>
                    <span style={Object.assign({}, S.eventStatusLabel, { color: st.color })}>{st.label}</span>
                    <div style={S.eventChips}>
                      {ev.tables.length > 0 && <Chip icon="⬡" label={ev.tables.length + " שולחנות"}/>}
                      {cap > 0 && <Chip icon="💺" label={cap + " מקומות"}/>}
                      {ev.guests.length > 0 && <Chip icon="👥" label={ev.guests.length + " אורחים"}/>}
                    </div>
                  </div>

                  <button style={S.eventOpenBtn} onClick={() => onOpenEvent(ev.id)}>
                    פתח אירוע ←
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasEvents && (
        <div style={S.emptyHero}>
          <div style={S.emptyHeroIcon}>🎉</div>
          <h3 style={S.emptyHeroTitle}>ברוכים הבאים</h3>
          <p style={S.emptyHeroSub}>צור את האירוע הראשון שלך וסדר את ההושבה בקלות.</p>
          <button style={S.heroCta} onClick={onCreateEvent}>+ צור אירוע ראשון</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 2 — EVENT SETUP
// FIX: cardDirty uses borderRight (inline styles don't support
//      border-left in RTL — we use borderRight for the accent side).
//      Save button disabled state is stable.
// ═══════════════════════════════════════════════════════════════

function EventSetup({ activeEvent: ev, patchEvent, go, showToast }) {
  const [form, setForm] = useState({
    name: ev.name || "",
    type: ev.type || "חתונה",
    date: ev.date || "",
    venue: ev.venue || "",
    brideName: ev.brideName || "",
    groomName: ev.groomName || "",
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k, v) => {
    setForm(p => Object.assign({}, p, { [k]: v }));
    setDirty(true);
    setSaved(false);
  };

  const save = () => {
    if (!form.name.trim()) { showToast("יש להזין שם לאירוע", "err"); return; }
    patchEvent(form);
    setDirty(false);
    setSaved(true);
    showToast("פרטי האירוע נשמרו ✓");
  };

  const goNext = () => {
    if (dirty && form.name.trim()) patchEvent(form);
    go("tables");
  };

  const isWedding = form.type === "חתונה" || form.type === "אירוס";
  const isNew     = !ev.name;

  return (
    <div style={S.page}>
      <PageHeader
        title={isNew ? "אירוע חדש" : "פרטי האירוע"}
        icon="✦"
        sub="מלא את הפרטים הבסיסיים. תוכל לשנות בכל עת."
      />

      {dirty && (
        <Banner variant="warn">
          יש שינויים שלא נשמרו —
          <button style={Object.assign({}, S.btnSm, { marginRight:10, marginLeft:4 })} onClick={save}>שמור עכשיו</button>
        </Banner>
      )}
      {saved && !dirty && <Banner variant="ok">הפרטים נשמרו ✓</Banner>}

      <div style={Object.assign({}, S.card, dirty ? S.cardDirty : {})}>
        <SectionLabel>פרטי האירוע</SectionLabel>

        <div style={S.grid2}>
          <Field label="שם האירוע" required hint="ישמש לזיהוי לאורך כל המערכת">
            <input
              style={S.input}
              value={form.name}
              placeholder="לדוגמה: חתונת טל ונועה"
              autoFocus={isNew}
              onChange={e => set("name", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); }}
            />
          </Field>
          <Field label="סוג האירוע">
            <select style={S.select} value={form.type} onChange={e => set("type", e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="תאריך האירוע">
            <input style={S.input} type="date" value={form.date} onChange={e => set("date", e.target.value)}/>
          </Field>
          <Field label="שם האולם">
            <input
              style={S.input}
              value={form.venue}
              placeholder="לדוגמה: אולמי גן עדן, תל אביב"
              onChange={e => set("venue", e.target.value)}
            />
          </Field>
        </div>

        {isWedding && (
          <>
            <Divider label="שמות בני הזוג"/>
            <p style={Object.assign({}, S.fieldHint, { marginBottom:12 })}>
              ישמשו לתיוג אורחים ("צד כלה" / "צד חתן") לאורך כל המערכת.
            </p>
            <div style={S.grid2}>
              <Field label="שם הכלה">
                <input style={S.input} value={form.brideName} placeholder="שם הכלה" onChange={e => set("brideName", e.target.value)}/>
              </Field>
              <Field label="שם החתן">
                <input style={S.input} value={form.groomName} placeholder="שם החתן" onChange={e => set("groomName", e.target.value)}/>
              </Field>
            </div>
          </>
        )}

        <div style={S.formActions}>
          <button style={S.btnPrimary} onClick={save}>
            {dirty ? "שמור שינויים" : (saved ? "נשמר ✓" : "שמור פרטים")}
          </button>
          {saved && !dirty && (
            <span style={Object.assign({}, S.fieldHint, { color:"var(--green)" })}>עודכן בהצלחה</span>
          )}
        </div>
      </div>

      <NextStep
        label="המשך להגדרת שולחנות"
        hint={ev.tables.length > 0 ? (ev.tables.length + " שולחנות מוגדרים") : "עדיין לא הוגדרו שולחנות"}
        onClick={goNext}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 3 — TABLE BUILDER
// FIX: grid4 responsive — collapses to 2 columns on narrow screens
//      via a wrapping flex layout instead of rigid CSS grid.
//      cSeat cell no longer uses flexDirection:column (broke row height).
//      Table row columns are wider to avoid truncation.
// ═══════════════════════════════════════════════════════════════

function TableBuilder({ activeEvent: ev, patchEvent, go, showToast }) {
  const [batch, setBatch]       = useState({ prefix:"", capacity:"10", count:"1", type:"regular" });
  const [editId, setEditId]     = useState(null);
  const [editVals, setEditVals] = useState({});

  const totalCap    = ev.tables.reduce((s, t) => s + t.capacity, 0);
  const totalSeated = Object.keys(ev.seating).length;
  const gap         = totalCap - ev.guests.length;
  const batchCnt    = Math.max(1, parseInt(batch.count) || 0);
  const batchCap    = Math.max(1, parseInt(batch.capacity) || 0);
  const batchTotal  = batchCnt * batchCap;
  const nextIdx     = ev.tables.length + 1;
  const previewPrefix = batch.prefix.trim() || "שולחן";

  const previewNames = Array.from({ length: Math.min(batchCnt, 3) }, (_, i) =>
    previewPrefix + " " + (nextIdx + i)
  ).join(", ");

  const addBatch = () => {
    const cap = parseInt(batch.capacity);
    const cnt = parseInt(batch.count);
    if (!cap || cap < 1) { showToast("יש להזין מספר מקומות תקני", "err"); return; }
    if (!cnt || cnt < 1) { showToast("יש להזין כמות שולחנות תקנית", "err"); return; }
    const rows = Array.from({ length: cnt }, (_, i) => ({
      id:       uid(),
      name:     previewPrefix + " " + (ev.tables.length + i + 1),
      capacity: cap,
      type:     batch.type,
    }));
    patchEvent(e => Object.assign({}, e, { tables: e.tables.concat(rows) }));
    showToast("נוספו " + (cnt === 1 ? "שולחן אחד" : cnt + " שולחנות") + " (" + batchTotal + " מקומות) ✓");
    setBatch(p => Object.assign({}, p, { prefix:"", count:"1" }));
  };

  const startEdit  = t  => { setEditId(t.id); setEditVals({ name:t.name, capacity:String(t.capacity), type:t.type }); };
  const cancelEdit = () => setEditId(null);
  const saveEdit   = () => {
    const cap = parseInt(editVals.capacity);
    if (!editVals.name.trim()) { showToast("שם השולחן לא יכול להיות ריק", "err"); return; }
    if (!cap || cap < 1)       { showToast("קיבולת לא תקנית", "err"); return; }
    patchEvent(e => Object.assign({}, e, {
      tables: e.tables.map(t => t.id === editId
        ? Object.assign({}, t, { name:editVals.name.trim(), capacity:cap, type:editVals.type })
        : t
      )
    }));
    setEditId(null);
    showToast("השולחן עודכן ✓");
  };

  const delTable = id => {
    const t   = ev.tables.find(t => t.id === id);
    const cnt = ev.guests.filter(g => ev.seating[g.id] === id).length;
    const msg = cnt > 0
      ? "לשולחן \"" + (t ? t.name : "") + "\" משובצים " + cnt + " אורחים — יחזרו לרשימה. למחוק?"
      : "למחוק את \"" + (t ? t.name : "") + "\"?";
    if (!confirm(msg)) return;
    patchEvent(e => Object.assign({}, e, {
      tables:  e.tables.filter(t => t.id !== id),
      seating: Object.fromEntries(Object.entries(e.seating).filter(([, tid]) => tid !== id)),
    }));
    showToast("השולחן נמחק");
  };

  return (
    <div style={S.page}>
      <PageHeader
        title="שולחנות"
        icon="⬡"
        sub="הגדר את השולחנות באולם לפי מבנה האירוע."
        aside={
          <div style={S.pills}>
            <StatPill n={ev.tables.length} label="שולחנות"/>
            <StatPill n={totalCap} label="מקומות" color={gap < 0 ? "var(--red)" : undefined}/>
          </div>
        }
      />

      {gap < 0 && ev.guests.length > 0 && (
        <Banner variant="warn">
          חסרים {Math.abs(gap)} מקומות — יש יותר אורחים ממקומות פנויים.
        </Banner>
      )}
      {gap > 0 && ev.tables.length > 0 && ev.guests.length > 0 && (
        <Banner variant="ok">{gap} מקומות פנויים מעבר למספר האורחים.</Banner>
      )}

      <div style={S.card}>
        <SectionLabel>הוספת שולחנות</SectionLabel>
        <div style={S.batchGrid}>
          <Field label="שם / קידומת" hint="לדוגמה: שולחן, אביר">
            <input
              style={S.input}
              value={batch.prefix}
              placeholder="שולחן"
              onChange={e => setBatch(p => Object.assign({}, p, { prefix:e.target.value }))}
            />
          </Field>
          <Field label="מקומות לשולחן">
            <input style={S.input} type="number" min="1" max="100" value={batch.capacity}
              onChange={e => setBatch(p => Object.assign({}, p, { capacity:e.target.value }))}/>
          </Field>
          <Field label="כמות שולחנות">
            <input style={S.input} type="number" min="1" max="200" value={batch.count}
              onChange={e => setBatch(p => Object.assign({}, p, { count:e.target.value }))}/>
          </Field>
          <Field label="סוג">
            <select style={S.select} value={batch.type} onChange={e => setBatch(p => Object.assign({}, p, { type:e.target.value }))}>
              {TABLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        {batchTotal > 0 && (
          <div style={S.batchPreview}>
            <span style={{ color:"var(--accent)", flexShrink:0 }}>⬡</span>
            <span>
              {batchCnt === 1
                ? ("יתווסף שולחן אחד: " + previewNames + " (" + batchCap + " מקומות)")
                : ("יתווספו " + batchCnt + " שולחנות: " + previewNames + (batchCnt > 3 ? "..." : "") + " (" + batchCap + " מקומות כ\"א)")}
              {" · סה\"כ לאחר ההוספה: "}
              <strong>{totalCap + batchTotal} מקומות</strong>
            </span>
          </div>
        )}

        <div style={S.formActions}>
          <button style={S.btnPrimary} onClick={addBatch}>
            + הוסף {batchCnt > 1 ? (batchCnt + " שולחנות") : "שולחן"}
          </button>
        </div>
      </div>

      {ev.tables.length > 0 && (
        <div style={S.card}>
          <SectionLabel>
            השולחנות שלי ({ev.tables.length})
            {totalCap > 0 && <span style={S.sectionLabelSub}> · {totalCap} מקומות · {totalSeated} מושבצים</span>}
          </SectionLabel>
          <div style={S.tableGrid}>
            <div style={Object.assign({}, S.tRow, S.tHead)}>
              <span>שם השולחן</span>
              <span style={{ textAlign:"center" }}>מקומות</span>
              <span style={{ textAlign:"center" }}>סוג</span>
              <span style={{ textAlign:"center" }}>מושבצים</span>
              <span/>
            </div>
            {ev.tables.map(t => {
              const seated = ev.guests.filter(g => ev.seating[g.id] === t.id).length;
              const isEdit = editId === t.id;
              const isOver = seated > t.capacity;
              const pct    = t.capacity > 0 ? seated / t.capacity : 0;
              return (
                <div key={t.id} style={Object.assign({}, S.tRow, isEdit ? S.tRowEdit : {})}>
                  {isEdit ? (
                    <>
                      <input
                        style={S.input}
                        value={editVals.name}
                        autoFocus
                        onChange={e => setEditVals(p => Object.assign({}, p, { name:e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      <input
                        style={Object.assign({}, S.input, { textAlign:"center" })}
                        type="number" min="1"
                        value={editVals.capacity}
                        onChange={e => setEditVals(p => Object.assign({}, p, { capacity:e.target.value }))}
                      />
                      <select
                        style={S.select}
                        value={editVals.type}
                        onChange={e => setEditVals(p => Object.assign({}, p, { type:e.target.value }))}
                      >
                        {TABLE_TYPES.map(tp => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                      </select>
                      <span/>
                      <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                        <button style={S.btnSm} onClick={saveEdit}>שמור</button>
                        <button style={Object.assign({}, S.btnSm, S.btnGhost)} onClick={cancelEdit}>ביטול</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight:600, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</span>
                      <span style={{ textAlign:"center" }}>{t.capacity}</span>
                      <span style={{ textAlign:"center" }}><TypeTag type={t.type}/></span>
                      <span style={{ textAlign:"center", fontWeight: seated > 0 ? 700 : 400,
                        color: isOver ? "var(--red)" : pct > .85 ? "var(--warn)" : seated > 0 ? "var(--green)" : "var(--muted)"
                      }}>
                        {seated}/{t.capacity}
                      </span>
                      <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                        <button style={Object.assign({}, S.btnSm, S.btnGhost)} onClick={() => startEdit(t)}>עריכה</button>
                        <button style={Object.assign({}, S.btnSm, S.btnDanger)} onClick={() => delTable(t.id)}>מחק</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ev.tables.length === 0 && (
        <EmptyState icon="⬡" title="אין שולחנות עדיין"
          text="הגדר שולחנות לפי מבנה האולם. תוכל להוסיף כמה שולחנות מאותו סוג בבת אחת."/>
      )}

      <NextStep
        label="המשך לרשימת האורחים"
        hint={ev.guests.length > 0 ? (ev.guests.length + " אורחים רשומים") : "עדיין לא נוספו אורחים"}
        onClick={() => go("guests")}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 4 — GUEST MANAGER
// FIX: pageHead pills don't overflow — they wrap naturally.
//      gRow flex layout handles long names without overflow.
//      filterBar wraps cleanly on narrow screens.
// ═══════════════════════════════════════════════════════════════

function GuestManager({ activeEvent: ev, patchEvent, go, showToast }) {
  const EF = { name:"", side:"bride", group:"משפחה קרובה", count:1, phone:"", notes:"" };
  const [form, setForm]       = useState(EF);
  const [editId, setEditId]   = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [filter, setFilter]   = useState({ side:"all", group:"all", search:"" });
  const nameRef               = useRef(null);
  const setF = (k, v) => setForm(p => Object.assign({}, p, { [k]:v }));

  useEffect(() => { if (!editId) nameRef.current && nameRef.current.focus(); }, []);

  const sideLabel = s =>
    s === "bride"
      ? (ev.brideName ? "צד " + ev.brideName : "צד כלה")
      : (ev.groomName ? "צד " + ev.groomName : "צד חתן");

  const saveGuest = () => {
    if (!form.name.trim()) { showToast("יש להזין שם אורח", "err"); return; }
    if (editId) {
      patchEvent(e => Object.assign({}, e, {
        guests: e.guests.map(g =>
          g.id === editId ? Object.assign({}, g, form, { name:form.name.trim() }) : g
        )
      }));
      setEditId(null);
      showToast("פרטי האורח עודכנו ✓");
    } else {
      const newG = Object.assign({}, form, { id:uid(), name:form.name.trim(), count: form.count||1 });
      patchEvent(e => Object.assign({}, e, { guests: e.guests.concat([newG]) }));
      showToast(form.name.trim() + " נוסף/ה לרשימה ✓");
    }
    setForm(p => Object.assign({}, EF, { side:p.side, group:p.group }));
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(EF);
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const delGuest = (id, name) => {
    if (!confirm("למחוק את \"" + name + "\" מרשימת האורחים?")) return;
    patchEvent(e => Object.assign({}, e, {
      guests:  e.guests.filter(g => g.id !== id),
      seating: Object.fromEntries(Object.entries(e.seating).filter(([gid]) => gid !== id)),
    }));
    showToast(name + " הוסר/ה");
  };

  // importBulk replaced by ExcelImportFlow component

  const visible = ev.guests.filter(g => {
    if (filter.side !== "all" && g.side !== filter.side) return false;
    if (filter.group !== "all" && g.group !== filter.group) return false;
    if (filter.search && !g.name.includes(filter.search)) return false;
    return true;
  });

  const groups     = Array.from(new Set(ev.guests.map(g => g.group))).sort();
  const nBride     = ev.guests.filter(g => g.side === "bride").length;
  const nGroom     = ev.guests.filter(g => g.side === "groom").length;
  const nSeated    = ev.guests.filter(g => ev.seating[g.id]).length;
  const nUnseated  = ev.guests.length - nSeated;
  const tableOf    = id => { const tid = ev.seating[id]; return tid ? ev.tables.find(t => t.id === tid) : null; };
  const isFiltered = filter.side !== "all" || filter.group !== "all" || filter.search;

  return (
    <div style={S.page}>
      <PageHeader
        title="אורחים"
        icon="👥"
        sub="נהל את רשימת האורחים. לחץ Enter להוספה מהירה."
        aside={
          <div style={S.pills}>
            <StatPill n={ev.guests.length} label="סה״כ"/>
            <StatPill n={nBride} label={sideLabel("bride")} color="var(--bride)"/>
            <StatPill n={nGroom} label={sideLabel("groom")} color="var(--groom)"/>
            {nSeated > 0 && <StatPill n={nSeated} label="משובצים" color="var(--green)"/>}
            {nUnseated > 0 && nSeated > 0 && <StatPill n={nUnseated} label="ממתינים" color="var(--warn)"/>}
          </div>
        }
      />

      <div style={Object.assign({}, S.card, editId ? S.cardEdit : {})}>
        <SectionLabel>
          {editId
            ? ("✏ עריכת אורח — " + (ev.guests.find(g => g.id === editId) || {}).name)
            : "הוספת אורח"}
        </SectionLabel>

        <div style={S.grid2}>
          <Field label="שם מלא" required>
            <input
              ref={nameRef}
              style={S.input}
              value={form.name}
              placeholder="שם ושם משפחה"
              onChange={e => setF("name", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveGuest(); }}
            />
          </Field>
          <Field label="טלפון" hint="אופציונלי">
            <input style={S.input} value={form.phone} placeholder="050-0000000"
              onChange={e => setF("phone", e.target.value)}/>
          </Field>
          <Field label="מס׳ מוזמנים" hint="כמה מקומות תופסת הרשומה הזו">
            <input style={S.input} type="number" min="1" max="50" value={form.count || 1}
              onChange={e => setF("count", Math.max(1, parseInt(e.target.value)||1))}/>
          </Field>
        </div>

        <div style={S.grid2}>
          <Field label="צד" hint="מי מזמין את האורח">
            <div style={S.seg}>
              {["bride", "groom"].map(s => (
                <button
                  key={s}
                  style={Object.assign({}, S.segBtn,
                    form.side === s ? (s === "bride" ? S.segBride : S.segGroom) : {}
                  )}
                  onClick={() => setF("side", s)}
                >
                  {sideLabel(s)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="קבוצה" hint="ישפיע על הסידור האוטומטי">
            <select style={S.select} value={form.group} onChange={e => setF("group", e.target.value)}>
              {GROUP_OPTIONS.map(g => <option key={g}>{g}</option>)}
            </select>
          </Field>
        </div>

        <Field label="הערות">
          <input
            style={S.input}
            value={form.notes}
            placeholder="הגבלות תזונה, מוגבלות, הערה כלשהי..."
            onChange={e => setF("notes", e.target.value)}
          />
        </Field>

        <div style={S.formActions}>
          <button style={S.btnPrimary} onClick={saveGuest}>
            {editId ? "שמור שינויים" : "+ הוסף אורח"}
          </button>
          {editId && <button style={S.btnSecondary} onClick={cancelEdit}>ביטול</button>}
          {!editId && (
            <button style={S.btnSecondary} onClick={() => setShowBulk(p => !p)}>
              {showBulk ? "סגור ייבוא" : "📥 ייבוא מ-Excel"}
            </button>
          )}
          {!editId && <span style={S.fieldHint}>Enter = הוסף מהיר</span>}
        </div>

        {showBulk && (
          <ExcelImportFlow
            ev={ev}
            patchEvent={patchEvent}
            showToast={showToast}
            onClose={() => setShowBulk(false)}
          />
        )}
      </div>

      {ev.guests.length > 0 && (
        <div style={S.filterBar}>
          <input
            style={Object.assign({}, S.input, { flex:1, minWidth:120 })}
            value={filter.search}
            placeholder="🔍 חיפוש לפי שם..."
            onChange={e => setFilter(p => Object.assign({}, p, { search:e.target.value }))}
          />
          <select style={Object.assign({}, S.select, { minWidth:130 })} value={filter.side}
            onChange={e => setFilter(p => Object.assign({}, p, { side:e.target.value }))}>
            <option value="all">כל הצדדים</option>
            <option value="bride">{sideLabel("bride")}</option>
            <option value="groom">{sideLabel("groom")}</option>
          </select>
          <select style={Object.assign({}, S.select, { minWidth:140 })} value={filter.group}
            onChange={e => setFilter(p => Object.assign({}, p, { group:e.target.value }))}>
            <option value="all">כל הקבוצות</option>
            {groups.map(g => <option key={g}>{g}</option>)}
          </select>
          {isFiltered ? (
            <>
              <span style={S.filterCount}>{visible.length}/{ev.guests.length}</span>
              <button style={Object.assign({}, S.btnSm, S.btnGhost)}
                onClick={() => setFilter({ side:"all", group:"all", search:"" })}>
                נקה ✕
              </button>
            </>
          ) : (
            <span style={S.filterCount}>{ev.guests.length} אורחים</span>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div style={S.gList}>
          {visible.map(g => {
            const t = tableOf(g.id);
            const isEditing = editId === g.id;
            return (
              <div key={g.id} style={Object.assign({}, S.gRow, isEditing ? S.gRowActive : {})}>
                <SideDot side={g.side}/>
                <div style={S.gInfo}>
                  <span style={S.gName}>
                    {g.name}
                    {(g.count||1) > 1 && <span style={S.gCountBadge}>+{(g.count||1)-1}</span>}
                  </span>
                  <span style={S.gMeta}>
                    {sideLabel(g.side)} · {g.group}
                    {(g.count||1) > 1 ? " · " + (g.count) + " מקומות" : ""}
                    {g.phone ? " · " + g.phone : ""}
                    {g.notes ? " · " + g.notes : ""}
                  </span>
                </div>
                {t
                  ? <span style={S.tagSeated}>⬡ {t.name}</span>
                  : <span style={S.tagUnseated}>לא שובץ</span>
                }
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button style={Object.assign({}, S.btnSm, S.btnGhost)}
                    onClick={() => {
                      setForm({ name:g.name, side:g.side, group:g.group, phone:g.phone||"", notes:g.notes||"" });
                      setEditId(g.id);
                      window.scrollTo(0, 0);
                    }}>
                    עריכה
                  </button>
                  <button style={Object.assign({}, S.btnSm, S.btnDanger)} onClick={() => delGuest(g.id, g.name)}>
                    מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ev.guests.length === 0 && (
        <EmptyState icon="👥" title="אין אורחים עדיין"
          text="מלא את הטופס למעלה, או השתמש בייבוא מרשימה להוספה מהירה."/>
      )}
      {visible.length === 0 && ev.guests.length > 0 && (
        <EmptyState icon="🔍" title="לא נמצאו תוצאות"
          text="שנה את הסינון או נקה אותו כדי לראות את כל האורחים."/>
      )}

      <NextStep
        label="המשך להגדרת אילוצים"
        hint={ev.constraints.length > 0
          ? (ev.constraints.length + " אילוצים מוגדרים")
          : "אופציונלי — הגדר מי חייב / לא יכול לשבת יחד"}
        onClick={() => go("constraints")}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 5 — CONSTRAINTS
// FIX: constraint row layout is stable — no margin:auto hacks.
//      Preview card uses clean flex layout.
//      Guest selectors maintain full width on mobile.
// ═══════════════════════════════════════════════════════════════

function ConstraintsScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [formA, setFormA]       = useState("");
  const [formB, setFormB]       = useState("");
  const [formType, setFormType] = useState("together");

  const sorted    = ev.guests.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sideLabel = s => s === "bride"
    ? (ev.brideName ? "צד " + ev.brideName : "צד כלה")
    : (ev.groomName ? "צד " + ev.groomName : "צד חתן");
  const gMap      = Object.fromEntries(ev.guests.map(g => [g.id, g]));

  const addConstraint = () => {
    if (!formA || !formB) { showToast("יש לבחור שני אורחים", "err"); return; }
    if (formA === formB)  { showToast("לא ניתן לבחור את אותו אורח פעמיים", "err"); return; }
    const dup = ev.constraints.some(c =>
      c.type === formType &&
      ((c.guestA === formA && c.guestB === formB) || (c.guestA === formB && c.guestB === formA))
    );
    if (dup) { showToast("אילוץ זה כבר קיים ברשימה", "err"); return; }
    const contra = ev.constraints.some(c =>
      c.type !== formType &&
      ((c.guestA === formA && c.guestB === formB) || (c.guestA === formB && c.guestB === formA))
    );
    if (contra) showToast("⚠ שים לב: קיים אילוץ הפוך לאותה זוג — נוסף בכל זאת", "err");
    patchEvent(e => Object.assign({}, e, {
      constraints: e.constraints.concat([{ id:uid(), type:formType, guestA:formA, guestB:formB }])
    }));
    setFormA(""); setFormB("");
    showToast("האילוץ נוסף ✓");
  };

  const delConstraint = (id, nameA, nameB, type) => {
    const label = type === "together"
      ? "להסיר את האילוץ \"יחד\" בין " + nameA + " ל" + nameB + "?"
      : "להסיר את האילוץ \"בנפרד\" בין " + nameA + " ל" + nameB + "?";
    if (!confirm(label)) return;
    patchEvent(e => Object.assign({}, e, { constraints: e.constraints.filter(c => c.id !== id) }));
    showToast("האילוץ הוסר");
  };

  const stale    = ev.constraints.filter(c => !gMap[c.guestA] || !gMap[c.guestB]);
  const together = ev.constraints.filter(c => c.type === "together" && gMap[c.guestA] && gMap[c.guestB]);
  const apart    = ev.constraints.filter(c => c.type === "apart"    && gMap[c.guestA] && gMap[c.guestB]);
  const previewReady = formA && formB && formA !== formB && gMap[formA] && gMap[formB];

  const GuestSelect = ({ value, onChange, exclude }) => (
    <select style={Object.assign({}, S.select, { flex:1 })} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— בחר אורח —</option>
      {sorted.filter(g => g.id !== exclude).map(g => (
        <option key={g.id} value={g.id}>{g.name} ({sideLabel(g.side)})</option>
      ))}
    </select>
  );

  return (
    <div style={S.page}>
      <PageHeader
        title="אילוצים"
        icon="⚖"
        sub="הגדר מי חייב לשבת יחד ומי לא יכול — המערכת תכבד זאת בסידור האוטומטי."
        aside={
          <div style={S.pills}>
            <StatPill n={together.length} label="יחד"   color={together.length > 0 ? "var(--green)" : undefined}/>
            <StatPill n={apart.length}    label="בנפרד" color={apart.length > 0 ? "var(--red)" : undefined}/>
          </div>
        }
      />

      {ev.guests.length < 2 && (
        <Banner variant="warn">
          יש להוסיף לפחות שני אורחים לפני הגדרת אילוצים.
          <button style={Object.assign({}, S.btnSm, { marginRight:8 })} onClick={() => go("guests")}>עבור לאורחים</button>
        </Banner>
      )}

      {stale.length > 0 && (
        <Banner variant="warn">
          {stale.length === 1 ? "אילוץ אחד מפנה" : (stale.length + " אילוצים מפנים")} לאורחים שנמחקו.
          <button
            style={Object.assign({}, S.btnSm, S.btnDanger, { marginRight:8 })}
            onClick={() => patchEvent(e => Object.assign({}, e, {
              constraints: e.constraints.filter(c => gMap[c.guestA] && gMap[c.guestB])
            }))}
          >
            נקה אוטומטית
          </button>
        </Banner>
      )}

      <div style={S.card}>
        <SectionLabel>הוספת אילוץ חדש</SectionLabel>

        <Field label="סוג האילוץ">
          <div style={S.seg}>
            <button
              style={Object.assign({}, S.segBtn, formType === "together" ? S.segTog : {})}
              onClick={() => setFormType("together")}
            >
              🤝 חייבים לשבת יחד
            </button>
            <button
              style={Object.assign({}, S.segBtn, formType === "apart" ? S.segApart : {})}
              onClick={() => setFormType("apart")}
            >
              ⛔ לא יכולים לשבת יחד
            </button>
          </div>
        </Field>

        <div style={S.constraintFormRow}>
          <div style={{ flex:1, minWidth:150 }}>
            <Field label="אורח א׳"><GuestSelect value={formA} onChange={setFormA} exclude={formB}/></Field>
          </div>
          <div style={S.constraintVerb}>
            {formType === "together" ? "יחד עם" : "בנפרד מ-"}
          </div>
          <div style={{ flex:1, minWidth:150 }}>
            <Field label="אורח ב׳"><GuestSelect value={formB} onChange={setFormB} exclude={formA}/></Field>
          </div>
          <button style={Object.assign({}, S.btnPrimary, { alignSelf:"flex-end", flexShrink:0 })} onClick={addConstraint}>
            הוסף
          </button>
        </div>

        {previewReady && (
          <div style={Object.assign({}, S.constraintPreview,
            formType === "together" ? S.constraintPreviewTog : S.constraintPreviewApart
          )}>
            <span style={{ fontSize:22, flexShrink:0 }}>
              {formType === "together" ? "🤝" : "⛔"}
            </span>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>
                {gMap[formA].name}
                <span style={{ fontWeight:400, margin:"0 8px", opacity:.7 }}>
                  {formType === "together" ? "יישב/ת יחד עם" : "לא יישב/ת עם"}
                </span>
                {gMap[formB].name}
              </div>
              <div style={{ fontSize:12, opacity:.7, marginTop:3 }}>
                {sideLabel(gMap[formA].side)} · {gMap[formA].group}
                {"  ·  "}
                {sideLabel(gMap[formB].side)} · {gMap[formB].group}
              </div>
            </div>
          </div>
        )}
      </div>

      {together.length > 0 && (
        <div style={Object.assign({}, S.card, { borderColor:"var(--green-border)" })}>
          <SectionLabel>🤝 חייבים לשבת יחד — {together.length}</SectionLabel>
          <div style={S.cList}>
            {together.map(c => {
              const ga = gMap[c.guestA], gb = gMap[c.guestB];
              return (
                <div key={c.id} style={S.cRow}>
                  <div style={S.cRowMain}>
                    <SideDot side={ga.side}/>
                    <span style={S.cstName}>{ga.name}</span>
                    <span style={S.cstVerb}>יחד עם</span>
                    <SideDot side={gb.side}/>
                    <span style={S.cstName}>{gb.name}</span>
                  </div>
                  <button
                    style={Object.assign({}, S.btnSm, S.btnDanger)}
                    onClick={() => delConstraint(c.id, ga.name, gb.name, c.type)}
                  >
                    הסר
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {apart.length > 0 && (
        <div style={Object.assign({}, S.card, { borderColor:"var(--red-border)" })}>
          <SectionLabel>⛔ לא יכולים לשבת יחד — {apart.length}</SectionLabel>
          <div style={S.cList}>
            {apart.map(c => {
              const ga = gMap[c.guestA], gb = gMap[c.guestB];
              return (
                <div key={c.id} style={S.cRow}>
                  <div style={S.cRowMain}>
                    <SideDot side={ga.side}/>
                    <span style={S.cstName}>{ga.name}</span>
                    <span style={Object.assign({}, S.cstVerb, { color:"var(--red)" })}>בנפרד מ-</span>
                    <SideDot side={gb.side}/>
                    <span style={S.cstName}>{gb.name}</span>
                  </div>
                  <button
                    style={Object.assign({}, S.btnSm, S.btnDanger)}
                    onClick={() => delConstraint(c.id, ga.name, gb.name, c.type)}
                  >
                    הסר
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ev.constraints.length === 0 && (
        <EmptyState icon="⚖" title="אין אילוצים"
          text="ניתן להמשיך ללא אילוצים — המערכת תנסה לקבץ אורחים לפי קבוצות וצדדים."/>
      )}

      <NextStep label="המשך לסידור הושבה" hint="שבץ את כל האורחים לשולחנות" onClick={() => go("seating")}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 6 — SEATING
// FIX: unassignedCard border — use borderLeft instead of borderRight
//      (in RTL "right" is the logical start, left is end — but we
//      want the accent on the visual left edge so we use borderLeft).
//      Table cards grid uses minmax correctly so they don't over-shrink.
// ═══════════════════════════════════════════════════════════════

function SeatingScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [expandedTable, setExpandedTable] = useState(null);

  const violations = useMemo(() =>
    computeViolations(ev.guests, ev.tables, ev.constraints, ev.seating),
    [ev.guests, ev.tables, ev.constraints, ev.seating]
  );

  const unassigned     = ev.guests.filter(g => !ev.seating[g.id]);
  const nAssigned      = ev.guests.filter(g => ev.seating[g.id]).length;
  const nAssignedSeats = ev.guests.filter(g=>ev.seating[g.id]).reduce((s,g)=>s+(g.count||1),0);
  const totalSeats     = ev.guests.reduce((s,g)=>s+(g.count||1),0);
  const totalCap       = ev.tables.reduce((s, t) => s + t.capacity, 0);
  const allSeated      = nAssigned === ev.guests.length && ev.guests.length > 0;
  const noProblems = violations.length === 0;
  const noTables   = ev.tables.length === 0;
  const noGuests   = ev.guests.length === 0;

  const sideLabel   = s => s === "bride" ? (ev.brideName ? "צד " + ev.brideName : "צד כלה") : (ev.groomName ? "צד " + ev.groomName : "צד חתן");
  const tableGuests = tid => ev.guests.filter(g => ev.seating[g.id] === tid);
  const tableSeatedCount = tid => tableGuests(tid).reduce((s,g) => s+(g.count||1), 0);
  const totalGuestCount = ev.guests.reduce((s,g) => s+(g.count||1), 0);
  const totalAssignedCount = ev.guests.filter(g=>ev.seating[g.id]).reduce((s,g) => s+(g.count||1), 0);

  const violatedTables = new Set(
    violations.flatMap(v => [v.tableA, v.tableB]).filter(Boolean)
  );

  const runAuto = () => {
    if (noTables) { showToast("יש להגדיר שולחנות תחילה", "err"); return; }
    if (noGuests) { showToast("יש להוסיף אורחים תחילה", "err"); return; }
    const newSeating = autoAssign(ev.guests, ev.tables, ev.constraints);
    patchEvent(e => Object.assign({}, e, { seating: newSeating }));
    const placed = Object.keys(newSeating).length;
    const missed = ev.guests.length - placed;
    if (missed > 0)
      showToast("שובצו " + placed + " אורחים. " + missed + " לא נכנסו — הוסף מקומות נוספים", "err");
    else
      showToast("כל " + placed + " האורחים שובצו ✓");
    setExpandedTable(null);
  };

  const clearAll = () => {
    if (!confirm("לנקות את כל שיבוצי ההושבה?\n" + nAssigned + " אורחים יחזרו לרשימת הממתינים.")) return;
    patchEvent(e => Object.assign({}, e, { seating: {} }));
    showToast("כל השיבוצים נוקו");
    setExpandedTable(null);
  };

  const assignGuest = (guestId, tableId) => {
    patchEvent(e => {
      const s = Object.assign({}, e.seating);
      if (!tableId) delete s[guestId];
      else s[guestId] = tableId;
      return Object.assign({}, e, { seating: s });
    });
  };

  return (
    <div style={S.page}>
      <PageHeader
        title="סידור הושבה"
        icon="🪑"
        sub="חשב הושבה אוטומטית ואז ערוך ידנית לפי הצורך."
        aside={
          <div style={S.pills}>
            <StatPill n={nAssigned}         label="שובצו"   color={allSeated ? "var(--green)" : "var(--accent)"}/>
            <StatPill n={unassigned.length} label="ממתינים" color={unassigned.length > 0 ? "var(--warn)" : undefined}/>
            <StatPill n={violations.length} label="הפרות"   color={violations.length > 0 ? "var(--red)" : undefined}/>
          </div>
        }
      />

      {noTables && (
        <Banner variant="warn">
          יש להגדיר שולחנות לפני סידור ההושבה.
          <button style={Object.assign({}, S.btnSm, { marginRight:8 })} onClick={() => go("tables")}>עבור לשולחנות</button>
        </Banner>
      )}
      {noGuests && (
        <Banner variant="warn">
          יש להוסיף אורחים לפני סידור ההושבה.
          <button style={Object.assign({}, S.btnSm, { marginRight:8 })} onClick={() => go("guests")}>עבור לאורחים</button>
        </Banner>
      )}

      <div style={S.actionBar}>
        <button
          style={Object.assign({}, S.btnPrimary, noTables || noGuests ? { opacity:.45, cursor:"not-allowed" } : {})}
          onClick={runAuto}
          disabled={noTables || noGuests}
        >
          ✦ חשב הושבה אוטומטית
        </button>
        {nAssigned > 0 && (
          <button style={Object.assign({}, S.btnSecondary, { color:"var(--red)", borderColor:"var(--red-border)" })} onClick={clearAll}>
            נקה הכל
          </button>
        )}
        <span style={S.fieldHint}>
          {nAssignedSeats} / {totalSeats} מקומות שובצו ({nAssigned}/{ev.guests.length} רשומות) · {totalCap} כסאות באולם
        </span>
      </div>

      {allSeated && noProblems && (
        <div style={S.successCard}>
          <div style={S.successIconWrap}>✓</div>
          <div>
            <div style={S.successTitle}>הושבה מלאה וללא הפרות 🎉</div>
            <div style={S.successSub}>
              כל {ev.guests.length} האורחים שובצו בהצלחה ל{ev.tables.length} שולחנות.
            </div>
          </div>
        </div>
      )}

      {violations.length > 0 && (
        <div style={S.violCard}>
          <div style={S.violHeader}>
            <span style={S.violTitle}>
              ⚠ {violations.length} {violations.length === 1 ? "הפרה" : "הפרות"} בסידור הנוכחי
            </span>
            <button style={Object.assign({}, S.btnSm, S.btnGhost)} onClick={runAuto}>חשב מחדש</button>
          </div>
          <div style={S.violList}>
            {violations.map((v, i) => (
              <div key={i} style={Object.assign({}, S.violRow,
                v.type === "capacity" ? S.violCap : v.type === "apart" ? S.violApart : S.violTog
              )}>
                <span style={S.violIcon}>
                  {v.type === "capacity" ? "🔴" : v.type === "apart" ? "⛔" : "🤝"}
                </span>
                <span>{v.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div style={S.unassignedCard}>
          <div style={S.unassignedHeader}>
            <span style={S.unassignedTitle}>⏳ ממתינים לשיבוץ</span>
            <span style={S.unassignedCount}>{unassigned.length} אורחים</span>
          </div>
          <div style={S.gList}>
            {unassigned.map(g => (
              <div key={g.id} style={S.gRow}>
                <SideDot side={g.side}/>
                <div style={S.gInfo}>
                  <span style={S.gName}>{g.name}</span>
                  <span style={S.gMeta}>{sideLabel(g.side)} · {g.group}</span>
                </div>
                <select
                  style={Object.assign({}, S.select, { minWidth:180, fontSize:13 })}
                  value=""
                  onChange={e => { if (e.target.value) assignGuest(g.id, e.target.value); }}
                >
                  <option value="">שבץ לשולחן...</option>
                  {ev.tables.map(t => {
                    const cnt  = tableGuests(t.id).length;
                    const full = cnt >= t.capacity;
                    return (
                      <option key={t.id} value={t.id} disabled={full}>
                        {t.name} ({cnt}/{t.capacity}){full ? " — מלא" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {ev.tables.length > 0 && (
        <div style={S.tableCards}>
          {ev.tables.map(t => {
            const tGuests    = tableGuests(t.id);
            const isOver     = tGuests.length > t.capacity;
            const hasViol    = violatedTables.has(t.name);
            const isExpanded = expandedTable === t.id;
            const pct        = t.capacity > 0 ? tGuests.length / t.capacity : 0;

            const borderCol = isOver ? "var(--red)" : hasViol ? "#E8A020" : "var(--border)";

            return (
              <div key={t.id} style={Object.assign({}, S.tCard, { borderColor: borderCol }, isOver ? { background:"#FFFBFB" } : {})}>
                <button style={S.tCardHead} onClick={() => setExpandedTable(isExpanded ? null : t.id)}>
                  <div style={S.tCardLeft}>
                    <span style={Object.assign({}, S.tCardIcon, tGuests.length === 0 ? { opacity:.25 } : {})}>⬡</span>
                    <div>
                      <div style={S.tCardName}>
                        {t.name}
                        {t.type !== "regular" && <TypeTag type={t.type}/>}
                        {isOver  && <span style={S.tCardBadgeRed}>חריגה!</span>}
                        {hasViol && !isOver && <span style={S.tCardBadgeWarn}>הפרה</span>}
                      </div>
                      {tGuests.length > 0 && (
                        <div style={{ display:"flex", gap:5, marginTop:3, flexWrap:"wrap" }}>
                          {["bride","groom"].map(side => {
                            const n = tGuests.filter(g => g.side === side).length;
                            if (!n) return null;
                            return (
                              <span key={side} style={Object.assign({}, S.tChip, {
                                color:      side === "bride" ? "var(--bride)" : "var(--groom)",
                                background: side === "bride" ? "#F5ECF3" : "#EBF2FB",
                                border:     "1px solid " + (side === "bride" ? "#E0C6DB" : "#C5D9F0"),
                              })}>
                                <SideDot side={side}/> {n}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={S.tCardRight}>
                    <CapBar filled={tGuests.length} capacity={t.capacity} isOver={isOver}/>
                    <span style={Object.assign({}, S.tCardCount,
                      isOver ? { color:"var(--red)" } : pct > .85 ? { color:"var(--warn)" } : tGuests.length > 0 ? { color:"var(--text)" } : { color:"var(--muted)" }
                    )}>
                      {tGuests.length}/{t.capacity}
                    </span>
                    <span style={S.tCardChevron}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={S.tGuestList}>
                    {tGuests.length === 0 && (
                      <div style={S.emptyInline}>שולחן ריק — הוסף אורחים מהרשימה למטה</div>
                    )}
                    {tGuests.map(g => (
                      <div key={g.id} style={S.tGuestRow}>
                        <SideDot side={g.side}/>
                        <div style={Object.assign({}, S.gInfo, { flex:1 })}>
                          <span style={S.gName}>{g.name}</span>
                          <span style={S.gMeta}>{g.group}</span>
                        </div>
                        <select
                          style={Object.assign({}, S.select, { minWidth:160, fontSize:13 })}
                          value={t.id}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === "__remove__") assignGuest(g.id, null);
                            else if (val !== t.id)   assignGuest(g.id, val);
                          }}
                        >
                          <option value={t.id}>{t.name} (כאן)</option>
                          <option value="__remove__">↩ הסר מהשולחן</option>
                          <optgroup label="העבר לשולחן אחר">
                            {ev.tables.filter(ot => ot.id !== t.id).map(ot => {
                              const cnt  = tableGuests(ot.id).length;
                              const full = cnt >= ot.capacity;
                              return (
                                <option key={ot.id} value={ot.id} disabled={full}>
                                  {ot.name} ({cnt}/{ot.capacity}){full ? " — מלא" : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        </select>
                      </div>
                    ))}

                    {unassigned.length > 0 && !isOver && (
                      <div style={Object.assign({}, S.tGuestRow, { borderTop:"1px dashed var(--border)", marginTop:6, paddingTop:10 })}>
                        <span style={Object.assign({}, S.gMeta, { flex:1, color:"var(--text2)" })}>הוסף אורח לשולחן זה:</span>
                        <select
                          style={Object.assign({}, S.select, { minWidth:180, fontSize:13 })}
                          value=""
                          onChange={e => { if (e.target.value) assignGuest(e.target.value, t.id); }}
                        >
                          <option value="">— בחר מהממתינים —</option>
                          {unassigned.map(g => (
                            <option key={g.id} value={g.id}>{g.name} ({sideLabel(g.side)})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXCEL TEMPLATE — pre-built, embedded as base64
// Generated with openpyxl: RTL, Hebrew headers, Data Validation
// for צד (כלה/חתן) and קבוצה (13 options), frozen header row.
// Downloading via data URL works in all environments.
// ═══════════════════════════════════════════════════════════════

const TEMPLATE_XLSX_B64 = "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";

// Returns the data URL for the template — used directly in <a href>
function getTemplateDataUrl() {
  return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + TEMPLATE_XLSX_B64;
}

// ═══════════════════════════════════════════════════════════════
// EXCEL IMPORT FLOW
// 2 steps: Upload (with template download) → Confirm & import
// Column mapping is automatic — template headers are always known.
// ═══════════════════════════════════════════════════════════════

function ExcelImportFlow({ ev, patchEvent, showToast, onClose }) {
  const [step, setStep]       = useState("upload");  // upload | confirm
  const [preview, setPreview] = useState([]);
  const [parseErr, setParseErr] = useState("");
  const dropRef = useRef(null);
  const fileRef = useRef(null);

  const sideLabel = s =>
    s === "bride" ? (ev.brideName ? "צד " + ev.brideName : "צד כלה")
                  : (ev.groomName ? "צד " + ev.groomName : "צד חתן");

  const brideSide = ev.brideName ? "צד " + ev.brideName : "צד כלה";
  const groomSide = ev.groomName ? "צד " + ev.groomName : "צד חתן";


  // ── Parse uploaded file ──
  // Template columns (exact): שם | מספר מוזמנים | צד | קבוצה | טלפון | הערות
  // Row 1 = headers, Row 2 = hint (skip if שם = hint text), Row 3+ = data
  const parseRows = (rawRows) => {
    // Skip hint row — it contains "(דוגמה" or its count field is text
    const dataRows = rawRows.filter(r => {
      const name = String(r["שם"] || "").trim();
      return name && !name.startsWith("דוגמה") && !name.startsWith("(");
    });

    return dataRows.map(r => {
      const name     = String(r["שם"] || "").trim();
      if (!name) return null;
      const rawCount = r["מספר מוזמנים"];
      const count    = Math.max(1, parseInt(rawCount) || 1);
      const phone    = String(r["טלפון"] || "").trim();
      const notes    = String(r["הערות"] || "").trim();
      const rawGroup = String(r["קבוצה"] || "").trim();
      const group    = GROUP_OPTIONS.includes(rawGroup) ? rawGroup : "אחר";

      // Side detection — match against brideSide / groomSide strings
      let side = "bride";
      const rawSide = String(r["צד"] || "").trim();
      if (rawSide.includes("חתן") || rawSide === groomSide) side = "groom";
      else if (rawSide.includes("כלה") || rawSide === brideSide) side = "bride";

      return { id:uid(), name, count, phone, notes, group, side };
    }).filter(Boolean);
  };

  const parseFile = (file) => {
    if (!file) return;
    setParseErr("");
    if (!window.XLSX) { showToast("ספריית Excel עדיין טוענת, נסה שוב", "err"); return; }

    const ext    = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let rows;
        if (ext === "csv") {
          const text  = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (!lines.length) { setParseErr("הקובץ ריק"); return; }
          const sep  = lines[0].includes("\t") ? "\t" : ",";
          const hdrs = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
          rows = lines.slice(1).map(line => {
            const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
            const obj  = {};
            hdrs.forEach((h, i) => { obj[h] = vals[i] || ""; });
            return obj;
          });
        } else {
          const wb = window.XLSX.read(e.target.result, { type:"array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows     = window.XLSX.utils.sheet_to_json(ws, { defval:"" });
        }

        if (!rows.length) { setParseErr("לא נמצאו שורות בקובץ"); return; }

        // Check if this looks like our template (has the right headers)
        const firstRow = rows[0];
        const hasTemplateHeaders = firstRow && ("שם" in firstRow);
        if (!hasTemplateHeaders) {
          setParseErr("הקובץ לא נראה כתבנית שלנו. ודא שהורדת את התבנית ומילאת אותה.");
          return;
        }

        const parsed = parseRows(rows);
        if (!parsed.length) { setParseErr("לא נמצאו רשומות תקניות (שורת ההדרכה נוסרה אוטומטית)"); return; }

        setPreview(parsed);
        setStep("confirm");
      } catch(err) {
        setParseErr("שגיאה בקריאת הקובץ: " + (err.message || "פורמט לא תקין"));
      }
    };

    if (ext === "csv") reader.readAsText(file, "UTF-8");
    else reader.readAsArrayBuffer(file);
  };

  const doImport = () => {
    patchEvent(e => Object.assign({}, e, { guests: e.guests.concat(preview) }));
    const seats = preview.reduce((s, g) => s + (g.count || 1), 0);
    showToast("יובאו " + preview.length + " רשומות — " + seats + " מקומות ✓");
    onClose();
  };

  // Drag & drop
  const onDrop = e => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = "";
    parseFile(e.dataTransfer.files[0]);
  };
  const onDragOver = e => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = "var(--accent)";
  };
  const onDragLeave = () => {
    if (dropRef.current) dropRef.current.style.borderColor = "";
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div style={S.importWrap}>

      {/* Step pill + close */}
      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:16 }}>
        {[["upload","1. הורד והכן"],["confirm","2. אשר ויבא"]].map(([s, l], i) => (
          <React.Fragment key={s}>
            {i > 0 && <span style={{ color:"var(--muted)", fontSize:12 }}>›</span>}
            <span style={{
              fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:20,
              background: step === s ? "var(--accent)" : "var(--bg)",
              color:      step === s ? "#fff" : "var(--muted)",
              border:     "1px solid " + (step === s ? "var(--accent)" : "var(--border)"),
            }}>{l}</span>
          </React.Fragment>
        ))}
        <button
          style={Object.assign({}, S.btnSm, S.btnGhost, { marginRight:"auto" })}
          onClick={onClose}
        >✕ סגור</button>
      </div>

      {/* ══ STEP 1: Download template + upload ══ */}
      {step === "upload" && (
        <div style={S.importStep}>

          {/* Download CTA — prominent first action */}
          <div style={S.templateCard}>
            <div style={S.templateCardIcon}>📋</div>
            <div style={{ flex:1 }}>
              <div style={S.templateCardTitle}>התחל עם תבנית מוכנה</div>
              <div style={S.templateCardSub}>
                קובץ Excel עם כל העמודות, רשימות נפתחות לצד ולקבוצה, והסברים בתוך הקובץ.
                מלא אותו ואז העלה בחזרה.
              </div>
            </div>
            <a
              href={getTemplateDataUrl()}
              download={"רשימת_אורחים_" + (ev.name || "אורחים").replace(/[^א-תa-zA-Z0-9]/g,"_") + ".xlsx"}
              style={S.downloadLink}
            >
              ⬇ הורד תבנית Excel
            </a>
          </div>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10, margin:"4px 0" }}>
            <div style={{ flex:1, height:1, background:"var(--border)" }}/>
            <span style={{ fontSize:12, color:"var(--muted)" }}>אחרי שמילאת — העלה כאן</span>
            <div style={{ flex:1, height:1, background:"var(--border)" }}/>
          </div>

          {/* Dropzone */}
          <div
            ref={dropRef}
            style={S.importDropzone}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            <div style={S.importDropzoneIcon}>📤</div>
            <div style={S.importDropzoneText}>גרור לכאן את הקובץ המלא</div>
            <div style={S.importDropzoneHint}>או לחץ לבחירת קובץ · xlsx, xls, csv</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display:"none" }}
            onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); }}
          />

          {parseErr && (
            <div style={Object.assign({}, S.banner, S.bannerWarn)}>
              ⚠ {parseErr}
            </div>
          )}

          <div style={S.fieldHint}>
            הקובץ נקרא בדפדפן בלבד — לא נשלח לאף שרת.
          </div>
        </div>
      )}

      {/* ══ STEP 2: Confirm ══ */}
      {step === "confirm" && (
        <div style={S.importStep}>

          <div style={Object.assign({}, S.banner, S.bannerOk)}>
            נמצאו <strong>{preview.length} רשומות</strong> —{" "}
            סה"כ <strong>{preview.reduce((s,g)=>s+(g.count||1),0)} מקומות</strong>.
            בדוק לפני הייבוא.
          </div>

          <div style={{ maxHeight:340, overflowY:"auto", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)" }}>
            <table style={S.importPreviewTable}>
              <thead>
                <tr>
                  <th style={S.importTh}>שם</th>
                  <th style={Object.assign({}, S.importTh, { textAlign:"center" })}>מקומות</th>
                  <th style={S.importTh}>צד</th>
                  <th style={S.importTh}>קבוצה</th>
                  <th style={S.importTh}>טלפון</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((g, i) => (
                  <tr key={i} style={i % 2 === 1 ? { background:"var(--bg)" } : {}}>
                    <td style={S.importTd}>{g.name}</td>
                    <td style={Object.assign({}, S.importTd, { textAlign:"center" })}>
                      {(g.count || 1) > 1
                        ? <strong style={{ color:"var(--accent)" }}>{g.count}</strong>
                        : <span style={{ color:"var(--muted)" }}>1</span>}
                    </td>
                    <td style={S.importTd}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12 }}>
                        <SideDot side={g.side}/>
                        {sideLabel(g.side)}
                      </span>
                    </td>
                    <td style={Object.assign({}, S.importTd, { fontSize:12 })}>{g.group}</td>
                    <td style={Object.assign({}, S.importTd, { color:"var(--muted)", fontSize:12 })}>
                      {g.phone || "—"}
                    </td>
                  </tr>
                ))}
                {preview.length > 200 && (
                  <tr>
                    <td colSpan={5} style={Object.assign({}, S.importTd, { textAlign:"center", color:"var(--muted)", fontStyle:"italic" })}>
                      ...ועוד {preview.length - 200} רשומות
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button style={S.btnPrimary} onClick={doImport}>
              ✓ ייבא {preview.length} רשומות לאירוע
            </button>
            <button style={S.btnSecondary} onClick={() => { setStep("upload"); setPreview([]); setParseErr(""); }}>
              חזור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

function Field({ label, required, hint, children }) {
  return (
    <div style={S.field}>
      <label style={S.label}>
        {label}
        {required && <span style={{ color:"var(--red)", marginRight:2 }}>*</span>}
        {hint && <span style={S.labelHint}> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function PageHeader({ title, icon, sub, aside }) {
  return (
    <div style={S.pageHead}>
      <div style={{ flex:1, minWidth:0 }}>
        <h2 style={S.pageTitle}>
          <span style={{ color:"var(--accent)" }}>{icon}</span> {title}
        </h2>
        {sub && <p style={S.pageSub}>{sub}</p>}
      </div>
      {aside && <div style={{ flexShrink:0 }}>{aside}</div>}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={S.sectionLabel}>{children}</div>;
}

function NextStep({ label, hint, onClick }) {
  return (
    <div style={S.nextBanner}>
      <div>
        <div style={S.nextLabel}>{label}</div>
        {hint && <div style={S.nextHint}>{hint}</div>}
      </div>
      <button style={S.btnPrimary} onClick={onClick}>{label} ←</button>
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div style={S.empty}>
      <div style={S.emptyIcon}>{icon}</div>
      {title && <h3 style={S.emptyTitle}>{title}</h3>}
      <p style={S.emptyText}>{text}</p>
    </div>
  );
}

function Chip({ icon, label }) {
  return <span style={S.chip}>{icon} {label}</span>;
}

function StatPill({ n, label, color }) {
  return (
    <div style={S.pill}>
      <span style={Object.assign({}, S.pillN, color ? { color } : {})}>{n}</span>
      <span style={S.pillL}>{label}</span>
    </div>
  );
}

function TypeTag({ type }) {
  const m = { regular:["רגיל","var(--muted)"], vip:["VIP","var(--accent)"], head:["ראשי","var(--groom)"] };
  const entry = m[type] || ["?","var(--muted)"];
  return <span style={Object.assign({}, S.typeTag, { color:entry[1], borderColor:entry[1] })}>{entry[0]}</span>;
}

function SideDot({ side }) {
  return <span style={Object.assign({}, S.dot, { background: side === "bride" ? "var(--bride)" : "var(--groom)" })}/>;
}

function Divider({ label }) {
  return (
    <div style={S.divider}>
      <div style={S.dividerLine}/>
      {label && <span style={S.dividerLabel}>{label}</span>}
      <div style={S.dividerLine}/>
    </div>
  );
}

function Banner({ variant, children }) {
  return (
    <div style={Object.assign({}, S.banner, variant === "ok" ? S.bannerOk : S.bannerWarn)}>
      {children}
    </div>
  );
}

function Toast({ msg, variant }) {
  return <div style={Object.assign({}, S.toast, variant === "err" ? S.toastErr : {})}>{msg}</div>;
}

function CapBar({ filled, capacity, isOver }) {
  const pct   = Math.min(filled / capacity, 1) * 100;
  const color = isOver ? "var(--red)" : pct > 85 ? "var(--warn)" : "var(--green)";
  return (
    <div style={S.capBarWrap}>
      <div style={Object.assign({}, S.capBarFill, { width: pct + "%", background: color })}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL CSS
// ═══════════════════════════════════════════════════════════════

const styleTag = document.createElement("style");
styleTag.textContent = [
  "@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap');",
  "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
  ":root{",
  "  --bg:#F5F4F1;--surface:#FFFFFF;--border:#E2DFD8;--border2:#CCCAC2;",
  "  --text:#17140F;--text2:#55524C;--muted:#97938D;",
  "  --accent:#BE7A38;--accent-bg:#FBF2E7;--accent-light:#FEF8F0;",
  "  --bride:#AD6A9C;--groom:#4478B8;",
  "  --green:#2A7A50;--green-bg:#EAF6F0;--green-border:#B2DAC5;",
  "  --red:#BB3527;--red-bg:#FEEEEC;--red-border:#F8C9C4;",
  "  --warn:#956700;--warn-bg:#FEF8E7;--warn-border:#F5DC95;",
  "  --radius:10px;--radius-lg:16px;",
  "  --shadow:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);",
  "  --shadow-md:0 4px 14px rgba(0,0,0,.10);",
  "}",
  "body{background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}",
  "input,select,textarea,button{font-family:inherit}",
  "input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}",
  "button:not(:disabled):active{transform:scale(.97)}",
  "select option:disabled{color:#bbb}",
  "@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
  "@keyframes toastIn{from{opacity:0;transform:translateY(10px) translateX(50%)}to{opacity:1;transform:translateX(50%)}}",
  "@keyframes badgePulse{0%,100%{opacity:1}50%{opacity:.55}}",
  ".subnav-inner{display:flex;gap:0;padding:0 20px;}",
  "@media(max-width:600px){",
  "  .subnav-inner{padding:0 12px}",
  "  .batch-grid{grid-template-columns:1fr 1fr!important}",
  "}",
].join("\n");
document.head.appendChild(styleTag);

// Load SheetJS for Excel parsing
if (!window.XLSX) {
  const xlsxScript = document.createElement("script");
  xlsxScript.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  document.head.appendChild(xlsxScript);
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const S = {
  // Root
  root:{ direction:"rtl", fontFamily:"'Heebo',sans-serif", background:"var(--bg)", minHeight:"100vh" },

  // Topbar — fixed height, no overflow
  topbar:{ display:"flex", alignItems:"center", gap:12, height:56, padding:"0 20px",
    background:"var(--surface)", borderBottom:"1px solid var(--border)",
    position:"sticky", top:0, zIndex:200, boxShadow:"var(--shadow)", overflow:"hidden" },
  logo:{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", flexShrink:0, padding:0 },
  logoMark:{ fontSize:19, color:"var(--accent)" },
  logoName:{ fontSize:17, fontWeight:900, color:"var(--text)", letterSpacing:"-.02em" },
  breadcrumb:{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"var(--text2)",
    flex:1, minWidth:0, overflow:"hidden" },
  bcBack:{ background:"none", border:"none", cursor:"pointer", color:"var(--accent)",
    fontWeight:700, fontSize:13, padding:0, whiteSpace:"nowrap", flexShrink:0 },
  bcSep:{ opacity:.3, flexShrink:0 },
  bcCurrent:{ fontWeight:700, color:"var(--text)", overflow:"hidden",
    textOverflow:"ellipsis", whiteSpace:"nowrap" },
  autoSave:{ fontSize:12, color:"var(--green)", fontWeight:600, whiteSpace:"nowrap", flexShrink:0 },

  // Subnav — scrollable, no overlap
  subnav:{ background:"var(--surface)", borderBottom:"1px solid var(--border)", overflowX:"auto" },
  // subnavInner is rendered as className="subnav-inner" in JSX — but we define as style too
  subnavInner:{ display:"flex", padding:"0 20px" },
  subnavBtn:{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none",
    cursor:"pointer", padding:"11px 12px", fontSize:12, fontWeight:500, color:"var(--text2)",
    borderBottom:"2px solid transparent", whiteSpace:"nowrap",
    transition:"color .15s, border-color .15s", flexShrink:0 },
  subnavActive:{ color:"var(--accent)", borderBottomColor:"var(--accent)", fontWeight:700 },
  subnavLabel:{ display:"inline" },
  stepDot:{ display:"inline-flex", alignItems:"center", justifyContent:"center",
    width:18, height:18, borderRadius:"50%", fontSize:10, fontWeight:800,
    background:"var(--border)", color:"var(--muted)", flexShrink:0,
    transition:"background .15s, color .15s" },
  stepDotDone:{ background:"var(--green-bg)", color:"var(--green)" },
  stepDotActive:{ background:"var(--accent)", color:"#fff" },
  navBadge:{ display:"inline-flex", alignItems:"center", justifyContent:"center",
    background:"var(--accent-bg)", color:"var(--accent)", fontSize:10, fontWeight:700,
    borderRadius:20, minWidth:18, height:18, padding:"0 5px" },

  // Layout
  main:{ padding:"0 0 80px" },
  page:{ maxWidth:880, margin:"0 auto", padding:"28px 20px", animation:"fadeUp .2s ease" },

  // Dashboard hero — two separate styles, no merging that breaks RTL
  hero:{ textAlign:"center", padding:"52px 24px 44px", borderRadius:"var(--radius-lg)",
    background:"linear-gradient(155deg, var(--surface) 0%, var(--accent-bg) 100%)",
    border:"1px solid var(--border)", marginBottom:28, boxShadow:"var(--shadow)" },
  heroBar:{ display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"16px 22px", borderRadius:"var(--radius-lg)",
    background:"var(--surface)", border:"1px solid var(--border)",
    marginBottom:20, boxShadow:"var(--shadow)", flexWrap:"wrap", gap:10 },
  heroBarSub:{ fontSize:12, color:"var(--muted)", marginRight:6 },
  heroEye:{ fontSize:11, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase",
    color:"var(--accent)", marginBottom:10 },
  heroTitle:{ fontSize:38, fontWeight:900, letterSpacing:"-.03em", color:"var(--text)", marginBottom:10 },
  heroSub:{ fontSize:15, color:"var(--text2)", marginBottom:28, lineHeight:1.6 },
  heroCta:{ background:"var(--accent)", color:"#fff", border:"none", cursor:"pointer",
    padding:"11px 24px", borderRadius:"var(--radius)", fontSize:14, fontWeight:700,
    boxShadow:"0 2px 8px rgba(190,122,56,.35)", display:"inline-block" },

  // Event grid
  sectionHead:{ fontSize:13, fontWeight:700, color:"var(--text2)", textTransform:"uppercase",
    letterSpacing:".05em", marginBottom:12 },
  eventGrid:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 },
  eventCard:{ background:"var(--surface)", border:"1px solid var(--border)",
    borderRadius:"var(--radius-lg)", padding:18, boxShadow:"var(--shadow)",
    display:"flex", flexDirection:"column", gap:6 },
  eventCardTop:{ display:"flex", justifyContent:"space-between", alignItems:"center" },
  eventType:{ fontSize:11, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:"var(--accent)" },
  deleteBtn:{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)",
    fontSize:12, borderRadius:6, width:24, height:24,
    display:"flex", alignItems:"center", justifyContent:"center" },
  eventName:{ fontSize:18, fontWeight:800, color:"var(--text)", lineHeight:1.2 },
  eventDate:{ fontSize:12, color:"var(--text2)", display:"flex", flexWrap:"wrap", gap:4 },
  eventProgress:{ height:4, background:"var(--border)", borderRadius:4, overflow:"hidden" },
  eventProgressFill:{ height:"100%", borderRadius:4, transition:"width .5s" },
  eventFooter:{ display:"flex", justifyContent:"space-between", alignItems:"center",
    flexWrap:"wrap", gap:6 },
  eventStatusLabel:{ fontSize:12, fontWeight:700 },
  eventChips:{ display:"flex", gap:5, flexWrap:"wrap" },
  chip:{ display:"inline-flex", alignItems:"center", gap:3, fontSize:11, color:"var(--text2)",
    background:"var(--bg)", border:"1px solid var(--border)", borderRadius:20, padding:"2px 8px" },
  eventOpenBtn:{ background:"var(--accent-bg)", color:"var(--accent)",
    border:"1px solid #E5C99A", borderRadius:"var(--radius)",
    padding:"8px 14px", fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"center" },

  // Empty hero
  emptyHero:{ textAlign:"center", padding:"56px 20px" },
  emptyHeroIcon:{ fontSize:52, opacity:.18, marginBottom:14 },
  emptyHeroTitle:{ fontSize:22, fontWeight:800, marginBottom:8 },
  emptyHeroSub:{ fontSize:14, color:"var(--text2)", marginBottom:24, lineHeight:1.6 },

  // Page header
  pageHead:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    marginBottom:22, gap:12, flexWrap:"wrap" },
  pageTitle:{ fontSize:22, fontWeight:800, letterSpacing:"-.01em", marginBottom:2 },
  pageSub:{ fontSize:13, color:"var(--text2)", lineHeight:1.5 },
  pills:{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" },
  pill:{ display:"flex", flexDirection:"column", alignItems:"center",
    background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10,
    padding:"7px 12px", minWidth:56, boxShadow:"var(--shadow)" },
  pillN:{ fontSize:17, fontWeight:800, color:"var(--accent)", lineHeight:1 },
  pillL:{ fontSize:10, color:"var(--muted)", marginTop:3, whiteSpace:"nowrap" },

  // Card
  card:{ background:"var(--surface)", border:"1px solid var(--border)",
    borderRadius:"var(--radius-lg)", padding:20, marginBottom:14, boxShadow:"var(--shadow)" },
  cardDirty:{ borderColor:"var(--warn)", borderRightWidth:3 },
  cardEdit:{ borderColor:"var(--accent)", background:"var(--accent-light)" },
  sectionLabel:{ fontSize:11, fontWeight:800, color:"var(--muted)",
    textTransform:"uppercase", letterSpacing:".08em",
    marginBottom:12, display:"flex", alignItems:"center", gap:6 },
  sectionLabelSub:{ fontWeight:400, textTransform:"none", letterSpacing:0, fontSize:12 },

  // Form
  grid2:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 },
  // batchGrid defined with flex so it wraps on mobile
  batchGrid:{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 },
  field:{ display:"flex", flexDirection:"column", gap:4 },
  label:{ fontSize:13, fontWeight:600, color:"var(--text2)" },
  labelHint:{ fontWeight:400, color:"var(--muted)", fontSize:12 },
  fieldHint:{ fontSize:12, color:"var(--muted)", lineHeight:1.4 },
  input:{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)",
    borderRadius:"var(--radius)", padding:"9px 12px", fontSize:14,
    color:"var(--text)", direction:"rtl", transition:"border-color .15s" },
  select:{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)",
    borderRadius:"var(--radius)", padding:"9px 12px", fontSize:14,
    color:"var(--text)", direction:"rtl", cursor:"pointer", transition:"border-color .15s" },
  textarea:{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)",
    borderRadius:"var(--radius)", padding:"10px 12px", fontSize:14,
    color:"var(--text)", direction:"rtl", resize:"vertical",
    fontFamily:"inherit", lineHeight:1.7 },
  formActions:{ display:"flex", alignItems:"center", gap:10, marginTop:14, flexWrap:"wrap" },
  filterCount:{ fontSize:13, color:"var(--muted)", fontWeight:500, whiteSpace:"nowrap" },
  bulkSection:{ marginTop:14, paddingTop:14, borderTop:"1px solid var(--border)" },
  batchPreview:{ display:"flex", alignItems:"flex-start", gap:8, padding:"10px 14px",
    background:"var(--bg)", borderRadius:10, fontSize:13, color:"var(--text2)",
    marginBottom:4, border:"1px dashed var(--border2)", lineHeight:1.5 },

  // Segmented control
  seg:{ display:"flex", borderRadius:"var(--radius)", overflow:"hidden", border:"1px solid var(--border)" },
  segBtn:{ flex:1, background:"var(--bg)", border:"none", cursor:"pointer",
    padding:"9px 6px", fontSize:13, fontWeight:500, color:"var(--text2)",
    transition:"background .15s, color .15s" },
  segBride:{ background:"#F2E8F0", color:"var(--bride)", fontWeight:700 },
  segGroom:{ background:"#E8EFF8", color:"var(--groom)", fontWeight:700 },
  segTog:  { background:"var(--green-bg)", color:"var(--green)", fontWeight:700 },
  segApart:{ background:"var(--red-bg)", color:"var(--red)", fontWeight:700 },

  // Filter bar
  filterBar:{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap",
    padding:"10px 14px", background:"var(--surface)", borderRadius:12,
    border:"1px solid var(--border)", boxShadow:"var(--shadow)" },

  // Guest list
  gList:{ display:"flex", flexDirection:"column", gap:5 },
  gRow:{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
    background:"var(--surface)", border:"1px solid var(--border)",
    borderRadius:10, boxShadow:"var(--shadow)" },
  gRowActive:{ borderColor:"var(--accent)", background:"var(--accent-light)" },
  gInfo:{ flex:1, display:"flex", flexDirection:"column", gap:2, minWidth:0 },
  gName:{ fontSize:14, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  gMeta:{ fontSize:12, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  gCountBadge:{ display:"inline-block", fontSize:10, fontWeight:700, background:"var(--accent-bg)",
    color:"var(--accent)", border:"1px solid #E5C99A", borderRadius:20,
    padding:"0px 6px", marginRight:6, verticalAlign:"middle" },
  tagSeated:  { fontSize:11, fontWeight:600, background:"var(--green-bg)", color:"var(--green)",
    border:"1px solid var(--green-border)", borderRadius:20, padding:"2px 9px",
    whiteSpace:"nowrap", flexShrink:0 },
  tagUnseated:{ fontSize:11, color:"var(--muted)", background:"var(--bg)",
    border:"1px solid var(--border)", borderRadius:20, padding:"2px 9px",
    whiteSpace:"nowrap", flexShrink:0 },

  // Table builder list
  tableGrid:{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" },
  // 5-column grid: name, cap, type, seated, actions
  tRow:{ display:"grid", gridTemplateColumns:"1fr 68px 80px 80px 140px", gap:6,
    alignItems:"center", padding:"9px 14px", borderBottom:"1px solid var(--border)", fontSize:14 },
  tHead:{ background:"var(--bg)", fontSize:10, fontWeight:700, color:"var(--muted)",
    textTransform:"uppercase", letterSpacing:".05em" },
  tRowEdit:{ background:"var(--accent-light)" },

  // Constraints
  constraintFormRow:{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap", marginTop:12 },
  constraintVerb:{ paddingBottom:10, color:"var(--muted)", fontSize:13,
    whiteSpace:"nowrap", flexShrink:0 },
  cList:{ display:"flex", flexDirection:"column", gap:6 },
  cRow:{ display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"10px 14px", background:"var(--bg)", borderRadius:10, fontSize:14, gap:10 },
  cRowMain:{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", flex:1, minWidth:0 },
  cstName:{ fontWeight:700 },
  cstVerb:{ color:"var(--text2)", fontSize:13, flexShrink:0 },
  constraintPreview:{ display:"flex", alignItems:"flex-start", gap:12, marginTop:12,
    padding:"14px 16px", borderRadius:12, fontSize:14, lineHeight:1.5 },
  constraintPreviewTog:  { background:"var(--green-bg)", color:"var(--green)", border:"1px solid var(--green-border)" },
  constraintPreviewApart:{ background:"var(--red-bg)", color:"var(--red)", border:"1px solid var(--red-border)" },

  // Seating
  actionBar:{ display:"flex", gap:10, alignItems:"center", marginBottom:14, flexWrap:"wrap" },
  // unassignedCard — no borderRight shorthand conflict; use explicit border + padding
  unassignedCard:{ background:"#FFFDF0", border:"1px solid var(--warn-border)",
    borderRight:"4px solid var(--warn)",
    borderRadius:"var(--radius-lg)", padding:16, marginBottom:14 },
  unassignedHeader:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 },
  unassignedTitle:{ fontSize:14, fontWeight:700, color:"var(--warn)" },
  unassignedCount:{ fontSize:12, fontWeight:700, background:"var(--warn-bg)", color:"var(--warn)",
    border:"1px solid var(--warn-border)", borderRadius:20, padding:"2px 9px" },

  // Violations
  violCard:{ background:"#FFFAEB", border:"1px solid var(--warn-border)",
    borderRadius:"var(--radius-lg)", padding:18, marginBottom:14 },
  violHeader:{ display:"flex", justifyContent:"space-between", alignItems:"center",
    marginBottom:12, flexWrap:"wrap", gap:8 },
  violTitle:{ fontWeight:700, fontSize:14, color:"var(--warn)" },
  violList:{ display:"flex", flexDirection:"column", gap:7 },
  violRow:{ display:"flex", alignItems:"flex-start", gap:10, fontSize:13,
    padding:"8px 12px", borderRadius:8, lineHeight:1.5 },
  violIcon:{ flexShrink:0, fontSize:14, marginTop:1 },
  violTog:  { background:"var(--green-bg)", color:"#1A5C36" },
  violApart:{ background:"var(--red-bg)", color:"var(--red)" },
  violCap:  { background:"#FFF0EE", color:"#922020" },

  // Table cards
  tableCards:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",
    gap:12, marginTop:6 },
  tCard:{ background:"var(--surface)", border:"1px solid var(--border)",
    borderRadius:"var(--radius-lg)", overflow:"hidden", boxShadow:"var(--shadow)",
    transition:"border-color .15s" },
  tCardHead:{ display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"13px 16px", background:"none", border:"none", cursor:"pointer",
    width:"100%", gap:10, textAlign:"right" },
  tCardLeft:{ display:"flex", alignItems:"flex-start", gap:10, flex:1, minWidth:0 },
  tCardIcon:{ fontSize:18, color:"var(--accent)", flexShrink:0, marginTop:1 },
  tCardName:{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center",
    gap:5, flexWrap:"wrap" },
  tCardBadgeRed: { fontSize:10, fontWeight:700, background:"var(--red-bg)", color:"var(--red)",
    border:"1px solid var(--red-border)", borderRadius:20, padding:"1px 6px" },
  tCardBadgeWarn:{ fontSize:10, fontWeight:700, background:"var(--warn-bg)", color:"var(--warn)",
    border:"1px solid var(--warn-border)", borderRadius:20, padding:"1px 6px" },
  tCardRight:{ display:"flex", alignItems:"center", gap:8, flexShrink:0 },
  tCardCount:{ fontSize:13, fontWeight:700 },
  tCardChevron:{ fontSize:10, color:"var(--muted)" },
  tChip:{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600,
    borderRadius:20, padding:"2px 7px", flexShrink:0 },
  tGuestList:{ borderTop:"1px solid var(--border)", padding:"8px 0" },
  tGuestRow:{ display:"flex", alignItems:"center", gap:8, padding:"6px 14px", fontSize:14 },
  emptyInline:{ fontSize:13, color:"var(--muted)", padding:"8px 14px",
    display:"block", fontStyle:"italic" },

  // Cap bar
  capBarWrap:{ width:52, height:5, background:"var(--border)", borderRadius:3,
    overflow:"hidden", flexShrink:0 },
  capBarFill:{ height:"100%", borderRadius:3, transition:"width .3s" },

  // Success
  successCard:{ display:"flex", alignItems:"center", gap:14, background:"var(--green-bg)",
    border:"2px solid var(--green-border)", borderRadius:"var(--radius-lg)",
    padding:"18px 20px", marginBottom:14, boxShadow:"var(--shadow)" },
  successIconWrap:{ width:42, height:42, borderRadius:"50%", background:"var(--green)", color:"#fff",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:20, fontWeight:900, flexShrink:0 },
  successTitle:{ fontWeight:800, fontSize:16, color:"var(--green)", marginBottom:3 },
  successSub:{ fontSize:13, color:"var(--text2)" },

  // Misc
  typeTag:{ fontSize:11, fontWeight:700, letterSpacing:".04em", border:"1px solid",
    borderRadius:20, padding:"2px 7px", display:"inline-block" },
  dot:{ width:10, height:10, borderRadius:"50%", flexShrink:0, display:"inline-block" },
  divider:{ display:"flex", alignItems:"center", gap:10, margin:"14px 0" },
  dividerLine:{ flex:1, height:1, background:"var(--border)" },
  dividerLabel:{ fontSize:11, fontWeight:700, color:"var(--muted)",
    textTransform:"uppercase", letterSpacing:".08em", whiteSpace:"nowrap" },
  banner:{ borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:13, fontWeight:500,
    display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", lineHeight:1.5 },
  bannerWarn:{ background:"var(--warn-bg)", color:"var(--warn)", border:"1px solid var(--warn-border)" },
  bannerOk:  { background:"var(--green-bg)", color:"var(--green)", border:"1px solid var(--green-border)" },
  empty:{ textAlign:"center", padding:"44px 20px", color:"var(--muted)" },
  emptyIcon:{ fontSize:34, marginBottom:10, opacity:.3 },
  emptyTitle:{ fontSize:15, fontWeight:700, color:"var(--text2)", marginBottom:5 },
  emptyText:{ fontSize:14, lineHeight:1.6 },
  nextBanner:{ display:"flex", justifyContent:"space-between", alignItems:"center",
    background:"var(--accent-bg)", border:"1px solid #E2C49A",
    borderRadius:"var(--radius-lg)", padding:"16px 20px", marginTop:18,
    gap:14, flexWrap:"wrap", boxShadow:"var(--shadow)" },
  nextLabel:{ fontSize:14, fontWeight:700, marginBottom:2 },
  nextHint:{ fontSize:12, color:"var(--text2)" },

  // Buttons
  btnPrimary:  { background:"var(--accent)", color:"#fff", border:"none", cursor:"pointer",
    padding:"10px 18px", borderRadius:"var(--radius)", fontSize:14, fontWeight:700,
    boxShadow:"0 1px 4px rgba(190,122,56,.28)" },
  btnSecondary:{ background:"var(--surface)", color:"var(--text2)",
    border:"1px solid var(--border2)", cursor:"pointer",
    padding:"10px 16px", borderRadius:"var(--radius)", fontSize:14, fontWeight:600 },
  btnSm:       { fontSize:12, fontWeight:700, padding:"5px 11px", borderRadius:7, border:"none",
    cursor:"pointer", background:"var(--accent)", color:"#fff", flexShrink:0 },
  btnGhost:    { background:"var(--bg)", color:"var(--text2)", border:"1px solid var(--border2)" },
  btnDanger:   { background:"var(--red-bg)", color:"var(--red)", border:"1px solid var(--red-border)" },

  // Toast
  toast:{ position:"fixed", bottom:24, left:"50%", transform:"translateX(50%)",
    background:"#17140F", color:"#fff", padding:"12px 20px", borderRadius:10,
    fontSize:14, fontWeight:600, boxShadow:"var(--shadow-md)",
    zIndex:9999, animation:"toastIn .2s ease", whiteSpace:"nowrap" },
  toastErr:{ background:"var(--red)" },

  // Excel import flow
  downloadLink:{ display:"inline-block", background:"var(--accent)", color:"#fff",
    textDecoration:"none", padding:"10px 18px", borderRadius:"var(--radius)",
    fontSize:14, fontWeight:700, boxShadow:"0 1px 4px rgba(190,122,56,.28)",
    flexShrink:0, whiteSpace:"nowrap" },

  // Template download card
  templateCard:{ display:"flex", alignItems:"center", gap:14, padding:"16px 18px",
    background:"var(--accent-bg)", border:"1px solid #E5C99A",
    borderRadius:"var(--radius-lg)", flexWrap:"wrap" },
  templateCardIcon:{ fontSize:26, flexShrink:0 },
  templateCardTitle:{ fontSize:14, fontWeight:700, color:"var(--text)", marginBottom:3 },
  templateCardSub:{ fontSize:12, color:"var(--text2)", lineHeight:1.5 },

  importWrap:{ marginTop:16, paddingTop:16, borderTop:"1px solid var(--border)" },
  importStep:{ display:"flex", flexDirection:"column", gap:14 },
  importDropzone:{ border:"2px dashed var(--border)", borderRadius:"var(--radius-lg)",
    padding:"32px 24px", textAlign:"center", cursor:"pointer",
    transition:"border-color .15s, background .15s" },
  importDropzoneActive:{ borderColor:"var(--accent)", background:"var(--accent-light)" },
  importDropzoneIcon:{ fontSize:32, marginBottom:8, opacity:.5 },
  importDropzoneText:{ fontSize:14, fontWeight:500, color:"var(--text2)", marginBottom:4 },
  importDropzoneHint:{ fontSize:12, color:"var(--muted)" },
  importPreviewTable:{ width:"100%", borderCollapse:"collapse", fontSize:13 },
  importTh:{ background:"var(--bg)", padding:"7px 10px", textAlign:"right",
    fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase",
    letterSpacing:".05em", borderBottom:"1px solid var(--border)" },
  importTd:{ padding:"7px 10px", borderBottom:"0.5px solid var(--border)", verticalAlign:"middle" },
  importMapRow:{ display:"flex", alignItems:"center", gap:10, padding:"9px 0",
    borderBottom:"0.5px solid var(--border)" },
  importMapFrom:{ flex:1, minWidth:0, fontSize:13, fontWeight:500, overflow:"hidden",
    textOverflow:"ellipsis", whiteSpace:"nowrap" },
  importMapCount:{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap", flexShrink:0 },
  importMapArrow:{ color:"var(--muted)", flexShrink:0, fontSize:12 },
  importMapSelect:{ flex:1, minWidth:100, fontSize:13 },
  importBadgeAuto:{ fontSize:10, fontWeight:700, background:"var(--green-bg)",
    color:"var(--green)", border:"1px solid var(--green-border)",
    borderRadius:20, padding:"1px 7px", flexShrink:0 },
  importBadgeWarn:{ fontSize:10, fontWeight:700, background:"var(--warn-bg)",
    color:"var(--warn)", border:"1px solid var(--warn-border)",
    borderRadius:20, padding:"1px 7px", flexShrink:0 },
};
