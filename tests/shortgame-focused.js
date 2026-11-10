// v166 Short game test in the browser: My Game card -> hub -> all 10 stations (73 shots) -> result with history. Port 8793.
// Run: node tests/shortgame-focused.js  (SHOTS=<dir> for screenshots, NO_SERVER=1 if a server is already on the port)
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const fs = require('fs'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), OUT = process.env.SHOTS || '/tmp/shortgame-test'; fs.mkdirSync(OUT, { recursive: true });
const SG = require(REPO + '/sg.js'), T = require(REPO + '/shortgame.js'), ARC = require(REPO + '/tests/fixtures/arcade-78.js');
function make(id, date, q) { const t = T.blank(id, date, 'Scott', 'scm');
  T.STATIONS.forEach((st) => { t.shots[st.id] = st.shots.map((spec, i) => {
    const j = ((i * 7 + id.length * 3) % 5) - 2;
    if (st.kind === 'lag') return { ft: Math.max(0.5, q.lag + j * 0.6), dir: i % 3 ? 'short' : 'long' };
    if (st.kind === 'ladder') return { n: q.ladder + (i - 1) };
    if (st.kind === 'compass') return q.miss.includes(spec.line + spec.dist) ? { made: false, miss: spec.line === 'up' || spec.line === 'down' ? 'right' : 'low' } : { made: true };
    if (st.kind === 'bunker') return st.id === 'bkLong' && i < q.over ? { res: 'over' } : { ft: Math.max(1, q.bk + j * 1.5) };
    if (st.kind === 'wedge') return { ft: Math.max(2, q.wedge * spec.dist / 60 + j * 2), dir: ['short', 'shortleft', 'long', 'left', ''][i % 5] };
    return { ft: Math.max(1, (st.id === 'flop' ? q.flop : q.chip) + j) }; }); });
  t.done = true; t.cond = { green: 'medium', wind: 'calm' }; return t; }
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8793', '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const tests = [make('t1', '2026-08-10T17:00:00Z', { lag: 3.2, ladder: 8, miss: ['up9', 'bl9'], over: 0, bk: 9, wedge: 11, flop: 8, chip: 5 }),
    make('t2', '2026-09-12T17:00:00Z', { lag: 3.9, ladder: 8, miss: ['down9', 'br9', 'bl7'], over: 1, bk: 9, wedge: 12, flop: 8.5, chip: 5 }),
    make('t3', '2026-10-11T17:00:00Z', { lag: 4.6, ladder: 7, miss: ['down7', 'br9'], over: 1, bk: 10, wedge: 11, flop: 10, chip: 4.5 })];
  const rounds = [0, 1, 2].map(i => Object.assign(ARC.round(), { id: 'r' + i, date: '2026-10-0' + (i + 1) + 'T17:00:00Z' }));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8793/?x=' + Date.now());
  await page.evaluate(({ R, TS }) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.sgtests.v1', JSON.stringify(TS)); }, { R: rounds, TS: process.env.EMPTY ? [] : tests });
  await page.reload();
  const shot = async (n, full) => page.screenshot({ path: OUT + '/' + n + '.png', fullPage: !!full });
  if (await page.$('#plusbtn')) await page.click('#plusbtn');
  assert.ok(await page.$('[data-act="sgtopen"]'), 'menu item'); await page.click('.sheet-item[data-act="mygame"]');
  await page.waitForSelector('#sgtmg'); await page.locator('#sgtmg').scrollIntoViewIfNeeded(); await shot('01-mygame-card');
  // v168: the first time, the test opens on its intro – four screens to swipe, Skip intro on each
  await page.click('#sgtopen'); await page.waitForSelector('#sgtintro'); await shot('01b-intro');
  assert.strictEqual(await page.$$eval('#sgtintro .sgtislide', e => e.length), 4); assert.ok(await page.$('#sgtintroskip'));
  for (let k = 0; k < 3; k++) { await page.click('#sgtintronext'); await page.waitForTimeout(600); } assert.strictEqual(await page.textContent('#sgtintronext'), 'Start');
  await page.click('#sgtintronext'); await page.waitForSelector('#sgtest'); await shot('02-hub', true);
  await page.click('#sgtintroopen'); await page.waitForSelector('#sgtintro'); await page.click('#sgtintroskip'); await page.waitForSelector('#sgtest');
  await page.click('[data-act="mygame"]'); await page.waitForSelector('#sgtmg'); await page.click('#sgtopen'); await page.waitForSelector('#sgtintro'); await page.click('#sgtintroskip'); await page.waitForSelector('#sgtest'); // v172: the intro runs every time
  await page.click('[data-act="sgtcond"][data-v="green:fast"]'); await page.click('#sgtstart'); await page.waitForSelector('#sgtrun'); await shot('03-lag-setup', true);
  const type = async (v) => { await page.fill('#sgtft', String(v)); };
  // lag
  // v168: three balls from each spot scored together (30, 40, 50 ft)
  const LV = [6, 4, 6, 7.5, 5, 7, 9, 8, 10];
  for (let g = 0; g < 3; g++) { assert.strictEqual(await page.textContent('#sgtwhat'), [30, 40, 50][g] + ' ft · three balls');
    for (let b = 0; b < 3; b++) { await page.fill('#sgtft' + b, String(LV[g * 3 + b])); await page.click('[data-act="sgtlagdir"][data-v="' + b + ':' + ((g * 3 + b) % 4 === 3 ? 'long' : 'short') + '"]'); }
    if (g === 1) await shot('04-lag-entry', true); await page.click('#sgtlagsave'); }
  await page.waitForSelector('#sgtdonecard'); await shot('05-lag-done', true); await page.click('#sgtnext');
  // ladder
  // v168: ladders flat, uphill, downhill
  for (const [n, lbl] of [[8, 'Flat'], [6, 'Uphill'], [4, 'Downhill']]) { assert.match(await page.textContent('#sgtwhat'), new RegExp('^' + lbl + ' ladder')); for (let k = 0; k < n; k++) await page.click('[data-act="sgtlad"][data-v="1"]'); if (n === 6) await shot('06-ladder', true); await page.click('#sgtladsave'); }
  await page.click('#sgtnext'); await shot('07-compass-setup', true);
  // v168: the setup explains why the putts go around the hole
  assert.ok(await page.$('#sgtwhy:not([open])')); await page.click('#sgtwhy summary'); assert.match(await page.textContent('#sgtwhy'), /every putt a fresh read/); await shot('07b-compass-why', true);
  // compass: miss downhill 7/9 and breaks-right 9
  const C = T.STATION.compass.shots;
  for (let i = 0; i < 16; i++) { const s = C[i], miss = (s.line === 'down' && s.dist >= 5) || (s.line === 'br' && s.dist === 9) || (s.line === 'bl' && s.dist === 9);
    if (i === 5) await shot('08-compass-entry', true);
    if (i === 0) { assert.match(await page.textContent('#sgtlongwhy summary'), /Long, or a left \/ right miss\?/); await page.click('#sgtlongwhy summary'); assert.match(await page.textContent('#sgtlongwhy'), /more than 18 inches past the hole/); await page.locator('#sgtlongwhy').scrollIntoViewIfNeeded(); await shot('08a-long-why'); }
    if (miss) await page.click('[data-act="sgtmiss"][data-v="' + (s.line === 'down' ? 'long' : 'low') + '"]'); else await page.click('#sgtmade'); }
  await page.click('#sgtnext');
  // chips
  for (const [id, vals] of [['chipShort', [3, 5, 4, 6, 2]], ['chipLong', [8, 12, 6, 9, 10]], ['flop', [14, 18, 9, 22, 12]], ['rough', [7, 9, 12, 6, 8]]]) {
    for (let i = 0; i < 5; i++) { await type(vals[i]); if (id === 'flop' && i === 1) { await shot('09-flop-entry', true); assert.ok(await page.$('[data-act="sgtsave"][data-v="fshort"]'), 'v168: flop has Didn’t reach the green'); } if (i === 0) await page.keyboard.press('Enter'); else await page.click('[data-act="sgtsave"][data-v=""]'); }
    await page.click('#sgtnext'); }
  // bunkers
  for (let i = 0; i < 5; i++) { await type([8, 12, 6, 10, 9][i]); await page.click('[data-act="sgtsave"][data-v=""]'); } await page.click('#sgtnext');
  for (let i = 0; i < 5; i++) { if (i === 1) await shot('10-bunker-entry', true); if (i < 3) await page.click('[data-act="sgtsave"][data-v="over"]'); else { await type(15); await page.click('[data-act="sgtsave"][data-v=""]'); } }
  await page.click('#sgtnext');
  // wedges
  const W = T.STATION.wedge.shots;
  for (let i = 0; i < 15; i++) { await type(Math.round(W[i].dist * (W[i].dist === 60 ? 0.42 : 0.2))); if (i === 2) await shot('11-wedge-entry', true); await page.click('[data-act="sgtsave"][data-v="dir:' + ['short', 'shortleft', 'short', 'left', 'long'][i % 5] + '"]'); }
  await page.waitForSelector('#sgtfinish'); await page.click('#sgtfinish'); await page.waitForSelector('#sgtresult');
  await shot('12-result', true);
  await page.click('[data-act="sgtrow"][data-v="lag"]'); await page.locator('.sgtbig').scrollIntoViewIfNeeded(); await shot('13-row-open');
  const head = await page.textContent('#sgthead'); assert.match(head, /slipping\.$/, head);
  assert.match(await page.evaluate(() => document.querySelector('#sgtcoach').innerText), /3 of 10 bunker shots flew the green/);
  assert.match(await page.evaluate(() => document.querySelector('#sgtcoach').innerText), /Speed ladder: 8 balls flat, 6 uphill, 4 downhill\.\s*Downhill speed is the leak/);
  assert.match(await page.evaluate(() => document.querySelector('#sgtplan').innerText), /1\. /);
  assert.equal(await page.locator('.sgtspider').count(), 5, 'overall + 2 putting + chipping + bunker spiders');
  // v168: putting = lag & speed (6 spokes) + short putts (4 lines)
  const sp = await page.evaluate(() => ['#sgtpsplag', '#sgtpspshort'].map(id => [...document.querySelectorAll(id + ' svg text')].filter(x => x.getAttribute('font-weight') === '600').map(x => x.textContent)));
  assert.deepStrictEqual(sp, [['Lag 30', 'Lag 40', 'Lag 50', 'Flat speed', 'Uphill speed', 'Downhill speed'], ['Uphill', 'Breaks right', 'Downhill', 'Breaks left']]);
  await page.locator('#sgtpsplag').screenshot({ path: OUT + '/12s-lag-speed.png' }); assert.match(await page.textContent('#sgtpsplag'), /4 balls · goal 12/, 'downhill ladder 4 against its best (9, in August) + 3'); assert.equal(await page.locator('#sgtwbars .sgtwb').count(), 5);
  // v168 (Scott): way off her own usual gets a warning with the pattern – downhill 1 of 4, all three misses long
  const wtxt = await page.textContent('#sgtwarn-putting'); assert.match(wtxt, /Downhill putts: 1 of 4 made/); assert.match(wtxt, /All 3 missed long/); assert.match(wtxt, /Way off your usual/); assert.match(wtxt, /Usually 3\.3 of 4 · last 3 tests/); // against her own usual, not the benchmark
  await page.locator('#sgtwarn-putting').scrollIntoViewIfNeeded(); await shot('12w-putting-warning');
  assert.ok(await page.locator('.sgtavg').count() >= 1, 'your average shows with 3 earlier tests');
  console.log('HEAD', head, '|', await page.textContent('#sgtsub'));
  console.log('PLAN', await page.evaluate(() => (document.querySelector('#sgtplan') || {}).innerText)); console.log('COACH', await page.evaluate(() => (document.querySelector('#sgtcoach') || {}).innerText));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.sgtests.v1'))); assert.equal(stored.length, 4); assert.equal(stored[3].done, true); assert.equal(stored[3].cond.green, 'fast'); assert.equal(stored[3].shots.wedge.filter(Boolean).length, 15);
  console.log('stored', stored.length, 'done', stored[stored.length - 1].done, 'green', stored[stored.length - 1].cond.green);
  // overflow check: nothing wider than the screen
  const wide = await page.evaluate(() => [...document.querySelectorAll('#app *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName).slice(0, 8)); assert.deepStrictEqual(wide, [], 'nothing wider than the screen');
  // v168: nothing in a result row runs past its tile (long benchmark names did)
  const spill = await page.evaluate(() => [...document.querySelectorAll('.sgtrow')].filter(r => { const card = r.closest('.sgtcard') || r.parentElement, cr = card.getBoundingClientRect(); return [...r.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > cr.right - 4); }).map(r => r.textContent.slice(0, 40)));
  assert.deepStrictEqual(spill, [], 'result rows stay inside their tile');
  await page.click('#sgthubbtn'); await shot('14-hub-after', true);
  // v170 (Scott): delete a test from its result page
  const nBefore = await page.locator('#sgthist .sgthrow').count();
  await page.click('#sgthist .sgthrow:last-child .sgthopen'); await page.locator('#sgtdelres').scrollIntoViewIfNeeded(); await shot('15-delete-button');
  await page.click('#sgtdelres'); await page.waitForSelector('#sgthist');
  assert.equal(await page.locator('#sgthist .sgthrow').count(), nBefore - 1, 'the test is gone');
  assert.deepStrictEqual(errors, []); console.log('PASS shortgame-focused'); await browser.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
