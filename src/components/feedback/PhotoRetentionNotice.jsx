import { photoRetentionState, postponeToYmd, PURGE_AFTER_DAYS } from "../../utils/photoRetention.js";
import { fmtDate } from "../../utils/dateFormat.js";
import Banner from "./Banner.jsx";
import styles from "./PhotoRetentionNotice.module.css";

// ── "Your photos are about to be deleted" ────────────────────────────────────
//
// The server deletes an event's photos PURGE_AFTER_DAYS after the event
// (supabase/functions/purge-event-photos). This is the half the host sees.
//
// It is not decoration. Deleting a customer's photographs with no warning and
// no recourse is the kind of thing that is only ever discovered afterwards,
// when there is nothing to be done — so the warning comes a week early and it
// comes with a button that actually stops it.
//
// WHAT IT CANNOT DO, stated plainly rather than papered over: a host who does
// not open the app during that week is not warned at all. Reaching them needs
// transactional email, and this project has none — no Resend, no SMTP, nothing
// beyond Supabase's own auth mailer, which is rate-limited to auth messages.
// Adding it is a separate decision with a separate setup. Until then the
// warning reaches the hosts who are still looking, which is most of the hosts
// who still care.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object}   props.ev          the active event
 * @param {function} props.patchEvent  used only by the postpone button
 * @param {function} props.showToast
 * @param {boolean}  props.showPurged  also report an already-completed deletion.
 *   On the event-site editor that is the difference between "the gallery is
 *   empty because they were deleted" and an empty gallery with no explanation.
 *   Everywhere else it would be a permanent notice about something finished.
 */
export default function PhotoRetentionNotice({ ev, patchEvent, showToast, showPurged = false }) {
  const purgedOn = ev?.eventSite?.photosPurgedAt;
  const { state, daysLeft } = photoRetentionState(ev);

  if (state === "warning") {
    const postpone = () => {
      const until = postponeToYmd();
      patchEvent(e => ({ ...e, eventSite: { ...e.eventSite, photosKeepUntil: until } }));
      showToast(`התמונות יישמרו ל-${PURGE_AFTER_DAYS} ימים נוספים ✓`);
    };

    return (
      <Banner variant="warn">
        <div className={styles.row}>
          <span>
            {/* The number is wrapped in Hebrew on both sides. `{n} ימים` alone
                puts a digit at the start of an RTL line, where bidi rule N1
                resolves the neutrals around it against the reading order — the
                same class of bug that once rendered "300 / 250" for a DOM value
                of "250 / 300" here. */}
            {daysLeft === 1
              ? "תמונות האירוע יימחקו מחר"
              : `תמונות האירוע יימחקו בעוד ${daysLeft} ימים`}
            {" — כדי לפנות מקום. שמרו אותן אצלכם אם הן חשובות לכם."}
          </span>
          <button type="button" className={styles.keep} onClick={postpone}>
            שמרו עוד {PURGE_AFTER_DAYS} יום
          </button>
        </div>
      </Banner>
    );
  }

  if (showPurged && purgedOn && state === "none") {
    return (
      <Banner variant="warn">
        {/* fmtDate, not the raw "2026-08-15". Partly because it is what the
            rest of the product shows, and partly because "15 באוגוסט 2026" puts
            a strong Hebrew character between the numbers — the anchor that
            stops an all-neutral run from resolving against the reading order,
            which is how "250 / 300" once rendered as "300 / 250" here. */}
        תמונות האירוע נמחקו ב-{fmtDate(purgedOn)} כדי לפנות מקום. אפשר להעלות חדשות בכל רגע.
      </Banner>
    );
  }

  return null;
}
