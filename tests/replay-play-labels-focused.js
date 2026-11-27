// v265 (Scott): Hole replay ▶ Play – every shot animates; the approach zooms to the green, lands and hops, then the putts; the static map's
// distance tags fade in as each trace passes halfway. Run: node tests/replay-play-labels-focused.js [outDir]
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8889, OUT = process.argv[2] || '/tmp/replay-play'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + PORT + '/?x=' + Date.now());
    await page.evaluate(() => {
      const R = (d, l, dir, pen) => ({ dist: d, loc: l, dir: dir || '', pen: !!pen });
    const holes = [
      { par: 4, pin: 'backleft', finished: true, rows: [R(410, 'tee'), R(165, 'rough', 'left'), R(18, 'bunker', 'shortright'), R(17, 'green', 'right'), R(2, 'holed', 'longleft')] },
      { par: 5, pin: 'frontright', finished: true, rows: [Object.assign(R(540, 'tee'), { club: 'Driver' }), R(285, 'fairway'), R(110, 'rough', 'right'), R(22, 'green', 'short'), R(2, 'holed')] },
      { par: 4, pin: 'center', finished: true, rows: [R(395, 'tee'), R(395, 'tee', 'right', true), R(150, 'fairway'), R(30, 'hazard', 'left', true), R(30, 'deep', 'left'), R(8, 'green', 'longleft'), R(1, 'holed')] }];
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rr', date: '2026-10-10T17:00:00.000Z', course: 'Replay test', baseline: 'pga', player: 'Scott', holes }]));
    });
    await page.reload(); if (await page.$('#tbplus')) await page.click('#navbtn'); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rr"]');
    await page.click('#sumreplay'); await page.waitForSelector('#replaymap');
    // v265: on a notched iPhone the pinned header must not cover the ▶ Play row (env(safe-area-inset-top) is 0 here, so stand in 59 px for it)
    const notch = async () => page.evaluate(() => { const css = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch (e) { return []; } }).map((r) => r.cssText).filter((t) => /#replayview( |\.rpsticky| \.rpsticky)|\.mapview \{/.test(t) && /safe-area-inset-top/.test(t)).map((t) => t.replace(/env\(safe-area-inset-top\)/g, '59px')).join('\n');
      let st = document.getElementById('notchcss'); if (!st) { st = document.createElement('style'); st.id = 'notchcss'; document.head.appendChild(st); } st.textContent = css;
      const v = document.getElementById('replayview'), hb = v.querySelector('.rpsticky').getBoundingClientRect().bottom, pb = document.getElementById('rpplay').getBoundingClientRect(); return [v.scrollTop, hb, pb.top, pb.bottom]; });
    const nm = await notch(); assert.ok(nm[0] === 0 && nm[2] >= nm[1] - 0.5, 'Play row below the pinned header with a notch: ' + nm); await page.screenshot({ path: OUT + '/00-open-notch.png' });
    await page.evaluate(() => { const n = document.getElementById('notchcss'); if (n) n.remove(); });
    // the geometry carries the static map's tags for every shot, the putts and the shot onto the green
    const G = JSON.parse(await page.getAttribute('#rpplay', 'data-geo'));
    assert.ok(G.shots.length >= 2 && G.shots.every((s) => s.lab && s.lab.big && s.lab.w > 20), 'every shot has its tag: ' + JSON.stringify(G.shots.map((s) => s.lab)));
    assert.ok(G.green && G.green.putts.length && G.green.putts.every((p) => p.lab && / ft$/.test(p.lab.big)), 'putt tags'); assert.ok(G.green.arrive.lab, 'the shot onto the green has its tag');
    const L = await page.evaluate((G) => { const r = document.getElementById('replaymap').getBoundingClientRect(), P = RPANIM.plan(G, Math.round(r.width), Math.round(r.height)); return { T: P.T.map((o) => [o.t0, o.dur]), P: P.P.map((o) => [o.t0, o.dur]), end: P.end }; }, G);
    await page.click('#rpplay'); const t0 = Date.now(); await page.waitForSelector('#rpcanvas');
    const at = async (sec, name) => { const w = sec * 1000 - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.locator('#rpcanvas').screenshot({ path: OUT + '/' + name + '.png' }); };
    const [s1, d1] = L.T[0]; await at(s1 + d1 * 0.3, '01-tee-shot-early-no-tag'); await at(s1 + d1 * 0.8, '02-tee-shot-tag');
    const last = L.T[L.T.length - 1]; await at(last[0] + last[1] * 0.9, '03-approach-zoomed'); await at(last[0] + last[1] + 0.35, '04-approach-hops');
    if (L.P.length) { const p = L.P[L.P.length - 1]; await at(p[0] + p[1] * 0.75, '05-putt-tag'); }
    await page.waitForTimeout(Math.max(0, (L.end + 1) * 1000 - (Date.now() - t0))); assert.strictEqual(await page.$('#rpcanvas'), null, 'back to the static map at the end');
    assert.deepStrictEqual(errors, []); console.log('REPLAY PLAY OK', JSON.stringify(L));
  } finally { await b.close(); srv.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
