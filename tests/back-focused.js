// v187 (Scott): the phone Back button (Android / Samsung) steps back inside the app instead of closing it. Run: node tests/back-focused.js
const { chromium } = require('playwright-core'); const { spawn, execSync } = require('child_process'); const fs = require('fs'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), OUT = process.env.SHOTS || '/tmp/back-test', PORT = 8961; fs.mkdirSync(OUT, { recursive: true });
const T = require(REPO + '/shortgame.js'), ARC = require(REPO + '/tests/fixtures/arcade-78.js');
function make(id, date, q) { const t = T.blank(id, date, 'Scott', 'd1w');
  T.STATIONS.forEach((st) => { t.shots[st.id] = st.shots.map((spec, i) => { const j = ((i * 7 + id.length * 3) % 5) - 2;
    if (st.kind === 'lag') return { ft: Math.max(0.5, q.lag + j * 0.6), dir: i % 3 ? 'short' : 'long' };
    if (st.kind === 'ladder') return { n: q.ladder + (i - 1) };
    if (st.kind === 'updown') return { n: q.ud };
    if (st.kind === 'compass') return q.miss.includes(spec.line + spec.dist) ? { made: false, miss: spec.line === 'up' || spec.line === 'down' ? 'long' : 'low' } : { made: true };
    if (st.kind === 'bunker') return st.id === 'bkLong' && i < q.over ? { res: 'over' } : { ft: Math.max(1, q.bk + j * 1.5) };
    if (st.kind === 'wedge') return { ft: Math.max(2, q.wedge * spec.dist / 60 + j * 2), dir: ['short', 'shortleft', 'long', 'left', ''][i % 5] };
    return { ft: Math.max(1, (st.id === 'flop' ? q.flop : q.chip) + j) }; }); });
  t.done = true; t.cond = { green: 'medium', wind: 'calm' }; return t; }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const now = Date.now(), day = 86400000, iso = (d) => new Date(now - d * day).toISOString();
  const tests = [make('t1', iso(90), { lag: 3.2, ladder: 8, ud: 6, miss: ['up9'], over: 0, bk: 9, wedge: 11, flop: 8, chip: 5 }), make('t2', iso(60), { lag: 3.5, ladder: 8, ud: 6, miss: ['br9'], over: 0, bk: 9, wedge: 11, flop: 8, chip: 5 }),
    make('t3', iso(30), { lag: 3.4, ladder: 8, ud: 7, miss: ['bl9'], over: 1, bk: 9, wedge: 11, flop: 8, chip: 5 }), make('t4', iso(2), { lag: 3.6, ladder: 7, ud: 4, miss: ['down5', 'down7', 'down9'], over: 2, bk: 10, wedge: 12, flop: 9, chip: 5 })];
  const rounds = [0, 1, 2, 3].map(i => Object.assign(ARC.round(), { id: 'r' + i, player: 'Scott', date: iso(5 + i * 9) }));
  const practice = [['chip', 30, 3], ['lag', 20, 4], ['drive', 45, 6], ['short', 15, 10]].map((x, i) => ({ id: 'p' + i, date: iso(x[2]), player: 'Scott', spoke: x[0], focus: '', min: x[1] }));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000); const errors = [], outside = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.addInitScript(() => { let tapped = false; addEventListener('click', (e) => { if (e.isTrusted) tapped = true; }, true); const p = history.pushState.bind(history);
    history.pushState = function () { if (!tapped) window.__pushNoTap = (window.__pushNoTap || 0) + 1; tapped = false; return p.apply(null, arguments); }; }); // one push per real tap, like Chrome's rule
  await page.goto('http://127.0.0.1:' + PORT + '/?x=' + now);
  await page.evaluate(({ R, TS, PR }) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.sgtests.v1', JSON.stringify(TS)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(PR)); localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); }, { R: rounds, TS: tests, PR: practice });
  await page.reload(); await page.waitForSelector('#plusbtn');
  const ok = (m) => console.log('  ✓ ' + m), back = async () => { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(250); };
  const screen = () => page.evaluate(() => document.querySelector('#home') ? 'home' : document.querySelector('#mygame') ? 'mygame' : document.querySelector('#histlist') ? 'history' : document.querySelector('#sgtest') ? 'sgtest' : document.querySelector('#summary, .summarypage, [data-act="backHole"]') ? 'summary' : '?');
  assert.strictEqual(await page.evaluate(() => window.__golf.backTarget()), null, 'Home with nothing open: Back leaves the app');
  // Home → My Game → Back → Home
  await page.click('#mgcard'); await page.waitForSelector('#mygame'); await page.waitForTimeout(100);
  await back(); assert.strictEqual(await screen(), 'home'); assert.ok(page.url().startsWith('http://127.0.0.1'), 'still in the app'); ok('My Game → Back → Home');
  // a menu first closes, then the screen goes back
  await page.click('#mgcard'); await page.waitForSelector('#mygame'); await page.click('#pbgopractice'); await page.waitForSelector('#practicepage'); await page.waitForTimeout(100);
  await back(); assert.strictEqual(await screen(), 'mygame'); await back(); assert.strictEqual(await screen(), 'home'); ok('v194: My Game → Practice → Back → My Game → Back → Home');
  // Scott's example: My Game → Practice → Log practice → Back closes the sheet → Back, Back = Home
  await page.click('#mgcard'); await page.waitForSelector('#mygame'); await page.click('#pbgopractice'); await page.click('#pbprlog'); await page.waitForSelector('#prsheet'); await page.waitForTimeout(150);
  await back(); assert.strictEqual(await page.$('#prsheet'), null, 'log sheet closed'); assert.ok(await page.$('#practicepage'));
  await back(); assert.strictEqual(await screen(), 'mygame'); await back(); assert.strictEqual(await screen(), 'home'); ok('Log practice: Back closes it, then Practice → My Game → Home');
  // Trends from My Game and back
  await page.click('#mgcard'); await page.waitForSelector('#mygame'); await page.click('#pbgotrends'); await page.waitForSelector('#trendspage'); await page.waitForTimeout(100);
  await back(); assert.strictEqual(await screen(), 'mygame'); await back(); assert.strictEqual(await screen(), 'home'); ok('v194: Trends → Back → My Game');
  // Home's + menu
  await page.click('#plusbtn'); await page.waitForSelector('.sheet-item'); await page.waitForTimeout(100); await back();
  assert.strictEqual(await page.$('.sheet-back'), null); assert.strictEqual(await screen(), 'home'); ok('Home + menu → Back closes it');
  // Rounds → a round → Back → Rounds → Back → Home (two levels)
  await page.click('#navbtn'); await page.click('.sheet-item[data-act="history"]'); await page.waitForSelector('#histlist .hrow');
  await page.click('.hrow .hist'); await page.waitForSelector('#editround'); await page.waitForTimeout(100);
  await back(); await page.waitForSelector('#histlist'); assert.strictEqual(await screen(), 'history');
  await back(); assert.strictEqual(await screen(), 'home'); ok('round → Rounds → Home');
  // Scott's case: Rounds → round → scorecard → a hole → replay. Back closes the replay, Back is the scorecard where you left it, Back is Rounds, Back is Home
  await page.click('#navbtn'); await page.click('.sheet-item[data-act="history"]'); await page.waitForSelector('#histlist .hrow'); await page.click('.hrow .hist'); await page.waitForSelector('#scorecard');
  await page.$eval('#scorecard', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); const y0 = await page.evaluate(() => window.scrollY);
  await page.click('#scorecard [data-act="goHole"][data-i="4"]'); await page.waitForSelector('#holeback'); await page.waitForTimeout(150);
  const hole = () => page.evaluate(() => (document.body.innerText.match(/Hole \d+/) || [''])[0]);
  const h5 = await hole(); assert.match(h5, /5/);
  await page.locator('[data-act="replay"]').first().click(); await page.waitForSelector('[data-act="rpclose"]'); await page.waitForTimeout(150);
  await back(); assert.strictEqual(await page.$('[data-act="rpclose"]'), null, 'replay closed'); assert.ok(await page.$('#holeback'), 'still on the hole'); assert.strictEqual(await hole(), h5);
  await back(); await page.waitForSelector('#scorecard'); await page.waitForTimeout(200); assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - y0) < 40, 'back at the scorecard, same place');
  await back(); await page.waitForSelector('#histlist'); await back(); assert.strictEqual(await screen(), 'home'); ok('scorecard → hole → replay: Back, Back = scorecard; Back = Rounds; Back = Home');
  // a menu pick takes the menu's step: Home + → Rounds → Back = Home (not the menu again)
  await page.click('#navbtn'); await page.click('.sheet-item[data-act="history"]'); await page.waitForSelector('#histlist'); await page.waitForTimeout(150);
  await back(); assert.strictEqual(await screen(), 'home'); assert.strictEqual(await page.$('.sheet-back'), null, 'menu not reopened'); ok('+ menu → Rounds → Back = Home');
  // Tests (My Game's bar) → Back → My Game
  await page.click('#mgcard'); await page.waitForSelector('#mygame'); await page.click('#pbsgtlast'); await page.waitForSelector('#sgtest, #sgtresult'); await page.waitForTimeout(100);
  await back(); await page.waitForSelector('#mygame'); ok('v194: Tests → Back → My Game');
  // the app's own ‹ Home button leaves no spare step behind: one more Back from Home leaves
  await (async (P) => { if (!(await P.$('.topbar [data-act="home"]')) && await P.$('#rsmenubtn')) await P.click('#rsmenubtn'); return P.click('.topbar [data-act="home"], #rsmenu [data-act="home"]'); })(page) /* v191: in ☰ on Round stats */; await page.waitForSelector('#plusbtn'); await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => history.state.d), 0, 'spare entry dropped'); ok('on-screen Home: Back then leaves');
  // the app's own buttons keep the steps in line: My Game → ‹ Home leaves none; Rounds → round → ‹ Rounds → phone Back → Home
  await page.click('#mgcard'); await page.waitForSelector('#mygame'); await page.waitForTimeout(150); assert.strictEqual(await page.evaluate(() => history.state.d), 1, 'one step for My Game');
  await (async (P) => { if (!(await P.$('.topbar [data-act="home"]')) && await P.$('#rsmenubtn')) await P.click('#rsmenubtn'); return P.click('.topbar [data-act="home"], #rsmenu [data-act="home"]'); })(page) /* v191: in ☰ on Round stats */; await page.waitForSelector('#plusbtn'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => history.state.d), 0);
  await page.click('#navbtn'); await page.click('.sheet-item[data-act="history"]'); await page.waitForSelector('#histlist .hrow'); await page.waitForTimeout(150);
  await page.click('.hrow .hist'); await page.waitForSelector('#editround'); await page.waitForTimeout(150);
  await (async (P) => { if (!(await P.$('.topbar [data-act="history"]')) && await P.$('#rsmenubtn')) await P.click('#rsmenubtn'); return P.click('.topbar [data-act="history"], #rsmenu [data-act="history"]'); })(page) /* v191: in ☰ on Round stats */; await page.waitForSelector('#histlist'); await page.waitForTimeout(300);
  // v191: Rounds is now a pick from ☰ (a step forward, not the round's own back) – so Back retraces: the round, Rounds, Home
  await back(); await page.waitForSelector('#editround'); await back(); await page.waitForSelector('#histlist'); await back(); assert.strictEqual(await screen(), 'home'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => history.state.d), 0, 'nothing left over'); ok('on-screen buttons and the phone Back stay in step');
  // Android Chrome rule: no step is ever added without a tap
  const pushes = await page.evaluate(() => window.__pushNoTap || 0); assert.strictEqual(pushes, 0);
  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []);
  await browser.close(); srv.kill(); console.log('PASS back-focused');
})().catch(e => { console.error(e); try { srv.kill(); } catch (x) {} process.exit(1); });
