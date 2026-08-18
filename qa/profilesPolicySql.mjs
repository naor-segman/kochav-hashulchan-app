// The profiles UPDATE policy, driven against a real Postgres with real RLS.
//
// THE HOLE it closes: `profiles: users update own` pinned only `id` and `role`
// in its WITH CHECK. `stripe_customer_id` (UNIQUE) and `email` were added later
// with no policy of their own, so a signed-in user could rewrite either from the
// browser — and create-billing-portal hands stripe_customer_id straight to
// Stripe as the customer whose portal to open. That is somebody else's invoices,
// card last-4 and cancel button.
//
// Reading the policy text is not enough here: `is not distinct from` against a
// subquery on the SAME row being updated is exactly the kind of SQL that looks
// right and behaves differently, and RLS WITH CHECK sees the NEW row. So this
// runs the real statements as a non-superuser with RLS forced.
//
// Usage:
//   node qa/profilesPolicySql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5601';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pgprof-'));

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const psql = (sql, { db = 'postgres' } = {}) =>
  execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db,
                        '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();

/** Run SQL that is EXPECTED to be refused; returns the error text or null. */
const psqlMayFail = (sql, { db = 'postgres' } = {}) => {
  const r = spawnSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db,
                               '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  return r.status === 0 ? null : (r.stderr || '').trim();
};

function stop() {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`], { encoding: 'utf8' });
  rmSync(DIR, { recursive: true, force: true });
}

// initdb and the postmaster refuse to run as root, so both go through `su
// postgres`. The socket directory has to be writable by that user too.
const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });

try {
  // chown, not chmod: initdb refuses a data directory it does not own.
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);

  // ── The minimum of the real schema this policy touches ────────────────────
  // Deliberately the REAL column set and the REAL policy text, lifted from the
  // migration rather than restated: a stub that omits a column is how a policy
  // bug survived a Postgres reproduction in this repo before.
  psql(`
    create schema if not exists auth;
    create table public.profiles (
      id uuid primary key,
      email text,
      full_name text,
      role text not null default 'user',
      stripe_customer_id text unique,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create role app_user nologin;
    grant usage on schema public to app_user;
    grant select, update on public.profiles to app_user;
    alter table public.profiles enable row level security;
    alter table public.profiles force row level security;
  `);


  // auth.uid() stands in for Supabase's, reading a session GUC.
  psql(`
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to app_user;
  `);
  // The SELECT policy from 20260524000000. Omitting it made the first run of
  // this harness report five failures against a correct migration: with RLS on
  // and no read policy the row is invisible, so `UPDATE … WHERE id = …` matches
  // nothing, silently — no error, no change, which looks exactly like "the
  // write was refused" AND exactly like "the write was allowed but did nothing".
  psql(`
    create policy "profiles: users read own" on public.profiles
      for select using (id = auth.uid());
  `);

  const migration = readFileSync(
    new URL('../supabase/migrations/20260818000000_profiles_pin_billing_columns.sql', import.meta.url),
    'utf8',
  );
  psql(migration);

  const ME     = '11111111-1111-1111-1111-111111111111';
  const VICTIM = '22222222-2222-2222-2222-222222222222';
  psql(`
    insert into public.profiles (id, email, full_name, role, stripe_customer_id) values
      ('${ME}',     'me@example.com',     'דנה כהן',  'user',  'cus_MINE'),
      ('${VICTIM}', 'victim@example.com', 'רון לוי',  'user',  'cus_VICTIM');
  `);

  /** Run a statement as the signed-in user `who`. */
  const asUser = (who, sql) =>
    `set local role app_user; set local "request.jwt.claim.sub" = '${who}'; ${sql}`;
  const tx = (body) => `begin; ${body} commit;`;

  console.log('── the attack the policy exists to stop');
  {
    const err = psqlMayFail(tx(asUser(ME,
      `update public.profiles set stripe_customer_id = 'cus_VICTIM_2' where id = '${ME}';`)));
    ok(err !== null, 'cannot rewrite my own stripe_customer_id', (err || '').split('\n')[0].slice(0, 70));
    const still = psql(`select stripe_customer_id from public.profiles where id = '${ME}'`);
    ok(still === 'cus_MINE', 'and the stored value is untouched', still);
  }

  console.log('\n── the adjacent ones');
  {
    const e1 = psqlMayFail(tx(asUser(ME, `update public.profiles set email = 'attacker@example.com' where id = '${ME}';`)));
    ok(e1 !== null, 'cannot rewrite my own email (it seeds the Stripe customer)');

    const e2 = psqlMayFail(tx(asUser(ME, `update public.profiles set role = 'admin' where id = '${ME}';`)));
    ok(e2 !== null, 'still cannot promote myself to admin');

    const e3 = psqlMayFail(tx(asUser(ME, `update public.profiles set full_name = 'x' where id = '${VICTIM}';`)));
    ok(e3 !== null || psql(`select full_name from public.profiles where id = '${VICTIM}'`) === 'רון לוי',
       'still cannot touch another user\'s row');
  }

  console.log('\n── and the ordinary edit a user is supposed to make');
  {
    const err = psqlMayFail(tx(asUser(ME, `update public.profiles set full_name = 'דנה כהן-לוי' where id = '${ME}';`)));
    ok(err === null, 'can still rename myself', (err || '').split('\n')[0].slice(0, 70));
    ok(psql(`select full_name from public.profiles where id = '${ME}'`) === 'דנה כהן-לוי', 'and it stuck');
  }
  {
    // A no-op write of the same value must pass, or every UPDATE that happens to
    // include the column in its SET list breaks.
    const err = psqlMayFail(tx(asUser(ME,
      `update public.profiles set stripe_customer_id = 'cus_MINE', full_name = 'דנה' where id = '${ME}';`)));
    ok(err === null, 'writing the SAME billing id back is allowed', (err || '').split('\n')[0].slice(0, 70));
  }
  {
    // NULL is the state EVERY row is in before its first checkout — which today
    // is every row, because billing is off.
    psql(`update public.profiles set stripe_customer_id = null where id = '${VICTIM}'`);

    const err = psqlMayFail(tx(asUser(VICTIM,
      `update public.profiles set stripe_customer_id = 'cus_STOLEN' where id = '${VICTIM}';`)));
    ok(err !== null, 'a NULL billing id cannot be filled in by the user either',
       (err || '').split('\n')[0].slice(0, 70));

    // And the other half, which is what `is not distinct from` is actually for.
    // With a plain `=`, the check on an untouched NULL column evaluates
    // `NULL = NULL` → NULL → refused, so a user who has never paid could not
    // edit their profile AT ALL. A mutation swapping the operator survived
    // until this case existed, because the only rename tested until then was by
    // a user who happened to have a billing id.
    const err2 = psqlMayFail(tx(asUser(VICTIM,
      `update public.profiles set full_name = 'רון לוי-כהן' where id = '${VICTIM}';`)));
    ok(err2 === null, 'a user who has never paid can still rename themselves',
       (err2 || '').split('\n')[0].slice(0, 70));
    ok(psql(`select full_name from public.profiles where id = '${VICTIM}'`) === 'רון לוי-כהן',
       'and it stuck');
  }

  console.log('\n── the service role, which is what legitimately sets these');
  {
    psql(`update public.profiles set stripe_customer_id = 'cus_SET_BY_WEBHOOK' where id = '${VICTIM}'`);
    ok(psql(`select stripe_customer_id from public.profiles where id = '${VICTIM}'`) === 'cus_SET_BY_WEBHOOK',
       'the Edge Functions can still write it');
  }
} finally {
  stop();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
