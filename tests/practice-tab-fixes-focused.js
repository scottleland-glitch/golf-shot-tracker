// v240 (Scott, coach Practice tab): 1) My Practice 30 days and "Your game and your training" agree – logged practice from the first log on,
// the typical week only before it (and the line says so); 2) times as 1h 55m; 3) target bars fill toward the target – no black marks;
// 4) Trends lines smoothed with a monotone cubic (never overshoots), the practice fading-average chart unchanged. Run: node tests/practice-tab-fixes-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ARC = require('./fixtures/arcade-78.js');
const PORT = 8883, BASE = 'http://127.0.0.1:' + PORT + '/', DAY = 864e5, now = Date.now(), ok = m => console.log('  ✓ ' + m);
const ld = (n) => { const t = new Date(now - n * DAY); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const R = []; for (let w = 0; w < 16; w++) { const eff = Math.sin(w / 2.1) + (rnd() - .5) * 1.4, r = JSON.parse(JSON.stringify(ARC.round())), k = Math.round(Math.abs(eff) * 4);
  Object.assign(r, { id: 's' + w, player: 'Scott', baseline: 'd1w', date: new Date(now - ((15 - w) * 7 + 1) * DAY).toISOString(), play: w % 3 ? 'practice' : 'tournament' });
  r.holes.forEach((h, hi) => { h.finished = true; if (hi >= k) return; const rows = h.rows, g = rows.findIndex(x => x.loc === 'holed');
    if (eff > 0 && g > 1 && rows[g - 1].loc === 'green') rows.splice(g - 1, 1); else if (eff < 0 && g > 0 && rows[g - 1].loc === 'green') rows.splice(g, 0, { dist: 3, loc: 'green', dir: '', pen: false }); }); R.push(r); }
const SP = ['short', 'lag', 'chip', 'wedges', 'irons', 'drive', 'bunker'];
const logs = (fromDay) => { const L = []; for (let d = 2; d <= fromDay; d += 2) [0, 1].forEach(j => L.push({ id: 'p' + d + j, date: ld(d) + 'T12:00:00', player: 'Scott', spoke: SP[(d / 2 + j * 3) % 7], focus: '', min: 30 + (d * 7 + j * 13) % 45, feel: 'ok' })); return L; };
const toMin = (x) => { let m = 0; x.replace(/(\d+)\s*h/, (q, h) => { m += 60 * h; }); x.replace(/(\d+)\s*(m|min)\b/, (q, n) => { m += +n; }); return m; };

// the curve itself, straight from app.js: never overshoots between points, flat stays flat
{ const src = fs.readFileSync(__dirname + '/../app.js', 'utf8'), a = src.indexOf('  function monoPath(pts, corner) {'), b = src.indexOf('\n  }\n', a) + 4;
  const monoPath = new Function(src.slice(a, b) + '; return monoPath;')();
  const P = [[0, 50], [10, 10], [20, 40], [30, 40], [40, 45], [50, 0], [60, 0], [70, 30]], seg = monoPath(P).split('C').slice(1).map(x => x.trim().split(' ').map(Number)); let over = 0, flat = true;
  seg.forEach((c, i) => { const y0 = P[i][1], y1 = P[i + 1][1]; for (let k = 0; k <= 20; k++) { const u = k / 20, y = (1 - u) ** 3 * y0 + 3 * (1 - u) ** 2 * u * c[1] + 3 * (1 - u) * u * u * c[3] + u ** 3 * y1;
    if (y < Math.min(y0, y1) - 1e-9 || y > Math.max(y0, y1) + 1e-9) over++; if (y0 === y1 && Math.abs(y - y0) > 1e-9) flat = false; } });
  assert.strictEqual(seg.length, P.length - 1); assert.strictEqual(over, 0, 'overshoots'); assert.ok(flat, 'flat stays flat'); assert.match(monoPath([[0, 1], [5, 2]]), /^M0\.0 1\.0L5\.0 2\.0$/);
  // through every point (each one is a segment end), corners only: the handles are short (0.2 of the gap), so it stays close to the straight line
  const ends = monoPath(P).split(/[MC]/).filter(Boolean).map(x => x.trim().split(' ').map(Number).slice(-2)); assert.deepStrictEqual(ends, P.map(p => [p[0], p[1]]));
  seg.forEach((c, i) => { const h = P[i + 1][0] - P[i][0]; assert.ok(Math.abs(c[0] - P[i][0] - 0.2 * h) < 0.06 && Math.abs(P[i + 1][0] - c[2] - 0.2 * h) < 0.06, 'short handles'); });
  ok('rounded corners: through every point, never overshoots, flat stays flat, short handles, 2 points = a straight line'); }

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    const go = async (L) => { await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(([R, P, set]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play');
      localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P));
      localStorage.setItem('golfsg.typical.v1', JSON.stringify({ scott: { weekMin: 600, roundsMonth: 4, set } })); }, [R, L, ld(0)]); await page.reload(); };
    const both = async () => { await page.click('#tbpractice'); await page.waitForSelector('#gapcard');
      const gap = (await page.$$eval('#gapcard .gaprow .gapb:last-child em', e => e.map(x => x.textContent))).filter(x => x !== '–');
      await page.click('#tbmygame'); await page.waitForSelector('#prcard');
      const head = await page.textContent('#prpages .prpage[data-p="30d"] .prh'), lede = await page.textContent('#prpages .prpage[data-p="30d"] .prlede2'); return { gap, head, lede }; };
    // 1a) typical week entered today, logs for 50 days → the 30 days are all logged: the two numbers agree, no typical-week note
    await go(logs(50)); let X = await both(); const gw = X.gap.reduce((s, x) => s + toMin(x), 0);
    assert.ok(Math.abs(toMin(X.head) - gw) <= 5, X.head + ' vs ' + gw + ' min'); assert.doesNotMatch(X.lede, /typical week/);
    assert.ok(X.gap.every(x => /^(\d+h( \d+m)?|[1-5]?\dm)$/.test(x)), X.gap.join()); // 67 min → 1h 7m
    ok('all logged: My Practice 30 days ' + X.head + ' = Your game and your training ' + gw + ' min a week; rows like 1h 7m');
    // 1b) first log 22 days ago → the days before it use the typical week, and the line says so
    await go(logs(22)); X = await both(); assert.match(X.lede, /Includes your typical week before your first log \(\w{3} \d+\)\./); assert.ok(toMin(X.head) > X.gap.reduce((s, x) => s + toMin(x), 0));
    ok('first log 22 days ago: "' + X.lede.replace(/^.*?Includes/, 'Includes') + '"');
    // 2 + 3) Your week ahead (nothing logged this week yet): 0m of 2h, no black marks; This week bars fill toward the target
    const mon = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; })();
    await go(logs(22).filter(e => Date.parse(e.date) < mon)); await page.click('#tbpractice'); await page.waitForSelector('#wacard'); // the card shows before anything is logged this week
    assert.strictEqual(await page.$$eval('.wktgt', e => e.length), 0, 'no black target marks');
    const wav = await page.$$eval('#wacard .warow .wav', e => e.map(x => x.textContent)); assert.ok(wav.length >= 5 && wav.every(x => /^(✓ )?(\d+h( \d+m)?|\d+m) of (\d+h( \d+m)?|\d+m)$/.test(x)), wav.join(' | '));
    assert.doesNotMatch(await page.textContent('#wacard .wabars'), /\b([6-9]\d|\d{3,})m\b/, 'no plain 115m');
    const bars = await page.$$eval('#wacard .warow', e => e.map(r => [r.querySelector('.wabar').getBoundingClientRect().width, r.querySelector('.wav').textContent]));
    assert.ok(bars[0][0] > bars[bars.length - 1][0], 'longer target, longer bar');
    ok('week ahead: "' + wav[0] + '" – the bar is the target, no black marks, times as 1h 55m');
    await page.evaluate(([d]) => { const L = JSON.parse(localStorage.getItem('golfsg.practice.v1')); L.push({ id: 'now', date: d + 'T12:00:00', player: 'Scott', spoke: 'irons', focus: '', min: 45, feel: 'ok' }); localStorage.setItem('golfsg.practice.v1', JSON.stringify(L)); }, [ld(0)]);
    await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#weekcard .wkrow');
    const row = await page.$eval('#weekcard .wkrow[data-k="irons"], #weekcard .wkrow', r => ({ v: r.querySelector('.wkval').textContent, f: r.querySelector('.wkfill').style.width, t: r.querySelector('.wkbar').style.width }));
    assert.match(row.v, /^(✓ )?(\d+h( \d+m)?|\d+m) of (\d+h( \d+m)?|\d+m)$/); assert.ok(parseFloat(row.f) > 0 && parseFloat(row.t) > 0, JSON.stringify(row)); assert.strictEqual(await page.$$eval('.wktgt', e => e.length), 0);
    ok('This week bars: "' + row.v + '" filling a target-length bar');
    // the practice fading-average chart keeps its line shape (straight segments), Trends lines are curves
    const wk = await page.$eval('#weekcard .wktotal', e => e.getAttribute('d')); assert.doesNotMatch(wk, /C/, 'practice chart unchanged');
    await page.click('#tbmygame'); await page.waitForSelector('#mygame'); await page.click('#qgotrends'); await page.waitForSelector('#trendspage .trcard2');
    assert.match(await page.textContent('#trlede'), /^Each dot is a round – tournament, other\. Solid: the average of your last 3 rounds/);
    const d = await page.$$eval('#trendspage .trsg, #trendspage .trmid, #trendspage .trpr', e => e.map(x => x.getAttribute('d')));
    assert.ok(d.length >= 6 && d.every(x => /^M[\d.]+ [\d.]+ ?(C|L)/.test(x)) && d.filter(x => /C/.test(x)).length >= 3, d.slice(0, 3).join(' / ')); // v258: a short connector from the last round to today is a straight L
    ok('Trends: form, forecast and practice lines are smooth curves (' + d.filter(x => /C/.test(x)).length + ' of ' + d.length + ')');
    assert.deepStrictEqual(errors, []); console.log('PRACTICE TAB FIXES OK');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
