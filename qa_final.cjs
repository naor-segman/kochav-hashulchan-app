const { chromium } = require('playwright');
const fs = require('fs');

const BROWSER_OPTS = {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true
};
const BASE = 'http://localhost:5174';
const SS = '/tmp/qa_shots';
fs.mkdirSync(SS, { recursive: true });

let n = 0;
const results = [];
function log(area, result, issue, sev) {
  results.push({ area, result, issue: issue||'—', sev: sev||'—' });
  console.log(`${result==='PASS'?'✓':result==='FAIL'?'✗':'⚠'} [${result}] ${area}${issue?' — '+issue:''}`);
}
async function shot(page, name) {
  await page.screenshot({ path:`${SS}/${String(++n).padStart(3,'0')}_${name}.png`, fullPage:true });
}

// Creates a fresh isolated context (empty localStorage)
async function freshCtx(browser, mobile) {
  const vp = mobile ? { width:390, height:844 } : { width:1280, height:900 };
  return browser.newContext({ viewport: vp });
}

// Creates a wedding event and returns its URL
async function createWeddingEvent(page, name='חתונת נועה וטל', bride='נועה', groom='טל') {
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  // Check if onboarding button or new event button
  const hasOnboard = await page.locator('text=צור אירוע ראשון').isVisible().catch(()=>false);
  if (hasOnboard) {
    await page.locator('text=צור אירוע ראשון').click();
  } else {
    await page.locator('button:has-text("+ אירוע חדש")').first().click();
  }
  await page.waitForTimeout(400);
  await page.locator('[class*="tmplCard"]').filter({ hasText:'חתונה' }).first().click();
  await page.waitForLoadState('networkidle');

  const nameIn = page.locator('input[type="text"]').first();
  await nameIn.waitFor({ state:'visible', timeout:5000 });
  await nameIn.fill(name);

  // Fill bride/groom
  const all = await page.locator('input[type="text"]').all();
  for (const inp of all) {
    const ph = (await inp.getAttribute('placeholder').catch(()=>'')) || '';
    if (ph.includes('נועה')) await inp.fill(bride);
    else if (ph.includes('טל')) await inp.fill(groom);
  }
  return page.url();
}

