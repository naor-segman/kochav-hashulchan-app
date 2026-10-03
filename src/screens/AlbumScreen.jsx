import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, fetchAlbumPhotos, uploadAlbumPhoto, guestWriteError, UNREACHABLE_TEXT } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import styles from "./AlbumScreen.module.css";
import Icon from "../components/ui/Icon.jsx";
import { guestHosts } from "../utils/guestRoutes.js";
import { useGuestTitle } from "../hooks/useGuestTitle.js";
import { prepareAlbumPhoto, ALBUM_ACCEPT, ALBUM_REFUSAL_TEXT } from "../utils/albumPhoto.js";
import { useRestoreFocus } from "../hooks/useRestoreFocus.js";
import GuestPrivacyNote from "../components/guest/GuestPrivacyNote.jsx";

/**
 * Public shared album — guests and the photographer upload here.
 *
 * Every photo is re-encoded in the browser before upload (albumPhoto.js): it
 * is downscaled, AND its metadata — the GPS position among it — is stripped,
 * because the bucket is public.
 */

/**
 * localStorage, guarded.
 *
 * This is the only screen in the product that touched `localStorage` directly —
 * everywhere else it goes through `storage.js`, which wraps it. Access here
 * THROWS, not returns null, in Safari private browsing, under "block all
 * cookies", and inside a partitioned third-party embed. It was called in a
 * render-phase state initializer, so the throw escaped React's rendering and
 * the public guest album white-screened into the error boundary — verified:
 * /album/:token was the only route in the app that did.
 *
 * Remembering a name is a convenience. It is not worth a blank page.
 */
const NAME_KEY = "kh_album_name";
function readName() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}
function writeName(v) {
  try { localStorage.setItem(NAME_KEY, v); } catch { /* nothing to do — it is a nicety */ }
}

