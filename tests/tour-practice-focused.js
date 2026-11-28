// v272 (Scott): on a tournament day practice fills at your own average from the two weeks before (each skill at its own pace, topped up past
// anything logged that day). Built from the rounds and logs (never saved). The My Practice spider shows that part striped; the Practice tab
// charts and Trends just carry on in the normal colours, with a dot for each tournament day. Run: node tests/tour-practice-focused.js [outDir]
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ARC = require('./fixtures/arcade-78.js'); const MY = require('../mygame.js'), SG = require('../sg.js'), TR = require('../trends.js');
const PORT = 8893, BASE = 'http://127.0.0.1:' + PORT + '/', DAY = 864e5, now = Date.now(), ok = m => console.log('  ✓ ' + m), OUT = process.argv[2] || '/tmp/tourprac-test'; fs.mkdirSync(OUT, { recursive: true });
const ld = (n) => { const t = new Date(now - n * DAY); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const round = (id, ago, play) => Object.assign(JSON.parse(JSON.stringify(ARC.round())), { id, player: 'Scott', baseline: 'd1w', play, course: 'Ridgeview', date: ld(ago) + 'T16:00:00' });
const SP = ['short', 'lag', 'chip', 'wedges', 'irons', 'drive', 'bunker'];
// practice every other day from 4 days ago back; tournament rounds 3, 2 and 1 days ago
const logs = []; for (let d = 4; d <= 70; d += 2) logs.push({ id: 'p' + d, date: ld(d) + 'T12:00:00', player: 'Scott', spoke: SP[(d / 2) % 7], focus: '', min: 45, feel: 'ok' });
const R = [round('pr', 40, 'practice'), round('t1', 3, 'tournament'), round('t2', 2, 'tournament'), round('t3', 1, 'tournament'), round('o', 20, '')];

// ---- the maths (node) ----
const T = MY.tourPractice(R, SG, null, logs), sum = (L) => L.reduce((a, e) => a + e.min, 0);
assert.deepStrictEqual([...new Set(T.map(e => e.round))].sort(), ['t1', 't2', 't3'], 'tournament days only – not practice or untagged rounds');
['t1', 't2', 't3'].forEach((id, q) => { const ago = 3 - q, exp = {}; for (let i = 1; i <= 14; i++) { const a = ago + i; if (a <= 3) continue; logs.filter(e => e.date.startsWith(ld(a))).forEach(e => exp[e.spoke] = (exp[e.spoke] || 0) + e.min); }
  const n = 14 - [1, 2, 3].filter(a => a > ago && a <= ago + 14).length;
  MY.SPOKES.forEach(s => { const m = sum(T.filter(e => e.round === id && e.spoke === s.k)), want = Math.round((exp[s.k] || 0) / n * 10) / 10; assert.ok(Math.abs(m - (want >= 0.5 ? want : 0)) < 0.051, id + ' ' + s.k + ': ' + m + ' vs ' + want); }); });
const day1 = sum(T.filter(e => e.round === 't1')); assert.ok(Math.abs(day1 - 7 * 45 / 14) < 0.3, 't1 = 7 sessions of 45 min over 14 days: ' + day1);
const top = MY.tourPractice(R, SG, null, logs.concat([{ id: 'w', date: ld(3) + 'T07:00:00', player: 'Scott', spoke: SP[1], focus: '', min: 60 }])); assert.ok(!top.some(e => e.round === 't1' && e.spoke === SP[1]), 'topped up past what was logged that day');
assert.strictEqual(MY.tourPractice(R, SG, null, []).length, 0, 'no practice in the two weeks before → nothing to fill');
assert.ok(MY.validPractice(T).every(e => e.kind === 'tour'));
ok('tournament days fill at the 2-week average per skill (t1 ' + day1.toFixed(1) + ' min), topped up past logged practice, other rounds none');
const B = TR.build(R, logs, SG, MY, { bl: 'd1w', weeks: 26, now }), Bn = TR.build(R.map(r => Object.assign({}, r, { play: r.play === 'tournament' ? '' : r.play })), logs, SG, MY, { bl: 'd1w', weeks: 26, now });
const last = (A) => A.pd[A.pd.length - 1], at = (A, ago) => A.pd[A.pd.length - 1 - ago];
assert.ok(at(B.total, 1).h >= at(B.total, 4).h * 0.8, 'Trends: carries on through the tournament: ' + at(B.total, 4).h.toFixed(2) + ' → ' + at(B.total, 1).h.toFixed(2) + ' (untagged ' + at(Bn.total, 1).h.toFixed(2) + ')');
assert.ok(B.total.pd.filter(p => p.tour).length >= 3, 'tournament days ticked');
assert.ok(B.total.nowX >= Bn.total.nowX * 0.95, 'forecast practice level holds');
ok('Trends: ' + at(B.total, 4).h.toFixed(2) + ' → ' + at(B.total, 1).h.toFixed(2) + ' h a week through the tournament; nowX ' + B.total.nowX.toFixed(2) + ' (untagged ' + Bn.total.nowX.toFixed(2) + ')');

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), page = await ctx.newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(([R, P]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play');
      localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P)); }, [R, logs]); await page.reload();
    // My Game → My Practice spider: still striped
    await page.click('#tbmygame'); await page.waitForSelector('#prcard');
    const sp = await page.$eval('#prpages .prpage[data-p="30d"]', p => ({ tour: p.querySelectorAll('polygon.ptour').length, cur: p.querySelectorAll('polygon.pcur').length, lede: p.querySelector('.prlede2').textContent, leg: p.querySelector('.mglegend').textContent }));
    assert.ok(sp.tour === 1 && sp.cur === 1, JSON.stringify(sp)); assert.match(sp.lede, /Includes .+ a week for tournament days \(your average from the two weeks before\)\./); assert.match(sp.leg, /Tournament days/);
    await page.$eval('#prcard', e => e.scrollIntoView()); await page.screenshot({ path: OUT + '/01-mypractice.png' });
    ok('My Practice: tournament days striped under your own practice, "' + sp.lede.replace(/^.*?Includes/, 'Includes') + '"');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')).filter(e => e.kind === 'tour').length); assert.strictEqual(saved, 0, 'credit is never saved');
    // Practice tab: normal colours, dots
    await page.click('#tbpractice'); await page.waitForSelector('#weekcard'); if (await page.$('#waclose')) await page.click('#waclose');
    const mon = new Date(now); mon.setHours(0, 0, 0, 0); const monAgo = Math.round((now - (mon.getTime() - ((mon.getDay() + 6) % 7) * DAY)) / DAY), inWk = [3, 2, 1].filter(a => a < monAgo).length;
    const W = await page.$eval('#weekcard', c => ({ stripes: c.querySelectorAll('.wkfill.wktf, rect.pgtourbar, path.pgtourband, pattern').length, note: (c.querySelector('#wktour') || {}).textContent || '', dots1: c.querySelectorAll('.wkpage[data-p="1"] .wktdot').length,
      dots2: c.querySelectorAll('.wkpage[data-p="2"] .wktdot').length, leg: c.querySelector('.wkpage[data-p="2"] .pglegend').textContent, cap: c.querySelector('.wkpage[data-p="2"] .wknote').textContent }));
    assert.strictEqual(W.stripes, 0, 'no stripes on the Practice tab'); assert.strictEqual(W.dots1, inWk, 'a dot under each tournament day this week'); assert.strictEqual(W.dots2, 3, 'a dot for each tournament day on the fading average');
    if (inWk) assert.match(W.note, /^Includes .+ for tournament days – your average from the two weeks before\.$/);
    assert.doesNotMatch(W.leg, /Tournament/); assert.match(W.cap, /tournament day \(fills at your average from the two weeks before\)/);
    await page.$eval('#weekcard', e => e.scrollIntoView()); await page.screenshot({ path: OUT + '/02-thisweek.png' });
    await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = c.clientWidth; }); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/02b-days.png' });
    await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = 2 * c.clientWidth; }); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/03-fading.png' });
    ok('Practice tab: no stripes, a dot for each tournament day (' + W.dots1 + ' this week, ' + W.dots2 + ' on the fading average)');
    // Trends: no stripes
    await page.click('#tbmygame'); await page.waitForSelector('#prcard'); await page.click('#qgotrends'); await page.waitForSelector('#trendspage .trcard2');
    const tr = await page.$$eval('#trendspage .trcard2', cs => cs.map(c => ({ tour: c.querySelectorAll('path.trtour, .trtourkey, pattern').length, ticks: c.querySelectorAll('.trgolf').length })));
    assert.ok(tr.every(c => c.tour === 0) && tr.some(c => c.ticks >= 3), JSON.stringify(tr));
    await page.screenshot({ path: OUT + '/04-trends.png' }); ok('Trends: no stripes; round ticks mark the tournament');
    assert.deepStrictEqual(errors, []); console.log('PASS tour-practice-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
