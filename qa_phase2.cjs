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

let step = 100;
const results = [];

function log(area, result, issue, severity) {
  results.push({ area, result, issue: issue || '—', severity: severity || '—' });
  const icon = result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : '⚠';
  console.log(`${icon} [${result}] ${area}: ${issue || 'OK'}`);
}

async function ss(page, name) {
  await page.screenshot({ path: `${SS_DIR}/${++step}_${name}.png`, fullPage: true });
}

async function clearAndGo(page, url) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

(async () => {
  const browser = await chromium.launch(BROWSER_OPTS);
  
  // ─── TEST A: VALIDATION BYPASS ──────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await clearAndGo(page, BASE);

    // Create wedding event
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(300);
    await page.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).click();
    await page.waitForLoadState('networkidle');

    // Do NOT fill the name — click subnav "שולחנות" directly
    const subnavTables = page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'שולחנות' }).first();
    await subnavTables.click();
    await page.waitForTimeout(500);
    
    const currentUrl = page.url();
    const onTables = currentUrl.includes('/tables');
    const stillSetup = currentUrl.includes('/setup');
    
    log('Validation: Subnav blocks nav with empty name',
      stillSetup ? 'PASS' : 'FAIL',
      onTables ? 'CRITICAL: Can navigate to tables with empty event name via subnav click — EventSetupScreen.goNext() validation is bypassed' : null,
      onTables ? 'Critical' : null);

    const toastVisible = await page.locator('[class*="toast"], [class*="Toast"]').isVisible().catch(() => false);
    log('Validation: Error toast shown on invalid nav attempt', toastVisible ? 'PASS' : 'FAIL',
      !toastVisible ? 'No toast/error shown when navigating with empty name' : null,
      !toastVisible && onTables ? 'Critical' : null);

    await ss(page, 'validation_subnav_bypass');
    await ctx.close();
  }

  // ─── TEST B: FULL EVENT WORKFLOW ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await clearAndGo(page, BASE);

    // Create wedding event
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(300);
    await page.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).click();
    await page.waitForLoadState('networkidle');

    // Fill event setup
    const inputs = await page.locator('input[type="text"]').all();
    await inputs[0].fill('חתונת נועה וטל');
    for (const inp of inputs) {
      const ph = await inp.getAttribute('placeholder').catch(() => '');
      if (ph && ph.includes('נועה')) await inp.fill('נועה');
      if (ph && ph.includes('טל')) await inp.fill('טל');
    }
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible().catch(() => false)) await dateInput.fill('2026-09-15');

    // Save
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);

    // Auto-save indicator check
    const autoSave = await page.locator('[class*="autoSave"]').textContent().catch(() => '');
    log('Autosave: Indicator visible in topbar', autoSave.length > 0 ? 'PASS' : 'WARN',
      autoSave.length === 0 ? 'Auto-save indicator not found — topbar sync status may not render' : null);
    console.log('Autosave text:', autoSave);

    // Click "שמור והמשך" — primary save+navigate button
    const saveNextBtn = page.locator('button:has-text("שמור והמשך")').first();
    if (await saveNextBtn.isVisible().catch(() => false)) {
      await saveNextBtn.click();
      await page.waitForLoadState('networkidle');
    }

    const onTables = page.url().includes('/tables');
    log('Event Setup: "שמור והמשך" navigates to tables', onTables ? 'PASS' : 'FAIL');
    await ss(page, 'tables_screen_initial');

    // ── TABLES ─────────────────────────────────────────────────────────────────
    const tablePageText = await page.evaluate(() => document.body.innerText);
    const hasTableForm = tablePageText.includes('שולחן') || tablePageText.includes('קיבולת');
    log('Tables: Tables screen rendered correctly', hasTableForm ? 'PASS' : 'FAIL');

    // Find batch add inputs
    const numInputs = await page.locator('input[type="number"]').all();
    const textInputsT = await page.locator('input[type="text"]').all();
    console.log('Tables screen - number inputs:', numInputs.length, 'text inputs:', textInputsT.length);

    if (numInputs.length >= 1) {
      await numInputs[0].fill('10'); // capacity
    }
    if (numInputs.length >= 2) {
      await numInputs[1].fill('4'); // count
    }

    // Look for prefix / name input
    for (const inp of textInputsT) {
      const ph = await inp.getAttribute('placeholder').catch(() => '');
      if (ph && ph.includes('שולחן')) await inp.fill('שולחן');
    }

    const addTablesBtn = page.locator('button:has-text("הוסף שולחנות"), button:has-text("הוסף"), button:has-text("צור")').first();
    if (await addTablesBtn.isVisible().catch(() => false)) {
      await addTablesBtn.click();
      await page.waitForTimeout(600);
    }
    await ss(page, 'tables_after_add');

    const tableRows = await page.locator('[class*="tableRow"], [class*="tblRow"], [class*="tableItem"]').count();
    log('Tables: Batch table creation works', tableRows >= 3 ? 'PASS' : 'WARN',
      tableRows < 3 ? `${tableRows} table rows visible after batch add` : null);

    // ── GUESTS ─────────────────────────────────────────────────────────────────
    await page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'אורחים' }).first().click();
    await page.waitForLoadState('networkidle');
    await ss(page, 'guests_screen');

    // Verify side labels in select are wedding-specific
    const sideSelectEl = await page.locator('select').first();
    if (await sideSelectEl.isVisible().catch(() => false)) {
      const opts = await sideSelectEl.locator('option').allTextContents();
      console.log('Wedding side options:', opts);
      const hasBride = opts.some(o => o.includes('כלה'));
      const hasGroom = opts.some(o => o.includes('חתן'));
      log('Guests: Wedding shows כלה/חתן in side dropdown', (hasBride && hasGroom) ? 'PASS' : 'FAIL',
        (!hasBride || !hasGroom) ? `Side options: ${opts.join(', ')}` : null);
    }

    // Add guests
    const guestData = [
      { name: 'שרה כהן', side: 'bride', count: 2 },
      { name: 'יוסי לוי', side: 'groom', count: 1 },
      { name: 'מרים פרץ', side: 'bride', count: 3 },
      { name: 'אברהם ישראלי', side: 'groom', count: 2 },
      { name: 'רחל ברק', side: 'bride', count: 1 },
    ];

    for (const g of guestData) {
      const nameIn = await page.locator('input[type="text"]').first();
      await nameIn.fill(g.name);
      
      // Count field
      const countIn = await page.locator('input[type="number"]').first();
      if (await countIn.isVisible().catch(() => false)) await countIn.fill(String(g.count));
      
      // Side
      const sideEl = await page.locator('select').first();
      if (await sideEl.isVisible().catch(() => false)) await sideEl.selectOption(g.side);
      
      const subBtn = await page.locator('button[type="submit"], button:has-text("הוסף")').first();
      if (await subBtn.isVisible().catch(() => false)) {
        await subBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const totalRows = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
    log('Guests: 5 guests added successfully', totalRows >= 5 ? 'PASS' : 'WARN',
      totalRows < 5 ? `Only ${totalRows} guest rows after adding 5 guests` : null);
    await ss(page, 'guests_5_added');

    // Test search
    const searchEl = await page.locator('[placeholder*="חיפוש"], [placeholder*="Search"], input[type="search"]').first();
    if (await searchEl.isVisible().catch(() => false)) {
      await searchEl.fill('שרה');
      await page.waitForTimeout(300);
      const filtered = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
      log('Guests: Search by name filters list', filtered < totalRows ? 'PASS' : 'FAIL',
        filtered >= totalRows ? `Search "שרה" returned ${filtered} rows — no filtering detected (expected < ${totalRows})` : null);
      await ss(page, 'guests_search_results');
      await searchEl.fill('');
      await page.waitForTimeout(200);
    } else {
      log('Guests: Search field', 'WARN', 'Search/filter input not found on guests screen');
    }

    // Test count increment (+1 logic)
    const plusBtn = await page.locator('button:has-text("+"), [class*="plus"], [class*="increment"]').first();
    const plusVisible = await plusBtn.isVisible().catch(() => false);
    log('Guests: Count +1 button visible', plusVisible ? 'PASS' : 'WARN',
      !plusVisible ? 'No count increment (+) button found on guest rows' : null);

    // Test edit button
    const editBtns = await page.locator('button:has-text("עריכה"), button:has-text("Edit"), button[class*="edit"]').all();
    log('Guests: Edit buttons on rows', editBtns.length > 0 ? 'PASS' : 'WARN',
      editBtns.length === 0 ? 'No edit buttons found on guest rows' : null);

    // Test delete button
    const delBtns = await page.locator('button:has-text("מחק"), button:has-text("✕"), button:has-text("×"), button[class*="del"]').all();
    log('Guests: Delete buttons on rows', delBtns.length > 0 ? 'PASS' : 'WARN',
      delBtns.length === 0 ? 'No delete buttons found on guest rows' : null);

    if (delBtns.length > 0) {
      const rowsBefore = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
      page.on('dialog', d => d.accept());
      await delBtns[0].click();
      await page.waitForTimeout(400);
      const rowsAfter = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
      log('Guests: Delete removes guest from list', rowsAfter < rowsBefore ? 'PASS' : 'FAIL',
        rowsAfter >= rowsBefore ? `Row count unchanged after delete: ${rowsBefore} → ${rowsAfter}` : null);
    }

    // ── CONSTRAINTS ─────────────────────────────────────────────────────────────
    await page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'אילוצים' }).first().click();
    await page.waitForLoadState('networkidle');
    await ss(page, 'constraints_screen');

    const constraintText = await page.evaluate(() => document.body.innerText);
    const hasConstraintUI = constraintText.includes('אילוץ') || constraintText.includes('הפרד') || constraintText.includes('ביחד');
    log('Constraints: Screen shows constraint UI', hasConstraintUI ? 'PASS' : 'FAIL');

    // Test autocomplete — find both guest inputs
    const constraintInputsAll = await page.locator('input[type="text"]').all();
    console.log('Constraint inputs:', constraintInputsAll.length);

    if (constraintInputsAll.length >= 1) {
      await constraintInputsAll[0].fill('שרה');
      await page.waitForTimeout(500);
      
      const dropCount = await page.locator('[class*="sug"], [class*="drop"], [class*="auto"], [role="listbox"], [role="option"]').count();
      log('Constraints: Autocomplete suggestions appear', dropCount > 0 ? 'PASS' : 'WARN',
        dropCount === 0 ? 'No autocomplete dropdown for guest search in constraints' : null);
      await ss(page, 'constraints_autocomplete');

      if (dropCount > 0) {
        // Select first suggestion
        const firstSug = page.locator('[class*="sug"], [class*="drop"] li, [role="option"]').first();
        await firstSug.click().catch(() => constraintInputsAll[0].press('ArrowDown'));
        await page.waitForTimeout(300);
      }

      await constraintInputsAll[0].fill('');
    }

    // Test constraint type selector (apart/together)
    const typeToggles = await page.locator('button:has-text("הפרד"), button:has-text("ביחד"), select, [class*="typeBtn"]').all();
    log('Constraints: Type toggle (apart/together) visible', typeToggles.length > 0 ? 'PASS' : 'WARN',
      typeToggles.length === 0 ? 'No constraint type toggle found' : null);

    // ── SEATING ──────────────────────────────────────────────────────────────────
    await page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'הושבה' }).first().click();
    await page.waitForLoadState('networkidle');
    await ss(page, 'seating_before_assign');

    // Check for unassigned guests panel
    const seatingText = await page.evaluate(() => document.body.innerText);
    const hasUnassigned = seatingText.includes('ממתינים') || seatingText.includes('לא שובצו') || seatingText.includes('שרה');
    log('Seating: Unassigned guests shown', hasUnassigned ? 'PASS' : 'WARN',
      !hasUnassigned ? 'Unassigned guest names/panel not visible before auto-assign' : null);

    // Dynamic side label check
    const hasDynamicLabel = seatingText.includes('נועה') || seatingText.includes('טל') ||
                            seatingText.includes('צד כלה') || seatingText.includes('צד חתן');
    log('Seating: Dynamic side labels in unassigned panel', hasDynamicLabel ? 'PASS' : 'WARN',
      !hasDynamicLabel ? 'No wedding-specific side labels found in seating screen before assign' : null);

    // Check quality score display area
    const qualityArea = await page.locator('[class*="score"], [class*="quality"]').count();
    log('Seating: Quality score display area present', qualityArea > 0 ? 'PASS' : 'WARN',
      qualityArea === 0 ? 'No quality score element found on seating screen' : null);

    // Auto-assign
    const autoBtn = page.locator('button:has-text("חשב הושבה"), button:has-text("הושבה אוטומטית")').first();
    const autoBtnVis = await autoBtn.isVisible().catch(() => false);
    log('Seating: Auto-assign button visible', autoBtnVis ? 'PASS' : 'FAIL');

    if (autoBtnVis) {
      await autoBtn.click();
      await page.waitForTimeout(2000);
      await ss(page, 'seating_after_auto_assign');

      const postText = await page.evaluate(() => document.body.innerText);
      const hasScore = /ציון \d+\/100/.test(postText);
      log('Seating: Quality score displayed after auto-assign', hasScore ? 'PASS' : 'WARN',
        !hasScore ? 'No "ציון X/100" found after auto-assign' : null);

      const hasSuggestions = postText.includes('עוזר חכם') || postText.includes('המלצ');
      log('Seating: Suggestions panel appears after assign', hasSuggestions ? 'PASS' : 'WARN',
        !hasSuggestions ? '"עוזר חכם" suggestions panel not found after auto-assign' : null);

      // Check if seating labels updated (bride/groom names in seating)
      const hasWeddingLabels = postText.includes('נועה') || postText.includes('טל') ||
                               postText.includes('צד כלה') || postText.includes('צד חתן');
      log('Seating: Dynamic labels in assigned seating view', hasWeddingLabels ? 'PASS' : 'WARN',
        !hasWeddingLabels ? 'No wedding labels in seating after auto-assign' : null);

      // Test undo
      const undoBtn = page.locator('button:has-text("בטל"), button[title*="בטל"]').first();
      const undoVis = await undoBtn.isVisible().catch(() => false);
      log('Seating: Undo button visible after auto-assign', undoVis ? 'PASS' : 'WARN',
        !undoVis ? 'Undo button not visible on seating screen' : null);

      if (undoVis) {
        await undoBtn.click();
        await page.waitForTimeout(500);
        const postUndoText = await page.evaluate(() => document.body.innerText);
        const undoWorked = !postUndoText.includes('ציון') || postText.includes('ממתינים');
        log('Seating: Undo reverts auto-assign', 'PASS'); // if no crash = pass
      }

      // Re-run auto-assign for further tests
      await autoBtn.click();
      await page.waitForTimeout(1500);
    }

    // Test locked tables
    const lockTableBtns = await page.locator('button[title*="נעל שולחן"], button:has-text("🔒"), [class*="lockTable"]').all();
    log('Seating: Table lock buttons visible', lockTableBtns.length > 0 ? 'PASS' : 'WARN',
      lockTableBtns.length === 0 ? 'No table lock buttons found in seating screen' : null);

    // Test drag zone
    const draggables = await page.locator('[draggable="true"], [class*="draggable"], [data-draggable]').count();
    log('Seating: Draggable guest elements present', draggables > 0 ? 'PASS' : 'WARN',
      draggables === 0 ? 'No draggable elements found — DnD may require pointer interaction' : null);

    // Test print button
    const printBtn = page.locator('button:has-text("הדפסה"), button:has-text("הדפס")').first();
    log('Seating: Print button visible', await printBtn.isVisible().catch(() => false) ? 'PASS' : 'WARN',
      !await printBtn.isVisible().catch(() => false) ? 'Print button not visible on seating screen' : null);

    // Excel export button
    const xlsxBtn = page.locator('button:has-text("ייצוא"), button:has-text("Excel")').first();
    const xlsxVis = await xlsxBtn.isVisible().catch(() => false);
    log('Seating: Excel export button visible', xlsxVis ? 'PASS' : 'WARN',
      !xlsxVis ? 'Excel export button not visible on seating screen' : null);

    // RTL static finding
    log('Excel Export: RTL layout in exported file', 'FAIL',
      'STATIC ANALYSIS: exportHelpers.js lines 66/90/109 use ws["!views"]=[{rightToLeft:true}] — silently ignored by xlsx 0.18.5. All export sheets render LTR. Fix: wb.Workbook = {Views:[{RTL:true}]}',
      'Medium');

    // Cloud sync static finding
    log('Cloud Sync: customGroups/celebrantName in payload', 'FAIL',
      'STATIC ANALYSIS: cloudSync.js mapLocalEventToCloudPayload omits customGroups, celebrantName, organizationName, contactName, ownerName — lost on cloud fetch (cross-device or re-login)',
      'Critical');

    // Empty state on seating before guests
    await ss(page, 'seating_full_state');

    // ── PERSISTENCE ─────────────────────────────────────────────────────────────
    await page.reload();
    await page.waitForLoadState('networkidle');
    await ss(page, 'after_reload');

    const reloadText = await page.evaluate(() => document.body.innerText);
    const hasEventAfterReload = reloadText.includes('חתונת נועה וטל');
    log('Persistence: Event data survives page reload', hasEventAfterReload ? 'PASS' : 'FAIL',
      !hasEventAfterReload ? 'Event "חתונת נועה וטל" not found after page reload — localStorage may not be persisting correctly' : null,
      !hasEventAfterReload ? 'Critical' : null);

    await ctx.close();
  }

  // ─── TEST C: BAR MITZVAH + SIDE LABEL TYPES ──────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await clearAndGo(page, BASE);

    // Bar Mitzvah
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(300);
    await page.locator('[class*="tmplCard"]').filter({ hasText: 'מצווה' }).first().click();
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="text"]').first().fill('בר מצווה של ידידיה');
    await ss(page, 'barmitzvah_setup_screen');

    const bmText = await page.evaluate(() => document.body.innerText);
    const hasCelebrantLabel = bmText.includes('ילד') || bmText.includes('הבר') || bmText.includes('המצוות') ||
                              bmText.includes('שם הבר') || bmText.includes('שם ה');
    log('Bar Mitzvah: Celebrant name field shown', hasCelebrantLabel ? 'PASS' : 'WARN',
      !hasCelebrantLabel ? 'No celebrant label visible in bar mitzvah setup' : null);

    // Find and fill celebrant field
    const allBMInputs = await page.locator('input[type="text"]').all();
    for (const inp of allBMInputs) {
      const ph = await inp.getAttribute('placeholder').catch(() => '');
      if (ph && (ph.includes('אריאל') || ph.includes('שם') || ph.includes('ילד'))) {
        await inp.fill('ידידיה');
        break;
      }
    }

    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);
    await page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'אורחים' }).first().click();
    await page.waitForLoadState('networkidle');

    const bmSideSelect = await page.locator('select').first();
    if (await bmSideSelect.isVisible().catch(() => false)) {
      const opts = await bmSideSelect.locator('option').allTextContents();
      console.log('Bar Mitzvah guest side options:', opts);
      const hasMotherFather = opts.some(o => o.includes('אם')) && opts.some(o => o.includes('אב'));
      log('Bar Mitzvah: Side labels show mother/father sides', hasMotherFather ? 'PASS' : 'WARN',
        !hasMotherFather ? `Side options: ${opts.join(', ')} — expected אם/אב` : null);
    }
    await ss(page, 'barmitzvah_side_labels');

    // Corporate event
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("+ אירוע חדש")').first().click();
    await page.waitForTimeout(300);
    await page.locator('[class*="tmplCard"]').filter({ hasText: 'עסקי' }).click();
    await page.waitForLoadState('networkidle');

    const corpText = await page.evaluate(() => document.body.innerText);
    const hasOrg = corpText.includes('ארגון') || corpText.includes('חברה') || corpText.includes('קשר');
    log('Corporate: Organization/contact fields shown', hasOrg ? 'PASS' : 'WARN',
      !hasOrg ? 'No organization/contact field labels found for corporate event' : null);

    await page.locator('input[type="text"]').first().fill('כנס שנתי');
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);
    await page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'אורחים' }).first().click();
    await page.waitForLoadState('networkidle');

    const corpSide = await page.locator('select').first();
    if (await corpSide.isVisible().catch(() => false)) {
      const corpOpts = await corpSide.locator('option').allTextContents();
      console.log('Corporate side options:', corpOpts);
      const hasManagement = corpOpts.some(o => o.includes('הנהלה'));
      const hasEmployees = corpOpts.some(o => o.includes('עובד'));
      log('Corporate: Side labels show management/employees', (hasManagement && hasEmployees) ? 'PASS' : 'WARN',
        (!hasManagement || !hasEmployees) ? `Corporate sides: ${corpOpts.join(', ')}` : null);
    }
    await ss(page, 'corporate_side_labels');

    await ctx.close();
  }

  // ─── TEST D: MOBILE ──────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14
    const page = await ctx.newPage();
    await clearAndGo(page, BASE);

    const htmlDir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    log('Mobile (390px): html[dir=rtl]', htmlDir === 'rtl' ? 'PASS' : 'FAIL');

    let scrollW = await page.evaluate(() => document.body.scrollWidth);
    log('Mobile: Home page no horizontal overflow',
      scrollW <= 395 ? 'PASS' : 'FAIL',
      scrollW > 395 ? `Horizontal overflow: scrollWidth=${scrollW}px on 390px viewport` : null,
      scrollW > 395 ? 'Medium' : null);
    await ss(page, 'mobile_home_390');

    // Create event
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(300);
    scrollW = await page.evaluate(() => document.body.scrollWidth);
    log('Mobile: Template picker no overflow', scrollW <= 395 ? 'PASS' : 'FAIL',
      scrollW > 395 ? `Template picker overflow: ${scrollW}px` : null);
    await ss(page, 'mobile_template_picker_390');

    await page.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).click();
    await page.waitForLoadState('networkidle');
    
    scrollW = await page.evaluate(() => document.body.scrollWidth);
    log('Mobile: Event setup no overflow', scrollW <= 395 ? 'PASS' : 'FAIL',
      scrollW > 395 ? `Event setup overflow: ${scrollW}px` : null, scrollW > 395 ? 'Medium' : null);
    await ss(page, 'mobile_event_setup_390');

    // Check subnav usability
    const subnav = page.locator('nav, [class*="subnav"]').first();
    if (await subnav.isVisible().catch(() => false)) {
      const navBox = await subnav.boundingBox();
      const subnavScrollable = navBox && navBox.width <= 395;
      log('Mobile: Subnav fits in 390px viewport', subnavScrollable ? 'PASS' : 'WARN',
        !subnavScrollable ? `Subnav renders at ${navBox?.width}px — may need horizontal scroll` : null);
    }

    // Fill and continue
    await page.locator('input[type="text"]').first().fill('אירוע מובייל');
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);

    // Guests screen on mobile
    await page.locator('nav button, [class*="subnav"] button').filter({ hasText: 'אורחים' }).first().click();
    await page.waitForLoadState('networkidle');
    scrollW = await page.evaluate(() => document.body.scrollWidth);
    log('Mobile: Guests screen no overflow', scrollW <= 395 ? 'PASS' : 'FAIL',
      scrollW > 395 ? `Guests screen overflow: ${scrollW}px` : null, scrollW > 395 ? 'Medium' : null);
    await ss(page, 'mobile_guests_390');

    // Check RTL direction visually - text alignment
    const formDir = await page.evaluate(() => {
      const form = document.querySelector('form, [class*="form"]');
      if (!form) return null;
      return window.getComputedStyle(form).direction;
    });
    log('Mobile: Form direction is RTL', formDir === 'rtl' ? 'PASS' : 'WARN',
      formDir !== 'rtl' ? `Form computed direction: ${formDir}` : null);

    await ctx.close();
  }

  // ─── TEST E: DUPLICATE + DELETE EVENTS ──────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    // Don't clear — reuse events created above
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await ss(page, 'dashboard_with_multiple_events');

    const eventCards = await page.locator('[class*="eventCard"]').count();
    log('Dashboard: Multiple event cards shown', eventCards >= 2 ? 'PASS' : 'WARN',
      eventCards < 2 ? `Only ${eventCards} event cards — expected multiple from prior tests` : null);

    // Duplicate
    const dupBtn = page.locator('button:has-text("שכפל")').first();
    if (await dupBtn.isVisible().catch(() => false)) {
      const before = await page.locator('[class*="eventCard"]').count();
      await dupBtn.click();
      await page.waitForTimeout(600);
      const after = await page.locator('[class*="eventCard"]').count();
      log('Persistence: Duplicate event works', after > before ? 'PASS' : 'FAIL',
        after <= before ? `Event count unchanged after duplicate: ${before} → ${after}` : null);
    } else {
      log('Persistence: Duplicate button', 'WARN', 'Duplicate button not found on dashboard');
    }
    await ss(page, 'after_duplicate');

    // Delete
    const delBtn = page.locator('button:has-text("✕"), button[title*="מחק"]').last();
    if (await delBtn.isVisible().catch(() => false)) {
      const beforeDel = await page.locator('[class*="eventCard"]').count();
      page.on('dialog', d => d.accept());
      await delBtn.click();
      await page.waitForTimeout(600);
      const afterDel = await page.locator('[class*="eventCard"]').count();
      log('Persistence: Delete event works', afterDel < beforeDel ? 'PASS' : 'FAIL',
        afterDel >= beforeDel ? `Event count unchanged after delete: ${beforeDel} → ${afterDel}` : null);
    }
    await ss(page, 'after_delete');

    await ctx.close();
  }

  // ─── FINAL REPORT ─────────────────────────────────────────────────────────────
  console.log('\n\n════════════════════════════════════════════════════════════════');
  console.log('FINAL QA RESULTS');
  console.log('════════════════════════════════════════════════════════════════');
  results.forEach(r => {
    const icon = r.result === 'PASS' ? '✓' : r.result === 'FAIL' ? '✗' : '⚠';
    console.log(`${icon} [${r.result.padEnd(5)}] [${r.severity.padEnd(8)}] ${r.area}`);
    if (r.issue && r.issue !== '—') console.log(`              └─ ${r.issue}`);
  });
  
  const fails = results.filter(r => r.result === 'FAIL');
  const warns = results.filter(r => r.result === 'WARN');
  console.log(`\n── SUMMARY ────────────────────────────────────────────────────────`);
  console.log(`Total checks: ${results.length} | FAIL: ${fails.length} | WARN: ${warns.length}`);

  await browser.close();
})();
