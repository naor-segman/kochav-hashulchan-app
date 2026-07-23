import { useState, useEffect } from "react";
import QRCode from "qrcode";
import Icon from "./Icon.jsx";
import styles from "./QrCode.module.css";

// Inline QR for a shareable link. Click the button to reveal a scannable /
// printable code with a download link. Used next to the event share links so a
// host can print a QR for the entrance, hostess station, or RSVP.
export default function QrCode({ url, label, filename }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(url, {
      width: 640,
      margin: 2,
      color: { dark: "#0E2A33", light: "#FFFFFF" },
    })
      .then(d => { if (!cancelled) setDataUrl(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [open, url]);

  if (!url) return null;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="קוד QR"
        title="הצגת קוד QR להדפסה או סריקה"
      >
        <Icon name="qr" size={16} />
      </button>

      {open && (
        <div className={styles.pop} role="dialog" aria-label={"קוד QR — " + (label || "")}>
          {failed ? (
            <span className={styles.msg}>לא ניתן ליצור קוד</span>
          ) : dataUrl ? (
            <img className={styles.img} src={dataUrl} alt={"קוד QR " + (label || "")} />
          ) : (
            <span className={styles.msg}>יוצרים…</span>
          )}
          {label && <span className={styles.label}>{label}</span>}
          <div className={styles.actions}>
            {dataUrl && !failed && (
              <a className={styles.dl} href={dataUrl} download={(filename || label || "qr") + ".png"}>
                הורדה
              </a>
            )}
            <button type="button" className={styles.close} onClick={() => setOpen(false)}>
              סגירה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
