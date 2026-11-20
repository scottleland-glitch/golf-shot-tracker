// v243: builds the Strokewise guide (help/Strokewise-Guide.pdf) – fresh screenshots of the current app with a made-up player "Alex",
// laid out as a printable PDF by Chrome. Run: NODE_PATH=/opt/npm-tools/node_modules node dev/guide.js   (re-run after design changes)
const { chromium } = require('playwright-core'); const { spawn, execFileSync } = require('child_process'); const fs = require('fs'), path = require('path');
const ARC = require('../tests/fixtures/arcade-78.js'); const ROOT = path.join(__dirname, '..'), TMP = path.join(require('os').tmpdir(), 'guideshots'); fs.mkdirSync(TMP, { recursive: true });
const PORT = 8881, BASE = 'http://127.0.0.1:' + PORT + '/', DAY = 864e5, now = Date.now();
// sample data – older rounds have more 3-putts, putting practice goes up over time (so Trends shows practice paying off)
const threePutt = (h) => { const k = h.rows.findIndex(r => r.loc === 'holed'); if (k > 0 && h.rows[k - 1].loc === 'green' && h.rows[k - 1].dist >= 12) { h.rows.splice(k, 0, { dist: 6, loc: 'green', dir: 'L', pen: false }); return true; } return false; };
const R = []; for (let i = 0; i < 8; i++) { const r = Object.assign(ARC.round(), { id: 'r' + i, player: 'Alex', baseline: 'pga', date: new Date(now - (i * 6 + 1) * DAY).toISOString(), play: i % 3 ? 'practice' : 'tournament' });
  let extra = [0, 0, 1, 1, 2, 3, 3, 4][i]; r.holes.forEach(h => { if (extra > 0 && threePutt(h)) extra--; }); R.push(r); }
