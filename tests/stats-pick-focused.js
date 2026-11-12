// v165 Stats → Choose rounds: tick any rounds (or tap an event: same course on back-to-back days, e.g. a 54-hole tournament)
// to review them together; the line under the range shows the total; Create PDF makes a report of just those rounds.
// Run: node tests/stats-pick-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn, execSync } = require('child_process'); const fs = require('fs');
const PORT = 8898, BASE = 'http://127.0.0.1:' + PORT + '/', TMP = '/tmp/stats-pick-test';
const SEED = fs.readFileSync(__dirname + '/fixtures/stats-rounds.js', 'utf8');
const ok = m => console.log('  ✓ ' + m);
(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(SEED);
    // a 54-hole tournament: Paradise Valley, Nov 6–8 (copies of three rounds), plus a lone round there a week later
    await page.evaluate(() => { const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')), by = id => JSON.parse(JSON.stringify(rs.find(r => r.id === id)));
      [['t1', 's5', '2026-11-06T17:00:00.000Z'], ['t2', 's6', '2026-11-07T17:00:00.000Z'], ['t3', 's7', '2026-11-08T17:00:00.000Z'], ['t9', 's4', '2026-11-15T17:00:00.000Z']].forEach(([id, from, date]) => rs.push(Object.assign(by(from), { id, date, course: 'Paradise Valley', play: 'tournament' })));
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); });
    await page.reload(); await page.waitForSelector('#tbplus'); await page.click('#navbtn'); await page.click('#navmenu [data-act="stats"]'); await page.waitForSelector('#statspage');
    assert.deepStrictEqual(await page.$$eval('#strange button', e => e.map(x => x.textContent)), ['All rounds', 'Last 5', 'One round', 'Choose rounds']);
    await page.click('#strange [data-v="pick"]'); await page.waitForSelector('#stpicknone'); assert.strictEqual(await page.$('.stcat'), null, 'nothing chosen yet: no graphs');
    // the event shortcut
    const ev = await page.$$eval('#stevents .stevent', e => e.map(x => x.textContent)); assert.deepStrictEqual(ev, ['Paradise Valley11/6–11/8 · 3 rounds · 54 holes']); ok('event found: same course, back-to-back days');
    await page.click('#stevents .stevent'); await page.waitForSelector('.stcat');
    const sc = await page.evaluate(() => window.__golf.statsData().shown.map(p => [p.id, p.score, p.toPar]));
    assert.deepStrictEqual(sc.map(x => x[0]), ['t1', 't2', 't3']);
    const tot = sc.reduce((a, x) => a + x[1], 0), par = sc.reduce((a, x) => a + x[2], 0), tp = par > 0 ? '+' + par : par === 0 ? 'E' : String(par);
    assert.strictEqual(await page.textContent('#stshown'), '3 rounds · 54 holes · total ' + tot + ' (' + tp + ') · ' + sc.map(x => x[1]).join('-') + ' · Paradise Valley · Nov 6, 2026 – Nov 8, 2026');
    assert.strictEqual(await page.getAttribute('#stevents .stevent', 'aria-pressed'), 'true');
    if (process.env.SHOTDIR) { await page.$eval('#stshown', e => e.scrollIntoView({ block: 'center' })); await page.screenshot({ path: process.env.SHOTDIR + '/pick-page.png' }); }
    assert.match(await page.textContent('#st-tot'), /Selected avg/); ok('the three rounds are reviewed together, with the 54-hole total');
    // tick / untick in the list
    await page.click('#stpicklist [data-id="t9"]'); assert.strictEqual(await page.evaluate(() => window.__golf.statsData().shown.length), 4);
    assert.strictEqual(await page.getAttribute('#stevents .stevent', 'aria-pressed'), 'false'); await page.click('#stpicklist [data-id="t9"]');
    assert.strictEqual(await page.getAttribute('#stpicklist [data-id="t9"]', 'aria-checked'), 'false'); ok('tick and untick single rounds');
    // PDF of just these rounds
    await page.click('#stpdf'); await page.waitForSelector('#pdfname');
    const R = await page.evaluate(async () => { const p = window.__golf.lastPdf; return { name: p.name, b: Array.from(new Uint8Array(await p.blob.arrayBuffer())) }; });
    assert.match(R.name, /^Golf-Stats-\d{4}-\d\d-\d\d-Paradise-Valley-54-holes-Scott\.pdf$/, R.name);
    const f = TMP + '/pick.pdf'; fs.writeFileSync(f, Buffer.from(R.b)); const flat = execSync('pdftotext -layout ' + f + ' -').toString().replace(/\s+/g, ' ');
    assert.ok(flat.includes('Paradise Valley · 54 holes'), 'range in the PDF'); assert.ok(flat.includes('total ' + tot + ' (' + tp + ')'), 'total in the PDF');
    ok('Create PDF: a report of just those rounds'); if (process.env.SHOTDIR) { fs.copyFileSync(f, process.env.SHOTDIR + '/pick.pdf'); }
    await page.click('[data-act="pdfclose"]'); await page.click('.stpickclr'); await page.waitForSelector('#stpicknone');
    assert.deepStrictEqual(errors, []); console.log('PASS stats-pick-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
