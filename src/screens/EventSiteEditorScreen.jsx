import { useState, useRef, useCallback } from "react";
import { uid } from "../utils/uid.js";
import { uploadSitePhoto, deleteSitePhoto } from "../utils/sitePhotos.js";
import { compressImage, blobToDataUrl } from "../utils/imageCompress.js";
import { SITE_THEME_LIST, SITE_FONTS, DEFAULT_SITE_FONT } from "../data/eventSiteTemplates.js";
import Banner from "../components/feedback/Banner.jsx";
import PhotoRetentionNotice from "../components/feedback/PhotoRetentionNotice.jsx";
import Field from "../components/ui/Field.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./EventSiteEditorScreen.module.css";
import { useShareGate } from "../components/share/useShareGate.jsx";
import { prefixed } from "../utils/hebrewPrefix.js";

// `compressImage` and `blobToDataUrl` moved to utils/imageCompress.js, where
// the cover, the gallery and the invitation photo now share one implementation
// — and where the output format became WebP on browsers that can encode it,
// measured at 28% smaller on real photographs (qa/webpGain.mjs).

// Six was the cap that kept a 400-guest wedding inside Safari's ~5MB per-origin
// budget, back when each photo was base64 inside the event: a full gallery
// measured 3.03MB on its own, two events overflowed, and `persist` then failed
// for the WHOLE `{events}` blob rather than the large one — every event
// silently reverting to its last good snapshot on reload.
//
// Both reasons to keep it low are gone, and the second was measured rather
// than assumed:
//
//   STORAGE — a stored photo is a URL of about 120 bytes, so the same wedding
//   is ~204KB whatever the gallery holds.
//
//   MONEY — measured against the real Supabase meters, after two wrong
//   answers. The first put a 300-guest wedding at 0.47GB of billable egress by
//   counting every guest as an origin fetch. The second corrected that to
//   ~1.6MB by noting the one-year cache header — and was also wrong, because
//   CACHED egress is metered too, on its own 5GB monthly quota. That quota is
//   the binding one: a 300-guest event with ten photos delivers ~0.94GB, so the
//   free tier carries about FIVE events a month.
//
//   It still is not a reason to keep the cap at six. On Pro's 250GB the same
//   number is ~265 events a month, and beyond that cached egress is $0.03/GB —
//   about three agorot per additional event. The photos are not what decides
//   the bill.
//
// What is left is the only thing that was ever a real trade: how heavy the
// page is for a guest opening it on mobile data. Ten photos at 271KB each is
// ~2.7MB — a few seconds on a normal connection, and enough that a gallery
// reads as a gallery. Raised at the owner's decision, with those numbers in
// front of him.
const GALLERY_MAX = 10;

