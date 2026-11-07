const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
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
  await page.reload(); await goHist(page); await page.click('#cmpopen'); await page.waitForSelector('#gaptable');
  const ids = async s => page.$$eval(s + ' li', l => l.map(x => x.textContent));
  assert.strictEqual((await ids('#cmpbest')).length, 3); assert.strictEqual((await ids('#cmpworst')).length, 3);
  assert.ok((await ids('#cmpbest')).every(t => /Course [aceg]/.test(t)) && (await ids('#cmpworst')).every(t => /Course [bdf]/.test(t)), 'best = good rounds');
  assert.strictEqual(await page.locator('[data-act="cmpn"][data-v="1"]').isDisabled(), true, 'max N = 3 of 7');
  await page.click('[data-act="cmpn"][data-v="-1"]'); assert.strictEqual((await ids('#cmpbest')).length, 2);
  await page.click('[data-act="cmpn"][data-v="1"]');
  const gap = await page.$$eval('#gaptable tr[data-bucket]', t => t.map(r => [r.dataset.bucket, r.querySelector('.gap').textContent]));
  assert.ok(gap.length >= 3, JSON.stringify(gap));
      // v136: sky page, category tiles (worst minus best), 4-column table (From · Best · Worst · Diff), one full-width map with a Best / Worst switch
  const T = await page.evaluate(() => { const t = document.getElementById('gaptable');
    return { sky: !!document.querySelector('.frostpage.theme-sky.cmppage'), heads: [...t.querySelectorAll('thead th')].map(h => h.textContent),
      cells: [...t.querySelectorAll('tr[data-bucket]')].map(r => r.children.length), secs: [...t.querySelectorAll('tr.gsec')].map(r => r.textContent),
      from: [...t.querySelectorAll('tr[data-bucket] td.from')].map(c => c.textContent),
      apSmall: [...t.querySelectorAll('tr[data-bucket]')].slice(0, 1).map(r => r.querySelector('td.gb small').textContent)[0],
      over: [...document.querySelectorAll('#cmppage td, #cmppage th, #cmpqv .qv *')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent), w: t.getBoundingClientRect().right,
      tiles: [...document.querySelectorAll('#cmpqv .qv')].map(q => [q.dataset.q, q.classList.contains('big')]), lead: document.getElementById('cmplead').textContent,
      cards: [...document.querySelectorAll('.cmpcard')].map(c => c.className) }; });
  assert.ok(T.sky, 'same sky look as Rounds and Stats');
  assert.deepStrictEqual(T.heads, ['From', 'Best', 'Worst', 'Diff']); assert.ok(T.cells.every(n => n === 4), 'From + Best + Worst + Diff');
  assert.deepStrictEqual(T.secs, ['Approach · yd', 'Around green · yd', 'Putting · 1st putt']);
  assert.ok(T.from.includes('100–130') && T.from.includes('0–5’') && T.from.includes('30’+'), T.from.join(' '));
  assert.match(T.apSmall, /^\d+’ · \d+%$/, 'approach rows: avg ft · GIR'); assert.deepStrictEqual(T.over, [], 'nothing cut off'); assert.ok(T.w <= 390, 'fits the phone width');
  assert.deepStrictEqual(T.tiles.map(t => t[0]), ['tee', 'approach', 'short', 'putting']); assert.strictEqual(T.tiles.filter(t => t[1]).length, 1, 'one biggest loss highlighted');
  assert.match(T.lead, /^Worst rounds average \d+ more strokes?\./); assert.ok(T.cards[0].includes('gbcard') && T.cards[1].includes('gwcard'));
  const diffSum = gap.reduce((a, g) => a + parseFloat(g[1].replace('−', '-')), 0); assert.ok(diffSum < 0, 'worst rounds lose strokes overall ' + diffSum);
  await page.screenshot({ path: OUT + 'best-worst-clean.png' }); await page.screenshot({ path: OUT + 'best-worst-clean-full.png', fullPage: true });
  console.log('  v136: tiles, 4-column table, no overflow at 390 px');
  for (const k of ['prox', 'gir', 'miss', 'putt']) {
    await page.click('[data-act="cmpkind"][data-v="' + k + '"]');
    assert.strictEqual(await page.locator('#cmpmap svg').count(), 1, k + ': one map');
    const vbB = await page.$eval('#cmpmap svg', s => s.getAttribute('viewBox')); assert.ok(await page.$('#cmpmap.cmpbest'), 'best first');
    await page.click('[data-act="cmpside"][data-v="worst"]'); assert.ok(await page.$('#cmpmap.cmpworst'), k + ' worst');
    assert.strictEqual(await page.$eval('#cmpmap svg', s => s.getAttribute('viewBox')), vbB, 'same scale both sides');
    if (k === 'prox' || k === 'gir') { await page.locator('#cmpmap').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'compare-map-' + k + '.png' }); }
    await page.click('[data-act="cmpside"][data-v="best"]');
  }
  assert.strictEqual(await page.$('[data-act="cmpov"]'), null, 'overlay removed');
  assert.deepStrictEqual(errors, []); console.log('COMPARE OK', JSON.stringify(gap)); await b.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
