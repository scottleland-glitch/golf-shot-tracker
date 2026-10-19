// Deterministic sample rounds for the Birdie zone test/screenshots (self-contained: it is also injected into the page as a string).
function makeBirdieRounds() {
  var s = 7; function rnd() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
  var D = ['', 'left', 'right', 'long', 'short', 'shortleft', 'longright', 'shortright', 'longleft'];
  var PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  var PROX = [2, 3, 5, 6, 7, 8, 9, 11, 12, 14, 16, 18, 21, 24, 27, 33, 4, 10, 13, 19, 25, 40];
  function pMake(ft) { return ft <= 3 ? 0.93 : ft <= 6 ? 0.68 : ft <= 10 ? 0.42 : ft <= 15 ? 0.24 : ft <= 20 ? 0.14 : ft <= 30 ? 0.08 : 0.03; }
  function R(dist, loc, dir) { return { dist: dist, loc: loc, dir: dir || '', pen: false }; }
  function putts(rows, ft, dir) { // rows so far end with the stroke that reached the green; add putt rows
    var d = ft, dd = dir, n = 0;
    while (true) { n++;
      if (n >= 3 || rnd() < pMake(d)) { rows.push(R(d, 'holed', dd)); return; }
      rows.push(R(d, 'green', dd)); d = Math.max(1, Math.round(d * (0.08 + rnd() * 0.12) + 1)); dd = D[1 + Math.floor(rnd() * 8)];
    }
  }
  var out = [];
  for (var j = 0; j < 4; j++) {
    var holes = PAR.map(function (par, i) {
      var rows = [R(par === 3 ? 150 + i * 3 : 380 + i * 4, 'tee')], dir = D[Math.floor(rnd() * 9)];
      if (par === 5) rows.push(R(250 - i, 'fairway', D[Math.floor(rnd() * 9)]));
      if (par !== 3) rows.push(R(120 + (i * 13) % 60, rnd() < 0.7 ? 'fairway' : 'rough', D[Math.floor(rnd() * 9)]));
      if (rnd() < 0.62) { // green in regulation
        putts(rows, PROX[Math.floor(rnd() * PROX.length)], dir);
      } else { // missed: chip on, then putt
        rows.push(R(10 + Math.floor(rnd() * 20), rnd() < 0.3 ? 'bunker' : 'rough', dir || 'short'));
        putts(rows, 3 + Math.floor(rnd() * 12), D[1 + Math.floor(rnd() * 8)]);
      }
      return { par: par, pin: ['center', 'frontleft', 'backright', 'front', 'back'][i % 5], finished: true, rows: rows };
    });
    out.push({ v: 3, dv: 2, id: 'bz' + (j + 1), date: '2026-10-1' + j + 'T17:00:00.000Z', course: ['Lakeridge', 'Pine Hills', 'Lakeridge', 'Bayview'][j], baseline: 'pga', player: 'Quincy', holes: holes });
  }
  return out;
}
if (typeof module !== 'undefined') module.exports = makeBirdieRounds;
