// v221 (Scott): the Practice page from the top down – "Your week ahead" (Mondays), "Your game and your training", This week, More.
// iPhone 390x844. Run: node tests/weekahead-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const PORT = 8876, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m), DAY = 864e5;
const now = Date.now(), d0 = new Date(now); d0.setHours(0, 0, 0, 0); const monday = d0.getTime() - ((d0.getDay() + 6) % 7) * DAY;
const at = (id, t) => Object.assign(ARC.round(), { id, player: 'Scott', baseline: 'pga', date: new Date(t).toISOString() });
const R = [at('a', monday - 2 * DAY + 12 * 36e5), at('b', monday - 9 * DAY), at('c', monday - 20 * DAY), at('d', monday - 35 * DAY)];
const L = []; for (let w = 1; w <= 6; w++) ['short', 'lag', 'chip'].forEach((k, i) => L.push({ id: 'l' + w + k, date: new Date(monday - w * 7 * DAY + (i + 1) * DAY + 12 * 36e5).toISOString().slice(0, 10) + 'T12:00:00', player: 'Scott', spoke: k, focus: k, min: 30 }));
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '?x=' + now);
    await page.evaluate(([R, L]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(L)); }, [R, L]);
    await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#wacard');
    // order: week ahead, game and training, this week, more
    const order = await page.$$eval('#practicepage > .card, #practicepage > .mgchart', e => e.map(x => x.id).filter(Boolean));
    assert.deepStrictEqual(order.filter(x => ['wacard', 'gapcard', 'plancard', 'weekcard', 'morecard'].includes(x)), ['wacard', 'gapcard', 'plancard', 'weekcard', 'morecard'], order.join());
    assert.match(await page.textContent('#wacard .waeye'), /^Your week ahead · \w{3} \d+–/); assert.ok((await page.textContent('#wahead')).length > 8);
    assert.ok(await page.$$eval('#wacard .warow', e => e.length) >= 5, 'this week\'s targets'); assert.ok((await page.textContent('#wawhy')).length > 20);
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no sideways scroll');
    await page.screenshot({ path: 'screenshots/v221-week-ahead.png' });
    ok('Monday: Your week ahead on top – headline, targets, why');
    assert.match(await page.textContent('#gaphead'), /cost(s)? you \d\.\d a round|No big gaps/); assert.strictEqual(await page.$$eval('#gapcard .gaprow', e => e.length), 7);
    assert.strictEqual(await page.$('#prvs'), null, 'the old % card is gone'); assert.strictEqual(await page.$('#practicepage #plcmp'), null, 'Tournament vs practice moved to Stats');
    await page.$eval('#gapcard', e => e.scrollIntoView()); await page.screenshot({ path: 'screenshots/v221-game-training.png' });
    ok('Your game and your training: 7 skills, lost a round + practice a week + arrow');
    // More: folded
    assert.strictEqual(await page.$('#prlist'), null); await page.click('#morerecent'); await page.waitForSelector('#prlist .prday'); await page.click('#morerecent'); assert.strictEqual(await page.$('#prlist'), null);
    ok('More: Recent practice opens and closes');
    // ✕ → gone, and stays gone this week
    await page.click('#waclose'); assert.strictEqual(await page.$('#wacard'), null); await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#gapcard'); assert.strictEqual(await page.$('#wacard'), null);
    ok('✕ closes it for the week');
    // a round after it was seen that moves an area 15+ min → back, "Updated after …"
    await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('golfsg.wkahead.v1')), k = Object.keys(S)[0]; Object.keys(S[k].tg).forEach(x => { S[k].tg[x] = 0; }); S[k].t = Date.now() - 36e5; localStorage.setItem('golfsg.wkahead.v1', JSON.stringify(S));
      const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')), n = Object.assign({}, R[0], { id: 'new', date: new Date().toISOString(), updated: new Date().toISOString() }); R.push(n); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); });
    await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#wacard'); assert.match(await page.textContent('#wacard .waeye'), /^Updated after \w+day's round$/);
    ok('a round that changes the week brings it back: Updated after …\'s round');
    // Start this week → closes it and opens today's session
    await page.click('#wago'); await page.waitForSelector('#sesssheet'); assert.strictEqual(await page.$('#wacard'), null); ok('Start this week → today\'s session');
    // logging practice this week hides a new week's card; recommendations off → no card
    await page.evaluate(() => { localStorage.removeItem('golfsg.wkahead.v1'); const L = JSON.parse(localStorage.getItem('golfsg.practice.v1')); L.push({ id: 'now', date: new Date().toISOString().slice(0, 10) + 'T12:00:00', player: 'Scott', spoke: 'short', focus: 'x', min: 20 }); localStorage.setItem('golfsg.practice.v1', JSON.stringify(L)); });
    await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#gapcard'); assert.strictEqual(await page.$('#wacard'), null, 'already practising this week');
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.practice.v1')).filter(x => x.id !== 'now'); localStorage.setItem('golfsg.practice.v1', JSON.stringify(L)); localStorage.setItem('golfsg.mode.v1', JSON.stringify({ scott: 'log' })); });
    await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#gapcard'); assert.strictEqual(await page.$('#wacard'), null, 'recommendations off');
    assert.doesNotMatch(await page.textContent('#gaphead'), / – /, 'no advice when recommendations are off');
    ok('no card once you\'ve practised this week, or with recommendations off');
    assert.deepStrictEqual(errors, []); console.log('WEEK AHEAD OK');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
