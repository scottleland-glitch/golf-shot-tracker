// v99 Change player: History → Change player → tick rounds → Move N rounds to… → pick / type a name → confirm.
// Also one round from its stats page. The round keeps its id, shots and stats; player + updated stamp change.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const path = require('path');
const SG = require('../sg.js'), SHARE = require('../share.js'), ARC = require('./fixtures/arcade-78.js');
const ROOT = path.join(__dirname, '..'), PORT = 8836, BASE = 'http://127.0.0.1:' + PORT + '/';
const CRS = ['Arcade Creek', 'Haggin Oaks', 'Ancil Hoffman', 'Cherry Island', 'Bing Maloney'];
const rnd = (id, player, k, extra) => Object.assign(ARC.round(), { id, player, course: CRS[k % 5], date: new Date(Date.UTC(2026, 9, 25 - k, 16)).toISOString() }, extra || {});

(async () => {
  const S1 = SHARE.prepare(rnd('a1', 'Quincy', 1, { movedFrom: ['Scott Leland'] }), 'Amber');
  assert.ok(!('movedFrom' in S1) && S1.player === 'Amber', 'a sent round leaves the note behind');

  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('dialog', d => d.accept());
  const R0 = [rnd('r1', 'Scott Leland', 1), rnd('r2', 'Scott Leland', 2), rnd('r3', 'Scott Leland', 3), rnd('r4', 'Scott Leland', 4), rnd('q0', 'Quincy', 5)];
  await P.goto(BASE); await P.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott Leland'); localStorage.setItem('golfsg.nameasked.v1', '1');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, R0);
  const LR = () => P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')));
  await P.reload(); await P.waitForSelector('#home, #app > *');
  const hist = async () => { if (await P.$('#navbtn')) await P.click('#navbtn'); await P.click('[data-act="history"]'); await P.waitForSelector('#histlist'); };
  await hist();
  assert.ok(await P.isVisible('#chgplayer') && await P.isVisible('#addround'));

  await P.click('#chgplayer'); await P.waitForSelector('#mvbar'); assert.strictEqual(await P.$('.hdel'), null, 'no delete buttons while choosing');
  assert.ok(await P.$eval('#mvgo', e => e.disabled)); await P.click('.hrow[data-id="r4"] .hist'); assert.match(await P.textContent('#mvgo'), /Move 1 round to…/);
  await P.click('#playerchips [data-v="Scott Leland"]'); assert.strictEqual(await P.textContent('#mvall'), 'Select all 4 shown'); await P.click('#mvall');
  assert.strictEqual(await P.textContent('#mvgo'), 'Move 4 rounds to…', 'select all shown (filtered to Scott Leland)'); await P.click('#mvall'); assert.ok(await P.$eval('#mvgo', e => e.disabled), 'clear all');
  await P.click('#playerchips [data-v=""]');
  await P.click('.mvcancel'); assert.strictEqual(await P.$('#mvbar'), null); assert.ok(await P.$('.hrow[data-id="r4"] [data-act="open"]'));
  assert.deepStrictEqual(await LR(), R0);

  await P.click('#chgplayer'); for (const id of ['r1', 'r2', 'r3', 'r4']) await P.click('.hrow[data-id="' + id + '"] .hist'); await P.click('.hrow[data-id="r4"] .hist');
  assert.deepStrictEqual(await P.$$eval('.hrow.mvsel', L => L.map(e => e.getAttribute('data-id'))), ['r1', 'r2', 'r3']);
  assert.strictEqual(await P.getAttribute('.hrow[data-id="r4"] .hist', 'aria-checked'), 'false'); assert.strictEqual(await P.textContent('#mvgo'), 'Move 3 rounds to…');
  await P.click('#mvgo'); await P.waitForSelector('#mvsheet');
  assert.deepStrictEqual(await P.$$eval('#mvsheet .mvname', L => L.map(e => [e.getAttribute('data-v'), e.className.includes('rsh-go'), e.disabled])), [['Quincy', true, false], ['Scott Leland', false, true]], 'Quincy suggested first; the current name is greyed');
  await P.click('#mvsheet .mvname[data-v="Quincy"]'); await P.waitForSelector('#mvyes');
  assert.strictEqual(await P.textContent('#mvh'), 'Move 3 rounds to Quincy?'); assert.strictEqual(await P.textContent('#mvfrom'), 'From Scott Leland');
  await P.click('#mvno'); assert.strictEqual(await P.$('#mvsheet'), null); assert.ok(await P.$('#mvbar'), 'Cancel keeps the ticks'); assert.deepStrictEqual(await LR(), R0, 'cancel = no change');
  await P.click('#mvgo'); await P.click('#mvsheet .mvname[data-v="Quincy"]'); await P.click('#mvyes');
  await P.waitForFunction(() => /Moved 3 rounds to Quincy/.test(document.getElementById('toast').textContent)); assert.strictEqual(await P.$('#mvbar'), null);
  let L = await LR();
  for (const id of ['r1', 'r2', 'r3']) { const a = L.find(r => r.id === id), o = R0.find(r => r.id === id);
    assert.deepStrictEqual([a.player, a.movedFrom], ['Quincy', ['Scott Leland']]); assert.ok(a.updated > '2026-10-30');
    const rest = Object.assign({}, a); delete rest.player; delete rest.movedFrom; delete rest.updated; const o2 = Object.assign({}, o); delete o2.player;
    assert.deepStrictEqual(rest, o2, 'id, shots, course … unchanged'); assert.deepStrictEqual(SG.summarize(a), SG.summarize(o), 'stats unchanged'); }
  assert.deepStrictEqual(L.find(r => r.id === 'r4').player, 'Scott Leland');
  assert.deepStrictEqual(await P.$$eval('#playerchips button', B => B.map(e => e.textContent)), ['All players', 'Quincy (4)', 'Scott Leland (1)']);
  await P.click('#playerchips [data-v="Quincy"]'); assert.deepStrictEqual((await P.$$eval('#histlist .hrow', B => B.map(e => e.getAttribute('data-id')))).sort(), ['q0', 'r1', 'r2', 'r3']);
  await P.click('#playerchips [data-v="Scott Leland"]'); assert.deepStrictEqual(await P.$$eval('#histlist .hrow', B => B.map(e => e.getAttribute('data-id'))), ['r4']);
  console.log('  app: select mode (toggle, cancel), Quincy suggested, confirm, 3 rounds moved – same ids + stats, filter follows');

  await P.click('.hrow[data-id="r4"] [data-act="open"]'); await P.waitForSelector('#chgplayer1'); assert.match(await P.textContent('#chgplayer1'), /now Scott Leland/);
  await P.click('#chgplayer1'); await P.waitForSelector('#mvsheet'); assert.strictEqual(await P.textContent('#mvh'), 'Move this round to…');
  await P.click('#mvcustom'); await P.fill('#mvname', '  '); await P.click('#mvnewgo'); assert.match(await P.textContent('#mvsheet .rsh-err'), /type a name/);
  await P.fill('#mvname', 'Amber'); await P.click('#mvnewgo'); await P.waitForSelector('#mvyes'); assert.strictEqual(await P.textContent('#mvh'), 'Move this round to Amber?');
  await P.click('#mvyes'); await P.waitForFunction(() => /Moved 1 round to Amber/.test(document.getElementById('toast').textContent));
  assert.match(await P.textContent('#chgplayer1'), /now Amber/); L = await LR(); assert.deepStrictEqual([L.find(r => r.id === 'r4').player, L.find(r => r.id === 'r4').movedFrom], ['Amber', ['Scott Leland']]);
  await P.click('#sendround'); await P.waitForSelector('#sendsheet'); assert.strictEqual(await P.textContent('#sendfile small'), SHARE.fileName(L.find(r => r.id === 'r4')));
  await P.click('#sendsheet [data-act="sendclose"]');
  await P.click('#chgplayer1'); await P.click('#mvcustom'); await P.fill('#mvname', 'quincy'); await P.click('#mvnewgo'); await P.waitForSelector('#mvyes');
  assert.strictEqual(await P.textContent('#mvh'), 'Move this round to Quincy?', 'typed name matches a known one');
  await P.click('#mvyes');
  await P.waitForFunction(() => /Moved 1 round to Quincy/.test((document.getElementById('toast') || {}).textContent || ''));
  L = await LR(); assert.deepStrictEqual([L.find(r => r.id === 'r4').player, L.find(r => r.id === 'r4').movedFrom], ['Quincy', ['Scott Leland', 'Amber']]);
  await P.click('#chgplayer1'); await P.click('#mvsheet .mvname[data-v="Scott Leland"]'); await P.click('#mvno'); assert.strictEqual(await P.$('#mvsheet'), null);
  assert.strictEqual((await LR()).find(r => r.id === 'r4').player, 'Quincy');
  console.log('  app: one round from its page → new name Amber → “quincy” → Quincy; Send round unchanged');

  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('change-player-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
