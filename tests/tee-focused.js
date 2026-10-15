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
  const chk = async label => { const r = await page.evaluate(() => { const pct = {}; document.querySelectorAll('#fwmap .fwpct').forEach(t => pct[t.dataset.k] = [t.textContent, +t.dataset.n]);
      const shown = [...document.querySelectorAll('#fwmap [data-hd]')]; return { pct, n: shown.length, lay: shown.filter(e => e.dataset.layup).length, note: (document.getElementById('fwpctnote') || {}).textContent || '',
        tags: document.querySelectorAll('#fwmap .hotspot').length, sum: document.getElementById('mapsum').textContent }; });
    const N = r.n, p = k => Math.round(100 * r.pct[k][1] / N) + '%';
    assert.strictEqual(r.lay, 0, label + ' no layups'); assert.strictEqual(r.tags, 0, label + ' no hot-spot labels');
    ['L', 'F', 'R'].forEach(k => assert.strictEqual(r.pct[k][0], p(k), label + ' ' + k));
    const nU = N - r.pct.L[1] - r.pct.F[1] - r.pct.R[1]; assert.ok(nU === 0 ? !r.note : r.note.includes(nU + ' miss'), label + ' note ' + r.note);
    assert.ok(r.sum.includes(r.pct.F[1] + ' / ' + N), label + ' summary excludes layups ' + r.sum); console.log(label, JSON.stringify(r.pct), N, r.note); return r; };
  await page.click('[data-act="heat"][data-v="dots"]'); const r1 = await chk('round dots');
  assert.strictEqual(r1.n, 14, '15 par 4/5 tee shots minus 1 layup');
  await page.click('[data-act="heat"][data-v="grad"]'); await chk('round grad');
  await page.click('[data-act="mapscope"][data-v="all"]'); await page.waitForSelector('#heattog'); await page.click('[data-act="heat"][data-v="grad"]'); await page.waitForSelector('#fwmap #heatgrad');
  const r2 = await chk('all grad'); assert.strictEqual(r2.n, 28, '30 minus 2 layups');
  assert.match(await page.textContent('#heatnote'), /Layup tee shots are left off/);
  await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'tee-pct-row.png' });
  await page.click('[data-act="heat"][data-v="dots"]'); await chk('all dots');
  assert.deepStrictEqual(errors, []); console.log('TEE OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
