// The retention SQL, driven against a real Postgres 16 with the REAL events
// table — the DDL is extracted from supabase/setup_full.sql at run time rather
// than restated here.
//
// That is not pedantry. The last Postgres reproduction in this repo created
// `public.events` with only `id` and `user_id`, and the bug under investigation
// SURVIVED it: with no `name` column on the inner table, the unqualified `name`
// in the policy resolved outward to storage.objects.name — the intended column
// — and the write was accepted. The stub passed for precisely the reason
// production failed. Fidelity decided the answer.
//
// Writing this file already caught one defect the same way: `events.date` is
// TEXT, not a date, and the app writes '' for an event with no date set.
// `''::date` RAISES, and one such row would abort the scan and silently disable
// retention for every account.
//
// Usage: pg_ctl a cluster, then
//   PGPORT=5599 PGHOST=/tmp node qa/photoRetentionSql.mjs
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const HOST = process.env.PGHOST || '/tmp';
const PORT = process.env.PGPORT || '5599';
const DB   = process.env.PGDATABASE || 'retention';

const psql = (sql, { db = DB } = {}) =>
  execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' }).trim();

const psqlMayFail = (sql) => {
  try { return { ok: true, out: psql(sql) }; }
  catch (e) { return { ok: false, out: (e.stderr || e.stdout || String(e)).trim() }; }
};

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// ── Rebuild the world from the real sources ──────────────────────────────────
const ddl = readFileSync('supabase/setup_full.sql', 'utf8')
  .match(/^CREATE TABLE public\.events \([\s\S]*?^\);/m)[0];

psql(`drop database if exists ${DB}`, { db: 'postgres' });
psql(`create database ${DB}`, { db: 'postgres' });
psql(`
  create extension if not exists pgcrypto;
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  create table public.profiles (id uuid primary key);
  ${ddl}
  insert into public.profiles (id) values ('11111111-1111-1111-1111-111111111111');
`);
const MIG = 'supabase/migrations/20260817000000_photo_retention.sql';
execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', MIG]);

const OWNER = '11111111-1111-1111-1111-111111111111';
const U = (n) => `https://x.supabase.co/storage/v1/object/public/event-site/e/${n}.webp`;

// Dates are expressed RELATIVE to the function's own notion of today, so the
// suite does not rot and does not depend on the machine's clock matching the
// timezone the retention window is anchored to.
const today = psql(`select public.photo_retention_today()`);
const rel   = (days) => psql(`select (public.photo_retention_today() + ${days})::text`);

