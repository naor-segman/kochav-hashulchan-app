// Two greeters, one family, one refresh window (WORKPLAN ג2, 28.9).
//
// The door RPC wrote the FULL seat list the greeter's phone believed in, so
// the last write replaced the row and the other greeter's tick was lost. The
// 4-argument overload (20260928000700) takes the list the phone started from
// and applies only the difference. Against a real Postgres, both migrations
// loaded exactly as shipped.
//
//   node qa/hostessThreeWaySql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync, spawn } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5611';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pgdoor-'));
let fails = 0;
const ok = (c, what, detail = '') => { if (!c) fails++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`); };
const psql = (sql) => execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
const mig = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });

const TOK = 'hostesstok1';
const seats = (gid = 'g1') => psql(`select coalesce(g->'arrivedSeats','[]')::text from public.events e,
  jsonb_array_elements(e.payload->'guests') g where g->>'id' = '${gid}'`);
const reset = () => psql(`update public.events set payload = '{"guests":[{"id":"g1","name":"יעל","count":4},{"id":"g2","name":"איתי","count":1}]}'`);
const mark3 = (s) => psql(`select public.hostess_mark_arrival_by_token('${TOK}', 'g1', '${JSON.stringify(s)}'::jsonb)`);
// Two requests that OVERLAP on the server: A's transaction stays open while B
// arrives. Run one after another (everything above), the race cannot happen.
const bg = (sql) => new Promise(res => {
  const c = spawn('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  let err = ''; c.stderr.on('data', d => { err += d; }); c.on('close', code => res(code === 0 ? null : err));
});
const call4 = (s, base) => `select public.hostess_mark_arrival_by_token('${TOK}', 'g1', '${JSON.stringify(s)}'::jsonb, '${JSON.stringify(base)}'::jsonb)`;
const overlap = async () => {
  const a = bg(`begin; ${call4([0], [])}; select pg_sleep(1); commit;`);   // greeter A, slow to commit
  await new Promise(r => setTimeout(r, 300));
  const b = bg(call4([1], []));                                             // greeter B, meanwhile
  return Promise.all([a, b]);
};
const mark4 = (s, base) => psql(`select public.hostess_mark_arrival_by_token('${TOK}', 'g1', '${JSON.stringify(s)}'::jsonb, '${JSON.stringify(base)}'::jsonb)`);

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);
  psql(`
    create role anon nologin; create role authenticated nologin;
    create table public.events (id uuid primary key default gen_random_uuid(), hostess_token text,
      payload jsonb, version int default 1, updated_at timestamptz);
    create function public.hostess_writes_active(e public.events) returns boolean language sql stable as $$ select true $$;
    insert into public.events (hostess_token, payload) values ('${TOK}', '{}');
  `);
  psql(mig('20260813000000_arrival_timestamps.sql'));
  psql(mig('20260928000700_hostess_three_way_arrival.sql'));

  console.log('── the premise: the old 3-argument write loses a racing tick');
  reset();
  mark3([0]);          // greeter A ticks seat 0
  mark3([1]);          // greeter B, still showing [], ticks seat 1
  ok(seats() === '[1]', 'old write: A\'s seat is gone', seats());

  console.log('\n── the 4-argument write keeps both');
  reset();
  mark4([0], []);      // A: saw [], wants [0]
  mark4([1], []);      // B: saw [], wants [1]
  ok(seats() === '[0, 1]', 'both greeters\' seats are there', seats());

  console.log('\n── an un-tick racing a tick');
  mark4([1], [0, 1]);  // A un-ticks seat 0 (saw [0,1])
  mark4([1, 2], [1]);  // B, who saw only [1], ticks seat 2
  ok(seats() === '[1, 2]', 'seat 0 removed, seat 2 added, seat 1 untouched', seats());

  console.log('\n── two un-ticks racing');
  reset();
  mark4([0, 1], []);
  mark4([1], [0, 1]);  // A un-ticks seat 0
  mark4([0], [0, 1]);  // B, still showing [0,1], un-ticks seat 1
  ok(seats() === '[]', 'both removals stick — neither greeter re-adds what the other removed', seats());

  console.log('\n── the guards still hold');
  mark4([0, 1, 2, 3, 9, "x"], []);
  ok(seats() === '[0, 1, 2, 3]', 'no seat beyond the row\'s count, no junk', seats());
  ok(seats('g2') === '[]', 'another guest is untouched', seats('g2'));
  let err = spawnSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1', '-c',
    `select public.hostess_mark_arrival_by_token('wrongtoken1', 'g1', '[0]', '[]')`], { encoding: 'utf8' });
  ok(err.status !== 0 && /invalid token/.test(err.stderr), 'a wrong token is refused');
  ok(psql(`select has_function_privilege('anon', 'public.hostess_mark_arrival_by_token(text,text,jsonb,jsonb)', 'execute')`) === 't',
     'the greeter (anon) can call it');

  console.log('\n── the 29.9 review: requests that overlap on the server (20260928000700 as shipped)');
  reset();
  await overlap();
  ok(seats() === '[1]', 'premise: A\'s seat is lost when B arrives inside A\'s transaction', seats());
  psql(`update public.events set payload = '{"guests":[{"id":"g1","name":"יעל","count":4,"arrived":true}]}'`);
  mark4([0, 1, 2], [0, 1, 2, 3]);   // a greeter un-ticks seat 3 of a family checked in before per-seat marks
  ok(seats() === '[]', 'premise: un-ticking one seat of a pre-per-seat row cleared the whole family', seats());

  psql(`create table if not exists public.gifts (id uuid primary key default gen_random_uuid(), event_id uuid, donor_name text,
          amount bigint, message text, paid boolean default false, created_at timestamptz default now())`);
  psql(`alter table public.events add column if not exists gift_token text`);
  psql(mig('20260929000000_review_gift_door_fixes.sql'));
  console.log('\n── after 20260929000000');
  reset();
  await overlap();
  ok(seats() === '[0, 1]', 'overlapping: both greeters\' seats are there', seats());
  psql(`update public.events set payload = '{"guests":[{"id":"g1","name":"יעל","count":4,"arrived":true}]}'`);
  mark4([0, 1, 2], [0, 1, 2, 3]);
  ok(seats() === '[0, 1, 2]', 'a pre-per-seat row reads as every seat: un-ticking one keeps the other three', seats());
  reset();
  mark4([0, 1], []); mark4([1], [0, 1]);
  ok(seats() === '[1]', 'the ordinary cases are unchanged', seats());

  console.log('\n── an old phone still works');
  reset();
  mark3([0, 1]);
  ok(seats() === '[0, 1]', 'the 3-argument version is unchanged', seats());
} finally {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`]);
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
