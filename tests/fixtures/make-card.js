// Draws a synthetic scorecard on a canvas (in the page). photo=true adds tilt, blur, tint, noise and JPEG loss like a phone photo.
module.exports = function makeCard(opt) {
  const photo = !!opt.photo, C = opt.card;
  const W = 2200, H = 120 + 70 * (C.rows.length + 1) + 60;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#fbfaf4'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1d4d2b'; x.font = 'bold 54px Georgia, serif'; x.fillText(C.name, 40, 75);
  const cols = ['HOLE', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'OUT', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'IN', 'TOT'];
  const lw = 290, cw = (W - 40 - lw - 20) / (cols.length - 1), top = 110, rh = 70;
  const draw = (cells, y, bg, fg, bold) => { x.fillStyle = bg; x.fillRect(40, y, W - 80, rh);
    x.fillStyle = fg; x.font = (bold ? 'bold ' : '') + '36px Arial, Helvetica, sans-serif'; x.textBaseline = 'middle';
    cells.forEach((t, i) => { if (i === 0) { x.textAlign = 'left'; x.fillText(t, 54, y + rh / 2); } else { x.textAlign = 'center'; x.fillText(t, 40 + lw + (i - 0.5) * cw, y + rh / 2); } });
    x.strokeStyle = '#7d8b80'; x.lineWidth = 2; x.strokeRect(40, y, W - 80, rh); for (let i = 0; i < cols.length; i++) { const xx = i === 0 ? 40 + lw : 40 + lw + i * cw; x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + rh); x.stroke(); } };
  draw(cols, top, '#1d4d2b', '#ffffff', true);
  C.rows.forEach((r, k) => { const s = a => a.reduce((t, v) => t + v, 0); const v = r.vals;
    const cells = [r.label].concat(v.slice(0, 9).map(String), [String(r.noTot ? '' : s(v.slice(0, 9)))], v.slice(9).map(String), [r.noTot ? '' : String(s(v.slice(9)))], [r.noTot ? '' : String(s(v))]);
    draw(cells, top + rh * (k + 1), r.bg, r.fg, r.bold); });
  if (!photo) return c.toDataURL('image/png');
  const p = document.createElement('canvas'); p.width = 1700; p.height = Math.round(1700 * H / W) + 120; const q = p.getContext('2d');
  q.fillStyle = '#6d6a60'; q.fillRect(0, 0, p.width, p.height);
  q.translate(p.width / 2, p.height / 2); q.rotate(-1.6 * Math.PI / 180); q.filter = 'blur(1.1px)'; q.drawImage(c, -p.width / 2 + 40, -p.height / 2 + 60, p.width - 80, p.height - 120);
  q.setTransform(1, 0, 0, 1, 0, 0); q.filter = 'none';
  const g = q.createLinearGradient(0, 0, p.width, p.height); g.addColorStop(0, 'rgba(255,220,160,.18)'); g.addColorStop(1, 'rgba(0,0,40,.22)'); q.fillStyle = g; q.fillRect(0, 0, p.width, p.height);
  const d = q.getImageData(0, 0, p.width, p.height); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * 34; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  q.putImageData(d, 0, 0); return p.toDataURL('image/jpeg', 0.62);
};
