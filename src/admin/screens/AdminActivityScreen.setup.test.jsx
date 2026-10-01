// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";

/* C5. No migration creates activity_logs, and PostgREST resolves the
 * `profiles!actor_id` embed before it looks the table up — so the live answer
 * is PGRST200, and the screen printed it raw instead of its setup box. */

const RELATIONSHIP = { code: "PGRST200", message: "Could not find a relationship between 'activity_logs' and 'profiles' in the schema cache" };
const NO_TABLE     = { code: "PGRST205", message: "Could not find the table 'public.activity_logs' in the schema cache" };
let ANSWER = { embed: null, plain: null };   // { data, error } per query shape

function builder() {
  const q = { cols: "" };
  const b = {
    select: (c) => { q.cols = c; return b; },
    order: () => b, limit: () => b,
    then: (res, rej) => Promise.resolve(q.cols.includes("profiles!") ? ANSWER.embed : ANSWER.plain).then(res, rej),
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
const { default: AdminActivityScreen } = await import("./AdminActivityScreen.jsx");
const open = () => render(<MemoryRouter><AdminActivityScreen /></MemoryRouter>);

const ROW = { id: "a1", action: "event_created", entity_type: "event", entity_id: "e1",
              entity_name: "החתונה של דנה", metadata: {}, created_at: "2026-09-30T10:00:00Z" };

beforeEach(() => { ANSWER = { embed: null, plain: null }; });

describe("admin activity — a missing table is 'not built yet', whatever PostgREST calls it", () => {
  it("PGRST200 on the embed, PGRST205 without it → the setup box, no raw error", async () => {
    ANSWER = { embed: { data: null, error: RELATIONSHIP }, plain: { data: null, error: NO_TABLE } };
    open();
    expect(await screen.findByText("יומן הפעילות עדיין לא נבנה")).toBeTruthy();
    expect(screen.queryByText(/Could not find/)).toBeNull();
  });

  it("PGRST200 alone (the embed's code is all there is) → still the setup box", async () => {
    ANSWER = { embed: { data: null, error: RELATIONSHIP }, plain: { data: null, error: RELATIONSHIP } };
    open();
    expect(await screen.findByText("יומן הפעילות עדיין לא נבנה")).toBeTruthy();
    expect(screen.queryByText(/Could not find/)).toBeNull();
  });

  it("a table without the actor FK → its rows, without the actor", async () => {
    ANSWER = { embed: { data: null, error: RELATIONSHIP }, plain: { data: [ROW], error: null } };
    open();
    expect(await screen.findByText("החתונה של דנה")).toBeTruthy();
    expect(screen.queryByText("יומן הפעילות עדיין לא נבנה")).toBeNull();
  });

  it("any other failure is still an error, with its message", async () => {
    ANSWER = { embed: { data: null, error: { code: "500", message: "boom" } }, plain: null };
    open();
    expect(await screen.findByText(/boom/)).toBeTruthy();
    expect(screen.queryByText("יומן הפעילות עדיין לא נבנה")).toBeNull();
  });
});
