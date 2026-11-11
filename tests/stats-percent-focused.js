// v111: Round stats list – a whole percent next to each fraction (Fairways hit, Greens in regulation, 1st putts made inside 10 ft, Lag putts).
// v112: the percent is in brackets, same colour/size as the number – "9 / 12 (75%)"; 1st putt misses became 1st putts made inside 10 ft (made / tries).
// No percent on Pin location, Putts, Penalty strokes, Tee misses L / R, or when there is nothing to count (x / 0). Rows stay on one line at 390px.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8850, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = process.env.SHOTS || '/workspace/golf-app/screenshots';
const SEED = fs.readFileSync(__dirname + '/fixtures/stats-rounds.js', 'utf8');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', q => { const u = new URL(q.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(q.url())) outside.push(q.url()); });
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(SEED);
  // + a 9-hole par-3 round: no fairways to hit (0 / 0) and no putts over 10 ft (no lag putts)
  await page.evaluate(() => { const R = (dist, loc) => ({ dist, loc, dir: '', pen: false }), L = JSON.parse(localStorage.getItem('golfsg.rounds.v1'));
    L.push({ v: 3, dv: 2, id: 'p3', date: '2026-10-28T15:00:00.000Z', course: 'Par 3 Park', baseline: 'pga', player: 'Scott', holes: Array.from({ length: 9 }, (_, i) => ({ par: 3, finished: true, rows: [R(120 + 5 * i, 'tee'), R(6, 'green'), R(1, 'holed')] })) });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L)); });
  await page.reload(); await page.waitForSelector('#plusbtn');
  const openRound = async id => { await page.click('#navbtn'); await page.click('#navmenu [data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="' + id + '"]'); await page.waitForSelector('#stattiles'); };
  const rows = () => page.$$eval('#stattiles .stxh', h => h.map(x => { const b = x.querySelector('b'), s = x.querySelector('span'), em = b.querySelector('.stxp'), lh = parseFloat(getComputedStyle(b).lineHeight) || 22;
    return { v: x.closest('[data-stx]').dataset.stx, l: s.textContent, n: b.textContent, oneLine: b.getBoundingClientRect().height < lh * 1.5 && s.getBoundingClientRect().height < (parseFloat(getComputedStyle(s).lineHeight) || 22) * 1.5,
      fitsRight: x.getBoundingClientRect().right <= 390, pct: em ? { fs: parseFloat(getComputedStyle(em).fontSize), fw: +getComputedStyle(em).fontWeight, c: getComputedStyle(em).color, bfs: parseFloat(getComputedStyle(b).fontSize), bc: getComputedStyle(b).color } : null }; }));
  const expect = id => page.evaluate(id => { const r = window.__golf.rounds().find(x => x.id === id), S = SG.summarize(r, r.baseline), PM = SG.pmissList(S.puttList), L = SG.lagStats(S.puttList);
    return { fw: [S.fwHit, S.fwTotal], gir: [S.gir, S.girHoles], pm: [PM.filter(p => p.made).length, PM.length], lag: [L.inside, L.attempts], pin: S.pinHoles.length + ' / ' + S.holesDone }; }, id);
  const pc = a => a[1] ? ' (' + Math.round(100 * a[0] / a[1]) + '%)' : ''; // v112: brackets

  for (const id of ['s1', 's3', 's5', 's7', 'p3']) {
    await openRound(id); const H = Object.fromEntries((await rows()).map(r => [r.v, r])), E = await expect(id);
    assert.strictEqual(H.fw.n, E.fw.join(' / ') + pc(E.fw), id + ' fw'); assert.strictEqual(H.gir.n, E.gir.join(' / ') + pc(E.gir), id + ' gir');
    assert.strictEqual(H.pmiss.n, E.pm[1] ? E.pm.join('/') + pc(E.pm) : '–', id + ' pmiss'); assert.strictEqual(H.lag.n, E.lag[1] ? E.lag.join('/') + pc(E.lag) : '–', id + ' lag');
    assert.strictEqual(H.pin.n, E.pin, 'Pin location unchanged'); ['pin', 'putt', 'pen', 'teelr', 'miss', 'prox', 'club'].forEach(k => assert.ok(!/%/.test(H[k].n) && !H[k].pct, id + ' no percent on ' + k));
    Object.values(H).forEach(r => assert.ok(r.oneLine && r.fitsRight, id + ' row wraps: ' + r.l + ' ' + r.n));
    ['fw', 'gir', 'pmiss', 'lag'].forEach(k => { const p = H[k].pct; if (!p) return; assert.ok(p.fs === p.bfs && p.fw <= 400 && p.c === p.bc, 'v112 percent: same size and colour as the number, not bold ' + JSON.stringify(p)); });
    if (id === 's1') { await page.locator('#stattiles').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -110)); await page.waitForTimeout(150); await page.screenshot({ path: OUT + '/stats-paren-v112.png' }); }
    // v191: these rows open their map in one tap – no tiles to read
    if (id === 'p3') { assert.strictEqual(H.fw.n, '0 / 0', 'no fairways -> no percent'); assert.strictEqual(H.lag.n, '–'); assert.strictEqual(H.gir.n, '9 / 9 (100%)'); assert.strictEqual(H.pmiss.n, '0/9 (0%)'); }
    console.log('  ' + id + ':', ['fw', 'gir', 'pmiss', 'lag', 'pin'].map(k => H[k].l + ' ' + H[k].n).join(' | '));
    await (async (P) => { if (!(await P.$('.topbar [data-act="home"]')) && await P.$('#rsmenubtn')) await P.click('#rsmenubtn'); return P.click('.topbar [data-act="home"], #rsmenu [data-act="home"]'); })(page) /* v191: in ☰ on Round stats */;
  }
  // longest likely values still sit on one line at 390px
  await openRound('s1');
  const worst = await page.evaluate(() => { const set = (v, t) => { document.querySelector('[data-stx="' + v + '"] .stxh b').innerHTML = t; };
    set('pmiss', '18/18<em class="stxp"> (100%)</em>'); set('lag', '18/18<em class="stxp"> (100%)</em>'); set('fw', '14 / 14<em class="stxp"> (100%)</em>'); set('gir', '18 / 18<em class="stxp"> (100%)</em>'); return 1; });
  const W = await rows(); W.forEach(r => assert.ok(r.oneLine && r.fitsRight, 'longest value wraps: ' + r.l + ' ' + r.n));
  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []);
  console.log('STATS PERCENT OK'); await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
