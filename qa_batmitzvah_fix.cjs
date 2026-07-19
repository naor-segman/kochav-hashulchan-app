const { chromium } = require('playwright');
const fs = require('fs');

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

  async function createViaTemplate(pg, templateLabel) {
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');
    const cta = pg.locator('button:has-text("צור אירוע ראשון"), button:has-text("אירוע חדש")').first();
    await safe(() => cta.click());
    await pg.waitForTimeout(400);
    await safe(() => pg.locator(`[class*="tmplCard"]:has-text("${templateLabel}")`).first().click());
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(300);
  }

  // ── TEST 1: Template picker shows both בר מצווה and בת מצווה ─────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');

    const cta = pg.locator('button:has-text("צור אירוע ראשון"), button:has-text("אירוע חדש")').first();
    await safe(() => cta.click());
    await pg.waitForTimeout(400);

    const bodyText = await safe(() => pg.evaluate(() => document.body.innerText)) || '';
    log('Template picker shows "בר מצווה"', bodyText.includes('בר מצווה'));
    log('Template picker shows "בת מצווה"', bodyText.includes('בת מצווה'));
    log('Template picker does NOT show combined "בר / בת מצווה"', !bodyText.includes('בר / בת מצווה'));

    await ctx.close();
  }

  // ── TEST 2: Bar Mitzvah template creates correct type ─────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await createViaTemplate(pg, 'בר מצווה');

    const url  = pg.url();
    const text = await safe(() => pg.evaluate(() => document.body.innerText)) || '';

    log('Bar Mitzvah: navigated to setup', url.includes('/setup'), `URL: ${url}`);

    const typeVal = await safe(() => pg.locator('select').first().inputValue());
    log('Bar Mitzvah: type select = "בר מצווה"', typeVal === 'בר מצווה', `got: ${typeVal}`);

    // Debug: print relevant section of the page text
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const personalSection = lines.find(l => l.includes('שם') || l.includes('פרטים'));
    console.log('Bar Mitzvah page text (שם lines):', lines.filter(l => l.includes('שם')).join(' | '));

    log('Bar Mitzvah: shows "שם הבר מצווה" label', text.includes('שם הבר מצווה'));
    log('Bar Mitzvah: does NOT show "שם הבת מצווה"', !text.includes('שם הבת מצווה'));

    await ctx.close();
  }

  // ── TEST 3: Bat Mitzvah template creates correct type ─────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg  = await ctx.newPage();
    await createViaTemplate(pg, 'בת מצווה');

    const url  = pg.url();
    const text = await safe(() => pg.evaluate(() => document.body.innerText)) || '';

    log('Bat Mitzvah: navigated to setup', url.includes('/setup'), `URL: ${url}`);

    const typeVal = await safe(() => pg.locator('select').first().inputValue());
    log('Bat Mitzvah: type select = "בת מצווה"', typeVal === 'בת מצווה', `got: ${typeVal}`);

    console.log('Bat Mitzvah page text (שם lines):', text.split('\n').filter(l => l.includes('שם')).join(' | '));

    log('Bat Mitzvah: shows "שם הבת מצווה" label', text.includes('שם הבת מצווה'));
    log('Bat Mitzvah: does NOT show "שם הבר מצווה"', !text.includes('שם הבר מצווה'));

    await ctx.close();
  }

  // ── TEST 4: Other templates unaffected ────────────────────────────────────
  {
    for (const [templateLabel, expectedType] of [['חתונה','חתונה'],['חינה','חינה'],['אירוע עסקי','אירוע עסקי']]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const pg  = await ctx.newPage();
      await createViaTemplate(pg, templateLabel);
      const typeVal = await safe(() => pg.locator('select').first().inputValue());
      log(`${templateLabel} template: type = "${expectedType}"`, typeVal === expectedType, `got: ${typeVal}`);
      await ctx.close();
    }
  }

  await browser.close();

  console.log(`\n══════════════\nPASS: ${pass} | FAIL: ${fail}\n══════════════`);
  process.exit(fail > 0 ? 1 : 0);
})();
