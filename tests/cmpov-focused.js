const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8777/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8777', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false }); const D = ['left', 'right', 'long', 'short', 'shortleft', 'longright'];
    // best: 73-ish, worst: 78-ish, each a single round (Scott's case)
    const mk = (id, day, q) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: 'C' + id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const app = 90 + (i * 37) % 90;
        const rows = (q && i % 3 === 0) ? [R(400, 'tee'), R(app, 'fairway'), R(10 + i, 'rough', D[i % 6]), R(15 + i, 'green', D[(i + 1) % 6]), R(3, 'green', D[i % 6]), R(1, 'holed')]
          : [R(400, 'tee'), R(app, 'fairway'), R(8 + (i * 7) % 30, 'green', D[i % 6]), R(2, 'green', D[(i + 2) % 6]), R(1, 'holed')].slice(0, (i % 2) ? 5 : 4).map((r, j, a) => j === a.length - 1 ? R(1, 'holed') : r);
        return { par: 4, finished: true, rows }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('best', 13, 0), mk('worst', 12, 1)])); });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#cmpopen'); await page.waitForSelector('#gaptable');
  const res = {};
  for (const k of ['prox', 'gir', 'miss', 'putt']) {
    await page.click('[data-act="cmpkind"][data-v="' + k + '"]'); await page.click('[data-act="cmpov"][data-v="0"]');
    const side = await page.$$eval('#cmpmaps svg', s => s.map(x => x.querySelectorAll('[data-hd]').length));
    await page.click('[data-act="cmpov"][data-v="1"]'); await page.waitForSelector('#cmplayer');
    const ov = await page.evaluate(() => { const L = document.getElementById('cmplayer'); const isl = [...L.querySelectorAll('.hisland')];
      return { isl: isl.length, shots: isl.reduce((a, g) => a + +g.dataset.n, 0), rings: L.querySelectorAll('.bestring').length, worstPts: document.querySelectorAll('#cmpovmap [data-hd]').length }; });
    const shot = async () => (await page.locator('#cmpovmap').screenshot()).toString('base64');
    const withI = await shot(); await page.evaluate(() => document.querySelectorAll('#cmplayer .hisland').forEach(g => g.style.display = 'none'));
    const noI = await shot(); await page.evaluate(() => document.querySelectorAll('#cmplayer .hisland').forEach(g => g.style.display = ''));
    const diff = await page.evaluate(async ([a, c]) => { const ld = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
      const [A, C] = await Promise.all([ld(a), ld(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const x = cv.getContext('2d');
      x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, A.width, A.height).data; x.clearRect(0, 0, A.width, A.height); x.drawImage(C, 0, 0); const dc = x.getImageData(0, 0, A.width, A.height).data;
      let n = 0, red = 0; for (let i = 0; i < da.length; i += 4) { if (Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]) + Math.abs(da[i + 2] - dc[i + 2]) > 30) { n++; if (da[i] > da[i + 1] + 30) red++; } } return { n, red }; }, [withI, noI]);
    ov.pix = diff; res[k] = { side, ov };
    if (ov.worstPts) { assert.ok(ov.isl > 0 && ov.pix.red > 200 * ov.isl, k + ' worst islands drawn ' + JSON.stringify(ov)); }
    if (k === 'gir') { await page.locator('#cmpov').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'compare-overlay-fixed.png' }); }
  }
  console.log(JSON.stringify(res)); assert.ok(res.gir.ov.worstPts > 0, 'gir has worst shots');
  assert.deepStrictEqual(errors, []); console.log('CMPOV OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
