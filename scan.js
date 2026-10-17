// Scorecard photo reading on the phone: prepare the image, run Tesseract (bundled in vendor/tesseract, no network, no account), parse with COURSES.parseCard.
(function () {
  var BASE = 'vendor/tesseract/', worker = null, loading = null;
  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = BASE + 'tesseract.min.js'; s.onload = res; s.onerror = function () { rej(new Error('Could not load the scanner')); }; document.head.appendChild(s); });
  }
  var progressCb = null;
  function getWorker() {
    if (worker) return Promise.resolve(worker);
    if (loading) return loading;
    loading = loadLib().then(function () {
      return window.Tesseract.createWorker('eng', 1, { workerPath: BASE + 'worker.min.js', corePath: BASE, langPath: BASE, workerBlobURL: false, gzip: true,
        logger: function (m) { if (progressCb && m && m.status) progressCb(m.status, m.progress || 0); } });
    }).then(function (w) { worker = w; return w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' }).then(function () { return w; }); })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var url = typeof src === 'string' ? src : URL.createObjectURL(src), img = new Image();
      img.onload = function () { res(img); }; img.onerror = function () { rej(new Error('Could not open that photo')); }; img.src = url;
    });
  }
  // Make every kind of print dark-on-white: ink = how far a pixel is from its local background (works for white print on coloured tee rows too).
  // Then erase the table's grid lines (very long straight runs of ink), which otherwise get read as 1s and |s.
  function prepare(img) {
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, long = Math.max(W, H), sc = Math.min(2.5, 2600 / long);
    var w = Math.round(W * sc), h = Math.round(H * sc), c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h), p = d.data, n = w * h, g = new Float32Array(n), I = new Float64Array((w + 1) * (h + 1)), i, j, xx, yy;
    for (i = 0, j = 0; i < p.length; i += 4, j++) g[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    for (yy = 0; yy < h; yy++) { var rs = 0; for (xx = 0; xx < w; xx++) { rs += g[yy * w + xx]; I[(yy + 1) * (w + 1) + xx + 1] = I[yy * (w + 1) + xx + 1] + rs; } }
    var ink = new Float32Array(n);
    // background colour = median of a neighbourhood on a 1/8-size copy (the paper or the row colour is the majority there)
    var f = Math.max(4, Math.round(Math.min(w, h) / 120)), sw = Math.ceil(w / f), sh = Math.ceil(h / f), small = new Float32Array(sw * sh), cnt = new Float32Array(sw * sh);
    for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) { var si = ((yy / f) | 0) * sw + ((xx / f) | 0); small[si] += g[yy * w + xx]; cnt[si]++; }
    for (i = 0; i < small.length; i++) small[i] /= cnt[i];
    var bg = new Float32Array(sw * sh), rx = 5, ry = 3, buf = [];
    for (var sy = 0; sy < sh; sy++) for (var sx = 0; sx < sw; sx++) {
      buf.length = 0;
      for (var dy = -ry; dy <= ry; dy++) { var yq = sy + dy; if (yq < 0 || yq >= sh) continue; for (var dx = -rx; dx <= rx; dx++) { var xq = sx + dx; if (xq >= 0 && xq < sw) buf.push(small[yq * sw + xq]); } }
      buf.sort(function (a, b) { return a - b; }); bg[sy * sw + sx] = buf[buf.length >> 1];
    }
    for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) ink[yy * w + xx] = Math.abs(g[yy * w + xx] - bg[((yy / f) | 0) * sw + ((xx / f) | 0)]);
    // global ink threshold (Otsu on the ink map)
    var hist = new Array(256).fill(0); for (j = 0; j < n; j++) hist[Math.min(255, ink[j] | 0)]++;
    var tot = 0, sumAll = 0; for (i = 0; i < 256; i++) { tot += hist[i]; sumAll += i * hist[i]; }
    var wB = 0, sB = 0, best = 0, th = 30; for (i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; var wF = tot - wB; if (!wF) break; sB += i * hist[i]; var mB = sB / wB, mF = (sumAll - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF); if (bt > best) { best = bt; th = i; } }
    th = Math.max(18, th);
    var bin = new Uint8Array(n); for (j = 0; j < n; j++) bin[j] = ink[j] > th ? 1 : 0;
    cleanComponents(bin, w, h);
    for (i = 0, j = 0; i < p.length; i += 4, j++) { var q = bin[j] ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = q; p[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c;
  }
  // Connected pieces of ink: drop the table grid (big, sparse or very thin-and-long pieces) and specks, keep the characters.
  function cleanComponents(bin, w, h) {
    var n = w * h, lab = new Int32Array(n), par = [0], i, x, y;
    var find = function (a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var j = y * w + x; if (!bin[j]) continue;
      var L = x ? lab[j - 1] : 0, U = y ? lab[j - w] : 0, UL = x && y ? lab[j - w - 1] : 0, UR = y && x < w - 1 ? lab[j - w + 1] : 0;
      var m = L || U || UL || UR;
      if (!m) { m = par.length; par.push(m); }
      else [L, U, UL, UR].forEach(function (q) { if (q) { var ra = find(q), rb = find(m); if (ra !== rb) par[ra] = rb; } });
      lab[j] = m;
    }
    var box = {};
    for (j = 0; j < n; j++) { if (!lab[j]) continue; var r = find(lab[j]); lab[j] = r; var B = box[r]; x = j % w; y = (j / w) | 0;
      if (!B) box[r] = B = { x0: x, x1: x, y0: y, y1: y, a: 0 }; if (x < B.x0) B.x0 = x; if (x > B.x1) B.x1 = x; if (y < B.y0) B.y0 = y; if (y > B.y1) B.y1 = y; B.a++; }
    var hs = []; Object.keys(box).forEach(function (k) { var B = box[k], bh = B.y1 - B.y0 + 1, bw = B.x1 - B.x0 + 1; if (B.a > 20 && bh < h / 6 && bw < bh * 3) hs.push(bh); });
    hs.sort(function (a, b) { return a - b; }); var mh = hs.length ? hs[Math.floor(hs.length / 2)] : 20;
    var kill = {};
    Object.keys(box).forEach(function (k) { var B = box[k], bh = B.y1 - B.y0 + 1, bw = B.x1 - B.x0 + 1, dens = B.a / (bh * bw);
      if (B.a < mh * mh * 0.03) kill[k] = 1; // speck
      else if ((bh > mh * 2.2 || bw > mh * 6) && (dens < 0.3 || bw < mh * 0.4 || bh < mh * 0.4)) kill[k] = 1; // grid line / frame
    });
    for (j = 0; j < n; j++) if (lab[j] && kill[lab[j]]) bin[j] = 0;
  }
  function read(src, onProgress) {
    var t0 = Date.now(); progressCb = onProgress || null;
    return Promise.all([loadImage(src), getWorker()]).then(function (a) {
      if (onProgress) onProgress('reading the card', 0);
      var canvas = prepare(a[0]);
      return a[1].recognize(canvas, {}, { text: true, blocks: true }).then(function (r) {
        var text = r.data.text || '', lines = [];
        (r.data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (pg) { (pg.lines || []).forEach(function (l) {
          lines.push({ words: (l.words || []).map(function (w) { return { text: w.text, x0: w.bbox.x0, x1: w.bbox.x1 }; }) }); }); }); });
        var card = window.COURSES.readCard(text, lines);
        return { text: text, lines: lines, card: card, ms: Date.now() - t0, conf: r.data.confidence };
      });
    });
  }
  // Fetch the scanner files once while online so scanning works offline later (the service worker keeps them).
  function warm() { return getWorker().catch(function () {}); }
  window.SCAN = { read: read, prepare: prepare, warm: warm, ready: function () { return !!worker; } };
})();
