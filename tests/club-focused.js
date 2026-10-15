const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8773/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8773', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
    const holes = Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] }));
    holes[0] = { par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(20, 'green', 'right'), R(3, 'holed')] };
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rc', date: '2026-10-15T17:00:00.000Z', course: 'Club test', baseline: 'pga', player: 'Scott', holes }]));
    localStorage.setItem('golfsg.current.v1', 'rc'); });
  await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('select[data-f="loc"]');
  const nav = async i => { if (!(await page.$('.clubrow'))) await page.click('[data-act="goHole"][data-i="' + i + '"] >> nth=0'); };
  await nav(0);
  // pickers on tee + fairway rows, none on putts
  assert.strictEqual(await page.locator('select[data-f="club"]').count(), 2);
  assert.strictEqual(await page.locator('.clubrow.putter').count(), 1);
  const opts = await page.$$eval('select[data-f="club"][data-k="0"] option', o => o.map(x => x.textContent).slice(1));
  assert.deepStrictEqual(opts, ['Driver', '3W', '5W', '7W', '4H', '5H', '5i', '6i', '7i', '8i', '9i', 'PW', '52', '54', '56', '58', '60']);
  const bb = await page.locator('select[data-f="club"][data-k="0"]').boundingBox(); assert.ok(bb.height >= 44, 'tap target');
  assert.strictEqual(await page.locator('input[data-f="layup"]').count(), 1);
  const sg0 = await page.evaluate(() => SG.analyzeHole(window.__golf.rounds()[0].holes[0], 'pga').sg);
  await page.selectOption('select[data-f="club"][data-k="0"]', '3W'); await page.selectOption('select[data-f="club"][data-k="1"]', '8i');
  await page.check('input[data-f="layup"]');
  assert.match(await page.textContent('.sinfo[data-info="0"]'), /layup – SG not counted/);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: '/workspace/golf-app/screenshots/club-picker.png' });
  await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('select[data-f="loc"]'); await nav(0);
  const st = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]; return r.holes[0].rows.map(x => [x.club || '', !!x.layup]); });
  assert.deepStrictEqual(st, [['3W', true], ['8i', false], ['', false], ['', false]]);
  assert.strictEqual(await page.$eval('select[data-f="club"][data-k="0"]', e => e.value), '3W'); assert.ok(await page.isChecked('input[data-f="layup"]'));
  const sg1 = await page.evaluate(() => { const a = SG.analyzeHole(window.__golf.rounds()[0].holes[0], 'pga'); return [a.sg, a.shots.filter(s => s.cat === 'tee' && !s.layup).length]; });
  assert.ok(sg1[1] === 0 && Math.abs(sg1[0] - sg0) > 1e-6, 'layup removed from SG ' + sg1 + ' ' + sg0);
  // clear club
  await page.selectOption('select[data-f="club"][data-k="1"]', ''); assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[1].club), undefined);
  await page.selectOption('select[data-f="club"][data-k="1"]', '8i');
  // backup + CSV carry club/layup; restore keeps them
  const csv = await page.evaluate(() => window.__golf.csvFor ? window.__golf.csvFor(window.__golf.rounds()) : null);
  if (csv) { assert.match(csv, /,club,layup,/); assert.match(csv, /,3W,yes \(SG excluded\),/); assert.match(csv, /,8i,,/); }
  const bk = await page.evaluate(() => SG.makeBackup(window.__golf.rounds()));
  assert.match(JSON.stringify(bk), /"club":"3W"/); assert.match(JSON.stringify(bk), /"layup":true/);
  assert.deepStrictEqual(errors, []); console.log('CLUB OK' + (csv ? '' : ' (csv hook missing)')); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
