// Textured brushes and a textured eraser. Strokes are stamped (like Procreate/Photoshop
// brushes): a small textured tip is drawn every few pixels along the pointer path.
// - Brush: the finished stroke becomes a 300 DPI image layer in the active layer.
// - Eraser: rubs pixels out of the images (photos, brush strokes) under it in the active
//   layer. Over vector art it leaves an "Eraser stroke" that knocks out everything below,
//   like the distress textures.
(function () {
  const E = DZ.editor;
  const PT = DZ.PT;

  DZ.BRUSHES = [
    { id: 'ink', name: 'Ink', note: 'Smooth, solid line', spacing: 0.06, rotate: 'none' },
    { id: 'dry', name: 'Dry brush', note: 'Streaky bristles', spacing: 0.04, rotate: 'path' },
    { id: 'chalk', name: 'Chalk', note: 'Grainy, broken edge', spacing: 0.14, rotate: 'random' },
    { id: 'charcoal', name: 'Charcoal', note: 'Soft grain, darker core', spacing: 0.1, rotate: 'random' },
    { id: 'spray', name: 'Spray', note: 'Airbrush speckle', spacing: 0.2, rotate: 'none' },
    { id: 'grunge', name: 'Grunge', note: 'Rough, splotchy', spacing: 0.24, rotate: 'random' },
    { id: 'marker', name: 'Flat marker', note: 'Calligraphy nib, 40°', spacing: 0.04, rotate: 'fixed' },
    { id: 'stipple', name: 'Stipple', note: 'Scattered dots', spacing: 0.35, rotate: 'random' },
  ];

  E.state.brush = { id: 'chalk', size: 24, opacity: 100, texture: 55 };
  E.state.eraser = { id: 'grunge', size: 40, texture: 55 };

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // ---------- tip bitmaps (white alpha masks, tinted at draw time) ----------
  const S = 128;
  const tipCache = new Map();
  function makeTip(id, texture, variant) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const r = rng(1000 + variant * 77 + texture);
    const t = texture / 100;
    if (id === 'ink') {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
      g.fill();
    } else if (id === 'dry') {
      // bristle tips in a row across the stroke; dragging them makes streaks
      const n = 22;
      for (let i = 0; i < n; i++) {
        if (r() < 0.08 + t * 0.35) continue; // dry bristles leave gaps
        const y = S * 0.08 + (i / (n - 1)) * S * 0.84 + (r() - 0.5) * 3;
        const w = 1.2 + r() * 3.2;
        g.fillStyle = `rgba(255,255,255,${0.55 + r() * 0.45})`;
        g.beginPath();
        g.ellipse(S / 2, y, 3 + r() * 4, w, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else if (id === 'marker') {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(S / 2, S / 2, S / 2 - 1, S / 9, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      const img = g.createImageData(S, S);
      const soft = id === 'charcoal';
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
          const d = Math.hypot(dx, dy);
          let a = 0;
          if (id === 'chalk' || soft) {
            const edge = 1 - d;
            if (edge > 0) {
              const grain = r();
              const keep = soft ? grain < 0.25 + edge * (1.1 - t * 0.6) : grain > t * 0.7 * (1 - edge * 0.6);
              a = keep ? (soft ? Math.min(1, 0.35 + edge) : 1) : 0;
            }
          } else if (id === 'grunge') {
            const wob = 0.72 + 0.28 * Math.sin(Math.atan2(dy, dx) * (3 + variant) + variant) * (0.4 + t);
            if (d < wob) a = r() > t * 0.45 * (d / wob) ? 1 : 0;
          }
          img.data[(y * S + x) * 4 + 0] = 255;
          img.data[(y * S + x) * 4 + 1] = 255;
          img.data[(y * S + x) * 4 + 2] = 255;
          img.data[(y * S + x) * 4 + 3] = a * 255;
        }
      }
      g.putImageData(img, 0, 0);
    }
    return c;
  }
  function tip(id, texture, variant, color) {
    const key = `${id}|${texture}|${variant}|${color}`;
    let c = tipCache.get(key);
    if (!c) {
      const mask = makeTip(id, texture, variant);
      c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      g.drawImage(mask, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, S, S);
      if (tipCache.size > 120) tipCache.clear();
      tipCache.set(key, c);
    }
    return c;
  }

  // One stamp in world coordinates. `s` = {x, y, a, k, v, seed}
  function stamp(ctx, brush, s, D, color, texture) {
    if (brush.id === 'spray' || brush.id === 'stipple') {
      const r = rng(s.seed);
      const n = brush.id === 'spray' ? Math.round(24 + texture * 0.5) : 6;
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        // spray: gaussian falloff; stipple: even scatter, bigger dots
        const ang = r() * Math.PI * 2;
        const rad = brush.id === 'spray' ? (D / 2) * Math.sqrt(-2 * Math.log(r() + 1e-6)) * 0.42 : (D / 2) * Math.sqrt(r());
        const dot = brush.id === 'spray' ? D * (0.008 + r() * 0.018) : D * (0.04 + r() * 0.05);
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(ang) * rad, s.y + Math.sin(ang) * rad, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const t = tip(brush.id, texture, s.v, color);
    const d = D * s.k;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.drawImage(t, -d / 2, -d / 2, d, d);
    ctx.restore();
  }

  // ---------- stroke recording ----------
  let stroke = null; // { tool, brush, D, color, texture, stamps:[], last, carry, sm }

  function settings(tool) {
    return tool === 'eraser' ? E.state.eraser : E.state.brush;
  }

  function begin(tool, p) {
    const st = settings(tool);
    const brush = DZ.BRUSHES.find((b) => b.id === st.id) || DZ.BRUSHES[0];
    stroke = {
      tool, brush, D: Math.max(2, st.size * PT), texture: st.texture,
      color: tool === 'eraser' ? '#000000' : E.state.ink,
      stamps: [], last: { x: p.x, y: p.y }, sm: { x: p.x, y: p.y }, carry: 0, seed: (Math.random() * 1e9) | 0,
    };
    E.canvas.clearContext(E.canvas.contextTop);
    addStamp(p.x, p.y, 0);
  }

  function addStamp(x, y, dir) {
    const b = stroke.brush;
    const r = rng(stroke.seed + stroke.stamps.length * 13);
    const a = b.rotate === 'path' ? dir : b.rotate === 'fixed' ? (-40 * Math.PI) / 180 : b.rotate === 'random' ? r() * Math.PI * 2 : 0;
    const k = b.id === 'grunge' ? 0.75 + r() * 0.35 : b.id === 'chalk' ? 0.92 + r() * 0.12 : 1;
    const s = { x, y, a, k, v: (r() * 4) | 0, seed: (r() * 1e9) | 0 };
    stroke.stamps.push(s);
    drawPreview(s);
  }

  function extend(p) {
    // light smoothing keeps hand jitter out of the line
    const sm = stroke.sm;
    sm.x += (p.x - sm.x) * 0.55;
    sm.y += (p.y - sm.y) * 0.55;
    const last = stroke.last;
    const dx = sm.x - last.x, dy = sm.y - last.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(0.5, stroke.D * stroke.brush.spacing);
    if (dist + stroke.carry < step) return;
    const dir = Math.atan2(dy, dx);
    let t = step - stroke.carry;
    while (t <= dist) {
      addStamp(last.x + (dx * t) / dist, last.y + (dy * t) / dist, dir);
      t += step;
    }
    stroke.carry = dist - (t - step);
    stroke.last = { x: sm.x, y: sm.y };
    if (stroke.stamps.length > 40000) up();
  }

  function drawPreview(s) {
    const c = E.canvas;
    const ctx = c.contextTop;
    const v = c.viewportTransform;
    const rs = c.getRetinaScaling();
    ctx.save();
    ctx.setTransform(v[0] * rs, v[1] * rs, v[2] * rs, v[3] * rs, v[4] * rs, v[5] * rs);
    if (stroke.tool === 'eraser') {
      ctx.globalAlpha = 0.55;
      stamp(ctx, stroke.brush, s, stroke.D, '#FF3DAE', stroke.texture);
    } else {
      ctx.globalAlpha = E.state.brush.opacity / 100;
      stamp(ctx, stroke.brush, s, stroke.D, stroke.color, stroke.texture);
    }
    ctx.restore();
  }

  function bounds() {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    const pad = stroke.D * 0.8;
    stroke.stamps.forEach((s) => {
      l = Math.min(l, s.x - pad); t = Math.min(t, s.y - pad);
      r = Math.max(r, s.x + pad); b = Math.max(b, s.y + pad);
    });
    return { left: Math.floor(l), top: Math.floor(t), width: Math.ceil(r - l), height: Math.ceil(b - t) };
  }

  // Render the recorded stamps into a canvas covering `bb` (world units), downscaled if huge.
  function rasterize(bb, color) {
    const MAXPX = 36e6;
    const f = Math.min(1, Math.sqrt(MAXPX / Math.max(1, bb.width * bb.height)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bb.width * f));
    c.height = Math.max(1, Math.round(bb.height * f));
    const ctx = c.getContext('2d');
    ctx.setTransform(f, 0, 0, f, -bb.left * f, -bb.top * f);
    stroke.stamps.forEach((s) => stamp(ctx, stroke.brush, s, stroke.D, color, stroke.texture));
    return { canvas: c, f };
  }

  const loadImg = (url) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });

  async function finishBrush() {
    const bb = bounds();
    const { canvas, f } = rasterize(bb, stroke.color);
    const img = await fabric.FabricImage.fromURL(canvas.toDataURL('image/png'));
    img.set({ left: bb.left, top: bb.top, originX: 'left', originY: 'top', scaleX: 1 / f, scaleY: 1 / f, opacity: E.state.brush.opacity / 100 });
    img.layer = E.activeLayer().id;
    const clipped = await E.applyAlphaLock(img);
    E.addObject(img, { name: `Brush · ${stroke.brush.name}${clipped ? ' (alpha lock)' : ''}`, select: false });
  }

  const isRaster = (o) => o.isType('image') && !E.isTexture(o);

  async function eraseImage(img) {
    const el = img._originalElement || img.getElement();
    const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(el, 0, 0, w, h);
    // world → image pixels: inverse of the object's transform, origin at the image center
    const inv = fabric.util.invertTransform(img.calcTransformMatrix());
    const sx = w / img.width, sy = h / img.height;
    ctx.setTransform(sx, 0, 0, sy, w / 2, h / 2);
    ctx.transform(...inv);
    ctx.globalCompositeOperation = 'destination-out';
    stroke.stamps.forEach((s) => stamp(ctx, stroke.brush, s, stroke.D, '#000', stroke.texture));
    const url = c.toDataURL('image/png');
    const el2 = await loadImg(url);
    img.setElement(el2);
    if (img.filters && img.filters.length) img.applyFilters();
    img.set('dirty', true);
  }

  function intersects(o, bb) {
    o.setCoords();
    const r = o.getBoundingRect();
    return r.left < bb.left + bb.width && r.left + r.width > bb.left && r.top < bb.top + bb.height && r.top + r.height > bb.top;
  }

  async function finishEraser() {
    const bb = bounds();
    const layer = E.activeLayer && E.activeLayer();
    const targets = E.canvas.getObjects().filter((o) =>
      isRaster(o) && o.visible && !o.locked && (!layer || o.layer === layer.id) && intersects(o, bb));
    await E.batch(async () => {
      if (targets.length) {
        for (const img of targets) await eraseImage(img);
      } else {
        const { canvas, f } = rasterize(bb, '#000');
        const img = await fabric.FabricImage.fromURL(canvas.toDataURL('image/png'));
        img.set({ left: bb.left, top: bb.top, originX: 'left', originY: 'top', scaleX: 1 / f, scaleY: 1 / f, globalCompositeOperation: 'destination-out' });
        img.name = 'Eraser stroke';
        E.prepareObject(img);
        E.canvas.add(img);
      }
    });
    if (!targets.length) DZ.toast('No image here, so this stroke erases everything below it. Delete “Eraser stroke” in Layers to undo it.');
  }

  let busy = false;
  async function up() {
    if (!stroke || busy) return;
    busy = true;
    const s = stroke;
    try {
      if (s.stamps.length) {
        if (s.tool === 'eraser') await finishEraser();
        else await finishBrush();
      }
    } catch (err) {
      DZ.toast(err.message || String(err), true);
    } finally {
      stroke = null;
      busy = false;
      E.canvas.clearContext(E.canvas.contextTop);
      E.canvas.requestRenderAll();
    }
  }

  // Size ring under the pointer while hovering.
  function hover(p) {
    const c = E.canvas;
    const ctx = c.contextTop;
    c.clearContext(ctx);
    const st = settings(E.state.tool);
    const v = c.viewportTransform, rs = c.getRetinaScaling();
    const r = (st.size * PT * v[0]) / 2;
    ctx.save();
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    const x = p.x * v[0] + v[4], y = p.y * v[3] + v[5];
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r) - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  DZ.brush = {
    isTool: (t) => t === 'brush' || t === 'eraser',
    active: () => !!stroke,
    down(p) {
      if (busy) return;
      begin(E.state.tool, p);
    },
    move(p) {
      if (stroke) extend(p);
      else if (DZ.brush.isTool(E.state.tool)) hover(p);
    },
    up,
    clearHover() {
      if (!stroke) E.canvas.clearContext(E.canvas.contextTop);
    },
    // small preview strip for the brush picker
    thumb(id, color = '#EFE6D2') {
      const b = DZ.BRUSHES.find((x) => x.id === id);
      const c = document.createElement('canvas');
      c.width = 150;
      c.height = 44;
      const ctx = c.getContext('2d');
      const saved = stroke;
      stroke = { brush: b, D: 22, texture: 55, stamps: [], tool: 'brush' };
      const r = rng(9);
      const step = Math.max(0.6, 22 * b.spacing);
      for (let x = 14; x < 136; x += step) {
        const y = 22 + Math.sin(x / 22) * 8;
        const dir = Math.atan2(Math.cos(x / 22) * 8 / 22, 1);
        const a = b.rotate === 'path' ? dir : b.rotate === 'fixed' ? (-40 * Math.PI) / 180 : b.rotate === 'random' ? r() * Math.PI * 2 : 0;
        const k = b.id === 'grunge' ? 0.75 + r() * 0.35 : 1;
        stamp(ctx, b, { x, y, a, k, v: (r() * 4) | 0, seed: (r() * 1e9) | 0 }, 22, color, 55);
      }
      stroke = saved;
      return c.toDataURL();
    },
  };
})();
