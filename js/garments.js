// Flat-lay garment drawings, generated as SVG in inches (scaled ×300 to world units).
// Origin = high point shoulder on the center line. Three layers per garment:
//   base   – the fabric itself (drawn under the design)
//   shadow – folds/edge shading, composited with multiply over the design
//   light  – soft highlights, composited with screen over the design
(function () {
  const S = DZ.DPI;

  // ---------- geometry helpers ----------
  const f = (v) => +v.toFixed(3);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const perp = (d) => [-d[1], d[0]]; // toward the garment's underside (screen y points down)
  const mx = (p) => [-p[0], p[1]];
  const pt = (p) => `${f(p[0])} ${f(p[1])}`;

  // A segment is ['L', p] | ['Q', c, p] | ['C', c1, c2, p].
  const path = (start, segs, close) =>
    `M ${pt(start)} ` + segs.map((s) => s[0] + ' ' + s.slice(1).map(pt).join(' ')).join(' ') + (close ? ' Z' : '');
  const mirrorSegs = (segs) => segs.map((s) => [s[0], ...s.slice(1).map(mx)]);
  const both = (start, segs, close) => [path(start, segs, close), path(mx(start), mirrorSegs(segs), close)];
  function reverse(start, segs) {
    const pts = [start, ...segs.map((s) => s[s.length - 1])];
    const out = [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i], to = pts[i];
      if (s[0] === 'L') out.push(['L', to]);
      else if (s[0] === 'Q') out.push(['Q', s[1], to]);
      else out.push(['C', s[2], s[1], to]);
    }
    return out;
  }
  // Rounded "U" from (-a, y0) to (a, y0) whose center sits at depth `dip`.
  const uCurve = (a, y0, dip, round = 0.9) => {
    const k = (dip - 0.25 * y0) / 0.75;
    return ['C', [-a * round, k], [a * round, k], [a, y0]];
  };
  const uBack = (a, y0, dip, round = 0.9) => {
    const k = (dip - 0.25 * y0) / 0.75;
    return ['C', [a * round, k], [-a * round, k], [-a, y0]];
  };
  const deg = (d) => (Math.atan2(d[1], d[0]) * 180) / Math.PI;

  // ---------- garment builder ----------
  // Proportions follow real flat specs for a boxy, drop-shoulder streetwear fit (size L):
  // chest ≈ 24–25" across, body ≈ 28" from HPS, shoulder seam dropped onto the arm, sleeves
  // that round over the shoulder before falling, wide short-sleeve openings, rib cuffs/hems
  // slightly narrower than the body so the fabric blouses over them.
  function build(sp) {
    const { n, rib = 0, dF, dB, W, hemY, hemRib = 0 } = sp;
    const Sh = sp.shoulder, U = sp.underarm;
    const g = { kind: sp.hood ? 'hood' : 'top', seams: [], stitches: [], ribs: [], folds: [], spec: sp };
    const pts = [];

    // shoulder line: neck point → shoulder seam point, slightly convex
    const right = [['C', [n + (Sh[0] - n) * 0.36, Sh[1] * 0.22], [n + (Sh[0] - n) * 0.7, Sh[1] * 0.6], Sh]];
    let sleeveToU; // sleeve outline from the shoulder point to the underarm apex
    let d, nn;

    if (sp.short) {
      const { c1, c2, T, open } = sp.short;
      d = unit(sub(T, c2));
      nn = perp(d);
      const H = add(T, mul(nn, open));
      const hemMid = add(lerp(T, H, 0.5), mul(d, 0.14));
      const A1 = add(U, mul(unit(sub(H, U)), 0.8));
      sleeveToU = [['C', c1, c2, T], ['Q', hemMid, H], ['L', A1]];
      right.push(...sleeveToU, ['Q', U, [U[0] + 0.03, U[1] + 0.8]]);
      const sT = add(sub(T, mul(d, 0.72)), mul(nn, 0.12)), sH = sub(sub(H, mul(d, 0.72)), mul(nn, 0.1));
      g.stitches.push(...both(sT, [['Q', sub(hemMid, mul(d, 0.72)), sH]]));
      g.folds.push(...both(add(lerp(Sh, U, 0.45), [0.9, 0]), [['Q', add(lerp(lerp(Sh, U, 0.45), lerp(T, H, 0.5), 0.5), mul(nn, 0.5)), sub(lerp(T, H, 0.58), mul(d, 0.9))]]));
      pts.push(T, H);
    } else {
      const { c1, c2, E, Tb, end, cuff, inset } = sp.long;
      d = unit(sub(Tb, E));
      nn = perp(d);
      const Bb = add(Tb, mul(nn, end));
      const Ct0 = add(Tb, mul(nn, inset)), Cb0 = sub(Bb, mul(nn, inset));
      const Ct1 = add(Ct0, mul(d, cuff)), Cb1 = add(Cb0, mul(d, cuff));
      const cuffMid = add(lerp(Ct1, Cb1, 0.5), mul(d, 0.1));
      const A1 = add(U, mul(unit(sub(Bb, U)), 0.9));
      sleeveToU = [
        ['C', c1, c2, E], ['L', Tb], ['Q', add(Tb, mul(d, 0.3)), Ct0], ['L', Ct1],
        ['Q', cuffMid, Cb1], ['L', Cb0], ['Q', add(Bb, mul(d, 0.3)), Bb], ['L', A1],
      ];
      right.push(...sleeveToU, ['Q', U, [U[0] + 0.03, U[1] + 0.9]]);
      const rot = deg(d) - 90;
      const cuffD = path(Ct0, [['L', Ct1], ['Q', cuffMid, Cb1], ['L', Cb0]], true);
      g.ribs.push({ d: cuffD, rot }, { d: path(mx(Ct0), mirrorSegs([['L', Ct1], ['Q', cuffMid, Cb1], ['L', Cb0]]), true), rot: -rot });
      g.seams.push(...both(Ct0, [['L', Cb0]]));
      // long crease down the sleeve + an elbow break
      const top = lerp(Sh, U, 0.55), M = lerp(lerp(Sh, U, 0.5), lerp(Tb, Bb, 0.5), 0.55);
      g.folds.push(...both(add(top, [1.1, 0.4]), [['Q', add(lerp(top, lerp(Tb, Bb, 0.45), 0.5), mul(nn, -0.6)), sub(lerp(Tb, Bb, 0.45), mul(d, 1.4))]]));
      g.folds.push(...both(add(M, mul(nn, -1.5)), [['Q', add(M, mul(d, 0.7)), add(add(M, mul(nn, 1.6)), mul(d, 0.2))]]));
      pts.push(E, Tb, Ct1, Cb1, Bb);
    }

    // body side and hem
    if (hemRib) {
      const top = hemY - hemRib, Wr = W - 0.35;
      right.push(['L', [W + 0.15, top]], ['Q', [W + 0.15, top + 0.3], [Wr, top + 0.36]], ['L', [Wr, hemY]],
        ['C', [Wr * 0.6, hemY + 0.1], [Wr * 0.3, hemY + 0.1], [0, hemY + 0.1]]);
      const band = [['L', [Wr, top + 0.36]], ['L', [Wr, hemY]], ['C', [Wr * 0.6, hemY + 0.1], [Wr * 0.3, hemY + 0.1], [0, hemY + 0.1]]];
      const bandL = reverse([0, top + 0.36], band);
      g.ribs.push({ d: path([0, top + 0.36], [...band, ...mirrorSegs(bandL)], true), rot: 0 });
      g.seams.push(path([-Wr, top + 0.36], [['L', [Wr, top + 0.36]]]));
      g.hemTop = top;
    } else {
      right.push(['L', [W, hemY]], ['C', [W * 0.62, hemY + 0.32], [W * 0.3, hemY + 0.38], [0, hemY + 0.38]]);
      g.stitches.push(...both([W - 0.08, hemY - 0.74], [['C', [W * 0.62, hemY - 0.42], [W * 0.3, hemY - 0.36], [0, hemY - 0.36]]]));
      g.hemTop = hemY;
    }

    const rightRev = mirrorSegs(reverse([n, 0], right));
    g.front = path([-n, 0], [uCurve(n, 0, dF), ...right, ...rightRev], true);
    g.back = path([-n, 0], [uCurve(n, 0, dB), ...right, ...rightRev], true);

    // sleeves (shading regions) and the dropped armhole seam
    const arm = [['C', [Sh[0] + 0.5, Sh[1] + 3], [U[0] + 0.2, U[1] - 3.2], U]];
    const armRev = reverse(Sh, arm);
    const sleeve = [...sleeveToU, ['L', U], ...armRev];
    g.sleeves = both(Sh, sleeve, true);
    g.seams.push(...both(Sh, arm));
    g.shoulderTop = both(Sh, [sleeveToU[0]]);

    // collar (rib knit) for tee / long sleeve / crew
    if (rib) {
      // collar corners sit just under the shoulder line where it passes x = n + rib
      const o = n + rib;
      const sh = (t) => {
        const c1 = [n + (Sh[0] - n) * 0.36, Sh[1] * 0.22], c2 = [n + (Sh[0] - n) * 0.7, Sh[1] * 0.6], u = 1 - t;
        return [u * u * u * n + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * Sh[0], 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * Sh[1]];
      };
      let t0 = 0;
      while (t0 < 1 && sh(t0)[0] < o) t0 += 0.005;
      const y0 = sh(t0)[1] + 0.14;
      g.frontRib = path([-o, y0], [uCurve(o, y0, dF + rib * 1.08), ['L', [n, 0]], uBack(n, 0, dF)], true);
      g.inside = path([-n, 0], [uCurve(n, 0, dF), uBack(n, 0, dB)], true);
      // back collar seen through the front neck opening: hangs below the back neckline,
      // so it never rises above the shoulder line
      // (a crescent between the back neckline and a deeper curve, tapering to the neck points)
      g.backRibTop = path([-n, 0], [uCurve(n, 0, dB), uBack(n, 0, dB + rib * 0.7)], true);
      g.backRib = path([-o, y0 + 0.06], [uCurve(o, y0 + 0.06, dB + rib), ['L', [n, 0]], uBack(n, 0, dB)], true);
      const so = n + rib * 0.8;
      g.frontStitch = path([-so, 0.5], [uCurve(so, 0.5, dF + rib * 0.86)]);
      g.backStitch = path([-so, 0.5], [uCurve(so, 0.5, dB + rib * 0.78)]);
      if (sp.vee) {
        const yv = dF + rib * 0.9;
        g.vee = path([-0.95, yv - 0.2], [['L', [0.95, yv - 0.2]], ['L', [0, yv + 1.55]]], true);
      }
    }

    g.armpits = [[U[0] - 0.1, U[1] + 0.5], [-U[0] + 0.1, U[1] + 0.5]];
    // drag lines from the armpits + soft hem ripples (deliberately asymmetric, like real cloth)
    g.folds.push(...both([U[0] - 0.5, U[1] + 0.8], [['Q', [U[0] - 2.8, U[1] + 2], [U[0] - 4.3, U[1] + 5.4]]]));
    const hb = g.hemTop;
    g.folds.push(path([W * 0.34, hb - 7], [['Q', [W * 0.43, hb - 3.4], [W * 0.38, hb - 0.3]]]));
    g.folds.push(path([-W * 0.24, hb - 5.6], [['Q', [-W * 0.31, hb - 2.6], [-W * 0.27, hb - 0.2]]]));

    const maxX = Math.max(W + 0.3, ...pts.map((p) => p[0])) + 0.9;
    const top = sp.hood ? -12.8 : -1.4;
    g.bbox = { x: -maxX, y: top, w: maxX * 2, h: hemY + 1.2 - top };
    return g;
  }

  function addHood(g, n) {
    // smaller hood: shrink hood outlines about the neck (x 0.9, y 0.88 around y=2)
    const hs = (d) => d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (m, x, y) => `${(+x * 0.9).toFixed(3)} ${(2 + (+y - 2) * 0.88).toFixed(3)}`);
    g.hoodBehind = `M ${-(n + 1.4)} 2.4 C ${-(n + 3.7)} -3.4 ${-(n + 2)} -11.9 0 -12.3 C ${n + 2} -11.9 ${n + 3.7} -3.4 ${n + 1.4} 2.4 Z`;
    g.hoodOpening = `M ${-(n - 1.1)} 4 C ${-(n + 0.5)} -1.9 ${-(n - 1.3)} -9.6 0 -10 C ${n - 1.3} -9.6 ${n + 0.5} -1.9 ${n - 1.1} 4 L 0 6.5 Z`;
    g.hoodRimLeft = `M 0.9 6.8 L ${-(n - 1.1)} 4 C ${-(n + 0.5)} -1.9 ${-(n - 1.3)} -9.6 0 -10`;
    g.hoodRimRight = `M 0 -10 C ${n - 1.3} -9.6 ${n + 0.5} -1.9 ${n - 1.1} 4 L -0.9 6.8`;
    g.hoodSeam = 'M 0 -12.2 L 0 -10.6';
    g.hoodBack = `M ${-(n + 1.6)} 0.9 C ${-(n + 2.9)} 5.2 ${-(n + 0.8)} 11.3 0 12 C ${n + 0.8} 11.3 ${n + 2.9} 5.2 ${n + 1.6} 0.9 C ${n * 0.55} 2.4 ${-n * 0.55} 2.4 ${-(n + 1.6)} 0.9 Z`;
    g.hoodBackSeam = 'M 0 2.2 L 0 11.9';
    const pt0 = 16.2, pb = g.hemTop + 0.36;
    for (const k of ['hoodBehind', 'hoodOpening', 'hoodRimLeft', 'hoodRimRight', 'hoodSeam', 'hoodBack', 'hoodBackSeam']) g[k] = hs(g[k]);
    g.pocket = `M -5.4 ${pt0} L 5.4 ${pt0} C 6.3 ${pt0 + 2.8} 7.3 ${pb - 3.4} 7.6 ${pb} L -7.6 ${pb} C -7.3 ${pb - 3.4} -6.3 ${pt0 + 2.8} -5.4 ${pt0} Z`;
    g.pocketOpenings = [`M 5.4 ${pt0} C 6.3 ${pt0 + 2.8} 7.3 ${pb - 3.4} 7.6 ${pb}`, `M -5.4 ${pt0} C -6.3 ${pt0 + 2.8} -7.3 ${pb - 3.4} -7.6 ${pb}`];
    g.pocketStitch = `M -5.1 ${pt0 + 0.38} L 5.1 ${pt0 + 0.38}`;
    g.eyelets = [[-1.6, 5.25], [1.6, 5.25]];
    g.strings = [
      { d: 'M -1.6 5.25 Q -2.15 9.6 -1.75 14.1', aglet: [-1.75, 14.1] },
      { d: 'M 1.6 5.25 Q 1.95 9.2 1.85 13.4', aglet: [1.85, 13.4] },
    ];
    g.folds.push('M -6.2 9.6 Q -4.8 11.6 -2.9 12.3', 'M 6.4 10.2 Q 5 11.9 3.2 12.4');
    return g;
  }

  const TEE = build({
    n: 3.6, rib: 0.85, dF: 3.5, dB: 0.85, W: 10.2, hemY: 28.4,
    shoulder: [9.8, 1.9], underarm: [10.1, 9.9],
    short: { c1: [11.2, 2.4], c2: [13.1, 3.5], T: [16.5, 5.7], open: 7.3 },
  });
  const LONGTEE = build({
    n: 3.6, rib: 0.85, dF: 3.4, dB: 0.85, W: 10.2, hemY: 28.6,
    shoulder: [9.9, 2.0], underarm: [10.1, 10.4],
    long: { c1: [12.0, 2.5], c2: [15.0, 4.6], E: [16.7, 10.0], Tb: [17.6, 23.4], end: 7.1, cuff: 1.9, inset: 0.35 },
  });
  const CREW = build({
    n: 3.75, rib: 0.95, dF: 3.2, dB: 0.9, W: 10.4, hemY: 27.6, hemRib: 2.6, vee: true,
    shoulder: [10.1, 2.1], underarm: [10.3, 10.8],
    long: { c1: [12.3, 2.6], c2: [15.7, 4.8], E: [17.4, 10.3], Tb: [18.3, 23.0], end: 7.6, cuff: 2.6, inset: 0.45 },
  });
  const HOODIE = addHood(build({
    n: 5.4, dF: 2.6, dB: 1.0, W: 10.5, hemY: 27.8, hemRib: 2.75, hood: true,
    shoulder: [10.2, 2.2], underarm: [10.4, 11.0],
    long: { c1: [12.4, 2.7], c2: [15.8, 5.0], E: [17.5, 10.5], Tb: [18.4, 23.2], end: 7.6, cuff: 2.75, inset: 0.45 },
  }), 5.4);

  const HOOD_SPEC = {
    n: 5.4, dF: 2.6, dB: 1.0, W: 10.5, hemY: 27.8, hemRib: 2.75, hood: true,
    shoulder: [10.2, 2.2], underarm: [10.4, 11.0],
    long: { c1: [12.4, 2.7], c2: [15.8, 5.0], E: [17.5, 10.5], Tb: [18.4, 23.2], end: 7.6, cuff: 2.75, inset: 0.45 },
  };
  // Full-zip hoodie: same body and hood, a center front zip from the hood's V to the hem.
  const ZIP = addHood(build(HOOD_SPEC), 5.4);
  ZIP.zipFront = true;
  ZIP.extras = { front: { zips: [{ x: 0, y0: 6.4, y1: HOOD_SPEC.hemY + 0.1 }] } };

  // Bomber: tall rib stand collar, center zip, slanted welt pockets, rib cuffs and hem.
  const JACKET = build({
    n: 3.8, rib: 1.35, dF: 3.2, dB: 0.9, W: 10.8, hemY: 26.6, hemRib: 2.8,
    shoulder: [10.5, 2.2], underarm: [10.6, 11.2],
    long: { c1: [12.6, 2.75], c2: [16.5, 5.1], E: [18.2, 10.6], Tb: [19.0, 23.0], end: 7.9, cuff: 2.8, inset: 0.45 },
  });
  JACKET.zipFront = true;
  {
    const welt = [[6.15, 14.9], [6.8, 14.7], [9.1, 19.9], [8.45, 20.1]];
    const wd = (k) => path(welt[0].map((v, i) => (i ? v : v * k)), welt.slice(1).map((q) => ['L', [q[0] * k, q[1]]]), true);
    const hb = 26.6 - 2.8 + 0.36;
    JACKET.extras = {
      front: {
        fills: [{ d: wd(1), tone: 'fill' }, { d: wd(-1), tone: 'fill' }],
        seams: [wd(1), wd(-1)],
        stitches: both([0.62, 3.2 + 1.45], [['L', [0.62, hb - 0.1]]]),
        zips: [{ x: 0, y0: 3.25, y1: 26.7 }],
      },
      back: { stitches: [path([-9.5, 2.6], [['Q', [0, 3.6], [9.5, 2.6]]])] },
    };
  }

  // Bottoms: origin = top of the waistband on the center line; y runs down to the hem.
  function buildBottoms(sp) {
    const { wa, wb, hipX, hipY, rise, L, outHem, inHem, cuff = 0, slope = 0, hipOut = 0 } = sp;
    const hx = hipX + hipOut; // outline hip (pockets keep using hipX)
    const g = { kind: 'bottom', seams: [], stitches: [], ribs: [], folds: [], spec: { ...sp, W: hipX, hemY: L }, sleeves: [], armpits: [], shoulderTop: [] };
    const right = [
      ['L', [wa, 0]], ['L', [wa, wb]],
      ['C', [wa + 0.4, wb + 3.0], [hx - 0.1, hipY - 3.2], [hx, hipY]],
    ];
    let iTop, yI;
    if (cuff) {
      const yTop = L - cuff - 0.15, oTop = outHem + 0.55;
      iTop = inHem - 0.55; yI = yTop;
      right.push(['C', [hx + 0.1, hipY + 8], [oTop + 0.5, yTop - 10], [oTop, yTop]],
        ['L', [outHem, L - cuff]], ['L', [outHem - 0.05, L]], ['L', [inHem + 0.05, L]], ['L', [inHem, L - cuff]], ['L', [iTop, yTop]]);
      const cuffR = path([inHem, L - cuff], [['L', [outHem, L - cuff]], ['L', [outHem - 0.05, L]], ['L', [inHem + 0.05, L]]], true);
      const cuffL = path([-inHem, L - cuff], [['L', [-outHem, L - cuff]], ['L', [-outHem + 0.05, L]], ['L', [-inHem - 0.05, L]]], true);
      g.ribs.push({ d: cuffR, rot: 0 }, { d: cuffL, rot: 0 });
      g.seams.push(...both([inHem, L - cuff], [['L', [outHem, L - cuff]]]));
      g.hemTop = L - cuff;
      // fabric blousing over the cuffs
      g.folds.push(...both([inHem + 0.6, L - cuff - 1.6], [['Q', [(inHem + outHem) / 2, L - cuff - 0.4], [outHem - 0.4, L - cuff - 1.9]]]));
    } else {
      const yOut = L - slope;
      right.push(['C', [hx + 0.1, hipY + 4], [outHem + 0.15, yOut - 4], [outHem, yOut]], ['L', [inHem, L]]);
      iTop = inHem; yI = L;
      if (!sp.plainHem) g.stitches.push(...both([outHem - 0.1, yOut - 0.9], [['L', [inHem + 0.1, L - 0.9]]]));
      g.hemTop = L;
    }
    right.push(['C', [iTop - 0.2, yI - (yI - rise) * 0.6], [0.5, rise + 1.4], [0, rise]]);
    const outline = path([0, 0], [...right, ...mirrorSegs(reverse([0, 0], right))], true);
    g.front = g.back = outline;

    // waistband: elastic channels + gathered rib, seam where it joins the body
    const band = path([-wa, 0], [['L', [wa, 0]], ['L', [wa, wb]], ['L', [-wa, wb]]], true);
    g.ribs.push({ d: band, rot: 0 });
    g.seams.push(path([-wa, wb], [['L', [wa, wb]]]));
    g.stitches.push(path([-wa + 0.1, wb / 3], [['L', [wa - 0.1, wb / 3]]]), path([-wa + 0.1, (wb * 2) / 3], [['L', [wa - 0.1, (wb * 2) / 3]]]));
    // crotch drag lines + a knee break
    g.folds.push(...both([0.5, rise + 0.5], [['Q', [2.2, rise - 1.2], [4.2, rise - 2.6]]]));
    if (L - rise > 14) {
      const k = rise + (L - rise) * 0.45;
      g.folds.push(path([2.6, k], [['Q', [4.6, k + 0.9], [7.4, k - 0.2]]]), path([-7, k + 0.6], [['Q', [-5, k + 1.3], [-3, k + 0.4]]]));
    }

    const cb = path([0, wb], [['L', [0, rise - 0.15]]]);
    // slanted side-pocket opening, kept well inside the side seam
    const pocket = both([wa - 2.0, wb], [['Q', [wa - 0.5, wb + 4.5], [hipX - 0.02, hipY + 1.7]]]);
    const pStitch = both([wa - 2.4, wb], [['Q', [wa - 0.85, wb + 4.9], [hipX - 0.4, hipY + 2.0]]]);
    const py = wb + 2.4;
    const patch = path([3.3, py], [['L', [8.3, py]], ['L', [8.1, py + 5.4]], ['Q', [5.8, py + 6.1], [3.5, py + 5.4]]], true);
    const patchSt = path([3.65, py + 0.35], [['L', [7.95, py + 0.35]], ['L', [7.78, py + 5.05]], ['Q', [5.8, py + 5.7], [3.82, py + 5.05]]], true);
    const ey = wb * 0.55;
    g.extras = {
      front: {
        seams: [cb, ...pocket],
        stitches: [...pStitch, path([0.35, wb + 0.2], [['L', [0.35, wb + 4.6]], ['Q', [0.35, wb + 5.6], [0, wb + 6.2]]])],
        eyelets: [[-0.8, ey], [0.8, ey]],
        strings: [
          { d: `M -0.8 ${ey} Q -1.3 ${wb + 2.3} -1.05 ${wb + 4.4}`, aglet: [-1.05, wb + 4.4] },
          { d: `M 0.8 ${ey} Q 1.45 ${wb + 2.1} 1.6 ${wb + 4}`, aglet: [1.6, wb + 4] },
        ],
      },
      back: { seams: [cb, patch], stitches: [patchSt] },
    };
    const maxX = Math.max(hx, outHem) + 1.2;
    g.bbox = { x: -maxX, y: -1.2, w: maxX * 2, h: L + 2.4 };
    return g;
  }

  const PANTS = buildBottoms({ wa: 9.6, wb: 1.9, hipX: 10.2, hipY: 8.8, rise: 13, L: 42.5, outHem: 10.8, inHem: 1.2, slope: 0.4, plainHem: true, hipOut: 1.0 });
  const SHORTS = buildBottoms({ wa: 9.6, wb: 1.9, hipX: 10.2, hipY: 8.8, rise: 12.6, L: 20.6, outHem: 10.2, inHem: 1.2, slope: 0.4, hipOut: 1.0 });

  const SHAPES = { tee: TEE, longtee: LONGTEE, hoodie: HOODIE, crew: CREW, ziphoodie: ZIP, jacket: JACKET, shorts: SHORTS, pants: PANTS };

  // Print areas that follow the garment itself: a band along the hem, and the whole flat
  // (all-over prints are sublimation or cut-and-sew, printed before the garment is sewn).
  Object.entries(SHAPES).forEach(([type, g]) => {
    const r1 = (v) => Math.round(v * 10) / 10;
    const W = g.spec.W, hb = g.hemTop;
    for (const side of ['front', 'back']) {
      const list = DZ.PRINT_PRESETS[type][side];
      if (g.kind !== 'bottom' && !(side === 'front' && (g.kind === 'hood' || g.zipFront))) {
        list.push({ id: 'hem', name: 'Hem band', w: r1(W * 2 - 1.5), h: 5, top: r1(hb - 5.6), x: 0 });
      }
      list.push({ id: 'allover', name: 'All-over (sublimation)', w: r1(g.bbox.w), h: r1(g.bbox.h), top: r1(g.bbox.y), x: 0, allover: true });
    }
  });

  // ---------- rendering ----------
  function ribPattern(id, color, rot) {
    return (
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="0.15" height="1" patternTransform="rotate(${f(rot)})">` +
      `<rect x="0" y="0" width="0.055" height="1" fill="${color}"/></pattern>`
    );
  }

  function tone(hex) {
    const dark = DZ.isDark(hex);
    return {
      dark,
      fill: hex,
      hood: DZ.shade(hex, -0.06),
      inside: DZ.shade(hex, dark ? -0.42 : -0.3),
      collarBack: DZ.shade(hex, dark ? -0.12 : -0.07),
      edge: dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.22)',
      seam: dark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.15)',
      stitch: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.24)',
      rib: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.075)',
      string: dark ? DZ.shade(hex, 0.16) : DZ.shade(hex, -0.1),
    };
  }

  const p = (d, attrs) => `<path d="${d}" ${attrs}/>`;
  const EDGE_W = 0.05;

  // Per-garment extra details (zips, pockets, drawcords) drawn on top of the body.
  function extrasPhoto(g, side, t, id, a) {
    const ex = (g.extras && g.extras[side]) || {};
    let out = '';
    (ex.fills || []).forEach((f) => (out += p(f.d, `fill="${t[f.tone] || t.fill}" ${a.edge}`)));
    (ex.seams || []).forEach((d) => (out += p(d, a.seam)));
    (ex.stitches || []).forEach((d) => (out += p(d, a.stitch)));
    (ex.zips || []).forEach((z) => {
      const tape = DZ.shade(t.fill, t.dark ? 0.06 : -0.1);
      out += `<rect x="${z.x - 0.24}" y="${z.y0}" width="0.48" height="${z.y1 - z.y0}" fill="${tape}" ${a.edge}/>`;
      out += `<path d="M ${z.x} ${z.y0 + 0.1} L ${z.x} ${z.y1 - 0.1}" stroke="${t.dark ? '#77736B' : '#A39D90'}" stroke-width="0.26" stroke-dasharray="0.07 0.07"/>`;
      out += `<rect x="${z.x - 0.13}" y="${z.y0 + 0.15}" width="0.26" height="1.15" rx="0.1" fill="#B7AE9C" stroke="rgba(0,0,0,0.3)" stroke-width="0.03"/>`;
    });
    (ex.eyelets || []).forEach(([x, y]) => {
      out += `<circle cx="${x}" cy="${y}" r="0.22" fill="${DZ.shade(t.string, -0.35)}" stroke="#B9B2A4" stroke-width="0.07"/>`;
    });
    (ex.strings || []).forEach((s) => {
      out += p(s.d, `fill="none" stroke="${t.string}" stroke-width="0.3" stroke-linecap="round"`);
      out += `<rect x="${s.aglet[0] - 0.16}" y="${s.aglet[1] - 0.1}" width="0.32" height="1" rx="0.12" fill="#B7AE9C" stroke="rgba(0,0,0,0.25)" stroke-width="0.03"/>`;
    });
    return { defs: '', body: out };
  }

  function extrasSketchLines(g, side, t, L) {
    const ex = (g.extras && g.extras[side]) || {};
    let out = '';
    (ex.fills || []).forEach((f) => (out += p(f.d, L(SK.seam))));
    (ex.seams || []).forEach((d) => (out += p(d, L(SK.seam))));
    (ex.stitches || []).forEach((d) => (out += p(d, L(SK.stitch))));
    (ex.zips || []).forEach((z) => {
      out += `<rect x="${z.x - 0.24}" y="${z.y0}" width="0.48" height="${z.y1 - z.y0}" fill="${t.fill}" stroke="${t.line}" stroke-width="${SK.seam}"/>`;
      out += `<path d="M ${z.x} ${z.y0 + 0.1} L ${z.x} ${z.y1 - 0.1}" stroke="${t.line}" stroke-width="0.24" stroke-dasharray="0.05 0.08"/>`;
      out += `<rect x="${z.x - 0.13}" y="${z.y0 + 0.15}" width="0.26" height="1.15" rx="0.1" fill="${t.fill}" stroke="${t.line}" stroke-width="${SK.stitch}"/>`;
    });
    (ex.strings || []).forEach((s) => {
      out += p(s.d, L(0.32));
      out += p(s.d, `fill="none" stroke="${t.fill}" stroke-width="${0.32 - SK.stitch * 2}" stroke-linecap="round"`);
      out += `<rect x="${s.aglet[0] - 0.16}" y="${s.aglet[1] - 0.1}" width="0.32" height="0.9" rx="0.12" fill="${t.fill}" stroke="${t.line}" stroke-width="${SK.stitch}"/>`;
    });
    (ex.eyelets || []).forEach(([x, y]) => (out += `<circle cx="${x}" cy="${y}" r="0.22" fill="${t.fill}" stroke="${t.line}" stroke-width="${SK.stitch}"/>`));
    return out;
  }

  function outlineParts(type, side) {
    const g = SHAPES[type];
    const parts = [side === 'front' ? g.front : g.back];
    if (g.kind === 'top') {
      if (side === 'front') parts.push(g.frontRib, g.inside, g.backRibTop);
      else parts.push(g.backRib);
    }
    if (g.kind === 'hood' && side === 'front') parts.push(g.hoodBehind);
    if (g.kind === 'hood' && side === 'back') parts.push(g.hoodBack);
    return parts.filter(Boolean);
  }

  function base(type, side, hex, uidPrefix) {
    const g = SHAPES[type];
    const t = tone(hex);
    const id = (s) => `${uidPrefix}-${s}`;
    const edge = `stroke="${t.edge}" stroke-width="${EDGE_W}" stroke-linejoin="round"`;
    const seam = `fill="none" stroke="${t.seam}" stroke-width="0.045" stroke-linecap="round"`;
    const stitch = `fill="none" stroke="${t.stitch}" stroke-width="0.032" stroke-dasharray="0.14 0.1" stroke-linecap="round"`;
    let defs = '';
    let out = '';
    const isHood = g.kind === 'hood';
    const front = side === 'front';

    if (isHood && front) {
      out += p(g.hoodBehind, `fill="${t.hood}" ${edge}`);
      out += p(g.hoodSeam, seam);
    }
    out += p(front ? g.front : g.back, `fill="${t.fill}" ${edge}`);

    g.ribs.forEach((r, i) => {
      defs += ribPattern(id('rib' + i), t.rib, r.rot);
      out += p(r.d, `fill="url(#${id('rib' + i)})" stroke="none"`);
    });
    g.seams.forEach((d) => (out += p(d, seam)));
    g.stitches.forEach((d) => (out += p(d, stitch)));

    if (isHood) {
      if (front) {
        out += p(g.hoodOpening, `fill="${t.inside}" stroke="none"`);
        for (const rim of [g.hoodRimRight, g.hoodRimLeft]) {
          out += p(rim, `fill="none" stroke="${t.hood}" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"`);
          out += p(rim, `fill="none" stroke="${t.stitch}" stroke-width="0.032" stroke-dasharray="0.14 0.1"`);
        }
        out += p(g.hoodRimLeft, `fill="none" stroke="${t.edge}" stroke-width="${EDGE_W}" transform="translate(-0.5 0)"`);
        out += p(g.pocket, `fill="${t.fill}" ${edge}`);
        g.pocketOpenings.forEach((d) => (out += p(d, `fill="none" stroke="${t.seam}" stroke-width="0.1"`)));
        out += p(g.pocketStitch, stitch);
        g.pocketOpenings.forEach((d, i) => (out += p(d, `${stitch} transform="translate(${i ? 0.32 : -0.32} 0)"`)));
        g.eyelets.forEach(([x, y]) => {
          out += `<circle cx="${x}" cy="${y}" r="0.24" fill="${DZ.shade(t.string, -0.35)}" stroke="#B9B2A4" stroke-width="0.07"/>`;
        });
        g.strings.forEach((s) => {
          out += p(s.d, `fill="none" stroke="${t.string}" stroke-width="0.3" stroke-linecap="round"`);
          out += `<rect x="${s.aglet[0] - 0.16}" y="${s.aglet[1] - 0.1}" width="0.32" height="1" rx="0.12" fill="#B7AE9C" stroke="rgba(0,0,0,0.25)" stroke-width="0.03"/>`;
        });
      } else {
        out += p(g.hoodBack, `fill="${t.hood}" ${edge}`);
        out += p(g.hoodBackSeam, seam);
        out += p(g.hoodBackSeam, `${stitch} transform="translate(0.28 0)"`);
      }
    } else if (g.kind === 'top' && front) {
      out += p(g.inside, `fill="${t.inside}" stroke="none"`);
      out += p(g.backRibTop, `fill="${t.collarBack}" ${edge}`);
      defs += ribPattern(id('bcollar'), t.rib, 0);
      out += p(g.backRibTop, `fill="url(#${id('bcollar')})" stroke="none"`);
      if (g.vee) {
        defs += ribPattern(id('vee'), t.rib, 0);
        out += p(g.vee, `fill="${t.fill}" ${edge}`);
        out += p(g.vee, `fill="url(#${id('vee')})" stroke="none"`);
      }
      out += p(g.frontRib, `fill="${t.fill}" ${edge}`);
      defs += ribPattern(id('collar'), t.rib, 0);
      out += p(g.frontRib, `fill="url(#${id('collar')})" stroke="none"`);
      out += p(g.frontStitch, stitch);
    } else if (g.kind === 'top') {
      out += p(g.backRib, `fill="${t.fill}" ${edge}`);
      defs += ribPattern(id('collar'), t.rib, 0);
      out += p(g.backRib, `fill="url(#${id('collar')})" stroke="none"`);
      out += p(g.backStitch, stitch);
    }

    const ex = extrasPhoto(g, side, t, id, { edge, seam, stitch });
    return { defs: defs + ex.defs, body: out + ex.body };
  }

  function clipDef(type, side, clipId) {
    return `<clipPath id="${clipId}">${outlineParts(type, side).map((d) => `<path d="${d}"/>`).join('')}</clipPath>`;
  }

  function shadow(type, side, hex, uidPrefix) {
    const g = SHAPES[type];
    const t = tone(hex);
    const clipId = `${uidPrefix}-clip`;
    const blur = `${uidPrefix}-blur`;
    const bb = g.bbox;
    const W = g.spec.W;
    const a = t.dark ? 0.55 : 0.32;
    let defs = clipDef(type, side, clipId);
    defs +=
      `<filter id="${blur}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.42"/></filter>` +
      `<filter id="${blur}-w" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>` +
      // cotton jersey: faint heather mottling so the fabric doesn't read as flat vector fill
      `<filter id="${uidPrefix}-knit" x="0" y="0" width="1" height="1">` +
      `<feTurbulence type="fractalNoise" baseFrequency="2.6" numOctaves="2" seed="7"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${t.dark ? 0.32 : 0.2} 0 0 0 ${t.dark ? -0.1 : -0.065}"/></filter>` +
      `<linearGradient id="${uidPrefix}-sides" x1="0" x2="1" y1="0" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity="${a * 0.55}"/>` +
      `<stop offset="0.2" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="0.8" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="${a * 0.55}"/></linearGradient>` +
      `<linearGradient id="${uidPrefix}-hem" x1="0" x2="0" y1="0" y2="1">` +
      `<stop offset="0.84" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="${a * 0.32}"/></linearGradient>`;

    let out = `<g clip-path="url(#${clipId})">`;
    out += `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" filter="url(#${uidPrefix}-knit)"/>`;
    out += `<rect x="${-W - 0.6}" y="${bb.y}" width="${W * 2 + 1.2}" height="${bb.h + 2}" fill="url(#${uidPrefix}-sides)"/>`;
    out += `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="url(#${uidPrefix}-hem)"/>`;
    g.sleeves.forEach((d) => (out += p(d, `fill="#000" fill-opacity="${a * 0.1}"`)));
    // the sleeve sits a hair lower than the body along the dropped armhole seam
    if (g.kind !== 'bottom') g.seams.slice(-2).forEach((d, i) => {
      out += p(d, `fill="none" stroke="#000" stroke-opacity="${a * 0.45}" stroke-width="0.5" transform="translate(${i ? -0.25 : 0.25} 0)" filter="url(#${blur})"`);
    });
    g.armpits.forEach(([x, y]) => {
      out += `<ellipse cx="${x}" cy="${y}" rx="1.5" ry="1.15" fill="#000" fill-opacity="${a * 0.55}" filter="url(#${blur}-w)"/>`;
    });
    g.folds.forEach((d) => {
      out += p(d, `fill="none" stroke="#000" stroke-opacity="${a * 0.42}" stroke-width="0.62" stroke-linecap="round" filter="url(#${blur})"`);
    });
    if (g.hemTop < g.spec.hemY) {
      out += `<path d="M ${-W} ${g.hemTop + 0.45} L ${W} ${g.hemTop + 0.45}" stroke="#000" stroke-opacity="${a * 0.45}" stroke-width="0.45" filter="url(#${blur})"/>`;
    }
    if (g.kind === 'top') {
      if (side === 'front') out += p(g.frontStitch, `fill="none" stroke="#000" stroke-opacity="${a * 0.5}" stroke-width="0.5" transform="translate(0 0.35)" filter="url(#${blur})"`);
      else out += p(g.backStitch, `fill="none" stroke="#000" stroke-opacity="${a * 0.4}" stroke-width="0.45" transform="translate(0 0.3)" filter="url(#${blur})"`);
    } else if (g.kind === 'hood' && side === 'front') {
      out += p(g.hoodOpening, `fill="none" stroke="#000" stroke-opacity="${a * 0.6}" stroke-width="1.1" filter="url(#${blur})"`);
      out += `<path d="M -5.6 4.2 Q 0 8.6 5.6 4.2" fill="none" stroke="#000" stroke-opacity="${a * 0.4}" stroke-width="0.7" filter="url(#${blur})"/>`;
      out += `<path d="${g.pocket}" fill="none" stroke="#000" stroke-opacity="${a * 0.3}" stroke-width="0.4" transform="translate(0 0.25)" filter="url(#${blur})"/>`;
    } else if (g.kind === 'hood') {
      out += `<path d="M -6.4 11.2 Q 0 13.9 6.4 11.2" fill="none" stroke="#000" stroke-opacity="${a * 0.6}" stroke-width="0.9" filter="url(#${blur})"/>`;
    }
    out += '</g>';
    return { defs, body: out };
  }

  function light(type, side, hex, uidPrefix) {
    const g = SHAPES[type];
    const t = tone(hex);
    const clipId = `${uidPrefix}-lclip`;
    const a = t.dark ? 0.14 : 0.22;
    let defs = clipDef(type, side, clipId);
    defs +=
      `<radialGradient id="${uidPrefix}-chest" cx="0.5" cy="0.5" r="0.5">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="${a}"/>` +
      `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      `<filter id="${uidPrefix}-lblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.6"/></filter>`;
    const blurAttr = `fill="none" stroke-linecap="round" filter="url(#${uidPrefix}-lblur)"`;
    let out = `<g clip-path="url(#${clipId})">`;
    out += `<ellipse cx="-1.5" cy="9.5" rx="10" ry="9" fill="url(#${uidPrefix}-chest)"/>`;
    out += `<ellipse cx="2" cy="${g.hemTop - 6}" rx="8" ry="5" fill="url(#${uidPrefix}-chest)" opacity="0.6"/>`;
    // light catching the top of each sleeve where it rolls over the shoulder
    g.shoulderTop.forEach((d, i) => {
      out += `<path d="${d}" transform="translate(${i ? 0.35 : -0.35} 0.55)" stroke="#fff" stroke-opacity="${a * 0.8}" stroke-width="0.7" ${blurAttr}/>`;
    });
    g.folds.forEach((d) => {
      out += `<path d="${d}" transform="translate(-0.6 -0.35)" stroke="#fff" stroke-opacity="${a * 0.55}" stroke-width="0.4" ${blurAttr}/>`;
    });
    out += '</g>';
    return { defs, body: out };
  }

  // ---------- technical-flat style ----------
  // Fashion "flat sketch" look: solid fabric fill, one crisp outline, every seam and
  // topstitch as a thin solid line, rib knit as fine parallel lines. No shading.
  function sketchTone(hex) {
    const dark = DZ.isDark(hex);
    return {
      fill: hex,
      hood: DZ.shade(hex, dark ? 0.05 : -0.04),
      inside: dark ? DZ.shade(hex, -0.5) : '#2B2B2B',
      collarBack: DZ.shade(hex, dark ? 0.08 : -0.1),
      line: dark ? 'rgba(255,255,255,0.62)' : '#3A3A3A',
      rib: dark ? 'rgba(255,255,255,0.32)' : 'rgba(40,40,40,0.42)',
    };
  }
  const SK = { out: 0.085, seam: 0.05, stitch: 0.032 };

  // Line art only (no fills) — reused on top of the print so lines read over artwork.
  function sketchLines(type, side, hex) {
    const g = SHAPES[type];
    const t = sketchTone(hex);
    const front = side === 'front', isHood = g.kind === 'hood';
    const L = (w) => `fill="none" stroke="${t.line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
    let out = '';
    if (isHood && front) out += p(g.hoodBehind, L(SK.out)) + p(g.hoodSeam, L(SK.seam));
    out += p(front ? g.front : g.back, L(SK.out));
    g.ribs.forEach((r) => (out += p(r.d, L(SK.seam))));
    g.seams.forEach((d) => (out += p(d, L(SK.seam))));
    g.stitches.forEach((d) => (out += p(d, L(SK.stitch))));
    if (isHood) {
      if (front) {
        for (const rim of [g.hoodRimRight, g.hoodRimLeft]) {
          out += p(rim, `fill="none" stroke="${t.line}" stroke-width="${1.05 + SK.seam * 2}" stroke-linejoin="round" stroke-linecap="round"`);
          out += p(rim, `fill="none" stroke="${t.hood}" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"`);
          out += p(rim, L(SK.stitch));
        }
        out += p(g.pocket, L(SK.seam));
        g.pocketOpenings.forEach((d, i) => (out += p(d, `${L(SK.stitch)} transform="translate(${i ? 0.32 : -0.32} 0)"`)));
        out += p(g.pocketStitch, L(SK.stitch));
        g.strings.forEach((s) => {
          out += p(s.d, L(0.32));
          out += p(s.d, `fill="none" stroke="${t.fill}" stroke-width="${0.32 - SK.stitch * 2}" stroke-linecap="round"`);
          out += `<rect x="${s.aglet[0] - 0.16}" y="${s.aglet[1] - 0.1}" width="0.32" height="0.9" rx="0.12" fill="${t.fill}" stroke="${t.line}" stroke-width="${SK.stitch}"/>`;
        });
        g.eyelets.forEach(([x, y]) => (out += `<circle cx="${x}" cy="${y}" r="0.22" fill="${t.fill}" stroke="${t.line}" stroke-width="${SK.stitch}"/>`));
      } else {
        out += p(g.hoodBack, L(SK.out)) + p(g.hoodBackSeam, L(SK.seam));
        out += p(g.hoodBackSeam, `${L(SK.stitch)} transform="translate(0.28 0)"`);
      }
    } else if (g.kind === 'top' && front) {
      if (g.vee) out += p(g.vee, L(SK.seam));
      out += p(g.frontRib, L(SK.seam)) + p(g.frontStitch, L(SK.stitch));
      out += p(g.inside, L(SK.seam)) + p(g.backRibTop, L(SK.seam));
    } else if (g.kind === 'top') {
      out += p(g.backRib, L(SK.seam)) + p(g.backStitch, L(SK.stitch));
    }
    return out + extrasSketchLines(g, side, t, L);
  }

  function sketchBase(type, side, hex, uidPrefix) {
    const g = SHAPES[type];
    const t = sketchTone(hex);
    const id = (s) => `${uidPrefix}-${s}`;
    const front = side === 'front', isHood = g.kind === 'hood';
    let defs = '', out = '';
    const ribFill = (d, rot, key) => {
      defs += ribPattern(id(key), t.rib, rot);
      out += p(d, `fill="url(#${id(key)})" stroke="none"`);
    };
    if (isHood && front) out += p(g.hoodBehind, `fill="${t.hood}"`);
    out += p(front ? g.front : g.back, `fill="${t.fill}"`);
    g.ribs.forEach((r, i) => ribFill(r.d, r.rot, 'rib' + i));
    if (isHood) {
      if (front) {
        out += p(g.hoodOpening, `fill="${t.inside}"`);
        out += p(g.pocket, `fill="${t.fill}"`);
      } else out += p(g.hoodBack, `fill="${t.hood}"`);
    } else if (g.kind === 'top' && front) {
      out += p(g.inside, `fill="${t.inside}"`);
      out += p(g.backRibTop, `fill="${t.collarBack}"`);
      ribFill(g.backRibTop, 0, 'bcollar');
      if (g.vee) { out += p(g.vee, `fill="${t.fill}"`); ribFill(g.vee, 0, 'vee'); }
      out += p(g.frontRib, `fill="${t.fill}"`);
      ribFill(g.frontRib, 0, 'collar');
    } else if (g.kind === 'top') {
      out += p(g.backRib, `fill="${t.fill}"`);
      ribFill(g.backRib, 0, 'collar');
    }
    const ex = (g.extras && g.extras[side]) || {};
    (ex.fills || []).forEach((f) => (out += p(f.d, `fill="${t[f.tone] || t.fill}"`)));
    return { defs, body: out + sketchLines(type, side, hex) };
  }

  // Returns inner SVG markup (world units) for each layer plus the world-space bbox.
  DZ.garment = {
    // Silhouette paths (inches) — used to clip all-over designs to the garment.
    outline: (type, side) => outlineParts(type, side),
    bboxWorld(type) {
      const b = SHAPES[type].bbox;
      return { x: b.x * S, y: b.y * S, w: b.w * S, h: b.h * S };
    },
    // style: 'photo' (shaded flat-lay) or 'sketch' (technical flat). In sketch mode the
    // shadow layer carries the line art again so seams stay visible over the print.
    layers(type, side, hex, prefix = 'g', style = 'photo') {
      const wrap = (layer) => `<defs>${layer.defs}</defs><g transform="scale(${S})">${layer.body}</g>`;
      if (style === 'sketch') {
        return {
          base: wrap(sketchBase(type, side, hex, prefix + 'b')),
          shadow: wrap({ defs: '', body: sketchLines(type, side, hex) }),
          light: wrap({ defs: '', body: '' }),
        };
      }
      return {
        base: wrap(base(type, side, hex, prefix + 'b')),
        shadow: wrap(shadow(type, side, hex, prefix + 's')),
        light: wrap(light(type, side, hex, prefix + 'l')),
      };
    },
    // Standalone SVG document (used to rasterize a layer for mockup export).
    svgDocument(inner, bbox, pxW, pxH) {
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" ` +
        `viewBox="${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}">${inner}</svg>`
      );
    },
  };
})();
