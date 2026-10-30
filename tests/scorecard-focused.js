// v103 Scorecard: ONE soft card that scrolls sideways instead of the Front 9 / Back 9 tables.
// Covers: a single card; row labels in order (no player-name row); holes 1-18 then OUT / IN / TOT; the card scrolls sideways
// (scrollWidth > clientWidth, momentum scrolling on iPhone) while the labels stay stuck on the left; compact rows (30-34 px) and light
// type; values for several holes of the Arcade Creek 78 (score marks, strokes gained by category with green/red tints, putts, GIR,
// tee club, FIR, drive distance, first / last putt, up & down, sandies, recovery) and the OUT / IN / TOT columns; tapping a hole
// still opens it; an in-progress round leaves unplayed holes blank. Screenshots: scorecard-top.png, scorecard-scrolled.png.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ARC = require('./fixtures/arcade-78.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8841, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('ok - ' + m);

(async () => {
  // the 78 with a few extra facts: Driver on 1 and an 8 iron on 3 (tee club), 1's chip played from a greenside bunker, 2's tee shot in the trees
  const full = ARC.round(); full.holes[0].rows[0].club = 'Driver'; full.holes[2].rows[0].club = '8i'; full.holes[0].rows[2].loc = 'bunker'; full.holes[1].rows[1].loc = 'trees';
  // in progress: holes 1-5 finished, 6 started (tee shot only), 7-18 not played
  const live = ARC.round(); Object.assign(live, { id: 'live1', date: '2026-10-30T16:00:00.000Z', course: 'Arcade Creek' });
  live.holes[5] = { par: 4, finished: false, rows: [live.holes[5].rows[0], live.holes[5].rows[1]] };
  for (let k = 6; k < 18; k++) live.holes[k] = { par: live.holes[k].par, finished: false, rows: [] };

  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await ctx.route(/^https:\/\/([a-z0-9-]+\.)?(google|googleapis|microsoft|live|microsoftonline)\.com\//, route => { errors.push('unexpected outside call ' + route.request().url()); route.abort(); });
    await ctx.addInitScript(rs => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
      localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); } }, [full, live]);
    const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
    const shot = async name => { await P.waitForFunction(() => !document.querySelector('#toast.show')); await P.waitForTimeout(400); await P.screenshot({ path: OUT + name }); };
    const openRound = async id => { await P.click('[data-act="home"] >> nth=0').catch(() => {}); await P.click('#plusbtn'); await P.click('#plusmenu [data-act="history"]');
      await P.click(`#histlist [data-act="open"][data-id="${id}"]`); await P.waitForSelector('#scorecard'); };
    // each row: label, then every cell's text (✓ / ✗ for the yes/no icons)
    const table = () => P.$$eval('#scorecard tr:not(.scgap)', trs => trs.map(t => [t.querySelector('th').textContent,
      ...[...t.querySelectorAll('td')].map(d => d.querySelector('svg.yes') ? '✓' : d.querySelector('svg.no') ? '✗' : d.textContent)]));
    await P.goto(BASE + 'index.html'); await P.waitForSelector('#plusbtn');
    await openRound('arc78');

    // ---------- 1. one card, rows in order, no player-name row ----------
    const one = await P.evaluate(() => ({ cards: document.querySelectorAll('.sc1card').length, tables: document.querySelectorAll('.sc1card table').length, scards: document.querySelectorAll('.scard').length,
      old: document.querySelectorAll('#card-front, #card-back').length }));
    assert.deepStrictEqual(one, { cards: 1, tables: 1, scards: 1, old: 0 }); ok('a single scorecard card (no Front 9 / Back 9 tables)');
    const T = await table(), lbl = T.map(r => r[0]);
    assert.deepStrictEqual(lbl, ['Hole', 'Par', 'Length', 'Score', 'Tot', 'OTT', 'APP', 'ARG', 'Putt', 'Putts', 'GIR', 'Club', 'FIR', 'Drive dist', '1st putt', 'Last putt', 'Up & down', 'Sandies', 'Recovery']);
    assert.ok(!lbl.some(l => /scott/i.test(l)), 'no name row'); ok('row labels in order: ' + lbl.join(' · ') + ' (no player-name row)');
    const row = l => T.find(r => r[0] === l).slice(1), col = i => Object.fromEntries(T.map(r => [r[0], r[1 + i]]));
    assert.deepStrictEqual(row('Hole'), [...Array(18)].map((x, i) => String(i + 1)).concat(['OUT', 'IN', 'TOT'])); ok('columns: holes 1-18, then OUT · IN · TOT');
    assert.strictEqual(await P.locator('#scorecard th[scope="row"]').count(), 19);

    // ---------- 2. values ----------
    assert.deepStrictEqual(col(0), { Hole: '1', Par: '4', Length: '340', Score: '5', Tot: '-1.14', OTT: '-0.01', APP: '-0.61', ARG: '-0.41', Putt: '-0.11', Putts: '2', GIR: '✗', Club: 'DR', FIR: '✓',
      'Drive dist': '215', '1st putt': '22', 'Last putt': '2', 'Up & down': '✗', Sandies: '✗', Recovery: '' });
    assert.deepStrictEqual(col(1), { Hole: '2', Par: '4', Length: '320', Score: '4', Tot: '-0.21', OTT: '-1.00', APP: '+0.81', ARG: '', Putt: '-0.01', Putts: '2', GIR: '✓', Club: '', FIR: '✗',
      'Drive dist': '215', '1st putt': '31', 'Last putt': '2', 'Up & down': '', Sandies: '', Recovery: '✓' });
    assert.deepStrictEqual(col(2), { Hole: '3', Par: '3', Length: '140', Score: '3', Tot: '-0.03', OTT: '', APP: '+0.17', ARG: '', Putt: '-0.20', Putts: '2', GIR: '✓', Club: '8I', FIR: '–',
      'Drive dist': '', '1st putt': '16', 'Last putt': '2', 'Up & down': '', Sandies: '', Recovery: '' });
    assert.deepStrictEqual(col(7), { Hole: '8', Par: '4', Length: '300', Score: '4', Tot: '-0.29', OTT: '-0.37', APP: '-0.38', ARG: '+0.34', Putt: '+0.13', Putts: '1', GIR: '✗', Club: '', FIR: '✗',
      'Drive dist': '180', '1st putt': '4', 'Last putt': '4', 'Up & down': '✓', Sandies: '', Recovery: '' });
    assert.deepStrictEqual([col(14).Score, col(14).Tot, col(14).GIR, col(12).Score], ['3', '+0.71', '✓', '6']);
    ok('hole 1: bogey 5, SG −1.14 (OTT −0.01, APP −0.61, ARG −0.41, PUTT −0.11), 2 putts, missed green, Driver, fairway, 215 yd drive, 22 ft then 2 ft, bunker chip not saved');
    ok('hole 2: par, tee shot in the trees (OTT −1.00, FIR ✗) but recovered for par; hole 3: par 3 with an 8 iron, FIR dash; hole 8: chip + 4 ft putt = up & down ✓');
    assert.deepStrictEqual([col(18), col(19), col(20)].map(c => [c.Par, c.Length, c.Score, c.Tot, c.Putts, c.GIR, c.FIR, c.Club]),
      [['36', '2800', '39', '-5.80', '16', '4/9', '4/7', ''], ['36', '2731', '39', '-6.03', '15', '3/9', '4/7', ''], ['72', '5531', '78', '-11.82', '31', '7/18', '8/14', '']]);
    assert.deepStrictEqual(['Drive dist', '1st putt', 'Last putt', 'Up & down', 'Sandies', 'Recovery', 'OTT', 'APP', 'ARG', 'Putt'].map(k => col(20)[k]), ['216', '19.6', '3.4', '4/11', '0/1', '1/1', '-2.97', '-5.94', '-3.35', '+0.43']);
    // cross-check against the strokes-gained engine
    const eng = await P.evaluate(() => { const r = window.__golf.rounds().find(x => x.id === 'arc78'), S = SG.summarize(r); return { tot: S.sgTotal, c: S.cats, strokes: S.strokes, putts: S.putts, gir: S.gir, fw: [S.fwHit, S.fwTotal] }; });
    const f2 = v => { const t = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (t === '-0.00' ? '0.00' : t); };
    assert.deepStrictEqual([col(20).Tot, col(20).OTT, col(20).APP, col(20).ARG, col(20).Putt, col(20).Score, col(20).Putts, col(20).GIR, col(20).FIR],
      [f2(eng.tot), f2(eng.c.tee.sg), f2(eng.c.approach.sg), f2(eng.c.short.sg), f2(eng.c.putting.sg), String(eng.strokes), String(eng.putts), eng.gir + '/18', eng.fw.join('/')]);
    ok('OUT 39 / IN 39 / TOT 78 · SG −11.82 = OTT −2.97 + APP −5.94 + ARG −3.35 + PUTT +0.43 (matches the SG engine) · 31 putts · GIR 7/18 · FIR 8/14 · drive avg 216 · up & down 4/11 · sandies 0/1 · recovery 1/1');
    const marks = await P.$$eval('#scorecard tr.sscore td:not(.sum) .mk', ms => ms.map(m => m.getAttribute('data-mark')));
    assert.deepStrictEqual([marks[0], marks[1], marks[6], marks[12], marks[14]], ['bogey', 'par', 'bogey', 'bogey', 'birdie']); ok('score shapes kept (bogey square on 1, 7 and 13, birdie circle on 15, par plain)');
    const tints = await P.evaluate(() => { const c = (r, i) => getComputedStyle(document.querySelectorAll(`#scorecard tr.${r} td`)[i]).backgroundColor;
      return { h1tot: c('sgtot', 0), h2app: c('sgapp', 1), h3app: c('sgapp', 2), h2arg: c('sgarg', 1), h15tot: c('sgtot', 14) }; });
    const rgba = s => s.match(/[\d.]+/g).map(Number);
    assert.ok(rgba(tints.h1tot)[0] > rgba(tints.h1tot)[1], 'negative = red ' + tints.h1tot); assert.ok(rgba(tints.h2app)[1] > rgba(tints.h2app)[0], 'positive = green ' + tints.h2app);
    assert.ok(rgba(tints.h2app)[3] > rgba(tints.h3app)[3], 'bigger gain = deeper tint'); assert.strictEqual(tints.h2arg, 'rgba(0, 0, 0, 0)');
    ok(`strokes-gained cells tinted: red for lost, green for gained, deeper for bigger numbers (APP +0.81 ${tints.h2app} vs +0.17 ${tints.h3app})`);

    // ---------- 3. look: compact rows, light type, sideways scroll, sticky labels ----------
    const look = await P.evaluate(() => { const S = document.getElementById('scscroll'), cs = e => getComputedStyle(e);
      const trs = [...document.querySelectorAll('#scorecard tr:not(.scgap)')].map(t => t.getBoundingClientRect().height);
      const cells = [...document.querySelectorAll('#scorecard td:not(.sum) .hc')].filter(b => !b.closest('tr.shole')).map(b => +cs(b).fontWeight);
      const card = document.getElementById('sccard').getBoundingClientRect();
      return { sw: S.scrollWidth, cw: S.clientWidth, ox: cs(S).overflowX, minH: Math.min(...trs), maxH: Math.max(...trs), cellW: Math.max(...cells), cellFs: parseFloat(cs(document.querySelector('#scorecard tr.spar .hc')).fontSize),
        holeW: +cs(document.querySelector('#scorecard tr.shole .hc')).fontWeight, lblW: +cs(document.querySelector('#scorecard tr.spar th')).fontWeight, lblFs: parseFloat(cs(document.querySelector('#scorecard tr.spar th')).fontSize),
        pos: cs(document.querySelector('#scorecard tr.spar th')).position, radius: parseFloat(cs(document.getElementById('sccard')).borderTopLeftRadius), card: [card.left, card.right], docW: document.documentElement.scrollWidth }; });
    assert.ok(look.sw > look.cw + 200 && look.ox === 'auto', 'scrolls sideways ' + JSON.stringify(look));
    assert.ok(/\.sc1card \.scscroll \{[^}]*overflow-x: auto;[^}]*-webkit-overflow-scrolling: touch/.test(fs.readFileSync(__dirname + '/../styles.css', 'utf8')), 'momentum scrolling on iPhone');
    assert.ok(look.minH >= 30 && look.maxH <= 34, 'rows 30-34 px ' + look.minH + '-' + look.maxH);
    assert.ok(look.cellW <= 400 && look.holeW === 500 && look.lblW === 500 && look.cellFs <= 13 && look.lblFs <= 11, 'light type ' + JSON.stringify(look));
    assert.ok(look.pos === 'sticky' && look.radius >= 14 && look.card[0] >= 0 && look.card[1] <= 390 && look.docW <= 390, JSON.stringify(look));
    ok(`one card ${look.cw}px wide scrolls to ${look.sw}px (overflow-x auto + iPhone momentum); rows ${look.minH.toFixed(0)}-${look.maxH.toFixed(0)} px; numbers weight ${look.cellW}, hole numbers/labels ${look.holeW}; page itself never scrolls sideways`);
    await P.locator('#sccard').scrollIntoViewIfNeeded(); await P.evaluate(() => window.scrollTo(0, document.querySelector('.sclabel').getBoundingClientRect().top + window.scrollY - 128));
    await shot('scorecard-top.png');
    await P.evaluate(() => { const S = document.getElementById('scscroll'); S.scrollLeft = S.scrollWidth; });
    const st = await P.evaluate(() => { const S = document.getElementById('scscroll').getBoundingClientRect(), th = document.querySelector('#scorecard tr.sgtot th').getBoundingClientRect(),
      h1 = document.querySelector('#scorecard tr.shole td').getBoundingClientRect(), tot = document.querySelector('#scorecard tr.shole td.sum.tot').getBoundingClientRect();
      const hit = document.elementFromPoint(th.left + 10, th.top + th.height / 2); return { sl: S.left, th: th.left, h1r: h1.right, totR: tot.right, sr: S.right, top: hit && hit.closest('th') && hit.closest('th').textContent }; });
    assert.ok(Math.abs(st.th - st.sl) < 1.5 && st.h1r < st.sl && st.totR <= st.sr + 1 && st.top === 'Tot', 'labels stick ' + JSON.stringify(st));
    ok('scrolled right: TOT column in view, hole 1 off the left edge, labels still stuck on the left (and on top)');
    await shot('scorecard-scrolled.png');

    // ---------- 4. tap a hole still opens it ----------
    await P.locator('#scorecard tr.sscore [data-act="goHole"][data-i="12"]').click(); assert.match(await P.textContent('.hc-head'), /Hole 13/);
    await P.locator('[data-act="summary"]').first().click(); await P.waitForSelector('#scorecard');
    await P.locator('#scorecard tr.sgapp [data-act="goHole"][data-i="1"]').click(); assert.match(await P.textContent('.hc-head'), /Hole 2/);
    ok('tapping a score (hole 13) or any cell in a hole\'s column (APP on 2) opens that hole');

    // ---------- 5. in-progress round: unplayed holes blank ----------
    await openRound('live1');
    const L = await table(), lc = i => Object.fromEntries(L.map(r => [r[0], r[1 + i]]));
    assert.deepStrictEqual(lc(4).Score, '5'); assert.ok(lc(0).Tot && lc(0).Putts === '2', 'hole 1 played');
    for (const i of [5, 6, 17]) { const c = lc(i); assert.ok(c.Par && c.Length !== undefined, 'par shown'); Object.entries(c).forEach(([k, v]) => { if (!['Hole', 'Par', 'Length'].includes(k)) assert.strictEqual(v, '', `hole ${i + 1} ${k} blank`); }); }
    const exp = await P.evaluate(() => { const r = window.__golf.rounds().find(x => x.id === 'live1'), S = SG.summarize(r); return { strokes: S.strokes, putts: S.putts, sg: S.sgTotal, gir: S.gir, done: S.holesDone }; });
    assert.strictEqual(exp.done, 5);
    assert.deepStrictEqual([lc(18).Score, lc(18).Putts, lc(18).GIR, lc(20).Score, lc(20).Par, lc(19).Score, lc(19).Putts, lc(19).Tot], [String(exp.strokes), String(exp.putts), exp.gir + '/5', String(exp.strokes), '72', '', '', '']);
    assert.strictEqual(lc(20).Tot, f2(exp.sg));
    assert.strictEqual(await P.$$eval('#scorecard tr.sscore td.done', t => t.length), 5);
    ok(`in-progress round: holes 1-5 filled (${exp.strokes} strokes, ${exp.putts} putts, SG ${f2(exp.sg)}), hole 6 (started) and 7-18 blank except par and length; IN column blank`);

    assert.deepStrictEqual(errors, []); ok('no page errors, no outside calls');
    console.log('ALL OK scorecard-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
