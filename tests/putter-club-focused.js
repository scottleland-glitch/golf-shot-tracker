// v267 (Scott): the putter in Club performance – From in feet then Finished (no Hit), a red box round the putts of a hole with 3+ putts, and a
// picture of every putt from where it started to where it finished, scaled to the longest putt. Run: node tests/putter-club-focused.js [outDir]
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const PORT = 8893, OUT = process.argv[2] || '/tmp/putter-club'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + PORT + '/?x=' + Date.now());
    await page.evaluate(() => {
      const R = (d, l, dir, club) => Object.assign({ dist: d, loc: l, dir: dir || '', pen: false }, club ? { club } : {});
      // hole 1: 4 putts (30 ft long-left of the pin -> 6 ft short -> 2 ft right -> 1 ft -> in); hole 2: 3 putts (18 ft right -> 3 ft -> 1 ft -> in); others: 2 putts from 8 ft
      const holes = Array.from({ length: 18 }, (_, i) => ({ par: 4, finished: true, rows: i === 0
        ? [R(400, 'tee', '', 'Driver'), R(150, 'fairway', '', '9i'), R(30, 'green', 'longleft'), R(6, 'green', 'short'), R(2, 'green', 'right'), R(1, 'holed')]
        : i === 1 ? [R(400, 'tee', '', 'Driver'), R(150, 'fairway', '', '9i'), R(18, 'green', 'right'), R(3, 'green', 'long'), R(1, 'holed')]
          : [R(400, 'tee', '', 'Driver'), R(150, 'fairway', '', '9i'), R(8, 'green', i % 2 ? 'short' : 'left'), R(1, 'holed')] }));
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.bag.v1', JSON.stringify({ clubs: [{ code: 'Driver', cat: 'd', carry: 250 }, { code: '4H', cat: 'hy', carry: 196 }, { code: '56', cat: 'we', carry: 90 }] }));
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rc', date: '2026-10-10T17:00:00.000Z', course: 'Reach', baseline: 'pga', player: 'Scott', holes }]));
    });
    await page.reload(); if (await page.$('#tbplus')) await page.click('#navbtn'); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rc"]');
    if (!(await page.$('[data-stx="club"].open')) && await page.$('[data-act="stx"][data-v="club"]')) await page.click('[data-act="stx"][data-v="club"]');
    await page.click('[data-act="map"][data-v="club"]'); await page.waitForSelector('#clubbtns');
    await page.click('#clubbtns [data-v="Putter"]');
    assert.deepStrictEqual(await page.$$eval('#clubshots tr:first-child th', (t) => t.map((x) => x.textContent)), ['Hole', 'From', 'Finished', 'SG']);
    const rows = await page.$$eval('#clubshots tr:not(:first-child)', (t) => t.map((r) => [r.className, r.children[1].textContent, r.children[2].textContent]));
    assert.deepStrictEqual(rows.slice(0, 3).map((r) => r[1]), ['30 ft', '6 ft', '2 ft'], 'From in feet ' + JSON.stringify(rows.slice(0, 4)));
    assert.deepStrictEqual(rows.slice(0, 9).map((r) => r[0]), ['p3 p3top', 'p3', 'p3', 'p3 p3bot', 'p3 p3top', 'p3', 'p3 p3bot', '', ''], 'a box round hole 1 (4 putts) and hole 2 (3 putts)');
    assert.match(await page.textContent('#clubshots tr.p3top td:first-child'), /4 putts/);
    assert.ok(rows.slice(7).every((r) => r[0] === ''), 'no box on 1- and 2-putt holes');
    // the picture: one line per putt, scaled to the longest (30 ft), hole 1's in red, holed ones end in the cup
    assert.strictEqual(await page.$$eval('#clubmap line.cputt', (e) => e.length), rows.length);
    assert.strictEqual(await page.$$eval('#clubmap line.cputt.p3', (e) => e.length), 7);
    const rings = await page.$$eval('#clubmap .cring', (e) => e.map((x) => +x.dataset.ft)); assert.strictEqual(Math.max(...rings), 30, 'scaled to the longest putt ' + rings);
    assert.ok(await page.$$eval('#clubmap line.cputt.holed', (e) => e.every((l) => l.getAttribute('x2') === '180' && l.getAttribute('y2') === '196')), 'holed putts end in the cup');
    assert.match(await page.textContent('#clubmap'), /18 holed/);
    await page.locator('#clubdisp').scrollIntoViewIfNeeded(); await page.locator('#clubdisp').screenshot({ path: OUT + '/putter-picture.png' });
    await page.evaluate(() => document.getElementById('clubshots').scrollIntoView({ block: 'start' })); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/putter-list.png' });
    // other clubs: the yellow holed balls are one ball with a count, not a row
    await page.click('#clubbtns [data-v="9i"]'); assert.strictEqual(await page.$$eval('#clubmap circle.cdot', (e) => e.filter((c) => c.getAttribute('fill') === '#ffd23f').length) <= 1, true);
    await page.screenshot({ path: OUT + '/9i.png', fullPage: false });
    assert.deepStrictEqual(errors, []); console.log('PUTTER CLUB OK');
  } finally { await b.close(); srv.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
