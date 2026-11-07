// v131 Round story: a one-page 1080 x 1920 picture of a round for an Instagram or TikTok story.
// Score, strokes gained off the tee / around the green / putting, fairways, greens in regulation and a putting
// highlight (average 2nd putt distance, v132), drawn on a canvas over the home photo. Nothing leaves the phone until the
// golfer shares the picture. data() is plain numbers (tested in node); draw() and makeImage() need a browser.
(function (root) {
  var W = 1080, H = 1920;
  var FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
  var GOLD = '#f4d28a', POS = '#7ee2a0', NEG = '#ff8a7a', MUTED = 'rgba(255,255,255,0.68)';

  function fmtSG(v) { var s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); }
  function toPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }
  function pct(a, b) { return b ? Math.round(100 * a / b) : null; }

  // Everything the picture shows, from a round and its SG.summarize() result.
  function data(round, S, opts) {
    opts = opts || {};
    var putts = S.puttList || [], made = putts.filter(function (p) { return p.made; });
    var firsts = putts.filter(function (p) { return p.n === 1; });
    // v132 the putt left after the first putt: every 2nd putt of the round (1-putt holes have none)
    var seconds = putts.filter(function (p) { return p.n === 2; });
    var d = new Date(round.date);
    return {
      course: String(round.course || 'Round').trim() || 'Round',
      tee: String(round.tee || '').trim(),
      player: String(opts.player || round.player || '').trim(),
      dateText: isNaN(d) ? '' : d.toLocaleDateString(opts.locale || undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      holes: S.holesDone, strokes: S.strokes, toPar: S.toPar,
      baseline: opts.baselineName || '',
      sg: { ott: S.cats.tee.sg, app: S.cats.approach.sg, arg: S.cats.short.sg, putt: S.cats.putting.sg, total: S.sgTotal,
        nOtt: S.cats.tee.n, nApp: S.cats.approach.n, nArg: S.cats.short.n, nPutt: S.cats.putting.n },
      fw: { hit: S.fwHit, total: S.fwTotal, pct: pct(S.fwHit, S.fwTotal) },
      gir: { hit: S.gir, total: S.girHoles, pct: pct(S.gir, S.girHoles) },
      putting: {
        putts: S.putts,
        avg2nd: seconds.length ? Math.round(10 * seconds.reduce(function (t, p) { return t + (Number(p.ft) || 0); }, 0) / seconds.length) / 10 : null,
        n2nd: seconds.length,
        longest: made.length ? Math.round(Math.max.apply(null, made.map(function (p) { return Number(p.ft) || 0; }))) : null,
        onePutts: firsts.filter(function (p) { return p.holePutts === 1; }).length,
        threePutts: firsts.filter(function (p) { return p.holePutts >= 3; }).length
      }
    };
  }

  function fileName(round) {
    var d = new Date(round.date), day = isNaN(d) ? 'round' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var c = String(round.course || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return 'Strokewise-' + day + (c ? '-' + c : '') + '.png';
  }

  // ---------- drawing ----------
  function font(px, weight) { return (weight || 400) + ' ' + px + 'px ' + FONT; }
  function fitText(ctx, text, maxW, px, weight, minPx) {
    var size = px; ctx.font = font(size, weight);
    while (size > (minPx || 20) && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = font(size, weight); }
    if (ctx.measureText(text).width > maxW) { // still too long: cut with an ellipsis
      while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      text += '…';
    }
    return text;
  }
  function spaced(ctx, text, x, y, spacing, align) {
    var chars = String(text).split(''), w = chars.reduce(function (t, c) { return t + ctx.measureText(c).width; }, 0) + spacing * (chars.length - 1);
    var cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, keep = ctx.textAlign; ctx.textAlign = 'left';
    chars.forEach(function (c) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; });
    ctx.textAlign = keep;
  }
  // v135: the app icon (flag on a green) drawn small, left of the spaced wordmark; the pair is centred on x
  function brand(ctx, text, x, y) {
    var S = 46, gap = 18, sp = 10, chars = String(text).split(''), tw = chars.reduce(function (t, c) { return t + ctx.measureText(c).width; }, 0) + sp * (chars.length - 1);
    var ix = x - (S + gap + tw) / 2, iy = y - S + 8;
    ctx.save(); roundRect(ctx, ix, iy, S, S, 11); ctx.fillStyle = '#0b5d1e'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + S * 0.5, iy + S * 0.72, S * 0.33, S * 0.13, 0, 0, Math.PI * 2); ctx.fillStyle = '#34a344'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + S * 0.5, iy + S * 0.72, S * 0.05, S * 0.025, 0, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(ix + S * 0.48, iy + S * 0.14, S * 0.04, S * 0.58);
    ctx.beginPath(); ctx.moveTo(ix + S * 0.52, iy + S * 0.14); ctx.lineTo(ix + S * 0.8, iy + S * 0.24); ctx.lineTo(ix + S * 0.52, iy + S * 0.34); ctx.closePath(); ctx.fillStyle = '#e52a2a'; ctx.fill();
    ctx.restore(); spaced(ctx, text, ix + S + gap, y, sp, 'left');
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function panel(ctx, x, y, w, h) {
    ctx.save(); roundRect(ctx, x, y, w, h, 36);
    ctx.fillStyle = 'rgba(8, 22, 14, 0.52)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  function label(ctx, text, x, y, align, color) {
    ctx.save(); ctx.font = font(26, 600); ctx.fillStyle = color || MUTED; ctx.textBaseline = 'alphabetic';
    spaced(ctx, text.toUpperCase(), x, y, 4, align || 'left'); ctx.restore();
  }
  function sgColor(v) { return v > 0.004 ? POS : v < -0.004 ? NEG : '#ffffff'; }
  function ring(ctx, cx, cy, r, frac, color) {
    ctx.save(); ctx.lineWidth = 18; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (frac > 0) { ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac)); ctx.stroke(); }
    ctx.restore();
  }

  // Background: the photo, covered and darkened so white type reads on any part of it.
  function background(ctx, bg) {
    ctx.fillStyle = '#0b2414'; ctx.fillRect(0, 0, W, H);
    if (bg && bg.width) {
      var s = Math.max(W / bg.width, H / bg.height), w = bg.width * s, h = bg.height * s;
      ctx.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h);
    }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(6, 18, 11, 0.62)'); g.addColorStop(0.35, 'rgba(6, 22, 12, 0.72)');
    g.addColorStop(0.7, 'rgba(5, 20, 11, 0.84)'); g.addColorStop(1, 'rgba(3, 12, 7, 0.94)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Story-safe: Instagram and TikTok cover about the top and bottom 250 px, so the content sits between.
  function draw(ctx, d, bg) {
    var M = 72, CW = W - 2 * M;
    ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
    background(ctx, bg);

    // Header
    ctx.font = font(30, 700); ctx.fillStyle = GOLD; brand(ctx, 'STROKEWISE', W / 2, 250);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    var course = fitText(ctx, d.course, CW, 64, 600, 40); ctx.fillText(course, W / 2, 340);
    var sub = [d.dateText, d.tee ? d.tee + ' tees' : '', d.player].filter(Boolean).join('  ·  ');
    ctx.font = font(32, 400); ctx.fillStyle = MUTED; ctx.fillText(fitText(ctx, sub, CW, 32, 400, 24), W / 2, 395);

    // Score
    var scoreTxt = String(d.strokes || 0), parTxt = toPar(d.toPar || 0);
    ctx.font = font(220, 300); var sw = ctx.measureText(scoreTxt).width;
    ctx.font = font(84, 500); var pw = ctx.measureText(parTxt).width + 56;
    var gap = 36, sx = W / 2 - (sw + gap + pw) / 2, base = 615;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(220, 300); ctx.fillText(scoreTxt, sx, base);
    var px = sx + sw + gap, py = base - 150;
    ctx.save(); roundRect(ctx, px, py, pw, 110, 55);
    ctx.fillStyle = d.toPar < 0 ? 'rgba(126,226,160,0.22)' : d.toPar > 0 ? 'rgba(255,255,255,0.14)' : 'rgba(244,210,138,0.22)'; ctx.fill(); ctx.restore();
    ctx.font = font(84, 500); ctx.fillStyle = d.toPar < 0 ? POS : d.toPar === 0 ? GOLD : '#fff'; ctx.textAlign = 'center'; ctx.fillText(parTxt, px + pw / 2, py + 85);
    ctx.font = font(28, 400); ctx.fillStyle = MUTED; ctx.textAlign = 'center';
    ctx.fillText(d.holes + (d.holes === 1 ? ' hole' : ' holes'), W / 2, base + 54);

    // Strokes gained
    var y0 = 715, ph = 310; panel(ctx, M, y0, CW, ph);
    label(ctx, 'Strokes gained', M + 44, y0 + 66);
    if (d.baseline) { ctx.save(); ctx.font = font(26, 400); ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText('vs ' + d.baseline, M + CW - 44, y0 + 66); ctx.restore(); }
    // v133 all four categories: off the tee, approach, around the green, putting
    var cols = [['Off the tee', d.sg.ott, d.sg.nOtt], ['Approach', d.sg.app, d.sg.nApp], ['Around green', d.sg.arg, d.sg.nArg], ['Putting', d.sg.putt, d.sg.nPutt]];
    var inX = M + 28, cw = (CW - 56) / 4;
    cols.forEach(function (c, i) {
      var cx = inX + cw * i + cw / 2;
      if (i) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(inX + cw * i, y0 + 110); ctx.lineTo(inX + cw * i, y0 + 250); ctx.stroke(); ctx.restore(); }
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, c[0], cw - 16, 27, 500, 20), cx, y0 + 132);
      ctx.fillStyle = sgColor(c[1]); ctx.fillText(fitText(ctx, fmtSG(c[1]), cw - 14, 70, 400, 44), cx, y0 + 218);
      ctx.font = font(23, 400); ctx.fillStyle = MUTED; ctx.fillText(c[2] + (c[2] === 1 ? ' shot' : ' shots'), cx, y0 + 264);
    });
    ctx.save(); ctx.font = font(30, 400); ctx.fillStyle = MUTED; ctx.textAlign = 'center';
    var tl = ctx.measureText('Total ').width, tv = fmtSG(d.sg.total); ctx.font = font(30, 600); var tvw = ctx.measureText(tv).width;
    ctx.textAlign = 'left'; ctx.font = font(30, 400); ctx.fillText('Total ', W / 2 - (tl + tvw) / 2, y0 + ph + 50);
    ctx.font = font(30, 600); ctx.fillStyle = sgColor(d.sg.total); ctx.fillText(tv, W / 2 - (tl + tvw) / 2 + tl, y0 + ph + 50); ctx.restore();

    // Fairways and greens
    var y1 = 1112, th = 270, tw = (CW - 32) / 2;
    [['Fairways', d.fw], ['Greens in reg', d.gir]].forEach(function (t, i) {
      var x = M + i * (tw + 32), v = t[1]; panel(ctx, x, y1, tw, th);
      label(ctx, t[0], x + 40, y1 + 62);
      var rcx = x + tw - 108, rcy = y1 + 156;
      ring(ctx, rcx, rcy, 66, v.total ? v.hit / v.total : 0, GOLD);
      ctx.textAlign = 'center'; ctx.font = font(40, 500); ctx.fillStyle = '#fff'; ctx.fillText(v.pct == null ? '–' : v.pct + '%', rcx, rcy + 14);
      ctx.textAlign = 'left'; ctx.font = font(96, 300); ctx.fillStyle = '#fff';
      var hit = String(v.hit); ctx.fillText(hit, x + 40, y1 + 192);
      var hw = ctx.measureText(hit).width; ctx.font = font(44, 300); ctx.fillStyle = MUTED; ctx.fillText('/' + v.total, x + 46 + hw, y1 + 192);
      ctx.font = font(26, 400); ctx.fillText(v.total ? 'hit' : 'none played', x + 40, y1 + 234);
    });

    // Putting highlight
    var y2 = 1414, h2 = 280, p = d.putting; panel(ctx, M, y2, CW, h2);
    label(ctx, 'Putting', M + 44, y2 + 62, 'left', MUTED);
    ctx.textAlign = 'left'; ctx.font = font(120, 300); ctx.fillStyle = GOLD;
    var feet = p.avg2nd == null ? '–' : p.avg2nd.toFixed(1); ctx.fillText(feet, M + 44, y2 + 180);
    var fw2 = ctx.measureText(feet).width; ctx.font = font(48, 300); if (p.avg2nd != null) ctx.fillText(' ft', M + 44 + fw2, y2 + 180);
    ctx.font = font(30, 400); ctx.fillStyle = '#fff'; ctx.fillText(p.avg2nd == null ? 'no 2nd putts' : 'avg 2nd putt', M + 44, y2 + 232);
    var rx = M + CW - 44, rows = [['Longest make', p.longest == null ? '–' : p.longest + ' ft'], ['Putts', String(p.putts)], ['1-putts', String(p.onePutts)], ['3-putts', String(p.threePutts)]];
    rows.forEach(function (r, i) {
      var ry = y2 + 102 + i * 50;
      ctx.textAlign = 'right'; ctx.font = font(34, 500); ctx.fillStyle = '#fff'; ctx.fillText(r[1], rx, ry);
      ctx.font = font(28, 400); ctx.fillStyle = MUTED; ctx.fillText(r[0], rx - 140, ry);
    });

    ctx.textAlign = 'center'; ctx.font = font(24, 400); ctx.fillStyle = 'rgba(255,255,255,0.5)'; spaced(ctx, 'TRACKED WITH STROKEWISE', W / 2, 1760, 4, 'center');
    ctx.restore();
  }

  // ---------- v137 PDF cover: the same look on a Letter-shaped page (1080 x 1398 = 8.5 x 11) ----------
  // d.kind 'round' (one round, from data()) or 'stats' (averages of several rounds, from combine()).
  var CW_ = 1080, CH_ = 1398;
  function combine(list, opts) { // per-round averages of several data() results, for the Stats PDF cover
    opts = opts || {}; var n = list.length, av = function (f) { return n ? list.reduce(function (t, d) { return t + (f(d) || 0); }, 0) / n : 0; };
    var sum = function (f) { return list.reduce(function (t, d) { return t + (f(d) || 0); }, 0); };
    var fwH = sum(function (d) { return d.fw.hit; }), fwT = sum(function (d) { return d.fw.total; }), gH = sum(function (d) { return d.gir.hit; }), gT = sum(function (d) { return d.gir.total; });
    var w2 = list.filter(function (d) { return d.putting.avg2nd != null; }), n2 = w2.reduce(function (t, d) { return t + d.putting.n2nd; }, 0);
    return { kind: 'stats', rounds: n, player: opts.player || '', range: opts.range || '', dateText: opts.dateText || '', baseline: opts.baselineName || '',
      strokes: av(function (d) { return d.strokes; }), toPar: av(function (d) { return d.toPar; }),
      sg: { ott: av(function (d) { return d.sg.ott; }), app: av(function (d) { return d.sg.app; }), arg: av(function (d) { return d.sg.arg; }), putt: av(function (d) { return d.sg.putt; }), total: av(function (d) { return d.sg.total; }) },
      fw: { hit: fwH, total: fwT, pct: pct(fwH, fwT) }, gir: { hit: gH, total: gT, pct: pct(gH, gT) },
      putting: { putts: av(function (d) { return d.putting.putts; }), onePutts: av(function (d) { return d.putting.onePutts; }), threePutts: av(function (d) { return d.putting.threePutts; }),
        avg2nd: n2 ? Math.round(10 * w2.reduce(function (t, d) { return t + d.putting.avg2nd * d.putting.n2nd; }, 0) / n2) / 10 : null,
        longest: list.reduce(function (m, d) { return d.putting.longest != null && (m == null || d.putting.longest > m) ? d.putting.longest : m; }, null) } };
  }
  function drawCover(ctx, d, bg) {
    var W0 = W, H0 = H; W = CW_; H = CH_; // background() and brand() use W / H
    try {
      var M = 72, CW = W - 2 * M, st = d.kind === 'stats', one = function (v) { return (Math.round(v * 10) / 10).toFixed(1); };
      ctx.save(); ctx.textBaseline = 'alphabetic'; background(ctx, bg);
      ctx.font = font(30, 700); ctx.fillStyle = GOLD; brand(ctx, 'STROKEWISE', W / 2, 132);
      ctx.textAlign = 'center'; label(ctx, st ? 'Stats report' : 'Round report', W / 2, 196, 'center');
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      var head = st ? (d.player || 'Stats') : d.course; ctx.fillText(fitText(ctx, head, CW, 62, 600, 38), W / 2, 270);
      var sub = st ? [d.range, d.rounds + (d.rounds === 1 ? ' round' : ' rounds'), d.dateText].filter(Boolean).join('  ·  ') : [d.dateText, d.tee ? d.tee + ' tees' : '', d.player].filter(Boolean).join('  ·  ');
      ctx.font = font(30, 400); ctx.fillStyle = MUTED; ctx.fillText(fitText(ctx, sub, CW, 30, 400, 22), W / 2, 320);
      // score (stats: average score per round)
      var scoreTxt = st ? one(d.strokes) : String(d.strokes || 0), tp = st ? Math.round(d.toPar * 10) / 10 : d.toPar || 0, parTxt = st ? (tp === 0 ? 'E' : (tp > 0 ? '+' : '') + one(tp)) : toPar(tp);
      var big = st ? 170 : 190; ctx.font = font(big, 300); var sw = ctx.measureText(scoreTxt).width;
      ctx.font = font(72, 500); var pw = ctx.measureText(parTxt).width + 50, gap = 32, sx = W / 2 - (sw + gap + pw) / 2, base = 510;
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(big, 300); ctx.fillText(scoreTxt, sx, base);
      var px = sx + sw + gap, py = base - 128;
      ctx.save(); roundRect(ctx, px, py, pw, 96, 48); ctx.fillStyle = tp < 0 ? 'rgba(126,226,160,0.22)' : tp > 0 ? 'rgba(255,255,255,0.14)' : 'rgba(244,210,138,0.22)'; ctx.fill(); ctx.restore();
      ctx.font = font(72, 500); ctx.fillStyle = tp < 0 ? POS : tp === 0 ? GOLD : '#fff'; ctx.textAlign = 'center'; ctx.fillText(parTxt, px + pw / 2, py + 73);
      ctx.font = font(27, 400); ctx.fillStyle = MUTED; ctx.fillText(st ? 'average score per round' : d.holes + (d.holes === 1 ? ' hole' : ' holes'), W / 2, base + 50);
      // strokes gained
      var y0 = 600, ph = 268; panel(ctx, M, y0, CW, ph);
      label(ctx, st ? 'Strokes gained per round' : 'Strokes gained', M + 44, y0 + 60);
      if (d.baseline) { ctx.save(); ctx.font = font(25, 400); ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText('vs ' + d.baseline, M + CW - 44, y0 + 60); ctx.restore(); }
      var cols = [['Off the tee', d.sg.ott, d.sg.nOtt], ['Approach', d.sg.app, d.sg.nApp], ['Around green', d.sg.arg, d.sg.nArg], ['Putting', d.sg.putt, d.sg.nPutt]];
      var inX = M + 28, cw = (CW - 56) / 4;
      cols.forEach(function (c, i) {
        var cx = inX + cw * i + cw / 2;
        if (i) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(inX + cw * i, y0 + 96); ctx.lineTo(inX + cw * i, y0 + 230); ctx.stroke(); ctx.restore(); }
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, c[0], cw - 16, 26, 500, 20), cx, y0 + 118);
        ctx.fillStyle = sgColor(c[1]); ctx.fillText(fitText(ctx, fmtSG(c[1]), cw - 14, 64, 400, 40), cx, y0 + 196);
        if (!st) { ctx.font = font(22, 400); ctx.fillStyle = MUTED; ctx.fillText(c[2] + (c[2] === 1 ? ' shot' : ' shots'), cx, y0 + 238); }
      });
      ctx.save(); ctx.font = font(29, 400); ctx.fillStyle = MUTED;
      var tl = ctx.measureText('Total ').width, tv = fmtSG(d.sg.total); ctx.font = font(29, 600); var tvw = ctx.measureText(tv).width;
      ctx.textAlign = 'left'; ctx.font = font(29, 400); ctx.fillText('Total ', W / 2 - (tl + tvw) / 2, y0 + ph + 44);
      ctx.font = font(29, 600); ctx.fillStyle = sgColor(d.sg.total); ctx.fillText(tv, W / 2 - (tl + tvw) / 2 + tl, y0 + ph + 44); ctx.restore();
      // fairways and greens (stats: all rounds added up)
      var y1 = 950, th = 222, tw = (CW - 32) / 2;
      [['Fairways', d.fw], ['Greens in reg', d.gir]].forEach(function (t, i) {
        var x = M + i * (tw + 32), v = t[1]; panel(ctx, x, y1, tw, th); label(ctx, t[0], x + 40, y1 + 56);
        var rcx = x + tw - 100, rcy = y1 + 124; ring(ctx, rcx, rcy, 58, v.total ? v.hit / v.total : 0, GOLD);
        ctx.textAlign = 'center'; ctx.font = font(36, 500); ctx.fillStyle = '#fff'; ctx.fillText(v.pct == null ? '–' : v.pct + '%', rcx, rcy + 13);
        ctx.textAlign = 'left'; ctx.font = font(st ? 64 : 84, 300); ctx.fillStyle = '#fff'; var hit = String(v.hit); ctx.fillText(hit, x + 40, y1 + 160);
        var hw = ctx.measureText(hit).width; ctx.font = font(38, 300); ctx.fillStyle = MUTED; ctx.fillText('/' + v.total, x + 46 + hw, y1 + 160);
        ctx.font = font(24, 400); ctx.fillText(v.total ? (st ? 'hit, all rounds' : 'hit') : 'none played', x + 40, y1 + 198);
      });
      // putting row
      var y2 = 1202, h2 = 150, p = d.putting; panel(ctx, M, y2, CW, h2); label(ctx, 'Putting', M + 44, y2 + 50);
      var num = function (v) { return v == null ? '–' : st ? one(v) : String(v); };
      var cells = [[p.avg2nd == null ? '–' : p.avg2nd.toFixed(1) + ' ft', 'avg 2nd putt', GOLD], [num(p.putts), st ? 'putts / round' : 'putts'], [num(p.onePutts), st ? '1-putts / round' : '1-putts'],
        [num(p.threePutts), st ? '3-putts / round' : '3-putts'], [p.longest == null ? '–' : p.longest + ' ft', 'longest make']];
      var pcw = (CW - 56) / cells.length;
      cells.forEach(function (c, i) { var cx = M + 28 + pcw * i + pcw / 2; ctx.textAlign = 'center';
        ctx.font = font(46, 400); ctx.fillStyle = c[2] || '#fff'; ctx.fillText(fitText(ctx, c[0], pcw - 12, 46, 400, 30), cx, y2 + 106);
        ctx.font = font(22, 400); ctx.fillStyle = MUTED; ctx.fillText(fitText(ctx, c[1], pcw - 10, 22, 400, 16), cx, y2 + 136); });
      ctx.restore();
    } finally { W = W0; H = H0; }
  }
  // → Promise<{ data: JPEG data URL, w, h }> for jsPDF
  function coverImage(d, bgSrc) {
    return loadImage(bgSrc).then(function (bg) {
      var c = document.createElement('canvas'); c.width = CW_; c.height = CH_; drawCover(c.getContext('2d'), d, bg);
      return { data: c.toDataURL('image/jpeg', 0.8), w: CW_, h: CH_ };
    });
  }

  function loadImage(src) {
    return new Promise(function (ok) { if (!src) return ok(null); var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; });
  }
  // → Promise<Blob> (PNG). The photo is optional: without it the picture is plain dark green.
  function makeImage(d, bgSrc) {
    return loadImage(bgSrc).then(function (bg) {
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      draw(c.getContext('2d'), d, bg);
      return new Promise(function (ok, bad) { c.toBlob(function (b) { b ? ok(b) : bad(new Error('Could not make the picture.')); }, 'image/png'); });
    });
  }

  var API = { W: W, H: H, data: data, draw: draw, makeImage: makeImage, fileName: fileName, fmtSG: fmtSG, combine: combine, drawCover: drawCover, coverImage: coverImage };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.STORY = API;
})(this);
