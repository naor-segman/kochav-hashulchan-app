// The album object cap, driven against a real Postgres with real RLS.
//
// THE HOLE: `album_objects_insert` let `anon` write into storage.objects with
// one test — is the first path segment a real event id? No token, no ceiling.
// And the event id is not secret from anyone holding any public link, because
// `public_event_by_token` returns it. So a forwarded WhatsApp link was enough
// to PUT 10MB images in a loop onto the storage bill.
//
// The existing 5000-row cap bounds `album_photos`, the INDEX. The bytes live in
// storage.objects, which had no cap at all — the two halves of one operation,
// only one of them limited.
//
// Boundary behaviour is the whole question here, so this drives the real policy
// to 4999/5000/5001 rather than asserting the SQL reads correctly.
//
//   node qa/albumCapSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5603';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pgalbum-'));

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const psql = (sql) =>
  execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres',
                        '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();

const psqlMayFail = (sql) => {
  const r = spawnSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres',
                               '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  return r.status === 0 ? null : (r.stderr || '').trim();
};

const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });

function stop() {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`], { encoding: 'utf8' });
  rmSync(DIR, { recursive: true, force: true });
}

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);

  const EV    = '11111111-1111-1111-1111-111111111111';
  const OTHER = '22222222-2222-2222-2222-222222222222';
  const GHOST = '33333333-3333-3333-3333-333333333333';   // not an event

  // The real shapes: storage.objects with `name`, storage.foldername(), and the
  // events table the folder is checked against.
  psql(`
    create schema storage;
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      owner uuid
    );
    create index on storage.objects (bucket_id, name);
    create or replace function storage.foldername(name text)
      returns text[] language sql immutable as $$
        select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
      $$;
    create table public.events (id uuid primary key, name text);
    insert into public.events values ('${EV}', 'החתונה של דנה ויוסי'), ('${OTHER}', 'בר המצווה של איתי');
    create role anon nologin;
    create role authenticated nologin;   -- the policy names both
    grant usage on schema public, storage to anon, authenticated;
    grant select, insert on storage.objects to anon, authenticated;
    alter table storage.objects enable row level security;
    alter table storage.objects force row level security;
    create policy album_objects_select on storage.objects for select to anon using (bucket_id = 'event-album');
  `);

  // The helper the policy depends on, from its own migration.
  psql(`
    create or replace function public.album_folder_is_event(folder text)
    returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.events e where e.id::text = folder);
    $$;
    revoke all on function public.album_folder_is_event(text) from public;
    grant execute on function public.album_folder_is_event(text) to anon, authenticated;
  `);

  psql(readFileSync(new URL('../supabase/migrations/20260818000100_album_objects_cap.sql', import.meta.url), 'utf8'));

  const put = (folder, n) =>
    psqlMayFail(`begin; set local role anon; insert into storage.objects (bucket_id, name) values ('event-album', '${folder}/${n}.jpg'); commit;`);

  console.log('── an ordinary guest upload still works');
  ok(put(EV, 'first') === null, 'one photo into a real event album');
  ok(psql(`select count(*) from storage.objects where name like '${EV}/%'`) === '1', 'and it landed');

  console.log('\n── a folder that is not an event is still refused');
  ok(put(GHOST, 'x') !== null, 'unknown folder rejected');
  ok(put('not-a-uuid', 'x') !== null, 'garbage folder rejected');

  console.log('\n── the ceiling, at the boundary');
  {
    // Bulk-fill as the owner (RLS does not apply to this insert), then probe the
    // last three positions through the anon policy. Filling via the policy would
    // be 5000 round trips.
    psql(`insert into storage.objects (bucket_id, name)
          select 'event-album', '${EV}/bulk-' || g || '.jpg' from generate_series(1, 4998) g;`);
    ok(psql(`select count(*) from storage.objects where name like '${EV}/%'`) === '4999', 'seeded to 4,999');

    ok(put(EV, 'n5000') === null, 'the 5,000th is accepted');
    const err = put(EV, 'n5001');
    ok(err !== null, 'the 5,001st is refused', (err || '').split('\n')[0].slice(0, 62));
    ok(psql(`select count(*) from storage.objects where name like '${EV}/%'`) === '5000',
       'and the folder stops at exactly 5,000');
  }

  console.log('\n── the cap is per event, and per bucket');
  {
    // Two different ways for the count to lose its WHERE, and both lock real
    // hosts out of their own album:
    //
    //   forget the FOLDER → one full album freezes every event in the product
    //   forget the BUCKET → the host's own event-site photos (cover, gallery,
    //                       invitation) count against their guests' album
    //
    // The second survived a mutation until this fixture existed, because every
    // object in the test lived in event-album anyway.
    psql(`insert into storage.objects (bucket_id, name)
          select 'event-site', '${OTHER}/site-' || g || '.jpg' from generate_series(1, 5200) g;`);
    ok(psql(`select count(*) from storage.objects where bucket_id = 'event-site' and name like '${OTHER}/%'`) === '5200',
       'seeded 5,200 event-site objects under the same folder');

    ok(put(OTHER, 'first') === null, 'the album is still open — a different bucket does not count');
    ok(psql(`select count(*) from storage.objects where bucket_id = 'event-album' and name like '${OTHER}/%'`) === '1',
       'and it landed');
  }

  console.log('\n── another bucket is not governed by this policy');
  {
    const err = psqlMayFail(`begin; set local role anon; insert into storage.objects (bucket_id, name) values ('event-site', '${EV}/x.jpg'); commit;`);
    ok(err !== null, 'event-site writes are not opened up by it');
  }
} finally {
  stop();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
