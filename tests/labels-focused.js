const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8781/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8781', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
    // Scott's case: misses at the same spot in both rounds (long 17, left 10, right 9, short 12) + one-off misses short-left / short-right
    const spots = [[17, 'long'], [10, 'left'], [9, 'right'], [12, 'short']], one = { a: [8, 'shortleft'], b: [8, 'shortright'] };
    const mk = (id, day) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const s = i < 4 ? spots[i] : i === 4 ? one[id] : null;
        return { par: 4, pin: 'center', finished: true, rows: s ? [R(400, 'tee'), R(150, 'fairway'), R(s[0], 'rough', s[1]), R(10, 'green', 'left'), R(1, 'holed')] : [R(400, 'tee'), R(150, 'fairway'), R(15, 'green', 'right'), R(2, 'green', 'left'), R(1, 'holed')] }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('a', 12), mk('b', 13)])); });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"] >> nth=0');
  for (const m of ['prox', 'gir', 'miss', 'pin', 'putt', 'pmiss']) {
    await page.click('[data-act="map"][data-v="' + m + '"]'); await page.waitForSelector('#mapview'); await page.click('[data-act="mapscope"][data-v="all"]');
    if (m === 'pin') await page.click('[data-act="pinseg"][data-v="center"]');
    const tog = await page.$('#heattog'); if (!tog) { await page.click('[data-act="mapclose"]'); continue; }
    if (m === 'prox') { const all = await page.$('[data-act="proxb"][data-v="all"]'); if (all) await all.click(); await page.waitForSelector('#heattog'); }
    assert.strictEqual(await page.$('[data-act="heat"][data-v="isl"]'), null, m + ' no Islands button');
    for (const v of ['grad']) {
      if (await page.locator('[data-act="heat"][data-v="' + v + '"]').isDisabled()) continue; await page.click('[data-act="heat"][data-v="' + v + '"]'); await page.waitForTimeout(200);
      const r = await page.evaluate(v => { const tags = [...document.querySelectorAll('#mapview ' + (v === 'grad' ? '.hotspot' : '.island') + ' text')].map(t => t.textContent);
        const sum = tags.reduce((a, t) => a + +(t.match(/(\d+) shots?/) || [0, 0])[1], 0); const txt = (document.getElementById('heatsum') || document.body).textContent;
        const tot = +(txt.match(/(\d+) shots?(?! –)/) || [0, 0])[1], hs = +(txt.match(/(\d+) (hot spots?|clusters?)/) || [0, 0])[1]; return { tags, sum, txt: txt.slice(0, 160), hs }; }, v);
      // one tag per hot spot / island: no shot is counted twice and the summary count matches the tags
      const tot = await page.evaluate(() => document.querySelectorAll('#mapview [data-hd]').length);
      assert.ok(r.sum <= tot, m + ' ' + v + ' shots double-counted ' + JSON.stringify(r) + ' total ' + tot);
      if (v === 'grad') assert.strictEqual(r.hs, r.tags.length, m + ' grad tags = hot spots ' + JSON.stringify(r));
      if (m === 'miss' && v === 'grad') { assert.strictEqual(r.tags.length, 6, 'miss: 6 hot spots, one tag each ' + JSON.stringify(r)); assert.strictEqual(r.sum, 10);
        await page.locator('#mapview svg').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'gradient-labels-fixed.png' }); }
      console.log(m, v, r.tags.length, r.sum, '/', tot);
    }
    await page.click('[data-act="mapclose"]');
  }
  assert.deepStrictEqual(errors, []); console.log('LABELS OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
