// The decorative seating card in the landing hero.
//
// Lives here rather than in LandingScreen.jsx because LandingScreen.test.js
// needs to read these figures, and a .jsx file that exports both a component
// and constants breaks Fast Refresh (react-refresh/only-export-components).
// That lint error was introduced when the constants were first exported and is
// what moved them out.
//
// WHY THEY ARE DERIVED: the card's head read "58 אורחים" and its foot read
// "48 מתוך 54 אורחים סודרו", as literals, over a drawing of these six tables.
// 58 is the CAPACITY of the tables, 48 is the seats drawn filled, and 54
// matched nothing at all. It is the first thing a visitor sees, and it is a
// picture of the one thing this product claims to do well — a visitor who adds
// up the glyphs found the arithmetic wrong on the seating app's own seating
// plan. Head and foot are computed from the table array now, so they cannot
// drift from the drawing again. LandingScreen.test.js pins the one free number.

export const MOCK_TABLES = [
  { name: "שולחן 1",   total: 10, filled: 10, shape: "round"  },
  { name: "שולחן 2",   total: 8,  filled: 7,  shape: "square" },
  { name: "שולחן 3",   total: 10, filled: 9,  shape: "round"  },
  { name: "אביר",      total: 12, filled: 8,  shape: "rect"   },
  { name: "שולחן 5",   total: 10, filled: 6,  shape: "round"  },
  { name: "שולחן VIP", total: 8,  filled: 8,  shape: "oval"   },
];

/** Seats drawn across the six tables. */
export const MOCK_CAPACITY = MOCK_TABLES.reduce((n, t) => n + t.total, 0);
/** Seats drawn as taken — what "סודרו" counts. */
export const MOCK_SEATED   = MOCK_TABLES.reduce((n, t) => n + t.filled, 0);
/** Guests on the list. The one number the picture does not imply. */
export const MOCK_GUESTS   = 54;
