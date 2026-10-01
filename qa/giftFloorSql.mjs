// The ₪50 gift minimum, on the server (WORKPLAN י2, 28.9). Real Postgres.
//
// The premise is loaded from the migrations as shipped: 20260728000000's
// function and CHECK accept ₪5. Then 20260928000800 must refuse it, in the
// function AND in the table.
//
//   node qa/giftFloorSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync, spawn } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5612';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pggift-'));
let fails = 0;
const ok = (c, what, detail = '') => { if (!c) fails++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`); };
const args = ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1'];
const psql = (sql) => execFileSync('psql', [...args, '-c', sql], { encoding: 'utf8' }).trim();
const tryPsql = (sql) => { const r = spawnSync('psql', [...args, '-c', sql], { encoding: 'utf8' }); return r.status === 0 ? null : r.stderr.trim(); };
const asPostgres = (cmd) => execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
const mig = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
// Many requests AT ONCE, each its own connection — what a hall of phones does.
const par = (sqls) => Promise.all(sqls.map(sql => new Promise(res => {
  const c = spawn('psql', [...args, '-c', sql]); let err = '';
  c.stderr.on('data', d => { err += d; }); c.on('close', code => res(code === 0 ? null : err));
})));
const give = (agorot, msg = 'מזל טוב') => tryPsql(`select public.submit_gift_by_token('gifttok11', 'משפחת כהן', ${agorot}, '${msg}')`);

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);
  psql(`
    create role anon nologin; create role authenticated nologin;
    create table public.events (id uuid primary key default gen_random_uuid(), gift_token text);
    create table public.gifts (id uuid primary key default gen_random_uuid(), event_id uuid, donor_name text,
      amount bigint, message text, paid boolean default false, created_at timestamptz default now());
    insert into public.events (gift_token) values ('gifttok11');
  `);
  // The premise, exactly as 20260728000000 shipped it: its function and its CHECK.
  const old = mig('20260728000000_public_write_hardening.sql');
  const fn = old.slice(old.indexOf('create or replace function public.submit_gift_by_token'));
  psql(fn.slice(0, fn.indexOf('end; $$;') + 'end; $$;'.length));
  psql(`alter table public.gifts add constraint ck_gift_amount_range check (amount between 500 and 10000000);`);

  console.log('── the premise: ₪5 went through');
  ok(give(500) === null, 'the old function accepted ₪5');
  ok(psql(`select count(*) from public.gifts where amount = 500`) === '1', 'and the old CHECK stored it');

  psql(mig('20260928000800_gift_floor_server.sql'));

  console.log('\n── after the migration');
  ok(/amount out of range/.test(give(500) || ''), 'the function refuses ₪5');
  ok(/amount out of range/.test(give(4999) || ''), 'and ₪49.99');
  ok(give(5000) === null, '₪50 exactly is accepted');
  ok(/ck_gift_amount_range/.test(tryPsql(`insert into public.gifts (event_id, donor_name, amount) select id, 'x', 500 from public.events`) || ''),
     'the table itself refuses ₪5 on a direct insert');
  ok(psql(`select count(*) from public.gifts where amount = 500`) === '1', 'the existing ₪5 row is kept (NOT VALID), not deleted');
  give(10000, 'א'.repeat(1000));
  ok(psql(`select max(char_length(message)) from public.gifts`) === '600', 'a 1,000-character message is cut to 600');

  psql(mig('20260928000900_gift_rate_limit.sql'));
  console.log('\n── double taps and bursts (20260928000900)');
  psql(`delete from public.gifts`);
  give(36000, 'לחיים');
  give(36000, 'לחיים');
  ok(psql(`select count(*) from public.gifts`) === '1', 'the same declaration twice is stored once');
  give(36000, 'לחיים!!');
  ok(psql(`select count(*) from public.gifts`) === '2', 'a different message is a different gift');
  psql(`insert into public.gifts (event_id, donor_name, amount, created_at)
        select e.id, 'x' || i, 5000, now() from public.events e, generate_series(1, 57) i`);   // + the 2 above = 59
  ok(give(5000, 'עוד אחד') === null, 'the 60th in a minute is accepted');
  ok(/rate limited/.test(give(5000, 'ועוד') || ''), 'the 61st is refused');
  psql(`update public.gifts set created_at = now() - interval '2 minutes'`);
  ok(give(5000, 'אחרי דקה') === null, 'a minute later it is open again');

  // ── The 29.9 review, premises first — on 20260928000900 as shipped ──────────
  console.log('\n── the review\'s premises (20260928000900 as shipped)');
  psql(`delete from public.gifts`);
  give(36000, '');
  give(36000, '');
  ok(psql(`select count(*) from public.gifts`) === '1',
     'premise: two families both called "משפחת כהן", ₪360, no message — one row', psql(`select count(*) from public.gifts`));
  psql(`insert into public.gifts (event_id, donor_name, amount) select id, 'ישן', 5000 from public.events`);
  psql(`alter table public.gifts drop constraint ck_gift_amount_range;
        insert into public.gifts (event_id, donor_name, amount, message) select id, 'פוגעני', 500, 'x' from public.events;
        alter table public.gifts add constraint ck_gift_amount_range check (amount >= 5000 and amount <= 10000000) not valid;`);
  ok(/ck_gift_amount_range/.test(tryPsql(`update public.gifts set paid = false where amount = 500`) || ''),
     'premise: an old ₪5 row cannot be updated (hidden) under the NOT VALID ₪50 CHECK');

  psql(`alter table public.gifts add column if not exists hidden boolean default false`);
  psql(mig('20260929000000_review_gift_door_fixes.sql'));
  console.log('\n── after 20260929000000');
  ok(tryPsql(`update public.gifts set hidden = true where amount = 500`) === null, 'the host can hide an old ₪5 gift again');
  ok(/amount out of range/.test(give(4999) || ''), 'a guest still cannot declare under ₪50');
  ok(/ck_gift_amount_range/.test(tryPsql(`insert into public.gifts (event_id, donor_name, amount) select id, 'x', 499 from public.events`) || ''),
     'the table still refuses under ₪5 on a direct insert');

  psql(`delete from public.gifts`);
  const k = (name, key, msg = '') => `select public.submit_gift_by_token('gifttok11', '${name}', 36000, '${msg}', ${key ? `'${key}'` : 'null'})`;
  psql(k('משפחת כהן', 'form-a')); psql(k('משפחת כהן', 'form-b'));
  ok(psql(`select count(*) from public.gifts`) === '2', 'two families with the same name and amount, two forms — two gifts');
  psql(k('משפחת כהן', 'form-a'));
  ok(psql(`select count(*) from public.gifts`) === '2', 'the same form sent again (a double tap, a retry) — still two');
  ok(/name required/.test(tryPsql(`select public.submit_gift_by_token('gifttok11', E'\n\t ', 36000, '', 'k-blank')`) || ''),
     'a name of only whitespace is refused (trim() took spaces only)');

  psql(`delete from public.gifts`);
  // Each request holds its transaction open a moment, so they truly overlap —
  // separate psql processes alone barely do, and a check that never overlaps
  // proves nothing about a lock (its first version passed with the lock removed).
  const held = sql => `begin; ${sql}; select pg_sleep(0.05); commit;`;
  const errs8 = await par(Array.from({ length: 8 }, () => held(k('משפחת לוי', 'same-form'))));
  ok(psql(`select count(*) from public.gifts`) === '1', '8 copies of one form AT ONCE — one row', psql(`select count(*) from public.gifts`));
  ok(errs8.every(e => e === null), '— and every copy was told it worked (no unique-key error)',
     errs8.filter(Boolean)[0]?.split('\n')[0] || '');
  psql(`delete from public.gifts`);
  await par(Array.from({ length: 70 }, (_, i) => held(k('אורח ' + i, 'f' + i))));
  ok(psql(`select count(*) from public.gifts`) === '60', '70 different gifts AT ONCE — exactly the 60-a-minute limit',
     psql(`select count(*) from public.gifts`));
  psql(`delete from public.gifts`);
  psql(`select public.submit_gift_by_token('gifttok11', 'משפחת כהן', 36000, '')`);
  psql(`select public.submit_gift_by_token('gifttok11', 'משפחת כהן', 36000, '')`);
  ok(psql(`select count(*) from public.gifts`) === '1', 'a page without a key (cached before the change) keeps the name guard');
  psql(`update public.gifts set created_at = now() - interval '61 seconds'`);
  psql(`select public.submit_gift_by_token('gifttok11', 'משפחת כהן', 36000, '')`);
  ok(psql(`select count(*) from public.gifts`) === '2', '— for 60 seconds, not 10 minutes');
  ok(psql(`select has_function_privilege('anon', 'public.submit_gift_by_token(text,text,bigint,text,text)', 'execute')`) === 't',
     'a guest (anon) can call the keyed form');
} finally {
  spawnSync('su', ['postgres', '-c', `${PGBIN}/pg_ctl -D ${DIR} -m immediate stop`]);
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