const L = []; for (let d = 1; d < 56; d += 2) ['short', 'lag', 'chip', 'wedges', 'irons'].slice(0, 2 + (d % 3)).forEach((k, i) => L.push({ id: 'l' + d + k, date: new Date(now - d * DAY).toISOString().slice(0, 10) + 'T12:00:00', player: 'Alex', spoke: k, focus: k, min: i < 2 ? (d > 40 ? 5 : d > 22 ? 15 : 30) : 20 + i * 5, feel: ['ok', 'great', 'off'][d % 3], type: 'mixed' }));
const BAG = { v: 1, clubs: [['d', 'Driver', 10.5, 245], ['fw', '3W', 15, 220], ['hy', '4H', 22, 200], ['ir', '5i', 25, 185], ['ir', '6i', 28, 175], ['ir', '7i', 32, 165], ['ir', '8i', 36, 152], ['ir', '9i', 41, 140], ['we', 'PW', 46, 128], ['we', '52°', 52, 110], ['we', '56°', 56, 95], ['we', '60°', 60, 78]].map((c, i) => ({ id: 'c' + i, cat: c[0], code: c[1], loft: c[2], carry: c[3], make: '', model: '' })) };
const S = {};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = () => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const snap = async (page, name, o) => { o = o || {}; await page.waitForTimeout(o.wait || 450); const f = path.join(TMP, name + '.png');
      if (o.el) { const e = typeof o.el === 'string' ? await page.$(o.el) : o.el; if (!e) { console.log('missing', name, o.el); return; } await e.scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await e.screenshot({ path: f }); }
      else { if (o.at) { const e = await page.$(o.at); if (e) await page.evaluate(([el, off]) => { window.scrollBy(0, el.getBoundingClientRect().top - off); }, [e, o.off == null ? 90 : o.off]); await page.waitForTimeout(300); }
        await page.screenshot({ path: f, clip: { x: 0, y: o.y || 0, width: 390, height: o.h || 700 } }); }
      S[name] = f; };
    // first launch
    { const page = await (await ctx()).newPage(); await page.goto(BASE + '?x=' + now); await page.waitForSelector('#welcome'); await snap(page, 'welcome', { h: 844 });
      await page.click('#rolego'); await page.waitForSelector('#trackpick'); await snap(page, 'track', { h: 844 }); }
    const page = await (await ctx()).newPage(); await page.goto(BASE + '?x=' + now);
    const seed = async (extra) => { await page.evaluate(([R, L, BAG, extra]) => { localStorage.clear(); const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('golfsg.player.v1', 'Alex'); set('golfsg.nameasked.v1', '1'); set('golfsg.role.v1', 'play'); set('golfsg.trackasked.v1', '1'); set('golfsg.rounds.v1', R); set('golfsg.practice.v1', L); set('golfsg.mybench.v1', { Alex: 'pga' }); set('golfsg.bag.v1', BAG);
      set('golfsg.lastBackup.v1', new Date().toISOString()); set('golfsg.backupSnooze.v1', new Date().toISOString()); Object.keys(extra || {}).forEach(k => set(k, extra[k])); }, [R, L, BAG, extra]); await page.reload(); await page.waitForTimeout(500); };
    const go = async (scr, fn) => { await page.evaluate(([scr]) => { window.__golf.view().screen = scr; window.__golf.render(); window.scrollTo(0, 0); }, [scr]); if (fn) await page.evaluate(fn); await page.waitForTimeout(500); };
    const tap = async (sel) => { await page.evaluate(s => document.querySelector(s).click(), sel); await page.waitForTimeout(300); };
    await seed();
    await page.evaluate(() => { const b = document.querySelector('[data-act="bkdismiss"], [data-act="bknot"]'); if (b) b.click(); });
    await go('home'); await snap(page, 'home', { h: 844 });
    await page.click('#navbtn'); await snap(page, 'navmenu', { h: 844 }); await page.click('[data-act="menuclose"]').catch(() => {});
    await go('home'); await page.click('#tbplus'); await snap(page, 'plusmenu', { y: 344, h: 500 });
    await page.click('[data-act="newform"]'); await snap(page, 'newround', { h: 844 });
    // a round being entered: latest round, hole 4, mid-hole
    const cur = JSON.parse(JSON.stringify(R[0])); cur.id = 'cur'; cur.date = new Date().toISOString(); cur.holes.forEach((h, i) => { if (i >= 3) { h.finished = false; if (i > 3) h.rows = [{ loc: 'tee', dist: h.rows[0].dist, dir: '', pen: false }]; else h.rows = h.rows.slice(0, 3); } });
    await page.evaluate(c => { const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); R.unshift(c); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.current.v1', 'cur'); }, cur);
    await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('.holecard'); await snap(page, 'hole', { h: 760 });
    const fin = await page.$('.sc-finsel[data-k="2"]'); if (fin) { await fin.selectOption('green'); await page.waitForTimeout(400); await snap(page, 'holefin', { h: 760 }); }
    await page.evaluate(() => { localStorage.removeItem('golfsg.current.v1'); const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')).filter(r => r.id !== 'cur'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); }); await page.reload();
    // reviewing a round
    await go('history'); await page.waitForSelector('#histlist'); await snap(page, 'rounds', { h: 760 });
    await page.click('#histlist [data-act="open"]'); await page.waitForTimeout(700); await snap(page, 'summary', { h: 760 });
    const card = async (name, t) => { const e = await page.locator('text=' + t).first().elementHandle().catch(() => null); if (!e) return console.log('missing', name);
      const c = await page.evaluateHandle(el => el.closest('.frostcard, .card, .frost, section') || el.parentElement, e); await snap(page, name, { el: c.asElement() }); };
    const byText = async (t) => (await page.$$('h2, h3, b, .lbl, div, span')).length && page.locator('text=' + t).first().elementHandle().catch(() => null);
    await card('worknext', 'WORK ON NEXT');
    { const e = await byText('SCORECARD'); if (e) { await page.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 40), e); await snap(page, 'scorecard', { h: 700 }); } }
    { const e = await byText('Fairways hit'); if (e) { await page.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 120), e); await snap(page, 'statlist', { h: 700 }); } }
    // My Game, Stats, Practice, Trends
    await go('mygame'); await snap(page, 'mygame', { h: 760 });
    await card('mypractice', 'MY PRACTICE');
    await go('stats'); await snap(page, 'stats', { h: 760 });
    await card('tourvprac', 'TOURNAMENT VS PRACTICE');
    await go('practice', () => { window.__golf.view().waForce = true; window.__golf.render(); }); await snap(page, 'practice', { h: 760 });
    { const e = await byText('This week'); if (e) { await page.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 40), e); await snap(page, 'plan', { h: 760 }); } }
    await go('trends'); await snap(page, 'trends', { h: 560 });
    await snap(page, 'trendput', { el: '.trcard2[data-k="putt"]' });
    await go('home'); await tap('#tbplus'); await tap('[data-act="prlog"]'); await snap(page, 'logpractice', { h: 844, wait: 700 });
    await page.reload(); await go('home'); await tap('#tbplus'); await tap('[data-act="sgtopen"]'); await snap(page, 'sgtest', { h: 760, wait: 700 });
    await go('bag'); await snap(page, 'bag', { h: 760 });
    await go('archive'); await snap(page, 'settings', { h: 760 });
    { const e = await page.$('#csopen'); if (e) { await e.scrollIntoViewIfNeeded(); await snap(page, 'coachcard', { el: await (await page.$('#csopen')).evaluateHandle(el => el.closest('.frostcard, .card, .frost') || el.parentElement) }); await e.click(); await snap(page, 'coachsheet', { h: 844, wait: 600 }); } }
    await page.reload(); await go('help'); await snap(page, 'help', { h: 760 });
    await page.click('#tourgo'); await page.click('#tournext'); await snap(page, 'watch', { el: '#tour .tourpic' });
    // score only
    await seed({ 'golfsg.track.v1': { alex: 'score' }, 'golfsg.mode.v1': { alex: 'stats' } });
    await go('home'); await tap('#tbplus'); await page.fill('#course', 'Lakeridge').catch(() => {}); await page.click('[data-act="new"]'); await page.waitForSelector('#sohole');
    for (const [s, p] of [[4, 2], [5, 2], [3, 1]]) { for (let k = 4; k < s; k++) await page.click('#sohole [data-act="soscore"][data-v="1"]'); for (let k = 4; k > s; k--) await page.click('#sohole [data-act="soscore"][data-v="-1"]'); await page.click('#sohole .soput[data-v="' + p + '"]'); await page.click('#sonext'); }
    await snap(page, 'sohole', { h: 640 });
  } finally { await b.close(); srv.kill(); }
  const missing = ['welcome', 'track', 'home', 'navmenu', 'plusmenu', 'newround', 'hole', 'rounds', 'summary', 'mygame', 'stats', 'practice', 'trendput', 'bag', 'settings', 'help', 'watch', 'sohole'].filter(k => !S[k]);
  if (missing.length) console.log('MISSING', missing.join(', '));
  // → JPEG for the PDF
  const IMG = {}; for (const k of Object.keys(S)) { const o = path.join(TMP, k + '.jpg'); execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB"); im.save(sys.argv[2], "JPEG", quality=74, optimize=True)', S[k], o]); IMG[k] = 'file://' + o; }
  fs.writeFileSync(path.join(TMP, 'img.json'), JSON.stringify(IMG));
  console.log('shots', Object.keys(IMG).length);
})().catch(e => { console.error(e); process.exit(1); });
