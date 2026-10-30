// v101 Google Drive restore list + OneDrive gone, against the in-memory fake Drive (no real Google or Microsoft calls).
// Covers: GD.restoreList / GD.applyRestore rules; Restore → Quincy → Latest backup lists EVERY round in her file (deduped by id only),
// "Not on this phone" ticked, "On this phone" greyed, backup-newer copies optional; Select all missing / Clear / N selected / Restore N rounds;
// restored rounds land in History under Quincy with the same ids, a newer phone copy is never replaced; weekly copy; and a phone that
// had OneDrive connected opens cleanly (old keys + #code= return cleaned, no MSAL, no OneDrive card).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const GD = require('../gdrive.js'), SG = require('../sg.js'), ARC = require('./fixtures/arcade-78.js'), FakeDrive = require('./fixtures/fake-drive.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8838, BASE = 'http://127.0.0.1:' + PORT + '/';
const COURSES = ['Arcade Creek', 'Haggin Oaks', 'Bing Maloney', 'Ancil Hoffman', 'Cherry Island', 'Teal Bend', 'Davis Golf Course', 'Wildhorse', 'Valley Hi', 'Mather'];
// a round with a few extra putts on hole 1 so the scores differ (78 + extra)
const rnd = (id, player, day, extra, more) => { const r = Object.assign(ARC.round(), { id, date: '2026-' + String(day).padStart(5, '0') + 'T16:00:00.000Z' }, extra || {});
  if (player) r.player = player; else delete r.player;
  const h = r.holes[0]; for (let k = 0; k < (more || 0); k++) h.rows.splice(h.rows.length - 1, 0, { dist: 4, loc: 'green', dir: '', pen: false });
  return r; };

