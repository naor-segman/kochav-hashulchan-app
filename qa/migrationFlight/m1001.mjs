/* Rehearsal for 20261001000000_review_seven_hardening on a real PostgreSQL 16.
 *
 *   bash qa/migrationFlight/pgstart.sh
 *   node qa/migrationFlight/m1001.mjs
 *   bash qa/migrationFlight/pgstart.sh stop
 *
 * Every check runs twice: on the schema production has today (every other
 * migration) — where it must FAIL, proving the check sees the bug — and after
 * this migration, where it must pass. A check that passes on both proves
 * nothing and is reported as such.
 */
import { newDb, applyAll, allMigs, runScript, mig, psql, tryPsql, par, as } from './lib.mjs';

const NEW = '20261001000000_review_seven_hardening.sql';
const A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const today = psql('postgres', `select (now() at time zone 'Asia/Jerusalem')::date`);
const seed = `
  insert into auth.users (id, email) values ('${A}', 'a@x.test');
  insert into public.events (id, user_id, name, date, rsvp_token, invite_token, gift_token, hostess_token, collab_token, payload) values
   ('e1000000-0000-0000-0000-000000000001', '${A}', 'עבר', '2020-01-01', 'rsvpPASTaaaa', 'invPASTaaaaa', 'giftPASTaaaa', 'hostPASTaaaa', 'collPASTaaaa',
     '{"albumToken":"albPASTaaaaa","eventSite":{"enabled":true}}'),
   ('e2000000-0000-0000-0000-000000000002', '${A}', 'עתיד', '2099-01-01', 'rsvpFUTaaaaa', 'invFUTaaaaaa', 'giftFUTaaaaa', 'hostFUTaaaaa', 'collFUTaaaaa',
     '{"albumToken":"albFUTaaaaaa","eventSite":{"enabled":true}}'),
   ('e3000000-0000-0000-0000-000000000003', '${A}', 'לא פורסם', '2020-01-01', 'rsvpUNPaaaaa', 'invUNPaaaaaa', 'giftUNPaaaaa', 'hostUNPaaaaa', 'collUNPaaaaa',
     '{"albumToken":"albUNPaaaaaa","eventSite":{"enabled":false}}'),
   ('e4000000-0000-0000-0000-000000000004', '${A}', 'ערך משובש', '2020-01-01', 'rsvpODDaaaaa', 'invODDaaaaaa', 'giftODDaaaaa', 'hostODDaaaaa', 'collODDaaaaa',
     '{"albumToken":"albODDaaaaaa","eventSite":{"enabled":"maybe"}}'),
   ('e5000000-0000-0000-0000-000000000005', '${A}', 'דלת', '2020-01-01', 'rsvpDORaaaaa', 'invDORaaaaaa', 'giftDORaaaaa', 'hostDORaaaaa', 'collDORaaaaa',
     '{"guests":[{"id":"d1","name":"משפחת לוי","count":2},{"id":"d2","name":"דנה","count":1,"arrived":"maybe"}]}');`;

