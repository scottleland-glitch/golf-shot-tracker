const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8774/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8774', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
    const D = ['left', 'right', 'long', 'short', 'shortleft', 'longright', 'right', 'shortright'], P = ['center', 'frontleft', 'backright', 'center', 'front', 'back'];
    const mk = (id, day, seed) => ({ v: 3, dv: 2, id, date: '2026-10-0' + day + 'T17:00:00.000Z', course: 'Heat ' + id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const k = i + seed, dir = D[k % 8], app = 90 + (k * 17) % 110;
        const rows = k % 3 === 0
          ? [R(400, 'tee'), R(app, 'fairway', D[(k + 3) % 8]), R(8 + k % 14, 'rough', dir), R(4 + k % 9, 'green', D[(k + 1) % 8]), R(1 + k % 3, 'holed', D[(k + 2) % 8])]
          : [R(390, 'tee'), R(app, 'fairway', D[(k + 5) % 8]), R(6 + (k * 7) % 34, 'green', dir), R(1 + k % 5, 'holed', D[(k + 4) % 8])];
        return { par: 4, pin: P[k % 6], finished: true, rows }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('h1', 7, 0), mk('h2', 8, 5)]));
  });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="h2"]');
  const maps = ['prox', 'gir', 'miss', 'pin', 'putt', 'pmiss'];
  for (const m of maps) {
    await page.click('[data-act="map"][data-v="' + m + '"]'); await page.waitForSelector('#mapview');
    await page.click('[data-act="mapscope"][data-v="all"]');
    if (m === 'pin') await page.click('[data-act="pinseg"][data-v="center"]');
    await page.waitForSelector('#heattog');
    if (m === 'prox') { const all = await page.$('[data-act="proxb"][data-v="all"]'); if (all) await all.click(); await page.waitForSelector('#heattog'); }
    if (m === 'pmiss') { await page.waitForSelector('#heattog'); }
    const gr = await page.evaluate(() => ({ img: !!document.querySelector('#mapview svg.heat #heatgrad'), hs: [...document.querySelectorAll('#mapview .hotspot text')].map(t => t.textContent), avg: !!document.querySelector('#heatavg'), sel: document.querySelector('#heattog .sel').dataset.v }));
    assert.ok(gr.img && gr.avg && gr.sel === 'grad', m + ' gradient by default for multi-round ' + JSON.stringify(gr));
    assert.ok(gr.hs.every(t => /^\d+ (ft|yd) · \d+ shots$/.test(t)), m + ' hot-spot tags ' + gr.hs);
    await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'heatmap-gradient-' + m + '.png' });
    await page.click('[data-act="heat"][data-v="isl"]');
    const st = await page.evaluate(() => { const s = document.querySelector('#mapview svg.heat'); if (!s) return null;
      return { blobs: s.querySelectorAll('.hblob').length, isl: [...s.querySelectorAll('.island')].map(g => +g.dataset.n), lbl: [...s.querySelectorAll('.island text')].map(t => t.textContent), avg: !!s.querySelector('#heatavg'), sum: document.getElementById('heatsum').textContent }; });
    assert.ok(st, m + ': heat map on automatically for 2 rounds');
    assert.ok(st.blobs > 0 && st.isl.reduce((a, b) => a + b, 0) === st.blobs, m + ' islands cover every shot ' + JSON.stringify(st));
    assert.ok(st.lbl.every(t => /^\d+ (ft|yd) · \d+ shots?$/.test(t)), m + ' island labels ' + st.lbl);
    const sh = await page.evaluate(() => [...document.querySelectorAll('#mapview svg.heat .hisland')].map(g => [+g.dataset.n, g.dataset.col.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0)]));
    sh.forEach(a => sh.forEach(b => { if (a[0] > b[0]) assert.ok(a[1] < b[1], m + ' bigger island darker ' + JSON.stringify(sh)); }));
    assert.ok(await page.$('#heatnote .ramp'), 'ramp legend');
    assert.ok(st.avg && /Average (finish|putt start)/.test(st.sum), m + ' centroid');
    console.log(m, st.blobs, 'shots', st.isl.length, 'islands', st.sum);
    await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'heatmap-' + m + '.png' });
    await page.click('[data-act="heat"][data-v="dots"]'); assert.strictEqual(await page.$('#mapview svg.heat'), null, m + ' toggles back to dots');
    if (m === 'gir') { await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'heatmap-gir-dots.png' }); }
    await page.click('[data-act="heat"][data-v="isl"]'); assert.ok(await page.$('#mapview svg.heat'));
    await page.click('[data-act="mapscope"][data-v="round"]');
    const one = await page.evaluate(() => [document.querySelectorAll('#mapview svg [data-hd]').length, !!document.querySelector('#mapview svg.heat')]);
    if (one[0] <= 15) assert.strictEqual(one[1], false, m + ' single round with few shots stays dots');
    await page.click('[data-act="mapclose"]');
  }
  assert.deepStrictEqual(errors, []); console.log('HEAT OK'); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
