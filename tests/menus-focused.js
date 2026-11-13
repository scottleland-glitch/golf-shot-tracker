// v191 (Scott): ☰ for menus, + only to start things; Round stats ☰ (PDF, story, strokes gained, round type, Rounds, Home) and
// Edit round; stat rows with a map open it in one tap; the replay keeps its hole arrows pinned and swipes. Run: node tests/menus-focused.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), PORT = 8968, ARC = require('./fixtures/arcade-78.js');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const r = Object.assign(ARC.round(), { id: 'r1', player: 'Scott', date: new Date(Date.now() - 864e5).toISOString() });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(String(e))); const ok = (m) => console.log('  ✓ ' + m);
  await page.goto('http://127.0.0.1:' + PORT + '/?x=1');
  await page.evaluate((R) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([R])); }, r);
  await page.reload(); await page.waitForSelector('#home');
  // Home: ☰ = places, + = start something
  assert.ok(await page.$('#navbtn svg.menuic'), '☰ icon'); await page.click('#navbtn');
  assert.deepStrictEqual(await page.$$eval('#navmenu .sheet-item', e => e.map(x => x.textContent)), ['Rounds', 'Stats', 'My Game', 'My Bag', 'Settings', 'Help']);
  await page.$eval('.sheet-back', e => e.click()); await page.click('#tbplus');
  assert.deepStrictEqual(await page.$$eval('#plusmenu .sheet-item', e => e.map(x => x.textContent)), ['New round', 'Log practice', 'Short game test']); await page.$eval('.sheet-back', e => e.click()); ok('Home: ☰ places, + starts things');
  // v194: My Game has no ☰ / +, a bottom bar instead
  await page.click('#tbmygame'); await page.waitForSelector('#mygame'); assert.strictEqual(await page.$('#mgplus, #mgnav'), null, 'no ☰ / + on My Game');
  assert.deepStrictEqual(await page.$$eval('#tabbar .tbbtn span', e => e.map(x => x.textContent)), ['My Game', 'Rounds', 'Practice', 'Stats']); assert.ok(await page.$('#tabbar #tbplus')); assert.deepStrictEqual(await page.$$eval('#mgqrow .qbtn span', e => e.map(x => x.textContent)), ['Tests', 'Trends']); assert.ok(await page.evaluate(() => document.body.classList.contains('hasrbar')), 'page padded for the bar');
  await page.click('#tbpractice'); await page.waitForSelector('#practicepage'); assert.ok(await page.$('#prbig')); assert.deepStrictEqual(await page.$$eval('#prqrow .qbtn span', e => e.map(x => x.textContent)), ['Report', 'Trend']); assert.ok(await page.$('#tbpractice.on'), 'Practice tab on');
  assert.ok(await page.$('#plancard'), 'v203: the practice plan is on the page');
  await page.click('#qgotrends'); await page.waitForSelector('#trendspage'); assert.strictEqual(await page.$('#pagebar, #tabbar'), null, 'no bar on Trends');
  await page.click('#trback'); await page.waitForSelector('#practicepage'); await page.click('#prback'); await page.waitForSelector('#home'); await page.click('#tbmygame'); await page.waitForSelector('#mygame');
  await page.click('#tbstats'); await page.waitForSelector('#stats, .statspage, #stplayer', { timeout: 5000 }).catch(() => {}); assert.strictEqual(await page.$('#mygame'), null, 'Stats left My Game');
  await page.click('#navbtn').catch(() => {}); await page.goto(page.url()); await page.waitForSelector('#navbtn'); ok('v194: My Game / Practice bars');
  // Round stats: Edit round, quick view under the score, ☰ menu
  await page.click('#navbtn'); await page.click('#navmenu [data-act="history"]'); await page.waitForSelector('#histlist .hrow'); await page.click('.hrow .hist'); await page.waitForSelector('#rs-top');
  assert.strictEqual((await page.textContent('#editround')).trim(), 'Edit round'); assert.strictEqual(await page.$('[data-act="backHole"]:not(#editround)'), null, 'no "Back to the round"');
  assert.strictEqual(await page.$('#rspdftop'), null, 'PDF is not on the page'); assert.strictEqual(await page.$('#rplay'), null); assert.strictEqual(await page.$('#sumblrow'), null);
  const gap = await page.evaluate(() => document.getElementById('quickview').getBoundingClientRect().top - document.getElementById('rs-top').getBoundingClientRect().bottom); assert.ok(gap >= 0 && gap < 60, 'quick view under the score ' + gap);
  await page.click('#rsmenubtn'); assert.deepStrictEqual(await page.$$eval('#rsmenu .sheet-item', e => e.map(x => x.id || x.textContent)), ['rspdftop', 'storybtn', 'Rounds', 'Home']);
  assert.ok(await page.$('#rsmenu #sumbl') && await page.$('#rsmenu #rplay'), 'strokes gained + round type in ☰');
  await page.click('#rsmenu #rplay [data-v="tournament"]'); assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].play), 'tournament'); assert.ok(await page.$('#rsmenu'), 'menu stays open to see the change');
  await page.selectOption('#rsmenu #sumbl', 'scm'); assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].baseline), 'scm');
  await page.$eval('.rsback', e => e.click()); assert.strictEqual(await page.$('#rsmenu'), null); ok('Round stats: Edit round, quick view under the score, ☰ with PDF, story, strokes gained, round type, Rounds, Home');
  // one tap: a stat row with a map opens it; Penalty still expands
  await page.click('[data-stx="fw"] .stxh'); await page.waitForSelector('#mapview'); await page.click('[data-act="mapclose"]');
  await page.click('[data-stx="pen"] .stxh'); assert.ok(await page.$('[data-stx="pen"] .stxb')); ok('one tap opens a stat map');
  // replay: header pinned while scrolled, starts at the top, the hole fits, swipe changes holes
  await page.click('#sumreplay'); await page.waitForSelector('#replaymap');
  const fit = await page.evaluate(() => { const m = document.getElementById('replaymap').getBoundingClientRect(); return m.bottom <= innerHeight + 1; }); assert.ok(fit, 'the hole fits the screen');
  await page.click('#replayview .rpnav button:last-of-type'); await page.waitForTimeout(150); assert.match(await page.textContent('#replayview .maphead'), /Hole 2 replay/);
  assert.strictEqual(await page.$eval('#replayview', e => e.scrollTop), 0, 'starts at the top');
  await page.$eval('#replayview', e => { e.scrollTop = 600; }); await page.waitForTimeout(100);
  const pinned = await page.evaluate(() => document.querySelector('#replayview .rpnav').getBoundingClientRect().top); assert.ok(pinned >= 0 && pinned < 120, 'arrows stay at the top ' + pinned);
  const swipe = (dx) => page.evaluate((dx) => { const el = document.getElementById('replaymap'), t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(200)], changedTouches: [t(200)], bubbles: true })); el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(200 + dx)], bubbles: true })); }, dx);
  await swipe(-150); await page.waitForTimeout(150); assert.match(await page.textContent('#replayview .maphead'), /Hole 3 replay/, 'swipe left = next hole');
  await swipe(150); await page.waitForTimeout(150); assert.match(await page.textContent('#replayview .maphead'), /Hole 2 replay/, 'swipe right = previous hole'); ok('replay: pinned arrows, fits, swipes');
  await page.click('[data-act="rpclose"]'); await page.click('#editround'); await page.waitForTimeout(200); assert.ok(await page.$('[data-act="holeback"], #holeback'), 'Edit round opens the holes'); ok('Edit round opens the holes');
  assert.deepStrictEqual(errors, []); await browser.close(); srv.kill(); console.log('PASS menus-focused');
})().catch(e => { console.error(e); process.exit(1); });
