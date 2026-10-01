// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "../test/dom.js";

/* 37c: the session restoring after first paint re-ran a shared
 * [path, userId] effect and recorded a second pageview of the same path. */

const pageviews = vi.fn();
const identifies = vi.fn();
vi.mock("../lib/analytics.js", () => ({
  trackPageview: (...a) => pageviews(...a),
  identifyUser: (...a) => identifies(...a),
}));

const { usePageAnalytics } = await import("./usePageAnalytics.js");

function Probe({ path, userId }) { usePageAnalytics(path, userId); return null; }

beforeEach(() => { pageviews.mockReset(); identifies.mockReset(); });

describe("usePageAnalytics (37c)", () => {
  it("one pageview per path, even when the user arrives after first paint", () => {
    const { rerender } = render(<Probe path="/app" userId={undefined} />);
    rerender(<Probe path="/app" userId="u1" />);
    expect(pageviews).toHaveBeenCalledTimes(1);
    expect(identifies).toHaveBeenCalledTimes(1);
    expect(identifies).toHaveBeenCalledWith("u1");
  });

  it("signing out on a page is not a pageview either", () => {
    const { rerender } = render(<Probe path="/account" userId="u1" />);
    rerender(<Probe path="/account" userId={undefined} />);
    expect(pageviews).toHaveBeenCalledTimes(1);
  });

  it("a navigation is a pageview, and does not identify again", () => {
    const { rerender } = render(<Probe path="/app" userId="u1" />);
    rerender(<Probe path="/account" userId="u1" />);
    expect(pageviews.mock.calls.map(c => c[0])).toEqual(["/app", "/account"]);
    expect(identifies).toHaveBeenCalledTimes(1);
  });

  it("when the id is known, identify goes before that path's pageview", () => {
    const order = [];
    identifies.mockImplementation(() => order.push("identify"));
    pageviews.mockImplementation(() => order.push("pageview"));
    render(<Probe path="/app" userId="u1" />);
    expect(order).toEqual(["identify", "pageview"]);
  });
});
