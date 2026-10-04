import { execFileSync, spawnSync, spawn } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export const HOST = '/tmp/r3mig-pg';
export const PORT = '7200';
export const SCR = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(SCR, '../..');
export const MIGDIR = `${REPO}/supabase/migrations`;

const base = (db) => ['-X', '-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db, '-tAq', '-v', 'ON_ERROR_STOP=1'];
export const psql = (db, sql) => execFileSync('psql', [...base(db), '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
export const tryPsql = (db, sql) => {
  const r = spawnSync('psql', [...base(db), '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return r.status === 0 ? { ok: true, out: r.stdout.trim(), err: r.stderr.trim() } : { ok: false, out: r.stdout.trim(), err: r.stderr.trim() };
};
// A whole file as ONE simple-query message = one implicit transaction,
// which is how the Supabase SQL editor runs a pasted script.
export const runScript = (db, text) => tryPsql(db, text);
// Big files (> ARG_MAX): one explicit transaction.
export const runFileTx = (db, path) => {
  const r = spawnSync('psql', [...base(db), '-1', '-f', path], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return r.status === 0 ? { ok: true, err: r.stderr.trim() } : { ok: false, err: r.stderr.trim() };
};
export const par = (db, sqls) => Promise.all(sqls.map(sql => new Promise(res => {
  const c = spawn('psql', [...base(db), '-c', sql]); let err = '', out = '';
  c.stdout.on('data', d => { out += d; });
  c.stderr.on('data', d => { err += d; }); c.on('close', code => res(code === 0 ? { ok: true, out } : { ok: false, err }));
})));

export const allMigs = () => readdirSync(MIGDIR).filter(f => f.endsWith('.sql')).sort();
// main.txt is a FIXTURE, not a live list: production's migrations before the 1.10 rollout (ends 20260830000100), the baseline this rehearsal replays — do not "refresh" it from main.
export const mainMigs = () => readFileSync(`${SCR}/main.txt`, 'utf8').trim().split('\n').map(s => s.split('/').pop());
export const pendingMigs = () => { const m = new Set(mainMigs()); return allMigs().filter(f => !m.has(f)); };
export const mig = (f) => readFileSync(`${MIGDIR}/${f}`, 'utf8');

export function newDb(db) {
  psql('postgres', `drop database if exists ${db}`);
  psql('postgres', `create database ${db}`);
  const r = spawnSync('psql', [...base(db), '-f', `${SCR}/bootstrap.sql`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

export function applyAll(db, files, { stopOnFail = true, log = true } = {}) {
  const res = [];
  for (const f of files) {
    const r = runScript(db, mig(f));
    res.push({ f, ...r });
    if (log) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${f}${r.ok ? '' : '\n      ' + r.err.split('\n').slice(0, 3).join('\n      ')}`);
    if (!r.ok && stopOnFail) break;
  }
  return res;
}

// Run SQL as a given role with JWT claims, inside one transaction.
export function as(db, who, sql) {
  let pre;
  if (who === 'anon') pre = `set local role anon; set local request.jwt.claims = '{"role":"anon"}';`;
  else if (who === 'service') pre = `set local role service_role; set local request.jwt.claims = '{"role":"service_role"}';`;
  else pre = `set local role authenticated; set local request.jwt.claims = '{"sub":"${who}","role":"authenticated"}';`;
  return tryPsql(db, `begin; ${pre} ${sql}; commit;`);
}
