const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const PFX = process.argv[2] || 'before', OUT = '/workspace/golf-app/screenshots/', BASE = process.env.BASE_URL || 'http://127.0.0.1:8767/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('dialog', d => d.accept()); await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (dist, loc, dir) => ({ dist, loc, dir: dir || '', pen: false }), holes = [];
    for (let i = 0; i < 18; i++) { const p = [4, 3, 5][i % 3]; const rows = p === 3 ? [R(165 + i, 'tee', i % 2 ? 'short' : '')] : [R(390 + i, 'tee', i % 4 ? 'left' : ''), R(60 + i * 8, i % 4 ? 'rough' : 'fairway', i % 2 ? 'right' : '')];
      if (p === 5) rows.splice(1, 0, R(250, 'fairway')); if (i % 2) rows.push(R(12, 'bunker', 'short'), R(6, 'green', 'left'), R(2, 'holed', 'right')); else rows.push(R(18, 'green', 'longleft'), R(3, 'holed', 'right'));
      holes.push({ par: p, pin: ['backleft', 'center', 'frontright'][i % 3], finished: i < 17, rows }); }
    localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rs', date: '2026-10-09T14:00:00.000Z', course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes }]));
  });
  await page.reload(); await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + PFX + '-home.png' });
  await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rs"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + PFX + '-stats.png' }); await page.screenshot({ path: OUT + PFX + '-stats-full.png', fullPage: true });
  await page.click('[data-act="map"][data-v="gir"]'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + PFX + '-map.png' });
  await page.goto(BASE + '?y=' + Date.now()); await page.waitForTimeout(500);
  if (!(await page.$('[data-act="history"]'))) await page.click('[data-act="home"] >> nth=0').catch(() => {});
  await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rs"]');
  await page.click('[data-act="goHole"][data-i="17"] >> nth=0'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + PFX + '-hole.png' });
  await b.close(); if (srv) srv.kill(); console.log('shots done');
})().catch(e => { console.error(e); process.exit(1); });
