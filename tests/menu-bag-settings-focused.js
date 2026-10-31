// v102 navigation: Home keeps only the + button (and Resume when a round is going) – the old Archive pill is gone.
// + menu: New round · My Bag · Rounds · Settings. Profile is gone (it only held the player name, which Settings already has).
// Settings = the old Archive page renamed (title, Courses back button). My Bag has a "Bag | Wedge ladder" toggle at the top;
// the Wedge ladder is the existing Wedges view (40–110, High/Low flight, Edit). Screenshots 390x844 @3x.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BAG = require('../bag.js'), ARC = require('./fixtures/arcade-78.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8840, BASE = 'http://127.0.0.1:' + PORT + '/';

(async () => {
  const bagB = BAG.addClubs(BAG.blank(), [{ cat: 'dr', code: 'D', loft: 10.5 }, { cat: 'wo', code: '3W', loft: 15 }, { cat: 'ir', code: '7i', loft: 33 }, { cat: 'ir', code: '9i', loft: 41 },
    { cat: 'ir', code: 'PW', loft: 45 }, { cat: 'we', code: '50', loft: 50 }, { cat: 'we', code: '54', loft: 54 }, { cat: 'we', code: '58', loft: 58 }, { cat: 'pt', code: 'Putter' }]).bag;
  bagB.clubs.forEach(c => { c.carry = { D: 245, '3W': 220, '7i': 150, '9i': 128, PW: 115, '50': 102, '54': 88, '58': 74 }[c.code]; });
  const WJ = { v: 1, rows: { 50: { club: '58', ball: 'front', pos: 'p1', hinge: '45' }, 70: { club: '54', ball: 'middle', lean: '1-2', pos: 'p2', hinge: '90' }, 100: { club: 'PW', ball: 'middle', pos: 'p3', hinge: 'full' } }, low: { 70: { club: '58', ball: 'back', pos: 'p1' } } };
  const R = [Object.assign(ARC.round(), { id: 'a1', date: '2026-10-20T16:00:00.000Z' })];
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route(/^https:\/\/([a-z0-9-]+\.)?(google|googleapis|microsoft|live|microsoftonline)\.com\//, route => { errors.push('unexpected outside call ' + route.request().url()); route.abort(); });
  await ctx.addInitScript(([rs, bg, wj]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.bag.v1', JSON.stringify(bg)); localStorage.setItem('golfsg.wedges.v1', JSON.stringify(wj)); } }, [R, bagB, WJ]);
  const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  P.on('dialog', d => d.accept());
  const shot = async name => { await P.waitForFunction(() => !document.querySelector('#toast.show')); await P.waitForTimeout(400); await P.screenshot({ path: OUT + name }); };
  const vis = () => P.evaluate(() => document.getElementById('app').innerText);
  await P.goto(BASE + 'index.html'); await P.waitForSelector('#plusbtn');

  // ---------- 1. Home + menu ----------
  assert.deepStrictEqual(await P.$$eval('#home button', e => e.map(x => x.id)), ['plusbtn'], 'Home: only the + button');
  assert.strictEqual(await P.$('#archivepill'), null); assert(!/Archive/.test(await vis()));
  await P.click('#plusbtn'); await P.waitForSelector('#plusmenu');
  assert.deepStrictEqual(await P.$$eval('#plusmenu button', e => e.map(x => [x.textContent, x.dataset.act])), [['New round', 'newform'], ['Rounds', 'history'], ['Stats', 'stats'], ['My Bag', 'bag'], ['Settings', 'archive']]);
  await shot('menu-new.png');
  console.log('  home: only +; menu New round · Rounds · Stats · My Bag · Settings');

  // ---------- 2. My Bag: Bag tab ----------
  await P.click('#plusmenu [data-act="bag"]'); await P.waitForSelector('#baglist');
  const seg = () => P.$$eval('#bagseg button', e => e.map(x => x.textContent + (x.getAttribute('aria-selected') === 'true' ? '*' : '')));
  assert.deepStrictEqual(await seg(), ['Bag*', 'Wedge ladder']);
  assert.match(await P.textContent('.topbar'), /‹ Home\s*My Bag\s*9 clubs/);
  assert.strictEqual(await P.$$eval('#baglist .bagrow:not(.bhead)', e => e.length), 9);
  const segBox = await P.$eval('#bagseg', e => e.getBoundingClientRect().top); assert(segBox < 160, 'toggle sits at the top: ' + segBox);
  // a bag feature still works: change a carry
  await P.fill('#baglist input[data-bc="carry"][aria-label^="7i"]', '152'); await P.press('#baglist input[data-bc="carry"][aria-label^="7i"]', 'Tab');
  await P.waitForFunction(() => JSON.parse(localStorage.getItem('golfsg.bag.v1')).clubs.find(c => c.code === '7i').carry === 152);
  await P.evaluate(() => window.scrollTo(0, 0)); await shot('bag-toggle-bag.png');
  console.log('  My Bag: Bag tab first, 9 clubs, carry edit saves');

  // ---------- 3. Wedge ladder tab ----------
  await P.click('#segwedges'); await P.waitForSelector('#wlist');
  assert.deepStrictEqual(await seg(), ['Bag', 'Wedge ladder*']); assert.strictEqual(await P.$('#baglist'), null);
  assert.match(await P.textContent('.topbar'), /‹ Home\s*My Bag\s*3 of 8 yardages set/);
  assert.deepStrictEqual(await P.$$eval('.whead b', e => e.map(x => parseInt(x.textContent))), [40, 50, 60, 70, 80, 90, 100, 110]);
  assert.strictEqual(await P.textContent('[data-wsum="70"]'), '54° · middle · P2');
  assert(await P.$('#wflight [data-k="high"].on') && await P.$('#wedit'), 'High/Low flight + Edit still there');
  await P.click('.whead[data-y="70"]'); await P.waitForSelector('#wsimple');
  await P.click('#wflight [data-k="low"]'); await P.waitForSelector('#wflight [data-k="low"].on'); assert.strictEqual(await P.textContent('[data-wsum="70"]'), '58° · back · P1');
  await P.click('#wflight [data-k="high"]'); await P.click('.whead[data-y="70"]');
  await P.click('#wedit'); assert.strictEqual(await P.textContent('#wedit'), '✓ Done editing'); await P.click('#wedit');
  await P.evaluate(() => window.scrollTo(0, 0)); await shot('bag-toggle-wedges.png');
  await P.click('#segbag'); await P.waitForSelector('#baglist'); assert.deepStrictEqual(await seg(), ['Bag*', 'Wedge ladder']);
  console.log('  Wedge ladder tab: 40–110, High/Low flight, simple view, Edit; toggles back to Bag');

  // ---------- 4. Settings ----------
  await P.click('.topbar [data-act="home"]'); await P.click('#plusbtn'); await P.click('#plusmenu [data-act="archive"]'); await P.waitForSelector('.archivepage #playerbox');
  assert.match(await P.textContent('.topbar'), /‹ Home\s*Settings\s*1 saved round/);
  assert.match(await P.textContent('#pnameshow'), /Scott/);
  for (const s of ['[data-act="history"]', '[data-act="courses"]', '[data-act="backup"]', '#restorefile', '#gdcard']) assert(await P.$(s), 'Settings has ' + s);
  assert(!/Archive|Profile|History/.test(await vis()), 'no Archive / Profile / History wording');
  await shot('settings-page.png');
  await P.click('[data-act="courses"]'); await P.waitForSelector('.coursespage'); assert.strictEqual((await P.textContent('.topbar .txt')).trim(), '‹ Settings');
  await P.click('.topbar [data-act="archive"]'); await P.waitForSelector('.archivepage');
  // old Profile route lands on Settings
  await P.evaluate(() => { const x = document.createElement('button'); x.setAttribute('data-act', 'profile'); document.getElementById('app').appendChild(x); x.click(); });
  await P.waitForSelector('.archivepage'); assert.match(await P.textContent('.topbar .title b'), /Settings/);
  console.log('  Settings: title, player name, data tools, Courses ‹ Settings, old Profile route → Settings');

  assert.deepStrictEqual(errors, []);
  await b.close(); srv.kill(); console.log('menu-bag-settings-focused: OK');
})().catch(e => { console.error(e); process.exit(1); });
