import fs from 'fs';
import path from 'path';

const ROOT = '/home/user/kochav-hashulchan-app/src';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const jsxFiles = files.filter(f => /\.(jsx|js)$/.test(f));

// --- parse a css module for defined class names ---
const cssCache = new Map();
function definedClasses(cssPath) {
  if (cssCache.has(cssPath)) return cssCache.get(cssPath);
  let src;
  try { src = fs.readFileSync(cssPath, 'utf8'); }
  catch { cssCache.set(cssPath, null); return null; }
  // strip comments
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const set = new Set();
  // selector chunks = text between } (or start) and {
  const chunks = [];
  let depth = 0, cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') { chunks.push(cur); cur = ''; depth++; }
    else if (c === '}') { cur = ''; depth--; }
    else cur += c;
  }
  for (let chunk of chunks) {
    // remove :global(...) contents -> those are not exported
    chunk = chunk.replace(/:global\s*\([^)]*\)/g, ' ');
    // at-rule preludes contain no local classes we care about (media queries etc.)
    if (/^\s*@/.test(chunk.trim()) && !/^\s*@(media|supports|container|layer)/.test(chunk.trim())) continue;
    for (const m of chunk.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) set.add(m[1]);
  }
  // composes: X from './y.css' -- target class must exist in that file too, but the
  // *defining* class is captured above. Also capture composes targets for cross-check.
  cssCache.set(cssPath, set);
  return set;
}

const problems = [];
const composesProblems = [];
const summary = [];

for (const jf of jsxFiles) {
  const src = fs.readFileSync(jf, 'utf8');
  // import bindings: import X from "./Y.module.css"
  const bindings = new Map();
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.module\.css)["']/g)) {
    bindings.set(m[1], path.resolve(path.dirname(jf), m[2]));
  }
  if (!bindings.size) continue;
  for (const [binding, cssPath] of bindings) {
    const defs = definedClasses(cssPath);
    if (defs === null) { problems.push([jf, binding, '(css file missing)', cssPath]); continue; }
    const refs = new Set();
    // binding.ident
    const dotRe = new RegExp('\\b' + binding.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)', 'g');
    for (const m of src.matchAll(dotRe)) refs.add(m[1]);
    // binding["ident"] / binding['ident'] / binding[`ident`]
    const brRe = new RegExp('\\b' + binding.replace(/\$/g, '\\$') + '\\[\\s*[\'"`]([^\'"`]+)[\'"`]\\s*\\]', 'g');
    for (const m of src.matchAll(brRe)) refs.add(m[1]);
    // dynamic computed access: binding[expr] -> flag as dynamic
    const dynRe = new RegExp('\\b' + binding.replace(/\$/g, '\\$') + '\\[(?![\'"`])', 'g');
    const dynamic = [...src.matchAll(dynRe)].length;
    for (const r of refs) {
      if (!defs.has(r)) problems.push([jf, `${binding}.${r}`, 'UNDEFINED', cssPath]);
    }
    summary.push({ jf, binding, cssPath, refs: refs.size, defs: defs.size, dynamic });
  }
}

// composes cross-file check across all css modules
for (const f of files.filter(f => f.endsWith('.module.css'))) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/composes\s*:\s*([^;{}]+);/g)) {
    const body = m[1].trim();
    const fromM = body.match(/^(.*?)\s+from\s+["']([^"']+)["']$/);
    if (fromM) {
      const names = fromM[1].trim().split(/\s+/);
      const target = path.resolve(path.dirname(f), fromM[2]);
      const d = definedClasses(target);
      if (!d) { composesProblems.push([f, body, 'target file missing: ' + target]); continue; }
      for (const n of names) if (!d.has(n)) composesProblems.push([f, `composes ${n} from ${fromM[2]}`, 'MISSING in target']);
    } else {
      const d = definedClasses(f);
      for (const n of body.split(/\s+/)) if (n !== 'global' && !d.has(n)) composesProblems.push([f, `composes ${n}`, 'MISSING local']);
    }
  }
}

console.log('=== REFERENCED BUT UNDEFINED ===');
if (!problems.length) console.log('none');
for (const p of problems) console.log(p[0].replace(ROOT, 'src') + '  ->  ' + p[1] + '   [' + p[2] + ']  (' + p[3].replace(ROOT, 'src') + ')');

console.log('\n=== COMPOSES ISSUES ===');
if (!composesProblems.length) console.log('none');
for (const p of composesProblems) console.log(p.join('  |  '));

const dyn = summary.filter(s => s.dynamic);
console.log('\n=== DYNAMIC (computed) ACCESSES - manual check ===');
for (const s of dyn) console.log(s.jf.replace(ROOT, 'src') + '  binding=' + s.binding + '  count=' + s.dynamic);
console.log('\nchecked ' + summary.length + ' (jsx,binding) pairs across ' + new Set(summary.map(s=>s.jf)).size + ' files');
