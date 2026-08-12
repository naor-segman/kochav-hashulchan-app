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
 *
 * `when` uses a plain HYPHEN-MINUS in ranges, never an en-dash. Measured in the
 * browser: "3–6 חודשים לפני" puts the 6 to the LEFT of the 3 — an en-dash is an
 * Other Neutral, so bidi N1 resolves it RTL between two European numbers and
 * swaps them. A hyphen-minus is a European Separator, W4 folds it into a single
 * number run, and "3-6" stays in order. Same class as the spaced slash.
 */

export const MESSAGE_STAGES = [
  {
    key: "saveTheDate",
    label: "Save the Date",
    icon: "calendar",
    when: "3-6 חודשים לפני",
    audience: "all",
    body: "היי {{שם}} 👋\n\nשומרים לכם את התאריך!\n{{אירוע}} — {{תאריך}}\n\nהפרטים המלאים בקרוב 💛\n{{קישור}}",
  },
  {
    key: "invitation",
    label: "הזמנה",
    icon: "mail",
    when: "4-6 שבועות לפני",
    audience: "all",
    body: "היי {{שם}} 👋\n\nאתם מוזמנים ל{{אירוע}}!\n📅 {{תאריך}}\n📍 {{מקום}}\n\nנשמח שתאשרו הגעה:\n{{קישור}}",
  },
  {
    key: "reminder1",
    label: "תזכורת ראשונה",
    icon: "bell",
    when: "שבועיים לפני",
    // Only chase the people who haven't answered — messaging everyone again is
    // what makes guests mute the thread.
    audience: "pending",
    body: "היי {{שם}} 🙂\n\nעדיין לא קיבלנו את אישור ההגעה שלכם ל{{אירוע}}.\nנשמח אם תעדכנו — זה לוקח שניה:\n{{קישור}}",
  },
  {
    key: "reminder2",
    label: "תזכורת אחרונה",
    icon: "clock",
    when: "שבוע לפני",
    audience: "pending",
    body: "היי {{שם}},\n\nאנחנו סוגרים מספרים מול המקום — נשמח לדעת אם תגיעו ל{{אירוע}}:\n{{קישור}}\n\nתודה! 💛",
  },
  {
    key: "details",
    label: "פרטי הגעה",
    icon: "pin",
    when: "2-3 ימים לפני",
    // Only the people who are actually coming need directions and a table.
    audience: "confirmed",
    body: "היי {{שם}} 👋\n\nמתרגשים לקראת {{אירוע}}!\n📅 {{תאריך}}\n📍 {{מקום}}\n\n{{שולחן}}\nנתראה! 🎉",
  },
  {
    key: "thanks",
    label: "תודה אחרי האירוע",
    icon: "heart",
    when: "1-2 ימים אחרי",
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
// The nouns the app itself renders with a definite article. A value starting
// with one of these carries a real ה that an attached prefix letter absorbs;
// anything else — "הילה", "הדר", "היכל התרבות" — keeps its ה.
const ARTICLE_NOUNS = [
  "חתונה", "חינה", "אירוסין", "אירוס", "בר מצווה", "בת מצווה",
  "ברית", "בריתה", "יום הולדת", "אירוע", "מסיבה", "ערב", "טקס",
];

function hasDefiniteArticle(value) {
  const v = String(value || "");
  if (!v.startsWith("ה")) return false;
  const rest = v.slice(1);
  return ARTICLE_NOUNS.some(n => rest === n || rest.startsWith(n + " "));
}

export function renderTemplate(body, { event, guest, table, link }) {
  // Null-prototype: a plain object resolves {{constructor}} and {{toString}}
  // through Object.prototype, which would put "function Object() { [native
  // code] }" into a message a guest reads. Templates are host-editable.
  const map = Object.assign(Object.create(null), {
    "שם":     guest?.name || "",
    "אירוע":  event?.name || "האירוע",
    "תאריך":  event?.date || "",
    "מקום":   event?.venue || "",
    "שולחן":  table?.name ? `השולחן שלכם: ${table.name}` : "",
    "קישור":  link || "",
  });
  const get = key => (Object.hasOwn(map, key) ? map[key] : "");

  return String(body || "")
    // In Hebrew an attached prefix letter absorbs the definite article, so
    // "אתם מוזמנים ל" + "החתונה של דנה" has to read "לחתונה של דנה".
    //
    // Only when the ה really IS the article, though. Testing `startsWith("ה")`
    // stripped it from any name that merely begins with one: an event called
    // "הילה ואור" went out to every guest as "מוזמנים לילה ואור", and
    // "היכל התרבות" became "ביכל התרבות". The event name is free text, so the
    // rule is anchored to the event-type nouns the app itself prefixes with ה.
    // The lookbehind allowed start-of-line, whitespace or "(" — so a prefix
    // letter carried by a conjunction ("ול{{אירוע}}") was skipped and went out
    // as "ולהחתונה". Templates are host-editable, so that shape is reachable.
    // ו and ש are the two letters that attach in front of a prefix letter.
    .replace(/(?<=^|[\s(]|[וש])([לבכ])\{\{\s*([^}]+?)\s*\}\}/gm, (_, prefix, key) => {
      const v = get(key);
      return prefix + (hasDefiniteArticle(v) ? v.slice(1) : v);
    })
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => get(key))
    // A removed placeholder can leave a stranded blank line.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** wa.me deep link, or null when the number is unusable. */
export function whatsappLink(phone, text) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length < 9) return null;
  d = d.replace(/^00/, "");
  let intl;
  // Same redundant trunk zero as parseGuestList: "+972 (0)52…" digitises to
  // 9720521234567, which is a dead wa.me link.
  if (d.startsWith("9720"))     intl = "972" + d.slice(4);
  else if (d.startsWith("972")) intl = d;                       // already Israeli
  else if (d.startsWith("0"))   intl = "972" + d.slice(1);       // local form
  else if (d.length === 9)      intl = "972" + d;                // local, no zero
  // Anything else already carries its own country code. Relatives abroad are
  // normal at Israeli weddings, and forcing 972 onto a US number produced a
  // link to an account that does not exist.
  else                          intl = d;
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
