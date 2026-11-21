// v245 Sim dispersion in the browser: ☰ › Dispersion -> pattern at 150 (animation frames), pin grid, Play all 9, CSV import (GCQuad-style), manual entry, delete.
// Run: node tests/dispersion-focused.js  (SHOTS=<dir> for screenshots). Port 8797.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const fs = require('fs'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), OUT = process.env.SHOTS || '/tmp/dispersion-test'; fs.mkdirSync(OUT, { recursive: true });
const D = require(REPO + '/dispersion.js'), SG = require(REPO + '/sg.js');
const R = D.rng(3), g = () => { let u = R() || 1e-9, v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const shots = []; for (let i = 0; i < 25; i++) shots.push({ club: '8i', target: 150, carry: +(146 + g() * 5).toFixed(1), total: 154, offline: +(3 + g() * 6).toFixed(1) });
for (let i = 0; i < 5; i++) shots.push({ club: '9i', target: 140, carry: 139 + i, total: 146, offline: i - 2 });
const SESS = [{ id: 'simA', date: '2026-11-18T18:00:00.000Z', player: 'Scott', source: 'csv', name: 'GCQuad · Nov 18', shots }];
// unit checks
assert.strictEqual(D.parseOffline('5.2 L'), -5.2); assert.strictEqual(D.parseOffline('R 3'), 3); assert.strictEqual(D.parseOffline('-4'), -4); assert.strictEqual(D.parseOffline('4', true), -4);
assert.strictEqual(D.bucket(146), 150); assert.strictEqual(D.lieAt(0, 0), 'green'); assert.strictEqual(D.lieAt(0, -22), 'fairway'); assert.strictEqual(D.lieAt(25, 0), 'rough'); assert.strictEqual(D.lieAt(13, -14.5), 'sand');
const A = D.analyse(SESS, 150, { mode: 'carry', factor: 1, SG, bl: 'scm' }); const fr = A.pins.find(p => p.k === 'frontright'), bl = A.pins.find(p => p.k === 'backleft');
assert.ok(A.ok && A.show.length === 50 && A.show.filter(p => p.real).length === 25, 'real shots first, 50 shown');
assert.ok(fr.sg < bl.sg - 0.15, 'short-right pattern: front right loses much more than back left'); assert.ok(fr.best.gain > 0.1, 'best aim helps on front right');
const W = D.analyse(SESS, 150, { mode: 'carry', factor: 1.3, SG, bl: 'scm' }); assert.ok(Math.abs(W.width / A.width - 1.3) < 0.01 && W.pins[4].sg < A.pins[4].sg, 'course conditions widen the pattern and cost strokes');
const P = D.parseCSV('Session,Nov 20\nClub,Ball Speed (mph),Carry (yds),Total (yds),Offline (yds)\n8 Iron,118,148.2,155.1,4.2 R\n8 Iron,117,151.0,158.0,2.1 L\nAverage,,149.6,156.5,1.0 R\n7 Iron,124,161,168,0.4 L\n');
const M = D.guessMap(P.headers); assert.deepStrictEqual([M.club, M.carry, M.total, M.offline], [0, 2, 3, 4]); const TS = D.toShots(P.rows, M); assert.strictEqual(TS.length, 3, 'average row skipped'); assert.strictEqual(TS[1].offline, -2.1);
assert.deepStrictEqual(D.clubGroups(TS).map(x => x.club + ':' + x.target), ['8 Iron:150', '7 Iron:160']);
console.log('  ✓ engine');
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  try {
    await page.goto('http://127.0.0.1:8797/?x=' + Date.now());
    await page.evaluate((S) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.tourdone.v1', '1'); localStorage.setItem('golfsg.sim.v1', JSON.stringify(S)); }, SESS);
    await page.reload(); await page.waitForSelector('#home'); if (await page.$('#namesheet')) await page.click('[data-act="nameskip"]');
    const shot = (n, full) => page.screenshot({ path: OUT + '/' + n + '.png', fullPage: !!full });
    await page.click('#tbplus'); await page.click('.sheet-item[data-act="dspadd"]'); await page.waitForSelector('#disp'); await page.evaluate(() => window.scrollTo(0, 0));
    assert.strictEqual(await page.textContent('.dspyd.sel b'), '150', 'opens on 150'); assert.strictEqual(await page.$$eval('.dspcell', e => e.length), 9);
    assert.match(await page.textContent('#dspsrc'), /50 balls from your 25 sim shots at 150 yd · landing spot \(carry\)/);
    await page.waitForTimeout(300); await shot('01-page', true); await shot('01b-top');
    // the animation: wide view with balls in the air, then the zoom, then the shape
    await page.click('[data-act="dsppin"][data-v="frontright"]'); await page.waitForTimeout(2600); await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#dspgo'); for (const [ms, n] of [[900, '02-flight'], [1500, '03-landing'], [1200, '04-zoom'], [1600, '05-shape']]) { await page.waitForTimeout(ms); await page.locator('.dspplay').screenshot({ path: OUT + '/' + n + '.png' }); }
    assert.match(await page.textContent('#dspcap'), /Front right pin/); assert.match(await page.textContent('#dspbest'), /Front right · −0.26.*Best aim: .* of the flag/);
    // tap a pin on the grid: the green below plays it (balls fall, hop, then the shape)
    await page.click('[data-act="dsppin"][data-v="backleft"]'); assert.ok(await page.$('.dspcell.sel[data-v="backleft"]')); assert.match(await page.textContent('#dspbest'), /Back left/);
    for (const [ms, n] of [[450, '10-green-fall'], [700, '11-green-hop'], [1400, '12-green-shape']]) { await page.waitForTimeout(ms); await page.locator('.dspstrat').screenshot({ path: OUT + '/' + n + '.png' }); }
    await page.click('[data-act="dsppin"][data-v="frontright"]'); await page.waitForTimeout(2600); await page.locator('.dspstrat').screenshot({ path: OUT + '/13-green-frontright.png' });
    // Play all 9: the caption walks through the pins
    await page.click('#dspall'); const seen = new Set(); for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); seen.add((await page.textContent('#dspcap')).split(' pin')[0]); }
    assert.ok(seen.size === 9, 'Play all 9 moves through the pins: ' + [...seen].join(', '));
    await page.locator('.dspplay').screenshot({ path: OUT + '/06-all-9.png' });
    // course conditions + total
    await page.click('[data-act="dspfac"][data-v="p30"]'); assert.match(await page.textContent('#dspsrc'), /widened ×1.3/); assert.ok(await page.$('[data-act="dspfac"][data-v="tour"][disabled]'), 'no tournament rounds -> disabled');
    await page.click('[data-act="dspfac"][data-v="sim"]'); await page.click('[data-act="dspmode"][data-v="total"]'); assert.match(await page.textContent('#dspsrc'), /\(total\)/); await page.click('[data-act="dspmode"][data-v="carry"]');
    // 140 has only 5 shots
    await page.click('[data-act="dspyd"][data-v="140"]'); await page.waitForSelector('#dspfew'); assert.match(await page.textContent('#dspfew'), /5 shots at 140 yd\. Add 3 more/);
    // import a GCQuad-style CSV
    const csv = 'Club,Ball Speed (mph),Carry (yds),Total (yds),Offline (yds)\n' + Array.from({ length: 12 }, (_, i) => '7 Iron,124,' + (158 + (i % 5)) + ',' + (166 + (i % 5)) + ',' + (i % 3) + '.5 ' + (i % 2 ? 'L' : 'R')).join('\n') + '\nAverage,124,160,168,0.2 R\n';
    fs.writeFileSync('/tmp/gcq.csv', csv); await page.setInputFiles('#dspfile', '/tmp/gcq.csv'); await page.waitForSelector('#dspimport');
    assert.match(await page.textContent('#dspimport'), /12 shots found/); assert.strictEqual(await page.inputValue('[data-dsp="target"][data-k="7 Iron"]'), '160'); await shot('07-import', true);
    await page.click('#dspimpsave'); await page.waitForSelector('#disp'); assert.strictEqual(await page.textContent('.dspyd.sel b'), '160'); await page.waitForTimeout(6500); await page.locator('.dspplay').screenshot({ path: OUT + '/08-after-import.png' });
    // manual entry: 8 balls at 120
    await page.click('[data-act="dspmanual"]'); await page.waitForSelector('#dspmanual'); await page.fill('#dspmclub', 'PW'); await page.fill('#dspmtarget', '120');
    const rows = await page.$$('.dspmrow'); for (let i = 0; i < 8; i++) { await rows[i].$eval('.dspmc', (e, v) => { e.value = v; }, String(117 + i)); await rows[i].$eval('.dspmo', (e, v) => { e.value = v; }, String(i % 4)); if (i % 2) await page.click('[data-act="dsplr"][data-v="' + i + ':L"]'); }
    await shot('09-manual', true); await page.click('#dspmsave'); await page.waitForSelector('#disp'); assert.strictEqual(await page.textContent('.dspyd.sel b'), '120');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.sim.v1'))); assert.strictEqual(st.length, 3); const man = st.find(x => x.source === 'manual'); assert.strictEqual(man.shots.length, 8); assert.strictEqual(man.shots[1].offline, -1);
    // backups carry the sessions
    const bk = await page.evaluate(() => window.SG.makeBackup([], null, 'Scott', [], null, null, [], [], JSON.parse(localStorage.getItem('golfsg.sim.v1')))); assert.strictEqual(SG.parseBackup(bk).sim.length, 3);
    // delete
    await page.click('[data-act="dspdel"][data-v="' + man.id + '"]'); assert.strictEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.sim.v1')))).length, 2);
    // My Game › Dispersion, and ‹ My Game back
    await page.click('[data-act="home"]'); await page.waitForSelector('#home'); await page.click('#navbtn'); await page.click('.sheet-item[data-act="mygame"]'); await page.waitForSelector('#mygame');
    await page.click('#mgqrow [data-act="dspopen"]'); await page.waitForSelector('#disp'); assert.strictEqual(await page.textContent('.topbar button'), '‹ My Game');
    await page.click('.topbar [data-act="mygame"]'); await page.waitForSelector('#mygame');
    assert.deepStrictEqual(errors, []); console.log('  ✓ browser (' + OUT + ')');
  } finally { await browser.close(); if (srv) srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
