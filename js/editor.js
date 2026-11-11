// Core editor: Fabric canvas, viewport, garment overlays, tools, snapping, history.
(function () {
  const { DPI, PT } = DZ;
  const E = (DZ.editor = {});
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SELECT_BLUE = '#2F7BFF';

  E.doc = null; // set by newDoc()/loadDoc()
  E.state = {
    tool: 'select',
    mode: 'edit',
    ink: '#EFE6D2',
    stroke: null,
    strokePt: 4,
    font: 'Noto Serif Display',
    snapping: true,
  };
  E.suspend = 0; // >0 while loading / batching — history & autosave ignore events
  const listeners = {};
  E.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  E.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

  let canvas, stage, layers;

  // ---------- document ----------
  E.blankDoc = () => ({
    version: 1,
    name: 'Untitled',
    garment: 'tee',
    color: 'black',
    method: 'dtg',
    notes: '',
    side: 'front',
    sides: {
      front: { preset: 'full', custom: null, objects: [], layers: [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }] },
      back: { preset: 'full', custom: null, objects: [], layers: [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }] },
    },
  });

  E.presetList = (garment = E.doc.garment, side = E.doc.side) => DZ.PRINT_PRESETS[garment][side];

  E.preset = (side = E.doc.side) => {
    const s = E.doc.sides[side];
    if (s.preset === 'custom' && s.custom) return Object.assign({ id: 'custom', name: 'Custom' }, s.custom);
    const list = E.presetList(E.doc.garment, side);
    return list.find((p) => p.id === s.preset) || list[0];
  };

  E.printRect = (side = E.doc.side) => {
    const p = E.preset(side);
    return { left: (p.x - p.w / 2) * DPI, top: p.top * DPI, width: p.w * DPI, height: p.h * DPI };
  };

  E.garmentHex = () => DZ.garmentColor(E.doc.color).hex;

  // ---------- assets ----------
  // Embedded images (data URLs) live once in an asset table; serialized objects reference
  // them as "asset:<id>". Keeps undo snapshots and autosaves small.
  const assets = new Map(); // id -> dataURL
  const assetIds = new Map(); // dataURL -> id
  E.addAsset = (dataURL) => {
    let id = assetIds.get(dataURL);
    if (!id) {
      id = DZ.uid();
      assets.set(id, dataURL);
      assetIds.set(dataURL, id);
    }
    return id;
  };
  E.assetURL = (ref) => (typeof ref === 'string' && ref.startsWith('asset:') ? assets.get(ref.slice(6)) : ref);
  E.loadAssets = (table) => {
    Object.entries(table || {}).forEach(([id, url]) => {
      assets.set(id, url);
      assetIds.set(url, id);
    });
  };
  function mapImages(list, fn) {
    (list || []).forEach((o) => {
      if (o.objects) mapImages(o.objects, fn);
      if ((o.type === 'Image' || o.type === 'image') && typeof o.src === 'string') o.src = fn(o.src);
      if (o.clipPath && o.clipPath.objects) mapImages(o.clipPath.objects, fn);
      if (typeof o.warpSrc === 'string') o.warpSrc = fn(o.warpSrc);
      if (typeof o.arraySrc === 'string') {
        const src = JSON.parse(o.arraySrc);
        mapImages([src], fn);
        o.arraySrc = JSON.stringify(src);
      }
    });
  }
  E.usedAssets = (lists) => {
    const used = {};
    lists.forEach((l) => mapImages(JSON.parse(JSON.stringify(l || [])), (src) => {
      if (src.startsWith('asset:') && assets.has(src.slice(6))) used[src.slice(6)] = assets.get(src.slice(6));
      return src;
    }));
    return used;
  };
  // Serialized objects (with asset refs or inline data) -> live Fabric objects.
  E.enliven = async (objects) => {
    const clone = JSON.parse(JSON.stringify(objects || []));
    mapImages(clone, (src) => (src.startsWith('asset:') ? assets.get(src.slice(6)) || src : src));
    return fabric.util.enlivenObjects(clone);
  };
  const isTextObj = (o) => o.isType && (o.isType('i-text') || o.isType('text') || o.isType('textbox'));
  E.reapplyArcs = (list) => {
    list.forEach((o) => {
      if (o.isType && o.isType('group')) E.reapplyArcs(o.getObjects());
      else if (o.arc && isTextObj(o)) E.applyArc(o, o.arc, true);
    });
  };

  // ---------- serialization ----------
  E.serializeObjects = () => {
    const json = canvas.toObject(DZ.SERIAL_PROPS);
    // Text-on-arc paths are rebuilt from the `arc` value on load, so don't store them.
    const strip = (list) => list.forEach((o) => {
      if (o.arc) delete o.path;
      if (o.objects) strip(o.objects);
    });
    strip(json.objects);
    mapImages(json.objects, (src) => (src.startsWith('data:') ? 'asset:' + E.addAsset(src) : src));
    return json.objects;
  };

  E.snapshot = () => {
    E.normalizeLayers();
    return JSON.stringify({ o: E.serializeObjects(), l: E.layers() });
  };

  E.loadObjects = async (objects) => {
    E.suspend++;
    try {
      canvas.discardActiveObject();
      canvas.remove(...canvas.getObjects());
      const live = await E.enliven(objects);
      live.forEach((o) => {
        prepareObject(o);
        canvas.add(o);
      });
      E.reapplyArcs(canvas.getObjects());
      E.applyMode();
      canvas.requestRenderAll();
    } finally {
      E.suspend--;
    }
    E.emit('objects');
    E.emit('selection');
  };

  function prepareObject(o) {
    if (!o.uid) o.uid = DZ.uid();
    if (E.doc && (!o.layer || !E.layers().some((l) => l.id === o.layer))) o.layer = E.activeLayer().id;
    // Distress textures cover the whole print area; clicks pass through to the art below
    // (select them from the Layers panel).
    if (o.globalCompositeOperation === 'destination-out' || o.texture) o.evented = false;
    if (o.locked) {
      o.selectable = false;
      o.evented = false;
    }
  }
  E.prepareObject = prepareObject;

  // ---------- layers ----------
  // Each side has an ordered list of layers (bottom → top). Every top-level object carries a
  // `layer` id; the canvas stacking order is kept grouped by layer, so "Bring to front" means
  // the top of its own layer. Hiding/locking a layer hides/locks its objects.
  const newLayer = (name) => ({ id: 'L' + DZ.uid(), name, visible: true, locked: false });
  E.ensureLayers = (side) => {
    const s = E.doc.sides[side];
    if (!Array.isArray(s.layers) || !s.layers.length) s.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }];
  };
  E.layers = () => E.doc.sides[E.doc.side].layers;
  E.layerOf = (id) => E.layers().find((l) => l.id === id);
  E.activeLayer = () => E.layerOf(E.state.layer) || E.layers()[E.layers().length - 1];
  E.setActiveLayer = (id) => {
    E.state.layer = id;
    E.emit('layers');
  };
  E.normalizeLayers = () => {
    if (!canvas || !E.doc) return;
    const order = new Map(E.layers().map((l, i) => [l.id, i]));
    const objs = canvas._objects;
    const fallback = E.activeLayer().id;
    objs.forEach((o) => !order.has(o.layer) && (o.layer = fallback));
    const sorted = objs.map((o, i) => [o, i]).sort((a, b) => order.get(a[0].layer) - order.get(b[0].layer) || a[1] - b[1]).map((x) => x[0]);
    if (sorted.some((o, i) => o !== objs[i])) {
      objs.splice(0, objs.length, ...sorted);
      canvas.requestRenderAll();
    }
  };
  const objsIn = (id) => canvas.getObjects().filter((o) => o.layer === id);
  E.layerObjects = objsIn;
  E.addLayer = () => {
    const L = E.layers();
    const n = L.reduce((m, l) => Math.max(m, +(/^Layer (\d+)$/.exec(l.name) || [0, 0])[1]), 0) + 1;
    const l = newLayer(`Layer ${n}`);
    L.splice(L.indexOf(E.activeLayer()) + 1, 0, l);
    E.state.layer = l.id;
    canvas.discardActiveObject();
    E.record(true);
    E.emit('layers');
    return l;
  };
  E.removeLayer = (id) => {
    const L = E.layers();
    E.suspend++;
    canvas.discardActiveObject();
    objsIn(id).forEach((o) => canvas.remove(o));
    E.suspend--;
    L.splice(L.findIndex((l) => l.id === id), 1);
    if (!L.length) L.push(newLayer('Layer 1'));
    if (!E.layerOf(E.state.layer)) E.state.layer = L[L.length - 1].id;
    canvas.requestRenderAll();
    E.record(true);
    E.emit('objects');
    E.emit('layers');
  };
  E.renameLayer = (id, name) => {
    const l = E.layerOf(id);
    if (!l || !name) return;
    l.name = name;
    E.record(true);
    E.emit('layers');
  };
  E.toggleLayerVisible = (id) => {
    const l = E.layerOf(id);
    l.visible = !l.visible;
    objsIn(id).forEach((o) => o.set('visible', l.visible));
    if (!l.visible) canvas.discardActiveObject();
    canvas.requestRenderAll();
    E.record(true);
    E.emit('objects');
  };
  E.toggleLayerLock = (id) => {
    const l = E.layerOf(id);
    l.locked = !l.locked;
    objsIn(id).forEach((o) => {
      o.locked = l.locked;
      o.selectable = !l.locked;
      o.evented = !l.locked && !E.isTexture(o);
    });
    if (l.locked) canvas.discardActiveObject();
    canvas.requestRenderAll();
    E.record(true);
    E.emit('objects');
  };
  // Alpha lock (like Procreate / Photoshop "lock transparency"): new brush strokes and
  // textures in this layer only paint where the layer already has art.
  E.toggleLayerAlpha = (id) => {
    const l = E.layerOf(id);
    l.alphaLock = !l.alphaLock;
    E.record(true);
    E.emit('layers');
  };
  // A clip made of copies of the layer's art (textures and eraser strokes left out).
  E.layerClip = async (id, exclude = []) => {
    const src = objsIn(id).filter((o) => o.visible && !E.isTexture(o) && !exclude.includes(o));
    if (!src.length) return null;
    const live = await E.enliven(src.map((o) => {
      const j = o.toObject(DZ.SERIAL_PROPS);
      delete j.clipPath;
      j.opacity = 1;
      j.shadow = null;
      return j;
    }));
    E.reapplyArcs(live);
    const g = new fabric.Group(live);
    g.absolutePositioned = true;
    return g;
  };
  // Clip `obj` to its layer when that layer is alpha-locked. Returns true if clipped.
  E.applyAlphaLock = async (obj) => {
    const l = E.layerOf(obj.layer);
    if (!l || !l.alphaLock) return false;
    const clip = await E.layerClip(l.id, [obj]);
    if (!clip) {
      DZ.toast('Alpha lock is on but this layer has no art yet — nothing to paint on, so the stroke stays as is.');
      return false;
    }
    obj.clipPath = clip;
    obj.set('dirty', true);
    canvas.requestRenderAll();
    return true;
  };

  // Move layer `id` so it ends up at position `to` (0 = bottom).
  E.moveLayer = (id, to) => {
    const L = E.layers();
    const from = L.findIndex((l) => l.id === id);
    if (from < 0) return;
    const [l] = L.splice(from, 1);
    L.splice(Math.max(0, Math.min(L.length, to)), 0, l);
    E.normalizeLayers();
    E.record(true);
    E.emit('objects');
  };
  E.moveToLayer = (objs, id, { top = true } = {}) => {
    const l = E.layerOf(id);
    if (!l) return;
    objs.forEach((o) => {
      o.layer = id;
      if (top) canvas.bringObjectToFront(o);
    });
    E.normalizeLayers();
    E.state.layer = id;
    canvas.requestRenderAll();
    E.record(true);
    E.emit('objects');
  };

  // ---------- history (per side) ----------
  const history = { front: { stack: [], idx: -1 }, back: { stack: [], idx: -1 } };

  E.resetHistory = (side) => {
    history[side] = { stack: [E.snapshot()], idx: 0 };
  };

  E.record = () => {
    if (E.suspend) return;
    const h = history[E.doc.side];
    const snap = E.snapshot();
    if (h.stack[h.idx] === snap) return;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(snap);
    if (h.stack.length > 120) h.stack.shift();
    h.idx = h.stack.length - 1;
    E.doc.sides[E.doc.side].objects = JSON.parse(snap).o;
    E.emit('changed');
    E.emit('history');
  };

  E.canUndo = () => history[E.doc.side].idx > 0;
  E.canRedo = () => {
    const h = history[E.doc.side];
    return h.idx < h.stack.length - 1;
  };

  async function restore(idx) {
    const h = history[E.doc.side];
    h.idx = idx;
    const st = JSON.parse(h.stack[idx]);
    E.doc.sides[E.doc.side].layers = st.l;
    if (!st.l.find((l) => l.id === E.state.layer)) E.state.layer = st.l[st.l.length - 1].id;
    await E.loadObjects(st.o);
    E.doc.sides[E.doc.side].objects = st.o;
    E.emit('changed');
    E.emit('history');
  }
  E.undo = () => E.canUndo() && restore(history[E.doc.side].idx - 1);
  E.redo = () => E.canRedo() && restore(history[E.doc.side].idx + 1);

  // Run several canvas mutations as one undo step.
  E.batch = async (fn) => {
    E.suspend++;
    try {
      await fn();
    } finally {
      E.suspend--;
    }
    E.record();
    E.emit('objects');
  };

  // ---------- canvas setup ----------
  E.init = () => {
    stage = document.getElementById('stage');
    layers = {
      base: document.getElementById('layer-base'),
      shadow: document.getElementById('layer-shadow'),
      light: document.getElementById('layer-light'),
      guides: document.getElementById('layer-guides'),
    };

    Object.assign(fabric.FabricObject.ownDefaults, {
      borderColor: SELECT_BLUE,
      cornerColor: '#ffffff',
      cornerStrokeColor: SELECT_BLUE,
      cornerStyle: 'rect',
      transparentCorners: false,
      cornerSize: 9,
      touchCornerSize: 20,
      borderScaleFactor: 1.25,
      padding: 0,
      strokeUniform: false,
    });
    fabric.IText.ownDefaults.editingBorderColor = SELECT_BLUE;
    fabric.IText.ownDefaults.cursorColor = SELECT_BLUE;
    fabric.IText.ownDefaults.selectionColor = 'rgba(47,123,255,0.25)';
    try {
      fabric.setFilterBackend(new fabric.Canvas2dFilterBackend());
    } catch {}

    canvas = new fabric.Canvas('c', {
      preserveObjectStacking: true,
      selectionColor: 'rgba(47,123,255,0.08)',
      selectionBorderColor: SELECT_BLUE,
      selectionLineWidth: 1,
      stopContextMenu: true,
      uniformScaling: true,
      targetFindTolerance: 4,
      enableRetinaScaling: true,
      fireMiddleClick: true,
      fireRightClick: true,
    });
    E.canvas = canvas;

    const ro = new ResizeObserver(() => E.resize());
    ro.observe(stage);
    E.resize();

    wireCanvasEvents();
  };

  E.resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const first = !canvas.__sized;
    canvas.setDimensions({ width: w, height: h });
    canvas.__sized = true;
    Object.values(layers).forEach((l) => {
      l.setAttribute('width', w);
      l.setAttribute('height', h);
      l.setAttribute('viewBox', `0 0 ${w} ${h}`);
    });
    if (first) E.fit();
    else E.sync();
  };

  // ---------- viewport ----------
  E.zoom = () => canvas.getZoom();
  // Percent of physical print size (1 in = 96 CSS px on screen).
  E.zoomPercent = () => Math.round((E.zoom() * DPI * 100) / 96);

  E.setVpt = (v) => {
    canvas.setViewportTransform(v);
    E.sync();
  };

  E.fit = (target = 'garment') => {
    if (!E.doc) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    let box;
    if (target === 'print') box = E.printRect();
    else {
      const b = DZ.garment.bboxWorld(E.doc.garment);
      box = { left: b.x, top: b.y, width: b.w, height: b.h };
    }
    const pad = target === 'print' ? 80 : 48;
    const z = Math.max(0.005, Math.min((w - pad * 2) / box.width, (h - pad * 2) / box.height));
    const tx = w / 2 - (box.left + box.width / 2) * z;
    const ty = h / 2 - (box.top + box.height / 2) * z;
    E.setVpt([z, 0, 0, z, tx, ty]);
  };

  E.zoomBy = (factor, point) => {
    const p = point || new fabric.Point(stage.clientWidth / 2, stage.clientHeight / 2);
    const z = Math.max(0.01, Math.min(3, E.zoom() * factor));
    canvas.zoomToPoint(p, z);
    E.sync();
  };

  E.setZoomPercent = (pct) => {
    const z = (pct / 100) * (96 / DPI);
    canvas.zoomToPoint(new fabric.Point(stage.clientWidth / 2, stage.clientHeight / 2), z);
    E.sync();
  };

  // Keep the SVG garment/guide layers aligned with the canvas viewport.
  E.sync = () => {
    const v = canvas.viewportTransform;
    const m = `matrix(${v.join(' ')})`;
    ['base', 'shadow', 'light'].forEach((k) => {
      const g = layers[k].firstElementChild;
      if (g) g.setAttribute('transform', m);
    });
    drawGuides();
    E.emit('viewport');
  };

  // ---------- garment layers ----------
  E.renderGarment = () => {
    const L = DZ.garment.layers(E.doc.garment, E.doc.side, E.garmentHex(), 'gm');
    for (const k of ['base', 'shadow', 'light']) {
      layers[k].innerHTML = `<g>${L[k]}</g>`;
    }
    stage.style.setProperty('--garment', E.garmentHex());
    stage.classList.toggle('garment-dark', DZ.isDark(E.garmentHex()));
    if (E.state.mode === 'preview') applyClip();
    E.sync();
  };

  let snapLines = [];
  function drawGuides() {
    const g = layers.guides;
    if (!E.doc) return;
    const v = canvas.viewportTransform;
    const r = E.printRect();
    const x = r.left * v[0] + v[4], y = r.top * v[3] + v[5];
    const w = r.width * v[0], h = r.height * v[3];
    const p = E.preset();
    let html = '';
    if (E.state.mode === 'edit') {
      html +=
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="print-area"/>` +
        `<text x="${x}" y="${y - 8}" class="print-label">${p.name} · ${p.w} × ${p.h} in</text>`;
      const cx = x + w / 2;
      html += `<line x1="${cx}" y1="${y - 4}" x2="${cx}" y2="${y + 6}" class="print-tick"/>`;
      html += `<line x1="${cx}" y1="${y + h - 6}" x2="${cx}" y2="${y + h + 4}" class="print-tick"/>`;
      snapLines.forEach((s) => {
        if (s.x !== undefined) {
          const sx = s.x * v[0] + v[4];
          html += `<line x1="${sx}" y1="0" x2="${sx}" y2="${stage.clientHeight}" class="snap-line"/>`;
        } else {
          const sy = s.y * v[3] + v[5];
          html += `<line x1="0" y1="${sy}" x2="${stage.clientWidth}" y2="${sy}" class="snap-line"/>`;
        }
      });
    }
    g.innerHTML = html;
  }
  E.drawGuides = drawGuides;

  // ---------- modes ----------
  // Preview shows what prints: the print area, or the garment silhouette for all-over.
  function garmentClip() {
    const parts = DZ.garment.outline(E.doc.garment, E.doc.side).map((d) => {
      const p = new fabric.Path(d);
      p.set({ left: p.left * DPI, top: p.top * DPI, scaleX: DPI, scaleY: DPI });
      return p;
    });
    const g = new fabric.Group(parts);
    g.absolutePositioned = true;
    return g;
  }
  function applyClip() {
    const r = E.printRect();
    if (E.preset().allover) {
      canvas.clipPath = garmentClip();
      return;
    }
    canvas.clipPath = new fabric.Rect({
      left: r.left, top: r.top, width: r.width, height: r.height,
      absolutePositioned: true, originX: 'left', originY: 'top',
    });
  }
  // Objects that reach outside the print area (hidden in Preview, cropped in the print file).
  E.outsidePrintArea = () => {
    const r = E.printRect();
    return canvas.getObjects().filter((o) => {
      if (!o.visible || E.isTexture(o)) return false;
      o.setCoords();
      const b = o.getBoundingRect();
      return b.left < r.left - 1 || b.top < r.top - 1 || b.left + b.width > r.left + r.width + 1 || b.top + b.height > r.top + r.height + 1;
    });
  };

  E.setMode = (mode) => {
    E.state.mode = mode;
    E.applyMode();
    E.emit('mode');
    if (mode === 'preview' && !E.preset().allover) {
      const n = E.outsidePrintArea().length;
      if (n) DZ.toast(`${n} object${n > 1 ? 's go' : ' goes'} past the print area, so ${n > 1 ? 'they are' : 'it is'} cut off here and in the print file. For hem or edge-to-edge designs pick “Hem band” or “All-over” as the print area.`);
    }
  };

  E.applyMode = () => {
    const preview = E.state.mode === 'preview';
    stage.classList.toggle('preview', preview);
    if (preview) {
      E.exitPathEdit();
      canvas.discardActiveObject();
      canvas.skipTargetFind = true;
      canvas.selection = false;
      canvas.isDrawingMode = false;
      applyClip();
    } else {
      canvas.clipPath = undefined;
      E.setTool(E.state.tool, true);
    }
    drawGuides();
    canvas.requestRenderAll();
  };

  // ---------- tools ----------
  const CURSORS = {
    select: 'default', direct: 'default', pen: 'crosshair', pencil: 'crosshair', brush: 'none', eraser: 'none', wand: 'crosshair', lasso: 'crosshair',
    rect: 'crosshair', ellipse: 'crosshair', line: 'crosshair', text: 'text', hand: 'grab',
  };

  E.setTool = (tool, silent) => {
    if (E.state.tool === 'pen' && tool !== 'pen') DZ.pen.finish();
    if (tool !== 'direct') E.exitPathEdit();
    if (DZ.brush && !DZ.brush.isTool(tool)) DZ.brush.clearHover();
    E.state.tool = tool;
    if (E.state.mode === 'preview') {
      if (!silent) E.setMode('edit');
      return;
    }
    const selecting = tool === 'select' || tool === 'direct';
    canvas.isDrawingMode = tool === 'pencil';
    canvas.selection = selecting;
    canvas.skipTargetFind = !selecting && tool !== 'text';
    canvas.defaultCursor = CURSORS[tool] || 'default';
    canvas.hoverCursor = selecting ? 'move' : CURSORS[tool];
    if (tool === 'pencil') {
      const b = new fabric.PencilBrush(canvas);
      b.color = E.state.stroke || E.state.ink;
      b.width = Math.max(1, E.state.strokePt * PT);
      b.decimate = 3;
      b.strokeLineCap = 'round';
      b.strokeLineJoin = 'round';
      canvas.freeDrawingBrush = b;
    }
    if (!selecting) canvas.discardActiveObject();
    canvas.requestRenderAll();
    if (!silent) E.emit('tool');
  };

  // Direct selection: edit the anchor points/handles of a path.
  let pathEditing = null;
  E.enterPathEdit = (p) => {
    if (!p || !p.isType('path')) return;
    if (pathEditing && pathEditing !== p) E.exitPathEdit();
    pathEditing = p;
    p.controls = fabric.controlsUtils.createPathControls(p, {
      controlPointStyle: { controlFill: '#ffffff', controlStroke: SELECT_BLUE },
      pointStyle: { controlFill: SELECT_BLUE, controlStroke: '#ffffff' },
    });
    p.hasBorders = false;
    p.objectCaching = false;
    canvas.setActiveObject(p);
    canvas.requestRenderAll();
  };
  E.exitPathEdit = () => {
    if (!pathEditing) return;
    const p = pathEditing;
    pathEditing = null;
    p.controls = fabric.controlsUtils.createObjectDefaultControls();
    p.hasBorders = true;
    p.objectCaching = true;
    p.setCoords();
    canvas.requestRenderAll();
  };

  // ---------- creating objects ----------
  E.ptToUnits = (pt) => pt * PT;
  E.unitsToIn = (u) => u / DPI;

  E.addObject = (obj, { select = true, name } = {}) => {
    if (name) obj.name = name;
    prepareObject(obj);
    canvas.add(obj);
    if (select) canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    return obj;
  };

  E.placeCentered = (obj, maxW, maxH) => {
    const r = E.printRect();
    const mw = maxW || r.width * 0.8, mh = maxH || r.height * 0.8;
    const s = Math.min(mw / obj.width, mh / obj.height);
    obj.set({ scaleX: s, scaleY: s });
    obj.setPositionByOrigin(new fabric.Point(r.left + r.width / 2, r.top + r.height / 2), 'center', 'center');
    obj.setCoords();
  };

  E.newText = (text, point, opts = {}) => {
    const t = new fabric.IText(text, Object.assign({
      fontFamily: E.state.font,
      fontSize: 72 * PT,
      fill: E.state.ink,
      charSpacing: 80,
      lineHeight: 1.05,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      left: point.x,
      top: point.y,
    }, opts));
    return t;
  };

  // Recolor an object. Motifs and imported artwork (groups or single paths that are line
  // drawings) are one ink: every visible fill AND stroke takes the new color, and stroke-only
  // lines are never given a fill (that would close open paths into solid blocks).
  E.setInk = (obj, color, which = 'fill') => {
    const artwork = obj.isType('group') || !!obj.motif;
    const visible = (v) => !!v && v !== 'none' && v !== 'transparent';
    const apply = (o) => {
      if (o.isType('group')) {
        o.getObjects().forEach(apply);
        o.set('dirty', true);
        return;
      }
      if (which !== 'fill') return o.set('stroke', color);
      const hasFill = visible(o.fill), hasStroke = visible(o.stroke) && o.strokeWidth > 0;
      if (hasFill || !hasStroke) o.set('fill', color);
      if (hasStroke && artwork) o.set('stroke', color);
      o.set('dirty', true);
    };
    apply(obj);
  };

  E.inkOf = (obj) => {
    const find = (o) => {
      if (o.isType('group')) {
        for (const c of o.getObjects()) {
          const v = find(c);
          if (v) return v;
        }
        return null;
      }
      if (typeof o.fill === 'string' && o.fill && o.fill !== 'none') return o.fill;
      if (typeof o.stroke === 'string' && o.stroke && o.stroke !== 'none') return o.stroke;
      return null;
    };
    return find(obj);
  };

  E.addSVG = async (svgText, { name, motif, size, at } = {}) => {
    const { objects, options } = await fabric.loadSVGFromString(svgText);
    const parts = objects.filter(Boolean);
    if (!parts.length) throw new Error('That SVG has no drawable shapes.');
    const obj = parts.length === 1 ? parts[0] : fabric.util.groupSVGElements(parts, options);
    if (motif) {
      obj.motif = motif;
      E.setInk(obj, E.state.ink);
    }
    const r = E.printRect();
    if (size) {
      const s = (size * DPI) / Math.max(obj.width, obj.height);
      obj.set({ scaleX: s, scaleY: s });
      const maxS = Math.min((r.width * 0.95) / obj.width, (r.height * 0.95) / obj.height);
      if (s > maxS) obj.set({ scaleX: maxS, scaleY: maxS });
      obj.setPositionByOrigin(at || new fabric.Point(r.left + r.width / 2, r.top + r.height / 2), 'center', 'center');
    } else {
      E.placeCentered(obj);
      if (at) obj.setPositionByOrigin(at, 'center', 'center');
    }
    E.addObject(obj, { name });
    return obj;
  };

  E.addImage = async (dataURL, { name, at } = {}) => {
    const img = await fabric.FabricImage.fromURL(dataURL);
    E.placeCentered(img);
    if (at) img.setPositionByOrigin(at, 'center', 'center');
    E.addObject(img, { name });
    return img;
  };

  // ---------- text on an arc ----------
  E.applyArc = (t, arc, keepPosition) => {
    const center = t.getCenterPoint();
    t.arc = arc || 0;
    t.set('path', undefined);
    t.initDimensions();
    if (t.arc) {
      const L = t.width;
      const theta = Math.min(Math.abs(t.arc) / 100, 1) * (Math.PI * 1.7);
      const R = L / theta;
      const s = Math.sin(theta / 2) * R, c = Math.cos(theta / 2) * R;
      const large = theta > Math.PI ? 1 : 0;
      const d = t.arc > 0
        ? `M ${-s} ${R - c} A ${R} ${R} 0 ${large} 1 ${s} ${R - c}`
        : `M ${-s} ${-R + c} A ${R} ${R} 0 ${large} 0 ${s} ${-R + c}`;
      const path = new fabric.Path(d, { visible: false, fill: '', stroke: '' });
      t.set({ path, pathAlign: 'baseline', pathSide: 'left', pathStartOffset: 0 });
      t.initDimensions();
    }
    t.setPositionByOrigin(center, 'center', 'center');
    t.setCoords();
    t.set('dirty', true);
    canvas.requestRenderAll();
  };

  // ---------- snapping ----------
  function snapTargets(moving) {
    const r = E.printRect();
    const xs = [r.left, r.left + r.width / 2, r.left + r.width, 0];
    const ys = [r.top, r.top + r.height / 2, r.top + r.height];
    const skip = new Set(moving.isType('activeselection') ? moving.getObjects() : [moving]);
    canvas.getObjects().slice(-60).forEach((o) => {
      if (skip.has(o) || !o.visible) return;
      const b = o.getBoundingRect();
      xs.push(b.left, b.left + b.width / 2, b.left + b.width);
      ys.push(b.top, b.top + b.height / 2, b.top + b.height);
    });
    return { xs, ys };
  }

  function onMoving(opt) {
    snapLines = [];
    const o = opt.target;
    if (!E.state.snapping || opt.e.metaKey || opt.e.ctrlKey) return drawGuides();
    const th = 7 / E.zoom();
    const b = o.getBoundingRect();
    const { xs, ys } = snapTargets(o);
    const cand = (start, size, targets) => {
      let best = null;
      for (const off of [0, size / 2, size]) {
        for (const t of targets) {
          const d = t - (start + off);
          if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
        }
      }
      return best;
    };
    const bx = cand(b.left, b.width, xs);
    const by = cand(b.top, b.height, ys);
    if (bx) {
      o.set('left', o.left + bx.d);
      snapLines.push({ x: bx.at });
    }
    if (by) {
      o.set('top', o.top + by.d);
      snapLines.push({ y: by.at });
    }
    o.setCoords();
    drawGuides();
  }

  // ---------- canvas events ----------
  let drag = null; // shape-creation / pan state
  let altCopy = null; // originals to restore behind an Option-drag
  let spaceDown = false;

  E.setSpace = (down) => {
    spaceDown = down;
    if (E.state.mode === 'preview') return;
    if (down) {
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      canvas.skipTargetFind = true;
      canvas.selection = false;
      canvas.isDrawingMode = false;
    } else {
      E.setTool(E.state.tool, true);
    }
  };

  function wireCanvasEvents() {
    canvas.on('mouse:wheel', (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey || e.altKey) {
        const factor = Math.pow(0.99, e.deltaY * (e.ctrlKey ? 1.6 : 0.5));
        E.zoomBy(factor, new fabric.Point(e.offsetX, e.offsetY));
      } else {
        canvas.relativePan(new fabric.Point(-e.deltaX, -e.deltaY));
        E.sync();
      }
    });

    canvas.on('mouse:down', (opt) => {
      const e = opt.e;
      const tool = E.state.tool;
      if (e.button === 2) {
        // Right-click selects what's under the pointer so the context menu acts on it.
        if (opt.target && !E.activeObjects().includes(opt.target) && opt.target.selectable !== false) canvas.setActiveObject(opt.target);
        canvas.requestRenderAll();
        return;
      }
      const panning = spaceDown || tool === 'hand' || e.button === 1 || E.state.mode === 'preview';
      if (panning) {
        drag = { kind: 'pan', x: e.clientX, y: e.clientY };
        canvas.setCursor('grabbing');
        return;
      }
      const p = canvas.getScenePoint(e);
      if (tool === 'pen') return DZ.pen.down(p, e);
      if (DZ.brush.isTool(tool)) return DZ.brush.down(p, e);
      if (tool === 'wand') return DZ.wand.click(p, e);
      if (tool === 'lasso') return DZ.wand.lassoDown(p, e);
      // Option-drag duplicates (Illustrator habit): remember the original, drop a copy on release.
      altCopy = tool === 'select' && e.altKey && opt.target && opt.target.selectable !== false;
      if (tool === 'direct') {
        if (opt.target && opt.target.isType('path')) E.enterPathEdit(opt.target);
        else if (!opt.target) E.exitPathEdit();
        return;
      }
      if (tool === 'text') {
        if (opt.target && opt.target.isType('i-text')) {
          E.setTool('select');
          return;
        }
        const t = E.newText('ΑΡΕΤΗ', p);
        E.addObject(t, { name: 'Text' });
        t.enterEditing();
        t.selectAll();
        E.setTool('select');
        return;
      }
      if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
        E.suspend++;
        let obj;
        const fill = tool === 'line' ? '' : E.state.ink;
        const stroke = tool === 'line' ? E.state.stroke || E.state.ink : E.state.stroke;
        const common = {
          left: p.x, top: p.y, originX: 'left', originY: 'top',
          fill, stroke, strokeWidth: stroke ? E.state.strokePt * PT : 0,
          strokeLineCap: 'round',
        };
        if (tool === 'rect') obj = new fabric.Rect(Object.assign({ width: 1, height: 1 }, common));
        else if (tool === 'ellipse') obj = new fabric.Ellipse(Object.assign({ rx: 0.5, ry: 0.5 }, common));
        else obj = new fabric.Line([p.x, p.y, p.x, p.y], Object.assign({}, common, { strokeWidth: E.state.strokePt * PT }));
        obj.name = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line' }[tool];
        prepareObject(obj);
        canvas.add(obj);
        drag = { kind: 'shape', tool, obj, start: p };
      }
    });

    canvas.on('mouse:move', (opt) => {
      const e = opt.e;
      const p = canvas.getScenePoint(e);
      E.emit('cursor', p);
      if (E.state.tool === 'pen' && !drag) DZ.pen.move(p, e);
      if (!drag && DZ.brush.isTool(E.state.tool)) DZ.brush.move(p, e);
      if (DZ.wand.lassoActive()) DZ.wand.lassoMove(p);
      if (!drag) return;
      if (drag.kind === 'pan') {
        canvas.relativePan(new fabric.Point(e.clientX - drag.x, e.clientY - drag.y));
        drag.x = e.clientX;
        drag.y = e.clientY;
        E.sync();
        return;
      }
      if (drag.kind === 'shape') {
        const { obj, start, tool } = drag;
        let w = p.x - start.x, h = p.y - start.y;
        if (e.shiftKey && tool !== 'line') {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        if (tool === 'line') {
          let x2 = p.x, y2 = p.y;
          if (e.shiftKey) {
            const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(w, h);
            x2 = start.x + Math.cos(ang) * len;
            y2 = start.y + Math.sin(ang) * len;
          }
          obj.set({ x2, y2 });
        } else {
          const left = Math.min(start.x, start.x + w), top = Math.min(start.y, start.y + h);
          if (tool === 'rect') obj.set({ left, top, width: Math.abs(w), height: Math.abs(h) });
          else obj.set({ left, top, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
        }
        obj.setCoords();
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:up', () => {
      if (DZ.brush.active()) DZ.brush.up();
      if (DZ.wand.lassoActive()) DZ.wand.lassoUp();
      if (!drag) return;
      if (drag.kind === 'pan') {
        canvas.setCursor(canvas.defaultCursor);
      } else if (drag.kind === 'shape') {
        const { obj, start, tool } = drag;
        const tiny = obj.getBoundingRect().width < 4 / E.zoom() * 3 && obj.getBoundingRect().height < 4 / E.zoom() * 3;
        if (tiny) {
          const s = 2 * DPI;
          if (tool === 'rect') obj.set({ left: start.x - s / 2, top: start.y - s / 2, width: s, height: s });
          else if (tool === 'ellipse') obj.set({ left: start.x - s / 2, top: start.y - s / 2, rx: s / 2, ry: s / 2 });
          else obj.set({ x1: start.x - s / 2, x2: start.x + s / 2, y2: start.y });
          obj.setCoords();
        }
        E.suspend--;
        canvas.setActiveObject(obj);
        E.setTool('select');
        E.record();
        E.emit('objects');
      }
      drag = null;
    });

    canvas.on('mouse:dblclick', (opt) => {
      if (E.state.mode === 'preview') return;
      if (opt.target && opt.target.isType('path')) {
        E.setTool('direct');
        E.enterPathEdit(opt.target);
      }
    });

    canvas.on('object:moving', onMoving);
    canvas.on('object:modified', async (opt) => {
      snapLines = [];
      drawGuides();
      const orig = opt.transform && opt.transform.original;
      if (altCopy && opt.action === 'drag' && orig && opt.target) {
        altCopy = null;
        const t = opt.target;
        const dx = t.left - orig.left, dy = t.top - orig.top;
        const moved = t.isType('activeselection') ? t.getObjects() : [t];
        canvas.discardActiveObject(); // bakes selection transforms into the objects
        const all = canvas.getObjects();
        const jsons = moved.map((o) => o.toObject(DZ.SERIAL_PROPS));
        const idx = moved.map((o) => all.indexOf(o));
        const live = await E.enliven(jsons);
        E.suspend++;
        live.forEach((o, i) => {
          o.uid = DZ.uid();
          o.set({ left: o.left - dx, top: o.top - dy });
          prepareObject(o);
          canvas.insertAt(Math.max(0, idx[i]), o);
        });
        E.reapplyArcs(live);
        E.suspend--;
        E.selectObjects(moved);
        canvas.requestRenderAll();
        E.emit('objects');
      }
      altCopy = null;
      E.record();
      E.emit('modified');
    });
    ['object:scaling', 'object:rotating', 'object:moving', 'object:resizing'].forEach((ev) =>
      canvas.on(ev, () => E.emit('transforming'))
    );
    canvas.on('object:added', (opt) => {
      if (E.suspend) return;
      const l = opt.target && E.layerOf(opt.target.layer);
      if (l && !l.visible) E.toggleLayerVisible(l.id);
      if (l && l.locked) E.toggleLayerLock(l.id);
      E.normalizeLayers();
      E.record();
      E.emit('objects');
    });
    canvas.on('object:removed', () => {
      if (E.suspend) return;
      E.record();
      E.emit('objects');
    });
    canvas.on('path:created', (opt) => {
      const p = opt.path;
      p.name = 'Pencil';
      prepareObject(p);
      E.record();
      E.emit('objects');
    });
    canvas.on('text:changed', (opt) => {
      const t = opt.target;
      if (t.arc) E.applyArc(t, t.arc);
    });
    canvas.on('text:editing:exited', (opt) => {
      const t = opt.target;
      if (!t.text.trim()) canvas.remove(t);
      E.record();
      E.emit('objects');
    });
    const followLayer = () => {
      const a = canvas.getActiveObject();
      if (a && !a.isType('activeselection') && a.layer) E.state.layer = a.layer;
    };
    canvas.on('selection:created', () => {
      followLayer();
      E.emit('selection');
    });
    canvas.on('selection:updated', () => {
      followLayer();
      const a = canvas.getActiveObject();
      if (pathEditing && a !== pathEditing) E.exitPathEdit();
      E.emit('selection');
    });
    canvas.on('selection:cleared', () => {
      if (E.state.tool !== 'direct') E.exitPathEdit();
      E.emit('selection');
    });
    canvas.on('after:render', () => DZ.pen && DZ.pen.render());
  }

  // ---------- selection helpers ----------
  E.active = () => canvas.getActiveObject();
  E.activeObjects = () => canvas.getActiveObjects();

  E.selectObjects = (objs) => {
    canvas.discardActiveObject();
    const sel = objs.filter((o) => o.selectable !== false && o.visible);
    if (sel.length === 1) canvas.setActiveObject(sel[0]);
    else if (sel.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(sel, { canvas }));
    canvas.requestRenderAll();
  };

  E.selectAll = () => E.selectObjects(canvas.getObjects());

  E.deleteSelected = () => {
    const objs = E.activeObjects();
    if (!objs.length) return;
    if (objs.length === 1 && objs[0].isEditing) return;
    E.batch(() => {
      canvas.discardActiveObject();
      canvas.remove(...objs);
    });
  };

  let clipboard = null;
  E.copy = async () => {
    const objs = E.activeObjects();
    if (!objs.length) return false;
    const a = E.active();
    // Serialize with the selection's transform baked in.
    canvas.discardActiveObject();
    clipboard = objs.map((o) => o.toObject(DZ.SERIAL_PROPS));
    if (a.isType('activeselection')) E.selectObjects(objs);
    else canvas.setActiveObject(a);
    return true;
  };
  E.hasClipboard = () => !!clipboard;

  E.paste = async (offset = 0.25 * DPI, source) => {
    const data = source || clipboard;
    if (!data) return;
    const live = await E.enliven(data);
    await E.batch(() => {
      live.forEach((o) => {
        o.uid = DZ.uid();
        o.set({ left: o.left + offset, top: o.top + offset });
        prepareObject(o);
        canvas.add(o);
      });
      E.reapplyArcs(live);
    });
    E.selectObjects(live);
  };

  E.duplicate = async () => {
    const objs = E.activeObjects();
    if (!objs.length) return;
    const a = E.active();
    canvas.discardActiveObject();
    const data = objs.map((o) => o.toObject(DZ.SERIAL_PROPS));
    if (a.isType('activeselection')) E.selectObjects(objs);
    await E.paste(0.25 * DPI, data);
  };

  E.nudge = (dx, dy) => {
    const a = E.active();
    if (!a) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    canvas.requestRenderAll();
    clearTimeout(E._nudgeT);
    E._nudgeT = setTimeout(() => E.record(), 250);
    E.emit('modified');
  };

  E.group = () => {
    const a = E.active();
    if (!a || !a.isType('activeselection')) return;
    const objs = a.getObjects();
    const all = canvas.getObjects();
    const idx = Math.min(...objs.map((o) => all.indexOf(o)));
    E.batch(() => {
      canvas.discardActiveObject();
      canvas.remove(...objs);
      const g = new fabric.Group(objs);
      g.name = 'Group';
      prepareObject(g);
      canvas.insertAt(idx, g);
      canvas.setActiveObject(g);
    });
  };

  E.ungroup = () => {
    const g = E.active();
    if (!g || !g.isType('group')) return;
    const idx = canvas.getObjects().indexOf(g);
    let items;
    E.batch(() => {
      canvas.discardActiveObject();
      items = g.removeAll();
      canvas.remove(g);
      items.forEach((o, i) => {
        o.uid = DZ.uid();
        if (!o.name) o.name = g.name ? `${g.name} ${i + 1}` : `Shape ${i + 1}`;
        prepareObject(o);
      });
      canvas.insertAt(idx, ...items);
    }).then(() => E.selectObjects(items));
  };

  E.arrange = (where) => {
    const objs = E.activeObjects();
    if (!objs.length) return;
    E.batch(() => {
      const ordered = [...objs].sort((a, b) => canvas.getObjects().indexOf(a) - canvas.getObjects().indexOf(b));
      if (where === 'front') ordered.forEach((o) => canvas.bringObjectToFront(o));
      else if (where === 'back') ordered.reverse().forEach((o) => canvas.sendObjectToBack(o));
      else if (where === 'forward') ordered.reverse().forEach((o) => canvas.bringObjectForward(o));
      else if (where === 'backward') ordered.forEach((o) => canvas.sendObjectBackwards(o));
    });
    canvas.requestRenderAll();
  };

  // Align to the print area (one object) or to the selection bounds (several).
  E.align = (how) => {
    const a = E.active();
    if (!a) return;
    const multi = a.isType('activeselection');
    const objs = multi ? a.getObjects() : [a];
    if (multi) canvas.discardActiveObject();
    let ref;
    if (multi) {
      const bs = objs.map((o) => o.getBoundingRect());
      const l = Math.min(...bs.map((b) => b.left)), t = Math.min(...bs.map((b) => b.top));
      const r = Math.max(...bs.map((b) => b.left + b.width)), btm = Math.max(...bs.map((b) => b.top + b.height));
      ref = { left: l, top: t, width: r - l, height: btm - t };
    } else ref = E.printRect();
    objs.forEach((o) => {
      const b = o.getBoundingRect();
      let dx = 0, dy = 0;
      if (how === 'left') dx = ref.left - b.left;
      if (how === 'hcenter') dx = ref.left + ref.width / 2 - (b.left + b.width / 2);
      if (how === 'right') dx = ref.left + ref.width - (b.left + b.width);
      if (how === 'top') dy = ref.top - b.top;
      if (how === 'vcenter') dy = ref.top + ref.height / 2 - (b.top + b.height / 2);
      if (how === 'bottom') dy = ref.top + ref.height - (b.top + b.height);
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    });
    if (multi) E.selectObjects(objs);
    canvas.requestRenderAll();
    E.record();
    E.emit('modified');
  };

  E.distribute = (axis) => {
    const a = E.active();
    if (!a || !a.isType('activeselection')) return;
    const objs = a.getObjects();
    if (objs.length < 3) return;
    canvas.discardActiveObject();
    const key = axis === 'h' ? 'left' : 'top', size = axis === 'h' ? 'width' : 'height';
    const items = objs.map((o) => ({ o, b: o.getBoundingRect() })).sort((x, y) => x.b[key] - y.b[key]);
    const first = items[0].b, last = items[items.length - 1].b;
    const total = items.reduce((s, i) => s + i.b[size], 0);
    const gap = (last[key] + last[size] - first[key] - total) / (items.length - 1);
    let cursor = first[key];
    items.forEach(({ o, b }) => {
      const d = cursor - b[key];
      o.set(key, o[key] + d);
      o.setCoords();
      cursor += b[size] + gap;
    });
    E.selectObjects(objs);
    E.record();
    E.emit('modified');
  };

  E.flip = (axis) => {
    const a = E.active();
    if (!a) return;
    if (axis === 'h') a.set('flipX', !a.flipX);
    else a.set('flipY', !a.flipY);
    a.setCoords();
    canvas.requestRenderAll();
    E.record();
    E.emit('modified');
  };

  E.toggleLock = (o) => {
    o.locked = !o.locked;
    o.selectable = !o.locked;
    o.evented = !o.locked;
    if (o.locked && canvas.getActiveObjects().includes(o)) canvas.discardActiveObject();
    canvas.requestRenderAll();
    E.record();
    E.emit('objects');
  };

  E.toggleVisible = (o) => {
    o.visible = !o.visible;
    if (!o.visible && canvas.getActiveObjects().includes(o)) canvas.discardActiveObject();
    canvas.requestRenderAll();
    E.record();
    E.emit('objects');
  };

  // ---------- side / garment switching ----------
  E.switchSide = async (side) => {
    if (side === E.doc.side) return;
    E.exitPathEdit();
    DZ.pen.finish();
    E.doc.sides[E.doc.side].objects = E.serializeObjects();
    E.doc.side = side;
    E.ensureLayers(side);
    E.state.layer = E.layers()[E.layers().length - 1].id;
    await E.loadObjects(E.doc.sides[side].objects);
    if (!history[side].stack.length) E.resetHistory(side);
    E.renderGarment();
    E.emit('doc');
    E.emit('history');
    E.emit('changed');
  };

  E.setGarment = (garment) => {
    if (garment === E.doc.garment) return;
    E.doc.garment = garment;
    for (const side of ['front', 'back']) {
      const s = E.doc.sides[side];
      const list = DZ.PRINT_PRESETS[garment][side];
      // presetWanted = the area the person last picked; a garment without it falls back
      // to its first area, and switching back to one that has it restores it.
      const want = s.presetWanted || s.preset;
      s.presetWanted = want;
      if (want === 'custom' || list.find((p) => p.id === want)) s.preset = want;
      else if (!list.find((p) => p.id === s.preset)) s.preset = list[0].id;
    }
    E.renderGarment();
    E.fit();
    E.emit('doc');
    E.emit('changed');
  };

  // live = true while dragging a color picker: repaint only, no panel rebuild.
  E.setColor = (id, live) => {
    E.doc.color = id;
    E.renderGarment();
    if (live) return;
    E.emit('doc');
    E.emit('changed');
  };

  E.setPreset = (id, custom) => {
    const s = E.doc.sides[E.doc.side];
    s.preset = id;
    s.presetWanted = id;
    if (custom) s.custom = custom;
    if (E.state.mode === 'preview') applyClip();
    drawGuides();
    canvas.requestRenderAll();
    E.emit('doc');
    E.emit('changed');
  };

  E.setDoc = async (doc) => {
    E.loadAssets(doc.assets);
    delete doc.assets;
    if (!doc.method) doc.method = 'dtg';
    if (doc.notes === undefined) doc.notes = '';
    E.doc = doc;
    E.ensureLayers('front');
    E.ensureLayers('back');
    E.state.layer = E.layers()[E.layers().length - 1].id;
    history.front = { stack: [], idx: -1 };
    history.back = { stack: [], idx: -1 };
    await E.loadObjects(doc.sides[doc.side].objects);
    E.resetHistory(doc.side);
    E.renderGarment();
    E.fit();
    E.emit('doc');
    E.emit('history');
  };
})();
