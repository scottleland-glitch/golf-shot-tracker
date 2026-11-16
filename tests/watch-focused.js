// StrokeWise Apple Watch link in the web app. (1) On the website / PWA nothing changes: the hooks exist but nothing uses them and no watch code loads.
// (2) In the iPhone app with the watch build, watch events (from a fake native plugin) are applied to the round in progress, saved to
// golfsg.rounds.v1, shown on the phone's hole screen, acked once, a retry is ignored, and the state pushed back lists them.
// (3) Same result as tapping the phone's own Finished / Direction / Distance controls. Run: node tests/watch-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ROOT = __dirname + '/../', PORT = 8851, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m);
const holes = () => Array.from({ length: 18 }, (_, i) => ({ par: 4, finished: false, rows: [{ loc: 'tee', dist: i === 0 ? 400 : 380, dir: '', pen: false }] }));
const R = { v: 3, dv: 2, id: 'w1', date: new Date().toISOString(), course: 'Ridgeview', tee: 'White', player: 'Scott', baseline: 'pga', holes: holes() };
const seed = r => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
  localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.current.v1', r.id); };
const FAKE = () => { // what the native plugin does: a queue until acked, state pushes recorded
  const f = window.__fake = { pending: [], pushed: [], acked: [], n: 0, listeners: {}, launched: 0, launchAnswer: { ok: true, reason: '' } };
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'StrokewiseWatch', // as native-bridge.js: Plugins.<name>, no registerPlugin
    Plugins: { StrokewiseWatch: ({ getPending: async () => ({ items: f.pending.slice() }), ack: async o => { f.acked.push(...o.qids); f.pending = f.pending.filter(i => !o.qids.includes(i.qid)); },
      pushState: async o => { f.pushed.push(JSON.parse(o.json)); }, startWatchApp: async () => { f.launched++; return f.launchAnswer; }, addListener: (n, cb) => { f.listeners[n] = cb; return Promise.resolve({ remove() {} }); } }) } };
  f.send = e => { f.pending.push({ qid: 'q' + (++f.n), json: JSON.stringify(e) }); };
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const mkpage = async init => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); const page = await ctx.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text())); if (init) await page.addInitScript(init); return page; };
    const stored = (page, h) => page.evaluate(h => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[h || 0], h);
    // ---- 1. website: nothing changes ----
    { const page = await mkpage(); await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(seed, R); await page.reload(); await page.waitForSelector('#home');
      assert.strictEqual(await page.evaluate(() => typeof window.STROKEWISE_WATCH), 'undefined', 'no watch link on the website');
      assert.strictEqual(await page.evaluate(() => typeof window.StrokewiseWatchCore), 'undefined');
      assert.ok(!fs.readFileSync(ROOT + 'index.html', 'utf8').includes('watch.js'), 'index.html does not load watch.js');
      assert.ok(!fs.readFileSync(ROOT + 'sw.js', 'utf8').includes('watch.js') && !fs.readFileSync(ROOT + 'sw.js', 'utf8').includes('watch-core'), 'sw.js does not cache the watch files');
      await page.click('#resumepill'); await page.waitForSelector('.shotcard[data-k="0"]');
      await page.selectOption('select[data-f="fin"][data-k="0"]', 'fairway'); await page.click('[data-act="nextshot"][data-k="0"]'); await page.waitForSelector('input[data-row="1"]'); await page.fill('input[data-row="1"]', '150'); await page.dispatchEvent('input[data-row="1"]', 'change');
      assert.strictEqual((await stored(page)).rows[1].loc, 'fairway'); ok('website: a hole is entered as before; no watch scripts, no watch objects'); await page.context().close(); }
    // ---- 2. iPhone app with the watch link ----
    { const page = await mkpage(FAKE); await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(seed, R); await page.reload(); await page.waitForSelector('#home');
      await page.addScriptTag({ path: ROOT + 'native/watch-core.js' }); await page.addScriptTag({ path: ROOT + 'native/watch.js' });
      assert.strictEqual(await page.evaluate(() => typeof window.STROKEWISE_WATCH.drain), 'function');
      await page.waitForFunction(() => window.__fake.pushed.length >= 1); // the first push: nothing waiting, round in progress
      let st = await page.evaluate(() => window.__fake.pushed.slice(-1)[0]); assert.strictEqual(st.roundId, 'w1'); assert.strictEqual(st.hole, 0); assert.deepStrictEqual(st.holes[0].rows, [{ loc: 'tee', dist: 400 }]);
      ok('the round in progress is pushed to the watch (hole 1, tee 400)');
      assert.strictEqual(await page.evaluate(() => window.__fake.launched), 1, 'a round the phone has not woken the watch for yet: the watch app is launched once');
      ok('the watch app is launched (startWatchApp) once for the round');
      const send = e => page.evaluate(e => window.__fake.send(e), Object.assign({ roundId: 'w1', t: Date.now() }, e));
      await send({ id: 'a1', seq: 1, type: 'shot', hole: 0, k: 0, fin: 'fairway', dir: 'right', dist: 150 });
      await send({ id: 'a2', seq: 2, type: 'shot', hole: 0, k: 1, fin: 'green', dir: '', dist: 12 });
      await send({ id: 'a3', seq: 3, type: 'shot', hole: 0, k: 2, fin: 'in' });
      await send({ id: 'a1', seq: 1, type: 'shot', hole: 0, k: 0, fin: 'fairway', dir: 'right', dist: 150 }); // a retry of the first one
      await send({ id: 'zz', seq: 4, type: 'shot', hole: 0, k: 0, fin: 'rough', dist: 9, roundId: 'someone-else' });
      await page.evaluate(() => window.STROKEWISE_WATCH.drain()); await page.waitForFunction(() => window.__fake.pending.length === 0);
      let h0 = await stored(page); assert.strictEqual(h0.rows.length, 3); assert.ok(h0.finished); assert.deepStrictEqual(h0.rows.map(r => [r.loc, +r.dist, r.dir, !!r.holeOut]), [['tee', 400, '', false], ['fairway', 150, 'right', false], ['green', 12, '', true]]);
      ok('shots from the watch are applied to golfsg.rounds.v1, the hole is finished; a retried message and another round\'s message change nothing');
      assert.strictEqual(await page.evaluate(() => window.__fake.acked.length), 5, 'every queued message is acked once');
      await page.waitForFunction(() => { const p = window.__fake.pushed.slice(-1)[0]; return p && p.hole === 1 && p.acks.some(a => a.id === 'a3'); });
      st = await page.evaluate(() => window.__fake.pushed.slice(-1)[0]); assert.strictEqual(st.holesDone, 1); assert.strictEqual(st.strokesDone, 3);
      assert.ok(st.acks.find(a => a.id === 'zz' && !a.ok && a.why === 'noround') && st.acks.find(a => a.id === 'a1' && a.ok)); ok('the pushed state moves to hole 2 and lists applied / refused ids');
      // the phone shows it: Scorecard of the finished hole = 3 strokes (open the round, the hole screen redraws)
      await page.click('#resumepill'); await page.waitForSelector('.shotcard, .tline'); const txt = await page.evaluate(() => document.body.innerText);
      assert.ok(/Hole 2/.test(txt), 'the phone opens on hole 2 (first open hole)');
      // undo on the first shot of hole 2 reopens hole 1; then the phone's screen updates by itself
      await send({ id: 'a4', seq: 5, type: 'undo', hole: 1 }); await page.evaluate(() => window.STROKEWISE_WATCH.drain()); await page.waitForFunction(() => window.__fake.pending.length === 0);
      h0 = await stored(page); assert.ok(!h0.finished && h0.rows.length === 3 && !h0.rows[2].holeOut); ok('undo from the watch on hole 2 reopens hole 1 (hole-out removed, not finished)');
      await send({ id: 'a4', seq: 5, type: 'undo', hole: 1 }); await page.evaluate(() => window.STROKEWISE_WATCH.drain()); h0 = await stored(page); assert.strictEqual(h0.rows.length, 3, 'a retried undo is ignored (not applied twice)');
      await send({ id: 'a5', seq: 6, type: 'shot', hole: 0, k: 2, fin: 'green', dir: 'short', dist: 3, edit: true }); await send({ id: 'a6', seq: 7, type: 'shot', hole: 0, k: 3, fin: 'in' });
      await page.evaluate(() => window.STROKEWISE_WATCH.drain()); await page.waitForFunction(() => window.__fake.pending.length === 0); h0 = await stored(page);
      assert.deepStrictEqual(h0.rows.map(r => [r.loc, +r.dist, r.dir, !!r.holeOut]).slice(2), [['green', 12, '', false], ['green', 3, 'short', true]]); assert.ok(h0.finished); ok('an edited putt and a new hole-out are applied in order (edit then hole-out), hole finished again');
      assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.watchacks.v1')).length), 7);
      assert.strictEqual(await page.evaluate(() => window.__fake.launched), 1, 'every later shot / push / manual send leaves it at one launch'); await page.evaluate(() => window.STROKEWISE_WATCH.push(true));
      assert.strictEqual(await page.evaluate(() => window.__fake.launched), 1); ok('later shots, pushes and "send now" never launch the watch app again');
      // the app is reopened mid-round: same round id, so no second launch; a different round does launch; a finished round does not
      await page.reload(); await page.waitForSelector('#home'); await page.addScriptTag({ path: ROOT + 'native/watch-core.js' }); await page.addScriptTag({ path: ROOT + 'native/watch.js' });
      await page.waitForFunction(() => window.__fake.pushed.length >= 1); assert.strictEqual(await page.evaluate(() => window.__fake.launched), 0); ok('reopening the app in the same round does not launch it again');
      await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); const n = JSON.parse(JSON.stringify(r[0])); n.id = 'w2'; n.date = new Date().toISOString(); n.holes.forEach(h => { h.finished = false; h.rows = [h.rows[0]]; }); r.push(n); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(r)); localStorage.setItem('golfsg.current.v1', 'w2'); });
      await page.reload(); await page.waitForSelector('#home'); await page.evaluate(() => { window.__fake.launchAnswer = { ok: false, reason: 'no HealthKit in this build' }; });
      await page.addScriptTag({ path: ROOT + 'native/watch-core.js' }); await page.addScriptTag({ path: ROOT + 'native/watch.js' }); await page.waitForFunction(() => window.__fake.launched === 1);
      await page.waitForFunction(() => window.STROKEWISE_WATCH.log().some(l => /NOT launched/.test(l.m)));
      assert.ok((await page.evaluate(() => window.STROKEWISE_WATCH.log())).some(l => /NOT launched: no HealthKit/.test(l.m)), 'a refused launch is explained in the Settings log'); ok('a new round launches it once, and a refusal is written to the Settings → Apple Watch log');
            // a refused launch is retried on a later push (20 s apart); once the system accepts it, it is never repeated for the round
      await page.evaluate(() => { const d = Date.now; window.__t = 30000; Date.now = () => d.call(Date) + window.__t; window.__fake.launchAnswer = { ok: true, reason: '' }; });
      await page.evaluate(() => window.STROKEWISE_WATCH.push(true)); await page.waitForFunction(() => window.__fake.launched === 2 && window.STROKEWISE_WATCH.log().some(l => /launched$/.test(l.m)));
      await page.evaluate(() => { window.__t = 90000; return window.STROKEWISE_WATCH.push(true); }); assert.strictEqual(await page.evaluate(() => window.__fake.launched), 2); ok('a refused launch is retried (once accepted: never again for that round)');
      // "end" from the watch (End round / Close): acked, logged, and the phone's round is untouched
      const before = JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))));
      await page.evaluate(() => window.__fake.send({ id: 'end1', seq: 99, roundId: 'w2', type: 'end', hole: 0, t: Date.now() })); await page.evaluate(() => window.STROKEWISE_WATCH.drain());
      await page.waitForFunction(() => window.__fake.pending.length === 0); st = await page.evaluate(() => window.__fake.pushed.slice(-1)[0]);
      assert.ok(st.acks.find(a => a.id === 'end1' && a.ok), 'the end note is acked as applied'); assert.strictEqual(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')))), before, 'the round is unchanged');
      ok('the watch\'s "round ended" note is acked and leaves the phone\'s round alone'); await page.context().close(); }
    // ---- 3. same as the phone's own controls ----
    const scenarios = [
      ['fairway right 150', [{ k: 0, fin: 'fairway', dir: 'right', dist: 150 }], [{ sel: ['fin', 0, 'fairway'] }, { sel: ['dir', 1, 'right'] }, { click: '[data-act="nextshot"][data-k="0"]' }, { fill: [1, '150'] }]],
      ['OB left (lost ball)', [{ k: 0, fin: 'lost', dir: 'left' }], [{ sel: ['fin', 0, 'lost'] }, { sel: ['dir', 1, 'left'] }]],
      ['unplayable then rough 140', [{ k: 0, fin: 'unp', dist: 140 }], [{ sel: ['fin', 0, 'unp'] }, { click: '[data-act="nextshot"][data-k="0"]' }, { fill: [1, '140'] }]],
      ['hazard drop 90', [{ k: 0, fin: 'hazard', hz: 'drop', dist: 90 }], [{ sel: ['fin', 0, 'hazard'] }, { click: '[data-act="hz"][data-k="1"][data-v="drop"]' }, { click: '[data-act="nextshot"][data-k="0"]' }, { fill: [1, '90'] }]],
      ['hazard re-tee', [{ k: 0, fin: 'hazard', hz: 'retee' }], [{ sel: ['fin', 0, 'hazard'] }, { click: '[data-act="hz"][data-k="1"][data-v="retee"]' }]],
      ['bunker, then chip-in from 20', [{ k: 0, fin: 'bunker', dir: 'shortleft', dist: 20 }, { k: 1, fin: 'in' }], [{ sel: ['fin', 0, 'bunker'] }, { sel: ['dir', 1, 'shortleft'] }, { click: '[data-act="nextshot"][data-k="0"]' }, { fill: [1, '20'] }, { sel: ['fin', 1, 'in'] }]]];
    for (const [name, evs, ui] of scenarios) {
      const R2 = JSON.parse(JSON.stringify(R)); R2.holes[0].rows[0].dist = 400;
      const pw = await mkpage(); await pw.goto(BASE + '?x=' + Date.now()); await pw.evaluate(seed, R2); await pw.reload(); await pw.waitForSelector('#home');
      await pw.addScriptTag({ path: ROOT + 'native/watch-core.js' });
      const viaWatch = await pw.evaluate(evs => { const r = JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0], C = window.StrokewiseWatchCore; evs.forEach((e, i) => { const o = C.applyEvent(r, Object.assign({ id: 'x' + i, roundId: 'w1', type: 'shot', hole: 0 }, e)); if (!o.ok) throw new Error(o.reason); }); return r.holes[0]; }, evs);
      await pw.click('#resumepill'); await pw.waitForSelector('.shotcard[data-k="0"]');
      for (const s of ui) {
        if (s.sel) { const [f, k, v] = s.sel; const q = 'select[data-f="' + f + '"][data-k="' + k + '"]'; await pw.waitForSelector(q); await pw.selectOption(q, v); }
        if (s.fill) { const q = 'input[data-row="' + s.fill[0] + '"]'; await pw.waitForSelector(q); await pw.fill(q, s.fill[1]); await pw.dispatchEvent(q, 'change'); await pw.dispatchEvent(q, 'blur'); }
        if (s.click) { await pw.waitForSelector(s.click); await pw.click(s.click); }
        await pw.waitForTimeout(150);
      }
      const viaPhone = await stored(pw); const norm = h => h.rows.map(r => [r.loc, r.dist === '' ? '' : +r.dist, r.dir || '', !!r.pen, !!r.holeOut, !!r.retee, !!r.lost]);
      assert.deepStrictEqual(norm(viaWatch), norm(viaPhone), name); ok('same rows as the phone\'s own controls: ' + name); await pw.context().close();
    }
    assert.deepStrictEqual(errors, [], 'no console errors: ' + errors.join(' | '));
  } finally { await b.close(); srv.kill(); }
  console.log('watch-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
