// Company / brand config — the single place to activate the growth engine.
//
// These are intentionally EMPTY placeholders until the final brand name,
// domain, and company WhatsApp number are decided (Phase 2 / launch). The
// moment they're filled here, the guest-message signature and the two-way
// WhatsApp reply CTA light up across the whole product automatically.

export const COMPANY = {
  name:     "כוכב השולחן", // placeholder brand name (not final)
  site:     "",            // main marketing site URL, e.g. "https://kochav.co"
  whatsapp: "",            // company WhatsApp number digits, e.g. "972500000000"
};

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
