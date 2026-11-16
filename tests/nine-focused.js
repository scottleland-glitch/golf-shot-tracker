// v219: end a round after 9 holes – the button on hole 9, a 9-hole round everywhere (Rounds, scoring average, Trends), add the back 9 later.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const PORT = 8874, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(() => {
      const R = (d, l) => ({ dist: d, loc: l, dir: '', pen: false }), done = () => [R(400, 'tee'), R(150, 'fairway'), R(10, 'green'), R(1, 'holed')];
      const r = { v: 3, dv: 2, id: 'n9', date: new Date().toISOString(), course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes: Array.from({ length: 18 }, (x, i) => i < 9 ? { par: 4, finished: i < 8, rows: done() } : { par: 4, rows: [R(380, 'tee')] }) };
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.current.v1', 'n9');
    });
    await page.reload(); await page.click('[data-act="resume"]');
    for (let i = 0; i < 12 && !(await page.$('#finish9')); i++) { const n = await page.$('#nextrow [data-act="next"], [data-act="next"].big'); if (!n) break; await n.click(); }
    assert.ok(await page.$('#finish9'), 'End round after 9 on hole 9'); assert.strictEqual(await page.$eval('#finish9', e => e.disabled), false, 'hole 9 is complete');
    await page.screenshot({ path: 'screenshots/v219-end9.png' });
    // not on hole 8
    await page.click('[data-act="prev"] >> nth=0'); assert.strictEqual(await page.$('#finish9'), null, 'only on hole 9'); await page.click('[data-act="next"] >> nth=0');
    await page.click('#finish9');
    assert.strictEqual(await page.textContent('#rs-score'), '36', '9 holes, 36');
    const st = await page.evaluate(() => ({ cur: localStorage.getItem('golfsg.current.v1'), r: window.__golf.rounds()[0] }));
    assert.strictEqual(st.cur, null, 'no Continue round'); assert.strictEqual(st.r.holes.length, 9); assert.strictEqual(st.r.nine, true); assert.ok(st.r.holes.every(h => h.finished), 'hole 9 finished too');
    ok('hole 9: End round after 9 → Round stats, 36, a 9-hole round saved');
    await page.click('#rsmenubtn'); await page.click('#rsmenu [data-act="home"]');
    await page.click('#navbtn').catch(() => {}); await page.click('[data-act="history"]');
    assert.strictEqual(await page.textContent('#histlist .hholes'), '9'); assert.strictEqual(await page.$('#histlist .hholes.unf'), null, 'not flagged unfinished');
    ok('Rounds: 9 holes, finished');
    // counts like a round everywhere: doubled score for averages / Trends, SG per hole as usual
    const m = await page.evaluate(() => { const r = window.__golf.rounds()[0], S = SG.summarize(r);
      const W = TRENDS.weekSeries([r], [], SG, MYGAME, { weeks: 2 }), sh = MYGAME.shape ? MYGAME.shape([r], SG, 'pga') : null;
      return { s18: SG.score18(S), wk: [W[1].score, W[1].scoreW, W[1].holes], avg: sh && sh.score }; });
    assert.strictEqual(m.s18, 72); assert.deepStrictEqual(m.wk, [[72], [0.5], 9], 'Trends: 72-equivalent, half weight'); if (m.avg != null) assert.strictEqual(m.avg, 72, 'scoring average');
    ok('9-hole round counts: 72 equivalent in averages and Trends (half weight), strokes gained per hole');
    // changed your mind: add the back 9
    await page.click('#histlist [data-act="open"]'); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('[data-act="goHole"][data-i="8"]'); if (b) b.click(); });
    await page.waitForSelector('#addback9'); assert.strictEqual(await page.$eval('[data-act="next"][aria-label="Next hole"]', e => e.disabled), true, 'nothing past 9');
    await page.click('#addback9'); const r2 = await page.evaluate(() => window.__golf.rounds()[0]); assert.strictEqual(r2.holes.length, 18); assert.strictEqual(r2.nine, undefined);
    assert.match(await page.textContent('.topbar .title'), /./); ok('Add the back 9 → 18 holes again, on hole 10');
    // v220 (Scott): a round already played and saved – 9 holes in, the back nine only has the course's tee yardages – fixed afterwards from Rounds
    await page.evaluate(() => { const R = (d, l) => ({ dist: d, loc: l, dir: '', pen: false }), done = () => [R(400, 'tee'), R(150, 'fairway'), R(10, 'green'), R(1, 'holed')];
      const old = { v: 3, dv: 2, id: 'old9', date: new Date(Date.now() - 864e5).toISOString(), course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes: Array.from({ length: 18 }, (x, i) => i < 9 ? { par: 4, finished: true, rows: done() } : { par: 4, rows: [R(380 + i, 'tee')] }) };
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([old])); localStorage.removeItem('golfsg.current.v1'); });
    await page.reload(); await page.click('#navbtn').catch(() => {}); await page.click('[data-act="history"]'); assert.strictEqual(await page.textContent('#histlist .hholes'), '9');
    await page.click('#histlist [data-act="open"]'); await page.waitForTimeout(300); await page.evaluate(() => { const b = document.querySelector('[data-act="goHole"][data-i="8"]'); if (b) b.click(); });
    await page.waitForSelector('#finish9'); await page.click('#finish9'); assert.strictEqual(await page.textContent('#rs-score'), '36');
    const o9 = await page.evaluate(() => window.__golf.rounds()[0]); assert.deepStrictEqual([o9.holes.length, o9.nine], [9, true]); ok('a saved round, back nine pre-filled from the course: End round after 9 from Rounds');
    assert.deepStrictEqual(errors, []); console.log('NINE OK');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
