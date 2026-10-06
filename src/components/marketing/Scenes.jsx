import styles from "./Scenes.module.css";
import PhoneFrame from "./PhoneFrame.jsx";

/**
 * Two drawn scenes for the home page (136). The owner, 5.10: too many phones —
 * "זו לא הדרך היחידה להציג תמונה, אפשר להיות יצירתיים ולשלב". These show the
 * MOMENT rather than the screen: a guest answering in WhatsApp, a host at the
 * door. Names and numbers are a sample event, the same one the screenshots use.
 * The invitation text is the product's real default template (messageSequence).
 */

/* The RSVP moment, in an iPhone (owner, 6.10: "במקום סתם ריבוע לעשות פה את
 * האייפון… ההודעה חייבת להיות אמיתית ומדויקת, בדיוק כמו שהם ייראו אותה").
 * The text is the product's invitation template (messageSequence.js) filled
 * for a sample guest, and the link shows as WhatsApp shows it: a preview card
 * with the event's picture and name (the invite-og edge function makes it). */
export function ChatScene() {
  return (
    <div className={styles.chatStage}>
      <PhoneFrame className={styles.chatPhone}>
        <div className={styles.waHead}>
          <span className={styles.waBack} aria-hidden="true">›</span>
          <span className={styles.avatar}>נ״ט</span>
          <span className={styles.waName}>נועה וטל<small>מקוון</small></span>
        </div>
        <div className={styles.waBody} role="img"
          aria-label="דוגמה: הזמנה בוואטסאפ — היי משפחת כהן, שמחים להזמין אתכם לחתונה של נועה וטל, עם תאריך, מקום וקישור לאישור הגעה; והתשובה: מגיעים, שניים">
          <div className={styles.bubbleIn}>
            <span className={styles.preview}>
              <img src="/hero/hero.jpg" alt="" loading="lazy" />
              <span className={styles.previewText}>
                <b>החתונה של נועה וטל 💍</b>
                <span>plan.unica-events.co.il</span>
              </span>
            </span>
            {"היי משפחת כהן 👋\n\nשמחים להזמין אתכם לחתונה של נועה וטל! 🎉💛\n📅 חמישי, 12.11\n📍 בית על הים, תל אביב\n\nנשמח שתאשרו הגעה כאן 👇\n"}
            <span className={styles.link}>plan.unica-events.co.il/rsvp/…</span>
            <span className={styles.meta}>19:02</span>
          </div>
          <div className={styles.bubbleOut}>
            מגיעים, שניים 🎉 מזל טוב!!
            <span className={styles.meta}>19:05 ✓✓</span>
          </div>
        </div>
      </PhoneFrame>
      {/* What happens on the host's side, the same second. */}
      <div className={styles.rowCard} aria-hidden="true">
        <div className={styles.rowName}>משפחת כהן</div>
        <div className={styles.rowMeta}>2 מקומות · צד הכלה</div>
        <span className={styles.chipOk}>אישרו ✓</span>
      </div>
    </div>
  );
}

/* The evening itself (owner, 6.10: the drawing "נראה על הפנים… אפילו
 * להשתמש בתמונה"): the hall as a guest walks in, and the door screen as the
 * greeter holds it — the real screen, captured from the product. The photo is
 * the owner's own (6.10): the dance floor at its height. */
export function DoorScene() {
  return (
    <div className={styles.doorStage}>
      <img className={styles.doorPhoto} src="/celebrate/event-day.jpg"
        alt="רחבת הריקודים בשיא האירוע — האורחים רוקדים מול הבמה והאורות" loading="lazy" />
      <PhoneFrame src="/shots-phone/checkin.jpg" className={styles.doorPhone}
        alt="עמדת הכניסה בטלפון של הדיילת: חיפוש אורח, מספר השולחן וסימון שהגיע" />
    </div>
  );
}
