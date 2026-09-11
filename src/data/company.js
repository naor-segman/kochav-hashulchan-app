// Company / brand config — the single place to activate the growth engine,
// and the single place the support address lives.
//
// WHAT WAS WRONG (checklist 15): `kochav-hashulchan.co.il` was hardcoded NINE
// times across EIGHT files — the footer, the account screen, accessibility,
// help, pricing, privacy, terms and the landing page. It is a domain nobody
// owns, so every one of those links drops a customer's question into a hole.
// Two of the nine already honoured `VITE_SUPPORT_EMAIL`; the other seven
// ignored it, so setting that variable in Netlify fixed a quarter of the
// problem and looked like it had fixed all of it.
//
// Now there is one source. Buying the domain is ONE LINE below, and setting
// VITE_SUPPORT_EMAIL is an alternative that needs no code change at all.

export const COMPANY = {
  // The brand, decided 30.8 (checklist 11). Three forms, because Hebrew needs
  // three and picking the wrong one in the wrong place is how a brand looks
  // careless:
  //
  //   name       running text, every screen, every message. Plain ktiv male.
  //              NOT "רויה" — an unpointed consonantal vav must be doubled or
  //              the word reads "roya"/"ruya" instead of "revaya".
  //   nameShuruk the pointed, biblical form. Logo, hero, the places where the
  //              name is a statement rather than a label. Never in body text —
  //              niqqud inside a paragraph reads as a typo.
  //   nameLatin  domains, Meta/WhatsApp Business, anything Latin-script.
  //
  name:       "רוויה",
  namePointed:"רְוָיָה",
  nameLatin:  "REVAYA",

  domain:   "revaya-events.co.il",   // bought 31.8, support@ is a real mailbox (checklist 13)
  site:     "https://revaya-events.co.il",  // lights up the guest-message signature (checklist 14)
  whatsapp: "",            // company WhatsApp digits, e.g. "972500000000" (checklist 16)
};

/**
 * Who legally operates this service. Checklist 19–20.
 *
 * The three legal pages carried NO legal identity at all before this — not a
 * name, not a registration number, not a phone. Only a support mailbox. תנאי
 * שימוש that never say who you are contracting with, a privacy policy that
 * never names the data controller, and an accessibility statement whose
 * coordinator is an email address are all incomplete in the same way.
 *
 * One source, for the same reason the domain is one source: it was hardcoded
 * NINE times across eight files and setting the env var fixed a quarter of the
 * problem while looking like it had fixed all of it.
 *
 * ── The details, supplied by the owner on 11.9 ──────────────────────────────
 * `עוסק פטור` is a sole-trader registration held by a PERSON, not by a trade
 * name: the number below is the owner's own, and רוויה is a brand operating
 * under it alongside his other one. That is why `name` is the person and
 * `brand` is separate — a receipt has to carry the registered name, and only
 * the registered name identifies who the customer is contracting with.
 *
 * TWO CONSEQUENCES worth knowing before anyone writes a price (checklist 31,
 * 45, 46), because they are properties of the STATUS and not of this file:
 *   • A עוסק פטור does not charge VAT and cannot issue a חשבונית מס — only a
 *     קבלה. So a price shown here is final, and must never be labelled
 *     "+ מע\"מ" or "כולל מע\"מ". Nothing in the app says either today.
 *   • The status carries an annual turnover ceiling, per person and not per
 *     business, above which registration as עוסק מורשה is mandatory.
 *
 * `address` was deliberately empty until the owner supplied one on 11.9 — an
 * address that is wrong on a legal page is worse than one that is missing.
 * Every consumer below still omits the row rather than printing a blank, so
 * emptying this field again degrades correctly instead of leaving "כתובת:"
 * followed by nothing.
 */
export const LEGAL = {
  /** The registered name. This is who the customer contracts with. */
  name:   "נאור סגמן",
  /** Sole-trader registration. `type` is rendered beside it, never alone. */
  type:   "עוסק פטור",
  taxId:  "313614067",
  /** Business phone. Also the accessibility coordinator's, which the
      Accessibility Regulations ask for by name and by phone. */
  phone:  "050-2296734",
  /** Supplied 11.9. Rendered only when non-empty — see the note above. */
  address: "גלוסקין 38, רחובות",
};

/** "נאור סגמן, עוסק פטור 313614067" — the identity line, built once. */
export function legalLine() {
  return `${LEGAL.name}, ${LEGAL.type} ${LEGAL.taxId}`;
}

