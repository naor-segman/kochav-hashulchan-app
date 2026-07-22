// ── Activity log action type definitions ──────────────────────────────────────
//
// Used by AdminActivityScreen for display labels and icons.
// No logging is written to the DB from client code yet.
// Future: a Supabase Edge Function or trigger will insert rows here.

// icon values are names from the shared Icon component (line-icon set).
export const ACTION_META = {
  user_created:          { label: "משתמש נוצר",          icon: "users",     color: "#1d4ed8" },
  event_created:         { label: "אירוע נוצר",          icon: "calendar",  color: "#059669" },
  event_deleted:         { label: "אירוע נמחק",          icon: "trash",     color: "#dc2626" },
  event_exported:        { label: "אירוע יוצא",          icon: "chart",     color: "#7c3aed" },
  template_created:      { label: "תבנית נוצרה",         icon: "clipboard", color: "#0369a1" },
  subscription_changed:  { label: "מנוי שונה",           icon: "card",      color: "#0E9AB8" },
  admin_login:           { label: "כניסת מנהל",          icon: "key",       color: "#374151" },
};

export const ACTION_KEYS = Object.keys(ACTION_META);

export function getActionLabel(action) {
  return ACTION_META[action]?.label ?? action ?? "—";
}

export function getActionIcon(action) {
  return ACTION_META[action]?.icon ?? null;
}

export const ENTITY_TYPE_LABELS = {
  user:         "משתמש",
  event:        "אירוע",
  template:     "תבנית",
  subscription: "מנוי",
  admin:        "מנהל",
};

export function getEntityLabel(entityType) {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType ?? "—";
}
