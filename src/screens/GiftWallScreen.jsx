import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchEventByToken, subscribeToGifts } from "../utils/publicTokens.js";
import styles from "./GiftWallScreen.module.css";

const MOCK_EVENT = {
  name: "חתונת נועה וטל",
  brideName: "נועה",
  groomName: "טל",
};

const MOCK_GIFTS = [
  { id: "1", donor_name: "משפחת כהן",    amount: 50000, message: "מאחלים אושר ואהבה!" },
  { id: "2", donor_name: "יעקב ורחל",    amount: 30000, message: "שיהיה בשעה טובה" },
  { id: "3", donor_name: "נועם ברק",      amount: 20000, message: null },
  { id: "4", donor_name: "משפחת לוי",    amount: 50000, message: "מזל טוב לכם!" },
  { id: "5", donor_name: "שרה מזרחי",    amount: 10000, message: "בהצלחה בדרך החדשה" },
  { id: "6", donor_name: "גיל ורות פרץ", amount: 30000, message: "שתגדלו לבנות בית נאמן" },
  { id: "7", donor_name: "חיים נחום",    amount: 20000, message: null },
  { id: "8", donor_name: "ד\"ר ברנשטיין",  amount: 100000, message: "🥂 לחיים!" },
];

function fmtILS(agot) {
  return "₪" + (agot / 100).toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

export default function GiftWallScreen() {
  const { token } = useParams();
  const [event, setEvent]   = useState(null);
  const [gifts, setGifts]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchEventByToken("gift", token);
      if (!cancelled) {
        setEvent(ev || MOCK_EVENT);
        setGifts(ev ? [] : MOCK_GIFTS);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!event?.cloudId) return;
    const unsub = subscribeToGifts(event.cloudId, (newGift) => {
      setGifts(prev => [newGift, ...prev]);
    });
    return unsub;
  }, [event?.cloudId]);

  const total = gifts.reduce((s, g) => s + (g.amount || 0), 0);

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const ev = event || MOCK_EVENT;
  const coupleLabel = ev.brideName && ev.groomName ? `${ev.brideName} & ${ev.groomName}` : ev.name;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.headerStar} aria-hidden="true">✦</span>
        <h1 className={styles.headerTitle}>{coupleLabel}</h1>
        <div className={styles.totalBadge}>
          <span className={styles.totalLabel}>סך מתנות</span>
          <span className={styles.totalNum}>{fmtILS(total)}</span>
          <span className={styles.totalCount}>{gifts.length} תורמים</span>
        </div>
      </header>

      {gifts.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>💌</span>
          <p>ממתין למתנות…</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {gifts.map(g => (
            <div key={g.id} className={styles.giftCard}>
              <div className={styles.giftAmount}>{fmtILS(g.amount || 0)}</div>
              <div className={styles.giftName}>{g.donor_name}</div>
              {g.message && <div className={styles.giftMsg}>"{g.message}"</div>}
            </div>
          ))}
        </div>
      )}

      <footer className={styles.footer}>
        <span>✦ כוכב השולחן</span>
      </footer>
    </div>
  );
}
