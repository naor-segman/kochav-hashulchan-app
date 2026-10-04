// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { render, act } from "../test/dom.js";
import { ROUTE_TITLES, NOT_FOUND_TITLE, SEO_PAGES, titleFor, pageTitle } from "./seo.js";
import { COMPANY } from "./company.js";
import { PageMeta } from "../hooks/usePageMeta.js";
import NotFoundScreen from "../screens/NotFoundScreen.jsx";

/* Audit 3.10, P2-6: /login, /signup, /reset-password, /auth/callback,
 * /feedback and the 404 all had the site's home title in the tab. The live
 * pages are read back in qa/guestPages.mjs `titles`; this pins the data and
 * the one ordering rule that makes the 404's own title survive. */

describe("titles for the routes that are not indexed", () => {
  it("each one is '<page> · <brand>', with or without a trailing slash", () => {
    for (const [path, t] of Object.entries(ROUTE_TITLES)) {
      expect(titleFor(path)).toBe(`${t} · ${COMPANY.name}`);
      expect(titleFor(path + "/")).toBe(`${t} · ${COMPANY.name}`);
    }
  });

  it("an indexable page keeps its own title, and an unknown path gets none", () => {
    const pricing = SEO_PAGES.find(p => p.path === "/pricing");
    expect(titleFor("/pricing")).toBe(pageTitle(pricing));
    expect(titleFor("/events/e1/seating")).toBeNull();
    expect(titleFor("/constructor")).toBeNull();     // not an Object.prototype key
  });

  it("none of them is indexable — a title must not smuggle /login into the sitemap", () => {
    const indexed = new Set(SEO_PAGES.map(p => p.path));
    for (const path of Object.keys(ROUTE_TITLES)) expect(indexed.has(path), path).toBe(false);
  });

  it("each title is its page's own h1, so the tab and the page agree", () => {
    const FILE = {
      "/login": "LoginScreen", "/signup": "SignupScreen", "/reset-password": "ResetPasswordScreen",
      "/auth/callback": "AuthCallbackScreen", "/feedback": "FeedbackScreen",
    };
    expect(Object.keys(FILE).sort()).toEqual(Object.keys(ROUTE_TITLES).sort());
    for (const [path, name] of Object.entries(FILE)) {
      // From the project root: under jsdom, import.meta.url is not a file URL.
      const src = readFileSync(`src/screens/${name}.jsx`, "utf8");
      expect(src, path).toContain(`>${ROUTE_TITLES[path]}</h1>`);
    }
  });
});

describe("the 404's title survives the route default", () => {
  let go;
  const Nav = () => { go = useNavigate(); return null; };
  const app = (path) => render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
      <PageMeta />
      <Routes>
        <Route path="/login" element={<p>login</p>} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </MemoryRouter>,
  );

  it("on a cold load", () => {
    app("/no-such-page");
    expect(document.title).toBe(NOT_FOUND_TITLE);
  });

  it("from one 404 to another, and then to a known route", () => {
    app("/no-such-page");
    act(() => go("/another-missing"));
    expect(document.title).toBe(NOT_FOUND_TITLE);
    act(() => go("/login"));
    expect(document.title).toBe(`${ROUTE_TITLES["/login"]} · ${COMPANY.name}`);
  });
});
