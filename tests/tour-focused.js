// v242: the first-run tour – shows after setup, pages follow the track choice, Skip closes it, Settings → Take the tour reopens it.
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const b = await chromium.launch();
  async function start(tr) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await p.waitForTimeout(500);
    for (const s of ['#roleplayer', '#rolego']) if (await p.$(s)) { await p.click(s); await p.waitForTimeout(150); }
    await p.click('#track' + tr); await p.click('#trackgo'); await p.waitForTimeout(150);
    await p.fill('#pname', 'Sam'); await p.click('[data-act="setname"]'); await p.waitForTimeout(300);
    return p;
  }
  async function pages(p) { const T = []; let n = 0; while (await p.$('#tour') && n++ < 12) { T.push(await p.textContent('#tourh')); await p.click('#tournext'); await p.waitForTimeout(80); } return T; }
  const counts = {};
  for (const tr of ['score', 'sg', 'full']) {
    const p = await start(tr); assert(await p.$('#tour'), tr + ': tour opens after setup');
    const imgs = await p.$$eval('#tour img', l => l.map(i => i.getAttribute('src'))); assert(imgs.length === 1 && /^tour\/\w+\.webp$/.test(imgs[0]), 'picture ' + imgs);
    const T = await pages(p); counts[tr] = T.length;
    assert(T.includes('On your watch') && T.includes('Your rounds'), tr + ' basics ' + T);
    assert.strictEqual(T.includes('How you improve'), tr === 'full', tr + ' improve page');
    assert.strictEqual(T.includes('Strokes gained & My Game'), tr !== 'score', tr + ' SG page');
    await p.close();
  }
  assert.deepStrictEqual(counts, { score: 4, sg: 5, full: 7 });
  const p = await start('sg'); await p.click('#tourskip'); await p.waitForTimeout(100); assert(!(await p.$('#tour')), 'skip closes');
  await p.reload(); await p.waitForTimeout(400); assert(!(await p.$('#tour')), 'not shown again');
  await p.evaluate(() => { window.__golf.view().screen = 'archive'; window.__golf.render(); }); await p.click('#tourgo'); await p.waitForTimeout(100);
  assert(await p.$('#tour'), 'Settings reopens the tour'); await p.click('#tournext'); await p.click('#tourprev'); assert.strictEqual(await p.textContent('#tourh'), 'Entering a round');
  await b.close(); console.log('tour ok', JSON.stringify(counts));
})().catch(e => { console.error(e); process.exit(1); });
