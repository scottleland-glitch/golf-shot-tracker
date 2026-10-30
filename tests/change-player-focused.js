// v99 Change player: Scott's rounds were all saved as "Scott Leland" but some are Quincy's. History → Change player →
// tick rounds → Move N rounds to… → pick / type a name → confirm → done. Also one round from its stats page.
// The round keeps its id, shots and stats; player + updated stamp change, and movedFrom notes the old name so the Google
// Drive backup moves the round from the old player's file to the new one (mocked Drive, no real Google calls).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const GD = require('../gdrive.js'), SG = require('../sg.js'), SHARE = require('../share.js'), ARC = require('./fixtures/arcade-78.js'), FakeDrive = require('./fixtures/fake-drive.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8836, BASE = 'http://127.0.0.1:' + PORT + '/';
const CRS = ['Arcade Creek', 'Haggin Oaks', 'Ancil Hoffman', 'Cherry Island', 'Bing Maloney'];
const rnd = (id, player, k, extra) => Object.assign(ARC.round(), { id, player, course: CRS[k % 5], date: new Date(Date.UTC(2026, 9, 25 - k, 16)).toISOString() }, extra || {});
const ids = b => b.rounds.map(r => r.id).sort();

(async () => {
  // ---------- 1. gdrive.js: drops for moved rounds ----------
  const moved = GD.movedFrom([rnd('a1', 'Quincy', 1, { movedFrom: ['Scott Leland'], updated: '2026-10-30T15:00:00Z' }), rnd('a2', 'Scott Leland', 2)]);
  assert.deepStrictEqual(moved, [{ id: 'a1', player: 'Quincy', from: ['Scott Leland'], updated: '2026-10-30T15:00:00Z' }]);
  assert.strictEqual(GD.dropsFor(moved, 'Scott Leland').length, 1); assert.strictEqual(GD.dropsFor(moved, 'quincy').length, 0); assert.strictEqual(GD.dropsFor(moved, 'Amber').length, 0);
  const remote = { rounds: [rnd('a1', 'Scott Leland', 1, { updated: '2026-10-29T00:00:00Z' }), rnd('a2', 'Scott Leland', 2)] };
  let M = GD.mergeBackup(remote, { rounds: [rnd('a2', 'Scott Leland', 2)] }, GD.dropsFor(moved, 'Scott Leland'));
  assert.deepStrictEqual([ids(M), M.dropped], [['a2'], 1], 'old player’s file drops the moved round');
  M = GD.mergeBackup({ rounds: [rnd('a1', 'Scott Leland', 1, { updated: '2026-10-31T00:00:00Z' })] }, { rounds: [] }, GD.dropsFor(moved, 'Scott Leland'));
  assert.deepStrictEqual([ids(M), M.dropped], [['a1'], 0], 'a copy changed after the move is kept');
  const S1 = SHARE.prepare(rnd('a1', 'Quincy', 1, { movedFrom: ['Scott Leland'] }), 'Amber'); assert.ok(!('movedFrom' in S1) && S1.player === 'Amber', 'a sent round leaves the note behind');

  const D = FakeDrive(); D.tokens.add('t'); const now = new Date('2026-10-30T15:00:00Z');
  const sync = async (rounds, me) => { const st = GD.markDirty(GD.newState()); const g = {};
    rounds.forEach(r => { (g[r.player] = g[r.player] || []).push(r); }); GD.movedFrom(rounds).forEach(m => m.from.forEach(f => { if (!g[f]) g[f] = null; }));
    await GD.sync({ state: st, fetch: D.fetch, token: 't', now, moved: GD.movedFrom(rounds), files: Object.keys(g).map(p => ({ player: p, dropOnly: !g[p], backup: SG.makeBackup(g[p] || [], now, p) })) });
    assert.ok(!st.pending, st.lastError); };
  await sync([rnd('a1', 'Scott Leland', 1), rnd('a2', 'Scott Leland', 2), rnd('a3', 'Scott Leland', 3), rnd('b1', 'Amber', 4)]);
  assert.deepStrictEqual(ids(D.json('golf-rounds-scott-leland.json', 'Scott Leland')), ['a1', 'a2', 'a3']);
  const mv = (id, to, from, k) => rnd(id, to, k, { movedFrom: from, updated: '2026-10-30T15:00:00Z' });
  await sync([mv('a1', 'Quincy', ['Scott Leland'], 1), mv('a2', 'Quincy', ['Scott Leland'], 2), rnd('a3', 'Scott Leland', 3), mv('b1', 'Quincy', ['Amber'], 4)]);
  assert.deepStrictEqual(ids(D.json('golf-rounds-scott-leland.json', 'Scott Leland')), ['a3'], 'moved out of Scott Leland');
  assert.deepStrictEqual(ids(D.json('golf-rounds-quincy.json', 'Quincy')), ['a1', 'a2', 'b1'], 'into Quincy');
  assert.deepStrictEqual(ids(D.json('golf-rounds-amber.json', 'Amber')), [], 'Amber’s only round moved: her file is tidied, not deleted');
  const nF = Object.keys(D.files).length;
  await sync([mv('c1', 'Quincy', ['Nobody Yet'], 5)]); assert.strictEqual(D.find('Nobody Yet').length, 0, 'no folder made just to tidy');
  assert.strictEqual(Object.keys(D.files).length, nF, 'c1 goes into the existing Quincy file');
  console.log('  gdrive: moved rounds leave the old player’s file, join the new one; newer edits elsewhere kept; no empty folders made');

  // ---------- 2. in the app ----------
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const G = FakeDrive(); G.tokens.add('tok-x');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route(/^https:\/\/(www\.googleapis\.com|oauth2\.googleapis\.com)\//, route => { const q = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const r = G.handle(q.method(), q.url(), q.headers().authorization, q.postData()); route.fulfill({ status: r.status, headers: cors, contentType: 'application/json', body: r.body }); });
  await ctx.route(/^https:\/\/accounts\.google\.com\//, route => { errors.push('unexpected Google sign-in'); route.abort(); });
  const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('dialog', d => d.accept());
  const R0 = [rnd('r1', 'Scott Leland', 1), rnd('r2', 'Scott Leland', 2), rnd('r3', 'Scott Leland', 3), rnd('r4', 'Scott Leland', 4), rnd('q0', 'Quincy', 5)];
  await P.goto(BASE); await P.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott Leland'); localStorage.setItem('golfsg.nameasked.v1', '1');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); localStorage.setItem('golfsg.gdrive.token.v1', JSON.stringify({ accessToken: 'tok-x', expiresAt: Date.now() + 3600e3 }));
    localStorage.setItem('golfsg.gdrive.v1', JSON.stringify({ connected: true, user: 'scott.family@gmail.com' })); }, R0);
  const gst = () => P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.gdrive.v1')));
  const waitOk = since => P.waitForFunction(s => { const x = JSON.parse(localStorage.getItem('golfsg.gdrive.v1') || 'null'); return x && !x.pending && x.lastOk && x.lastOk > s; }, since || '');
  const LR = () => P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')));
  const shot = async name => { await P.waitForFunction(() => !document.querySelector('#toast.show')); await P.waitForTimeout(400); await P.screenshot({ path: OUT + name }); };
  await P.reload(); await P.waitForSelector('#app > *'); await waitOk();
  assert.deepStrictEqual(ids(G.json('golf-rounds-scott-leland.json', 'Scott Leland')), ['r1', 'r2', 'r3', 'r4']);
  const hist = async () => { if (await P.$('#plusbtn')) await P.click('#plusbtn'); await P.click('[data-act="history"]'); await P.waitForSelector('#histlist'); };
  await hist();
  assert.ok(await P.isVisible('#chgplayer') && await P.isVisible('#addround'));

  // cancel select mode: nothing changes, rows open again
  await P.click('#chgplayer'); await P.waitForSelector('#mvbar'); assert.strictEqual(await P.$('.hdel'), null, 'no delete buttons while choosing');
  assert.ok(await P.$eval('#mvgo', e => e.disabled)); await P.click('.hrow[data-id="r4"] .hist'); assert.match(await P.textContent('#mvgo'), /Move 1 round to…/);
  await P.click('#playerchips [data-v="Scott Leland"]'); assert.strictEqual(await P.textContent('#mvall'), 'Select all 4 shown'); await P.click('#mvall');
  assert.strictEqual(await P.textContent('#mvgo'), 'Move 4 rounds to…', 'select all shown (filtered to Scott Leland)'); await P.click('#mvall'); assert.ok(await P.$eval('#mvgo', e => e.disabled), 'clear all');
  await P.click('#playerchips [data-v=""]');
  await P.click('.mvcancel'); assert.strictEqual(await P.$('#mvbar'), null); assert.ok(await P.$('.hrow[data-id="r4"] [data-act="open"]'));
  assert.deepStrictEqual(await LR(), R0);

  // multi: r1, r2, r3 → Quincy
  await P.click('#chgplayer'); for (const id of ['r1', 'r2', 'r3', 'r4']) await P.click('.hrow[data-id="' + id + '"] .hist'); await P.click('.hrow[data-id="r4"] .hist'); // r4 toggled off again
  assert.deepStrictEqual(await P.$$eval('.hrow.mvsel', L => L.map(e => e.getAttribute('data-id'))), ['r1', 'r2', 'r3']);
  assert.strictEqual(await P.getAttribute('.hrow[data-id="r4"] .hist', 'aria-checked'), 'false'); assert.strictEqual(await P.textContent('#mvgo'), 'Move 3 rounds to…');
  await shot('change-player-select.png');
  await P.click('#mvgo'); await P.waitForSelector('#mvsheet');
  assert.deepStrictEqual(await P.$$eval('#mvsheet .mvname', L => L.map(e => [e.getAttribute('data-v'), e.className.includes('rsh-go'), e.disabled])), [['Quincy', true, false], ['Scott Leland', false, true]], 'Quincy suggested first; the current name is greyed');
  assert.match(await P.textContent('#mvsheet'), /Now: Scott Leland/); await shot('change-player-sheet.png');
  await P.click('#mvsheet .mvname[data-v="Quincy"]'); await P.waitForSelector('#mvyes');
  assert.strictEqual(await P.textContent('#mvh'), 'Move 3 rounds to Quincy?'); assert.strictEqual(await P.textContent('#mvfrom'), 'From Scott Leland');
  await shot('change-player-confirm.png');
  await P.click('#mvno'); assert.strictEqual(await P.$('#mvsheet'), null); assert.ok(await P.$('#mvbar'), 'Cancel keeps the ticks'); assert.deepStrictEqual(await LR(), R0, 'cancel = no change');
  const t0 = (await gst()).lastOk;
  await P.click('#mvgo'); await P.click('#mvsheet .mvname[data-v="Quincy"]'); await P.click('#mvyes');
  await P.waitForFunction(() => /Moved 3 rounds to Quincy/.test(document.getElementById('toast').textContent)); assert.strictEqual(await P.$('#mvbar'), null);
  let L = await LR();
  for (const id of ['r1', 'r2', 'r3']) { const a = L.find(r => r.id === id), o = R0.find(r => r.id === id);
    assert.deepStrictEqual([a.player, a.movedFrom], ['Quincy', ['Scott Leland']]); assert.ok(a.updated > '2026-10-30');
    const rest = Object.assign({}, a); delete rest.player; delete rest.movedFrom; delete rest.updated; const o2 = Object.assign({}, o); delete o2.player;
    assert.deepStrictEqual(rest, o2, 'id, shots, course … unchanged'); assert.deepStrictEqual(SG.summarize(a), SG.summarize(o), 'stats unchanged'); }
  assert.deepStrictEqual(L.find(r => r.id === 'r4'), R0[3]);
  // History filter follows
  assert.deepStrictEqual(await P.$$eval('#playerchips button', B => B.map(e => e.textContent)), ['All players', 'Quincy (4)', 'Scott Leland (1)']);
  await P.click('#playerchips [data-v="Quincy"]'); assert.deepStrictEqual((await P.$$eval('#histlist .hrow', B => B.map(e => e.getAttribute('data-id')))).sort(), ['q0', 'r1', 'r2', 'r3']);
  await P.click('#playerchips [data-v="Scott Leland"]'); assert.deepStrictEqual(await P.$$eval('#histlist .hrow', B => B.map(e => e.getAttribute('data-id'))), ['r4']);
  // backups follow: Google Drive folders swap
  await waitOk(t0);
  assert.deepStrictEqual(ids(G.json('golf-rounds-scott-leland.json', 'Scott Leland')), ['r4'], 'out of Scott Leland’s file');
  assert.deepStrictEqual(ids(G.json('golf-rounds-quincy.json', 'Quincy')), ['q0', 'r1', 'r2', 'r3'], 'into Quincy’s file');
  console.log('  app: select mode (toggle, cancel), Quincy suggested, confirm, 3 rounds moved – same ids + stats, filter + Drive folders follow');

  // single round from its stats page, new name, then back to a known name typed in lower case
  await P.click('.hrow[data-id="r4"] [data-act="open"]'); await P.waitForSelector('#chgplayer1'); assert.match(await P.textContent('#chgplayer1'), /now Scott Leland/);
  await P.click('#chgplayer1'); await P.waitForSelector('#mvsheet'); assert.strictEqual(await P.textContent('#mvh'), 'Move this round to…');
  await P.click('#mvcustom'); await P.fill('#mvname', '  '); await P.click('#mvnewgo'); assert.match(await P.textContent('#mvsheet .rsh-err'), /type a name/);
  await P.fill('#mvname', 'Amber'); await P.click('#mvnewgo'); await P.waitForSelector('#mvyes'); assert.strictEqual(await P.textContent('#mvh'), 'Move this round to Amber?');
  const t1 = (await gst()).lastOk; await P.click('#mvyes'); await P.waitForFunction(() => /Moved 1 round to Amber/.test(document.getElementById('toast').textContent));
  assert.match(await P.textContent('#chgplayer1'), /now Amber/); L = await LR(); assert.deepStrictEqual([L.find(r => r.id === 'r4').player, L.find(r => r.id === 'r4').movedFrom], ['Amber', ['Scott Leland']]);
  await waitOk(t1); assert.deepStrictEqual(ids(G.json('golf-rounds-scott-leland.json', 'Scott Leland')), [], 'last one out of Scott Leland');
  assert.deepStrictEqual(ids(G.json('golf-rounds-amber.json', 'Amber')), ['r4']);
  // Send round still fine for a moved round
  await P.click('#sendround'); await P.waitForSelector('#sendsheet'); assert.strictEqual(await P.textContent('#sendfile small'), SHARE.fileName(L.find(r => r.id === 'r4')));
  await P.click('#sendsheet [data-act="sendclose"]');
  await P.click('#chgplayer1'); await P.click('#mvcustom'); await P.fill('#mvname', 'quincy'); await P.click('#mvnewgo'); await P.waitForSelector('#mvyes');
  assert.strictEqual(await P.textContent('#mvh'), 'Move this round to Quincy?', 'typed name matches a known one');
  const t2 = (await gst()).lastOk; await P.click('#mvyes'); await waitOk(t2);
  L = await LR(); assert.deepStrictEqual([L.find(r => r.id === 'r4').player, L.find(r => r.id === 'r4').movedFrom], ['Quincy', ['Scott Leland', 'Amber']]);
  assert.deepStrictEqual(ids(G.json('golf-rounds-amber.json', 'Amber')), [], 'out of Amber’s'); assert.deepStrictEqual(ids(G.json('golf-rounds-quincy.json', 'Quincy')), ['q0', 'r1', 'r2', 'r3', 'r4']);
  // cancel from the round page closes the sheet, no change
  await P.click('#chgplayer1'); await P.click('#mvsheet .mvname[data-v="Scott Leland"]'); await P.click('#mvno'); assert.strictEqual(await P.$('#mvsheet'), null);
  assert.strictEqual((await LR()).find(r => r.id === 'r4').player, 'Quincy');
  console.log('  app: one round from its page → new name Amber → “quincy” → Quincy; Drive files follow each move; Send round unchanged');

  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('change-player-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
