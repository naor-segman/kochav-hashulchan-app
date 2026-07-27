/**
 * Vendor tracking.
 *
 * Deliberately lives alongside the budget rather than inside it. The budget
 * answers "how much"; this answers "who, and are they actually booked" — the
 * question a host is really chasing on the phone. Keeping them separate means
 * a vendor can exist before any price is agreed, and a budget line can exist
 * with no vendor at all.
 *
 * Category ids mirror the budget's, so a vendor's spend can be read against
 * the right budget line without a second mapping.
 */

export const VENDOR_STATUSES = [
  { value: "lead",     label: "בבירור",     tone: "muted" },
  { value: "quoted",   label: "קיבלנו הצעה", tone: "warn"  },
  { value: "booked",   label: "סגור",        tone: "ok"    },
  { value: "declined", label: "לא ממשיכים",  tone: "off"   },
];

export const vendorStatus = v =>
  VENDOR_STATUSES.find(s => s.value === v) || VENDOR_STATUSES[0];

/** Payment state is separate from booking state — a booked vendor can be
 *  unpaid, part-paid or settled, and the host needs both facts at once. */
export const PAYMENT_STATUSES = [
  { value: "none",    label: "לא שולם",   tone: "off"  },
  { value: "deposit", label: "מקדמה",     tone: "warn" },
  { value: "paid",    label: "שולם",      tone: "ok"   },
];

export const paymentStatus = v =>
  PAYMENT_STATUSES.find(s => s.value === v) || PAYMENT_STATUSES[0];

/** Same ids as the budget categories, so spend lines up without a mapping. */
export const VENDOR_CATEGORIES = [
  { value: "venue",        label: "אולם" },
  { value: "catering",     label: "קייטרינג" },
  { value: "music",        label: "מוזיקה / DJ" },
  { value: "photographer", label: "צילום" },
  { value: "flowers",      label: "פרחים ועיצוב" },
  { value: "invitations",  label: "הזמנות" },
  { value: "dress",        label: "שמלה וחליפה" },
  { value: "makeup",       label: "איפור ושיער" },
  { value: "rabbi",        label: "רב / עורך טקס" },
  { value: "transport",    label: "הסעות" },
  { value: "other",        label: "אחר" },
];

export const vendorCategory = v =>
  VENDOR_CATEGORIES.find(c => c.value === v) || VENDOR_CATEGORIES.at(-1);

/** Money helper — tolerant of "12,000", "₪12000" and empty. */
export function parseAmount(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Totals across the vendor list. Declined vendors are excluded from the
 *  committed figure — you are not on the hook for someone you passed on. */
export function vendorTotals(vendors) {
  const live = (vendors || []).filter(v => v.status !== "declined");
  const price = live.reduce((s, v) => s + parseAmount(v.price), 0);
  const paid  = live.reduce((s, v) => s + parseAmount(v.paid), 0);
  return {
    count:     (vendors || []).length,
    booked:    live.filter(v => v.status === "booked").length,
    open:      live.filter(v => v.status !== "booked").length,
    committed: price,
    paid,
    remaining: Math.max(0, price - paid),
  };
}
