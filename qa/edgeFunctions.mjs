/* Parse every Supabase Edge Function. Nothing else here does.
 *
 * WHY. `npm run build` never touches supabase/functions/ — they are Deno, not
 * part of the Vite graph — and `npx eslint src` does not either. `eslint .`
 * skips them as well: they are .ts, and eslint.config.js declares no TypeScript
 * parser. So the entire billing path — create-checkout-session, stripe-webhook,
 * create-billing-portal — has been outside every gate in this repo, and a
 * mistyped brace in it would have been found by `supabase functions deploy`, in
 * front of a customer, on the day money starts moving.
 *
 * This repo has already paid for exactly that shape once, on the other runtime:
 * a file in netlify/edge-functions/ that only Deno's bundler could reject killed
 * every build of a branch for eleven days while the local gate stayed green.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It parses. oxc is the transformer Vite
 * already ships, so this costs nothing to install and catches a syntax error,
 * a stray brace, a bad type annotation. It does NOT type-check, it does not
 * resolve the esm.sh imports, and it cannot tell you a Stripe field name is
 * wrong — there is no Deno runtime in this environment and no outbound route to
 * fetch one. A parse gate is the floor, not the ceiling.
 *
 * Run: node qa/edgeFunctions.mjs
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { transformWithOxc } = require("vite");

/* The functions of the checkout THIS file is in, as qa/lib/preview.mjs does.
   It was the main checkout's fixed path, so a run from a git worktree parsed
   the main tree's functions and passed on code that was not under test
   (audit 3.10, leftovers). */
const ROOT = new URL("../supabase/functions", import.meta.url).pathname.replace(/\/$/, "");

/** Every .ts/.js file under supabase/functions, at any depth. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const failed = [];

for (const file of files) {
  const rel = file.replace(ROOT + "/", "");
  try {
    await transformWithOxc(readFileSync(file, "utf8"), file);
    console.log(`ok    ${rel}`);
  } catch (e) {
    failed.push(rel);
    console.log(`FAIL  ${rel}\n      ${String(e).split("\n").slice(0, 6).join("\n      ")}`);
  }
}

// Zero files is a pass under any "count the failures" check, and it is the state
// a renamed directory or a wrong ROOT produces — a harness that reports success
// because it looked at nothing.
if (files.length === 0) {
  console.log("\nFAIL  no edge functions found — is the path still supabase/functions?");
  process.exit(1);
}

console.log(`\n${files.length - failed.length}/${files.length} parsed`);
process.exit(failed.length ? 1 : 0);
