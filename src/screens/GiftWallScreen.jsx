import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchEventByToken, subscribeToGifts } from "../utils/publicTokens.js";
import styles from "./GiftWallScreen.module.css";

const MOCK_GIFTS = [
  { id: "1", donor_name: "משפחת כהן", amount: 50000, message: "מזל טוב! שתבנו בית נאמן", created_at: new Date(Date.now() - 600000).toISOString() },
  { id: "2", donor_name: "אבי ורות לוי", amount: 30000, message: "ברכות חמות לזוג המאושר", created_at: new Date(Date.now() - 500000).toISOString() },
  { id: "3", donor_name: "יוסי שלמה", amount: 20000, message: "שיהיה בשעה טובה ומוצלחת!", created_at: new Date(Date.now() - 400000).toISOString() },
  { id: "4", donor_name: "צוות המשרד", amount: 100000, message: "מכל הלב — הצלחה בדרך החדשה", created_at: new Date(Date.now() - 300000).toISOString() },
  { id: "5", donor_name: "סבתא מרים", amount: 50000, message: "נחת ושמחה מהילדים", created_at: new Date(Date.now() - 200000).toISOString() },
  { id: "6", donor_name: "חברי הצבא", amount: 40000, message: "לזוג האהוב — בהצלחה בדרך החדשה!", created_at: new Date(Date.now() - 100000).toISOString() },
  { id: "7", donor_name: "דוד ואסתר", amount: 30000, message: "מזל טוב מכל הלב", created_at: new Date(Date.now() - 50000).toISOString() },
  { id: "8", donor_name: "חברת כוכב", amount: 50000, message: "ברכות חמות ואוהבות", created_at: new Date().toISOString() },
];

// amount is in agorot — divide by 100 to get ILS
function fmtILS(agot) {
  return "₪" + (agot / 100).toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

function timeAgo(isoString) {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return "עכשיו";
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export default function GiftWallScreen() {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchEventByToken("gift", token);
      if (!cancelled) {
        setEvent(ev || null);
        setGifts(ev ? [] : MOCK_GIFTS);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!event?.cloudId) return;
    const unsub = subscribeToGifts(event.cloudId, (newGift) => {
      setGifts((prev) => [newGift, ...prev]);
    });
    return unsub;
  }, [event?.cloudId]);

  const totalILS = gifts
    .filter((g) => g.paid !== false)
    .reduce((s, g) => s + g.amount / 100, 0);

  let eventName = "חתונת נועה וטל";
  if (event) {
    if (event.brideName && event.groomName) {
      eventName = `${event.brideName} ו${event.groomName}`;
    } else if (event.name) {
      eventName = event.name;
    }
  }

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <span className={styles.logo} aria-label="כוכב השולחן">
          ✦ כוכב השולחן
        </span>
        <h1 className={styles.eventName}>{eventName}</h1>
        <span className={styles.wallLabel}>קיר ברכות</span>
      </header>

      <main className={styles.content}>
        {gifts.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">💌</span>
            <p className={styles.emptyText}>ממתין למתנות…</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {gifts.map((g) => (
              <article key={g.id} className={styles.giftCard}>
                <div className={styles.giftAmount}>{fmtILS(g.amount)}</div>
                <div className={styles.giftName}>{g.donor_name}</div>
                {g.message && (
                  <p className={styles.giftMsg}>"{g.message}"</p>
                )}
                <time className={styles.giftTime} dateTime={g.created_at}>
                  {timeAgo(g.created_at)}
                </time>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className={styles.bottomBar}>
        <p className={styles.totalLine}>
          סה״כ מתנות שהתקבלו:{" "}
          <span className={styles.totalAmount}>
            {"₪" + totalILS.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
          </span>
        </p>
      </footer>
    </div>
  );
}
