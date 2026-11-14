// v212 coach sharing (sync.js) against the stand-in Firebase (tests/fakefirebase.js, which checks access like database.rules.json)
const test = require('node:test'), assert = require('assert');
const SYNC = require('../sync.js'), FF = require('./fakefirebase.js');
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; };
let srv, PORT = 8994, cfg;
test.before(async () => { srv = await FF.start(PORT); const b = 'http://127.0.0.1:' + PORT; cfg = { apiKey: 'k', db: b + '/db', authBase: b + '/auth', tokenBase: b + '/token' }; });
test.after(() => srv.close());
const mk = (st) => SYNC.create({ fetch, storage: st || mem(), cfg });
const R = (id, s) => ({ id, date: '2026-11-1' + id.slice(-1), player: 'Quincy', updated: '2026-11-1' + id.slice(-1) + 'T10:00:00Z', holes: [{ par: 4, rows: [] }], note: s || '' });

test('codes: 6 characters, easy to read; typing is forgiving', () => {
  for (let i = 0; i < 50; i++) assert.match(SYNC.newCode(), /^[ACDEFGHJKMNPQRTUVWXY34679]{3}-[ACDEFGHJKMNPQRTUVWXY34679]{3}$/);
  assert.strictEqual(SYNC.cleanCode(' qk7 4mz '), 'QK7-4MZ'); assert.strictEqual(SYNC.cleanCode('QK7-4M'), null);
});

test('the whole loop: coach makes a team → athlete joins with the code → rounds go up by themselves → coach sees them', async () => {
  const coach = mk(); await coach.coachSignUp('mike@example.com', 'secret12', 'Coach Mike', 'Reno Golf Academy');
  const C = coach.coach(); assert.ok(C.team && /^...-...$/.test(C.code)); assert.strictEqual(C.teamName, 'Reno Golf Academy');
  const ath = mk(), T = await ath.lookup('Quincy', C.code.toLowerCase().replace('-', ' '));
  assert.deepStrictEqual([T.name, T.coachName], ['Reno Golf Academy', 'Coach Mike']);
  await ath.join('Quincy', T, { parentOk: true });
  let r = await ath.flush('Quincy', { profile: { bench: 'd1w' }, rounds: [R('r1'), R('r2')], tests: [{ id: 't1', date: '2026-11-10' }], practice: [] });
  assert.strictEqual(r.sent, 4, '2 rounds + 1 test + profile');
  assert.strictEqual((await ath.flush('Quincy', { profile: { bench: 'd1w' }, rounds: [R('r1'), R('r2')], tests: [{ id: 't1', date: '2026-11-10' }], practice: [] })).sent, 0, 'nothing changed → nothing sent');
  let P = await coach.coachPull({}); const uid = Object.keys(P.athletes)[0], A = P.athletes[uid];
  assert.strictEqual(A.name, 'Quincy'); assert.deepStrictEqual(A.rounds.map((x) => x.id).sort(), ['r1', 'r2']); assert.deepStrictEqual(A.rounds.find((x) => x.id === 'r1').holes, [{ par: 4, rows: [] }], 'comes back exactly (empty arrays kept)');
  assert.strictEqual(A.profile.bench, 'd1w'); assert.strictEqual(A.member.parentOk, true);
  // nothing new → the coach's phone doesn't download the athlete again
  const n0 = srv.log.length; P = await coach.coachPull(P.athletes); assert.deepStrictEqual(P.changed, []); assert.ok(srv.log.slice(n0).every((l) => !/\/db\/data\/[^/]+\.json$/.test(l)), 'only the stamp is checked');
  // an edit and a delete follow
  r = await ath.flush('Quincy', { profile: { bench: 'd1w' }, rounds: [R('r1', 'fixed hole 7')], tests: [{ id: 't1', date: '2026-11-10' }], practice: [{ id: 'p1', date: '2026-11-12', spoke: 'lag', min: 30 }] });
  assert.strictEqual(r.sent, 3); P = await coach.coachPull(P.athletes); const A2 = P.athletes[uid];
  assert.deepStrictEqual(A2.rounds.map((x) => x.note), ['fixed hole 7']); assert.strictEqual(A2.practice.length, 1);
});

