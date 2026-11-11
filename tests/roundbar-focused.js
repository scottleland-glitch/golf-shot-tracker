// v188 (Scott): the pinned round bar while a round is being entered – Back · Scorecard · Stats · Holes; ⋯ holds Home + Discard;
// Replay sits beside the next hole; Back (bar or phone) never goes past the hole being entered. Run: node tests/roundbar-focused.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), PORT = 8964, ARC = require('./fixtures/arcade-78.js');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const r = Object.assign(ARC.round(), { id: 'live1', player: 'Scott', date: new Date().toISOString() }); r.holes.forEach((h, i) => { if (i >= 9) { h.rows = h.rows.slice(0, 1); h.finished = false; } });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.dismiss());
  const ok = (m) => console.log('  ✓ ' + m), back = async () => { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(250); };
  await page.goto('http://127.0.0.1:' + PORT + '/?x=1');
  await page.evaluate((R) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([R])); localStorage.setItem('golfsg.current.v1', R.id); }, r);
  await page.reload(); await page.waitForSelector('#home'); assert.strictEqual(await page.$('#roundbar'), null, 'no bar on Home');
  await page.click('[data-act="resume"]'); await page.waitForSelector('#roundbar');
  const on = () => page.$$eval('#roundbar .rbbtn.on', e => e.map(x => x.id)); const hole = () => page.evaluate(() => (document.body.innerText.match(/Hole \d+/) || [''])[0]);
  assert.deepStrictEqual(await page.$$eval('#roundbar .rbbtn span', e => e.map(x => x.textContent)), ['Back', 'Scorecard', 'Stats', 'Holes']);
  assert.deepStrictEqual(await on(), ['rbholes']); assert.ok(await page.$eval('#rbback', e => e.disabled), 'Back off on the hole being entered');
  assert.strictEqual(await hole(), 'Hole 10');
  // the hole page: no Home / Scorecard & stats / Discard at the bottom; Replay beside the next hole; ⋯ = Home + Discard
  assert.strictEqual(await page.$('.row.sub [data-act="summary"]'), null); assert.strictEqual(await page.$('.discard'), null);
  assert.deepStrictEqual(await page.$$eval('#nextrow button', e => e.map(x => x.textContent)), ['‹ Hole 9', 'Hole 11 ›']); assert.ok(await page.$('.sc2 #rpcard, #rpcard'), 'replay under Next shot');
  await page.click('#holemore'); assert.deepStrictEqual(await page.$$eval('#holemenu .sheet-item', e => e.map(x => x.textContent)), ['Home', 'Discard round']);
  await page.click('.hmback', { position: { x: 20, y: 600 } }); assert.strictEqual(await page.$('#holemenu'), null); ok('hole page: bar, ⋯ menu, previous + next hole, replay under Next shot');
  // Scorecard on its own; Stats on their own
  await page.click('#rbcard'); await page.waitForSelector('#sumcardonly #scorecard'); assert.deepStrictEqual(await on(), ['rbcard']); assert.strictEqual(await page.$('#rsactions'), null, 'scorecard only');
  await page.click('#rbstats'); await page.waitForSelector('#rsactions'); assert.deepStrictEqual(await on(), ['rbstats']); assert.strictEqual(await page.$('#scorecard'), null, 'stats only');
  assert.strictEqual(await page.$('[data-act="backHole"]'), null, 'no "Back to the round" – Holes does it'); ok('Scorecard and Stats are separate screens');
  // scorecard → hole 5 → replay; bar Back closes nothing it shouldn't: phone Back closes the replay, bar Back = scorecard, bar Back = stats, Back = hole 10 – and stops
  await page.click('#rbcard'); await page.waitForSelector('#sumcardonly'); await page.click('#scorecard [data-act="goHole"][data-i="4"]'); await page.waitForTimeout(200);
  assert.strictEqual(await hole(), 'Hole 5'); assert.deepStrictEqual(await on(), []); assert.ok(!(await page.$eval('#rbback', e => e.disabled)));
  await page.locator('[data-act="replay"]').first().click(); await page.waitForSelector('[data-act="rpclose"]'); await page.waitForTimeout(150);
  await back(); assert.strictEqual(await page.$('[data-act="rpclose"]'), null); assert.strictEqual(await hole(), 'Hole 5');
  await page.click('#rbback'); await page.waitForSelector('#sumcardonly'); await page.waitForTimeout(200);
  await page.click('#rbback'); await page.waitForSelector('#rsactions'); await page.waitForTimeout(200);
  await page.click('#rbback'); await page.waitForSelector('#sumcardonly'); await page.waitForTimeout(200); // (the way here was hole → scorecard → stats → scorecard → hole 5)
  await page.click('#rbback'); await page.waitForTimeout(250); assert.strictEqual(await hole(), 'Hole 10'); assert.deepStrictEqual(await on(), ['rbholes']); ok('Back retraces every step: replay, hole 5, scorecard, stats, scorecard, the hole');
  // the phone Back stops at the hole being entered
  await back(); assert.strictEqual(await hole(), 'Hole 10'); assert.ok(await page.$('#roundbar'), 'still in the round'); await back(); assert.strictEqual(await hole(), 'Hole 10'); ok('phone Back stops at the hole');
  // Holes from anywhere: straight back to the hole being entered, and Back still stops there
  await page.click('#rbstats'); await page.waitForSelector('#rsactions'); await page.click('#rbcard'); await page.waitForSelector('#sumcardonly');
  await page.click('#scorecard [data-act="goHole"][data-i="2"]'); await page.waitForTimeout(200); await page.click('#rbholes'); await page.waitForTimeout(300);
  assert.strictEqual(await hole(), 'Hole 10'); await back(); assert.strictEqual(await hole(), 'Hole 10'); ok('Holes jumps back to the hole being entered');
  // ‹ › still move through holes; the bar follows the hole you're on
  await page.click('.topbar [data-act="next"]'); await page.waitForTimeout(150); assert.strictEqual(await hole(), 'Hole 11'); assert.deepStrictEqual(await on(), ['rbholes']);
  // ⋯ › Home leaves the round; a round opened from Rounds has no bar
  await page.click('#holemore'); await page.click('#holemenu [data-act="home"]'); await page.waitForSelector('#home'); assert.strictEqual(await page.$('#roundbar'), null); ok('⋯ › Home leaves; no bar on Home');
  assert.deepStrictEqual(errors, []); await browser.close(); srv.kill(); console.log('PASS roundbar-focused');
})().catch(e => { console.error(e); process.exit(1); });
