import styles from "./SectionMark.module.css";

/**
 * The section marks — one drawn mark per area of the product.
 *
 * Before this, every screen head carried a generic line icon from Icon.jsx and
 * three unrelated sections ("אורחים", "ספקים", "מילוי משותף") all shared the
 * same `users` outline. A section that looks like two other sections has no
 * identity, and twenty screens that look identical do not read as a designed
 * product — they read as a CRUD admin with a nice font.
 *
 * These are NOT decoration, by the same rule TableGlyph follows: a mark answers
 * "where am I" before the title is read, which is the question a host scanning
 * a sidebar actually has. So each one draws the SUBJECT of its section, not an
 * abstract symbol for it.
 *
 * The vocabulary is inherited from the glyph the product already owns, so the
 * whole system reads as one hand:
 *
 *   plate  — a blush surface with an ink hairline. The THING the section is
 *            about (the table top, the card, the envelope, the door).
 *   line   — ink hairline. Structure on top of the plate.
 *   live   — accent fill. Only the part that carries live data (a taken seat,
 *            a completed task, an answered reply). Accent is a fill token and
 *            these are fills — the one job it is allowed.
 *   dim    — border-grey. What is not there yet.
 *
 * Because "live" is always the accent and always the data, a wall of marks in
 * the sidebar reads at a glance the same way a wall of table glyphs does.
 *
 * Admin gets the same drawings through `tone="admin"`, which swaps the blush
 * plate for neutral grey. The panel is an internal tool and stays quiet — but
 * it still deserves to be legible and to look like it was drawn on purpose.
 */

