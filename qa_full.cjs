const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BROWSER_OPTS = {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true
};
const BASE = 'http://localhost:5174';
const SS_DIR = '/tmp/qa_screenshots';
fs.mkdirSync(SS_DIR, { recursive: true });

let step = 0;
const results = [];

function log(area, result, issue, severity) {
  results.push({ area, result, issue: issue || '—', severity: severity || '—' });
  console.log(`[${result}] ${area}: ${issue || 'OK'}`);
}

async function ss(page, name) {
  await page.screenshot({ path: `${SS_DIR}/${++step}_${name}.png`, fullPage: false });
}

async function clearStorage(page) {
  await page.evaluate(() => localStorage.clear());
}

(async () => {
  const browser = await chromium.launch(BROWSER_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('JS ERROR:', m.text()); });

  // ─── 1. INITIAL LOAD / GUEST MODE ─────────────────────────────────────────
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await ss(page, 'home_empty');

  // Should show onboarding + "הצטרף חינם" button
  const signupLink = await page.$('a[href="/signup"]');
  log('Auth: Guest mode UI', signupLink ? 'PASS' : 'FAIL', signupLink ? null : '"הצטרף חינם" link missing');

  const onboarding = await page.locator('text=כוכב השולחן').first().isVisible();
  log('Auth: Guest onboarding visible', onboarding ? 'PASS' : 'FAIL');

  // ─── 2. SIGNUP SCREEN ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');
  await ss(page, 'signup_screen');

  const signupTitle = await page.locator('h1').textContent().catch(() => '');
  log('Auth: Signup screen loads', signupTitle.includes('הרשמה') ? 'PASS' : 'FAIL');

  // Supabase not configured in test env → form should be disabled
  const submitDisabled = await page.$eval('button[type="submit"]', b => b.disabled).catch(() => null);
  log('Auth: Signup disabled when Supabase unconfigured', submitDisabled === true ? 'PASS' : 'FAIL',
    submitDisabled !== true ? 'Submit button not disabled — could allow signup without backend' : null);

  const noticeWarn = await page.locator('[class*="noticeWarn"]').isVisible().catch(() => false);
  log('Auth: Signup shows config warning', noticeWarn ? 'PASS' : 'FAIL');

  // ─── 3. LOGIN SCREEN ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await ss(page, 'login_screen');

  const loginTitle = await page.locator('h1').textContent().catch(() => '');
  log('Auth: Login screen loads', loginTitle.includes('כניסה') ? 'PASS' : 'FAIL');

  // ─── 4. BACK TO DASHBOARD → CREATE EVENT ──────────────────────────────────
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await clearStorage(page);
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Click "צור אירוע ראשון"
  await page.locator('text=צור אירוע ראשון').click();
  await ss(page, 'template_picker');

  const tmplPicker = await page.locator('text=באיזה אירוע מדובר').isVisible();
  log('Event Creation: Template picker opens', tmplPicker ? 'PASS' : 'FAIL');

  // Check all main templates are shown
  const tmplTexts = await page.locator('[class*="tmplCard"]').allTextContents();
  console.log('Templates shown:', tmplTexts);
  const hasWedding   = tmplTexts.some(t => t.includes('חתונה'));
  const hasBarMitzvah = tmplTexts.some(t => t.includes('מצווה'));
  const hasHenna     = tmplTexts.some(t => t.includes('חינה'));
  const hasCorporate = tmplTexts.some(t => t.includes('עסקי'));
  log('Event Creation: Wedding template exists', hasWedding ? 'PASS' : 'FAIL');
  log('Event Creation: Bar Mitzvah template exists', hasBarMitzvah ? 'PASS' : 'FAIL');
  log('Event Creation: Henna template exists', hasHenna ? 'PASS' : 'FAIL');
  log('Event Creation: Corporate template exists', hasCorporate ? 'PASS' : 'FAIL');

  // Check "birthday", "brit", "family" types are absent from template picker
  const hasBirthday = tmplTexts.some(t => t.includes('יום הולדת'));
  const hasBrit = tmplTexts.some(t => t.includes('ברית'));
  const hasFamily = tmplTexts.some(t => t.includes('משפחה'));
  if (!hasBirthday) log('Event Creation: Birthday template', 'MINOR', 'No birthday template in picker — getSideLabels handles יום הולדת but no template exists for it', 'Low');
  if (!hasBrit) log('Event Creation: Brit template', 'MINOR', 'No brit (ברית) template in picker', 'Low');
  if (!hasFamily) log('Event Creation: Family template', 'MINOR', 'No family (משפחה) template in picker — getSideLabels handles this type but no template exists', 'Low');

  // ─── 5. CREATE WEDDING EVENT ───────────────────────────────────────────────
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).click();
  await page.waitForLoadState('networkidle');
  await ss(page, 'event_setup_wedding_new');

  const setupUrl = page.url();
  const inEvent = setupUrl.includes('/events/');
  log('Event Creation: Navigates to event setup', inEvent ? 'PASS' : 'FAIL', inEvent ? null : 'URL: ' + setupUrl);

  // Check wedding-specific fields
  const brideField = await page.locator('[placeholder*="כלה"]').count() +
                     await page.locator('[placeholder*="Bride"]').count() +
                     await page.locator('label:has-text("שם הכלה")').count();
  const groomField = await page.locator('[placeholder*="חתן"]').count() +
                     await page.locator('label:has-text("שם החתן")').count();
  log('Event Creation: Wedding shows bride/groom fields', (brideField > 0 && groomField > 0) ? 'PASS' : 'FAIL',
    (brideField > 0 && groomField > 0) ? null : `brideField=${brideField}, groomField=${groomField}`);

  // ─── 6. VALIDATION - empty name ────────────────────────────────────────────
  // Try to navigate to tables without a name
  const tablesBtn = await page.locator('button:has-text("שולחנות")').first();
  if (tablesBtn) await tablesBtn.click();
  await page.waitForTimeout(300);
  const stillSetup = page.url().includes('setup') || page.url() === setupUrl;
  log('Event Creation: Blocks navigation without name', stillSetup ? 'PASS' : 'FAIL',
    stillSetup ? null : 'Navigated to tables without event name — validation not enforced');
  await ss(page, 'validation_no_name');

  // ─── 7. FILL WEDDING SETUP & SAVE ─────────────────────────────────────────
  const nameInput = await page.locator('input[type="text"]').first();
  await nameInput.fill('חתונת רחל ומשה');

  // Fill bride/groom names if fields exist
  const allInputs = await page.locator('input[type="text"]').all();
  console.log('Text inputs count:', allInputs.length);
  for (const inp of allInputs) {
    const ph = await inp.getAttribute('placeholder').catch(() => '');
    if (ph && ph.includes('כלה')) await inp.fill('רחל');
    if (ph && ph.includes('חתן')) await inp.fill('משה');
  }

  // Fill date
  const dateInput = await page.locator('input[type="date"]').first();
  if (await dateInput.isVisible().catch(() => false)) await dateInput.fill('2026-09-15');

  // Fill venue
  const venueInput = await page.locator('[placeholder*="אולם"]').first();
  if (await venueInput.isVisible().catch(() => false)) await venueInput.fill('אולם הגן הקסום');

  await ss(page, 'event_setup_filled');

  // Save button
  const saveBtn = await page.locator('button:has-text("שמור")').first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(500);
  }

  // Auto-save indicator
  const autoSave = await page.locator('[class*="autoSave"]').textContent().catch(() => '');
  log('Event Creation: Auto-save indicator visible', autoSave.length > 0 ? 'PASS' : 'FAIL',
    autoSave.length === 0 ? 'Auto-save indicator not found in DOM or has no text' : null);
  console.log('Auto-save text:', autoSave);

  // Navigate to tables now (should work)
  await page.locator('button:has-text("שולחנות")').first().click();
  await page.waitForTimeout(500);
  const onTables = page.url().includes('tables') || await page.locator('text=שולחן').isVisible().catch(() => false);
  log('Event Creation: Navigate to tables after name set', onTables ? 'PASS' : 'FAIL');
  await ss(page, 'tables_screen_empty');

  // ─── 8. TABLE MANAGEMENT ───────────────────────────────────────────────────
  // Add tables via batch creator
  const prefixInput = await page.locator('[placeholder*="שולחן"]').first();
  const countInput = await page.locator('input[type="number"]').first();
  if (await prefixInput.isVisible().catch(() => false)) {
    await prefixInput.fill('שולחן');
  }
  if (await countInput.isVisible().catch(() => false)) {
    await countInput.fill('5');
  }

  const addTablesBtn = await page.locator('button:has-text("הוסף שולחנות")').first();
  if (await addTablesBtn.isVisible().catch(() => false)) {
    await addTablesBtn.click();
    await page.waitForTimeout(500);
  }
  await ss(page, 'tables_added');

  const tableItems = await page.locator('[class*="tableRow"], [class*="tableItem"], [class*="tableCard"]').count();
  console.log('Table items visible:', tableItems);
  log('Tables: Batch creation works', tableItems >= 3 ? 'PASS' : 'WARN',
    tableItems < 3 ? `Only ${tableItems} table rows visible after batch add of 5` : null);

  // ─── 9. GUEST MANAGEMENT ───────────────────────────────────────────────────
  await page.locator('button:has-text("אורחים")').first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, 'guests_empty');

  const guestScreen = await page.locator('text=אורחים').isVisible();
  log('Guests: Screen loads', guestScreen ? 'PASS' : 'FAIL');

  // Add a guest manually
  const guestNameInput = await page.locator('[placeholder*="שם"]').first();
  if (await guestNameInput.isVisible().catch(() => false)) {
    await guestNameInput.fill('דוד כהן');
  }

  // Check for side selector (bride/groom)
  const sideSelect = await page.locator('select').first();
  if (await sideSelect.isVisible().catch(() => false)) {
    const sideOptions = await sideSelect.locator('option').allTextContents();
    console.log('Side options:', sideOptions);
    const hasBrideSide = sideOptions.some(o => o.includes('כלה') || o.includes('bride'));
    const hasGroomSide = sideOptions.some(o => o.includes('חתן') || o.includes('groom'));
    log('Guests: Side selector has bride/groom options for wedding', (hasBrideSide && hasGroomSide) ? 'PASS' : 'FAIL',
      (!hasBrideSide || !hasGroomSide) ? `Side options: ${sideOptions.join(', ')}` : null);
  }

  // Try to submit
  const addGuestBtn = await page.locator('button[type="submit"], button:has-text("הוסף"), button:has-text("שמור")').first();
  if (await addGuestBtn.isVisible().catch(() => false)) {
    await addGuestBtn.click();
    await page.waitForTimeout(500);
  }
  await ss(page, 'guest_added');

  const guestRows = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
  log('Guests: Add guest works', guestRows > 0 ? 'PASS' : 'FAIL',
    guestRows === 0 ? 'No guest row visible after adding guest' : null);

  // Add more guests for testing
  const guestsToAdd = [
    { name: 'שרה לוי', side: 'bride', group: 'משפחה' },
    { name: 'יוסף ישראלי', side: 'groom', group: 'חברים' },
    { name: 'מרים פרץ', side: 'bride', group: 'עבודה' },
    { name: 'אברהם ברק', side: 'groom', group: 'משפחה' },
  ];

  for (const g of guestsToAdd) {
    const ni = await page.locator('[placeholder*="שם"]').first();
    if (await ni.isVisible().catch(() => false)) {
      await ni.fill(g.name);
      const btn = await page.locator('button[type="submit"], button:has-text("הוסף")').first();
      if (await btn.isVisible().catch(() => false)) await btn.click();
      await page.waitForTimeout(300);
    }
  }
  await ss(page, 'multiple_guests_added');

  const guestCount = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
  console.log('Guest count after adding several:', guestCount);
  log('Guests: Multiple guests added', guestCount >= 3 ? 'PASS' : 'WARN',
    guestCount < 3 ? `Only ${guestCount} guest rows visible` : null);

  // Test search
  const searchInput = await page.locator('[placeholder*="חיפוש"], [placeholder*="search"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('דוד');
    await page.waitForTimeout(300);
    const filteredRows = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
    log('Guests: Search filters results', filteredRows < guestCount ? 'PASS' : 'FAIL',
      filteredRows >= guestCount ? `Search for "דוד" returned ${filteredRows}/${guestCount} — no filtering detected` : null);
    await searchInput.fill('');
    await page.waitForTimeout(200);
  } else {
    log('Guests: Search input', 'WARN', 'Search input not found on guest screen');
  }
  await ss(page, 'guest_search');

  // ─── 10. CONSTRAINTS ───────────────────────────────────────────────────────
  await page.locator('button:has-text("אילוצים")').first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, 'constraints_screen');

  const constraintScreen = await page.locator('[class*="constraint"], text=אילוצים').first().isVisible().catch(() => false);
  log('Constraints: Screen loads', constraintScreen ? 'PASS' : 'FAIL');

  // Test guest autocomplete
  const constraintInput = await page.locator('[placeholder*="שם"], input[type="text"]').first();
  if (await constraintInput.isVisible().catch(() => false)) {
    await constraintInput.fill('דוד');
    await page.waitForTimeout(400);
    const suggestions = await page.locator('[class*="suggestion"], [class*="dropdown"] li, [role="option"]').count();
    log('Constraints: Autocomplete shows suggestions', suggestions > 0 ? 'PASS' : 'WARN',
      suggestions === 0 ? 'No autocomplete dropdown appeared for guest search' : null);
    await ss(page, 'constraints_autocomplete');
  }

  // ─── 11. SEATING SCREEN ────────────────────────────────────────────────────
  await page.locator('button:has-text("הושבה")').first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, 'seating_screen');

  const seatingScreen = await page.locator('[class*="seating"], text=הושבה').first().isVisible().catch(() => false);
  log('Seating: Screen loads', seatingScreen ? 'PASS' : 'FAIL');

  // Check auto-assign button
  const autoBtn = await page.locator('button:has-text("חשב הושבה"), button:has-text("השבה אוטומטית"), button:has-text("חשב")').first();
  const autoBtnVisible = await autoBtn.isVisible().catch(() => false);
  log('Seating: Auto-assign button visible', autoBtnVisible ? 'PASS' : 'FAIL');

  if (autoBtnVisible) {
    await autoBtn.click();
    await page.waitForTimeout(1000);
    await ss(page, 'seating_after_auto');

    const qualityScore = await page.locator('[class*="scoreChip"], text=/ציון \d+\/100/').first().isVisible().catch(() => false);
    log('Seating: Quality score shown after auto-assign', qualityScore ? 'PASS' : 'FAIL',
      !qualityScore ? 'Quality score chip not visible after auto-assign' : null);

    const suggestionsPanel = await page.locator('[class*="panel"], text=עוזר חכם').first().isVisible().catch(() => false);
    log('Seating: Suggestions panel visible', suggestionsPanel ? 'PASS' : 'FAIL');
  }

  // Dynamic side labels — check if "צד כלה" or bride name appears in seating
  const seatingText = await page.evaluate(() => document.body.innerText);
  const hasSideLabel = seatingText.includes('צד כלה') || seatingText.includes('צד חתן') ||
                       seatingText.includes('רחל') || seatingText.includes('משה');
  log('Seating: Dynamic side labels present', hasSideLabel ? 'PASS' : 'WARN',
    !hasSideLabel ? 'Could not find expected bride/groom side labels in seating screen text' : null);

  // Check undo button
  const undoBtn = await page.locator('button:has-text("בטל"), button[title*="בטל"]').first();
  const undoVisible = await undoBtn.isVisible().catch(() => false);
  log('Seating: Undo button visible', undoVisible ? 'PASS' : 'WARN',
    !undoVisible ? 'Undo button not found on seating screen' : null);

  await ss(page, 'seating_full');

  // ─── 12. REFRESH PERSISTENCE ───────────────────────────────────────────────
  const urlBeforeRefresh = page.url();
  await page.reload();
  await page.waitForLoadState('networkidle');
  const urlAfterRefresh = page.url();
  // Should return to dashboard after refresh (SPA state lost, restored from localStorage)
  const eventName = await page.locator('text=חתונת רחל ומשה').isVisible().catch(() => false);
  log('Persistence: Event name survives refresh', eventName ? 'PASS' : 'FAIL',
    !eventName ? 'Event name "חתונת רחל ומשה" not visible after page refresh' : null);
  await ss(page, 'after_refresh');

  // ─── 13. DASHBOARD EVENT CARD ─────────────────────────────────────────────
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await ss(page, 'dashboard_with_event');

  const eventCard = await page.locator('text=חתונת רחל ומשה').isVisible().catch(() => false);
  log('Dashboard: Event card shown after creation', eventCard ? 'PASS' : 'FAIL');

  const eventStats = await page.locator('[class*="statTile"]').count();
  log('Dashboard: Stats bar visible with events', eventStats > 0 ? 'PASS' : 'FAIL',
    eventStats === 0 ? 'Stats bar not visible on dashboard' : null);

  // ─── 14. CREATE BAR MITZVAH EVENT ─────────────────────────────────────────
  await page.locator('button:has-text("+ אירוע חדש")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'מצווה' }).first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, 'barmitzvah_setup');

  // Check for bar mitzvah specific field (celebrant name)
  const celebrantField = await page.locator('[placeholder*="שם"], label:has-text("שם ה"), input').all();
  const pageText = await page.evaluate(() => document.body.innerText);
  const hasCelebrantField = pageText.includes('ילד') || pageText.includes('ילדה') || 
                             pageText.includes('בר מצווה') || pageText.includes('מצוות');
  log('Event Creation: Bar Mitzvah has celebrant/person field', hasCelebrantField ? 'PASS' : 'WARN',
    !hasCelebrantField ? 'No celebrant-specific field found for bar mitzvah event type' : null);

  // Check event type label
  const typeText = await page.locator('[class*="type"], select option:checked').first().textContent().catch(() => '');
  console.log('Event type text:', typeText);
  
  await ss(page, 'barmitzvah_fields');

  // Go back to dashboard
  await page.locator('[class*="bcBack"], button:has-text("← כל האירועים")').first().click();
  await page.waitForLoadState('networkidle');

  // ─── 15. CREATE CORPORATE EVENT ───────────────────────────────────────────
  await page.locator('button:has-text("+ אירוע חדש")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'עסקי' }).first().click();
  await page.waitForLoadState('networkidle');
  await ss(page, 'corporate_setup');

  const corpText = await page.evaluate(() => document.body.innerText);
  const hasOrgField = corpText.includes('ארגון') || corpText.includes('חברה') || corpText.includes('organization');
  log('Event Creation: Corporate has organization field', hasOrgField ? 'PASS' : 'WARN',
    !hasOrgField ? 'No organization-specific field visible for corporate event type' : null);

  // ─── 16. HENNA EVENT SIDE LABELS ─────────────────────────────────────────
  await page.locator('[class*="bcBack"], button:has-text("← כל האירועים")').first().click();
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("+ אירוע חדש")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="tmplCard"]').filter({ hasText: 'חינה' }).first().click();
  await page.waitForLoadState('networkidle');

  // Fill event name and go to seating to check side labels
  const hennaNameInput = await page.locator('input[type="text"]').first();
  await hennaNameInput.fill('חינת נוגה');
  await page.waitForTimeout(300);

  // Navigate to guests to check side selector labels
  await page.locator('button:has-text("אורחים")').first().click();
  await page.waitForLoadState('networkidle');
  const hennaSideSelect = await page.locator('select').first();
  if (await hennaSideSelect.isVisible().catch(() => false)) {
    const hennaOpts = await hennaSideSelect.locator('option').allTextContents();
    console.log('Henna side options:', hennaOpts);
    const hasGenericSide = hennaOpts.some(o => o.includes('צד א') || o.includes('צד ב'));
    const hasWeddingSide = hennaOpts.some(o => o.includes('כלה') || o.includes('חתן'));
    log('Event Creation: Henna side labels are generic (not wedding-specific)',
      (hasGenericSide && !hasWeddingSide) ? 'PASS' :
      (!hasGenericSide && !hasWeddingSide) ? 'WARN' : 'PASS',
      hasWeddingSide ? 'Henna event shows wedding bride/groom labels — should be generic' :
      (!hasGenericSide) ? `Unexpected side options for henna: ${hennaOpts.join(', ')}` : null);
  }
  await ss(page, 'henna_side_options');

  // ─── 17. EXCEL EXPORT ──────────────────────────────────────────────────────
  // Go back to wedding event for export test
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await ss(page, 'dashboard_multiple_events');

  const eventCards = await page.locator('[class*="eventCard"]').all();
  console.log('Event cards on dashboard:', eventCards.length);
  log('Dashboard: Multiple events shown', eventCards.length >= 2 ? 'PASS' : 'WARN',
    eventCards.length < 2 ? `Only ${eventCards.length} event cards visible` : null);

  // Open first event (wedding)
  await page.locator('button:has-text("פתח לניהול")').first().click();
  await page.waitForLoadState('networkidle');

  // Go to seating
  await page.locator('button:has-text("הושבה")').first().click();
  await page.waitForLoadState('networkidle');

  // Test Excel export
  const exportBtns = await page.locator('button:has-text("ייצוא"), button:has-text("Excel"), button:has-text("אקסל")').all();
  console.log('Export buttons found:', exportBtns.length);

  if (exportBtns.length > 0) {
    // Set up download listener
    const [download] = await Promise.all([
      ctx.waitForEvent('download'),
      exportBtns[0].click()
    ]).catch(async () => {
      console.log('Export download not triggered as file download');
      return [null];
    });

    if (download) {
      const exportPath = `/tmp/qa_export_${Date.now()}.xlsx`;
      await download.saveAs(exportPath);
      const fileSize = fs.statSync(exportPath).size;
      log('Excel Export: File downloads successfully', fileSize > 100 ? 'PASS' : 'FAIL',
        fileSize <= 100 ? `Export file too small: ${fileSize} bytes` : null);
      console.log('Export file size:', fileSize);
    } else {
      log('Excel Export: Download triggered', 'WARN', 'Download event not captured — may use direct XLSX.writeFile instead of blob download');
    }
  } else {
    log('Excel Export: Export button visible', 'WARN', 'No export button found on seating screen');
  }
  await ss(page, 'seating_with_export');

  // ─── 18. GUEST TEMPLATE DOWNLOAD ──────────────────────────────────────────
  await page.locator('button:has-text("אורחים")').first().click();
  await page.waitForLoadState('networkidle');

  const tmplBtn = await page.locator('button:has-text("הורד תבנית"), button:has-text("תבנית Excel"), a:has-text("תבנית")').first();
  const tmplBtnVisible = await tmplBtn.isVisible().catch(() => false);
  log('Excel: Guest template download button visible', tmplBtnVisible ? 'PASS' : 'WARN',
    !tmplBtnVisible ? 'Guest template download button not found' : null);
  await ss(page, 'guests_with_template_btn');

  // ─── 19. DUPLICATE EVENT ─────────────────────────────────────────────────
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');

  const dupBtn = await page.locator('button:has-text("שכפל")').first();
  const dupVisible = await dupBtn.isVisible().catch(() => false);
  log('Persistence: Duplicate event button visible', dupVisible ? 'PASS' : 'FAIL');

  if (dupVisible) {
    const countBefore = await page.locator('[class*="eventCard"]').count();
    await dupBtn.click();
    await page.waitForTimeout(500);
    const countAfter = await page.locator('[class*="eventCard"]').count();
    log('Persistence: Duplicate event creates new card', countAfter > countBefore ? 'PASS' : 'FAIL',
      countAfter <= countBefore ? `Card count unchanged after duplicate: ${countBefore} → ${countAfter}` : null);
  }
  await ss(page, 'after_duplicate');

  // ─── 20. DELETE EVENT ────────────────────────────────────────────────────
  const delBtn = await page.locator('button:has-text("✕"), button[title*="מחק"]').last();
  const delVisible = await delBtn.isVisible().catch(() => false);
  log('Persistence: Delete event button visible', delVisible ? 'PASS' : 'FAIL');

  if (delVisible) {
    const countBeforeDel = await page.locator('[class*="eventCard"]').count();
    page.on('dialog', d => d.accept());
    await delBtn.click();
    await page.waitForTimeout(500);
    const countAfterDel = await page.locator('[class*="eventCard"]').count();
    log('Persistence: Delete event removes card', countAfterDel < countBeforeDel ? 'PASS' : 'FAIL',
      countAfterDel >= countBeforeDel ? `Card count unchanged after delete: ${countBeforeDel} → ${countAfterDel}` : null);
  }
  await ss(page, 'after_delete');

  // ─── 21. MOBILE VIEWPORT ─────────────────────────────────────────────────
  await ctx.close();
  const mCtx = await browser.newContext({ viewport: { width: 375, height: 812 } }); // iPhone SE
  const mPage = await mCtx.newPage();
  await mPage.goto(BASE);
  await mPage.waitForLoadState('networkidle');
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_home.png` });

  // Check RTL direction on html element
  const htmlDir = await mPage.evaluate(() => document.documentElement.getAttribute('dir'));
  log('Mobile: html[dir=rtl] set', htmlDir === 'rtl' ? 'PASS' : 'FAIL',
    htmlDir !== 'rtl' ? `html dir attribute is "${htmlDir}"` : null);

  // Check overflow
  const bodyWidth = await mPage.evaluate(() => document.body.scrollWidth);
  const viewportWidth = 375;
  log('Mobile: No horizontal overflow on home', bodyWidth <= viewportWidth + 5 ? 'PASS' : 'FAIL',
    bodyWidth > viewportWidth + 5 ? `Horizontal overflow: scrollWidth=${bodyWidth} > viewport=${viewportWidth}` : null, 'Medium');

  // Create event on mobile
  await mPage.locator('text=צור אירוע ראשון').click();
  await mPage.waitForTimeout(300);
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_template_picker.png` });

  const mTmplVisible = await mPage.locator('text=באיזה אירוע מדובר').isVisible().catch(() => false);
  log('Mobile: Template picker usable on mobile', mTmplVisible ? 'PASS' : 'FAIL');

  await mPage.locator('[class*="tmplCard"]').filter({ hasText: 'חתונה' }).click();
  await mPage.waitForLoadState('networkidle');
  await mPage.screenshot({ path: `${SS_DIR}/${++step}_mobile_event_setup.png` });

  // Check setup screen on mobile
  const mSetupVisible = await mPage.locator('input[type="text"]').first().isVisible().catch(() => false);
  log('Mobile: Event setup inputs visible', mSetupVisible ? 'PASS' : 'FAIL');

  const mBodyWidth2 = await mPage.evaluate(() => document.body.scrollWidth);
  log('Mobile: No horizontal overflow on event setup', mBodyWidth2 <= viewportWidth + 5 ? 'PASS' : 'FAIL',
    mBodyWidth2 > viewportWidth + 5 ? `Horizontal overflow on event setup: ${mBodyWidth2}px` : null, 'Medium');

  // Check nav on mobile
  const mNav = await mPage.locator('nav, [class*="subnav"]').isVisible().catch(() => false);
  log('Mobile: Navigation visible', mNav ? 'PASS' : 'FAIL');

  await mCtx.close();

  // ─── FINAL REPORT ─────────────────────────────────────────────────────────
  console.log('\n\n=== QA RESULTS ===');
  results.forEach(r => {
    console.log(`${r.result} | ${r.area} | ${r.issue} | ${r.severity}`);
  });

  await browser.close();
})();
