import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { corsHeaders } from "../functions/_shared/cors.js";

/* CORS on the three signed-in functions (audit 3.10, S6). They answered
 * `Access-Control-Allow-Origin: *`. Now only an origin in APP_ORIGINS — the
 * same secret the billing functions use for return URLs — is echoed. The
 * handlers themselves are RUN against these rules in qa/edgeFunctionsRun.mjs. */

const APP = "https://plan.unica-events.co.il";

describe("corsHeaders", () => {
  it("echoes the app's own origin", () => {
    expect(corsHeaders(APP, APP)["Access-Control-Allow-Origin"]).toBe(APP);
  });

  it("any origin in a comma-separated list, spaces tolerated", () => {
    expect(corsHeaders("http://localhost:5173", `${APP}, http://localhost:5173`)["Access-Control-Allow-Origin"])
      .toBe("http://localhost:5173");
  });

  it("gives another site no Allow-Origin at all — never *", () => {
    for (const o of ["https://evil.example", "https://plan.unica-events.co.il.evil.example", "null", "", null]) {
      const h = corsHeaders(o, APP);
      expect(h["Access-Control-Allow-Origin"], String(o)).toBeUndefined();
    }
  });

  it("an unset APP_ORIGINS allows nobody (and does not fall back to *)", () => {
    expect(corsHeaders(APP, undefined)["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsHeaders(APP, "")["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("keeps the preflight's method and header lists, and varies on Origin", () => {
    const h = corsHeaders(APP, APP);
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(h["Access-Control-Allow-Headers"]).toMatch(/authorization/);
    expect(h["Access-Control-Allow-Headers"]).toMatch(/apikey/);
    expect(h.Vary).toBe("Origin");
  });
});

describe("the functions use it", () => {
  for (const fn of ["detect-floor-plan", "create-checkout-session", "create-billing-portal"]) {
    it(fn, () => {
      const src = readFileSync(new URL(`../functions/${fn}/index.ts`, import.meta.url), "utf8");
      expect(src).toMatch(/import \{ corsHeaders \} from "\.\.\/_shared\/cors\.js"/);
      expect(src).not.toMatch(/Access-Control-Allow-Origin["']?\s*:\s*["']\*/);
    });
  }
});
