// v118 Club performance fixture: 2 finished 9-hole rounds with clubs on every full shot (Driver / 3W / 5H / irons / PW / 56)
// + 1 round with no clubs entered (empty state). Rows: [distance, lie, Dir of the ball at that row, club for the shot from that row]
(function (root) {
  const R = (d, l, dir, club) => Object.assign({ dist: d, loc: l, dir: dir || '', pen: false }, club ? { club } : {});
  const H = (par, rows) => ({ par, finished: true, rows });
  const cd1 = () => ({ v: 3, dv: 2, id: 'cd1', date: '2026-10-20T17:00:00.000Z', course: 'Arcade Creek', baseline: 'pga', player: 'Scott', holes: [
    H(4, [R(400, 'tee', '', 'Driver'), R(150, 'fairway', '', '7i'), R(20, 'green', 'short'), R(2, 'holed')]),
    H(4, [R(410, 'tee', '', 'Driver'), R(160, 'rough', 'left', '7i'), R(15, 'rough', 'short', '56'), R(6, 'holed', 'left')]),
    H(3, [R(170, 'tee', '', '6i'), R(25, 'green', 'right'), R(3, 'holed', 'short')]),
    H(5, [R(520, 'tee', '', 'Driver'), R(280, 'fairway', '', '3W'), R(110, 'fairway', '', 'PW'), R(12, 'green', 'long'), R(2, 'holed')]),
    H(4, [R(380, 'tee', '', 'Driver'), R(140, 'rough', 'right', '8i'), R(30, 'green', 'left'), R(4, 'holed', 'short')]),
    H(4, [R(360, 'tee', '', '3W'), R(150, 'fairway', '', '7i'), R(10, 'rough', 'shortleft', '56'), R(4, 'holed', 'right')]),
    H(4, [R(400, 'tee', '', 'Driver'), R(145, 'fairway', '', '7i'), R(8, 'green', 'right'), R(1, 'holed', 'short')]),
    H(4, [Object.assign(R(390, 'tee', '', '3W'), { layup: true }), R(170, 'fairway', '', '5H'), R(40, 'green', 'long'), R(3, 'holed', 'short')]),
    H(3, [R(150, 'tee', '', '8i'), R(12, 'rough', 'left', '56'), R(5, 'green', 'short'), R(1, 'holed', 'left')])] });
  const cd2 = () => ({ v: 3, dv: 2, id: 'cd2', date: '2026-10-22T17:00:00.000Z', course: 'Haggin Oaks', baseline: 'pga', player: 'Scott', holes: [
    H(4, [R(400, 'tee', '', 'Driver'), R(170, 'rough', 'left', '6i'), R(35, 'green', 'short'), R(2, 'holed')]),
    H(4, [R(380, 'tee', '', 'Driver'), R(130, 'fairway', '', '8i'), R(15, 'green', 'long'), R(2, 'holed', 'short')]),
    H(5, [R(510, 'tee', '', 'Driver'), R(260, 'rough', 'right', '3W'), R(90, 'fairway', '', '56'), R(10, 'green', 'short'), R(2, 'holed', 'right')]),
    H(4, [R(390, 'tee', '', 'Driver'), R(150, 'fairway', '', '7i'), R(20, 'rough', 'long', '56'), R(6, 'green', 'left'), R(1, 'holed')])] });
  const cd3 = () => ({ v: 3, dv: 2, id: 'cd3', date: '2026-10-24T17:00:00.000Z', course: 'No clubs', baseline: 'pga', player: 'Scott', holes: [
    H(4, [R(380, 'tee'), R(150, 'fairway'), R(20, 'green', 'short'), R(2, 'holed')]), H(3, [R(160, 'tee'), R(18, 'green', 'left'), R(2, 'holed')])] });
  const api = { cd1, cd2, cd3, all: () => [cd1(), cd2(), cd3()] };
  if (typeof module !== 'undefined') module.exports = api; else root.CLUBFIX = api;
})(this);
