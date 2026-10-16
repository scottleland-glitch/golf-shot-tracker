const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8768/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { // the Safari case: real 18-hole round in progress (no course) + empty Lakeridge stub, no player name
    const R = (d, l) => ({ dist: d, loc: l, dir: '', pen: false });
    const real = { v: 3, dv: 2, id: 'real', date: '2026-10-08T17:05:00.000Z', course: '', baseline: 'pga', holes: Array.from({ length: 18 }, (x, i) => ({ par: 4, finished: i < 17, rows: [R(400, 'tee'), R(150, 'fairway'), R(10, 'green'), R(1, 'holed')] })) };
    const stub = { v: 3, dv: 2, id: 'stub', date: '2026-10-08T17:00:00.000Z', course: 'Lakeridge', baseline: 'pga', holes: Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] })) };
    localStorage.clear(); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([stub, real])); localStorage.setItem('golfsg.current.v1', 'real');
  });
  await page.reload();
  const st = await page.evaluate(() => window.__golf.rounds().map(r => [r.id, r.course]));
  assert.deepStrictEqual(st, [['real', 'Lakeridge']], 'stub folded into the real round on load');
  assert.match(await page.textContent('[data-act="resume"]'), /Lakeridge/);
  await page.click('[data-act="resume"]'); await page.click('[data-act="goHole"][data-i="17"] >> nth=0').catch(() => {});
  await page.evaluate(() => { location.hash = ''; });
  // go to hole 18 and tap Finish round
  for (let i = 0; i < 20 && !(await page.$('[data-act="summary"][data-end="1"]')); i++) { const n = await page.$('[data-act="next"]'); if (!n) break; await n.click(); }
  await page.click('[data-act="summary"][data-end="1"]');
  assert.match(await page.textContent('.big-score'), /18 holes done/);
  const after = await page.evaluate(() => ({ cur: localStorage.getItem('golfsg.current.v1'), n: window.__golf.rounds().length, fin: window.__golf.rounds()[0].holes.filter(h => h.finished).length }));
  assert.deepStrictEqual(after, { cur: null, n: 1, fin: 18 });
  await page.click('[data-act="home"] >> nth=0'); assert.strictEqual(await page.$('[data-act="resume"]'), null, 'no Continue round after Finish round');
  await goHist(page); assert.match(await page.textContent('#histlist'), /18 of 18/);
  assert.deepStrictEqual(errors, []); console.log('FINISH OK'); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
