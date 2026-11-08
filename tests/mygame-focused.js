// v141 My Game: Home card → page with the six-spoke shape, time frames, previous period and change tiles. iPhone 390x844.
// Run: node tests/mygame-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8853, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
// 12 rounds, one every 12 days; the 5 newest chip it close and hole the putt on every other hole
const now = Date.now(), rounds = [];
for (let i = 0; i < 12; i++) {
  const r = Object.assign(ARC.round(), { id: 'g' + i, player: 'Scott', baseline: 'scm', date: new Date(now - (3 + i * 12) * 864e5).toISOString() });
  if (i < 5) r.holes.forEach((h, j) => { if (j % 2) return; const rows = h.rows, k = rows.findIndex(x => x.loc === 'green' || x.loc === 'holed'); if (k > 1 && rows[k - 1].dist <= 30) h.rows = rows.slice(0, k).concat([{ dist: 3, loc: 'holed', dir: '', pen: false }]); });
  rounds.push(r);
}
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    const load = async (rs) => {
      await page.goto(BASE + '?x=' + Date.now());
      await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, rs);
      await page.reload(); await page.waitForSelector('#home');
    };
    await load([]); assert.strictEqual(await page.$('#mgcard'), null); ok('no finished rounds: no My Game card on Home');
    await load(rounds);
    assert.match(await page.textContent('#mgcard'), /My Game\s*Chipping is improving\s*Last 3 months · 8 rounds/);
    const card = await page.locator('#mgcard').boundingBox(); assert.ok(card.x >= 16 && card.x + card.width <= 374, 'card fits the screen');
    await page.screenshot({ path: OUT + 'mygame-home.png' });
    ok('Home card: mini shape, headline, 3 months · 8 rounds');
    await page.click('#mgcard'); await page.waitForSelector('#mygame');
    assert.strictEqual(await page.textContent('#mghead'), 'Chipping is improving');
    assert.match(await page.textContent('#mglede'), /^Chipping is \d\.\d strokes a round better than the previous 3 months\.$/);
    assert.ok(await page.$('#mygame .rcur') && await page.$('#mygame .rprev') && await page.$('#mygame .rbench'), 'current, previous and benchmark shapes');
    assert.match(await page.textContent('.mgtile[data-t="score"]'), /74\.3.*↓ 3\.8 from 78\.0/);
    assert.ok(await page.$('.mgtile[data-t="score"] em.up'), 'a lower score is shown as better');
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no sideways scroll');
    await page.screenshot({ path: OUT + 'mygame-page.png', fullPage: true });
    assert.strictEqual(await page.$$eval('#mgknow .mgkb', x => x.length), 6, 'six knowledge bars');
    assert.match(await page.textContent('#mgready'), /^\d\/6 ready$/);
    ok('page: headline, three shapes, tiles with change, six knowledge bars');
    await page.click('#mgperiod [data-v="all"]');
    assert.match(await page.textContent('.title span'), /12 rounds/); assert.strictEqual(await page.$('#mygame .rprev'), null, 'all time has no previous shape');
    assert.strictEqual(await page.$('.mgtile em'), null);
    await page.click('#mgperiod [data-v="30d"]'); assert.match(await page.textContent('.title span'), /3 rounds/);
    const learn = await page.$$eval('#mgknow .mgkb.learn', x => x.length), rings = await page.$$eval('#mygame .rlearn', x => x.length);
    assert.strictEqual(rings, await page.$$eval('#mgknow .mgkb.learn', x => x.filter(e => !/no shots/.test(e.textContent)).length), 'a gold ring for every learning skill with shots');
    if (learn) assert.match(await page.textContent('.mglegend'), /Still learning/);
    ok('time frames: All time 12 rounds (no previous), 30 days 3 rounds');
    await page.selectOption('#mgbl', 'pga'); assert.match(await page.textContent('.mglegend'), /PGA Tour/);
    ok('Compared with changes the benchmark');
    await page.click('[data-act="home"]'); await page.waitForSelector('#home');
    assert.deepStrictEqual(errors, [], 'no page errors'); console.log('PASS mygame-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
