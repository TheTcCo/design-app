// Brand motif library: Greek elements generated as single-color SVG. Every motif is drawn
// in black (#000) and recolored to the chosen ink when placed on the canvas.
(function () {
  const r = (n) => Math.round(n * 100) / 100;
  const svg = (w, h, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

  // ---------- leaves / branches ----------
  function leaf(px, py, dx, dy, len, wid) {
    const nx = -dy, ny = dx;
    const mx = px + dx * len * 0.5, my = py + dy * len * 0.5;
    const tx = px + dx * len, ty = py + dy * len;
    return (
      `M ${r(px)} ${r(py)} Q ${r(mx + nx * wid)} ${r(my + ny * wid)} ${r(tx)} ${r(ty)} ` +
      `Q ${r(mx - nx * wid)} ${r(my - ny * wid)} ${r(px)} ${r(py)} Z`
    );
  }
  const rot = (x, y, deg) => {
    const a = (deg * Math.PI) / 180;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  };

  // Points along a branch curve: fn(t) -> [x, y], t in [0,1]. Returns leaf paths in pairs.
  function branch(fn, { nodes, len, wid, spread = 38, taper = 0.55, berries = 0, tipLeaf = true }) {
    let d = '';
    let extras = '';
    for (let i = 0; i < nodes; i++) {
      const t = 0.06 + (i / nodes) * 0.9;
      const [x, y] = fn(t);
      const [x2, y2] = fn(t + 0.01);
      let tx = x2 - x, ty = y2 - y;
      const m = Math.hypot(tx, ty) || 1;
      tx /= m; ty /= m;
      const k = 1 - taper * (i / nodes);
      for (const s of [1, -1]) {
        const [dx, dy] = rot(tx, ty, spread * s);
        d += leaf(x, y, dx, dy, len * k, wid * k) + ' ';
      }
      if (berries && i % berries === 1) {
        const [bx, by] = rot(tx, ty, 90);
        extras += `<ellipse cx="${r(x + bx * len * 0.42)}" cy="${r(y + by * len * 0.42)}" rx="${r(wid * 0.75)}" ry="${r(wid * 0.6)}"/>`;
      }
    }
    if (tipLeaf) {
      const [x, y] = fn(0.97);
      const [x2, y2] = fn(0.98);
      let tx = x2 - x, ty = y2 - y;
      const m = Math.hypot(tx, ty) || 1;
      d += leaf(x, y, tx / m, ty / m, len * (1 - taper) * 1.1, wid * (1 - taper));
    }
    return { leaves: d, extras };
  }

  function stemPath(fn, steps = 40, from = 0, to = 0.97) {
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const [x, y] = fn(from + ((to - from) * i) / steps);
      d += (i === 0 ? 'M ' : 'L ') + r(x) + ' ' + r(y) + ' ';
    }
    return d;
  }

  function wreath() {
    const cx = 200, cy = 200, R = 140;
    const arc = (a0, a1, mirror) => (t) => {
      const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
      const x = cx + R * Math.cos(a);
      return [mirror ? 2 * cx - x : x, cy + R * Math.sin(a)];
    };
    let body = '';
    for (const mirror of [false, true]) {
      const fn = arc(100, 258, mirror);
      const b = branch(fn, { nodes: 11, len: 44, wid: 12, spread: 40, taper: 0.45 });
      body += `<path d="${stemPath(fn)}" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round"/>`;
      body += `<path d="${b.leaves}"/>`;
    }
    return svg(400, 400, `<g fill="#000">${body}</g>`);
  }

  function laurelBranch(olive) {
    const fn = (t) => [30 + t * 440, 110 - Math.sin(t * Math.PI) * 26 - t * 12];
    const b = branch(fn, olive
      ? { nodes: 9, len: 58, wid: 9, spread: 34, taper: 0.35, berries: 2 }
      : { nodes: 9, len: 52, wid: 14, spread: 42, taper: 0.4 });
    return svg(500, 200,
      `<g fill="#000"><path d="${stemPath(fn, 40, 0, 0.97)}" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="${b.leaves}"/>${b.extras}</g>`);
  }

  function laurelDivider() {
    const right = (t) => [262 + t * 200, 60 - Math.sin(t * Math.PI) * 10];
    const left = (t) => [238 - t * 200, 60 - Math.sin(t * Math.PI) * 10];
    let body = '';
    for (const fn of [left, right]) {
      const b = branch(fn, { nodes: 6, len: 34, wid: 9, spread: 40, taper: 0.45 });
      body += `<path d="${stemPath(fn)}" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/><path d="${b.leaves}"/>`;
    }
    body += '<circle cx="250" cy="60" r="8"/>';
    return svg(500, 120, `<g fill="#000">${body}</g>`);
  }

  // ---------- borders ----------
  function meander(units) {
    const u = 10;
    let d = `M 0.5 9.5 H ${r(units * u + 0.5)} `;
    for (let i = 0; i < units; i++) {
      const o = i * u;
      d += `M ${o + 0.5} 9.5 V 0.5 H ${o + 9.5} V 7.5 H ${o + 2.5} V 2.5 H ${o + 7.5} V 5.5 H ${o + 4.5} `;
    }
    const w = units * u + 1;
    const band =
      `<path d="M -1 -2 H ${w + 1} M -1 12 H ${w + 1}" fill="none" stroke="#000" stroke-width="1"/>` +
      `<path d="${d}" fill="none" stroke="#000" stroke-width="1" stroke-linecap="square"/>`;
    return svg(w + 2, 15, `<g transform="translate(1 2.5)">${band}</g>`);
  }

  function waveBand(units) {
    const u = 40;
    let d = `M 0 36 H ${units * u} `;
    for (let i = 0; i < units; i++) {
      const o = i * u;
      d +=
        `M ${o} 36 C ${o + 14} 36 ${o + 14} 10 ${o + 27} 9 C ${o + 37} 8 ${o + 40} 18 ${o + 34} 23 ` +
        `C ${o + 29} 27 ${o + 23} 23 ${o + 25} 18 `;
    }
    return svg(units * u + 8, 44,
      `<g transform="translate(4 2)"><path d="${d}" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  }

  function eggDart(units) {
    const u = 40;
    let body = `<rect x="0" y="0" width="${units * u}" height="4"/><rect x="0" y="54" width="${units * u}" height="4"/>`;
    for (let i = 0; i < units; i++) {
      const cx = i * u + 20;
      body +=
        `<path fill-rule="evenodd" d="M ${cx - 15} 8 H ${cx + 15} V 26 A 15 22 0 0 1 ${cx - 15} 26 Z ` +
        `M ${cx - 11} 10 H ${cx + 11} V 26 A 11 18 0 0 1 ${cx - 11} 26 Z"/>` +
        `<ellipse cx="${cx}" cy="27" rx="8" ry="15"/>` +
        `<path d="M ${cx + 20} 8 L ${cx + 22.5} 13 L ${cx + 20} 48 L ${cx + 17.5} 13 Z"/>`;
    }
    return svg(units * u + 2, 58, `<g fill="#000" transform="translate(1 0)">${body}</g>`);
  }

  // ---------- architecture ----------
  function column(ionic) {
    let b = '';
    const shaftTop = ionic ? 74 : 56, shaftBot = 352;
    // fluted shaft: tapering bars
    const flutes = 6;
    for (let i = 0; i < flutes; i++) {
      const t0 = i / flutes, t1 = (i + 0.78) / flutes;
      const topL = 34 + t0 * 52, topR = 34 + t1 * 52;
      const botL = 28 + t0 * 64, botR = 28 + t1 * 64;
      b += `<path d="M ${r(topL)} ${shaftTop} L ${r(topR)} ${shaftTop} L ${r(botR)} ${shaftBot} L ${r(botL)} ${shaftBot} Z"/>`;
    }
    if (ionic) {
      b += '<rect x="10" y="22" width="100" height="10" rx="2"/>';
      b += '<path d="M 22 34 H 98 C 96 50 86 58 60 58 C 34 58 24 50 22 34 Z"/>';
      for (const [cx, dir] of [[22, -1], [98, 1]]) {
        b += `<circle cx="${cx}" cy="46" r="15" fill="none" stroke="#000" stroke-width="5"/>`;
        b += `<circle cx="${cx}" cy="46" r="4.5"/>`;
        b += `<path d="M ${cx} 31 C ${cx + dir * 12} 31 ${cx + dir * 14} 44 ${cx + dir * 6} 48" fill="none" stroke="#000" stroke-width="3.5"/>`;
      }
      b += '<rect x="28" y="62" width="64" height="8" rx="2"/>';
      b += '<rect x="22" y="356" width="76" height="10" rx="5"/>';
      b += '<rect x="16" y="370" width="88" height="8" rx="4"/>';
      b += '<rect x="10" y="382" width="100" height="14" rx="1"/>';
      return svg(120, 400, `<g fill="#000">${b}</g>`);
    }
    b += '<rect x="12" y="18" width="96" height="14"/>';
    b += '<path d="M 20 34 H 100 C 96 46 86 50 86 50 H 34 C 34 50 24 46 20 34 Z"/>';
    b += '<rect x="34" y="52" width="52" height="2.5"/>';
    b += '<rect x="8" y="356" width="104" height="12"/>';
    b += '<rect x="2" y="372" width="116" height="12"/>';
    return svg(120, 390, `<g fill="#000">${b}</g>`);
  }

  function temple() {
    let b = '';
    b += '<path fill-rule="evenodd" d="M 20 92 L 200 14 L 380 92 Z M 58 84 L 200 26 L 342 84 Z"/>';
    b += '<rect x="20" y="96" width="360" height="14"/><rect x="28" y="114" width="344" height="10"/>';
    for (let i = 0; i < 6; i++) {
      const x = 48 + i * 60;
      b += `<rect x="${x - 14}" y="128" width="28" height="8"/>`;
      for (let f = 0; f < 3; f++) b += `<rect x="${x - 10 + f * 7.5}" y="140" width="5" height="128"/>`;
      b += `<rect x="${x - 13}" y="270" width="26" height="6"/>`;
    }
    b += '<rect x="22" y="280" width="356" height="10"/><rect x="12" y="294" width="376" height="10"/><rect x="2" y="308" width="396" height="12"/>';
    return svg(400, 322, `<g fill="#000">${b}</g>`);
  }

  // ---------- objects ----------
  function amphora() {
    const body =
      'M 78 40 H 122 V 54 C 122 62 116 66 114 72 C 150 92 170 128 166 176 C 162 226 136 262 112 280 ' +
      'L 116 300 H 84 L 88 280 C 64 262 38 226 34 176 C 30 128 50 92 86 72 C 84 66 78 62 78 54 Z ' +
      'M 46 150 H 154 V 158 H 46 Z M 42 196 H 158 V 202 H 42 Z';
    const handles =
      'M 84 80 C 50 70 40 104 56 124 M 116 80 C 150 70 160 104 144 124';
    return svg(200, 310,
      `<path fill="#000" fill-rule="evenodd" d="${body}"/><path d="${handles}" fill="none" stroke="#000" stroke-width="9" stroke-linecap="round"/>` +
      '<rect x="72" y="30" width="56" height="10" rx="3" fill="#000"/>');
  }

  function vergina() {
    const cx = 150, cy = 150;
    let d = '';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const len = i % 2 === 0 ? 138 : 104;
      const half = (Math.PI / 16) * 0.55;
      const p = (ang, rad) => `${r(cx + Math.cos(ang) * rad)} ${r(cy + Math.sin(ang) * rad)}`;
      d += `M ${p(a - half, 26)} L ${p(a, len)} L ${p(a + half, 26)} Z `;
    }
    return svg(300, 300, `<g fill="#000"><path d="${d}"/><circle cx="${cx}" cy="${cy}" r="24"/></g>`);
  }

  function lyre() {
    return svg(240, 300,
      '<g fill="none" stroke="#000" stroke-linecap="round">' +
      '<path d="M 70 250 C 30 200 20 130 52 80 C 66 58 60 34 40 24" stroke-width="14"/>' +
      '<path d="M 170 250 C 210 200 220 130 188 80 C 174 58 180 34 200 24" stroke-width="14"/>' +
      '<path d="M 48 64 H 192" stroke-width="10"/>' +
      '<path d="M 92 64 V 248 M 108 64 V 248 M 124 64 V 248 M 140 64 V 248 M 156 64 V 248 M 76 64 V 240 M 164 64 V 240" stroke-width="2.5"/>' +
      '</g><path d="M 52 244 H 188 C 186 266 168 284 120 284 C 72 284 54 266 52 244 Z" fill="#000"/>');
  }

  function helmet() {
    const outer =
      'M 100 22 C 148 22 174 58 174 106 C 174 140 170 166 160 186 C 154 197 142 200 130 197 ' +
      'C 126 178 120 162 106 152 H 94 C 80 162 74 178 70 197 C 58 200 46 197 40 186 ' +
      'C 30 166 26 140 26 106 C 26 58 52 22 100 22 Z';
    const eyes =
      'M 52 104 C 66 94 84 96 94 104 L 94 122 C 82 118 66 120 54 126 C 50 118 50 110 52 104 Z ' +
      'M 148 104 C 134 94 116 96 106 104 L 106 122 C 118 118 134 120 146 126 C 150 118 150 110 148 104 Z';
    const crest = 'M 70 36 C 70 -6 130 -6 130 36 C 120 22 80 22 70 36 Z';
    return svg(200, 205, `<path fill="#000" fill-rule="evenodd" d="${outer} ${eyes}"/><path fill="#000" d="${crest}"/>`);
  }

  function trident() {
    return svg(160, 360,
      '<g fill="#000"><rect x="74" y="80" width="12" height="270" rx="4"/>' +
      '<path d="M 80 6 L 92 40 L 86 40 L 86 90 H 74 V 40 L 68 40 Z"/>' +
      '<path d="M 20 30 L 30 58 L 25 58 L 26 92 C 26 100 34 104 48 104 H 112 C 126 104 134 100 134 92 L 135 58 L 130 58 L 140 30 L 150 58 L 145 58 L 146 96 C 146 114 132 120 112 120 H 48 C 28 120 14 114 14 96 L 15 58 L 10 58 Z"/>' +
      '<rect x="62" y="124" width="36" height="10" rx="3"/></g>');
  }

  function shield() {
    return svg(300, 300,
      '<path fill="#000" fill-rule="evenodd" d="M 150 6 A 144 144 0 1 1 149.9 6 Z M 150 30 A 120 120 0 1 0 150.1 30 Z"/>' +
      '<circle cx="150" cy="150" r="104" fill="#000"/>');
  }

  function medallion() {
    let beads = '';
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      beads += `<circle cx="${r(150 + Math.cos(a) * 132)}" cy="${r(150 + Math.sin(a) * 132)}" r="4.2"/>`;
    }
    return svg(300, 300,
      `<g fill="#000">${beads}</g>` +
      '<circle cx="150" cy="150" r="144" fill="none" stroke="#000" stroke-width="4"/>' +
      '<circle cx="150" cy="150" r="118" fill="none" stroke="#000" stroke-width="3"/>');
  }

  function cloud() {
    return svg(320, 170,
      '<path fill="#000" d="M 22 150 C 6 150 4 120 26 112 C 20 86 48 70 70 82 C 76 44 124 32 146 60 ' +
      'C 164 26 220 30 228 72 C 254 58 290 76 284 106 C 310 110 316 150 290 150 Z"/>');
  }

  function keyTile() {
    // Square meander tile, seamless when repeated edge to edge.
    const d = 'M 0 1 H 20 M 1 0 V 20 M 1 19 H 15 V 5 H 5 V 15 H 11 V 9 H 9';
    return svg(20, 20, `<path d="${d}" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="square"/>`);
  }

  // period: repeat distance in SVG units ([x] or [x, y]) so Array copies join seamlessly.
  // Tiles are one repeat unit: make them as long as you like with Array (Line / Grid).
  DZ.MOTIFS = [
    { id: 'wreath', name: 'Laurel wreath', group: 'Laurel', size: 9, svg: wreath() },
    { id: 'laurel', name: 'Laurel branch', group: 'Laurel', size: 9, svg: laurelBranch(false) },
    { id: 'olive', name: 'Olive branch', group: 'Laurel', size: 9, svg: laurelBranch(true) },
    { id: 'divider', name: 'Laurel divider', group: 'Laurel', size: 6, svg: laurelDivider() },
    { id: 'meander-tile', name: 'Meander tile', group: 'Tiles', size: 1.2, svg: meander(1), period: [10], tile: true },
    { id: 'wave-tile', name: 'Wave tile', group: 'Tiles', size: 1.3, svg: waveBand(1), period: [40], tile: true },
    { id: 'eggdart-tile', name: 'Egg-and-dart tile', group: 'Tiles', size: 1.4, svg: eggDart(1), period: [40], tile: true },
    { id: 'key-tile', name: 'Key tile', group: 'Tiles', size: 1.5, svg: keyTile(), period: [20, 20], tile: true },
    { id: 'ionic', name: 'Ionic column', group: 'Architecture', size: 4, svg: column(true) },
    { id: 'doric', name: 'Doric column', group: 'Architecture', size: 4, svg: column(false) },
    { id: 'temple', name: 'Temple', group: 'Architecture', size: 10, svg: temple() },
    { id: 'amphora', name: 'Amphora', group: 'Objects', size: 6, svg: amphora() },
    { id: 'helmet', name: 'Corinthian helmet', group: 'Objects', size: 6, svg: helmet() },
    { id: 'lyre', name: 'Lyre', group: 'Objects', size: 5, svg: lyre() },
    { id: 'trident', name: 'Trident', group: 'Objects', size: 4, svg: trident() },
    { id: 'shield', name: 'Aspis shield', group: 'Objects', size: 7, svg: shield() },
    { id: 'vergina', name: 'Vergina sun', group: 'Symbols', size: 6, svg: vergina() },
    { id: 'medallion', name: 'Coin frame', group: 'Symbols', size: 7, svg: medallion() },
    { id: 'cloud', name: 'Cloud', group: 'Symbols', size: 7, svg: cloud() },
  ];

  // Periods of the multi-unit bands older documents may still contain.
  DZ.MOTIF_LEGACY_PERIODS = { meander: [100], 'meander-s': [40], wave: [320], eggdart: [320] };

  // Greek lettering register: words placed as editable text, with their meaning shown.
  DZ.WORDS = [
    { text: 'ΑΡΕΤΗ', meaning: 'Excellence' },
    { text: 'ΚΛΕΟΣ', meaning: 'Glory' },
    { text: 'ΝΙΚΗ', meaning: 'Victory' },
    { text: 'ΚΡΑΤΟΣ', meaning: 'Power' },
    { text: 'ΑΘΑΝΑΤΟΣ', meaning: 'Immortal' },
    { text: 'ΜΟΙΡΑ', meaning: 'Fate' },
    { text: 'ΛΟΓΟΣ', meaning: 'Reason' },
    { text: 'ΧΡΟΝΟΣ', meaning: 'Time' },
    { text: 'ΕΥΔΑΙΜΟΝΙΑ', meaning: 'Flourishing' },
    { text: 'ΜΕΤΡΟΝ ΑΡΙΣΤΟΝ', meaning: 'Moderation is best' },
    { text: 'EST. MMXXVI', meaning: 'Established 2026' },
  ];
})();
