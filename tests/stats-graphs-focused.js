// v116 Stats graphs: one graph each for SG TOT / OTT / APP / ARG / PUTT, fairways %, GIR %, and scoring curves for par 3 / 4 / 5.
// Checks the par curves against a hand count of the raw saved holes (strokes = rows), Eagle-or-better / Triple-or-worse buckets,
// All rounds / Last 5 / Selected round, the round list, Compare to all rounds, rounds with no par 4s/5s, few / no rounds. Takes the v116 screenshots.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8866, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = process.env.SHOTS || '/workspace/golf-app/screenshots';
const SEED = fs.readFileSync(__dirname + '/fixtures/stats-graphs-rounds.js', 'utf8');
const NAMES = ['Eagle', 'Birdie', 'Par', 'Bogey', 'Double', 'Triple'];
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
  await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]'); await page.waitForSelector('#statspage');

  // hand count from the saved rounds: finished rounds only (every hole finished), strokes = rows, bucket = strokes - par clamped to Eagle..Triple
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')));
  const fin = raw.filter(r => r.player === 'Scott' && r.holes.every(h => h.finished)).sort((a, b) => a.date.localeCompare(b.date));
  assert.deepStrictEqual(fin.map(r => r.id), ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']);
  const count = (L, par) => { const c = [0, 0, 0, 0, 0, 0]; L.forEach(r => r.holes.forEach(h => { if (h.par === par) c[Math.max(0, Math.min(5, h.rows.length - par + 2))]++; })); return c; };
  const pcts = c => { const n = c.reduce((t, x) => t + x, 0); return c.map(x => Math.round(100 * x / n) + '%'); };
  const read = par => page.evaluate(p => ({ v: [...document.querySelectorAll('#par' + p + 'chart text.stval')].map(e => e.textContent),
    xn: [...document.querySelectorAll('#par' + p + 'chart text.stxn')].map(e => e.textContent), xs: [...document.querySelectorAll('#par' + p + 'chart text.stxs')].map(e => +e.textContent),
    n: (document.getElementById('par' + p + 'n') || {}).textContent, all: !!document.getElementById('par' + p + 'all'), none: !!document.getElementById('par' + p + 'none') }), par);
  // the planned extremes are in the fixture: an ace (par 3, 1 stroke), an albatross (par 5, 2), a quadruple (par 4, 8) and +5 on a par 3 (8)
  const strokes = fin.flatMap(r => r.holes.map(h => [h.par, h.rows.length]));
  assert.ok(strokes.some(([p, s]) => p === 3 && s === 1) && strokes.some(([p, s]) => p === 5 && s === 2) && strokes.some(([p, s]) => p === 4 && s === 8) && strokes.some(([p, s]) => p === 3 && s === 8));

  // 1. All rounds: par 3 / 4 / 5 curves = hand count; x axis par-2 .. par+3; clamped buckets; n
  for (const par of [3, 4, 5]) {
    const R = await read(par), c = count(fin, par), n = c.reduce((t, x) => t + x, 0);
    assert.deepStrictEqual(R.v, pcts(c), 'par ' + par + ' % = hand count'); assert.deepStrictEqual(R.xn, NAMES);
    assert.deepStrictEqual(R.xs, [par - 2, par - 1, par, par + 1, par + 2, par + 3], 'x axis strokes');
    assert.strictEqual(R.n, 'n = ' + n + ' holes'); assert.strictEqual(R.all, false);
  }
  assert.deepStrictEqual(count(fin, 5)[0], 2, 'albatross counted with the eagle'); assert.strictEqual(count(fin, 4)[5], 2, 'quadruple counted with the triple');
  assert.match(await page.textContent('#st-par5 .stnote'), /Eagle includes anything better.*Triple includes anything worse/);
  // the smooth curve never dips below 0% (all y on or above the 0% line)
  for (const par of [3, 4, 5]) { const base = await page.$eval('#par' + par + 'chart line.stgrid', e => +e.getAttribute('y1'));
    const ys = await page.$eval('#par' + par + 'line', e => e.getAttribute('d').replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number).filter((_, i) => i % 2));
    assert.ok(ys.every(y => y <= base + 0.05), 'par ' + par + ' curve stays at or above 0%'); }
  // average strokes on each par
  const avgPar = (L, par) => { const s = L.flatMap(r => r.holes.filter(h => h.par === par).map(h => h.rows.length)); return (s.reduce((t, x) => t + x, 0) / s.length).toFixed(2); };
  assert.strictEqual(await page.textContent('#par4val'), 'avg ' + avgPar(fin, 4));

  // 2. SG graphs (TOT OTT APP ARG PUTT) + fairways + GIR: one dot per round; g4 (all par 3s) has no fairway point
  const D = await page.evaluate(() => window.__golf.statsData());
  for (const k of ['tot', 'app', 'arg', 'putt', 'gir']) assert.strictEqual(await page.$$eval('#' + k + 'chart circle.stdot', e => e.length), 6, k);
  for (const k of ['ott', 'fir']) assert.strictEqual(await page.$$eval('#' + k + 'chart circle.stdot', e => e.length), 5, 'no ' + k + ' point for the par-3 course');
  assert.strictEqual(D.all[3].fir, null); assert.strictEqual(D.all[3].sg.ott, null, 'no tee shots on par 4/5 -> no OTT number (not 0)');
  // SG per round = that round's own scorecard numbers (statsRound), the header average = mean of them
  for (const id of ['g1', 'g4', 'g6']) { const a = await page.evaluate(i => window.__golf.statsRound(i), id), b = D.all.find(p => p.id === id); assert.deepStrictEqual(a.sg, b.sg, id); }
  const fmtSG = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); };
  const mean = a => a.reduce((t, x) => t + x, 0) / a.length;
  for (const k of ['tot', 'ott', 'app', 'arg', 'putt']) assert.strictEqual(await page.textContent('#' + k + 'val'), 'Avg ' + fmtSG(mean(D.all.map(p => p.sg[k]).filter(v => v != null))), k);
  assert.strictEqual(await page.textContent('#firval'), 'Avg ' + Math.round(mean(D.all.filter(p => p.fir != null).map(p => p.fir))) + '%');
  // average line sits at the average
  await shot('stats-v116-top.png');
  await shot('stats-v116-sg.png', '#st-ott', 104);
  await shot('stats-v116-par.png', '#st-par3', 104);

  // 3. Last 5: curves and graphs follow the 5 newest rounds
  await page.click('#strange [data-v="5"]'); const last5 = fin.slice(-5);
  for (const par of [3, 4, 5]) { const R = await read(par); assert.deepStrictEqual(R.v, pcts(count(last5, par)), 'last 5 par ' + par); }
  assert.strictEqual(await page.$$eval('#totchart circle.stdot', e => e.length), 5);
  assert.match(await page.textContent('#totval'), /^Last 5 avg /);
  // compare on: all rounds overlaid in grey (dashed curve, older rounds light, all-rounds average line); n for both
  await page.click('#stcmp'); assert.strictEqual(await page.getAttribute('#stcmp', 'aria-pressed'), 'true');
  for (const par of [3, 4, 5]) { const R = await read(par), cAll = count(fin, par);
    assert.ok(R.all, 'compare curve par ' + par); assert.strictEqual(R.n, 'n = ' + count(last5, par).reduce((t, x) => t + x, 0) + ' holes · all rounds: ' + cAll.reduce((t, x) => t + x, 0) + ' holes (grey dashed)');
    assert.strictEqual(await page.$$eval('#par' + par + 'chart circle.stcmpdot', e => e.length), 6); }
  assert.strictEqual(await page.$$eval('#totchart circle.stdot', e => e.length), 6, 'all rounds on the x axis');
  assert.strictEqual(await page.$$eval('#totchart circle.stdot.stlight', e => e.length), 1, 'the older round is light');
  assert.ok(await page.$('#totallavg') && await page.$('#totavg') && await page.$('#totlight'));
  assert.match(await page.textContent('#totval'), /^Last 5 avg \S+ · all \S+$/);
  assert.match(await page.textContent('#par4val'), new RegExp('^avg ' + avgPar(last5, 4) + ' · all ' + avgPar(fin, 4) + '$'));

  // 4. Selected round: scrolling list of every finished round, newest first, newest picked; compare stays on
  await page.click('#strange [data-v="sel"]');
  assert.deepStrictEqual(await page.$$eval('#strounds .stri', e => e.map(x => x.dataset.id)), ['g6', 'g5', 'g4', 'g3', 'g2', 'g1']);
  assert.deepStrictEqual(await page.$$eval('#strounds .stri.sel', e => e.map(x => [x.dataset.id, x.getAttribute('aria-selected')])), [['g6', 'true']]);
  assert.match(await page.textContent('#strounds .stri.sel'), /Oct 10, 2026\s*Lakeridge\s*78 \(\+6\)/);
  assert.match(await page.textContent('#stshown'), /^Oct 10, 2026 · Lakeridge · 78 \(\+6\)$/);
  const g6 = D.all[5];
  assert.strictEqual(await page.textContent('#totval'), 'This round ' + fmtSG(g6.sg.tot) + ' · all avg ' + fmtSG(mean(D.all.map(p => p.sg.tot))));
  assert.ok(await page.$('#tothl') && await page.$('#totallavg')); assert.strictEqual(await page.$('#totavg'), null);
  for (const par of [3, 4, 5]) { const R = await read(par); assert.deepStrictEqual(R.v, pcts(count([fin[5]], par))); assert.ok(R.all); }
  assert.deepStrictEqual(await page.$$eval('#sttable thead th', e => e.map(x => x.textContent)), ['', 'This round', 'All rounds']);
  assert.strictEqual(await page.$eval('#sttable tr[data-k="Score"] td.num', e => e.textContent), '78.0');
  // list is a short scrolling box; tap targets at least 36 px
  const box = await page.$eval('#strounds', e => ({ h: e.clientHeight, sh: e.scrollHeight, items: [...e.children].map(c => c.getBoundingClientRect().height) }));
  assert.ok(box.h <= 200 && box.sh > box.h, 'scrolls'); assert.ok(box.items.every(h => h >= 36), 'tap targets');
  await shot('stats-v116-selected-compare.png');
  // pick the par-3 course from the list: no par 4 / 5 holes -> friendly message; no fairways number
  await page.click('#strounds [data-id="g4"]');
  assert.strictEqual(await page.getAttribute('#strounds .stri.sel', 'data-id'), 'g4');
  const R3 = await read(3); assert.deepStrictEqual(R3.v, pcts(count([fin[3]], 3))); assert.strictEqual(R3.n.split(' · ')[0], 'n = 9 holes');
  assert.match(await page.textContent('#par4none'), /No par 4 holes in this round yet/); assert.ok(await page.$('#par5none'));
  assert.match(await page.textContent('#firval'), /^This round – · all avg \d+%$/); assert.match(await page.textContent('#ottval'), /^This round – · all avg -?\+?\d/);
  // the list keeps the picked round in view after re-render
  const vis = await page.$eval('#strounds', L => { const s = L.querySelector('.sel'); return s.offsetTop >= L.scrollTop - 1 && s.offsetTop + s.offsetHeight <= L.scrollTop + L.clientHeight + 1; }); assert.ok(vis);
  // tapping a grey point on a graph picks that round
  await page.click('#puttchart .sthit[data-id="g2"]'); assert.strictEqual(await page.getAttribute('#strounds .stri.sel', 'data-id'), 'g2');
  // compare off -> no grey overlay
  await page.click('#stcmp'); assert.strictEqual(await page.$('#par4all'), null); assert.strictEqual(await page.$('#totallavg'), null);
  assert.deepStrictEqual(await page.$$eval('#sttable thead th', e => e.map(x => x.textContent)), ['', 'This round']);
  // All rounds hides the compare switch
  await page.click('#strange [data-v="all"]'); assert.strictEqual(await page.$('#stcmp'), null); assert.strictEqual(await page.$('#strounds'), null);

  // 5. readable at 390 and 375 px: nothing wider than the screen
  for (const w of [390, 375]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at ' + w); }
  await page.setViewportSize({ width: 390, height: 844 });
  // light type only
  const heavy = await page.evaluate(() => [...document.querySelectorAll('#statspage *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && +getComputedStyle(e).fontWeight > 500 && !e.closest('.topbar') && e.tagName !== 'title').map(e => e.tagName + '.' + (e.getAttribute('class') || '')));
  assert.deepStrictEqual(heavy, [], 'light fonts only');
  const big = await page.evaluate(() => [...document.querySelectorAll('#statspage *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) > 16 && !e.closest('.topbar') && e.tagName !== 'title').map(e => e.tagName + '.' + (e.getAttribute('class') || '') + ' ' + getComputedStyle(e).fontSize));
  assert.deepStrictEqual(big, [], 'small fonts only');

  // 6. one finished round -> page works, trends say not enough rounds; 0 finished -> message
  await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L.filter(r => r.id === 'g6' || r.id === 'g7'))); });
  await page.reload(); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]');
  assert.match(await page.textContent('#st-tot .stfew'), /Not enough rounds yet/); assert.deepStrictEqual((await read(4)).v, pcts(count([fin[5]], 4)));
  await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L.filter(r => r.id === 'g7'))); });
  await page.reload(); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]');
  assert.match(await page.textContent('#stnone'), /No finished rounds yet.*1 unfinished not shown/s); assert.strictEqual(await page.$('#strange'), null);

  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, [], 'no outside network calls');
  console.log('STATS GRAPHS OK'); await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
