import { useEffect, useRef, useState } from "react";
import styles from "./QrScanner.module.css";

/**
 * Camera QR scanner for the entrance.
 *
 * Uses the native BarcodeDetector, which ships in Chrome/Edge/Android but not
 * in Safari or Firefox. Rather than pulling in a ~200KB decoding library for a
 * feature used at one door for a few hours, unsupported browsers get an honest
 * message pointing back to name search — which already works everywhere.
 *
 * Payload contract: the code carries a guest id, either bare or inside a URL
 * as `?g=<id>`. onScan receives the extracted id; matching it to a guest is the
 * caller's job, so this component stays free of event knowledge.
 */
export function isScanSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/** Pull a guest id out of a scanned payload — bare id, URL param, or kh1: prefix. */
export function parseScanPayload(raw) {
  const text = (raw || "").trim();
  if (!text) return null;
  if (text.startsWith("kh1:")) return text.slice(4) || null;
  try {
    const u = new URL(text);
    const g = u.searchParams.get("g");
    if (g) return g;
  } catch {
    // Not a URL — fall through and treat the whole string as the id.
  }
  // Ignore anything that looks like a link but carried no guest id, so a guest
  // scanning the generic event invite doesn't check in a random person.
  if (/^https?:/i.test(text)) return null;
  return text;
}

export default function QrScanner({ onScan, onClose }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const lastRef = useRef({ value: "", at: 0 });

  useEffect(() => {
    if (!isScanSupported()) { setError("unsupported"); return; }

    let cancelled = false;
    let rafId = 0;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    (async () => {
      try {
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
            const codes = await detector.detect(videoRef.current);
            if (codes.length) {
              const value = codes[0].rawValue || "";
              const now = Date.now();
              // The camera sees the same code many times a second — ignore a
              // repeat within two seconds so one badge checks in once.
              if (value && (value !== lastRef.current.value || now - lastRef.current.at > 2000)) {
                lastRef.current = { value, at: now };
                onScan(value);
              }
            }
          } catch {
            // A single failed frame is not worth surfacing; keep scanning.
          }
          rafId = requestAnimationFrame(tick);
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
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  const message =
    error === "unsupported" ? "הדפדפן הזה לא תומך בסריקה. ב-Safari ובפיירפוקס השתמשו בחיפוש לפי שם — הוא עובד בכל מכשיר."
    : error === "denied"    ? "הגישה למצלמה נדחתה. אשרו גישה בהגדרות הדפדפן, או השתמשו בחיפוש לפי שם."
    : error === "camera"    ? "לא הצלחנו לפתוח את המצלמה. השתמשו בחיפוש לפי שם."
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
