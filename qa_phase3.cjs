const { chromium } = require('playwright');
const fs = require('fs');

const BROWSER_OPTS = {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true
};
const BASE = 'http://localhost:5174';
const SS_DIR = '/tmp/qa_screenshots';
fs.mkdirSync(SS_DIR, { recursive: true });

let step = 200;
const results = [];

function log(area, result, issue, severity) {
  results.push({ area, result, issue: issue || '—', severity: severity || '—' });
  const icon = result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : '⚠';
  console.log(`${icon} [${result}] ${area}: ${issue || 'OK'}`);
}

async function ss(page, name) {
  await page.screenshot({ path: `${SS_DIR}/${++step}_${name}.png`, fullPage: true });
}

async function safeText(page) {
  return page.evaluate(() => document.body.innerText).catch(() => '');
}

(async () => {
  const browser = await chromium.launch(BROWSER_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Navigate fresh
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => { try { localStorage.clear(); } catch(e){} });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // ── 1. VALIDATION BYPASS ────────────────────────────────────────────────────
  await page.locator('text=צור אירוע ראשון').click();
  await page.waitForTimeout(400);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).first().click();
  await page.waitForLoadState('networkidle');

  // Don't fill name — click subnav tab directly  
  const tablesTab = page.locator('[class*="subnav"] button').filter({ hasText: 'שולחנות' });
  await tablesTab.click();
  await page.waitForTimeout(600);

  const afterNavUrl = page.url();
  const navBypassed = afterNavUrl.includes('/tables');
  log('Validation: Subnav tab bypasses name validation',
    navBypassed ? 'FAIL' : 'PASS',
    navBypassed ? 'BUG: Clicking subnav "שולחנות" navigates to /tables even with empty event name. Shell.go() is called directly, bypassing EventSetupScreen.goNext() validation.' : null,
    navBypassed ? 'Critical' : null);
  await ss(page, '01_validation_bypass');

  // ── 2. SETUP SCREEN — WEDDING FIELDS ────────────────────────────────────────
  // Go back to setup
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("פתח לניהול"), [class*="eventOpenBtn"]').first().click().catch(async () => {
    // No events yet — shouldn't get here
  });
  
  // Create fresh wedding event
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => { try { localStorage.clear(); } catch(e){} });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('text=צור אירוע ראשון').click();
  await page.waitForTimeout(400);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, '02_wedding_setup');

  const setupText = await safeText(page);
  log('Setup: Event name field required indicator shown', setupText.includes('חובה') || setupText.includes('*') ? 'PASS' : 'WARN',
    !setupText.includes('חובה') && !setupText.includes('*') ? 'No required field indicator visible' : null);
  log('Setup: Bride field visible', setupText.includes('כלה') ? 'PASS' : 'FAIL',
    !setupText.includes('כלה') ? 'Bride field label not found' : null);
  log('Setup: Groom field visible', setupText.includes('חתן') ? 'PASS' : 'FAIL',
    !setupText.includes('חתן') ? 'Groom field label not found' : null);
  log('Setup: Save button visible', setupText.includes('שמור') ? 'PASS' : 'FAIL');

  // Fill setup form
  const nameIn = page.locator('input[type="text"]').first();
  await nameIn.fill('חתונת נועה וטל');

  // Get all text inputs and fill bride/groom
  const allTextIn = await page.locator('input[type="text"]').all();
  console.log('Setup text inputs count:', allTextIn.length);
  for (const inp of allTextIn) {
    const ph = (await inp.getAttribute('placeholder').catch(() => '')) || '';
    if (ph.includes('נועה')) await inp.fill('נועה');
    else if (ph.includes('טל')) await inp.fill('טל');
  }

  // Date
  const dateIn = page.locator('input[type="date"]');
  if (await dateIn.isVisible().catch(() => false)) await dateIn.fill('2026-09-15');

  // Venue 
  const allIn = await page.locator('input').all();
  for (const inp of allIn) {
    const ph = (await inp.getAttribute('placeholder').catch(() => '')) || '';
    if (ph.includes('אולם') || ph.includes('אירועים')) await inp.fill('אולם הגן הקסום');
  }

  await ss(page, '03_wedding_filled');

  // Save and continue
  const saveNextBtn = page.locator('button:has-text("שמור והמשך")');
  await saveNextBtn.click();
  await page.waitForLoadState('networkidle');

  const urlAfterSave = page.url();
  log('Setup: "שמור והמשך" navigates to tables', urlAfterSave.includes('/tables') ? 'PASS' : 'FAIL',
    !urlAfterSave.includes('/tables') ? `URL after save: ${urlAfterSave}` : null);

  // ── 3. TABLES ────────────────────────────────────────────────────────────────
  await ss(page, '04_tables_screen');
  const tablesText = await safeText(page);
  log('Tables: Screen renders', tablesText.includes('שולחן') ? 'PASS' : 'FAIL');

  // Add tables using the form
  const numInputs = await page.locator('input[type="number"]').all();
  console.log('Tables number inputs:', numInputs.length);
  
  // Look for the batch add UI
  let addedTables = false;
  for (const inp of numInputs) {
    const val = await inp.inputValue().catch(() => '');
    const label = await inp.evaluate(el => {
      const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
      return label?.textContent || el.getAttribute('placeholder') || '';
    }).catch(() => '');
    console.log('Number input - label/val:', label, val);
  }

  // Try filling batch form: find count and capacity
  if (numInputs.length >= 2) {
    await numInputs[0].fill('8');  // first num = capacity?
    await numInputs[1].fill('4');  // second num = count?
    addedTables = true;
  } else if (numInputs.length === 1) {
    await numInputs[0].fill('4');
    addedTables = true;
  }

  // Text inputs for table name prefix
  const tableTextInputs = await page.locator('input[type="text"]').all();
  for (const inp of tableTextInputs) {
    const ph = (await inp.getAttribute('placeholder').catch(() => '')) || '';
    if (ph.includes('שולחן') || ph.includes('קידומת') || ph.includes('שם')) {
      await inp.fill('שולחן');
    }
  }

  const addBtn = page.locator('button:has-text("הוסף שולחנות"), button:has-text("הוסף"), button:has-text("צור שולחן")').first();
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(600);
  }
  await ss(page, '05_tables_added');

  const tableRows = await page.locator('[class*="tableRow"], [class*="tblRow"], [class*="tableCard"], [class*="tableItem"]').count();
  log('Tables: Batch table creation', tableRows >= 2 ? 'PASS' : 'WARN',
    tableRows < 2 ? `Only ${tableRows} table rows visible — batch add may not have worked` : null);
  console.log('Table rows visible:', tableRows);

  // ── 4. GUESTS ────────────────────────────────────────────────────────────────
  await page.locator('[class*="subnav"] button').filter({ hasText: 'אורחים' }).click();
  await page.waitForLoadState('networkidle');
  await ss(page, '06_guests_screen');

  // Check side dropdown options for wedding
  const allSelects = await page.locator('select').all();
  let sideOpts = [];
  for (const sel of allSelects) {
    const opts = await sel.locator('option').allTextContents();
    if (opts.some(o => o.includes('כלה') || o.includes('חתן') || o.includes('bride') || o.includes('groom'))) {
      sideOpts = opts;
      break;
    }
  }
  console.log('Wedding side options found:', sideOpts);
  log('Guests: Wedding side dropdown has כלה/חתן', sideOpts.some(o => o.includes('כלה')) ? 'PASS' : 'FAIL',
    !sideOpts.some(o => o.includes('כלה')) ? `Side options: ${sideOpts.join(', ')}` : null);

  // Add guests
  const guestList = [
    { name: 'שרה כהן', side: 'bride' },
    { name: 'יוסי לוי', side: 'groom' },
    { name: 'מרים ברק', side: 'bride' },
    { name: 'דוד ישראלי', side: 'groom' },
  ];

  for (const g of guestList) {
    const nameF = page.locator('input[type="text"]').first();
    await nameF.fill(g.name);

    const sideF = page.locator('select').first();
    if (await sideF.isVisible().catch(() => false)) {
      const opts = await sideF.locator('option').allInnerTexts();
      // Select bride or groom option
      if (g.side === 'bride') {
        const brideOpt = opts.find(o => o.includes('כלה'));
        if (brideOpt) await sideF.selectOption({ label: brideOpt });
      } else {
        const groomOpt = opts.find(o => o.includes('חתן'));
        if (groomOpt) await sideF.selectOption({ label: groomOpt });
      }
    }

    const addB = page.locator('button[type="submit"], button:has-text("הוסף"), button:has-text("שמור")').first();
    await addB.click().catch(() => {});
    await page.waitForTimeout(300);
  }

  const guestRowsAfter = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
  log('Guests: Add multiple guests', guestRowsAfter >= 3 ? 'PASS' : 'FAIL',
    guestRowsAfter < 3 ? `Only ${guestRowsAfter} guest rows after adding 4 guests` : null);
  await ss(page, '07_guests_added');

  // Search
  const searchF = page.locator('[placeholder*="חיפוש"], [placeholder*="סינון"], input[type="search"]').first();
  if (await searchF.isVisible().catch(() => false)) {
    await searchF.fill('שרה');
    await page.waitForTimeout(300);
    const filteredCount = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
    log('Guests: Search filters list', filteredCount < guestRowsAfter ? 'PASS' : 'FAIL',
      filteredCount >= guestRowsAfter ? `Search "שרה": ${filteredCount}/${guestRowsAfter} — no filtering` : null);
    await ss(page, '08_guest_search');
    await searchF.fill('');
    await page.waitForTimeout(200);
  } else {
    log('Guests: Search field', 'WARN', 'No search field found on guests screen');
  }

  // Side filter buttons
  const sideFilterBtns = await page.locator('button:has-text("צד כלה"), button:has-text("כלה"), button:has-text("bride"), button:has-text("כל הצדדים"), [class*="sideFilter"]').all();
  log('Guests: Side filter buttons visible', sideFilterBtns.length > 0 ? 'PASS' : 'WARN',
    sideFilterBtns.length === 0 ? 'No side filter buttons found on guests screen' : null);

  // Count +/- buttons
  const plusButtons = await page.locator('button:has-text("+")').all();
  log('Guests: Count increment (+) buttons', plusButtons.length > 0 ? 'PASS' : 'WARN',
    plusButtons.length === 0 ? 'No + buttons found on guest rows' : null);

  // Delete a guest
  const guestDelBtns = await page.locator('[class*="guestRow"] button, [class*="gRow"] button').all();
  let deleted = false;
  for (const btn of guestDelBtns) {
    const t = await btn.textContent().catch(() => '');
    if (t.includes('✕') || t.includes('מחק') || t.includes('×')) {
      const rowsBefore2 = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
      await btn.click();
      await page.waitForTimeout(400);
      const rowsAfter2 = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
      log('Guests: Delete removes guest', rowsAfter2 < rowsBefore2 ? 'PASS' : 'FAIL',
        rowsAfter2 >= rowsBefore2 ? `Rows unchanged: ${rowsBefore2} → ${rowsAfter2}` : null);
      deleted = true;
      break;
    }
  }
  if (!deleted) {
    log('Guests: Delete button', 'WARN', 'Could not find and click a delete button on guest rows');
  }
  await ss(page, '09_guests_with_actions');

  // ── 5. CONSTRAINTS ──────────────────────────────────────────────────────────
  await page.locator('[class*="subnav"] button').filter({ hasText: 'אילוצים' }).click();
  await page.waitForLoadState('networkidle');
  await ss(page, '10_constraints_screen');

  const constraintText = await safeText(page);
  log('Constraints: Screen renders', constraintText.length > 0 ? 'PASS' : 'FAIL');

  const constraintInputs = await page.locator('input[type="text"]').all();
  log('Constraints: Input fields present', constraintInputs.length >= 2 ? 'PASS' : 'WARN',
    constraintInputs.length < 2 ? `Only ${constraintInputs.length} text inputs on constraints screen` : null);

  if (constraintInputs.length > 0) {
    await constraintInputs[0].fill('שר');
    await page.waitForTimeout(600);
    await ss(page, '11_constraints_autocomplete');

    const suggestions = await page.locator('[class*="sug"], [class*="drop"] li, [role="option"], [class*="item"]').count();
    log('Constraints: Autocomplete shows guest matches', suggestions > 0 ? 'PASS' : 'WARN',
      suggestions === 0 ? 'No autocomplete suggestions after typing "שר" — guests may not be returned' : null);
    console.log('Autocomplete suggestions count:', suggestions);
    await constraintInputs[0].fill('');
  }

  // ── 6. SEATING ─────────────────────────────────────────────────────────────
  await page.locator('[class*="subnav"] button').filter({ hasText: 'הושבה' }).click();
  await page.waitForLoadState('networkidle');
  await ss(page, '12_seating_initial');

  const seatingText = await safeText(page);
  log('Seating: Screen renders', seatingText.includes('הושבה') ? 'PASS' : 'FAIL');

  // Unassigned guests panel
  const hasUnassignedPanel = seatingText.includes('ממתינים') || seatingText.includes('לא שובצו');
  log('Seating: Unassigned guests panel', hasUnassignedPanel ? 'PASS' : 'WARN',
    !hasUnassignedPanel ? 'No unassigned panel label found — may be different Hebrew text' : null);

  // Dynamic side labels
  const hasDynamic = seatingText.includes('נועה') || seatingText.includes('טל') ||
                     seatingText.includes('צד כלה') || seatingText.includes('צד חתן');
  log('Seating: Dynamic side labels before assign', hasDynamic ? 'PASS' : 'WARN',
    !hasDynamic ? 'Bride/groom names not visible in seating screen text' : null);

  // Auto-assign
  const autoBtn = page.locator('button:has-text("חשב הושבה"), button:has-text("הושבה אוטומטית"), button:has-text("חשב")').first();
  const autoBtnVis = await autoBtn.isVisible().catch(() => false);
  log('Seating: Auto-assign button visible', autoBtnVis ? 'PASS' : 'FAIL');

  if (autoBtnVis) {
    await autoBtn.click();
    await page.waitForTimeout(2000);
    await ss(page, '13_seating_after_auto');

    const seating2 = await safeText(page);
    const hasScore = /ציון \d+\/100/.test(seating2);
    log('Seating: Quality score after auto-assign', hasScore ? 'PASS' : 'WARN',
      !hasScore ? 'No "ציון X/100" pattern found after auto-assign' : null);

    const hasSuggestionsPanel = seating2.includes('עוזר חכם') || seating2.includes('המלצ');
    log('Seating: Suggestions panel visible', hasSuggestionsPanel ? 'PASS' : 'WARN',
      !hasSuggestionsPanel ? '"עוזר חכם" not found after auto-assign' : null);

    const hasDynamicAfter = seating2.includes('נועה') || seating2.includes('טל') ||
                            seating2.includes('צד כלה') || seating2.includes('צד חתן');
    log('Seating: Dynamic labels after auto-assign', hasDynamicAfter ? 'PASS' : 'WARN',
      !hasDynamicAfter ? 'No dynamic bride/groom labels after auto-assign' : null);

    // Undo
    const undoBtn = page.locator('button:has-text("בטל"), button[title*="בטל"]').first();
    log('Seating: Undo button visible', await undoBtn.isVisible().catch(() => false) ? 'PASS' : 'WARN',
      !await undoBtn.isVisible().catch(() => false) ? 'Undo button not found' : null);

    // Table lock button
    const lockBtns = await page.locator('button[class*="lock"], button[title*="נעל"], button:has-text("🔒")').all();
    log('Seating: Lock table/guest buttons visible', lockBtns.length > 0 ? 'PASS' : 'WARN',
      lockBtns.length === 0 ? 'No lock buttons found in seating view' : null);

    // Print button
    const printBtn = page.locator('button:has-text("הדפסה"), button:has-text("הדפס")').first();
    log('Seating: Print button visible', await printBtn.isVisible().catch(() => false) ? 'PASS' : 'WARN');

    // Export button
    const exportBtn = page.locator('button:has-text("ייצוא"), button:has-text("Excel"), button:has-text("אקסל")').first();
    log('Seating: Excel export button visible', await exportBtn.isVisible().catch(() => false) ? 'PASS' : 'WARN');

    // Compact print button
    const compactBtn = page.locator('button:has-text("קומפקטי"), button:has-text("צוות"), [class*="print"]').first();
    log('Seating: Compact print mode button', await compactBtn.isVisible().catch(() => false) ? 'PASS' : 'WARN',
      !await compactBtn.isVisible().catch(() => false) ? 'Compact print mode button not found' : null);
  }
  await ss(page, '14_seating_full');

  // ── 7. PERSISTENCE ──────────────────────────────────────────────────────────
  const eventUrl = page.url();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await ss(page, '15_after_reload');

  const reloadText = await safeText(page);
  const survivedReload = reloadText.includes('חתונת נועה וטל');
  log('Persistence: Event data survives reload', survivedReload ? 'PASS' : 'FAIL',
    !survivedReload ? 'Event name not found after page reload — localStorage persistence issue' : null,
    !survivedReload ? 'Critical' : null);

  // Navigate to dashboard and back
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  const dashText = await safeText(page);
  log('Persistence: Event visible in dashboard after reload', dashText.includes('חתונת נועה וטל') ? 'PASS' : 'FAIL',
    !dashText.includes('חתונת נועה וטל') ? 'Event not visible in dashboard after reload' : null);

  // ── 8. BAR MITZVAH FIELDS ────────────────────────────────────────────────────
  await page.locator('button:has-text("+ אירוע חדש"), button:has-text("+ צור")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'מצווה' }).first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, '16_barmitzvah_setup');

  const bmText = await safeText(page);
  const hasCelebrant = bmText.includes('ילד') || bmText.includes('המצוות') || bmText.includes('הבר');
  log('Bar Mitzvah: Celebrant-specific label shown', hasCelebrant ? 'PASS' : 'WARN',
    !hasCelebrant ? 'No bar mitzvah specific field label found' : null);

  await page.locator('input[type="text"]').first().fill('בר מצווה של ידידיה');
  await page.locator('button:has-text("שמור")').first().click();
  await page.waitForTimeout(300);

  await page.locator('[class*="subnav"] button').filter({ hasText: 'אורחים' }).click();
  await page.waitForLoadState('networkidle');

  const bmSideSelects = await page.locator('select').all();
  let bmSideOpts = [];
  for (const sel of bmSideSelects) {
    const opts = await sel.locator('option').allInnerTexts();
    if (opts.some(o => o.includes('אם') || o.includes('אב'))) {
      bmSideOpts = opts;
      break;
    }
  }
  console.log('Bar Mitzvah side options:', bmSideOpts);
  log('Bar Mitzvah: Side options show אם/אב', bmSideOpts.some(o => o.includes('אם')) ? 'PASS' : 'WARN',
    !bmSideOpts.some(o => o.includes('אם')) ? `Sides: ${bmSideOpts.join(', ')}` : null);
  await ss(page, '17_barmitzvah_sides');

  // ── 9. CORPORATE FIELDS ──────────────────────────────────────────────────────
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("+ אירוע חדש")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'עסקי' }).click();
  await page.waitForLoadState('networkidle');
  await ss(page, '18_corporate_setup');

  const corpText = await safeText(page);
  const hasOrgField = corpText.includes('ארגון') || corpText.includes('חברה');
  const hasContactField = corpText.includes('קשר') || corpText.includes('contact');
  log('Corporate: Organization field shown', hasOrgField ? 'PASS' : 'WARN',
    !hasOrgField ? 'No organization/company field label found' : null);
  log('Corporate: Contact field shown', hasContactField ? 'PASS' : 'WARN',
    !hasContactField ? 'No contact field label found' : null);

  await page.locator('input[type="text"]').first().fill('כנס שנתי 2026');
  await page.locator('button:has-text("שמור")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="subnav"] button').filter({ hasText: 'אורחים' }).click();
  await page.waitForLoadState('networkidle');

  const corpSelects = await page.locator('select').all();
  let corpSideOpts = [];
  for (const sel of corpSelects) {
    const opts = await sel.locator('option').allInnerTexts();
    if (opts.some(o => o.includes('הנהלה') || o.includes('עובד'))) {
      corpSideOpts = opts;
      break;
    }
  }
  console.log('Corporate side options:', corpSideOpts);
  log('Corporate: Side labels show הנהלה/עובדים', corpSideOpts.some(o => o.includes('הנהלה')) ? 'PASS' : 'WARN',
    !corpSideOpts.some(o => o.includes('הנהלה')) ? `Corporate sides: ${corpSideOpts.join(', ')}` : null);
  await ss(page, '19_corporate_sides');

  // ── 10. MOBILE QA ────────────────────────────────────────────────────────────
  await ctx.close();
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mPage = await mCtx.newPage();
  await mPage.goto(BASE);
  await mPage.waitForLoadState('networkidle');

  const mHtmlDir = await mPage.evaluate(() => document.documentElement.getAttribute('dir'));
  log('Mobile (390px): html[dir=rtl] set', mHtmlDir === 'rtl' ? 'PASS' : 'FAIL',
    mHtmlDir !== 'rtl' ? `html dir = "${mHtmlDir}"` : null, 'Critical');

  const mHomeScroll = await mPage.evaluate(() => document.body.scrollWidth);
  log('Mobile: Home no horizontal overflow', mHomeScroll <= 395 ? 'PASS' : 'FAIL',
    mHomeScroll > 395 ? `scrollWidth=${mHomeScroll}px on 390px viewport` : null,
    mHomeScroll > 395 ? 'Medium' : null);
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_home.png` });

  // Template picker on mobile
  await mPage.locator('text=צור אירוע ראשון').click();
  await mPage.waitForTimeout(400);
  const mTmplScroll = await mPage.evaluate(() => document.body.scrollWidth);
  log('Mobile: Template picker no overflow', mTmplScroll <= 395 ? 'PASS' : 'FAIL',
    mTmplScroll > 395 ? `Template picker: ${mTmplScroll}px` : null);
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_templates.png` });

  await mPage.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).click();
  await mPage.waitForLoadState('networkidle');
  const mSetupScroll = await mPage.evaluate(() => document.body.scrollWidth);
  log('Mobile: Event setup no overflow', mSetupScroll <= 395 ? 'PASS' : 'FAIL',
    mSetupScroll > 395 ? `Event setup: ${mSetupScroll}px` : null, mSetupScroll > 395 ? 'Medium' : null);
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_setup.png` });

  // Fill and save
  await mPage.locator('input[type="text"]').first().fill('מובייל אירוע');
  await mPage.locator('button:has-text("שמור")').first().click();
  await mPage.waitForTimeout(300);

  // Tables mobile
  await mPage.locator('[class*="subnav"] button').filter({ hasText: 'שולחנות' }).click();
  await mPage.waitForLoadState('networkidle');
  const mTablesScroll = await mPage.evaluate(() => document.body.scrollWidth);
  log('Mobile: Tables screen no overflow', mTablesScroll <= 395 ? 'PASS' : 'FAIL',
    mTablesScroll > 395 ? `Tables: ${mTablesScroll}px` : null, mTablesScroll > 395 ? 'Medium' : null);
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_tables.png` });

  // Guests mobile
  await mPage.locator('[class*="subnav"] button').filter({ hasText: 'אורחים' }).click();
  await mPage.waitForLoadState('networkidle');
  const mGuestsScroll = await mPage.evaluate(() => document.body.scrollWidth);
  log('Mobile: Guests screen no overflow', mGuestsScroll <= 395 ? 'PASS' : 'FAIL',
    mGuestsScroll > 395 ? `Guests: ${mGuestsScroll}px` : null, mGuestsScroll > 395 ? 'Medium' : null);
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_guests.png` });

  // RTL computed style check
  const mDir = await mPage.evaluate(() => {
    const body = document.body;
    return window.getComputedStyle(body).direction;
  });
  log('Mobile: Computed direction is RTL', mDir === 'rtl' ? 'PASS' : 'FAIL',
    mDir !== 'rtl' ? `body computed direction: ${mDir}` : null);

  // Check topbar on mobile
  const mTopbar = mPage.locator('[class*="topbar"], header').first();
  const mTopbarVis = await mTopbar.isVisible().catch(() => false);
  log('Mobile: Header/topbar visible', mTopbarVis ? 'PASS' : 'WARN');
  if (mTopbarVis) {
    const mTopbarBox = await mTopbar.boundingBox();
    log('Mobile: Header fits in viewport', mTopbarBox && mTopbarBox.width <= 395 ? 'PASS' : 'WARN',
      mTopbarBox && mTopbarBox.width > 395 ? `Header width: ${mTopbarBox.width}px` : null);
  }

  // ── 11. STATIC ANALYSIS FINDINGS ────────────────────────────────────────────
  log('Excel Export: RTL in exported Excel file', 'FAIL',
    'exportHelpers.js uses ws["!views"]=[{rightToLeft:true}] — xlsx 0.18.5 silently ignores this. Export file opens LTR. Fix: wb.Workbook = {Views:[{RTL:true}]}',
    'Medium');

  log('Cloud Sync: Missing fields in Supabase payload', 'FAIL',
    'cloudSync.js mapLocalEventToCloudPayload omits: customGroups, celebrantName, organizationName, contactName, ownerName. These fields are lost on cloud fetch — data loss when user logs in on another device.',
    'Critical');

  log('Event Templates: Missing birthday/brit/family types', 'WARN',
    'getSideLabels handles יום הולדת, ברית, משפחה type strings but no templates exist for them. Users creating these events must manually change the type dropdown.',
    'Low');

  log('Bar Mitzvah: Template picker label vs stored type mismatch', 'WARN',
    'Template picker shows "בר / בת מצווה" but always creates type "בר מצווה". A bat mitzvah event will be tagged "בר מצווה" in the dashboard card.',
    'Low');

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('FINAL QA RESULTS — ALL CHECKS');
  console.log('════════════════════════════════════════════════════════════════');
  results.forEach((r, i) => {
    const icon = r.result === 'PASS' ? '✓' : r.result === 'FAIL' ? '✗' : '⚠';
    console.log(`${icon} [${r.result.padEnd(5)}] [${(r.severity||'—').padEnd(8)}] ${r.area}`);
    if (r.issue !== '—') console.log(`              └─ ${r.issue}`);
  });

  const total = results.length;
  const pass  = results.filter(r => r.result === 'PASS').length;
  const fail  = results.filter(r => r.result === 'FAIL').length;
  const warn  = results.filter(r => r.result === 'WARN').length;
  console.log(`\n── SUMMARY ────────────────────────────────────────────────────────`);
  console.log(`Total: ${total} | PASS: ${pass} | FAIL: ${fail} | WARN: ${warn}`);

  await mCtx.close();
  await browser.close();
  console.log('\nQA run complete. Screenshots in /tmp/qa_screenshots/');
})();
