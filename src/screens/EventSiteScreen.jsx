import { useState, useEffect, useMemo, useRef, useId } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, fetchGiftWall, UNREACHABLE_TEXT } from "../utils/publicTokens.js";
import { guestEventType, guestHosts } from "../utils/guestRoutes.js";
import { useGuestTitle } from "../hooks/useGuestTitle.js";
import { getSiteTheme, getSiteFont } from "../data/eventSiteTemplates.js";
import { buildEventIcs, icsFileName, downloadIcs, eventStartTime, knownStartTime, israelInstant } from "../utils/calendarFile.js";
import { daysUntilIsrael } from "../utils/dateFormat.js";
import styles from "./EventSiteScreen.module.css";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { siteLocation } from "../utils/siteLocation.js";

// Map a local (host-owned) event into the public-site shape, so the host can
// preview drafts securely from inside the authenticated app.
function fromLocalEvent(le) {
  return {
    name: le.name, type: le.type, date: le.date, venue: le.venue,
    brideName: le.brideName, groomName: le.groomName, celebrantName: le.celebrantName,
    organizationName: le.organizationName, ownerName: le.ownerName,
    site: le.eventSite,
    rsvpToken: le.tokens?.rsvp ?? null, giftToken: le.tokens?.gift ?? null,
    albumToken: le.tokens?.album ?? null,
  };
}

// DEV-only preview event so the site can be designed without a live token.
const MOCK = {
  name: "חתונת נועה וטל", type: "חתונה", date: "2026-09-15", venue: "בית על הים, תל אביב",
  brideName: "נועה", groomName: "טל",
  rsvpToken: "aaaaaaaa", giftToken: "cccccccc",
  giftBitPhone: "050-1234567",
  site: {
    enabled: true, themeKey: "rose", heroEn: "OUR WEDDING DAY", coverPhoto: null,
    story: "אחרי שבע שנים, המון אהבה וכלב אחד — אנחנו מתחתנים. נשמח לחגוג איתכם.",
    schedule: [
      { id: "1", time: "18:00", title: "קבלת פנים", icon: "🥂" },
      { id: "2", time: "19:00", title: "חופה", icon: "💍" },
      { id: "3", time: "20:00", title: "ארוחת ערב", icon: "🍽️" },
      { id: "4", time: "21:00", title: "ריקודים", icon: "💃" },
    ],
    address: "רוסלאן 1, תל אביב", wazeUrl: "https://waze.com/ul?q=בית על הים תל אביב",
    parkingNote: "חניה חינם בחניון שנקר 2, במרחק דקה מהאולם.",
    faq: [
      { id: "1", q: "איך מגיעים לאירוע? יש חניה?", a: "חניה חינם בחניון שנקר 2, במרחק דקה." },
      { id: "2", q: "מתי צריך לאשר הגעה?", a: "מומלץ לאשר בהקדם כדי שנוכל לתכנן את ההושבה." },
    ],
    contactPhone: "050-1234567",
    sections: { schedule: true, location: true, gift: true, blessings: true, faq: true },
  },
};

/**
 * Schedule icons.
 *
 * The stored value is whatever the host typed into the editor's icon field, and
 * the templates seed it with emoji — four vendors' worth of colour artwork in
 * one four-row list, under a venue card that draws its pin. The 🍽️ in
 * particular is near-white and effectively invisible on the light theme grounds.
 *
 * The data is left alone (the host owns that field and sees the character they
 * typed); the GUEST gets the drawn icon whenever we recognise what was typed,
 * and the raw character otherwise. That also upgrades every event already
 * saved, without a migration.
 */
