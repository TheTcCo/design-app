// Array modifier (like Blender's): duplicates one source object in a line, a circle or a
// grid. It stays editable: the group keeps its settings (arrayMod) and the source
// (arraySrc, a JSON string in the group's own coordinates — a string so Fabric never turns
// it into a live object on load), so changing a setting rebuilds the copies.
// "Apply" turns it into a plain group; "Remove" gives back the single source object.
(function () {
  const E = DZ.editor;
  const { DPI } = DZ;
  const MAX = 600;

  DZ.ARRAY_DEFAULTS = {
    linear: { count: 6, sx: 100, sy: 0, rot: 0, scale: 100, fade: 0 },
    circle: { count: 12, radius: 3, arc: 360, start: 0, follow: true },
    grid: { cols: 4, rows: 3, sx: 100, sy: 100, drop: 0 },
  };

  // Size of one repeat, in the source's own units: motifs with a known period join
  // seamlessly (border bands, tiles); anything else uses its visual size.
  function unitSize(src) {
    const m = src.motif && DZ.MOTIFS.find((x) => x.id === src.motif);
    const period = (m && m.period) || (src.motif && DZ.MOTIF_LEGACY_PERIODS[src.motif]) || [];
    const dim = src._getNonTransformedDimensions();
    const w = period[0] || dim.x;
    const h = period[1] || dim.y;
    return { w: w * Math.abs(src.scaleX || 1), h: h * Math.abs(src.scaleY || 1) };
  }

  function placements(mod, src, c0) {
    const { w, h } = unitSize(src);
    const out = [];
    if (mod.mode === 'circle') {
      const n = Math.max(1, Math.round(mod.count));
      const full = mod.arc >= 360;
      const step = full ? 360 / n : n > 1 ? mod.arc / (n - 1) : 0;
      const R = mod.radius * DPI;
      for (let i = 0; i < n; i++) {
        const a = mod.start + i * step, rad = (a * Math.PI) / 180;
        out.push({ x: c0.x + R * Math.sin(rad), y: c0.y - R * Math.cos(rad), angle: (src.angle || 0) + (mod.follow ? a : 0), k: 1, op: 1 });
      }
    } else if (mod.mode === 'grid') {
      const cols = Math.max(1, Math.round(mod.cols)), rows = Math.max(1, Math.round(mod.rows));
      const dx = (w * mod.sx) / 100, dy = (h * mod.sy) / 100;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          out.push({ x: c0.x + c * dx, y: c0.y + r * dy + (c % 2 ? (dy * mod.drop) / 100 : 0), angle: src.angle || 0, k: 1, op: 1 });
        }
      }
    } else {
      const n = Math.max(1, Math.round(mod.count));
      let x = c0.x, y = c0.y, k = 1;
      const f = mod.scale / 100;
      for (let i = 0; i < n; i++) {
        out.push({ x, y, angle: (src.angle || 0) + i * mod.rot, k, op: Math.max(0.05, 1 - (i * (mod.fade || 0)) / 100 / Math.max(1, n - 1)) });
        // spacing grows with the copy size so scaled copies still touch
        x += ((w * mod.sx) / 100) * (k + k * f) / 2;
        y += ((h * mod.sy) / 100) * (k + k * f) / 2;
        k *= f;
      }
    }
    return out;
  }

  // Build live copies in the source's coordinate frame.
  async function buildCopies(srcStr, center, mod) {
    const srcJSON = JSON.parse(srcStr);
    const [src] = await E.enliven([srcJSON]);
    const c0 = new fabric.Point(center[0], center[1]);
    const spots = placements(mod, src, c0);
    if (spots.length > MAX) throw new Error(`That makes ${spots.length} copies (max ${MAX}). Use fewer copies or a bigger object.`);
    const live = await E.enliven(spots.map(() => srcJSON));
    E.reapplyArcs(live);
    live.forEach((o, i) => {
      const s = spots[i];
      o.set({
        angle: s.angle,
        scaleX: (src.scaleX || 1) * s.k,
        scaleY: (src.scaleY || 1) * s.k,
        opacity: (src.opacity ?? 1) * s.op,
      });
      o.setPositionByOrigin(new fabric.Point(s.x, s.y), 'center', 'center');
    });
    return live;
  }

  function serializeSource(obj) {
    const json = obj.toObject(DZ.SERIAL_PROPS);
    delete json.arrayMod;
    delete json.arraySrc;
    delete json.arrayCenter;
    // keep image data in the asset table, not inside the modifier
    const fix = (o) => {
      if ((o.type === 'Image' || o.type === 'image') && typeof o.src === 'string' && o.src.startsWith('data:')) o.src = 'asset:' + E.addAsset(o.src);
      (o.objects || []).forEach(fix);
    };
    fix(json);
    return JSON.stringify(json);
  }

  // Make the group: children are in "array space"; the group then takes `frame`'s
  // transform (or none for a new array) so the result stays where it was.
  function wrap(live, mod, srcStr, center, frame) {
    const g = new fabric.Group(live);
    const c = g.getCenterPoint();
    g.arrayMod = mod;
    g.arraySrc = srcStr;
    // re-express the source center relative to the new group's center
    g.arrayCenter = [center[0] - c.x, center[1] - c.y];
    if (frame) {
      const M = frame.calcTransformMatrix();
      const world = fabric.util.transformPoint(new fabric.Point(c.x, c.y), M);
      g.set({ angle: frame.angle, scaleX: frame.scaleX, scaleY: frame.scaleY, skewX: frame.skewX, skewY: frame.skewY, flipX: frame.flipX, flipY: frame.flipY, opacity: frame.opacity });
      g.setPositionByOrigin(world, 'center', 'center');
    }
    g.name = frame && frame.name ? frame.name : `Array · ${JSON.parse(srcStr).name || 'object'}`;
    g.uid = (frame && frame.uid) || DZ.uid();
    if (frame) g.layer = frame.layer;
    E.prepareObject(g);
    return g;
  }

  async function replaceOnCanvas(oldObj, newObj) {
    const cv = E.canvas;
    const idx = cv.getObjects().indexOf(oldObj);
    await E.batch(() => {
      cv.discardActiveObject();
      cv.remove(oldObj);
      cv.insertAt(Math.max(0, idx), newObj);
      newObj.setCoords();
      cv.setActiveObject(newObj);
    });
    cv.requestRenderAll();
    return newObj;
  }

  E.isArray = (o) => !!(o && o.arrayMod && typeof o.arraySrc === 'string');

  E.makeArray = async (obj, mode = 'linear') => {
    if (!obj || obj.isType('activeselection')) throw new Error('Select one object to make an array.');
    obj.setCoords();
    const mod = Object.assign({ mode }, DZ.ARRAY_DEFAULTS[mode]);
    const srcStr = serializeSource(obj);
    const c = obj.getCenterPoint();
    // the source sits in the array's own frame with no rotation of the frame itself
    const live = await buildCopies(srcStr, [c.x, c.y], mod);
    const g = wrap(live, mod, srcStr, [c.x, c.y], null);
    g.layer = obj.layer;
    if (mode === 'circle') g.setPositionByOrigin(c, 'center', 'center');
    return replaceOnCanvas(obj, g);
  };

  E.updateArray = async (g, patch) => {
    if (!E.isArray(g)) return g;
    let mod = Object.assign({}, g.arrayMod, patch);
    if (patch.mode && patch.mode !== g.arrayMod.mode) mod = Object.assign({ mode: patch.mode }, DZ.ARRAY_DEFAULTS[patch.mode]);
    const live = await buildCopies(g.arraySrc, g.arrayCenter, mod);
    return replaceOnCanvas(g, wrap(live, mod, g.arraySrc, g.arrayCenter, g));
  };

  // Grid sized to cover the print area, starting at its top-left corner.
  E.fillPrintArea = async (g) => {
    const [src] = await E.enliven([JSON.parse(g.arraySrc)]);
    const { w, h } = unitSize(src);
    const r = E.printRect();
    const k = Math.abs(g.scaleX || 1);
    const mod = Object.assign({}, DZ.ARRAY_DEFAULTS.grid, g.arrayMod.mode === 'grid' ? g.arrayMod : {}, { mode: 'grid' });
    mod.cols = Math.ceil(r.width / (w * k * mod.sx / 100)) + 1;
    mod.rows = Math.ceil(r.height / (h * k * mod.sy / 100)) + (mod.drop ? 2 : 1);
    const ng = await E.updateArray(g, mod);
    ng.setCoords();
    const b = ng.getBoundingRect();
    ng.set({ left: ng.left + (r.left - b.left) - (w * k) * 0.25, top: ng.top + (r.top - b.top) - (h * k) * 0.25 });
    ng.setCoords();
    E.canvas.requestRenderAll();
    E.record();
    return ng;
  };

  // Bake: keep the copies as a normal group.
  E.applyArray = async (g) => {
    if (!E.isArray(g)) return g;
    await E.batch(() => {
      delete g.arrayMod;
      delete g.arraySrc;
      delete g.arrayCenter;
      g.name = (g.name || '').replace(/^Array · /, 'Pattern · ');
    });
    return g;
  };

  // Remove: back to the single source object, placed where its first copy is.
  E.removeArray = async (g) => {
    if (!E.isArray(g)) return g;
    const first = g.getObjects()[0];
    const M = first.calcTransformMatrix();
    const d = fabric.util.qrDecompose(M);
    const json = JSON.parse(g.arraySrc);
    const [src] = await E.enliven([json]);
    E.reapplyArcs([src]);
    src.set({ angle: d.angle, scaleX: d.scaleX, scaleY: d.scaleY, skewX: d.skewX, skewY: 0, opacity: json.opacity ?? 1 });
    src.setPositionByOrigin(new fabric.Point(d.translateX, d.translateY), 'center', 'center');
    src.layer = g.layer;
    E.prepareObject(src);
    return replaceOnCanvas(g, src);
  };
})();
