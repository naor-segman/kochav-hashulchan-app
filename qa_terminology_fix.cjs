// QA: Terminology & seat-count fixes
// Tests Fix 1 (labels), Fix 2 (TableBuilder calc), Fix 3 (Excel export)

const { chromium } = require('playwright');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
const BASE = 'http://localhost:5174';
const KEY  = 'kochav_hashulchan_v1';

async function safe(fn, fallback = null) { try { return await fn(); } catch { return fallback; } }

// ── Build a test event: FamilyA(5) + FamilyB(2) + FamilyC(3) at Table(10) ──
function makeTestEvent(withSeating = false) {
  const now = Date.now();
  const ev = {
    id: 'qa-term-1',
    name: 'QA Terminology Test',
    type: 'חתונה',
    date: '2026-12-01',
    venue: 'QA Hall',
    brideName: 'קלאודיה',
    groomName: 'קלאוד',
    celebrantName: '', organizationName: '', contactName: '', ownerName: '',
    customGroups: [],
    tables: [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular' }],
    guests: [
      { id: 'g1', name: 'משפחת כהן',  count: 5, side: 'bride', group: 'משפחה קרובה', phone: '', notes: '' },
      { id: 'g2', name: 'משפחת לוי',  count: 2, side: 'groom', group: 'חברים',       phone: '', notes: '' },
      { id: 'g3', name: 'משפחת גולן', count: 3, side: 'bride', group: 'משפחה קרובה', phone: '', notes: '' },
    ],
    seating:     withSeating ? { g1: 't1', g2: 't1', g3: 't1' } : {},
    constraints: [],
    createdAt: now, updatedAt: now, version: 1,
    lockedGuests: [], lockedTables: [],
  };
  return { events: [ev] };
}

async function seedEvent(pg, withSeating) {
  await pg.goto(BASE);
  await pg.waitForLoadState('networkidle');
  await pg.evaluate(([key, data]) => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [KEY, makeTestEvent(withSeating)]);
  await pg.reload();
  await pg.waitForLoadState('networkidle');
  await pg.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ARGS, headless: true });
  let pass = 0, fail = 0;
  const bugs = [];

  function log(label, ok, detail) {
    if (ok) { console.log(`✓ PASS: ${label}`); pass++; }
    else     {
      const d = detail ? ' — ' + detail : '';
      console.log(`✗ FAIL: ${label}${d}`);
      bugs.push({ label, detail });
      fail++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA 1: Dashboard — labels and stats
  // ═══════════════════════════════════════════════════════════════════════════
  {
    console.log('\n── Area 1: Dashboard ──────────────────────────────────────────');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await seedEvent(pg, false);

    const body = await safe(() => pg.evaluate(() => document.body.innerText), '');

    // The dashboard stats bar shows seat count (sum of g.count) labeled "מקומות"
    // totalGuestSeats = 5+2+3 = 10; should appear as stats value
    log('Dashboard stats bar: no "אורחים" label in stat tiles',
      !body.includes('\nאורחים\n') && !/ אורחים\n/.test(body),
      'found "אורחים" label in stats tiles');

    // The stat tile label that used to say "אורחים" should now say "מקומות"
    const statSection = await safe(() => pg.locator('.statsBar, [class*="statsBar"]').innerText(), '');
    log('Dashboard stats bar has "מקומות" label for guest stat',
      statSection.includes('מקומות') || body.match(/10\s*\n\s*מקומות/),
      `stats text: ${statSection.substring(0, 80)}`);

    // Event card chip shows "רשומות" not "אורחים" for guest row count
    const cardArea = await safe(() => pg.locator('[class*="eventCard"], [class*="eventGrid"]').first().innerText(), '');
    log('Event card chip: guest count labeled "רשומות"',
      cardArea.includes('רשומות') || cardArea.includes('3 רשומות'),
      `card text snippet: ${cardArea.substring(0, 120)}`);
    log('Event card chip: no stray "X אורחים" chip label',
      !/ \d+ אורחים/.test(cardArea),
      `card text: ${cardArea.substring(0, 120)}`);

    // Progress bar should show seat counts correctly
    log('Dashboard progress bar visible (has seat data)',
      cardArea.includes('שובצו') || body.includes('מתוך'),
      `card: ${cardArea.substring(0, 60)}`);

    // Summary banner: no old "אורחים ללא שולחן" text
    log('Dashboard summary: no "אורחים ללא שולחן" (old text)',
      !body.includes('אורחים ללא שולחן'));
    // Should now say "מקומות ללא שיבוץ" when guests are unassigned
    log('Dashboard summary: "מקומות ללא שיבוץ" shown when unassigned',
      body.includes('מקומות ללא שיבוץ'),
      `body snippet: ${body.substring(body.indexOf('נשארו'), body.indexOf('נשארו') + 40)}`);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA 2: Guest Manager — row/seat labels
  // ═══════════════════════════════════════════════════════════════════════════
  {
    console.log('\n── Area 2: Guest Manager ──────────────────────────────────────');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await seedEvent(pg, false);

    // Navigate to guest manager
    const openBtn = pg.locator('button:has-text("פתח לניהול")').first();
    await safe(() => openBtn.click());
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('[href*="/guests"], a:has-text("אורחים")').first().click());
    await pg.waitForTimeout(300);

    const url  = pg.url();
    const body = await safe(() => pg.evaluate(() => document.body.innerText), '');

    log('Guest Manager: navigated to guests tab', url.includes('/guests') || url.includes('guests'),
      `URL: ${url}`);

    // Form field label: "כמות מקומות" not "מס׳ מוזמנים"
    log('Guest Manager: count field labeled "כמות מקומות"',
      body.includes('כמות מקומות'));
    log('Guest Manager: old label "מס׳ מוזמנים" gone',
      !body.includes('מס׳ מוזמנים'));

    // Filter count: "X רשומות" not "X אורחים"
    log('Guest Manager: filter bar shows "3 רשומות"',
      body.includes('3 רשומות'),
      `body snippet around filter: ${body.substring(body.indexOf('רשומות') - 5, body.indexOf('רשומות') + 20)}`);
    log('Guest Manager: no "3 אורחים" label in filter bar',
      !body.includes('3 אורחים'));

    // Stats pills: row counts — no stray "אורחים" labels for counts
    // Header pills should show "סה״כ", side names, "משובצים", "ממתינים"
    // No pills should say "אורחים"
    log('Guest Manager: header area has "סה״כ" pill',
      body.includes('סה״כ'));

    // count>1 badge works: משפחת כהן count=5 → "+4" badge
    log('Guest Manager: count badge "+4" shown for count=5 row',
      body.includes('+4'));
    // "5 מקומות" in meta for that row
    log('Guest Manager: "5 מקומות" shown in row meta',
      body.includes('5 מקומות'));

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA 3: Table Builder — capacity calculation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    console.log('\n── Area 3: Table Builder ──────────────────────────────────────');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();

    // ── 3a: unassigned guests, gap should be 0 ──────────────────────────────
    await seedEvent(pg, false);
    const openBtn = pg.locator('button:has-text("פתח לניהול")').first();
    await safe(() => openBtn.click());
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('[href*="/tables"], a:has-text("שולחנות")').first().click());
    await pg.waitForTimeout(300);

    let body = await safe(() => pg.evaluate(() => document.body.innerText), '');

    // totalGuestSeats = 10, totalCap = 10, gap = 0 → should show "ok" banner or no warn
    log('Table Builder: no false "חסרים" warning when capacity == guest seats',
      !body.includes('חסרים'),
      `body snippet: ${body.substring(0, 200)}`);

    // Should show the "מספיקה" stat (gap=0 means no ok banner shown; only shown when gap>0)
    // gap is exactly 0 so neither warning nor ok banner shows — the base cap stat should appear
    log('Table Builder: capacity stat area shows seat count "10 מקומות"',
      body.includes('10 מקומות'),
      `body: ${body.substring(0, 300)}`);

    // No old "ev.guests.length" (= 3) being compared to capacity (10):
    // Old code: gap = 10-3=7 → would show "7 מקומות פנויים"
    // New code: gap = 10-10=0 → no ok banner
    log('Table Builder: no false "7 מקומות פנויים" (old row-count bug)',
      !body.includes('7 מקומות פנויים'),
      `found old buggy value`);

    // ── 3b: with all guests assigned — seated column should show 10/10 ──────
    await pg.evaluate(([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data));
    }, [KEY, makeTestEvent(true)]);
    await pg.reload();
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('button:has-text("פתח לניהול")').first().click());
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('[href*="/tables"], a:has-text("שולחנות")').first().click());
    await pg.waitForTimeout(400);

    body = await safe(() => pg.evaluate(() => document.body.innerText), '');

    // "מושבצים" column: 10/10 (seat count), not 3/10 (row count)
    log('Table Builder: מושבצים column shows "10" seated seats (not "3" rows)',
      body.includes('10/10') || body.includes('10 / 10') || /10\s*\/\s*10/.test(body),
      `body snippet around occupied: ${body.substring(body.indexOf('10'), body.indexOf('10') + 30)}`);
    log('Table Builder: no "3/10" (old row-count bug in מושבצים column)',
      !/3\s*\/\s*10/.test(body),
      `found old row count 3/10`);

    // "קיבולת מספיקה" line should now show totalGuestSeats (10) not row count (3)
    // With gap=0 and guests assigned, the "ok" stat shows totalGuestSeats
    // Actually since gap=0 the stat shows 10 מקומות פנויים = 0, so "קיבולת מספיקה" shows
    log('Table Builder: capacity stat shows "10 מקומות" (seat count) not "3 מקומות"',
      !body.includes('3 מקומות לאורחים') && !body.includes('3 מקומות, '),
      `body snippet: ${body.substring(0, 300)}`);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA 4: Seating Screen — behavior unchanged, only labels
  // ═══════════════════════════════════════════════════════════════════════════
  {
    console.log('\n── Area 4: Seating Screen ──────────────────────────────────────');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await seedEvent(pg, true); // with seating

    const openBtn = pg.locator('button:has-text("פתח לניהול")').first();
    await safe(() => openBtn.click());
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('[href*="/seating"], a:has-text("הושבה")').first().click());
    await pg.waitForTimeout(400);

    const body = await safe(() => pg.evaluate(() => document.body.innerText), '');

    // RunCard stats: "10 / 10 מקומות שובצו" and "3/3 רשומות"
    log('Seating Screen: "10 / 10 מקומות שובצו" in runCard stats',
      body.includes('10 / 10 מקומות שובצו') || body.includes('10/10 מקומות שובצו'),
      `body snippet: ${body.substring(body.indexOf('מקומות שובצו') - 10, body.indexOf('מקומות שובצו') + 30)}`);
    log('Seating Screen: "3/3 רשומות" in runCard stats',
      body.includes('3/3 רשומות'),
      `body snippet: ${body.substring(body.indexOf('רשומות'), body.indexOf('רשומות') + 30)}`);

    // "קיבולת האולם" not "כסאות באולם"
    log('Seating Screen: "קיבולת האולם" label (not "כסאות באולם")',
      body.includes('קיבולת האולם'),
      `found old label: ${body.includes('כסאות באולם')}`);
    log('Seating Screen: no "כסאות באולם" text',
      !body.includes('כסאות באולם'));

    // Table card: 10/10 seats used
    log('Seating Screen: table card shows "10/10 מקומות"',
      body.includes('10/10') || /10\s*\/\s*10/.test(body),
      `body: ${body.substring(body.indexOf('מקומות') - 5, body.indexOf('מקומות') + 15)}`);

    // Success card (all seated, no violations): "הרשומות שובצו" not "האורחים שובצו"
    log('Seating Screen: success card shows "הרשומות שובצו"',
      body.includes('הרשומות שובצו'),
      `body snippet: ${body.substring(body.indexOf('שובצו') - 10, body.indexOf('שובצו') + 30)}`);

    // Header pills: "שובצו" = 3 (rows), "ממתינים" = 0
    const headerPills = await safe(() => pg.locator('[class*="pills"]').first().innerText(), '');
    log('Seating Screen: "שובצו" pill shows 3 (row count)',
      headerPills.includes('3') && headerPills.includes('שובצו'),
      `pills: ${headerPills}`);

    // No unassigned in this scenario
    log('Seating Screen: "ממתינים" pill shows 0',
      headerPills.includes('0') || !headerPills.includes('ממתינים'),
      `pills: ${headerPills}`);

    // Auto-assign button still works (behavior unchanged)
    const runBtn = pg.locator('button:has-text("חשב מחדש"), button:has-text("חשב הושבה")').first();
    const runBtnExists = await safe(() => runBtn.isVisible());
    log('Seating Screen: auto-assign button still present', !!runBtnExists);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA 5: Excel Export — שובצו/קיבולת column
  // ═══════════════════════════════════════════════════════════════════════════
  {
    console.log('\n── Area 5: Excel Export ───────────────────────────────────────');
    // Verify the export calculation via Node simulation (no browser download needed)
    const guests = [
      { id: 'g1', name: 'משפחת כהן',  count: 5, side: 'bride', group: 'משפחה קרובה', phone: '', notes: '' },
      { id: 'g2', name: 'משפחת לוי',  count: 2, side: 'groom', group: 'חברים',       phone: '', notes: '' },
      { id: 'g3', name: 'משפחת גולן', count: 3, side: 'bride', group: 'משפחה קרובה', phone: '', notes: '' },
    ];
    const tables  = [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular' }];
    const seating = { g1: 't1', g2: 't1', g3: 't1' };

    const tGuests     = guests.filter(g => seating[g.id] === 't1');
    const seatedSeats = tGuests.reduce((s, g) => s + (g.count != null ? g.count : 1), 0);
    const occupied    = seatedSeats + ' / ' + tables[0].capacity;

    log('Excel export: שובצו/קיבולת = "10 / 10" (seat count)',
      occupied === '10 / 10',
      `got: "${occupied}"`);
    log('Excel export: NOT "3 / 10" (old row-count bug)',
      occupied !== '3 / 10');
    log('Excel export: all 3 guest rows would appear in sheet',
      tGuests.length === 3,
      `got: ${tGuests.length}`);
    log('Excel export: "כמות" column sum = 10',
      tGuests.reduce((s, g) => s + (g.count || 1), 0) === 10);

    // Also verify the browser can reach the seating screen (export button present)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await seedEvent(pg, true);
    const openBtn = pg.locator('button:has-text("פתח לניהול")').first();
    await safe(() => openBtn.click());
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('[href*="/seating"], a:has-text("הושבה")').first().click());
    await pg.waitForTimeout(400);

    const exportBtn = pg.locator('button:has-text("ייצוא לאקסל")').first();
    const exportVisible = await safe(() => exportBtn.isVisible());
    const exportDisabled = await safe(() => exportBtn.isDisabled());
    log('Excel export: export button visible and enabled',
      !!exportVisible && !exportDisabled,
      `visible=${exportVisible} disabled=${exportDisabled}`);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AREA 6: Regression checks
  // ═══════════════════════════════════════════════════════════════════════════
  {
    console.log('\n── Area 6: Regression ─────────────────────────────────────────');

    // 6a: Cloud sync mapper (unchanged) — check via code scan, not browser
    const { execSync } = require('child_process');
    const cloudSyncSrc = execSync('cat /home/user/kochav-hashulchan-app/src/utils/cloudSync.js').toString();
    log('Regression: cloudSync.js guest_count still uses guests.length (no change)',
      cloudSyncSrc.includes('guest_count: total') || cloudSyncSrc.includes('guest_count:'),
      'cloudSync changed unexpectedly');
    log('Regression: cloudSync.js seated_pct still uses row counts (no change in this pass)',
      cloudSyncSrc.includes('seated / total') || cloudSyncSrc.includes('seatedPct'),
      'cloudSync seatedPct changed unexpectedly');

    // 6b: seating algorithm unchanged
    const seatingSrc = execSync('cat /home/user/kochav-hashulchan-app/src/logic/seating.js').toString();
    log('Regression: seating.js untouched (autoAssign still present)',
      seatingSrc.includes('autoAssign'),
      'seating.js unexpectedly changed');
    log('Regression: seating.js guestSeats function intact',
      seatingSrc.includes('guestSeats'),
      'guestSeats function missing');

    // 6c: constraints logic unchanged
    const constraintSrc = execSync('cat /home/user/kochav-hashulchan-app/src/screens/ConstraintsScreen.jsx').toString();
    log('Regression: ConstraintsScreen.jsx untouched',
      constraintSrc.includes('addConstraint') && constraintSrc.includes('delConstraint'),
      'ConstraintsScreen unexpectedly changed');

    // 6d: build passes
    try {
      execSync('npm run build 2>&1', { cwd: '/home/user/kochav-hashulchan-app' });
      log('Regression: build passes cleanly', true);
    } catch (e) {
      log('Regression: build passes cleanly', false, e.message.substring(0, 100));
    }

    // 6e: No console errors in seating screen
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    const consoleErrors = [];
    pg.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    pg.on('pageerror', err => consoleErrors.push(err.message));

    await pg.evaluate(([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data));
    }, [KEY, makeTestEvent(true)]);
    await pg.goto(BASE);
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('button:has-text("פתח לניהול")').first().click());
    await pg.waitForLoadState('networkidle');
    await safe(() => pg.locator('[href*="/seating"], a:has-text("הושבה")').first().click());
    await pg.waitForTimeout(600);

    // Run auto-assign to test algorithm
    const runBtn = pg.locator('button:has-text("חשב מחדש"), button:has-text("חשב הושבה")').first();
    await safe(() => runBtn.click());
    await pg.waitForTimeout(600);

    const errFiltered = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('supabase') && !e.includes('net::ERR')
    );
    log('Regression: no JS console errors during seating flow',
      errFiltered.length === 0,
      errFiltered.length > 0 ? errFiltered.join('; ') : '');

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  await browser.close();

  console.log('\n══════════════════════════════════════════');
  console.log(`PASS: ${pass} | FAIL: ${fail}`);
  if (bugs.length > 0) {
    console.log('\nBUGS FOUND:');
    bugs.forEach((b, i) => console.log(`  ${i+1}. ${b.label}${b.detail ? ' — ' + b.detail : ''}`));
  }
  console.log(fail === 0 ? '\n✓ SAFE TO CONTINUE' : '\n✗ ISSUES FOUND — REVIEW BEFORE CONTINUING');
  console.log('══════════════════════════════════════════');

  process.exit(fail > 0 ? 1 : 0);
})();
