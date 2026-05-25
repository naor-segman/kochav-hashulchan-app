const { chromium } = require('playwright');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
const BASE = 'http://localhost:5174';

async function safe(fn) { try { return await fn(); } catch(e) { return null; } }

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ARGS, headless: true });
  let pass = 0, fail = 0;

  function log(label, ok, detail) {
    if (ok) { console.log(`✓ PASS: ${label}`); pass++; }
    else     { console.log(`✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
  }

  // ── TEST 1: Subnav tabs blocked with empty event name ─────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');

    // Create a new event via template picker (skip filling name)
    await safe(() => pg.locator('text=צור אירוע ראשון').click());
    await pg.waitForTimeout(500);
    await safe(() => pg.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).first().click());
    await pg.waitForLoadState('networkidle');

    const setupUrl = pg.url();
    console.log('On setup URL:', setupUrl);

    // Try clicking each subnav tab — all should stay on /setup
    const tabs = ['שולחנות', 'אורחים', 'אילוצים', 'הושבה'];
    let allBlocked = true;
    for (const tab of tabs) {
      await safe(() => pg.locator(`nav button:has-text("${tab}")`).click());
      await pg.waitForTimeout(400);
      const url = pg.url();
      if (!url.includes('/setup')) {
        allBlocked = false;
        console.log(`  Tab "${tab}" bypassed to: ${url}`);
      }
    }
    log('All subnav tabs blocked with empty name', allBlocked);

    // Check toast appeared (Hebrew error message)
    // After clicking a blocked tab, an error toast should be visible
    await safe(() => pg.locator(`nav button:has-text("שולחנות")`).click());
    await pg.waitForTimeout(600);
    const bodyText = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    const hasToast = bodyText.includes('שם לאירוע') || bodyText.includes('שם לאירוע לפני');
    log('Error toast shown on blocked navigation', hasToast, hasToast ? null : 'Toast text not found');

    await ctx.close();
  }

  // ── TEST 2: Valid event — navigation works normally ────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');

    // Create event and fill name
    await safe(() => pg.locator('text=צור אירוע ראשון').click());
    await pg.waitForTimeout(500);
    await safe(() => pg.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).first().click());
    await pg.waitForLoadState('networkidle');

    // Fill the name using the correct selector (placeholder is event-type-specific, not containing שם)
    // The input is inside a Field labelled "שם האירוע" — locate by label proximity
    const nameInput = pg.locator('input').filter({ hasNot: pg.locator('[type="date"],[type="number"]') }).first();
    await safe(() => nameInput.fill('חתונת נועה וטל'));
    await pg.waitForTimeout(200);

    // Save the form
    await safe(() => pg.locator('button:has-text("שמור")').first().click());
    await pg.waitForTimeout(600);

    // Now subnav should allow navigation
    await safe(() => pg.locator(`nav button:has-text("שולחנות")`).click());
    await pg.waitForTimeout(500);
    log('Navigation to tables works after name saved', pg.url().includes('/tables'), `URL: ${pg.url()}`);

    // Navigate to guests
    await safe(() => pg.locator(`nav button:has-text("אורחים")`).click());
    await pg.waitForTimeout(500);
    log('Navigation to guests works', pg.url().includes('/guests'), `URL: ${pg.url()}`);

    // Navigate to constraints
    await safe(() => pg.locator(`nav button:has-text("אילוצים")`).click());
    await pg.waitForTimeout(500);
    log('Navigation to constraints works', pg.url().includes('/constraints'), `URL: ${pg.url()}`);

    // Navigate to seating
    await safe(() => pg.locator(`nav button:has-text("הושבה")`).click());
    await pg.waitForTimeout(500);
    log('Navigation to seating works', pg.url().includes('/seating'), `URL: ${pg.url()}`);

    // Navigate back to setup
    await safe(() => pg.locator(`nav button:has-text("האירוע")`).click());
    await pg.waitForTimeout(500);
    log('Navigation back to setup works', pg.url().includes('/setup'), `URL: ${pg.url()}`);

    await ctx.close();
  }

  // ── TEST 3: Existing saved events navigate normally ───────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();

    // Pre-seed localStorage with a valid event
    await pg.goto(BASE);
    await pg.evaluate(() => {
      const ev = {
        id: 'test-existing-999',
        name: 'חתונת דנה ואיתי',
        type: 'חתונה',
        date: '2026-10-01',
        venue: 'אולם הגן',
        guests: [],
        tables: [],
        constraints: [],
        seating: {},
        customGroups: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const state = JSON.parse(localStorage.getItem('kochav_hashulchan_v1') || '{}');
      state.events = [ev, ...(state.events || [])];
      localStorage.setItem('kochav_hashulchan_v1', JSON.stringify(state));
    });

    // Reload so React picks up the pre-seeded localStorage state
    await pg.reload(); await pg.waitForLoadState('networkidle');
    await pg.goto(`${BASE}/events/test-existing-999/setup`);
    await pg.waitForLoadState('networkidle');
    log('Existing event setup loads', pg.url().includes('/setup'), `URL: ${pg.url()}`);

    await safe(() => pg.locator(`nav button:has-text("שולחנות")`).click());
    await pg.waitForTimeout(500);
    log('Existing event: tables tab works', pg.url().includes('/tables'), `URL: ${pg.url()}`);

    await safe(() => pg.locator(`nav button:has-text("אורחים")`).click());
    await pg.waitForTimeout(500);
    log('Existing event: guests tab works', pg.url().includes('/guests'), `URL: ${pg.url()}`);

    await ctx.close();
  }

  await browser.close();

  console.log(`\n══════════════\nPASS: ${pass} | FAIL: ${fail}\n══════════════`);
  process.exit(fail > 0 ? 1 : 0);
})();
