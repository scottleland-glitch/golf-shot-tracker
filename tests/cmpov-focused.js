const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
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
      holes: Array.from({ length: 18 }, (_, i) => { const app = i === 4 ? 97 : i === 6 ? 64 : 60 + (i * 37) % 120;
        const rows = (q && i % 3 === 0) ? [R(400, 'tee'), R(app, 'fairway'), R(10 + i, 'rough', D[i % 6]), R(15 + i, 'green', D[(i + 1) % 6]), R(3, 'green', D[i % 6]), R(1, 'holed')]
          : [R(400, 'tee'), R(app, 'fairway'), R(8 + (i * 7) % 30, 'green', D[i % 6]), R(2, 'green', D[(i + 2) % 6]), R(1, 'holed')].slice(0, (i % 2) ? 5 : 4).map((r, j, a) => j === a.length - 1 ? R(1, 'holed') : r);
        return { par: 4, finished: true, rows }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([mk('best', 13, 0), mk('worst', 12, 1)])); });
  await page.reload(); await goHist(page); await page.click('#cmpopen'); await page.waitForSelector('#gaptable');
  // bucketing = the round's own proximity rail (yards rounded to 10): 60-100 group = rail 60,70,80,90
  const exp = await page.evaluate(() => { const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); const c = {};
    rs.forEach(r => SG.summarize(r, 'pga').proxList.forEach(m => { ['60', '70', '80', '90'].forEach(b => { if (SG.inBucket(b, m.from)) c[r.id] = (c[r.id] || 0) + 1; }); })); return c; });
  await page.click('[data-act="cmpkind"][data-v="prox"]'); await page.click('[data-act="cmpgrp"][data-v="60-100 yd"]'); await page.click('[data-act="cmpov"][data-v="0"]');
  const caps = await page.$$eval('#cmpmaps figcaption', f => f.map(x => +x.textContent.split('·')[1]));
  assert.deepStrictEqual(caps, [exp.best || 0, exp.worst || 0], 'compare 60-100 = rail 60-90 ' + JSON.stringify(exp)); console.log('60-100 best/worst', caps);
  const res = {};
  for (const k of ['prox', 'gir', 'miss', 'putt']) {
    await page.click('[data-act="cmpkind"][data-v="' + k + '"]'); await page.click('[data-act="cmpov"][data-v="0"]');
    const side = await page.$$eval('#cmpmaps svg', s => s.map(x => [...x.querySelectorAll('[data-hd]')].filter(e => !/nodir/.test((e.getAttribute('data-kind') || '') + (e.getAttribute('data-class') || ''))).length));
    await page.click('[data-act="cmpov"][data-v="1"]'); await page.waitForSelector('#cmplayer');
    const ov = await page.evaluate(() => { const L = document.getElementById('cmplayer'); const isl = [...L.querySelectorAll('.worstisl')];
      return { isl: isl.length, shots: isl.reduce((a, g) => a + +g.dataset.n, 0), rings: L.querySelectorAll('.bestisl').length, bestMulti: L.querySelectorAll('.bestisl').length, bestShots: [...L.querySelectorAll('.bestisl')].reduce((a, g) => a + +g.dataset.n, 0), bestPts: document.querySelectorAll('#cmpbestsrc [data-hd]').length, worstPts: document.querySelectorAll('#cmpovmap [data-hd]').length, visDots: [...document.querySelectorAll('#cmpovmap [data-hd], #cmpovmap circle')].filter(e => !e.closest('#cmplayer') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none' && !/^(#fff|none|transparent)?$/.test('') && +e.getAttribute('r') > 0 && +e.getAttribute('r') < 15).length }; });
    const shot = async () => (await page.locator('#cmpovmap').screenshot()).toString('base64');
    const withI = await shot(); await page.evaluate(() => document.getElementById('worstisls').style.display = 'none');
    const noI = await shot(); await page.evaluate(() => document.getElementById('worstisls').style.display = '');
    const diff = await page.evaluate(async ([a, c]) => { const ld = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
      const [A, C] = await Promise.all([ld(a), ld(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const x = cv.getContext('2d');
      x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, A.width, A.height).data; x.clearRect(0, 0, A.width, A.height); x.drawImage(C, 0, 0); const dc = x.getImageData(0, 0, A.width, A.height).data;
      let n = 0, red = 0; for (let i = 0; i < da.length; i += 4) { if (Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]) + Math.abs(da[i + 2] - dc[i + 2]) > 30) { n++; if (da[i] > da[i + 1] + 30) red++; } } return { n, red }; }, [withI, noI]);
    ov.pix = diff; res[k] = { side, ov };
    assert.strictEqual(ov.bestShots, side[0], k + ' every best shot in a best island'); assert.strictEqual(ov.visDots, 0, k + ' no dots'); if (ov.worstPts) { assert.ok(ov.isl > 0 && ov.pix.red > 50, k + ' worst islands drawn ' + JSON.stringify(ov)); }
    if (k === 'gir' || k === 'putt') { await page.locator('#cmpov').scrollIntoViewIfNeeded(); await page.locator('#cmpov').screenshot({ path: OUT + (k === 'gir' ? 'compare-overlay-outlines.png' : 'compare-overlay-outlines-putt.png') }); }
  }
  // loose clustering: best shots merge into multi-shot outline islands that are really painted (black, unfilled)
  await page.evaluate(() => localStorage.setItem('golfsg.heatclus.v1', '10')); await page.reload(); await goHist(page); await page.click('#cmpopen');
  await page.click('[data-act="cmpkind"][data-v="putt"]'); await page.click('[data-act="cmpov"][data-v="1"]'); await page.waitForSelector('#cmplayer');
  const multi = await page.evaluate(() => [...document.querySelectorAll('#cmplayer .bestisl')].map(r => +r.dataset.n));
  assert.ok(multi.length && multi.some(n => n > 1), 'multi-shot best islands ' + multi);
  const blk = await page.evaluate(() => { document.getElementById('worstisls').style.display = 'none'; return true; });
  const png = await page.locator('#cmpov').screenshot({ path: OUT + 'compare-overlay-outlines-loose.png' });
  console.log('loose best islands', multi, await page.evaluate(() => document.querySelector('#cmplayer .bestisl').outerHTML.slice(0, 200)));
  console.log(JSON.stringify(res)); assert.ok(res.gir.ov.worstPts > 0, 'gir has worst shots');
  assert.deepStrictEqual(errors, []); console.log('CMPOV OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
