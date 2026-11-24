// v254 (Scott): the scorecard's In stats row – tap ✓ to leave a blow-up hole out of stats; the round's score still counts.
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
const ARC = require('./fixtures/arcade-78.js');
(async () => {
  const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const R = [Object.assign(ARC.round(), { id: 'a1', date: '2026-11-20T16:00:00.000Z', player: 'Alex' })];
  await page.addInitScript(R => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.player.v1', 'Alex'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.trackasked.v1', '1'); } }, R);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(500);
  if (await page.$('#tourskip')) await page.click('#tourskip');
  await page.click('#navbtn'); await page.click('.sheet-item[data-act="history"]'); await page.waitForSelector('#histlist .hrow'); await page.click('.hrow .hist'); await page.waitForSelector('#scorecard');
  const sg0 = await page.textContent('#scorecard tr.sgtot td.sum.tot'), score0 = await page.textContent('#rs-score');
  assert.strictEqual(await page.$$eval('#scorecard tr.sincl .scinc', l => l.length), 18); assert.strictEqual(await page.textContent('#scorecard tr.sincl td.sum.tot'), '18/18');
  await page.click('#incl3'); await page.waitForTimeout(150);
  assert.strictEqual(await page.textContent('#rs-score'), score0, 'the score still counts');
  assert.match(await page.textContent('#rsoff'), /leave out hole 4/);
  assert.strictEqual(await page.textContent('#scorecard tr.sincl td.sum.tot'), '17/18');
  assert.ok(await page.$('#incl3 .scinc.off'), 'hole 4 shows ✗');
  assert.strictEqual((await page.textContent('#scorecard tr.sgtot td:nth-of-type(4)')).trim(), '–', 'no SG on hole 4');
  const sg1 = await page.textContent('#scorecard tr.sgtot td.sum.tot'); assert.notStrictEqual(sg1, sg0, 'round SG without hole 4');
  const st = await page.evaluate(() => { const r = window.__golf.rounds()[0], S = SG.summarize(r); return { flag: r.holes[3].nostats, strokes: S.strokes, holes: S.holesDone, stat: S.statHoles, shape: MYGAME.shape([r], SG, 'pga').rounds }; });
  assert.deepStrictEqual([st.flag, st.strokes, st.holes, st.stat], [true, 78, 18, 17]); assert.strictEqual(st.shape, 1);
  await page.reload(); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].holes[3].nostats), true, 'saved');
  await page.click('#navbtn'); await page.click('.sheet-item[data-act="history"]'); await page.click('.hrow .hist'); await page.waitForSelector('#scorecard');
  await page.click('#incl3'); await page.waitForTimeout(150); assert.strictEqual(await page.$('#rsoff'), null); assert.strictEqual(await page.textContent('#scorecard tr.sgtot td.sum.tot'), sg0, 'back in stats');
  await page.$eval('#scorecard', e => e.scrollIntoView({ block: 'center' })); await page.click('#incl3'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'nostats.png') });
  await b.close(); console.log('nostats ok');
})().catch(e => { console.error(e); process.exit(1); });
