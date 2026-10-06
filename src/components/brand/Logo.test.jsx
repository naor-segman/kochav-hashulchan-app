// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Logo from "./Logo.jsx";
import { COMPANY } from "../../data/company.js";
import { markLogo, stackedLogo, toSvgString } from "./logoGeometry.js";

describe("Logo (owner's pick 6.10, direction B2)", () => {
  it("names itself for screen readers, or hides when told it is decorative", () => {
    const { container, rerender } = render(<Logo />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(COMPANY.name);
    rerender(<Logo decorative />);
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("paints with tokens, never raw colours — a palette change reaches the logo", () => {
    const { container } = render(<Logo />);
    const paints = [...container.querySelectorAll("[fill],[stroke]")]
      .flatMap(el => [el.getAttribute("fill"), el.getAttribute("stroke")]).filter(v => v && v !== "none");
    expect(paints.length).toBeGreaterThan(20);
    for (const p of paints) expect(p).toMatch(/^var\(--[a-z-]+\)$/);
  });

  it("the table stays light with dark plates on a dark ground; only the outline flips", () => {
    const dark = render(<Logo variant="mark" tone="dark" />).container;
    const top = [...dark.querySelectorAll("circle")].find(c => c.getAttribute("r") === "40");
    expect(top.getAttribute("fill")).toBe("var(--surface)");
    expect(top.getAttribute("stroke")).toBe("var(--nav-text)");
    const plate = [...dark.querySelectorAll("circle")].find(c => c.getAttribute("r") === "7");
    expect(plate.getAttribute("stroke")).toBe("var(--text)");
  });

  it("stacked = table + 'unica' (5 letters) + 'plan' (4); mark = the table alone", () => {
    const s = stackedLogo();
    expect(s.groups).toHaveLength(3);
    expect(s.groups[1].shapes.filter(x => x.stroke === "ink" && x.strokeWidth > 10)).toHaveLength(5);
    expect(s.groups[2].shapes.filter(x => x.stroke === "accent" && x.strokeWidth > 10)).toHaveLength(4);
    expect(markLogo().groups).toHaveLength(1);
  });

  it("serialises to a standalone SVG with every role resolved", () => {
    const svg = toSvgString(markLogo(), { ink: "#111111", detail: "#111111", paper: "#ffffff", white: "#ffffff",
      accent: "#E8437B", chair1: "#E8437B", chair2: "#2BB3C0", chair3: "#F6B523", chair4: "#F07D2E" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/="(ink|detail|paper|accent|chair\d|undefined)"/);
  });
});
