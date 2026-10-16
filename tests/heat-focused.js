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
    assert.ok(gr.img && (m === 'miss' ? gr.avg : !gr.avg) && gr.sel === 'grad', m + ' gradient by default for multi-round ' + JSON.stringify(gr));
    assert.ok(gr.hs.length && gr.hs.every(t => ((m === 'prox' || m === 'gir') ? /^\d+(\u2019| yd)$/ : /^\d+(\u2019| yd) · \d+ shots?$/).test(t)), m + ' hot-spot tags ' + gr.hs);
    if (m === 'prox') { await page.locator('#mapview svg.heat').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'prox-labels-dist.png' }); }
    if (m === 'gir') { assert.ok(gr.hs.every(t => /^\d+\u2019$/.test(t)) && !gr.hs.some(t => / ft/.test(t)), 'feet mark ' + gr.hs); await page.locator('#mapview svg.heat').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'gir-labels-dist.png' }); }
    await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'heatmap-gradient-' + m + '.png' });
    if (m === 'putt') { // putt starts: no ⊕, summary = mean distance of the putts shown
      const ps = await page.evaluate(() => { const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); const d = []; // raw entered first-putt distances
        rs.forEach(r => SG.summarize(r, 'pga').puttList.filter(p => SG.puttGroup(p.n) === '1').forEach(p => d.push(Number(p.ft)))); return { t: document.getElementById('heatsum').textContent, d }; });
      const mm = ps.t.match(/^Average first-putt distance: ([\d.]+) ft · (\d+) putts · (\d+) hot spots?( \(\+ \d+ putts? with no direction entered – not on the heat map\))?\.$/); assert.ok(mm, 'putt summary ' + ps.t);
      assert.strictEqual(+mm[2], ps.d.length); assert.strictEqual(+mm[1], Math.round(ps.d.reduce((a, b) => a + b, 0) / ps.d.length * 10) / 10, 'raw mean ' + ps.t);
      assert.match(await page.textContent('#puttstats'), new RegExp(mm[1].replace('.', '\\.') + ' ft'), 'matches the Avg distance tile');
      assert.strictEqual(+mm[3], await page.$$eval('#mapview .hotspot', g => g.length)); assert.ok(!/⊕/.test(ps.t));
      await page.locator('#heatsum').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'putt-avg-fixed.png' }); console.log('putt', ps.t); }
    else if (m === 'miss') assert.match(await page.textContent('#heatsum'), /^⊕ Average finish:/);
    else { const a = await page.evaluate(() => { const E = [...document.querySelectorAll('#mapview svg [data-hd]')], yd = E.every(e => e.dataset.hu === 'yd');
        return { t: document.getElementById('heatsum').textContent, mean: E.reduce((s, e) => s + (+e.dataset.hd || 0) * (!yd && e.dataset.hu === 'yd' ? 3 : 1), 0) / E.length, v: +document.getElementById('heatmean').dataset.v, n: E.length,
          nd: document.getElementById('heatnodir') ? +document.getElementById('heatnodir').dataset.n : 0, nodirEls: E.filter(e => /nodir/.test((e.dataset.kind || '') + (e.dataset.class || ''))).length }; });
      assert.match(a.t, /^Average (proximity|distance from the hole|miss distance): \d+ (ft|yd) · \d+ shots?/, m + ' ' + a.t); assert.ok(!/⊕/.test(a.t));
      assert.strictEqual(a.v, Math.round(a.mean * 10) / 10, m + ' raw mean'); assert.ok(a.t.includes(' · ' + a.n + ' shot'), m + ' count = every marker ' + a.t);
      assert.strictEqual(a.nd, a.nodirEls, m + ' no-direction note'); console.log(m, a.t); }
    // Islands view retired: only Dots and Gradient; tags never overlap
    assert.strictEqual(await page.$('[data-act="heat"][data-v="isl"]'), null, m + ' no Islands button');
    await page.click('[data-act="heat"][data-v="grad"]');
    const bx = await page.$$eval('#mapview .hotspot rect', r => r.map(e => [+e.getAttribute('x'), +e.getAttribute('y'), +e.getAttribute('width'), +e.getAttribute('height')]));
    bx.forEach((a, i) => bx.forEach((b, j) => { if (i < j) assert.ok(!(a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]), m + ' tags overlap'); }));
    if (m === 'putt') { const cnt = () => page.$$eval('#mapview .hotspot', g => g.length); const n3 = await cnt();
      await page.$eval('#clusr', e => { e.value = '8'; e.dispatchEvent(new Event('input', { bubbles: true })); }); const n8 = await cnt(); assert.ok(n8 <= n3, 'looser -> fewer hot spots ' + n3 + ' -> ' + n8);
      assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.heatclus.v1')), '8'); await page.$eval('#clusr', e => { e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true })); }); }
    await page.click('[data-act="heat"][data-v="dots"]'); assert.strictEqual(await page.$('#mapview svg.heat'), null, m + ' toggles back to dots');
    if (m === 'gir') { await page.locator('#heattog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'heatmap-gir-dots.png' }); }
    await page.click('[data-act="heat"][data-v="grad"]'); assert.ok(await page.$('#mapview svg.heat'));
    await page.click('[data-act="mapscope"][data-v="round"]');
    const one = await page.evaluate(() => [document.querySelectorAll('#mapview svg [data-hd]').length, !!document.querySelector('#mapview svg.heat')]);
    if (one[0] <= 15) assert.strictEqual(one[1], false, m + ' single round with few shots stays dots');
    await page.click('[data-act="mapclose"]');
  }
  assert.deepStrictEqual(errors, []); console.log('HEAT OK'); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
