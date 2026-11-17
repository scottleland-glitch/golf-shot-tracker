// v232: Coach athlete-review tab bar has Practice in the middle slot; the user's own + is unchanged.
// Practice logs are already in the share payload. Run: node tests/coach-practice-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', OUT = '/tmp/coach-practice-shots/', PORT = 8879, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
fs.mkdirSync(OUT, { recursive: true });

function cloneRound(player, daysAgo, id) {
  const r = JSON.parse(JSON.stringify(ARC.round()));
  r.id = id; r.player = player; r.baseline = 'd1w';
  r.date = new Date(Date.now() - daysAgo * 864e5).toISOString();
  (r.holes || []).forEach(h => { h.finished = true; });
  return r;
}
function pracLogs(who) {
  const logs = [], now = Date.now();
  const week = [
    [['short', 30], ['wedges', 25], ['lag', 20]],
    [['irons', 25], ['chip', 20], ['short', 20]],
    [['drive', 20], ['wedges', 30], ['lag', 15]],
    [['short', 35], ['irons', 20], ['bunker', 15]]
  ];
  for (let w = 0; w < 12; w++) {
    const day = new Date(now - (w * 7 + 2) * 864e5).toISOString().slice(0, 10);
    week[w % week.length].forEach((pair, i) => {
      logs.push({ id: 'p' + w + i, date: day, player: who, spoke: pair[0], focus: '', min: pair[1], feel: 'ok' });
    });
  }
  return logs;
}
function athlete() {
  const who = 'Quincy Leland';
  const rounds = [0, 6, 13, 20, 27, 40, 55].map((d, i) => cloneRound(who, d, 'q' + i));
  return { uid: 'q1', name: who, profile: { bench: 'd1w', mode: 'full' }, member: { at: Date.now() - 90 * 864e5 },
    rounds, tests: [], practice: pracLogs(who) };
}
function tabs(page) {
  return page.$$eval('#tabbar > *', els => els.map(e => ({ id: e.id, tag: e.tagName, act: e.getAttribute('data-act'), t: (e.textContent || '').trim(), cls: e.className })));
}

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(String(e)));

    const scottRounds = [0, 8, 16, 24, 32, 45].map((d, i) => cloneRound('Scott', d, 's' + i));
    const scottPrac = pracLogs('Scott');
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(({ R, P }) => {
      localStorage.clear();
      localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R));
      localStorage.setItem('golfsg.practice.v1', JSON.stringify(P));
      localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' }));
    }, { R: scottRounds, P: scottPrac });
    await page.reload(); await page.waitForSelector('#home, #tabbar');
    if (!(await page.$('#tabbar'))) { await page.click('#tbmygame, [data-act="mygame"]').catch(() => {}); await page.waitForSelector('#tabbar'); }

    const own = await tabs(page);
    const ids = own.map(x => x.id);
    assert.ok(ids.includes('tbplus'), 'user tab bar keeps the + button');
    assert.ok(ids.includes('tbpractice'), 'user tab bar still has Practice');
    assert.ok(!ids.includes('tbtrends'), 'Trends is not a main tab when practice is on');
    assert.deepStrictEqual(ids, ['tbmygame', 'tbrounds', 'tbplus', 'tbpractice', 'tbstats']);
    assert.strictEqual(await page.$('.tbspace'), null);
    ok('user tab bar: My Game · Rounds · + · Practice · Stats');
    await page.locator('#tabbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: OUT + 'user-tabbar-plus.png' });
    ok('user + screenshot → ' + OUT + 'user-tabbar-plus.png');

    const snap = await page.evaluate(() => window.__golf.syncSnap('Scott'));
    assert.ok(Array.isArray(snap.practice) && snap.practice.length > 0, 'share payload includes practice logs');
    assert.ok(Array.isArray(snap.rounds) && snap.rounds.length > 0);
    ok('syncSnap already sends practice (' + snap.practice.length + ' logs)');

    const A = athlete();
    await page.evaluate(A => { window.__golf.enterAthlete(A); }, A);
    await page.waitForSelector('#tabbar');
    await page.waitForFunction(() => document.querySelector('#coswitch, .cmsw'));
    const coach = await tabs(page);
    const cids = coach.map(x => x.id);
    assert.ok(!cids.includes('tbplus'), 'coach review has no + button');
    assert.strictEqual(await page.$('.tbspace'), null, 'empty middle slot is gone');
    assert.deepStrictEqual(cids, ['tbmygame', 'tbrounds', 'tbpractice', 'tbtrends', 'tbstats']);
    assert.match(await page.textContent('#coswitch, .title'), /Quincy Leland/);
    assert.match(await page.textContent('#coswitch, .title'), /1 of 1/);
    ok('coach tab bar: My Game · Rounds · Practice · Trends · Stats');
    await page.screenshot({ path: OUT + 'coach-tabbar-practice.png' });
    ok('coach tab bar screenshot → ' + OUT + 'coach-tabbar-practice.png');

    await page.click('#tbpractice');
    await page.waitForSelector('#practicepage');
    assert.match(await page.textContent('#coswitch, .title'), /Practice/);
    assert.strictEqual(await page.$('#prsess, #prbig, #prplus, #prmode'), null, 'no log / session / mode controls in coach review');
    assert.ok(await page.$('#prcard, .prchart'), 'skill spider / My Practice card');
    assert.ok(await page.$('#wacard, .wabars'), 'week-ahead targets');
    assert.ok(await page.$('#gapcard, .gapcard'), 'strokes lost vs practice time');
    assert.ok(await page.$('#plancard, .plancard, #weekcard'), 'plan / this-week card');
    assert.ok(await page.$('#weekcard, .wkchart, .wkbars'), 'weekly bars / volume charts');
    assert.strictEqual(await page.$('#wago, #waclose, [data-act="planlog"]'), null, 'no Start this week / Log on the coach view');
    ok('coach Practice page reuses the existing charts, read only');
    await page.screenshot({ path: OUT + 'coach-practice-page.png', fullPage: true });
    ok('coach Practice page screenshot → ' + OUT + 'coach-practice-page.png');

    // swipe / jump the week card to the 3-month volume chart
    await page.evaluate(() => { const g = window.__golf.view(); g.wkPage = 2; window.__golf.render(); });
    await page.waitForSelector('#weekcard');
    assert.match(await page.textContent('#weekcard'), /Last 3 months|rolling 7 days|Putting|Woods|Irons/);
    await page.locator('#weekcard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: OUT + 'coach-practice-3month.png' });
    ok('3-month volume chart → ' + OUT + 'coach-practice-3month.png');

    await page.evaluate(() => window.__golf.exitAthlete());
    await page.waitForSelector('#tbplus');
    assert.deepStrictEqual((await tabs(page)).map(x => x.id), ['tbmygame', 'tbrounds', 'tbplus', 'tbpractice', 'tbstats']);
    ok('leaving the athlete restores the user + tab bar');

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('PASS coach-practice-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
