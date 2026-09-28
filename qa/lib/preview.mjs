/* One way to start `vite preview` for a browser harness, because doing it by
 * hand cost a whole review its validity.
 *
 * WHAT HAPPENED. Every harness here did the same three lines: spawn
 * `vite preview --port N --strictPort`, poll `fetch(BASE)` until it answers,
 * measure. The hole is that those two steps are not connected. `--strictPort`
 * makes vite EXIT when the port is taken instead of moving to the next one — and
 * the poll does not care who answers. So when a stale preview from another
 * checkout was already bound to 4341, the harness's own server died on the spot,
 * `fetch` got a 200 from the stranger, and `qa/servicePages.mjs` measured a
 * build of a DIFFERENT COMMIT while reporting on this one. It failed
 * `/pricing: no skipped heading level` against a page whose plan names had been
 * divs two commits earlier, and the working tree it claimed to be testing was
 * clean. A harness that measures the wrong server is worse than no harness: it
 * produces confident numbers about code that is not there.
 *
 * So: refuse to run when the port already answers, and say whose server it is.
 * A harness that cannot prove it is talking to its own build must not print a
 * pass count.
 */
/* ── And the reason a stale server was there to be measured ──────────────────
 * The stray was not carelessness, it was the teardown. Every harness ended with
 * `server.kill()` on a process spawned as `npx vite preview`, and npx runs vite
 * as its CHILD: SIGTERM reached the wrapper, the wrapper died, and the server it
 * had started was orphaned and kept the port. Measured — after a clean
 * `node qa/servicePages.mjs` that exited 0, `ps` still showed
 * `node node_modules/.bin/vite preview --port 4341` alive and `curl` still got a
 * 200 from it.
 *
 * So every run leaked a server, and the NEXT run of the same harness was served
 * by the PREVIOUS run's build. On a first run of the day that is invisible. It
 * is the same failure twice: the first run teaches you nothing is wrong.
 *
 * Fixed by spawning vite's own entry with this node binary, so the pid we hold
 * IS the server and SIGTERM lands on it. `stop()` then verifies.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT = "/home/user/kochav-hashulchan-app";

/** Does anything already answer on this port? */
async function portTaken(base) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    await fetch(base, { signal: ac.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start `vite preview` on `port`, serving THIS checkout's dist.
 *
 * @param {number} port
 * @param {string} [cwd]
 * @param {string[]} [extraArgs]  passed to `vite preview`, e.g. ["--outDir", "dist-shots"]
 *                                for a harness that previews a build other than dist/
 * @returns {Promise<{ base: string, stop: () => void }>}
 * @throws if the port is already in use, or the server never comes up.
 */
export async function startPreview(port, cwd = ROOT, extraArgs = []) {
  const base = `http://127.0.0.1:${port}`;

  if (await portTaken(base)) {
    throw new Error(
      `port ${port} is already serving something — refusing to measure it.\n` +
      `  With --strictPort this harness's own server would exit and every check\n` +
      `  below would silently describe the OTHER build. Stop it first:\n` +
      `    pkill -f "vite preview"        (or: ss -ltnp | grep ${port})`
    );
  }

  // vite's own entry, run by this node binary — NOT `npx vite`, whose child the
  // server would be and which survives our SIGTERM. See the note above.
  const server = spawn(process.execPath,
    [join(ROOT, "node_modules/vite/bin/vite.js"), "preview", ...extraArgs,
     "--port", String(port), "--strictPort"],
    { cwd, stdio: "ignore" });

  let exited = false;
  server.on("exit", () => { exited = true; });

  const stop = () => {
    if (!exited) server.kill("SIGTERM");
    // A preview server that ignores SIGTERM would leak the port to the next run
    // and be measured instead of its build, which is the whole point of this
    // module. Escalate rather than hope.
    setTimeout(() => { if (!exited) server.kill("SIGKILL"); }, 2000).unref();
  };

  for (let i = 0; i < 60; i++) {
    // Checked EVERY iteration, not once at the end: --strictPort makes vite exit
    // immediately on a busy port, and without this the loop would spend thirty
    // seconds polling on behalf of a process that is already dead.
    if (exited) throw new Error(`vite preview exited before serving ${base} (port ${port} busy?)`);
    try { if ((await fetch(base)).ok) return { base, stop }; }
    catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }

  stop();
  throw new Error(`preview server never came up on ${port}`);
}

/**
 * Start the vite DEV server — for harnesses that need build-time env baked in
 * differently from `dist` (a stubbed VITE_SUPABASE_URL, so the real signed-in
 * code path runs against intercepted REST calls). `preview` serves whatever
 * `dist` was built with; only the dev server reads env at start-up.
 *
 * Same two rules as startPreview, for the same two reasons: refuse a port that
 * already answers, and spawn vite's own entry so the pid we hold IS the server.
 * The harnesses that did this by hand (`spawn("npx", ["vite", …])`) killed only
 * the npx wrapper and left the dev server running on the port.
 *
 * @param {number} port
 * @param {Record<string,string>} env  extra environment for the server
 */
export async function startDev(port, env = {}, cwd = ROOT) {
  const base = `http://127.0.0.1:${port}`;
  if (await portTaken(base)) {
    throw new Error(
      `port ${port} is already serving something — refusing to measure it.\n` +
      `    pkill -f "vite"        (or: ss -ltnp | grep ${port})`
    );
  }
  const server = spawn(process.execPath,
    [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(port),
     "--strictPort", "--host", "127.0.0.1"],
    { cwd, stdio: "ignore", env: { ...process.env, ...env } });

  let exited = false;
  server.on("exit", () => { exited = true; });
  const stop = () => {
    if (!exited) server.kill("SIGTERM");
    setTimeout(() => { if (!exited) server.kill("SIGKILL"); }, 2000).unref();
  };

  for (let i = 0; i < 80; i++) {
    if (exited) throw new Error(`vite dev exited before serving ${base} (port ${port} busy?)`);
    try { if ((await fetch(base)).ok) return { base, stop }; }
    catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  stop();
  throw new Error(`dev server never came up on ${port}`);
}
