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
 * 12.10, the owner: show how RSVPs really work — the decided two-way WhatsApp
 * (WORKPLAN 29, sold in the packages on /pricing): the invitation arrives as a
 * WhatsApp template with the event's picture and three reply buttons (WhatsApp
 * allows three), the guest taps one, is asked how many, answers, and the row
 * on the host's side updates. The text is the product's invitation template
 * (messageSequence.js) filled for a sample guest, without the link — the
 * buttons replace it. */
export function ChatScene() {
  return (
    <div className={styles.chatStage}>
      <PhoneFrame className={styles.chatPhone}>
        <div className={styles.waHead}>
          <span className={styles.waBack} aria-hidden="true">›</span>
          <span className={styles.avatar}>נ״ט</span>
          <span className={styles.waName}>נועה וטל<small>חשבון עסקי</small></span>
        </div>
        <div className={styles.waBody} role="img"
          aria-label="דוגמה: הזמנה בוואטסאפ עם תמונה ושלושה כפתורים — מגיעים, לא נוכל להגיע, עוד לא יודעים. האורח לוחץ מגיעים, נשאל כמה יגיעו, עונה שניים; אצלכם השורה מתעדכנת לאישרו, 2 מקומות">
          <div className={styles.template}>
            <div className={[styles.bubbleIn, styles.templateBubble].join(" ")}>
              <img className={styles.templateImg} src="/hero/hero.jpg" alt="" loading="lazy" />
              {"היי משפחת כהן 👋 שמחים להזמין אתכם לחתונה של נועה וטל! 🎉💛\n📅 12.11 · 📍 בית על הים, תל אביב\nתגיעו? 👇"}
              <span className={styles.meta}>19:02</span>
            </div>
            <span className={styles.qr}>↩ מגיעים 🎉</span>
            <span className={styles.qr}>↩ לא נוכל להגיע</span>
            <span className={styles.qr}>↩ עוד לא יודעים</span>
          </div>
          <div className={styles.bubbleOut}>
            מגיעים 🎉
            <span className={styles.meta}>19:05 ✓✓</span>
          </div>
          {/* The phone is 237px wide at 320: these two would run under the
              row card, so the smallest screens stop at the tap. */}
          <div className={[styles.bubbleIn, styles.chatExtra].join(" ")}>
            איזה כיף! 🥳 כמה תהיו?
            <span className={styles.meta}>19:05</span>
          </div>
          <div className={[styles.bubbleOut, styles.chatExtra].join(" ")}>
            שניים
            <span className={styles.meta}>19:06 ✓✓</span>
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
