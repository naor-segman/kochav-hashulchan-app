/* Dev-only config for looking at the admin panel with data in it.
   The panel is behind AdminGuard, which needs a live Supabase admin session
   this environment does not have, so every screen renders its loading branch
   and the design pass never sees a populated table. This config swaps the
   Supabase client for qa/supabaseMock.js and nothing else.

   usage: npx vite --config vite.admin-preview.config.js --port 5190
   then:  node qa/adminshots.mjs                          */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^(.*\/)?lib\/supabase\.js$/, replacement: "/qa/supabaseMock.js" }],
  },
});