const MARKS = {
  // ── User area ───────────────────────────────────────────────────────────────

  /* Guests — the list itself, with the rows that already have someone in them. */
  guests: (s) => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" className={s.plate} />
      <circle cx="6.9" cy="9"  r="1.7" className={s.live} />
      <circle cx="6.9" cy="14" r="1.7" className={s.live} />
      <circle cx="6.9" cy="18.6" r="1.7" className={s.dimFill} />
      <path d="M10.4 9h7.2M10.4 14h7.2M10.4 18.6h4.4" className={s.line} />
    </>
  ),

  /* Tables — the builder is where a table gets its SHAPE and its capacity, so
     the mark shows two shapes rather than one. Deliberately not the same
     picture as `seating`: that one is a single table being filled, and two
     adjacent nav items must not draw the same thing. */
  tables: (s) => (
    <>
      <rect x="3.4" y="3.4" width="8.6" height="8.6" rx="2.2" className={s.plate} />
      <circle cx="7.7" cy="1.7" r="1.2" className={s.live} />
      <circle cx="1.7" cy="7.7" r="1.2" className={s.live} />
      <circle cx="13.7" cy="7.7" r="1.2" className={s.live} />
      <circle cx="16.6" cy="16.6" r="4.3" className={s.plate} />
      <circle cx="16.6" cy="10.6" r="1.2" className={s.dimFill} />
      <circle cx="22.6" cy="16.6" r="1.2" className={s.dimFill} />
      <circle cx="16.6" cy="22.6" r="1.2" className={s.dimFill} />
      <circle cx="10.6" cy="16.6" r="1.2" className={s.dimFill} />
    </>
  ),

  /* Seating — a table with one place still open and a guest on the way into it.
     The arrow is the only mark in the set that shows a verb, because seating is
     the only screen where the product does something rather than stores it. */
  seating: (s) => (
    <>
      <circle cx="11" cy="12" r="5" className={s.plate} />
      <circle cx="11"   cy="4"    r="1.6" className={s.live} />
      <circle cx="5.4"  cy="7.6"  r="1.6" className={s.live} />
      <circle cx="4.2"  cy="14.2" r="1.6" className={s.live} />
      <circle cx="8.6"  cy="19.2" r="1.6" className={s.live} />
      <circle cx="15.2" cy="18.2" r="1.6" className={s.live} />
      <circle cx="17.4" cy="8.2"  r="1.6" className={s.dimFill} />
      <path d="M22 12.6h-3.6m1.2-1.5-1.5 1.5 1.5 1.5" className={s.liveLine} />
    </>
  ),

  /* Constraints — the two rules the engine actually enforces, drawn literally:
     one pair joined, one pair kept apart. Nothing else in the app says this. */
  constraints: (s) => (
    <>
      <circle cx="6.6" cy="6.8" r="3.1" className={s.plate} />
      <circle cx="17.4" cy="6.8" r="3.1" className={s.plate} />
      <path d="M9.9 6.8h4.2" className={s.liveLine} />
      <circle cx="6.6" cy="17.2" r="3.1" className={s.plate} />
      <circle cx="17.4" cy="17.2" r="3.1" className={s.plate} />
      <path d="M10.2 15.4l3.6 3.6M13.8 15.4l-3.6 3.6" className={s.liveLine} />
    </>
  ),

  /* RSVP — the reply came back. The disc is the answer, and it is the only
     thing in the mark that is filled, so "answered" is what the eye lands on. */
  rsvp: (s) => (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.6" className={s.plate} />
      <path d="M3.4 6.4 12 12.4l8.6-6" className={s.line} />
      <circle cx="17.6" cy="17.4" r="4.6" className={s.liveDisc} />
      <path d="m15.5 17.4 1.5 1.6 3.1-3.4" className={s.onLive} />
    </>
  ),

  /* Tasks — a checklist where one item is done. The tick is the live part. */
  tasks: (s) => (
    <>
      <rect x="4" y="4.2" width="16" height="16.6" rx="2.8" className={s.plate} />
      <rect x="8.6" y="1.9" width="6.8" height="3.6" rx="1.6" className={s.line} />
      <path d="m7.3 10.6 1.7 1.8 3.2-3.6" className={s.liveLine} />
      <path d="M14.6 10.4h3.2" className={s.line} />
      <rect x="6.6" y="15" width="3.4" height="3.4" rx="1" className={s.dim} />
      <path d="M12.2 16.7h5.6" className={s.line} />
    </>
  ),

  /* Budget — the spend against the plan. The filled bars are what is committed,
     the outline is what is left. */
  budget: (s) => (
    <>
      <rect x="2.6" y="4.4" width="18.8" height="15.6" rx="2.8" className={s.plate} />
      <rect x="6.2"  y="12"   width="3.2" height="4.8" rx="1.1" className={s.live} />
      <rect x="10.4" y="9"    width="3.2" height="7.8" rx="1.1" className={s.live} />
      <rect x="14.6" y="10.8" width="3.2" height="6"   rx="1.1" className={s.dimFill} />
      <path d="M5 16.8h14" className={s.line} />
    </>
  ),

  /* Vendors — the supplier, as a shopfront rather than another person outline.
     Three of the six sections used to be a person; only one of them is people. */
  vendors: (s) => (
    <>
      <path d="M2.6 9.2 5.2 4.4h13.6l2.6 4.8" className={s.line} />
      <rect x="3.4" y="9.2" width="17.2" height="11.2" rx="2.2" className={s.plate} />
      <rect x="9.8" y="13.6" width="4.4" height="6.8" rx="1.2" className={s.live} />
    </>
  ),

  /* Messages — the bubble, with the message inside it as live content. */
  messages: (s) => (
    <>
      <path d="M3.2 6.6A2.6 2.6 0 0 1 5.8 4h12.4a2.6 2.6 0 0 1 2.6 2.6v7.6a2.6 2.6 0 0 1-2.6 2.6h-2.4l-4.6 4v-4H5.8a2.6 2.6 0 0 1-2.6-2.6z"
            className={s.plate} />
      <circle cx="8"  cy="10.4" r="1.55" className={s.live} />
      <circle cx="12" cy="10.4" r="1.55" className={s.live} />
      <circle cx="16" cy="10.4" r="1.55" className={s.dimFill} />
    </>
  ),

  /* Announcements — one voice reaching the room. The waves are accent because
     they are the part that goes out. */
  announcements: (s) => (
    <>
      <path d="M3.4 9.4h3.4L14 5v14l-7.2-4.4H3.4z" className={s.plate} />
      <path d="M17 9a4.4 4.4 0 0 1 0 6" className={s.liveLine} />
      <path d="M19.9 6.4a8.2 8.2 0 0 1 0 11.2" className={s.dim} />
    </>
  ),

  /* Check-in — the door, and the guest standing at it. Distinct from RSVP on
     purpose: RSVP is an answer that arrived, check-in is a person who did. */
  checkin: (s) => (
    <>
      <rect x="2.8" y="3.4" width="10.4" height="17.2" rx="2.2" className={s.plate} />
      <circle cx="10.2" cy="12" r="1.35" className={s.line2} />
      <circle cx="18" cy="8.4" r="2.5" className={s.live} />
      <path d="M14 20.6c0-2.5 1.8-4.2 4-4.2s4 1.7 4 4.2z" className={s.live} />
    </>
  ),

  /* Album — the pictures, stacked. The one in front has something in it. */
  album: (s) => (
    <>
      <rect x="7.4" y="2.8" width="13.8" height="13" rx="2.4" className={s.dim} />
      <rect x="2.8" y="7.6" width="13.8" height="13" rx="2.4" className={s.plate} />
      <circle cx="7" cy="11.6" r="1.7" className={s.live} />
      <path d="M3.4 18.4 8 13.8l3.2 3 2.2-2 3 3.6" className={s.line} />
    </>
  ),

  /* Gifts — the box, with the ribbon as the live part. */
  gifts: (s) => (
    <>
      <rect x="3.6" y="9.6" width="16.8" height="11" rx="2.2" className={s.plate} />
      <rect x="2.4" y="5.8" width="19.2" height="4.4" rx="1.6" className={s.plate} />
      <rect x="10.4" y="5.8" width="3.2" height="14.8" className={s.live} />
      <path d="M12 5.8C10.6 3 8.2 2.6 7.6 4c-.5 1.2 1.2 1.9 4.4 1.8m0 0c1.4-2.8 3.8-3.2 4.4-1.8.5 1.2-1.2 1.9-4.4 1.8"
            className={s.liveLine} />
    </>
  ),

  /* Event site — the page the guests actually land on. */
  site: (s) => (
    <>
      <rect x="2.6" y="4" width="18.8" height="16" rx="2.8" className={s.plate} />
      <path d="M2.6 8.6h18.8" className={s.line} />
      <circle cx="5.6" cy="6.3" r="0.85" className={s.dimFill} />
      <circle cx="8.2" cy="6.3" r="0.85" className={s.dimFill} />
      <path d="M12 17.6s-3.6-2.3-3.6-4.6a2.1 2.1 0 0 1 3.6-1.4 2.1 2.1 0 0 1 3.6 1.4c0 2.3-3.6 4.6-3.6 4.6z"
            className={s.live} />
    </>
  ),

  /* Name tags — one card, one name, one table number. Not a stack: a stack is
     the album, and two sections must not draw the same picture. */
  nameTags: (s) => (
    <>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2.4" className={s.plate} />
      <path d="M6.4 10.4h7" className={s.liveLine} />
      <path d="M6.4 14.4h5" className={s.line} />
      <circle cx="17.4" cy="12.4" r="2.6" className={s.live} />
    </>
  ),

  /* Collaboration — two people filling the same list, and what they share. */
  collab: (s) => (
    <>
      <circle cx="8.8" cy="12" r="5.6" className={s.plate} />
      <circle cx="15.2" cy="12" r="5.6" className={s.line2} />
      <circle cx="12" cy="9.4" r="1.5" className={s.live} />
      <circle cx="12" cy="14.6" r="1.5" className={s.live} />
    </>
  ),

  /* Hostess — the phone at the door, with the table on it. */
  hostess: (s) => (
    <>
      <rect x="6.2" y="2.2" width="11.6" height="19.6" rx="2.8" className={s.plate} />
      <circle cx="12" cy="11" r="2.8" className={s.line2} />
      <circle cx="12"   cy="6.6"  r="1.25" className={s.live} />
      <circle cx="16.1" cy="11"   r="1.25" className={s.live} />
      <circle cx="12"   cy="15.4" r="1.25" className={s.dimFill} />
      <circle cx="7.9"  cy="11"   r="1.25" className={s.dimFill} />
      <path d="M10.2 19.6h3.6" className={s.line} />
    </>
  ),

  /* Account — the person whose account it is. This is the one that IS a person. */
  account: (s) => (
    <>
      <circle cx="12" cy="8" r="4.1" className={s.plate} />
      <path d="M4.6 21c0-4 3.3-6.7 7.4-6.7s7.4 2.7 7.4 6.7z" className={s.plate} />
      <circle cx="18.4" cy="5.2" r="2.4" className={s.live} />
    </>
  ),

  /* Help — the question, on a surface, with the dot that ends it. */
  help: (s) => (
    <>
      <circle cx="12" cy="12" r="8.8" className={s.plate} />
      <path d="M9.3 9.7a2.85 2.85 0 0 1 5.5 1c0 1.9-2.5 2.2-2.5 3.8" className={s.line} />
      <circle cx="12.2" cy="17.4" r="1.55" className={s.live} />
    </>
  ),

  /* Event setup — the date, which is the thing the setup screen is really about. */
  setup: (s) => (
    <>
      <rect x="2.8" y="4.6" width="18.4" height="15.8" rx="2.6" className={s.plate} />
      <path d="M2.8 9.6h18.4M7.8 2.6v4M16.2 2.6v4" className={s.line} />
      <circle cx="7.8" cy="14.4" r="1.8" className={s.live} />
      <circle cx="12"  cy="14.4" r="1.8" className={s.dimFill} />
      <circle cx="16.2" cy="14.4" r="1.8" className={s.dimFill} />
    </>
  ),

  /* Dashboard — the events themselves, one live and the rest waiting. */
  events: (s) => (
    <>
      <rect x="2.6" y="3.6" width="8.4" height="7.6" rx="2.2" className={s.plate} />
      <rect x="13" y="3.6" width="8.4" height="7.6" rx="2.2" className={s.dim} />
      <rect x="2.6" y="13.2" width="8.4" height="7.6" rx="2.2" className={s.dim} />
      <rect x="13" y="13.2" width="8.4" height="7.6" rx="2.2" className={s.plate} />
      <circle cx="6.8" cy="7.4" r="1.7" className={s.live} />
      <circle cx="17.2" cy="17" r="1.7" className={s.live} />
    </>
  ),

  /* Invitation — the card that goes out. */
  invite: (s) => (
    <>
      <rect x="4.4" y="2.6" width="15.2" height="18.8" rx="2.4" className={s.plate} />
      <path d="M8.2 8.4h7.6M8.2 12h7.6M8.2 15.6h4.4" className={s.line} />
      <circle cx="12" cy="5.2" r="1.4" className={s.live} />
    </>
  ),

  /* Privacy — a shield with a lock, because the promise the page makes is that
     the guest list is held, not shared. */
  privacy: (s) => (
    <>
      <path d="M12 2.8l7.4 2.9v6.1c0 4.6-3.1 8-7.4 9.4-4.3-1.4-7.4-4.8-7.4-9.4V5.7z" className={s.plate} />
      <path d="M9.6 12.2v-1.9a2.4 2.4 0 0 1 4.8 0v1.9" className={s.line} />
      <rect x="8.7" y="12.2" width="6.6" height="4.9" rx="1.5" className={s.live} />
    </>
  ),

  /* Terms — the document, with the clause that is actually signed picked out. */
  terms: (s) => (
    <>
      <path d="M5.2 2.8h9.1l4.5 4.5v13.9H5.2z" className={s.plate} />
      <path d="M14.3 2.8v4.5h4.5" className={s.line} />
      <path d="M8.4 11.6h7.2M8.4 15h7.2" className={s.line} />
      <circle cx="9.6" cy="18.4" r="1.5" className={s.live} />
    </>
  ),

  /* Accessibility — a person, standing in the middle of the plate rather than
     beside it. */
  accessibility: (s) => (
    <>
      <circle cx="12" cy="12" r="8.8" className={s.plate} />
      <circle cx="12" cy="7.2" r="1.6" className={s.live} />
      <path d="M7.9 10.2h8.2M12 10.6v4.2M12 14.8l-2.4 3.9M12 14.8l2.4 3.9" className={s.line} />
    </>
  ),

  /* Cloud sync — not a section of its own, but the landing page promises it
     beside five things that are, and one stray line icon in that row would
     break the set. */
  cloud: (s) => (
    <>
      <path d="M7.2 18.4a4.4 4.4 0 0 1-.5-8.75A5.9 5.9 0 0 1 18 10.4a3.9 3.9 0 0 1-.6 8z" className={s.plate} />
      <circle cx="12" cy="13.6" r="1.7" className={s.live} />
      <path d="M12 20.8v-2.6" className={s.liveLine} />
    </>
  ),

  // ── Admin panel ─────────────────────────────────────────────────────────────

  adminOverview: (s) => (
    <>
      <rect x="2.6" y="3.8" width="18.8" height="16.4" rx="2.6" className={s.plate} />
      <path d="M6.4 16.2v-3.6M10.8 16.2V8.8M15.2 16.2v-5.4M19.6 16.2v-2" className={s.liveLine} />
    </>
  ),

  adminUsers: (s) => (
    <>
      <circle cx="9.4" cy="8.2" r="3.5" className={s.plate} />
      <path d="M3 19.8c0-3.5 2.9-5.8 6.4-5.8s6.4 2.3 6.4 5.8z" className={s.plate} />
      <circle cx="17.4" cy="9" r="2.6" className={s.line2} />
      <path d="M16 14.4c3 .3 5 2.4 5 5.4h-4" className={s.line2} />
    </>
  ),

  adminEvents: (s) => (
    <>
      <rect x="2.8" y="4.6" width="18.4" height="15.8" rx="2.6" className={s.plate} />
      <path d="M2.8 9.6h18.4M7.8 2.6v4M16.2 2.6v4" className={s.line} />
      <path d="M6.6 13.6h4M13.4 13.6h4M6.6 17h4M13.4 17h4" className={s.line2} />
    </>
  ),

  adminTemplates: (s) => (
    <>
      <rect x="7.2" y="2.8" width="14" height="13.4" rx="2.2" className={s.dim} />
      <rect x="2.8" y="7.4" width="14" height="13.4" rx="2.2" className={s.plate} />
      <path d="M6.4 12h7M6.4 16.2h4.4" className={s.line} />
    </>
  ),

  adminSubscriptions: (s) => (
    <>
      <rect x="2.4" y="5.4" width="19.2" height="13.2" rx="2.4" className={s.plate} />
      <path d="M2.4 9.8h19.2" className={s.line} />
      <path d="M6 14.6h4.6" className={s.line2} />
    </>
  ),

  adminActivity: (s) => (
    <>
      <rect x="2.6" y="4.4" width="18.8" height="15.2" rx="2.6" className={s.plate} />
      <path d="M5.4 12.6h3l2.2-4.4 2.8 7.6 2-3.2h3.2" className={s.liveLine} />
    </>
  ),

  adminSettings: (s) => (
    <>
      {/* Two sliders, not three: at 20px in a topbar the third row turned the
          whole mark into a solid block. */}
      <path d="M3.4 8.4h17.2M3.4 15.6h17.2" className={s.line} />
      <circle cx="15.4" cy="8.4"  r="3.1" className={s.knob} />
      <circle cx="8.6"  cy="15.6" r="3.1" className={s.knob} />
    </>
  ),
};

/**
 * @param name  key from MARKS
 * @param size  px of the drawing itself (the tile, when present, is larger)
 * @param tone  "brand" (blush plate) · "admin" (neutral grey plate) ·
 *              "ondark" (light hairlines for the near-black chrome)
 * @param tile  wrap in the soft tile that gives a page head its weight
 */
export default function SectionMark({
  name,
  size = 24,
  tone = "brand",
  tile = false,
  title,
  className = "",
}) {
  const draw = MARKS[name];
  if (!draw) return null;

  const toneClass =
    tone === "admin" ? styles.admin : tone === "ondark" ? styles.ondark : styles.brand;

  const svg = (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={[styles.mark, toneClass, tile ? "" : className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : "true"}
    >
      {draw(styles)}
    </svg>
  );

  if (!tile) return svg;

  return (
    <span
      className={[styles.tile, toneClass, className].filter(Boolean).join(" ")}
      style={{ "--mark-size": `${size}px` }}
    >
      {svg}
    </span>
  );
}
