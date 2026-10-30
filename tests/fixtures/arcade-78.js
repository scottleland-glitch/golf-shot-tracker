// v96 sample round: a completed 18 holes at Arcade Creek – 78 (+6), 5531 yd, 31 putts (like Scott's screenshot)
(function (root) {
  const PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const YDS = [340, 320, 140, 450, 310, 330, 145, 300, 465, 330, 135, 320, 455, 315, 300, 140, 290, 446];
  const SCORE = [5, 4, 3, 5, 5, 4, 4, 4, 5, 5, 3, 5, 6, 4, 3, 3, 5, 5];
  const PUTTS = [2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 1, 2, 2, 1];
  const FW = ['', 'L', '', 'R', '', '', '', 'R', '', 'L', '', '', 'R', '', '', '', 'L', '']; // tee-shot misses on par 4/5s
  const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false });
  function hole(i) {
    const par = PAR[i], y = YDS[i], s = SCORE[i], p = PUTTS[i], n = s - p, rows = [R(y, 'tee')];
    // off-green rows after the tee shot: n - 1 of them, getting closer
    for (let k = 1; k < n; k++) {
      const left = n - k; // shots still to reach the green
      const d = k === 1 && par > 3 ? Math.max(left === 1 ? 60 : 120, y - (par === 5 ? 250 : 215)) : left === 1 ? 15 : 90;
      const loc = k === 1 && par > 3 ? (FW[i] ? 'rough' : 'fairway') : left === 1 && n > par - 2 ? 'rough' : 'fairway';
      rows.push(R(k === 1 && par === 5 && left > 1 ? Math.max(160, y - 255) : d, loc, k === 1 && par > 3 ? FW[i] : left === 1 && n > par - 2 ? (i % 2 ? 'R' : 'L') : ''));
    }
    const first = p === 1 ? [6, 9, 4, 12, 3][i % 5] : [22, 31, 16, 40, 18, 27][i % 6];
    for (let k = 0; k < p - 1; k++) rows.push(R(k === 0 ? first : 3, 'green'));
    rows.push(R(p === 1 ? first : 2, 'holed'));
    return { par, finished: true, rows };
  }
  const round = () => ({ v: 3, dv: 2, id: 'arc78', date: '2026-10-29T17:05:00.000Z', course: 'Arcade Creek', baseline: 'pga', player: 'Scott', holes: PAR.map((x, i) => hole(i)) });
  if (typeof module !== 'undefined') module.exports = { round }; else root.ARC78 = { round };
})(this);
