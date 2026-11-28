// v269/v271 (Scott): tournament rounds count as practice – 2.5 h a round (9 holes: half), 30 min per group,
// built from the rounds (never saved) and drawn striped in each chart's own colours on My Practice, the Practice tab charts and the Trends practice line.
// Strokes lost vs practice time and Your game and your training stay your own practice. Run: node tests/tour-practice-focused.js [outDir]
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ARC = require('./fixtures/arcade-78.js'); const MY = require('../mygame.js'), SG = require('../sg.js'), TR = require('../trends.js');
const PORT = 8893, BASE = 'http://127.0.0.1:' + PORT + '/', DAY = 864e5, now = Date.now(), ok = m => console.log('  ✓ ' + m), OUT = process.argv[2] || '/tmp/tourprac-test'; fs.mkdirSync(OUT, { recursive: true });
const ld = (n) => { const t = new Date(now - n * DAY); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const round = (id, ago, play) => Object.assign(JSON.parse(JSON.stringify(ARC.round())), { id, player: 'Scott', baseline: 'd1w', play, course: 'Ridgeview', date: ld(ago) + 'T16:00:00' });
const SP = ['short', 'lag', 'chip', 'wedges', 'irons', 'drive', 'bunker'];
// practice every other day, except the tournament week (days 3–1 ago) and the week before it
const logs = []; for (let d = 2; d <= 70; d += 2) if (!(d <= 10)) logs.push({ id: 'p' + d, date: ld(d) + 'T12:00:00', player: 'Scott', spoke: SP[(d / 2) % 7], focus: '', min: 45, feel: 'ok' });
const R = [round('pr', 40, 'practice'), round('t1', 3, 'tournament'), round('t2', 2, 'tournament'), round('t3', 1, 'tournament'), round('o', 20, '')];

// ---- the maths (node) ----
const T = MY.tourPractice(R, SG), sum = (L) => L.reduce((a, e) => a + e.min, 0);
assert.strictEqual(new Set(T.map(e => e.round)).size, 3, 'tournament rounds only – not practice or untagged rounds');
['t1', 't2', 't3'].forEach(id => assert.ok(Math.abs(sum(T.filter(e => e.round === id)) - 150) < 0.5, id + ' = 2.5 h'));
// v271 (Scott): split equally across the five groups – 30 min each (Putting 15 short + 15 lag, Short game 15 chip + 15 bunker)
const G = { short: 15, lag: 15, chip: 15, bunker: 15, wedges: 30, irons: 30, drive: 30 }; MY.SPOKES.forEach(s => assert.strictEqual(sum(T.filter(e => e.round === 't1' && e.spoke === s.k)), G[s.k], s.k));
const nine = round('n9', 5, 'tournament'); nine.holes = nine.holes.slice(0, 9); assert.ok(Math.abs(sum(MY.tourPractice([nine], SG)) - 75) < 0.5, '9 holes = 1 h 15 min');
assert.strictEqual(MY.validPractice(T).length, T.length, 'credit survives validPractice'); assert.ok(MY.validPractice(T).every(e => e.kind === 'tour'));
ok('2.5 h per tournament round, 30 min per group, 9 holes half, other rounds none');
const B = TR.build(R, logs, SG, MY, { bl: 'd1w', weeks: 26, now }), Bn = TR.build(R.map(r => Object.assign({}, r, { play: r.play === 'tournament' ? '' : r.play })), logs, SG, MY, { bl: 'd1w', weeks: 26, now });
const last = (A) => A.pd[A.pd.length - 1];
assert.ok(last(B.total).h > last(Bn.total).h + 2, 'Trends: the tournament week lifts the practice line: ' + last(B.total).h.toFixed(1) + ' vs ' + last(Bn.total).h.toFixed(1) + ' h a week');
assert.ok(last(B.total).hp != null && last(B.total).hp < last(B.total).h, 'own practice (hp) under the line');
assert.ok(B.total.nowX > Bn.total.nowX, 'forecast practice level (nowX) counts it');
ok('Trends: practice now ' + last(B.total).h.toFixed(1) + ' h a week (own ' + last(B.total).hp.toFixed(1) + ') vs ' + last(Bn.total).h.toFixed(1) + ' untagged; nowX ' + B.total.nowX.toFixed(1) + ' vs ' + Bn.total.nowX.toFixed(1));

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), page = await ctx.newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(([R, P]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play');
      localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P)); }, [R, logs]); await page.reload();
    // My Game → My Practice spider
    await page.click('#tbmygame'); await page.waitForSelector('#prcard');
    const sp = await page.$eval('#prpages .prpage[data-p="30d"]', p => ({ tour: p.querySelectorAll('polygon.ptour').length, cur: p.querySelectorAll('polygon.pcur').length, pat: !!p.querySelector('svg pattern'),
      fill: (p.querySelector('polygon.ptour') || {}).getAttribute ? p.querySelector('polygon.ptour').getAttribute('fill') : '', lede: p.querySelector('.prlede2').textContent, leg: p.querySelector('.mglegend').textContent }));
    assert.ok(sp.tour === 1 && sp.cur === 1 && sp.pat && /^url\(#tourhatch\d+\)$/.test(sp.fill), JSON.stringify(sp));
    assert.match(sp.lede, /Includes 1 h 45 min a week from tournament rounds\./); assert.match(sp.leg, /Tournament rounds/);
    const wk = await page.$eval('#prpages .prpage[data-p="week"]', p => p.querySelector('.prlede2').textContent); // this week: real minutes
    const mon = new Date(now); mon.setHours(0, 0, 0, 0); const monAgo = Math.round((now - (mon.getTime() - ((mon.getDay() + 6) % 7) * DAY)) / DAY), inWk = [3, 2, 1].filter(a => a < monAgo).length;
    if (inWk) assert.match(wk, new RegExp('Includes ' + (inWk === 1 ? '2 h 30 min' : inWk === 2 ? '5 h' : '7 h 30 min') + ' from tournament rounds'));
    await page.$eval('#prcard', e => e.scrollIntoView()); await page.screenshot({ path: OUT + '/01-mypractice.png' });
    ok('My Practice: blue striped tournament part under your own practice, "' + sp.lede.replace(/^.*?Includes/, 'Includes') + '"');
    // nothing saved
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')).filter(e => e.kind === 'tour').length); assert.strictEqual(saved, 0, 'credit is never saved');
    // Practice tab: bars, days, fading average
    await page.click('#tbpractice'); await page.waitForSelector('#weekcard'); if (await page.$('#waclose')) await page.click('#waclose');
    if (inWk) { const W = await page.$eval('#weekcard', c => ({ tf: c.querySelectorAll('.wkfill.wktf').length, note: (c.querySelector('#wktour') || {}).textContent || '', bars: c.querySelectorAll('rect.pgtourbar').length }));
      assert.ok(W.tf >= 4 && W.bars === inWk * 5, JSON.stringify(W)); assert.match(W.note, /from tournament rounds – 2\.5 h a round, 30 min per group/); ok('This week: striped bar ends (' + W.tf + ' skills), ' + W.bars + ' striped day bar(s), "' + W.note + '"'); }
    const M = await page.$eval('#wkpages .wkpage[data-p="2"]', p => ({ band: p.querySelectorAll('path.pgtourband').length, cols: [...p.querySelectorAll('path.pgtourband')].map(e => p.querySelector(e.getAttribute('fill').slice(4, -1)).querySelectorAll('rect')[1].getAttribute('fill')), leg: p.querySelector('.pglegend').textContent, note: p.querySelector('.wknote').textContent }));
    assert.strictEqual(M.band, 5, 'one striped band per group'); assert.deepStrictEqual(M.cols, ['#3f7fbf', '#d39b2a', '#3f9a63', '#1b8a8c', '#c44e16'], 'stripes in the group colours'); assert.match(M.leg, /Tournament rounds/); assert.match(M.note, /tournament day \(counts 2\.5 h\)/);
    await page.$eval('#weekcard', e => e.scrollIntoView()); await page.screenshot({ path: OUT + '/02-thisweek.png' });
    await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = 2 * c.clientWidth; }); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/03-fading.png' });
    ok('fading average: each group striped in its own colour, legend and caption say so');
    // Your game and your training: own practice only (45 min every other day outside the last 10 days)
    const gap = await page.$$eval('#gapcard .gaprow .gapb:last-child em', e => e.map(x => x.textContent)); assert.ok(gap.every(x => !/h/.test(x) || /^\dh/.test(x)), gap.join());
    // My Game: strokes lost vs practice – own practice only
    await page.click('#tbmygame'); await page.waitForSelector('#prcard');
    // Trends
    await page.click('#qgotrends'); await page.waitForSelector('#trendspage .trcard2');
    const tr = await page.$$eval('#trendspage .trcard2', cs => cs.map(c => ({ k: c.getAttribute('data-k'), tour: c.querySelectorAll('path.trtour').length, key: !!c.querySelector('.trtourkey') })));
    assert.ok(tr.find(c => c.k === 'total').tour === 1 && tr.filter(c => c.tour).length >= 4 && tr.every(c => c.key === !!c.tour), JSON.stringify(tr));
    await page.screenshot({ path: OUT + '/04-trends.png' }); ok('Trends: striped tournament part on ' + tr.filter(c => c.tour).length + ' of ' + tr.length + ' practice panels');
    assert.deepStrictEqual(errors, []); console.log('PASS tour-practice-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
