import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* The app shell (index.html) and the service-worker config in vite.config.js.
 * Neither is code a unit test can run, so these read the files — but they
 * assert the SHAPE that matters, not a string that happens to be there. */

const html = readFileSync("index.html", "utf8");
const vite = readFileSync("vite.config.js", "utf8");

describe("index.html: Google Fonts never block first render (סב58)", () => {
  const FONTS = /fonts\.googleapis\.com\/css2/;
  const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");
  const links = (src) => [...src.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).filter(l => FONTS.test(l));

  it("has no render-blocking stylesheet link to fonts.googleapis.com", () => {
    // Measured 1.10: with the font CSS request stalled 8 s, first paint came at
    // 8.2 s. A rel="stylesheet" in <head> blocks rendering until it loads.
    for (const l of links(outsideNoscript)) expect(l).not.toMatch(/rel="stylesheet"/);
  });

  it("preloads the font CSS and turns it into a stylesheet on load", () => {
    const pre = links(outsideNoscript);
    expect(pre).toHaveLength(1);
    expect(pre[0]).toMatch(/rel="preload"/);
    expect(pre[0]).toMatch(/as="style"/);
    expect(pre[0]).toMatch(/onload="this\.onload=null;this\.rel='stylesheet'"/);
  });

  it("still loads the fonts without JavaScript, from the same URL", () => {
    const ns = html.match(/<noscript>([\s\S]*?)<\/noscript>/i)?.[1] ?? "";
    const fallback = links(ns);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatch(/rel="stylesheet"/);
    const href = (l) => l.match(/href="([^"]+)"/)[1];
    expect(href(fallback[0])).toBe(href(links(outsideNoscript)[0]));
  });
});

describe("vite.config.js: the Supabase runtime cache holds data reads only (ב11)", () => {
  // The literal from the `supabase-api` runtimeCaching entry, evaluated as the
  // RegExp workbox will use — so this tests the pattern, not its spelling.
  const block = vite.match(/urlPattern:\s*(\/\^https[^\n]*?supabase[^\n]*?\/i),[\s\S]{0,200}?cacheName: 'supabase-api'/);
  const pattern = block && new Function(`return ${block[1]}`)();

  it("is found", () => {
    expect(pattern).toBeInstanceOf(RegExp);
  });

  it("caches PostgREST reads", () => {
    expect(pattern.test("https://abcd.supabase.co/rest/v1/events?select=*")).toBe(true);
    expect(pattern.test("https://abcd.supabase.co/rest/v1/rpc/get_event_by_token")).toBe(true);
  });

  it("never caches auth — GET /auth/v1/user is the signed-in identity", () => {
    expect(pattern.test("https://abcd.supabase.co/auth/v1/user")).toBe(false);
    expect(pattern.test("https://abcd.supabase.co/auth/v1/token?grant_type=refresh_token")).toBe(false);
  });

  it("leaves storage and edge functions to the network", () => {
    expect(pattern.test("https://abcd.supabase.co/storage/v1/object/public/site/a.jpg")).toBe(false);
    expect(pattern.test("https://abcd.supabase.co/functions/v1/create-checkout")).toBe(false);
  });

  it("cannot be fooled by /rest/v1/ in a query string or another host", () => {
    expect(pattern.test("https://abcd.supabase.co/auth/v1/user?x=/rest/v1/")).toBe(false);
    expect(pattern.test("https://evil.example/x.supabase.co/rest/v1/events")).toBe(false);
  });
});

describe("vite.config.js: precache (סב58)", () => {
  const ignores = vite.match(/globIgnores:\s*(\[[^\]]*\])/)?.[1] ?? "[]";

  it("does not precache og-image.png — it is for link-preview crawlers only", () => {
    expect(ignores).toContain("'**/og-image.png'");
  });

  it("still precaches jsQR — the door screen scans offline", () => {
    expect(ignores).not.toMatch(/jsQR|jsqr/i);
  });
});
