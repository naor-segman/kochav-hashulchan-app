const { chromium } = require('playwright');
const fs = require('fs');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
const BASE = 'http://localhost:5174';
const SS = '/tmp/qa_shots';
fs.mkdirSync(SS, { recursive: true });

let n = 300;
const R = [];
function log(area, result, issue, sev) {
  R.push({area, result, issue:issue||'—', sev:sev||'—'});
  console.log(`${result==='PASS'?'✓':result==='FAIL'?'✗':'⚠'} [${result}] ${area}${issue?'\n   └ '+issue:''}`);
}
async function shot(page, name) {
  try { await page.screenshot({path:`${SS}/${String(++n).padStart(3,'0')}_${name}.png`,fullPage:true}); }catch(_){}
}
async function safe(fn) { try { return await fn(); } catch(e) { return null; } }
async function txt(page) { return safe(()=>page.evaluate(()=>document.body.innerText))||''; }

(async()=>{
  const browser = await chromium.launch({executablePath:EXEC, args:ARGS, headless:true});

  // ── FULL WORKFLOW WITH CORRECT SELECTORS ─────────────────────────────────────
  const ctx = await browser.newContext({ viewport:{width:1280,height:900} });
  const pg = await ctx.newPage();

  // Create fresh wedding event
  await pg.goto(BASE); await pg.waitForLoadState('networkidle');
  await pg.locator('text=צור אירוע ראשון').click(); await pg.waitForTimeout(500);
  await pg.locator('[class*="tmplCard"]').filter({hasText:'חתונה'}).first().click();
  await pg.waitForLoadState('networkidle');

  // Fill name using placeholder selector (correct for inputs without type attr)
  const nameInput = pg.locator('input[placeholder*="שם"]').first();
  await safe(()=>nameInput.fill('חתונת נועה וטל'));
  // Bride
  await safe(()=>pg.locator('input[placeholder*="נועה"]').fill('נועה'));
  // Groom  
  await safe(()=>pg.locator('input[placeholder*="טל"]').fill('טל'));
  // Venue
  await safe(()=>pg.locator('input[placeholder*="אולם"]').fill('אולם הגן הקסום'));
  // Date
  await safe(()=>pg.locator('input[type="date"]').fill('2026-09-15'));

  await shot(pg, 'setup_filled');
  const setupT = await txt(pg);
  const hasName = setupT.includes('חתונת נועה וטל') || await safe(()=>pg.locator('input[placeholder*="שם"]').inputValue())||'' === 'חתונת נועה וטל';
  console.log('Name input value:', await safe(()=>pg.locator('input[placeholder*="שם"]').first().inputValue()));

  await safe(()=>pg.locator('button:has-text("שמור והמשך")').click());
  await pg.waitForLoadState('networkidle');
  log('Setup: "שמור והמשך" navigates to /tables', pg.url().includes('/tables')?'PASS':'FAIL',
    !pg.url().includes('/tables')?`URL: ${pg.url()}`:null);

  // ── TABLES ──────────────────────────────────────────────────────────────────
  await shot(pg,'tables');
  const tablesT = await txt(pg);
  log('Tables: Screen renders', tablesT.includes('שולחן')?'PASS':'FAIL');

  // Correct selectors: capacity input (type=number), count input (type=number), prefix (no type)
  const capIn = pg.locator('input[type="number"]').first();
  const cntIn = pg.locator('input[type="number"]').nth(1);
  const pfxIn = pg.locator('input[placeholder="שולחן"]'); // prefix field

  await safe(()=>capIn.fill('10'));
  await safe(()=>cntIn.fill('4'));
  await safe(()=>pfxIn.fill('שולחן'));

  const addTabBtn = pg.locator('button[class*="btn"]').filter({hasText:/הוסף|צור/}).first();
  await shot(pg,'tables_form_filled');
  await safe(()=>addTabBtn.click()); await pg.waitForTimeout(600);
  await shot(pg,'tables_after_add');

  const tableRows = await safe(()=>pg.locator('[class*="tableRow"],[class*="tblRow"],[class*="tableCard"],[class*="tableItem"]').count())||0;
  log('Tables: Batch add creates 4 tables', tableRows>=4?'PASS':tableRows>=1?'WARN':'FAIL',
    tableRows<4?`${tableRows} rows visible after batch add of 4`:null);
  console.log('Table rows:', tableRows);

  // ── GUESTS ──────────────────────────────────────────────────────────────────
  await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'אורחים'}).click());
  await pg.waitForLoadState('networkidle');
  await shot(pg,'guests_init');

  // The side selector is a segmented button group, NOT a <select>
  const sideBtns = await safe(()=>pg.locator('[class*="seg"] button, [class*="segBtn"]').all())||[];
  console.log('Side buttons count:', sideBtns.length);
  let sideTexts = [];
  for (const btn of sideBtns) sideTexts.push(await safe(()=>btn.textContent())||'');
  console.log('Side button texts:', sideTexts);
  log('Guests: Side selector is segmented buttons (not select)',
    sideBtns.length>=2?'PASS':'WARN',
    sideBtns.length<2?`Only ${sideBtns.length} seg buttons`:null);
  log('Guests: Side buttons show dynamic wedding labels',
    sideTexts.some(t=>t.includes('כלה'))?'PASS':'WARN',
    !sideTexts.some(t=>t.includes('כלה'))?`Side texts: ${sideTexts.join(',')}`:null);

  // Add 5 guests using correct selectors
  const addGuests = [
    {name:'שרה כהן',side:'bride'},{name:'יוסי לוי',side:'groom'},
    {name:'מרים ברק',side:'bride'},{name:'דוד ישראלי',side:'groom'},{name:'רחל פרץ',side:'bride'}
  ];

  for (const g of addGuests) {
    // Name field: placeholder "שם ושם משפחה"
    await safe(()=>pg.locator('input[placeholder*="שם ושם"]').fill(g.name));
    // Side: click the correct seg button
    for (const btn of await safe(()=>pg.locator('[class*="seg"] button,[class*="segBtn"]').all())||[]) {
      const t = await safe(()=>btn.textContent())||'';
      if (g.side==='bride' && t.includes('כלה')) { await safe(()=>btn.click()); break; }
      if (g.side==='groom' && t.includes('חתן')) { await safe(()=>btn.click()); break; }
    }
    // Submit: "+ הוסף אורח" button
    await safe(()=>pg.locator('button:has-text("הוסף אורח"), button:has-text("+ הוסף")').first().click());
    await pg.waitForTimeout(250);
  }

  const gRows = await safe(()=>pg.locator('[class*="gRow"],[class*="guestRow"]').count())||0;
  log('Guests: 5 guests added', gRows>=4?'PASS':'WARN', gRows<4?`${gRows} rows`:null);
  await shot(pg,'guests_5_added');

  // Search (only appears when guests > 0, no type attr, placeholder "🔍 חיפוש לפי שם...")
  const searchIn = pg.locator('input[placeholder*="חיפוש לפי שם"]');
  if (await safe(()=>searchIn.isVisible())) {
    await safe(()=>searchIn.fill('שרה')); await pg.waitForTimeout(300);
    const filtered = await safe(()=>pg.locator('[class*="gRow"],[class*="guestRow"]').count())||gRows;
    log('Guests: Search by name filters list', filtered<gRows?'PASS':'FAIL',
      filtered>=gRows?`Search "שרה": ${filtered}/${gRows} — no filtering`:null);
    await shot(pg,'guests_search');
    await safe(()=>searchIn.fill('')); await pg.waitForTimeout(200);
  } else {
    log('Guests: Search field', 'WARN', 'input[placeholder*="חיפוש לפי שם"] not visible');
  }

  // Side filter select (shown when guests > 0, contains dynamic sideLabel options)
  const filterSelects = await safe(()=>pg.locator('[class*="filterBar"] select').all())||[];
  console.log('Filter selects:', filterSelects.length);
  let filterSideOpts = [];
  if (filterSelects.length>0) {
    filterSideOpts = await safe(()=>filterSelects[0].locator('option').allInnerTexts())||[];
    console.log('Filter side options:', filterSideOpts);
  }
  log('Guests: Side filter select with dynamic labels',
    filterSideOpts.some(o=>o.includes('כלה'))?'PASS':'WARN',
    !filterSideOpts.some(o=>o.includes('כלה'))?`Filter options: ${filterSideOpts.join(',')}`:null);

  // Edit and Delete buttons on rows
  const editBtns = await safe(()=>pg.locator('button:has-text("עריכה")').count())||0;
  const delBtns = await safe(()=>pg.locator('button:has-text("מחק")').count())||0;
  log('Guests: "עריכה" buttons on rows', editBtns>=1?'PASS':'FAIL', editBtns<1?'No עריכה buttons found':null);
  log('Guests: "מחק" buttons on rows', delBtns>=1?'PASS':'FAIL', delBtns<1?'No מחק buttons found':null);

  // Count badge
  const countBadges = await safe(()=>pg.locator('[class*="gCountBadge"]').count())||0;
  console.log('Count badges (for count>1):', countBadges);
  // The +1 badge is shown only when count>1, so with count=1 guests we won't see it
  // The form has a number input for count with type="number"
  const countInput = pg.locator('input[type="number"]').first();
  log('Guests: Count number input on form', await safe(()=>countInput.isVisible())?'PASS':'WARN');

  // Delete a guest (confirm dialog)
  if (delBtns>=1) {
    const before = await safe(()=>pg.locator('[class*="gRow"],[class*="guestRow"]').count())||0;
    pg.once('dialog',d=>d.accept());
    await safe(()=>pg.locator('button:has-text("מחק")').first().click());
    await pg.waitForTimeout(400);
    const after = await safe(()=>pg.locator('[class*="gRow"],[class*="guestRow"]').count())||before;
    log('Guests: Delete with confirm removes guest', after<before?'PASS':'FAIL',
      after>=before?`Count unchanged: ${before}→${after}`:null);
    await shot(pg,'guests_after_delete');
  }

  // Excel import button: "📥 ייבוא מ-Excel"
  const importBtn = pg.locator('button:has-text("ייבוא מ")');
  log('Excel: Import button "📥 ייבוא מ-Excel" visible',
    await safe(()=>importBtn.isVisible())?'PASS':'WARN',
    !await safe(()=>importBtn.isVisible())?'Not found':null);

  // Click import to show the ExcelImportFlow
  if (await safe(()=>importBtn.isVisible())) {
    await safe(()=>importBtn.click()); await pg.waitForTimeout(400);
    await shot(pg,'excel_import_open');
    // Template download button inside the flow
    const tmplDl = pg.locator('button:has-text("הורד תבנית Excel")');
    log('Excel: Template download button "הורד תבנית Excel" visible',
      await safe(()=>tmplDl.isVisible())?'PASS':'WARN',
      !await safe(()=>tmplDl.isVisible())?'Not found':null);
    // File input (hidden, for drag-drop)
    const fileInput = pg.locator('input[type="file"][accept*=".xlsx"]');
    log('Excel: Hidden file input for drag-drop present',
      await safe(()=>fileInput.count())>0?'PASS':'WARN',
      !await safe(()=>fileInput.count())>0?'No file input found':null);
    // Close import
    await safe(()=>pg.locator('button:has-text("סגור"), button:has-text("✕ סגור")').first().click());
    await pg.waitForTimeout(300);
  }

  // ── CONSTRAINTS ──────────────────────────────────────────────────────────────
  await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'אילוצים'}).click());
  await pg.waitForLoadState('networkidle');
  await shot(pg,'constraints');

  // Read ConstraintsScreen to understand selectors
  const consT = await txt(pg);
  log('Constraints: Screen renders', consT.length>50?'PASS':'FAIL');

  // Look for guest input fields
  const consInputs = await safe(()=>pg.locator('input').all())||[];
  console.log('Constraint inputs:', consInputs.length);
  for (const inp of consInputs) {
    const ph = await safe(()=>inp.getAttribute('placeholder'))||'';
    const type = await safe(()=>inp.getAttribute('type'))||'';
    console.log(`  input type="${type}" ph="${ph}"`);
  }

  // Try to type in first input
  if (consInputs.length>0) {
    for (const inp of consInputs) {
      const type = await safe(()=>inp.getAttribute('type'))||'text';
      const ph = await safe(()=>inp.getAttribute('placeholder'))||'';
      if (type==='text'||!type) {
        await safe(()=>inp.fill('שר')); await pg.waitForTimeout(700);
        const suggs = await safe(()=>pg.locator('[class*="sug"],[role="option"],[class*="list"] li').count())||0;
        log('Constraints: Autocomplete suggestions after typing',
          suggs>0?'PASS':'WARN',
          suggs===0?`No suggestions for "שר" (ph="${ph}")`:null);
        await shot(pg,'constraints_autocomplete');
        console.log('Autocomplete count:', suggs);
        if (suggs>0) await safe(()=>pg.locator('[class*="sug"],[role="option"]').first().click());
        await safe(()=>inp.fill(''));
        break;
      }
    }
  }

  // ── SEATING ────────────────────────────────────────────────────────────────
  await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'הושבה'}).click());
  await pg.waitForLoadState('networkidle');
  await shot(pg,'seating_init');

  const seatingT = await txt(pg);
  log('Seating: Dynamic labels (נועה/כלה) visible', 
    seatingT.includes('נועה')||seatingT.includes('צד כלה')?'PASS':'WARN',
    !seatingT.includes('נועה')&&!seatingT.includes('צד כלה')?'No bride name/label visible':null);
  log('Seating: Unassigned panel visible',
    seatingT.includes('ממתינים')||seatingT.includes('לא שובצו')?'PASS':'WARN');

  const autoBtn = pg.locator('button:has-text("חשב הושבה"),button:has-text("הושבה אוטומטית")').first();
  if (await safe(()=>autoBtn.isVisible())) {
    await safe(()=>autoBtn.click()); await pg.waitForTimeout(2500);
    await shot(pg,'seating_after_auto');

    const postT = await txt(pg);
    log('Seating: Quality score "ציון X/100"', /ציון \d+\/100/.test(postT)?'PASS':'WARN',
      !/ציון \d+\/100/.test(postT)?`Score not found. Page snippet: ${postT.substring(0,200)}`:null);
    log('Seating: "עוזר חכם" panel visible', postT.includes('עוזר חכם')?'PASS':'WARN',
      !postT.includes('עוזר חכם')?'Panel not found after auto-assign':null);
    log('Seating: "ביטול" undo button visible',
      await safe(()=>pg.locator('button:has-text("בטל")').first().isVisible())?'PASS':'WARN');
    log('Seating: Dynamic labels after assign',
      postT.includes('נועה')||postT.includes('צד כלה')||postT.includes('נועה')?'PASS':'WARN',
      !postT.includes('נועה')&&!postT.includes('צד כלה')?'No bride labels after assign':null);
  }
  await shot(pg,'seating_full');

  // ── PERSISTENCE ──────────────────────────────────────────────────────────────
  await pg.reload(); await pg.waitForLoadState('networkidle');
  const reloadT = await txt(pg);
  log('Persistence: Event name survives reload',
    reloadT.includes('חתונת נועה וטל')?'PASS':'FAIL',
    !reloadT.includes('חתונת נועה וטל')?'Event name not found after reload':'', 
    !reloadT.includes('חתונת נועה וטל')?'Critical':null);
  await shot(pg,'after_reload');

  await pg.goto(BASE); await pg.waitForLoadState('networkidle');
  await shot(pg,'dashboard_final');
  const dashT = await txt(pg);
  log('Dashboard: Event card visible after reload', dashT.includes('חתונת נועה וטל')?'PASS':'FAIL');
  log('Dashboard: Stats bar shows (3+ tiles)',
    await safe(()=>pg.locator('[class*="statTile"]').count())>=3?'PASS':'WARN');

  await ctx.close();

  // ── MOBILE OVERFLOW CHECK ────────────────────────────────────────────────────
  {
    const mCtx = await browser.newContext({viewport:{width:390,height:844}});
    const mPg = await mCtx.newPage();
    await mPg.goto(BASE); await mPg.waitForLoadState('networkidle');

    // html dir
    log('Mobile: html[dir=rtl]',
      await safe(()=>mPg.evaluate(()=>document.documentElement.getAttribute('dir')))==='rtl'?'PASS':'FAIL');

    // Screens overflow test — need event in storage
    await mPg.locator('text=צור אירוע ראשון').click(); await mPg.waitForTimeout(400);
    await mPg.locator('[class*="tmplCard"]').filter({hasText:'חתונה'}).click();
    await mPg.waitForLoadState('networkidle');
    await safe(()=>mPg.locator('input[placeholder*="שם"]').first().fill('מובייל'));
    await safe(()=>mPg.locator('button:has-text("שמור")').first().click());
    await mPg.waitForTimeout(300);

    const screens = [{tab:'שולחנות',key:'tables'},{tab:'אורחים',key:'guests'},{tab:'אילוצים',key:'const'},{tab:'הושבה',key:'seating'}];
    for (const s of screens) {
      await safe(()=>mPg.locator('[class*="subnav"] button').filter({hasText:s.tab}).click());
      await mPg.waitForLoadState('networkidle');
      const sw = await safe(()=>mPg.evaluate(()=>document.body.scrollWidth))||0;
      log(`Mobile: "${s.tab}" screen no overflow`, sw<=400?'PASS':'FAIL',
        sw>400?`scrollWidth=${sw}px on 390px viewport`:null, sw>400?'Medium':null);
      await mPg.screenshot({path:`${SS}/${String(++n).padStart(3,'0')}_mobile_${s.key}.png`});
    }

    // Check RTL text alignment on mobile
    const textAlign = await safe(()=>mPg.evaluate(()=>{
      const cards = document.querySelectorAll('[class*="card"],[class*="page"]');
      if (!cards.length) return null;
      return window.getComputedStyle(cards[0]).textAlign;
    }));
    console.log('Mobile text-align:', textAlign);

    await mCtx.close();
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════════════════════════');
  console.log('TARGETED QA RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  R.forEach(r=>{
    const icon=r.result==='PASS'?'✓':r.result==='FAIL'?'✗':'⚠';
    console.log(`${icon} [${r.result.padEnd(5)}][${(r.sev||'—').padEnd(8)}] ${r.area}`);
    if (r.issue!=='—') console.log(`         └─ ${r.issue}`);
  });
  console.log(`\nTotal: ${R.length} | PASS: ${R.filter(r=>r.result==='PASS').length} | FAIL: ${R.filter(r=>r.result==='FAIL').length} | WARN: ${R.filter(r=>r.result==='WARN').length}`);
  await browser.close();
})();
