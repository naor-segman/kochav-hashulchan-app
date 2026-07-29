/* A stand-in for src/lib/supabase.js, used ONLY by vite.admin-preview.config.js.
 *
 * The admin panel sits behind AdminGuard, which needs a live Supabase admin
 * session. Without one every screen renders its loading branch, so the design
 * pass could look at the chrome and never at a populated table — which is
 * where a dense grey panel actually succeeds or fails.
 *
 * This returns plausible Hebrew rows for the query shapes the panel uses. It
 * is a thenable query builder: every chained method returns `this`, and
 * awaiting it resolves to { data, count, error }. That is enough for
 * `.select().order().limit()`, `.range()`, `.in()` and head-count selects.
 */

const NAMES = [
  "החתונה של דנה ויוסי", "בר המצווה של איתי", "בת המצווה של רומי",
  "החינה של שירן ואלון", "כנס לקוחות 2027", "ברית של משפחת לוי",
  "יום הולדת 60 לאמא", "החתונה של מאיה וניר",
];
const EMAILS = [
  "dana@example.com", "yossi.k@example.com", "romi.levi@example.com",
  "shiran@example.com", "office@company.co.il", "avi.mizrahi@example.com",
];
const TYPES = ["חתונה", "בר מצווה", "בת מצווה", "חינה", "אירוע עסקי", "ברית"];

const iso = (daysAgo) => new Date(Date.UTC(2026, 6, 29 - daysAgo)).toISOString();

const PROFILES = EMAILS.map((email, i) => ({
  id: "u" + i,
  email,
  full_name: ["דנה כהן", "יוסי כהן", "רומי לוי", "שירן אבני", "רכזת אירועים", "אבי מזרחי"][i],
  role: i === 0 ? "admin" : "user",
  created_at: iso(i * 9 + 3),
  subscriptions: i % 3 === 0
    ? [{ plan: i === 0 ? "enterprise" : "pro", status: "active", started_at: iso(i * 9) }]
    : [],
}));

const EVENTS = NAMES.map((name, i) => ({
  id: "e" + i,
  user_id: "u" + (i % PROFILES.length),
  name,
  type: TYPES[i % TYPES.length],
  date: `2027-0${(i % 8) + 1}-1${i % 9}`,
  venue: ["אולמי הגן, רחובות", "בית על הים, תל אביב", "האחוזה, כפר סבא"][i % 3],
  guest_count: [312, 84, 190, 46, 520, 128, 61, 240][i],
  table_count: [28, 9, 18, 5, 47, 12, 7, 22][i],
  seated_pct: [96, 0, 54, 100, 12, 78, 0, 33][i],
  created_at: iso(i * 5 + 10),
  updated_at: iso(i),
  profiles: { email: EMAILS[i % EMAILS.length] },
}));

const TEMPLATES = TYPES.map((t, i) => ({
  id: "t" + i, name: t, icon: "💍", type: t, is_active: i !== 4,
  tables: 20 + i * 3, created_at: iso(i * 12),
}));

const SUBSCRIPTIONS = PROFILES.filter(p => p.subscriptions.length).map((p, i) => ({
  id: "s" + i, user_id: p.id, plan: p.subscriptions[0].plan,
  status: "active", started_at: p.subscriptions[0].started_at,
  current_period_end: iso(-30 + i), profiles: { email: p.email },
}));

const ACTIVITY = [
  ["event.created", "u0", "אירוע נוצר"], ["user.signup", "u3", "משתמש נרשם"],
  ["subscription.started", "u0", "מנוי הופעל"], ["event.deleted", "u2", "אירוע נמחק"],
  ["template.updated", "u0", "תבנית עודכנה"], ["event.created", "u4", "אירוע נוצר"],
].map(([action, actor, note], i) => ({
  id: "a" + i, action, actor_id: actor, note,
  created_at: iso(i), profiles: { email: EMAILS[i % EMAILS.length] },
}));

const SETTINGS = [
  { key: "product_name", value: "כוכב השולחן" },
  { key: "default_tables", value: "20" },
  { key: "feature_ai_seating", value: "false" },
  { key: "system_note", value: "בטא — כל התוכניות פתוחות" },
];

const TABLES = {
  profiles: PROFILES,
  events: EVENTS,
  templates: TEMPLATES,
  subscriptions: SUBSCRIPTIONS,
  admin_activity: ACTIVITY,
  activity_log: ACTIVITY,
  settings: SETTINGS,
  app_settings: SETTINGS,
};

class Query {
  constructor(table) {
    this.rows = TABLES[table] ? [...TABLES[table]] : [];
    this.head = false;
  }
  select(_cols, opts) { if (opts && opts.head) this.head = true; return this; }
  order()   { return this; }
  limit(n)  { this.rows = this.rows.slice(0, n); return this; }
  range(a, b) { this.rows = this.rows.slice(a, b + 1); return this; }
  eq()      { return this; }
  in()      { return this; }
  neq()     { return this; }
  single()  { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
  maybeSingle() { return this.single(); }
  update()  { return this; }
  insert()  { return this; }
  delete()  { return this; }
  upsert()  { return this; }
  then(res) {
    return Promise.resolve({
      data: this.head ? null : this.rows,
      count: this.rows.length,
      error: null,
    }).then(res);
  }
}

export const isSupabaseConfigured = true;

export const supabase = {
  from: (table) => new Query(table),
  rpc: () => Promise.resolve({ data: [], error: null }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: { user: { id: "u0" } } } }),
    getUser: () => Promise.resolve({ data: { user: { id: "u0", email: "admin@kochav-hashulchan.co.il" } } }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
