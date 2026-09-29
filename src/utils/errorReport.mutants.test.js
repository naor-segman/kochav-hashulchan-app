// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Seven edits to errorReport.js passed the whole suite in the third-review
// mutation run (29.9). errorReport.test.js runs in node, where `window` does
// not exist — so the route is always "" and the two global listeners are never
// installed. Everything that depends on a browser (the route that goes into the
// crash table, the kind a rejected promise is filed under) had never executed
// under test. This file runs in jsdom for exactly that reason.
//
// It asserts on what reaches `report_error`, because that row is what the
// admin panel shows and the only record of a crash on a customer's phone.
//
// STATED PLAINLY: report_error (20260814020000) re-applies three of these
// guards itself — it truncates to 500 / 4000, drops an empty message, and
// collapses a repeat within ten minutes. So for the dedupe, the bounds and the
// empty-message rule, the STORED ROW is the same with or without the client
// guard; what the client guard changes is what a phone puts on the network —
// a render loop is hundreds of RPCs a second from a guest's phone on venue
// wifi without it. Those tests pin that. The route and the kind are different:
// the server stores whatever it is sent, so those two are the stored row.

const rpc = vi.fn();
vi.mock("../lib/supabase.js", () => ({
  supabase: { rpc: (...a) => rpc(...a) },
  isSupabaseConfigured: true,
}));

const { reportError, installGlobalErrorReporting } = await import("./errorReport.js");

// The dedupe map lives for the module's lifetime, so every test uses its own
// message — otherwise one test's report silently swallows the next one's.
let n = 0;
const fresh = (label) => `${label} #${++n}`;
const sent = () => rpc.mock.calls.map(c => c[1]);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockReturnValue(Promise.resolve({ data: null, error: null }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.history.pushState({}, "", "/app");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("the route that reaches the table is scrubbed", () => {
  // /rsvp/<token> is the key to somebody's guest list. scrubRoute is tested on
  // its own, but nothing checked that reportError USES it — reading
  // window.location.pathname raw would write the credential into a table the
  // admin panel reads.
  it("a crash on /rsvp/<token> is filed under /rsvp/:token", () => {
    window.history.pushState({}, "", "/rsvp/8f3c9a1b2d4e6f70");
    reportError(new Error(fresh("boom")));
    expect(sent()).toHaveLength(1);
    expect(sent()[0].p_route).toBe("/rsvp/:token");
  });
});

describe("dedupe: a render loop is one row, not hundreds", () => {
  // A component that throws on every render fires this as fast as React can
  // retry. The RPC collapses repeats server-side too (10 minutes), so this is
  // about the network, not the table: there is no reason to put hundreds of
  // requests a second on the network from a phone at a venue.
  it("the same error twice in a row → one report", () => {
    const m = fresh("loop");
    reportError(new Error(m));
    reportError(new Error(m));
    expect(sent()).toHaveLength(1);
  });
  it("…still one 30 seconds later, and a second one after the minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T20:00:00Z"));
    const m = fresh("slow-loop");
    reportError(new Error(m));
    vi.setSystemTime(new Date("2026-09-29T20:00:30Z"));
    reportError(new Error(m));
    expect(sent()).toHaveLength(1);
    vi.setSystemTime(new Date("2026-09-29T20:01:01Z"));
    reportError(new Error(m));
    expect(sent()).toHaveLength(2);
  });
});

describe("what is sent is bounded", () => {
  // The RPC truncates to the same limits, so the stored row does not change —
  // the bound is on the request. A serialised payload in an error string, or a
  // minified stack, is tens of kilobytes; the function promises never to be the
  // thing that costs the page anything, and uploading that from a phone is.
  it("message ≤ 500, stack ≤ 4000", () => {
    const e = new Error(fresh("x") + "y".repeat(2000));
    e.stack = "s".repeat(9000);
    reportError(e);
    expect(sent()[0].p_message.length).toBe(500);
    expect(sent()[0].p_stack.length).toBe(4000);
  });
  // A rejection with no reason (`Promise.reject()`) has nothing to say. The
  // server drops an empty message too; the client should not spend a request
  // (and a console line) on it.
  it("an empty message is not reported", () => {
    reportError(undefined, { kind: "promise" });
    reportError("", { kind: "render" });
    expect(sent()).toHaveLength(0);
  });
});

describe("the global listeners file errors under the right kind", () => {
  // `kind` is how the admin panel separates "a component crashed" from "a
  // promise nobody awaited" — the second is usually a failed network call, and
  // it needs a different fix.
  it("an unhandled rejection is kind 'promise'", () => {
    installGlobalErrorReporting();
    const ev = new Event("unhandledrejection");
    ev.reason = new Error(fresh("nobody awaited me"));
    window.dispatchEvent(ev);
    const row = sent().find(r => r.p_message.startsWith("nobody awaited me"));
    expect(row?.p_kind).toBe("promise");
  });
});
