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

/* The two tables the panel actually names. `admin_activity` / `activity_log`
   below were never queried by anything — AdminActivityScreen asks for
   `activity_logs` and AdminErrorsScreen for `error_reports`, so both screens
   rendered their empty state and the mobile pass never saw a populated row. */
const ACTIVITY_LOGS = [
  ["event_created",        "u0", "event",        "e0", "החתונה של דנה ויוסי", { guests: 312, tables: 28 }],
  ["user_created",         "u3", "user",         "u3", "שירן אבני",           {}],
  ["subscription_changed", "u0", "subscription", "s0", "ארגוני",              { from: "pro", to: "enterprise" }],
  ["event_deleted",        "u2", "event",        "e9", "יום הולדת 60 לאמא",   { guests: 61 }],
  ["template_created",     "u0", "template",     "t2", "בת מצווה",            { tables: 26 }],
  ["event_exported",       "u4", "event",        "e4", "כנס לקוחות 2027",     { format: "xlsx", rows: 520 }],
  ["admin_login",          "u0", "user",         "u0", "admin@kochav-hashulchan.co.il", {}],
].map(([action, actor, entity_type, entity_id, entity_name, metadata], i) => ({
  id: "al" + i, action, actor_id: actor, entity_type, entity_id, entity_name,
  metadata, created_at: iso(i), profiles: { email: EMAILS[i % EMAILS.length] },
}));

const ERRORS = [
  ["TypeError: Cannot read properties of undefined (reading 'guests')", "/events/e3/seating", "render",
   "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/605.1",
   "TypeError: Cannot read properties of undefined (reading 'guests')\n    at seatGuests (seating.js:214:19)\n    at SeatingScreen (SeatingScreen.jsx:88:5)\n    at renderWithHooks (react-dom.js:11121:18)"],
  ["Failed to fetch", "/events/e1/rsvps", "promise",
   "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
   "TypeError: Failed to fetch\n    at cloudSync.js:142:11"],
  ["ResizeObserver loop completed with undelivered notifications.", "/events/e0/tables", "window",
   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", ""],
].map(([message, route, kind, user_agent, stack], i) => ({
  id: "er" + i, created_at: iso(i), message, stack, route, user_agent, kind, seen: i === 2,
}));

const SETTINGS = [
  { key: "product_name", value: "כוכב השולחן" },
  { key: "default_tables", value: "20" },
  { key: "feature_ai_seating", value: "false" },
  { key: "system_note", value: "בטא — כל התוכניות פתוחות" },
];

/* ?bulk=N pads the events table to N rows.
 *
 * The screens cap their queries at 500 and the fixtures hold 8, so the branch
 * that says "this list is a window, not the table" was unreachable in a
 * browser — the only way to check it was to read the JSX and believe it. With
 * ?bulk=1240 the list query returns its 500 and the head-count query returns
 * 1,240, which is exactly the shape production has and the shape the count
 * beside the search box used to get wrong. */
const bulkN = (() => {
  const m = typeof location !== "undefined" && /[?&]bulk=(\d+)/.exec(location.search);
  return m ? Number(m[1]) : 0;
})();

const EVENTS_ALL = bulkN > EVENTS.length
  ? Array.from({ length: bulkN }, (_, i) => {
      const base = EVENTS[i % EVENTS.length];
      // `i % 900`, so past row 900 the timestamps repeat rows 0-339 — this
      // comment used to claim they keep descending, and they do not. It does
      // not affect any assertion because `order()` in the mock is `return this`
      // (a no-op), which is itself worth stating out loud: the harness proves
      // the COUNT and the wording, never the "which 500 these are" ordering
      // that the wording depends on. That ordering is PostgREST's job and is
      // untested here.
      return { ...base, id: "e" + i, name: `${base.name} ${i}`, updated_at: iso(i % 900) };
    })
  : EVENTS;

const TABLES = {
  profiles: PROFILES,
  events: EVENTS_ALL,
  templates: TEMPLATES,
  subscriptions: SUBSCRIPTIONS,
  admin_activity: ACTIVITY,
  activity_log: ACTIVITY,
  activity_logs: ACTIVITY_LOGS,
  error_reports: ERRORS,
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
    // ?slow=1 on the preview URL holds every query open, so the loading and
    // skeleton states can actually be looked at.
    if (typeof location !== "undefined" && /[?&]slow=1/.test(location.search)) {
      return new Promise(() => {}).then(res);
    }
    return Promise.resolve({
      data: this.head ? null : this.rows,
      count: this.rows.length,
      error: null,
    }).then(res);
  }
}

export const isSupabaseConfigured = true;

/* signOut has to actually END the session, or the panel cannot be checked.
   With it as a no-op, pressing "יציאה" navigated to /admin/login, AdminGuard
   still saw a session, and bounced straight back to the dashboard — which is
   indistinguishable from the logout doing nothing at all. Now the guard denies
   and the operator lands on the login screen, as in production. */
let signedIn = true;
const listeners = new Set();

export const supabase = {
  from: (table) => new Query(table),
  rpc: () => Promise.resolve({ data: [], error: null }),
  auth: {
    getSession: () => Promise.resolve({
      data: { session: signedIn ? { user: { id: "u0" } } : null },
    }),
    getUser: () => Promise.resolve({
      data: { user: signedIn ? { id: "u0", email: "admin@kochav-hashulchan.co.il" } : null },
    }),
    signOut: () => {
      signedIn = false;
      for (const cb of listeners) cb("SIGNED_OUT", null);
      return Promise.resolve({ error: null });
    },
    onAuthStateChange: (cb) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe() { listeners.delete(cb); } } } };
    },
  },
};
