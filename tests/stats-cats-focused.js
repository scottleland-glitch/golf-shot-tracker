// v125 Stats categories: collapsible Driver / Approach / Putting / Chipping / Scoring sections (all closed at first, open / closed kept while the page is open),
// the drive distance box chart, putting SG by first-putt distance, chipping SG by lie and by distance (per shot, a round with none is skipped),
// approach proximity, and the par 3 / 4 / 5 curves for the open round laid over all rounds. Takes the v125 screenshots.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8876, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = process.env.SHOTS || '/workspace/golf-app/screenshots';
const SEED = fs.readFileSync(__dirname + '/fixtures/stats-cats-rounds.js', 'utf8');
const CATS = ['driver', 'approach', 'putting', 'chipping', 'scoring'];
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', q => { const u = new URL(q.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(q.url())) outside.push(q.url()); });
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(SEED); await page.reload(); await page.waitForSelector('#plusbtn');
  const shot = async (n, el, off) => { if (el) await page.$eval(el, (e, o) => { window.scrollTo(0, 0); window.scrollTo(0, e.getBoundingClientRect().top - o); }, off == null ? 64 : off); else await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/' + n }); };
  const goStats = async () => { if (!(await page.$('#plusmenu'))) await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]'); await page.waitForSelector('#statspage'); };
  const state = () => page.$$eval('.stcat', e => e.map(s => [s.dataset.cat, s.querySelector('.stcath').getAttribute('aria-expanded'), s.querySelector('.stcatb').hidden]));
  const toggle = c => page.click('#stcat-' + c + ' .stcath');
  const fmtSG = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); };
  await goStats();

  // 1. five categories in order, all closed; a thin-bordered header row each with a chevron and a short summary
  assert.deepStrictEqual(await state(), CATS.map(c => [c, 'false', true]));
  assert.deepStrictEqual(await page.$$eval('.stcath b', e => e.map(x => x.textContent)), ['Driver', 'Approach', 'Putting', 'Chipping', 'Scoring']);
  assert.match(await page.textContent('#stcatsum-driver'), /^OTT [+\-]?\d\.\d\d · FW \d+%$/);
  assert.match(await page.textContent('#stcatsum-putting'), /^PUTT [+\-]?\d\.\d\d$/);
  assert.ok(await page.$('#stcat-driver .stcatc'));
  const hb = await page.$eval('#stcat-driver', e => getComputedStyle(e).borderTopWidth); assert.strictEqual(hb, '1px');
  assert.ok((await page.$eval('#stcat-putting .stcath', e => e.getBoundingClientRect().height)) >= 40, 'tap target');
  assert.ok(await page.$('#sttable'), 'averages table still at the bottom');
  assert.ok(await page.$eval('#sttable', (t) => { const c = document.getElementById('stcats'); return !!(c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await shot('stats-cats-collapsed-v125.png');

  // 2. tap opens / tap again closes; open ones stay open across range changes; leaving the page closes them again
  await toggle('driver'); assert.deepStrictEqual((await state())[0], ['driver', 'true', false]); assert.ok(await page.isVisible('#drivechart'));
  await toggle('driver'); assert.deepStrictEqual((await state())[0], ['driver', 'false', true]);
  await toggle('putting'); await toggle('chipping'); await page.click('#strange [data-v="5"]');
  assert.deepStrictEqual((await state()).map(s => s[1]), ['false', 'false', 'true', 'true', 'false'], 'kept after Last 5');
  await page.click('#strange [data-v="all"]'); await toggle('chipping');
  await page.click('.topbar [data-act="home"]'); await goStats(); assert.deepStrictEqual((await state()).map(s => s[1]), ['false', 'false', 'false', 'false', 'false'], 'fresh visit starts closed');

  // hand counts from the saved rounds (finished rounds only) with the app's own sg.js helpers
  const H = await page.evaluate(() => { const L = window.__golf.rounds().filter(r => r.player === 'Scott' && r.id !== 'c7').sort((a, b) => a.date.localeCompare(b.date));
    return L.map(r => { const S = SG.summarize(r); return { id: r.id, b: SG.statBuckets(S), tee: S.teeMap.filter(m => !m.layup && m.kind !== 'ob' && !m.pen && m.hit > 0).map(m => [m.hit, m.club]) }; }); });
  assert.deepStrictEqual(H.map(h => h.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  const D = await page.evaluate(() => window.__golf.statsData());
  H.forEach((h, i) => assert.deepStrictEqual(D.all[i].b, h.b, 'buckets ' + h.id));
  const W = (grp, key, L) => { let n = 0, s = 0; L.forEach(h => { n += h.b[grp][key].n; s += h.b[grp][key].sg; }); return n ? s / n : null; };

  // 3. Driver: box chart of the Driver drives (most drives have a club), then OTT and fairways
  await toggle('driver');
  assert.deepStrictEqual(await page.$$eval('#stcatb-driver .stgraph', e => e.map(x => x.id)), ['st-drive', 'st-ott', 'st-fir']);
  const drv = H.flatMap(h => h.tee.filter(t => t[1] === 'Driver').map(t => t[0])).sort((a, b) => a - b);
  assert.ok(drv.length > 20 && drv.length < H.flatMap(h => h.tee).length, 'some 3-wood drives left out');
  assert.match(await page.textContent('#driven'), new RegExp('^n = ' + drv.length + ' · min ' + Math.round(drv[0]) + ' · median \\d+ · avg ' + Math.round(drv.reduce((t, x) => t + x, 0) / drv.length) + ' · max ' + Math.round(drv[drv.length - 1]) + ' yd'));
  assert.strictEqual(await page.textContent('#st-drive .sth span'), 'Driver distance');
  for (const k of ['wl', 'wr', 'box', 'med', 'mean']) assert.ok(await page.$('#stdrv' + k), k);
  assert.strictEqual(+(await page.getAttribute('#stdrvwl', 'data-v')), Math.round(drv[0])); assert.strictEqual(+(await page.getAttribute('#stdrvwr', 'data-v')), Math.round(drv[drv.length - 1]));
  assert.strictEqual(await page.$('#stdrvallbox'), null, 'no grey box without Compare');
  await shot('stats-driver-v125.png', '#stcat-driver', 100);

  // 4. Approach: APP, GIR and proximity (feet, lower is better)
  await toggle('approach');
  assert.deepStrictEqual(await page.$$eval('#stcatb-approach .stgraph', e => e.map(x => x.id)), ['st-app', 'st-gir', 'st-prox']);
  assert.match(await page.textContent('#proxval'), /^Avg \d+ ft$/); assert.strictEqual(await page.$('#proxzero'), null);

  // 5. Putting: PUTT, SG per hole by first-putt distance (weighted by putts), made % under 5 ft; c3 has no first putt over 25 ft -> no point
  await toggle('putting');
  assert.deepStrictEqual(await page.$$eval('#stcatb-putting .stgraph', e => e.map(x => x.id)), ['st-putt', 'st-ptu5', 'st-ptf5', 'st-ptf10', 'st-pto25', 'st-ptmade5']);
  for (const k of ['u5', 'f5', 'f10', 'o25']) {
    assert.strictEqual(await page.textContent('#pt' + k + 'val'), 'Avg ' + fmtSG(W('putt', k, H)), k);
    assert.strictEqual(await page.$$eval('#pt' + k + 'chart circle.stdot', e => e.length), k === 'o25' ? 5 : 6, k + ' dots');
    assert.match(await page.textContent('#pt' + k + 'n'), new RegExp('^n = ' + H.reduce((t, h) => t + h.b.putt[k].n, 0) + ' putts'));
  }
  const m5 = H.reduce((t, h) => t + h.b.putt.u5.made, 0), n5 = H.reduce((t, h) => t + h.b.putt.u5.n, 0);
  assert.strictEqual(await page.textContent('#ptmade5val'), 'Avg ' + Math.round(100 * m5 / n5) + '%');
  await shot('stats-putting-v125.png', '#stcat-putting', 100);

  // 6. Chipping: ARG, by lie (bunker / rough / fairway) and by distance (up to 10 / 10-20 / 20-30 yd); c3 has no bunker shot -> no point
  await toggle('chipping');
  assert.deepStrictEqual(await page.$$eval('#stcatb-chipping .stgraph', e => e.map(x => x.id)), ['st-arg', 'st-chsand', 'st-chrough', 'st-chfairway', 'st-chc10', 'st-chc20', 'st-chc30']);
  for (const [g, k] of [['chipLie', 'sand'], ['chipLie', 'rough'], ['chipLie', 'fairway'], ['chipDist', 'c10'], ['chipDist', 'c20'], ['chipDist', 'c30']]) {
    assert.strictEqual(await page.textContent('#ch' + k + 'val'), 'Avg ' + fmtSG(W(g, k, H)), k);
    assert.strictEqual(await page.$$eval('#ch' + k + 'chart circle.stdot', e => e.length), k === 'sand' ? 5 : 6, k + ' dots');
  }
  const sandX = await page.$$eval('#chsandchart circle.stdot', e => e.map(x => +x.getAttribute('cx'))), argX = await page.$$eval('#argchart circle.stdot', e => e.map(x => +x.getAttribute('cx')));
  assert.deepStrictEqual(sandX, argX.filter((_, i) => i !== 2), 'the round with no bunker shot is skipped, the others keep their place');
  assert.match(await page.textContent('#st-chsand .stnote'), /off the green from 30 yd and in – the same shots as the ARG total/);
  assert.doesNotMatch(await page.textContent('#stcatb-chipping'), /ARG ends at 20|count as Approach/, 'one 30-yd cutoff (v125): no 20 yd note');
  // the distance bands are exactly the ARG shots: per round, n and SG add up to the round's ARG
  for (const p of D.all) { const n = ['c10', 'c20', 'c30'].reduce((t, k) => t + p.b.chipDist[k].n, 0), g = ['c10', 'c20', 'c30'].reduce((t, k) => t + p.b.chipDist[k].sg, 0);
    const S = await page.evaluate(id => { const C = SG.summarize(window.__golf.rounds().find(r => r.id === id)).cats.short; return [C.n, C.sg]; }, p.id);
    assert.strictEqual(n, S[0], p.id + ' ARG shots'); assert.ok(Math.abs(g - S[1]) < 1e-9 && Math.abs(p.sg.arg - S[1]) < 1e-9, p.id + ' ARG SG'); }
  await shot('stats-chipping-v125.png', '#stcat-chipping', 100);
  await toggle('driver'); await toggle('approach'); await toggle('putting'); await toggle('chipping');

  // 7. Scoring: TOT and the par curves; a one-tap "open round vs all rounds"
  await toggle('scoring');
  assert.deepStrictEqual(await page.$$eval('#stcatb-scoring .stgraph', e => e.map(x => x.id)), ['st-tot', 'st-par3', 'st-par4', 'st-par5']);
  assert.match(await page.textContent('#stparcur'), /^Round in progress \(10\/31\) vs all rounds$/); assert.ok(await page.$('#stparhint'));
  await shot('stats-scoring-v125.png', '#stcat-scoring', 100);
  await page.click('#stparcur');
  assert.deepStrictEqual(await page.$$eval('#strange button[aria-pressed="true"]', e => e.map(x => x.dataset.v)), ['sel']);
  assert.strictEqual(await page.getAttribute('#stcmp', 'aria-pressed'), 'true'); assert.strictEqual(await page.getAttribute('#stcmp2', 'aria-pressed'), 'true');
  assert.strictEqual(await page.$('#stparcur'), null);
  assert.strictEqual((await state())[4][1], 'true', 'Scoring stays open');
  assert.match(await page.textContent('#stparleg'), /This round\s*All rounds/);
  // the open round is first in the chooser, marked, picked
  const first = await page.$eval('#strounds .stri', e => [e.dataset.id, e.classList.contains('sel'), e.textContent]);
  assert.strictEqual(first[0], 'c7'); assert.ok(first[1]); assert.match(first[2], /^Open now/); assert.match(first[2], /11 holes/);
  assert.match(await page.textContent('#stshown'), /Wolf Run · \d+ \([+\-E\d]+\) · 11 holes so far$/);
  // par curves: this round (solid, n = its finished holes) over all rounds (grey dashed)
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')).find(r => r.id === 'c7'));
  for (const par of [3, 4, 5]) { const n = raw.holes.filter(h => h.finished && h.par === par).length;
    assert.ok(await page.$('#par' + par + 'all') && await page.$('#par' + par + 'line'));
    assert.strictEqual(await page.textContent('#par' + par + 'n'), 'n = ' + n + ' holes · all rounds: ' + (par === 4 ? 60 : 24) + ' holes (grey dashed)'); }
  // the trend graphs add the open round as the last point, highlighted
  assert.strictEqual(await page.$$eval('#totchart circle.stdot', e => e.length), 7); assert.ok(await page.$('#tothl'));
  await shot('stats-par-compare-v125.png', '#stparbar', 120);
  // second compare switch next to the par graphs turns the overlay off; the legend goes with it
  await page.click('#stcmp2'); assert.strictEqual(await page.$('#par4all'), null); assert.strictEqual(await page.$('#stparleg'), null);
  assert.ok(await page.$('#stparcur'), 'one tap brings it back'); await page.click('#stparcur'); assert.ok(await page.$('#par4all'));
  // picking a finished round still works; the drive chart gets a grey all-rounds box with Compare
  await page.click('#strounds [data-id="c4"]'); assert.strictEqual(await page.getAttribute('#strounds .stri.sel', 'data-id'), 'c4');
  await toggle('driver'); assert.ok(await page.$('#stdrvallbox')); assert.match(await page.textContent('#driven'), /All rounds: n = \d+/);

  // 8. 390 / 375 px: nothing wider than the screen; type stays light and small
  for (const w of [390, 375]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at ' + w); }
  await page.setViewportSize({ width: 390, height: 844 });
  const heavy = await page.evaluate(() => [...document.querySelectorAll('#statspage *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && +getComputedStyle(e).fontWeight > 500 && !e.closest('.topbar') && e.tagName !== 'title').map(e => e.tagName + '.' + e.className));
  assert.deepStrictEqual(heavy, []);

  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, [], 'no outside network calls');
  console.log('STATS CATS OK'); await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
