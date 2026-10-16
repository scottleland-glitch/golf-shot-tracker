const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8775/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8775', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (d, l, dir, club) => Object.assign({ dist: d, loc: l, dir: dir || '', pen: false }, club ? { club } : {});
    // 7i always finishes short (12 yd short / 10 yd short-left ...) -> bias flag; 9i mixes long/short on the green -> no flag
    const SD = ['short', 'shortleft', 'short', 'shortright'], GD = ['long', 'short', 'left', 'right', 'longleft', 'shortright'];
    const mk = (id, day, seed) => ({ v: 3, dv: 2, id, date: '2026-10-0' + day + 'T17:00:00.000Z', course: 'Club ' + id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const k = i + seed;
        const rows = k % 2
          ? [R(400, 'tee', '', 'Driver'), R(150, 'fairway', k % 4 === 1 ? 'left' : '', '7i'), R(10 + k % 5, 'rough', SD[k % 4], '56'), R(6 + k % 8, 'green', GD[k % 6]), R(2, 'holed', 'left')]
          : [R(390, 'tee', '', 'Driver'), R(130, 'fairway', k % 4 === 0 ? 'right' : '', '9i'), R(8 + k % 20, 'green', GD[k % 6]), R(2, 'holed', 'right')];
        return { par: 4, finished: true, rows }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('c1', 7, 0), mk('c2', 8, 3)]));
  });
  await page.reload(); await goHist(page); await page.click('#histlist [data-act="open"][data-id="c2"]');
  assert.match(await page.textContent('[data-act="map"][data-v="club"]'), /3 clubs|4 clubs/);
  await page.locator('[data-act="map"][data-v="club"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'club-tile.png' });
  await page.click('[data-act="map"][data-v="club"]'); await page.waitForSelector('#clubbtns');
  assert.strictEqual(await page.locator('#clubbtns button').count(), 17);
  const en = await page.$$eval('#clubbtns button:not([disabled])', e => e.map(x => x.dataset.v)); assert.deepStrictEqual(en, ['Driver', '7i', '9i', '56']);
  // 7i: bias short flagged
  await page.click('#clubbtns [data-v="56"]'); await page.click('#clubbtns [data-v="9i"]');
  const n9 = await page.locator('#clubshots tr').count() - 1; assert.ok(n9 >= 8, 'shot list ' + n9);
  assert.ok(await page.$('#clubmap'), 'dispersion map');
  assert.strictEqual(await page.$('#clubbias'), null, '9i not biased');
  // Driver: tee shots judged by fairway, no map
  await page.click('#clubbtns [data-v="Driver"]'); assert.match(await page.textContent('#clubtee'), /tee shots on par 4\/5/); assert.strictEqual(await page.$('#clubmap'), null);
  // ranking
  const rank = await page.$$eval('#clubrank tr[data-act]', t => t.map(r => [r.dataset.v, +r.children[3].textContent.replace('−', '-')]));
  assert.ok(rank.length >= 3 && rank.every((x, i) => !i || rank[i - 1][1] >= x[1]), 'ranked by SG/shot ' + JSON.stringify(rank));
  // All rounds: 7i bias + heat map (many shots)
  await page.click('[data-act="mapscope"][data-v="all"]'); await page.click('#clubbtns [data-v="7i"]');
  const ns = await page.locator('#clubshots tr').count() - 1;
  assert.match(await page.textContent('#clubbias'), /7i finishes \d+ yd short on average/);
  if (ns > 15) assert.ok(await page.$('#clubmap.heat'), 'heat map when many');
  await page.evaluate(() => document.getElementById('mapview').scrollTop = 0); await page.screenshot({ path: OUT + 'club-dispersion-heat.png' });
  await page.click('[data-act="heat"][data-v="dots"]'); await page.screenshot({ path: OUT + 'club-dispersion-dots.png' });
  await page.locator('#clubrank').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'club-sg-ranking.png' });
  await page.locator('#clubrank tr[data-v="9i"]').click(); assert.strictEqual(await page.textContent('#clubcur'), '9i');
  assert.deepStrictEqual(errors, []); console.log('CLUBPERF OK', JSON.stringify(rank)); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
