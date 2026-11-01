// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import ProductShot from "./ProductShot.jsx";
import { PHONE_SHOTS } from "../../data/phoneShots.js";

/* Phone-width product shots on the service pages (1.11). A name listed here
 * with no file would show a broken image on every phone, and a file the
 * screenshot script no longer produces would silently go stale — the
 * hand-kept duplicate that drifts (CLAUDE.md, bug class 6). */
describe("ProductShot", () => {
  it("a shot with a phone twin: <picture>, the phone frame under 600px, with its own size", () => {
    const { container } = render(<ProductShot src="/shots/tasks.jpg" alt="x" width="2400" height="1520" />);
    const source = container.querySelector("picture > source");
    expect(source.getAttribute("media")).toBe("(max-width: 599px)");
    expect(source.getAttribute("srcset")).toBe("/shots-phone/page/tasks.jpg");
    expect([source.getAttribute("width"), source.getAttribute("height")]).toEqual(["780", "1200"]);
    expect(container.querySelector("picture > img").getAttribute("src")).toBe("/shots/tasks.jpg");
  });

  it("a shot without one stays a plain image", () => {
    const { container } = render(<ProductShot src="/shots/gift-form.jpg" alt="x" />);
    expect(container.querySelector("picture")).toBeNull();
    expect(container.querySelector("img").getAttribute("src")).toBe("/shots/gift-form.jpg");
  });

  it.each(PHONE_SHOTS)("%s: the file exists and the screenshot script makes it", (name) => {
    expect(existsSync(`public/shots-phone/page/${name}.jpg`)).toBe(true);
    const script = readFileSync("qa/marketingShotsPhone.mjs", "utf8");
    const pageBlock = script.slice(script.indexOf("The service pages, on a phone"));
    expect(pageBlock).toContain(`name: "${name}"`);
  });

  it("every service page shot goes through it", () => {
    for (const f of ["Seating", "Rsvp", "EventDay", "EventSite", "Gifts", "Planning"]) {
      const src = readFileSync(`src/screens/services/${f}ServiceScreen.jsx`, "utf8");
      expect(src, f).not.toMatch(/<img\b/);
    }
  });
});
