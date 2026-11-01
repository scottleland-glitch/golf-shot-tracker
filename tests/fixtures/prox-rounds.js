// v121 proximity page fixture: 2 finished 18-hole rounds with regulation approaches from 40–200 yd, from fairway, rough (both sides),
// bunker and par-3 tees; greens hit (first-putt ft + direction) and misses (yards left + direction + lie), one holed out.
(function (root) {
  const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const DIRS = ['left', 'right', 'long', 'short', 'shortleft', 'longright', 'shortright', 'longleft'];
  const mk = (id, day, off) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: id === 'p1' ? 'Arcade Creek' : 'Haggin Oaks', baseline: 'pga', player: 'Scott',
    holes: PARS.map((par, i) => {
      const k = i + off, ap = [150, 148, 165, 120, 152, 182, 95, 140, 75, 155, 135, 160, 110, 145, 200, 150, 130, 85][(i + off) % 18];
      const lie = par === 3 ? 'tee' : ['fairway', 'rough', 'fairway', 'bunker', 'rough', 'fairway'][k % 6], dir = DIRS[k % 8];
      const prev = [R(par === 5 ? 520 : 400, 'tee'), ...(par === 5 ? [R(ap + 230, 'fairway')] : [])];
      const start = par === 3 ? [] : prev, aRow = R(ap, lie, lie === 'rough' ? (k % 2 ? 'right' : 'left') : '');
      if (i === 6 && off === 0) return { par, finished: true, rows: [R(ap, 'holedx')] }; // ace from 95 yd
      const hit = k % 3 !== 2, rest = hit ? [R(6 + (k * 7) % 40, 'green', dir), R(2, 'holed', 'short')] : [R(6 + k % 14, k % 4 === 0 ? 'bunker' : 'rough', dir), R(8, 'green', 'left'), R(1, 'holed')];
      return { par, finished: true, rows: (par === 3 ? [R(ap, 'tee')] : start.concat([aRow])).concat(rest) };
    }) });
  const api = { p1: () => mk('p1', 18, 0), p2: () => mk('p2', 21, 5), all: () => [mk('p1', 18, 0), mk('p2', 21, 5)] };
  if (typeof module !== 'undefined') module.exports = api; else root.PROXFIX = api;
})(this);
