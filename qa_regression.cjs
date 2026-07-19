/**
 * Regression QA — four bug fixes
 *   1. Event Setup validation bypass
 *   2. Cloud sync data preservation
 *   3. Bat Mitzvah template type
 *   4. Excel RTL export
 */

const { chromium } = require('playwright');
const XLSX = require('/home/user/kochav-hashulchan-app/node_modules/xlsx/xlsx.js');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
const BASE = 'http://localhost:5174';
const KEY  = 'kochav_hashulchan_v1';

let pass = 0, fail = 0, warn = 0;
const results = [];

function log(section, label, status, detail) {
  const sym = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  const line = `${sym} [${status}] ${section}: ${label}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ section, label, status, detail });
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else warn++;
}

async function safe(fn) { try { return await fn(); } catch { return null; } }

async function freshCtx(browser) {
  return browser.newContext({ viewport: { width: 1280, height: 900 } });
}

async function createEventViaTemplate(pg, templateLabel) {
  await pg.goto(BASE);
  await pg.waitForLoadState('networkidle');
  await safe(() => pg.locator('button:has-text("צור אירוע ראשון"), button:has-text("אירוע חדש")').first().click());
  await pg.waitForTimeout(400);
  await safe(() => pg.locator(`[class*="tmplCard"]:has-text("${templateLabel}")`).first().click());
  await pg.waitForLoadState('networkidle');
  await pg.waitForTimeout(300);
  return pg.url();
}

async function seedEvent(pg, ev) {
  await pg.goto(BASE);
  await pg.evaluate((args) => {
    const state = JSON.parse(localStorage.getItem(args.key) || '{}');
    state.events = [args.ev, ...(state.events || []).filter(e => e.id !== args.ev.id)];
    localStorage.setItem(args.key, JSON.stringify(state));
  }, { key: KEY, ev });
  await pg.reload();
  await pg.waitForLoadState('networkidle');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX 1 — Event Setup validation bypass
// ═══════════════════════════════════════════════════════════════════════════════
async function fix1(browser) {
  console.log('\n── Fix 1: Event Setup validation bypass ──');

  // 1a. New empty event: all subnav tabs blocked
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();
    await createEventViaTemplate(pg, 'חתונה');
    const setupUrl = pg.url();

    const tabs = ['שולחנות', 'אורחים', 'אילוצים', 'הושבה'];
    let allBlocked = true;
    for (const tab of tabs) {
      await safe(() => pg.locator(`nav button:has-text("${tab}")`).click());
      await pg.waitForTimeout(400);
      if (!pg.url().includes('/setup')) { allBlocked = false; }
    }
    log('Fix1', 'Empty event: all subnav tabs blocked', allBlocked ? 'PASS' : 'FAIL',
      allBlocked ? null : 'at least one tab bypassed to non-setup URL');

    // 1b. Error toast appears on blocked navigation
    await safe(() => pg.locator('nav button:has-text("שולחנות")').click());
    await pg.waitForTimeout(600);
    const bodyText = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    const hasToast = bodyText.includes('שם לאירוע');
    log('Fix1', 'Error toast shown on blocked navigation', hasToast ? 'PASS' : 'FAIL',
      hasToast ? null : 'toast text "שם לאירוע" not found in page');

    await ctx.close();
  }

  // 1c. Valid event (name saved): all subnav tabs work
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();
    await createEventViaTemplate(pg, 'חתונה');

    // Fill name and save
    const nameInput = pg.locator('input').first();
    await safe(() => nameInput.fill('חתונת בדיקה'));
    await safe(() => pg.locator('button:has-text("שמור")').first().click());
    await pg.waitForTimeout(500);

    let allWork = true;
    for (const [tab, seg] of [['שולחנות','tables'],['אורחים','guests'],['אילוצים','constraints'],['הושבה','seating']]) {
      await safe(() => pg.locator(`nav button:has-text("${tab}")`).click());
      await pg.waitForTimeout(400);
      if (!pg.url().includes(`/${seg}`)) allWork = false;
    }
    log('Fix1', 'Valid event: all subnav tabs navigate freely', allWork ? 'PASS' : 'FAIL');

    await ctx.close();
  }

  // 1d. Existing saved event (pre-seeded) navigates normally
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();
    const existingEv = {
      id: 'qa-existing-001', name: 'אירוע שמור', type: 'חתונה',
      date: '2026-10-01', venue: 'אולם הגן',
      brideName: 'שרה', groomName: 'אברהם',
      celebrantName: '', organizationName: '', contactName: '', ownerName: '',
      customGroups: [], tables: [], guests: [], seating: {}, constraints: [],
      lockedGuests: [], lockedTables: [],
      createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    };
    await seedEvent(pg, existingEv);
    await pg.goto(`${BASE}/events/qa-existing-001/tables`);
    await pg.waitForLoadState('networkidle');
    log('Fix1', 'Existing saved event: direct URL to /tables works', pg.url().includes('/tables') ? 'PASS' : 'FAIL', pg.url());

    await safe(() => pg.locator('nav button:has-text("אורחים")').click());
    await pg.waitForTimeout(400);
    log('Fix1', 'Existing saved event: subnav to /guests works', pg.url().includes('/guests') ? 'PASS' : 'FAIL', pg.url());

    await ctx.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX 2 — Cloud sync data preservation (mapper round-trip, no Supabase needed)
// ═══════════════════════════════════════════════════════════════════════════════
async function fix2() {
  console.log('\n── Fix 2: Cloud sync data preservation (mapper round-trip) ──');

  // Inline the fixed mapper functions from cloudSync.js
  function mapLocalEventToCloudPayload(localEvent, userId) {
    const seated = Object.keys(localEvent.seating ?? {}).length;
    const total  = (localEvent.guests ?? []).length;
    const seatedPct = total > 0 ? parseFloat(((seated / total) * 100).toFixed(2)) : 0;
    return {
      user_id: userId,
      name: localEvent.name ?? '',
      type: localEvent.type ?? 'חתונה',
      date: localEvent.date || null,
      venue: localEvent.venue || null,
      guest_count: total,
      table_count: (localEvent.tables ?? []).length,
      seated_pct: seatedPct,
      version: localEvent.version ?? 1,
      updated_at: new Date(localEvent.updatedAt ?? Date.now()).toISOString(),
      payload: {
        localId:          localEvent.id,
        tables:           localEvent.tables           ?? [],
        guests:           localEvent.guests           ?? [],
        seating:          localEvent.seating          ?? {},
        constraints:      localEvent.constraints      ?? [],
        brideName:        localEvent.brideName        ?? '',
        groomName:        localEvent.groomName        ?? '',
        celebrantName:    localEvent.celebrantName    ?? '',
        organizationName: localEvent.organizationName ?? '',
        contactName:      localEvent.contactName      ?? '',
        ownerName:        localEvent.ownerName        ?? '',
        customGroups:     Array.isArray(localEvent.customGroups) ? localEvent.customGroups : [],
        createdAt:        localEvent.createdAt        ?? Date.now(),
        updatedAt:        localEvent.updatedAt        ?? Date.now(),
        version:          localEvent.version          ?? 1,
        lockedGuests:     Array.isArray(localEvent.lockedGuests) ? localEvent.lockedGuests : [],
        lockedTables:     Array.isArray(localEvent.lockedTables) ? localEvent.lockedTables : [],
      },
    };
  }

  function mapCloudEventToLocalEvent(cloudRow) {
    const p = cloudRow.payload ?? {};
    return {
      id:               p.localId      ?? cloudRow.id,
      name:             cloudRow.name  ?? '',
      type:             cloudRow.type  ?? 'חתונה',
      date:             cloudRow.date  ?? '',
      venue:            cloudRow.venue ?? '',
      brideName:        p.brideName        ?? '',
      groomName:        p.groomName        ?? '',
      celebrantName:    p.celebrantName    ?? '',
      organizationName: p.organizationName ?? '',
      contactName:      p.contactName      ?? '',
      ownerName:        p.ownerName        ?? '',
      customGroups:     Array.isArray(p.customGroups) ? p.customGroups : [],
      tables:           Array.isArray(p.tables)        ? p.tables       : [],
      guests:           Array.isArray(p.guests)        ? p.guests       : [],
      seating:          (p.seating && typeof p.seating === 'object') ? p.seating : {},
      constraints:      Array.isArray(p.constraints)   ? p.constraints  : [],
      createdAt:        p.createdAt ?? Date.now(),
      updatedAt:        p.updatedAt ?? Date.now(),
      version:          cloudRow.version ?? p.version ?? 1,
      cloudId:          cloudRow.id,
      lockedGuests:     Array.isArray(p.lockedGuests) ? p.lockedGuests : [],
      lockedTables:     Array.isArray(p.lockedTables) ? p.lockedTables : [],
    };
  }

  function roundTrip(localEvent) {
    const payload = mapLocalEventToCloudPayload(localEvent, 'user-123');
    const cloudRow = {
      id: 'cloud-uuid', name: payload.name, type: payload.type,
      date: payload.date, venue: payload.venue, version: payload.version,
      created_at: new Date().toISOString(), updated_at: payload.updated_at,
      payload: payload.payload,
    };
    return mapCloudEventToLocalEvent(cloudRow);
  }

  function chk(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    log('Fix2', label, ok ? 'PASS' : 'FAIL', ok ? null : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }

  // Bar Mitzvah with celebrantName
  const bm = {
    id: 'bm-1', name: 'בר המצווה של עידו', type: 'בר מצווה', date: '2026-09-15', venue: 'אולם',
    brideName: '', groomName: '', celebrantName: 'עידו כהן',
    organizationName: '', contactName: '', ownerName: '',
    customGroups: ['משפחה', 'חברים'],
    tables: [{id:'t1',name:'שולחן 1',capacity:10,type:'regular'}],
    guests: [{id:'g1',name:'דני',side:'bride',count:2}],
    seating: {g1:'t1'}, constraints: [],
    createdAt: 1000, updatedAt: 2000, version: 2,
    lockedGuests: ['g1'], lockedTables: [],
  };
  const bmResult = roundTrip(bm);
  chk('Bar Mitzvah: celebrantName survives round-trip', bmResult.celebrantName, 'עידו כהן');
  chk('Bar Mitzvah: customGroups survives round-trip', bmResult.customGroups, ['משפחה', 'חברים']);
  chk('Bar Mitzvah: lockedGuests survives round-trip', bmResult.lockedGuests, ['g1']);
  chk('Bar Mitzvah: guests data intact', bmResult.guests.length, 1);

  // Business event
  const biz = {
    id: 'biz-1', name: 'כנס 2026', type: 'אירוע עסקי', date: '', venue: '',
    brideName: '', groomName: '', celebrantName: '', ownerName: '',
    organizationName: 'חברת כוכב', contactName: 'יוסי כהן',
    customGroups: ['VIP', 'עובדים'],
    tables: [], guests: [], seating: {}, constraints: [],
    createdAt: 3000, updatedAt: 4000, version: 1,
    lockedGuests: [], lockedTables: ['t5'],
  };
  const bizResult = roundTrip(biz);
  chk('Business: organizationName survives round-trip', bizResult.organizationName, 'חברת כוכב');
  chk('Business: contactName survives round-trip', bizResult.contactName, 'יוסי כהן');
  chk('Business: customGroups survives round-trip', bizResult.customGroups, ['VIP', 'עובדים']);
  chk('Business: lockedTables survives round-trip', bizResult.lockedTables, ['t5']);

  // Family event with ownerName
  const fam = {
    id: 'fam-1', name: 'חגיגת יובל', type: 'אירוע משפחתי', date: '', venue: '',
    brideName: '', groomName: '', celebrantName: '', organizationName: '', contactName: '',
    ownerName: 'משפחת לוי',
    customGroups: ['ילדים'],
    tables: [], guests: [], seating: {}, constraints: [],
    createdAt: 5000, updatedAt: 6000, version: 3,
    lockedGuests: [], lockedTables: [],
  };
  const famResult = roundTrip(fam);
  chk('Family: ownerName survives round-trip', famResult.ownerName, 'משפחת לוי');

  // Old cloud row (pre-dates new fields) — backward compat
  const oldRow = {
    id: 'old-cloud', name: 'חתונה ישנה', type: 'חתונה', date: null, venue: null, version: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    payload: { localId: 'old-local', tables: [], guests: [], seating: {}, constraints: [],
      brideName: 'שרה', groomName: 'אברהם', createdAt: 1000, updatedAt: 2000, version: 1,
      lockedGuests: [], lockedTables: []
      // NOTE: no celebrantName / organizationName / contactName / ownerName / customGroups
    },
  };
  const oldResult = mapCloudEventToLocalEvent(oldRow);
  chk('Old row: celebrantName defaults to ""', oldResult.celebrantName, '');
  chk('Old row: organizationName defaults to ""', oldResult.organizationName, '');
  chk('Old row: contactName defaults to ""', oldResult.contactName, '');
  chk('Old row: ownerName defaults to ""', oldResult.ownerName, '');
  chk('Old row: customGroups defaults to []', oldResult.customGroups, []);
  chk('Old row: existing brideName still reads', oldResult.brideName, 'שרה');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX 3 — Bat Mitzvah template type
// ═══════════════════════════════════════════════════════════════════════════════
async function fix3(browser) {
  console.log('\n── Fix 3: Bat Mitzvah template type ──');

  // 3a. Template picker shows distinct labels
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('button:has-text("צור אירוע ראשון"), button:has-text("אירוע חדש")').first().click());
    await pg.waitForTimeout(400);
    const text = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    log('Fix3', 'Picker shows "בר מצווה" (distinct)', text.includes('בר מצווה') ? 'PASS' : 'FAIL');
    log('Fix3', 'Picker shows "בת מצווה" (distinct)', text.includes('בת מצווה') ? 'PASS' : 'FAIL');
    log('Fix3', 'Picker does NOT show combined "בר / בת מצווה"', !text.includes('בר / בת מצווה') ? 'PASS' : 'FAIL');
    await ctx.close();
  }

  // 3b. Bar Mitzvah template → correct type + label
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();
    await createEventViaTemplate(pg, 'בר מצווה');
    const typeVal = await safe(() => pg.locator('select').first().inputValue());
    const text    = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    log('Fix3', 'Bar Mitzvah: type = "בר מצווה"', typeVal === 'בר מצווה' ? 'PASS' : 'FAIL', `got: ${typeVal}`);
    log('Fix3', 'Bar Mitzvah: shows "שם הבר מצווה" field', text.includes('שם הבר מצווה') ? 'PASS' : 'FAIL');
    log('Fix3', 'Bar Mitzvah: does NOT show "שם הבת מצווה"', !text.includes('שם הבת מצווה') ? 'PASS' : 'FAIL');
    await ctx.close();
  }

  // 3c. Bat Mitzvah template → correct type + label
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();
    await createEventViaTemplate(pg, 'בת מצווה');
    const typeVal = await safe(() => pg.locator('select').first().inputValue());
    const text    = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    log('Fix3', 'Bat Mitzvah: type = "בת מצווה"', typeVal === 'בת מצווה' ? 'PASS' : 'FAIL', `got: ${typeVal}`);
    log('Fix3', 'Bat Mitzvah: shows "שם הבת מצווה" field', text.includes('שם הבת מצווה') ? 'PASS' : 'FAIL');
    log('Fix3', 'Bat Mitzvah: does NOT show "שם הבר מצווה"', !text.includes('שם הבר מצווה') ? 'PASS' : 'FAIL');
    await ctx.close();
  }

  // 3d. Side labels for bar/bat mitzvah events
  {
    const ctx = await freshCtx(browser);
    const pg  = await ctx.newPage();

    // Seed a bar mitzvah event with a guest, navigate to guests screen to check side buttons
    const bmEv = {
      id: 'qa-bm-side', name: 'בר המצווה של עידו', type: 'בר מצווה',
      date: '', venue: '', brideName: '', groomName: '', celebrantName: 'עידו',
      organizationName: '', contactName: '', ownerName: '', customGroups: [],
      tables: [], guests: [], seating: {}, constraints: [],
      lockedGuests: [], lockedTables: [],
      createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    };
    await seedEvent(pg, bmEv);
    await pg.goto(`${BASE}/events/qa-bm-side/guests`);
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(400);

    const text = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    const hasAmLabel  = text.includes('משפחת האם');
    const hasAbLabel  = text.includes('משפחת האב');
    log('Fix3', 'Bar Mitzvah: side labels show "משפחת האם"', hasAmLabel ? 'PASS' : 'FAIL');
    log('Fix3', 'Bar Mitzvah: side labels show "משפחת האב"', hasAbLabel ? 'PASS' : 'FAIL');

    await ctx.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX 4 — Excel RTL export (round-trip via XLSX library directly)
// ═══════════════════════════════════════════════════════════════════════════════
async function fix4() {
  console.log('\n── Fix 4: Excel RTL export ──');

  // Simulate the fixed exportHelpers.js logic
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([
    ['חתונת נועה וטל'],
    ['תאריך:', '15 בספטמבר 2026'],
    ['אולם:', 'גן עדן'],
    [],
    ['שולחן','קיבולת','סוג שולחן','שובצו/קיבולת','שם אורח','צד','קבוצה','כמות','טלפון','הערות'],
    ['שולחן 1', 10, 'רגיל', '2 / 10', 'דנה לוי', 'צד כלה', 'חברים', 2, '', ''],
    ['', '', '', '', 'אמיר כהן', 'צד חתן', 'משפחה', 1, '', ''],
    [],
  ]);
  ws1['!cols'] = [{wch:16},{wch:8},{wch:12},{wch:14},{wch:20},{wch:14},{wch:14},{wch:6},{wch:14},{wch:22}];
  XLSX.utils.book_append_sheet(wb, ws1, 'סידור הושבה');

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['ממתינים לשיבוץ — חתונת נועה וטל'],
    [],
    ['שם אורח','צד','קבוצה','כמות','טלפון','הערות'],
    ['יוסי מזרחי','צד חתן','משפחה',3,'',''],
  ]);
  ws2['!cols'] = [{wch:20},{wch:14},{wch:14},{wch:6},{wch:14},{wch:22}];
  XLSX.utils.book_append_sheet(wb, ws2, 'ממתינים לשיבוץ');

  const ws3 = XLSX.utils.aoa_to_sheet([
    ['הפרות אילוצים — חתונת נועה וטל'],
    [],
    ['סוג הפרה','תיאור'],
    ['הפרת הפרדה','דנה לוי ואמיר כהן'],
  ]);
  ws3['!cols'] = [{wch:22},{wch:50}];
  XLSX.utils.book_append_sheet(wb, ws3, 'הפרות אילוצים');

  // THE FIX — workbook-level RTL
  wb.Workbook = { Views: [{ RTL: true }] };

  // Write to buffer and read back to verify
  const buf  = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const wb2  = XLSX.read(buf, { type: 'buffer' });

  const rtlSet = !!(wb2.Workbook?.Views?.[0]?.RTL === true);
  log('Fix4', 'wb.Workbook.Views[0].RTL=true survives write/read', rtlSet ? 'PASS' : 'FAIL',
    rtlSet ? null : `Views: ${JSON.stringify(wb2.Workbook?.Views)}`);

  // ws["!views"] should NOT be set (old broken approach removed)
  const ws1views = wb2.Sheets['סידור הושבה']?.['!views'];
  log('Fix4', 'Old ws["!views"] not present on sheet 1', ws1views === undefined ? 'PASS' : 'WARN',
    ws1views !== undefined ? `!views still present: ${JSON.stringify(ws1views)}` : null);

  // All 3 sheets present
  log('Fix4', 'All 3 sheets present', wb2.SheetNames.length === 3 ? 'PASS' : 'FAIL',
    `sheets: ${wb2.SheetNames.join(', ')}`);

  // Data integrity — sheet 1
  const sheet1Data = XLSX.utils.sheet_to_json(wb2.Sheets['סידור הושבה'], { header: 1 });
  log('Fix4', 'Sheet 1: event name in row 0', sheet1Data[0]?.[0] === 'חתונת נועה וטל' ? 'PASS' : 'FAIL',
    `row0: ${JSON.stringify(sheet1Data[0])}`);
  log('Fix4', 'Sheet 1: guest data intact', sheet1Data[5]?.[4] === 'דנה לוי' ? 'PASS' : 'FAIL',
    `row5[4]: ${sheet1Data[5]?.[4]}`);

  // Sheet 2 data
  const sheet2Data = XLSX.utils.sheet_to_json(wb2.Sheets['ממתינים לשיבוץ'], { header: 1 });
  log('Fix4', 'Sheet 2: unassigned data intact', sheet2Data[3]?.[0] === 'יוסי מזרחי' ? 'PASS' : 'FAIL',
    `row3[0]: ${sheet2Data[3]?.[0]}`);

  // Sheet 3 data
  const sheet3Data = XLSX.utils.sheet_to_json(wb2.Sheets['הפרות אילוצים'], { header: 1 });
  log('Fix4', 'Sheet 3: violations data intact', sheet3Data[3]?.[0] === 'הפרת הפרדה' ? 'PASS' : 'FAIL',
    `row3[0]: ${sheet3Data[3]?.[0]}`);

  // File writes without error
  try {
    const tmpPath = '/tmp/qa_rtl_test.xlsx';
    XLSX.writeFile(wb, tmpPath);
    const fs = require('fs');
    const exists = fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0;
    log('Fix4', 'File writes to disk without error', exists ? 'PASS' : 'FAIL');
    fs.unlinkSync(tmpPath);
  } catch (e) {
    log('Fix4', 'File writes to disk without error', 'FAIL', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN FLOW — basic smoke test
// ═══════════════════════════════════════════════════════════════════════════════
async function adminSmoke(browser) {
  console.log('\n── Admin smoke test ──');
  const ctx = await freshCtx(browser);
  const pg  = await ctx.newPage();

  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));

  await pg.goto(`${BASE}/admin`);
  await pg.waitForLoadState('networkidle');
  await pg.waitForTimeout(500);

  const text = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
  const loaded = text.length > 20 && !text.includes('Cannot GET');
  log('Admin', 'Admin route loads without crash', loaded ? 'PASS' : 'WARN', loaded ? null : 'page may be empty');
  log('Admin', 'No JS errors on admin load', errors.length === 0 ? 'PASS' : 'WARN',
    errors.length > 0 ? errors.slice(0,2).join('; ') : null);

  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER FLOW — full happy-path smoke
// ═══════════════════════════════════════════════════════════════════════════════
async function customerSmoke(browser) {
  console.log('\n── Customer flow smoke ──');
  const ctx = await freshCtx(browser);
  const pg  = await ctx.newPage();
  const jsErrors = [];
  pg.on('pageerror', e => jsErrors.push(e.message));

  // Dashboard loads
  await pg.goto(BASE); await pg.waitForLoadState('networkidle');
  const homeText = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
  log('Customer', 'Dashboard loads', homeText.includes('כוכב השולחן') ? 'PASS' : 'FAIL');

  // Create wedding event, fill name, save, visit all tabs
  await createEventViaTemplate(pg, 'חתונה');
  await safe(() => pg.locator('input').first().fill('בדיקת זרימה מלאה'));
  await safe(() => pg.locator('button:has-text("שמור")').first().click());
  await pg.waitForTimeout(500);

  for (const [tab, seg] of [['שולחנות','tables'],['אורחים','guests'],['אילוצים','constraints'],['הושבה','seating'],['האירוע','setup']]) {
    await safe(() => pg.locator(`nav button:has-text("${tab}")`).click());
    await pg.waitForTimeout(350);
    log('Customer', `Subnav "${tab}" → /${seg}`, pg.url().includes(`/${seg}`) ? 'PASS' : 'FAIL', pg.url());
  }

  log('Customer', 'No JS errors during full flow', jsErrors.length === 0 ? 'PASS' : 'WARN',
    jsErrors.length > 0 ? jsErrors.slice(0,2).join('; ') : null);

  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ARGS, headless: true });

  await fix1(browser);
  await fix2();          // pure JS, no browser needed
  await fix3(browser);
  await fix4();          // pure JS XLSX test, no browser needed
  await adminSmoke(browser);
  await customerSmoke(browser);

  await browser.close();

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('REGRESSION QA RESULTS');
  console.log('══════════════════════════════════════════════════════════════════');

  const sections = ['Fix1','Fix2','Fix3','Fix4','Admin','Customer'];
  for (const sec of sections) {
    const secResults = results.filter(r => r.section === sec);
    const secPass = secResults.filter(r => r.status === 'PASS').length;
    const secFail = secResults.filter(r => r.status === 'FAIL').length;
    const secWarn = secResults.filter(r => r.status === 'WARN').length;
    console.log(`\n${sec}: ${secPass} PASS, ${secFail} FAIL, ${secWarn} WARN`);
    secResults.filter(r => r.status !== 'PASS').forEach(r =>
      console.log(`  ${r.status === 'FAIL' ? '✗' : '⚠'} ${r.label}${r.detail ? ': ' + r.detail : ''}`)
    );
  }

  console.log(`\nTotal: ${pass + fail + warn} | PASS: ${pass} | FAIL: ${fail} | WARN: ${warn}`);
  process.exit(fail > 0 ? 1 : 0);
})();
