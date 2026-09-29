// The anonymous write paths, attacked the way the 30.9 review attacked them —
// against EVERY migration (supabase/setup_full.sql) on a Supabase stand-in
// (qa/lib/supabaseShim.sql). Migration 20260930000000 (סב42).
//
//   1. album uploads without the album link (any link gave the event id)
//   2. album_add_photo with '..' in the path
//   3. the gift and RSVP limits as lockout tools — now per sender
//   4. the event-site bucket without a ceiling
//
//   node qa/guestWriteHardeningSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT  = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5611';
const DIR   = mkdtempSync(join(tmpdir(), 'pgguestw-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};
const run = (sql) => spawnSync('psql', ['-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8' });
const psql = (sql) => { const r = run(sql); if (r.status) throw new Error(r.stderr); return r.stdout.trim(); };
const tryAs = (sql) => { const r = run(sql); return r.status === 0 ? null : (r.stderr.match(/ERROR:\s*([^\n]*)/) || [, r.stderr])[1]; };
const asPg = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });

const EV = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', OWNER = '11111111-1111-1111-1111-111111111111';
const ALBUM = 'album-tok-1234567';
// anon, with a client address the way PostgREST passes it.
const anon = (ip, sql) => `begin; set local role anon;
  ${ip ? `select set_config('request.headers', '{"x-forwarded-for":"${ip}, 10.0.0.1"}', true);` : ''}
  ${sql}; commit;`;

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPg(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPg(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k /tmp -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);
  psql(readFileSync(join(ROOT, 'qa/lib/supabaseShim.sql'), 'utf8'));
  psql(readFileSync(join(ROOT, 'supabase/setup_full.sql'), 'utf8'));
  psql(`insert into storage.buckets (id, name, public) values ('event-album','event-album',true), ('event-site','event-site',true) on conflict do nothing;
    insert into auth.users (id, email) values ('${OWNER}', 'host@x.co');
    insert into public.events (id, user_id, name, rsvp_token, invite_token, gift_token, hostess_token, collab_token, payload)
    values ('${EV}', '${OWNER}', 'החתונה', 'rsvp-tok-12345', 'invite-tok-12345', 'gift-tok-12345', 'host-tok-12345', 'collab-tok-12345',
      jsonb_build_object('albumToken', '${ALBUM}'));`);

  console.log('── 1. album uploads need the CURRENT album link');
  const put = (path) => tryAs(anon(null, `insert into storage.objects (bucket_id, name) values ('event-album', '${path}')`));
  ok(put(`${EV}/x.jpg`) !== null, 'the event id alone (any link gives it) is refused');
  ok(put(`${EV}/wrong-token-999/x.jpg`) !== null, 'a made-up token folder is refused');
  ok(put(`${EV}/${ALBUM}/a.jpg`) === null, 'the album link\'s folder is accepted');
  psql(`update public.events set payload = payload || '{"albumToken":"album-tok-NEW99"}' where id = '${EV}'`);
  ok(put(`${EV}/${ALBUM}/b.jpg`) !== null, 'after the host changes the album link, the old one is refused');
  ok(put(`${EV}/album-tok-NEW99/c.jpg`) === null, 'and the new one works');

  console.log('\n── 2. album_add_photo');
  const add = (path) => tryAs(anon(null, `select public.album_add_photo('album-tok-NEW99', '${path}', 'יעל')`));
  ok(add(`${EV}/album-tok-NEW99/c.jpg`) === null, 'a real upload is indexed');
  ok(add(`${EV}/album-tok-NEW99/../../event-site/bbbbbbbb-0000-0000-0000-000000000000/cover.jpg`) !== null, "'..' is refused");
  ok(add(`${EV}/c.jpg`) !== null, 'a path without the token folder is refused');
  ok(add(`${EV}/album-tok-NEW99//c.jpg`) !== null, "'//' is refused");

  console.log('\n── 3. gifts: 30 a minute PER SENDER, not 60 for everyone');
  const gift = (ip, i) => tryAs(anon(ip, `select public.submit_gift_by_token('gift-tok-12345', 'אורח ${ip} ${i}', 36000, null, 'k-${ip}-${i}')`));
  let first = null;
  for (let i = 1; i <= 31; i++) { const e = gift('203.0.113.7', i); if (e && !first) first = i; }
  ok(first === 31, 'one address: 30 accepted, the 31st refused', `first refusal at #${first}`);
  ok(gift('198.51.100.9', 1) === null, 'a real guest from another address still gets through');
  const n = psql(`select count(*) from public.gifts where event_id = '${EV}'`);
  ok(n === '31', '31 stored (30 + the real one)', n);
  // No address visible (a direct call): the old per-event fallback, at 300.
  psql(`delete from public.guest_write_throttle`);
  let nf = null;
  for (let i = 1; i <= 301; i++) { if (gift(null, i) && !nf) nf = i; }
  ok(nf === 301, 'no address: the per-event fallback stops at 300', `first refusal at #${nf}`);

  console.log('\n── 3b. RSVP: 30 a minute per sender; the 5,000 total is still there');
  const rsvp = (ip, i) => tryAs(anon(ip, `select public.submit_rsvp_by_token('rsvp-tok-12345', 'אורח ${i}', null, 'yes', 1, null, null, null)`));
  let rf = null;
  for (let i = 1; i <= 31; i++) { if (rsvp('203.0.113.7', i) && !rf) rf = i; }
  ok(rf === 31, 'one address: the 31st in a minute is refused', `first refusal at #${rf}`);
  ok(rsvp('198.51.100.9', 1) === null, 'another guest still answers');
  psql(`insert into public.rsvp_responses (event_id, guest_name, attending, guests_count, status)
        select '${EV}', 'x' || g, true, 1, 'yes' from generate_series(1, 5000) g`);
  ok(/limit reached/.test(rsvp('192.0.2.1', 1) || ''), 'the 5,000 total still holds');

  console.log('\n── the throttle forgets after a minute');
  psql(`update public.guest_write_throttle set at = now() - interval '2 minutes'`);
  ok(gift('203.0.113.7', 99) === null, 'the same address is accepted again a minute later');
  ok(psql(`select count(*) from public.guest_write_throttle where kind = 'gift' and event_id = '${EV}'`) === '1',
     'old rows are deleted, not kept');
  ok(tryAs(anon(null, `select count(*) from public.guest_write_throttle`)) !== null, 'anon cannot read the throttle table');

  console.log('\n── 4. the event-site bucket has a ceiling');
  psql(`insert into storage.objects (bucket_id, name) select 'event-site', '${EV}/s' || g || '.jpg' from generate_series(1, 299) g`);
  const site = (f) => tryAs(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${OWNER}', true);
    insert into storage.objects (bucket_id, name) values ('event-site', '${EV}/${f}'); commit;`);
  ok(site('n300.jpg') === null, 'the owner\'s 300th file is accepted');
  ok(site('n301.jpg') !== null, 'the 301st is refused');
} finally {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`]);
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
