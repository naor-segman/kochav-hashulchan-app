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

// The business phone — on the legal pages, and the WhatsApp support line too
// (owner, 4.10: "זה גם טלפון של העסק וגם תמיכה. לא צריך 2 מספרים"). One
// number, written once, so the legal pages and the support button cannot
// disagree.
const BUSINESS_PHONE = "050-2296734";
const toWhatsapp = (local) => "972" + local.replace(/\D/g, "").replace(/^0/, "");

export const COMPANY = {
  // The brand (owner, 3.10 — WORKPLAN 128): "Unica Plan", a product of Unica.
  // ENGLISH ONLY, everywhere, Hebrew sentences included — there is no Hebrew
  // form of the name. It replaced רוויה (decided 30.8), which never reached
  // anyone outside this project.
  //
  // Next to a Hebrew prefix letter it takes a maqaf: "ב-Unica Plan", never
  // "בUnica Plan".
  name:     "Unica Plan",

  // The site lives on a subdomain of Unica's own domain; mail is on the
  // domain itself (plan@unica-events.co.il), so the two are separate fields.
  host:     "plan.unica-events.co.il",
  site:     "https://plan.unica-events.co.il",  // lights up the guest-message signature (checklist 14)
  domain:   "unica-events.co.il",               // the MAIL domain
  // Two mailboxes, so support does not drown the day-to-day mail (owner, 3.10).
  supportMailbox: "plansupport",   // questions and problems — every "תמיכה"
  contactMailbox: "plan",          // the main business address — "צרו קשר", sales
  // International digits for wa.me — the floating support button (checklist 16).
  // VITE_SUPPORT_WHATSAPP, if ever set in Netlify, still wins.
  whatsapp: toWhatsapp(BUSINESS_PHONE),
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
 * name: the number below is the owner's own, and Unica Plan is a brand operating
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
  phone:  BUSINESS_PHONE,
  /** Supplied 11.9. Rendered only when non-empty — see the note above. */
  address: "גלוסקין 38, רחובות",
};

/**
 * The version of the terms, privacy and refund pages (checklist 103).
 *
 * One date for the three of them, because a signup records which version the
 * person agreed to (`terms_version` in the auth user's metadata) and that has
 * to name the text they actually saw. Change `version` and `updated` together,
 * whenever any of the three pages changes in substance.
 */
export const LEGAL_DOCS = {
  version: "2026-10-05",
  updated: "5 באוקטובר 2026",
};

/**
 * The accessibility statement's "last updated" date.
 *
 * Kept apart from LEGAL_DOCS on purpose: LEGAL_DOCS.version is what a signup
 * consents to (terms_version), and the accessibility statement is not part of
 * that consent — tying them would make an accessibility edit look like a new
 * version of the terms.
 *
 * It was typed into AccessibilityScreen.jsx ("11 בספטמבר 2026") and stayed
 * there while the statement changed under it: the operator's brand and its
 * contact mailbox render from COMPANY/LEGAL, and both changed on 3.10
 * (WORKPLAN 128). Audit 3.10, C19. Change it whenever the statement — or the
 * identity and contact details it shows — changes in substance.
 */
export const ACCESSIBILITY_DOC = {
  updated: "3 באוקטובר 2026",
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
 * What the product does, in the words people actually search for.
 *
 * The brand name carries no meaning to someone who has never heard it, so
 * every <title> and OG description pairs it with this. Ordered by search
 * intent, not by how central the feature is to us.
 */
export const DESCRIPTOR = "סידור הושבה, אישורי הגעה וניהול אירועים";


// The last resort, so nothing renders a blank `mailto:` if COMPANY.domain is
// ever cleared. Until 3.10 it was "kochav-hashulchan.co.il" — the first brand's
// domain, which nobody owns, so mail to it went nowhere (audit C21). It is now
// the operator's own mail domain: owned, with MX at MyInbox (WORKPLAN 128), so
// even the fallback reaches a real mailbox.
const FALLBACK_DOMAIN = "unica-events.co.il";

/** The support address, best available source first. */
export function supportEmail() {
  return import.meta.env?.VITE_SUPPORT_EMAIL
    || `${COMPANY.supportMailbox || "support"}@${COMPANY.domain || FALLBACK_DOMAIN}`;
}

/** The main business address — "צרו קשר", sales, enterprise. */
export function contactEmail() {
  return import.meta.env?.VITE_CONTACT_EMAIL
    || `${COMPANY.contactMailbox || "contact"}@${COMPANY.domain || FALLBACK_DOMAIN}`;
}

/**
 * Is anyone actually reading that mailbox?
 *
 * It was false while the fallback was an unowned placeholder. The fallback is
 * now an owned domain (above), so every source answers yes. Nothing branches on
 * this; it is kept so a caller that asks still gets a true answer.
 */
export function supportContactIsReal() {
  return Boolean(import.meta.env?.VITE_SUPPORT_EMAIL || COMPANY.domain || FALLBACK_DOMAIN);
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
 * The one line appended to guest-facing WhatsApp messages: a credit, and a
 * link to the site (where the contact details are).
 *
 * It used to add a second line, "רוצים אתר לאירוע שלכם?" — a sales question in
 * a message the HOST sends to their own guests. Under the Communications Law
 * (§30א) a line that promotes a service can make the message an advertisement,
 * with the business whose service it promotes as the "advertiser" — and the
 * guests never agreed to advertising. The owner's call (2.10, checklist 103):
 * keep only "נבנה עם <the brand>", as a link. Without a site configured it is the
 * credit alone — never a broken link in somebody else's wedding message.
 */
export function messageSignature() {
  const link = COMPANY.site ? ` · ${COMPANY.site}` : "";
  return `\n\n— נבנה עם ${COMPANY.name}${link}`;
}
