import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { fetchEventByToken, fetchAlbumPhotos, uploadAlbumPhoto } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import styles from "./AlbumScreen.module.css";

/**
 * Public shared album — guests and the photographer upload here.
 *
 * Photos are downscaled in the browser before upload. A modern phone photo is
 * 4–8MB; a hundred guests uploading raw would be gigabytes of storage the host
 * pays for, to display images that are never shown above ~1600px wide.
 */

const MAX_EDGE = 1600;
const QUALITY  = 0.82;

function downscale(file) {
  return new Promise((resolve, reject) => {
    // Anything that isn't an image the canvas can read goes up untouched
    // rather than failing the upload.
    // HEIC is the iPhone default and the bucket allows it; without it here an
    // 8MB original went up untouched. Browsers that can't decode it fall
    // through to the original via the onerror path below anyway.
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return resolve(file);
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        if (scale === 1) return resolve(file);
        const c = document.createElement("canvas");
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(
          b => resolve(b ? new File([b], file.name, { type: "image/jpeg" }) : file),
          "image/jpeg", QUALITY,
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AlbumScreen() {
  const { token } = useParams();
  const [event, setEvent]   = useState(null);
  const [state, setState]   = useState("loading");
  const [photos, setPhotos] = useState([]);
  const [name, setName]     = useState(() => localStorage.getItem("kh_album_name") || "");
  const [busy, setBusy]     = useState(0);
  const [error, setError]   = useState("");
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchEventByToken("album", token);
      if (cancelled) return;
      if (!ev) { setState(isSupabaseConfigured ? "error" : "nocloud"); return; }
      setEvent(ev);
      setState("ready");
      try { setPhotos(await fetchAlbumPhotos(token)); } catch { /* gallery just stays empty */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const reload = useCallback(async () => {
    if (!event?.cloudId) return;
    try { setPhotos(await fetchAlbumPhotos(token)); } catch { /* keep what we have */ }
  }, [event, token]);

  const MAX_BATCH = 30;

  const onFiles = async (files) => {
    const all = Array.from(files || []);
    if (!all.length || !event?.cloudId) return;
    // A phone's gallery picker happily hands over 500 files at once, and every
    // one of them is a 10MB upload billed to the host. Take a batch at a time.
    const list = all.slice(0, MAX_BATCH);
    if (all.length > MAX_BATCH) {
      setError(`נבחרו ${all.length} תמונות — מעלים ${MAX_BATCH} ראשונות. בחרו את השאר אחר כך.`);
    }
    setError("");
    localStorage.setItem("kh_album_name", name.trim());
    setBusy(list.length);
    let failed = 0;
    for (const f of list) {
      try {
        await uploadAlbumPhoto(event.cloudId, token, await downscale(f), name);
      } catch {
        failed++;
      }
      setBusy(n => n - 1);
    }
    if (failed) setError(failed === 1 ? "תמונה אחת לא הועלתה. נסו שוב." : `${failed} תמונות לא הועלו. נסו שוב.`);
    reload();
  };

  if (state === "loading") return <div className={styles.state}><span className={styles.star}>✦</span><p>טוען…</p></div>;
  if (state === "nocloud") {
    return (
      <div className={styles.state}>
        <span className={styles.star}>✦</span>
        <p>האלבום אינו זמין</p>
        <p className={styles.sub}>האירוע עדיין לא סונכרן לענן</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className={styles.state}>
        <span className={styles.star}>✦</span>
        <p>האלבום לא נמצא</p>
        <p className={styles.sub}>הקישור אינו תקף או שפג תוקפו</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>האלבום של {event.name}</h1>
        <p className={styles.sub}>
          העלו תמונות מהאירוע — כולן נאספות למקום אחד, וכולם יכולים לראות.
        </p>
      </header>

      <div className={styles.uploadCard}>
        <label className={styles.nameLabel}>
          השם שלכם <span className={styles.optional}>(אופציונלי)</span>
          <input
            className={styles.nameInput}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="כדי שנדע מי צילם"
            maxLength={60}
          />
        </label>

        <label className={styles.dropZone}>
          <input
            type="file"
            accept="image/*"
            multiple
            className={styles.fileInput}
            onChange={e => { onFiles(e.target.files); e.target.value = ""; }}
            disabled={busy > 0}
          />
          <span className={styles.dropIcon} aria-hidden="true">📷</span>
          <span className={styles.dropTitle}>
            {busy > 0 ? `מעלה… (${busy} נותרו)` : "בחרו תמונות להעלאה"}
          </span>
          <span className={styles.dropHint}>אפשר לבחור כמה תמונות יחד</span>
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      {photos.length === 0 ? (
        <p className={styles.empty}>עדיין אין תמונות — תהיו הראשונים 🎉</p>
      ) : (
        <>
          <p className={styles.count}>{photos.length === 1 ? "תמונה אחת" : `${photos.length} תמונות`}</p>
          <div className={styles.grid}>
            {photos.map(p => (
              <button key={p.id} className={styles.thumb} onClick={() => setLightbox(p)}>
                <img src={p.url} alt={p.uploader ? `צולם ע"י ${p.uploader}` : "תמונה מהאירוע"} loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}

      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className={styles.close} aria-label="סגרו">✕</button>
          <img className={styles.full} src={lightbox.url} alt="" onClick={e => e.stopPropagation()} />
          {lightbox.uploader && <p className={styles.credit}>צולם ע"י {lightbox.uploader}</p>}
        </div>
      )}
    </div>
  );
}
