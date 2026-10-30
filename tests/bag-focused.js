// v92 My Bag: catalog → clubs, carries, the air-density carry model (elevation / temperature sliders), the in-round
// club picker (bag clubs only), voice matching, and backup/restore. Opened from My Bag in the + menu (v102; was Profile). iPhone 390x844 @3x.
const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const BAG = require('../bag.js'); const SG = require('../sg.js'); const V = require('../voice.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8823, BASE = 'http://127.0.0.1:' + PORT + '/';
const reno = { elev: 5000, temp: 70 }, sd = { elev: 0, temp: 75 }, sea = { elev: 0, temp: 70 };
const pct = (a, b) => (a / b - 1) * 100;
// ---------- 1. physics ----------
{
  [[250, 10.5], [150, 33], [110, 45], [80, 56]].forEach(([c, l]) => assert.strictEqual(BAG.adjust(c, l, reno, reno), c, 'baseline conditions = entered carry'));
  assert.ok(Math.abs(BAG.density(0, 59) - 1.225) < 0.002, 'sea-level standard air ≈ 1.225 kg/m³');
  assert.ok(Math.abs(BAG.pressure(5000) / 101325 - 0.832) < 0.002, 'ISA pressure at 5,000 ft ≈ 83% of sea level');
  const rows = [];
  [['Driver', 250, 10.5], ['7i', 150, 33], ['PW', 115, 45], ['56', 80, 56]].forEach(([n, c, l]) => {
    const up = BAG.adjust(c, l, sea, { elev: 5000, temp: 70 }), sdC = BAG.adjust(c, l, reno, sd), hot = BAG.adjust(c, l, reno, { elev: 5000, temp: 95 }), cold = BAG.adjust(c, l, reno, { elev: 5000, temp: 40 });
    assert.ok(pct(up, c) > 3 && pct(up, c) < 9, n + ': sea level → 5,000 ft is a few percent longer (' + pct(up, c).toFixed(1) + '%)');
    assert.ok(sdC < c && pct(sdC, c) > -10 && pct(sdC, c) < -3, n + ': Reno 5,000 ft/70°F → San Diego 0 ft/75°F is a few percent shorter (' + pct(sdC, c).toFixed(1) + '%)');
    assert.ok(hot > c && cold < c, n + ': hotter → longer, colder → shorter');
    let prev = 0; for (let e = 0; e <= 9000; e += 1000) { const v = BAG.adjust(c, l, reno, { elev: e, temp: 70 }); assert.ok(v > prev, 'carry grows with elevation'); prev = v; }
    rows.push(n + ' ' + c + ' yd @ Reno 5,000 ft/70°F → SD 0 ft/75°F ' + sdC.toFixed(1) + ' (' + pct(sdC, c).toFixed(1) + '%), 40°F ' + cold.toFixed(1) + ', 95°F ' + hot.toFixed(1) + ', 9,000 ft ' + BAG.adjust(c, l, reno, { elev: 9000, temp: 70 }).toFixed(1));
  });
  const d1 = pct(BAG.adjust(250, 10.5, sea, { elev: 1000, temp: 70 }), 250), d10 = BAG.adjust(250, 10.5, sea, { elev: 0, temp: 80 }) - 250;
  assert.ok(d1 > 0.8 && d1 < 2.2, 'driver ≈ 1–2% per 1,000 ft (' + d1.toFixed(2) + '%)'); assert.ok(d10 > 0.8 && d10 < 3.5, 'driver ≈ 1–3 yd per 10°F (' + d10.toFixed(2) + ')');
  rows.push('driver per 1,000 ft (from sea level): +' + d1.toFixed(2) + '%; per +10°F: +' + d10.toFixed(2) + ' yd');
  console.log('  physics:\n    ' + rows.join('\n    '));
}
// ---------- 2. bag data, voice matching, backup ----------
{
  let b = BAG.blank(); assert.deepStrictEqual([b.base.elev, b.base.temp, b.clubs.length], [5000, 70, 0], 'defaults: Reno 5,000 ft, 70°F');
  let R = BAG.addClubs(b, [{ cat: 'ir', code: '7i', make: 'Srixon', model: 'ZX5 Mk II', loft: 31 }, { cat: 'we', code: '52', make: 'Vokey', model: 'SM10', loft: 52 }, { cat: 'd', code: 'Driver', make: 'TaylorMade', model: 'Qi35', loft: 10.5 }, { cat: 'pt', code: 'Putter' }]);
  assert.deepStrictEqual([R.added, R.replaced], [4, 0]); b = R.bag;
  R = BAG.addClubs(b, [{ cat: 'ir', code: '7I', make: 'Titleist', model: 'T100', loft: 33 }]); assert.deepStrictEqual([R.added, R.replaced, R.bag.clubs.length], [0, 1, 4], 'one club per name');
  assert.deepStrictEqual(BAG.sorted(R.bag, 'club').map(c => c.code), ['Driver', '7I', '52', 'Putter']); assert.deepStrictEqual(BAG.pickerClubs(R.bag).map(c => c.code), ['Driver', '7I', '52'], 'no putter in the picker');
  assert.strictEqual(V.parse('gap wedge 95 fairway').club, '52'); assert.strictEqual(BAG.matchClub('52', b), '52');
  const g = BAG.addClubs(BAG.blank(), [{ cat: 'ir', code: 'GW', loft: 50 }, { cat: 'we', code: '56', loft: 56 }]).bag;
  assert.strictEqual(BAG.matchClub('52', g), 'GW', '"gap wedge" → the bag\'s GW'); assert.strictEqual(BAG.matchClub('58', g), '56', 'nearest wedge within 3°'); assert.strictEqual(BAG.matchClub('PW', g), 'PW', 'no match: unchanged');
  assert.strictEqual(BAG.matchClub('7i', BAG.blank()), '7i', 'empty bag: unchanged');
  assert.strictEqual(V.parse('4 iron 190 fairway').club, '4i'); assert.strictEqual(V.parse('50 degree 80 rough').club, '50'); assert.strictEqual(V.parse('3 hybrid 200').club, '3H');
  const a = SG.analyzeHole({ par: 4, finished: true, rows: [{ loc: 'tee', dist: 400, club: 'Driver' }, { loc: 'fairway', dist: 150, club: 'GW' }, { loc: 'green', dist: 10 }, { loc: 'holed', dist: 1 }] });
  assert.strictEqual(a.shots[1].club, 'GW', 'any club name is kept for club stats');
  const bk = SG.makeBackup([], new Date('2026-10-28T19:00:00Z'), 'Quincy', [], b); assert.strictEqual(bk.bag.clubs.length, 4);
  const pb = SG.parseBackup(JSON.stringify(bk)); assert.ok(!pb.error); assert.strictEqual(pb.bag.clubs.length, 4, 'a bag-only backup is readable');
  assert.strictEqual(SG.makeBackup([], null, 'Q', [], BAG.blank()).bag, undefined, 'no bag key when the bag is empty');
  assert.strictEqual(BAG.mergeBag(BAG.blank(), b).changed, true, 'empty phone bag takes the backup');
  const newer = Object.assign({}, b, { updated: '2026-10-29T00:00:00Z' }), older = Object.assign({}, g, { updated: '2026-10-01T00:00:00Z' });
  assert.strictEqual(BAG.mergeBag(newer, older).changed, false, 'older backup never replaces the phone bag'); assert.strictEqual(BAG.mergeBag(older, newer).changed, true);
  console.log('  bag data / voice / backup ok');
}
// ---------- 3. phone flow ----------
(async () => {
  const { chromium } = require('playwright-core');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(m.text()));
    const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const shot = async (name, opt) => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(300); await page.screenshot(Object.assign({ path: OUT + name + '.png' }, opt || {})); };
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.bag.v1') || 'null'));
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); localStorage.setItem('golfsg.nameasked.v1', '1'); });
    await page.reload(); await page.waitForSelector('#home');
    assert.strictEqual(await page.$('[data-act="bag"]'), null, 'nothing new on the clean home screen');
    await page.click('#plusbtn'); await page.waitForSelector('#plusmenu');
    assert.deepStrictEqual(await page.$$eval('#plusmenu .sheet-item', e => e.map(x => x.textContent)), ['New round', 'My Bag', 'Rounds', 'Settings'], 'My Bag has its own + menu item (v102)');
    await page.click('#plusmenu [data-act="bag"]'); await page.waitForSelector('#bagempty');
    assert.strictEqual(await page.getAttribute('#segbag', 'aria-selected'), 'true', 'opens on the Bag tab'); assert.strictEqual(await page.textContent('.topbar .txt'), '‹ Home');
    await shot('bag-empty');
    const add = async (make, model, cat, pick) => {
      await page.click('#bagaddbtn'); await page.waitForSelector('#bagmakes');
      if (make.other) { await page.click('[data-v="makeother"]'); await page.fill('#bagmake', make.other); await page.click('[data-v="makego"]'); }
      else await page.click('#bagmakes [data-m="' + make + '"]');
      if (model.other != null) { await page.fill('#bagmodel', model.other); await page.click('#bagothercats [data-cat="' + cat + '"]'); }
      else await page.click('[data-v="model"][data-cat="' + cat + '"][data-m="' + model + '"]');
      await page.waitForSelector('#bagaddgo'); if (pick) await pick(); await page.click('#bagaddgo'); await page.waitForSelector('#baglist');
    };
    // Srixon irons (5i–PW) – screenshot the model picker on the way
    await page.click('#bagaddbtn'); await page.click('#bagmakes [data-m="Srixon"]'); await page.waitForSelector('[data-v="model"]');
    assert.ok((await page.$$eval('#bagmakes, [data-v="model"]', e => e.length)) > 10);
    await shot('bag-add-club');
    await page.click('[data-v="model"][data-cat="ir"][data-m="ZX5 Mk II"]'); await page.click('[data-v="irons"][data-from="5"]');
    assert.strictEqual((await page.textContent('#bagaddgo')).trim(), 'Add 6 clubs'); await page.click('#bagaddgo'); await page.waitForSelector('#baglist');
    await add('TaylorMade', 'Qi35', 'd');
    await add('Titleist', 'GT2', 'fw', () => page.click('[data-v="slot"][data-c="3W"]'));
    await add('Ping', 'G430', 'hy', () => page.click('[data-v="slot"][data-c="4H"]'));
    await add('Vokey', 'SM10', 'we', async () => { for (const l of ['52', '56', '60']) await page.click('[data-v="slot"][data-c="' + l + '"]'); });
    await add({ other: 'Acme' }, { other: 'Prototype' }, 'ir', async () => { await page.fill('#bagcname', '2i'); await page.fill('#bagcloft', '18'); });
    await add('Scotty Cameron', 'Phantom', 'pt');
    let B = await store(); assert.strictEqual(B.clubs.length, 14);
    const two = B.clubs.find(c => c.code === '2i'); assert.deepStrictEqual([two.make, two.model, two.loft, two.cat], ['Acme', 'Prototype', 18, 'ir'], 'custom brand / model / loft');
    assert.deepStrictEqual(await page.$$eval('#baglist .bagrow:not(.bhead) .bname b', e => e.map(x => x.textContent)), ['Driver', '3W', '4H', '2i', '5i', '6i', '7i', '8i', '9i', 'PW', '52', '56', '60', 'Putter'], 'sorted by club');
    const CARRY = { Driver: 250, '3W': 225, '4H': 195, '2i': 200, '5i': 172, '6i': 162, '7i': 150, '8i': 140, '9i': 129, PW: 118, '52': 104, '56': 90, '60': 76 };
    for (const c of (await store()).clubs) if (CARRY[c.code]) await page.fill('[data-bc="carry"][data-id="' + c.id + '"]', String(CARRY[c.code]));
    B = await store(); assert.strictEqual(B.clubs.find(c => c.code === '7i').carry, 150);
    // edit: loft
    const seven = B.clubs.find(c => c.code === '7i'); await page.click('.bname[data-id="' + seven.id + '"]'); await page.fill('[data-bc="loft"]', '31'); await page.press('[data-bc="loft"]', 'Tab');
    await page.waitForTimeout(100); assert.strictEqual((await store()).clubs.find(c => c.code === '7i').loft, 31); await page.click('#bagedit [data-v="edit"]');
    assert.ok(await page.$eval('#baglist', e => e.classList.contains('same')), 'no adjusted column at baseline');
    await page.evaluate(() => window.scrollTo(0, 0)); await shot('bag-with-clubs-baseline');
    // v106: "Adjust for playing conditions" starts collapsed – title + summary line + chevron, no sliders
    assert.strictEqual(await page.getAttribute('#bagcondh', 'aria-expanded'), 'false'); assert.strictEqual(await page.$('#bagelev'), null); assert.strictEqual(await page.$('#baguse'), null);
    assert.strictEqual(await page.textContent('#bagcondh .bcft b'), 'Adjust for playing conditions'); assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F');
    await shot('bag-altitude-collapsed'); console.log('  ✓ conditions section collapsed by default: "Adjust for playing conditions" / "Carries entered at 5000 ft · 70°F"');
    // sort by carry
    await page.click('[data-v="sortcarry"]'); assert.deepStrictEqual((await page.$$eval('#baglist .bname b', e => e.map(x => x.textContent))).slice(0, 4), ['Driver', '3W', '2i', '4H']);
    await page.click('[data-v="sortclub"]');
    // sliders → San Diego (0 ft, 75°F)
    const slide = (id, v) => page.$eval('#' + id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await page.click('#bagcondh'); assert.strictEqual(await page.getAttribute('#bagcondh', 'aria-expanded'), 'true'); await page.waitForSelector('#bagelev');
    assert.match(await page.textContent('#bagcond'), /Carries entered at\s*5000 ft · 70°F\s*Change/);
    await slide('bagelev', 0); await slide('bagtemp', 75);
    assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F · now 0 ft · 75°F', 'summary follows the sliders live');
    assert.strictEqual(await page.textContent('#bagelevv'), '0 ft'); assert.strictEqual(await page.textContent('#bagtempv'), '75°F');
    const adj = async code => { const id = (await store()).clubs.find(c => c.code === code).id; return page.$eval('.badj[data-adj="' + id + '"]', e => e.textContent); };
    const dA = await adj('Driver'), sA = await adj('7i'); console.log('  UI San Diego: Driver 250 → ' + dA + ', 7i 150 → ' + sA);
    assert.match(dA, /^2(3[5-9]|4[0-4])−\d+$/, 'driver a few percent shorter at sea level'); assert.match(sA, /^14[0-6]−\d$/);
    assert.strictEqual(await page.$eval('#baglist', e => e.classList.contains('same')), false); assert.match(await page.textContent('#bagadjh'), /0 ft · 75°F/);
    B = await store(); assert.deepStrictEqual(B.cond, { elev: 0, temp: 75 }); assert.deepStrictEqual(B.base, { elev: 5000, temp: 70 });
    await page.click('#baguse'); await page.waitForTimeout(100); assert.strictEqual((await store()).useCond, true);
    await page.evaluate(() => { const l = document.querySelector('.bchead'); l.scrollIntoView({ block: 'start' }); let p = l.parentElement; while (p && p.scrollHeight <= p.clientHeight + 1) p = p.parentElement; (p && p !== document.body && p !== document.documentElement ? p : document.scrollingElement).scrollBy(0, -112); });
    await shot('bag-sliders-sandiego');
    await page.evaluate(() => window.scrollTo(0, 0)); await shot('bag-altitude-open');
    // collapse keeps the adjusted values in the summary (and in the list); reopen to carry on
    await page.click('#bagcondh'); assert.strictEqual(await page.$('#bagelev'), null); assert.strictEqual(await page.textContent('#bagcondsum'), 'Carries entered at 5000 ft · 70°F · now 0 ft · 75°F');
    assert.match(await page.textContent('#bagadjh'), /0 ft · 75°F/); await page.click('#bagcondh'); await page.waitForSelector('#bagreset');
    console.log('  ✓ opened: sliders, Back to my baseline, club-picker checkbox work as before; summary shows "now 0 ft · 75°F"');
    // baseline edit keeps the sliders where they are when they differ; reset brings them back
    await page.click('[data-v="reset"]'); assert.deepStrictEqual((await store()).cond, { elev: 5000, temp: 70 }); assert.ok(await page.$eval('#bagreset', e => e.disabled));
    await slide('bagelev', 0); await slide('bagtemp', 75);
    // remove a club
    const p60 = (await store()).clubs.find(c => c.code === '60'); await page.click('.bname[data-id="' + p60.id + '"]'); await page.click('#bagedit [data-v="remove"]');
    assert.strictEqual((await store()).clubs.length, 13); assert.match(dialogs.pop(), /Remove 60/);
    // in-round picker: bag clubs only (no putter), with the San Diego carries since "show in picker" is on
    await page.click('.topbar [data-act="home"]'); await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('[data-act="new"]');
    const cIn = await page.$('#course'); if (cIn) await page.fill('#course', 'Torrey Pines');
    await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
    const opts = await page.$$eval('select[data-f="club"][data-k="0"] option', e => e.map(o => [o.value, o.textContent]));
    assert.deepStrictEqual(opts.map(o => o[0]), ['', 'Driver', '3W', '4H', '2i', '5i', '6i', '7i', '8i', '9i', 'PW', '52', '56'], 'picker = bag clubs');
    assert.match(opts[1][1], /^Driver · 2(3[5-9]|4[0-4])$/); assert.match(opts[7][1], /^7i · 14[0-6]$/);
    await page.selectOption('select[data-f="club"][data-k="0"]', 'Driver');
    await page.fill('input[data-row="0"]', '410'); await page.click('[data-act="addShot"]'); await page.fill('input[data-row="1"]', '150');
    await page.selectOption('select[data-f="loc"][data-k="1"]', 'fairway'); await page.selectOption('select[data-f="club"][data-k="1"]', '7i');
    let rd = await page.evaluate(() => window.__golf.rounds()[0]); assert.deepStrictEqual(rd.holes[0].rows.map(r => r.club), ['Driver', '7i'], 'saved club = its short name');
    await page.$eval('select[data-f="club"][data-k="1"]', e => { e.size = 9; e.style.height = 'auto'; e.style.position = 'relative'; e.style.zIndex = 5; }); // show the list (a native dropdown can't be screenshotted)
    await page.evaluate(() => { const s = document.querySelector('select[data-f="club"][data-k="1"]'); window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 260); });
    await shot('bag-picker-in-round');
    // an older shot with a club not in the bag still shows it; empty bag → the standard list
    await page.evaluate(() => { const r = window.__golf.rounds(); r[0].holes[0].rows[1].club = '5W'; localStorage.setItem('golfsg.rounds.v1', JSON.stringify(r)); });
    await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('.holecard');
    assert.strictEqual(await page.$eval('select[data-f="club"][data-k="1"]', e => e.value), '5W', 'club outside the bag still shown');
    const sg1 = await page.evaluate(() => SG.summarize(window.__golf.rounds()[0]).sgTotal);
    const bagJson = await page.evaluate(() => localStorage.getItem('golfsg.bag.v1'));
    await page.evaluate(() => localStorage.removeItem('golfsg.bag.v1')); await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('.holecard');
    assert.deepStrictEqual((await page.$$eval('select[data-f="club"][data-k="0"] option', e => e.map(o => o.value))).slice(1), SG.CLUBS, 'empty bag: standard list as before');
    assert.strictEqual(await page.evaluate(() => SG.summarize(window.__golf.rounds()[0]).sgTotal), sg1, 'strokes gained unaffected by the bag');
    // backup → restore round trip (bag only file) into an empty bag
    const bk = await page.evaluate(j => JSON.stringify(SG.makeBackup([], null, 'Quincy', [], JSON.parse(j))), bagJson);
    fs.writeFileSync('/tmp/bag-backup.json', bk); assert.ok(JSON.parse(bk).bag.clubs.length === 13);
    await page.click('[data-act="home"]'); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); await page.setInputFiles('#restorefile', '/tmp/bag-backup.json');
    await page.waitForSelector('#rpbag'); assert.match(await page.textContent('#rpgo'), /Restore my bag/); await page.click('#rpgo'); await page.waitForSelector('#notice');
    assert.match(await page.textContent('#notice'), /My Bag \(13 clubs\)/); B = await store(); assert.strictEqual(B.clubs.length, 13); assert.strictEqual(B.clubs.find(c => c.code === '7i').carry, 150);
    assert.ok(await page.$eval('[data-act="backup"]', e => !e.disabled));
    const full = await page.evaluate(() => SG.makeBackup([], null, 'Quincy', [], JSON.parse(localStorage.getItem('golfsg.bag.v1')))); assert.strictEqual(full.bag.base.elev, 5000);
    assert.deepStrictEqual(errors, []);
    console.log('BAG OK');
  } finally { await br.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
