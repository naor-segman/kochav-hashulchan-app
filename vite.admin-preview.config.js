/* Dev-only config for looking at the admin panel with data in it.
   The panel is behind AdminGuard, which needs a live Supabase admin session
   this environment does not have, so every screen renders its loading branch
   and the design pass never sees a populated table. This config swaps the
   Supabase client for qa/supabaseMock.js and nothing else.

   usage: npx vite --config vite.admin-preview.config.js --port 5190
   then:  node qa/adminshots.mjs                          */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* useAppUpdate.js imports `virtual:pwa-register/react`, which only exists when
   VitePWA is in the plugin list. Without this stub the whole app 500s on boot
   and every admin route renders a blank page — which looks exactly like a
   clean pass to a probe that only counts overflow. Registering the real
   service worker in a throwaway preview is worse than useless, so the module
   is stubbed rather than the plugin added. */
const pwaStub = {
  name: "admin-preview-pwa-stub",
  resolveId: (id) => (id === "virtual:pwa-register/react" ? "\0" + id : null),
  load: (id) =>
    id === "\0virtual:pwa-register/react"
      ? "export const useRegisterSW = () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: () => {} });"
      : null,
};

export default defineConfig({
  plugins: [react(), pwaStub],
  resolve: {
    alias: [{ find: /^(.*\/)?lib\/supabase\.js$/, replacement: "/qa/supabaseMock.js" }],
  },
});
