// ── Activity log action type definitions ──────────────────────────────────────
//
// Used by AdminActivityScreen for display labels and icons.
// No logging is written to the DB from client code yet.
// Future: a Supabase Edge Function or trigger will insert rows here.

export const ACTION_META = {
  user_created:          { label: "משתמש נוצר",          icon: "👤", color: "#1d4ed8" },
  event_created:         { label: "אירוע נוצר",          icon: "📅", color: "#059669" },
  event_deleted:         { label: "אירוע נמחק",          icon: "🗑",  color: "#dc2626" },
  event_exported:        { label: "אירוע יוצא",          icon: "📊", color: "#7c3aed" },
  template_created:      { label: "תבנית נוצרה",         icon: "📋", color: "#0369a1" },
  subscription_changed:  { label: "מנוי שונה",           icon: "💳", color: "#be7a38" },
  admin_login:           { label: "כניסת מנהל",          icon: "🔑", color: "#374151" },
};

export const ACTION_KEYS = Object.keys(ACTION_META);

export function getActionLabel(action) {
  return ACTION_META[action]?.label ?? action ?? "—";
}

export function getActionIcon(action) {
  return ACTION_META[action]?.icon ?? "•";
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
