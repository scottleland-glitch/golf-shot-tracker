const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8786/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8786', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false }); const D = ['left', 'right', 'long', 'short', 'shortleft', 'longright'];
    const AP = [80, 81, 150, 152, 148, 190, 40, 80, 150, 200];
    const mk = (id, day) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const a = AP[i % AP.length]; return { par: 4, pin: 'center', finished: true, rows: i % 4 === 0 ? [R(400, 'tee'), R(a, 'fairway'), R(8 + i, 'rough', D[(i + 1) % 6]), R(12, 'green', 'left'), R(1, 'holed')] : [R(400, 'tee'), R(a, 'fairway'), R(6 + (i * 7) % 40, 'green', D[i % 6]), R(1, 'holed')] }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('a', 12), mk('b', 13)])); });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"] >> nth=0');
  await page.click('[data-act="map"][data-v="prox"]'); await page.click('[data-act="mapscope"][data-v="all"]'); await page.waitForSelector('#proxrail');
  const ring = () => page.evaluate(() => { const g = document.getElementById('d1ring'); if (!g) return null; const svg = g.ownerSVGElement;
    return { r: +g.querySelector('circle').getAttribute('r'), t: g.querySelector('text').textContent, last: svg.lastElementChild === g, legend: !!document.querySelector('.legend .ln.dash') && /D1 women avg/.test(document.querySelector('#mapview').textContent), note: (document.getElementById('d1note') || {}).textContent || '' }; });
  for (const [yd, ft, est] of [['80', 22, false], ['150', 44, false], ['40', 15, false], ['190', 60, true], ['200', 64, true]]) {
    await page.click('[data-act="proxb"][data-v="' + yd + '"]'); await page.waitForSelector('#heattog');
    const K = 117 / (ft + 30);
    for (const v of ['dots', 'grad']) { await page.click('[data-act="heat"][data-v="' + v + '"]'); const r = await ring();
      assert.ok(r, yd + ' ' + v + ' ring'); assert.ok(Math.abs(r.r - ft * K) < 0.1, yd + ' radius ' + r.r); assert.strictEqual(r.t, 'D1 avg ' + ft + '\u2019' + (est ? ' est.' : ''));
      assert.ok(r.last, yd + ' ' + v + ' ring on top');
      const g = await page.evaluate(() => { const s = document.getElementById('proxmap'), vb = s.viewBox.baseVal, c = s.querySelector('#d1ring circle'), cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'), r = +c.getAttribute('r');
        const green = [...s.querySelectorAll('circle')].find(e => e.getAttribute('fill') === '#3da33d'); const gr = +green.getAttribute('r');
        // misses sit outside the green; hits inside
        const miss = [...s.querySelectorAll('.xdot')].filter(e => /^miss/.test(e.dataset.kind) && e.dataset.kind !== 'missnodir').map(e => { const el = e.tagName === 'circle' ? e : (e.querySelector('circle') || e); return Math.hypot(+el.getAttribute('cx') - cx, +el.getAttribute('cy') - cy); });
        const hit = [...s.querySelectorAll('.xdot')].filter(e => e.dataset.kind === 'hit').map(e => { const el = e.tagName === 'circle' ? e : (e.querySelector('circle') || e); return Math.hypot(+el.getAttribute('cx') - cx, +el.getAttribute('cy') - cy); });
        return { hd: hit.map(Math.round), hft: [...s.querySelectorAll('.xdot')].filter(e => e.dataset.kind === 'hit').map(e => e.dataset.hd), fits: cx - r >= 0 && cx + r <= vb.width && cy - r >= 0, gr, gfits: cx - gr >= 0 && cx + gr <= vb.width, missOut: miss.every(d => d > gr), hitIn: hit.every(d => d < gr), nm: miss.length }; });
      assert.ok(g.fits && g.gfits, yd + ' ring + green fit ' + JSON.stringify(g)); assert.strictEqual(g.gr, 117); const z = await page.$eval('#proxrings', e => [+e.dataset.rft, +e.dataset.step]); assert.deepStrictEqual(z, [ft + 30, ft + 30 < 50 ? 5 : ft + 30 < 80 ? 10 : 15], yd + ' zoom'); assert.ok(g.missOut && g.hitIn, yd + ' placement ' + JSON.stringify(g)); if (yd === '150') { assert.ok(g.nm > 0, 'has misses'); console.log('150 misses', g.nm, g.gr); } assert.ok(r.legend, 'legend'); assert.match(r.note, /Shot Scope D1 women/); if (est) assert.match(r.note, /estimate/);
      if (yd === '150' || yd === '80' || yd === '40') { await page.locator('#mapview svg#proxmap').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'prox-zoom-' + yd + '-' + v + '.png' }); } }
    console.log(yd, 'ok');
  }
  await page.click('[data-act="proxb"][data-v="all"]'); assert.strictEqual(await ring(), null, 'no ring for All'); assert.deepStrictEqual(await page.$eval('#proxrings', e => [+e.dataset.rft, +e.dataset.step]), [90, 15]);
  // clamped hits: label ends with ›
  await page.click('[data-act="proxb"][data-v="40"]'); const cl = await page.$$eval('#proxmap .xdot[data-clamped]', e => e.length); console.log('40 yd clamped hits', cl);
  // band table: boundaries go to the band starting there
  const t = await page.evaluate(() => [39, 40, 49, 50, 149, 150, 179, 180, 200, 250].map(y => { const B = window.__golf && window.__golf.d1Bench ? window.__golf.d1Bench(y) : null; return B && [B.from, B.ft, B.est]; }));
  console.log(JSON.stringify(t)); assert.deepStrictEqual(t, [null, [40, 15, false], [40, 15, false], [50, 17, false], [140, 40, false], [150, 44, false], [170, 52, false], [180, 56, true], [200, 64, true], [200, 64, true]]);
  assert.deepStrictEqual(errors, []); console.log('D1 OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
