import { useCallback, useState } from "react";
import { SHARE_GROUPS } from "../components/share/shareLinks.js";
import { useShareGate } from "../components/share/useShareGate.jsx";
import Icon from "../components/ui/Icon.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import QrCode from "../components/ui/QrCode.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./ShareLinksScreen.module.css";

/* ── The links, on a screen of their own ──────────────────────────────────────
 *
 * They lived at the bottom of פרטי האירוע: a form about the couple's names, the
 * date and the venue, with the eight things their GUESTS receive stapled
 * underneath. The decision to move them was taken twice and carried out
 * neither time.
 *
 * Two things stay exactly as they were, because they are correctness and not
 * decoration:
 *   • useShareGate — a guest-mode event has no cloud row, so its tokens resolve
 *     to nothing for everyone they are sent to. The link is WITHHELD, not
 *     shown-and-blocked, because showing it would be a lie.
 *   • the QR for every link, for printing on signage, on the invitation and at
 *     the door.
 *
 * The URL boxes are LTR. That is enforced in the stylesheet, not by this
 * attribute alone — see the note on .linkInput for what was measured and why
 * the attribute on its own does nothing here.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function ShareLinksScreen({ activeEvent: ev, go, showToast }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const { guard, gate, isGuest } = useShareGate();

  const copyLink = useCallback(async (key, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
    } catch {
      showToast("לא ניתן להעתיק — העתיקו ידנית", "err");
    }
  }, [showToast]);

  const origin = window.location.origin;

  return (
    <div className={base.page}>
      <PageHeader
        title="קישורים לאורחים"
        mark="invite"
        sub="כל מה שיוצא מכאן החוצה, במקום אחד — ולידו שורה אחת על מה שהאורח יעשה איתו."
      />

      {isGuest ? (
        <div className={styles.guestNote}>
          <p className={styles.guestTitle}>הקישורים ממתינים לחשבון</p>
          <p className={styles.guestBody}>
            האירוע הזה שמור רק בדפדפן הזה, ולכן קישור שתשלחו לא ייפתח אצל האורחים.
            פתיחת חשבון היא חינם, לוקחת חצי דקה, וכל מה שבניתם עובר איתכם.
          </p>
        </div>
      ) : (
        <p className={styles.intro}>
          הקישורים קבועים — אפשר לשלוח אותם היום ולעדכן את התוכן מאחוריהם מחר.
          לכל אחד יש גם קוד QR, להדפסה על שילוט בכניסה או על ההזמנה.
        </p>
      )}

      {SHARE_GROUPS.map(group => (
        <div key={group.id} className={base.card}>
          <SectionLabel>{group.title}</SectionLabel>
          <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>{group.sub}</p>

          <ul className={styles.list}>
            {group.links.map(sl => {
              const token = ev.tokens?.[sl.tokenKey] || "";
              const url   = origin + sl.path + token;
              return (
                <li key={sl.key} className={styles.row}>
                  <span className={styles.rowMark}>
                    <SectionMark name={sl.mark} size={22} />
                  </span>

                  <div className={styles.rowBody}>
                    <span className={styles.rowLabel}>{sl.label}</span>
                    <span className={styles.rowSay}>{sl.say}</span>

                    {isGuest ? (
                      <div className={styles.linkRow}>
                        <span className={styles.locked}>
                          <Icon name="lock" size={13} /> הקישור נפתח אחרי פתיחת חשבון
                        </span>
                        <button
                          className={[base.btnSm, styles.copyBtn].join(" ")}
                          onClick={() => guard(sl.label)}
                          type="button"
                        >
                          למה?
                        </button>
                      </div>
                    ) : (
                      <div className={styles.linkRow}>
                        <input
                          className={[base.input, styles.linkInput].join(" ")}
                          readOnly
                          dir="ltr"
                          value={url}
                          aria-label={`קישור ל${sl.label}`}
                          onFocus={e => e.target.select()}
                        />
                        <button
                          className={[base.btnSm, styles.copyBtn].join(" ")}
                          onClick={() => guard(sl.label, () => copyLink(sl.key, url))}
                          type="button"
                        >
                          {copiedKey === sl.key
                            ? <>הועתק <Icon name="check" size={13} /></>
                            : "העתיקו"}
                        </button>
                        {token && <QrCode url={url} label={sl.label} filename={"qr-" + sl.key} />}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className={base.card}>
        <SectionLabel>איפה עורכים את מה שמאחורי הקישור</SectionLabel>
        <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
          הכתובת נשארת אותה כתובת גם אחרי שמשנים את התוכן. את ההזמנה ואת דף שמירת
          התאריך עורכים במסך ההזמנות; את מה שהאורח רואה באתר — במסך אתר האירוע.
        </p>
        <div className={styles.jumpRow}>
          <button className={[base.btnSm, base.btnGhost].join(" ")} type="button" onClick={() => go("announce")}>
            להזמנות <Icon name="arrowLeft" size={13} />
          </button>
          <button className={[base.btnSm, base.btnGhost].join(" ")} type="button" onClick={() => go("site")}>
            לאתר האירוע <Icon name="arrowLeft" size={13} />
          </button>
        </div>
      </div>

      {gate}
    </div>
  );
}
