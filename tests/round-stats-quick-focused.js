// v96 Round stats page: the Score · To par · Yards · Putts box sits on top (no big "78 / +6 vs par · 18 holes done" header,
// no TOTAL / Par columns), a Quick view of Fairways % / GIR % / Putts with their strokes gained, the detailed stat tiles
// collapsed (tap a header to open), a smaller, lighter scorecard legend and no "Blank = hole not finished" note.
// Quick view SG: Fairways → Off the tee, GIR → Approach, Putts → Putting.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const fs = require('fs'); const ARC = fs.readFileSync(__dirname + '/fixtures/arcade-78.js', 'utf8');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8833, BASE = 'http://127.0.0.1:' + PORT + '/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(src => { const m = {}; new Function('module', src)(m); window.__arc = m; }, ARC);
  await page.evaluate(() => { const r = window.__arc.exports.round(); localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); });
  await page.reload();
  if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="history"]');
  await page.click('#histlist [data-act="open"][data-id="arc78"]'); await page.waitForSelector('#rs-top');
  const exp = await page.evaluate(() => { const r = window.__golf.rounds()[0], S = SG.summarize(r);
    return { strokes: S.strokes, toPar: S.toPar, putts: S.putts, fw: [S.fwHit, S.fwTotal], gir: [S.gir, S.girHoles], tee: S.cats.tee.sg, appr: S.cats.approach.sg, putt: S.cats.putting.sg }; });
  assert.deepStrictEqual([exp.strokes, exp.toPar, exp.putts], [78, 6, 31], 'sample = the 78 at Arcade Creek');
  // ---- top box: Score, To par, Yards, Putts – no Total / Par columns, nothing above it but the title bar
  const top = await page.evaluate(() => { const t = document.getElementById('rs-top');
    return { th: [...t.querySelectorAll('th')].map(x => x.textContent), td: [...t.querySelectorAll('tr:nth-child(2) td')].map(x => x.textContent),
      prev: t.previousElementSibling.className, firstTable: document.querySelector('.roundpage table') === t, r: t.getBoundingClientRect().right }; });
  assert.deepStrictEqual(top.th, ['Score', 'To par', 'Yards', 'Putts']);
  assert.deepStrictEqual(top.td, ['78', '+6', '5531', '31'], 'completed round: no "thru" under the score');
  assert.ok(/topbar/.test(top.prev) && top.firstTable && top.r <= 390, JSON.stringify(top));
  assert.strictEqual(await page.$('.big-score'), null, 'big score header gone'); assert.strictEqual(await page.$('#card-total'), null, 'old TOTAL row gone');
  const txt = await page.evaluate(() => document.querySelector('.roundpage').innerText);
  assert.ok(!/vs par/i.test(txt) && !/holes? done/i.test(txt) && !/blank\s*=/i.test(txt) && !/\bTOTAL\b/.test(txt), 'no "vs par" / "holes done" / "Blank =" / TOTAL text');
  console.log('  top box: Score 78 · To par +6 · Yards 5531 · Putts 31');
  // ---- Quick view
  const qv = await page.$$eval('#quickview .qv', q => q.map(x => ({ id: x.dataset.q, l: x.querySelector('.qvl').textContent, v: x.querySelector('b').textContent, sg: x.querySelector('.qvsg').textContent, cls: x.querySelector('.qvsg').className })));
  const fmt = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); };
  const cls = v => v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : '';
  assert.deepStrictEqual(qv.map(q => [q.id, q.l, q.v]), [['fw', 'Fairways', Math.round(exp.fw[0] / exp.fw[1] * 100) + '%'], ['gir', 'GIR', Math.round(exp.gir[0] / exp.gir[1] * 100) + '%'], ['putts', 'Putts', '31']]);
  assert.deepStrictEqual(qv.map(q => q.sg.replace(/\s*SG$/, '')), [fmt(exp.tee), fmt(exp.appr), fmt(exp.putt)], 'SG: off the tee / approach / putting');
  assert.deepStrictEqual(qv.map(q => q.cls.replace('qvsg', '').trim()), [cls(exp.tee), cls(exp.appr), cls(exp.putt)]);
  const qvTop = await page.evaluate(() => document.getElementById('quickview').getBoundingClientRect().top - document.getElementById('rs-top').getBoundingClientRect().bottom);
  assert.ok(qvTop >= 0 && qvTop < 60, 'Quick view directly under the box ' + qvTop);
  console.log('  quick view: ' + qv.map(q => q.l + ' ' + q.v + ' (' + q.sg + ')').join(' · '));
  await page.screenshot({ path: OUT + 'round-stats-top.png' });
  // ---- legend smaller + lighter
  const lg = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('card-legend')); return { fs: parseFloat(c.fontSize), fw: +c.fontWeight, txt: document.getElementById('card-legend').textContent }; });
  assert.ok(lg.fs <= 12 && lg.fw <= 400, JSON.stringify(lg)); assert.ok(!/Blank/.test(lg.txt));
  await page.evaluate(() => window.scrollTo(0, document.getElementById('card-legend').getBoundingClientRect().bottom + window.scrollY - 560));
  await page.screenshot({ path: OUT + 'round-stats-legend.png' });
  console.log('  legend ' + lg.fs + 'px / weight ' + lg.fw + ', no "Blank =" note');
  // ---- detailed tiles collapsed by default, header keeps the headline number
  const heads = await page.$$eval('#stattiles .stxh', h => h.map(x => ({ v: x.dataset.v, l: x.querySelector('span').textContent, n: x.querySelector('b').textContent, ex: x.getAttribute('aria-expanded') })));
  assert.deepStrictEqual(heads.map(h => h.v), ['fw', 'gir', 'miss', 'prox', 'pin', 'putt', 'pmiss', 'lag', 'club', 'pen', 'teelr']);
  assert.ok(heads.every(h => h.ex === 'false'), 'all collapsed'); assert.strictEqual(await page.$$eval('#stattiles .stxb, #stattiles [data-act="map"]', x => x.length), 0, 'no bodies yet');
  const H = Object.fromEntries(heads.map(h => [h.v, h]));
  assert.strictEqual(H.fw.n, exp.fw.join(' / ')); assert.strictEqual(H.gir.n, exp.gir.join(' / ')); assert.strictEqual(H.putt.n, '31'); assert.strictEqual(H.fw.l, 'Fairways hit');
  // tap Greens in regulation → it opens (map button inside), the others stay shut; tap again → shut
  await page.click('[data-act="stx"][data-v="gir"]');
  assert.strictEqual(await page.getAttribute('[data-act="stx"][data-v="gir"]', 'aria-expanded'), 'true');
  assert.match(await page.textContent('[data-stx="gir"] .stxb [data-act="map"][data-v="gir"]'), /^7 \/ 18\s*Greens in reg/);
  assert.strictEqual(await page.$$eval('#stattiles .stxb', x => x.length), 1);
  await page.click('[data-act="stx"][data-v="pen"]'); assert.match(await page.textContent('[data-stx="pen"] .stxb'), /Penalty strokes/);
  await page.click('[data-act="stx"][data-v="pen"]'); assert.strictEqual(await page.$('[data-stx="pen"] .stxb'), null);
  // the map still opens from the expanded tile and the tile is still open when you come back
  await page.click('[data-act="map"][data-v="gir"]'); await page.waitForSelector('#mapview'); await page.click('[data-act="mapclose"]'); await page.waitForSelector('#mapview', { state: 'detached' });
  assert.ok(await page.$('[data-stx="gir"] .stxb [data-act="map"]'), 'still open after the map');
  await page.locator('#stattiles').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -40));
  await page.screenshot({ path: OUT + 'round-stats-tiles.png' });
  console.log('  12 detail tiles collapsed; GIR opens on tap, map works, Penalty toggles');
  // ---- unfinished round: "thru N" under the score
  await page.evaluate(() => { const r = window.__golf.rounds()[0]; r.holes[17].finished = false; r.holes[16].finished = false; r.id = 'arc16';
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); });
  await page.reload(); if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="history"]');
  await page.click('#histlist [data-act="open"][data-id="arc16"]'); await page.waitForSelector('#rs-top');
  assert.match(await page.textContent('#rs-score'), /^\d+thru 16$/); assert.ok(!/vs par|holes? done/i.test(await page.evaluate(() => document.querySelector('.roundpage').innerText)));
  assert.strictEqual(await page.$$eval('#stattiles .stxb', x => x.length), 0, 'a different round starts collapsed again');
  console.log('  unfinished round shows "thru 16"');
  assert.deepStrictEqual(errors, []); console.log('ROUND STATS QUICK OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
