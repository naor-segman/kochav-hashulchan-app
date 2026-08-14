/**
 * Attaching ל / ב / כ to a name the host typed.
 *
 * In Hebrew an attached prefix letter absorbs the definite article, so
 * "אתם מוזמנים ל" + "החתונה של דנה" has to read "לחתונה של דנה", not
 * "להחתונה של דנה".
 *
 * Only when the ה really IS the article, though. Testing `startsWith("ה")`
 * strips it from any name that merely begins with one: an event called
 * "הילה ואור" goes out to every guest as "מוזמנים לילה ואור", and
 * "היכל התרבות" becomes "ביכל התרבות". The event name is free text, so the
 * rule is anchored to the event-type nouns the app itself prefixes with ה.
 *
 * This lived inside messageSequence.js and was reachable only from
 * renderTemplate. Four other places built the same sentence with a raw
 * template literal and shipped the doubled article to a guest:
 *   InviteScreen:91           the text a guest FORWARDS to other guests
 *   EventSiteEditorScreen:191 the invite message the host copies
 *   GiftScreen:198, :290      the gift page
 * A second copy would have drifted from this one (bug class 6), so it moved
 * here instead.
 */

// The nouns the app itself renders with a definite article. A value starting
// with one of these carries a real ה that an attached prefix letter absorbs;
// anything else — "הילה", "הדר", "היכל התרבות" — keeps its ה.
//
// "הכנסת ספר תורה" is deliberately absent: that ה is a root letter of הכנסה,
// not an article, and the whitelist shape is what protects it.
const ARTICLE_NOUNS = [
  "חתונה", "חינה", "אירוסין", "אירוס", "בר מצווה", "בת מצווה",
  "ברית", "בריתה", "יום הולדת", "אירוע", "מסיבה", "ערב", "טקס",
  // Added after measuring 25 realistic event names: these four read as
  // "להחגיגה", "להכנס", "להסעודה", "להרמת" without them.
  "חגיגה", "כנס", "סעודה", "הרמת כוסית",
];

export function hasDefiniteArticle(value) {
  const v = String(value || "");
  if (!v.startsWith("ה")) return false;
  const rest = v.slice(1);
  return ARTICLE_NOUNS.some(n => rest === n || rest.startsWith(n + " "));
}

/**
 * `prefixed("ל", "החתונה של דנה")` → `"לחתונה של דנה"`.
 * `prefixed("ל", "הילה ואור")`     → `"להילה ואור"`.
 * An empty value returns an empty string rather than a stranded prefix letter.
 */
export function prefixed(letter, value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return letter + (hasDefiniteArticle(v) ? v.slice(1) : v);
}