export default function AlbumScreen() {
  const { token } = useParams();
  const [event, setEvent]   = useState(null);
  const [state, setState]   = useState("loading");
  const [photos, setPhotos] = useState([]);
  useGuestTitle(event && `אלבום משותף · ${guestHosts(event)}`);
  const [name, setName]     = useState(readName);
  const [busy, setBusy]     = useState(0);
  const [error, setError]   = useState("");
  // The photo list failing to load is not the same as an empty album (36i):
  // "no photos yet — be the first" over a list that never arrived told a
  // guest the album was empty when it was full.
  const [listError, setListError] = useState(false);
  const [listing, setListing]     = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ev;
      try {
        ev = await fetchEventByToken("album", token);
      } catch {
        if (!cancelled) setState("unreachable");
        return;
      }
      if (cancelled) return;
      if (!ev) { setState(isSupabaseConfigured ? "error" : "nocloud"); return; }
      setEvent(ev);
      setState("ready");
      try {
        const list = await fetchAlbumPhotos(token);
        if (!cancelled) { setPhotos(list); setListError(false); }
      } catch {
        if (!cancelled) setListError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const reload = useCallback(async () => {
    if (!event?.cloudId) return;
    setListing(true);
    try {
      setPhotos(await fetchAlbumPhotos(token));
      setListError(false);
    } catch {
      setListError(true);              // keep what we have, and say it may be stale
    } finally {
      setListing(false);
    }
  }, [event, token]);

  const MAX_BATCH = 30;

  const onFiles = async (files) => {
    const all = Array.from(files || []);
    if (!all.length || !event?.cloudId) return;
    // A phone's gallery picker happily hands over 500 files at once, and every
    // one of them is a 10MB upload billed to the host. Take a batch at a time.
    const list = all.slice(0, MAX_BATCH);
    // One assignment, not two. The over-the-batch warning was set and then
    // cleared unconditionally on the very next line, so it could never be
    // seen: a guest who picked 200 photos was told nothing about the 170 that
    // were dropped.
    setError(all.length > MAX_BATCH
      ? `נבחרו ${all.length} תמונות — מעלים ${MAX_BATCH} ראשונות. בחרו את השאר אחר כך.`
      : "");
    // Guarded: this used to be a bare setItem, and it sits BEFORE setBusy and
    // the upload loop — so where storage throws, tapping "upload photos" did
    // nothing at all and said nothing about it.
    writeName(name.trim());
    setBusy(list.length);
    let failed = 0, lastErr = null;
    for (const f of list) {
      try {
        const { blob } = await prepareAlbumPhoto(f);
        // Uploads have no request deadline (a big photo on 3G takes minutes),
        // and one that never answered left the page on "מעלה…" for good, the
        // picker disabled (fifth review 30.9). Each file gets a generous one:
        // two minutes plus a second per 20 KB.
        const ms = 120_000 + Math.ceil((blob?.size || 0) / 20_000) * 1000;
        await Promise.race([
          uploadAlbumPhoto(event.cloudId, token, blob, name, photoKey(f)),
          new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms)),
        ]);
      } catch (err) {
        failed++;
        lastErr = err;
      }
      setBusy(n => n - 1);
    }
    // The reason, when the server gave one: "נסו שוב" for a changed link or a
    // full album could never work (fifth review 30.9).
    if (failed) {
      const what = failed === 1 ? "תמונה אחת לא הועלתה" : `${failed} תמונות לא הועלו`;
      // A deadline is a SLOW line, not a missing one — and the upload may
      // still land. "אין חיבור" was wrong on both counts (sixth review 30.9).
      const why = lastErr?.albumReason
        ? ALBUM_REFUSAL_TEXT[lastErr.albumReason]
        : lastErr?.name === "TimeoutError"
        ? "החיבור איטי מאוד. ייתכן שהיא עוד תופיע באלבום; אפשר לבחור אותה שוב — היא לא תופיע פעמיים."
        : guestWriteError(lastErr, "נסו שוב.");
      setError(`${what} — ${why}`);
    }
    reload();
  };

  // Every state is the page's one <main> (38a).
  if (state === "loading") return <main className={styles.state}><span className={styles.star} aria-hidden="true">✦</span><p role="status">טוען…</p></main>;
  if (state === "nocloud") {
    return (
      <main className={styles.state}>
        <span className={styles.star}>✦</span>
        <p>האלבום אינו זמין</p>
        <p className={styles.sub}>האירוע עדיין לא סונכרן לענן</p>
      </main>
    );
  }
  if (state === "unreachable") {
    return (
      <main className={styles.state}>
        <span className={styles.star}>✦</span>
        <h1 className={styles.stateTitle}>{UNREACHABLE_TEXT.title}</h1>
        <p className={styles.sub}>{UNREACHABLE_TEXT.body}</p>
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className={styles.state}>
        <span className={styles.star}>✦</span>
        <h1 className={styles.stateTitle}>האלבום לא נמצא</h1>
        <p className={styles.sub}>הקישור אינו תקף או שפג תוקפו</p>
        <Link to="/" className={styles.homeLink}>לדף הבית</Link>
      </main>
    );
  }

  return (
    <main className={styles.root}>
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
            accept={ALBUM_ACCEPT}
            multiple
            className={styles.fileInput}
            onChange={e => { onFiles(e.target.files); e.target.value = ""; }}
            disabled={busy > 0}
          />
          <span className={styles.dropIcon} aria-hidden="true"><Icon name="camera" size={28} /></span>
          <span className={styles.dropTitle}>
            {busy > 0 ? `מעלה… (${busy} נותרו)` : "בחרו תמונות להעלאה"}
          </span>
          <span className={styles.dropHint}>אפשר לבחור כמה תמונות יחד</span>
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <GuestPrivacyNote text="התמונות והשם שתכתבו גלויים לכל מי שיש לו את הקישור לאלבום." />
      </div>

      {listError && (
        <div className={styles.listError} role="alert">
          <p className={styles.listErrorText}>
            {photos.length === 0 ? "לא הצלחנו לטעון את התמונות שבאלבום." : "לא הצלחנו לרענן את האלבום — ייתכן שחסרות תמונות חדשות."}
          </p>
          <button type="button" className={styles.retry} onClick={reload} disabled={listing}>
            {listing ? "טוען…" : "נסו שוב"}
          </button>
        </div>
      )}

      {photos.length === 0 ? (
        !listError && <p className={styles.empty}>עדיין אין תמונות — תהיו הראשונים 🎉</p>
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

      {lightbox && <Lightbox photo={lightbox} onClose={closeLightbox} />}
    </main>
  );
}

/* The same photo picked again gets the same name in storage, so a retry after
 * a slow upload the page gave up on cannot add it twice (sixth review 30.9).
 * From what the phone reports about the file — name, size, modified time —
 * not its bytes: reading a 10 MB photo to hash it is a price paid per photo. */
function photoKey(f) {
  const str = `${f?.name ?? ""}|${f?.size ?? 0}|${f?.lastModified ?? 0}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `p-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}

/* The photo, full size. Said aria-modal and was not: no Escape, focus stayed
 * on the thumbnail behind it, and closing left focus nowhere (fourth review
 * 30.9, AX7). Escape closes, the close button takes focus, Tab stays on it,
 * and focus goes back to the thumbnail. */
function Lightbox({ photo, onClose }) {
  const closeRef = useRef(null);
  useRestoreFocus();
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.lightbox} onClick={onClose} role="dialog" aria-modal="true" aria-label="תמונה מהאלבום">
      <button ref={closeRef} className={styles.close} aria-label="סגרו">✕</button>
      <img className={styles.full} src={photo.url} alt="" onClick={e => e.stopPropagation()} />
      {photo.uploader && <p className={styles.credit}>צולם ע"י {photo.uploader}</p>}
    </div>
  );
}
