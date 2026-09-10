// The admin dashboard's navigation rows.
//
// Lives here rather than in AdminDashboardScreen because adminNav.test.js needs
// to read the array, and a .jsx file that exports both a component and a
// constant breaks Fast Refresh (react-refresh/only-export-components). The
// panel's other shared tables — activityConfig, planConfig, adminFormat — are
// already in this directory for the same reason.
//
// live: true   → rendered as a real Link (the screen has data behind it)
// badge: "…"   → rendered as a static, unclickable row wearing that badge
//
// "יומן פעילות" was live and should not have been. Its screen reads
// `activity_logs`, a table that has no migration anywhere in this repo and no
// code that writes to it — so the link always landed on a setup box telling the
// operator to run a migration that was never written. A badge is the honest
// state: the UI exists, the recording mechanism does not. Flip it back to
// `live: true` the day both land. adminNav.test.js is what holds that line —
// it fails if any live row's screen queries a table with no migration.
export const NAV_ITEMS = [
  { mark: "adminUsers",         label: "ניהול משתמשים",   path: "/admin/users",         live: true },
  { mark: "adminEvents",        label: "כל האירועים",     path: "/admin/events",        live: true },
  { mark: "adminTemplates",     label: "ניהול תבניות",    path: "/admin/templates",     live: true },
  { mark: "adminSubscriptions", label: "מנויים ותשלומים", path: "/admin/subscriptions", live: true },
  { mark: "adminActivity",      label: "יומן פעילות",     path: "/admin/activity",      badge: "בפיתוח" },
  { mark: "alert",              label: "שגיאות",          path: "/admin/errors",        live: true },
  { mark: "help",               label: "משוב",            path: "/admin/feedback",      live: true },
  { mark: "adminSettings",      label: "הגדרות מערכת",   path: "/admin/settings",      live: true },
];
