// v216 This week: tap a day → an easy-to-read recap. Recent practice: one line per day, tap to open, edit and delete.
// iPhone 390x844. Run: node tests/practicedays-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ROOT = __dirname + '/../', PORT = 8871, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
const iso = (d) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
const t = new Date(); t.setHours(12, 0, 0, 0); const mon = new Date(t); mon.setDate(t.getDate() - (t.getDay() + 6) % 7);
const day = (n) => { const d = new Date(mon); d.setDate(mon.getDate() + n); return d; };
// today and (if not Monday) Monday – plus 14 older days so "Show earlier days" appears
const today = iso(t), first = iso(mon), P = [
  { id: 'a1', date: today + 'T12:00:00', player: 'Scott', spoke: 'short', focus: 'Short putts', min: 30, type: 'reps', feel: 'great' },
  { id: 'a2', date: today + 'T12:00:00', player: 'Scott', spoke: 'drive', focus: 'Driving', min: 20, type: 'game' },
  { id: 'a3', date: today + 'T12:00:00', player: 'Scott', spoke: 'wedges', focus: 'Wedge distances', min: 15 }];
if (first !== today) P.push({ id: 'b1', date: first + 'T12:00:00', player: 'Scott', spoke: 'chip', focus: 'Chipping', min: 40, feel: 'ok' });
for (let i = 10; i < 24; i++) { const d = new Date(t); d.setDate(t.getDate() - i); P.push({ id: 'o' + i, date: iso(d) + 'T12:00:00', player: 'Scott', spoke: 'lag', focus: 'Lag putting', min: 20 }); }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(p => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.practice.v1', JSON.stringify(p)); }, P);
    await page.reload(); await page.waitForSelector('#home'); await page.click('#tbpractice'); await page.waitForSelector('#practicepage');
    // This week: one tap target per day that has practice
    const hits = await page.$$eval('.wkhit', x => x.map(e => +e.dataset.v)); assert.strictEqual(hits.length, first === today ? 1 : 2);
    const todayMs = new Date(t).setHours(0, 0, 0, 0); assert.ok(hits.includes(todayMs), 'today is tappable');
    await page.$eval('.wkhit[data-v="' + todayMs + '"]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForSelector('#dysheet'); await page.screenshot({ path: 'screenshots/v216-day-recap.png' });
    assert.ok(await page.evaluate(() => document.getElementById('dysheet').closest('#prsheets').parentNode === document.body), 'on body');
    assert.strictEqual(await page.textContent('#dysheet .dytot b'), '1h 5m'.replace('1h 5m', await page.evaluate(() => MYGAME.hm(65))));
    const rows = await page.$$eval('#dysheet .dylist li', x => x.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    assert.strictEqual(rows.length, 3); assert.match(rows.join(' | '), /Driving.*Game \/ pressure/); assert.match(rows.join(' | '), /Short putts.*Reps · 🔥 Great/); assert.match(rows.join(' | '), /Wedges Wedge distances/);
    assert.strictEqual(await page.$$eval('#dysheet button', x => x.length), 1, 'read only – just ✕'); assert.strictEqual(await page.$('#dysheet input'), null);
    assert.strictEqual(await page.$$eval('#dysheet .dybar i', x => x.length), 3, 'a bar by group');
    ok('tap today → recap: 3 lines, area · focus · kind · feel, no entry controls');
    await page.click('#prsheets .csback', { position: { x: 20, y: 20 } }); assert.strictEqual(await page.$('#dysheet'), null); ok('tap outside closes');
    // Recent practice: a line per day, the newest first, 10 days then Show earlier days
    await page.click('#morerecent'); const days = await page.$$eval('#prlist .prday', x => x.length); assert.strictEqual(days, 10);
    assert.match(await page.textContent('#prlist .prday:first-of-type .prdayh small'), /Driving · Wedges · Short putts/);
    await page.click('#prmoredays'); assert.strictEqual(await page.$$eval('#prlist .prday', x => x.length), P.length - (first === today ? 3 : 4) + (first === today ? 1 : 2));
    ok('Recent practice: one line per day, Show earlier days adds more');
    await page.click('#prlist .prday:first-of-type .prdayh'); assert.strictEqual(await page.$$eval('#prlist .prday.open .pritem2', x => x.length), 3);
    await page.screenshot({ path: 'screenshots/v216-recent-days.png' });
    // edit: minutes and feel, move to yesterday
    await page.click('#prlist .pritem2[data-id="a2"] [data-act="predit"]'); await page.waitForSelector('#presheet');
    await page.click('#presheet [data-act="predmin"][data-v="5"]'); await page.click('#presheet [data-act="predmin"][data-v="5"]');
    await page.click('#presheet [data-act="predfeel"][data-v="x|ok"]'); assert.strictEqual(await page.textContent('#predmin'), '30');
    await page.screenshot({ path: 'screenshots/v216-edit.png' });
    const y = new Date(t); y.setDate(t.getDate() - 1); await page.fill('#predate', iso(y)); await page.click('#predsave');
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')).find(x => x.id === 'a2'));
    assert.deepStrictEqual([e.min, e.feel, e.type, e.date], [30, 'ok', 'game', iso(y) + 'T12:00:00']); assert.strictEqual(await page.$('#presheet'), null);
    ok('Edit: minutes +10, feel, date → saved');
    // delete asks first
    await page.click('#prlist .pritem2[data-id="a3"] .prx'); await page.click('#prlist [data-act="prdelyes"]');
    assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')).some(x => x.id === 'a3'))));
    ok('Delete removes it');
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no sideways scroll');
    assert.deepStrictEqual(errors, []); console.log('practice days: all passed');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
