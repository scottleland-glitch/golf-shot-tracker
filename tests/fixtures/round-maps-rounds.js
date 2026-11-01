// v122 round-page maps fixture: 2 finished 18-hole rounds for Scott (par 3s, 4s, 5s) with pins set, tee shots to the fairway,
// rough left / right, a bunker and the trees, greens hit and missed in every direction, and 1-, 2- and 3-putt holes with directions.
(function (root) {
  const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const D = ['left', 'right', 'long', 'short', 'shortleft', 'longright', 'shortright', 'longleft'], PIN = ['center', 'frontleft', 'backright', 'back', 'front', 'center', 'left', 'right', 'backleft'];
  const mk = (id, day, off) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: id === 'm1' ? 'Arcade Creek' : 'Haggin Oaks', baseline: 'pga', player: 'Scott',
    holes: PARS.map((par, i) => {
      const k = i + off, ap = 95 + (k * 23) % 100, dir = D[k % 8];
      // tee shot (par 4 / 5): where row 2 is and the side entered on it
      const tee2 = [R(ap, 'fairway'), R(ap + 5, 'rough', 'left'), R(ap, 'fairway'), R(ap + 10, 'rough', 'right'), R(ap + 8, 'sand', 'left'), R(ap, 'fairway'), R(ap + 20, 'recovery', 'right')][k % 7];
      const start = par === 3 ? [R(ap + 40, 'tee')] : par === 5 ? [R(520, 'tee'), R(ap + 230, 'fairway'), R(ap, 'fairway')] : [R(400, 'tee'), tee2];
      const ft = 3 + (k * 7) % 32, pd = D[(k + 3) % 8];
      // a 'holed' row = the putt from that distance went in
      const putts = k % 5 === 0 ? [R(ft, 'holed', dir)]                                                                  // 1-putt
        : k % 5 === 3 ? [R(ft + 12, 'green', dir), R(5, 'green', pd), R(2, 'holed', D[(k + 5) % 8])]                     // 3-putt
        : [R(ft, 'green', dir), R(2 + k % 4, 'holed', pd)];                                                               // 2-putt
      const miss = k % 3 === 2, rows = miss ? start.concat([R(8 + k % 15, k % 4 === 0 ? 'sand' : 'rough', dir), R(6 + k % 9, 'green', D[(k + 1) % 8]), R(3, 'holed', pd)]) : start.concat(putts);
      return { par, pin: PIN[k % 9], finished: true, rows };
    }) });
  const api = { m1: () => mk('m1', 24, 0), m2: () => mk('m2', 26, 4), all: () => [mk('m1', 24, 0), mk('m2', 26, 4)] };
  if (typeof module !== 'undefined') module.exports = api; else root.MAPFIX = api;
})(this);
