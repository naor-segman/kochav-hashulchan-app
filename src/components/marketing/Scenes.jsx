import styles from "./Scenes.module.css";

/**
 * Two drawn scenes for the home page (136). The owner, 5.10: too many phones —
 * "זו לא הדרך היחידה להציג תמונה, אפשר להיות יצירתיים ולשלב". These show the
 * MOMENT rather than the screen: a guest answering in WhatsApp, a host at the
 * door. Names and numbers are a sample event, the same one the screenshots use.
 * The invitation text is the product's real default template (messageSequence).
 */

export function ChatScene() {
  return (
    <div className={styles.chatWrap} aria-label="דוגמה: אורח מקבל הזמנה בוואטסאפ ומאשר הגעה, והתשובה נכנסת לרשימה" role="img">
      <div className={styles.chat}>
        <div className={styles.chatHead}><span className={styles.avatar}>ד״י</span><span>דנה ויוסי</span></div>
        <div className={styles.bubbleIn}>
          היי משפחת כהן 👋{"\n\n"}אתם מוזמנים לחתונה של דנה ויוסי!{"\n"}📅 חמישי, 12.11{"\n"}📍 אולמי הגן{"\n\n"}נשמח שתאשרו הגעה:{"\n"}
          <span className={styles.link}>plan.unica-events.co.il/r/…</span>
          <span className={styles.meta}>19:02</span>
        </div>
        <div className={styles.bubbleOut}>
          מגיעים, שניים 🎉 מזל טוב!
          <span className={styles.meta}>19:05 ✓✓</span>
        </div>
      </div>
      <div className={styles.rowCard}>
        <div className={styles.rowName}>משפחת כהן</div>
        <div className={styles.rowMeta}>2 מקומות · צד הכלה · צמחוני</div>
        <span className={styles.chipOk}>אישרו ✓</span>
      </div>
      <div className={styles.tally}>
        <div><strong>132</strong><span>אישרו</span></div>
        <div><strong>48</strong><span>ממתינים</span></div>
      </div>
    </div>
  );
}

export function DoorScene() {
  return (
    <div className={styles.doorWrap} aria-label="דוגמה: בכניסה לאולם — מונה הגעה, אורח שנמצא בחיפוש עם מספר השולחן, וכרטיס שולחן מודפס" role="img">
      <div className={styles.tent}>
        <span className={styles.tentLabel}>שולחן</span>
        <span className={styles.tentNum}>9</span>
        <span className={styles.tentNames}>עדי אוחיון · נועה לוי · רון הררי · מיכל דהן</span>
      </div>
      <div className={styles.counter}>
        <div className={styles.counterTop}><strong>58</strong><span>מתוך 96 אורחים הגיעו</span></div>
        <div className={styles.bar}><span style={{ inlineSize: "60%" }} /></div>
      </div>
      <div className={styles.guest}>
        <div>
          <div className={styles.rowName}>עדי אוחיון</div>
          <div className={styles.rowMeta}>מקום אחד · צד דנה</div>
        </div>
        <span className={styles.table}>שולחן 9</span>
        <span className={styles.arrived}>הגיע/ה ✓</span>
      </div>
    </div>
  );
}
