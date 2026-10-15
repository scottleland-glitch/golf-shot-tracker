const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8776/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8776', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
    const D = ['left', 'right', 'long', 'short', 'shortleft', 'longright'];
    // quality q: 0 = great (close approaches, 1 putts), 1 = poor (missed greens, long putts)
    const mk = (id, day, q) => ({ v: 3, dv: 2, id, date: '2026-09-' + String(day).padStart(2, '0') + 'T17:00:00.000Z', course: 'Course ' + id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const k = i + day, app = 70 + (k * 23) % 120;
        const rows = q && (k % 3) ? [R(400, 'tee'), R(app, 'rough', D[k % 6]), R(12 + k % 15, 'rough', D[(k + 2) % 6]), R(18 + k % 20, 'green', D[(k + 1) % 6]), R(4 + k % 4, 'green', D[(k + 3) % 6]), R(1, 'holed')]
          : [R(400, 'tee'), R(app, 'fairway'), R(q ? 30 : 6 + k % 12, 'green', D[k % 6]), R(2, 'holed', D[(k + 1) % 6])];
        return { par: 4, finished: true, rows }; }) });
    const rs = [mk('a', 1, 0), mk('b', 3, 1), mk('c', 5, 0), mk('d', 7, 1), mk('e', 9, 0), mk('f', 11, 1), mk('g', 13, 0)];
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
  });
  await page.reload(); await page.click('[data-act="history"]'); await page.click('#cmpopen'); await page.waitForSelector('#gaptable');
  const ids = async s => page.$$eval(s + ' li', l => l.map(x => x.textContent));
  assert.strictEqual((await ids('#cmpbest')).length, 3); assert.strictEqual((await ids('#cmpworst')).length, 3);
  assert.ok((await ids('#cmpbest')).every(t => /Course [aceg]/.test(t)) && (await ids('#cmpworst')).every(t => /Course [bdf]/.test(t)), 'best = good rounds');
  assert.strictEqual(await page.locator('[data-act="cmpn"][data-v="1"]').isDisabled(), true, 'max N = 3 of 7');
  await page.click('[data-act="cmpn"][data-v="-1"]'); assert.strictEqual((await ids('#cmpbest')).length, 2);
  await page.click('[data-act="cmpn"][data-v="1"]');
  const gap = await page.$$eval('#gaptable tr[data-bucket]', t => t.map(r => [r.dataset.bucket, r.querySelector('.gap').textContent]));
  assert.ok(gap.length >= 3, JSON.stringify(gap));
  const tot = gap.reduce((a, g) => a + parseFloat(g[1].replace('−', '-')), 0); assert.ok(tot > 0, 'best gains vs worst ' + tot);
  await page.screenshot({ path: OUT + 'compare-gap-table.png' });
  for (const k of ['prox', 'gir', 'miss', 'putt']) {
    await page.click('[data-act="cmpkind"][data-v="' + k + '"]'); await page.click('[data-act="cmpov"][data-v="0"]');
    assert.strictEqual(await page.locator('#cmpmaps svg').count(), 2, k);
    const vb = await page.$$eval('#cmpmaps svg', s => s.map(x => x.getAttribute('viewBox'))); assert.strictEqual(vb[0], vb[1], 'same scale');
    if (k === 'prox' || k === 'gir') { await page.locator('#cmpmaps').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'compare-side-' + k + '.png' }); }
    await page.click('[data-act="cmpov"][data-v="1"]'); await page.waitForSelector('#cmplayer');
    const ov = await page.evaluate(() => ({ isl: document.querySelectorAll('#cmplayer .hisland').length, rings: document.querySelectorAll('#cmplayer .bestisl').length, last: document.querySelector('#cmpovmap').lastElementChild.id, hidden: !!document.getElementById('cmpbestsrc') }));
    assert.ok(ov.rings + ov.isl > 0 && ov.last === 'cmplayer' && !ov.hidden, k + ' overlay ' + JSON.stringify(ov));
    const order = await page.evaluate(() => { const L = [...document.querySelectorAll('#cmplayer > *')]; const fr = L.findIndex(e => e.classList.contains('bestisl')), li = L.map(e => e.classList.contains('hisland')).lastIndexOf(true); return fr === -1 || fr > li; });
    assert.ok(order, 'best rings drawn on top');
    if (k === 'prox' || k === 'putt') { await page.locator('#cmpov').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'compare-overlay-' + k + '.png' }); }
  }
  assert.deepStrictEqual(errors, []); console.log('COMPARE OK', JSON.stringify(gap)); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
