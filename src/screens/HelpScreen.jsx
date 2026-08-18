import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";
import Footer from "../components/layout/Footer.jsx";
import help from "./HelpScreen.module.css";
import { supportEmail, supportMailto } from "../data/company.js";

const FAQ = [
  {
    q: "איך יוצרים אירוע חדש?",
    a: "בדשבורד לחצו \"אירוע חדש\", בחרו את סוג האירוע (חתונה, בר/בת מצווה וכו') והזינו שם. אפשר להשלים את שאר הפרטים בכל שלב.",
  },
  {
    q: "איך מוסיפים שולחנות ואורחים?",
    a: "בטאב \"שולחנות\" מגדירים כמה שולחנות יש ומה הקיבולת. בטאב \"אורחים\" יש שלוש דרכים: להוסיף ידנית אחד-אחד, להדביק רשימה מוכנה (גם עם טלפונים), או לשלוח קישור לטבלה שיתופית שהמשפחה ממלאת יחד מהטלפון. את הרשימה המלאה אפשר תמיד להוריד לאקסל.",
  },
  {
    q: "איך עובד סידור ההושבה האוטומטי?",
    a: "בטאב \"הושבה\" לוחצים \"לחצו להושבה אוטומטית\". המערכת משבצת את כל האורחים תוך כיבוד קבוצות, צדדים ואילוצים (מי יושב עם מי ומי בנפרד). אפשר לגרור אורחים בין שולחנות לפי הצורך — כל שינוי נשמר מיד.",
  },
  {
    q: "מה זה אתר האירוע ואיך בונים אותו?",
    a: "בטאב \"אתר האירוע\" בונים אתר אורח יפה שנבנה אוטומטית: לוז, מיקום וניווט, הסעות, מתנה, קיר ברכות ושאלות נפוצות. בוחרים עיצוב, ממלאים פרטים, ולוחצים \"פרסמו\". אז משתפים את הקישור עם האורחים בוואטסאפ.",
  },
  {
    q: "איך אורחים מאשרים הגעה?",
    a: "כל אירוע מקבל קישור אישי לאישור הגעה (בטאב \"האירוע\" תחת \"שיתוף\"). שולחים אותו לאורחים, הם עונים בקליק, והתשובות מופיעות אצלכם בטאב \"אישורים\" — ומשם אפשר לעדכן את רשימת האורחים בלחיצה.",
  },
  {
    q: "כמה מנות כדאי להזמין מול האולם?",
    a: "בטאב \"אישורים\" יש מחשבון: מזינים מקדם אי-הגעה משוער (בדרך כלל 8–15%), והמערכת ממליצה כמה מנות לסגור — כדי לא לשלם על מנות מיותרות.",
  },
  {
    q: "איך אפשר לקבל מתנות?",
    a: "בפרטי האירוע מגדירים מספר ביט או קישור PayBox. בדף המתנה של האירוע האורחים משאירים ברכה ומקבלים את פרטי ההעברה. הברכות מופיעות בקיר הברכות באתר.",
  },
  {
    q: "הנתונים שלי בטוחים? מה קורה אם אני מתנתק?",
    a: "הנתונים נשמרים גם במכשיר שלכם וגם בענן (אם התחברתם לחשבון). מומלץ לייצא עותק Excel לפני האירוע. אנחנו לא מוכרים מידע לצד שלישי.",
  },
];

export default function HelpScreen() {
  const [open, setOpen] = useState(0);
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <SectionMark name="help" size={26} tile />
          <h1 className={styles.title}>מרכז עזרה</h1>
        </div>
        <p className={styles.updated}>כל מה שצריך כדי להתחיל — ולהפיק את המרב מהמערכת.</p>

        <div className={help.list}>
          {FAQ.map((item, i) => (
            <div key={i} className={help.item}>
              <button className={help.q} onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{item.q}</span>
                <span className={help.chevron}>{open === i ? "−" : "+"}</span>
              </button>
              {open === i && <p className={help.a}>{item.a}</p>}
            </div>
          ))}
        </div>

        <section className={styles.section} style={{ marginTop: 28 }}>
          <h2 className={styles.sectionTitle}>עוד שאלה?</h2>
          <p className={styles.text}>
            נשמח לעזור — כתבו לנו:{" "}
            <a href={supportMailto()}>{supportEmail()}</a>
          </p>
        </section>

        {/* This page's only navigation used to be a single link into /app —
            which sends a logged-out visitor arriving from the public footer
            straight into the application. The three legal pages next to it
            already go to "/", and so does this now. */}
        <div className={styles.backRow}>
          <Link to="/" className={styles.backLink}>→ חזרה לדף הבית</Link>
        </div>
      </main>

      {/* The page was a cul-de-sac: reached from the public footer, and then
          carrying no footer of its own. */}
      <Footer />
    </div>
  );
}
