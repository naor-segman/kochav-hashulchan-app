import { useState, useRef, useCallback } from "react";
import Icon from "../components/ui/Icon.jsx";
import { uid } from "../utils/uid.js";
import { SITE_THEME_LIST } from "../data/eventSiteTemplates.js";
import Banner from "../components/feedback/Banner.jsx";
import Field from "../components/ui/Field.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./EventSiteEditorScreen.module.css";

// Compress an uploaded cover photo to a reasonable data URL for the site.
// Kept modest (stored in payload JSONB + served via the public RPC) — a future
// improvement is to move covers to Supabase Storage and sync only a URL.
async function compressImage(file, maxPx = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        let { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxPx / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

export default function EventSiteEditorScreen({ activeEvent: ev, patchEvent, showToast }) {
  const site = ev.eventSite;
  const fileRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Patch a shallow field on eventSite.
  const set = useCallback((patch) => {
    patchEvent(e => ({ ...e, eventSite: { ...e.eventSite, ...patch } }));
  }, [patchEvent]);

  const setSection = (key, val) =>
    patchEvent(e => ({ ...e, eventSite: { ...e.eventSite, sections: { ...e.eventSite.sections, [key]: val } } }));

  // Schedule editing
  const addSchedule = () => set({ schedule: [...site.schedule, { id: uid(), time: "", title: "", icon: "•" }] });
  const editSchedule = (id, patch) => set({ schedule: site.schedule.map(s => s.id === id ? { ...s, ...patch } : s) });
  const delSchedule = (id) => set({ schedule: site.schedule.filter(s => s.id !== id) });

  // Shuttle editing
  const addShuttle = () => set({ shuttles: [...(site.shuttles || []), { id: uid(), direction: "הלוך", place: "", time: "" }] });
  const editShuttle = (id, patch) => set({ shuttles: site.shuttles.map(s => s.id === id ? { ...s, ...patch } : s) });
  const delShuttle = (id) => set({ shuttles: site.shuttles.filter(s => s.id !== id) });

  // FAQ editing
  const addFaq = () => set({ faq: [...site.faq, { id: uid(), q: "", a: "" }] });
  const editFaq = (id, patch) => set({ faq: site.faq.map(f => f.id === id ? { ...f, ...patch } : f) });
  const delFaq = (id) => set({ faq: site.faq.filter(f => f.id !== id) });

  const onCover = async (file) => {
    if (!file || !file.type.startsWith("image/")) { showToast("יש לבחור קובץ תמונה", "err"); return; }
    try { set({ coverPhoto: await compressImage(file) }); showToast("תמונת הרקע הועלתה ✓"); }
    catch { showToast("שגיאה בעיבוד התמונה", "err"); }
  };

  const onGallery = async (files) => {
    const imgs = [...files].filter(f => f.type.startsWith("image/")).slice(0, 12);
    if (!imgs.length) { showToast("יש לבחור קובצי תמונה", "err"); return; }
    try {
      const compressed = await Promise.all(imgs.map(f => compressImage(f, 1000, 0.7)));
      set({ gallery: [...(site.gallery || []), ...compressed].slice(0, 12) });
      showToast(`נוספו ${compressed.length} תמונות ✓`);
    } catch { showToast("שגיאה בעיבוד התמונות", "err"); }
  };
  const delGalleryPhoto = (i) => set({ gallery: (site.gallery || []).filter((_, idx) => idx !== i) });

  const siteUrl = window.location.origin + "/invite/" + (ev.tokens?.invite || "");
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(siteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { showToast("לא ניתן להעתיק — העתק ידנית", "err"); }
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="אתר האירוע"
        icon={<Icon name="globe" />}
        sub="בנו את אתר האירוע שלכם — הוא נבנה אוטומטית ונשלח לאורחים. מלאו פרטים, בחרו עיצוב, ופרסמו."
      />

      {/* ── Publish + share ── */}
      <div className={[base.card, site.enabled ? "" : base.cardDirty].filter(Boolean).join(" ")}>
        <div className={styles.publishRow}>
          <div>
            <div className={styles.publishTitle}>{site.enabled ? "האתר מפורסם ✓" : "האתר עדיין לא מפורסם"}</div>
            <div className={styles.publishSub}>
              {site.enabled ? "האורחים שנכנסים לקישור רואים את האתר המלא." : "פרסמו כדי שהאורחים יראו את האתר בקישור."}
            </div>
          </div>
          <button
            className={site.enabled ? [base.btnSecondary].join(" ") : base.btnPrimary}
            onClick={() => set({ enabled: !site.enabled })}
          >
            {site.enabled ? "בטלו פרסום" : "פרסמו אתר ←"}
          </button>
        </div>
        <div className={styles.shareRow}>
          <input className={[base.input, styles.shareInput].join(" ")} readOnly value={siteUrl} dir="ltr" />
          <button className={base.btnSm} onClick={copyLink}>{copied ? "הועתק ✓" : "העתק"}</button>
          <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => window.open("/events/" + ev.id + "/preview-site", "_blank")}>תצוגה מקדימה</button>
        </div>
      </div>

      {/* ── Share with guests ── */}
      {site.enabled && (
        <div className={base.card}>
          <SectionLabel>שתפו עם האורחים</SectionLabel>
          <p className={base.fieldHint}>
            הודעות מוכנות לשליחה בוואטסאפ — עם קישור לאתר האירוע. העתיקו או שלחו ישירות.
          </p>
          {[
            { key: "invite", label: "הזמנה", text: `היי! אתם מוזמנים ל${ev.name || "אירוע שלנו"} 💛\nכל הפרטים ואישור הגעה כאן:\n${siteUrl}` },
            { key: "remind", label: "תזכורת", text: `רק תזכורת קטנה — ${ev.name || "האירוע"} מתקרב! 🎉\nפרטים ואישור הגעה:\n${siteUrl}` },
            { key: "thanks", label: "תודה", text: `תודה מכל הלב שחגגתם איתנו! 💛\nהייתם חלק מהרגעים הכי מרגשים שלנו.` },
          ].map(m => (
            <div key={m.key} className={styles.msgRow}>
              <div className={styles.msgInfo}>
                <span className={styles.msgLabel}>{m.label}</span>
                <span className={styles.msgPreview}>{m.text.split("\n")[0]}</span>
              </div>
              <div className={styles.msgActions}>
                <button
                  className={base.btnSm}
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(m.text); showToast("ההודעה הועתקה ✓"); }
                    catch { showToast("לא ניתן להעתיק", "err"); }
                  }}
                >העתיקו</button>
                <a
                  className={[base.btnSm, styles.msgWa].join(" ")}
                  href={`https://wa.me/?text=${encodeURIComponent(m.text)}`}
                  target="_blank" rel="noopener noreferrer"
                >שלחו בוואטסאפ</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Theme ── */}
      <div className={base.card}>
        <SectionLabel>עיצוב האתר</SectionLabel>
        <p className={base.fieldHint}>בחרו ערכת צבעים לאתר האירוע שלכם.</p>
        <div className={styles.themeGrid}>
          {SITE_THEME_LIST.map(t => (
            <button
              key={t.key}
              className={[styles.themeSwatch, site.themeKey === t.key ? styles.themeActive : ""].filter(Boolean).join(" ")}
              onClick={() => set({ themeKey: t.key })}
              type="button"
            >
              <span className={styles.themeColors}>
                <span style={{ background: t.bg }} />
                <span style={{ background: t.accent }} />
                <span style={{ background: t.ink }} />
              </span>
              <span className={styles.themeName}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <div className={base.card}>
        <SectionLabel>ראש האתר</SectionLabel>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { if (e.target.files[0]) onCover(e.target.files[0]); e.target.value = ""; }} />
        <div className={styles.coverRow}>
          <div className={styles.coverPreview} style={site.coverPhoto ? { backgroundImage: `url(${site.coverPhoto})` } : undefined}>
            {!site.coverPhoto && <span>אין תמונה</span>}
          </div>
          <div className={styles.coverActions}>
            <button className={base.btnSecondary} onClick={() => fileRef.current?.click()}>
              {site.coverPhoto ? "החליפו תמונת רקע" : "העלו תמונת רקע"}
            </button>
            {site.coverPhoto && (
              <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => set({ coverPhoto: null })}>הסירו</button>
            )}
          </div>
        </div>
        <div className={base.grid2}>
          <Field label="כותרת באנגלית" hint="מופיע מתחת לשמות (למשל OUR WEDDING DAY)">
            <input className={base.input} value={site.heroEn} dir="ltr"
              onChange={e => set({ heroEn: e.target.value })} />
          </Field>
        </div>
        <Field label="כמה מילים עליכם (אופציונלי)">
          <textarea className={base.textarea} rows={3} value={site.story}
            placeholder="ספרו לאורחים קצת על האירוע…"
            onChange={e => set({ story: e.target.value })} />
        </Field>
      </div>

      {/* ── Gallery ── */}
      <div className={base.card}>
        <div className={styles.secToggleHead}>
          <SectionLabel>גלריית תמונות</SectionLabel>
          <Toggle on={site.sections.gallery !== false} onChange={v => setSection("gallery", v)} />
        </div>
        <p className={base.fieldHint}>עד 12 תמונות. הראשונה תוצג גדולה יותר.</p>
        {(site.gallery || []).length > 0 && (
          <div className={styles.galleryEdit}>
            {(site.gallery || []).map((src, i) => (
              <div key={i} className={styles.galleryEditItem} style={{ backgroundImage: `url(${src})` }}>
                <button className={styles.galleryDel} onClick={() => delGalleryPhoto(i)} title="הסרה">✕</button>
              </div>
            ))}
          </div>
        )}
        <label className={base.btnSecondary} style={{ cursor: "pointer", display: "inline-block", marginTop: 10 }}>
          + הוסיפו תמונות
          <input type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { onGallery(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {/* ── Countdown + Dress code ── */}
      <div className={base.card}>
        <div className={styles.secToggleHead}>
          <SectionLabel>ספירה לאחור</SectionLabel>
          <Toggle on={site.countdown !== false} onChange={v => set({ countdown: v })} />
        </div>
        <p className={base.fieldHint}>ספירת ימים לקראת מועד האירוע.</p>
        <div className={styles.secToggleHead} style={{ marginTop: 18 }}>
          <SectionLabel>קוד לבוש</SectionLabel>
          <Toggle on={site.sections.dressCode === true} onChange={v => setSection("dressCode", v)} />
        </div>
        <Field label="הנחיית לבוש לאורחים (אופציונלי)">
          <textarea className={base.textarea} rows={2} value={site.dressCode}
            placeholder="למשל: לבוש חגיגי · צבעים בהירים מומלצים"
            onChange={e => set({ dressCode: e.target.value })} />
        </Field>
      </div>

      {/* ── Schedule ── */}
      <div className={base.card}>
        <div className={styles.secToggleHead}>
          <SectionLabel>לוז האירוע</SectionLabel>
          <Toggle on={site.sections.schedule} onChange={v => setSection("schedule", v)} />
        </div>
        {site.schedule.map(item => (
          <div key={item.id} className={styles.scheduleRow}>
            <input className={[base.input, styles.timeInput].join(" ")} type="time" value={item.time}
              onChange={e => editSchedule(item.id, { time: e.target.value })} />
            <input className={[base.input, styles.iconInput].join(" ")} value={item.icon} placeholder="💍"
              onChange={e => editSchedule(item.id, { icon: e.target.value })} />
            <input className={base.input} value={item.title} placeholder="חופה"
              onChange={e => editSchedule(item.id, { title: e.target.value })} />
            <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delSchedule(item.id)}>✕</button>
          </div>
        ))}
        <button className={base.btnSecondary} onClick={addSchedule}>+ הוסיפו שלב</button>
      </div>

      {/* ── Location ── */}
      <div className={base.card}>
        <div className={styles.secToggleHead}>
          <SectionLabel>מיקום והגעה</SectionLabel>
          <Toggle on={site.sections.location} onChange={v => setSection("location", v)} />
        </div>
        <Field label="כתובת מלאה">
          <input className={base.input} value={site.address} placeholder="רחוב, מספר, עיר"
            onChange={e => set({ address: e.target.value })} />
        </Field>
        <div className={base.grid2}>
          <Field label="קישור Waze (אופציונלי)" hint="אם ריק — ניצור אוטומטית מהכתובת">
            <input className={base.input} value={site.wazeUrl} dir="ltr" placeholder="https://waze.com/ul?q=..."
              onChange={e => set({ wazeUrl: e.target.value })} />
          </Field>
          <Field label="הערת חניה (אופציונלי)">
            <input className={base.input} value={site.parkingNote} placeholder="חניה חינם בחניון..."
              onChange={e => set({ parkingNote: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* ── Shuttles ── */}
      <div className={base.card}>
        <div className={styles.secToggleHead}>
          <SectionLabel>הסעות</SectionLabel>
          <Toggle on={site.sections.shuttles} onChange={v => setSection("shuttles", v)} />
        </div>
        <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>הוסיפו מסלולי הסעה הלוך וחזור עם שעות ונקודות איסוף.</p>
        {(site.shuttles || []).map(s => (
          <div key={s.id} className={styles.scheduleRow}>
            <input className={[base.input, styles.timeInput].join(" ")} type="time" value={s.time}
              onChange={e => editShuttle(s.id, { time: e.target.value })} />
            <select className={[base.select, styles.dirSelect].join(" ")} value={s.direction}
              onChange={e => editShuttle(s.id, { direction: e.target.value })}>
              <option>הלוך</option>
              <option>חזור</option>
            </select>
            <input className={base.input} value={s.place} placeholder="נקודת איסוף — נס ציונה"
              onChange={e => editShuttle(s.id, { place: e.target.value })} />
            <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delShuttle(s.id)}>✕</button>
            <input className={base.input} value={s.contactName || ""} placeholder="איש קשר (אופציונלי)"
              onChange={e => editShuttle(s.id, { contactName: e.target.value })} />
            <input className={base.input} value={s.contactPhone || ""} placeholder="טלפון איש קשר" dir="ltr"
              onChange={e => editShuttle(s.id, { contactPhone: e.target.value })} />
          </div>
        ))}
        <button className={base.btnSecondary} onClick={addShuttle}>+ הוסיפו הסעה</button>
      </div>

      {/* ── Blessings + gift toggles ── */}
      <div className={base.card}>
        <SectionLabel>מקטעים נוספים</SectionLabel>
        <div className={styles.toggleList}>
          <div className={styles.toggleRow}>
            <span>מתנה 💝 — קישור למסך המתנה</span>
            <Toggle on={site.sections.gift} onChange={v => setSection("gift", v)} />
          </div>
          <div className={styles.toggleRow}>
            <span>קיר ברכות 💌 — ברכות מהאורחים</span>
            <Toggle on={site.sections.blessings} onChange={v => setSection("blessings", v)} />
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div className={base.card}>
        <div className={styles.secToggleHead}>
          <SectionLabel>שאלות נפוצות</SectionLabel>
          <Toggle on={site.sections.faq} onChange={v => setSection("faq", v)} />
        </div>
        {site.faq.map(f => (
          <div key={f.id} className={styles.faqEdit}>
            <div className={styles.faqEditTop}>
              <input className={base.input} value={f.q} placeholder="השאלה"
                onChange={e => editFaq(f.id, { q: e.target.value })} />
              <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delFaq(f.id)}>✕</button>
            </div>
            <textarea className={base.textarea} rows={2} value={f.a} placeholder="התשובה"
              onChange={e => editFaq(f.id, { a: e.target.value })} />
          </div>
        ))}
        <button className={base.btnSecondary} onClick={addFaq}>+ הוסיפו שאלה</button>
      </div>

      {/* ── Personal message + contact ── */}
      <div className={base.card}>
        <SectionLabel>הודעה אישית ויצירת קשר</SectionLabel>
        <Field label="הודעה אישית מכם (אופציונלי)" hint='תוצג לאורח אחרי אישור ההגעה. למשל: "היי, כאן נאור וירדן — כיף שאתם באים לחגוג איתנו!"'>
          <textarea className={base.textarea} rows={2} value={site.rsvpMessage}
            placeholder="כמה מילים חמות מכם לאורחים…"
            onChange={e => set({ rsvpMessage: e.target.value })} />
        </Field>
        <Field label="טלפון לוואטסאפ (אופציונלי)" hint="אורחים יוכלו לפנות אליכם ישירות מהאתר">
          <input className={base.input} value={site.contactPhone} placeholder="050-1234567" inputMode="tel"
            onChange={e => set({ contactPhone: e.target.value })} />
        </Field>
      </div>

      {!site.enabled && (
        <Banner variant="warn">
          האתר עדיין לא מפורסם — האורחים לא יראו אותו עד שתלחצו "פרסמו אתר" למעלה.
        </Banner>
      )}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      className={[styles.toggle, on ? styles.toggleOn : ""].filter(Boolean).join(" ")}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={on ? "פעיל" : "כבוי"}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}
