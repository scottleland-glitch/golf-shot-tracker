// v117 putt map lines: made putts = black line into the hole, missed = red line to where it finished; "All putts" mode; the map headline
// matches the Round stats row "1st putts made inside 10 ft" (5/7 = 6–10 ft 3/5 + under 6 ft 2/2 – the Arcade Creek case); Putts map misses red.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const PORT = 8868, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = '/workspace/golf-app/screenshots/';
const ok = m => console.log('OK  ' + m);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
    P.setDefaultTimeout(60000); P.on('pageerror', e => errors.push(String(e))); P.on('dialog', d => d.accept());
    P.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
    await P.goto(BASE + '?x=' + Date.now());
    await P.evaluate(() => {
      const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
      // putts per hole [ft, side of the hole]; the last one goes in
      const HP = [[[8, 'short']], [[7, 'left'], [2, 'long']], [[9, 'right'], [3, 'shortleft'], [1, 'right']], [[6, 'short']], [[10, 'longleft']], [[4, 'short']], [[3, 'left']],
        [[30, 'short'], [4, 'longright'], [1.5, 'left']], [[22, 'right'], [2, 'short']]];
      const holes = HP.map(ps => ({ par: 4, finished: true, rows: [R(380, 'tee'), R(140, 'fairway')].concat(ps.map((q, i) => R(q[0], i === ps.length - 1 ? 'holed' : 'green', q[1]))) }));
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'pl117', date: '2026-10-30T17:00:00.000Z', course: 'Arcade Creek', baseline: 'pga', player: 'Scott', holes }]));
    });
    await P.reload();
    if (await P.$('#plusbtn')) await P.click('#plusbtn'); await P.click('[data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="pl117"]');
    const xt = async id => { if (!(await P.$('[data-stx="' + id + '"].open'))) await P.click('[data-act="stx"][data-v="' + id + '"]'); };
    // Round stats row
    const row = await P.textContent('[data-act="stx"][data-v="pmiss"]'); assert.match(row.replace(/\s+/g, ' '), /1st putts made inside 10 ft\s*5\/7 \(71%\)/); ok('Round stats row: 1st putts made inside 10 ft 5/7 (71%)');
    await xt('pmiss'); await P.click('[data-stx="pmiss"] [data-act="map"][data-v="pmiss"]'); await P.waitForSelector('#pmissmap');
    const btns = await P.$$eval('#pmgroups button', bs => bs.map(x => [x.getAttribute('data-v'), +x.getAttribute('data-n')]));
    assert.deepStrictEqual(btns, [['6-10', 5], ['0-6', 2], ['lag', 2]]); ok('map buttons: 6–10 ft 5 · Under 6 ft 2 · Over 10 ft 2 (v137: no All putts)');
    const head = 'Map'; await P.click('#pmgroups [data-v="6-10"]'); await P.waitForTimeout(150);
    assert.strictEqual(await P.textContent('#mapsum'), '5/7 made (71%) – 1st putts from 10 ft and in this round');
    assert.strictEqual(await P.textContent('#pmshow'), 'Map shows 1st putts from 6–10 ft: 3/5 made (60%)'); ok('headline 5/7 (71%) = the Round stats row; 2nd line says the map shows 6–10 ft: 3/5 (60%)');
    const lines = async () => P.$$eval('#pmissmap path.pmmade, #pmissmap path.pmtr', ps => ps.map(p => ({ c: p.getAttribute('class'), s: p.getAttribute('stroke'), d: p.getAttribute('d'), w: +p.getAttribute('stroke-width'), n: p.getAttribute('data-n'), h: p.getAttribute('data-hole') })));
    const endOf = d => d.trim().split(/[ QLM]+/).filter(Boolean).slice(-2).map(Number), startOf = d => d.replace('M', '').split(' ').slice(0, 2).map(Number);
    let L = await lines(); let mk = L.filter(x => x.c === 'pmmade'), ms = L.filter(x => x.c === 'pmtr');
    assert.strictEqual(mk.length, 3); assert.strictEqual(ms.length, 2);
    assert.ok(mk.every(x => x.s === '#111' && endOf(x.d).join() === '180,200'), 'made = black into the hole centre'); assert.ok(ms.every(x => x.s === '#d0312d' && x.w <= 2), 'missed = thin red');
    assert.strictEqual(await P.locator('#pmissmap .pmend').count(), 2); ok('6–10 ft: 3 black lines end in the hole centre (180,200), 2 thin red lines to their finish');
    const leg = await P.$$eval('#pmlegend > span', s => s.map(x => x.textContent)); assert.ok(leg[0].startsWith('Made – black line into the hole') && leg[1].startsWith('Missed – red line'), leg);
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'putt-map-v117.png' });
    await P.click('#pmgroups [data-v="0-6"]'); await P.waitForTimeout(150); L = await lines();
    assert.strictEqual(L.filter(x => x.c === 'pmmade').length, 2); assert.strictEqual(L.filter(x => x.c === 'pmtr').length, 0); assert.strictEqual(await P.textContent('#pmshow'), 'Map shows 1st putts from Under 6 ft: 2/2 made (100%)'); ok('Under 6 ft: 2 black lines, no red');
    // Over 10 ft (lag)
    await P.click('#pmgroups [data-v="lag"]'); await P.waitForTimeout(150); L = await lines();
    assert.strictEqual(L.filter(x => x.c === 'pmtr').length, 2); assert.strictEqual(L.filter(x => x.c === 'pmmade').length, 0);
    assert.strictEqual(await P.textContent('#pmshow'), 'Map shows 1st putts from over 10 ft: 2 putts · 0 made · 1 inside 3 ft'); assert.strictEqual(await P.textContent('#mapsum'), '5/7 made (71%) – 1st putts from 10 ft and in this round');
    ok('Over 10 ft: 2 red lag lines (30 ft left 4 ft, 22 ft left 2 ft), 1 inside 3 ft; headline unchanged');
    assert.strictEqual(await P.$('#pmgroups [data-v="all"]'), null, 'v137: All putts removed');
    const fonts = await P.$$eval('#mapview *', es => es.filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('title') && !e.closest('.infobtn')).map(e => { const c = getComputedStyle(e); return [e.tagName, +c.fontWeight, parseFloat(c.fontSize), e.textContent.trim().slice(0, 30)]; }));
    const heavy = fonts.filter(f => f[1] > 500 || f[2] > 22); assert.deepStrictEqual(heavy, [], 'light, small text'); ok('map text all weight ≤ 500 and ≤ 22 px – stat numbers are the usual 22 px light (' + fonts.length + ' text nodes)');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'putt-map-all-v117.png' });
    // Lag tile opens the map on Over 10 ft
    await P.click('[data-act="mapclose"]'); await xt('lag'); await P.click('[data-stx="lag"] [data-act="map"][data-v="pmiss"]'); await P.waitForSelector('#pmissmap');
    assert.strictEqual(await P.getAttribute('#pmgroups button.sel', 'data-v'), 'lag'); assert.strictEqual(await P.getAttribute('#pmissmap', 'data-mode'), 'lag');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'putt-map-lag-v117.png' });
    await P.click('[data-act="mapclose"]'); await P.click('[data-stx="pmiss"] [data-act="map"][data-v="pmiss"]'); await P.waitForSelector('#pmissmap');
    assert.strictEqual(await P.getAttribute('#pmgroups button.sel', 'data-v'), '0-6'); ok('Lag tile opens the map on Over 10 ft; the 1st-putts tile opens it back on a 10 ft-and-in group');
    // Putts map: missed = red (no blue), legend black / red
    await P.click('[data-act="mapclose"]'); await xt('putt'); await P.click('[data-stx="putt"] [data-act="map"][data-v="putt"]'); await P.waitForSelector('#puttmap');
    const html = await P.innerHTML('#mapview'); assert.ok(!/#1565e0/i.test(html), 'no blue on the Putts map');
    const strokes = await P.$$eval('#puttmap .pdot2', c => [...new Set(c.map(x => x.getAttribute('stroke')))]); assert.ok(strokes.every(s => s === '#000' || s === '#d0312d'), strokes);
    assert.deepStrictEqual(await P.$$eval('#puttlegend span', ss => ss.slice(0, 2).map(x => x.textContent)), ['Made (black)', 'Missed (red)']); ok('Putts map: made black, missed red outline; legend Made (black) / Missed (red)');
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []); ok('no page errors, no outside requests');
    console.log('ALL OK putt-lines-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
