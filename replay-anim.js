// v251 (Scott) Hole replay ▶ Play: the static replay map, then on Play every shot flies in the Dispersion look
// (white ball arcing with its shadow and tracer, hops where it lands). Tee and fairway shots play on the whole hole;
// the camera zooms to the green for the approach and the short game, then the true-scale green for the putts.
// Self-contained: replayHTML() puts the hole's geometry on the #rpplay button (data-geo), this file does the rest,
// so the same file runs in the app and on the coach site.
(function (root) {
  'use strict';
  var COL = { rough: '#2f6e35', ob: '#24502a', fw: '#4f9a45', fw2: '#58a34d', green: '#5cb85c', collar: '#4aa64b', edge: '#2e7d32', sand: '#efe2b8', sandEdge: '#cdbb86', red: '#e0313f', tee: '#6db35f' };
  var FONT = '-apple-system, system-ui, sans-serif';
  var run = null; // the animation playing now

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 2.4); }
  function lerpCam(a, b, t) { var e = ease(t); return { cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e, s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e) }; }
  function bez(a, c, b, k) { var u = 1 - k; return [u * u * a[0] + 2 * u * k * c[0] + k * k * b[0], u * u * a[1] + 2 * u * k * c[1] + k * k * b[1]]; }
  function hyp(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

  // ---------- timeline: when each shot flies, where the camera is ----------
  function plan(G, w, h) {
    var VW = G.W, VH = G.H - G.vy, s0 = Math.min(w / VW, h / VH), gc = [G.cx, G.gY], near = function (p) { return hyp(p, gc) < G.GR + 72; }; // within ~60 yd of the green
    var wide = { cx: VW / 2, cy: G.vy + VH / 2, s: s0 };
    // close-up: the green, its bunkers and every shot played from around it
    var x0 = G.cx - G.GR - 30, x1 = G.cx + G.GR + 30, y0 = G.gY - G.GR - 30, y1 = G.gY + G.GR + 34, add = function (p) { x0 = Math.min(x0, p[0] - 12); x1 = Math.max(x1, p[0] + 12); y0 = Math.min(y0, p[1] - 14); y1 = Math.max(y1, p[1] + 12); };
    G.shots.forEach(function (s) { if (near(s.a)) { add(s.a); add(s.b); } else if (near(s.b)) add(s.b); });
    var sc = clamp(Math.min(w / (x1 - x0), (h - 46) / (y1 - y0)), s0, s0 * 7), close = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - 20 / sc, s: sc };
    var T = [], keys = [{ t: 0, cam: wide }], t = 0.5, camNow = wide, at = function (tt, cam) { keys.push({ t: tt, cam: camNow }); keys.push({ t: tt + 0.0001, cam: camNow }); camNow = cam; }, move = function (t0, t1, cam) { keys.push({ t: t0, cam: camNow }); keys.push({ t: t1, cam: cam }); camNow = cam; };
    G.shots.forEach(function (s) {
      var len = hyp(s.a, s.b), kind = near(s.a) ? 'near' : near(s.b) ? 'app' : 'far', sg = s.cat === 'short' || s.cat === 'bunker';
      if (kind === 'near' && camNow !== close) { move(t, t + 0.9, close); t += 1.0; }
      if (kind !== 'near' && camNow !== wide) { move(t, t + 0.8, wide); t += 0.9; }
      var dur = sg ? 0.95 : clamp(0.75 + len / 260, 0.85, 2.0), apex = sg ? clamp(len * (s.cat === 'bunker' ? 0.4 : 0.28), 4, 16) : clamp(len * 0.17, 6, 60);
      var lie = s.lie, hops = s.ob || s.retee ? [] : lie === 'holed' || lie === 'green' || lie === 'fairway' || lie === 'fringe' || lie === 'tee' ? [[0.22, 9], [0.15, 3.2]] : lie === 'rough' ? [[0.16, 3.5]] : [];
      var land = hops.length ? (hops.length > 1 ? 0.9 : 0.96) : 1, hopT = hops.reduce(function (q, x) { return q + x[0]; }, 0);
      var o = { s: s, t0: t, dur: dur, apex: apex, hops: hops, land: land, end: t + dur + hopT + (lie === 'holed' ? 0.25 : 0) };
      if (kind === 'app') move(t + dur * 0.4, t + dur + hopT + 0.35, close);
      T.push(o); t = o.end + 0.45 + (kind === 'app' ? 0.2 : 0);
    });
    var gr = G.green, P = [], sw = null, gcam = null;
    if (gr && gr.putts.length) {
      // into the true-scale green: zoom on the pin while the hole fades into the putting green
      gcam = { cx: gr.ix, cy: gr.iy + 6, s: Math.min(w / (2 * (gr.IR + 30)), (h - 50) / (2 * (gr.IR + 26))) };
      var zoomS = gr.IR * gcam.s / G.GR, pinCam = { cx: G.pin[0], cy: G.pin[1], s: zoomS };
      if (camNow !== close) { move(t, t + 0.8, close); t += 0.9; }
      move(t, t + 1.0, pinCam); sw = { t0: t + 0.45, t1: t + 1.0 }; t += 1.0;
      var arr = gr.arrive ? { t0: t + 0.05, dur: 0.55 } : null; t += arr ? 0.8 : 0.3;
      gr.putts.forEach(function (p) { var d = clamp(0.6 + (Number(p.ft) || 0) / 28, 0.7, 2.1); P.push({ p: p, t0: t, dur: d, end: t + d + (p.holed ? 0.2 : 0) }); t += d + 0.5; });
      return { wide: wide, close: close, keys: keys, T: T, P: P, sw: sw, gcam: gcam, arr: arr, end: t + 1.1, s0: s0 };
    }
    return { wide: wide, close: close, keys: keys, T: T, P: P, sw: null, gcam: null, arr: null, end: t + 1.1, s0: s0 };
  }
  function camAt(L, t) {
    var k = L.keys; if (t <= k[0].t) return k[0].cam;
    for (var i = 1; i < k.length; i++) if (t < k[i].t) { var a = k[i - 1], b = k[i]; return a.cam === b.cam ? a.cam : lerpCam(a.cam, b.cam, (t - a.t) / Math.max(1e-4, b.t - a.t)); }
    return k[k.length - 1].cam;
  }

  // ---------- drawing ----------
  function hole(ctx, w, h, cam, G) {
    var X = function (x) { return w / 2 + (x - cam.cx) * cam.s; }, Y = function (y) { return h / 2 + (y - cam.cy) * cam.s; }, s = cam.s, cx = G.cx, gY = G.gY, GR = G.GR, teeY = G.teeY;
    ctx.fillStyle = COL.rough; ctx.fillRect(0, 0, w, h);
    // out of bounds down both sides, white stakes
    ctx.fillStyle = COL.ob; ctx.fillRect(X(0), 0, 22 * s, h); ctx.fillRect(X(G.W - 22), 0, 22 * s, h);
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 6]); [22, G.W - 22].forEach(function (x) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke(); }); ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '800 ' + Math.round(clamp(9 * s, 9, 13)) + 'px ' + FONT; ctx.textAlign = 'center';
    [[11, -90], [G.W - 11, 90]].forEach(function (q) { var yy = clamp(Y(gY - 10), 40, h - 40); ctx.save(); ctx.translate(X(q[0]), yy); ctx.rotate(q[1] * Math.PI / 180); ctx.fillText('OB', 0, 3); ctx.restore(); }); ctx.restore();
    // fairway (the replay's own shape) with mown stripes every 10 yd
    ctx.save(); ctx.beginPath(); ctx.moveTo(X(cx - 26), Y(teeY - 30));
    ctx.bezierCurveTo(X(cx - 40), Y((teeY + gY) / 2), X(cx - 44), Y(gY + 80), X(cx - 24), Y(gY + GR + 6)); ctx.lineTo(X(cx + 24), Y(gY + GR + 6));
    ctx.bezierCurveTo(X(cx + 44), Y(gY + 80), X(cx + 40), Y((teeY + gY) / 2), X(cx + 26), Y(teeY - 30)); ctx.closePath(); ctx.clip();
    for (var y = gY, i = 0; y < teeY; y += 10 * G.K, i++) { ctx.fillStyle = i % 2 ? COL.fw : COL.fw2; ctx.fillRect(X(cx - 50), Y(y), 100 * s, 10 * G.K * s + 1); }
    ctx.restore();
    // distance arcs from the pin every 50 yd
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '600 10px ' + FONT; ctx.textAlign = 'center';
    for (var r = 50; r <= G.yd + 10; r += 50) { var rp = r * G.K * s; if (rp > 4 * w) continue; ctx.beginPath(); ctx.arc(X(G.pin[0]), Y(G.pin[1]), rp, Math.PI * 0.62, Math.PI * 0.38, true); ctx.stroke(); var ly = Y(G.pin[1] + r * G.K); if (ly > 10 && ly < h - 4) ctx.fillText(r, X(cx - 52), ly + 3); }
    ctx.restore();
    G.bunk.forEach(function (b) { ctx.fillStyle = COL.sand; ctx.strokeStyle = COL.sandEdge; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(X(b[0]), Y(b[1]), b[2] * s, b[3] * s, 0, 0, 7); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = COL.collar; ctx.beginPath(); ctx.arc(X(cx), Y(gY), (GR + 3) * s, 0, 7); ctx.fill();
    ctx.fillStyle = COL.green; ctx.strokeStyle = COL.edge; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X(cx), Y(gY), GR * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.tee; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; rr(ctx, X(cx - 16), Y(teeY - 6), 32 * s, 14 * s, 4 * s); ctx.fill(); ctx.stroke();
    var ty = Y(teeY + 22); if (ty < h - 2) { ctx.fillStyle = '#fff'; ctx.font = '800 10px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('TEE · ' + G.yd + ' yd', X(cx), ty); }
    return { X: X, Y: Y };
  }
  function flag(ctx, x, y, fh) {
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, Math.max(2, fh * 0.1), 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - fh); ctx.stroke();
    ctx.fillStyle = COL.red; ctx.beginPath(); ctx.moveTo(x, y - fh); ctx.lineTo(x + fh * 0.55, y - fh * 0.78); ctx.lineTo(x, y - fh * 0.56); ctx.closePath(); ctx.fill();
  }
  function num(ctx, x, y, n, fill, ink, r) {
    ctx.fillStyle = fill; ctx.strokeStyle = ink === '#fff' ? '#fff' : '#222'; ctx.lineWidth = ink === '#fff' ? 2 : 1.4; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = '900 ' + Math.round(r * 1.25) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, x, y + 0.5); ctx.textBaseline = 'alphabetic';
  }
  function ball(ctx, x, y, r, lift) {
    if (lift > 0.4) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y - lift, r, 0, 7); ctx.fill(); ctx.stroke();
  }
  function cross(ctx, x, y, a) { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = COL.red; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke(); ctx.restore(); }
  function badge(ctx, w, t1, t2, col) {
    ctx.save(); ctx.font = '700 13px ' + FONT; var a = ctx.measureText(t1).width; ctx.font = '500 11px ' + FONT; var b = t2 ? ctx.measureText(t2).width : 0, bw = Math.min(w - 20, Math.max(a, b) + 30), bh = t2 ? 40 : 26;
    ctx.fillStyle = 'rgba(20,28,24,.74)'; rr(ctx, 10, 10, bw, bh, 9); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(21, 23, 4.5, 0, 7); ctx.fill(); if (col === '#fff' || col === '#ffffff') { ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = '700 13px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(t1, 31, 28);
    if (t2) { ctx.font = '500 11px ' + FONT; ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.fillText(t2, 20, 43); }
    ctx.restore();
  }
  // the hole at time t: finished shots as lines on the ground, the one in the air with its tracer
  function holeFrame(ctx, w, h, G, L, t) {
    var cam = camAt(L, t), P = hole(ctx, w, h, cam, G), X = P.X, Y = P.Y, sx = function (p) { return [X(p[0]), Y(p[1])]; }, zoom = cam.s / L.s0, bs = clamp(3.1 + (zoom - 1) * 0.45, 3.1, 5.6), cur = null, ballsAt = [];
    var nums = [], pinX = X(G.pin[0]), pinY = Y(G.pin[1]);
    L.T.forEach(function (o) {
      var s = o.s, u = t - o.t0; if (u < 0) return; nums.push(o); cur = o;
      var a = sx(s.a), c = sx(s.c), b = sx(s.b), k = Math.min(1, u / o.dur) * o.land, flown = u >= o.dur, col = s.col === '#fff' ? '#ffffff' : s.col, dash = s.ob || s.retee;
      // the ground line so far (stays once the shot is done)
      ctx.save(); ctx.strokeStyle = rgba(col, flown ? 0.85 : 0.5); ctx.lineWidth = 2.6; if (dash) ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      var kk = flown ? 1 : k; for (var q = 1; q <= 24; q++) { var p = bez(a, c, b, kk * q / 24); ctx.lineTo(p[0], p[1]); } ctx.stroke(); ctx.restore();
      // the tracer in the air, fading after it lands
      var fade = flown ? Math.max(0, 1 - (u - o.dur) / 0.6) : 1;
      if (fade > 0) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * fade).toFixed(3) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        var kf = Math.min(1, u / o.dur); for (q = 1; q <= 24; q++) { var kq = kf * q / 24, pq = bez(a, c, b, kq * o.land); ctx.lineTo(pq[0], pq[1] - Math.sin(Math.PI * kq) * o.apex * cam.s); } ctx.stroke(); ctx.restore(); }
      // the ball: in the air, hopping, then at rest
      var pos, lift = 0, r = bs;
      if (!flown) { var kf2 = u / o.dur; pos = bez(a, c, b, kf2 * o.land); lift = Math.sin(Math.PI * kf2) * o.apex * cam.s; r = bs * (1 + 0.45 * Math.sin(Math.PI * kf2)); }
      else {
        var v = u - o.dur, done = o.land, hopsLeft = true;
        for (var j = 0; j < o.hops.length; j++) { var hd = o.hops[j][0], share = (1 - o.land) / o.hops.length; if (v < hd) { var z = v / hd; lift = 4 * z * (1 - z) * o.hops[j][1]; done += share * z; hopsLeft = false; break; } v -= hd; done += share; }
        if (hopsLeft) done = 1; pos = bez(a, c, b, Math.min(1, done));
      }
      var gone = s.ob && flown ? Math.max(0, 1 - (u - o.dur) / 0.4) : 1, holedIn = s.lie === 'holed' && u > o.end - 0.25;
      if (holedIn) { var sh = clamp((o.end - u) / 0.25, 0, 1); if (sh > 0) ball(ctx, pinX + (pos[0] - pinX) * sh, pinY + (pos[1] - pinY) * sh, bs * (0.4 + 0.6 * sh), 0); }
      else if (gone > 0) { ctx.save(); ctx.globalAlpha = gone; ball(ctx, pos[0], pos[1], r, lift); ctx.restore(); }
      if (s.pen && flown) cross(ctx, b[0] + 8, b[1] - 9, Math.min(1, (u - o.dur) / 0.25));
      if (flown && !s.ob && s.lie !== 'holed') ballsAt.push(pos);
    });
    flag(ctx, pinX, pinY, clamp(2.4 * cam.s * 7, 14, 30));
    nums.forEach(function (o) { var a = sx(o.s.a); num(ctx, a[0], a[1], o.s.n, o.s.col, o.s.col === '#fff' ? '#111' : '#fff', clamp(6 + zoom * 0.7, 7, 10)); });
    if (cur && (!L.sw || t < L.sw.t0)) badge(ctx, w, 'Shot ' + cur.s.n + ' · ' + cur.s.name, cur.s.t, cur.s.col);
  }
  // the true-scale green with the putts rolling
  function greenFrame(ctx, w, h, G, L, t) {
    var gr = G.green, cam = L.gcam, X = function (x) { return w / 2 + (x - cam.cx) * cam.s; }, Y = function (y) { return h / 2 + (y - cam.cy) * cam.s; }, s = cam.s;
    ctx.fillStyle = COL.rough; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COL.collar; ctx.beginPath(); ctx.arc(X(gr.ix), Y(gr.iy), (gr.IR + 7) * s, 0, 7); ctx.fill();
    ctx.fillStyle = COL.green; ctx.strokeStyle = COL.edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(gr.ix), Y(gr.iy), gr.IR * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 10px ' + FONT; ctx.textAlign = 'left';
    gr.rings.forEach(function (f) { var rp = f * gr.PK * s; ctx.beginPath(); ctx.arc(X(gr.ix), Y(gr.iy), rp, 0, 7); ctx.stroke(); ctx.fillText(f + ' ft', X(gr.ix) + 3, Y(gr.iy) - rp - 2); }); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '800 10px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('▼ front of green', X(gr.ix), Math.min(h - 6, Y(gr.iy + gr.IR + 22)));
    var cupX = X(gr.ix), cupY = Y(gr.iy), bs = clamp(0.034 * gr.IR * s, 4, 7), cur = null;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cupX, cupY, bs * 0.95, 0, 7); ctx.fill();
    // the shot that came onto the green
    var ar = gr.arrive, s0 = [X(gr.putts[0].a[0]), Y(gr.putts[0].a[1])];
    if (ar && L.arr) { var ap = clamp((t - L.arr.t0) / L.arr.dur, 0, 1), fa = [X(ar.a[0]), Y(ar.a[1])], c = [(fa[0] + s0[0]) / 2 + (fa[1] - s0[1]) * 0.15, (fa[1] + s0[1]) / 2 + (s0[0] - fa[0]) * 0.15];
      ctx.save(); ctx.strokeStyle = ar.col; ctx.lineWidth = 3; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(fa[0], fa[1]); for (var q = 1; q <= 24; q++) { var p = bez(fa, c, s0, ap * q / 24); ctx.lineTo(p[0], p[1]); } ctx.stroke(); ctx.restore();
      num(ctx, clamp(fa[0], 12, w - 12), clamp(fa[1], 12, h - 12), ar.n, ar.col, '#fff', 9);
      if (t < (L.P[0] ? L.P[0].t0 : 1e9)) cur = { t1: 'Shot ' + ar.n + ' · ' + ar.big, t2: ar.small, col: ar.col }; }
    var rest = s0, done = [];
    L.P.forEach(function (o) {
      var p = o.p, u = t - o.t0, a = [X(p.a[0]), Y(p.a[1])], b = [X(p.b[0]), Y(p.b[1])]; if (u < 0) return;
      var k = easeOut(u / o.dur), pos = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 3; if (p.holed && u >= o.dur) ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(pos[0], pos[1]); ctx.stroke(); ctx.restore();
      done.push({ a: a, n: p.n }); rest = p.holed && u >= o.dur ? null : pos;
      if (p.holed && u >= o.dur) { var sh = clamp(1 - (u - o.dur) / 0.2, 0, 1); if (sh > 0) ball(ctx, cupX + (pos[0] - cupX) * sh, cupY + (pos[1] - cupY) * sh, bs * (0.4 + 0.6 * sh), 0); }
      if (!p.holed && u >= o.dur) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(b[0], b[1], bs * 0.75, 0, 7); ctx.fill(); ctx.stroke(); }
      cur = { t1: 'Putt ' + p.n + ' · ' + p.ft + ' ft', t2: p.holed ? (u >= o.dur ? '→ holed!' : '') : u >= o.dur ? '→ ' + p.left + ' ft left' : '', col: '#fff' };
    });
    if (rest) ball(ctx, rest[0], rest[1], bs, 0);
    flag(ctx, cupX, cupY, clamp(0.17 * gr.IR * s, 18, 34));
    done.forEach(function (d) { num(ctx, d.a[0], d.a[1], d.n, '#fff', '#111', 9.5); });
    if (cur) badge(ctx, w, cur.t1, cur.t2, cur.col);
  }
  function frame(R, t) {
    var ctx = R.ctx, w = R.w, h = R.h, L = R.L, G = R.G;
    if (!L.sw || t < L.sw.t0) holeFrame(ctx, w, h, G, L, t);
    else if (t < L.sw.t1) { holeFrame(ctx, w, h, G, L, t); ctx.save(); ctx.globalAlpha = ease((t - L.sw.t0) / (L.sw.t1 - L.sw.t0)); greenFrame(ctx, w, h, G, L, t); ctx.restore(); }
    else greenFrame(ctx, w, h, G, L, t);
  }

  // ---------- play / stop ----------
  function btnText(b, txt) { if (b) b.textContent = txt; }
  function stop(fadeBack) {
    var R = run; if (!R) return; run = null; cancelAnimationFrame(R.raf);
    var done = function () { if (R.cv.parentNode) R.cv.parentNode.removeChild(R.cv); if (R.svg) R.svg.style.visibility = ''; };
    if (fadeBack && R.cv.isConnected) { R.cv.style.transition = 'opacity .45s'; R.cv.style.opacity = '0'; if (R.svg) R.svg.style.visibility = ''; setTimeout(done, 480); } else done();
    btnText(R.btn, '↺ Play again'); if (R.btn) R.btn.setAttribute('aria-pressed', 'false');
  }
  function play(btn) {
    var G; try { G = JSON.parse(btn.getAttribute('data-geo')); } catch (e) { return; }
    var svg = document.getElementById('replaymap'), stage = document.getElementById('rpstage'); if (!svg || !stage || !G || !G.shots) return;
    stop(false);
    var sr = svg.getBoundingClientRect(), st = stage.getBoundingClientRect(), w = Math.round(sr.width), h = Math.round(sr.height); if (w < 40 || h < 40) return;
    var dpr = window.devicePixelRatio || 1, cv = document.createElement('canvas'); cv.id = 'rpcanvas'; cv.width = w * dpr; cv.height = h * dpr;
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Hole replay playing');
    cv.style.cssText = 'position:absolute;left:' + (sr.left - st.left) + 'px;top:' + (sr.top - st.top) + 'px;width:' + w + 'px;height:' + h + 'px;border-radius:' + (getComputedStyle(svg).borderRadius || '0') + ';z-index:2;touch-action:pan-y';
    stage.appendChild(cv); var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var L = plan(G, w, h), R = run = { cv: cv, ctx: ctx, w: w, h: h, G: G, L: L, btn: btn, svg: svg, t0: performance.now(), raf: 0 };
    frame(R, 0); svg.style.visibility = 'hidden';
    btnText(btn, '■ Stop'); btn.setAttribute('aria-pressed', 'true');
    var step = function (now) {
      if (run !== R) return; if (!cv.isConnected) { run = null; return; }
      var t = (now - R.t0) / 1000; frame(R, Math.min(t, L.end));
      if (t >= L.end + 0.4) { stop(true); return; }
      R.raf = requestAnimationFrame(step);
    };
    R.raf = requestAnimationFrame(step);
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#rpplay'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); if (run && run.btn === b && run.cv.isConnected) stop(false); else play(b);
  }, true);
  root.RPANIM = { play: play, stop: stop, plan: plan, playing: function () { return !!run; } };
})(this);
