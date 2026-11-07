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
    return 'Pin-High-' + day + (c ? '-' + c : '') + '.png';
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
    ctx.font = font(30, 700); ctx.fillStyle = GOLD; spaced(ctx, 'PIN HIGH', W / 2, 250, 10, 'center');
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

    ctx.textAlign = 'center'; ctx.font = font(24, 400); ctx.fillStyle = 'rgba(255,255,255,0.5)'; spaced(ctx, 'TRACKED WITH PIN HIGH', W / 2, 1760, 4, 'center');
    ctx.restore();
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

  var API = { W: W, H: H, data: data, draw: draw, makeImage: makeImage, fileName: fileName, fmtSG: fmtSG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.STORY = API;
})(this);
