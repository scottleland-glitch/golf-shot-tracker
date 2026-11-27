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
    // the picture: first putts only, no lines – white = where each started (18), black = where it finished (the 2 with a direction), a red 3 ft ring,
    // red outline on holes 1 and 2 (3+ putts), rings scaled to the longest first putt (30 ft); the averages are first putts only
    assert.match(await page.textContent('#clubdisp .cch'), /First putts/); assert.match(await page.textContent('#clubdisp .ccv'), /n = 18/);
    assert.strictEqual(await page.$$eval('#clubmap line.cputt', (e) => e.length), 0, 'no lines');
    const st = await page.$$eval('#clubmap circle.cdot.fps', (e) => e.map((c) => [c.dataset.hole, c.getAttribute('fill'), c.classList.contains('p3')]));
    assert.strictEqual(st.length, 18); assert.ok(st.every((x) => x[1] === '#fff')); assert.deepStrictEqual(st.filter((x) => x[2]).map((x) => x[0]), ['1', '2']);
    assert.deepStrictEqual(await page.$$eval('#clubmap circle.cdot.fp', (e) => e.map((c) => [c.dataset.hole, c.getAttribute('fill'), c.classList.contains('p3')])), [['1', '#1b2329', true], ['2', '#1b2329', true]], 'black finishes');
    assert.strictEqual(await page.getAttribute('#clubring3', 'stroke'), '#d0213a'); const r3 = +(await page.getAttribute('#clubring3', 'r'));
    const rings = await page.$$eval('#clubmap .cring', (e) => e.map((x) => [+x.dataset.ft, +x.getAttribute('r')])); const top = rings[rings.length - 1];
    assert.strictEqual(top[0], 30, 'scaled to the longest first putt ' + JSON.stringify(rings)); assert.ok(Math.abs(r3 - top[1] * 3 / 30) < 0.2, '3 ft ring to scale');
    assert.match(await page.textContent('#clubnodir'), /\+ 16 finishes with no direction/);
    assert.match(await page.textContent('#clubcells'), /2 ft short/);
    await page.locator('#clubdisp').scrollIntoViewIfNeeded(); await page.locator('#clubdisp').screenshot({ path: OUT + '/putter-picture.png' });
    await page.evaluate(() => document.getElementById('clubshots').scrollIntoView({ block: 'start' })); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/putter-list.png' });
    // other clubs: the yellow holed balls are one ball with a count, not a row
    await page.click('#clubbtns [data-v="9i"]'); assert.strictEqual(await page.$$eval('#clubmap circle.cdot', (e) => e.filter((c) => c.getAttribute('fill') === '#ffd23f').length) <= 1, true);
    await page.screenshot({ path: OUT + '/9i.png', fullPage: false });
    assert.deepStrictEqual(errors, []); console.log('PUTTER CLUB OK');
  } finally { await b.close(); srv.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