export default function EventSiteEditorScreen({ activeEvent: ev, patchEvent, showToast }) {
  // Sharing is the moment guest mode stops being free. A guest event has no
  // cloud row, so the link resolves to nothing for everyone it is sent to —
  // withholding it is honest; showing it and letting it be copied is not.
  const { guard, gate } = useShareGate();
  // null = preview closed. Otherwise the device frame width to render in.
  const [previewDevice, setPreviewDevice] = useState(null);
  const site = ev.eventSite;
  const fileRef = useRef(null);
  const [copied, setCopied] = useState(false);

  /**
   * Put the bytes where they belong and return what the event should store.
   *
   * Storage when the event has a cloud row, base64 when it does not — and
   * base64 again if the upload fails, because a host on venue wifi losing the
   * photo they just picked is a worse outcome than an event that is briefly
   * heavier. Either way `src` is a string for <img src>.
   *
   * It REPORTS rather than toasts. Toasting here fired an error and then the
   * caller's success toast replaced it a few milliseconds later, so a failing
   * upload looked like a red flash the host could not read followed by a green
   * tick — reported exactly that way: "it flashes an error for a split second
   * and then uploads the photo anyway". The one message that explained what
   * went wrong was the one guaranteed to be overwritten.
   *
   * `reason` carries the server's own words. A failure here is a bucket that
   * does not exist, a policy that refused the path, or a MIME type the bucket
   * rejects — four different fixes that all look identical without it.
   */
  const storeOrEmbed = useCallback(async ({ blob, ext }) => {
    // NOT the same thing, and conflating them cried wolf: an event with no
    // cloud row has nowhere to upload to and never did — that is guest mode
    // working, not a failure — while an upload that was attempted and threw is
    // a real problem the host has to hear about. The first version of this
    // reported both as "ההעלאה לענן נכשלה", so every photo added without an
    // account raised a red alarm about a failure that never happened.
    if (!ev.cloudId) return { src: await blobToDataUrl(blob), failed: false };
    try {
      // `ext` travels with the blob so the object key matches the bytes: a
      // .jpg key holding WebP is served to every guest with the wrong content
      // type.
      return { src: await uploadSitePhoto(ev.cloudId, blob, ext), failed: false };
    } catch (e) {
      return { src: await blobToDataUrl(blob), failed: true, reason: e?.message || String(e) };
    }
  }, [ev.cloudId]);

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
    try {
      const prev = site.coverPhoto;
      const r = await storeOrEmbed(await compressImage(file));
      set({ coverPhoto: r.src });
      // The photo it replaced is unreachable the moment the field changes, so
      // it is removed rather than left to sit in the bucket forever. Best
      // effort: a host who swaps a cover is not made to care that the old file
      // could not be reached.
      deleteSitePhoto(prev);
      showToast(
        r.failed
          ? `תמונת הרקע נשמרה על המכשיר הזה בלבד — ההעלאה לענן נכשלה: ${r.reason}`
          : "תמונת הרקע הועלתה ✓",
        r.failed ? "err" : undefined
      );
    }
    catch { showToast("שגיאה בעיבוד התמונה", "err"); }
  };

  const onGallery = async (files) => {
    const picked = [...files].filter(f => f.type.startsWith("image/"));
    if (!picked.length) { showToast("יש לבחור קובצי תמונה", "err"); return; }

    // Decide how many fit BEFORE uploading anything.
    //
    // This used to be decided inside the patch, with the count assigned to a
    // variable that the next line read:
    //
    //     let added = 0;
    //     patchEvent(e => { …; added = …; });
    //     if (added === 0) showToast("הגלריה מלאה");
    //
    // React only runs that updater during render, so `added` was still 0 when
    // the toast was chosen. It appeared to work because React evaluates an
    // updater eagerly WHEN THE QUEUE IS EMPTY — and the queue is empty right up
    // until something else sets state first. `storeOrEmbed` does exactly that
    // when an upload fails: it shows a toast. So on a configured account whose
    // first upload failed, the eager path was skipped, `added` stayed 0, and
    // "הגלריה מלאה" fired on an EMPTY gallery — replacing the upload-failure
    // toast that would have said what actually went wrong. Reported on the
    // first real upload.
    //
    // Deciding here also stops uploading photos that cannot fit: the old order
    // compressed and UPLOADED all six, then threw away whatever exceeded the
    // cap, leaving paid-for objects in the bucket that nothing would ever
    // reference or clean.
    const room = Math.max(0, GALLERY_MAX - (site.gallery?.length ?? 0));
    if (room === 0) { showToast(`הגלריה מלאה — אפשר עד ${GALLERY_MAX} תמונות`, "err"); return; }

    const imgs    = picked.slice(0, room);
    const dropped = picked.length - imgs.length;

    try {
      const results = await Promise.all(
        imgs.map(async f => storeOrEmbed(await compressImage(f, 1000, 0.7)))
      );
      const stored = results.map(r => r.src);
      const failed = results.filter(r => r.failed);
      // The slice stays inside the patch as the guarantee: `room` was computed
      // from the rendered gallery, and a second batch started in the same
      // render would not see it. The cap is enforced against whatever the
      // event actually holds at apply time, so the DATA is right even when the
      // count above is optimistic.
      patchEvent(e => {
        const cur = e.eventSite?.gallery || [];
        return { ...e, eventSite: {
          ...e.eventSite,
          gallery: [...cur, ...stored.slice(0, Math.max(0, GALLERY_MAX - cur.length))],
        } };
      });

      // ONE toast, after everything is known — never a success that overwrites
      // a failure. When anything fell back, that is the headline, because a
      // photo living only on this device is the thing the host has to know.
      const n = stored.length;
      if (failed.length) {
        showToast(
          `${failed.length === n ? "התמונה נשמרה" : `${failed.length} מתוך ${n} נשמרו`} ` +
          `על המכשיר הזה בלבד — ההעלאה לענן נכשלה: ${failed[0].reason}`,
          "err"
        );
      } else {
        showToast(
          (n === 1 ? "נוספה תמונה אחת ✓" : `נוספו ${n} תמונות ✓`) +
          (dropped ? ` (${dropped} לא נכנסו — הגלריה מוגבלת ל-${GALLERY_MAX})` : "")
        );
      }
    } catch { showToast("שגיאה בעיבוד התמונות", "err"); }
  };
  const delGalleryPhoto = (i) => {
    deleteSitePhoto((site.gallery || [])[i]);
    set({ gallery: (site.gallery || []).filter((_, idx) => idx !== i) });
  };

  const siteUrl = window.location.origin + "/invite/" + (ev.tokens?.invite || "");
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(siteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { showToast("לא ניתן להעתיק — העתיקו ידנית", "err"); }
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="אתר האירוע"
        mark="site"
        sub="בנו את אתר האירוע שלכם — הוא נבנה אוטומטית ונשלח לאורחים. מלאו פרטים, בחרו עיצוב, ופרסמו."
      />

      {/* `showPurged` only here: this is the screen where an empty gallery is
          otherwise unexplained. On the hub it would be a permanent notice about
          something already finished. */}
      <PhotoRetentionNotice ev={ev} patchEvent={patchEvent} showToast={showToast} showPurged />

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
          <input className={[base.input, styles.shareInput].join(" ")} readOnly value={siteUrl} dir="ltr" aria-label="קישור לאתר האירוע" />
          <button className={base.btnSm} onClick={() => guard("הקישור לאתר האירוע", copyLink)}>{copied ? "הועתק ✓" : "העתיקו"}</button>
          <button
            className={[base.btnSm, previewDevice ? "" : base.btnGhost].filter(Boolean).join(" ")}
            onClick={() => setPreviewDevice(previewDevice ? null : "mobile")}
            aria-expanded={!!previewDevice}
          >
            {previewDevice ? "סגרו תצוגה" : "תצוגה מקדימה"}
          </button>
          <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => window.open("/events/" + ev.id + "/preview-site", "_blank")}>פתחו בלשונית</button>
        </div>

        {previewDevice && (
          <div className={styles.previewWrap}>
            <div className={styles.previewBar}>
              {[["mobile", "מובייל"], ["desktop", "דסקטופ"]].map(([key, label]) => (
                <button
                  key={key}
                  className={[styles.deviceBtn, previewDevice === key ? styles.deviceActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setPreviewDevice(key)}
                  aria-pressed={previewDevice === key}
                  type="button"
                >{label}</button>
              ))}
              <span className={styles.previewHint}>התצוגה מתעדכנת בכל שמירה</span>
            </div>
            {/* Rendered in an iframe rather than inline so the site's own theme
                variables and layout can't leak into the editor's styles. */}
            <div className={[styles.previewStage, previewDevice === "mobile" ? styles.stageMobile : styles.stageDesktop].join(" ")}>
              {/* Keyed on the event version too. With only previewDevice the
                  frame never remounted, so it kept showing the state from the
                  moment the preview opened while the hint beside it promised
                  "מתעדכנת בכל שמירה". */}
              <iframe
                key={previewDevice + ":" + (ev.version ?? 0)}
                className={styles.previewFrame}
                src={"/events/" + ev.id + "/preview-site"}
                title="תצוגה מקדימה של אתר האירוע"
                loading="lazy"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Share with guests ── */}
      {site.enabled && (
        <div className={base.card}>
          <SectionLabel>שתפו עם האורחים</SectionLabel>
          <p className={base.fieldHint}>
            הודעות מוכנות לשליחה בוואטסאפ — עם קישור לאתר האירוע. העתיקו או שלחו ישירות.
          </p>
          {[
            { key: "invite", label: "הזמנה", text: `היי! אתם מוזמנים ${prefixed("ל", ev.name) || "לאירוע שלנו"} 💛\nכל הפרטים ואישור הגעה כאן:\n${siteUrl}` },
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
                  className={[base.btnSm, base.btnGhost].join(" ")}
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

        <div className={styles.domainBox}>
          <Field label="קישור לאלבום המשותף" hint="אורחים והצלם מעלים תמונות למקום אחד">
            <input
              className={base.input}
              readOnly
              dir="ltr"
              value={ev.tokens?.album ? `${window.location.origin}/album/${ev.tokens.album}` : "ייווצר אחרי השמירה הראשונה"}
              onFocus={e => e.target.select()}
            />
          </Field>
        </div>

        <div className={styles.domainBox}>
          <Field label="דומיין משלכם" hint="אופציונלי — למשל dana-and-yossi.co.il">
            <input
              className={base.input}
              value={site.customDomain || ""}
              dir="ltr"
              placeholder="example.co.il"
              onChange={e => set({ customDomain: e.target.value.trim().replace(/^https?:\/\//, "") })}
            />
          </Field>
          {site.customDomain
            ? <p className={base.fieldHint}>
                כדי שזה יעבוד, הפנו את הדומיין לשרת שלנו אצל רשם הדומיינים:
                רשומת <code>CNAME</code> בשם <code>www</code> אל <code>{window.location.hostname}</code>.
                עד שההפניה תתפוס, הקישור הרגיל למעלה ממשיך לעבוד כרגיל.
              </p>
            : <p className={base.fieldHint}>
                בלי דומיין משלכם האתר עובד מצוין בקישור שלמעלה — זו תוספת נוחות, לא דרישה.
              </p>}
        </div>

        <p className={[base.fieldHint, styles.sectionHint].join(" ")}>גופן הכותרות באתר.</p>
        <div className={styles.fontGrid}>
          {SITE_FONTS.map(f => (
            <button
              key={f.key}
              className={[
                styles.fontSwatch,
                (site.fontKey || DEFAULT_SITE_FONT) === f.key ? styles.fontActive : "",
              ].filter(Boolean).join(" ")}
              onClick={() => set({ fontKey: f.key })}
              type="button"
              aria-pressed={(site.fontKey || DEFAULT_SITE_FONT) === f.key}
            >
              <span className={styles.fontSample} style={{ fontFamily: f.stack }}>{f.sample}</span>
              <span className={styles.themeName}>{f.label}</span>
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
              <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => { deleteSitePhoto(site.coverPhoto); set({ coverPhoto: null }); }}>הסירו</button>
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
        <p className={base.fieldHint}>עד {GALLERY_MAX} תמונות. הראשונה תוצג גדולה יותר.</p>
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
            {/* A time input can't carry a placeholder, so without aria-label a
                screen reader announces four identical unnamed fields. */}
            <input className={[base.input, styles.timeInput].join(" ")} type="time" value={item.time}
              aria-label="שעת השלב"
              onChange={e => editSchedule(item.id, { time: e.target.value })} />
            <input className={[base.input, styles.iconInput].join(" ")} value={item.icon} placeholder="💍"
              aria-label="אייקון" onChange={e => editSchedule(item.id, { icon: e.target.value })} />
            <input className={[base.input, styles.schedTitleInput].join(" ")} value={item.title} placeholder="חופה"
              aria-label="שם השלב" onChange={e => editSchedule(item.id, { title: e.target.value })} />
            <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delSchedule(item.id)}
              aria-label={`מחקו את השלב ${item.title || item.time || ""}`.trim()}>✕</button>
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
              aria-label="שעת ההסעה"
              onChange={e => editShuttle(s.id, { time: e.target.value })} />
            <select className={[base.select, styles.dirSelect].join(" ")} value={s.direction}
              aria-label="כיוון ההסעה"
              onChange={e => editShuttle(s.id, { direction: e.target.value })}>
              <option>הלוך</option>
              <option>חזור</option>
            </select>
            <input className={base.input} value={s.place} placeholder="נקודת איסוף — נס ציונה"
              aria-label="נקודת איסוף" onChange={e => editShuttle(s.id, { place: e.target.value })} />
            <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delShuttle(s.id)}
              aria-label={`מחקו את ההסעה ${s.place || s.time || ""}`.trim()}>✕</button>
            <input className={base.input} value={s.contactName || ""} placeholder="איש קשר (אופציונלי)"
              onChange={e => editShuttle(s.id, { contactName: e.target.value })} />
            <input className={base.input} value={s.contactPhone || ""} placeholder="טלפון איש קשר" dir="ltr"
              onChange={e => editShuttle(s.id, { contactPhone: e.target.value })} />
            <input className={base.input} value={s.note || ""} placeholder="הערה (אופציונלי) — למשל: יש להירשם מראש"
              onChange={e => editShuttle(s.id, { note: e.target.value })} />
          </div>
        ))}
        <button className={base.btnSecondary} onClick={addShuttle}>+ הוסיפו הסעה</button>
      </div>

      {/* ── Blessings + gift toggles ── */}
      <div className={base.card}>
        <SectionLabel>מקטעים נוספים</SectionLabel>
        <div className={styles.toggleList}>
          <div className={styles.toggleRow}>
            <span>מתנה — קישור למסך המתנה</span>
            <Toggle on={site.sections.gift} onChange={v => setSection("gift", v)} />
          </div>
          <div className={styles.toggleRow}>
            <span>קיר ברכות — ברכות מהאורחים</span>
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
      {gate}
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
