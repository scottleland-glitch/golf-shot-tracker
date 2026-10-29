// My Bag (v92): the golfer's clubs + their carry distances, and an air-density carry estimate for other
// elevations / temperatures. Pure functions only (no DOM) so they can be unit tested: BAG.adjust(...), BAG.catalog...
// Stored on the phone (localStorage 'golfsg.bag.v1') and included in backups.
(function (root) {
  // ---------- catalog: common makers and recent models (lofts are typical – every one is editable) ----------
  // cat: d = driver, fw = fairway woods, hy = hybrids, ir = irons (set), we = wedges, pt = putter
  var CATS = [['d', 'Driver'], ['fw', 'Fairway woods'], ['hy', 'Hybrids'], ['ir', 'Irons'], ['we', 'Wedges'], ['pt', 'Putter']];
  var CAT_NAME = {}; CATS.forEach(function (c) { CAT_NAME[c[0]] = c[1]; });
  var MAKERS = [
    ['Titleist', { d: ['GT2', 'GT3', 'TSR2', 'TSR3'], fw: ['GT2', 'TSR2'], hy: ['GT2', 'TSR2'], ir: ['T100', 'T150', 'T200', 'T350', '620 CB', '620 MB'], we: ['Vokey SM10', 'Vokey SM9'], pt: ['Scotty Cameron Phantom', 'Scotty Cameron Newport'] }],
    ['TaylorMade', { d: ['Qi35', 'Qi35 Max', 'Qi10', 'Qi10 Max', 'Stealth 2'], fw: ['Qi35', 'Qi10'], hy: ['Qi35 Rescue', 'Qi10 Rescue'], ir: ['P790', 'P770', 'P7MC', 'Qi'], we: ['MG4', 'MG3'], pt: ['Spider Tour'] }],
    ['Callaway', { d: ['Elyte', 'Elyte Triple Diamond', 'Paradym Ai Smoke', 'Paradym'], fw: ['Elyte', 'Paradym Ai Smoke'], hy: ['Elyte', 'Apex UW'], ir: ['Apex Pro', 'Apex CB', 'Apex MB', 'Elyte', 'Paradym Ai Smoke'], we: ['Opus', 'Jaws Raw'], pt: [] }],
    ['Ping', { d: ['G440 Max', 'G440 LST', 'G430 Max', 'G430 LST', 'G430 SFT'], fw: ['G440', 'G430'], hy: ['G440', 'G430'], ir: ['Blueprint T', 'Blueprint S', 'i530', 'i230', 'G430'], we: ['s159', 'Glide 4.0'], pt: ['PLD', 'Anser'] }],
    ['Srixon', { d: ['ZXi', 'ZXi LS', 'ZXi Max', 'ZX5 Mk II', 'ZX7 Mk II'], fw: ['ZXi', 'ZX Mk II'], hy: ['ZXi', 'ZX Mk II'], ir: ['ZXi4', 'ZXi5', 'ZXi7', 'ZX4 Mk II', 'ZX5 Mk II', 'ZX7 Mk II', 'Z-Forged II'], we: [], pt: [] }],
    ['Cleveland', { d: ['Launcher XL2'], fw: ['Launcher XL2'], hy: ['Launcher XL Halo'], ir: ['ZipCore XL', 'Launcher XL Halo'], we: ['RTX 6 ZipCore', 'RTX ZipCore', 'CBX 4 ZipCore', 'Smart Sole'], pt: ['HB Soft 2'] }],
    ['Mizuno', { d: ['ST-Max 230', 'ST-G', 'ST-Z 230'], fw: ['ST-Max 230'], hy: ['ST-Max 230'], ir: ['JPX 925 Hot Metal', 'JPX 925 Forged', 'Pro 241', 'Pro 243', 'Pro 245', 'JPX 923 Hot Metal'], we: ['T24', 'T22'], pt: [] }],
    ['Cobra', { d: ['DS-Adapt', 'Darkspeed', 'Aerojet'], fw: ['DS-Adapt', 'Darkspeed'], hy: ['DS-Adapt', 'Darkspeed'], ir: ['King Tec', 'King Forged Tec', 'Darkspeed'], we: ['Snakebite'], pt: [] }],
    ['PXG', { d: ['Black Ops', '0311 GEN6'], fw: ['Black Ops', '0311 GEN6'], hy: ['Black Ops', '0311 GEN6'], ir: ['0311 P GEN6', '0311 T GEN6', '0311 XP GEN6'], we: ['Sugar Daddy'], pt: [] }],
    ['Wilson', { d: ['Dynapower', 'D9'], fw: ['Dynapower'], hy: ['Dynapower'], ir: ['Staff Model CB', 'Staff Model Blade', 'Dynapower', 'D9'], we: ['Staff Model', 'Harmonized'], pt: [] }],
    ['Bridgestone', { d: ['B1 ST', 'B2 HT'], fw: ['B1', 'B2'], hy: ['B1', 'B2'], ir: ['221CB', '221MB'], we: [], pt: [] }],
    ['Honma', { d: ['TR20', 'T//World GS'], fw: ['T//World GS'], hy: ['T//World GS'], ir: ['TR20', 'T//World GS'], we: [], pt: [] }],
    ['Tour Edge', { d: ['Exotics C723', 'Exotics E723'], fw: ['Exotics C723', 'Exotics E723'], hy: ['Exotics C723', 'Exotics E723'], ir: ['Exotics E723'], we: [], pt: [] }],
    ['XXIO', { d: ['XXIO 13', 'XXIO 12', 'XXIO X'], fw: ['XXIO 13', 'XXIO 12'], hy: ['XXIO 13', 'XXIO 12'], ir: ['XXIO 13', 'XXIO 12'], we: [], pt: [] }],
    ['Scotty Cameron', { pt: ['Phantom', 'Special Select', 'Newport', 'Super Select'] }],
    ['Odyssey', { pt: ['White Hot OG', 'Ai-ONE', 'Tri-Hot 5K', 'Eleven'] }],
    ['Vokey', { we: ['SM10', 'SM9'] }],
    ['Ben Hogan', { ir: ['Icon', 'Edge', 'Ft. Worth'], we: ['Equalizer'] }],
    ['Sub 70', { d: ['699'], ir: ['699 Pro', '639 CB'] }],
    ['Lynx', { d: ['Prowler'], ir: ['Prowler'] }]
  ];
  // Clubs offered per category: [code shown in the picker, name, typical loft]
  var SLOTS = {
    d: [['Driver', 'Driver', 10.5]],
    fw: [['3W', '3 wood', 15], ['4W', '4 wood', 16.5], ['5W', '5 wood', 18], ['7W', '7 wood', 21], ['9W', '9 wood', 24]],
    hy: [['2H', '2 hybrid', 17], ['3H', '3 hybrid', 19], ['4H', '4 hybrid', 22], ['5H', '5 hybrid', 25], ['6H', '6 hybrid', 28]],
    ir: [['3i', '3 iron', 20], ['4i', '4 iron', 23], ['5i', '5 iron', 26], ['6i', '6 iron', 29], ['7i', '7 iron', 33], ['8i', '8 iron', 37], ['9i', '9 iron', 41], ['PW', 'Pitching wedge', 45], ['GW', 'Gap wedge', 50]],
    we: [46, 48, 50, 52, 54, 56, 58, 60, 62].map(function (l) { return [String(l), l + '° wedge', l]; }),
    pt: [['Putter', 'Putter', 3]]
  };
  var DRIVER_LOFTS = [9, 10.5, 12];
  function makers() { return MAKERS.map(function (m) { return m[0]; }); }
  function models(maker, cat) { var m = MAKERS.filter(function (x) { return x[0] === maker; })[0]; if (!m) return []; var o = m[1]; return cat ? (o[cat] || []) : o; }
  function catsFor(maker) { var o = models(maker); return CATS.filter(function (c) { return o[c[0]] && o[c[0]].length; }).map(function (c) { return c[0]; }); }

  // ---------- the bag ----------
  var BASE0 = { elev: 5000, temp: 70 }; // Reno, NV – the conditions the carries were measured in
  function blank() { return { v: 1, base: { elev: BASE0.elev, temp: BASE0.temp }, cond: { elev: BASE0.elev, temp: BASE0.temp }, useCond: false, sort: 'club', clubs: [] }; }
  function clampN(v, lo, hi, d) { v = Number(v); return isFinite(v) && v !== '' ? Math.max(lo, Math.min(hi, v)) : d; }
  function norm(b) { // tidy whatever is stored (or restored)
    var o = blank(); if (!b || typeof b !== 'object') return o;
    if (b.base) { o.base.elev = clampN(b.base.elev, -1000, 12000, BASE0.elev); o.base.temp = clampN(b.base.temp, 0, 130, BASE0.temp); }
    o.cond = b.cond ? { elev: clampN(b.cond.elev, 0, 9000, o.base.elev), temp: clampN(b.cond.temp, 30, 110, o.base.temp) } : { elev: o.base.elev, temp: o.base.temp };
    o.useCond = !!b.useCond; o.sort = b.sort === 'carry' ? 'carry' : 'club'; if (b.updated) o.updated = String(b.updated);
    o.clubs = (Array.isArray(b.clubs) ? b.clubs : []).filter(function (c) { return c && String(c.code || '').trim(); }).map(function (c) {
      var x = { id: String(c.id || newId()), cat: CAT_NAME[c.cat] ? c.cat : 'ot', code: String(c.code).trim().slice(0, 14), make: String(c.make || '').slice(0, 40), model: String(c.model || '').slice(0, 50) };
      if (c.loft != null && c.loft !== '' && isFinite(+c.loft)) x.loft = +c.loft; if (c.carry != null && c.carry !== '' && +c.carry > 0) x.carry = Math.round(+c.carry); return x; });
    return o;
  }
  var _n = 0; function newId() { return 'b' + Date.now().toString(36) + (_n++) + Math.floor(Math.random() * 1000); }
  // Add clubs; one club per code (adding a 7i again replaces the old 7i). Returns { bag, added, replaced }.
  function addClubs(bag, list) {
    var b = norm(bag), res = { added: 0, replaced: 0 };
    (list || []).forEach(function (c) { var x = norm({ clubs: [c] }).clubs[0]; if (!x) return;
      var i = indexOfCode(b, x.code); if (i >= 0) { b.clubs[i] = x; res.replaced++; } else { b.clubs.push(x); res.added++; } });
    res.bag = b; return res;
  }
  function indexOfCode(b, code) { var lc = String(code).toLowerCase(); for (var i = 0; i < b.clubs.length; i++) if (b.clubs[i].code.toLowerCase() === lc) return i; return -1; }
  // Picker order: Driver, woods, hybrids, irons, PW, GW, wedges by loft, putter, anything else
  function rank(c) {
    var code = String(c.code || c), m;
    if (/^driver$/i.test(code)) return 0;
    if ((m = /^(\d+)W$/i.exec(code))) return 10 + +m[1];
    if ((m = /^(\d+)H$/i.exec(code))) return 30 + +m[1];
    if ((m = /^(\d+)i$/i.exec(code))) return 50 + +m[1];
    if (/^PW$/i.test(code)) return 60; if (/^(GW|AW|UW)$/i.test(code)) return 61;
    if ((m = /^(\d\d)$/.exec(code))) return 62 + (+m[1] - 40) / 100;
    if (/^SW$/i.test(code)) return 62.15; if (/^LW$/i.test(code)) return 62.2;
    if (/^putter$/i.test(code)) return 90;
    return c.loft != null ? 50 + c.loft / 10 : 80;
  }
  function sorted(bag, how) {
    var b = norm(bag), L = b.clubs.slice();
    if ((how || b.sort) === 'carry') return L.sort(function (x, y) { return (y.carry || -1) - (x.carry || -1) || rank(x) - rank(y); });
    return L.sort(function (x, y) { return rank(x) - rank(y); });
  }
  function title(c) { return [c.make, c.model].filter(Boolean).join(' '); }
  function pickerClubs(bag) { return sorted(bag, 'club').filter(function (c) { return c.cat !== 'pt'; }); } // putts have no club box
  // Voice: "gap wedge" (52) / "sand wedge" (56) / "lob wedge" (60) / a loft → the nearest wedge actually in the bag
  function matchClub(code, bag) {
    var L = pickerClubs(bag); if (!code || !L.length) return code;
    var hit = L.filter(function (c) { return c.code.toLowerCase() === String(code).toLowerCase(); })[0]; if (hit) return hit.code;
    if (/^\d\d$/.test(code)) { var want = +code, best = null, bd = 99;
      L.forEach(function (c) { var l = /^\d\d$/.test(c.code) ? +c.code : c.loft; if ((c.cat === 'we' || /^(GW|AW|SW|LW|PW)$/i.test(c.code) || /^\d\d$/.test(c.code)) && l != null && Math.abs(l - want) < bd) { bd = Math.abs(l - want); best = c; } });
      if (best && bd <= 3) return best.code; }
    return code;
  }

  // ---------- physics: carry at other elevations / temperatures ----------
  // Air density from the standard-atmosphere pressure at that elevation and the air temperature (dry air – humidity
  // changes density by only ~1% and is left out). The ball is flown with a small point-mass simulation: gravity,
  // drag and spin lift (Magnus) both proportional to air density, Cd = 0.22 + 0.30·S and Cl = 0.40·S^0.4 (S = spin
  // factor = rω/v, the usual shape of wind-tunnel data for golf balls), spin slowly decaying. For each club the ball
  // speed is solved so the simulated carry at the BASELINE conditions equals the carry the golfer entered; the same
  // ball speed, launch and spin are then flown in the new air. Launch / spin come from the loft (typical tour-average
  // launch monitor values). It is an estimate: wind, humidity, ball temperature and firm/soft ground are not included.
  var MASS = 0.04593, DIA = 0.04267, AREA = Math.PI * DIA * DIA / 4, RAD = DIA / 2, G = 9.81, RAIR = 287.05;
  var CD0 = 0.22, CD1 = 0.30, CLA = 0.40, CLP = 0.4, SPIN_TAU = 25;
  function pressure(ft) { var h = ft * 0.3048; return 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588); }
  function density(ft, f) { return pressure(ft) / (RAIR * ((f - 32) * 5 / 9 + 273.15)); }
  // loft → [launch°, spin rpm] (typical launch-monitor values, interpolated)
  var LAUNCH = [[8, 10.0, 2500], [10.5, 10.9, 2686], [15, 9.2, 3655], [18, 9.4, 4350], [21, 10.4, 4630], [24, 11.0, 4836], [27, 12.1, 5361], [30, 14.1, 6231],
    [34, 16.3, 7097], [38, 18.1, 7998], [42, 20.4, 8647], [46, 24.2, 9304], [50, 26.0, 9600], [54, 28.5, 9900], [58, 31.0, 10200], [64, 34.0, 10400]];
  function launchFor(loft) {
    var L = LAUNCH, x = Math.max(L[0][0], Math.min(L[L.length - 1][0], +loft || 30));
    for (var i = 1; i < L.length; i++) if (x <= L[i][0]) { var t = (x - L[i - 1][0]) / (L[i][0] - L[i - 1][0]); return [L[i - 1][1] + t * (L[i][1] - L[i - 1][1]), L[i - 1][2] + t * (L[i][2] - L[i - 1][2])]; }
    return [L[L.length - 1][1], L[L.length - 1][2]];
  }
  function loftOf(c) { if (c.loft != null) return c.loft; var s = [].concat(SLOTS.d, SLOTS.fw, SLOTS.hy, SLOTS.ir).filter(function (x) { return x[0].toLowerCase() === String(c.code).toLowerCase(); })[0]; if (s) return s[2];
    if (/^\d\d$/.test(c.code)) return +c.code; return { SW: 56, LW: 60, AW: 50 }[String(c.code).toUpperCase()] || 30; }
  // carry in yards for ball speed v (m/s), launch (deg), spin (rpm) in air of density rho (kg/m³)
  function fly(v, launch, rpm, rho) {
    var a = launch * Math.PI / 180, x = 0, y = 0, vx = v * Math.cos(a), vy = v * Math.sin(a), w = rpm * Math.PI / 30, t = 0, dt = 0.004, decay = Math.exp(-dt / SPIN_TAU);
    for (var n = 0; n < 5000; n++) {
      var s = Math.sqrt(vx * vx + vy * vy), S = w * RAD / s, cd = CD0 + CD1 * S, cl = CLA * Math.pow(S, CLP), k = 0.5 * rho * AREA * s / MASS;
      var ax = -k * (cd * vx + cl * vy), ay = -G + k * (cl * vx - cd * vy), nx = x + vx * dt, ny = y + vy * dt;
      vx += ax * dt; vy += ay * dt; w *= decay; t += dt;
      if (ny < 0 && t > 0.05) return (x + (nx - x) * (y / (y - ny))) / 0.9144;
      x = nx; y = ny;
    }
    return x / 0.9144;
  }
  var cache = {};
  function speedFor(carry, launch, rpm, rho) { // ball speed whose simulated carry = carry (bisection)
    var key = [carry, launch.toFixed(2), Math.round(rpm), rho.toFixed(5)].join('|'); if (cache[key]) return cache[key];
    var lo = 3, hi = 120; for (var i = 0; i < 34; i++) { var m = (lo + hi) / 2; if (fly(m, launch, rpm, rho) < carry) lo = m; else hi = m; }
    return (cache[key] = (lo + hi) / 2);
  }
  // Carry (yards, not rounded) for a club entered as `carry` at `base` conditions, flown at `cond`. base/cond = { elev: ft, temp: °F }
  function adjust(carry, loft, base, cond) {
    carry = +carry; if (!(carry > 0)) return null;
    if (+base.elev === +cond.elev && +base.temp === +cond.temp) return carry;
    var L = launchFor(loft), r0 = density(+base.elev, +base.temp), r1 = density(+cond.elev, +cond.temp), v = speedFor(carry, L[0], L[1], r0);
    return carry * fly(v, L[0], L[1], r1) / fly(v, L[0], L[1], r0); // ratio form removes the tiny bisection error
  }
  function clubCarry(c, bag) { var b = bag || blank(); if (!(c && c.carry > 0) || c.cat === 'pt') return null; return adjust(c.carry, loftOf(c), b.base, b.cond); }
  function sameCond(b) { return +b.base.elev === +b.cond.elev && +b.base.temp === +b.cond.temp; }

  // ---------- restore ----------
  // The phone's bag is kept unless it is empty, or the backup's copy is newer.
  function mergeBag(have, incoming) {
    if (!incoming || !Array.isArray(incoming.clubs) || !incoming.clubs.length) return { bag: have, changed: false };
    var h = norm(have), i = norm(incoming);
    if (!h.clubs.length || (JSON.stringify(h) !== JSON.stringify(i) && String(i.updated || '') > String(h.updated || ''))) return { bag: i, changed: true };
    return { bag: h, changed: false };
  }

  var api = { CATS: CATS, CAT_NAME: CAT_NAME, MAKERS: MAKERS, SLOTS: SLOTS, DRIVER_LOFTS: DRIVER_LOFTS, BASE0: BASE0, makers: makers, models: models, catsFor: catsFor,
    blank: blank, norm: norm, addClubs: addClubs, indexOfCode: indexOfCode, rank: rank, sorted: sorted, title: title, pickerClubs: pickerClubs, matchClub: matchClub,
    pressure: pressure, density: density, launchFor: launchFor, loftOf: loftOf, fly: fly, adjust: adjust, clubCarry: clubCarry, sameCond: sameCond, mergeBag: mergeBag, newId: newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BAG = api;
})(this);
