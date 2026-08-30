/* Regenerate supabase/setup_full.sql from supabase/migrations/.
 *
 * Run after adding a migration:   node qa/genSetupSql.mjs
 *
 * The hand-maintained version of setup_full.sql drifted SEVEN migrations behind
 * and a fresh project built from it came up with the public-insert holes still
 * open, no submit_*_by_token RPCs (so RSVP and gift submission failed), no
 * collab/album tables, and a public_event_by_token that returned every token for
 * any token. A duplicate that has to be updated by hand is a duplicate that will
 * drift; this makes it a build product.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG  = join(ROOT, "supabase", "migrations");
const OUT  = join(ROOT, "supabase", "setup_full.sql");

const HEAD = `-- ═════════════════════════════════════════════════════════════════════════════
--  FULL DATABASE SETUP — רוויה
--
--  ⚠️  GENERATED FILE. Do not edit by hand.
--
--  This is every migration in supabase/migrations/, concatenated in filename
--  order. Regenerate it whenever a migration is added:
--
--      node qa/genSetupSql.mjs
--
--  Why it is generated: the hand-maintained version drifted SEVEN migrations
--  behind and a fresh project built from it came up with
--    • \`rsvp_public_insert\` / \`gifts_public_insert\` still WITH CHECK (true) —
--      exactly the hole 20260728_public_write_hardening was written to close,
--    • no submit_*_by_token RPCs, which the client calls — so RSVP and gift
--      submission simply failed,
--    • no collab_guests / guest_submissions / album_photos tables at all, so
--      /collab/:token and /album/:token were dead,
--    • a public_event_by_token that returned EVERY token for ANY token, so a
--      leaked album QR handed over the RSVP and invite links too.
--  A duplicate that has to be updated by hand is a duplicate that will drift.
--
--  Run this once on a fresh Supabase project (SQL editor → paste → run).
--  On an EXISTING project run the individual migrations instead.
--
--  Afterwards, grant yourself admin:
--    UPDATE public.profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL';
-- ═════════════════════════════════════════════════════════════════════════════

`;

const files = readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
const rule  = "-- ═══════════════════════════════════════════════════════════════════════════";

const body = files.map(f =>
  `\n${rule}\n-- ${f}\n${rule}\n\n${readFileSync(join(MIG, f), "utf8").trimEnd()}\n`
).join("");

writeFileSync(OUT, HEAD + body);
console.log(`setup_full.sql regenerated from ${files.length} migrations`);
