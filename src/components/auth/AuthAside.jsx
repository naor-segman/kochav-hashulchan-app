import Icon from "../ui/Icon.jsx";
import { COMPANY } from "../../data/company.js";
import styles from "./AuthAside.module.css";

/* The half of the sign-in screens that is not a form (WORKPLAN 136 stage C).
   The owner's rule for the whole site: speak to emotion, need and experience —
   so the screen a host meets between "I want to" and "I'm in" says what the
   account is FOR, over a real photo instead of the near-black ground it had
   (5.10: no all-black backgrounds). Desktop only; on a phone the form is the
   page and the lead line under its title carries the message.

   Every line is something the product does today. No numbers: nothing here has
   earned one (the rule that removed the invented statistics). */
const LINES = [
  "אישורי ההגעה נכנסים לרשימה לבד",
  "סידור ההושבה נבנה לבד, ואתם רק מכוונים",
  "בכניסה, כל אורח נמצא בשנייה — עם השולחן שלו",
];

export default function AuthAside() {
  return (
    <aside className={styles.aside} aria-label={`על ${COMPANY.name}`}>
      <div className={styles.content}>
        <p className={styles.kicker}><span aria-hidden="true">✦</span> {COMPANY.name}</p>
        <p className={styles.headline}>
          מהרשימה הראשונה
          <span className={styles.accent}>ועד האורח האחרון בדלת.</span>
        </p>
        <ul className={styles.lines}>
          {LINES.map(t => (
            <li key={t}><Icon name="check" size={16} /> {t}</li>
          ))}
        </ul>
        <p className={styles.close}>ואתם? נהנים מהערב.</p>
      </div>
    </aside>
  );
}
