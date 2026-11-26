// v245 Sim dispersion in the browser: ☰ › Dispersion -> pattern at 150 (animation frames), pin grid, Play all 9, CSV import (GCQuad-style), manual entry, delete.
// Run: node tests/dispersion-focused.js  (SHOTS=<dir> for screenshots). Port 8797.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const fs = require('fs'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), OUT = process.env.SHOTS || '/tmp/dispersion-test'; fs.mkdirSync(OUT, { recursive: true });
const D = require(REPO + '/dispersion.js'), SG = require(REPO + '/sg.js');
const R = D.rng(3), g = () => { let u = R() || 1e-9, v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const shots = []; for (let i = 0; i < 25; i++) shots.push({ club: '8i', target: 150, carry: +(146 + g() * 5).toFixed(1), total: 154, offline: +(3 + g() * 6).toFixed(1) });
for (let i = 0; i < 5; i++) shots.push({ club: '9i', target: 140, carry: 139 + i, total: 146, offline: i - 2 });
const FIX = require(REPO + '/tests/fixtures/prox-rounds.js'), ROUNDS = FIX.all(); ROUNDS[0].play = 'tournament'; ROUNDS.forEach(r => r.holes.forEach((h, i) => { if (i % 4 !== 3) h.pin = ['frontright', 'center', 'backleft'][i % 3]; })); // v248 pin locations for the grid ROUNDS.forEach(r => { r.player = 'Scott'; });
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
// v259 best aim from real finishes: misses short right of a front-right pin -> aim left and long, and it says how much it saves
{ const RR = D.rng(5), L = []; for (let i = 0; i < 10; i++) { const dx = 3 + RR() * 5, dy = -4 - RR() * 5; L.push({ dx, dy, on: D.onGreen(7 + dx, -9.5 + dy), from: 140 + i * 3, sg: -0.3, ft: 30, dir: 'short right', pin: 'frontright' }); }
  const A9 = D.analyseRoundPin(L, 'frontright'), B9 = D.roundPinBest(A9, 'frontright', SG, 'scm');
  assert.ok(B9.move && B9.aim.x < 7 && B9.aim.y > -9.5 && B9.gain > 0.03 && B9.sg2 > B9.sg && B9.onPct2 > B9.onPct, 'best aim from real finishes: ' + JSON.stringify(B9));
  assert.strictEqual(D.roundPinBest(D.analyseRoundPin(L.slice(0, 4), 'frontright'), 'frontright', SG, 'scm'), null, 'needs 5+ shots'); }
console.log('  ✓ engine');
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  try {
    await page.goto('http://127.0.0.1:8797/?x=' + Date.now());
    await page.evaluate((S) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.tourdone.v1', '1'); localStorage.setItem('golfsg.sim.v1', JSON.stringify(S[0])); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(S[1])); }, [SESS, ROUNDS]);
    await page.reload(); await page.waitForSelector('#home'); if (await page.$('#namesheet')) await page.click('[data-act="nameskip"]');
    const closeFs = async () => { if (await page.$('.dspfs')) { await page.click('.dspfs .dspfsx'); await page.waitForTimeout(150); } }; // v259 pictures play full screen
    const shot = (n, full) => page.screenshot({ path: OUT + '/' + n + '.png', fullPage: !!full });
    await page.click('#tbplus'); await page.click('.sheet-item[data-act="dspadd"]'); await page.waitForSelector('#disp'); await page.evaluate(() => window.scrollTo(0, 0));
    assert.strictEqual(await page.textContent('.dspyd.sel b'), '8i', 'opens on the club nearest 150'); assert.match(await page.textContent('.dspyd.sel span'), /150 yd · 25/);
    assert.strictEqual(await page.textContent('[data-act="dspsrc"].sel'), 'Club · sim'); assert.match(await page.textContent('#dspempty, #disp'), /8i pattern/); assert.strictEqual(await page.$$eval('.dspcell', e => e.length), 9);
    assert.match(await page.textContent('#dspsrc'), /50 balls from your 25 sim shots with 8i \(150 yd target\) · landing spot \(carry\)/);
    await page.waitForTimeout(300); await shot('01-page', true); await shot('01b-top');
    // the animation: wide view with balls in the air, then the zoom, then the shape
    await page.click('[data-act="dsppin"][data-v="frontright"]'); await page.waitForTimeout(2600); await closeFs(); await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#dspgo'); for (const [ms, n] of [[900, '02-flight'], [1500, '03-landing'], [1200, '04-zoom'], [1600, '05-shape']]) { await page.waitForTimeout(ms); await page.screenshot({ path: OUT + '/' + n + '.png' }); } await closeFs(); 
    assert.match(await page.textContent('#dspcap'), /Front right pin/); assert.match(await page.textContent('#dspbest'), /Front right · −0.2\d.*Best aim: .* of the flag/);
    // tap a pin on the grid: the green below plays it (balls fall, hop, then the shape)
    await page.click('[data-act="dsppin"][data-v="backleft"]'); await closeFs();  assert.ok(await page.$('.dspcell.sel[data-v="backleft"]')); assert.match(await page.textContent('#dspbest'), /Back left/);
    for (const [ms, n] of [[450, '10-green-fall'], [700, '11-green-hop'], [1400, '12-green-shape']]) { await page.waitForTimeout(ms); await page.locator('.dspstrat').screenshot({ path: OUT + '/' + n + '.png' }); }
    await page.click('[data-act="dsppin"][data-v="frontright"]'); await page.waitForTimeout(2600); await page.screenshot({ path: OUT + '/13-green-frontright.png' }); await closeFs(); 
    // v247 Aim: most greens slides the circle, fewest strokes, back to the flag
    await page.click('[data-act="dspaim"][data-v="gir"]'); await page.waitForTimeout(450); await page.locator('.dspstrat').screenshot({ path: OUT + '/16-aim-moving.png' });
    await page.waitForTimeout(900); await page.locator('.dspstrat').screenshot({ path: OUT + '/17-aim-gir.png' });
    assert.match(await page.textContent('#dspbest'), /Front right · most greens: aim .* of the flag – \d+% on the green \(\d+% at the flag\)/);
    await page.click('[data-act="dspaim"][data-v="sg"]'); await page.waitForTimeout(1100); assert.match(await page.textContent('#dspbest'), /best SG: aim .* saves 0\.\d\d a shot/);
    await page.click('[data-act="dsppin"][data-v="center"]'); await page.waitForTimeout(2400); await closeFs();  assert.match(await page.textContent('#dspbest'), /Center · best SG/, 'aim choice stays when the pin changes');
    await page.click('[data-act="dspaim"][data-v="flag"]'); await page.waitForTimeout(1100); assert.match(await page.textContent('#dspbest'), /^Center · [+−]?\d/);
    // the clubs at the top of the card
    assert.strictEqual(await page.$$eval('.dspyds2 .dspclub', e => e.length), 2); await page.click('.dspyds2 [data-v="9i"]'); await page.waitForSelector('#dspfew'); await page.click('#dspyds [data-v="8i"]'); await page.waitForSelector('#dspgrid');
    await page.click('[data-act="dsppin"][data-v="frontright"]'); await page.waitForTimeout(2600); await closeFs(); 
    // Play all 9: the caption walks through the pins
    await page.click('#dspall'); const seen = new Set(); for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); seen.add((await page.textContent('#dspcap')).split(' pin')[0]); }
    assert.ok(seen.size === 9, 'Play all 9 moves through the pins: ' + [...seen].join(', '));
    await page.screenshot({ path: OUT + '/06-all-9.png' }); await closeFs();
    // course conditions + total
    await page.click('[data-act="dspfac"][data-v="p30"]'); assert.match(await page.textContent('#dspsrc'), /widened ×1.3/); assert.ok(await page.$('[data-act="dspfac"][data-v="tour"][disabled]'), 'no tournament rounds -> disabled');
    await page.click('[data-act="dspfac"][data-v="sim"]'); await page.click('[data-act="dspmode"][data-v="total"]'); assert.match(await page.textContent('#dspsrc'), /\(total\)/); await page.click('[data-act="dspmode"][data-v="carry"]');
    // 9i has only 5 shots
    await page.click('[data-act="dspclub"][data-v="9i"]'); await page.waitForSelector('#dspfew'); assert.match(await page.textContent('#dspfew'), /5 shots with 9i\. Add 3 more/);
    // v247 actual dispersion from rounds, by distance
    await page.click('[data-act="dspsrc"][data-v="rounds"]'); await page.waitForSelector('#dspactual'); assert.strictEqual(await page.textContent('.dspyd.sel b'), '150');
    assert.match(await page.textContent('#dspsrc'), /Your 4 approaches from 145–154 yd \(fairway or tee\) · where they finished/); assert.match(await page.textContent('#dspactual'), /100%on the green/);
    // v248 rounds pin grid: all distances by the hole's pin location
    assert.strictEqual(await page.$('#dsprgrid'), null, 'no grid in Rounds'); await page.click('[data-act="dspsrc"][data-v="pins"]'); await page.waitForSelector('#dsprgrid'); assert.strictEqual(await page.$('#dspyds'), null, 'no distance chips in Pin location');
    assert.ok(await page.$('#dsprgrid'), 'pin grid'); assert.strictEqual(await page.$$eval('#dsprgrid .dspcell', e => e.length), 9); assert.match(await page.textContent('#dsprgrid'), /without a pin location/);
    const cell = await page.$('#dsprgrid .dspcell[data-act="dsprpin"]'); const ck = await cell.getAttribute('data-v'); await cell.click(); await page.waitForTimeout(300);
    assert.ok(await page.$('#dsprgrid .dspcell.sel[data-v="' + ck + '"]')); assert.match(await page.textContent('#dspsrc, #dspfew'), / to .* pins/); await shot('18-rounds-pin');
    // v259 a pin tap plays full screen; swipe down closes it
    assert.ok(await page.$('body > .dspfs #dspcv'), 'pin tap -> picture full screen'); assert.ok(await page.evaluate(() => document.body.classList.contains('dspfsopen')));
    const fsr = await page.evaluate(() => { const r = document.getElementById('dspcv').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; }); assert.ok(fsr[0] === fsr[2] && fsr[1] > fsr[3] * 0.6, 'fills the screen: ' + fsr);
    // v260 the green only: groups drop in one at a time, then group buttons
    for (const [ms, n] of [[700, '20a-group1'], [1400, '20b-group1-ring'], [1600, '20c-group2']]) { await page.waitForTimeout(ms); await page.screenshot({ path: OUT + '/' + n + '.png' }); }
    await page.waitForTimeout(6000); await page.screenshot({ path: OUT + '/20-pin-fullscreen.png' });
    const gb = await page.$$eval('.dspfs .dsppgt.fs .dsppg', (e) => e.map((x) => x.textContent + (x.classList.contains('on') ? '*' : '')));
    assert.strictEqual(gb.length, 3); assert.match(gb[0], /^Under 120 yd · \d+/); assert.match(gb[1], /^120–169 yd/); assert.match(gb[2], /^170\+ yd/);
    const first = await page.$('.dspfs .dsppg.on'); const fg = await first.getAttribute('data-fsgrp'); await first.click(); await page.waitForTimeout(300);
    assert.ok(await page.$('body > .dspfs #dspcv'), 'stays full screen'); assert.ok(!(await page.$('.dspfs .dsppg[data-fsgrp="' + fg + '"].on')), 'group off'); await page.screenshot({ path: OUT + '/22-group-off.png' });
    await page.click('.dspfs .dsppg[data-fsgrp="' + fg + '"]'); await page.waitForTimeout(300); assert.ok(await page.$('.dspfs .dsppg[data-fsgrp="' + fg + '"].on'), 'group back on');
    await page.evaluate(() => { const w = document.querySelector('.dspfs'), T = (y) => new Touch({ identifier: 1, target: w, clientX: 200, clientY: y });
      w.dispatchEvent(new TouchEvent('touchstart', { touches: [T(200)], bubbles: true })); w.dispatchEvent(new TouchEvent('touchmove', { touches: [T(420)], bubbles: true, cancelable: true })); w.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })); });
    await page.waitForTimeout(500); assert.strictEqual(await page.$('.dspfs'), null, 'swipe down closes'); assert.ok(await page.$('#dsprgrid #dspcv, .dspplay #dspcv'), 'picture back on the page');
    assert.ok(!(await page.evaluate(() => document.body.classList.contains('dspfsopen'))));
    await page.evaluate(() => scrollTo(0, 0)); const fit = await page.evaluate(() => { const g = document.getElementById('dsprgrid').getBoundingClientRect(), c = document.getElementById('dspcv').getBoundingClientRect(); return [g.top, c.bottom, innerHeight]; });
    assert.ok(fit[1] <= fit[2], 'grid and picture both on screen: ' + fit); await page.click('#dsprgrid .dspcell[data-act="dsprpin"]:not(.sel)').catch(() => {}); assert.strictEqual(await page.evaluate(() => scrollY), 0, 'tapping a pin does not scroll'); await closeFs(); await shot('19-pins-view');
    await page.click('[data-act="dspsrc"][data-v="rounds"]'); await page.waitForSelector('#dspyds');
    await page.click('[data-act="dspryd"][data-v="150"]'); await page.waitForSelector('#dspactual'); assert.match(await page.textContent('#dspsrc'), /from 145–154 yd/);
    assert.strictEqual(await page.$('#dspall'), null, 'no 9 pins for rounds'); assert.strictEqual(await page.$('#dspgrid'), null); await page.waitForTimeout(300); await shot('14-rounds', true);
    await page.click('#dspgo'); await page.waitForTimeout(5200); await page.screenshot({ path: OUT + '/15-rounds-anim.png' }); await closeFs(); 
    await page.click('[data-act="dsprplay"][data-v="tournament"]'); assert.strictEqual(await page.textContent('[data-act="dsprplay"].sel'), 'Tournaments'); assert.ok(+(await page.textContent('.dspyd.sel span')) <= 2, 'only the tournament round');
    await page.click('[data-act="dsprplay"][data-v="all"]'); await page.click('[data-act="dspsrc"][data-v="sim"]'); await page.waitForSelector('#dspgrid, #dspfew');
    // import a GCQuad-style CSV
    const csv = 'Club,Ball Speed (mph),Carry (yds),Total (yds),Offline (yds)\n' + Array.from({ length: 12 }, (_, i) => '7 Iron,124,' + (158 + (i % 5)) + ',' + (166 + (i % 5)) + ',' + (i % 3) + '.5 ' + (i % 2 ? 'L' : 'R')).join('\n') + '\nAverage,124,160,168,0.2 R\n';
    fs.writeFileSync('/tmp/gcq.csv', csv); await page.setInputFiles('#dspfile', '/tmp/gcq.csv'); await page.waitForSelector('#dspimport');
    assert.match(await page.textContent('#dspimport'), /12 shots found/); assert.strictEqual(await page.inputValue('[data-dsp="target"][data-k="7 Iron"]'), '160'); await shot('07-import', true);
    await page.click('#dspimpsave'); await page.waitForSelector('#disp'); assert.strictEqual(await page.textContent('.dspyd.sel b'), '7 Iron'); await page.waitForTimeout(6500); await page.locator('.dspplay').screenshot({ path: OUT + '/08-after-import.png' });
    // manual entry: 8 balls at 120
    await page.click('[data-act="dspmanual"]'); await page.waitForSelector('#dspmanual'); await page.fill('#dspmclub', 'PW'); await page.fill('#dspmtarget', '120');
    const rows = await page.$$('.dspmrow'); for (let i = 0; i < 8; i++) { await rows[i].$eval('.dspmc', (e, v) => { e.value = v; }, String(117 + i)); await rows[i].$eval('.dspmo', (e, v) => { e.value = v; }, String(i % 4)); if (i % 2) await page.click('[data-act="dsplr"][data-v="' + i + ':L"]'); }
    await shot('09-manual', true); await page.click('#dspmsave'); await page.waitForSelector('#disp'); assert.strictEqual(await page.textContent('.dspyd.sel b'), 'PW');
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
