import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* audit 3.10, H6. App.jsx is the entry's root, so every screen it imports
 * statically ships to EVERY visitor — including a guest opening an RSVP link
 * on a phone. The host's screens (and Shell, which pulls in the 32 KB of tour
 * copy) were eager: ~773 KB / 228 KB gzip entry with a stub Supabase env,
 * ~605 / 181 after making them lazy. qa/entryChunk.mjs measures the build;
 * this pins the source so an innocent-looking `import X from "./screens/…"`
 * cannot quietly put them back. */
const APP = readFileSync("src/App.jsx", "utf8");
const eager = [...APP.matchAll(/^import\s+(\w+)\s+from\s+"(\.\/(?:screens|components\/layout|components\/migration)\/[^"]+)"/gm)]
  .map(([, name, from]) => `${name} ← ${from}`);

describe("App.jsx imports no host screen eagerly (audit 3.10, H6)", () => {
  it("only the 404, the host-preview gate and the root gate are static", () => {
    expect(eager).toEqual([
      // 19.10: decides "/" (visitor → home page, signed in → /app). It imports
      // Navigate and nothing else, so it costs the entry nothing.
      "RootGate ← ./components/layout/RootGate.jsx",
      "NotFoundScreen ← ./screens/NotFoundScreen.jsx",
      "HostPreviewGate ← ./components/layout/HostPreviewGate.jsx",
    ]);
  });

  it("the screens it used to import eagerly are lazy now", () => {
    for (const n of ["Shell", "DashboardScreen", "EventHubScreen", "StartScreen", "EventSetupScreen",
      "LoginScreen", "SignupScreen", "ResetPasswordScreen", "AccountScreen", "AuthCallbackScreen", "MigrationBanner"]) {
      expect(APP).toMatch(new RegExp(`const ${n}\\s+= lazy\\(\\(\\) => import\\(`));
    }
  });
});
