/* The sample invitation (owner, 6.10: "אהבתי בדיגינט… עמוד נחיתה נפרד ל'צפו
 * בהזמנה לדוגמא' — ממש הראה לי איך ההזמנה נראית וממש מאפשר לעבוד איתה").
 *
 * A real guest page, driven by a built-in event instead of the database: the
 * public fetchers in utils/publicTokens.js answer SAMPLE_TOKEN from here, and
 * the writes (an RSVP, a gift, a blessing) succeed without leaving the browser.
 * So /invite/sample, /rsvp/sample and /invitation/sample are the pages a
 * guest gets — the same screens, the same code — and nothing a visitor types
 * on them is stored anywhere.
 *
 * SAMPLE_TOKEN is five characters. A real token is a UUID, and the server
 * refuses anything shorter than eight (public_event_by_token), so this one
 * can never name a real event, and a real one can never be answered from here.
 */
export const SAMPLE_TOKEN = "sample";

export const isSampleToken = (t) => t === SAMPLE_TOKEN;

/** "YYYY-MM-DD", local calendar, n days from today (never toISOString — bug class 2). */
function dayFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A fresh copy each call: the date moves with today, so the countdown is live. */
export function sampleEvent() {
  return {
    cloudId: null,
    name: "החתונה של נועה וטל",
    type: "חתונה",
    date: dayFromToday(75),
    venue: "בית על הים, תל אביב",
    receptionTime: "19:30",
    brideName: "נועה",
    groomName: "טל",
    celebrantName: "", organizationName: "", contactName: "", ownerName: "",
    rsvpToken: SAMPLE_TOKEN,
    giftToken: SAMPLE_TOKEN,
    inviteToken: SAMPLE_TOKEN,
    albumToken: null,
    announcements: {
      invitation: {
        enabled: true, themeKey: "rose", layout: "card", photo: "/hero/hero.jpg",
        headline: "אנחנו מתחתנים!", subheadline: "",
        message: "נשמח לראות אתכם ביום המאושר שלנו 💛",
        showCountdown: true, showRsvp: true, showSite: true, showLocation: true,
      },
      saveTheDate: { enabled: true, themeKey: "rose", layout: "center", photo: "/hero/hero.jpg" },
    },
    site: {
      enabled: true, themeKey: "rose", heroEn: "OUR WEDDING DAY", coverPhoto: "/hero/hero.jpg",
      story: "אחרי שבע שנים, המון אהבה וכלב אחד — אנחנו מתחתנים! נשמח שתהיו איתנו ביום הזה.",
      schedule: [
        { id: "1", time: "19:30", title: "קבלת פנים", icon: "🥂" },
        { id: "2", time: "20:30", title: "חופה", icon: "💍" },
        { id: "3", time: "21:00", title: "ארוחת ערב", icon: "🍽️" },
        { id: "4", time: "22:00", title: "רוקדים עד הבוקר", icon: "💃" },
      ],
      shuttles: [
        { id: "s1", place: "ירושלים — תחנה מרכזית", time: "17:45", direction: "הלוך וחזור" },
        { id: "s2", place: "חיפה — מרכז חורב", time: "17:30", direction: "הלוך וחזור" },
      ],
      address: "הרברט סמואל 1, תל אביב",
      wazeUrl: "https://waze.com/ul?q=%D7%94%D7%A8%D7%91%D7%A8%D7%98%20%D7%A1%D7%9E%D7%95%D7%90%D7%9C%201%20%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91",
      parkingNote: "חניה חינם בחניון הסמוך, במרחק דקה מהאולם.",
      faq: [
        { id: "1", q: "איך מגיעים? יש חניה?", a: "חניה חינם בחניון הסמוך, וגם הסעות מירושלים ומחיפה." },
        { id: "2", q: "עד מתי לאשר הגעה?", a: "עד שבועיים לפני — כדי שנוכל לסדר לכם מקום טוב." },
      ],
      rsvpMessage: "נשמח לדעת אם תגיעו 💛",
      sections: { schedule: true, location: true, shuttles: true, gift: true, blessings: true, faq: true },
    },
  };
}

/** The blessings wall, as a guest would see it on a real event. */
export const SAMPLE_WISHES = [
  { id: "w1", donor_name: "סבתא רחל", message: "מאחלת לכם אהבה גדולה כמו שלי ושל סבא. מזל טוב! ❤️", created_at: "2026-01-01T10:00:00Z" },
  { id: "w2", donor_name: "יואב ומיכל", message: "שתמיד תצחקו ככה. אוהבים אתכם!", created_at: "2026-01-01T09:00:00Z" },
  { id: "w3", donor_name: "החבר'ה מהצבא", message: "מזל טוב אחי! נתראה ברחבה 🕺", created_at: "2026-01-01T08:00:00Z" },
];
