// v108 My Bag – "Use density altitude": one slider (−3,000 … 12,000 ft) + a typed box instead of the Elevation and
// Temperature sliders, carries from the ISA air density, and a "?" help card. iPhone 390x844 @3x.
// Run: node tests/da-focused.js
const assert = require('assert'); const { spawn } = require('child_process');
const BAG = require('../bag.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8845, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
const reno = { elev: 5000, temp: 70 };
const SAMPLE = [['Driver', 'd', 250, 10.5], ['3W', 'fw', 225, 15], ['5i', 'ir', 172, 26], ['7i', 'ir', 150, 33], ['9i', 'ir', 129, 41], ['PW', 'ir', 118, 46], ['52', 'we', 104, 52], ['56', 'we', 90, 56]];
// ---------- 1. conversion ----------
{
  // ISA: sea level 59°F = 0 ft density altitude, and the ISA temperature at any height gives back that height
  assert.ok(Math.abs(BAG.daOf(0, 59)) < 1, 'sea level standard day = 0 ft DA');
  [-3000, -1200, 0, 5000, 8000, 12000].forEach(h => assert.ok(Math.abs(BAG.daOf(h, BAG.isaTempF(h)) - h) < 1, 'standard day at ' + h + ' ft = ' + h + ' ft DA'));
  [-3000, -1200, 0, 6835, 8000, 12000].forEach(h => assert.ok(Math.abs(BAG.daFromDensity(BAG.isaDensity(h)) - h) < 0.5, 'DA ↔ density round trip at ' + h));
  assert.ok(BAG.daOf(5000, 95) > BAG.daOf(5000, 70) && BAG.daOf(5000, 70) > BAG.daOf(5000, 41), 'hotter = higher density altitude');
  const bda = BAG.baseDA({ base: reno });
  assert.ok(bda > 6600 && bda < 7100, 'baseline 5,000 ft · 70°F ≈ 6,800–6,900 ft DA (' + bda + ')');
  assert.strictEqual(BAG.blank().da, bda, 'new bag starts at the baseline DA'); assert.strictEqual(BAG.blank().useDA, false, 'density altitude off by default');
  ok('ISA: 0 ft @ 59°F = 0 ft DA; baseline 5,000 ft · 70°F = ' + bda.toLocaleString('en-US') + ' ft DA');
  const rows = [];
  SAMPLE.forEach(([n, , c, l]) => {
    const at = d => BAG.adjustDA(c, l, reno, d);
    assert.ok(Math.abs(BAG.adjustDA(c, l, reno, BAG.daOf(5000, 70)) - c) < 0.01, n + ': DA = baseline DA → no change');
    assert.ok(at(8000) > c && at(10000) > at(8000), n + ': higher DA → longer');
    assert.ok(at(-1200) < c && at(-3000) < at(-1200), n + ': −1,200 ft → shorter than baseline');
    // the two modes agree when they describe the same air
    [[0, 75], [800, 50], [5000, 95], [9000, 40], [2000, 100]].forEach(([e, t]) => {
      const two = BAG.adjust(c, l, reno, { elev: e, temp: t }), da = at(BAG.daOf(e, t));
      assert.ok(Math.abs(two - da) < 0.05, n + ' ' + e + ' ft/' + t + '°F: sliders ' + two.toFixed(2) + ' vs DA ' + da.toFixed(2)); });
    rows.push(n + ' ' + c + ' yd → DA 8,000: ' + at(8000).toFixed(1) + ' (' + (at(8000) - c >= 0 ? '+' : '') + (at(8000) - c).toFixed(1) + '), DA −1,200: ' + at(-1200).toFixed(1) + ' (' + (at(-1200) - c).toFixed(1) + ')');
  });
  // Reno reading 8,000 ft and Sacramento reading −1,200 ft (Driver 250)
  const dr8 = BAG.adjustDA(250, 10.5, reno, 8000), drS = BAG.adjustDA(250, 10.5, reno, -1200);
  assert.ok(dr8 > 250 && dr8 < 256, 'Reno at 8,000 ft DA: a little longer than the 6,835 ft baseline air (' + dr8.toFixed(1) + ')');
  assert.ok(drS > 225 && drS < 242, 'Sacramento at −1,200 ft DA: clearly shorter (' + drS.toFixed(1) + ')');
  // stored bag: clamps, negative, persistence of fields
  let b = BAG.norm({ useDA: true, da: -1200 }); assert.deepStrictEqual([b.useDA, b.da], [true, -1200]);
  assert.strictEqual(BAG.norm({ da: -9000 }).da, -3000); assert.strictEqual(BAG.norm({ da: 20000 }).da, 12000); assert.strictEqual(BAG.norm({}).da, bda);
  b = BAG.addClubs(BAG.norm({ useDA: true, da: bda }), [{ cat: 'd', code: 'Driver', loft: 10.5, carry: 250 }]).bag;
  assert.ok(BAG.sameCond(b) && BAG.clubCarry(b.clubs[0], b) === 250, 'DA mode at the baseline = same'); b.da = 8000; assert.ok(!BAG.sameCond(b) && Math.abs(BAG.clubCarry(b.clubs[0], b) - dr8) < 1e-9);
  b.useDA = false; assert.ok(BAG.sameCond(b) && BAG.clubCarry(b.clubs[0], b) === 250, 'unchecked = the elevation/temperature sliders, as before');
  console.log('  carries (entered at 5,000 ft · 70°F):\n    ' + rows.join('\n    '));
}
// ---------- 2. phone ----------
(async () => {
  const { chromium } = require('playwright-core');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(BASE)) return r.continue(); outside.push(u); return r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon|ERR_FAILED/.test(m.text()) && errors.push(m.text()));
    const shot = async name => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(350); await page.screenshot({ path: OUT + name + '.png' }); };
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.bag.v1') || 'null'));
    const seed = BAG.addClubs(BAG.blank(), SAMPLE.map(([code, cat, carry, loft]) => ({ cat, code, carry, loft, make: 'Srixon', model: 'ZX5' })).concat([{ cat: 'pt', code: 'Putter' }])).bag;
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.bag.v1', s); }, JSON.stringify(seed));
    await page.reload(); await page.waitForSelector('#home'); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="bag"]'); await page.waitForSelector('#baglist');
    // collapsed by default (kept from v106)
    assert.strictEqual(await page.getAttribute('#bagcondh', 'aria-expanded'), 'false'); assert.strictEqual(await page.$('#bagusda'), null);
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F');
    await shot('da-collapsed'); ok('collapsed by default: ' + await page.textContent('#bagcondsum'));
    // open: checkbox off, the two sliders as before
    await page.click('#bagcondh'); await page.waitForSelector('#bagusda');
    assert.strictEqual(await page.isChecked('#bagusda'), false, 'Use density altitude off by default');
    assert.ok(await page.$('#bagelev') && await page.$('#bagtemp') && !(await page.$('#bagda')) && !(await page.$('#bagdatxt')), 'unchecked: Elevation + Temperature sliders');
    assert.ok(await page.$('#dahbtn'), '? next to the checkbox');
    await page.evaluate(() => window.scrollTo(0, document.getElementById('bagcond').getBoundingClientRect().top + window.scrollY - 110));
    await shot('da-open-unchecked'); ok('opened: checkbox off, Elevation and Temperature sliders unchanged');
    // unchecked behaviour exactly as before: move elevation → summary, header column
    await page.evaluate(() => { const s = document.getElementById('bagelev'); s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F · now 0 ft · 70°F'); assert.strictEqual(await page.textContent('#bagadjh'), '0 ft · 70°F');
    await page.click('#bagreset'); assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F');
    // check it: one slider + typed box replace the two sliders
    await page.check('#bagusda'); await page.waitForSelector('#bagda');
    assert.ok(!(await page.$('#bagelev')) && !(await page.$('#bagtemp')), 'checked: Elevation / Temperature sliders gone');
    const S = await page.evaluate(() => { const s = document.getElementById('bagda'), t = document.getElementById('bagdatxt'); return { min: +s.min, max: +s.max, v: +s.value, tv: t.value, im: t.inputMode, type: t.type, base: document.getElementById('bagdabase').textContent }; });
    assert.deepStrictEqual([S.min, S.max], [-3000, 12000], 'slider −3,000 … 12,000 ft'); assert.strictEqual(S.type, 'text'); assert.strictEqual(S.im, 'text', 'keyboard with a minus sign on iPhone');
    const bda = BAG.baseDA(seed); assert.strictEqual(+S.tv, bda, 'starts at the baseline DA'); assert.match(S.base, /about 68\d\d ft density altitude/);
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F', 'baseline DA = same air, no "now"');
    assert.strictEqual((await store()).useDA, true, 'checkbox saved');
    ok('checked: one slider ' + S.min + '…' + S.max + ' ft + typed box (inputmode ' + S.im + '), starts at ' + S.tv + ' ft (' + S.base + ')');
    // slider → 8,000
    await page.evaluate(() => { const s = document.getElementById('bagda'); s.value = 8000; s.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.strictEqual(await page.inputValue('#bagdatxt'), '8000');
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F · now 8000 ft density altitude');
    assert.strictEqual(await page.textContent('#bagadjh'), 'DA 8000 ft', 'club list column header');
    const drv = id => page.$eval('.bagrow[data-id="' + seed.clubs.find(c => c.code === 'Driver').id + '"] .badj b', e => +e.textContent);
    assert.strictEqual(await drv(), Math.round(BAG.adjustDA(250, 10.5, reno, 8000)));
    ok('slider 8,000 ft: summary "now 8000 ft density altitude", column "DA 8000 ft", Driver ' + await drv());
    // type −1200 (the iPhone keyboard's minus, or a plain hyphen)
    await page.fill('#bagdatxt', ''); await page.type('#bagdatxt', '-1200'); await page.press('#bagdatxt', 'Enter'); await page.evaluate(() => document.getElementById('bagdatxt').blur());
    assert.strictEqual(await page.inputValue('#bagdatxt'), '-1200'); assert.strictEqual(+(await page.inputValue('#bagda')), -1200, 'slider follows the typed value');
    assert.strictEqual((await store()).da, -1200); assert.strictEqual(await page.textContent('#bagadjh'), 'DA -1200 ft');
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F · now -1200 ft density altitude');
    const d12 = await drv(); assert.strictEqual(d12, Math.round(BAG.adjustDA(250, 10.5, reno, -1200))); assert.ok(d12 < 250);
    await page.evaluate(() => window.scrollTo(0, document.getElementById('bagcond').getBoundingClientRect().top + window.scrollY - 110));
    await shot('da-checked-negative'); ok('typed -1200: slider -1,200, saved, Driver ' + d12 + ' (shorter)');
    await page.fill('#bagdatxt', '−900'); await page.evaluate(() => document.getElementById('bagdatxt').blur()); assert.strictEqual((await store()).da, -900, 'typographic minus works too');
    await page.fill('#bagdatxt', '25000'); await page.evaluate(() => document.getElementById('bagdatxt').blur()); assert.strictEqual(await page.inputValue('#bagdatxt'), '12000', 'clamped to 12,000');
    await page.fill('#bagdatxt', '-5000'); await page.evaluate(() => document.getElementById('bagdatxt').blur()); assert.strictEqual(await page.inputValue('#bagdatxt'), '-3000', 'clamped to −3,000');
    await page.fill('#bagdatxt', '1200'); await page.evaluate(() => document.getElementById('bagdatxt').blur()); await page.click('#bagdasign'); assert.strictEqual(await page.inputValue('#bagdatxt'), '-1200', '± flips the sign');
    ok('typographic minus, clamping 25000 → 12000 and -5000 → -3000, ± button');
    // club picker checkbox works in DA mode
    await page.check('#baguse'); let st = await store(); assert.deepStrictEqual([st.useCond, st.useDA, st.da], [true, true, -1200]);
    // persistence: reload, reopen
    await page.reload(); await page.waitForSelector('#home'); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="bag"]'); await page.waitForSelector('#baglist');
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F · now -1200 ft density altitude', 'kept after reload');
    await page.click('#bagcondh'); await page.waitForSelector('#bagda'); assert.ok(await page.isChecked('#bagusda') && await page.isChecked('#baguse')); assert.strictEqual(await page.inputValue('#bagdatxt'), '-1200');
    ok('after reload: still checked, -1,200 ft, club picker checkbox kept');
    // ? help card
    await page.click('#dahbtn'); await page.waitForSelector('#dahelp');
    const H = await page.evaluate(() => { const d = document.getElementById('dahelp'), a = document.getElementById('daapplink'), heavy = [...d.querySelectorAll('*')].concat([d]).filter(e => e.childElementCount === 0 || e === d)
      .filter(e => { const c = getComputedStyle(e); return +c.fontWeight >= 600 || parseFloat(c.fontSize) > 18; }).map(e => e.tagName + ' ' + getComputedStyle(e).fontWeight + ' ' + getComputedStyle(e).fontSize);
      const r = d.getBoundingClientRect(); return { txt: d.innerText, href: a.href, tgt: a.target, rel: a.rel, heavy, r: [r.left, r.right, r.top, r.bottom] }; });
    assert.strictEqual(H.href, 'https://apps.apple.com/us/app/density-altitude/id994402197'); assert.strictEqual(H.tgt, '_blank'); assert.match(H.rel, /noopener/);
    ['how thin the air plays', 'elevation, temperature, air pressure and humidity', 'carries farther', 'Below sea level', 'Reno at 5,000 ft can read around 8,000 ft', 'Sacramento at 800 ft can read around −1,200 ft', 'Density Altitude+ by Rate of Climb', 'Easiest way'].forEach(t => assert.ok(H.txt.includes(t), 'help says: ' + t));
    assert.deepStrictEqual(H.heavy, [], 'light type only in the help card'); assert.ok(H.r[0] >= 0 && H.r[1] <= 390 && H.r[3] <= 844, 'fits the screen ' + H.r);
    await shot('da-help'); ok('? card: plain explanation, Reno/Sacramento examples, App Store link (new tab, noopener), light type only');
    await page.click('#dahclose'); assert.strictEqual(await page.$('#dahelp'), null, 'Close closes it');
    await page.click('#dahbtn'); await page.waitForSelector('#dahelp'); await page.mouse.click(195, 820); await page.waitForTimeout(200);
    assert.strictEqual(await page.$('#dahelp'), null, 'tap outside closes it'); ok('Close button and tap outside both close it');
    // Back to my baseline resets the DA; unchecking brings the two sliders back unchanged
    await page.click('#bagreset'); assert.strictEqual(+(await page.inputValue('#bagdatxt')), BAG.baseDA(seed)); assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F');
    await page.uncheck('#bagusda'); await page.waitForSelector('#bagelev'); assert.strictEqual(await page.$('#bagda'), null);
    st = await store(); assert.deepStrictEqual([st.useDA, st.cond], [false, { elev: 5000, temp: 70 }]);
    ok('Back to my baseline resets the DA; unchecking brings back the two sliders');
    assert.deepStrictEqual(outside, [], 'no outside network calls ' + outside.join(', ')); assert.deepStrictEqual(errors, [], 'no page errors');
    ok('no outside network calls');
    console.log('PASS da-focused');
  } finally { await br.close(); srv.kill(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
