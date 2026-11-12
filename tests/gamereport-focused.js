// v175 My Game report: "Make a game report" on My Game -> pick parts (coach = everything, recruiting = results only) -> a Letter PDF with
// a summary page, My Game, My Practice, the latest short game test (spiders, rows, up and down, way-off warnings) and the practice plan.
// Run: node tests/gamereport-focused.js  (SHOTS=<dir> for screenshots + page images). Port 8795.
const { chromium } = require('playwright-core'); const { spawn, execSync } = require('child_process'); const fs = require('fs'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), OUT = process.env.SHOTS || '/tmp/gamereport-test', PORT = 8795; fs.mkdirSync(OUT, { recursive: true });
const T = require(REPO + '/shortgame.js'), ARC = require(REPO + '/tests/fixtures/arcade-78.js');
function make(id, date, q) { const t = T.blank(id, date, 'Scott', 'd1w');
  T.STATIONS.forEach((st) => { t.shots[st.id] = st.shots.map((spec, i) => { const j = ((i * 7 + id.length * 3) % 5) - 2;
    if (st.kind === 'lag') return { ft: Math.max(0.5, q.lag + j * 0.6), dir: i % 3 ? 'short' : 'long' };
    if (st.kind === 'ladder') return { n: q.ladder + (i - 1) };
    if (st.kind === 'updown') return { n: q.ud };
    if (st.kind === 'compass') return q.miss.includes(spec.line + spec.dist) ? { made: false, miss: spec.line === 'up' || spec.line === 'down' ? 'long' : 'low' } : { made: true };
    if (st.kind === 'bunker') return st.id === 'bkLong' && i < q.over ? { res: 'over' } : { ft: Math.max(1, q.bk + j * 1.5) };
    if (st.kind === 'wedge') return { ft: Math.max(2, q.wedge * spec.dist / 60 + j * 2), dir: ['short', 'shortleft', 'long', 'left', ''][i % 5] };
    return { ft: Math.max(1, (st.id === 'flop' ? q.flop : q.chip) + j) }; }); });
  t.done = true; t.cond = { green: 'medium', wind: 'calm' }; return t; }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const now = Date.now(), day = 86400000, iso = (d) => new Date(now - d * day).toISOString();
  const tests = [make('t1', iso(90), { lag: 3.2, ladder: 8, ud: 6, miss: ['up9'], over: 0, bk: 9, wedge: 11, flop: 8, chip: 5 }), make('t2', iso(60), { lag: 3.5, ladder: 8, ud: 6, miss: ['br9'], over: 0, bk: 9, wedge: 11, flop: 8, chip: 5 }),
    make('t3', iso(30), { lag: 3.4, ladder: 8, ud: 7, miss: ['bl9'], over: 1, bk: 9, wedge: 11, flop: 8, chip: 5 }), make('t4', iso(2), { lag: 3.6, ladder: 7, ud: 4, miss: ['down5', 'down7', 'down9'], over: 2, bk: 10, wedge: 12, flop: 9, chip: 5 })];
  const rounds = [0, 1, 2, 3].map(i => Object.assign(ARC.round(), { id: 'r' + i, player: 'Scott', date: iso(5 + i * 9) }));
  const practice = [['chip', 30, 3], ['lag', 20, 4], ['drive', 45, 6], ['short', 15, 10]].map((x, i) => ({ id: 'p' + i, date: iso(x[2]), player: 'Scott', spoke: x[0], focus: '', min: x[1] }));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000); const errors = [], outside = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  page.on('request', q => { const u = new URL(q.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(q.url())) outside.push(q.url()); });
  await page.goto('http://127.0.0.1:' + PORT + '/?x=' + now);
  await page.evaluate(({ R, TS, PR }) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.sgtests.v1', JSON.stringify(TS)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(PR)); }, { R: rounds, TS: tests, PR: practice });
  await page.reload(); await page.waitForSelector('#plusbtn');
  // v178: no benchmark set yet – a red "!" on the Home card and beside My Game in the + menu, and a red card at the top of My Game
  assert.ok(await page.$('#mgcard .bangon'), 'Home card'); await page.click('#navbtn'); assert.ok(await page.$('.sheet-item.bangon[data-act="mygame"]'), '+ menu');
  await page.click('.sheet-item[data-act="mygame"]'); await page.waitForSelector('#mygame');
  assert.ok(await page.$('#mgblcard.unset #mgblok')); await page.screenshot({ path: OUT + '/gr-bench-unset.png' });
  const order = await page.$$eval('#mygame > *', e => e.map(x => x.id || x.className)); assert.ok(order.indexOf('mgblcard') < order.indexOf('mgperiod'), 'at the top');
  await page.click('#mgblok'); await page.waitForSelector('#mgblcard:not(.unset)'); assert.ok(!(await page.$('#mgblok')));
  // v177: My benchmark – one for the player, carried everywhere. Rounds are PGA Tour, so My Game starts there; switching offers to move every round too.
  assert.strictEqual(await page.$eval('#mgbl', e => e.value), 'pga'); assert.match(await page.textContent('.mgbl'), /My benchmark/);
  await page.selectOption('#mgbl', 'd1w'); await page.waitForFunction(() => document.querySelector('#mgbl').value === 'd1w');
  const st = await page.evaluate(() => ({ my: JSON.parse(localStorage.getItem('golfsg.mybench.v1')), bls: JSON.parse(localStorage.getItem('golfsg.rounds.v1')).map(r => r.baseline) }));
  assert.deepStrictEqual(st.my, { Scott: 'd1w' }); assert.deepStrictEqual([...new Set(st.bls)], ['d1w'], 'the rounds moved to D1 women too (confirm accepted)');
  await page.selectOption('#mgbl', 'pga'); await page.waitForFunction(() => document.querySelector('#mgbl').value === 'pga');

  await page.click('#mgrounds [data-v="r3"]'); await page.waitForSelector('#mgrounds [data-v="r3"][aria-pressed="true"]');
  assert.match(await page.textContent('#mygame .title span'), /3 rounds/); assert.match(await page.textContent('#mgcvt .mgeye'), /Last 3 rounds/);
  assert.match(await page.textContent('#mgcvt .mgcvth'), /cost you [\d.]+ strokes over the 3 rounds\./);
  await page.locator('#mgcvt').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + '/gr-cvt.png' });
  assert.match(await page.textContent('#mgcvt [data-k="putting"]'), /fine in both · test: downhill putts down on your usual|test below the benchmark/, 'putting gains on the course (+0.4); the test only notes the downhill slip');
  assert.ok((await page.$$('#mgcvt .cvtr')).length === 4);
  await page.click('#mgperiod [data-v="3m"]');
  // 1. the button and the sheet: coach preset ticks everything
  assert.strictEqual(await page.$('#grbtn'), null, 'v183: no report button on the page'); await page.click('#mgnav'); await page.click('#mgnavmenu [data-act="grep"]'); await page.waitForSelector('#grsheet');
  assert.deepStrictEqual(await page.$$eval('#grparts .grpart', e => e.map(b => b.getAttribute('aria-pressed'))), ['true', 'true', 'true', 'true']);
  await page.locator('#grsheet').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + '/gr-sheet.png' });
  const make1 = async () => { await page.click('#grgo'); await page.waitForSelector('#pdfname'); return page.evaluate(async () => { const p = window.__golf.lastPdf; return { name: p.name, pages: p.pages, L: p.layout, b: Array.from(new Uint8Array(await p.blob.arrayBuffer())) }; }); };
  const C = await make1();
  assert.match(C.name, /^Strokewise-Game-Report-Scott-\d{4}-\d\d-\d\d\.pdf$/);
  const f = OUT + '/game-report-coach.pdf'; fs.writeFileSync(f, Buffer.from(C.b));
  const info = execSync('pdfinfo ' + f).toString(); assert.ok(/Page size:\s+612 x 792/.test(info), info); assert.strictEqual(+/Pages:\s+(\d+)/.exec(info)[1], C.pages);
  const all = C.L.text.map(t => t.t).join('\n');
  for (const s of ['Game report', 'MY GAME', 'SHORT GAME TEST', 'PRACTICE PLAN', 'My Game - ', 'My Practice - ', 'Short game test - ', 'Practice plan', 'Up and down', 'Practice this month', 'Lag from 30 ft', 'THE COURSE VS THE TEST', '30 yd'])
    assert.ok(all.includes(s), 'coach report has ' + s);
  assert.match(all, /Downhill putts: 1 of 4 made/, 'the way-off warning is in the report'); assert.match(all, /Up and down 40% \(PGA Tour about 59%\)/, 'v177: the test is scored against the player\'s benchmark');
  const off = C.L.text.filter(t => t.x1 > C.L.PW - C.L.M + 1 || t.x0 < C.L.M - 1 || t.y > C.L.PH - 10); assert.deepStrictEqual(off, [], 'all text inside the margins');
  if (process.env.SHOTS) execSync('pdftoppm -r 60 -png ' + f + ' ' + OUT + '/gr-coach');
  await page.screenshot({ path: OUT + '/gr-ready.png' });
  // 2. recruiting: results only – no practice minutes, no plan
  await page.click('[data-act="pdfclose"]'); await page.click('#mgnav'); await page.click('#mgnavmenu [data-act="grep"]'); await page.click('#grprecruit');
  assert.deepStrictEqual(await page.$$eval('#grparts .grpart', e => e.map(b => b.getAttribute('aria-pressed'))), ['true', 'false', 'true', 'false']);
  const R = await make1(), rall = R.L.text.map(t => t.t).join('\n');
  assert.ok(R.pages < C.pages, 'shorter'); assert.ok(!rall.includes('My Practice') && !rall.includes('Practice plan') && !rall.includes('PRACTICE'), 'no practice in the recruiting copy');
  assert.ok(rall.includes('Short game test - ') && rall.includes('My Game - '));
  if (process.env.SHOTS) { fs.writeFileSync(OUT + '/game-report-recruit.pdf', Buffer.from(R.b)); }
  // 3. nothing ticked: a toast, no PDF
  await page.click('[data-act="pdfclose"]'); await page.click('#mgnav'); await page.click('#mgnavmenu [data-act="grep"]'); for (const k of ['game', 'practice', 'test', 'plan']) await page.click('[data-act="grpart"][data-v="' + k + '"]');
  await page.click('#grgo'); assert.ok(await page.$('#grsheet'), 'the sheet stays open');
  // v193 (Scott): My Game ☰ › Tests opens the last test; the test's ☰ has Tests, Make PDF, Trend
  await page.evaluate(() => { window.scrollTo(0, 0); }); if (!(await page.$('#mygame'))) { await page.click('#navbtn'); await page.click('#navmenu [data-act="mygame"]'); await page.waitForSelector('#mygame'); }
  await page.click('#mgnav'); assert.deepStrictEqual(await page.$$eval('#mgnavmenu .sheet-item', e => e.map(x => x.textContent)), ['Tests', 'Make a game report', 'Home']);
  await page.click('#mgnavmenu [data-act="sgtlast"]'); await page.waitForSelector('#sgtresult'); assert.match(await page.textContent('#sgtresult .topbar'), /Test result/);
  await page.click('#sgtmenubtn'); assert.deepStrictEqual(await page.$$eval('#sgtmenu .sheet-item', e => e.map(x => x.textContent)), ['Tests', 'Make PDF', 'Trend']);
  await page.click('#sgttrendbtn'); await page.waitForSelector('#sgttrend'); assert.ok((await page.$$eval('.trcard', e => e.length)) >= 3, 'one chart per area');
  assert.strictEqual(await page.$$eval('.trcard[data-cat="putting"] .trsvg circle', e => e.length), tests.length, 'one point per test');
  await page.click('#sgttrendback'); await page.waitForSelector('#sgtresult'); await page.click('#sgtmenubtn'); await page.click('#sgtpdf');
  await page.waitForFunction(() => window.__golf.lastPdf && window.__golf.lastPdf.kind === 'game' && !window.__golf.lastPdf.busy, null, { timeout: 120000 }); assert.ok(await page.$('#sgtresult [data-act="pdfshare"], #sgtresult .pdfsheet'), 'PDF panel on the test page');
  await page.click('#sgtmenubtn'); await page.click('#sgtmenu [data-act="sgthub"]'); await page.waitForSelector('#sgtest'); console.log('  ✓ My Game ☰ › Tests; test ☰: Tests, Make PDF, Trend');
  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, [], 'no outside requests');
  console.log('coach', C.pages, 'pages · recruiting', R.pages, 'pages');
  await browser.close(); if (srv) srv.kill(); console.log('PASS gamereport-focused');
})().catch(e => { console.error(e); process.exit(1); });
