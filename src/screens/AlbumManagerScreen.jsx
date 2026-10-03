import { useEffect, useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import { fetchHostAlbumPhotos, setAlbumPhotoHidden, deleteAlbumPhoto } from "../utils/publicTokens.js";
import { fmtDateTime } from "../utils/dateFormat.js";
import base from "../styles/screenBase.module.css";
import styles from "./AlbumManagerScreen.module.css";

/**
 * The HOST's side of the shared album. Checklist 57.
 *
 * The album has been live since 27.7: anyone with the link uploads, and everyone
 * with the link sees everything. Until now the host had no screen for it at all
 * — a host who wanted to look at the photos opened the same public link a guest
 * does, and a host who wanted one taken down had no way to do it. The owner
 * policies to read and delete existed in the database, and not one line of
 * client code used them.
 *
 * Named AlbumManagerScreen because `AlbumScreen` is the guest page at
 * /album/:token and the two must not be confused in App.jsx's lazy imports.
 *
 * ── What this screen does NOT promise, and why it says so ───────────────────
 * There is no approval queue: a guest's photo appears in the album the moment it
 * is uploaded, and this screen lets the host hide or delete it AFTER. WORKPLAN
 * row ע is explicit that the product must not write "אתם שולטים במה שמתפרסם",
 * and that stays true — the host controls what STAYS, not what arrives.
 *
 * And hiding is not deleting, in a way a host would not guess: the bucket is
 * public, so a hidden photo's direct URL still opens for anyone who saved it.
 * The screen says that in one line next to the buttons, because a host hiding a
 * photo for privacy reasons needs to know that only delete does what they want.
 */
export default function AlbumManagerScreen({ activeEvent: ev, showToast, go }) {
  const { confirm, dialog } = useConfirm();
  const [busyId, setBusyId] = useState(null);

  const cloudId = ev?.cloudId || null;

  /* What the last load returned, and FOR WHICH event. The screen's state is
     derived from this rather than stored beside it: "idle" is simply "no cloud
     id", and "loading" is "the result on hand belongs to a different event (or
     none yet)". Storing them meant calling setState synchronously at the top of
     the effect — the react-hooks/set-state-in-effect shape this repo has 24 of
     and has decided not to add to. The effect now only ever sets state from the
     async callbacks. */
  const [result, setResult] = useState({ forId: null, status: null, photos: [] });

  useEffect(() => {
    // Keyed on the CLOUD id: album_photos.event_id and the storage folder are
    // both events.id. An event that has never synced has no album to read, and
    // an empty grid would claim "no photos yet" about an album that may be full.
    if (!cloudId) return undefined;
    let alive = true;
    fetchHostAlbumPhotos(cloudId)
      .then(rows => { if (alive) setResult({ forId: cloudId, status: "ready", photos: rows }); })
      .catch(()   => { if (alive) setResult({ forId: cloudId, status: "error", photos: [] }); });
    return () => { alive = false; };
  }, [cloudId]);

  const state  = !cloudId ? "idle" : result.forId !== cloudId ? "loading" : result.status;
  const photos = result.forId === cloudId ? result.photos : [];
  const setPhotos = (fn) => setResult(r => ({ ...r, photos: fn(r.photos) }));

  /* Optimistic, with a rollback — the same shape as the blessing wall's hide in
     CostScreen. A hide during the party has to feel instant, and a failure must
     put the photo back the way it was rather than leave the grid lying. */
  const toggleHidden = async (photo) => {
    const next = !photo.hidden;
    setBusyId(photo.id);
    setPhotos(rows => rows.map(r => (r.id === photo.id ? { ...r, hidden: next } : r)));
    try {
      await setAlbumPhotoHidden(photo.id, next);
      showToast?.(next ? "התמונה הוסתרה מהאלבום" : "התמונה חזרה לאלבום");
    } catch {
      setPhotos(rows => rows.map(r => (r.id === photo.id ? { ...r, hidden: photo.hidden } : r)));
      showToast?.("לא הצלחנו לעדכן את האלבום — נסו שוב", "err");
    } finally {
      setBusyId(null);
    }
  };

  /* NOT optimistic. A delete that appears to succeed and then fails would show
     the host a grid without the photo while the file is still on the internet
     — the one outcome this screen exists to prevent. It leaves the grid only
     once the file is actually gone. */
  const remove = async (photo) => {
    const ok = await confirm(
      "למחוק את התמונה לצמיתות?\n\nהיא תימחק מהאלבום ומהאחסון, והקישור הישיר אליה יפסיק לעבוד. אי אפשר לשחזר.",
      { danger: true, confirmLabel: "מחקו" }
    );
    if (!ok) return;
    setBusyId(photo.id);
    try {
      await deleteAlbumPhoto(photo);
      setPhotos(rows => rows.filter(r => r.id !== photo.id));
      showToast?.("התמונה נמחקה");
    } catch {
      showToast?.("המחיקה לא הצליחה — התמונה לא נמחקה. נסו שוב", "err");
    } finally {
      setBusyId(null);
    }
  };

  const visible = photos.filter(p => !p.hidden).length;
  const hidden  = photos.length - visible;

  return (
    <div className={base.pageWide}>
      {dialog}
      <PageHeader
        title="אלבום האורחים"
        mark="album"
        sub="התמונות שהאורחים העלו לקישור המשותף. אפשר להסתיר תמונה מהאלבום או למחוק אותה."
        aside={state === "ready" && photos.length > 0 && (
          <div className={base.pills}>
            <StatPill n={visible} label="באלבום" primary />
            {hidden > 0 && <StatPill n={hidden} label="מוסתרות" />}
          </div>
        )}
      />

      {state === "idle" && (
        <div data-tour="album.offline">
          <EmptyState
            mark="album"
            title="האירוע עוד לא נשמר בענן"
            text="התמונות של האורחים נשמרות בענן, ליד האירוע. כשהאירוע יישמר — הן יופיעו כאן."
          />
        </div>
      )}

      {/* aria-busy: the guided tour (124) waits for the photos before it
          decides which of its steps are on the page. */}
      {state === "loading" && <p className={styles.status} aria-busy="true">טוען את התמונות…</p>}

      {state === "error" && (
        <p className={styles.statusErr} role="alert">
          לא הצלחנו לטעון את האלבום. בדקו את החיבור ונסו לרענן.
        </p>
      )}

      {state === "ready" && photos.length === 0 && (
        <div data-tour="album.empty">
          <EmptyState
            mark="album"
            title="עוד אין תמונות"
            text="שלחו לאורחים את הקישור לאלבום המשותף — כל מה שהם יעלו יופיע כאן."
            /* EmptyState draws the button from { label, onClick }. A <button>
               element passed here rendered as an empty, dead button. */
            action={go && { label: "לקישורים לאורחים", onClick: () => go("share") }}
          />
        </div>
      )}

      {state === "ready" && photos.length > 0 && (
        <>
          {/* The one sentence a host hiding a photo for privacy reasons most
              needs, and would never guess: hide ≠ gone. */}
          <p className={styles.note}>
            <Icon name="alert" size={14} /> תמונה מוסתרת יורדת מהאלבום שהאורחים רואים, אבל מי ששמר כבר את הקישור הישיר אליה
            עדיין יכול לפתוח אותה. כדי שתיעלם לגמרי — מחקו.
          </p>

          <ul data-tour="album.grid" className={styles.grid}>
            {photos.map(p => (
              <li
                key={p.id}
                className={[styles.tile, p.hidden && styles.tileHidden].filter(Boolean).join(" ")}
              >
                <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.imgLink}>
                  <img
                    src={p.url}
                    alt={p.uploader ? `תמונה שהעלה/תה ${p.uploader}` : "תמונה מהאלבום"}
                    loading="lazy"
                    className={styles.img}
                  />
                </a>
                {/* The word, not only the dimming — never colour alone. */}
                {p.hidden && <span className={styles.hiddenTag}>מוסתרת</span>}
                <div className={styles.meta}>
                  <span className={styles.who}>{p.uploader || "ללא שם"}</span>
                  <span className={styles.when}>{fmtDateTime(p.createdAt)}</span>
                </div>
                <div data-tour="album.actions" className={styles.actions}>
                  <button
                    type="button"
                    className={base.btnSm}
                    disabled={busyId === p.id}
                    onClick={() => toggleHidden(p)}
                    aria-label={`${p.hidden ? "החזרה לאלבום" : "הסתרה מהאלבום"}: ${p.uploader || "תמונה"}`}
                  >
                    {busyId === p.id ? "…" : p.hidden ? "החזרה" : "הסתרה"}
                  </button>
                  <button
                    type="button"
                    className={[base.btnSm, base.btnDanger].join(" ")}
                    disabled={busyId === p.id}
                    onClick={() => remove(p)}
                    aria-label={`מחיקה: ${p.uploader || "תמונה"}`}
                  >
                    מחיקה
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
