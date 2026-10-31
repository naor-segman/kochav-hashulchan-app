// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import Illustration from "./Illustration.jsx";
import EmptyState from "../ui/EmptyState.jsx";

/* The illustration set (owner, 31.10: palette A, the twelve drawings as
 * proposed 19.10). Each of the twelve must draw. */
const ILLUSTRATIONS = ["calendar", "camera", "chair", "chuppah", "envelope", "gift", "glasses", "list", "phone", "placecard", "table", "tasks"];
describe("Illustration", () => {
  it.each(ILLUSTRATIONS)("%s draws, decoratively", (name) => {
    const { container } = render(<Illustration name={name} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("path, rect, circle").length).toBeGreaterThan(3);
  });

  it("an unknown name draws nothing rather than an empty box", () => {
    const { container } = render(<Illustration name="nope" />);
    expect(container.firstChild).toBeNull();
  });

  it("paints only through tokens — no colour is written into the drawings", () => {
    const src = readFileSync("src/components/brand/Illustration.jsx", "utf8");
    expect(src).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    const css = readFileSync("src/components/brand/Illustration.module.css", "utf8");
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});

describe("EmptyState with an illustration", () => {
  it("shows the drawing instead of the section mark, and keeps the heading", () => {
    const { container } = render(<EmptyState mark="guests" illustration="list" title="כל אירוע מתחיל ברשימה" />);
    expect(container.querySelector('[data-illustration="list"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "כל אירוע מתחיל ברשימה" })).toBeTruthy();
  });
});
