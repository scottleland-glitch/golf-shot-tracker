// v104 Putt misses = putts of 10 ft and in only; putts from more than 10 ft are lag putts (good = finished inside 3 ft, 3 ft counts, holed counts).
// Fixture: first putts of 4, 8, 10, 12, 25, 40, 40 and 12 ft with different leaves. Checks: the misses tile / map only count putts of 10 ft or less
// (exactly 10 ft is in, two groups: under 6 ft and 6–10 ft, no 10–20 / 20–30 / 30–50 groups); the Lag putts tile counts putts over 10 ft with the 3 ft
// line (exactly 3 ft is inside, 3.5 ft is not); the lag box in the map follows This round / All rounds; putting totals still include every putt.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8842, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('ok - ' + m);
const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
// each hole: par 4, tee 400 -> fairway 150 -> the putts [ft, where the previous putt finished]; the last one goes in
const hole = putts => ({ par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway')].concat(putts.map((p, k) => R(p[0], k === putts.length - 1 ? 'holed' : 'green', p[1]))) });
const H = [
  [[4]],                          // 1: 4 ft made
  [[8], [2, 'short']],            // 2: 8 ft missed, 2 ft left
  [[10], [4, 'long']],            // 3: exactly 10 ft missed, 4 ft left  -> a putt miss (10 ft counts)
  [[12], [3, 'short']],           // 4: 12 ft lag to exactly 3 ft        -> lag inside
  [[25], [3.5, 'right']],         // 5: 25 ft lag to 3.5 ft              -> lag outside
  [[40], [2, 'long']],            // 6: 40 ft lag to 2 ft                -> lag inside
  [[40]],                         // 7: 40 ft holed                      -> lag inside (made)
  [[12], [11, 'short'], [1, 'left']] // 8: 12 ft lag to 11 ft (outside), then 11 ft lag to 1 ft (inside), 1 ft in
];
const rnd = (id, date, holes) => ({ v: 3, dv: 2, id, date, course: 'Putt lab', baseline: 'pga', player: 'Scott', holes });
const R1 = rnd('lag1', '2026-10-30T16:00:00.000Z', H.map(hole));
const R2 = rnd('lag2', '2026-10-20T16:00:00.000Z', []); // 15 ft lag to 5 ft (outside), 5 ft in; 9 ft in
R2.holes = [{ par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(15, 'green'), R(5, 'holed', 'short')] }, hole([[9]])];

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await ctx.route(/^https:\/\/([a-z0-9-]+\.)?(google|googleapis|microsoft|live|microsoftonline)\.com\//, route => { errors.push('unexpected outside call ' + route.request().url()); route.abort(); });
    await ctx.addInitScript(rs => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
      localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); } }, [R1, R2]);
    const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
    const shot = async name => { await P.waitForFunction(() => !document.querySelector('#toast.show')); await P.waitForTimeout(400); await P.screenshot({ path: OUT + name }); };
    const open = async id => { if (!(await P.$(`[data-stx="${id}"].open`))) await P.click(`[data-act="stx"][data-v="${id}"]`); };
    await P.goto(BASE + 'index.html'); await P.waitForSelector('#plusbtn');
    await P.click('#plusbtn'); await P.click('#plusmenu [data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="lag1"]'); await P.waitForSelector('#stattiles');

    // ---------- 1. the engine ----------
    const E = await P.evaluate(() => { const S = SG.summarize(window.__golf.rounds().find(r => r.id === 'lag1'), 'pga');
      return { putts: S.putts, list: S.puttList.map(p => [p.ft, p.made, p.endFt, SG.pmissGroup(p.ft), SG.lagPutt(p.ft), SG.lagPutt(p.ft) ? SG.lagGood(p) : null]), lag: SG.lagStats(S.puttList),
        groups: SG.PMISS_GROUPS.map(g => g.id) }; });
    assert.strictEqual(E.putts, 15); assert.strictEqual(E.list.length, 15); ok('putting totals still count all 15 putts');
    assert.deepStrictEqual(E.groups, ['6-10', '0-6']);
    const misses = E.list.filter(p => p[3]), lags = E.list.filter(p => p[4]);
    assert.deepStrictEqual(misses.map(p => p[0]), [4, 8, 2, 10, 4, 3, 3.5, 2, 1]); assert.ok(misses.every(p => p[0] <= 10) && lags.every(p => p[0] > 10));
    assert.deepStrictEqual(E.list.find(p => p[0] === 10).slice(3, 5), ['6-10', false]); ok('exactly 10 ft is a putt-miss putt (6–10 ft group), not a lag putt');
    assert.deepStrictEqual(lags.map(p => [p[0], p[2], p[5]]), [[12, 3, true], [25, 3.5, false], [40, 2, true], [40, 0, true], [12, 11, false], [11, 1, true]]);
    ok('lag putts: 12→3 ft inside (exactly 3 ft counts), 25→3.5 ft outside, 40→2 ft inside, 40 holed inside, 12→11 ft outside, 11→1 ft inside');
    assert.deepStrictEqual([E.lag.attempts, E.lag.inside, E.lag.outside, Math.round(E.lag.pct), Math.round(E.lag.avgLeaveFt * 10) / 10], [6, 4, 2, 67, 3.4]);

    // ---------- 2. tiles ----------
    await open('pmiss'); await open('lag');
    const T = await P.evaluate(() => { const h = id => document.querySelector(`[data-stx="${id}"] .stxh`); return {
      pmH: h('pmiss').textContent, pmTile: document.querySelector('[data-stx="pmiss"] .stat.tile').textContent, lagH: h('lag').textContent, lagTile: document.querySelector('[data-stx="lag"] .stat.tile').textContent,
      order: [...document.querySelectorAll('#stattiles [data-act="stx"]')].map(x => x.getAttribute('data-v')) }; });
    assert.strictEqual(T.pmH, 'Putt misses (10 ft and in)2'); assert.match(T.pmTile, /made 7\/9 \(putts of 10 ft and in\)/); assert.ok(!/50 ft/.test(T.pmTile));
    assert.strictEqual(T.lagH, 'Lag putts (over 10 ft)4 / 6'); assert.match(T.lagTile, /4 of 6 finished inside 3 ft \(67%\) · avg leave 3\.4 ft/);
    assert.strictEqual(T.order.indexOf('lag'), T.order.indexOf('pmiss') + 1);
    ok('tiles: Putt misses (10 ft and in) 2 – made 7/9; Lag putts (over 10 ft) 4 / 6 – "4 of 6 finished inside 3 ft (67%) · avg leave 3.4 ft", right under Putt misses');
    await P.evaluate(() => window.scrollTo(0, document.querySelector('[data-stx="pmiss"]').getBoundingClientRect().top + window.scrollY - 140));
    await shot('lag-putts-tile.png');

    // ---------- 3. putt-misses map: two groups only, lag box follows the scope ----------
    await P.click('[data-stx="lag"] [data-act="map"][data-v="pmiss"]'); await P.waitForSelector('#pmissmap');
    const g = await P.$$eval('#pmgroups button', bs => bs.map(x => [x.getAttribute('data-v'), +x.getAttribute('data-n'), x.textContent]));
    assert.deepStrictEqual(g.map(x => x.slice(0, 2)), [['6-10', 2], ['0-6', 7]]); ok('map groups: 6–10 ft (2 putts) and Under 6 ft (7) – no 10–20, 20–30 or 30–50 ft groups');
    await P.click('#pmgroups [data-v="6-10"]'); await P.waitForTimeout(150);
    assert.strictEqual(await P.textContent('#mapsum'), '2 missed of 2 putts from 6–10 ft this round'); assert.strictEqual(await P.locator('#pmissmap .pmend').count(), 2);
    const lb = async () => P.$$eval('#lagbox .stat', s => s.map(x => x.querySelector('span').textContent + ': ' + x.querySelector('b').textContent));
    assert.deepStrictEqual(await lb(), ['Lag putts inside 3 ft: 4 / 6 (67%)', 'Avg leave (lag putts): 3.4 ft']); assert.match(await P.textContent('#lagbox .lagh'), /this round/);
    assert.match(await P.textContent('#mapview'), /Only putts that start 10 ft or closer count here/);
    ok('6–10 ft: 2 missed of 2 (8 ft and exactly 10 ft); lag box this round: 4 / 6 (67%), avg leave 3.4 ft; help text explains the 10 ft / 3 ft rule');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await shot('putt-misses-10ft.png');
    await P.click('[data-act="mapscope"][data-v="all"]'); await P.waitForSelector('#lagbox');
    const ga = await P.$$eval('#pmgroups button', bs => bs.map(x => [x.getAttribute('data-v'), +x.getAttribute('data-n')]));
    assert.deepStrictEqual(ga, [['6-10', 3], ['0-6', 8]]);
    assert.deepStrictEqual(await lb(), ['Lag putts inside 3 ft: 4 / 7 (57%)', 'Avg leave (lag putts): 3.6 ft']); assert.match(await P.textContent('#lagbox .lagh'), /2 rounds/);
    ok('All rounds (2): misses groups 6–10 ft 3 · under 6 ft 8; lag 4 / 7 (57%) – the 15 ft putt left at 5 ft is outside; avg leave 3.6 ft');
    await P.click('[data-act="mapscope"][data-v="round"]'); await P.waitForSelector('#lagbox'); assert.deepStrictEqual((await lb())[0], 'Lag putts inside 3 ft: 4 / 6 (67%)');

    assert.deepStrictEqual(errors, []); ok('no page errors, no outside calls');
    console.log('ALL OK lag-putts-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
