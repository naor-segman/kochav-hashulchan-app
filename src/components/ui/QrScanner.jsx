import { useEffect, useRef, useState } from "react";
import { isQrSupported, isScanSupported } from "../../utils/scanPayload.js";
import styles from "./QrScanner.module.css";

/**
 * One decode function for either engine: frame in, raw text (or "") out.
 * jsQR works on pixels, so frames are drawn to a canvas scaled to ≤640px wide
 * — full-resolution frames cost a phone 100ms+ each for no gain in accuracy.
 */
async function makeDecoder() {
  if (await isQrSupported()) {
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue || "";
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h || !ctx) return "";
    const scale = Math.min(1, 640 / w);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || "";
  };
}

/**
 * Camera QR scanner for the entrance.
 *
 * Uses the native BarcodeDetector where it decodes QR (Chrome/Edge/Android).
 * Everywhere else — Safari, so every iPhone, and Firefox — it decodes frames
 * with jsQR. That library is loaded with a dynamic import only when this
 * component mounts on such a browser, so no page and no other browser pays
 * for it. The earlier decision was to skip the library and send iPhones to
 * name search; but an iPhone is most of the phones at the door, and the
 * button simply did not exist there (WORKPLAN ד2/ק, 28.9).
 *
 * onScan receives the raw payload; parsing it (utils/scanPayload.js) and
 * matching it to a guest are the caller's job, so this component stays free of
 * event knowledge.
 */
export default function QrScanner({ onScan, onClose }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const lastRef = useRef({ value: "", at: 0 });

  // The caller re-creates onScan whenever the guest list changes — i.e. after
  // every successful check-in. Depending on it directly tore down the camera
  // and re-ran getUserMedia per guest, which at a door with a queue is a black
  // frame and a fresh hardware acquisition each time. Hold it in a ref so the
  // effect runs exactly once.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let timer = 0;

    (async () => {
      try {
        // Ask whether QR is actually decodable, not just whether the object
        // exists. And construct INSIDE the try: the spec says the constructor
        // throws when no requested format is supported, and thrown from the
        // effect body that took down the whole app via the root error boundary
        // — at the door, mid-queue.
        if (!isScanSupported()) {
          if (!cancelled) setError("unsupported");
          return;
        }
        // The decoder is a separate download on phones without a native one
        // (every iPhone). Offline at the venue that download fails, and the
        // guest used to be told the CAMERA failed — sending them to their
        // settings for a fault that is the connection (29.9 review).
        let decode;
        try { decode = await makeDecoder(); }
        catch { if (!cancelled) setError("offline"); return; }
        if (cancelled) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const value = await decode(videoRef.current);
            // Re-check after the await: the panel may have been closed while
            // this frame was in flight, and firing onScan then would check a
            // guest in after the scanner was dismissed.
            if (cancelled) return;
            if (value) {
              const now = Date.now();
              // The camera sees the same code many times a second — ignore a
              // repeat within two seconds so one badge checks in once.
              if (value && (value !== lastRef.current.value || now - lastRef.current.at > 2000)) {
                lastRef.current = { value, at: now };
                onScanRef.current(value);
              }
            }
          } catch {
            // A single failed frame is not worth surfacing; keep scanning.
          }
          // About six looks a second, not one per frame: the fallback decoder
          // measured ~97ms a frame, and running it back to back held the
          // phone's main thread for the whole time the scanner was open.
          if (!cancelled) timer = setTimeout(() => { rafId = requestAnimationFrame(tick); }, 150);
        };
        rafId = requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) {
          setError(err?.name === "NotAllowedError" ? "denied" : "camera");
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const message =
    error === "unsupported" ? "אין גישה למצלמה בדפדפן הזה. השתמשו בחיפוש לפי שם — הוא עובד בכל מכשיר."
    : error === "denied"    ? "הגישה למצלמה נדחתה. אשרו גישה בהגדרות הדפדפן, או השתמשו בחיפוש לפי שם."
    : error === "camera"    ? "לא הצלחנו לפתוח את המצלמה. השתמשו בחיפוש לפי שם."
    : error === "offline"   ? "הסורק לא נטען — אין חיבור כרגע. השתמשו בחיפוש לפי שם, ונסו שוב כשיחזור החיבור."
    : "";

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.title}>סריקת קוד בכניסה</span>
        <button className={styles.close} onClick={onClose} aria-label="סגרו את הסורק">✕</button>
      </div>

      {message ? (
        <p className={styles.error} role="alert">{message}</p>
      ) : (
        <div className={styles.stage}>
          <video ref={videoRef} className={styles.video} muted playsInline />
          <div className={styles.reticle} aria-hidden="true" />
        </div>
      )}

      {!message && <p className={styles.hint}>כוונו את המצלמה לקוד שעל ההזמנה.</p>}
    </div>
  );
}
