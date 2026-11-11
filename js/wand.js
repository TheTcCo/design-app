// Magic wand: select pixels of similar color in an image (no AI — a classic flood fill).
// Click a color in an image: contiguous mode grows from that pixel, global mode takes every
// pixel of that color. Shift adds, Option subtracts. Then delete, keep, fill, invert or copy
// the selection to a new layer. Clicking vector art instead selects every object in that ink.
(function () {
  const E = DZ.editor;
  E.state.wand = { tol: 30, contiguous: true };

  let sel = null; // { img, el, w, h, mask: Uint8Array, count, overlay }
  const pixelCache = new WeakMap(); // element -> ImageData

  const isRaster = (o) => o.isType('image') && !E.isTexture(o) && o.visible && !o.locked;

  function pixels(img) {
    const el = img._originalElement || img.getElement();
    let data = pixelCache.get(el);
    if (!data) {
      const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(el, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
      pixelCache.set(el, data);
    }
    return { el, data, w: data.width, h: data.height };
  }

  // world point -> image pixel
  function toPixel(img, p, w, h) {
    const inv = fabric.util.invertTransform(img.calcTransformMatrix());
    const q = fabric.util.transformPoint(p, inv);
    return { x: Math.floor((q.x + img.width / 2) * (w / img.width)), y: Math.floor((q.y + img.height / 2) * (h / img.height)) };
  }

  function computeMask(data, w, h, sx, sy, tol, contiguous) {
    const d = data.data;
    const t = tol * 2.55;
    const i0 = (sy * w + sx) * 4;
    const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
    const near = (i) => {
      const a = d[i + 3];
      if (a0 < 8 || a < 8) return Math.abs(a - a0) <= t; // transparent areas match each other
      return Math.abs(d[i] - r0) <= t && Math.abs(d[i + 1] - g0) <= t && Math.abs(d[i + 2] - b0) <= t && Math.abs(a - a0) <= t;
    };
    const mask = new Uint8Array(w * h);
    if (!contiguous) {
      for (let k = 0; k < w * h; k++) if (near(k * 4)) mask[k] = 1;
      return mask;
    }
    const stack = new Int32Array(w * h);
    let top = 0;
    stack[top++] = sy * w + sx;
    mask[sy * w + sx] = 1;
    while (top) {
      const k = stack[--top];
      const x = k % w, y = (k - x) / w;
      if (x > 0 && !mask[k - 1] && near((k - 1) * 4)) { mask[k - 1] = 1; stack[top++] = k - 1; }
      if (x < w - 1 && !mask[k + 1] && near((k + 1) * 4)) { mask[k + 1] = 1; stack[top++] = k + 1; }
      if (y > 0 && !mask[k - w] && near((k - w) * 4)) { mask[k - w] = 1; stack[top++] = k - w; }
      if (y < h - 1 && !mask[k + w] && near((k + w) * 4)) { mask[k + w] = 1; stack[top++] = k + w; }
    }
    return mask;
  }

  // Tinted fill + black/white dashed edge ("marching ants" without the animation).
  function buildOverlay() {
    const { w, h, mask } = sel;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const o = img.data;
    let count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!mask[k]) continue;
        count++;
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[k - 1] || !mask[k + 1] || !mask[k - w] || !mask[k + w];
        const i = k * 4;
        if (edge) {
          const on = ((x + y) >> 2) & 1;
          o[i] = o[i + 1] = o[i + 2] = on ? 255 : 0;
          o[i + 3] = 255;
        } else {
          o[i] = 47; o[i + 1] = 123; o[i + 2] = 255; o[i + 3] = 70;
        }
      }
    }
    g.putImageData(img, 0, 0);
    sel.overlay = c;
    sel.count = count;
  }

  function valid() {
    if (!sel) return false;
    const live = E.canvas.getObjects().includes(sel.img) && (sel.img._originalElement || sel.img.getElement()) === sel.el;
    if (!live) sel = null;
    return !!sel;
  }

  function drawOverlay({ ctx }) {
    if (!valid() || (E.state.tool !== 'wand' && E.state.tool !== 'lasso')) return;
    const img = sel.img;
    const v = E.canvas.viewportTransform;
    ctx.save();
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    const m = img.calcTransformMatrix();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sel.overlay, -img.width / 2, -img.height / 2, img.width, img.height);
    ctx.restore();
  }

  function topAt(p, test) {
    const objs = E.canvas.getObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.visible && !o.locked && test(o) && o.containsPoint(p)) return o;
    }
    return null;
  }

  function colorDist(a, b) {
    const pa = DZ.production.norm(a), pb = DZ.production.norm(b);
    if (!pa || !pb) return Infinity;
    const x = parseInt(pa.slice(1), 16), y = parseInt(pb.slice(1), 16);
    return Math.max(Math.abs((x >> 16) - (y >> 16)), Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)), Math.abs((x & 255) - (y & 255)));
  }

  async function click(p, e) {
    const img = topAt(p, isRaster);
    if (!img) {
      // vector art: select every object whose ink is close to the clicked one
      const hit = topAt(p, (o) => !o.isType('image') && !E.isTexture(o));
      sel = null;
      if (!hit) {
        E.canvas.requestRenderAll();
        E.emit('wand');
        return;
      }
      const ink = E.inkOf(hit);
      const t = E.state.wand.tol * 2.55;
      const same = E.canvas.getObjects().filter((o) => o.visible && !o.locked && !o.isType('image') && colorDist(E.inkOf(o), ink) <= t);
      E.setTool('select');
      E.selectObjects(same);
      DZ.toast(`Selected ${same.length} object${same.length > 1 ? 's' : ''} in ${DZ.paletteName(ink) || ink}`);
      return;
    }
    const { el, data, w, h } = pixels(img);
    const q = toPixel(img, p, w, h);
    if (q.x < 0 || q.y < 0 || q.x >= w || q.y >= h) return;
    const m = computeMask(data, w, h, q.x, q.y, E.state.wand.tol, E.state.wand.contiguous);
    if (sel && sel.img === img && (e.shiftKey || e.altKey)) {
      for (let k = 0; k < m.length; k++) sel.mask[k] = e.shiftKey ? sel.mask[k] | m[k] : sel.mask[k] & (1 - m[k]);
    } else sel = { img, el, w, h, mask: m };
    buildOverlay();
    E.state.layer = img.layer || E.state.layer;
    E.canvas.requestRenderAll();
    E.emit('wand');
  }

  // Rewrite the image's pixels with fn(data, mask) and swap them in (undoable).
  async function editPixels(fn, { target } = {}) {
    if (!valid()) return;
    const { img, w, h, mask } = sel;
    const { data } = pixels(img);
    const out = new ImageData(new Uint8ClampedArray(data.data), w, h);
    fn(out.data, mask);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(out, 0, 0);
    const url = c.toDataURL('image/png');
    const el = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const dest = target || img;
    dest.setElement(el);
    if (dest.filters && dest.filters.length) dest.applyFilters();
    dest.set('dirty', true);
    return el;
  }

  // ---------- lasso ----------
  let lasso = null; // { pts: [world points], add, sub }
  function lassoDown(p, e) {
    lasso = { pts: [p], add: e.shiftKey, sub: e.altKey };
  }
  function lassoMove(p) {
    if (!lasso) return;
    const last = lasso.pts[lasso.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) * E.zoom() < 2) return;
    lasso.pts.push(p);
    const c = E.canvas, ctx = c.contextTop, v = c.viewportTransform, rs = c.getRetinaScaling();
    c.clearContext(ctx);
    ctx.save();
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.beginPath();
    lasso.pts.forEach((q, i) => (i ? ctx.lineTo(q.x * v[0] + v[4], q.y * v[3] + v[5]) : ctx.moveTo(q.x * v[0] + v[4], q.y * v[3] + v[5])));
    ctx.closePath();
    ctx.fillStyle = 'rgba(47,123,255,0.12)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineDashOffset = 4;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }
  function lassoUp() {
    if (!lasso) return;
    const L = lasso;
    lasso = null;
    E.canvas.clearContext(E.canvas.contextTop);
    if (L.pts.length < 3) {
      if (!L.add && !L.sub) sel = null;
      E.canvas.requestRenderAll();
      return E.emit('wand');
    }
    // target: the image already being selected, else the top-most image under the lasso
    let img = valid() && (L.add || L.sub) ? sel.img : null;
    if (!img) {
      const cx = L.pts.reduce((a, q) => a + q.x, 0) / L.pts.length, cy = L.pts.reduce((a, q) => a + q.y, 0) / L.pts.length;
      img = topAt(new fabric.Point(cx, cy), isRaster) || topAt(L.pts[0], isRaster);
    }
    if (!img) {
      DZ.toast('Draw the lasso over an image (photo, brush stroke or merged art).', true);
      E.canvas.requestRenderAll();
      return E.emit('wand');
    }
    const { el, w, h } = pixels(img);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    const inv = fabric.util.invertTransform(img.calcTransformMatrix());
    g.setTransform(w / img.width, 0, 0, h / img.height, w / 2, h / 2);
    g.transform(...inv);
    g.beginPath();
    L.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    g.closePath();
    g.fillStyle = '#000';
    g.fill();
    const a = g.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let k = 0; k < m.length; k++) m[k] = a[k * 4 + 3] > 127 ? 1 : 0;
    if (sel && sel.img === img && (L.add || L.sub)) {
      for (let k = 0; k < m.length; k++) sel.mask[k] = L.add ? sel.mask[k] | m[k] : sel.mask[k] & (1 - m[k]);
    } else sel = { img, el, w, h, mask: m };
    buildOverlay();
    E.canvas.requestRenderAll();
    E.emit('wand');
  }

  const ACTIONS = {
    async delete() {
      const el = await editPixels((d, m) => { for (let k = 0; k < m.length; k++) if (m[k]) d[k * 4 + 3] = 0; });
      sel.el = el;
      sel.mask.fill(0);
      buildOverlay();
    },
    async keep() {
      const el = await editPixels((d, m) => { for (let k = 0; k < m.length; k++) if (!m[k]) d[k * 4 + 3] = 0; });
      sel.el = el;
    },
    async fill() {
      const hex = DZ.production.norm(E.state.ink) || '#000000';
      const n = parseInt(hex.slice(1), 16);
      const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      const el = await editPixels((d, m) => {
        for (let k = 0; k < m.length; k++) if (m[k]) { d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = 255; }
      });
      sel.el = el;
    },
    async copy() {
      const { img } = sel;
      const [copy] = await E.enliven([img.toObject(DZ.SERIAL_PROPS)]);
      copy.uid = DZ.uid();
      copy.name = `${img.name || 'Image'} · cut-out`;
      const src = sel;
      await editPixels((d, m) => { for (let k = 0; k < m.length; k++) if (!m[k]) d[k * 4 + 3] = 0; }, { target: copy });
      const layer = E.addLayer();
      copy.layer = layer.id;
      E.prepareObject(copy);
      E.canvas.add(copy);
      sel = src;
    },
    // Lift the selected pixels onto their own layer and start corner-distorting them.
    async cutDistort() {
      const { img } = sel;
      const [copy] = await E.enliven([img.toObject(DZ.SERIAL_PROPS)]);
      copy.uid = DZ.uid();
      copy.name = `${img.name || 'Image'} · piece`;
      copy.warp = null;
      copy.warpSrc = null;
      copy.warpBox = null;
      const src = sel;
      await editPixels((d, m) => { for (let k = 0; k < m.length; k++) if (!m[k]) d[k * 4 + 3] = 0; }, { target: copy });
      sel = src;
      const el = await editPixels((d, m) => { for (let k = 0; k < m.length; k++) if (m[k]) d[k * 4 + 3] = 0; });
      const layer = E.addLayer();
      copy.layer = layer.id;
      E.prepareObject(copy);
      E.canvas.add(copy);
      sel = null;
      void el;
      E.setTool('select');
      await DZ.warp.start(copy, 'perspective');
    },
    invert() {
      for (let k = 0; k < sel.mask.length; k++) sel.mask[k] = 1 - sel.mask[k];
      buildOverlay();
    },
    clear() {
      sel = null;
    },
  };

  DZ.wand = {
    click,
    lassoDown,
    lassoMove,
    lassoUp,
    lassoActive: () => !!lasso,
    has: () => valid(),
    count: () => (valid() ? sel.count : 0),
    total: () => (valid() ? sel.w * sel.h : 0),
    async run(action) {
      if (!valid() && action !== 'clear') return;
      const undoable = ['delete', 'keep', 'fill', 'copy', 'cutDistort'].includes(action);
      if (undoable) await E.batch(() => ACTIONS[action]());
      else await ACTIONS[action]();
      E.canvas.requestRenderAll();
      E.emit('wand');
    },
    init() {
      E.canvas.on('after:render', drawOverlay);
    },
  };
})();
