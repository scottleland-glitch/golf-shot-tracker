// In-round pages in the frosted style; SHOT=before|after names the screenshots. Functions still work.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8797/', OUT = '/workspace/golf-app/screenshots/', TAG = process.env.SHOT || 'after';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
    const done = () => ({ par: 4, finished: true, pin: 'center', rows: [R(400, 'tee', { club: 'Driver' }), R(150, 'fairway', { club: '8i' }), R(12, 'green', { dir: 'left' }), R(2, 'holed', { dir: 'long' })] });
    const holes = Array.from({ length: 17 }, done);
    holes.push({ par: 4, rows: [R(410, 'tee', { club: 'Driver' }), R(165, 'rough', { club: '7i', dir: 'right', pen: true }), R(25, 'green', { dir: 'short' }), R(3, 'green', { dir: 'long' })] });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r1', date: '2026-10-16T17:00:00Z', course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes }]));
    localStorage.setItem('golfsg.current.v1', 'r1'); });
  await page.reload(); await page.click('#resumepill'); await page.waitForSelector('.holecard');
  const shot = async (n, full) => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(350);
    await page.screenshot({ path: OUT + 'round-frosted-' + n + '-' + TAG + '.png', fullPage: !!full }); };
  assert.match(await page.textContent('.hc-head'), /Hole 18/);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('hole');
  await shot('hole-full', true);
  await page.click('[data-act="dirpick"][data-k="2"]'); await page.waitForSelector('.dirgrid'); await shot('direction');
  await page.click('.dirgrid [data-act="setdir"][data-v="shortleft"]'); assert.strictEqual(await page.getAttribute('[data-act="dirpick"][data-k="2"]', 'data-dir'), 'shortleft');
  await page.click('[data-act="menu"][data-k="2"]'); await page.waitForSelector('.rowmenu'); await page.locator('.rowmenu').scrollIntoViewIfNeeded(); await shot('rowmenu');
  await page.click('.rowmenu [data-act="menu"]');
  await page.click('#pinbtn'); await page.waitForSelector('#pingreen'); await shot('pin');
  await page.click('#pingreen [data-act="pinset"][data-v="backleft"]'); await page.waitForTimeout(200); if (await page.$('#pinview')) await page.click('[data-act="pinclose"]');
  assert.match(await page.textContent('#pinbtn'), /Pin: back left/i);
  await page.selectOption('select[data-f="club"][data-k="1"]', '6i'); assert.strictEqual(await page.$eval('select[data-f="club"][data-k="1"]', e => e.value), '6i');
  await page.click('[data-act="pen"][data-k="1"]'); assert.strictEqual(await page.$eval('[data-act="pen"][data-k="1"]', e => e.classList.contains('on')), false);
  await page.click('[data-act="addShot"]'); assert.strictEqual(await page.locator('.srow[data-k]').count(), 5);
  await page.fill('input[data-row="4"]', '3'); await page.selectOption('select[data-f="loc"][data-k="4"]', 'holed'); await page.locator('input[data-row="4"]').blur();
  await page.click('[data-act="finish"]'); await page.waitForSelector('.hole-done'); assert.match(await page.textContent('.hole-done'), /Score 5/);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('finished');
  await page.click('[data-act="replay"]'); await page.waitForSelector('[data-act="rpclose"]'); await page.waitForTimeout(600); await shot('replay'); await page.click('[data-act="rpclose"] >> nth=0');
  await page.click('[data-act="prev"]'); assert.match(await page.textContent('.hc-head'), /Hole 17/); await page.click('[data-act="next"]');
  await page.click('[data-act="summary"][data-end="1"]'); await page.waitForSelector('#scorecard'); await page.evaluate(() => window.scrollTo(0, 0)); await shot('scorecard');
  await shot('scorecard-full', true);
  if (TAG === 'after') {
    const F = !!(await page.$('.frostpage.roundpage #scorecard'));
    await page.click('[data-act="goHole"][data-i="0"] >> nth=0'); await page.waitForSelector('.holecard');
    const H = await page.evaluate(() => { const q = s => document.querySelector(s), cs = s => getComputedStyle(q(s));
      return { wrap: !!q('.frostpage.roundpage .holecard'), bg: getComputedStyle(q('.frostpage'), '::before').backgroundImage, card: q('.holecard').classList.contains('frostcard'),
        cardBg: cs('.holecard').backgroundColor, par: cs('.par button.sel').backgroundColor + '|' + cs('.par button.sel').color, parH: q('.par button').getBoundingClientRect().height,
        disc: q('[data-act="discard"]').classList.contains('frostdanger'), discBg: cs('[data-act="discard"]').backgroundColor, ink: cs('.hc-head h2').color }; });
    assert.ok(F && H.wrap && /linear-gradient/.test(H.bg) && !/home-bg/.test(H.bg), 'frosted page + blurred photo ' + JSON.stringify(H));
    assert.ok(H.card && /rgba\(2[3-5]\d, 2[3-5]\d, 2[3-5]\d, 0\.\d+\)/.test(H.cardBg), 'glassy hole card ' + H.cardBg);
    assert.strictEqual(H.par, 'rgb(58, 70, 84)|rgb(255, 255, 255)', 'selected = dark slate pill + white (sky theme, v84 softer)'); assert.ok(H.parH >= 44, 'tap target ' + H.parH);
    assert.ok(H.disc && /rgba\(255, 2\d\d, 2\d\d/.test(H.discBg), 'discard soft pink ' + JSON.stringify(H));
    const [r, g, bb] = H.ink.match(/\d+/g).map(Number); assert.ok(r + g + bb < 200, 'strong text ' + H.ink);
  }
  assert.deepStrictEqual(errors, []); console.log('ROUND FROSTED OK ' + TAG); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
