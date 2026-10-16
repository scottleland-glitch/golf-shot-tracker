const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8772/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8772', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '' });
    const holes = [{ par: 4, pin: 'center', finished: true, rows: [R(410, 'tee'), R(165, 'rough', 'left'), R(18, 'bunker', 'shortright'), R(17, 'green', 'right'), R(2, 'holed', 'left')] },
      { par: 5, finished: true, rows: [R(540, 'tee'), R(285, 'fairway'), R(110, 'rough', 'right'), R(22, 'green', 'short'), R(2, 'holed')] }];
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rs', date: '2026-10-10T17:00:00.000Z', course: 'SG test', baseline: 'pga', player: 'Scott', holes }]));
  });
  await page.reload(); await goHist(page); await page.click('#histlist [data-act="open"][data-id="rs"]');
  await page.waitForSelector('#sgsec');
  assert.strictEqual(await page.$('#sgbody'), null, 'collapsed by default'); assert.strictEqual(await page.$('#sumbl'), null);
  // section is at the bottom: after stats grid and the PDF / delete buttons
  const order = await page.evaluate(() => { const a = [...document.querySelectorAll('.stat-grid, [data-act="delRound"], #sgsec')]; return a.map(e => e.id || e.className || e.dataset.act); });
  assert.strictEqual(order[order.length - 1], 'sgsec', 'SG section last: ' + order);
  const hdr = await page.textContent('.sghead'); assert.match(hdr, /Strokes gained\s+[+−-]?\d+\.\d\d/);
  const bb = await page.locator('.sghead').boundingBox(); assert.ok(bb.height >= 56 && bb.width > 300, 'big tap target');
  assert.strictEqual(await page.getAttribute('.sghead', 'aria-expanded'), 'false');
  await page.locator('#sgsec').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: OUT + 'sg-collapsed.png' });
  await page.click('.sghead'); await page.waitForSelector('#sgbody #sumbl');
  assert.strictEqual(await page.getAttribute('.sghead', 'aria-expanded'), 'true');
  for (const sel of ['#sgtotal', '#bydist', '#cmp', '#blnote']) assert.ok(await page.$('#sgbody ' + sel), sel);
  assert.strictEqual(await page.textContent('#sgtotal'), await page.textContent('#sghtotal'));
  await page.waitForTimeout(300); await page.screenshot({ path: OUT + 'sg-expanded.png' });
  // re-benchmark keeps the section open and updates header + body
  const before = await page.textContent('#sghtotal');
  await page.selectOption('#sumbl', 'scm'); await page.waitForSelector('#sgbody');
  assert.notStrictEqual(await page.textContent('#sghtotal'), before); assert.strictEqual(await page.textContent('#sgtotal'), await page.textContent('#sghtotal'));
  assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].baseline), 'scm');
  await page.locator('#cmp tr[data-v="pga"]').click(); assert.strictEqual(await page.$eval('#sumbl', e => e.value), 'pga');
  assert.strictEqual(await page.textContent('#sghtotal'), before);
  await page.click('.sghead'); assert.strictEqual(await page.$('#sgbody'), null, 'collapses again');
  assert.deepStrictEqual(errors, []); console.log('SG OK'); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