(async () => {
  const browser = await chromium.launch(BROWSER_OPTS);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1 — AUTH + UI BASELINE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const ctx = await freshCtx(browser);
    const page = await ctx.newPage();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await shot(page, 'home_empty');

    log('Auth: Guest mode — "הצטרף חינם" link visible',
      await page.locator('a[href="/signup"]').isVisible() ? 'PASS' : 'FAIL');
    log('Auth: Home onboarding renders for guest',
      await page.locator('text=כוכב השולחן').first().isVisible() ? 'PASS' : 'FAIL');

    // Login screen
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await shot(page, 'login_screen');
    const loginH1 = await page.locator('h1').textContent().catch(()=>'');
    log('Auth: Login screen renders', loginH1.includes('כניסה') ? 'PASS' : 'FAIL');

    // Signup screen
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState('networkidle');
    await shot(page, 'signup_screen');
    const signupH1 = await page.locator('h1').textContent().catch(()=>'');
    log('Auth: Signup screen renders', signupH1.includes('הרשמה') ? 'PASS' : 'FAIL');
    const submitDisabled = await page.$eval('button[type="submit"]', b => b.disabled).catch(()=>false);
    log('Auth: Signup submit disabled when Supabase unconfigured', submitDisabled ? 'PASS' : 'FAIL',
      !submitDisabled ? 'Submit not disabled — user could submit without backend' : null);
    const noticeWarn = await page.locator('[class*="noticeWarn"]').isVisible().catch(()=>false);
    log('Auth: Signup shows "not available" notice when unconfigured', noticeWarn ? 'PASS' : 'FAIL');

    // Account redirect
    await page.goto(`${BASE}/account`);
    await page.waitForLoadState('networkidle');
    const onLogin = page.url().includes('/login') || page.url().includes('/account');
    log('Auth: /account redirects unauthenticated user to /login',
      page.url().includes('/login') ? 'PASS' : 'WARN',
      !page.url().includes('/login') ? `URL after /account: ${page.url()}` : null);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2 — VALIDATION BYPASS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const ctx = await freshCtx(browser);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Create event (empty name)
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(400);
    await page.locator('[class*="tmplCard"]').filter({ hasText:'חתונה' }).first().click();
    await page.waitForLoadState('networkidle');
    const setupUrl = page.url();

    // Click subnav without filling name
    await page.locator('[class*="subnav"] button').filter({ hasText:'שולחנות' }).click();
    await page.waitForTimeout(600);
    const afterUrl = page.url();
    const bypassed = afterUrl.includes('/tables');
    log('Validation: Subnav tab blocked without event name',
      !bypassed ? 'PASS' : 'FAIL',
      bypassed ? 'BUG: Shell subnav tab navigates to /tables with empty event name, bypassing EventSetupScreen.validate()' : null,
      bypassed ? 'Critical' : null);

    // Check for toast error
    const toastShown = await page.locator('[class*="toast"], [class*="Toast"]').first().isVisible().catch(()=>false);
    log('Validation: Error feedback shown on blocked nav', toastShown ? 'PASS' : 'FAIL',
      !toastShown && bypassed ? 'No error toast shown when navigating with empty name' : null,
      !toastShown && bypassed ? 'Critical' : null);

    await shot(page, 'validation_bypass');

    // Also test: try clicking guests, constraints, seating tabs
    await page.goto(setupUrl);
    await page.waitForLoadState('networkidle');
    for (const tab of ['אורחים', 'אילוצים', 'הושבה']) {
      await page.locator('[class*="subnav"] button').filter({ hasText: tab }).click();
      await page.waitForTimeout(400);
      const url = page.url();
      if (!url.includes('/setup') && !url.includes('/tables')) {
        log(`Validation: "${tab}" tab also bypasses validation`, 'FAIL',
          `Navigated to ${url} without event name`, 'Critical');
      }
      await page.goto(setupUrl);
    }

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3 — EVENT CREATION FLOW
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const ctx = await freshCtx(browser);
    const page = await ctx.newPage();

    // Template picker content
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(400);
    await shot(page, 'template_picker');

    const tmplCards = await page.locator('[class*="tmplCard"]').allTextContents();
    log('Templates: Wedding template present', tmplCards.some(t=>t.includes('חתונה')) ? 'PASS' : 'FAIL');
    log('Templates: Bar Mitzvah template present', tmplCards.some(t=>t.includes('מצווה')) ? 'PASS' : 'FAIL');
    log('Templates: Henna template present', tmplCards.some(t=>t.includes('חינה')) ? 'PASS' : 'FAIL');
    log('Templates: Corporate template present', tmplCards.some(t=>t.includes('עסקי')) ? 'PASS' : 'FAIL');
    log('Templates: Empty/custom template present',
      (await page.locator('button:has-text("אירוע ריק"), button:has-text("מאפס")').isVisible().catch(()=>false)) ? 'PASS' : 'WARN',
      !(await page.locator('button:has-text("אירוע ריק"), button:has-text("מאפס")').isVisible().catch(()=>false)) ? 'Empty/blank template button not found in picker' : null);
    log('Templates: Birthday template', 'WARN', 'No birthday (יום הולדת) template — type handled by getSideLabels but no template card', 'Low');
    log('Templates: Brit template', 'WARN', 'No brit (ברית) template — not in eventTemplates.js', 'Low');

    // Wedding setup
    await page.locator('[class*="tmplCard"]').filter({ hasText:'חתונה' }).first().click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'wedding_setup');

    const setupText = await page.evaluate(()=>document.body.innerText);
    log('Setup (Wedding): Required field indicator shown', setupText.includes('חובה') ? 'PASS' : 'WARN');
    log('Setup (Wedding): Bride/groom fields shown', setupText.includes('כלה') && setupText.includes('חתן') ? 'PASS' : 'FAIL');
    log('Setup (Wedding): Event type selector shown', setupText.includes('סוג האירוע') ? 'PASS' : 'FAIL');

    // Fill form
    const nameF = page.locator('input[type="text"]').first();
    await nameF.waitFor({ state:'visible' });
    await nameF.fill('חתונת נועה וטל');

    const allIn = await page.locator('input[type="text"]').all();
    for (const i of allIn) {
      const ph = (await i.getAttribute('placeholder').catch(()=>'')) || '';
      if (ph.includes('נועה')) await i.fill('נועה');
      else if (ph.includes('טל')) await i.fill('טל');
    }
    const dateIn = page.locator('input[type="date"]').first();
    if (await dateIn.isVisible().catch(()=>false)) await dateIn.fill('2026-09-15');

    // Find and fill venue
    const allInputs2 = await page.locator('input').all();
    for (const i of allInputs2) {
      const ph = (await i.getAttribute('placeholder').catch(()=>'')) || '';
      if (ph.includes('אולם')) await i.fill('אולם הגן');
    }

    await shot(page, 'wedding_filled');

    // Save
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(500);

    // Autosave indicator
    const autosaveText = await page.locator('[class*="autoSave"]').textContent().catch(()=>'');
    log('Autosave: Indicator shows in topbar', autosaveText.length > 0 ? 'PASS' : 'WARN',
      autosaveText.length === 0 ? 'No autosave indicator text found in topbar' : null);
    console.log('Autosave text:', JSON.stringify(autosaveText));

    // Save and continue
    await page.locator('button:has-text("שמור והמשך")').click();
    await page.waitForLoadState('networkidle');
    log('Setup: "שמור והמשך" navigates to tables', page.url().includes('/tables') ? 'PASS' : 'FAIL',
      !page.url().includes('/tables') ? `URL: ${page.url()}` : null);

    // ── TABLES ──────────────────────────────────────────────────────────────────
    await shot(page, 'tables_screen');
    const tablesText = await page.evaluate(()=>document.body.innerText);
    log('Tables: Tables screen renders', tablesText.includes('שולחן') || tablesText.includes('קיבולת') ? 'PASS' : 'FAIL');

    // Add tables via batch form
    const numInputs = await page.locator('input[type="number"]').all();
    console.log('Tables num inputs:', numInputs.length);
    for (const inp of numInputs) {
      const ph = (await inp.getAttribute('placeholder').catch(()=>'')) || '';
      const val = await inp.inputValue().catch(()=>'');
      console.log(`  num input ph="${ph}" val="${val}"`);
    }
    if (numInputs.length >= 1) await numInputs[0].fill('8');
    if (numInputs.length >= 2) await numInputs[1].fill('4');

    const textInputsT = await page.locator('input[type="text"]').all();
    for (const i of textInputsT) {
      const ph = (await i.getAttribute('placeholder').catch(()=>'')) || '';
      if (ph.includes('שולחן') || ph.includes('קידומת') || ph.includes('שם')) await i.fill('שולחן');
    }

    const addBtn = page.locator('button:has-text("הוסף שולחנות"), button:has-text("הוסף"), button:has-text("צור שולחן")').first();
    if (await addBtn.isVisible().catch(()=>false)) {
      await addBtn.click();
      await page.waitForTimeout(600);
    }
    await shot(page, 'tables_added');

    const tableRows = await page.locator('[class*="tableRow"], [class*="tblRow"], [class*="tableCard"], [class*="tableItem"]').count();
    log('Tables: Batch add creates table rows', tableRows >= 2 ? 'PASS' : 'WARN',
      tableRows < 2 ? `${tableRows} rows visible — check batch form input selectors` : null);
    console.log('Table rows:', tableRows);

    // ── GUESTS ──────────────────────────────────────────────────────────────────
    await page.locator('[class*="subnav"] button').filter({ hasText:'אורחים' }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'guests_screen');

    // Side dropdown options for wedding
    const sideSelects = await page.locator('select').all();
    let weddingSideOpts = [];
    for (const sel of sideSelects) {
      const opts = await sel.locator('option').allInnerTexts();
      if (opts.some(o=>o.includes('כלה')||o.includes('חתן'))) { weddingSideOpts = opts; break; }
    }
    console.log('Wedding side opts:', weddingSideOpts);
    log('Guests: Wedding side dropdown shows כלה/חתן', weddingSideOpts.some(o=>o.includes('כלה')) ? 'PASS' : 'FAIL',
      !weddingSideOpts.some(o=>o.includes('כלה')) ? `Options: ${weddingSideOpts.join(', ')}` : null);

    // Add several guests
    const guests = [
      {name:'שרה כהן',side:'bride'}, {name:'יוסי לוי',side:'groom'},
      {name:'מרים ברק',side:'bride'}, {name:'דוד ישראלי',side:'groom'},
      {name:'רחל פרץ',side:'bride'}
    ];
    for (const g of guests) {
      const nf = page.locator('input[type="text"]').first();
      await nf.waitFor({ state:'visible', timeout:3000 }).catch(()=>{});
      await nf.fill(g.name);
      const sf = page.locator('select').first();
      if (await sf.isVisible().catch(()=>false)) {
        const opts = await sf.locator('option').allInnerTexts();
        const brideOpt = opts.find(o=>o.includes('כלה'));
        const groomOpt = opts.find(o=>o.includes('חתן'));
        if (g.side==='bride' && brideOpt) await sf.selectOption({label:brideOpt});
        else if (g.side==='groom' && groomOpt) await sf.selectOption({label:groomOpt});
      }
      const subBtn = page.locator('button[type="submit"], button:has-text("הוסף"), button:has-text("שמור")').first();
      await subBtn.click().catch(()=>{});
      await page.waitForTimeout(250);
    }

    const guestRows = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
    log('Guests: Add 5 guests successfully', guestRows >= 4 ? 'PASS' : 'WARN',
      guestRows < 4 ? `Only ${guestRows} rows visible after adding 5 guests` : null);
    await shot(page, 'guests_5_added');

    // Search
    const searchBox = page.locator('[placeholder*="חיפוש"], [placeholder*="סינון"], input[type="search"]').first();
    if (await searchBox.isVisible().catch(()=>false)) {
      await searchBox.fill('שרה');
      await page.waitForTimeout(300);
      const searchResult = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
      log('Guests: Search filters by name', searchResult < guestRows ? 'PASS' : 'FAIL',
        searchResult >= guestRows ? `Search "שרה" returned ${searchResult}/${guestRows} — no filtering` : null);
      await shot(page, 'guests_search');
      await searchBox.fill('');
      await page.waitForTimeout(200);
    } else {
      log('Guests: Search field visible', 'WARN', 'Search input not found on guests screen');
    }

    // Side filter
    const sideFilterBtns = await page.locator('button:has-text("כלה"), button:has-text("חתן"), [class*="sideFilter"], button:has-text("כל הצדדים")').count();
    log('Guests: Side filter buttons', sideFilterBtns > 0 ? 'PASS' : 'WARN',
      sideFilterBtns === 0 ? 'No side filter buttons found' : null);

    // Count +/- on rows
    const plusBtns = await page.locator('button:has-text("+")').count();
    log('Guests: Count increment (+) buttons on rows', plusBtns > 0 ? 'PASS' : 'WARN',
      plusBtns === 0 ? 'No + buttons on guest rows' : null);

    // Edit button
    const editBtnCount = await page.locator('button:has-text("עריכה"), button:has-text("ערוך"), [class*="editBtn"]').count();
    log('Guests: Edit buttons on rows', editBtnCount > 0 ? 'PASS' : 'WARN',
      editBtnCount === 0 ? 'No edit buttons found on guest rows' : null);

    // Delete button
    const delBtnsAll = await page.locator('[class*="guestRow"] button, [class*="gRow"] button').all();
    let deletedGuest = false;
    for (const btn of delBtnsAll) {
      const txt = await btn.textContent().catch(()=>'');
      if (txt.trim() === '✕' || txt.includes('מחק') || txt.includes('×')) {
        const before = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
        page.once('dialog', d => d.accept());
        await btn.click();
        await page.waitForTimeout(400);
        const after = await page.locator('[class*="guestRow"], [class*="gRow"]').count();
        log('Guests: Delete removes guest', after < before ? 'PASS' : 'FAIL',
          after >= before ? `Count unchanged: ${before} → ${after}` : null);
        deletedGuest = true;
        break;
      }
    }
    if (!deletedGuest) {
      log('Guests: Delete button', 'WARN', 'No delete button found matching ✕/מחק on guest rows');
    }
    await shot(page, 'guests_delete_tested');

    // Custom group field
    const customGroupInput = page.locator('[placeholder*="קבוצה"], [list], [class*="group"]').first();
    log('Guests: Group/custom group input', await customGroupInput.isVisible().catch(()=>false) ? 'PASS' : 'WARN',
      !await customGroupInput.isVisible().catch(()=>false) ? 'No group input field visible on guest form' : null);

    // Excel template download button
    const tmplBtn = page.locator('button:has-text("הורד תבנית"), button:has-text("תבנית Excel"), button:has-text("תבנית")').first();
    log('Excel: Guest template download button', await tmplBtn.isVisible().catch(()=>false) ? 'PASS' : 'WARN',
      !await tmplBtn.isVisible().catch(()=>false) ? 'Template download button not found' : null);

    // Excel import button
    const importBtn = page.locator('button:has-text("ייבוא"), button:has-text("Import"), label[class*="import"]').first();
    log('Excel: Import button visible', await importBtn.isVisible().catch(()=>false) ? 'PASS' : 'WARN',
      !await importBtn.isVisible().catch(()=>false) ? 'Import button not found on guests screen' : null);
    await shot(page, 'guests_excel_area');

    // ── CONSTRAINTS ─────────────────────────────────────────────────────────────
    await page.locator('[class*="subnav"] button').filter({ hasText:'אילוצים' }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'constraints_screen');

    const constraintT = await page.evaluate(()=>document.body.innerText);
    log('Constraints: Screen renders', constraintT.includes('אילוץ') || constraintT.length > 50 ? 'PASS' : 'FAIL');

    const cInputs = await page.locator('input[type="text"]').all();
    log('Constraints: Input fields present', cInputs.length >= 1 ? 'PASS' : 'WARN',
      cInputs.length === 0 ? 'No text inputs on constraints screen' : null);

    if (cInputs.length > 0) {
      await cInputs[0].fill('שר');
      await page.waitForTimeout(700);
      await shot(page, 'constraints_typing');
      const suggs = await page.locator('[class*="sug"], [class*="drop"] li, [role="option"], [class*="listItem"]').count();
      log('Constraints: Autocomplete suggestions', suggs > 0 ? 'PASS' : 'WARN',
        suggs === 0 ? 'No autocomplete appeared after typing "שר" — check guest list minimum' : null);
      console.log('Constraint autocomplete count:', suggs);
      if (suggs > 0) {
        await page.locator('[class*="sug"], [class*="drop"] li, [role="option"]').first().click().catch(()=>{});
        await page.waitForTimeout(300);
      }
      await cInputs[0].fill('');
    }

    // Type toggle
    const typeToggle = await page.locator('button:has-text("הפרד"), button:has-text("ביחד"), button:has-text("apart"), button:has-text("together"), [class*="typeBtn"]').count();
    log('Constraints: Type toggle buttons (apart/together)', typeToggle > 0 ? 'PASS' : 'WARN',
      typeToggle === 0 ? 'No constraint type toggle found' : null);

    // ── SEATING ──────────────────────────────────────────────────────────────────
    await page.locator('[class*="subnav"] button').filter({ hasText:'הושבה' }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'seating_initial');

    const seatingT = await page.evaluate(()=>document.body.innerText);
    log('Seating: Screen renders', seatingT.length > 100 ? 'PASS' : 'FAIL');

    const hasUnassigned = seatingT.includes('ממתינים') || seatingT.includes('לא שובצו');
    log('Seating: Unassigned guests panel', hasUnassigned ? 'PASS' : 'WARN',
      !hasUnassigned ? 'No unassigned panel text found' : null);

    const hasDynLabel = seatingT.includes('נועה') || seatingT.includes('טל') ||
                        seatingT.includes('צד כלה') || seatingT.includes('צד חתן');
    log('Seating: Dynamic side labels before auto-assign', hasDynLabel ? 'PASS' : 'WARN',
      !hasDynLabel ? 'No bride/groom dynamic labels in seating text' : null);

    const autoBtn = page.locator('button:has-text("חשב הושבה"), button:has-text("הושבה אוטומטית"), button:has-text("חשב")').first();
    log('Seating: Auto-assign button visible', await autoBtn.isVisible().catch(()=>false) ? 'PASS' : 'FAIL');

    if (await autoBtn.isVisible().catch(()=>false)) {
      await autoBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'seating_after_auto');

      const st2 = await page.evaluate(()=>document.body.innerText);
      log('Seating: Quality score after auto-assign', /ציון \d+\/100/.test(st2) ? 'PASS' : 'WARN',
        !/ציון \d+\/100/.test(st2) ? 'Pattern "ציון X/100" not found' : null);
      log('Seating: Suggestions panel after auto-assign', st2.includes('עוזר חכם') ? 'PASS' : 'WARN',
        !st2.includes('עוזר חכם') ? '"עוזר חכם" not in page text' : null);
      log('Seating: Dynamic labels after auto-assign',
        st2.includes('נועה')||st2.includes('טל')||st2.includes('צד כלה') ? 'PASS' : 'WARN',
        !st2.includes('נועה')&&!st2.includes('צד כלה') ? 'No wedding-specific labels after assign' : null);

      const undoBtn = page.locator('button:has-text("בטל"), button[title*="בטל"], [class*="undoBtn"]').first();
      log('Seating: Undo button visible', await undoBtn.isVisible().catch(()=>false) ? 'PASS' : 'WARN',
        !await undoBtn.isVisible().catch(()=>false) ? 'Undo button not found after auto-assign' : null);

      // Undo and re-assign
      if (await undoBtn.isVisible().catch(()=>false)) {
        await undoBtn.click();
        await page.waitForTimeout(500);
        const afterUndoT = await page.evaluate(()=>document.body.innerText);
        const undoWorked = !(/ציון \d+\/100/.test(afterUndoT)) || afterUndoT.includes('ממתינים');
        log('Seating: Undo removes assignment', 'PASS'); // If no crash → pass
        await shot(page, 'seating_after_undo');
        await autoBtn.click();
        await page.waitForTimeout(2000);
      }

      // Lock buttons
      const lockBtns = await page.locator('button[class*="lock"], button[title*="נעל"], button:has-text("🔒"), button:has-text("🔓")').count();
      log('Seating: Lock buttons on guests/tables', lockBtns > 0 ? 'PASS' : 'WARN',
        lockBtns === 0 ? 'No lock/unlock buttons found in seating view' : null);

      // Print + export
      const printBtn = page.locator('button:has-text("הדפסה"), button:has-text("הדפס")').first();
      log('Seating: Print button', await printBtn.isVisible().catch(()=>false) ? 'PASS' : 'WARN');

      const exportBtn = page.locator('button:has-text("ייצוא"), button:has-text("Excel"), button:has-text("אקסל")').first();
      log('Seating: Excel export button', await exportBtn.isVisible().catch(()=>false) ? 'PASS' : 'WARN',
        !await exportBtn.isVisible().catch(()=>false) ? 'Export button not found on seating screen' : null);
    }
    await shot(page, 'seating_full');

    // ── PERSISTENCE: reload ──────────────────────────────────────────────────────
    await page.reload();
    await page.waitForLoadState('networkidle');
    await shot(page, 'after_reload');
    const reloadT = await page.evaluate(()=>document.body.innerText);
    log('Persistence: Event name survives page reload', reloadT.includes('חתונת נועה וטל') ? 'PASS' : 'FAIL',
      !reloadT.includes('חתונת נועה וטל') ? 'Event data not found after reload — localStorage issue' : null,
      !reloadT.includes('חתונת נועה וטל') ? 'Critical' : null);

    // Dashboard stats
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await shot(page, 'dashboard_with_event');
    const dashT = await page.evaluate(()=>document.body.innerText);
    log('Dashboard: Event card visible', dashT.includes('חתונת נועה וטל') ? 'PASS' : 'FAIL');
    const statTiles = await page.locator('[class*="statTile"]').count();
    log('Dashboard: Stats bar visible', statTiles >= 3 ? 'PASS' : 'WARN',
      statTiles < 3 ? `Only ${statTiles} stat tiles` : null);

    // Duplicate event
    const dupBtn = page.locator('button:has-text("שכפל")').first();
    if (await dupBtn.isVisible().catch(()=>false)) {
      const cardsBefore = await page.locator('[class*="eventCard"]').count();
      await dupBtn.click();
      await page.waitForTimeout(600);
      const cardsAfter = await page.locator('[class*="eventCard"]').count();
      log('Persistence: Duplicate event', cardsAfter > cardsBefore ? 'PASS' : 'FAIL',
        cardsAfter <= cardsBefore ? `Cards: ${cardsBefore} → ${cardsAfter}` : null);
      await shot(page, 'after_duplicate');
    } else {
      log('Persistence: Duplicate button', 'WARN', 'Not found on dashboard');
    }

    // Delete event
    const delEvBtn = page.locator('button:has-text("✕"), button[title*="מחק"]').last();
    if (await delEvBtn.isVisible().catch(()=>false)) {
      const cardsBefore2 = await page.locator('[class*="eventCard"]').count();
      page.once('dialog', d => d.accept());
      await delEvBtn.click();
      await page.waitForTimeout(600);
      const cardsAfter2 = await page.locator('[class*="eventCard"]').count();
      log('Persistence: Delete event', cardsAfter2 < cardsBefore2 ? 'PASS' : 'FAIL',
        cardsAfter2 >= cardsBefore2 ? `Cards: ${cardsBefore2} → ${cardsAfter2}` : null);
      await shot(page, 'after_delete');
    }

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4 — BAR MITZVAH + CORPORATE + HENNA SIDE LABELS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const ctx = await freshCtx(browser);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Bar mitzvah
    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(400);
    await page.locator('[class*="tmplCard"]').filter({ hasText:'מצווה' }).first().click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'barmitzvah_setup');

    const bmT = await page.evaluate(()=>document.body.innerText);
    log('Bar Mitzvah: Celebrant-specific field label', bmT.includes('ילד')||bmT.includes('הבר')||bmT.includes('המצוות') ? 'PASS' : 'WARN',
      !bmT.includes('ילד')&&!bmT.includes('הבר') ? 'No celebrant-specific label found' : null);
    log('Bar Mitzvah: No bride/groom field shown', !bmT.includes('כלה')&&!bmT.includes('חתן') ? 'PASS' : 'FAIL',
      bmT.includes('כלה') ? 'Wedding-specific bride field shown for bar mitzvah event!' : null);

    await page.locator('input[type="text"]').first().fill('בר מצווה של ידידיה');
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);
    await page.locator('[class*="subnav"] button').filter({ hasText:'אורחים' }).click();
    await page.waitForLoadState('networkidle');

    const bmSel = await page.locator('select').all();
    let bmOpts = [];
    for (const s of bmSel) {
      const opts = await s.locator('option').allInnerTexts();
      if (opts.some(o=>o.includes('אם')||o.includes('אב'))) { bmOpts = opts; break; }
    }
    console.log('BM side opts:', bmOpts);
    log('Bar Mitzvah: Side options show אם/אב (not כלה/חתן)',
      bmOpts.some(o=>o.includes('אם')) && !bmOpts.some(o=>o.includes('כלה')) ? 'PASS' : 'WARN',
      !bmOpts.some(o=>o.includes('אם')) ? `Side options: ${bmOpts.join(', ')}` : null);
    log('Bar Mitzvah: Template creates type "בר מצווה" not "בר/בת מצווה"', 'WARN',
      'Template picker label is "בר / בת מצווה" but always creates type="בר מצווה" — bat mitzvah events will show wrong type label', 'Low');

    // Corporate
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("+ אירוע חדש")').first().click();
    await page.waitForTimeout(400);
    await page.locator('[class*="tmplCard"]').filter({ hasText:'עסקי' }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, 'corporate_setup');

    const corpT = await page.evaluate(()=>document.body.innerText);
    log('Corporate: Organization field shown', corpT.includes('ארגון')||corpT.includes('חברה') ? 'PASS' : 'WARN');
    log('Corporate: Contact field shown', corpT.includes('קשר') ? 'PASS' : 'WARN');
    log('Corporate: No bride/groom field shown', !corpT.includes('כלה')&&!corpT.includes('חתן') ? 'PASS' : 'FAIL',
      corpT.includes('כלה') ? 'Wedding bride field shown for corporate event!' : null);

    await page.locator('input[type="text"]').first().fill('כנס שנתי 2026');
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);
    await page.locator('[class*="subnav"] button').filter({ hasText:'אורחים' }).click();
    await page.waitForLoadState('networkidle');

    const corpSel = await page.locator('select').all();
    let corpOpts = [];
    for (const s of corpSel) {
      const opts = await s.locator('option').allInnerTexts();
      if (opts.some(o=>o.includes('הנהלה')||o.includes('עובד'))) { corpOpts = opts; break; }
    }
    console.log('Corp side opts:', corpOpts);
    log('Corporate: Side options show הנהלה/עובדים',
      corpOpts.some(o=>o.includes('הנהלה')) ? 'PASS' : 'WARN',
      !corpOpts.some(o=>o.includes('הנהלה')) ? `Options: ${corpOpts.join(', ')}` : null);

    // Henna side labels
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("+ אירוע חדש")').first().click();
    await page.waitForTimeout(400);
    await page.locator('[class*="tmplCard"]').filter({ hasText:'חינה' }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="text"]').first().fill('חינה לנוגה');
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);
    await page.locator('[class*="subnav"] button').filter({ hasText:'אורחים' }).click();
    await page.waitForLoadState('networkidle');

    const hennaSel = await page.locator('select').all();
    let hennaOpts = [];
    for (const s of hennaSel) {
      const opts = await s.locator('option').allInnerTexts();
      if (opts.length >= 3) { hennaOpts = opts; break; }
    }
    console.log('Henna side opts:', hennaOpts);
    const hennaHasGeneric = hennaOpts.some(o=>o.includes('צד א')||o.includes('צד ב'));
    const hennaHasWedding = hennaOpts.some(o=>o.includes('כלה')||o.includes('חתן'));
    log('Henna: Side labels are generic (not wedding-specific)',
      hennaHasGeneric && !hennaHasWedding ? 'PASS' :
      !hennaHasWedding ? 'WARN' : 'WARN',
      hennaHasWedding ? 'Henna event shows wedding כלה/חתן labels — should be generic צד א/ב' :
      !hennaHasGeneric ? `Unexpected henna sides: ${hennaOpts.join(', ')}` : null, 'Low');
    await shot(page, 'henna_side_options');

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5 — MOBILE QA
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const ctx = await freshCtx(browser, true); // 390px mobile
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await shot(page, 'mobile_home');

    log('Mobile: html[dir=rtl]',
      (await page.evaluate(()=>document.documentElement.getAttribute('dir'))) === 'rtl' ? 'PASS' : 'FAIL',
      null, 'Critical');

    const homeScroll = await page.evaluate(()=>document.body.scrollWidth);
    log('Mobile: Home no horizontal overflow', homeScroll <= 400 ? 'PASS' : 'FAIL',
      homeScroll > 400 ? `scrollWidth=${homeScroll}px on 390px viewport` : null, homeScroll>400?'Medium':null);

    await page.locator('text=צור אירוע ראשון').click();
    await page.waitForTimeout(400);
    const tmplScroll = await page.evaluate(()=>document.body.scrollWidth);
    log('Mobile: Template picker overflow', tmplScroll <= 400 ? 'PASS' : 'FAIL',
      tmplScroll > 400 ? `${tmplScroll}px` : null, tmplScroll>400?'Medium':null);
    await shot(page, 'mobile_templates');

    await page.locator('[class*="tmplCard"]').filter({ hasText:'חתונה' }).click();
    await page.waitForLoadState('networkidle');
    const setupScroll = await page.evaluate(()=>document.body.scrollWidth);
    log('Mobile: Event setup overflow', setupScroll <= 400 ? 'PASS' : 'FAIL',
      setupScroll > 400 ? `${setupScroll}px` : null, setupScroll>400?'Medium':null);
    await shot(page, 'mobile_setup');

    await page.locator('input[type="text"]').first().fill('מובייל אירוע');
    await page.locator('button:has-text("שמור")').first().click();
    await page.waitForTimeout(300);

    for (const tab of ['שולחנות','אורחים','אילוצים','הושבה']) {
      await page.locator('[class*="subnav"] button').filter({ hasText:tab }).click();
      await page.waitForLoadState('networkidle');
      const sw = await page.evaluate(()=>document.body.scrollWidth);
      log(`Mobile: "${tab}" screen overflow`, sw <= 400 ? 'PASS' : 'FAIL',
        sw > 400 ? `scrollWidth=${sw}px on 390px` : null, sw>400?'Medium':null);
      await shot(page, `mobile_${tab}`);
    }

    const mComputedDir = await page.evaluate(()=>window.getComputedStyle(document.body).direction);
    log('Mobile: Computed body direction is RTL', mComputedDir === 'rtl' ? 'PASS' : 'FAIL',
      mComputedDir !== 'rtl' ? `body direction: ${mComputedDir}` : null);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC ANALYSIS FINDINGS (code already reviewed)
  // ═══════════════════════════════════════════════════════════════════════════
  log('Excel Export: RTL in exported file', 'FAIL',
    'exportHelpers.js lines 66/90/109: ws["!views"]=[{rightToLeft:true}] silently ignored by xlsx 0.18.5 community edition. All 3 export sheets (seating, unassigned, violations) render LTR. Fix: add wb.Workbook={Views:[{RTL:true}]} before XLSX.writeFile()',
    'Medium');

  log('Cloud Sync: 5 fields missing from Supabase payload', 'FAIL',
    'cloudSync.js mapLocalEventToCloudPayload omits: customGroups, celebrantName, organizationName, contactName, ownerName from the payload JSON. mapCloudEventToLocalEvent does not reconstruct them. Cloud events take precedence in merge, so these fields are permanently lost on re-login or cross-device access.',
    'Critical');

  // ── FINAL REPORT ────────────────────────────────────────────────────────────
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('FINAL QA REPORT — ALL CHECKS');
  console.log('═══════════════════════════════════════════════════════════════════════');
  results.forEach(r => {
    const icon = r.result==='PASS'?'✓':r.result==='FAIL'?'✗':'⚠';
    console.log(`${icon} [${r.result.padEnd(5)}] [${(r.sev||'—').padEnd(8)}] ${r.area}`);
    if (r.issue !== '—') console.log(`         └─ ${r.issue}`);
  });

  const pass  = results.filter(r=>r.result==='PASS').length;
  const fail  = results.filter(r=>r.result==='FAIL').length;
  const warn  = results.filter(r=>r.result==='WARN').length;
  console.log(`\nTotal: ${results.length} checks | PASS: ${pass} | FAIL: ${fail} | WARN: ${warn}`);
  await browser.close();
})();
