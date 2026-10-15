const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8783/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8783', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
    // tee shots: fairway, rough L/R, bunker R, OB L, one rough miss with no side, one layup (iron to the fairway)
    const T = [['fairway', ''], ['fairway', ''], ['rough', 'left'], ['rough', 'right'], ['fairway', ''], ['sand', 'right'], ['rough', 'left'], ['fairway', ''], ['rough', '']];
    const mk = (id, day, k) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const t = T[(i + k) % T.length], par = i % 6 === 2 ? 3 : i % 6 === 5 ? 5 : 4, yd = par === 3 ? 160 : par === 5 ? 520 : 400;
        const rows = par === 3 ? [R(yd, 'tee'), R(20, 'green'), R(1, 'holed')] : [Object.assign(R(yd, 'tee'), i === 0 ? { layup: true } : {}), R(yd - 250 - (i % 4) * 12, t[0], t[1]), R(25, 'green'), R(1, 'holed')];
        return { par, pin: 'center', finished: true, rows }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('a', 12, 0), mk('b', 13, 4)])); });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"] >> nth=0');
  await page.click('[data-act="map"][data-v="fw"]'); await page.waitForSelector('#fwmap');
  // this round: Dots + Gradient toggle exists; no Islands
  assert.ok(await page.$('#heattog [data-v="dots"]') && await page.$('#heattog [data-v="grad"]') && !(await page.$('#heattog [data-v="isl"]')));
  await page.click('[data-act="heat"][data-v="dots"]'); assert.ok(await page.$('#fwmap text.fwdot'), 'layup marked LU');
  assert.strictEqual(await page.$$eval('#fwmap text.fwdot', t => t.filter(x => x.textContent === 'LU').length), 1);
  await page.locator('#fwmap').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'tee-heat-dots.png' });
  await page.click('[data-act="mapscope"][data-v="all"]'); await page.waitForSelector('#heattog');
  await page.click('[data-act="heat"][data-v="grad"]'); await page.waitForSelector('#fwmap #heatgrad');
  const r = await page.evaluate(() => { const pts = [...document.querySelectorAll('#fwmap [data-hd]')].filter(e => e.getAttribute('data-class') !== 'nodir');
    return { tags: [...document.querySelectorAll('#fwmap .hotspot text')].map(t => t.textContent), n: pts.length, fw: pts.filter(e => e.dataset.fw === '1').length,
      sum: document.getElementById('heatsum').textContent, avg: !!document.getElementById('heatavg'), note: document.getElementById('heatnote').textContent, clus: !!document.getElementById('clusr') }; });
  console.log(JSON.stringify(r));
  assert.ok(r.tags.length > 1 && r.tags.every(t => /^\d+ shots? · \d+% fairway$/.test(t)), 'tags ' + r.tags);
  assert.strictEqual(r.tags.reduce((a, t) => a + +t.match(/^\d+/)[0], 0) <= r.n, true, 'no shot counted twice');
  assert.strictEqual(new Set(r.tags.map((t, i) => i)).size, r.tags.length);
  assert.ok(!r.avg, 'no ⊕ on the tee map'); assert.ok(r.clus, 'cluster slider');
  assert.ok(r.sum.includes('fairway ' + r.fw + ' / ' + r.n), r.sum); assert.ok(r.sum.includes(r.tags.length + ' hot spot'), r.sum);
  assert.match(r.note, /not the exact spot/); assert.match(r.note, /LU/);
  await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'tee-heat-gradient.png' });
  await page.locator('#heatsum').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'tee-heat-summary.png' });
  assert.deepStrictEqual(errors, []); console.log('TEE OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
