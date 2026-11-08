// v115: compact hole screen. Header "Hole N · yards · Par X · SI N" from the saved scorecard (no 3/4/5 buttons when the card has the par);
// finished shots fold into one tight line (# · Hit · Club · Loc · SG chip), only the shot being entered has the entry cells + "Dist to pin" header;
// tap a line to edit it again. Small light type. Only localhost. iPhone 390x844 @3x. Run: node tests/hole-tight-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ROOT = __dirname + '/../', OUT = __dirname + '/../screenshots/', PORT = +(process.env.PORT || 8864), BASE = 'http://localhost:' + PORT + '/', TAG = process.env.TAG || 'v115';
const ok = m => console.log('  ✓ ' + m);
const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4], HCP = [7, 3, 15, 1, 11, 17, 5, 9, 13, 8, 16, 2, 10, 4, 18, 12, 6, 14];
const YDS = [349, 512, 165, 401, 377, 142, 530, 365, 388, 372, 158, 545, 380, 410, 128, 360, 520, 395];
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: process.env.ROOT || ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(BASE)) return r.continue(); outside.push(u); return r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000); page.on('dialog', d => d.accept());
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    const shot = async name => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; window.scrollTo(0, 0); }); await page.waitForTimeout(350); await page.screenshot({ path: OUT + name + '.png' }); };
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(([P, H, Y]) => { const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
      const holes = P.map((p, i) => ({ par: p, rows: [R(Y[i], 'tee')] }));
      holes[0].rows = [R(349, 'tee', { club: 'Driver' }), R(152, 'rough', { club: '7i', dir: 'right' }), R(14, 'green', { dir: 'short' })];
      holes[3] = { par: 4, finished: true, pin: 'center', rows: [R(401, 'tee', { club: 'Driver' }), R(168, 'fairway', { club: '6i', dir: 'left' }), R(22, 'rough', { dir: 'left' }), R(6, 'green', { dir: 'short' }), R(2, 'green', { dir: 'long', holeOut: true })] };
      holes[5] = { par: '', rows: [R('', 'tee')] }; // a hole with no par from the card
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
      const PC = P.slice(); PC[5] = null;
      localStorage.setItem('golfsg.courses.v1', JSON.stringify([{ id: 'wg', name: 'Washoe Golf Course', pars: PC, hcp: H, updated: '2026-10-31T20:00:00Z', tees: [{ name: 'White', yards: Y }] }]));
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r1', date: '2026-10-31T17:00:00Z', course: 'Washoe Golf Course', courseId: 'wg', tee: 'White', baseline: 'pga', player: 'Scott', holes }]));
      localStorage.setItem('golfsg.current.v1', 'r1'); }, [PARS, HCP, YDS]);
    await page.reload(); await page.click('#resumepill'); await page.waitForSelector('.holecard');
    const go = async i => { while (!new RegExp('Hole ' + i + '\\b').test(await page.textContent('.hc-head h2'))) await page.click((await page.textContent('.hc-head h2')).match(/\d+/)[0] > i ? '.topbar [data-act="prev"]' : '.topbar [data-act="next"]'); };
    await go(1);
    const head = () => page.$eval('.hc-head', e => e.innerText.replace(/\s+/g, ' ').trim());
    const lines = () => page.$$eval('.tline', e => e.map(x => [...x.children].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
    if (process.env.BEFORE) { await shot('hole-3shots-before-v114'); console.log('before shot taken'); return; }
    const vis = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom <= innerHeight; });
    const css = (sel, p) => page.$eval(sel, (e, p) => getComputedStyle(e)[p], p);
    // ---- 1. header from the scorecard; par is plain text (no 3/4/5 buttons)
    assert.strictEqual(await head(), 'Hole 1 349 yd Par 4 SI 7'); assert.strictEqual(await page.$('[data-act="par"]'), null, 'no par buttons');
    assert.strictEqual(await page.$eval('#hpar', e => e.tagName), 'SPAN', 'par is read-only when it comes from the card');
    assert.ok(parseFloat(await css('.hc-head h2', 'fontSize')) <= 18 && +(await css('.hc-head h2', 'fontWeight')) <= 500, 'small, light hole title');
    ok('header "Hole 1 · 349 yd · Par 4 · SI 7" from the scorecard; par read-only');
    // ---- 2. 3 shots: 2 tight lines + the active entry row with its own header
    assert.deepStrictEqual(await lines(), [['1', '197 yd', 'Driver', 'Tee → Rough', '-0.31'], ['2', '147 yd', '7i', 'Rough → Green', '+0.45']]);
    assert.strictEqual(await page.textContent('#thead'), '#HitClubLocSG');
    assert.deepStrictEqual(await page.$$eval('.shotcard[data-k]', e => e.map(x => x.getAttribute('data-k'))), ['2'], 'only the last shot has entry cells');
    assert.strictEqual(await page.$$eval('#shotcard', e => e.length), 1, 'v157: one shot card'); assert.match(await page.textContent('#shotcard'), /Shot 3/);
    assert.strictEqual(await page.$$eval('.sinfo', e => e.filter(x => x.textContent.trim()).length), 0, 'no repeated "Off the tee · hit …" text');
    assert.match(await css('.sgchip.neg', 'backgroundColor'), /rgba\(214, 90, 100/); assert.match(await css('.sgchip.pos', 'backgroundColor'), /rgba\(76, 175, 110/);
    const T = await page.$eval('.tline', e => { const c = getComputedStyle(e); return [e.getBoundingClientRect().height, parseFloat(c.fontSize), +c.fontWeight]; });
    assert.ok(T[0] <= 36 && T[1] <= 14 && T[2] <= 400, 'tight light lines ' + T);
    const E = await page.$$eval('#shotcard input, #shotcard select', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    assert.ok(E.every(h => h >= 36 && h <= 56), 'v157 card: entry cells 36-56 px ' + E);
    for (const s of ['.addshot', '.finish', '#micbtn']) { const v = await page.$eval(s, e => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).fontSize), +getComputedStyle(e).fontWeight]); assert.ok(v[0] >= 36 && v[0] <= 46 && v[1] <= 15 && v[2] <= 500, s + ' compact ' + v); }
    assert.ok(await page.$eval('.finish', e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom <= innerHeight + 260; }), 'v158: Finish hole is just under the shot card (a short scroll)');
    await shot('hole-3shots-' + TAG);
    ok('2 tight lines (# · Hit · Club · Loc · SG chip) + one entry row headed "Dist to pin"; compact 13-15 px light type; Finish hole on screen');
    // ---- 3. Hit / Loc fill in only from the next shot
    await page.click('[data-act="addShot"]'); await page.waitForSelector('input[data-row="3"]');
    let L = await lines(); assert.deepStrictEqual(L[2].slice(0, 3), ['3', '–', 'Putter'], 'no Hit until the next distance');
    await page.fill('input[data-row="3"]', '3'); L = await lines(); assert.strictEqual(L[2][1], '14 ft', 'Hit fills in as the next distance is typed (putt length)');
    await page.selectOption('select[data-f="loc"][data-k="3"]', 'fairway'); L = await lines(); assert.strictEqual(L[2][3], 'Green → Fairway', 'Loc = own lie → where it finished (next shot\'s lie)');
    await page.selectOption('select[data-f="loc"][data-k="3"]', 'green');
    ok('new shot: line above shows "–" until the next distance / lie are entered, then fills in');
    // ---- 4. tap a line to edit it; the others stay tight; every control still works
    await page.click('.tline[data-k="0"]'); await page.waitForSelector('input[data-row="0"]');
    assert.deepStrictEqual(await page.$$eval('.shotcard[data-k]', e => e.map(x => x.getAttribute('data-k'))), ['0']);
    assert.ok(await page.$('input[data-f="layup"][data-k="0"]'), 'Layup box on shot 1');
    await page.selectOption('select[data-f="club"][data-k="0"]', '3W');
    await shot('hole-reedit-' + TAG);
    await page.click('.tline[data-k="1"]'); await page.waitForSelector('input[data-row="1"]'); L = await lines(); assert.strictEqual(L[0][2], '3W', 'club change shows on the line');
    await page.click('[data-act="pen"][data-k="1"]'); await page.click('[data-act="dirpick"][data-k="1"]'); await page.click('.dirgrid [data-act="setdir"][data-v="left"]');
    await page.click('.tline[data-k="3"]'); L = await lines(); assert.strictEqual(L[0][3], 'Tee → Rough+1', 'penalty of shot 1 shows on its line, no miss arrow ' + L[0][3]); assert.strictEqual(await page.$('.tline .tarr'), null);
    await page.click('[data-act="fin"][data-v="in"][data-k="3"]'); await page.click('[data-act="finish"]'); await page.waitForSelector('.hole-done');
    L = await lines(); assert.strictEqual(L.length, 4); assert.deepStrictEqual(L[3].slice(1, 4), ['3 ft', 'Putter', 'Green → Holed']); assert.strictEqual(await page.$('.shotcard[data-k]'), null, 'finished: all tight');
    await page.click('[data-act="reopen"]'); assert.deepStrictEqual(await page.$$eval('.shotcard[data-k]', e => e.map(x => x.getAttribute('data-k'))), ['3']);
    await page.click('.tline[data-k="2"]'); await page.click('[data-act="del"][data-k="2"]'); assert.strictEqual(await page.$$eval('.tline, .shotcard[data-k]', e => e.length), 3, 'delete still works');
    ok('tap a line → full cells for that shot (club, Layup, P, Dir, delete, Hole out all work); the line updates; finished hole is all lines');
    // ---- 5. one shot (hole 2) and a par 3 (hole 3)
    await go(2); assert.strictEqual(await head(), 'Hole 2 512 yd Par 5 SI 3'); assert.strictEqual(await page.$('#thead'), null); assert.strictEqual(await page.$$eval('.shotcard[data-k]', e => e.length), 1);
    await shot('hole-1shot-' + TAG); ok('hole 2, first shot: only the entry row (no tight lines yet)');
    await go(3); assert.strictEqual(await head(), 'Hole 3 165 yd Par 3 SI 15'); assert.strictEqual(await page.$('input[data-f="layup"]'), null, 'no Layup on a par 3');
    await page.selectOption('select[data-f="club"][data-k="0"]', '7i'); await page.click('[data-act="addShot"]'); assert.strictEqual((await lines())[0][3], 'Tee → –', 'to stays – until the next lie is chosen'); await page.selectOption('select[data-f="loc"][data-k="1"]', 'green'); await page.fill('input[data-row="1"]', '20');
    await page.click('[data-act="addShot"]'); await page.fill('input[data-row="2"]', '3');
    L = await lines(); assert.deepStrictEqual(L.map(l => l.slice(0, 4)), [['1', '158 yd', '7i', 'Tee → Green'], ['2', '20 ft', 'Putter', 'Green → Green']]);
    await shot('hole-par3-' + TAG); ok('par 3: "Hole 3 · 165 yd · Par 3 · SI 15", tee shot 158 yd 7i to the green, putt line');
    // ---- 6. finished hole of the round (hole 4)
    await go(4); L = await lines(); assert.strictEqual(L.length, 5); assert.deepStrictEqual(L[4].slice(1, 4), ['2 ft', 'Putter', 'Green → Holed']);
    assert.strictEqual(await page.$('button.tline'), null, 'finished lines are not buttons'); assert.match(await page.textContent('.hole-done'), /Score 5/);
    await shot('hole-finished-' + TAG); ok('finished hole: five tight lines, last one "Holed"');
    // ---- 7. no par on the card → pick it once, then tap "Par 4 ✎" to change
    await go(6); assert.strictEqual(await page.$$eval('#parpick [data-act="par"]', e => e.length), 3); assert.match(await head(), /^Hole 6 142 yd Par 3 4 5 SI 17$/);
    await page.click('#parpick [data-v="4"]'); assert.match(await page.textContent('#hpar'), /Par 4/); assert.strictEqual(await page.$eval('#hpar', e => e.tagName), 'BUTTON');
    await page.click('#hpar'); await page.click('#parpick [data-v="3"]'); assert.match(await page.textContent('#hpar'), /Par 3/);
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[5].par), 3);
    ok('no par on the scorecard: small 3/4/5 to pick, then "Par 4 ✎" can be tapped to change it');
    // ---- 8. longest Loc ("Fairway → Bunker" + penalty) is not cut off at 375 px wide
    await page.fill('input[data-row="0"]', '342');
    await page.click('[data-act="addShot"]'); await page.selectOption('select[data-f="loc"][data-k="1"]', 'fairway'); await page.fill('input[data-row="1"]', '60');
    await page.click('[data-act="addShot"]'); await page.selectOption('select[data-f="loc"][data-k="2"]', 'bunker'); await page.fill('input[data-row="2"]', '10'); await page.click('[data-act="pen"][data-k="2"]');
    await page.click('[data-act="addShot"]'); await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(200);
    L = await lines(); assert.deepStrictEqual(L.map(l => l[3]), ['Tee → Fairway', 'Fairway → Bunker+1', 'Bunker → –']);
    const cut = await page.$$eval('.tline > span, .tline .tlw', e => e.filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent));
    assert.deepStrictEqual(cut, [], 'nothing cut off at 375 px'); await page.setViewportSize({ width: 390, height: 844 });
    ok('375 px: "Fairway → Bunker +1" fits, nothing cut off');
    assert.deepStrictEqual(outside, [], 'nothing outside localhost'); assert.deepStrictEqual(errors, []);
    console.log('PASS hole-tight-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
