// v126 Stats PDF: "Create PDF" on the Stats page makes a Letter PDF with everything on the page – header (player, range, baseline, date),
// the averages table, every graph of all 5 categories (open or closed on screen), the putt-miss grids for All and each distance band, and
// Scoring's par 3 / 4 / 5 curves with the LAST finished round solid over the grey dashed all-rounds curve (legend names the round).
// Clean page breaks (no graph cut by a page end), text inside the margins, share / download like the round report, no outside requests.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn, execSync } = require('child_process'); const fs = require('fs');
const PORT = 8878, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = process.env.SHOTS || '/workspace/golf-app/screenshots', TMP = '/tmp/stats-pdf-test';
const SEED = fs.readFileSync(__dirname + '/fixtures/putt-miss-rounds.js', 'utf8');
const CATS = ['driver', 'approach', 'putting', 'chipping', 'scoring'];
(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', q => { const u = new URL(q.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(q.url())) outside.push(q.url()); });
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(SEED); await page.reload(); await page.waitForSelector('#plusbtn');
  const goStats = async () => { if (!(await page.$('#plusmenu'))) await page.click('#plusbtn'); await page.click('#plusmenu [data-act="stats"]'); await page.waitForSelector('#statspage'); };
  const make = async () => { await page.click('#stpdf'); await page.waitForSelector('#pdfname'); return page.evaluate(async () => { const p = window.__golf.lastPdf;
    return { name: p.name, pages: p.pages, cats: p.cats, last: p.last, L: p.layout, b: Array.from(new Uint8Array(await p.blob.arrayBuffer())) }; }); };
  await goStats();

  // 1. the button: top right of the Stats page, plain words
  assert.strictEqual((await page.textContent('#stpdf')).trim(), 'Create PDF');
  const bb = await page.$eval('#stpdf', e => { const r = e.getBoundingClientRect(); return [r.right, r.top, r.height]; }); assert.ok(bb[0] <= 390 && bb[1] < 80 && bb[2] >= 36, bb);
  await page.screenshot({ path: OUT + '/stats-pdf-button-v127.png' });
  const before = await page.$$eval('.stcat', e => e.map(s => s.classList.contains('open')));

  // 2. All rounds PDF
  const R = await make();
  assert.match(R.name, /^Golf-Stats-\d{4}-\d\d-\d\d-All-rounds-Scott\.pdf$/);
  assert.strictEqual(await page.textContent('#pdfname'), R.name + ' · ' + R.pages + ' pages');
  assert.deepStrictEqual(await page.$$eval('.stcat', e => e.map(s => s.classList.contains('open'))), before, 'the page itself is unchanged (categories still as they were)');
  const f = TMP + '/stats.pdf'; fs.writeFileSync(f, Buffer.from(R.b));
  const info = execSync('pdfinfo ' + f).toString(); assert.ok(/Page size:\s+612 x 792/.test(info), info); assert.strictEqual(+/Pages:\s+(\d+)/.exec(info)[1], R.pages);
  // every graph on the page, in page order, plus the putt-miss grids for All + each band and the last-round par curves
  await page.click('[data-act="pdfclose"]'); for (const c of CATS) await page.click('#stcat-' + c + ' .stcath'); await page.click('#stpm .stsubh');
  const onPage = await page.$$eval('.stcat', e => e.map(s => ({ id: s.dataset.cat, items: [...s.querySelectorAll('.stcatb > .stcard.stgraph')].map(c => c.id) })));
  const D = await page.evaluate(() => { const D = window.__golf.statsData(), l = D.all[D.all.length - 1]; return { last: l.id, course: l.course, date: l.date, n: D.all.length, open: D.openP && D.openP.open ? D.openP.course : null }; });
  for (const c of onPage) {
    const got = R.cats.find(x => x.id === c.id).items.filter(i => i !== 'label' && i !== 'legend');
    let want = c.items.slice(); if (c.id === 'putting') want = want.concat(['st-pmall', 'st-pmu5', 'st-pmf5', 'st-pmf10', 'st-pmo25']);
    assert.deepStrictEqual(got, want, c.id);
  }
  assert.deepStrictEqual(R.cats.map(c => c.id), CATS); assert.strictEqual(R.last, D.last, 'the last round = the newest finished round');
  const txt = execSync('pdftotext -layout ' + f + ' -').toString(), flat = txt.replace(/\s+/g, ' ');
  const titles = await page.$$eval('.stcatb .stcard.stgraph .sth > span:first-child', e => e.map(x => x.textContent.replace(/[–—]/g, '-')));
  ['Summary', 'Scott - All rounds', 'Strokes gained compared with each round\'s own baseline', 'Averages per round', 'Strokes gained - TOT', 'Putts per round',
    'Driver', 'Approach', 'Putting', 'Chipping', 'Scoring', 'Putt misses · All distances', 'Putt misses · Under 5 ft', 'Putt misses · 5-10 ft', 'Putt misses · 10-25 ft', 'Putt misses · Over 25 ft',
    'Par 3 scores', 'Par 4 scores', 'Par 5 scores',
    'Page ' + R.pages + ' of ' + R.pages].concat(titles).forEach(s => assert.ok(flat.includes(s), 'missing in PDF: ' + s));
  assert.ok(!/LAST ROUND|grey dashed\)|this round \(dashed\)/i.test(flat), 'v137: Stats PDF scoring curves are all rounds only');
  // v127: avg 2nd putt in each putt-miss grid header + its count line, and the explanation (incl. the "Holes whose first putt was …" notes) still printed in the PDF
  const S2 = await page.evaluate(() => { const ids = window.__golf.statsData().shown.map(p => p.id), R = window.__golf.rounds().filter(r => ids.includes(r.id));
    return ['all', 'u5', 'f5', 'f10', 'o25'].map(b => { const s = window.SG.puttMissGrid([].concat(...R.map(r => window.SG.summarize(r).puttList)), b).second; return s.avg == null ? '-' : s.avg.toFixed(1) + ' ft'; }); });
  ['All distances', 'Under 5 ft', '5-10 ft', '10-25 ft', 'Over 25 ft'].forEach((b, i) => assert.ok(flat.includes('Putt misses · ' + b) && flat.includes('avg 2nd putt ' + S2[i]), 'PDF avg 2nd putt ' + b));
  assert.ok((flat.match(/avg 2nd putt /g) || []).length >= 14, 'header + count line on the 5 grids, count line on the 4 "1st putt" graphs');
  assert.ok(flat.includes('Holes whose first putt was under 5 ft') && flat.includes('Avg 2nd putt = average distance left for the next putt after a missed 1st putt'), 'explanations kept in the PDF');
  // 3. layout: Letter, text inside the margins, no graph or card crosses the page bottom, every page has the header + page number
  const L = R.L, out = L.text.filter(t => t.x0 < L.M - 0.5 || t.x1 > L.PW - L.M + 0.5); assert.deepStrictEqual(out, [], 'text outside the margins');
  assert.deepStrictEqual(L.images.filter(i => i.y1 > L.BOT || i.y0 < 60), [], 'no graph cut by a page break');
  assert.deepStrictEqual(L.cards.filter(c => c.y1 > L.BOT), []); assert.strictEqual(L.images.length, L.cards.length, 'every card has its graph');
  for (let p = 1; p <= R.pages; p++) for (const a of L.cards.filter(c => c.p === p)) for (const b of L.cards.filter(c => c.p === p && c !== a))
    assert.ok(a.y1 <= b.y0 || b.y1 <= a.y0 || a.x1 <= b.x0 || b.x1 <= a.x0, 'cards overlap on page ' + p + ': ' + a.id + ' / ' + b.id);
  const pagesTxt = txt.split('\f').slice(0, R.pages); assert.ok(!pagesTxt[0].trim(), 'page 1 = the cover picture');
  // v137: every category starts on a new page – no category shares a page with the one before
  { const firstPg = ['Driver', 'Approach', 'Putting', 'Chipping', 'Scoring'].map(h => pagesTxt.findIndex(t => new RegExp('\\n\\s*' + h + '\\s*\\n').test(t))); firstPg.forEach((p, k) => assert.ok(p > 1 && (!k || p > firstPg[k - 1]), 'category page ' + firstPg));
    firstPg.slice(1).forEach((p, k) => assert.ok(!new RegExp('\\n\\s*' + ['Driver', 'Approach', 'Putting', 'Chipping'][k] + '( \\(continued\\))?\\s*\\n').test(pagesTxt[p]), 'blended page ' + p)); }
  pagesTxt.forEach((t, i) => { if (!i) return; assert.ok(t.includes('Scott · Stats · All rounds'), 'header p' + (i + 1)); assert.ok(t.includes('Page ' + (i + 1) + ' of ' + R.pages)); });
  // headings never sit alone at a page bottom: a category heading is followed by a graph on the same page
  ['Driver', 'Approach', 'Putting', 'Chipping', 'Scoring'].forEach(h => { const pg = L.text.find(t => t.t === h); assert.ok(pg && L.cards.some(c => c.p === pg.p && c.y0 > pg.y), 'heading alone: ' + h); });

  // 4. share sheet (files only) and the download fallback, same as the round report
  await page.click('#stpdf'); await page.waitForSelector('#pdfname');
  const shared = await page.evaluate(async () => { let got = null; const os = navigator.share, oc = navigator.canShare;
    navigator.canShare = () => true; navigator.share = d => { got = { keys: Object.keys(d), n: d.files.length, type: d.files[0].type, name: d.files[0].name, size: d.files[0].size }; return Promise.resolve(); };
    document.querySelector('[data-act="pdfshare"]').click(); await new Promise(r => setTimeout(r, 300)); navigator.share = os; navigator.canShare = oc; return got; });
  assert.deepStrictEqual([shared.keys, shared.n, shared.type, shared.name], [['files'], 1, 'application/pdf', R.name]); assert.ok(shared.size < 4000000, 'size ' + shared.size);
  await page.evaluate(() => { delete navigator.share; delete navigator.canShare; });
  const dl = page.waitForEvent('download'); await page.click('[data-act="pdfshare"]'); const d = await dl; assert.strictEqual(d.suggestedFilename(), R.name);
  // the PDF pages as pictures (Scoring page = the last-round overlay)
  for (const old of fs.readdirSync(OUT).filter(n => /^stats-pdf-page\d+-v127\.png$/.test(n))) fs.unlinkSync(OUT + '/' + old);
  fs.readdirSync(TMP).filter(n => /^pg-\d+\.png$/.test(n)).forEach(n => fs.unlinkSync(TMP + '/' + n));
  execSync('pdftoppm -r 100 -png ' + f + ' ' + TMP + '/pg'); fs.readdirSync(TMP).filter(n => /^pg-\d+\.png$/.test(n)).forEach(n => fs.copyFileSync(TMP + '/' + n, OUT + '/stats-pdf-page' + (+/\d+/.exec(n)[0]) + '-v127.png'));
  // the page(s) with the putt-miss grids, on their own: stats-pdf-putt-misses-v127.png (+ -2, -3 … when the grids run over more pages)
  for (const old of fs.readdirSync(OUT).filter(n => /^stats-pdf-putt-misses(-\d+)?-v127\.png$/.test(n))) fs.unlinkSync(OUT + '/' + old);
  const pmPages = [...new Set(L.cards.filter(c => /^st-pm/.test(c.id)).map(c => c.p))]; assert.ok(pmPages.length >= 1);
  // v126 (Scott): plain white grid boxes – the putt-miss pages have no red shading and no purple (only the thin dark-red outline on the most common miss)
  // v129: the putting breakdown card + purple graphs now flow in front of the grids, so a grid page may also carry the last purple graph (ptmade5): check the pixels on the grid page without that graph
  const grids = pmPages.filter(p => !L.cards.some(c => c.p === p && /^st-pt/.test(c.id))); assert.ok(grids.length >= 1, 'a page with only putt-miss grids');
  for (const p of grids) { const ppm = execSync('pdftoppm -r 50 -f ' + p + ' -l ' + p + ' ' + f); const hdr = ppm.toString('latin1', 0, 30).split(/\s+/), w = +hdr[1], h = +hdr[2];
    const off = ppm.length - w * h * 3; let red = 0, purple = 0;
    for (let k = off; k < ppm.length; k += 3) { const r = ppm[k], g = ppm[k + 1], b = ppm[k + 2]; if (r > g + 80 && r > b + 80) red++; if (b > g + 40 && r > g + 20) purple++; }
    assert.ok(red / (w * h) < 0.004 && purple / (w * h) < 0.0005, 'page ' + p + ' red ' + red + ' purple ' + purple + ' of ' + w * h); }
  const pgFile = p => TMP + '/' + fs.readdirSync(TMP).find(n => new RegExp('^pg-0*' + p + '\\.png$').test(n)); // pdftoppm pads the number (pg-06) once there are 10+ pages
  pmPages.forEach((p, i) => fs.copyFileSync(pgFile(p), OUT + '/stats-pdf-putt-misses' + (i ? '-' + (i + 1) : '') + '-v127.png'));
  await page.click('[data-act="pdfclose"]'); assert.strictEqual(await page.$('#pdfsheet'), null);

  // 5. Last 5 + Compare and Selected round: name and header follow the range
  await page.click('#strange [data-v="5"]'); if (await page.getAttribute('#stcmp', 'aria-pressed') !== 'true') await page.click('#stcmp');
  const R5 = await make(); assert.match(R5.name, /^Golf-Stats-\d{4}-\d\d-\d\d-Last-5-Scott\.pdf$/);
  const t5 = execSync('pdftotext -layout - -', { input: Buffer.from(R5.b) }).toString().replace(/\s+/g, ' ');
  assert.ok(t5.includes('Scott - Last 5') && t5.includes('Compare to all rounds: on'), 'last 5 header');
  await page.click('[data-act="pdfclose"]'); await page.click('#strange [data-v="sel"]'); await page.click('#strounds [data-id="c4"]');
  const R1 = await make(); assert.match(R1.name, /^Golf-Stats-\d{4}-\d\d-\d\d-Round-.+-Scott\.pdf$/);
  assert.strictEqual(R1.last, D.last, 'Scoring overlay still uses the newest finished round');

  // 6. no finished rounds (only the round in progress): no button
  await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L.filter(r => r.id === 'c7'))); }); await page.reload(); await page.waitForSelector('#plusbtn'); await goStats();
  assert.strictEqual(await page.$('#stpdf'), null);

  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, [], 'no outside network calls');
  console.log('STATS PDF OK', R.name, R.pages + ' pages', 'putt-miss pages', JSON.stringify([...new Set(R.L.cards.filter(c => /^st-pm/.test(c.id)).map(c => c.p))]), 'last 5:', R5.pages, 'round:', R1.pages); await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
