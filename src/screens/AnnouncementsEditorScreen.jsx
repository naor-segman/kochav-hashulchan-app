import { useState, useRef } from "react";
import { SITE_THEME_LIST, SITE_FONTS, DEFAULT_SITE_FONT } from "../data/eventSiteTemplates.js";
import {
  ANNOUNCEMENT_KINDS, ANNOUNCEMENT_LAYOUTS,
  announcementRoute, defaultAnnouncement,
} from "../data/announcementTemplates.js";
import Field from "../components/ui/Field.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import QrCode from "../components/ui/QrCode.jsx";
import base from "../styles/screenBase.module.css";
import Icon from "../components/ui/Icon.jsx";
import styles from "./AnnouncementsEditorScreen.module.css";
import { useShareGate } from "../components/share/useShareGate.jsx";
import { uploadSitePhoto, deleteSitePhoto } from "../utils/sitePhotos.js";

/** Downscale + compress in the browser, returning a BLOB.
 *
 *  It used to resolve a data URL, and that data URL went into the event payload
 *  — so a 5MB phone photo became base64 inside the row and was re-uploaded to
 *  Postgres on every subsequent edit of the event. The bytes now go to Storage
 *  once, exactly as the event-site gallery does, and the event carries a URL. */
function compress(file, maxW = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        // toBlob, not toDataURL: base64 is a third larger than the bytes it
        // encodes, and it would only be decoded again to upload.
        c.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("compression produced nothing")),
          "image/jpeg",
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** The old shape, for an event with no cloud row to upload against. */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export default function AnnouncementsEditorScreen({ activeEvent: ev, patchEvent, showToast }) {
  // Sharing is the moment guest mode stops being free. A guest event has no
  // cloud row, so the link resolves to nothing for everyone it is sent to —
  // withholding it is honest; showing it and letting it be copied is not.
  const { guard, gate } = useShareGate();
  const [kind, setKind] = useState("saveTheDate");
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const meta = ANNOUNCEMENT_KINDS.find(k => k.key === kind);
  const ann  = ev.announcements?.[kind] || defaultAnnouncement(kind, ev.type);

  const set = (patch) => patchEvent(e => ({
    ...e,
    announcements: {
      ...(e.announcements || {}),
      [kind]: { ...(e.announcements?.[kind] || defaultAnnouncement(kind, e.type)), ...patch },
    },
  }));

  const token = ev.tokens?.invite;
  const url   = token ? `${window.location.origin}/${announcementRoute(kind)}/${token}` : "";

  const copy = () => guard("קישור ההזמנה", doCopy);

  const doCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("לא הצלחנו להעתיק — סמנו והעתיקו ידנית", "err");
    }
  };

  const pickPhoto = async (file) => {
    if (!file) return;
    try {
      const blob = await compress(file);
      const prev = ann.photo;

      // Storage when the event has a cloud row; base64 when it does not, and
      // base64 again if the upload fails — losing the photo a host just picked
      // is worse than an event that is briefly heavier. `failed` and "never
      // synced" are kept apart on purpose: guest mode is not a failure, and
      // reporting it as one raises a red alarm about nothing.
      let src, failed = false, reason = "";
      if (ev.cloudId) {
        try { src = await uploadSitePhoto(ev.cloudId, blob); }
        catch (e) { src = await blobToDataUrl(blob); failed = true; reason = e?.message || String(e); }
      } else {
        src = await blobToDataUrl(blob);
      }

      set({ photo: src });
      // The photo it replaced is unreachable the moment the field changes.
      // Best effort — a host swapping an image is not made to care that the
      // old file could not be removed.
      deleteSitePhoto(prev);

      showToast(
        failed ? `התמונה נשמרה על המכשיר הזה בלבד — ההעלאה לענן נכשלה: ${reason}` : "התמונה הוחלפה ✓",
        failed ? "err" : undefined
      );
    } catch {
      showToast("לא הצלחנו לקרוא את התמונה", "err");
    }
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="Save the Date והזמנה"
        mark="announcements"
        sub="שני דפים מעוצבים לאותו אירוע — אחד לשמירת התאריך, אחד להזמנה עצמה."
      />

      {/* Which of the two we're editing */}
      <div className={styles.kindTabs} role="group" aria-label="בחירת סוג הדף">
        {ANNOUNCEMENT_KINDS.map(k => {
          const on = ev.announcements?.[k.key]?.enabled;
          return (
            <button
              key={k.key}
              className={[styles.kindTab, kind === k.key ? styles.kindActive : ""].filter(Boolean).join(" ")}
              onClick={() => { setKind(k.key); setPreview(false); }}
              aria-pressed={kind === k.key}
              type="button"
            >
              <Icon name={k.icon} size={15} /> {k.label}
              <span className={[styles.dot, on ? styles.dotOn : ""].filter(Boolean).join(" ")} title={on ? "מפורסם" : "לא מפורסם"} />
            </button>
          );
        })}
      </div>

      {/* Publish + link */}
      <div className={base.card}>
        <SectionLabel>פרסום</SectionLabel>
        <p className={base.fieldHint}>
          {ann.enabled
            ? "הדף מפורסם — כל מי שיש לו את הקישור יכול לראות אותו."
            : "הדף עדיין לא מפורסם. אפשר לערוך בשקט; מי שייכנס לקישור יראה הודעה שהדף בהכנה."}
        </p>
        <div className={styles.publishRow}>
          <button
            className={ann.enabled ? base.btnSecondary : base.btnPrimary}
            onClick={() => set({ enabled: !ann.enabled })}
          >
            {ann.enabled ? "בטלו פרסום" : `פרסמו ${meta.label} ←`}
          </button>
          <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => setPreview(p => !p)} aria-expanded={preview}>
            {preview ? "סגרו תצוגה" : "תצוגה מקדימה"}
          </button>
        </div>

        {token ? (
          <div className={styles.shareRow}>
            <input className={[base.input, styles.shareInput].join(" ")} readOnly value={url} dir="ltr" aria-label="קישור לדף" />
            <button className={base.btnSm} onClick={copy}>{copied ? "הועתק ✓" : "העתיקו"}</button>
            <QrCode url={url} label={meta.label} filename={`${meta.label}.png`} />
          </div>
        ) : (
          <p className={base.fieldHint}>הקישור ייווצר אחרי השמירה הראשונה של האירוע.</p>
        )}

        {preview && (
          <div className={styles.previewStage}>
            {/* Version in the key so an edit actually remounts the frame —
                otherwise the preview froze at whatever the state was when it
                was opened. */}
            <iframe
              key={kind + ":" + (ev.version ?? 0)}
              className={styles.previewFrame}
              src={`/events/${ev.id}/preview-announce/${kind}`}
              title={`תצוגה מקדימה — ${meta.label}`}
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={base.card}>
        <SectionLabel>תוכן</SectionLabel>
        <div className={base.grid2}>
          <Field label="כותרת ראשית" hint="מה שקופץ לעין">
            <input className={base.input} value={ann.headline}
              onChange={e => set({ headline: e.target.value })} />
          </Field>
          <Field label="כותרת עליונה" hint="שורה קטנה מעל השמות">
            <input className={base.input} value={ann.subheadline}
              onChange={e => set({ subheadline: e.target.value })} />
          </Field>
        </div>
        <Field label="הודעה אישית" hint="אופציונלי — נשמר על שתי שורות">
          <textarea className={base.input} rows={3} value={ann.message}
            onChange={e => set({ message: e.target.value })} />
        </Field>
        <p className={base.fieldHint}>
          השמות, התאריך והמיקום נלקחים אוטומטית מפרטי האירוע — אין צורך להקליד אותם כאן.
        </p>
      </div>

      {/* Design */}
      <div className={base.card}>
        <SectionLabel>עיצוב</SectionLabel>

        <p className={base.fieldHint}>ערכת צבעים</p>
        <div className={styles.themeGrid}>
          {SITE_THEME_LIST.map(t => (
            <button
              key={t.key}
              className={[styles.themeSwatch, ann.themeKey === t.key ? styles.themeActive : ""].filter(Boolean).join(" ")}
              onClick={() => set({ themeKey: t.key })}
              type="button"
              aria-pressed={ann.themeKey === t.key}
            >
              <span className={styles.themeColors}>
                <span style={{ background: t.bg }} />
                <span style={{ background: t.accent }} />
                <span style={{ background: t.ink }} />
              </span>
              <span className={styles.swatchName}>{t.label}</span>
            </button>
          ))}
        </div>

        <p className={base.fieldHint} style={{ marginTop: 14 }}>גופן</p>
        <div className={styles.fontGrid}>
          {SITE_FONTS.map(f => (
            <button
              key={f.key}
              className={[styles.fontSwatch, (ann.fontKey || DEFAULT_SITE_FONT) === f.key ? styles.themeActive : ""].filter(Boolean).join(" ")}
              onClick={() => set({ fontKey: f.key })}
              type="button"
              aria-pressed={(ann.fontKey || DEFAULT_SITE_FONT) === f.key}
            >
              <span className={styles.fontSample} style={{ fontFamily: f.stack }}>{f.sample}</span>
              <span className={styles.swatchName}>{f.label}</span>
            </button>
          ))}
        </div>

        <p className={base.fieldHint} style={{ marginTop: 14 }}>פריסה</p>
        <div className={styles.fontGrid}>
          {ANNOUNCEMENT_LAYOUTS.map(l => (
            <button
              key={l.key}
              className={[styles.layoutBtn, ann.layout === l.key ? styles.themeActive : ""].filter(Boolean).join(" ")}
              onClick={() => set({ layout: l.key })}
              type="button"
              aria-pressed={ann.layout === l.key}
            >{l.label}</button>
          ))}
        </div>

        <p className={base.fieldHint} style={{ marginTop: 14 }}>תמונת רקע</p>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { pickPhoto(e.target.files[0]); e.target.value = ""; }} />
        <div className={styles.photoRow}>
          <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => fileRef.current?.click()}>
            {ann.photo ? "החליפו תמונה" : "העלו תמונה"}
          </button>
          {ann.photo && (
            <>
              <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => set({ photo: null })}>
                הסירו
              </button>
              <img className={styles.photoThumb} src={ann.photo} alt="" />
            </>
          )}
        </div>
      </div>

      {/* What to show */}
      <div className={base.card}>
        <SectionLabel>מה להציג</SectionLabel>
        <div className={styles.toggles}>
          {[
            ["showCountdown", "ספירה לאחור"],
            ["showLocation",  "מיקום האירוע"],
            ["showRsvp",      "כפתור אישור הגעה"],
            ["showSite",      "קישור לאתר האירוע"],
          ].map(([key, label]) => (
            <label key={key} className={styles.toggle}>
              <input type="checkbox" checked={!!ann[key]} onChange={e => set({ [key]: e.target.checked })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {kind === "saveTheDate" && ann.showRsvp && (
          <p className={base.fieldHint}>
            <Icon name="bulb" /> Save the Date נשלח בדרך כלל חודשים מראש — שקלו אם אישורי ההגעה כבר פתוחים.
          </p>
        )}
      </div>
      {gate}
    </div>
  );
}
