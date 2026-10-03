/* Where a harness writes its screenshots and reports (audit 3.10, H3).
 *
 * Six harnesses wrote to a hardcoded /tmp/claude-…/scratchpad path — the
 * scratchpad of whichever session wrote them. Any later session (or the
 * owner's PC) wrote into a folder that did not exist or was not theirs, and
 * the harness either crashed or the files went where nobody looked.
 *
 * QA_OUT_DIR=<dir> puts every harness's output under <dir>/<name>; unset, each
 * run gets a fresh folder in the OS temp dir. Either way it is created, and the
 * harness prints the path it used.
 */
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export function outDir(name) {
  const base = process.env.QA_OUT_DIR;
  if (base) {
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  return mkdtempSync(join(tmpdir(), `qa-${name}-`));
}