(async () => {
  // ---------- 1. the rules on their own ----------
  const h = [{ rows: [] }];
  const L = GD.restoreList({ player: 'Quincy', rounds: [{ id: 'a', holes: h, date: '2026-01-01' }, { id: 'b', holes: h, date: '2026-03-01', updated: '2' }, { id: 'b', holes: h, date: '2026-03-01', updated: '5', x: 1 },
    { id: 'c', holes: h, date: '2026-02-01', player: 'Quincy' }, { id: 'd', holes: h, date: '2026-04-01', updated: '9' }, { bad: 1 }, { id: 'e', date: 'x' }] }, 'Quincy',
    [{ id: 'c', holes: h, date: '2026-02-01', player: 'Quincy' }, { id: 'd', holes: h, date: '2026-04-01', updated: '3', player: 'Quincy' }, { id: 'b', holes: h, updated: '7' }]);
  assert.deepStrictEqual(L.map(i => [i.round.id, i.status, !!i.phoneNewer, i.round.player]), [['d', 'newer', false, 'Quincy'], ['b', 'same', true, 'Quincy'], ['c', 'same', false, 'Quincy'], ['a', 'new', false, 'Quincy']],
    'newest first; same id twice → newer copy; unnamed → the folder’s player; unreadable rounds skipped');
  assert.strictEqual(L.find(i => i.round.id === 'b').round.x, 1, 'kept the newer duplicate');
  const A = GD.applyRestore([{ id: 'd', updated: '3' }, { id: 'b', updated: '7' }], L, { a: 1, d: 1, b: 1, c: 1 });
  assert.deepStrictEqual(A.rounds.map(r => [r.id, r.updated || null]), [['d', '9'], ['b', '7'], ['a', null]], 'new added, newer backup replaces in place, newer phone copy kept');
  assert.deepStrictEqual([A.added, A.updated], [1, 1]);
  assert.deepStrictEqual(GD.applyRestore([], L, {}).rounds, [], 'nothing ticked → nothing added');
  console.log('  rules: every round listed (dedupe by id), statuses, newest first, ids kept, newer phone copy never replaced');

  // ---------- 2. the fake Drive with Quincy's backup ----------
  const G = FakeDrive(); G.tokens.add('tok-r');
  let fid = 0; const put = (name, parents, content, mime) => { const id = 'x' + (++fid); G.files[id] = { id, name, parents, mimeType: mime || 'application/json', content, modifiedTime: '2026-10-29T18:00:00.000Z' }; return id; };
  const root = put('Pin High Backups', ['root'], undefined, GD.FOLDER), qf = put('Quincy', [root], undefined, GD.FOLDER), sf = put('Scott', [root], undefined, GD.FOLDER);
  const QR = [];
  for (let i = 1; i <= 10; i++) QR.push(rnd('q' + i, i === 6 ? null : 'Quincy', '10-' + String(30 - i * 2).padStart(2, '0'), { course: COURSES[i - 1], updated: '2026-10-20T00:00:00Z' }, i % 4));
  QR.find(r => r.id === 'q3').notes = 'backup copy'; QR.find(r => r.id === 'q3').updated = '2026-10-25T00:00:00Z';
  QR.find(r => r.id === 'q4').notes = 'older backup copy';
  QR.push(Object.assign(JSON.parse(JSON.stringify(QR.find(r => r.id === 'q5'))), { updated: '2026-10-01T00:00:00Z', notes: 'stale duplicate' })); // same id twice in the file
  put('golf-rounds-quincy.json', [qf], JSON.stringify(SG.makeBackup(QR, new Date('2026-10-29T18:00:00Z'), 'Quincy')));
  put('golf-rounds-quincy-2026-10-12.json', [qf], JSON.stringify(SG.makeBackup(QR.filter(r => +r.id.slice(1) >= 8 && r.notes !== 'stale duplicate'), new Date('2026-10-12T18:00:00Z'), 'Quincy')));
  put('golf-rounds-scott.json', [sf], JSON.stringify(SG.makeBackup([rnd('s1', 'Scott', '10-01')], new Date(), 'Scott')));

  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], asked = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route(/^https:\/\/(www\.googleapis\.com|oauth2\.googleapis\.com)\//, route => { const q = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (q.method() !== 'GET') return route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: '{}' }); // keep the seeded backup exactly as it is
    const r = G.handle(q.method(), q.url(), q.headers().authorization, q.postData()); route.fulfill({ status: r.status, headers: cors, contentType: 'application/json', body: r.body }); });
  await ctx.route(/^https:\/\/(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|graph\.microsoft\.com)\//, route => { errors.push('unexpected sign-in / Microsoft call ' + route.request().url()); route.abort(); });
  ctx.on('request', q => asked.push(q.url()));
  const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('console', m => m.type() === 'error' && !/503|Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text())); P.on('dialog', d => { errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  const shot = async (name, full) => { await P.waitForFunction(() => !document.querySelector('#toast.show')); await P.waitForTimeout(400); await P.screenshot({ path: OUT + name, fullPage: !!full }); };
  const LR = () => P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')));

  // ---------- 3. a phone that had OneDrive connected ----------
  const q2 = QR.find(r => r.id === 'q2'), q3old = Object.assign(JSON.parse(JSON.stringify(QR.find(r => r.id === 'q3'))), { notes: 'phone copy', updated: '2026-10-21T00:00:00Z' }),
    q4new = Object.assign(JSON.parse(JSON.stringify(QR.find(r => r.id === 'q4'))), { notes: 'edited on this phone', updated: '2026-10-28T00:00:00Z' });
  const LOCAL = [rnd('s1', 'Scott', '10-01'), q2, q3old, q4new];
  await P.goto(BASE); await P.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); localStorage.setItem('golfsg.gdrive.token.v1', JSON.stringify({ accessToken: 'tok-r', expiresAt: Date.now() + 3600e3 }));
    localStorage.setItem('golfsg.gdrive.v1', JSON.stringify({ connected: true, user: 'scott.family@gmail.com', lastOk: '2026-10-30T14:00:00.000Z' }));
    localStorage.setItem('golfsg.onedrive.v1', JSON.stringify({ pending: true, lastOk: '2026-10-01T00:00:00Z' })); localStorage.setItem('golfsg.onedrive.account.v1', JSON.stringify({ username: 'scott@outlook.com' }));
    localStorage.setItem('msal.account.keys', '["x"]'); localStorage.setItem('00000000-0000-0000-abcd-login.microsoftonline.com-idtoken-x', '{}'); }, LOCAL);
  await P.goto(BASE + '?r=1#code=M.C123&client_info=abc&state=xyz'); await P.waitForSelector('#home');
  assert.strictEqual(await P.evaluate(() => location.hash), '', 'old Microsoft sign-in return wiped from the address bar');
  assert.deepStrictEqual(await P.evaluate(() => Object.keys(localStorage).filter(k => /onedrive|msal|microsoftonline/i.test(k))), [], 'old OneDrive keys quietly removed (on this phone only)');
  await P.click('#archivepill'); await P.waitForSelector('.archivepage #gdcard');
  const arc = await P.textContent('.archivepage');
  assert.ok(!/OneDrive|Microsoft/i.test(arc), 'no OneDrive anywhere in Archive'); assert.strictEqual(await P.$('#odcard'), null);
  for (const s of ['[data-act="backup"]', 'label[for="restorefile"]', '[data-act="csvall"]', '#gdrestore']) assert.ok(await P.isVisible(s), s + ' still there');
  await P.click('#bkinfo [data-act="info"]'); assert.ok(!/OneDrive/.test(await P.textContent('#tip-bkinfo')));
  await P.click('#bkinfo [data-act="info"]');
  assert.ok(!asked.some(u => /msal|onedrive\.js|microsoft/i.test(u)), 'MSAL / onedrive.js never loaded');
  assert.strictEqual(await P.evaluate(() => typeof window.OD + typeof window.msal), 'undefinedundefined');
  await P.evaluate(() => window.scrollTo(0, 0));
  await shot('archive-no-onedrive.png');
  console.log('  OneDrive gone: old keys + #code= return cleaned silently, no MSAL, Archive shows Google Drive + file backup + CSV only');

  // ---------- 4. Restore → Quincy → Latest backup: the full list ----------
  await P.click('#gdrestore'); await P.waitForSelector('#gdrsheet [data-act="gdrplayer"]');
  await P.click('#gdrsheet [data-act="gdrplayer"][data-name="Quincy"]'); await P.waitForSelector('#gdrsheet [data-act="gdrfile"]');
  assert.strictEqual((await P.$$('#gdrsheet [data-act="gdrfile"]')).length, 2, 'latest + weekly');
  await P.click('#gdrsheet [data-act="gdrfile"] >> nth=0'); await P.waitForSelector('#gdlpage .gdlrow');
  assert.match(await P.textContent('#gdlpage .topbar .title'), /Quincy’s rounds\s*Latest backup/);
  const rows = () => P.$$eval('.gdlrow', L => L.map(e => ({ id: e.dataset.id, st: e.dataset.status, on: e.querySelector('.gdltick').getAttribute('aria-checked') === 'true', dis: e.querySelector('.gdltick').disabled,
    date: e.querySelector('.gdldate').textContent, course: e.querySelector('.gdlcourse').textContent, score: e.querySelector('.gdlscore b').textContent, par: e.querySelector('.gdlscore small').textContent, txt: e.querySelector('.gdlst').textContent })));
  let R = await rows();
  assert.deepStrictEqual(R.map(r => r.id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'], 'all 10 rounds, newest first, q5 once');
  assert.match(await P.textContent('#gdlsum'), /10 rounds in this backup\s*7 not on this phone\s*3 on this phone/);
  for (const r of R) { assert.match(r.date, /^\w{3}, \w{3} \d+, 2026/); assert.ok(r.course.length > 3); assert.match(r.score, /^\d{2}$/); assert.match(r.par, /^\+\d+$/); }
  assert.deepStrictEqual(R.map(r => r.score), QR.slice(0, 10).map(r => String(SG.summarize(r).strokes)), 'score per round');
  const by = id => R.find(r => r.id === id);
  assert.deepStrictEqual(['q2', 'q3', 'q4'].map(id => [by(id).st, by(id).on, by(id).dis, by(id).txt]), [
    ['same', false, true, 'On this phone'], ['newer', false, false, 'On this phone · backup copy is newer'], ['same', false, true, 'On this phone · this phone’s copy is newer']]);
  assert.ok(R.filter(r => r.st === 'new').every(r => r.on && !r.dis && r.txt === 'Not on this phone'), 'missing rounds ticked');
  assert.strictEqual(by('q6').course, 'Teal Bend', 'the unnamed round is listed too');
  assert.strictEqual(await P.textContent('#gdlcount'), '7 selected'); assert.strictEqual(await P.textContent('#rpgo'), 'Restore 7 rounds');
  assert.ok(await P.isDisabled('#gdlmissing')); assert.match(await P.textContent('#gdlmissing'), /All missing/);
  // the bar fits and nothing runs off the side
  assert.ok(await P.evaluate(() => document.documentElement.scrollWidth <= 390));
  await shot('restore-rounds-list.png');
  // Clear, tap a greyed row (nothing), Select all missing, add the newer backup copy, drop one
  await P.click('#gdlclear'); assert.strictEqual(await P.textContent('#gdlcount'), '0 selected'); assert.ok(await P.isDisabled('#rpgo')); assert.strictEqual(await P.textContent('#rpgo'), 'Restore 0 rounds');
  await P.click('.gdlrow[data-id="q2"] .gdltick', { force: true }); assert.strictEqual(await P.textContent('#gdlcount'), '0 selected', 'a round already here can’t be ticked');
  await P.click('#gdlmissing'); assert.strictEqual(await P.textContent('#gdlcount'), '7 selected');
  await P.click('.gdlrow[data-id="q3"] .gdltick'); await P.click('.gdlrow[data-id="q9"] .gdltick');
  assert.strictEqual(await P.textContent('#gdlcount'), '7 selected'); assert.strictEqual(await P.textContent('#rpgo'), 'Restore 7 rounds');
  R = await rows(); assert.ok(by('q3') && R.find(r => r.id === 'q3').on && !R.find(r => r.id === 'q9').on);
  // look at one round (read-only), come back, ticks kept
  await P.click('.gdlrow[data-id="q1"] .gdlview'); await P.waitForSelector('#rpprevsel'); assert.match(await P.textContent('#rpprevsel'), /Selected/);
  await P.click('.topbar [data-act="rpback"]'); await P.waitForSelector('#gdlpage'); assert.strictEqual(await P.textContent('#gdlcount'), '7 selected');
  await P.click('.gdlrow[data-id="q2"] .gdlview'); await P.waitForSelector('#rpprevsel'); assert.match(await P.textContent('#rpprevsel'), /Already on this phone/);
  await P.click('.topbar [data-act="rpback"]'); await P.waitForSelector('#gdlpage');
  // restore
  await P.click('#rpgo'); await P.waitForSelector('.archivepage #notice');
  assert.match(await P.textContent('#notice'), /Restored 6 rounds and updated 1 from Quincy’s backup – they’re in History under Quincy/);
  const after = await LR(), ids = after.map(r => r.id);
  assert.deepStrictEqual(ids.slice().sort(), ['q1', 'q10', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 's1'], 'q9 left out, nothing doubled');
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(after.filter(r => r.id[0] === 'q').every(r => r.player === 'Quincy'), 'all under Quincy (incl. the unnamed one)');
  assert.strictEqual(after.find(r => r.id === 'q3').notes, 'backup copy', 'newer backup copy replaced the older phone copy');
  assert.strictEqual(after.find(r => r.id === 'q4').notes, 'edited on this phone', 'newer phone copy kept');
  assert.notStrictEqual(after.find(r => r.id === 'q5').notes, 'stale duplicate'); assert.deepStrictEqual(after.find(r => r.id === 'q2'), q2);
  assert.ok(after.find(r => r.id === 'q1').holes.length === 18 && SG.summarize(after.find(r => r.id === 'q1')).strokes === SG.summarize(QR[0]).strokes, 'shots intact');
  // History: under Quincy
  await P.click('[data-act="history"]'); await P.waitForSelector('#histlist');
  await P.click('#playerchips [data-v="Quincy"]'); assert.strictEqual((await P.$$('#histlist .hrow')).length, 9);
  console.log('  restore list: 10/10 rounds shown, 7 missing ticked, greyed rounds locked, Clear / Select all missing / count, 7 restored under Quincy, newer phone copy kept');

  // ---------- 5. a weekly copy: everything from it is already here now ----------
  await P.click('[data-act="home"]'); await P.click('#archivepill'); await P.click('#gdrestore'); await P.waitForSelector('#gdrsheet [data-act="gdrplayer"]');
  await P.click('#gdrsheet [data-act="gdrplayer"][data-name="Quincy"]'); await P.waitForSelector('#gdrsheet [data-act="gdrfile"]');
  await P.click('#gdrsheet [data-act="gdrfile"] >> nth=1'); await P.waitForSelector('#gdlpage .gdlrow');
  assert.match(await P.textContent('#gdlpage .topbar .title'), /Weekly copy · Oct 12, 2026/);
  R = await rows(); assert.deepStrictEqual(R.map(r => [r.id, r.st]), [['q8', 'same'], ['q9', 'new'], ['q10', 'same']]);
  assert.strictEqual(await P.textContent('#rpgo'), 'Restore 1 round');
  await P.click('[data-act="rpcancel"]'); await P.waitForSelector('.archivepage');
  assert.deepStrictEqual((await LR()).length, 10, 'Back changes nothing');
  console.log('  weekly copy: listed against the phone (2 here, 1 missing), Back leaves the phone alone');

  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('restore-list-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
