/**
 * The message sequence a host actually sends.
 *
 * Everything here works today with manual WhatsApp sending — the host taps a
 * guest, WhatsApp opens with the text ready, they press send. What automated
 * sending would add is only the last step; the sequence, the templates, the
 * audiences, the per-guest sent-state and the cost estimate are the same
 * either way. Building them now means connecting a provider later is a
 * connection, not a project.
 *
 * Templates use {{placeholders}} filled from the event and the guest.
 */

export const MESSAGE_STAGES = [
  {
    key: "saveTheDate",
    label: "Save the Date",
    icon: "📅",
    when: "3–6 חודשים לפני",
    audience: "all",
    body: "היי {{שם}} 👋\n\nשומרים לכם את התאריך!\n{{אירוע}} — {{תאריך}}\n\nהפרטים המלאים בקרוב 💛\n{{קישור}}",
  },
  {
    key: "invitation",
    label: "הזמנה",
    icon: "💌",
    when: "4–6 שבועות לפני",
    audience: "all",
    body: "היי {{שם}} 👋\n\nאתם מוזמנים ל{{אירוע}}!\n📅 {{תאריך}}\n📍 {{מקום}}\n\nנשמח שתאשרו הגעה:\n{{קישור}}",
  },
  {
    key: "reminder1",
    label: "תזכורת ראשונה",
    icon: "🔔",
    when: "שבועיים לפני",
    // Only chase the people who haven't answered — messaging everyone again is
    // what makes guests mute the thread.
    audience: "pending",
    body: "היי {{שם}} 🙂\n\nעדיין לא קיבלנו את אישור ההגעה שלכם ל{{אירוע}}.\nנשמח אם תעדכנו — זה לוקח שניה:\n{{קישור}}",
  },
  {
    key: "reminder2",
    label: "תזכורת אחרונה",
    icon: "⏰",
    when: "שבוע לפני",
    audience: "pending",
    body: "היי {{שם}},\n\nאנחנו סוגרים מספרים מול המקום — נשמח לדעת אם תגיעו ל{{אירוע}}:\n{{קישור}}\n\nתודה! 💛",
  },
  {
    key: "details",
    label: "פרטי הגעה",
    icon: "📍",
    when: "2–3 ימים לפני",
    // Only the people who are actually coming need directions and a table.
    audience: "confirmed",
    body: "היי {{שם}} 👋\n\nמתרגשים לקראת {{אירוע}}!\n📅 {{תאריך}}\n📍 {{מקום}}\n\n{{שולחן}}\nנתראה! 🎉",
  },
  {
    key: "thanks",
    label: "תודה אחרי האירוע",
    icon: "💛",
    when: "1–2 ימים אחרי",
    audience: "arrived",
    body: "היי {{שם}} 💛\n\nתודה ענקית שהייתם איתנו ב{{אירוע}} — זה לא היה אותו דבר בלעדיכם!",
  },
];

export const stageByKey = key => MESSAGE_STAGES.find(s => s.key === key) || null;

export const AUDIENCES = {
  all:       { label: "כל האורחים",        match: () => true },
  pending:   { label: "שטרם אישרו",        match: g => (g.rsvp || "pending") === "pending" || g.rsvp === "maybe" },
  confirmed: { label: "שאישרו הגעה",       match: g => g.rsvp === "confirmed" },
  arrived:   { label: "שהגיעו בפועל",      match: g => !!g.arrived },
};

export const audienceLabel = key => AUDIENCES[key]?.label || AUDIENCES.all.label;

/** Guests a stage should go to — always excluding those who declined. */
export function audienceFor(stage, guests) {
  const match = (AUDIENCES[stage.audience] || AUDIENCES.all).match;
  return (guests || []).filter(g => g.rsvp !== "declined" && match(g));
}

/** Only guests with a usable phone can actually receive anything. */
export function reachable(guests) {
  return (guests || []).filter(g => (g.phone || "").replace(/\D/g, "").length >= 9);
}

/**
 * Fill a template for one guest.
 * Unknown placeholders are removed rather than left as literal {{…}} in a
 * message a guest will read.
 */
export function renderTemplate(body, { event, guest, table, link }) {
  const map = {
    "שם":     guest?.name || "",
    "אירוע":  event?.name || "האירוע",
    "תאריך":  event?.date || "",
    "מקום":   event?.venue || "",
    "שולחן":  table?.name ? `השולחן שלכם: ${table.name}` : "",
    "קישור":  link || "",
  };
  return String(body || "")
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => map[key] ?? "")
    // A removed placeholder can leave a stranded blank line.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** wa.me deep link, or null when the number is unusable. */
export function whatsappLink(phone, text) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 9) return null;
  const intl = d.startsWith("0") ? "972" + d.slice(1) : d.startsWith("972") ? d : "972" + d;
  return "https://wa.me/" + intl + "?text=" + encodeURIComponent(text || "");
}

/**
 * What an automated send would cost.
 *
 * Surfaced before anything is connected because "unlimited messages" is how a
 * package quietly loses money: 650 guests over three rounds is ~2,000 sends.
 * Rate is per message and provider-dependent; 0.12₪ is a realistic mid-market
 * figure for Israeli WhatsApp/SMS traffic.
 */
export function estimateCost(messageCount, perMessage = 0.12) {
  return Math.round(messageCount * perMessage * 100) / 100;
}
