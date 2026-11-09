// v162 My Game Playing: rounds are tagged Practice / Tournament (new-round sheet, Round stats, round list), My Game shows holes
// played per type filling up like the practice chart, with last period's marker, and how tournament rounds compare. iPhone 390x844.
// Run: node tests/playing-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8897, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
const now = Date.now(), at = (id, daysAgo, play) => Object.assign(ARC.round(), { id, player: 'Scott', baseline: 'pga', date: new Date(now - daysAgo * 864e5).toISOString() }, play ? { play } : {});
const extraPutt = r => { r.holes.forEach(h => { const k = h.rows.findIndex(x => x.loc === 'holed'); if (k > 0) h.rows.splice(k, 0, { dist: 4, loc: 'green', dir: '', pen: false }); }); return r; };
const nine = r => { r.holes = r.holes.slice(0, 9); return r; };
// last 30 days: 1½ practice, 2 tournament (an extra putt a hole), 1 untagged; the 30 days before: 1 practice
const rounds = [at('p1', 2, 'practice'), nine(at('p2', 6, 'practice')), extraPutt(at('t1', 4, 'tournament')), extraPutt(at('t2', 11, 'tournament')), at('u1', 15), at('p0', 40, 'practice')];
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, rounds);
    await page.reload(); await page.waitForSelector('#home');
    // My Game – 30 days
    await page.click('[data-act="mygame"]'); await page.waitForSelector('#plcard'); await page.click('[data-act="mgperiod"][data-v="30d"]'); await page.waitForSelector('#plcard');
    assert.strictEqual(await page.textContent('#plhead'), '3½ rounds · 63 holes played');
    assert.match(await page.textContent('#pllede'), /^57% of it in tournaments\. 18 holes in the previous 30 days\.$/);
    const bar = k => page.$eval('.plrow[data-k="' + k + '"]', e => ({ t: e.querySelector('.pltop span').textContent, w: parseFloat(e.querySelector('.plfill').style.width), p: e.querySelector('.plprev') ? parseFloat(e.querySelector('.plprev').style.left) : null }));
    const P = await bar('practice'), T = await bar('tournament');
    assert.strictEqual(P.t, '1½ rounds · 27 holes'); assert.strictEqual(T.t, '2 rounds · 36 holes');
    assert.strictEqual(T.w, 100); assert.ok(Math.abs(P.w - 75) < 0.1); assert.ok(Math.abs(P.p - 50) < 0.1, 'last period marker at 18 of 36'); assert.strictEqual(T.p, 0);
    ok('bars: holes per type, 9 holes = ½ round, busiest bar full, last-period marker');
    assert.match(await page.textContent('#pluntag'), /1 older round isn’t tagged/); ok('untagged rounds are pointed out, not guessed');
    assert.match(await page.textContent('#plcmphead'), /^Tournament rounds average \d+\.\d higher$/); assert.match(await page.textContent('#plcmplede'), /biggest drop is putting.*Early read/);
    assert.ok(await page.$('#plcmpt tr.plworst[data-k="putting"]'), 'putting row highlighted');
    assert.match(await page.textContent('#plcmpt thead'), /Practice\s*2 rounds.*Tournament\s*2 rounds/); ok('tournament vs practice: score, SG by area, worst area named');
    const box = await page.locator('#plcmp').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390, 'comparison fits the phone');
    await page.$eval('#plcard', e => e.scrollIntoView()); await page.screenshot({ path: OUT + 'v162-playing.png' });
    // Round list tag + Round type on Round stats
    await page.click('[data-act="home"]'); if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="history"]');
    assert.strictEqual(await page.$$eval('#histlist .htour', e => e.length), 2, 'trophy on the two tournament rounds');
    await page.click('#histlist [data-act="open"][data-id="u1"]'); await page.waitForSelector('#rplay');
    assert.strictEqual(await page.$('#rplay button.sel'), null, 'untagged round: nothing picked');
    await page.click('#rplay [data-v="tournament"]'); await page.waitForSelector('#rplay [data-v="tournament"].sel');
    assert.strictEqual(await page.evaluate(() => window.__golf.rounds().find(r => r.id === 'u1').play), 'tournament'); ok('Round stats: Round type tags an older round');
    // New round sheet: remembers the last pick, keeps a typed course name
    await page.click('[data-act="home"]'); if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('#newplay');
    assert.strictEqual(await page.getAttribute('#newplay [data-v="practice"]', 'aria-pressed'), 'true', 'practice by default');
    await page.fill('#course', 'Wolf Run'); await page.click('#newplay [data-v="tournament"]');
    assert.strictEqual(await page.inputValue('#course'), 'Wolf Run'); await page.click('[data-act="new"]'); await page.waitForSelector('#shotcard');
    let nr = await page.evaluate(() => window.__golf.rounds()[0]); assert.deepStrictEqual([nr.course, nr.play], ['Wolf Run', 'tournament']);
    await page.click('[data-act="home"]'); if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('#newplay');
    assert.strictEqual(await page.getAttribute('#newplay [data-v="tournament"]', 'aria-pressed'), 'true', 'remembers the last pick');
    ok('new round: Practice / Tournament pick, remembered, saved on the round');
    assert.deepStrictEqual(errors, [], 'no page errors'); console.log('PASS playing-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