test('privacy: an athlete can\'t read another athlete; a coach can\'t read another team; a stranger can\'t read anything', async () => {
  const c1 = mk(), c2 = mk(); await c1.coachSignUp('c1@example.com', 'secret12', 'C1', 'Team 1'); await c2.coachSignUp('c2@example.com', 'secret12', 'C2', 'Team 2');
  const a = mk(), b = mk(); await a.join('Ann', await a.lookup('Ann', c1.coach().code)); await b.join('Bea', await b.lookup('Bea', c2.coach().code));
  await a.flush('Ann', { rounds: [R('r1')] }); await b.flush('Bea', { rounds: [R('r2')] });
  const ua = a.link('Ann').acc.uid, ub = b.link('Bea').acc.uid, base = cfg.db;
  const as = async (S, path) => (await fetch(base + '/' + path + '.json?auth=' + S)).status;
  assert.strictEqual(await as(a.link('Ann').acc.id, 'data/' + ub), 401, 'athlete → another athlete');
  assert.strictEqual(await as(c2.coach().acc.id, 'data/' + ua), 401, 'coach → another team\'s athlete');
  assert.strictEqual(await as(c1.coach().acc.id, 'data/' + ua), 200, 'coach → own athlete');
  assert.strictEqual(await as('', 'data/' + ua), 401, 'no sign-in');
  assert.strictEqual(await as(c1.coach().acc.id, 'teams/' + c2.coach().team + '/members'), 401, 'coach → another team\'s list');
  assert.strictEqual((await fetch(base + '/data/' + ua + '.json?auth=' + b.link('Bea').acc.id, { method: 'PUT', body: '{"x":1}' })).status, 401, 'nobody writes someone else\'s data');
});

test('offline: it waits and goes next time; stop sharing deletes the online copy and the coach stops seeing them', async () => {
  const c = mk(); await c.coachSignUp('c3@example.com', 'secret12', 'C3', 'Team 3');
  const st = mem(), a = mk(st); await a.join('Cal', await a.lookup('Cal', c.coach().code));
  srv.offline = true; await assert.rejects(a.flush('Cal', { rounds: [R('r1')] }), (e) => e.code === 'offline'); srv.offline = false;
  assert.strictEqual(a.link('Cal').pending, true);
  const a2 = mk(st); assert.strictEqual(a2.link('Cal').pending, true, 'kept on the phone'); assert.strictEqual((await a2.flush('Cal', { rounds: [R('r1')] })).sent, 2, 'the round + the profile');
  assert.strictEqual(Object.keys((await c.coachPull({})).athletes).length, 1);
  const uid = a2.link('Cal').acc.uid; await a2.leave('Cal'); assert.strictEqual(a2.link('Cal'), null);
  assert.strictEqual(Object.keys((await c.coachPull({})).athletes).length, 0); assert.strictEqual((srv.tree().data || {})[uid], undefined, 'online copy deleted');
});

test('coach account: sign in on another device, change password, reset email, delete removes the team', async () => {
  const c = mk(); await c.coachSignUp('c4@example.com', 'secret12', 'C4', 'Team 4'); const code = c.coach().code;
  const laptop = mk(); await laptop.coachSignIn('c4@example.com', 'secret12'); assert.strictEqual(laptop.coach().code, code, 'same team on the laptop');
  await assert.rejects(mk().coachSignIn('c4@example.com', 'wrong'), (e) => /INVALID_LOGIN/.test(e.message));
  await c.coachPassword('newpass99'); await mk().coachSignIn('c4@example.com', 'newpass99');
  await c.coachReset('c4@example.com'); assert.deepStrictEqual(srv.sent.slice(-1)[0], { type: 'PASSWORD_RESET', email: 'c4@example.com' });
  await assert.rejects(mk().coachSignUp('c4@example.com', 'secret12', 'x', 'y'), (e) => /EMAIL_EXISTS/.test(e.message));
  await c.coachDelete(); assert.strictEqual(c.coach(), null);
  await assert.rejects(mk().lookup('Dee', code), (e) => e.code === 'nocode', 'the code no longer works');
  await assert.rejects(mk().coachSignIn('c4@example.com', 'newpass99'));
});

test('a token past its hour is refreshed quietly', async () => {
  const c = mk(); await c.coachSignUp('c5@example.com', 'secret12', 'C5', 'Team 5'); c.coach().acc.exp = 0;
  const t0 = c.coach().acc.id; await c.coachPull({}); assert.notStrictEqual(c.coach().acc.id, t0);
});
