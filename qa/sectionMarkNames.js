/* The mark keys, listed for the contact sheet (qa/marksPreview.jsx).
   src/components/ui/SectionMark.jsx exports only its component — a second
   export there breaks React Fast Refresh — so the list lives here.
   tests/sectionMark.test.jsx asserts this list and the registry agree. */
export const SECTION_MARK_NAMES = [
  "guests", "tables", "seating", "constraints", "rsvp", "tasks", "budget",
  "vendors", "messages", "announcements", "checkin", "album", "gifts", "site",
  "nameTags", "collab", "hostess", "account", "help", "setup", "events", "invite",
  "cloud", "privacy", "terms", "accessibility", "alert",
  "adminOverview", "adminUsers", "adminEvents", "adminTemplates",
  "adminSubscriptions", "adminActivity", "adminSettings",
];
