import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

// Event type MUST be the Hebrew string constants.js stores — an English key
// now falls through to the generic list, which is exactly the bug under test.
const SEED = () => {
  const ev = {
    id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
    brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן, רחובות',
    startTime: '19:00',
    guests: [
      { id: 'g1', name: 'טל שוורץ', side: 'bride', group: 'משפחה', count: 2, phone: '0501234567', rsvp: 'confirmed', companions: ['רונית'] },
      { id: 'g2', name: 'רון לוי',  side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
      { id: 'g3', name: 'שרה כהן',  side: 'bride', group: 'עבודה', count: 3, phone: '', rsvp: 'declined' },
      { id: 'g4', name: 'דני מזרחי', side: 'groom', group: 'חברים', count: 1, phone: '0541234567', rsvp: 'confirmed', arrived: true },
    ],
    tables: [
      { id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular', shape: 'round' },
      { id: 't2', name: 'שולחן 2', capacity: 8,  type: 'vip',     shape: 'rect'  },
    ],
    seating: { g1: 't1', g4: 't1' },
    constraints: [], tasks: [], vendors: [],
    tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
    cloudId: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
  localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [ev], activeEventId: 'e1' }));
};

const ROUTES = [
  // ── customer: marketing + auth ────────────────────────────────────────
  ['/',                        'דף נחיתה'],
  ['/pricing',                 'מחירים'],
  ['/login',                   'כניסה'],
  ['/signup',                  'הרשמה'],
  ['/reset-password',          'איפוס סיסמה'],
  ['/account',                 'החשבון שלי'],
  ['/help',                    'עזרה'],
  ['/privacy',                 'פרטיות'],
  ['/terms',                   'תנאי שימוש'],
  ['/accessibility',           'נגישות'],
  ['/nope-404',                '404'],
  // ── customer: the event workspace ─────────────────────────────────────
  ['/app',                     'דשבורד'],
  ['/events/e1/setup',         'הגדרת אירוע'],
  ['/events/e1/tables',        'שולחנות'],
  ['/events/e1/guests',        'אורחים'],
  ['/events/e1/constraints',   'אילוצים'],
  ['/events/e1/seating',       'הושבה'],
  ['/events/e1/site',          'אתר האירוע'],
  ['/events/e1/rsvps',         'אישורי הגעה'],
  ['/events/e1/collab',        'טבלה שיתופית'],
  ['/events/e1/costs',         'תקציב'],
  ['/events/e1/tasks',         'משימות'],
  ['/events/e1/announce',      'עורך ההזמנות'],
  ['/events/e1/vendors',       'ספקים'],
  ['/events/e1/messages',      'רצף הודעות'],
  ['/events/e1/nametags',      'כרטיסי שם'],
  ['/events/e1/checkin',       'צ׳ק-אין בכניסה'],
  ['/events/e1/preview-site',  'תצוגת אתר'],
  ['/events/e1/preview-announce/saveTheDate', 'תצוגה Save the Date'],
  ['/events/e1/preview-announce/invitation',  'תצוגת הזמנה'],
  // ── public guest-facing pages (no backend here → expect a graceful state)
  ['/rsvp/r1',                 'RSVP ציבורי'],
  ['/invite/i1',               'אתר האירוע הציבורי'],
  ['/card/i1',                 'כרטיס אורח'],
  ['/album/al1',               'אלבום'],
  ['/save-the-date/i1',        'Save the Date ציבורי'],
  ['/invitation/i1',           'הזמנה ציבורית'],
  ['/gift/gi1',                'מתנות'],
  ['/gift/gi1/wall',           'קיר ברכות'],
  ['/hostess/h1',              'דיילת'],
  ['/collab/c1',               'שיתוף ציבורי'],
  // ── admin subtree ─────────────────────────────────────────────────────
  ['/admin/login',             'אדמין — כניסה'],
  ['/admin/dashboard',         'אדמין — דשבורד'],
  ['/admin/users',             'אדמין — משתמשים'],
  ['/admin/events',            'אדמין — אירועים'],
  ['/admin/templates',         'אדמין — תבניות'],
  ['/admin/subscriptions',     'אדמין — מנויים'],
  ['/admin/activity',          'אדמין — פעילות'],
  ['/admin/settings',          'אדמין — הגדרות'],
];

const A11Y = () => {
  const out = { noName: [], imgNoAlt: [], inputNoLabel: [], dupIds: [] };
  const txt = el => (el.getAttribute('aria-label') || el.getAttribute('title') ||
    (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
    el.textContent || '').trim();
  document.querySelectorAll('button, a[href], [role=button]').forEach(el => {
    if (!txt(el) && !el.querySelector('img[alt]:not([alt=""])'))
      out.noName.push((el.tagName + '.' + (el.className || '').toString().split(' ')[0]).slice(0, 50));
  });
  document.querySelectorAll('img').forEach(el => { if (!el.hasAttribute('alt')) out.imgNoAlt.push(el.src.slice(-30)); });
  document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea').forEach(el => {
    if (!(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('placeholder')))
      out.inputNoLabel.push((el.tagName + '.' + (el.className || '').split(' ')[0]).slice(0, 50));
  });
  const seen = new Set();
  document.querySelectorAll('[id]').forEach(el => { if (seen.has(el.id)) out.dupIds.push(el.id); seen.add(el.id); });
  return out;
};

const allErrs = [];
for (const [w, h, label] of [[390, 844, 'mobile 390'], [1280, 900, 'desktop 1280']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 140)));
  p.on('console', m => {
    if (m.type() === 'error' && !/CERT|ERR_|favicon|Failed to load resource|net::/i.test(m.text()))
      errs.push(m.text().slice(0, 140));
  });

  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(SEED);

  console.log(`\n═══ ${label} ═══`);
  let bad = 0;
  for (const [route, name] of ROUTES) {
    const before = errs.length;
    await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(w === 390 ? 1100 : 900);

    const text = await p.evaluate(() => document.body.innerText.trim());
    // scrollWidth is unreliable: an internally-scrollable element inflates it
    // on every ancestor even when clipped. What a user feels is whether the
    // page actually scrolls sideways.
    const overflow = await p.evaluate(() => {
      const b4 = window.scrollX;
      window.scrollTo(9999, 0);
      const moved = Math.abs(window.scrollX - b4);
      window.scrollTo(b4, 0);
      return moved;
    });
    const a11y = await p.evaluate(A11Y);
    const issues = [];
    if (text.length < 12) issues.push('EMPTY');
    if (overflow > 2) issues.push(`overflow ${overflow}px`);
    for (const [k, v] of Object.entries(a11y)) if (v.length) issues.push(`${k}:${v.length}(${v.slice(0, 2).join(',')})`);
    const newErrs = errs.slice(before);
    if (newErrs.length) issues.push('JS:' + newErrs.length);
    if (issues.length) { bad++; console.log(`  ✗ ${name.padEnd(26)} ${route.padEnd(38)} ${issues.join(' · ')}`); }
  }
  console.log(bad === 0 ? `  ✓ all ${ROUTES.length} routes clean` : `  ${bad}/${ROUTES.length} route(s) with findings`);
  allErrs.push(...errs);
  await p.close();
}

const uniq = [...new Set(allErrs)];
console.log('\n═══ JS errors (unique) ═══');
console.log(uniq.length ? uniq.slice(0, 15).map(e => '  • ' + e).join('\n') : '  none');
await b.close();
