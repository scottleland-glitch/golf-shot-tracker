const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/', SHOTS = process.env.SHOTS || '/tmp/shots-v15f';
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], timeout: 600000 });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(120000); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (dist, loc) => ({ dist, loc, dir: '', pen: false });
    const H = (par, yds, n) => ({ par, finished: true, rows: [R(yds, 'tee')].concat(Array.from({ length: n - 2 }, () => R(6, 'green')), [R(1, 'holed')]) });
    const pars = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4], yds = [410, 385, 165, 530, 445, 190, 372, 515, 428, 402, 360, 178, 545, 390, 415, 155, 560, 440];
    const sc = [4, 3, 3, 3, 6, 5, 4, 6, 7, 2, 4, 3, 5, 4, 5, 3, 5, null];
    const holes = pars.map((p, i) => sc[i] == null ? { par: p, finished: false, rows: [R(yds[i], 'tee'), R(150, 'fairway')] } : H(p, yds[i], sc[i]));
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rcard', date: '2026-10-09T14:00:00.000Z', course: 'Card test', baseline: 'pga', holes },
      { v: 3, dv: 2, id: 'rputt', date: '2026-10-05T14:00:00.000Z', course: 'Putting test', baseline: 'pga', holes: [
        { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), { dist: 25, loc: 'green', dir: 'longleft', pen: false }, { dist: 4, loc: 'holed', dir: 'right', pen: false }] },
        { par: 3, finished: true, rows: [R(170, 'tee'), { dist: 8, loc: 'holed', dir: 'short', pen: false }] },
        { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(40, 'green'), { dist: 6, loc: 'holed', dir: 'long', pen: false }] },
        { par: 4, finished: true, rows: [R(380, 'tee'), R(140, 'fairway'), { dist: 3, loc: 'holed', dir: 'shortright', pen: false }] },
        { par: 5, finished: true, rows: [R(520, 'tee'), R(250, 'fairway'), R(90, 'fairway'), { dist: 12, loc: 'green', dir: 'right', pen: false }, { dist: 1.5, loc: 'holed', dir: 'left', pen: false }] },
        { par: 3, finished: true, rows: [R(170, 'tee'), { dist: 30, loc: 'green', dir: 'longright', pen: false }, { dist: 14, loc: 'holed', dir: 'long', pen: false }] }] },
      { v: 3, dv: 2, id: 'rold', date: '2026-10-01T14:00:00.000Z', course: 'Older', baseline: 'pga', holes: [H(4, 400, 5)] }]));
  });
  await page.reload();
  await page.click('[data-act="history"]'); await page.waitForSelector('#histlist');
  assert.deepStrictEqual(await page.$$eval('#histlist .hrow', r => r.map(x => x.getAttribute('data-id'))), ['rcard', 'rputt', 'rold']);
  await page.screenshot({ path: SHOTS + '/34-history.png' });
  await page.click('#histlist [data-act="open"][data-id="rcard"]');
  const marks = await page.$$eval('.scard tr.sscore td:not(.tot)', tds => tds.map(t => (t.querySelector('.mk') ? t.querySelector('.mk').getAttribute('data-mark') + ':' + t.textContent : 'blank')));
  assert.deepStrictEqual(marks, ['par:4', 'birdie:3', 'par:3', 'eagle:3', 'double:6', 'double:5', 'par:4', 'bogey:6', 'double:7', 'eagle:2', 'par:4', 'par:3', 'par:5', 'par:4', 'bogey:5', 'par:3', 'par:5', 'blank']);
  const t = async (id, row) => page.textContent(`#${id} tr.${row} td.tot`);
  assert.deepStrictEqual([await t('card-front', 'shole'), await t('card-front', 'spar'), await t('card-front', 'sscore'), await t('card-back', 'shole'), await t('card-back', 'spar'), await t('card-back', 'sscore')], ['OUT', '36', '41', 'IN', '36', '31']);
  const trow = await page.$$eval('#card-total tr:nth-child(2) td', ts => ts.map(x => x.textContent));
  assert.deepStrictEqual(trow.slice(0, 5), ['17/18 holes', '6885', '72', '72', '+4']);
  const fit = await page.evaluate(() => ({ docW: document.documentElement.scrollWidth, r: ['card-front', 'card-back', 'card-total'].map(id => document.getElementById(id).getBoundingClientRect().right), h: Math.min(...[...document.querySelectorAll('#card-front tr.sscore .hc')].map(b => b.getBoundingClientRect().height)) }));
  assert.ok(fit.docW <= 390 && fit.r.every(x => x <= 390), JSON.stringify(fit)); assert.ok(fit.h >= 44, 'cell h ' + fit.h);
  assert.match(await page.textContent('.topbar'), /‹ History/);
  const lg = await page.$$eval('#card-legend .mk', ms => ms.map(m => m.className.replace('mk ', '') + ':' + m.textContent));
  assert.deepStrictEqual(lg, ['mk-eagle:', 'mk-birdie:', 'mk-par lgpar:–', 'mk-bogey:', 'mk-double:']);
  await page.locator('#card-legend').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOTS + '/33b-scorecard-legend.png' });
  await page.locator('#card-front').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -56));
  await page.screenshot({ path: SHOTS + '/33-scorecard.png' });
  await page.click('#card-back tr.sscore [data-act="goHole"][data-i="12"]'); assert.match(await page.textContent('.hc-head'), /Hole 13/);
  await page.locator('[data-act="summary"]').first().click(); await page.click('.topbar [data-act="history"]'); await page.waitForSelector('#histlist');
  console.log('✓ scorecard: marks, OUT/IN/TOTAL, fits 390 (cells ' + fit.h.toFixed(0) + 'px), tap opens hole; History newest first, ‹ History back');
  // backup (download fallback) + restore
  await page.click('[data-act="home"]');
  assert.match(await page.textContent('#bkremind'), /haven't backed up/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
  assert.match(dl.suggestedFilename(), /^golf-rounds-backup-\d{4}-\d\d-\d\d\.json$/);
  const bk = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8')); assert.strictEqual(bk.rounds.length, 3);
  await page.waitForSelector('#notice'); assert.strictEqual(await page.locator('#bkremind').count(), 0);
  bk.rounds[2].course = 'Older (edited)'; bk.rounds.push({ id: 'rnew', date: '2026-09-01T10:00:00.000Z', course: 'New', baseline: 'pga', v: 3, dv: 2, holes: [{ par: 4, finished: false, rows: [{ dist: 400, loc: 'tee', dir: '', pen: false }] }] });
  await page.setInputFiles('#restorefile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
  await page.waitForFunction(() => /Restored/.test((document.getElementById('notice') || {}).textContent || ''));
  assert.strictEqual(await page.textContent('#notice'), '✓ Restored from backup: 1 added, 1 replaced, 2 already here. You now have 4 rounds.');
  await page.screenshot({ path: SHOTS + '/36-restore-success.png' });
  console.log('✓ backup ' + dl.suggestedFilename() + ' (3 rounds); restore: 1 added, 1 replaced (asked), 2 already here');
  await page.click('[data-act="history"]'); await page.click('#histlist [data-act="delHist"][data-id="rnew"]'); assert.strictEqual(await page.locator('#histlist .hrow').count(), 3);
  console.log('✓ delete from History');
  // Putting green
  await page.click('#histlist [data-act="open"][data-id="rputt"]');
  assert.match(await page.textContent('[data-act="map"][data-v="putt"]'), /^10\s*Putts – tap for map\s*1st putts made 2\/6/);
  await page.click('[data-act="map"][data-v="putt"]'); await page.waitForSelector('#puttmap');
  const pb = await page.$$eval('#puttbtns .pnbtn', bs => bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n'), b.disabled, b.classList.contains('sel')]));
  assert.deepStrictEqual(pb, [['1', 6, false, true], ['2', 4, false, false], ['3', 0, true, false]]);
  const dots1 = await page.$$eval('#puttmap .pdot2', ds => ds.map(d => [+d.getAttribute('data-ft'), d.getAttribute('data-made'), d.getAttribute('data-dir'), d.getAttribute('data-kind')]));
  assert.deepStrictEqual(dots1, [[25, '0', 'longleft', 'dir'], [8, '1', 'short', 'dir'], [40, '0', '', 'nodir'], [3, '1', 'shortright', 'dir'], [12, '0', 'right', 'dir'], [30, '0', 'longright', 'dir']]);
  assert.match(await page.textContent('#mapsum'), /^6 1st putts this round/);
  const st = await page.textContent('#puttstats'); assert.ok(st.includes('2 / 6 (33%)') && st.includes('19.7 ft'), st);
  const bands = await page.$$eval('#puttbands tr[data-band]', ts => ts.map(t => [...t.querySelectorAll('td')].map(d => d.textContent).join('|')));
  assert.deepStrictEqual(bands, ['0-3 ft|0|–|–', '3-6 ft|1|1/1|100%', '6-10 ft|1|1/1|100%', '10-20 ft|1|0/1|0%', '20+ ft|3|0/3|0%']);
  const lbl = await page.$$eval('#puttmap .plbl', ts => ts.map(t => t.textContent)); assert.deepStrictEqual(lbl.slice().sort(), ['12', '25', '3', '40', '8', '30'].sort());
  const geo = await page.evaluate(() => { const c = [...document.querySelectorAll('#puttmap .pring')].map(r => [+r.getAttribute('data-ft'), +r.getAttribute('r')]); return c; });
  const r10 = geo.find(g => g[0] === 10)[1], rmax = Math.max(...geo.map(g => g[1])); assert.ok(Math.abs(r10 / rmax - 0.6) < 0.01, 'inner 10 ft = 60% of radius');
  assert.deepStrictEqual(geo.map(g => g[0]).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40]);
  // the 3 ft putt sits shortright at radius r(3)
  const d3 = await page.$eval('#puttmap .pdot2[data-ft="3"]', c => [+c.getAttribute('cx'), +c.getAttribute('cy')]); const r3 = Math.hypot(d3[0] - 180, d3[1] - 190);
  assert.ok(Math.abs(r3 - 168 * 0.6 * 0.3) < 0.2 && d3[0] > 180 && d3[1] > 190, 'shortright at 3 ft ' + d3);
  console.log('✓ putting: 1st 6 / 2nd 4 / 3rd+ 0, made 2/6 (33%), avg 19.7 ft, bands, rings 1-10 + every 5 to 40, 10 ft = 60% radius, dots by dir/ft, ? for no dir');
  await page.screenshot({ path: SHOTS + '/37-putting-1st.png' });
  const noOverlap = async (tag) => { const c = await page.$$eval('#puttmap .pdot2', ds => ds.map(d => { const b = d.getBBox(); return [b.x + b.width / 2, b.y + b.height / 2]; }));
    for (let i = 0; i < c.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]) >= 14, tag + ' dots overlap ' + c[i] + ' / ' + c[j]); return c.length; };
  await noOverlap('1st');
  assert.strictEqual(await page.getAttribute('#puttmap', 'data-scale'), 'wide');
  await page.click('#puttbtns [data-v="2"]'); assert.match(await page.getAttribute('#puttbtns [data-v="2"]', 'class'), /sel/);
  const d2 = await page.$$eval('#puttmap .pdot2', ds => ds.map(d => [+d.getAttribute('data-ft'), d.getAttribute('data-made'), d.getAttribute('data-dir')]));
  assert.deepStrictEqual(d2, [[4, '1', 'right'], [6, '1', 'long'], [1.5, '1', 'left'], [14, '1', 'long']]); assert.ok((await page.textContent('#puttstats')).includes('4 / 4 (100%)'));
  // close-up: linear 10 ft green, 1 ft rings labelled 1-10, 14 ft at the edge with ›
  assert.strictEqual(await page.getAttribute('#puttmap', 'data-scale'), 'close');
  const g2 = await page.$$eval('#puttmap .pring', rs => rs.map(r => [+r.getAttribute('data-ft'), +r.getAttribute('r')]).sort((a, b) => a[0] - b[0]));
  assert.deepStrictEqual(g2.map(g => g[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); g2.forEach(g => assert.ok(Math.abs(g[1] - 16.8 * g[0]) < 0.1, 'linear ' + g));
  assert.deepStrictEqual(await page.$$eval('#puttmap text.ring', ts => ts.map(t => t.textContent).sort((a, b) => parseInt(a) - parseInt(b))), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10 ft']);
  const p4 = await page.$eval('#puttmap .pdot2[data-ft="4"]', c => [+c.getAttribute('cx'), +c.getAttribute('cy')]); assert.ok(Math.abs(p4[0] - (180 + 67.2)) < 0.2 && Math.abs(p4[1] - 190) < 0.2, '4 ft right ' + p4);
  const p14 = await page.$eval('#puttmap .pdot2[data-ft="14"]', c => [+c.getAttribute('cx'), +c.getAttribute('cy'), c.getAttribute('data-beyond')]); assert.ok(Math.abs(Math.hypot(p14[0] - 180, p14[1] - 190) - 168) < 0.5 && p14[2] === '1', '14 ft at edge ' + p14);
  assert.ok((await page.$$eval('#puttmap .plbl', ts => ts.map(t => t.textContent))).includes('14›'));
  await noOverlap('2nd');
  await page.screenshot({ path: SHOTS + '/37b-putting-2nd.png' });
  console.log('✓ 2nd putts: 10 ft close-up (linear, rings 1-10), 14 ft on edge with ›, row Dir used, no overlapping dots; 3rd+ greyed out (none this round)');
  await page.click('[data-act="mapscope"][data-v="all"]'); await page.click('#puttbtns [data-v="1"]');
  await page.click('#puttbtns [data-v="2"]'); const n2 = await noOverlap('All 2nd'); await page.screenshot({ path: SHOTS + '/37c-putting-2nd-all.png' }); await page.click('#puttbtns [data-v="1"]');
  const allExp = await page.evaluate(() => { const c = { 1: 0, 2: 0, 3: 0 }; window.__golf.rounds().forEach(r => SG.summarize(r).puttList.forEach(p => c[SG.puttGroup(p.n)]++)); return c; });
  const pbAll = await page.$$eval('#puttbtns .pnbtn', bs => bs.map(b => [+b.getAttribute('data-n'), b.disabled]));
  assert.deepStrictEqual(pbAll, [[allExp[1], false], [allExp[2], false], [allExp[3], !allExp[3]]]);
  assert.strictEqual(await page.locator('#puttmap .pdot2').count(), allExp[1]); assert.match(await page.textContent('#mapsum'), new RegExp('^' + allExp[1] + ' 1st putts in 3 rounds'));
  await page.click('#puttbtns [data-v="3"]'); assert.strictEqual(await page.locator('#puttmap .pdot2').count(), allExp[3]); assert.strictEqual(await page.getAttribute('#puttmap', 'data-scale'), 'close'); await noOverlap('All 3rd+'); assert.strictEqual(n2, allExp[2]);
  await page.click('[data-act="mapclose"]'); await page.waitForSelector('#puttmap', { state: 'detached' });
  console.log('✓ All rounds: 1st/2nd/3rd+ = ' + [allExp[1], allExp[2], allExp[3]].join('/') + '; Close');

  assert.deepStrictEqual(errors, []); console.log('FOCUSED OK');
  await browser.close(); if (srv) srv.kill();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