const checks = [];
async function run(db, label) {
  const out = {};
  // 102c — 40 claims, each held open a second, against a limit of 10.
  psql(db, `delete from public.ai_usage`);
  const claim = `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${A}","role":"authenticated"}';
                 select public.claim_ai_call('t', 10, 30); select pg_sleep(1); commit;`;
  const rs = await par(db, Array.from({ length: 40 }, () => claim));
  out.ai = { accepted: rs.filter(r => r.ok).length, rows: +psql(db, `select count(*) from public.ai_usage`) };
  // S7 — 100 anonymous rows, then a signed-in host.
  psql(db, `delete from public.feedback`);
  psql(db, `insert into public.feedback (user_id, kind, message) select null, 'other', 'spam ' || g from generate_series(1,100) g`);
  const f = as(db, A, `select public.submit_feedback('bug', 'המסך נתקע', null, '/app', 'x')`);
  out.feedback = f.ok ? f.out.split('\n').pop() : 'ERR ' + f.err;
  // C3 — the same form key, a corrected amount and a blessing.
  psql(db, `delete from public.gifts; delete from public.guest_write_throttle`);
  as(db, 'anon', `select public.submit_gift_by_token('giftPASTaaaa', 'משפחת כהן', 10000, null, 'k-1')`);
  const c = as(db, 'anon', `select public.submit_gift_by_token('giftPASTaaaa', 'משפחת כהן', 36000, 'מזל טוב', 'k-1')`);
  out.gift = { ok: c.ok, row: psql(db, `select amount || '|' || coalesce(message,'') from public.gifts`), count: +psql(db, `select count(*) from public.gifts`) };
  // and an identical resend stays one row
  as(db, 'anon', `select public.submit_gift_by_token('giftPASTaaaa', 'משפחת כהן', 36000, 'מזל טוב', 'k-1')`);
  out.giftDouble = +psql(db, `select count(*) from public.gifts`);
  // ב6 / MG6 — what the invite link returns.
  const tok = (t) => { const r = as(db, 'anon', `select public.public_event_by_token('invite', '${t}')->>'album_token'`); return r.ok ? (r.out.split('\n').pop() || null) : 'ERR ' + r.err.split('\n')[0]; };
  out.album = { past: tok('invPASTaaaaa'), future: tok('invFUTaaaaaa'), unpublished: tok('invUNPaaaaaa'), odd: tok('invODDaaaaaa') };
  // ו2 / MG6 — the greeter's link marks a seat.
  psql(db, `update public.events set payload = jsonb_set(payload, '{guests}', '[{"id":"d1","name":"משפחת לוי","count":2},{"id":"d2","name":"דנה","count":1,"arrived":"maybe"}]') where id = 'e5000000-0000-0000-0000-000000000005'`);
  const m1 = as(db, 'anon', `select public.hostess_mark_arrival_by_token('hostDORaaaaa', 'd1', '[0]'::jsonb, '[]'::jsonb)`);
  out.doorBy = m1.ok ? psql(db, `select coalesce(g->>'arrivedBy', '-') from public.events e, jsonb_array_elements(e.payload->'guests') g where e.id = 'e5000000-0000-0000-0000-000000000005' and g->>'id' = 'd1'`) : 'ERR ' + m1.err.split('\n')[0];
  const m2 = as(db, 'anon', `select public.hostess_mark_arrival_by_token('hostDORaaaaa', 'd2', '[0]'::jsonb, '[]'::jsonb)`);
  out.doorOdd = m2.ok ? 'ok' : 'ERR ' + m2.err.split('\n')[0];
  // 102d
  out.noPgTemp = +psql(db, `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%pg_temp%')`);
  console.log(`\n── ${label}`); console.log(JSON.stringify(out, null, 1));
  return out;
}

newDb('m1001'); 
const before = applyAll('m1001', allMigs().filter(f => f !== NEW), { log: false });
if (before.some(r => !r.ok)) throw new Error('base schema failed: ' + before.find(r => !r.ok).f);
const s = runScript('m1001', seed); if (!s.ok) throw new Error(s.err);
const POST = (await import('fs')).readFileSync(new URL('../../supabase/checks/postflight_20261001.sql', import.meta.url), 'utf8');
const post = () => psql('m1001', POST).split('\n').map(l => l.split('|')[2]);
const postBefore = post();
const b = await run('m1001', 'BEFORE (production today)');
const r = runScript('m1001', mig(NEW)); if (!r.ok) throw new Error('migration failed: ' + r.err);
const r2 = runScript('m1001', mig(NEW)); if (!r2.ok) throw new Error('second run failed: ' + r2.err);
const a = await run('m1001', 'AFTER (this migration, run twice)');
const postAfter = post();

const cmp = (name, bad, good) => { checks.push([name, bad, good]); console.log(`${bad && good ? '✓' : '✗'} ${name}${bad ? '' : '  ← the check does not see the bug before the migration'}`); };
console.log('\n══ verdict (each must fail before, pass after)');
cmp('102c AI claims capped at 10 under 40 concurrent', b.ai.rows > 10, a.ai.rows === 10);
cmp('S7 signed-in feedback accepted after 100 anonymous rows', b.feedback === 'f', a.feedback === 't');
cmp('C3 a corrected gift under the same key is stored', b.gift.row === '10000|', a.gift.row === '36000|מזל טוב' && a.gift.count === 1);
cmp('C3 an identical resend stays one row (both)', b.giftDouble === 1, a.giftDouble === 1);
cmp('ב6 no album token before the event day', b.album.future === 'albFUTaaaaaa', a.album.future === null);
cmp('ב6 no album token when the site is not published', b.album.unpublished === 'albUNPaaaaaa', a.album.unpublished === null);
cmp('ב6 album token on/after the event day, site published', b.album.past === 'albPASTaaaaa', a.album.past === 'albPASTaaaaa');
cmp('MG6 a stray "maybe" does not take the page down', String(b.album.odd).startsWith('ERR'), !String(a.album.odd).startsWith('ERR'));
cmp('ו2 a greeter\'s mark records arrivedBy = דיילת', b.doorBy === '-', a.doorBy === 'דיילת');
cmp('MG6 a stray arrived value does not break the door', String(b.doorOdd).startsWith('ERR'), a.doorOdd === 'ok');
cmp('102d every SECURITY DEFINER has pg_temp', b.noPgTemp > 0, a.noPgTemp === 0);
cmp('postflight_20261001.sql: fails before, all תקין after', postBefore.some(x => x !== 'תקין'), postAfter.length === 7 && postAfter.every(x => x === 'תקין'));
const failed = checks.filter(([, bad, good]) => !(bad && good));
console.log(failed.length ? `\n${failed.length} FAILED` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
