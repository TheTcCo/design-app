// Merge, rasterize, and distort/warp.
// - Merge: flattens the selected objects into one 300 DPI image (like "Merge layers").
// - Distort (corners): drag the 4 corners for perspective — lay a patch onto a pocket or a
//   sleeve at an angle.
// - Warp (mesh): a 4×4 grid of points bends the image freely; Arc presets curve it along a
//   hem or a chest line.
// Non-destructive: the untouched source stays in the asset table (warpSrc) with the point
// grid (warp), so the image can be re-warped or reset at any time.
(function () {
  const E = DZ.editor;
  const MAX_PX = 25e6;

  // ---------- rasterize / merge ----------
  async function rasterize(objs, maxPx = 40e6) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    objs.forEach((o) => {
      o.setCoords();
      const bb = o.getBoundingRect();
      l = Math.min(l, bb.left); t = Math.min(t, bb.top);
      r = Math.max(r, bb.left + bb.width); b = Math.max(b, bb.top + bb.height);
    });
    l = Math.floor(l); t = Math.floor(t);
    const w = Math.ceil(r - l), h = Math.ceil(b - t);
    const f = Math.min(1, Math.sqrt(maxPx / Math.max(1, w * h)));
    const sc = new fabric.StaticCanvas(undefined, { width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)), enableRetinaScaling: false, renderOnAddRemove: false });
    sc.setViewportTransform([f, 0, 0, f, -l * f, -t * f]);
    const live = await E.enliven(objs.map((o) => o.toObject(DZ.SERIAL_PROPS)));
    live.forEach((o) => sc.add(o));
    E.reapplyArcs(live);
    sc.renderAll();
    const url = sc.toDataURL({ format: 'png' });
    sc.dispose();
    const img = await fabric.FabricImage.fromURL(url);
    img.set({ left: l, top: t, originX: 'left', originY: 'top', scaleX: 1 / f, scaleY: 1 / f });
    return img;
  }

  // Replace `objs` with one image, placed where the top-most of them was.
  E.mergeToImage = async (objs, name) => {
    objs = objs.filter((o) => o.visible);
    if (!objs.length) return null;
    const cv = E.canvas;
    cv.discardActiveObject(); // bakes selection transforms into the objects
    const all = cv.getObjects();
    objs.sort((a, b) => all.indexOf(a) - all.indexOf(b));
    const img = await rasterize(objs);
    const top = objs[objs.length - 1];
    img.layer = top.layer;
    img.name = name || (objs.length > 1 ? `Merged (${objs.length})` : `${top.name || 'Object'} · image`);
    await E.batch(() => {
      const idx = cv.getObjects().indexOf(top);
      objs.forEach((o) => cv.remove(o));
      E.prepareObject(img);
      cv.insertAt(Math.max(0, idx - objs.length + 1), img);
      img.setCoords();
      cv.setActiveObject(img);
    });
    cv.requestRenderAll();
    return img;
  };

  // ---------- warp math ----------
  function homography(corners) {
    // unit square -> quad (tl, tr, br, bl)
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      g = (dx3 * dy2 - dx2 * dy3) / den;
      h = (dx1 * dy3 - dx3 * dy1) / den;
    }
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
    const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    return (u, v) => {
      const w = g * u + h * v + 1;
      return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
    };
  }

  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  // Smooth surface through a (cols+1)×(rows+1) control grid (Catmull-Rom both ways).
  function meshFn(warp) {
    const { cols, rows, pts } = warp;
    const P = (i, j) => pts[Math.max(0, Math.min(rows, j)) * (cols + 1) + Math.max(0, Math.min(cols, i))];
    const ext = (i, j, k) => {
      // extrapolate past the edges so the border stays straight-ish
      const ci = Math.max(0, Math.min(cols, i)), cj = Math.max(0, Math.min(rows, j));
      if (ci === i && cj === j) return P(i, j)[k];
      const a = P(ci, cj)[k];
      const bi = ci + (i < 0 ? 1 : i > cols ? -1 : 0), bj = cj + (j < 0 ? 1 : j > rows ? -1 : 0);
      return 2 * a - P(bi, bj)[k];
    };
    return (u, v) => {
      const fu = u * cols, fv = v * rows;
      const i = Math.min(cols - 1, Math.floor(fu)), j = Math.min(rows - 1, Math.floor(fv));
      const tu = fu - i, tv = fv - j;
      const out = [0, 0];
      for (let k = 0; k < 2; k++) {
        const row = [-1, 0, 1, 2].map((dj) => cr(ext(i - 1, j + dj, k), ext(i, j + dj, k), ext(i + 1, j + dj, k), ext(i + 2, j + dj, k), tu));
        out[k] = cr(row[0], row[1], row[2], row[3], tv);
      }
      return out;
    };
  }

  function mapFn(warp) {
    return warp.mode === 'perspective' ? homography(warp.pts) : meshFn(warp);
  }

  function affine(s, d) {
    const [s0, s1, s2] = s, [d0, d1, d2] = d;
    const den = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
    if (Math.abs(den) < 1e-9) return null;
    const a = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / den;
    const b = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / den;
    const c = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / den;
    const dd = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / den;
    const e = (d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
    const f = (d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
    return [a, b, c, dd, e, f];
  }

  // Draw `src` (w×h) warped by `warp` into a new canvas. Returns { canvas, box } in source px.
  function renderWarp(src, warp, { maxPx = MAX_PX, n = 28 } = {}) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const map = mapFn(warp);
    const grid = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const p = map(i / n, j / n);
        grid.push(p);
        minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
      }
    }
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const q = Math.min(1, Math.sqrt(maxPx / (bw * bh)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bw * q));
    c.height = Math.max(1, Math.round(bh * q));
    const ctx = c.getContext('2d');
    const G = (i, j) => grid[j * (n + 1) + i];
    const tri = (sa, da) => {
      // grow the destination triangle a hair so neighbouring triangles don't leave seams
      const cx = (da[0][0] + da[1][0] + da[2][0]) / 3, cy = (da[0][1] + da[1][1] + da[2][1]) / 3;
      const grow = da.map(([x, y]) => {
        const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
        return [x + (dx / l) * 0.6, y + (dy / l) * 0.6];
      });
      const m = affine(sa, da);
      if (!m) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(grow[0][0], grow[0][1]);
      ctx.lineTo(grow[1][0], grow[1][1]);
      ctx.lineTo(grow[2][0], grow[2][1]);
      ctx.closePath();
      ctx.clip();
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.restore();
    };
    const D = (p) => [(p[0] - minX) * q, (p[1] - minY) * q];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const s00 = [(i / n) * w, (j / n) * h], s10 = [((i + 1) / n) * w, (j / n) * h];
        const s01 = [(i / n) * w, ((j + 1) / n) * h], s11 = [((i + 1) / n) * w, ((j + 1) / n) * h];
        const d00 = D(G(i, j)), d10 = D(G(i + 1, j)), d01 = D(G(i, j + 1)), d11 = D(G(i + 1, j + 1));
        tri([s00, s10, s11], [d00, d10, d11]);
        tri([s00, s11, s01], [d00, d11, d01]);
      }
    }
    return { canvas: c, box: [minX, minY, maxX, maxY] };
  }

  // ---------- warp state on an image ----------
  const srcCache = new Map(); // warpSrc ref -> HTMLImageElement
  function loadSrc(ref) {
    const url = E.assetURL(ref);
    if (srcCache.has(url)) return Promise.resolve(srcCache.get(url));
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => {
        srcCache.set(url, i);
        res(i);
      };
      i.onerror = () => rej(new Error('Could not load the original image'));
      i.src = url;
    });
  }

  function identity(mode, w, h) {
    if (mode === 'perspective') return { mode, cols: 1, rows: 1, pts: [[0, 0], [w, 0], [w, h], [0, h]] };
    const cols = 3, rows = 3, pts = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) pts.push([(i / cols) * w, (j / rows) * h]);
    return { mode: 'mesh', cols, rows, pts };
  }

  const boxCenter = (img) => {
    const b = img.warpBox;
    return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
  };

  // Re-render the image from its source with the current grid; keep it in place.
  async function bake(img, { preview = false } = {}) {
    const src = await loadSrc(img.warpSrc);
    const { canvas, box } = renderWarp(src, img.warp, preview ? { maxPx: 1.2e6, n: 14 } : {});
    const old = boxCenter(img);
    const M = img.calcTransformMatrix();
    const nc = { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 };
    const world = fabric.util.transformPoint(new fabric.Point(nc.x - old.x, nc.y - old.y), M);
    let el = canvas;
    if (!preview) {
      el = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = canvas.toDataURL('image/png');
      });
    }
    img.setElement(el);
    img.set({ width: box[2] - box[0], height: box[3] - box[1] });
    img.warpBox = box;
    img.setPositionByOrigin(world, 'center', 'center');
    if (img.filters && img.filters.length) img.applyFilters();
    img.set('dirty', true);
    img.setCoords();
    E.canvas.requestRenderAll();
  }

  // ---------- on-canvas handles ----------
  let editing = null; // { img, saved }
  const HANDLE = '#2F7BFF';

  function pointControls(img) {
    const ctrls = {};
    img.warp.pts.forEach((_, i) => {
      ctrls['w' + i] = new fabric.Control({
        actionName: 'warp',
        cursorStyle: 'crosshair',
        sizeX: 14,
        sizeY: 14,
        positionHandler: (dim, finalMatrix, obj) => {
          const p = obj.warp.pts[i], c = boxCenter(obj);
          return fabric.util.transformPoint(new fabric.Point(p[0] - c.x, p[1] - c.y), finalMatrix);
        },
        actionHandler: (eventData, transform, x, y) => {
          const obj = transform.target;
          const inv = fabric.util.invertTransform(obj.calcTransformMatrix());
          const lp = fabric.util.transformPoint(new fabric.Point(x, y), inv);
          const c = boxCenter(obj);
          obj.warp.pts[i] = [lp.x + c.x, lp.y + c.y];
          dirtyDrag = obj;
          requestPreview(obj);
          return true;
        },
        render: (ctx, left, top) => {
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = HANDLE;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(left, top, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        },
      });
    });
    return ctrls;
  }

  let dirtyDrag = null;
  let previewBusy = false, previewAgain = false;
  async function requestPreview(img) {
    if (previewBusy) {
      previewAgain = true;
      return;
    }
    previewBusy = true;
    try {
      await bake(img, { preview: true });
    } finally {
      previewBusy = false;
    }
    if (previewAgain) {
      previewAgain = false;
      requestPreview(img);
    }
  }

  // grid lines between the handles
  function drawGrid({ ctx }) {
    if (!editing || E.canvas.getActiveObject() !== editing.img) return;
    const img = editing.img, w = img.warp;
    const v = E.canvas.viewportTransform;
    const M = fabric.util.multiplyTransformMatrices(v, img.calcTransformMatrix());
    const c = boxCenter(img);
    const P = (k) => fabric.util.transformPoint(new fabric.Point(w.pts[k][0] - c.x, w.pts[k][1] - c.y), M);
    ctx.save();
    ctx.strokeStyle = 'rgba(47,123,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (w.mode === 'perspective') {
      [0, 1, 2, 3, 0].forEach((k, n) => { const p = P(k); n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    } else {
      for (let j = 0; j <= w.rows; j++) for (let i = 0; i <= w.cols; i++) {
        const k = j * (w.cols + 1) + i, p = P(k);
        if (i < w.cols) { const q = P(k + 1); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
        if (j < w.rows) { const q = P(k + w.cols + 1); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function exitEdit() {
    if (!editing) return;
    const { img, saved } = editing;
    img.controls = saved;
    img.hasBorders = true;
    img.setCoords();
    editing = null;
    E.canvas.requestRenderAll();
    E.emit('warp');
  }

  async function ensureImage(obj) {
    if (obj.isType('image') && !E.isTexture(obj)) return obj;
    const img = await E.mergeToImage([obj], `${obj.name || 'Object'} · image`);
    DZ.toast('Converted to a 300 DPI image so it can be distorted.');
    return img;
  }

  async function startWarp(obj, mode) {
    exitEdit();
    let img = await ensureImage(obj);
    if (!img) return;
    if (!img.warpSrc || !img.warp) {
      const el = img._originalElement || img.getElement();
      const url = el.src && el.src.startsWith('data:') ? el.src : (() => {
        const c = document.createElement('canvas');
        c.width = el.naturalWidth || el.width;
        c.height = el.naturalHeight || el.height;
        c.getContext('2d').drawImage(el, 0, 0);
        return c.toDataURL('image/png');
      })();
      img.warpSrc = 'asset:' + E.addAsset(url);
      const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
      // object units must equal source pixels
      if (img.width !== w || img.height !== h) {
        img.set({ scaleX: (img.scaleX * img.width) / w, scaleY: (img.scaleY * img.height) / h, width: w, height: h });
      }
      img.warp = identity(mode, w, h);
      img.warpBox = [0, 0, w, h];
    } else if (img.warp.mode !== mode) {
      // switch modes, keeping the current outer corners
      const src = await loadSrc(img.warpSrc);
      const w = src.naturalWidth, h = src.naturalHeight;
      const map = mapFn(img.warp);
      if (mode === 'perspective') img.warp = { mode, cols: 1, rows: 1, pts: [map(0, 0), map(1, 0), map(1, 1), map(0, 1)] };
      else {
        const g = identity('mesh', w, h);
        g.pts = g.pts.map((_, k) => map((k % 4) / 3, Math.floor(k / 4) / 3));
        img.warp = g;
      }
      await bake(img);
    }
    editing = { img, saved: img.controls };
    img.controls = pointControls(img);
    img.hasBorders = false;
    img.setCoords();
    E.canvas.setActiveObject(img);
    E.canvas.requestRenderAll();
    E.emit('warp');
    return img;
  }

  // Arc: bend the mesh like Illustrator's Arc envelope (positive = arch up, for chest
  // lines; negative = smile, to follow a hem).
  async function arc(img, amount) {
    if (!img.warp || img.warp.mode !== 'mesh') img = await startWarp(img, 'mesh');
    const src = await loadSrc(img.warpSrc);
    const w = src.naturalWidth, h = src.naturalHeight;
    const g = identity('mesh', w, h);
    const bend = (amount / 100) * h * 0.9;
    g.pts = g.pts.map(([x, y]) => {
      const u = x / w;
      return [x, y - bend * (1 - (2 * u - 1) ** 2)];
    });
    g.arc = amount;
    img.warp = g;
    if (editing && editing.img === img) img.controls = pointControls(img);
    img.setCoords();
    await bake(img);
    return img;
  }

  async function reset(img) {
    if (!img.warpSrc) return;
    const src = await loadSrc(img.warpSrc);
    img.warp = identity(img.warp.mode, src.naturalWidth, src.naturalHeight);
    if (editing && editing.img === img) img.controls = pointControls(img);
    img.setCoords();
    await bake(img);
  }

  DZ.warp = {
    editing: () => editing && editing.img,
    start: (obj, mode) => E.batch(() => startWarp(obj, mode)),
    arc: (obj, amount) => E.batch(() => arc(obj, amount)),
    reset: (obj) => E.batch(() => reset(obj)),
    done: exitEdit,
    // remove the warp entirely: back to the plain source image
    async flatten(img) {
      if (!img.warpSrc) return;
      exitEdit();
      img.warp = null;
      img.warpSrc = null;
      img.warpBox = null;
      E.record();
      E.emit('warp');
    },
    init() {
      const cv = E.canvas;
      cv.on('after:render', drawGrid);
      cv.on('mouse:up', async () => {
        if (!dirtyDrag) return;
        const img = dirtyDrag;
        dirtyDrag = null;
        while (previewBusy) await new Promise((r) => setTimeout(r, 16));
        await bake(img);
        E.record();
      });
      cv.on('selection:cleared', exitEdit);
      cv.on('selection:updated', () => editing && cv.getActiveObject() !== editing.img && exitEdit());
      E.on('tool', exitEdit);
      E.on('mode', exitEdit);
    },
  };
})();
