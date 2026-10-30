const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const xt = async (p, id) => { if (!(await p.$('[data-stx="' + id + '"].open')) && await p.$('[data-act="stx"][data-v="' + id + '"]')) await p.click('[data-act="stx"][data-v="' + id + '"]'); return p; }; // v96: stat tiles are collapsed – open one first
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8770/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8770', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
    // [first putt ft, its side, where it finished dir, leftover ft] ; then holed
    const P = [[40, 'short', 'short', 6], [35, 'left', 'long', 5], [25, 'right', 'shortleft', 3], [22, '', 'longright', 2], [15, 'long', 'right', 2], [12, 'short', 'long', 1.5],
      [18, 'left', 'short', 4], [8, 'short', 'left', 1], [7, 'right', 'long', 4], [9, 'left', '', 2], [4, 'short', 'right', 1], [3, 'left', 'longleft', 2], [5, 'short', 'short', 0.5],
      [14, 'short', 'shortright', 2], [28, 'long', 'long', 2.5], [45, 'right', 'longleft', 7], [2, 'short', '', 0], [6, 'left', 'short', 1], [11, 'right', 'left', 1.5]];
    const holes = P.map((q, i) => ({ par: 4, finished: true, rows: q[3] ? [R(400, 'tee'), R(150, 'fairway', q[1]), R(q[0], 'green'), R(q[3], 'green'), R(1, 'holed')].slice(0, 5) : [R(400, 'tee'), R(150, 'fairway', q[1]), R(q[0], 'green'), R(1, 'holed')] }));
    holes.forEach((h, i) => { h.rows[2].dir = P[i][1]; if (h.rows.length === 5) { h.rows[3].dir = P[i][2]; h.rows.splice(4, 1, { dist: 1, loc: 'holed', dir: '', pen: false }); } });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rp', date: '2026-10-10T17:00:00.000Z', course: 'Putt test', baseline: 'pga', player: 'Scott', holes }]));
  });
  await page.reload(); await goHist(page); await page.click('#histlist [data-act="open"][data-id="rp"]');
  const st = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0], 'pga'); return S.puttList.filter(p => p.n === 1).map(p => [p.dir, p.ft, p.made, p.endDir, p.endFt, SG.pmissClass(p)]); });
  console.log(JSON.stringify(st));
  await (await xt(page, 'pmiss')).click('[data-act="map"][data-v="pmiss"]'); await page.waitForSelector('#pmissmap');
  const counts = await page.$$eval('#pmgroups button', bs => bs.map(x => [x.getAttribute('data-v'), +x.getAttribute('data-n'), x.disabled]));
  console.log(counts);
  const total = await page.evaluate(() => SG.summarize(window.__golf.rounds()[0], 'pga').puttList.filter(p => p.n === 1 && SG.pmissGroup(p.ft)).length); // v105: 1st putts only
  assert.strictEqual(counts.reduce((t, c) => t + c[1], 0), total, 'group counts add up'); counts.forEach(c => assert.strictEqual(c[2], c[1] === 0));
  const shots = [];
  for (const c of counts.filter(c => c[1])) {
    await page.click(`#pmgroups [data-v="${c[0]}"]`); await page.waitForTimeout(150);
    const nMiss = await page.locator('#pmissmap .pmend').count(), cells = await page.$$eval('#pmcells .stat', s => s.map(x => x.textContent));
    const exp = await page.evaluate(g => { const L = SG.summarize(window.__golf.rounds()[0], 'pga').puttList.filter(p => p.n === 1 && SG.pmissGroup(p.ft) === g); return SG.pmissStats(L); }, c[0]);
    assert.strictEqual(nMiss, exp.misses); assert.ok(cells.some(t => t.includes('1st putts made') && t.includes(exp.made + ' of ' + exp.attempts)));
    const starts = await page.$$eval('#pmissmap path.pmtr', ps => [...new Set(ps.map(p => p.getAttribute('d').split(' Q')[0]))]); assert.ok(starts.length <= 1, 'one common start ' + starts);
    if (exp.counts.short) { const sh = await page.$$eval('#pmissmap .pmend[data-class="short"]', e => e.map(x => +x.getAttribute('cy'))); assert.ok(sh.every(y => y > 200), 'short ends below the hole'); }
    const rings = await page.$$eval('#pmissmap circle[fill="none"]', cs => cs.map(c => +c.getAttribute('r')));
    const gaps = rings.map((r, i) => r - (rings[i - 1] || 0)); assert.ok(rings.length >= 3 && gaps.every(g => Math.abs(g - gaps[0]) < 0.6), 'linear evenly spaced rings ' + rings);
    const lab = await page.locator('#pmissmap .pmlbl').count(); assert.ok(lab >= Math.min(1, exp.misses));
    const f = OUT + 'putt-miss-' + c[0] + '.png'; await page.locator('#mapview').evaluate(e => e.scrollTop = 0); await page.screenshot({ path: f }); shots.push(f);
  }
  await page.locator('#pmcells').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'putt-miss-stats.png' });
  assert.deepStrictEqual(errors, []); console.log('PMISS OK', shots); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
