// 137 (owner, 6.10) — public_event_by_token serves the host's "שעת קבלת פנים"
// to the guest pages, so their Hebrew date follows the event's start time.
// Against EVERY migration (supabase/setup_full.sql) on the Supabase stand-in.
// Migration 20261006000000.
//
//   node qa/receptionTimeSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT  = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5613';
const DIR   = mkdtempSync(join(tmpdir(), 'pgrecept-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};
const run = (sql) => spawnSync('psql', ['-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8' });
const psql = (sql) => { const r = run(sql); if (r.status) throw new Error(r.stderr); return r.stdout.trim(); };
const asPg = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
const OWNER = '11111111-1111-1111-1111-111111111111';
const anonGet = (type, tok) => psql(`begin; set local role anon;
  select public.public_event_by_token('${type}', '${tok}')->>'reception_time'; commit;`);

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPg(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPg(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k /tmp -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);
  psql(readFileSync(join(ROOT, 'qa/lib/supabaseShim.sql'), 'utf8'));
  psql(readFileSync(join(ROOT, 'supabase/setup_full.sql'), 'utf8'));
  psql(`insert into auth.users (id, email) values ('${OWNER}', 'host@x.co');
    insert into public.events (id, user_id, name, date, rsvp_token, invite_token, gift_token, payload) values
      ('aaaaaaaa-0000-0000-0000-000000000001', '${OWNER}', 'א', '2026-10-06', 'rsvp-tok-00001', 'invite-tok-0001', 'gift-tok-00001', '{"receptionTime":"19:30"}'),
      ('aaaaaaaa-0000-0000-0000-000000000002', '${OWNER}', 'ב', '2026-10-06', 'rsvp-tok-00002', 'invite-tok-0002', 'gift-tok-00002', '{"receptionTime":"<b>19:30</b>"}'),
      ('aaaaaaaa-0000-0000-0000-000000000003', '${OWNER}', 'ג', '2026-10-06', 'rsvp-tok-00003', 'invite-tok-0003', 'gift-tok-00003', '{}');`);

  console.log('── reception_time on the guest pages');
  ok(anonGet('invite', 'invite-tok-0001') === '19:30', 'the invitation gets it', anonGet('invite', 'invite-tok-0001'));
  ok(anonGet('rsvp', 'rsvp-tok-00001') === '19:30', 'the RSVP page gets it');
  ok(anonGet('invite', 'invite-tok-0002') === '', 'anything but HH:MM is not served', JSON.stringify(anonGet('invite', 'invite-tok-0002')));
  ok(anonGet('invite', 'invite-tok-0003') === '', 'no time → no key');
  // The rest of the function is the 20261001 body: one regression probe.
  const site = psql(`begin; set local role anon; select public.public_event_by_token('gift', 'gift-tok-00001')->'site'; commit;`);
  ok(site === 'null' || site === '', 'the gift link still gets no site (20260928000500 rule kept)', JSON.stringify(site));
} finally {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`]);
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
