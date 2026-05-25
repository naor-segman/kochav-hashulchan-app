const { chromium } = require('playwright');
const fs = require('fs');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
const BASE = 'http://localhost:5174';
const SS   = '/tmp/qa_shots';
fs.mkdirSync(SS, { recursive: true });

let n = 0;
const R = [];
function log(area, result, issue, sev) {
  R.push({area, result, issue:issue||'—', sev:sev||'—'});
  console.log(`${result==='PASS'?'✓':result==='FAIL'?'✗':'⚠'} [${result}] ${area}${issue?'\n   └ '+issue:''}`);
}
async function shot(page, name) {
  try { await page.screenshot({ path:`${SS}/${String(++n).padStart(3,'0')}_${name}.png`, fullPage:true }); } catch(_){}
}
async function newCtx(browser, mobile) {
  return browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1280,height:900} });
}
async function safe(fn) { try { return await fn(); } catch(e) { return null; } }
async function txt(page) { return safe(()=>page.evaluate(()=>document.body.innerText)); }
async function click(page, sel) { await safe(()=>page.locator(sel).first().click()); }
async function fill(page, sel, val) { await safe(()=>page.locator(sel).first().fill(val)); await page.waitForTimeout(100); }

(async()=>{
  const browser = await chromium.launch({executablePath:EXEC, args:ARGS, headless:true});

  // ── 1. AUTH ──────────────────────────────────────────────────────────────────
  {
    const ctx = await newCtx(browser);
    const pg = await ctx.newPage();

    await pg.goto(BASE); await pg.waitForLoadState('networkidle');
    await shot(pg,'auth_home');
    log('Auth: Guest home loads with signup link', await pg.locator('a[href="/signup"]').isVisible() ? 'PASS':'FAIL');
    log('Auth: Onboarding text visible', await pg.locator('text=כוכב השולחן').first().isVisible() ? 'PASS':'FAIL');

    await pg.goto(`${BASE}/login`); await pg.waitForLoadState('networkidle');
    await shot(pg,'auth_login');
    const lh = await safe(()=>pg.locator('h1').textContent())||'';
    log('Auth: Login screen', lh.includes('כניסה') ? 'PASS':'FAIL');

    await pg.goto(`${BASE}/signup`); await pg.waitForLoadState('networkidle');
    await shot(pg,'auth_signup');
    const sh = await safe(()=>pg.locator('h1').textContent())||'';
    const sdis = await safe(()=>pg.$eval('button[type="submit"]', b=>b.disabled));
    const snot = await safe(()=>pg.locator('[class*="noticeWarn"]').isVisible());
    log('Auth: Signup screen', sh.includes('הרשמה') ? 'PASS':'FAIL');
    log('Auth: Signup disabled without Supabase', sdis ? 'PASS':'FAIL',
      !sdis ? 'Submit not disabled — backend absent' : null);
    log('Auth: Signup shows config warning', snot ? 'PASS':'FAIL');

    await pg.goto(`${BASE}/account`); await pg.waitForLoadState('networkidle');
    await shot(pg,'auth_account_redirect');
    log('Auth: /account redirects to /login when unauthenticated',
      pg.url().includes('/login') ? 'PASS':'WARN',
      !pg.url().includes('/login') ? `URL: ${pg.url()}` : null);

    await ctx.close();
  }

  // ── 2. VALIDATION BYPASS ────────────────────────────────────────────────────
  {
    const ctx = await newCtx(browser);
    const pg = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');

    await pg.locator('text=צור אירוע ראשון').click();
    await pg.waitForTimeout(500);
    await pg.locator('[class*="tmplCard"]').filter({hasText:'חתונה'}).first().click();
    await pg.waitForLoadState('networkidle');
    const setupUrl = pg.url();
    await shot(pg,'val_setup_empty');

    const tabResults = {};
    for (const tab of ['שולחנות','אורחים','אילוצים','הושבה']) {
      await pg.goto(setupUrl); await pg.waitForTimeout(300);
      await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:tab}).click());
      await pg.waitForTimeout(600);
      tabResults[tab] = pg.url();
    }

    const bypassed = Object.values(tabResults).filter(u=>!u.includes('/setup')).length;
    log('Validation: All subnav tabs blocked with empty name',
      bypassed === 0 ? 'PASS':'FAIL',
      bypassed > 0 ? `${bypassed}/4 tabs bypass validation: ${JSON.stringify(tabResults)}` : null,
      bypassed > 0 ? 'Critical' : null);

    // Toast check
    await pg.goto(setupUrl); await pg.waitForTimeout(300);
    await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'שולחנות'}).click());
    await pg.waitForTimeout(600);
    const hasToast = await safe(()=>pg.locator('[class*="toast"], [class*="Toast"]').first().isVisible())||false;
    log('Validation: Error toast shown when validation fails',
      hasToast ? 'PASS':'FAIL',
      !hasToast && bypassed>0 ? 'No error feedback shown when navigating with empty name' : null,
      !hasToast && bypassed>0 ? 'Critical' : null);
    await shot(pg,'val_bypass_result');
    await ctx.close();
  }

  // ── 3. FULL EVENT WORKFLOW ───────────────────────────────────────────────────
  {
    const ctx = await newCtx(browser);
    const pg = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');

    // Create wedding event
    await pg.locator('text=צור אירוע ראשון').click();
    await pg.waitForTimeout(500);

    const tmplTexts = await safe(()=>pg.locator('[class*="tmplCard"]').allTextContents())||[];
    log('Templates: Wedding', tmplTexts.some(t=>t.includes('חתונה')) ? 'PASS':'FAIL');
    log('Templates: Bar Mitzvah', tmplTexts.some(t=>t.includes('מצווה')) ? 'PASS':'FAIL');
    log('Templates: Henna', tmplTexts.some(t=>t.includes('חינה')) ? 'PASS':'FAIL');
    log('Templates: Corporate', tmplTexts.some(t=>t.includes('עסקי')) ? 'PASS':'FAIL');
    log('Templates: Empty/scratch option', await safe(()=>pg.locator('button:has-text("אירוע ריק")').isVisible())||false ? 'PASS':'WARN',
      !await safe(()=>pg.locator('button:has-text("אירוע ריק")').isVisible())||false ? 'Empty template button not found' : null);
    await shot(pg,'tmpl_picker');

    await pg.locator('[class*="tmplCard"]').filter({hasText:'חתונה'}).first().click();
    await pg.waitForLoadState('networkidle');
    await shot(pg,'wedding_setup');

    const st = await txt(pg)||'';
    log('Setup: Required field hint shown', st.includes('חובה') ? 'PASS':'WARN');
    log('Setup: Bride field shown', st.includes('כלה') ? 'PASS':'FAIL');
    log('Setup: Groom field shown', st.includes('חתן') ? 'PASS':'FAIL');
    log('Setup: Date field shown', st.includes('תאריך') ? 'PASS':'FAIL');
    log('Setup: Venue field shown', st.includes('אולם') ? 'PASS':'FAIL');

    // Fill form — be resilient
    await safe(()=>pg.locator('input[type="text"]').first().fill('חתונת נועה וטל'));
    const inputs = await safe(()=>pg.locator('input[type="text"]').all())||[];
    for (const inp of inputs) {
      const ph = await safe(()=>inp.getAttribute('placeholder'))||'';
      if (ph.includes('נועה')) await safe(()=>inp.fill('נועה'));
      else if (ph.includes('טל')) await safe(()=>inp.fill('טל'));
    }
    const allInputs2 = await safe(()=>pg.locator('input').all())||[];
    for (const inp of allInputs2) {
      const ph = await safe(()=>inp.getAttribute('placeholder'))||'';
      if (ph.includes('אולם')) await safe(()=>inp.fill('אולם הגן'));
    }
    await safe(()=>pg.locator('input[type="date"]').first().fill('2026-09-15'));
    await shot(pg,'wedding_filled');

    // Save
    await safe(()=>pg.locator('button:has-text("שמור")').first().click());
    await pg.waitForTimeout(500);

    const asText = await safe(()=>pg.locator('[class*="autoSave"]').textContent())||'';
    log('Autosave: Indicator visible', asText.length>0 ? 'PASS':'WARN',
      !asText.length ? 'No autosave indicator text found' : null);
    console.log('Autosave text:', JSON.stringify(asText));

    await safe(()=>pg.locator('button:has-text("שמור והמשך")').click());
    await pg.waitForLoadState('networkidle');
    log('Setup: "שמור והמשך" goes to /tables', pg.url().includes('/tables') ? 'PASS':'FAIL',
      !pg.url().includes('/tables') ? `URL: ${pg.url()}` : null);

    // ── TABLES ──────────────────────────────────────────────────────────────────
    await shot(pg,'tables_init');
    const tst = await txt(pg)||'';
    log('Tables: Screen renders', tst.includes('שולחן')||tst.includes('קיבולת') ? 'PASS':'FAIL');

    // Inspect table form inputs
    const numIns = await safe(()=>pg.locator('input[type="number"]').all())||[];
    const txtIns = await safe(()=>pg.locator('input[type="text"]').all())||[];
    console.log('Tables inputs: nums='+numIns.length+' texts='+txtIns.length);
    for (const [i,inp] of numIns.entries()) {
      const ph = await safe(()=>inp.getAttribute('placeholder'))||'';
      const val = await safe(()=>inp.inputValue())||'';
      const label = await safe(()=>inp.evaluate(el=>{
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        return lbl?.textContent?.trim() || el.closest('[class*="field"]')?.querySelector('label')?.textContent?.trim() || '';
      }))||'';
      console.log(`  num[${i}]: ph="${ph}" val="${val}" label="${label}"`);
    }

    if (numIns.length>=2) { await safe(()=>numIns[0].fill('10')); await safe(()=>numIns[1].fill('4')); }
    else if (numIns.length===1) { await safe(()=>numIns[0].fill('4')); }
    for (const inp of txtIns) {
      const ph = await safe(()=>inp.getAttribute('placeholder'))||'';
      if (ph.includes('שולחן')||ph.includes('קידומת')||ph.includes('שם')) await safe(()=>inp.fill('שולחן'));
    }
    await safe(()=>pg.locator('button:has-text("הוסף שולחנות"),button:has-text("הוסף"),button:has-text("צור")').first().click());
    await pg.waitForTimeout(700);
    await shot(pg,'tables_added');

    const tRows = await safe(()=>pg.locator('[class*="tableRow"],[class*="tblRow"],[class*="tableCard"],[class*="tableItem"]').count())||0;
    log('Tables: Batch add creates rows', tRows>=2 ? 'PASS':'WARN',
      tRows<2 ? `${tRows} rows visible after batch add` : null);
    console.log('Table rows:', tRows);

    // ── GUESTS ──────────────────────────────────────────────────────────────────
    await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'אורחים'}).click());
    await pg.waitForLoadState('networkidle');
    await shot(pg,'guests_init');

    // Check side options
    const sels = await safe(()=>pg.locator('select').all())||[];
    let sideOpts=[];
    for (const sel of sels) {
      const opts = await safe(()=>sel.locator('option').allInnerTexts())||[];
      if (opts.some(o=>o.includes('כלה')||o.includes('חתן'))) { sideOpts=opts; break; }
    }
    console.log('Side opts:', sideOpts);
    log('Guests: Wedding side dropdown shows כלה/חתן', sideOpts.some(o=>o.includes('כלה')) ? 'PASS':'FAIL',
      !sideOpts.some(o=>o.includes('כלה')) ? `Opts: ${sideOpts.join(',')}` : null);

    // Add 5 guests
    for (const g of [{name:'שרה כהן',s:'bride'},{name:'יוסי לוי',s:'groom'},{name:'מרים ברק',s:'bride'},{name:'דוד ישראלי',s:'groom'},{name:'רחל פרץ',s:'bride'}]) {
      await safe(()=>pg.locator('input[type="text"]').first().fill(g.name));
      const sf = pg.locator('select').first();
      if (await safe(()=>sf.isVisible())) {
        const opts = await safe(()=>sf.locator('option').allInnerTexts())||[];
        const brOpt = opts.find(o=>o.includes('כלה'));
        const grOpt = opts.find(o=>o.includes('חתן'));
        if (g.s==='bride' && brOpt) await safe(()=>sf.selectOption({label:brOpt}));
        else if (g.s==='groom' && grOpt) await safe(()=>sf.selectOption({label:grOpt}));
      }
      await safe(()=>pg.locator('button[type="submit"],button:has-text("הוסף")').first().click());
      await pg.waitForTimeout(250);
    }
    const gRows = await safe(()=>pg.locator('[class*="guestRow"],[class*="gRow"]').count())||0;
    log('Guests: Add 5 guests', gRows>=4 ? 'PASS':'WARN', gRows<4 ? `Only ${gRows} rows` : null);
    await shot(pg,'guests_5');

    // Search
    const sb = pg.locator('[placeholder*="חיפוש"],[placeholder*="סינון"],input[type="search"]').first();
    if (await safe(()=>sb.isVisible())) {
      await safe(()=>sb.fill('שרה')); await pg.waitForTimeout(300);
      const filtered = await safe(()=>pg.locator('[class*="guestRow"],[class*="gRow"]').count())||gRows;
      log('Guests: Search filters list', filtered<gRows ? 'PASS':'FAIL',
        filtered>=gRows ? `"שרה" returned ${filtered}/${gRows} — no filtering` : null);
      await shot(pg,'guests_search');
      await safe(()=>sb.fill('')); await pg.waitForTimeout(200);
    } else {
      log('Guests: Search field', 'WARN', 'Not found');
    }

    // Side filter buttons
    const sfBtns = await safe(()=>pg.locator('button:has-text("כלה"),button:has-text("חתן"),[class*="sideFilter"]').count())||0;
    log('Guests: Side filter buttons', sfBtns>0 ? 'PASS':'WARN', sfBtns===0?'No side filter buttons found':null);

    // + count buttons
    const plusBtns = await safe(()=>pg.locator('button:has-text("+")').count())||0;
    log('Guests: Count increment (+) buttons', plusBtns>0 ? 'PASS':'WARN', plusBtns===0?'No + buttons on guest rows':null);

    // Edit button
    const editBtnCount = await safe(()=>pg.locator('button:has-text("עריכה"),button:has-text("ערוך"),[class*="editBtn"]').count())||0;
    log('Guests: Edit buttons', editBtnCount>0 ? 'PASS':'WARN', editBtnCount===0?'No edit buttons on rows':null);

    // Delete
    const allGBtns = await safe(()=>pg.locator('[class*="guestRow"] button,[class*="gRow"] button').all())||[];
    let delOk=false;
    for (const btn of allGBtns) {
      const t=await safe(()=>btn.textContent())||'';
      if (t.trim()==='✕'||t.includes('מחק')) {
        const bef=await safe(()=>pg.locator('[class*="guestRow"],[class*="gRow"]').count())||0;
        pg.once('dialog',d=>d.accept());
        await safe(()=>btn.click()); await pg.waitForTimeout(400);
        const aft=await safe(()=>pg.locator('[class*="guestRow"],[class*="gRow"]').count())||bef;
        log('Guests: Delete removes guest', aft<bef?'PASS':'FAIL', aft>=bef?`Count ${bef}→${aft}`:null);
        delOk=true; break;
      }
    }
    if (!delOk) log('Guests: Delete button', 'WARN', 'No ✕/מחק button found on guest rows');

    // Group input
    const grpIn = await safe(()=>pg.locator('[placeholder*="קבוצה"],[list],[class*="group"]').first().isVisible())||false;
    log('Guests: Group input visible', grpIn?'PASS':'WARN', !grpIn?'No group field on guest form':null);

    // Excel template download + import buttons
    const tmplDlBtn = await safe(()=>pg.locator('button:has-text("הורד תבנית"),button:has-text("תבנית Excel"),button:has-text("תבנית")').first().isVisible())||false;
    log('Excel: Template download button', tmplDlBtn?'PASS':'WARN', !tmplDlBtn?'Not found':null);
    const impBtn = await safe(()=>pg.locator('button:has-text("ייבוא"),label[class*="import"],input[type="file"]').first().isVisible())||false;
    log('Excel: Import button/input', impBtn?'PASS':'WARN', !impBtn?'Import UI not found':null);
    await shot(pg,'guests_excel_ui');

    // ── CONSTRAINTS ──────────────────────────────────────────────────────────────
    await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'אילוצים'}).click());
    await pg.waitForLoadState('networkidle');
    await shot(pg,'constraints_init');

    const ct = await txt(pg)||'';
    log('Constraints: Screen renders', ct.includes('אילוץ')||ct.length>100?'PASS':'FAIL');

    const cIns = await safe(()=>pg.locator('input[type="text"]').all())||[];
    log('Constraints: Input fields', cIns.length>=1?'PASS':'WARN', cIns.length<1?'No text inputs found':null);

    if (cIns.length>0) {
      await safe(()=>cIns[0].fill('שר')); await pg.waitForTimeout(700);
      const suggs=await safe(()=>pg.locator('[class*="sug"],[role="option"],[class*="list"] li').count())||0;
      log('Constraints: Autocomplete suggestions', suggs>0?'PASS':'WARN',
        suggs===0?'No autocomplete after typing "שר"':null);
      console.log('Constraint suggs:', suggs);
      await shot(pg,'constraints_auto');
      if (suggs>0) await safe(()=>pg.locator('[class*="sug"],[role="option"]').first().click());
      await safe(()=>cIns[0].fill(''));
    }

    const typeToggle=await safe(()=>pg.locator('button:has-text("הפרד"),button:has-text("ביחד"),[class*="typeBtn"]').count())||0;
    log('Constraints: Apart/together type toggle', typeToggle>0?'PASS':'WARN', typeToggle===0?'No type toggle found':null);

    // ── SEATING ──────────────────────────────────────────────────────────────────
    await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'הושבה'}).click());
    await pg.waitForLoadState('networkidle');
    await shot(pg,'seating_init');

    const set1=await txt(pg)||'';
    log('Seating: Screen renders', set1.length>100?'PASS':'FAIL');
    log('Seating: Unassigned guests panel', set1.includes('ממתינים')||set1.includes('לא שובצו')?'PASS':'WARN',
      !set1.includes('ממתינים')&&!set1.includes('לא שובצו')?'No unassigned panel text':null);
    log('Seating: Dynamic labels before assign',
      set1.includes('נועה')||set1.includes('טל')||set1.includes('צד כלה')?'PASS':'WARN',
      !set1.includes('נועה')&&!set1.includes('צד כלה')?'No dynamic bride/groom labels':null);

    const autoBtn=pg.locator('button:has-text("חשב הושבה"),button:has-text("הושבה אוטומטית"),button:has-text("חשב")').first();
    const autoBtnVis=await safe(()=>autoBtn.isVisible())||false;
    log('Seating: Auto-assign button', autoBtnVis?'PASS':'FAIL');

    if (autoBtnVis) {
      await safe(()=>autoBtn.click()); await pg.waitForTimeout(2500);
      await shot(pg,'seating_auto');

      const set2=await txt(pg)||'';
      log('Seating: Quality score "ציון X/100"', /ציון \d+\/100/.test(set2)?'PASS':'WARN',
        !/ציון \d+\/100/.test(set2)?'Pattern not found after auto-assign':null);
      log('Seating: Suggestions panel "עוזר חכם"', set2.includes('עוזר חכם')?'PASS':'WARN',
        !set2.includes('עוזר חכם')?'"עוזר חכם" not in page':null);
      log('Seating: Dynamic labels after assign',
        set2.includes('נועה')||set2.includes('טל')||set2.includes('צד כלה')?'PASS':'WARN',
        !set2.includes('נועה')&&!set2.includes('צד כלה')?'No dynamic labels after assign':null);

      const undoBtn=pg.locator('button:has-text("בטל"),[class*="undoBtn"]').first();
      log('Seating: Undo button', await safe(()=>undoBtn.isVisible())||false?'PASS':'WARN',
        !await safe(()=>undoBtn.isVisible())||false?'Not found':null);

      // Undo test
      if (await safe(()=>undoBtn.isVisible())) {
        await safe(()=>undoBtn.click()); await pg.waitForTimeout(600);
        await shot(pg,'seating_undo'); await safe(()=>autoBtn.click()); await pg.waitForTimeout(2000);
      }

      const lockBtns=await safe(()=>pg.locator('button[class*="lock"],button[title*="נעל"],button:has-text("🔒"),button:has-text("🔓")').count())||0;
      log('Seating: Lock buttons on guests', lockBtns>0?'PASS':'WARN', lockBtns===0?'No lock buttons found':null);

      const printBtn=await safe(()=>pg.locator('button:has-text("הדפסה"),button:has-text("הדפס")').first().isVisible())||false;
      log('Seating: Print button', printBtn?'PASS':'WARN', !printBtn?'Not found':null);

      const xlsBtn=await safe(()=>pg.locator('button:has-text("ייצוא"),button:has-text("Excel"),button:has-text("אקסל")').first().isVisible())||false;
      log('Seating: Excel export button', xlsBtn?'PASS':'WARN', !xlsBtn?'Not found':null);
    }
    await shot(pg,'seating_full');

    // ── PERSISTENCE ──────────────────────────────────────────────────────────────
    await pg.reload(); await pg.waitForLoadState('networkidle');
    const rt=await txt(pg)||'';
    log('Persistence: Event survives page reload', rt.includes('חתונת נועה וטל')?'PASS':'FAIL',
      !rt.includes('חתונת נועה וטל')?'Event name not found after reload':'', !rt.includes('חתונת נועה וטל')?'Critical':null);
    await shot(pg,'after_reload');

    await pg.goto(BASE); await pg.waitForLoadState('networkidle');
    const dt=await txt(pg)||'';
    log('Persistence: Dashboard shows event after reload', dt.includes('חתונת נועה וטל')?'PASS':'FAIL');
    const statTiles=await safe(()=>pg.locator('[class*="statTile"]').count())||0;
    log('Dashboard: Stats bar visible', statTiles>=3?'PASS':'WARN', statTiles<3?`${statTiles} tiles`:'—');

    const dupBtn=pg.locator('button:has-text("שכפל")').first();
    if (await safe(()=>dupBtn.isVisible())) {
      const cb=await safe(()=>pg.locator('[class*="eventCard"]').count())||0;
      await safe(()=>dupBtn.click()); await pg.waitForTimeout(600);
      const ca=await safe(()=>pg.locator('[class*="eventCard"]').count())||cb;
      log('Persistence: Duplicate event', ca>cb?'PASS':'FAIL', ca<=cb?`${cb}→${ca}`:'—');
      await shot(pg,'after_dup');
    } else log('Persistence: Duplicate button','WARN','Not found');

    const delEvBtn=pg.locator('button:has-text("✕"),button[title*="מחק"]').last();
    if (await safe(()=>delEvBtn.isVisible())) {
      const cb2=await safe(()=>pg.locator('[class*="eventCard"]').count())||0;
      pg.once('dialog',d=>d.accept());
      await safe(()=>delEvBtn.click()); await pg.waitForTimeout(600);
      const ca2=await safe(()=>pg.locator('[class*="eventCard"]').count())||cb2;
      log('Persistence: Delete event', ca2<cb2?'PASS':'FAIL', ca2>=cb2?`${cb2}→${ca2}`:'—');
      await shot(pg,'after_del');
    } else log('Persistence: Delete button','WARN','Not found');

    await ctx.close();
  }

  // ── 4. DYNAMIC SIDE LABELS PER EVENT TYPE ──────────────────────────────────
  {
    const ctx = await newCtx(browser);
    const pg = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');

    const eventTypes = [
      { tmpl:'מצווה', name:'בר מצווה של ידידיה', expectedOpts:['אם','אב'], notExpected:'כלה', label:'Bar Mitzvah' },
      { tmpl:'עסקי',  name:'כנס שנתי 2026',      expectedOpts:['הנהלה','עובד'], notExpected:'כלה', label:'Corporate' },
      { tmpl:'חינה',  name:'חינה לנוגה',          expectedOpts:['צד א','צד ב'], notExpected:'כלה', label:'Henna' },
    ];

    for (const et of eventTypes) {
      // Create event of this type
      const hasOnboard = await safe(()=>pg.locator('text=צור אירוע ראשון').isVisible())||false;
      if (hasOnboard) await safe(()=>pg.locator('text=צור אירוע ראשון').click());
      else await safe(()=>pg.locator('button:has-text("+ אירוע חדש")').first().click());
      await pg.waitForTimeout(500);
      await safe(()=>pg.locator('[class*="tmplCard"]').filter({hasText:et.tmpl}).click());
      await pg.waitForLoadState('networkidle');

      const setupT = await txt(pg)||'';
      if (et.label==='Bar Mitzvah') {
        log('Bar Mitzvah: Celebrant field shown', setupT.includes('ילד')||setupT.includes('הבר')||setupT.includes('המצוות')?'PASS':'WARN',
          !setupT.includes('ילד')&&!setupT.includes('הבר')?'No celebrant label':null);
        log('Bar Mitzvah: No bride/groom fields', !setupT.includes('כלה')&&!setupT.includes('חתן')?'PASS':'FAIL',
          setupT.includes('כלה')?'Wedding fields shown for bar mitzvah!':null);
      }
      if (et.label==='Corporate') {
        log('Corporate: Organization field', setupT.includes('ארגון')||setupT.includes('חברה')?'PASS':'WARN');
        log('Corporate: Contact field', setupT.includes('קשר')?'PASS':'WARN');
      }

      await safe(()=>pg.locator('input[type="text"]').first().fill(et.name));
      await safe(()=>pg.locator('button:has-text("שמור")').first().click());
      await pg.waitForTimeout(300);
      await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:'אורחים'}).click());
      await pg.waitForLoadState('networkidle');

      const sels=await safe(()=>pg.locator('select').all())||[];
      let sideOpts=[];
      for (const sel of sels) {
        const opts=await safe(()=>sel.locator('option').allInnerTexts())||[];
        if (opts.length>=2) { sideOpts=opts; break; }
      }
      console.log(`${et.label} side options:`, sideOpts);
      const hasExpected = et.expectedOpts.every(e=>sideOpts.some(o=>o.includes(e)));
      const hasWedding = sideOpts.some(o=>o.includes(et.notExpected));
      log(`${et.label}: Side labels correct (${et.expectedOpts.join('/')})`,
        hasExpected && !hasWedding ? 'PASS' :
        !hasExpected ? 'WARN' : 'WARN',
        !hasExpected ? `Expected [${et.expectedOpts}] in [${sideOpts.join(',')}]` :
        hasWedding ? `Shows wedding label "${et.notExpected}" for ${et.label}` : null);
      await shot(pg,`${et.label.toLowerCase().replace(' ','_')}_side`);
      await pg.goto(BASE); await pg.waitForLoadState('networkidle');
    }
    log('Templates: Bat mitzvah type mismatch','WARN',
      'Picker shows "בר / בת מצווה" but always creates type="בר מצווה". Bat mitzvah events tagged wrong type.','Low');

    await ctx.close();
  }

  // ── 5. MOBILE QA ─────────────────────────────────────────────────────────────
  {
    const ctx = await newCtx(browser, true);
    const pg = await ctx.newPage();
    await pg.goto(BASE); await pg.waitForLoadState('networkidle');
    await shot(pg,'mobile_home');

    const htmlDir=await safe(()=>pg.evaluate(()=>document.documentElement.getAttribute('dir')))||'';
    log('Mobile: html[dir=rtl]', htmlDir==='rtl'?'PASS':'FAIL', htmlDir!=='rtl'?`dir="${htmlDir}"`:null, 'Critical');

    const bodyDir=await safe(()=>pg.evaluate(()=>window.getComputedStyle(document.body).direction))||'';
    log('Mobile: body computed direction=rtl', bodyDir==='rtl'?'PASS':'FAIL', bodyDir!=='rtl'?`direction=${bodyDir}`:null);

    const homeW=await safe(()=>pg.evaluate(()=>document.body.scrollWidth))||0;
    log('Mobile: Home no overflow (390px)', homeW<=400?'PASS':'FAIL',
      homeW>400?`scrollWidth=${homeW}px`:null, homeW>400?'Medium':null);

    await safe(()=>pg.locator('text=צור אירוע ראשון').click()); await pg.waitForTimeout(400);
    const tmplW=await safe(()=>pg.evaluate(()=>document.body.scrollWidth))||0;
    log('Mobile: Template picker no overflow', tmplW<=400?'PASS':'FAIL', tmplW>400?`${tmplW}px`:null);
    await shot(pg,'mobile_templates');

    await safe(()=>pg.locator('[class*="tmplCard"]').filter({hasText:'חתונה'}).click());
    await pg.waitForLoadState('networkidle');
    const setupW=await safe(()=>pg.evaluate(()=>document.body.scrollWidth))||0;
    log('Mobile: Event setup no overflow', setupW<=400?'PASS':'FAIL', setupW>400?`${setupW}px`:null, setupW>400?'Medium':null);
    await shot(pg,'mobile_setup');

    await safe(()=>pg.locator('input[type="text"]').first().fill('מובייל'));
    await safe(()=>pg.locator('button:has-text("שמור")').first().click()); await pg.waitForTimeout(300);

    for (const tab of ['שולחנות','אורחים','אילוצים','הושבה']) {
      await safe(()=>pg.locator('[class*="subnav"] button').filter({hasText:tab}).click());
      await pg.waitForLoadState('networkidle');
      const sw=await safe(()=>pg.evaluate(()=>document.body.scrollWidth))||0;
      log(`Mobile: "${tab}" no overflow`, sw<=400?'PASS':'FAIL', sw>400?`${sw}px`:null, sw>400?'Medium':null);
      await shot(pg,`mobile_${tab.replace('/','')}`);
    }

    // Subnav usability on mobile
    const subnavBox=await safe(()=>pg.locator('[class*="subnav"]').first().boundingBox());
    log('Mobile: Subnav visible at mobile width', subnavBox&&subnavBox.width>0?'PASS':'WARN',
      !subnavBox?'Subnav bounding box not found':null);
    console.log('Mobile subnav box:', subnavBox);

    await ctx.close();
  }

  // ── 6. STATIC ANALYSIS FINDINGS ───────────────────────────────────────────────
  log('Excel Export: RTL layout in exported .xlsx','FAIL',
    'exportHelpers.js L66/90/109: ws["!views"]=[{rightToLeft:true}] silently ignored by xlsx 0.18.5 — all 3 sheets (seating/unassigned/violations) render LTR in Excel. Fix: wb.Workbook={Views:[{RTL:true}]}',
    'Medium');
  log('Cloud Sync: 5 fields missing from Supabase payload','FAIL',
    'cloudSync.js mapLocalEventToCloudPayload omits: customGroups, celebrantName, organizationName, contactName, ownerName. mapCloudEventToLocalEvent does not reconstruct them. Cloud merge gives cloud precedence — these 5 fields permanently lost on re-login or cross-device access.',
    'Critical');

  // ── FINAL REPORT ──────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════════════════════════════');
  console.log('FINAL QA REPORT');
  console.log('══════════════════════════════════════════════════════════════════════');

  const grouped = { Critical:[], Medium:[], Low:[], '—':[] };
  R.forEach(r => {
    const g = r.sev||'—';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(r);
  });

  R.forEach(r => {
    const icon = r.result==='PASS'?'✓':r.result==='FAIL'?'✗':'⚠';
    console.log(`${icon} [${r.result.padEnd(5)}] [${(r.sev||'—').padEnd(8)}] ${r.area}`);
    if (r.issue!=='—') console.log(`         └─ ${r.issue}`);
  });

  const pass=R.filter(r=>r.result==='PASS').length;
  const fail=R.filter(r=>r.result==='FAIL').length;
  const warn=R.filter(r=>r.result==='WARN').length;
  console.log(`\n── SUMMARY ──────────────────────────────────────────────────────────────`);
  console.log(`Total: ${R.length} | PASS: ${pass} | FAIL: ${fail} | WARN: ${warn}`);

  const crit = R.filter(r=>r.result==='FAIL'&&r.sev==='Critical');
  const med  = R.filter(r=>r.result==='FAIL'&&r.sev==='Medium');
  console.log(`Critical failures: ${crit.length} | Medium failures: ${med.length}`);

  await browser.close();
  console.log('\nScreenshots saved to /tmp/qa_shots/');
})();
