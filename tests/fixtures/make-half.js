// Draws a close-up photo of one half of the synthetic scorecard (front 9 = holes 1-9 + OUT, back 9 = holes 10-18 + IN + TOT).
// opt.labels=false leaves out the tee names (a back-9 close-up of a one-row card usually cuts them off; a sliver of the OUT column shows instead).
// photo=true adds tilt, blur, tint, noise and JPEG loss like a phone photo.
module.exports = function makeHalf(opt) {
  const photo = !!opt.photo, C = opt.card, back = opt.half === 'b', labels = opt.labels !== false, off = back ? 9 : 0;
  const s = a => a.reduce((t, v) => t + v, 0);
  const cols = (labels ? ['HOLE'] : back ? ['OUT'] : ['']).concat(Array.from({ length: 9 }, (_, i) => String(i + 1 + off)), back ? ['IN', 'TOT'] : ['OUT']);
  const lw = labels ? 300 : 70, cw = 128, W = 40 + lw + cw * (cols.length - 1) + 40, rh = 96, top = labels && !back ? 120 : 40, H = top + rh * (C.rows.length + 1) + 50;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#fbfaf4'; x.fillRect(0, 0, W, H);
  if (labels && !back) { x.fillStyle = '#1d4d2b'; x.font = 'bold 60px Georgia, serif'; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.fillText(C.name, 40, 85); }
  const draw = (cells, y, bg, fg, bold) => { x.fillStyle = bg; x.fillRect(40, y, W - 80, rh);
    x.fillStyle = fg; x.font = (bold ? 'bold ' : '') + '50px Arial, Helvetica, sans-serif'; x.textBaseline = 'middle';
    cells.forEach((t, i) => { if (i === 0) { x.textAlign = labels ? 'left' : 'center'; x.fillText(t, labels ? 54 : 40 + lw / 2, y + rh / 2); } else { x.textAlign = 'center'; x.fillText(t, 40 + lw + (i - 0.5) * cw, y + rh / 2); } });
    x.strokeStyle = '#7d8b80'; x.lineWidth = 2; x.strokeRect(40, y, W - 80, rh); for (let i = 1; i < cols.length; i++) { const xx = 40 + lw + (i - 1) * cw; x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + rh); x.stroke(); } };
  draw(cols, top, '#1d4d2b', '#ffffff', true);
  C.rows.forEach((r, k) => { const v = r.vals.slice(off, off + 9);
    const first = labels ? r.label : back ? (r.noTot ? '' : String(s(r.vals.slice(0, 9)))).slice(-2) : '';
    const cells = [first].concat(v.map(String), back ? [r.noTot ? '' : String(s(v)), r.noTot ? '' : String(s(r.vals))] : [r.noTot ? '' : String(s(v))]);
    draw(cells, top + rh * (k + 1), r.bg, r.fg, r.bold); });
  if (!photo) return c.toDataURL('image/png');
  const p = document.createElement('canvas'); p.width = opt.w || 1600; p.height = Math.round(p.width * H / W) + 140; const q = p.getContext('2d');
  q.fillStyle = '#6d6a60'; q.fillRect(0, 0, p.width, p.height);
  q.translate(p.width / 2, p.height / 2); q.rotate((opt.rot != null ? opt.rot : back ? 1.4 : -1.8) * Math.PI / 180); q.filter = 'blur(' + (opt.blur || 1.2) + 'px)'; q.drawImage(c, -p.width / 2 + 30, -p.height / 2 + 70, p.width - 60, p.height - 140);
  q.setTransform(1, 0, 0, 1, 0, 0); q.filter = 'none';
  const g = q.createLinearGradient(0, 0, p.width, p.height); g.addColorStop(0, 'rgba(255,220,160,.18)'); g.addColorStop(1, 'rgba(0,0,40,.24)'); q.fillStyle = g; q.fillRect(0, 0, p.width, p.height);
  const d = q.getImageData(0, 0, p.width, p.height); let seed = opt.seed || (back ? 11 : 7); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * 36; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  q.putImageData(d, 0, 0); return p.toDataURL('image/jpeg', 0.62);
};
