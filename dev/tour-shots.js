// Makes the phone screenshots for the in-app tour (tour/*.webp) from sample data. Run: NODE_PATH=… node dev/tour-shots.js
// Sample player "Alex" – no real names. Re-run after a design change so the tour matches the app.
const { chromium } = require('playwright-core'); const { spawn, execFileSync } = require('child_process'); const fs = require('fs'), path = require('path');
const ARC = require('../tests/fixtures/arcade-78.js'); const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'tour'), TMP = path.join(require('os').tmpdir(), 'tourshots'); fs.mkdirSync(TMP, { recursive: true });
const PORT = 8879, BASE = 'http://127.0.0.1:' + PORT + '/', DAY = 864e5, now = Date.now();
const R = []; for (let i = 0; i < 8; i++) R.push(Object.assign(ARC.round(), { id: 'r' + i, player: 'Alex', baseline: 'pga', date: new Date(now - (i * 6 + 1) * DAY).toISOString(), play: i % 3 ? 'practice' : 'tournament' }));
const L = []; for (let d = 1; d < 40; d += 2) ['short', 'lag', 'chip', 'wedges', 'irons'].slice(0, 2 + (d % 3)).forEach((k, i) => L.push({ id: 'l' + d + k, date: new Date(now - d * DAY).toISOString().slice(0, 10) + 'T12:00:00', player: 'Alex', spoke: k, focus: k, min: 20 + i * 5, feel: ['ok', 'great', 'off'][d % 3], type: 'mixed' }));
const shot = async (page, name, sel, h) => { await page.waitForTimeout(500); if (sel) { const el = await page.$(sel); if (el) await el.scrollIntoViewIfNeeded(); }
  const f = path.join(TMP, name + '.png'); await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 390, height: h || 700 } }); return f; };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const shots = {};
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    await page.goto(BASE + '?x=' + now);
    const seed = async (extra) => { await page.evaluate(([R, L, extra]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Alex'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play'); localStorage.setItem('golfsg.trackasked.v1', '1');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(L)); localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Alex: 'pga' })); Object.keys(extra || {}).forEach(k => localStorage.setItem(k, extra[k])); }, [R, L, extra]); await page.reload(); };
    const go = async (scr, fn) => { await page.evaluate(([scr]) => { window.__golf.view().screen = scr; window.__golf.render(); window.scrollTo(0, 0); }, [scr]); if (fn) await page.evaluate(fn); };
    await seed();
    // a round being entered: open the latest round, hole 4, mid-hole
    const cur = JSON.parse(JSON.stringify(R[0])); cur.id = 'cur'; cur.date = new Date().toISOString(); cur.holes.forEach((h, i) => { if (i >= 3) { h.finished = false; if (i > 3) h.rows = [{ loc: 'tee', dist: h.rows[0].dist, dir: '', pen: false }]; else h.rows = h.rows.slice(0, 3); } });
    await page.evaluate(c => { const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); R.unshift(c); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.current.v1', 'cur'); }, cur);
    await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('.holecard'); shots.entry = await shot(page, 'entry');
    await page.evaluate(() => { localStorage.removeItem('golfsg.current.v1'); const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')).filter(r => r.id !== 'cur'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); }); await page.reload();
    await go('history'); await page.waitForSelector('#histlist'); shots.rounds = await shot(page, 'rounds');
    await page.click('#histlist [data-act="open"]'); await page.waitForTimeout(600); shots.review = await shot(page, 'review');
    await go('mygame'); await page.waitForTimeout(600); shots.mygame = await shot(page, 'mygame');
    await go('stats'); await page.waitForTimeout(600); shots.stats = await shot(page, 'stats');
    await go('practice', () => { window.__golf.view().waForce = true; window.__golf.render(); }); await page.waitForTimeout(600); shots.practice = await shot(page, 'practice');
    await go('trends'); await page.waitForTimeout(800); shots.trends = await shot(page, 'trends');
    // score only
    await seed({ 'golfsg.track.v1': JSON.stringify({ alex: 'score' }), 'golfsg.mode.v1': JSON.stringify({ alex: 'stats' }) });
    await go('home'); await page.click('#tbplus'); await page.waitForSelector('[data-act="new"]'); await page.fill('#course', 'Lakeridge').catch(() => {}); await page.click('[data-act="new"]'); await page.waitForSelector('#sohole');
    for (const [s, p] of [[4, 2], [5, 2], [3, 1]]) { for (let k = 4; k < s; k++) await page.click('#sohole [data-act="soscore"][data-v="1"]'); for (let k = 4; k > s; k--) await page.click('#sohole [data-act="soscore"][data-v="-1"]'); await page.click('#sohole .soput[data-v="' + p + '"]'); await page.click('#sonext'); }
    shots.score = await shot(page, 'score');
  } finally { await b.close(); srv.kill(); }
  // → webp, 1x width (390), small
  for (const k of Object.keys(shots)) execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB"); im=im.resize((im.size[0]//2, im.size[1]//2)); im.save(sys.argv[2], "WEBP", quality=72)', shots[k], path.join(OUT, k + '.webp')]);
  console.log('tour shots:', Object.keys(shots).map(k => k + ' ' + Math.round(fs.statSync(path.join(OUT, k + '.webp')).size / 1024) + 'KB').join(', '));
})().catch(e => { console.error(e); process.exit(1); });