/** `tel:` href for the business phone, digits only. */
export function legalTel() {
  return `tel:${LEGAL.phone.replace(/[^\d+]/g, "")}`;
}

/**
 * The verse the name comes from — Psalms 23:5.
 *
 * Kept here rather than retyped per screen for the same reason the support
 * address is: a quoted verse that drifts by one letter across six pages is
 * worse than not quoting it. `VERSE.lines` for display, `VERSE.source` for the
 * citation.
 *
 * Meaning, so nobody has to look it up to place it correctly: the psalm stops
 * describing God as a shepherd here and starts describing Him as a HOST — He
 * lays a table, anoints the guest's head with oil (the ancient Near-Eastern
 * welcome), and fills the cup past the brim. It is the Bible's most famous
 * description of hospitality, and its opening verb is literally "to lay a
 * table".
 */
export const VERSE = {
  lines: [
    "תַּעֲרֹךְ לְפָנַי שֻׁלְחָן נֶגֶד צֹרְרָי,",
    "דִּשַּׁנְתָּ בַשֶּׁמֶן רֹאשִׁי,",
    "כּוֹסִי רְוָיָה.",
  ],
  short:  "תַּעֲרֹךְ לְפָנַי שֻׁלְחָן",
  source: "תהלים כ״ג, ה",
};

/**
 * What the product does, in the words people actually search for.
 *
 * The brand name carries no meaning to someone who has never heard it, so
 * every <title> and OG description pairs it with this. Ordered by search
 * intent, not by how central the feature is to us.
 */
export const DESCRIPTOR = "סידור הושבה, אישורי הגעה וניהול אירועים";


// The address the product has always shown. Kept as the last resort so nothing
// renders a blank `mailto:` before the domain is bought — but it is NOT OWNED,
// and mail sent to it goes nowhere. `supportContactIsReal()` is how a caller
// asks whether that is still the case.
const PLACEHOLDER_DOMAIN = "kochav-hashulchan.co.il";

/** The support address, best available source first. */
export function supportEmail() {
  return import.meta.env?.VITE_SUPPORT_EMAIL
    || `support@${COMPANY.domain || PLACEHOLDER_DOMAIN}`;
}

/** Sales / enterprise enquiries. A separate mailbox on the same domain. */
export function contactEmail() {
  return import.meta.env?.VITE_CONTACT_EMAIL
    || `contact@${COMPANY.domain || PLACEHOLDER_DOMAIN}`;
}

/**
 * Is anyone actually reading that mailbox?
 *
 * False means the product is still showing the placeholder — every "צרו קשר"
 * on the site is decorative. Nothing branches on this yet; it exists so the
 * decision to hide or replace those links can be made in one place when the
 * legal pages get their real contact details (checklist 19-20).
 */
export function supportContactIsReal() {
  return Boolean(import.meta.env?.VITE_SUPPORT_EMAIL || COMPANY.domain);
}

/** A `mailto:` with an optional pre-filled subject and body, encoded once. */
export function supportMailto(subject, body) {
  return mailto(supportEmail(), subject, body);
}

/** The same, for the sales mailbox behind the Enterprise plan's CTA. */
export function contactMailto(subject, body) {
  return mailto(contactEmail(), subject, body);
}

// One builder, so nothing hand-concatenates a `mailto:` again — the encoding
// drifts (the account screen carried 200 characters of hand-written %D7%9E)
// and a second address appears without anyone noticing.
function mailto(address, subject, body) {
  const q = [];
  if (subject) q.push("subject=" + encodeURIComponent(subject));
  if (body)    q.push("body=" + encodeURIComponent(body));
  return `mailto:${address}${q.length ? "?" + q.join("&") : ""}`;
}

/**
 * A tasteful one-line signature appended to guest-facing WhatsApp messages.
 * Turns every message into a soft, two-way growth touchpoint — but only once
 * a company contact is configured (otherwise just the attribution line, no
 * broken links).
 */
export function messageSignature() {
  const parts = [`נבנה עם ${COMPANY.name}`];
  if (COMPANY.whatsapp) {
    parts.push(`רוצים אתר לאירוע שלכם? שיחה איתנו: https://wa.me/${COMPANY.whatsapp}`);
  } else if (COMPANY.site) {
    parts.push(`רוצים אתר לאירוע שלכם? ${COMPANY.site}`);
  }
  return "\n\n— " + parts.join("\n");
}
