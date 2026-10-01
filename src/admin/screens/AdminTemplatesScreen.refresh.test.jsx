// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../../test/dom.js";

/* RG10b. The templates list reloads after every save. A reload that failed
 * used to blank the list and leave only the error banner — every template,
 * and every "ערוך" / "השבת" button, gone until a retry worked. */
const TEMPLATES = [
  { id: "t1", name: "חתונה קלאסית", type: "חתונה", icon: null, description: null, sort_order: 0, is_active: true, created_at: "2026-09-01T00:00:00Z" },
  { id: "t2", name: "בר מצווה בגן", type: "בר מצווה", icon: null, description: null, sort_order: 1, is_active: true, created_at: "2026-09-02T00:00:00Z" },
];
let selects = 0;
let FAIL_FROM = Infinity;   // the select number from which reads fail
function builder() {
  const b = {
    select: () => { selects++; b._n = selects; return b; },
    order: () => b, eq: () => Promise.resolve({ error: null }),
    update: () => b, insert: () => Promise.resolve({ error: null }),
    then: (res, rej) => Promise.resolve(b._n >= FAIL_FROM
      ? { data: null, error: { message: "network down" } }
      : { data: TEMPLATES, error: null }).then(res, rej),
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
vi.mock("../../utils/templateHelpers.js", () => ({ invalidateTemplateCache: () => {} }));
const { default: AdminTemplatesScreen } = await import("./AdminTemplatesScreen.jsx");

beforeEach(() => { selects = 0; FAIL_FROM = Infinity; });

describe("admin templates — a failed refresh keeps the list", () => {
  it("after a save whose reload fails, the rows and their actions stay", async () => {
    render(<MemoryRouter><AdminTemplatesScreen /></MemoryRouter>);
    expect(await screen.findByText("חתונה קלאסית")).toBeTruthy();
    FAIL_FROM = 2;   // the first read worked; every later one fails
    fireEvent.click(screen.getAllByText("ערוך")[0]);
    fireEvent.click(screen.getByText("שמור שינויים"));
    expect(await screen.findByText(/network down/)).toBeTruthy();
    await waitFor(() => expect(selects).toBeGreaterThanOrEqual(2));
    expect(screen.getByText("חתונה קלאסית")).toBeTruthy();
    expect(screen.getByText("בר מצווה בגן")).toBeTruthy();
    expect(screen.getAllByText("ערוך")).toHaveLength(2);
    expect(screen.getByText(/מוצגות התבניות מהטעינה הקודמת/)).toBeTruthy();
  });

  it("a FIRST load that fails still shows no rows and no 'previous' note", async () => {
    FAIL_FROM = 1;
    render(<MemoryRouter><AdminTemplatesScreen /></MemoryRouter>);
    expect(await screen.findByText(/network down/)).toBeTruthy();
    expect(screen.queryByText("חתונה קלאסית")).toBeNull();
    expect(screen.queryByText(/מהטעינה הקודמת/)).toBeNull();
    expect(screen.queryByText("אין תבניות עדיין")).toBeNull();
  });
});
