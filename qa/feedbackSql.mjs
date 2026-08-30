// The feedback endpoint's guards, against a real Postgres with real RLS.
//
// `submit_feedback` is SECURITY DEFINER and granted to anon, because the guest
// screens are exactly where a confusing step costs the host a reply — and a
// guest arriving from a WhatsApp link has no session at all. An endpoint
// anonymous callers can write to is an endpoint someone will flood, so the
// guards are the feature, and reading them is not measuring them.
//
// What this proves, by running it:
//   • anon can write, and cannot read back what anyone wrote
//   • a non-admin authenticated user cannot read either
//   • an admin can
//   • `kind` outside the three the form offers is stored as 'other'
//   • an empty message is refused rather than stored blank
//   • a double-tap inside 10 minutes stores ONE row and still reports success
//   • the same text from a DIFFERENT sender is not swallowed as a duplicate
//   • the hourly ceiling stops the 101st row and says so
//   • fields are truncated server-side, not trusted from the client
//
//   node qa/feedbackSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5607';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pgfb-'));

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const psql = (sql) =>
  execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres',
                        '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();

const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
function stop() {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`], { encoding: 'utf8' });
  rmSync(DIR, { recursive: true, force: true });
}

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID  = '22222222-2222-2222-2222-222222222222';

/* Run a statement as a role with a JWT subject, the way PostgREST does.
 *
 * Only the LAST line is returned. `set_config` is itself a SELECT, so its
 * result — the uuid — comes back ahead of the answer, and comparing the whole
 * output to '1' fails on a query that returned exactly 1. Three checks in this
 * file "failed" that way before the harness was fixed; the endpoint had been
 * behaving correctly the whole time. */
const as = (role, uid, sql) => {
  const out = psql(
    `set local role ${role};` +
    (uid ? ` select set_config('request.jwt.claim.sub', '${uid}', true);` : '') +
    ` ${sql}`
  );
  const lines = out.split('\n').filter(l => l !== '');
  return lines.length ? lines[lines.length - 1] : '';
};

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);

  // The pieces the migration expects to already exist.
  psql(`
    create role anon;
    create role authenticated;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users (id uuid primary key);
    insert into auth.users (id) values ('${ADMIN_ID}'), ('${USER_ID}');
    create table public.profiles (id uuid primary key, role text not null default 'user');
    insert into public.profiles (id, role) values ('${ADMIN_ID}', 'admin'), ('${USER_ID}', 'user');
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.profiles to anon, authenticated;
  `);

  // The migration itself, verbatim — not a paraphrase of it.
  const sql = readFileSync(new URL('../supabase/migrations/20260830000100_feedback.sql', import.meta.url), 'utf8');
  psql(sql);
  psql(`grant select, insert, update, delete on public.feedback to anon, authenticated;`);

  console.log('\n── who may write, and who may read');

  ok(as('anon', null, `select public.submit_feedback('bug', 'האורח לא הצליח לאשר הגעה');`) === 't',
     'anon can send feedback');

  ok(as('anon', null, `select count(*) from public.feedback;`) === '0',
     'anon cannot read any of it back');

  ok(as('authenticated', USER_ID, `select count(*) from public.feedback;`) === '0',
     'a signed-in non-admin cannot read it either');

  ok(as('authenticated', ADMIN_ID, `select count(*) from public.feedback;`) === '1',
     'an admin can');

  console.log('\n── the payload is bounded here, not trusted from the client');

  as('anon', null, `select public.submit_feedback('nonsense-kind', 'קטגוריה שהטופס לא מציע');`);
  ok(psql(`select kind from public.feedback where message = 'קטגוריה שהטופס לא מציע';`) === 'other',
     "a kind outside bug/idea/other becomes 'other'");

  ok(as('anon', null, `select public.submit_feedback('bug', '   ');`) === 'f',
     'a message of only whitespace is refused, not stored blank');

  as('anon', null, `select public.submit_feedback('idea', repeat('א', 5000), repeat('ב', 400), repeat('/x', 300), repeat('U', 500));`);
  const lens = psql(`select length(message) || ',' || length(contact) || ',' || length(route) || ',' || length(user_agent)
                       from public.feedback where kind = 'idea' order by created_at desc limit 1;`);
  ok(lens === '4000,200,200,300', 'over-long fields are truncated server-side', lens);

  console.log('\n── a double tap is not a second opinion');

  const before = psql(`select count(*) from public.feedback;`);
  const r1 = as('authenticated', USER_ID, `select public.submit_feedback('bug', 'אותה הודעה בדיוק');`);
  const r2 = as('authenticated', USER_ID, `select public.submit_feedback('bug', 'אותה הודעה בדיוק');`);
  const after = psql(`select count(*) from public.feedback;`);
  ok(r1 === 't' && r2 === 't', 'both taps are told it was received');
  ok(Number(after) - Number(before) === 1, 'but only one row is stored', `${before} → ${after}`);

  // The dedupe keys on the sender as well as the text. Two different people
  // hitting the same wall write the same sentence — that is two reports.
  as('anon', null, `select public.submit_feedback('bug', 'אותה הודעה בדיוק');`);
  ok(psql(`select count(*) from public.feedback where message = 'אותה הודעה בדיוק';`) === '2',
     'the same text from a different sender is a second report, not a duplicate');

  console.log('\n── the hourly ceiling');

  psql(`insert into public.feedback (message, kind)
        select 'מילוי ' || g, 'other' from generate_series(1, 200) g;`);
  ok(as('anon', null, `select public.submit_feedback('bug', 'מעבר לתקרה');`) === 'f',
     'past the ceiling the write is refused, and says so');
  ok(psql(`select count(*) from public.feedback where message = 'מעבר לתקרה';`) === '0',
     'and nothing is stored');

  // The ceiling is per HOUR, not forever — age the rows and the door reopens.
  psql(`update public.feedback set created_at = now() - interval '2 hours';`);
  ok(as('anon', null, `select public.submit_feedback('bug', 'אחרי שהשעה חלפה');`) === 't',
     'once the hour has passed, writing works again');

  console.log(`\n${fails} failing checks`);
} finally {
  stop();
}
process.exit(fails ? 1 : 0);
