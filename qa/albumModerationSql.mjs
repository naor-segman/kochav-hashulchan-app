// The album's moderation, against a real Postgres with real RLS. Checklist 57.
//
// THE HOLE: the shared album has been live since 27.7. Anyone holding the link
// uploads, everyone holding it sees everything, and the host had no way to take
// a photo down — the owner SELECT/DELETE policies existed and nothing used them,
// and there was no way to HIDE at all.
//
// What this proves, on the real migration and not on a description of it:
//   - the owner can hide and unhide, and hidden photos leave the public list
//   - hiding is not deleting — the owner still sees every row
//   - another host cannot hide, delete, or move my photos
//   - the owner can change `hidden` and NOTHING ELSE — not storage_path, not
//     album_token, not event_id (the column grant, not just the policy)
//   - anon gets none of it
//
//   node qa/albumModerationSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5608';
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

const HOST_ID  = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);

  // The fixture mirrors production where it matters: the album table exactly as
  // 20260727000001 created it, its owner SELECT/DELETE policies, and — the part
  // that decides whether the column grant means anything — Supabase's DEFAULT
  // table privileges, which give anon and authenticated ALL on public tables.
  // Without that grant here, the migration's revoke would be tested against
  // nothing and the column grant would look stricter than it is.
  psql(`
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;

    create table public.events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, name text, payload jsonb not null default '{}'
    );
    alter table public.events enable row level security;
    grant select on public.events to authenticated;
    create policy "events: users read own" on public.events for select to authenticated
      using (user_id = auth.uid());

    create table public.album_photos (
      id           uuid primary key default gen_random_uuid(),
      event_id     uuid not null references public.events(id) on delete cascade,
      album_token  text not null,
      storage_path text not null unique,
      uploader     text,
      created_at   timestamptz not null default now()
    );
    alter table public.album_photos enable row level security;
    alter table public.album_photos force row level security;
    grant all on public.album_photos to anon, authenticated;   -- Supabase default

    create policy album_photos_owner_select on public.album_photos for select to authenticated
      using (exists (select 1 from public.events e where e.id = album_photos.event_id and e.user_id = auth.uid()));
    create policy album_photos_owner_delete on public.album_photos for delete to authenticated
      using (exists (select 1 from public.events e where e.id = album_photos.event_id and e.user_id = auth.uid()));

    create or replace function public.album_event_id(token_value text)
    returns uuid language sql stable security definer set search_path = public as $$
      select e.id from public.events e
      where token_value is not null and char_length(token_value) >= 8
        and e.payload ->> 'albumToken' = token_value
      limit 1;
    $$;
  `);

  const EV  = psql(`insert into public.events (user_id, name, payload)
                    values ('${HOST_ID}', 'החתונה של דנה ויוסי', '{"albumToken":"albumtok11"}') returning id;`);
  const EV2 = psql(`insert into public.events (user_id, name, payload)
                    values ('${OTHER_ID}', 'בר המצווה', '{"albumToken":"othertok22"}') returning id;`);

  psql(`insert into public.album_photos (event_id, album_token, storage_path, uploader) values
    ('${EV}',  'albumtok11', '${EV}/1-aaa.jpg',  'דודה רחל'),
    ('${EV}',  'albumtok11', '${EV}/2-bbb.jpg',  'מישהו'),
    ('${EV2}', 'othertok22', '${EV2}/1-ccc.jpg', 'סבתא');`);

  psql(readFileSync(new URL('../supabase/migrations/20260928000100_album_moderation.sql', import.meta.url), 'utf8'));

  const list = (tok = 'albumtok11') => psql(`select coalesce(string_agg(storage_path, ','), '') from public.album_list_by_token('${tok}')`);
  const asUser = (who, sql) =>
    `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${who}'; ${sql} commit;`;
  const bbb = () => psql(`select id from public.album_photos where storage_path like '%bbb%'`);

  console.log('── before moderating, the public album shows everything (the premise)');
  ok(list().includes('bbb'), 'the unwanted photo is in the album');
  ok(list().includes('aaa'), 'and so is the good one');

  console.log('\n── the host hides one');
  {
    const err = psqlMayFail(asUser(HOST_ID, `update public.album_photos set hidden = true where id = '${bbb()}';`));
    ok(err === null, 'the host may hide a photo on their own event', (err || '').split('\n')[0].slice(0, 80));
    ok(!list().includes('bbb'), 'and it leaves the public album');
    ok(list().includes('aaa'), 'while the rest is untouched');
  }

  console.log('\n── hiding is not deleting');
  {
    const n = psql(asUser(HOST_ID, `select count(*) from public.album_photos where event_id = '${EV}';`).replace('commit;', 'commit;'));
    ok(n.includes('2'), 'the host still sees both rows', n);
  }

  console.log('\n── and it is reversible');
  {
    psqlMayFail(asUser(HOST_ID, `update public.album_photos set hidden = false where id = '${bbb()}';`));
    ok(list().includes('bbb'), 'unhiding puts it back');
    psqlMayFail(asUser(HOST_ID, `update public.album_photos set hidden = true where id = '${bbb()}';`));
  }

  console.log('\n── the owner may change `hidden` and NOTHING ELSE');
  {
    // The column grant, not the policy, is what holds these. A whole-row grant
    // (as gifts has) would let the owner point a row at any storage path —
    // including one in another event's folder, in a public bucket.
    const e1 = psqlMayFail(asUser(HOST_ID, `update public.album_photos set storage_path = '${EV2}/stolen.jpg' where id = '${bbb()}';`));
    ok(e1 !== null && /permission denied/i.test(e1), 'storage_path is not writable', (e1 || 'ALLOWED').split('\n')[0].slice(0, 80));
    const e2 = psqlMayFail(asUser(HOST_ID, `update public.album_photos set album_token = 'x' where id = '${bbb()}';`));
    ok(e2 !== null && /permission denied/i.test(e2), 'album_token is not writable', (e2 || 'ALLOWED').split('\n')[0].slice(0, 80));
    const e3 = psqlMayFail(asUser(HOST_ID, `update public.album_photos set event_id = '${EV2}' where id = '${bbb()}';`));
    ok(e3 !== null, 'event_id is not writable', (e3 || 'ALLOWED').split('\n')[0].slice(0, 80));
    ok(!list('othertok22').includes('bbb'), 'and nothing landed in the other album');
  }

  console.log('\n── another host cannot touch it');
  {
    psqlMayFail(asUser(OTHER_ID, `update public.album_photos set hidden = true where event_id = '${EV}';`));
    ok(list().includes('aaa'), 'a stranger cannot hide photos in my album');
    psqlMayFail(asUser(OTHER_ID, `delete from public.album_photos where event_id = '${EV}';`));
    ok(psql(`select count(*) from public.album_photos where event_id = '${EV}'`) === '2', 'nor delete them');
  }

  console.log('\n── the owner can still delete outright');
  {
    const err = psqlMayFail(asUser(HOST_ID, `delete from public.album_photos where id = '${bbb()}';`));
    ok(err === null, 'the host may remove a photo entirely', (err || '').split('\n')[0].slice(0, 80));
    ok(psql(`select count(*) from public.album_photos where event_id = '${EV}'`) === '1', 'and it is gone');
  }

  console.log('\n── anon is given none of this');
  {
    const e1 = psqlMayFail(`begin; set local role anon; update public.album_photos set hidden = true; commit;`);
    ok(e1 !== null, 'anon cannot hide', (e1 || 'ALLOWED').split('\n')[0].slice(0, 80));
  }

  console.log('\n── the public list keeps its contract');
  ok(psql(`select count(*) from public.album_list_by_token('nosuchtoken')`) === '0', 'unknown token → nothing');
  ok(psql(`select count(*) from public.album_list_by_token('short')`) === '0', 'token under 8 chars → nothing');
  ok(list('othertok22').includes('ccc'), 'the other event\'s album is unaffected');
} finally {
  stop();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
