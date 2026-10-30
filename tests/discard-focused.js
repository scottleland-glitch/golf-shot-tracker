const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8769/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8769', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = []; let dialogs = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e)));
  let answer = true; page.on('dialog', d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l) => ({ dist: d, loc: l, dir: '', pen: false });
    const real = { v: 3, dv: 2, id: 'real', date: '2026-10-08T17:05:00.000Z', course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes: Array.from({ length: 18 }, () => ({ par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(10, 'green'), R(1, 'holed')] })) };
    const empty = { v: 3, dv: 2, id: 'empty', date: '2026-10-10T17:00:00.000Z', course: '', baseline: 'pga', player: 'Scott', holes: Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] })) };
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([real, empty])); localStorage.setItem('golfsg.current.v1', 'empty'); });
  await page.reload();
  assert.match(await page.textContent('[data-act="resume"]'), /0 holes done/);
  // empty rounds stay out of History and backups
  await goHist(page); assert.deepStrictEqual(await page.$$eval('#histlist .hrow', r => r.map(x => x.getAttribute('data-id'))), ['real']);
  await page.click('[data-act="home"] >> nth=0'); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); // backup + discard live on Archive
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
  assert.deepStrictEqual(JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8')).rounds.map(r => r.id), ['real']);
  await page.waitForTimeout(500); await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: '/workspace/golf-app/screenshots/discard-round.png' });
  // cancel keeps it
  answer = false; await page.click('[data-act="discard"]'); assert.ok(await page.$('[data-act="discard"]'));
  answer = true; dialogs = []; await page.click('[data-act="discard"]');
  assert.deepStrictEqual(dialogs, ['Discard this round? Shots will be deleted.']);
  assert.strictEqual(await page.$('[data-act="resume"]'), null);
  for (const step of ['reload', 'newpage']) { // force-close: reload, and a fresh page in the same storage
    let p2 = page; if (step === 'reload') await page.reload(); else { p2 = await ctx.newPage(); await p2.goto(BASE + '?z=' + Date.now()); }
    assert.strictEqual(await p2.$('[data-act="resume"]'), null, 'stays gone after ' + step);
    assert.deepStrictEqual(await p2.evaluate(() => [localStorage.getItem('golfsg.current.v1'), JSON.parse(localStorage.getItem('golfsg.rounds.v1')).map(r => r.id)]), [null, ['real']]);
  }
  // discard from the round screen
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.fill('#course', 'Test'); await page.click('[data-act="new"]');
  await page.waitForSelector('[data-act="discard"]'); await page.click('[data-act="discard"]'); await page.waitForSelector('#home');
  await page.reload(); assert.strictEqual(await page.$('[data-act="resume"]'), null);
  assert.deepStrictEqual(errors, []); console.log('DISCARD OK'); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
