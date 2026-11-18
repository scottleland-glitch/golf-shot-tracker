// v236 (Scott): Practice "This week" page 3 (rolling 7 days) fits the practice logged – the axis starts a few days
// before the first log and widens up to 90 days; the header says the span; the curve starts on the first logged day.
// v237: Fit / 30d / 60d / 90d chips (Fit is the default).
// iPhone 390x844. Run: node tests/practice-chart-fit-focused.js
const { chromium } = require('playwright-core');
const assert = require('assert');
const { spawn } = require('child_process');
const ROOT = __dirname + '/../', PORT = 8879, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function dayOffset(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); }
function logs(firstAgo, every) { const P = [], sp = ['lag', 'chip', 'wedges', 'irons', 'drive']; for (let a = firstAgo, i = 0; a >= 0; a -= every, i++) P.push({ id: 'p' + a, date: dayOffset(-a) + 'T12:00:00', player: 'Scott', spoke: sp[i % 5], focus: '', min: 30 }); return P; }

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now());
    const open = async P => {
      await page.evaluate(P => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
        localStorage.setItem('golfsg.practice.v1', JSON.stringify(P)); localStorage.setItem('golfsg.typical.v1', JSON.stringify({ scott: { weekMin: 300, roundsMonth: 4, set: '2026-08-01' } })); }, P);
      await page.reload(); await page.waitForSelector('#home'); await page.click('#tbpractice'); await page.waitForSelector('#weekcard');
      if (await page.$('#waclose')) await page.click('#waclose');
    };
    const read = () => page.$eval('#wkpages .wkpage[data-p="2"]', p => { const s = p.querySelector('svg'), band = s.querySelector('path.band');
      return { head: p.querySelector('.wkpt').textContent, n: +s.getAttribute('data-n'), from: s.getAttribute('data-from'), c0: +s.getAttribute('data-c0'),
        x0: band ? parseFloat((band.getAttribute('d').match(/^M([\d.]+)/) || [])[1]) : null, bands: s.querySelectorAll('path.band').length,
        ticks: [].map.call(s.querySelectorAll('.wktick'), t => t.textContent), aria: s.getAttribute('aria-label') }; });

    // ~3 weeks of practice: the axis starts 3 days before the first log
    await open(logs(20, 2));
    let D = await read();
    assert.strictEqual(D.from, dayOffset(-23), 'axis starts 3 days before the first log');
    assert.strictEqual(D.n, 24); assert.strictEqual(D.c0, 3, 'curve starts on the first logged day');
    assert.strictEqual(D.head, 'Last 3 weeks · rolling 7 days');
    assert.match(D.aria, /last 3 weeks, rolling 7 days/);
    const xFirst = 34 + 3 / 23 * 298; assert.ok(Math.abs(D.x0 - xFirst) < 0.6, 'band starts at the first log, not at the left edge: ' + D.x0 + ' vs ' + xFirst);
    assert.ok(D.ticks.length >= 3 && D.ticks.every(t => /\d/.test(t)), 'weekly date ticks: ' + D.ticks);
    ok('3 weeks of logs → "' + D.head + '", axis from ' + D.from + ', curve from the first log, ticks ' + D.ticks.join(' / '));

    // 5 months of practice: capped at 90 days, month ticks
    await open(logs(150, 3));
    D = await read();
    assert.strictEqual(D.n, 90, 'capped at 90 days'); assert.strictEqual(D.from, dayOffset(-89)); assert.strictEqual(D.c0, 0);
    assert.strictEqual(D.head, 'Last 3 months · rolling 7 days');
    assert.ok(D.ticks.length >= 2 && D.ticks.every(t => /^[A-Za-z]+$/.test(t)), 'month ticks: ' + D.ticks);
    assert.strictEqual(D.x0, 34, 'older practice fills the window from the left edge');
    ok('5 months of logs → capped at 90 days, "' + D.head + '", ticks ' + D.ticks.join(' / '));

    // ~10 weeks: still counted in weeks (months only once it reaches 12 weeks)
    await open(logs(67, 3));
    D = await read();
    assert.strictEqual(D.n, 71); assert.strictEqual(D.head, 'Last 10 weeks · rolling 7 days');
    ok('10 weeks of logs → "' + D.head + '", ticks ' + D.ticks.join(' / '));

    // a single log yesterday: at least 2 weeks wide
    await open(logs(1, 5));
    D = await read();
    assert.strictEqual(D.n, 14); assert.strictEqual(D.head, 'Last 2 weeks · rolling 7 days'); assert.strictEqual(D.bands, 1);
    ok('one log → 2 weeks wide, one band');

    // no practice: 4 weeks, no bands, no errors
    await open([]);
    D = await read();
    assert.strictEqual(D.n, 28); assert.strictEqual(D.bands, 0);
    ok('no practice → 4 empty weeks');

    // v237: Fit / 30d / 60d / 90d – Fit is the default; a chip sets the span and stays on page 3
    await open(logs(150, 3));
    const chips = await page.$$eval('#weekcard .wkspans .prchip', e => e.map(x => [x.textContent, x.classList.contains('on')]));
    assert.deepStrictEqual(chips, [['Fit', true], ['30d', false], ['60d', false], ['90d', false]]);
    for (const [v, n] of [[30, 30], [60, 60], [90, 90]]) {
      await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = 2 * c.clientWidth; }); await page.waitForTimeout(200);
      await page.click('#weekcard .wkspans [data-v="' + v + '"]'); await page.waitForTimeout(250);
      D = await read();
      assert.strictEqual(D.n, n); assert.strictEqual(D.from, dayOffset(-(n - 1))); assert.strictEqual(D.head, 'Last ' + n + ' days · rolling 7 days');
      assert.strictEqual(await page.$eval('#weekcard .wkspans .prchip.on', e => e.textContent), v + 'd');
      assert.ok(!(await page.$('#weekcard.isfull')), 'a chip does not open full screen');
      assert.strictEqual(await page.$eval('#wkpages', c => Math.round(c.scrollLeft / c.clientWidth)), 2, 'still on the chart page');
    }
    ok('30d / 60d / 90d set the span (' + D.head + '), stay on the chart, no full screen');
    // 60d with only 3 weeks of practice: the curve starts at the first log, the rest of the window is empty
    await open(logs(20, 2));
    await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = 2 * c.clientWidth; }); await page.waitForTimeout(200);
    await page.click('#weekcard .wkspans [data-v="60"]'); await page.waitForTimeout(250);
    D = await read(); assert.strictEqual(D.n, 60); assert.strictEqual(D.c0, 39, 'curve starts on the first log');
    assert.ok(D.ticks.length >= 3 && D.ticks.every(t => /\d/.test(t)), 'every-other-week ticks: ' + D.ticks);
    await page.click('#weekcard .wkspans [data-v="0"]'); await page.waitForTimeout(250);
    D = await read(); assert.strictEqual(D.n, 24); assert.strictEqual(D.head, 'Last 3 weeks · rolling 7 days');
    ok('60d with 3 weeks of logs → empty until the first log; Fit goes back to 3 weeks');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('PASS practice-chart-fit-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
