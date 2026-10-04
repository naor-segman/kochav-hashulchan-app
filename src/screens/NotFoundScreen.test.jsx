// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import NotFoundScreen from "./NotFoundScreen.jsx";

/* Audit 3.10, P2-9: the 404 sent every visitor "חזרה לדשבורד", kept its look
 * in inline styles with hardcoded sizes, and its ✦ was read aloud. */

const at = (el) => render(<MemoryRouter initialEntries={["/no-such-page"]}>{el}</MemoryRouter>);
const links = () => [...document.querySelectorAll("a")].map(a => `${a.textContent} ${a.getAttribute("href")}`);

describe("the 404", () => {
  it("a visitor with no app to return to is offered the home page, not a dashboard", () => {
    at(<NotFoundScreen />);
    expect(links()).toEqual(["לדף הבית /home"]);
  });

  it("someone with a dashboard (signed in, or events in this browser) goes back to it", () => {
    at(<NotFoundScreen hasApp />);
    expect(links()).toEqual(["חזרה לאירועים שלי /app"]);
  });

  it("inside an event there is always a dashboard", () => {
    at(<NotFoundScreen landmark={false} />);
    expect(links()).toEqual(["חזרה לאירועים שלי /app"]);
  });

  it("the star is decoration, and nothing is styled inline", () => {
    at(<NotFoundScreen />);
    const star = [...document.querySelectorAll("*")].find(el => el.childNodes.length === 1 && el.textContent === "✦");
    expect(star.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("[style]")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("הדף לא נמצא");
  });
});