// The id comes back from the INSERT rather than being hand-built. A first
// version formatted it from a counter and produced a 33-character "uuid" at the
// tenth event — a bug in the harness, which is the cheaper kind, but the kind
// that has previously been reported here as a bug in the code.
function makeEvent({ date, site = {}, announcements = null, name = 'החתונה של דנה' }) {
  const payload = { updatedAt: 1000, eventSite: site, ...(announcements ? { announcements } : {}) };
  return psql(`insert into public.events (user_id, name, date, payload, version)
        values ('${OWNER}', ${lit(name)}, ${date === null ? 'null' : lit(date)},
                ${lit(JSON.stringify(payload))}::jsonb, 1)
        returning id::text`);
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const due = (limit = 200) =>
  psql(`select event_id::text || ' :: ' || array_to_string(urls, ',') from public.photo_purge_due(${limit}) order by 1`)
    .split('\n').filter(Boolean);
const dueIds = () => new Set(due().map(r => r.split(' :: ')[0]));

console.log(`Postgres says today is ${today} (Asia/Jerusalem)\n`);

// ── What is due ──────────────────────────────────────────────────────────────
console.log('── the window: the two halves must agree, not merely each be plausible');
//
// This is the check the feature actually needed. The client draws the countdown
// from src/utils/photoRetention.js and the server decides the deletion here, in
// SQL, over a TEXT column, in a different timezone, with different arithmetic.
// Asserting a boundary separately on each side proves only that each is
// self-consistent — and they were: the client called day 30 the purge day while
// the server waited for day 31, so the banner would have read "התמונות נמחקות
// היום" over photos that were still there, for every host, every time.
//
// So both are run over the same dates and compared.
{
  const days = [-40, -32, -31, -30, -29, -28, -1, 0, 5];
  const ids = Object.fromEntries(days.map(d =>
    [d, makeEvent({ date: rel(d), site: { coverPhoto: U(`w${d}`), gallery: [] } })]));
  const server = dueIds();

  // The client's own module, imported — not a restatement of its rule.
  const { photoRetentionState } = await import('../src/utils/photoRetention.js');
  const [ty, tm, td] = today.split('-').map(Number);
  const nowLocal = new Date(ty, tm - 1, td, 12, 0, 0);

  for (const d of days) {
    const ev = { date: rel(d), eventSite: { coverPhoto: U(`w${d}`), gallery: [] } };
    const client = photoRetentionState(ev, nowLocal).state === 'due';
    const srv    = server.has(ids[d]);
    ok(client === srv, `day ${String(d).padStart(3)}: client and server agree`,
       `client ${client ? 'due' : 'safe'} / server ${srv ? 'due' : 'safe'}`);
  }

  ok(server.has(ids[-30]),  'exactly 30 days past IS due — "30 days after the event" means day 30');
  ok(!server.has(ids[-29]), '29 days past is not due');
  ok(!server.has(ids[5]),   'an event still in the future is not due');
}

console.log('\n── which photos it finds');
{
  const withAll = makeEvent({
    date: rel(-40),
    site: { coverPhoto: U('cover2'), gallery: [U('ga'), U('gb')] },
    announcements: { saveTheDate: { photo: U('inv') }, invitation: { photo: U('inv2') } },
  });
  const row  = due().find(r => r.startsWith(withAll));
  const urls = row.split(' :: ')[1].split(',');
  ok(urls.includes(U('cover2')), 'the cover');
  ok(urls.includes(U('ga')) && urls.includes(U('gb')), 'every gallery photo');
  // The invitation is the largest object an event holds. Missing it would clear
  // the payload, report the event purged, and strand the heaviest file with its
  // only reference deleted.
  ok(urls.includes(U('inv')) && urls.includes(U('inv2')), 'both invitation photos under announcements');
  ok(urls.length === 5, 'and nothing else', `${urls.length} urls`);
}

console.log('\n── what must never be due');
{
  const noDate    = makeEvent({ date: '',   site: { coverPhoto: U('nd'), gallery: [] } });
  const nullDate  = makeEvent({ date: null, site: { coverPhoto: U('nn'), gallery: [] } });
  const badDate   = makeEvent({ date: '01/06/2020', site: { coverPhoto: U('bd'), gallery: [] } });
  const base64    = makeEvent({ date: rel(-99), site: { coverPhoto: 'data:image/webp;base64,UklGR', gallery: ['data:image/jpeg;base64,/9j/'] } });
  const noPhotos  = makeEvent({ date: rel(-99), site: { coverPhoto: null, gallery: [] } });
  const emptySite = makeEvent({ date: rel(-99), site: {} });

  const s = dueIds();
  // THE ONE THAT WOULD TAKE THE WHOLE FEATURE DOWN. `''::date` raises, and an
  // exception inside this scan aborts the batch — one such row on any account
  // disables retention for every account, with nothing but a failed cron run.
  ok(!s.has(noDate),   "an event with date='' is not due, and does not raise");
  ok(!s.has(nullDate), 'a null date is not due');
  ok(!s.has(badDate),  'a date in the wrong format is not due');
  // A legacy base64 photo has no object behind it. Reporting this event as
  // having work would finalize it and clear photos that cost nothing.
  ok(!s.has(base64),   'an event holding only base64 photos is not due');
  ok(!s.has(noPhotos), 'an event with no photos is not due');
  ok(!s.has(emptySite),'an event with an empty eventSite is not due');
}

console.log('\n── postponement');
{
  const keptFuture = makeEvent({ date: rel(-99), site: { coverPhoto: U('kf'), gallery: [], photosKeepUntil: rel(10) } });
  const keptToday  = makeEvent({ date: rel(-99), site: { coverPhoto: U('kt'), gallery: [], photosKeepUntil: today } });
  const keptPast   = makeEvent({ date: rel(-99), site: { coverPhoto: U('kp'), gallery: [], photosKeepUntil: rel(-1) } });
  const keptGarbage= makeEvent({ date: rel(-99), site: { coverPhoto: U('kg'), gallery: [], photosKeepUntil: 'לא תאריך' } });
  const keptNull   = makeEvent({ date: rel(-99), site: { coverPhoto: U('kn'), gallery: [], photosKeepUntil: null } });

  const s = dueIds();
  ok(!s.has(keptFuture), 'a live postponement holds the photos');
  // `photosKeepUntil` is the new PURGE date, the same way `eventDate + 30` is
  // the original one — so the day it names is the day it happens, on both
  // sides. Reading it as "protected through this day" here and as a purge date
  // in the client is the same off-by-one the window check above exists for.
  ok(s.has(keptToday),   'the day a postponement names is the day it purges');
  ok(s.has(keptPast),    'a lapsed postponement stops protecting');
  // A malformed value must be IGNORED, not honoured and not fatal. Honouring it
  // would let any client disable retention on an event by writing junk.
  ok(s.has(keptGarbage), 'an unparseable postponement is ignored, not honoured', 'and does not raise');
  ok(s.has(keptNull),    'a null postponement is ignored');
}

console.log('\n── batch_limit');
ok(due(2).length === 2, 'bounds a run so a backlog cannot time out forever', `asked 2, got ${due(2).length}`);

// ── Applying the result ──────────────────────────────────────────────────────
console.log('\n── finalize');
{
  const id = makeEvent({
    date: rel(-40),
    site: { coverPhoto: U('fc'), gallery: [U('f1'), U('f2')], theme: 'blush', photosKeepUntil: rel(-1) },
    announcements: { saveTheDate: { photo: U('fi'), title: 'שמרו את התאריך' }, invitation: { photo: U('fi2'), title: 'הזמנה' } },
  });
  const before = JSON.parse(psql(`select row_to_json(t) from (select version, payload from public.events where id='${id}') t`));
  psql(`select public.photo_purge_finalize('${id}')`);
  const after = JSON.parse(psql(`select row_to_json(t) from (select version, payload, updated_at from public.events where id='${id}') t`));

  ok(after.payload.eventSite.coverPhoto === null, 'the cover is cleared');
  ok(Array.isArray(after.payload.eventSite.gallery) && after.payload.eventSite.gallery.length === 0, 'the gallery is emptied');
  ok(after.payload.announcements.saveTheDate.photo === null &&
     after.payload.announcements.invitation.photo === null, 'every announcement photo is cleared');
  // Clearing the photo must not clear the announcement. The host's copy stays.
  ok(after.payload.announcements.saveTheDate.title === 'שמרו את התאריך', 'the announcement itself survives');
  ok(after.payload.eventSite.theme === 'blush', 'the rest of eventSite survives');
  ok(typeof after.payload.eventSite.photosPurgedAt === 'string', 'it stamps when it happened',
     String(after.payload.eventSite.photosPurgedAt));
  ok(after.payload.eventSite.photosKeepUntil === null, 'a spent postponement is cleared');
  ok(after.version === before.version + 1, 'the version is bumped so an open tab conflicts and re-pulls',
     `${before.version} → ${after.version}`);

  // THE ONE THAT DECIDES WHETHER ANY OF THIS STICKS.
  //
  // mapCloudEventToLocalEvent reads `updatedAt` out of the PAYLOAD, and
  // mergeCloudWithLocal hands the whole `eventSite` object to whichever side's
  // updatedAt is newer. Bump only the column and a host with an older local
  // copy wins the merge and pushes the deleted URLs straight back — photos
  // gone, event pointing at them forever.
  ok(after.payload.updatedAt > before.payload.updatedAt,
     "the PAYLOAD's updatedAt is bumped, not just the column",
     `${before.payload.updatedAt} → ${after.payload.updatedAt}`);
  ok(after.payload.updatedAt > 1.7e12 && after.payload.updatedAt < 2.1e12,
     'and it is milliseconds, the unit the client compares in', String(after.payload.updatedAt));

  ok(!dueIds().has(id), 'the event is no longer due');

  // Idempotent: the Edge Function can die between removing objects and
  // finalizing, and the next run has to be able to finish the job.
  const v = JSON.parse(psql(`select row_to_json(t) from (select version from public.events where id='${id}') t`)).version;
  psql(`select public.photo_purge_finalize('${id}')`);
  const v2 = JSON.parse(psql(`select row_to_json(t) from (select version from public.events where id='${id}') t`)).version;
  ok(v2 === v + 1, 'finalizing twice is harmless');

  ok(psqlMayFail(`select public.photo_purge_finalize('99999999-9999-9999-9999-999999999999')`).ok,
     'finalizing an event that no longer exists does not raise');
}

console.log('\n── an event with no announcements at all');
{
  const id = makeEvent({ date: rel(-40), site: { coverPhoto: U('na'), gallery: [] } });
  const r = psqlMayFail(`select public.photo_purge_finalize('${id}')`);
  ok(r.ok, 'finalize handles a payload with no announcements key', r.ok ? '' : r.out.split('\n')[0]);
  const after = JSON.parse(psql(`select payload from public.events where id='${id}'`));
  ok(after.announcements === undefined, 'and does not invent one');
}

// ── Reachability ─────────────────────────────────────────────────────────────
//
// Both functions are SECURITY DEFINER. photo_purge_due reads across every
// account's payload and photo_purge_finalize deletes fields without checking
// ownership, so a stray grant is a cross-tenant read and a cross-tenant wipe.
console.log('\n── who can call these');
for (const role of ['anon', 'authenticated']) {
  for (const fn of [`public.photo_purge_due(1)`, `public.photo_purge_finalize('${OWNER}')`]) {
    const r = psqlMayFail(`set local role ${role}; select ${fn}`);
    ok(!r.ok && /permission denied/i.test(r.out), `${role} cannot call ${fn.split('(')[0]}`,
       r.ok ? 'IT SUCCEEDED' : '');
  }
}
{
  const r = psqlMayFail(`set local role service_role; select public.photo_purge_due(1)`);
  ok(r.ok, 'service_role can', r.ok ? '' : r.out.split('\n')[0]);
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
