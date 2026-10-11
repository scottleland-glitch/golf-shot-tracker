const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8771/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (d, l, dir, pen) => ({ dist: d, loc: l, dir: dir || '', pen: !!pen });
    const holes = [
      { par: 4, pin: 'backleft', finished: true, rows: [R(410, 'tee'), R(165, 'rough', 'left'), R(18, 'bunker', 'shortright'), R(14, 'green', 'right'), R(3, 'green', 'long'), R(1, 'holed')] },
      { par: 5, pin: 'frontright', finished: true, rows: [R(540, 'tee'), R(285, 'fairway'), R(110, 'rough', 'right'), R(22, 'green', 'short'), R(2, 'holed')] },
      { par: 4, pin: 'center', finished: true, rows: [R(395, 'tee'), R(395, 'tee', 'right', true), R(150, 'fairway'), R(30, 'hazard', 'left', true), R(30, 'deep', 'left'), R(8, 'green', 'longleft'), R(1, 'holed')] }];
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rr', date: '2026-10-10T17:00:00.000Z', course: 'Replay test', baseline: 'pga', player: 'Scott', holes }]));
  });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rr"]');
  const info = await page.evaluate(() => window.__golf.rounds()[0].holes.map(h => { const a = SG.analyzeHole(h, 'pga'); return [a.complete, a.strokes, a.shots.map(s => s.cat + (s.ob ? ':ob' : '') + (s.penStrokes ? ':pen' + s.penStrokes : '')).join(',')]; }));
  console.log(JSON.stringify(info));
  await page.click('#sumreplay'); await page.waitForSelector('#replaymap');
  const names = ['par4', 'par5', 'penalty'];
  for (let i = 0; i < 3; i++) {
    const A = info[i], nShots = A[2].split(',').length, nPutts = A[2].split(',').filter(x => x.startsWith('putting')).length;
    assert.strictEqual(await page.locator('#replaymap .rpshot').count(), nShots - nPutts, 'numbered off-green shots, hole ' + (i + 1));
    assert.strictEqual(await page.locator('#replaymap .rpputt').count(), nPutts, 'putts in inset');
    assert.match(await page.textContent('#rpinfo'), new RegExp('Par ' + [4, 5, 4][i]));
    if (i === 2) { assert.ok(await page.locator('#replaymap .rppen').count() >= 1, 'penalty marked'); assert.ok((await page.textContent('#replaymap')).includes('OB')); }
    // the last off-green shot sits near the pin when it reached the green
    await page.screenshot({ path: OUT + 'hole-replay-' + names[i] + '.png' });
    await page.locator('#replayview').evaluate(e => e.scrollTop = e.scrollHeight); await page.screenshot({ path: OUT + 'hole-replay-' + names[i] + '-bottom.png' });
    if (i < 2) await page.click('[data-act="rphole"][data-v="' + (i + 1) + '"]');
  }
  await page.click('[data-act="rpclose"]'); assert.strictEqual(await page.$('#replayview'), null);
  // from the hole screen
  await page.click('[data-act="goHole"][data-i="1"] >> nth=0'); await page.click('[data-act="replay"]'); await page.waitForSelector('#replaymap');
  assert.match(await page.textContent('#replayview .maphead'), /Hole 2 replay/);
  assert.deepStrictEqual(errors, []); console.log('REPLAY OK'); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
