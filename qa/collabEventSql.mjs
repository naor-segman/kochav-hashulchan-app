// collab_event_by_token against a real Postgres (WORKPLAN 106, 28.9):
// it now returns the host's own group names, and nothing else changed.
//
//   node qa/collabEventSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5610';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pgcollab-'));
let fails = 0;
const ok = (c, what, detail = '') => { if (!c) fails++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`); };
const psql = (sql) => execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
const mig = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);
  psql(`
    create role anon nologin; create role authenticated nologin;
    create table public.events (id uuid primary key default gen_random_uuid(), name text, type text,
                                collab_token text, payload jsonb);
    -- The real switch lives in another migration; here the link is simply on.
    create function public.collab_is_active(e public.events) returns boolean language sql stable as $$ select true $$;
    insert into public.events (name, type, collab_token, payload) values
      ('החתונה', 'חתונה', 'collabtok1', '{"brideName":"דנה","customGroups":["חברים מהצבא","השכנים"]}'),
      ('אירוע ישן', 'חתונה', 'collabtok2', '{"customGroups":"not-an-array"}');
  `);
  psql(mig('20260814000000_collab_parents_type.sql'));
  const before = psql(`select public.collab_event_by_token('collabtok1')::text`);
  psql(mig('20260928000600_collab_custom_groups.sql'));
  const after = psql(`select public.collab_event_by_token('collabtok1')::text`);

  ok(!before.includes('חברים מהצבא'), 'before: the host\'s groups were not sent (the premise)');
  ok(after.includes('"custom_groups": ["חברים מהצבא", "השכנים"]'), 'after: they are', after.slice(0, 120));
  ok(after.includes('"bride_name": "דנה"'), 'the other fields are unchanged');
  ok(psql(`select public.collab_event_by_token('collabtok2')->>'custom_groups'`) === '[]', 'a malformed value becomes [], not an error');
  ok(psql(`select coalesce(public.collab_event_by_token('wrongtoken')::text, 'NULL')`) === 'NULL', 'a wrong token still gets nothing');
} finally {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`]);
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
