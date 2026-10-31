const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn, execSync } = require('child_process'); const fs = require('fs');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8766/', OUT = process.env.SHOTS || '/tmp/pdf-v25';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (dist, loc, dir) => ({ dist, loc, dir: dir || '', pen: false });
    const pins = ['backleft', 'center', 'frontright', 'backleft', 'center', 'midleft'];
    const holes = [];
    for (let i = 0; i < 18; i++) {
      const p = [4, 3, 5][i % 3], pin = pins[i % 6];
      const rows = p === 3 ? [R(165 + i, 'tee', i % 2 ? 'short' : '')] : [R(390 + i, 'tee', i % 4 ? 'left' : ''), R(60 + i * 8, i % 4 ? 'rough' : 'fairway', i % 2 ? 'right' : '')];
      if (p === 5) rows.splice(1, 0, R(250, 'fairway'));
      if (i % 2) rows.push(R(12, ['bunker', 'rough', 'trees', 'deep', 'hazard'][(i >> 1) % 5], i % 6 === 1 ? 'short' : 'left'), R(6, 'green', 'left'), R(2, 'holed', 'right')); else rows.push(R(18, 'green', 'longleft'), R(3, 'holed', 'right'));
      holes.push({ par: p, pin, finished: true, rows });
    }
    localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rpdf', date: '2026-10-09T14:00:00.000Z', course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes }]));
  });
  await page.reload();
  await goHist(page); await page.click('#histlist [data-act="open"][data-id="rpdf"]');
  const lbls = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__golf.pinSVG(); return [...d.querySelectorAll('.pminilbl')].map(t => t.textContent); });
  assert.ok(lbls.length >= 3, lbls); lbls.forEach(t => assert.match(t, /^(\? )?[\d.]+ yd( ›)? (Bunker|Rough|Trees|Deep rough|Hazard|Fairway|Green)$|^OB$/, 'label ' + t));
  const geo = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__golf.pinSVG();
    return [...d.querySelectorAll('.pmini[data-gir="0"]')].map(c => ({ x: +c.getAttribute('cx'), y: +c.getAttribute('cy') })); });
  // every miss dot is in the rough: outside its cell's circle (r 40) and inside its cell
  geo.forEach(g => { const ci = Math.floor((g.x - 10) / 180), ri = Math.floor((g.y - 30) / 196), cx = 10 + ci * 180 + 90, cy = 30 + ri * 196 + 24 + 86;
    assert.ok(Math.hypot(g.x - cx, g.y - cy) > 44, 'miss in rough ' + JSON.stringify(g)); });
  console.log('pin labels', [...new Set(lbls)]);
  await page.click('[data-act="pdf"]'); await page.waitForSelector('#pdfname', { timeout: 120000 });
  assert.match(await page.textContent('#pdfname'), /Golf-Round-2026-10-09-Lakeridge-Scott\.pdf · \d+ pages/);
  await page.screenshot({ path: OUT + '/app-pdf-ready.png' });
  // share sheet call: files only, application/pdf, mail-safe name
  const shared = await page.evaluate(async () => { let got = null; const os = navigator.share, oc = navigator.canShare;
    navigator.canShare = () => true; navigator.share = d => { got = { keys: Object.keys(d), n: d.files.length, type: d.files[0].type, name: d.files[0].name, size: d.files[0].size }; return Promise.resolve(); };
    document.querySelector('[data-act="pdfshare"]').click(); await new Promise(r => setTimeout(r, 300)); navigator.share = os; navigator.canShare = oc; return got; });
  assert.deepStrictEqual([shared.keys, shared.n, shared.type, shared.name], [['files'], 1, 'application/pdf', 'Golf-Round-2026-10-09-Lakeridge-Scott.pdf']);
  assert.ok(shared.size < 1200000, 'size ' + shared.size); console.log('share payload', shared);
  await page.evaluate(() => { delete navigator.share; delete navigator.canShare; });
  const dl = page.waitForEvent('download'); await page.click('[data-act="pdfshare"]'); const d = await dl;
  assert.strictEqual(d.suggestedFilename(), 'Golf-Round-2026-10-09-Lakeridge-Scott.pdf');
  const f = OUT + '/report.pdf'; await d.saveAs(f);
  const info = execSync('pdfinfo ' + f).toString(); const pages = +/Pages:\s+(\d+)/.exec(info)[1];
  assert.ok(/Page size:\s+612 x 792/.test(info), info); const groups = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0], 'pga'); return SG.REPORT_GROUPS.filter(g => S.proxList.some(m => SG.reportGroup(m.from) === g.id)).map(g => g.name.replace('\u2013', '-')); });
  const pmg = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0], 'pga'); return SG.PMISS_GROUPS.filter(g => SG.pmissList(S.puttList).some(p => SG.pmissGroup(p.ft) === g.id)).map(g => g.name.replace('\u2013', '-')); });
  assert.ok(groups.length >= 2, groups); assert.ok(pmg.length >= 1, pmg); assert.strictEqual(pages, 9 + groups.length + pmg.length, info + groups + pmg); // v109: + the scorecard page
  const txt = execSync('pdftotext -layout ' + f + ' -').toString();
  ['Round report', 'Scott', 'Lakeridge', 'Quick view', 'Round stats', '1st putts made inside 10 ft', 'Lag putts (>10 ft)', 'Scorecard', 'Front 9', 'Back 9', 'Drive dist', 'Up & down', 'Sandies', 'Recovery', 'OTT', 'APP', 'ARG', 'Greens in regulation', 'By category', 'By distance', 'Avg to pin after', 'vs every baseline',
    'Tee shots - fairways', 'Approach misses', 'Pin location', 'Back left', 'Misses by direction', 'All approach groups this round', 'Misses by direction', 'Lie', 'Putting - 1st putts', 'Putting - 2nd putts', ].forEach(s => assert.ok(txt.includes(s), 'missing ' + s));
  // v111: page 1 Round stats rows – whole percent next to the fractions (Fairways, GIR, 1st putts made inside 10 ft, Lag putts) – v112: in brackets, e.g. 9 / 12 (75%); none on Pin location / Putts / Tee misses L / R
  { const p1 = execSync('pdftotext -f 1 -l 1 -layout ' + f + ' -').toString(), ln = k => (p1.split('\n').find(l => l.trim().startsWith(k)) || '').trim();
    const S1 = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0], 'pga'), PM = SG.pmissList(S.puttList), L = SG.lagStats(S.puttList); return { fw: [S.fwHit, S.fwTotal], gir: [S.gir, S.girHoles], pm: [PM.filter(p => p.made).length, PM.length], lag: [L.inside, L.attempts] }; });
    const pc = a => a[1] ? ' (' + Math.round(100 * a[0] / a[1]) + '%)' : '';
    assert.ok(ln('Fairways hit').endsWith(S1.fw.join(' / ') + pc(S1.fw)), ln('Fairways hit')); assert.ok(ln('Greens in regulation').endsWith(S1.gir.join(' / ') + pc(S1.gir)), ln('Greens in regulation'));
    assert.ok(ln('1st putts made inside 10 ft').endsWith(S1.pm.join('/') + pc(S1.pm)), ln('1st putts made inside 10 ft')); assert.ok(ln('Lag putts (>10 ft)').endsWith(S1.lag.join('/') + pc(S1.lag)), ln('Lag putts'));
    ['Pin location', 'Putts', 'Penalty strokes', 'Tee misses L / R', '3-putt holes'].forEach(k => assert.ok(ln(k) && !/%/.test(ln(k)), 'no percent: ' + ln(k))); }
  pmg.forEach(g => assert.ok(txt.includes('1st putts made inside 10 ft - ' + g), 'missing 1st-putts-made page ' + g)); assert.ok(txt.includes('1st putts made') || txt.includes('1ST PUTTS MADE')); assert.ok(txt.includes('Inside 3 ft') || txt.includes('INSIDE 3 FT'));
  groups.forEach(g => assert.ok(txt.includes('Proximity - ' + g), 'missing page ' + g)); assert.ok(txt.includes('Page ' + pages + ' of ' + pages));
  const absent = ['20-60 yd', '60-100 yd', '100-130 yd', '130-160 yd', '160-200 yd', '200+ yd'].filter(g => !groups.includes(g)); absent.forEach(g => assert.ok(!txt.includes('Proximity - ' + g), 'empty group page ' + g));
  console.log('groups', groups, 'skipped', absent);
  assert.ok(!txt.includes('Front left'), 'empty pin segments skipped');
  assert.ok(!/Missed greens/.test(txt), 'removed Missed greens rows stay out of the PDF');
  // v109: every page has the same player / course / date line and a page number
  const pagesTxt = txt.split('\f').filter(t => t.trim());
  pagesTxt.forEach((t, i) => { assert.ok(t.includes('Scott - Lakeridge - October 9, 2026') || /Scott . Lakeridge . October 9, 2026/.test(t), 'page header ' + (i + 1)); assert.ok(t.includes('Page ' + (i + 1) + ' of ' + pages), 'page number ' + (i + 1)); });
  // v109 alignment: header and number cells use the same column list -> same right edge (or left edge / centre); no text past the right margin
  const lay = await page.evaluate(() => { const o = window.__golf.lastPdf; return o.layout; });
  const over = lay.text.filter(t => t.x1 > lay.PW - lay.M + 0.5 || t.x0 < lay.M - 0.5); assert.deepStrictEqual(over, [], 'text outside the margins');
  assert.ok(lay.tables.length >= 8, 'tables ' + lay.tables.length); let checked = 0;
  lay.tables.forEach((tb, ti) => {
    assert.ok(tb.x >= lay.M - 0.01 && tb.x + tb.w <= lay.PW - lay.M + 0.01, 'table ' + ti + ' inside margins');
    tb.cols.forEach((c, j) => { const cells = tb.cells.filter(x => x.col === j); if (!cells.length) return;
      const key = c.align === 'right' ? x => x.x1 : c.align === 'center' ? x => (x.x0 + x.x1) / 2 : x => x.x0;
      cells.forEach(x => { assert.ok(Math.abs(key(x) - c.at) < 0.01, 'table ' + ti + ' col ' + j + ' cell off its column edge'); assert.ok(x.x0 >= c.x - 0.01 && x.x1 <= c.x + c.w + 0.01, 'table ' + ti + ' col ' + j + ' cell wider than column'); });
      if (cells.some(x => x.row === 0) && cells.some(x => x.row === 1)) checked++; });
  });
  assert.ok(checked >= 30, 'header/number columns checked ' + checked);
  // the strokes gained tables: number columns right-aligned with their header
  const sgTabs = lay.tables.filter(tb => tb.p === 3);
  assert.ok(sgTabs.length === 3, 'SG page tables ' + sgTabs.length);
  assert.deepStrictEqual(sgTabs.map(tb => tb.cols.map(c => c.align)), [['left', 'right', 'right'], ['left', 'right', 'right', 'right'], ['left', 'right', 'right', 'right', 'right', 'right']]);
  // v109: the PDF scorecard shows exactly what the on-screen scorecard shows (same scorecardData)
  const pdfCard = await page.evaluate(() => window.__golf.lastPdf.scorecard);
  const screenCard = await page.evaluate(() => { let d = document.querySelector('#scorecard') ? document : null; if (!d) { d = document.createElement('div'); d.innerHTML = window.__golf.scorecardHTML(); }
    return [...d.querySelectorAll('#scorecard tr:not(.scgap)')].map(tr => [...tr.children].map(c => c.querySelector('svg.yes') ? 'Y' : c.querySelector('svg.no') ? 'N' : c.textContent.trim())); });
  assert.strictEqual(pdfCard.length, 19); assert.strictEqual(pdfCard[0].length, 1 + 18 + 3);
  assert.deepStrictEqual(pdfCard, screenCard, 'PDF scorecard = screen scorecard');
  ['Hole', 'Par', 'Length', 'Score', 'Tot', 'OTT', 'APP', 'ARG', 'Putt', 'Putts', 'GIR', 'Club', 'FIR', 'Drive dist', '1st putt', 'Last putt', 'Up & down', 'Sandies', 'Recovery'].forEach((l, i) => assert.strictEqual(pdfCard[i][0], l));
  console.log('aligned columns checked', checked, 'tables', lay.tables.length, 'scorecard rows', pdfCard.length);
  execSync(`pdftoppm -png -r 80 ${f} ${OUT}/page`);
  assert.deepStrictEqual(errors, []);
  console.log('PDF OK', pages, 'pages'); await browser.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
