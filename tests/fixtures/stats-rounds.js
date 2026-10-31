// v110 Stats test rounds: 7 finished rounds for Scott (Aug–Oct 2026, one on the D1 college women baseline), 1 unfinished (12 of 18 holes), 1 for Quincy.
(() => {
  const R = (dist, loc, dir) => ({ dist, loc, dir: dir || '', pen: false });
  const mk = (id, date, course, k, player, bl, unfinished) => {
    const holes = [];
    for (let i = 0; i < 18; i++) {
      const p = [4, 3, 5, 4, 4, 3][i % 6], v = (i * 3 + k) % 5, g = [4, 7, 12, 22, 9][(i + 2 * k) % 5];
      let rows;
      if (p === 3) rows = [R(150 + 5 * i, 'tee', v ? '' : 'short')].concat(v === 0 ? [R(14, 'rough')] : []);
      else rows = [R(370 + 6 * i, 'tee', v === 1 ? 'left' : v === 3 ? 'right' : '')].concat(p === 5 ? [R(230 + 4 * k, 'fairway')] : [], [R(105 + 11 * v + 3 * k, v === 1 || v === 3 ? 'rough' : 'fairway')], v === 4 && k % 2 ? [R(12, 'sand')] : []);
      const f = (i * 7 + k * 3) % 5;
      rows = rows.concat(f === 0 ? [R(g, 'holed')] : f === 1 || f === 4 ? [R(g, 'green'), R(2, 'holed')] : f === 2 ? [R(g + 14, 'green'), R(5, 'green'), R(1, 'holed')] : [R(g, 'green'), R(3, 'holed')]);
      holes.push({ par: p, finished: true, rows });
    }
    if (unfinished) holes.forEach((h, i) => { if (i >= 12) { h.rows = [R(380, 'tee'), R(150, 'fairway')]; h.finished = false; } });
    return { v: 3, dv: 2, id, date, course, baseline: bl || 'pga', player: player || 'Scott', holes };
  };
  const rounds = [
    mk('s1', '2026-08-02T15:00:00.000Z', 'Lakeridge', 0), mk('s2', '2026-08-16T15:00:00.000Z', 'Arcade Creek', 1, 'Scott', 'd1w'),
    mk('s3', '2026-08-30T15:00:00.000Z', 'Wolf Run', 2), mk('s4', '2026-09-13T15:00:00.000Z', 'Lakeridge', 3), mk('s5', '2026-09-27T15:00:00.000Z', 'Somersett', 4),
    mk('s6', '2026-10-04T15:00:00.000Z', 'Arcade Creek', 5), mk('s7', '2026-10-18T15:00:00.000Z', 'Lakeridge', 6),
    mk('u1', '2026-10-25T15:00:00.000Z', 'Wolf Run', 0, 'Scott', 'pga', true), mk('q1', '2026-09-20T15:00:00.000Z', 'Lakeridge', 2, 'Quincy')];
  localStorage.setItem('golfsg.player.v1', 'Scott');
  localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rounds));
})()
