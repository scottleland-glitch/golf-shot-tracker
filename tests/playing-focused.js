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
    await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); localStorage.setItem('golfsg.practice.v1', JSON.stringify([{ id: 'x1', date: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), player: 'Scott', spoke: 'chip', focus: '', min: 90 }, { id: 'x2', date: new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10), player: 'Scott', spoke: 'lag', focus: '', min: 60 }])); }, rounds);
    await page.reload(); await page.waitForSelector('#home');
    // My Game – v184 weekly play + practice in hours (18 holes = 5 h), sideways-scrolling weeks, benchmark only when asked for
    await page.click('[data-act="mygame"]'); await page.waitForSelector('#plweeks'); await page.click('[data-act="mgperiod"][data-v="30d"]'); await page.waitForSelector('#plweeks');
    assert.strictEqual(await page.textContent('#plhead'), '0.1 h of practice for every hour on the course');
    assert.strictEqual(await page.textContent('#pllede'), 'Last 12 weeks: 28 h on the course (5½ rounds) and 2½ h of practice.');
    assert.strictEqual(await page.$$eval('#plweeks .plbenchl', e => e.length), 0, 'no benchmark until asked'); assert.strictEqual(await page.getAttribute('#plbtog', 'aria-pressed'), 'false');
    const bars = await page.$$eval('#plweeks .plbar', e => e.map(x => [x.getAttribute('data-k'), +x.getAttribute('data-v')]));
    const tot = k => bars.filter(c => c[0] === k).reduce((a, c) => a + c[1], 0);
    assert.deepStrictEqual([tot('tournament'), tot('practice'), tot('untagged'), tot('prac')], [10, 12.5, 5, 2.5], 'hours by type: 9 holes = 2½ h; practice beside');
    assert.strictEqual(await page.$$eval('#plweeks .plhit', e => e.length), 16, 'at least 16 weeks');
    const sc = await page.$eval('#plscroll', e => [e.scrollWidth > e.clientWidth, Math.abs(e.scrollLeft) < 2]); assert.deepStrictEqual(sc, [true, true], 'the weeks scroll; opens at the newest');
    assert.match(await page.textContent('#plweektxt'), /^This week: /);
    await page.$eval('#plscroll', e => { e.scrollLeft = -120; }); const sl = await page.$eval('#plscroll', e => e.scrollLeft);
    await page.$eval('#plweeks .plhit[data-v="13"]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true }))); assert.match(await page.textContent('#plweektxt'), /^Week of /);
    assert.strictEqual(await page.$eval('#plscroll', e => e.scrollLeft), sl, 'tapping a week keeps the scroll'); ok('tap a week for its numbers');
    await page.click('#plbtog'); await page.waitForSelector('#plbtog.on');
    assert.strictEqual(await page.$$eval('#plweeks .plbenchl', e => e.length), 1, 'benchmark as a dashed line'); assert.match(await page.textContent('#pllede'), /PGA Tour players spend about \d+ h in tournament rounds/);
    assert.ok(await page.$('#plhow')); await page.reload(); await page.click('[data-act="mygame"]'); await page.waitForSelector('#plbtog.on'); ok('benchmark comparison is opt-in and remembered');
    await page.click('#plbtog'); await page.waitForSelector('#plbtog:not(.on)');
    ok('weekly chart: hours on the course by type + practice logged');
    assert.match(await page.textContent('#pluntag'), /1 older round isn’t tagged/); ok('untagged rounds are pointed out, not guessed');
    assert.match(await page.textContent('#plcmphead'), /^Tournament rounds average \d+\.\d higher$/); assert.match(await page.textContent('#plcmplede'), /biggest drop is putting.*Early read/);
    assert.ok(await page.$('#plcmpt tr.plworst[data-k="putting"]'), 'putting row highlighted');
    assert.match(await page.textContent('#plcmpt thead'), /Practice\s*3 rounds.*Tournament\s*2 rounds/); ok('tournament vs practice: score, SG by area, worst area named');
    const box = await page.locator('#plcmp').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390, 'comparison fits the phone');
    // Round list tag + Round type on Round stats
    await page.click('[data-act="home"]'); if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="history"]');
    assert.strictEqual(await page.$$eval('#histlist .htour', e => e.length), 2, 'trophy on the two tournament rounds');
    await page.click('#histlist [data-act="open"][data-id="u1"]'); await page.waitForSelector('#rplay');
    assert.strictEqual(await page.$('#rplay button.sel'), null, 'untagged round: nothing picked');
    // v165: Create PDF report sits at the top of Round stats, above the score
    const yy = await page.evaluate(() => [document.querySelector('#rspdftop').getBoundingClientRect().top, document.querySelector('#rs-top').getBoundingClientRect().top]);
    assert.ok(yy[0] < yy[1] && yy[0] < 300, 'PDF button at the top ' + yy); ok('Create PDF report at the top of Round stats');
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
