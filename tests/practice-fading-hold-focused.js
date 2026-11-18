// v238 (Scott): Practice "This week" page 3 is a fading average (half-life 3 days, minutes a week). Tournament and
// practice-round days hold it flat at the level before (no dip, no spike from a warm-up logged that day) and are
// shaded; a single day between two round days is held too. A plain break with no rounds still fades.
// iPhone 390x844. Run: node tests/practice-fading-hold-focused.js
const { chromium } = require('playwright-core');
const assert = require('assert');
const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', PORT = 8881, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function dayOffset(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); }
const SP = ['lag', 'chip', 'wedges', 'irons', 'drive', 'short'];
// practice every day from `first` days ago to today except the days in `skip`; plus extra logs
function logs(first, skip, extra) { const P = []; for (let a = first; a >= 0; a--) if (skip.indexOf(a) < 0) P.push({ id: 'p' + a, date: dayOffset(-a) + 'T09:00:00', player: 'Scott', spoke: SP[a % 6], focus: '', min: 40 + (a % 3) * 10 });
  (extra || []).forEach((e, i) => P.push(Object.assign({ id: 'x' + i, player: 'Scott', focus: '' }, e))); return P; }
const round = (id, ago, play) => Object.assign(ARC.round(), { id, player: 'Scott', play, course: 'Torrey Pines', date: dayOffset(-ago) + 'T16:00:00' });

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now());
    const open = async (P, R) => {
      await page.evaluate(({ P, R }) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
        localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P));
        localStorage.setItem('golfsg.typical.v1', JSON.stringify({ scott: { weekMin: 420, roundsMonth: 4, set: '2026-08-01' } })); }, { P, R });
      await page.reload(); await page.waitForSelector('#home'); await page.click('#tbpractice'); await page.waitForSelector('#weekcard');
      if (await page.$('#waclose')) await page.click('#waclose');
      return page.$eval('#wkpages .wkpage[data-p="2"]', p => { const s = p.querySelector('svg');
        const tot = s.querySelector('path.wktotal'), pts = tot ? (tot.getAttribute('d').match(/[\d.]+ [\d.]+/g) || []).map(q => q.split(' ').map(Number)) : [];
        return { head: p.querySelector('.wkpt').textContent, note: p.querySelector('.wknote').textContent, from: s.getAttribute('data-from'), n: +s.getAttribute('data-n'),
          tots: s.getAttribute('data-tots').split(',').map(Number), hold: +s.getAttribute('data-hold'), pts,
          shades: [].map.call(s.querySelectorAll('rect.wkhold'), r => ({ from: r.getAttribute('data-from'), to: r.getAttribute('data-to'), x: +r.getAttribute('x'), w: +r.getAttribute('width') })),
          trophies: s.querySelectorAll('.wktour').length, fill: (() => { const r = s.querySelector('rect.wkhold'); return r ? getComputedStyle(r).fill : null; })() }; });
    };
    const idx = (D, ago) => D.n - 1 - ago;
    const xAt = (D, i) => 34 + i / (D.n - 1) * 298;

    // San Diego trip, 12..9 days ago (Sun–Wed shape): practice round, tournament, (no round – travel/rest), tournament.
    // Practice every other day before; a 120 min warm-up logged on the first tournament day; practice resumes after.
    const skip = [12, 11, 10, 9]; for (let a = 30; a > 12; a -= 2) skip.push(a);
    const P = logs(30, skip, [{ date: dayOffset(-11) + 'T07:00:00', spoke: 'lag', min: 120 }]);
    const R = [round('rp', 12, 'practice'), round('t1', 11, 'tournament'), round('t2', 9, 'tournament')];
    let D = await open(P, R);
    assert.strictEqual(D.head, 'Last 5 weeks · fading average');
    assert.match(D.note, /shaded = tournament\/round days/);
    assert.strictEqual(D.shades.length, 1, 'one shaded block'); assert.strictEqual(D.shades[0].from, dayOffset(-12)); assert.strictEqual(D.shades[0].to, dayOffset(-9));
    assert.strictEqual(D.hold, 4, 'practice round + 2 tournament days + the day between them are held');
    assert.ok(Math.abs(D.shades[0].x - (xAt(D, idx(D, 12)) - 298 / (D.n - 1) / 2)) < 0.2 && D.shades[0].w > 3 * 298 / (D.n - 1), 'block spans the 4 days');
    assert.strictEqual(D.fill, 'rgb(31, 138, 76)', 'soft green tint, not purple');
    assert.strictEqual(D.trophies, 1, 'one trophy for the tournament stretch (the day between two tournament days joins it)');
    ok('San Diego trip: one shaded block ' + D.shades[0].from + ' → ' + D.shades[0].to + ', 4 held days, one 🏆, green tint');

    const pre = D.tots[idx(D, 13)], held = [12, 11, 10, 9].map(a => D.tots[idx(D, a)]);
    assert.ok(pre > 60, 'a real level before the trip: ' + pre);
    assert.deepStrictEqual(held, [pre, pre, pre, pre], 'held flat at the level the day before – no dip, no spike from the 120 min warm-up: ' + held + ' vs ' + pre);
    const ys = D.pts.filter(p => p[0] >= xAt(D, idx(D, 12)) - 0.05 && p[0] <= xAt(D, idx(D, 9)) + 0.05).map(p => p[1]);
    assert.ok(ys.length >= 20 && Math.max(...ys) - Math.min(...ys) < 0.15, 'the drawn curve is flat through the block: ' + Math.min(...ys) + '–' + Math.max(...ys));
    assert.notStrictEqual(D.tots[idx(D, 8)], pre, 'practice resumes moving the curve the day after');
    assert.ok(D.tots[idx(D, 0)] > pre, 'daily practice after the trip builds above the old every-other-day level');
    ok('flat at ' + pre + ' min a week through the trip (drawn curve flat too), moves again after: ' + D.tots.slice(idx(D, 14), idx(D, 6)).join(', '));

    // the same logs with no rounds: the curve falls through those days, and the warm-up shows as a bump
    D = await open(P, []);
    assert.strictEqual(D.shades.length, 0, 'no shading without rounds'); assert.strictEqual(D.hold, 0);
    assert.ok(D.tots[idx(D, 12)] < D.tots[idx(D, 13)], 'without rounds the first trip day fades');
    assert.ok(D.tots[idx(D, 11)] > D.tots[idx(D, 13)] && D.tots[idx(D, 10)] < D.tots[idx(D, 11)], 'and the warm-up shows as a spike that then fades');
    ok('without rounds the same days dip and spike (' + D.tots.slice(idx(D, 13), idx(D, 8)).join(', ') + ') and nothing is shaded');

    // a plain 6-day break (no golf): fades to under 40% of the level before, then rises when practice resumes
    D = await open(logs(30, [12, 11, 10, 9, 8, 7]), []);
    const b0 = D.tots[idx(D, 13)], b1 = D.tots[idx(D, 7)];
    assert.ok(b1 < 0.4 * b0, 'plain break fades: ' + b0 + ' → ' + b1);
    assert.ok(D.tots[idx(D, 6)] > b1 && D.tots[idx(D, 0)] > 0.8 * b0, 'rises again once practice resumes');
    for (let a = 12; a > 7; a--) assert.ok(D.tots[idx(D, a)] < D.tots[idx(D, a + 1)], 'falls every day of the break');
    ok('plain break: ' + b0 + ' → ' + b1 + ' min a week over 6 days, then back to ' + D.tots[idx(D, 0)]);

    // one rest day doesn't collapse it
    D = await open(logs(20, [5]), []);
    assert.ok(D.tots[idx(D, 5)] > 0.75 * D.tots[idx(D, 6)], 'a single rest day dips only a little: ' + D.tots[idx(D, 6)] + ' → ' + D.tots[idx(D, 5)]);
    ok('a single rest day dips only a little (' + D.tots[idx(D, 6)] + ' → ' + D.tots[idx(D, 5)] + ')');

    // first days of logging: no week-long fill-up ramp – day 3 is already near the steady level
    D = await open(logs(13, []), []);
    const steady = D.tots[idx(D, 0)];
    assert.ok(D.tots[idx(D, 11)] > 0.7 * steady, 'day 3 of logging is near the steady level: ' + D.tots[idx(D, 11)] + ' vs ' + steady);
    ok('first days: day 3 already ' + D.tots[idx(D, 11)] + ' vs steady ' + steady + ' min a week');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('PASS practice-fading-hold-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
