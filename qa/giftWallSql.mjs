// The blessing wall's moderation, against a real Postgres with real RLS.
//
// THE HOLE: `submit_gift_by_token` is open to anon, needs only a name and ₪5,
// and stores a 1,000-character message. `gift_wall_by_token` returned EVERY row
// with no filter, and the wall polls every 30 seconds onto a projector in the
// hall. Anyone the gift link was forwarded to could put arbitrary text on the
// screen at somebody's wedding — and `gifts` had an owner SELECT policy and
// nothing else, so there was no path anywhere in the product to take it down.
//
//   node qa/giftWallSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5605';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pggift-'));

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

  psql(`
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, name text, gift_token text
    );
    create table public.gifts (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references public.events(id) on delete cascade,
      donor_name text not null, amount integer not null, message text,
      paid boolean not null default false,
      created_at timestamptz not null default now()
    );
    alter table public.gifts enable row level security;
    alter table public.gifts force row level security;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant select on public.gifts to authenticated;
    -- The owner policies below read public.events, so the caller needs SELECT on
    -- it. Production has exactly this (events: users read own); omitting it made
    -- the first run of this harness die on "permission denied for table events",
    -- which is a gap in the fixture, not in the migration.
    alter table public.events enable row level security;
    grant select on public.events to authenticated;
    create policy "events: users read own" on public.events for select to authenticated
      using (user_id = auth.uid());
    create policy "gifts_owner_select" on public.gifts for select to authenticated
      using (exists (select 1 from public.events e where e.id = gifts.event_id and e.user_id = auth.uid()));
  `);

  const EV = psql(`insert into public.events (user_id, name, gift_token)
                   values ('${HOST_ID}', 'החתונה של דנה ויוסי', 'gifttok11') returning id;`);
  const EV2 = psql(`insert into public.events (user_id, name, gift_token)
                    values ('${OTHER_ID}', 'בר המצווה', 'othertok11') returning id;`);

  psql(`insert into public.gifts (event_id, donor_name, amount, message) values
    ('${EV}', 'משפחת כהן', 50000, 'מזל טוב!'),
    ('${EV}', 'טרול', 500, 'טקסט שאסור שיופיע על המקרן'),
    ('${EV2}', 'סבתא מרים', 30000, 'בהצלחה');`);

  psql(readFileSync(new URL('../supabase/migrations/20260818000300_gift_wall_moderation.sql', import.meta.url), 'utf8'));

  const wall = (tok = 'gifttok11') => psql(`select public.gift_wall_by_token('${tok}')::text`);
  const asUser = (who, sql) =>
    `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${who}'; ${sql} commit;`;
  const trollId = () => psql(`select id from public.gifts where donor_name = 'טרול'`);

  console.log('── before moderating, the wall shows everything (the premise)');
  ok(wall().includes('טרול'), 'the offending blessing is on the wall');
  ok(wall().includes('משפחת כהן'), 'and so is the real one');

  console.log('\n── the host takes it down');
  {
    const err = psqlMayFail(asUser(HOST_ID, `update public.gifts set hidden = true where id = '${trollId()}';`));
    ok(err === null, 'the host may hide a blessing on their own event', (err || '').split('\n')[0].slice(0, 60));
    ok(!wall().includes('טרול'), 'and it leaves the wall');
    ok(wall().includes('משפחת כהן'), 'while the rest of the wall is untouched');
  }

  console.log('\n── but the host keeps the record');
  {
    const n = psql(`begin; set local role authenticated; set local "request.jwt.claim.sub" = '${HOST_ID}';
                    select count(*) from public.gifts where event_id = '${EV}'; commit;`);
    ok(n === '2', 'both rows still readable by the host — hiding is not deleting', n);
  }

  console.log('\n── and it is reversible mid-party');
  {
    psqlMayFail(asUser(HOST_ID, `update public.gifts set hidden = false where id = '${trollId()}';`));
    ok(wall().includes('טרול'), 'unhiding puts it back');
    psqlMayFail(asUser(HOST_ID, `update public.gifts set hidden = true where id = '${trollId()}';`));
  }

  console.log('\n── another host cannot touch it');
  {
    psqlMayFail(asUser(OTHER_ID, `update public.gifts set hidden = true where event_id = '${EV}';`));
    ok(wall().includes('משפחת כהן'), 'a stranger cannot hide blessings on my wall');

    psqlMayFail(asUser(OTHER_ID, `delete from public.gifts where event_id = '${EV}';`));
    const n = psql(`select count(*) from public.gifts where event_id = '${EV}'`);
    ok(n === '2', 'nor delete them', n);
  }

  console.log('\n── nor can a host move a blessing onto somebody else\'s wall');
  {
    // WITH CHECK, not just USING: without it the owner of EV could rewrite
    // event_id and post onto EV2's projector.
    //
    // MEASURED HONESTLY, because a mutation setting `with check (true)` still
    // came out refused: `gifts_owner_select` already blocks the move on its
    // own, so this assertion cannot tell the two apart. The explicit WITH CHECK
    // stays anyway — a guarantee that depends on a sibling policy nobody
    // remembers is a guarantee that disappears the day that policy is edited —
    // but this check is NOT what is holding the line, and saying otherwise
    // would be the kind of claim this project measures rather than argues.
    const err = psqlMayFail(asUser(HOST_ID, `update public.gifts set event_id = '${EV2}' where id = '${trollId()}';`));
    ok(err !== null, 'refused', (err || '').replace(/\s+/g,' ').slice(0, 200));
    ok(!wall('othertok11').includes('טרול'), 'and the other wall is clean');
  }

  console.log('\n── deleting outright still works for the owner');
  {
    const err = psqlMayFail(asUser(HOST_ID, `delete from public.gifts where id = '${trollId()}';`));
    ok(err === null, 'the host may remove a blessing entirely', (err || '').split('\n')[0].slice(0, 60));
    ok(psql(`select count(*) from public.gifts where event_id = '${EV}'`) === '1', 'and it is gone');
  }

  console.log('\n── anon is not given any of this');
  {
    const e1 = psqlMayFail(`begin; set local role anon; update public.gifts set hidden = true; commit;`);
    ok(e1 !== null, 'anon cannot hide');
    const e2 = psqlMayFail(`begin; set local role anon; delete from public.gifts; commit;`);
    ok(e2 !== null, 'anon cannot delete');
  }

  console.log('\n── and a wrong token still gets nothing');
  ok(psql(`select coalesce(public.gift_wall_by_token('nosuchtok')::text, 'NULL')`) === 'NULL', 'unknown token');
  ok(psql(`select coalesce(public.gift_wall_by_token('short')::text, 'NULL')`) === 'NULL', 'token under 8 chars');
} finally {
  stop();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
