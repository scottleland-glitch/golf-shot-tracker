// v97 Send round / Add a round. Scott keeps score on his phone; "Send round" (Round stats) sends one saved round as a
// file (share sheet, download fallback) or a PINHIGH1: text code (gzip + base64url, plain base64url fallback).
// On Quincy's phone, History → "Add a round" reads the file or code, checks it, shows a confirmation card, and adds it
// to HER history: her player name, original id kept, never the round in progress, no duplicates, and in her backups.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const SHARE = require('../share.js'), SG = require('../sg.js'), ARC = require('./fixtures/arcade-78.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8834, BASE = 'http://127.0.0.1:' + PORT + '/';
(async () => {
  // ---------- share.js: payload, file, codes, validation, dedupe ----------
  const R = Object.assign(ARC.round(), { player: 'Scott', tee: 'White', courseId: 'c-arc', notes: 'windy back nine' });
  R.holes[0].pin = { x: 0.4, y: 0.6 }; R.holes[3].rows[1].club = '3w';
  const P = SHARE.payload(R, new Date('2026-10-29T22:00:00Z'));
  assert.deepStrictEqual([P.pinhigh, P.v, P.sent], ['round', 1, '2026-10-29T22:00:00.000Z']);
  assert.deepStrictEqual(P.round, R, 'the whole round: holes, shots, pins, clubs, course, tee, notes'); assert.notStrictEqual(P.round, R, 'a copy');
  assert.strictEqual(SHARE.fileName(R), 'Pin-High-Round-' + (d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2))(new Date(R.date)) + '-Arcade-Creek.json');
  const fileTxt = SHARE.fileText(R);
  assert.deepStrictEqual((await SHARE.read(fileTxt)).round, R, 'file round-trip');
  const gz = await SHARE.encode(R), plain = await SHARE.encode(R, { noGzip: true });
  assert.ok(gz.startsWith('PINHIGH1:') && plain.startsWith('PINHIGH1:') && /^PINHIGH1:[A-Za-z0-9_-]+$/.test(gz));
  assert.ok(gz.length < 2000 && gz.length * 4 < plain.length, 'gzip code is short: ' + gz.length + ' vs plain ' + plain.length);
  assert.deepStrictEqual((await SHARE.read(gz)).round, R, 'gzip code round-trip');
  assert.deepStrictEqual((await SHARE.read(plain)).round, R, 'plain code round-trip (no CompressionStream)');
  assert.deepStrictEqual((await SHARE.read(plain, { noGzip: true })).round, R, 'plain code reads without DecompressionStream');
  assert.match((await SHARE.read(gz, { noGzip: true })).error, /can’t unpack/);
  assert.deepStrictEqual((await SHARE.read('Pin High round – Thu. In Pin High: Rounds → Add a round, paste this:\n' + gz + '\n')).round, R, 'code inside the message text');
  const err = async t => (await SHARE.read(t)).error;
  assert.match(await err(''), /Choose a file or paste a code/);
  assert.match(await err('hello there'), /should start with PINHIGH1:/);
  assert.match(await err('PINHIGH1:' + gz.slice(9, 200)), /incomplete or damaged|could not be read/);
  assert.match(await err('{not json'), /isn’t a Pin High round/);
  assert.match(await err(JSON.stringify({ hello: 1 })), /isn’t a Pin High round/);
  assert.match(await err(JSON.stringify(Object.assign({}, P, { v: 2 }))), /newer version/);
  assert.match(await err(JSON.stringify(Object.assign({}, P, { round: { id: 'x', holes: 'no' } }))), /damaged/);
  const bk = await SHARE.read(JSON.stringify(SG.makeBackup([R], new Date(), 'Scott')));
  assert.ok(bk.backup && /full backup/.test(bk.error) && /Restore from backup/.test(bk.error), 'full backup → points to Restore');
  assert.ok((await SHARE.read(JSON.stringify([R]))).backup);
  const other = Object.assign(ARC.round(), { id: 'zz', date: '2026-09-01T17:00:00.000Z' });
  assert.strictEqual(SHARE.findDup([other], R), null);
  assert.strictEqual(SHARE.findDup([other, Object.assign({}, R, { player: 'Quincy' })], R).id, R.id, 'same id');
  assert.strictEqual(SHARE.findDup([Object.assign(JSON.parse(JSON.stringify(R)), { id: 'copy' })], R).id, 'copy', 'same course + start + shots');
  const R2 = JSON.parse(JSON.stringify(R)); R2.id = 'copy2'; R2.holes[5].rows[1].dist = 111; assert.strictEqual(SHARE.findDup([R2], R), null, 'a different shot is a different round');
  assert.deepStrictEqual([SHARE.prepare(R, 'Quincy').player, SHARE.prepare(R, 'Quincy').id, 'player' in SHARE.prepare(R, '')], ['Quincy', R.id, false]);
  console.log('  share.js: payload, file + gzip/plain code round-trips (' + gz.length + ' vs ' + plain.length + ' chars), 9 validation errors, dedupe, re-stamp');

  // ---------- phones ----------
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const phone = async (player, rounds, share) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
    if (share) await ctx.addInitScript(() => { window.__shared = []; window.__shareMode = 'ok';
      const sh = async d => { if (window.__shareMode === 'fail') throw new Error('not allowed'); if (window.__shareMode === 'abort') { const e = new Error('x'); e.name = 'AbortError'; throw e; }
        window.__shared.push({ text: d.text || null, files: d.files ? await Promise.all([...d.files].map(async f => ({ name: f.name, type: f.type, text: await f.text() }))) : null }); };
      Object.defineProperty(navigator, 'share', { value: sh, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true }); });
    const page = await ctx.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(player + ': ' + e)); page.on('dialog', d => d.accept());
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(([p, rs]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', p); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, [player, rounds]);
    await page.reload(); return page;
  };
  const hist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); await p.waitForSelector('#histlist'); };
  // Scott's phone: send
  const S = await phone('Scott', [R], true);
  await hist(S); await S.click('#histlist [data-act="open"][data-id="arc78"]'); await S.waitForSelector('#rs-top');
  assert.match(await S.textContent('#sendround'), /Send round/);
  await S.click('#sendround'); await S.waitForSelector('#sendsheet');
  await S.waitForFunction(() => /characters/.test(document.querySelector('#sendcode small').textContent));
  assert.match(await S.textContent('#sendsheet'), /Arcade Creek · 78 \(\+6\)/); assert.match(await S.textContent('#sendfile'), /Pin-High-Round-.*-Arcade-Creek\.json/);
  await S.screenshot({ path: OUT + 'send-round-button.png' });
  await S.click('#sendfile'); await S.waitForFunction(() => window.__shared.length === 1);
  const sentFile = (await S.evaluate(() => window.__shared[0])).files[0];
  assert.ok(sentFile.name === SHARE.fileName(R) && sentFile.type === 'application/json');
  assert.deepStrictEqual(JSON.parse(sentFile.text).round, R, 'shared file = the whole round');
  await S.click('#sendcode'); await S.waitForFunction(() => window.__shared.length === 2);
  const sentText = (await S.evaluate(() => window.__shared[1])).text; assert.match(sentText, /Rounds → Add a round/);
  assert.deepStrictEqual((await SHARE.read(sentText)).round, R, 'shared text code (made in the browser) reads back');
  // no share sheet → download the file / copy the code
  await S.evaluate(() => { window.__shareMode = 'fail'; });
  const [dl] = await Promise.all([S.waitForEvent('download'), S.click('#sendfile')]); assert.strictEqual(dl.suggestedFilename(), SHARE.fileName(R));
  await S.click('#sendcode'); await S.waitForSelector('#sendcopied'); assert.match(await S.textContent('#sendcopied'), /Copied/);
  const clip = await S.evaluate(() => navigator.clipboard.readText()); assert.ok(clip.startsWith('PINHIGH1:') && clip === await S.inputValue('#sendcodebox'));
  assert.deepStrictEqual((await SHARE.read(clip)).round, R);
  await S.evaluate(() => { window.__shareMode = 'abort'; window.__shared.length = 0; }); await S.click('#sendfile'); await S.waitForTimeout(300); assert.ok(await S.$('#sendsheet'), 'cancelled share: sheet stays, nothing downloaded');
  await S.click('#sendsheet [data-act="sendclose"]'); assert.strictEqual(await S.$('#sendsheet'), null);
  console.log('  Scott: Send round → file via share sheet (download fallback), text code via share / clipboard ("Copied")');

  // Quincy's phone: add
  const own = Object.assign(ARC.round(), { id: 'q1', date: '2026-10-20T16:00:00.000Z', course: 'Haggin Oaks', player: 'Quincy' });
  const inProg = { v: 3, dv: 2, id: 'qcur', date: new Date().toISOString(), course: 'Bing Maloney', player: 'Quincy', baseline: 'pga', holes: [{ par: 4, finished: false, rows: [{ loc: 'tee', dist: 380, dir: '', pen: false }, { loc: 'fairway', dist: 140, dir: '', pen: false }] }] };
  const Q = await phone('Quincy', [own, inProg], true);
  await Q.evaluate(() => localStorage.setItem('golfsg.current.v1', 'qcur')); await Q.reload();
  await hist(Q); await Q.click('#addround'); await Q.waitForSelector('#addsheet');
  assert.ok(await Q.$('#addroundfile[type="file"][accept*=".json"]') && await Q.$('#addcode') && await Q.$('#addcodego'));
  await Q.screenshot({ path: OUT + 'add-round-sheet.png' });
  const pick = async (name, text) => { await Q.setInputFiles('#addroundfile', { name, mimeType: 'application/json', buffer: Buffer.from(text) }); };
  const paste = async t => { await Q.fill('#addcode', t); await Q.click('#addcodego'); };
  await paste('hello'); await Q.waitForSelector('#adderr'); assert.match(await Q.textContent('#adderr'), /PINHIGH1:/); assert.strictEqual(await Q.inputValue('#addcode'), 'hello', 'pasted text kept');
  await pick('notes.json', '{"a":1}'); await Q.waitForFunction(() => /isn’t a Pin High round/.test((document.getElementById('adderr') || {}).textContent));
  await pick('golf-rounds-Scott.json', JSON.stringify(SG.makeBackup([R], new Date(), 'Scott'))); await Q.waitForFunction(() => /full backup/.test((document.getElementById('adderr') || {}).textContent));
  assert.ok(await Q.$('#adderr.rsh-note'));
  // the file Scott sent → confirmation card
  await pick(sentFile.name, sentFile.text); await Q.waitForSelector('#addcard');
  assert.strictEqual(await Q.textContent('#addh'), 'Add this round to your rounds?');
  const card = await Q.evaluate(() => ({ c: document.querySelector('.arcourse').textContent, d: document.querySelector('.ardate').textContent, s: document.getElementById('arscore').textContent, t: document.getElementById('artopar').textContent, h: document.getElementById('arholes').textContent, w: document.getElementById('arwho').textContent }));
  assert.deepStrictEqual([card.c, card.s, card.t, card.h, card.w], ['Arcade Creek', '78', '+6', '18', 'Goes into Quincy’s rounds']);
  assert.match(card.d, /2026/); assert.match(card.d, /White/);
  await Q.screenshot({ path: OUT + 'add-round-confirm.png' });
  await Q.click('#addno'); assert.strictEqual(await Q.$('#addsheet'), null);
  assert.strictEqual(await Q.evaluate(() => window.__golf.rounds().length), 2, 'Cancel adds nothing');
  // the code → Add
  await Q.click('#addround'); await paste(sentText); await Q.waitForSelector('#addyes'); await Q.click('#addyes'); await Q.waitForSelector('#adddone');
  assert.match(await Q.textContent('#adddone'), /Added to your rounds/);
  const st = await Q.evaluate(() => { const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); const r = rs.filter(x => x.id === 'arc78'); return { n: rs.length, k: r.length, r: r[0], cur: localStorage.getItem('golfsg.current.v1') }; });
  assert.deepStrictEqual([st.n, st.k, st.r.player, st.cur], [3, 1, 'Quincy', 'qcur'], 'added once, stamped Quincy, round in progress untouched');
  assert.deepStrictEqual(Object.assign({}, st.r, { player: 'Scott' }), R, 'everything else exactly as sent (id, holes, shots, tee, notes…)');
  // View round → strokes gained recomputed as usual
  await Q.click('#addview'); await Q.waitForSelector('#rs-top');
  assert.deepStrictEqual(await Q.$$eval('#rs-top tr:nth-child(2) td', t => t.map(x => x.textContent)), ['78', '+6', '5531', '31']);
  const sg = SG.summarize(R); const fmt = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); };
  assert.strictEqual((await Q.textContent('.sghead')).match(/[+−-]?\d+\.\d\d/)[0], fmt(sg.sgTotal), 'strokes gained recomputed'); assert.match(await Q.textContent('.topbar'), /‹ Rounds/);
  await Q.click('.topbar [data-act="history"]'); assert.match(await Q.textContent('#histlist .hrow[data-id="arc78"]'), /^78[\s\S]*Arcade Creek[\s\S]*Quincy/);
  // second add (gzip-less code) → no duplicate; same round with another id → also caught
  await Q.click('#addround'); await paste(plain); await Q.waitForSelector('#addyes'); await Q.click('#addyes'); await Q.waitForSelector('#adddone');
  assert.match(await Q.textContent('#adddone'), /already in your rounds/); assert.strictEqual(await Q.getAttribute('#addview', 'data-id'), 'arc78');
  await Q.click('#addsheet [data-act="addclose"]');
  const R3 = Object.assign(JSON.parse(JSON.stringify(R)), { id: 'arc78-again' });
  await Q.click('#addround'); await pick('again.json', SHARE.fileText(R3)); await Q.waitForSelector('#addyes'); await Q.click('#addyes'); await Q.waitForSelector('#adddone');
  assert.match(await Q.textContent('#adddone'), /already in your rounds/);
  assert.strictEqual(await Q.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')).length), 3, 'still 3 rounds');
  await Q.click('#addsheet [data-act="addclose"]');
  // in Quincy's backup
  await Q.click('[data-act="home"]'); await Q.click('#plusbtn'); await Q.click('#plusmenu [data-act="archive"]'); await Q.evaluate(() => { window.__shared.length = 0; window.__shareMode = 'ok'; });
  await Q.click('[data-act="backup"]'); await Q.waitForFunction(() => window.__shared.length === 1);
  const bfile = (await Q.evaluate(() => window.__shared[0])).files[0], B = JSON.parse(bfile.text);
  assert.match(bfile.name, /^golf-rounds-quincy-/i); const inB = B.rounds.filter(r => r.id === 'arc78');
  assert.ok(inB.length === 1 && inB[0].player === 'Quincy' && B.player === 'Quincy', 'the added round is in her backup');
  console.log('  Quincy: Add a round → errors (not a code / not a round / full backup → Restore), confirmation card 78 +6 18 holes, added as Quincy, no duplicates, in backup');
  assert.deepStrictEqual(errors, []); console.log('SEND ROUND OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
