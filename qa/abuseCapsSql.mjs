/* The abuse ceilings of 20261004000000_abuse_caps, on a real PostgreSQL 16
 * (audit 3.10, S1 and S4).
 *
 *   bash qa/migrationFlight/pgstart.sh
 *   node qa/abuseCapsSql.mjs
 *   bash qa/migrationFlight/pgstart.sh stop
 *
 * Every migration is replayed in order. Each attack runs twice: on the schema
 * production has today (every migration but this one), where it must SUCCEED —
 * proving the check sees the hole — and after this migration (pasted twice, as
 * the owner might), where it must be refused. The legitimate paths run after
 * the migration and must pass: a host's 500th event, a realistic 2,500-guest
 * wedding built with the app's OWN normalizeEvent + cloud mapper (loaded
 * through Vite, so it is the code that ships), its updates, an existing
 * oversized row being edited and shrunk, the admin, the service role, the
 * door's anonymous function, and the per-user AI limits.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { newDb, applyAll, allMigs, runScript, mig, psql, par, REPO } from './migrationFlight/lib.mjs';

const NEW = '20261004000000_abuse_caps.sql';
const DB = 'abusecaps';
const A = 'aaaaaaaa-0000-0000-0000-00000000000a';    // the host under test
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';    // another host
const ADM = 'cccccccc-0000-0000-0000-00000000000c';  // an admin
const OLD = 'dddddddd-0000-0000-0000-00000000000d';  // owns a row already over the size ceiling

// ── a realistic big event, built by the app's own code ──────────────────────
async function bigPayload() {
  const { createServer } = await import('vite');
  const s = await createServer({ root: REPO, configFile: false, logLevel: 'error', appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
  try {
    const { normalizeEvent } = await s.ssrLoadModule('/src/utils/eventHelpers.js');
    const { mapLocalEventToCloudPayload } = await s.ssrLoadModule('/src/utils/cloudSync.js');
    const { autoAssign } = await s.ssrLoadModule('/src/logic/seating.js');
    const FIRST = ['אברהם', 'שרה', 'יצחק', 'רבקה', 'יעקב', 'רחל', 'לאה', 'דוד', 'מיכל', 'יונתן'];
    const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהמי', 'פרידמן', 'שושן'];
    const name = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const id = (p, i) => `${p}${i.toString(36)}${'x'.repeat(12)}`;
    const guests = Array.from({ length: 2500 }, (_, i) => ({
      id: id('g', i), name: name(i), side: i % 2 ? 'bride' : 'groom', group: 'משפחה', count: 1,
      phone: '05' + String(20000000 + i * 37).padStart(8, '0'), rsvp: 'confirmed', meal: 'regular',
      notes: i % 3 ? '' : 'ליד ההורים, לא ליד הרמקולים', arrived: i % 4 === 0, giftAmount: 0, estGift: 400, companions: [],
    }));
    const tables = Array.from({ length: 260 }, (_, i) => ({ id: id('t', i), name: `שולחן ${i + 1}`, capacity: 12, type: 'regular', shape: 'round' }));
    const constraints = Array.from({ length: 200 }, (_, i) => ({ id: id('c', i), type: 'together', guestA: guests[i * 3].id, guestB: guests[i * 3 + 1].id }));
    const ev = normalizeEvent({
      id: 'big-1', name: 'החתונה הגדולה', type: 'חתונה', guests, tables, constraints,
      seating: autoAssign(guests, tables, constraints),
      messagesSent: Object.fromEntries(guests.map(g => [g.id, { invite: 1790000000000, reminder: 1790000000000, thanks: 1790000000000 }])),
      rsvpApplied: Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`),
      floorPlan: { image: null, tablePositions: Object.fromEntries(tables.map((t, i) => [t.id, { x: (i % 20) / 20, y: 0.5, size: 1 }])), elements: [] },
    });
    return JSON.stringify(mapLocalEventToCloudPayload(ev, A).payload);
  } finally { await s.close(); }
}

// SQL through stdin — a 1.5 MB payload does not fit in one argv string.
const sh = (sql, who) => {
  const pre = who === 'anon' ? `set local role anon;`
    : who === 'service' ? `set local role service_role; set local request.jwt.claims = '{"role":"service_role"}';`
    : who ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${who}","role":"authenticated"}';` : '';
  const r = spawnSync('psql', ['-X', '-h', '/tmp/r3mig-pg', '-p', '7200', '-U', 'postgres', '-d', DB, '-tAq', '-v', 'ON_ERROR_STOP=1'],
    { input: `begin; ${pre} ${sql}; commit;`, encoding: 'utf8', maxBuffer: 1 << 28 });
  return r.status === 0 ? { ok: true, out: r.stdout.trim() } : { ok: false, err: (r.stderr.match(/ERROR:\s*([^\n]*)/) || [, r.stderr])[1], full: r.stderr };
};
const q = (sql) => psql(DB, sql);
const ins = (who, payloadSql, name = 'אירוע') =>
  sh(`insert into public.events (user_id, name, payload) values ('${who}', '${name}', ${payloadSql})`, who);
// Random hex — compresses about as badly as real photos do.
const blob = (bytes) => `jsonb_build_object('blob', (select string_agg(md5(g::text), '') from generate_series(1, ${Math.ceil(bytes / 32)}) g))`;
const quota = (r) => (r.ok ? 'accepted' : (r.err.match(/event_quota:(\w+)/) || [, 'ERR ' + r.err])[1]);

const BIG = await bigPayload();
console.log(`realistic 2,500-guest payload from the app's mapper: ${Buffer.byteLength(BIG).toLocaleString()} bytes`);
const bigLit = `$big$${BIG}$big$::jsonb`;

async function run(label) {
  const o = {};
  q(`delete from public.events where user_id <> '${OLD}'; delete from public.ai_usage;`);
  // 1. the 501st event of one account
  q(`insert into public.events (user_id, name, payload) select '${A}', 'e' || g, '{}' from generate_series(1, 499) g`);
  o.e500 = quota(ins(A, `'{}'`));
  o.e501 = quota(ins(A, `'{}'`));
  o.otherHost = quota(ins(B, `'{}'`));
  o.ownerSql = sh(`insert into public.events (user_id, name, payload) values ('${A}', 'by the owner', '{}')`).ok;
  // 2. eight creates at once with room for three (497 held)
  q(`delete from public.events where user_id = '${A}' and name in ('by the owner', 'אירוע')`);
  q(`delete from public.events where id in (select id from public.events where user_id = '${A}' limit 1)`);
  q(`delete from public.events where id in (select id from public.events where user_id = '${A}' limit 1)`);
  const before = +q(`select count(*) from public.events where user_id = '${A}'`);
  await par(DB, Array.from({ length: 8 }, (_, i) => `begin; set local role authenticated;
    set local request.jwt.claims = '{"sub":"${A}","role":"authenticated"}';
    insert into public.events (user_id, name, payload) values ('${A}', 'race ${i}', '{}'); select pg_sleep(0.3); commit;`));
  o.race = { before, after: +q(`select count(*) from public.events where user_id = '${A}'`) };
  q(`delete from public.events where user_id = '${A}'`);
  // 3. one 9.6 MB event (the audit's)
  o.huge = quota(ins(A, blob(9_600_000)));
  q(`delete from public.events where user_id = '${A}'`);
  // 4. the realistic wedding, and its edits
  o.bigInsert = quota(ins(A, bigLit, 'החתונה הגדולה'));
  o.bigUpdate = quota(sh(`update public.events set payload = jsonb_set(payload, '{brideName}', '"דנה"'), version = version + 1 where user_id = '${A}'`, A));
  // 5. the account total — the setting lowered so the test is cheap (and the
  //    UPDATE is the knob the owner has)
  q(`update public.app_settings set max_user_payload_bytes = 4000000 where id = '00000000-0000-0000-0000-000000000001'`);
  q(`delete from public.events where user_id = '${A}'`);
  o.tot1 = quota(ins(A, blob(1_500_000)));
  o.tot2 = quota(ins(A, blob(1_500_000)));
  o.tot3 = quota(ins(A, blob(1_500_000)));
  q(`update public.app_settings set max_user_payload_bytes = 100000000 where id = '00000000-0000-0000-0000-000000000001'`);
  q(`delete from public.events where user_id = '${A}'`);
  // 6. the admin and the service role are not hosts
  q(`insert into public.events (user_id, name, payload) values ('${A}', 'for admin', '{}')`);
  o.adminGrow = quota(sh(`update public.events set payload = ${blob(9_600_000)} where user_id = '${A}' and name = 'for admin'`, ADM));
  o.adminRows = +q(`select count(*) from public.events where user_id = '${A}' and pg_column_size(payload) > 1000000`);
  o.service = quota(sh(`insert into public.events (user_id, name, payload) values ('${A}', 'svc', ${blob(9_600_000)})`, 'service'));
  q(`delete from public.events where user_id = '${A}'`);
  // 7. AI: the global ceiling (lowered to 5), and the per-user limit still there
  q(`update public.app_settings set ai_daily_global_cap = 5 where id = '00000000-0000-0000-0000-000000000001'`);
  q(`insert into public.ai_usage (user_id, kind) select '${B}', 'detect-floor-plan' from generate_series(1, 4)`);
  const claim = (who, h = 10, d = 30) => { const r = sh(`select public.claim_ai_call('detect-floor-plan', ${h}, ${d})`, who); return r.ok ? 'ok' : r.err; };
  o.ai5 = claim(A);
  o.ai6 = claim(ADM);
  q(`update public.app_settings set ai_daily_global_cap = 300 where id = '00000000-0000-0000-0000-000000000001'`);
  q(`delete from public.ai_usage`);
  for (let i = 0; i < 3; i++) claim(A, 3, 30);
  o.aiUser = claim(A, 3, 30);
  // 30 accounts at once against a global ceiling of 10
  q(`delete from public.ai_usage; update public.app_settings set ai_daily_global_cap = 10 where id = '00000000-0000-0000-0000-000000000001'`);
  const many = Array.from({ length: 30 }, (_, i) => `eeeeeeee-0000-0000-0000-${String(i).padStart(12, '0')}`);
  q(`insert into auth.users (id, email) select u::uuid, u || '@x.test' from unnest(array['${many.join("','")}']) u on conflict do nothing`);
  await par(DB, many.map(u => `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${u}","role":"authenticated"}';
    select public.claim_ai_call('detect-floor-plan', 10, 30); select pg_sleep(0.2); commit;`));
  o.aiRace = +q(`select count(*) from public.ai_usage`);
  q(`update public.app_settings set ai_daily_global_cap = 300 where id = '00000000-0000-0000-0000-000000000001'`);
  console.log(`\n── ${label}`); console.log(JSON.stringify(o));
  return o;
}

newDb(DB);
const base = applyAll(DB, allMigs().filter(f => f < NEW), { log: false });
if (base.some(r => !r.ok)) throw new Error('base schema failed: ' + base.find(r => !r.ok).f);
q(`insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test'), ('${ADM}', 'adm@x.test'), ('${OLD}', 'old@x.test')`);
q(`update public.profiles set role = 'admin' where id = '${ADM}'`);
// The settings columns only exist after the migration; before it, these
// updates are no-ops on a table that does not have them — so they are made
// conditional. (The run itself needs them only after.)
q(`alter table public.app_settings add column if not exists max_user_payload_bytes bigint, add column if not exists ai_daily_global_cap integer`);
const PRE = readFileSync(`${REPO}/supabase/checks/preflight_20261004.sql`, 'utf8');
const POST = readFileSync(`${REPO}/supabase/checks/postflight_20261004.sql`, 'utf8');
const rows = (sql) => psql(DB, `begin transaction read only; ${sql.trim().replace(/;\s*$/, '')}; rollback;`).split('\n').map(l => l.split('|'));

const b = await run('BEFORE (production today)');
q(`alter table public.app_settings drop column max_user_payload_bytes, drop column ai_daily_global_cap`);
// A row already above the ceiling, written before the migration, by its owner.
q(`insert into public.events (id, user_id, name, payload, hostess_token)
   values ('dddddddd-1111-0000-0000-000000000001', '${OLD}', 'ישן וגדול',
           (${blob(9_600_000)}) || '{"guests":[{"id":"d1","name":"משפחת לוי","count":2}]}'::jsonb, 'hostOLDaaaaa')`);
const postBefore = rows(POST);
console.log('\npreflight (production today):'); rows(PRE).forEach(r => console.log('  ' + r.join(' | ')));

for (let i = 0; i < 2; i++) { const r = runScript(DB, mig(NEW)); if (!r.ok) throw new Error(`migration run ${i + 1} failed: ${r.err}`); }
const a = await run('AFTER (this migration, pasted twice)');
// The existing oversized row: still editable, shrinkable, not growable; the door still works.
const E = `id = 'dddddddd-1111-0000-0000-000000000001'`;
const oldRename = quota(sh(`update public.events set name = 'שם חדש' where ${E}`, OLD));
const oldGrow = quota(sh(`update public.events set payload = payload || '{"extra":"${'x'.repeat(2000)}"}' where ${E}`, OLD));
const door = sh(`select public.hostess_mark_arrival_by_token('hostOLDaaaaa', 'd1', '[0]'::jsonb, '[]'::jsonb)`, 'anon');
const oldShrink = quota(sh(`update public.events set payload = payload - 'blob' where ${E}`, OLD));
q(`insert into public.events (user_id, name, payload) select '${ADM}', 'a' || g, '{}' from generate_series(1, 500) g`);
const admin501 = quota(ins(ADM, `'{}'`));
const hint = sh(`insert into public.events (user_id, name, payload) values ('${A}', 'x', ${blob(9_000_000)})`, A);
const postAfter = rows(POST);
console.log('\npostflight after:'); postAfter.forEach(r => console.log('  ' + r.join(' | ')));

const checks = [];
const cmp = (name, bad, good) => { checks.push(bad && good); console.log(`${bad && good ? '✓' : '✗'} ${name}${bad ? '' : '  ← the check does not see the hole before the migration'}`); };
const pass = (name, good, detail = '') => { checks.push(!!good); console.log(`${good ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`); };
console.log('\n══ the holes: open before, closed after');
cmp('S1 the 501st event of one account is refused', b.e501 === 'accepted', a.e501 === 'count');
cmp('S1 eight creates at once with room for three: the account ends at 500', b.race.after === b.race.before + 8, a.race.before === 497 && a.race.after === 500);
cmp('S1 one 9.6 MB event is refused', b.huge === 'accepted', a.huge === 'size');
cmp('S1 the account total is enforced (4 MB setting: 3rd of 1.5 MB refused)', b.tot3 === 'accepted', a.tot1 === 'accepted' && a.tot2 === 'accepted' && a.tot3 === 'total');
cmp('S4 a claim past the global daily ceiling is refused', b.ai6 === 'ok', /global ai limit reached/.test(a.ai6));
cmp('S4 30 accounts at once against a global ceiling of 10 → 10', b.aiRace === 30, a.aiRace === 10);
console.log('\n══ what must keep working after');
pass('a host\'s 500th event', a.e500 === 'accepted', a.e500);
pass('another host is unaffected by A being full', a.otherHost === 'accepted', a.otherHost);
pass('the owner in the SQL editor is not capped', a.ownerSql);
pass(`a realistic 2,500-guest wedding (${(Buffer.byteLength(BIG) / 1e6).toFixed(2)} MB) is stored`, a.bigInsert === 'accepted', a.bigInsert);
pass('and edited', a.bigUpdate === 'accepted', a.bigUpdate);
pass('an admin can grow a host\'s event past the ceiling', a.adminGrow === 'accepted' && a.adminRows === 1, a.adminGrow);
pass('an admin\'s own 501st event is not refused', admin501 === 'accepted', admin501);
pass('the service role is not capped', a.service === 'accepted', a.service);
pass('the claim under the global ceiling (5th of 5) passes', a.ai5 === 'ok', a.ai5);
pass('the per-user hourly limit still holds', /rate limit reached/.test(a.aiUser), a.aiUser);
pass('a row already over the ceiling: renamed', oldRename === 'accepted', oldRename);
pass('— not grown', oldGrow === 'size', oldGrow);
pass('— the door function (anon, definer) still marks a guest there', door.ok, door.ok ? '' : door.err);
pass('— and shrunk', oldShrink === 'accepted', oldShrink);
pass('the refusal carries the app\'s key and a Hebrew hint', /event_quota:size/.test(hint.full || '') && /HINT:\s+האירוע גדול/.test(hint.full || ''), (hint.full || '').split('\n').slice(0, 2).join(' / '));
pass('postflight_20261004.sql: fails before', postBefore.some(r => r[2] !== 'תקין'));
pass('— and is all תקין after', postAfter.length >= 6 && postAfter.every(r => r[2] === 'תקין'));
const failed = checks.filter(c => !c).length;
console.log(failed ? `\n${failed} FAILED` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
