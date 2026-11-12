// v142/v143 Practice: + menu › Log practice → minutes per focus → Save → My Practice chart, strokes lost vs practice
// time, recent list (remove), and "Log this drill" on a round's takeaway. iPhone 390x844. Run: node tests/practice-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', PORT = 8854, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
const now = Date.now(), rounds = [];
for (let i = 0; i < 6; i++) rounds.push(Object.assign(ARC.round(), { id: 'g' + i, player: 'Scott', baseline: 'scm', date: new Date(now - (3 + i * 9) * 864e5).toISOString() }));
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
    await page.click('#navbtn'); assert.ok(await page.$('#navmenu [data-act="mygame"]'), '☰ has My Game'); await page.$eval('.sheet-back', e => e.click()); await page.click('#plusbtn'); assert.ok(await page.$('#plusmenu [data-act="prlog"]'), '+ has Log practice'); await page.$eval('.sheet-back', e => e.click()); await page.click('#plusbtn');
    await page.click('#plusmenu [data-act="prlog"]'); await page.waitForSelector('#prsheet');
    assert.ok(await page.$('#mygame') && await page.$('#prplus') && !(await page.$('#mgplus')), 'v194: the + on My Practice (no + menu)'); await page.click('[data-act="prcancel"]'); assert.strictEqual(await page.$('#prsheet'), null);
    await page.click('#prplus'); await page.waitForSelector('#prsheet');
    const bar = await page.evaluate(() => [document.querySelector('#mygame .topbar').getBoundingClientRect().bottom, document.querySelector('.prhead').getBoundingClientRect().top]);
    assert.ok(bar[1] >= bar[0], 'sheet title below the top bar ' + bar);
    await page.click('[data-act="prspoke"][data-v="irons"]');
    assert.deepStrictEqual(await page.$$eval('.prspoke[data-spoke="irons"] .prrow > span', x => x.map(e => e.childNodes[0].textContent)), ['Distance control', 'Mechanics']);
    assert.deepStrictEqual(await page.$$eval('.prspoke[data-spoke="irons"] .prrow > span small', x => x.map(e => e.textContent)), ['takeaway, swing plane, weight transfer…'], 'hint under Mechanics only');
    await page.click('[data-act="prspoke"][data-v="irons"]');
    assert.match(await page.textContent('#prtotal'), /Tap a skill/); assert.ok(await page.$eval('#prsave', x => x.disabled));
    const plus = async (key, n) => { for (let i = 0; i < n; i++) await page.click(`[data-act="prmin"][data-v="${key}"][data-k="5"]`); };
    await page.click('[data-act="prspoke"][data-v="chip"]'); await plus('chip|Green-side chipping', 6);
    await page.click('[data-act="prspoke"][data-v="lag"]'); await plus('lag|Lag putting', 4); await plus('lag|Putting speed control', 2);
    await page.click('[data-act="prmin"][data-v="lag|Putting speed control"][data-k="-5"]'); await plus('lag|Putting speed control', 1);
    assert.strictEqual(await page.textContent('#prtotal'), 'Total 1 h');
    assert.match(await page.textContent('.prspoke[data-spoke="lag"] .prsh'), /Lag putts\s*30 min/);
    ok('Log practice: 30 min chipping, 20 min lag putting, 10 min speed control = 1 h');
    await page.click('#prsave'); await page.waitForSelector('#prcard'); assert.strictEqual(await page.$('#prsheet'), null);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')));
    assert.strictEqual(saved.length, 3); assert.ok(saved.every(e => e.player === 'Scott' && /T12:00:00$/.test(e.date)));
    assert.deepStrictEqual(saved.map(e => e.focus + ' ' + e.min).sort(), ['Green-side chipping 30', 'Lag putting 20', 'Putting speed control 10']);
    // v155: the card shows the practice LEVEL (42-day decaying average) against the benchmark; 1 h today ≈ 10 min a week
    assert.strictEqual(await page.textContent('#prhead'), 'Practice level: 10 min a week');
    assert.match(await page.textContent('#prlede'), /average about \d+ h a week – you are at (under 1|\d+)% of that\. This week’s pace .* is building it up\.$/);
    assert.strictEqual(await page.textContent('#prlogged'), 'Last 3 months: 1 h in 1 session logged.');
    assert.ok(await page.$('#prcard .pbench'), 'benchmark ring drawn');
    assert.ok(await page.$('#prcard .pcur'), 'practice shape drawn');
    assert.strictEqual(await page.$('#prlist'), null, 'v194: the list is on the Practice page'); await page.click('#pbgopractice'); await page.waitForSelector('#practicepage');
    assert.strictEqual(await page.$$eval('#prlist .pritem', x => x.length), 3);
    ok('saved per player; My Practice: 1 h in 1 session, chipping 50%, 3 recent entries');
    assert.strictEqual(await page.textContent('#prvshead'), 'Practice more irons 100+');
    assert.match(await page.textContent('#prvslede'), /^Irons 100\+ is \d+% of your lost strokes but 0% of your practice\.$/);
    assert.ok(await page.$('.prbar.gap[data-spoke="irons"]'));
    ok('strokes lost vs practice time: irons flagged');
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no sideways scroll');
    await page.click('#prlist .prx'); assert.strictEqual(await page.$$eval('#prlist .pritem', x => x.length), 2);
    ok('× removes an entry');
    await page.click('#pbprlog'); await page.waitForSelector('#prsheet'); assert.ok(await page.$('#practicepage'), 'Log practice stays on the Practice page'); await page.click('[data-act="prcancel"]'); await page.click('#prback'); await page.waitForSelector('#mygame');
    // Log this drill from the newest round's takeaway
    await (async () => { if (await page.$('#holemore') && !(await page.$('#holemenu'))) await page.click('#holemore'); return page.click('[data-act="home"]'); })() /* v188: Home + Discard are in ⋯ during a round */; await page.click('#navbtn'); await page.click('#navmenu [data-act="history"]');
    await page.click('#histlist [data-act="open"][data-id="g0"]'); await page.waitForSelector('#prdrill');
    const label = await page.textContent('#prdrill'); assert.match(label, /Log this drill · /);
    await page.click('#prdrill'); await page.waitForSelector('#prsheet');
    const pre = await page.$$eval('.prrow.on', rows => rows.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
    const focus = label.split(' · ').pop().trim(), row = await page.$eval('.prrow.on span', x => x.textContent.trim());
    assert.strictEqual(pre.length, 1); assert.strictEqual(row, focus, 'the filled row is the drill\'s focus');
    assert.match(pre[0], /15 min/);
    ok('Log this drill opens the log with that focus at 15 min: ' + label.replace('⏱ ', ''));
    assert.deepStrictEqual(errors, [], 'no page errors'); console.log('PASS practice-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
