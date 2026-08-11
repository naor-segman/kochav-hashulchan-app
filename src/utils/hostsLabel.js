/**
 * Whose event this is, in the words the person reading would actually use.
 *
 * The shared table is opened by an aunt on her phone. "רשומה מלאה נכנסת
 * לרשימה של בעלי השמחה" is a form talking; "נכנסת לרשימה של נועה וטל" is a
 * person talking, and it is also the only version that tells her she is in the
 * right place — she was sent the link, not the event name.
 *
 * Falls back through one name, then the generic phrasing, so an event whose
 * hosts were never named still reads like a sentence.
 */
export function hostsLabel(ev) {
  const a = (ev?.brideName || "").toString().trim();
  const b = (ev?.groomName || "").toString().trim();
  if (a && b) return `${a} ו${b}`;
  if (a || b) return a || b;
  return ev?.type === "אירוע עסקי" ? "המארגנים" : "בעלי השמחה";
}
