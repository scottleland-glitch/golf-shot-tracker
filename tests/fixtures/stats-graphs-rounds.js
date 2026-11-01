// v116 Stats graphs test rounds: 6 finished rounds for Scott with planned scores (par 3s, 4s and 5s, an ace, an albatross,
// quadruple and worse), one 9-hole par-3 course round, and 1 unfinished round. Strokes on a hole = number of rows.
(() => {
  const R = (dist, loc) => ({ dist, loc, dir: '', pen: false });
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const hole = (par, n, i) => {
    let rows;
    if (n === 1) rows = [R(140 + i, 'holedx')];                                   // ace
    else if (n === 2) rows = [R(par * 100 + 40 + i, 'tee'), R(par === 3 ? 12 : 200, par === 3 ? 'holed' : 'holedx')]; // albatross / eagle on a 4 / birdie on a 3
    else { rows = [R(par === 3 ? 150 + i : par * 100 + 20 + i, 'tee')]; let d = par === 3 ? 60 : 240;
      for (let k = 0; k < n - 3; k++) { rows.push(R(k === n - 4 && i % 3 === 0 ? 14 : d, k === n - 4 && i % 3 === 0 ? 'rough' : (k + i) % 3 === 1 ? 'rough' : 'fairway')); d = Math.max(25, Math.round(d * 0.55)); }
      rows.push(R(18 + (i % 4) * 6, 'green'), R(2 + (i % 3), 'holed')); }
    return { par, finished: true, rows };
  };
  const D = { // strokes over par per hole
    g1: [0, 1, 0, 1, 0, 2, 1, 0, -1, 0, 0, 1, 0, 3, 1, 0, 1, 0],
    g2: [1, 0, -2, 0, 4, 1, 0, 1, 0, -1, 1, 0, 1, 0, 2, 1, 0, 1],
    g3: [0, 0, 1, -3, 1, 0, 2, 1, 0, 0, 0, 2, -1, 1, 0, 0, 1, 0],
    g5: [-1, 1, 0, 0, 0, 1, 5, 0, 1, 1, 0, 0, 0, 1, -1, 0, 0, -2],
    g6: [0, 0, 0, -1, 1, 0, 0, 2, 0, 0, -1, 1, 0, 0, 1, 3, 0, 0] };
  const mk = (id, date, course, diffs, pars) => ({ v: 3, dv: 2, id, date, course, baseline: 'pga', player: 'Scott', holes: diffs.map((d, i) => hole(pars[i], pars[i] + d, i)) });
  const rounds = [
    mk('g1', '2026-09-05T15:00:00.000Z', 'Lakeridge', D.g1, PARS), mk('g2', '2026-09-12T15:00:00.000Z', 'Wolf Run', D.g2, PARS),
    mk('g3', '2026-09-19T15:00:00.000Z', 'Somersett', D.g3, PARS),
    mk('g4', '2026-09-26T15:00:00.000Z', 'Rosewood Par 3', [0, 1, 0, -1, 2, 0, 1, 0, 0], [3, 3, 3, 3, 3, 3, 3, 3, 3]),
    mk('g5', '2026-10-03T15:00:00.000Z', 'Arcade Creek', D.g5, PARS), mk('g6', '2026-10-10T15:00:00.000Z', 'Lakeridge', D.g6, PARS)];
  const u = mk('g7', '2026-10-17T15:00:00.000Z', 'Wolf Run', D.g1, PARS); u.holes.forEach((h, i) => { if (i >= 10) { h.rows = [R(380, 'tee'), R(150, 'fairway')]; h.finished = false; } });
  rounds.push(u);
  localStorage.setItem('golfsg.player.v1', 'Scott');
  localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rounds));
})()
