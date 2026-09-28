// Migration 20260928000300 against a real Postgres (audit 28.9, A5 + B7).
//
// What this proves, on the migration file itself:
//   - THE PREMISE: with Supabase's default function privileges, `revoke … from
//     public` leaves album_event_id and prune_ai_usage callable by anon. If
//     this half fails, the fixture is wrong and the rest proves nothing.
//   - after the migration anon and authenticated can call neither
//   - the public album still works for anon — album_event_id is reached through
//     a SECURITY DEFINER function, which the revoke must not break
//   - a second event can no longer take an existing album token
//   - a database that already HAS a shared token makes the migration stop,
//     rather than silently choosing which couple keeps the link
//
//   node qa/internalFunctionsSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5609';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pginternal-'));
const MIGRATION = readFileSync(new URL(
  '../supabase/migrations/20260928000300_internal_functions_and_album_token.sql', import.meta.url), 'utf8');

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const args = ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1'];
const psql = (sql) => execFileSync('psql', [...args, '-c', sql], { encoding: 'utf8' }).trim();
const psqlMayFail = (sql) => {
  const r = spawnSync('psql', [...args, '-c', sql], { encoding: 'utf8' });
  return r.status === 0 ? null : (r.stderr || '').trim();
};
const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
function stop() {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`], { encoding: 'utf8' });
  rmSync(DIR, { recursive: true, force: true });
}
const can = (role, fn) => psql(`select has_function_privilege('${role}', '${fn}', 'execute')`) === 't';
const asAnon = (sql) => `begin; set local role anon; ${sql} commit;`;

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);

  // Supabase's default privileges — the whole finding rests on these. They are
  // set BEFORE the functions are created, exactly as on a real project.
  psql(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;

    create table public.events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, payload jsonb not null default '{}'
    );
    create table public.album_photos (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references public.events(id), storage_path text not null
    );
    create table public.ai_usage (id bigserial primary key, created_at timestamptz not null default now());

    -- As 20260727000001 and 20260811040000 wrote them, revoke included.
    create or replace function public.album_event_id(token_value text)
    returns uuid language sql stable security definer set search_path = public as $$
      select e.id from public.events e
      where token_value is not null and char_length(token_value) >= 8
        and e.payload ->> 'albumToken' = token_value
      limit 1;
    $$;
    create or replace function public.album_list_by_token(token_value text)
    returns table (storage_path text)
    language sql stable security definer set search_path = public as $$
      select p.storage_path from public.album_photos p
      where p.event_id = public.album_event_id(token_value);
    $$;
    create or replace function public.prune_ai_usage()
    returns int language sql volatile security definer set search_path = public as $$
      with gone as (delete from public.ai_usage where created_at < now() - interval '7 days' returning 1)
      select count(*)::int from gone;
    $$;
    revoke all on function public.album_event_id(text)      from public;
    revoke all on function public.album_list_by_token(text) from public;
    revoke all on function public.prune_ai_usage()          from public;
    grant execute on function public.album_list_by_token(text) to anon, authenticated;
  `);

  const EV = psql(`insert into public.events (user_id, payload)
                   values (gen_random_uuid(), '{"albumToken":"albumtok11"}') returning id;`);
  psql(`insert into public.album_photos (event_id, storage_path) values ('${EV}', '${EV}/a.jpg');`);

  console.log('── the premise: revoke-from-public left both open');
  ok(can('anon', 'public.album_event_id(text)'), 'anon can call album_event_id before the migration');
  ok(can('anon', 'public.prune_ai_usage()'), 'anon can call prune_ai_usage before the migration');

  psql(MIGRATION);

  console.log('\n── after the migration');
  for (const role of ['anon', 'authenticated']) {
    ok(!can(role, 'public.album_event_id(text)'), `${role} cannot call album_event_id`);
    ok(!can(role, 'public.prune_ai_usage()'), `${role} cannot call prune_ai_usage`);
  }
  {
    const err = psqlMayFail(asAnon(`select public.prune_ai_usage();`));
    ok(err && /permission denied/.test(err), 'an actual anon call is refused', (err || 'no error').split('\n')[0]);
  }
  {
    const out = spawnSync('psql', [...args, '-c',
      asAnon(`select string_agg(storage_path, ',') from public.album_list_by_token('albumtok11');`)], { encoding: 'utf8' });
    ok(out.status === 0 && out.stdout.includes(`${EV}/a.jpg`),
       'the public album still lists for anon (reached through the definer function)',
       (out.stderr || '').split('\n')[0]);
  }

  console.log('\n── one event per album token');
  {
    const err = psqlMayFail(`insert into public.events (user_id, payload) values (gen_random_uuid(), '{"albumToken":"albumtok11"}');`);
    ok(err && /idx_events_album_token/.test(err), 'a second event cannot take an existing album token', (err || 'accepted').split('\n')[0]);
    const err2 = psqlMayFail(`insert into public.events (user_id, payload) values (gen_random_uuid(), '{}'), (gen_random_uuid(), '{}');`);
    ok(err2 === null, 'events without an album token are unaffected', (err2 || '').split('\n')[0]);
  }
  {
    const plan = psql(`set enable_seqscan = off; explain select id from public.events where payload ->> 'albumToken' = 'albumtok11';`);
    ok(/idx_events_album_token/.test(plan), 'the album lookup can use the index (no full scan)');
  }

  console.log('\n── a database that already has a shared token');
  {
    const err = psqlMayFail(`begin;
      drop index public.idx_events_album_token;
      insert into public.events (user_id, payload) values (gen_random_uuid(), '{"albumToken":"albumtok11"}');
      ${MIGRATION}
      rollback;`);
    ok(err && /shared by more than one event/.test(err), 'the migration stops and says why', (err || 'it ran').split('\n')[0].slice(0, 90));
  }
  {
    const err = psqlMayFail(MIGRATION);
    ok(err === null, 'and re-running it on a clean database is harmless', (err || '').split('\n')[0]);
  }
} finally {
  stop();
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
