import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, fetchGiftWall } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { getSiteTheme } from "../data/eventSiteTemplates.js";
import styles from "./EventSiteScreen.module.css";

// Map a local (host-owned) event into the public-site shape, so the host can
// preview drafts securely from inside the authenticated app.
function fromLocalEvent(le) {
  return {
    name: le.name, type: le.type, date: le.date, venue: le.venue,
    brideName: le.brideName, groomName: le.groomName, celebrantName: le.celebrantName,
    organizationName: le.organizationName, ownerName: le.ownerName,
    site: le.eventSite,
    rsvpToken: le.tokens?.rsvp ?? null, giftToken: le.tokens?.gift ?? null,
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

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const HE_MONTHS = ["בינואר","בפברואר","במרץ","באפריל","במאי","ביוני","ביולי","באוגוסט","בספטמבר","באוקטובר","בנובמבר","בדצמבר"];
function heDate(str) {
  if (!str) return "";
  const d = new Date(str + "T12:00:00");
  if (isNaN(d.getTime())) return str;
  return `יום ${HE_DAYS[d.getDay()]}, ${d.getDate()} ${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function hostsLabel(ev) {
  if (ev.brideName && ev.groomName) return `${ev.brideName} & ${ev.groomName}`;
  return ev.celebrantName || ev.organizationName || ev.ownerName || ev.name || "";
}

export default function EventSiteScreen({ localEvent }) {
  const { token } = useParams();
  // Host preview: rendered inside the app with the owner's local event data.
  const isPreview = !!localEvent;
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [wishes, setWishes] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const scheduleRef = useRef(null);
  const locationRef = useRef(null);
  const shuttlesRef = useRef(null);
  const blessingsRef = useRef(null);
  const faqRef = useRef(null);

  useEffect(() => {
    if (localEvent) { setEv(fromLocalEvent(localEvent)); setState("ready"); return; }
    let cancelled = false;
    (async () => {
      const data = await fetchEventByToken("invite", token);
      if (cancelled) return;
      if (data) { setEv(data); setState("ready"); }
      else if (!isSupabaseConfigured || import.meta.env.DEV) { setEv(MOCK); setState("ready"); }
      else setState("notfound");
    })();
    return () => { cancelled = true; };
  }, [token, localEvent]);

  const site = ev?.site;
  useEffect(() => {
    if (!ev?.giftToken || !site?.sections?.blessings) return;
    let cancelled = false;
    fetchGiftWall(ev.giftToken).then(rows => { if (!cancelled) setWishes(rows || []); });
    return () => { cancelled = true; };
  }, [ev?.giftToken, site?.sections?.blessings]);

  const theme = useMemo(() => getSiteTheme(site?.themeKey), [site?.themeKey]);
  const themeVars = useMemo(() => ({
    "--s-bg": theme.bg, "--s-surface": theme.surface, "--s-ink": theme.ink,
    "--s-muted": theme.muted, "--s-accent": theme.accent, "--s-accent-soft": theme.accentSoft,
    "--s-line": theme.line, "--s-on-accent": theme.onAccent,
  }), [theme]);

  if (state === "loading") {
    return <div className={styles.stateWrap}><span className={styles.stateStar}>✦</span><p>טוען…</p></div>;
  }
  if (state === "notfound") {
    return (
      <div className={styles.stateWrap}>
        <span className={styles.stateStar}>✦</span>
        <p>הקישור אינו תקין או שפג תוקפו</p>
        <Link to="/" className={styles.stateLink}>לדף הבית</Link>
      </div>
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

  const navItems = !visible ? [] : [
    site?.schedule?.length && sec.schedule && { label: "לוז", key: "schedule" },
    (site?.address) && sec.location && { label: "מיקום", key: "location" },
    site?.shuttles?.length && sec.shuttles && { label: "הסעות", key: "shuttles" },
    sec.blessings && { label: "ברכות", key: "blessings" },
    site?.faq?.length && sec.faq && { label: "שאלות", key: "faq" },
  ].filter(Boolean);
  const showRsvp = visible && rsvpUrl;

  return (
    <div className={styles.site} style={themeVars}>
      {/* ── Sticky mini-nav ── */}
      <nav className={styles.nav}>
        <span className={styles.navBrand}>✦ {hosts}</span>
        <div className={styles.navRight}>
          {showRsvp && <Link to={rsvpUrl} className={styles.navRsvp}>אישור הגעה</Link>}
          {navItems.length > 0 && (
            <button className={styles.navBurger} onClick={() => setMenuOpen(o => !o)} aria-label="תפריט">
              {menuOpen ? "✕" : "☰"}
            </button>
          )}
        </div>
        {menuOpen && (
          <div className={styles.navMenu}>
            {navItems.map((it) => (
              <button key={it.key} onClick={() => scrollTo(it.key)}>{it.label}</button>
            ))}
          </div>
        )}
      </nav>

      {/* ── Hero (only once published / in host preview) ── */}
      {visible && (
        <header className={styles.hero}>
          {site?.coverPhoto && (
            <div className={styles.heroPhoto} style={{ backgroundImage: `url(${site.coverPhoto})` }} aria-hidden="true" />
          )}
          <div className={styles.heroInner}>
            <span className={styles.heroTag}>{ev.type}</span>
            <div className={styles.heroNames}>{hosts}</div>
            {site?.heroEn && <div className={styles.heroEn}>{site.heroEn}</div>}
            <div className={styles.heroDivider}><span /><span className={styles.heroStar}>✦</span><span /></div>
            {dateStr && <div className={styles.heroDate}>{dateStr}</div>}
            {ev.venue && <div className={styles.heroVenue}>📍 {ev.venue}</div>}
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
          <p>האתר בהכנה 💛<br />בעלי השמחה יפרסמו אותו בקרוב.</p>
        </div>
      )}

      {/* ── Countdown ── */}
      {visible && site?.countdown !== false && ev.date && (
        <Countdown date={ev.date} styles={styles} />
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
                <span className={styles.tlTitle}>{item.icon} {item.title}</span>
                <span className={styles.tlDot} aria-hidden="true" />
                <span className={styles.tlTime}>{item.time}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Location ── */}
      {visible && sec.location && site?.address && (
        <section ref={locationRef} className={styles.section}>
          <h2 className={styles.secTitle}>מיקום והגעה</h2>
          <div className={styles.locCard}>
            <div className={styles.locAddr}>📍 {site.address}</div>
            {site.parkingNote && <p className={styles.locNote}>🅿️ {site.parkingNote}</p>}
            {(site.wazeUrl || site.address) && (
              <a
                className={styles.locBtn}
                href={site.wazeUrl || `https://waze.com/ul?q=${encodeURIComponent(site.address)}`}
                target="_blank" rel="noopener noreferrer"
              >ניווט ב-Waze ←</a>
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
              💌 היו הראשונים לברך {giftUrl && <>— <Link to={giftUrl} className={styles.wishLink}>השאירו ברכה</Link></>}
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
        </section>
      )}

      {/* ── FAQ ── */}
      {visible && sec.faq && site?.faq?.length > 0 && (
        <section ref={faqRef} className={styles.section}>
          <h2 className={styles.secTitle}>שאלות נפוצות</h2>
          <div className={styles.faqList}>
            {site.faq.filter(f => f.q).map(f => <FaqItem key={f.id} q={f.q} a={f.a} />)}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        {site?.contactPhone && (
          <a className={styles.footContact} href={`https://wa.me/${site.contactPhone.replace(/[^\d]/g, "").replace(/^0/, "972")}`} target="_blank" rel="noopener noreferrer">
            יש שאלה? דברו איתנו בוואטסאפ
          </a>
        )}
        <Link to="/" className={styles.footBrand}>✦ נבנה בכוכב השולחן</Link>
        <Link to={token ? `/signup?ref=${token}` : "/signup"} className={styles.footPromo}>
          מתכננים אירוע? בנו אתר כזה בחינם ←
        </Link>
      </footer>
    </div>
  );
}

function Countdown({ date, styles }) {
  const target = useMemo(() => new Date(date + "T18:00:00").getTime(), [date]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const units = [[d, "ימים"], [pad(h), "שעות"], [pad(m), "דקות"], [pad(s), "שניות"]];
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
  return (
    <div className={styles.faqItem}>
      <button className={styles.faqQ} onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span className={styles.faqChevron}>{open ? "−" : "+"}</span>
      </button>
      {open && a && <p className={styles.faqA}>{a}</p>}
    </div>
  );
}
