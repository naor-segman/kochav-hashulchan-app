// What `public_event_by_token` actually hands an anonymous token holder.
//
// THE LEAK: 20260728000000 gated the sibling tokens per token type — so a
// leaked album QR could not also unlock RSVP — and left `bit_phone` and
// `paybox_link` OUTSIDE that CASE. Every token type got them, `album` and
// `hostess` included, and the album QR is designed to be photographed off a
// table in the hall by strangers.
//
// Nothing ever rendered them: GiftScreen deliberately has no Bit/PayBox route
// (11.8 decision), so this is a field that everything received and nothing
// displayed.
//
// Run against a real Postgres, because the question "what keys come back for
// token type X" is answered by the function, not by reading it.
//
//   node qa/publicEventRpcSql.mjs      (starts and stops its own cluster)
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PGBIN = '/usr/lib/postgresql/16/bin';
const PORT  = process.env.PGPORT || '5604';
const HOST  = process.env.PGHOST || '/tmp';
const DIR   = mkdtempSync(join(tmpdir(), 'pgrpc-'));

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

const BIT    = '0501234567';
const PAYBOX = 'https://payboxapp.page.link/SECRET';

try {
  execFileSync('chown', ['-R', 'postgres:postgres', DIR]);
  asPostgres(`${PGBIN}/initdb -D ${DIR} -U postgres -A trust`);
  asPostgres(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -k ${HOST} -c listen_addresses=" -l ${join(DIR, 'log')} -w start`);

  psql(`
    create table public.events (
      id uuid primary key default gen_random_uuid(),
      name text, type text, date text, venue text,
      rsvp_token text, invite_token text, gift_token text, hostess_token text,
      payload jsonb
    );
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    insert into public.events (name, type, date, venue, rsvp_token, invite_token, gift_token, hostess_token, payload)
    values ('החתונה של דנה ויוסי', 'חתונה', '2027-06-01', 'אולמי הגן',
            'rsvptok1', 'invitetok1', 'gifttok11', 'hostesstok1',
            jsonb_build_object(
              'brideName','דנה', 'groomName','יוסי',
              'giftBitPhone','${BIT}', 'giftPayboxLink','${PAYBOX}',
              'albumToken','albumtok11',
              'eventSite', jsonb_build_object('enabled', true, 'themeKey','rose',
                             'contactPhone','0529998877', 'rsvpMessage','כיף שאתם באים',
                             'shuttles', jsonb_build_array(jsonb_build_object('id','s1','from','תל אביב')),
                             'sections', jsonb_build_object('gift', true, 'shuttles', true)),
              'announcements', jsonb_build_object('invitation', jsonb_build_object('enabled', true, 'title','הזמנה'))
            ));
  `);

  psql(readFileSync(new URL('../supabase/migrations/20260818000200_drop_payment_fields_from_public_event.sql', import.meta.url), 'utf8'));
  psql(readFileSync(new URL('../supabase/migrations/20260928000400_album_link_on_site.sql', import.meta.url), 'utf8'));
  psql(readFileSync(new URL('../supabase/migrations/20260928000500_public_event_per_page.sql', import.meta.url), 'utf8'));

  const call = (type, tok) =>
    psql(`select coalesce(public.public_event_by_token('${type}', '${tok}')::text, 'NULL')`);

  const TOKENS = [
    ['rsvp', 'rsvptok1'], ['invite', 'invitetok1'], ['gift', 'gifttok11'],
    ['hostess', 'hostesstok1'], ['album', 'albumtok11'],
  ];

  console.log('── no token type receives the host\'s payment details');
  for (const [type, tok] of TOKENS) {
    const out = call(type, tok);
    ok(!out.includes(BIT) && !out.includes('payboxapp'), `${type.padEnd(8)} — no Bit, no PayBox`,
       out.includes(BIT) ? 'BIT PHONE LEAKED' : (out.includes('payboxapp') ? 'PAYBOX LEAKED' : ''));
  }

  console.log('\n── and every page still gets what it needs');
  {
    const invite = call('invite', 'invitetok1');
    ok(invite.includes('דנה') && invite.includes('אולמי הגן'), 'the invite page has the couple and the venue');
    ok(invite.includes('rsvptok1') && invite.includes('gifttok11'),
       'the invite page is still the hub and carries its onward links');

    const album = call('album', 'albumtok11');
    ok(!album.includes('rsvptok1') && !album.includes('gifttok11'),
       'the album token still unlocks nothing else — the earlier gating survived');
    ok(album.includes('דנה'), 'but the album page still knows whose wedding it is');
  }

  console.log('\n── the album link reaches the site, and only the site (WORKPLAN פ)');
  {
    ok(call('invite', 'invitetok1').includes('albumtok11'), 'the event site receives the album token');
    for (const [type, tok] of TOKENS.filter(([t]) => t !== 'invite')) {
      // The key exists for every type; only the site gets a VALUE in it.
      const out = call(type, tok);
      ok(!/"album_token": "/.test(out), `${type.padEnd(8)} — no album token handed out`);
    }
  }

  console.log('\n── each page gets what it renders (20260928000500)');
  {
    const PHONE = '0529998877';
    ok(call('invite', 'invitetok1').includes(PHONE), 'the site (invite) still has the contact phone');
    for (const [type, tok] of TOKENS.filter(([t]) => t !== 'invite')) {
      ok(!call(type, tok).includes(PHONE), `${type.padEnd(8)} — no contact phone`);
    }
    for (const [type, tok] of [['gift', 'gifttok11'], ['album', 'albumtok11'], ['hostess', 'hostesstok1']]) {
      ok(/"site": null/.test(call(type, tok)), `${type.padEnd(8)} — no site at all`);
      ok(!call(type, tok).includes('"invitation"'), `${type.padEnd(8)} — no announcements`);
    }
    const rsvp = call('rsvp', 'rsvptok1');
    ok(rsvp.includes('כיף שאתם באים') && rsvp.includes('תל אביב'), 'rsvp — its message and shuttles');
    ok(rsvp.includes('gifttok11'), 'rsvp — the gift link (ט2)');
    ok(call('invite', 'invitetok1').includes('"invitation"'), 'invite — the published announcement');

    psql(`update public.events set payload = jsonb_set(payload, '{eventSite,enabled}', 'false')`);
    const rsvpDraft = call('rsvp', 'rsvptok1');
    ok(rsvpDraft.includes('כיף שאתם באים') && rsvpDraft.includes('תל אביב'),
       'rsvp — settings survive an UNPUBLISHED site (they were dropped)');
    ok(/"site": null/.test(call('invite', 'invitetok1')), 'invite — an unpublished site is still not served');
    psql(`update public.events set payload = jsonb_set(payload, '{eventSite,enabled}', 'true')`);
  }

  console.log('\n── and a wrong token still gets nothing');
  {
    ok(call('album', 'rsvptok1') === 'NULL', 'a token of the wrong type resolves to nothing');
    ok(call('rsvp', 'short') === 'NULL', 'a token under 8 characters is refused');
  }

  console.log('\n── the host\'s own copy is untouched');
  {
    const raw = psql(`select payload->>'giftBitPhone' from public.events limit 1`);
    ok(raw === BIT, 'the value still lives in events.payload', raw);
  }
} finally {
  stop();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
