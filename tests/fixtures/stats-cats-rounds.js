// v125 Stats categories test rounds: 6 finished rounds for Scott with shots in every putting bucket (first putt under 5 / 5-10 / 10-25 / over 25 ft)
// and every chipping bucket (bunker / rough / fairway, up to 10 / 10-20 / 20-30 yd); round c3 has no bunker shot and no first putt over 25 ft
// (so those graphs skip it). Round c7 is in progress (11 of 18 holes finished) and is the open round.
(() => {
  const R = (dist, loc, x) => Object.assign({ dist, loc, dir: '', pen: false }, x || {});
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const LIES = ['bunker', 'rough', 'fairway'], CHIP = [5, 8, 14, 18, 24, 28], FP = [3, 7, 15, 32, 4, 12];
  const hole = (par, i, j) => {
    const k = i + j * 5, len = par === 3 ? 150 + (k % 5) * 8 : par === 4 ? 380 + (k % 7) * 9 : 520 + (k % 4) * 11;
    const rows = [R(len, 'tee', { club: par === 3 ? '7i' : (k % 9 === 4 ? '3w' : 'Driver') })];
    if (par !== 3) rows.push(R(par === 5 ? 250 - (k % 5) * 12 : len - 230 - (k * 13) % 50, k % 4 === 1 ? 'rough' : 'fairway'));
    if (par === 5) rows.push(R(110 + (k % 3) * 15, 'fairway'));
    let lie = LIES[k % 3]; if (j === 2 && lie === 'bunker') lie = 'rough';
    if (k % 2 === 0) rows.push(R(CHIP[(k >> 1) % 6], lie));           // a short shot on every other hole
    let fp = FP[k % 6]; if (j === 2 && fp > 25) fp = 20;
    if (fp < 5 && k % 4 === 0) rows.push(R(fp, 'holed'));             // first putt holed
    else if (k % 7 === 3) rows.push(R(fp, 'green'), R(6, 'green'), R(2, 'holed'));  // a 3-putt
    else rows.push(R(fp, 'green'), R(2, 'holed'));
    return { par, finished: true, rows };
  };
  const mk = (id, date, course, j) => ({ v: 3, dv: 2, id, date, course, baseline: 'pga', player: 'Scott', holes: PARS.map((p, i) => hole(p, i, j)) });
  const rounds = [mk('c1', '2026-09-05T15:00:00.000Z', 'Lakeridge', 0), mk('c2', '2026-09-12T15:00:00.000Z', 'Wolf Run', 1), mk('c3', '2026-09-19T15:00:00.000Z', 'Somersett', 2),
    mk('c4', '2026-09-26T15:00:00.000Z', 'Arcade Creek', 3), mk('c5', '2026-10-03T15:00:00.000Z', 'Lakeridge', 4), mk('c6', '2026-10-10T15:00:00.000Z', 'Red Hawk', 5)];
  const u = mk('c7', '2026-10-31T15:00:00.000Z', 'Wolf Run', 6); u.holes.forEach((h, i) => { if (i >= 11) { h.rows = []; h.finished = false; } });
  rounds.push(u);
  localStorage.setItem('golfsg.player.v1', 'Scott');
  localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rounds));
  localStorage.setItem('golfsg.current.v1', 'c7');
})()
