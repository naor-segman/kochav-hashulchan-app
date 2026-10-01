/* The pre-run / post-run checks for the pending migrations, proven on a real
 * PostgreSQL 16 (third review 30.9).
 *
 *   bash qa/migrationFlight/pgstart.sh      # throwaway cluster on :7200
 *   node qa/migrationFlight/flight.mjs
 *   bash qa/migrationFlight/pgstart.sh stop
 *
 * main.txt lists the migrations production has already run (those on main);
 * everything else in supabase/migrations is "pending". The run shows:
 *   GOOD   — the preflight is clean, the postflight fails before and passes after;
 *   BAD    — the preflight flags each seeded problem, and the postflight fails;
 *   RESUME — fix the data, re-run from the first failed file, postflight passes;
 *   BROKEN — a clean run, then one old file re-pasted: the postflight names it.
 * The owner's copies are supabase/checks/preflight.sql and postflight.sql.
 */
// Preflight must flag the bad seeds; postflight must pass after a good run and fail on broken ones.
import { newDb, applyAll, mainMigs, pendingMigs, runScript, mig, psql, tryPsql, SCR, REPO } from './lib.mjs';
import { readFileSync } from 'fs';
const PRE = readFileSync(`${REPO}/supabase/checks/preflight.sql`, 'utf8'), POST = readFileSync(`${REPO}/supabase/checks/postflight.sql`, 'utf8');
const seed = readFileSync(`${SCR}/seed.sql`, 'utf8'), bad = readFileSync(`${SCR}/bad_seed.sql`, 'utf8');
const show = (db, sql, label) => {
  // read-only proof: run inside a READ ONLY transaction
  const r = tryPsql(db, `begin transaction read only; ${sql.trim().replace(/;\s*$/, '')}; rollback;`);
  console.log(`  [${label}]`);
  if (!r.ok) { console.log('   ERROR', r.err); return []; }
  const rows = r.out.split('\n').filter(l => l.includes('|')).map(l => l.split('|'));
  rows.forEach(c => console.log('   ' + c.map(x => x.length > 110 ? x.slice(0, 110) + '…' : x).join(' | ')));
  return rows;
};
const postOk = (rows) => rows.find(r => r[0] === '99')?.[2] === 't';
const base = (db, extra) => { newDb(db); applyAll(db, mainMigs(), { log: false }); runScript(db, seed); if (extra) { const r = runScript(db, extra); if (!r.ok) throw new Error(r.err); } };

console.log('══ GOOD data');
base('fl_good');
show('fl_good', PRE, 'preflight');
show('fl_good', POST, 'postflight BEFORE migrating (must fail)');
applyAll('fl_good', pendingMigs(), { log: false });
const good = show('fl_good', POST, 'postflight after a clean run');
console.log('  → postflight passes:', postOk(good));

console.log('\n══ BAD data');
base('fl_bad', bad);
show('fl_bad', PRE, 'preflight');
console.log('  [applying the 12 as the owner would, carrying on after a failure]');
applyAll('fl_bad', pendingMigs(), { stopOnFail: false });
const hide = tryPsql('fl_bad', `update public.gifts set hidden = true where amount = 500`);
console.log('  host hides an old ₪5 gift in this state:', hide.ok ? 'ok' : hide.err.split('\n')[0]);
const br = show('fl_bad', POST, 'postflight after carrying on past failures');
console.log('  → postflight passes:', postOk(br));

console.log('\n══ RESUME: fix the data, re-run from the first failed file');
const fx = runScript('fl_bad', `
  update public.events set payload = payload - 'albumToken' where id = 'e6000000-0000-0000-0000-000000000006';
  update public.events set payload = payload - 'albumToken' where payload->>'albumToken' = '' or octet_length(payload->>'albumToken') > 2000;
  alter table public.gifts drop constraint ck_gift_amount_range;
  update public.gifts set amount = 500 where amount < 500;
  create or replace function public.prune_ai_usage() returns void language sql volatile security definer set search_path = public as $$ delete from public.ai_usage where created_at < now() - interval '2 days' $$;
  revoke all on function public.prune_ai_usage() from public;
  alter table public.collab_guests drop constraint collab_phone_short;
  drop policy album_upload_any on storage.objects;`);
console.log('  fixes applied:', fx.ok ? 'ok' : fx.err);
show('fl_bad', PRE, 'preflight after the fixes');
const from = pendingMigs().indexOf('20260928000300_internal_functions_and_album_token.sql');
applyAll('fl_bad', pendingMigs().slice(from));
const res = show('fl_bad', POST, 'postflight after resuming');
console.log('  → postflight passes:', postOk(res));

console.log('\n══ BROKEN: a clean run, then one superseded file re-pasted');
for (const f of ['20260928000400_album_link_on_site.sql', '20260928000700_hostess_three_way_arrival.sql', '20260928000800_gift_floor_server.sql', '20260928000900_gift_rate_limit.sql', '20260929000000_review_gift_door_fixes.sql', '20260728000000_public_write_hardening.sql', '20260816010000_fix_storage_folder_ambiguity.sql', '20260818000100_album_objects_cap.sql', '20260719000000_public_pages_hardening.sql']) {
  base('fl_brk'); applyAll('fl_brk', pendingMigs(), { log: false }); runScript('fl_brk', mig(f));
  const rows = show('fl_brk', POST, `postflight after re-running ${f}`).filter(r => r[2] === 'f');
  console.log(`  → failing rows: ${rows.map(r => r[0]).join(',')}`);
}
