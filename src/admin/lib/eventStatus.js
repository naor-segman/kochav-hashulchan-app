// ── Event status derivation ───────────────────────────────────────────────────
//
// One copy. AdminEventsScreen and AdminEventDetailScreen each had their own
// identical `deriveStatus`, so the list and the detail page could drift.
//
// What changed beyond the de-duplication: the old ladder painted ANY event
// under 50% seated as "בעיות" in red. An event three weeks out with 33% of its
// guests placed is not in trouble, it is in progress — and red is the panel's
// scarcest signal. The band is now honest about what it knows:
//
//   ריק           no guests and no tables
//   אין אורחים    tables but nobody to seat
//   אין שולחנות   guests but nowhere to seat them
//   ממתין לסידור  ready to seat, not started
//   בעיבוד        seating under way (anything above 0%)
//   מוכן          90%+
//
// None of these is an alarm, so none of them is coloured. The badges are a
// value ladder — quiet outline through to filled ink — which is the panel's
// monochrome contract. The panel's one semantic colour is reserved for a
// failing payment, which is the only state here that needs somebody to act.

export function deriveEventStatus(ev, styles) {
  const g = ev.guest_count ?? 0;
  const t = ev.table_count ?? 0;
  const s = Number(ev.seated_pct ?? 0);

  if (g === 0 && t === 0) return { label: "ריק",           cls: styles.statusEmpty    };
  if (g === 0)            return { label: "אין אורחים",    cls: styles.statusWarning  };
  if (t === 0)            return { label: "אין שולחנות",   cls: styles.statusWarning  };
  if (s >= 90)            return { label: "מוכן",          cls: styles.statusReady    };
  if (s >   0)            return { label: "בעיבוד",        cls: styles.statusProgress };
  return                         { label: "ממתין לסידור",  cls: styles.statusPending  };
}
