// v221 (Scott): the Practice page from the top down –
//   gaps(): "Your game and your training" – per skill, strokes lost a round (My Game, 3 months), practice a week (last 30 days, v240)
//           and whether that gap is closing in your rounds (last 30 days against the 3 months before).
//   ahead(): "Your week ahead" – each Monday: what's working / what slipped in last week's rounds (by part of the game, against
//           your 3-month normal), this week's targets with what changed since last week, and one plain sentence why.
// Pure (tested in node: tests/weekahead.test.js); app.js draws the cards.
(function (root) {
  'use strict';
  var DAY = 864e5, WEEK = 7 * DAY;
  var CFG = { lostDays: 91, pracDays: 30, recentDays: 30, baseDays: 120, arrow: 0.3, work: 0.5, groupNeed: { putt: 10, short: 3, wedge: 3, full: 6 }, keepMin: 5, change: 5, bigChange: 15 };
  function mondayOf(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function when(r) { return Date.parse(r.date); }
  function within(list, a, b) { return list.filter(function (r) { var t = when(r); return !isNaN(t) && t >= a && t < b; }); }
  function minutes(logs, a, b) { var by = {}; (logs || []).forEach(function (e) { var t = Date.parse(e.date); if (e.min > 0 && t >= a && t < b) by[e.spoke] = (by[e.spoke] || 0) + e.min; }); return by; }

  // ---- Your game and your training ----
  function gaps(o) {
    var now = o.now == null ? Date.now() : +o.now, MY = o.MYGAME, SG = o.SG, bl = o.bl, R = o.rounds || [];
    var lost = MY.shape(within(R, now - CFG.lostDays * DAY, now + DAY), SG, bl);
    var rec = MY.shape(within(R, now - CFG.recentDays * DAY, now + DAY), SG, bl), base = MY.shape(within(R, now - CFG.baseDays * DAY, now - CFG.recentDays * DAY), SG, bl);
    // v240: practice a week over the same 30 days (by calendar day) as the My Practice 30-day page, so the two numbers agree
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0); var end = d0.getTime() + DAY, pm = {}, wks = CFG.pracDays / 7;
    (o.logs || []).forEach(function (e) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.date || ''), t = m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : Date.parse(e.date);
      if (e.min > 0 && t >= end - CFG.pracDays * DAY && t < end) pm[e.spoke] = (pm[e.spoke] || 0) + e.min; });
    var rows = MY.SPOKES.map(function (s, i) {
      var L = lost.spokes[i], a = rec.spokes[i], b = base.spokes[i], arrow = null;
      if (a.n >= a.need / 2 && b.n >= b.need / 2 && a.value != null && b.value != null) { var d = a.value - b.value; arrow = d >= CFG.arrow ? 'up' : d <= -CFG.arrow ? 'down' : 'flat'; }
      return { k: s.k, name: s.name, lost: L.value == null ? null : -L.value, shots: L.n, solid: L.solid, week: Math.round((pm[s.k] || 0) / wks), arrow: arrow };
    });
    var tot = rows.reduce(function (t, r) { return t + r.week; }, 0) || 1, any = rows.some(function (r) { return r.week > 0; });
    // the biggest mismatch: a lot lost, little practice
    var cand = rows.filter(function (r) { return r.lost != null && r.lost >= 0.3; }).map(function (r) { return { r: r, gap: r.lost - 3 * r.week / tot }; }).sort(function (x, y) { return y.gap - x.gap; })[0];
    var f1 = function (v) { return (Math.round(v * 10) / 10).toFixed(1); }, head;
    if (!lost.rounds) head = 'Play a round and this fills in';
    else if (!cand) head = 'No big gaps – keep it balanced';
    else { var r = cand.r; head = r.name + (/(s|\+)$/.test(r.name) ? ' cost' : ' costs') + ' you ' + f1(r.lost) + ' a round' +
      (!any ? '' : r.week === 0 ? ' – and got no practice this month' : r.week / tot < 0.15 ? ' – and only ' + (MY.hm ? MY.hm(r.week) : r.week + ' min') + ' a week of practice' : ' – and you\'re on it'); }
    return { rows: rows, head: head, rounds: lost.rounds, practised: any };
  }

  // ---- Your week ahead ----
  // o: rounds, logs, SG, MYGAME, PLAN, bl, now, cur (this week's plan: weekMin), last (last week's plan: weekMin)
  function groupValue(sh, ks) { var v = 0, n = 0; sh.spokes.forEach(function (s) { if (ks.indexOf(s.k) >= 0 && s.value != null) { v += s.value; n += s.n; } }); return { v: v, n: n }; }
  function ahead(o) {
    var now = o.now == null ? Date.now() : +o.now, wk = mondayOf(now), lastWk = wk - WEEK, MY = o.MYGAME, SG = o.SG, G = o.PLAN.GROUPS;
    var R = o.rounds || [], recent = within(R, lastWk, now + DAY), baseR = within(R, lastWk - CFG.lostDays * DAY, lastWk);
    var res = [];
    if (recent.length && baseR.length) {
      var a = MY.shape(recent, SG, o.bl), b = MY.shape(baseR, SG, o.bl);
      var pr2 = minutes(o.logs, lastWk - WEEK, lastWk + WEEK), prN = minutes(o.logs, lastWk - 13 * WEEK, lastWk - WEEK);
      G.forEach(function (g) {
        var x = groupValue(a, g[2]), y = groupValue(b, g[2]); if (x.n < CFG.groupNeed[g[0]] || !y.n) return;
        var d = x.v - y.v, p2 = g[2].reduce(function (t, k) { return t + (pr2[k] || 0); }, 0) / 2, pn = g[2].reduce(function (t, k) { return t + (prN[k] || 0); }, 0) / 12;
        if (Math.abs(d) >= CFG.work) res.push({ g: g[0], name: g[1], d: d, worked: d > 0 && p2 >= Math.max(15, pn * 1.2), prac: Math.round(p2) });
      });
    }
    var working = res.filter(function (x) { return x.d > 0; }).sort(function (x, y) { return y.d - x.d; })[0] || null, slipped = res.filter(function (x) { return x.d < 0; }).sort(function (x, y) { return x.d - y.d; })[0] || null;
    var gOf = function (k) { for (var i = 0; i < G.length; i++) if (G[i][2].indexOf(k) >= 0) return G[i][0]; return null; };
    var r5 = function (v) { return Math.max(5, Math.round(v / 5) * 5); };
    var cur = o.cur || {}, last = o.last || {}, names = {}; MY.SPOKES.forEach(function (s) { names[s.k] = s.name; });
    var rows = Object.keys(cur).map(function (k) { var t = r5(cur[k]), l = last[k] == null ? null : r5(last[k]), dl = l == null ? 0 : t - l;
      var keep = !!working && working.worked && gOf(k) === working.g && dl > -CFG.keepMin * 2; // improving because of the practice → keep it up
      return { k: k, name: names[k] || k, target: t, last: l, delta: Math.abs(dl) >= CFG.change ? dl : 0, keep: keep }; }).sort(function (x, y) { return y.target - x.target; });
    var total = rows.reduce(function (t, r) { return t + r.target; }, 0), totalLast = rows.reduce(function (t, r) { return t + (r.last == null ? r.target : r.last); }, 0);
    var lastRound = recent.map(when).sort(function (x, y) { return y - x; })[0], day = lastRound ? new Date(lastRound).toLocaleDateString('en-US', { weekday: 'long' }) : '';
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }, low = function (s) { return s === 'Short game' ? 'short game' : s === 'Full swing' ? 'full swing' : s.toLowerCase(); };
    var head, why = [];
    if (working && slipped) head = (working.worked ? working.name + ' is working. ' : working.name + ' was good. ') + slipped.name + (slipped.name === 'Wedges' ? ' need' : ' needs') + ' you.';
    else if (working) head = working.worked ? working.name + ' is working – keep going' : working.name + ' was good last week';
    else if (slipped) head = slipped.name + (slipped.name === 'Wedges' ? ' were' : ' was') + ' off last week – more of it this week'; // v234: no "slipped"
    else head = recent.length ? 'A steady week ahead' : 'No rounds last week – same plan';
    var up = rows.filter(function (r) { return r.delta > 0; }).sort(function (x, y) { return y.delta - x.delta; });
    if (slipped && up.some(function (r) { return gOf(r.k) === slipped.g; })) why.push('More ' + low(slipped.name) + ' after ' + day + '\'s round.');
    else if (up.length) why.push('More ' + up[0].name.toLowerCase() + ' this week.');
    if (working && rows.some(function (r) { return r.keep; })) why.push(cap(low(working.name)) + ' stays high – practice takes a few weeks to show fully in your rounds.');
    if (!why.length) why.push(rows.some(function (r) { return r.delta; }) ? 'Small changes only – your rounds didn\'t shift the balance.' : recent.length ? 'Your rounds didn\'t change the balance – same plan as last week.' : 'Nothing new from your rounds, so the balance stays the same.');
    var lines = [];
    if (working) lines.push({ good: true, title: working.worked ? working.name + ' practice is paying off' : working.name + ' was good', text: Math.abs(working.d).toFixed(1) + ' strokes better ' + (recent.length > 1 ? 'a round last week' : 'in your last round') + ' than your 3-month average' + (working.worked ? ' – after ' + working.prac + ' min a week of ' + low(working.name) + ' practice.' : '.') });
    if (slipped) lines.push({ good: false, title: slipped.name + (slipped.name === 'Wedges' ? ' were off' : ' was off'), text: Math.abs(slipped.d).toFixed(1) + ' worse than usual' + (recent.length > 1 ? ' a round last week.' : ' on ' + day + '.') });
    return { week: wk, head: head, lines: lines, rows: rows, total: total, totalLast: totalLast, why: why.join(' '), working: working, slipped: slipped, rounds: recent.length, notify: head };
  }
  // a big change since the card was last seen: 15+ min on any area
  function changed(prev, cur) { if (!prev) return false; return Object.keys(cur || {}).some(function (k) { return Math.abs((cur[k] || 0) - (prev[k] || 0)) >= CFG.bigChange; }); }
  var api = { CFG: CFG, gaps: gaps, ahead: ahead, changed: changed, mondayOf: mondayOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WA = api;
})(this);