const SCHEDULE_ICON = {
  "🥂": "glass",  "🍾": "glass",  "🍸": "glass",  "🍷": "glass",
  "💍": "rings",  "💒": "chuppah", "⛩": "chuppah", "🕍": "chuppah",
  "🍽️": "food",  "🍽": "food",   "🍰": "food",   "🥗": "food",
  "💃": "turntable", "🕺": "turntable", "🎶": "note", "🎵": "note",
  "🎤": "note",   "🎧": "turntable", "🎛": "turntable", "🎉": "star",
  "📸": "camera", "🎁": "gift",   "🚌": "car",    "🚗": "car",
  "🕯": "star6",  "✡": "star6",   "🎂": "food",   "⏰": "clock",
  "📍": "pin",    "🏛": "building", "🎬": "stage", "🎪": "stage",
};

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const HE_MONTHS = ["בינואר","בפברואר","במרץ","באפריל","במאי","ביוני","ביולי","באוגוסט","בספטמבר","באוקטובר","בנובמבר","בדצמבר"];
function heDate(str) {
  if (!str) return "";
  const d = new Date(str + "T12:00:00");
  if (isNaN(d.getTime())) return str;
  return `יום ${HE_DAYS[d.getDay()]}, ${d.getDate()} ${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function hostsLabel(ev) {
  if (ev.brideName && ev.groomName) return `${ev.brideName} ו${ev.groomName}`;
  return ev.celebrantName || ev.organizationName || ev.ownerName || ev.name || "";
}

export default function EventSiteScreen({ localEvent }) {
  const { token } = useParams();
  // Host preview: rendered inside the app with the owner's local event data.
  const isPreview = !!localEvent;
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound | unreachable
  const [wishes, setWishes] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Not in the host's in-app preview: that tab is the host's app.
  useGuestTitle(!isPreview && ev && guestHosts(ev));
  const scheduleRef = useRef(null);
  const locationRef = useRef(null);
  const shuttlesRef = useRef(null);
  const blessingsRef = useRef(null);
  const faqRef = useRef(null);
  const burgerRef = useRef(null);

  // The section menu: Escape closes it and gives focus back to the button
  // that opened it (37f). It had no keyboard way out, and no aria-expanded,
  // so a screen reader could not tell it was open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setMenuOpen(false); burgerRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (localEvent) { setEv(fromLocalEvent(localEvent)); setState("ready"); return; }
    let cancelled = false;
    (async () => {
      let data;
      try {
        data = await fetchEventByToken("invite", token);
      } catch {
        if (!cancelled) setState("unreachable");
        return;
      }
      if (cancelled) return;
      if (data) { setEv(data); setState("ready"); }
      // Dev only — a deploy with no env showed a made-up wedding (106).
      else if (import.meta.env.DEV) { setEv(MOCK); setState("ready"); }
      else setState("notfound");
    })();
    return () => { cancelled = true; };
  }, [token, localEvent]);

  const site = ev?.site;
  // A question the host never answered is not shown to guests. The default
  // template ships "איך מגיעים לאירוע? יש חניה?" with an empty answer, and it
  // rendered on the live site as a question that opens onto nothing (28.9).
  //
  // Read as TEXT first: `f.q.trim()` threw on a question stored as a number
  // (an import, a hand-edited payload), and the throw took the whole guest
  // site down with it (FZ6).
  const faqText = (v) => (typeof v === "string" || typeof v === "number") ? String(v).trim() : "";
  const faqAnswered = (Array.isArray(site?.faq) ? site.faq : [])
    .map((f, i) => ({ id: f?.id ?? `faq-${i}`, q: faqText(f?.q), a: faqText(f?.a) }))
    .filter(f => f.q && f.a);
  useEffect(() => {
    if (!ev?.giftToken || !site?.sections?.blessings) return;
    let cancelled = false;
    fetchGiftWall(ev.giftToken)
      .then(rows => { if (!cancelled) setWishes(rows || []); })
      .catch(() => { /* the blessings section just stays as it is */ });
    return () => { cancelled = true; };
  }, [ev?.giftToken, site?.sections?.blessings]);

  const theme = useMemo(() => getSiteTheme(site?.themeKey), [site?.themeKey]);
  const font  = useMemo(() => getSiteFont(site?.fontKey), [site?.fontKey]);
  const themeVars = useMemo(() => ({
    "--s-bg": theme.bg, "--s-surface": theme.surface, "--s-ink": theme.ink,
    "--s-muted": theme.muted, "--s-accent": theme.accent, "--s-accent-soft": theme.accentSoft,
    "--s-line": theme.line, "--s-on-accent": theme.onAccent,
    // Headings read from this; body text stays on the base family for legibility.
    "--s-heading-font": font.stack,
  }), [theme, font]);

  if (state === "loading") {
    // Every state is the page's one <main> (38a).
    return <main className={styles.stateWrap}><span className={styles.stateStar} aria-hidden="true">✦</span><p role="status">טוען…</p></main>;
  }
  if (state === "notfound") {
    return (
      <main className={styles.stateWrap}>
        <span className={styles.stateStar}>✦</span>
        <h1 className={styles.stateTitle}>הקישור אינו תקין או שפג תוקפו</h1>
        <Link to="/" className={styles.stateLink}>לדף הבית</Link>
      </main>
    );
  }
  if (state === "unreachable") {
    return (
      <main className={styles.stateWrap}>
        <span className={styles.stateStar}>✦</span>
        <h1 className={styles.stateTitle}>{UNREACHABLE_TEXT.title}</h1>
        <p>{UNREACHABLE_TEXT.body}</p>
      </main>
    );
  }

  // Content is shown only once the host publishes. Before that, guests see a
  // minimal "coming soon" teaser. The host previews drafts securely from
  // inside the app (localEvent), never via a public query param.
  const published = site && site.enabled;
  const visible = published || isPreview;
  const hosts = hostsLabel(ev);
  const dateStr = heDate(ev.date);
  const sec = site?.sections || {};
  const refByKey = { schedule: scheduleRef, location: locationRef, shuttles: shuttlesRef, blessings: blessingsRef, faq: faqRef };
  const scrollTo = (key) => { setMenuOpen(false); refByKey[key]?.current?.scrollIntoView({ behavior: "smooth" }); };
  const rsvpUrl = ev.rsvpToken ? `/rsvp/${ev.rsvpToken}` : null;
  const giftUrl = ev.giftToken ? `/gift/${ev.giftToken}` : null;
  // The shared album, from the day of the event on (WORKPLAN פ). Before then
  // there is nothing to upload, and a link to an empty album on a site guests
  // open weeks ahead reads as broken. The thank-you message links it too (88).
  // Israel's today, not the device's: a guest abroad on the evening before is
  // already on the day in Israel (T5).
  const albumDays = daysUntilIsrael(ev.date);
  const albumUrl = ev.albumToken && albumDays !== null && albumDays <= 0
    ? `/album/${ev.albumToken}` : null;

  const navItems = !visible ? [] : [
    site?.schedule?.length && sec.schedule && { label: "לוז", key: "schedule" },
    siteLocation(site, ev) && sec.location && { label: "מיקום", key: "location" },
    site?.shuttles?.length && sec.shuttles && { label: "הסעות", key: "shuttles" },
    sec.blessings && { label: "ברכות", key: "blessings" },
    faqAnswered.length > 0 && sec.faq && { label: "שאלות", key: "faq" },
  ].filter(Boolean);
  // RSVP is always reachable — even before the site is published — so a guest
  // who arrives early can still confirm attendance.
  const showRsvp = !!rsvpUrl;

  return (
    <div className={styles.site} style={themeVars}>
      {/* ── Sticky mini-nav ── */}
      <nav className={styles.nav}>
        <span className={styles.navBrand}>✦ {hosts}</span>
        <div className={styles.navRight}>
          {showRsvp && <Link to={rsvpUrl} className={styles.navRsvp}>אישור הגעה</Link>}
          {navItems.length > 0 && (
            <button ref={burgerRef} className={styles.navBurger} onClick={() => setMenuOpen(o => !o)} aria-label="תפריט"
              aria-expanded={menuOpen} aria-controls="site-nav-menu">
              {menuOpen ? "✕" : <Icon name="list" size={20} />}
            </button>
          )}
        </div>
        {menuOpen && (
          <div className={styles.navMenu} id="site-nav-menu">
            {navItems.map((it) => (
              <button key={it.key} onClick={() => scrollTo(it.key)}>{it.label}</button>
            ))}
          </div>
        )}
      </nav>

      {/* The page's one landmark (38a): everything between the mini-nav and
          the footer. Unstyled — the sections lay out exactly as before. */}
      <main>

      {/* ── Hero (only once published / in host preview) ── */}
      {visible && (
        <header className={styles.hero}>
          {site?.coverPhoto && (
            <div className={styles.heroPhoto} style={{ backgroundImage: `url(${site.coverPhoto})` }} aria-hidden="true" />
          )}
          <div className={styles.heroInner}>
            {guestEventType(ev.type) && <span className={styles.heroTag}>{guestEventType(ev.type)}</span>}
            <h1 className={styles.heroNames}>{hosts}</h1>
            {/* The English line, marked as English (108): in a he/rtl page a
                screen reader read "OUR WEDDING DAY" with Hebrew phonetics, and
                trailing punctuation jumped to the wrong end. Only when it IS
                English — the host may type Hebrew into it. */}
            {site?.heroEn && (/[֐-׿]/.test(site.heroEn)
              ? <div className={styles.heroEn}>{site.heroEn}</div>
              : <div className={styles.heroEn} lang="en" dir="ltr">{site.heroEn}</div>)}
            <div className={styles.heroDivider}><span /><span className={styles.heroStar}>✦</span><span /></div>
            {dateStr && <div className={styles.heroDate}>{dateStr}</div>}
            {ev.venue && <div className={styles.heroVenue}><Icon name="pin" size={15} /> {ev.venue}</div>}
            {showRsvp && <Link to={rsvpUrl} className={styles.heroCta}>אישור הגעה ←</Link>}
          </div>
        </header>
      )}

      {isPreview && !published && (
        <div className={styles.draftNote}>מצב תצוגה מקדימה — האתר עדיין לא פורסם. רק אתם רואים אותו.</div>
      )}
      {!visible && (
        <div className={styles.comingSoon}>
          <span className={styles.comingSoonStar} aria-hidden="true">✦</span>
          {/* The page's h1 while the hero (which carries it) is hidden (29.9 review). */}
          <h1 className={styles.comingSoonTitle}>האתר בהכנה 💛<br />בעלי השמחה יפרסמו אותו בקרוב.</h1>
          {rsvpUrl && <Link to={rsvpUrl} className={styles.heroCta}>אישור הגעה ←</Link>}
        </div>
      )}

      {/* ── Countdown ── */}
      {visible && site?.countdown !== false && ev.date && (
        <Countdown date={ev.date} time={eventStartTime(site?.schedule)} styles={styles} />
      )}

      {/* ── Story ── */}
      {visible && site?.story && (
        <section className={styles.story}>
          <p>{site.story}</p>
        </section>
      )}

      {/* ── Photo gallery ── */}
      {visible && sec.gallery !== false && site?.gallery?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.secTitle}>הרגעים שלנו</h2>
          <div className={styles.gallery}>
            {site.gallery.map((src, i) => (
              <div key={i} className={styles.galleryItem} style={{ backgroundImage: `url(${src})` }} />
            ))}
          </div>
        </section>
      )}

      {/* ── Schedule ── */}
      {visible && sec.schedule && site?.schedule?.length > 0 && (
        <section ref={scheduleRef} className={styles.section}>
          <h2 className={styles.secTitle}>לוז האירוע</h2>
          <ol className={styles.timeline}>
            {site.schedule.map(item => (
              <li key={item.id} className={styles.tlItem}>
                <span className={styles.tlTime}>{item.time}</span>
                <span className={styles.tlDot} aria-hidden="true" />
                <span className={styles.tlTitle}>
                  {item.icon && (
                    SCHEDULE_ICON[item.icon]
                      ? <span className={styles.tlIcon} aria-hidden="true"><Icon name={SCHEDULE_ICON[item.icon]} size={17} /></span>
                      : <span aria-hidden="true">{item.icon} </span>
                  )}
                  {item.title}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Location ── */}
      {visible && sec.location && siteLocation(site, ev) && (
        <section ref={locationRef} className={styles.section}>
          <h2 className={styles.secTitle}>מיקום והגעה</h2>
          <div className={styles.locCard}>
            <div className={styles.locAddr}><Icon name="pin" size={15} /> {siteLocation(site, ev)}</div>
            {site.parkingNote && <p className={styles.locNote}><Icon name="car" size={15} /> {site.parkingNote}</p>}
            <a
              className={styles.locBtn}
              href={site.wazeUrl || `https://waze.com/ul?q=${encodeURIComponent(siteLocation(site, ev))}`}
              target="_blank" rel="noopener noreferrer"
            >ניווט ב-Waze ←</a>
            {/* .ics rather than a Google/Outlook link: opens in whatever
                calendar the guest actually uses, with no account. */}
            {ev?.date && (
              <button
                type="button"
                className={styles.locBtnGhost}
                onClick={() => {
                  const ics = buildEventIcs({
                    name:      ev.name,
                    date:      ev.date,
                    venue:     siteLocation(site, ev),
                    startTime: knownStartTime(site.schedule),
                    url:       window.location.href,
                  });
                  if (ics) downloadIcs(ics, icsFileName(ev.name));
                }}
              ><Icon name="calendar" /> הוסיפו ליומן</button>
            )}
          </div>
        </section>
      )}

      {/* ── Dress code ── */}
      {visible && sec.dressCode && site?.dressCode && (
        <section className={styles.section}>
          <h2 className={styles.secTitle}>קוד לבוש</h2>
          <div className={styles.locCard}>
            <p className={styles.dressText}>{site.dressCode}</p>
          </div>
        </section>
      )}

      {/* ── Shuttles ── */}
      {visible && sec.shuttles && site?.shuttles?.length > 0 && (
        <section ref={shuttlesRef} className={styles.section}>
          <h2 className={styles.secTitle}>הסעות</h2>
          <div className={styles.locCard}>
            {site.shuttles.map(s => (
              <div key={s.id} className={styles.shuttleRow}>
                <span className={styles.shuttleTime}>{s.time}</span>
                <span className={styles.shuttleDir}>{s.direction}</span>
                <span className={styles.shuttlePlace}>
                  {s.place}
                  {s.contactName && (
                    <span className={styles.shuttleContact}>
                      {" · "}
                      {s.contactPhone
                        ? <a href={`https://wa.me/${String(s.contactPhone).replace(/[^\d]/g,"").replace(/^0/,"972")}`} target="_blank" rel="noopener noreferrer">{s.contactName} 📞</a>
                        : s.contactName}
                    </span>
                  )}
                  {s.note && <span className={styles.shuttleNote}>{s.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Gift ── */}
      {visible && sec.gift && giftUrl && (
        <section className={styles.section}>
          <h2 className={styles.secTitle}>מתנה</h2>
          <div className={styles.giftCard}>
            <p>גם אם לא תגיעו — אפשר לשמח אותנו במתנה ובברכה חמה.</p>
            <Link to={giftUrl} className={styles.locBtn}>למסך המתנה ←</Link>
          </div>
        </section>
      )}

      {/* ── Blessings wall (needs the gift page to collect blessings) ── */}
      {visible && sec.blessings && giftUrl && (
        <section ref={blessingsRef} className={styles.section}>
          <h2 className={styles.secTitle}>קיר ברכות</h2>
          {wishes.length === 0 ? (
            <div className={styles.wishEmpty}>
              <Icon name="mail" /> היו הראשונים לברך {giftUrl && <>— <Link to={giftUrl} className={styles.wishLink}>השאירו ברכה</Link></>}
            </div>
          ) : (
            <div className={styles.wishGrid}>
              {wishes.slice(0, 12).map(w => (
                <div key={w.id} className={styles.wishCard}>
                  {w.message && <p className={styles.wishMsg}>"{w.message}"</p>}
                  <span className={styles.wishName}>{w.donor_name}</span>
                </div>
              ))}
            </div>
          )}
          {/* The site shows the latest 12. Past that it said nothing, and the
              guest who just left the 13th blessing could not find it (WORKPLAN
              110). The full wall is one tap away. */}
          {wishes.length > 12 && (
            <p className={styles.wishMore}>
              <Link to={`${giftUrl}/wall`} className={styles.wishLink}>לכל {wishes.length} הברכות ←</Link>
            </p>
          )}
        </section>
      )}

      {/* ── Shared album ── */}
      {visible && albumUrl && (
        <section className={styles.section}>
          <h2 className={styles.secTitle}>אלבום האירוע</h2>
          <div className={styles.giftCard}>
            <p>צילמתם? העלו את התמונות שלכם לאלבום המשותף — וראו מה צילמו כולם.</p>
            <Link to={albumUrl} className={styles.locBtn}>לאלבום ←</Link>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {visible && sec.faq && faqAnswered.length > 0 && (
        <section ref={faqRef} className={styles.section}>
          <h2 className={styles.secTitle}>שאלות נפוצות</h2>
          <div className={styles.faqList}>
            {faqAnswered.map(f => <FaqItem key={f.id} q={f.q} a={f.a} />)}
          </div>
        </section>
      )}

      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        {site?.contactPhone && (
          <a className={styles.footContact} href={`https://wa.me/${site.contactPhone.replace(/[^\d]/g, "").replace(/^0/, "972")}`} target="_blank" rel="noopener noreferrer">
            יש שאלה? דברו איתנו בוואטסאפ
          </a>
        )}
        <Link to="/" className={styles.footBrand}>✦ נבנה עם {COMPANY.name}</Link>
        <Link to={token ? `/signup?ref=${token}` : "/signup"} className={styles.footPromo}>
          מתכננים אירוע? בנו אתר כזה בחינם ←
        </Link>
      </footer>
    </div>
  );
}

function Countdown({ date, time, styles }) {
  // The event's own start time, the same one the calendar button writes. It
  // was "T18:00" for every event, so a 21:00 wedding hit zero at 18:00.
  // In ISRAEL time, not the viewer's (29.9 review) — see israelInstant.
  const target = useMemo(() => israelInstant(date, time), [date, time]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // NOT switched to daysUntil(), and that is a decision rather than an
  // oversight — checklist item 80.
  //
  // This is a live d/h/m/s CLOCK, and its job is "how much time is left". The
  // fixed-millisecond division is exactly right for that: across Israel's
  // October fall-back a wedding seven calendar days out reads "6 ימים 23 שעות",
  // and that is TRUE — there really are 6 days and 23 hours until the start on the
  // day. Making the day cell calendar-based would print "7 ימים 23 שעות",
  // which is an hour of a day that does not exist.
  //
  // So the site's clock and the hub's "N ימים" can differ by one for a few
  // hours a year. They answer different questions, the hours cell resolves the
  // ambiguity on screen, and the alternative is a number that is simply wrong.
  // AnnouncementScreen is the one that had to change (item 71), because it
  // renders a SENTENCE — "N ימים לאירוע" — with no hours beside it.
  //
  // Nothing to count to: a date that does not parse used to render "NaN" in
  // every cell (FZ6), and an event that has already started used to sit at
  // 0 00 00 00 for ever after (36h). Both hide the section.
  if (!Number.isFinite(target) || target <= now) return null;
  const diff = target - now;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  // The day figure is the one a guest reads as a sentence ("עוד 1 ימים" the
  // day before the wedding); the padded clock units always read as numerals.
  //
  // יומיים is the Hebrew DUAL — it already means "two days" — so printing the
  // numeral beside it gave "2 יומיים", i.e. "2 two-days", for the whole 24
  // hours two days before every event. This is a four-cell numeral grid, so
  // blanking the cell would leave a hole; the dual is dropped instead and the
  // plural takes 2, exactly as AnnouncementScreen already does it.
  const dayLabel = d === 1 ? "יום" : "ימים";
  const units = [[d, dayLabel], [pad(h), "שעות"], [pad(m), "דקות"], [pad(s), "שניות"]];
  return (
    <section className={styles.section}>
      <h2 className={styles.secTitle}>הספירה לקראת האירוע</h2>
      <div className={styles.countdown}>
        {units.map(([val, label]) => (
          <div key={label} className={styles.cdUnit}>
            <span className={styles.cdNum}>{val}</span>
            <span className={styles.cdLabel}>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  const answerId = useId();
  // aria-expanded: the open/closed state was only the "+"/"−" glyph (סב89).
  return (
    <div className={styles.faqItem}>
      <button className={styles.faqQ} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={answerId}>
        <span>{q}</span>
        <span className={styles.faqChevron} aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && a && <p className={styles.faqA} id={answerId}>{a}</p>}
    </div>
  );
}
