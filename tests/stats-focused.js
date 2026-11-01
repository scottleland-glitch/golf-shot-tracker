// v110/v116 Stats page (+ menu › Stats): trends over time for the chosen player's finished rounds.
// Checks the chart + table numbers equal what each round's own Round stats page shows, separate graphs, All / Last 5 / Selected round, compare, player chips, 0/1 rounds.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8846, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = process.env.SHOTS || '/workspace/golf-app/screenshots';
const SEED = fs.readFileSync(__dirname + '/fixtures/stats-rounds.js', 'utf8');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', q => { const u = new URL(q.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(q.url())) outside.push(q.url()); });
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(SEED); await page.reload(); await page.waitForSelector('#plusbtn');
  const shot = async (n, el) => { if (el) await page.$eval(el, e => { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -96); }); await page.waitForTimeout(150); await page.screenshot({ path: OUT + '/' + n }); };

  // 1. + menu: New round · Rounds · Stats · My Bag · Settings
  await page.click('#plusbtn'); await page.waitForSelector('#plusmenu');
  assert.deepStrictEqual(await page.$$eval('#plusmenu button', e => e.map(x => [x.textContent, x.dataset.act])), [['New round', 'newform'], ['Rounds', 'history'], ['Stats', 'stats'], ['My Bag', 'bag'], ['Settings', 'archive']]);
  await shot('menu-stats.png');

  // 2. per-round numbers read off each round's own Round stats page (finished rounds of Scott, oldest first)
  const ids = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'], screen = {};
  for (const id of ids) {
    await page.evaluate(() => { document.querySelector('[data-act="menuclose"]') && document.querySelector('[data-act="menuclose"]').click(); });
    await page.evaluate(() => window.scrollTo(0, 0)); if (!(await page.$('#histlist'))) { if (!(await page.$('#plusmenu'))) await page.click('#plusbtn'); await page.click('#plusmenu [data-act="history"]'); }
    await page.click('#histlist [data-act="open"][data-id="' + id + '"]'); await page.waitForSelector('#scorecard');
    screen[id] = await page.evaluate(() => {
      const t = s => document.querySelector(s).textContent.trim(), tot = c => t('#scorecard tr.' + c + ' td.sum.tot');
      const putts = [...document.querySelectorAll('#scorecard tr.sputts td:not(.sum)')].map(td => +td.textContent.trim());
      const qv = k => document.querySelector('.qv[data-q="' + k + '"] small').textContent.trim();
      return { score: +t('#rs-score'), toPar: t('#rs-topar'), putts: +t('#rs-putts'), sg: { tot: tot('sgtot'), ott: tot('sgott'), app: tot('sgapp'), arg: tot('sgarg'), putt: tot('sgputt') },
        fw: qv('fw'), gir: qv('gir'), two: putts.filter(p => p === 2).length, three: putts.filter(p => p >= 3).length };
    });
    await page.click('.topbar [data-act="history"]');
  }
  console.log('  read', ids.length, 'Round stats pages');

  // 3. open Stats from the + menu
  await page.click('.topbar [data-act="home"]'); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]'); await page.waitForSelector('#statspage');
  for (const c of ['driver', 'approach', 'putting', 'chipping', 'scoring']) await page.click('#stcat-' + c + ' .stcath'); // v125: open the categories
  assert.strictEqual(await page.$('#plusmenu'), null, 'menu closed');
  assert.match(await page.textContent('#statspage .topbar'), /‹ Home\s*Stats\s*Scott · 7 rounds/);
  assert.deepStrictEqual(await page.$$eval('#stchips button', e => e.map(x => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? '*' : ''))), ['All players', 'Quincy', 'Scott*'], 'defaults to this phone’s player');
  assert.match(await page.textContent('#stshown'), /^7 finished rounds · Aug 2, 2026 – Oct 18, 2026/); // the unfinished round u1 (12 of 18 holes) is left out
  const D = await page.evaluate(() => window.__golf.statsData());
  assert.deepStrictEqual(D.all.map(p => p.id), ids, 'finished rounds only, oldest first'); assert.strictEqual(D.unfinished, 1);
  const fmtSG = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); };
  const tp = n => n === 0 ? 'E' : n > 0 ? '+' + n : String(n), frac = s => { const m = /^(\d+) \/ (\d+)/.exec(s); return +m[2] ? 100 * m[1] / m[2] : null; };
  D.all.forEach(p => { const S = screen[p.id];
    assert.deepStrictEqual(Object.fromEntries(Object.entries(p.sg).map(([k, v]) => [k, fmtSG(v)])), S.sg, 'SG = scorecard TOT column ' + p.id);
    assert.deepStrictEqual([p.score, tp(p.toPar), p.putts, p.two, p.three], [S.score, S.toPar, S.putts, S.two, S.three], 'score / putts ' + p.id);
    assert.ok(Math.abs(p.fir - frac(S.fw)) < 1e-9 && Math.abs(p.gir - frac(S.gir)) < 1e-9, 'FIR / GIR = Quick view ' + p.id); });
  // putts made inside 10 ft, recounted here from the raw putt list (every putt starting 10 ft or closer)
  const p10 = await page.evaluate(() => window.__golf.rounds().filter(r => /^s/.test(r.id)).map(r => { const L = SG.summarize(r).puttList.filter(p => p.ft > 0 && p.ft <= 10); return [r.id, L.length, L.filter(p => p.made).length]; }));
  p10.forEach(([id, n, m]) => { const p = D.all.find(x => x.id === id); assert.deepStrictEqual([p.p10n, p.p10m], [n, m], 'p10 ' + id); assert.ok(n > 0 && Math.abs(p.p10 - 100 * m / n) < 1e-9); });
  // s2 uses its own saved baseline (D1 college women), like its Round stats page
  assert.strictEqual(D.all[1].bl, 'd1w');

  // 4. v116: one graph per number – TOT, OTT, APP, ARG, PUTT, then fairways and GIR; one dot per round, dashed average line
  assert.deepStrictEqual(await page.$$eval('#strange button', e => e.map(x => [x.dataset.v, x.textContent, x.getAttribute('aria-pressed')])), [['all', 'All rounds', 'true'], ['5', 'Last 5', 'false'], ['sel', 'Selected round', 'false']]);
  assert.deepStrictEqual((await page.$$eval('.stgraph .sth span:first-child', e => e.map(x => x.textContent))).slice(1),
    // v125: grouped in categories – Driver, Approach, Putting, Chipping, Scoring
    // (the first card is the drive box chart: 'Driver distance' or 'Drive distance', checked in stats-cats-focused)
    ['Off the tee (OTT)', 'Fairways hit', 'Approach (APP)', 'Greens in regulation (GIR)', 'Approach proximity', 'Putting (PUTT)', '1st putt under 5 ft', '1st putt 5–10 ft', '1st putt 10–25 ft', '1st putt over 25 ft',
      '1st putts made under 5 ft', 'Around the green (ARG)', 'From the bunker', 'From the rough', 'From the fairway', 'Up to 10 yd', '10–20 yd', '20–30 yd', 'Total (TOT)', 'Par 3 scores', 'Par 4 scores', 'Par 5 scores']);
  assert.strictEqual(await page.$('#stcmp'), null, 'no compare switch on All rounds');
  const dots = c => page.$$eval('#' + c + 'chart circle.stdot', e => e.length);
  for (const k of ['tot', 'ott', 'app', 'arg', 'putt', 'fir', 'gir']) { assert.strictEqual(await dots(k), 7, k); assert.ok(await page.$('#' + k + 'avg'), k + ' average line'); }
  assert.ok(await page.$('#totzero')); assert.strictEqual(await page.$('#firzero'), null);
  assert.ok((await page.$$eval('#totchart text.stx', e => e.length)) >= 3, 'date labels');
  assert.match(await page.textContent('#totval'), new RegExp('^Avg ' + fmtSG(D.all.reduce((t, p) => t + p.sg.tot, 0) / 7).replace('+', '\\+') + '$'));
  // the dots sit at the right height
  for (const k of ['tot', 'putt']) { const ys = await page.$$eval('#' + k + 'chart circle.stdot', e => e.map(x => +x.getAttribute('cy')));
    for (let i = 0; i < 6; i++) { const a = D.all[i].sg[k], b = D.all[i + 1].sg[k]; if (Math.abs(a - b) > 0.01) assert.strictEqual(ys[i] > ys[i + 1], a < b, k + ' dot heights follow the values'); } }
  // tap a round -> its date, course and value
  await page.click('#puttchart .sthit[data-i="3"]'); await page.waitForSelector('#putttip');
  const tip = await page.textContent('#putttip'); const r3 = D.all[3];
  assert.ok(tip.includes('Lakeridge') && tip.includes('2026') && tip.includes('Putting ' + fmtSG(r3.sg.putt)) && tip.includes('Score ' + r3.score), tip);
  await page.click('#putttip .sttipx'); assert.strictEqual(await page.$('#putttip'), null, 'tap again closes');

  // 5. percent graphs: 0-100%
  assert.deepStrictEqual(await page.$$eval('#firchart text.sty', e => e.map(x => x.textContent)), ['0%', '25%', '50%', '75%', '100%']);
  assert.match(await page.textContent('#st-fir .stnote'), /par 4s and 5s/);
  assert.match(await page.textContent('#girval'), /^Avg \d+%$/);

  // 6. table: Last 5 + All rounds = the averages of the per-round screen numbers
  const tbl = await page.$$eval('#sttable tr', e => e.map(tr => [...tr.children].map(c => c.textContent.trim())));
  assert.deepStrictEqual(tbl[0], ['', 'All rounds']);
  const row = k => tbl.find(r => r[0] === k);
  const mean = a => a.reduce((t, x) => t + x, 0) / a.length, last5 = ids.slice(2);
  const col = (f, fm) => [fm(mean(ids.map(id => f(screen[id]))))];
  const sgScreen = k => s => +s.sg[k];
  assert.deepStrictEqual(row('Rounds').slice(1), ['7']);
  assert.deepStrictEqual(row('Strokes gained – TOT').slice(1), col(sgScreen('tot'), fmtSG));
  assert.deepStrictEqual(row('Off the tee (OTT)').slice(1), col(sgScreen('ott'), fmtSG));
  assert.deepStrictEqual(row('Around the green (ARG)').slice(1), col(sgScreen('arg'), fmtSG));
  assert.deepStrictEqual(row('Approach (APP)').slice(1), col(sgScreen('app'), fmtSG));
  assert.deepStrictEqual(row('Putting (PUTT)').slice(1), col(sgScreen('putt'), fmtSG));
  assert.deepStrictEqual(row('Score').slice(1), col(s => s.score, v => v.toFixed(1)));
  assert.deepStrictEqual(row('Putts per round').slice(1), col(s => s.putts, v => v.toFixed(1)));
  assert.deepStrictEqual(row('Fairways hit').slice(1), col(s => frac(s.fw), v => Math.round(v) + '%'));
  assert.deepStrictEqual(row('GIR').slice(1), col(s => frac(s.gir), v => Math.round(v) + '%'));
  assert.deepStrictEqual(row('2-putts per round').slice(1), col(s => s.two, v => v.toFixed(1)));
  assert.deepStrictEqual(row('3-putts per round').slice(1), col(s => s.three, v => v.toFixed(1)));
  const p10m = p10.map(([id, n, m]) => [id, 100 * m / n]);
  assert.deepStrictEqual(row('Putts made inside 10 ft').slice(1), [Math.round(mean(p10m.map(x => x[1]))) + '%']);
  ['To par', 'Putts per GIR hole'].forEach(k => assert.ok(row(k), k));
  // Last 5 + compare -> two columns: Last 5 | All rounds
  await page.click('#strange [data-v="5"]'); await page.click('#stcmp');
  const tbl5 = await page.$$eval('#sttable tr', e => e.map(tr => [...tr.children].map(c => c.textContent.trim())));
  assert.deepStrictEqual(tbl5[0], ['', 'Last 5', 'All rounds']); const row5 = k => tbl5.find(r => r[0] === k);
  const col2 = (f, fm) => [fm(mean(last5.map(id => f(screen[id])))), fm(mean(ids.map(id => f(screen[id]))))];
  assert.deepStrictEqual(row5('Rounds').slice(1), ['5', '7']);
  assert.deepStrictEqual(row5('Strokes gained – TOT').slice(1), col2(sgScreen('tot'), fmtSG));
  assert.deepStrictEqual(row5('Score').slice(1), col2(s => s.score, v => v.toFixed(1)));
  assert.deepStrictEqual(row5('GIR').slice(1), col2(s => frac(s.gir), v => Math.round(v) + '%'));
  assert.deepStrictEqual(row5('3-putts per round').slice(1), col2(s => s.three, v => v.toFixed(1)));
  assert.deepStrictEqual(row5('Putts made inside 10 ft').slice(1), [Math.round(mean(p10m.filter(x => last5.includes(x[0])).map(x => x[1]))) + '%', Math.round(mean(p10m.map(x => x[1]))) + '%']);
  await page.click('#stcmp'); await page.click('#strange [data-v="all"]');


  // 7. Last 5 -> 5 dots per graph; Selected round -> list of every round, newest first, newest picked
  await page.click('#strange [data-v="5"]');
  for (const k of ['tot', 'ott', 'app', 'arg', 'putt', 'fir', 'gir']) assert.strictEqual(await dots(k), 5, k);
  assert.deepStrictEqual(await page.$$eval('#sttable thead th', e => e.map(x => x.textContent)), ['', 'Last 5']);
  assert.match(await page.textContent('#stshown'), /^Last 5 of 7 finished rounds · Aug 30, 2026/);
  await page.click('#strange [data-v="sel"]');
  assert.deepStrictEqual(await page.$$eval('#strounds .stri', e => e.map(x => x.dataset.id)), ids.slice().reverse());
  assert.strictEqual(await page.getAttribute('#strounds .stri.sel', 'data-id'), 's7');
  assert.deepStrictEqual(await page.$$eval('#sttable thead th', e => e.map(x => x.textContent)), ['', 'This round']);
  await page.click('#strange [data-v="all"]');

  // 8. one baseline for every round: recomputed, still equal to statsRound for that baseline
  await page.selectOption('#stbl', 'pga');
  const D2 = await page.evaluate(() => window.__golf.statsData()), s2 = await page.evaluate(() => window.__golf.statsRound('s2', 'pga'));
  assert.strictEqual(D2.all[1].bl, 'pga'); assert.strictEqual(D2.all[1].sg.tot, s2.sg.tot); assert.notStrictEqual(D2.all[1].sg.tot, D.all[1].sg.tot);
  assert.match(await page.textContent('#stsgnote'), /compared with PGA Tour/);
  await page.selectOption('#stbl', '');

  // 9. other player with one round -> page still works, trend graphs say not enough rounds; All players -> 8 finished rounds
  await page.click('#stchips [data-v="Quincy"]'); await page.waitForSelector('#statspage');
  assert.strictEqual(await page.$('#stnone'), null); assert.match(await page.textContent('#st-tot .stfew'), /Not enough rounds yet/);
  assert.strictEqual(await dots('tot'), 1);
  await page.click('#stchips [data-v=""]'); assert.match(await page.textContent('#stshown'), /^8 finished rounds/);
  // back to Home
  await page.click('#statspage .topbar [data-act="home"]'); await page.waitForSelector('#home');

  // 10. no rounds at all
  await page.evaluate(() => localStorage.setItem('golfsg.rounds.v1', '[]')); await page.reload(); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]');
  assert.match(await page.textContent('#stnone'), /No finished rounds yet/); assert.strictEqual(await page.$('#totchart'), null);

  // light type: no bold text on the page
  const heavy = await page.evaluate(() => [...document.querySelectorAll('#statspage *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && +getComputedStyle(e).fontWeight > 500 && !e.closest('.topbar')).map(e => e.className || e.tagName));
  assert.deepStrictEqual(heavy, [], 'light fonts only');
  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, [], 'no outside network calls');
  console.log('STATS OK'); await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
