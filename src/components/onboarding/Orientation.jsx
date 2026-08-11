import SectionMark from "../ui/SectionMark.jsx";
import Icon from "../ui/Icon.jsx";
import { AREAS, areaLanding } from "../../data/eventAreas.js";
import styles from "./Orientation.module.css";

export default function Orientation({ onDismiss, onGo }) {
  return (
    <section className={styles.panel} aria-label="איך האתר בנוי">
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>לא צריך לעשות הכל היום</h2>
          <p className={styles.lead}>
            תכנון אירוע הוא שלושה סוגי עבודה שקורים בזמנים שונים. האתר מחולק בדיוק לפיהם,
            וכל אזור נפתח מהסרגל למעלה.
          </p>
        </div>
        <button className={styles.dismiss} onClick={onDismiss}>
          הבנתי <Icon name="check" size={14} />
        </button>
      </div>

      <ol className={styles.areas}>
        {AREAS.map((a, i) => (
          <li key={a.id} className={styles.area}>
            <span className={styles.areaNum}>{i + 1}</span>
            <SectionMark name={a.mark} size={26} tile className={styles.areaMark} />
            <div className={styles.areaText}>
              <span className={styles.areaName}>{a.label}</span>
              <span className={styles.areaSub}>{a.sub}</span>
              <span className={styles.areaWhen}>{a.when}</span>
            </div>
            {onGo && (
              <button className={styles.areaGo} onClick={() => onGo(areaLanding(a))}>
                פתחו <Icon name="arrowLeft" size={13} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <p className={styles.foot}>
        מתחילים מהרשימה. היא הדבר שמשתנה הכי הרבה פעמים, וממנה נגזר כמה שולחנות צריך —
        ולכן היא באה לפני הכל, גם לפני סידור האולם.
      </p>
    </section>
  );
}
