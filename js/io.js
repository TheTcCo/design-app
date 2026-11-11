// Files: autosave, save/open documents, import artwork, export print files and mockups.
(function () {
  const E = DZ.editor;
  const host = window.designHost || null;
  const IO = (DZ.io = {});

  // ---------- helpers ----------
  const slug = (s) => (s || 'design').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'design';

  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  function canvasToBlob(c) {
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  // Write a 300 DPI pHYs chunk so print software reads the right physical size.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  async function withDPI(blob, dpi) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unit: meter
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const ihdrEnd = 8 + 25; // signature + IHDR chunk
    const out = new Uint8Array(buf.length + 21);
    out.set(buf.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(buf.subarray(ihdrEnd), ihdrEnd + 21);
    return new Blob([out], { type: 'image/png' });
  }

  async function saveBlob(blob, name, filters) {
    if (host) {
      const data = blob.type.startsWith('image/png') ? { base64: await blobToBase64(blob) } : await blob.text();
      return host.saveFile({ defaultName: name, data, filters });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return name;
  }

  async function saveBlobs(files) {
    if (host) {
      const payload = [];
      for (const f of files) {
        payload.push({ name: f.name, data: f.blob.type === 'image/png' ? { base64: await blobToBase64(f.blob) } : await f.blob.text() });
      }
      return host.saveFiles(payload);
    }
    for (const f of files) await saveBlob(f.blob, f.name);
    return files.map((f) => f.name);
  }

  // ---------- document ----------
  IO.slug = slug;

  // Document with the live side folded in and only the image assets it actually uses.
  IO.currentDoc = () => {
    const d = E.doc;
    d.sides[d.side].objects = E.serializeObjects();
    d.assets = E.usedAssets([d.sides.front.objects, d.sides.back.objects]);
    return d;
  };

  let autosaveTimer = null;
  IO.scheduleAutosave = () => {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(IO.autosaveNow, 1200);
  };
  IO.autosaveNow = async () => {
    try {
      const text = JSON.stringify(IO.currentDoc());
      if (host) await host.writeAutosave(text);
      else localStorage.setItem('design-autosave', text);
    } catch (err) {
      console.warn('Autosave failed', err);
    }
  };
  IO.readAutosave = async () => {
    try {
      const text = host ? await host.readAutosave() : localStorage.getItem('design-autosave');
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  };

  IO.validDoc = (d) => d && d.version === 1 && d.sides && d.sides.front && d.sides.back && DZ.GARMENTS[d.garment];

  IO.pngWithDPI = async (canvas, dpi) => withDPI(await canvasToBlob(canvas), dpi);
  IO.saveBlobs = (files) => saveBlobs(files);
  IO.saveBlob = (blob, name, filters) => saveBlob(blob, name, filters);
  IO.enliven = (objects) => E.enliven(objects);

  IO.docPath = null; // file the current design was opened from / last saved to

  IO.save = async (saveAs = false) => {
    const d = IO.currentDoc();
    const text = JSON.stringify(d);
    if (host && IO.docPath && !saveAs) return host.writeFile({ filePath: IO.docPath, data: text });
    const blob = new Blob([text], { type: 'application/json' });
    const where = await saveBlob(blob, `${slug(d.name)}.design.json`, [{ name: 'Design', extensions: ['json'] }]);
    if (host && where) IO.docPath = where;
    return where;
  };

  IO.recent = async () => (host && host.recent ? host.recent() : []);
  IO.openPath = async (p) => {
    const res = await host.readFile(p);
    const d = JSON.parse(res.text);
    if (!IO.validDoc(d)) throw new Error('This file is not a Design document.');
    IO.docPath = res.path;
    return d;
  };

  IO.open = async () => {
    let text;
    if (host) {
      const res = await host.openFile({ filters: [{ name: 'Design', extensions: ['json'] }] });
      if (!res) return null;
      text = res.text;
      IO.docPath = res.path;
    } else {
      text = await pickFile('.json,application/json').then((f) => f && f.text());
      if (!text) return null;
    }
    const d = JSON.parse(text);
    if (!IO.validDoc(d)) throw new Error('This file is not a Design document.');
    return d;
  };

  function pickFile(accept, multiple) {
    return new Promise((res) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = !!multiple;
      input.onchange = () => res(multiple ? [...input.files] : input.files[0] || null);
      input.click();
    });
  }

  // ---------- import artwork ----------
  IO.uploads = []; // [{ id, name, kind, data }]

  IO.importFiles = async (files, at) => {
    const added = [];
    for (const file of files) {
      const name = file.name.replace(/\.[^.]+$/, '');
      if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
        const text = await file.text();
        IO.uploads.push({ id: DZ.uid(), name, kind: 'svg', data: text });
        added.push(await E.addSVG(text, { name, at }));
      } else if (/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
        const data = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.readAsDataURL(file);
        });
        IO.uploads.push({ id: DZ.uid(), name, kind: 'image', data });
        added.push(await E.addImage(data, { name, at }));
      }
    }
    E.emit('uploads');
    return added;
  };

  IO.pickImages = async () => {
    const files = await pickFile('image/png,image/jpeg,image/webp,image/svg+xml', true);
    if (files && files.length) return IO.importFiles(files);
    return [];
  };

  IO.placeUpload = async (u) => {
    if (u.kind === 'svg') return E.addSVG(u.data, { name: u.name });
    return E.addImage(u.data, { name: u.name });
  };

  // ---------- rendering ----------
  async function sideObjects(side) {
    return side === E.doc.side ? E.serializeObjects() : E.doc.sides[side].objects || [];
  }

  // Render one side's print area to a canvas at `scale` device px per world unit.
  IO.renderPrint = async (side, scale = 1, override) => {
    const r = E.printRect(side);
    const w = Math.round(r.width * scale), h = Math.round(r.height * scale);
    const sc = new fabric.StaticCanvas(undefined, { width: w, height: h, enableRetinaScaling: false, renderOnAddRemove: false });
    sc.setViewportTransform([scale, 0, 0, scale, -r.left * scale, -r.top * scale]);
    const live = await E.enliven(override || (await sideObjects(side)));
    live.forEach((o) => sc.add(o));
    E.reapplyArcs(live);
    sc.renderAll();
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(sc.getElement(), 0, 0);
    sc.dispose();
    return { canvas: out, rect: r, count: live.length };
  };

  function svgImage(markup) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Could not render garment layer'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    });
  }

  // Composite garment + design + shading for one side into a canvas `pxW` wide.
  IO.renderMockup = async (side, pxW = 2400, { flat = false, color, style = 'photo' } = {}) => {
    const g = E.doc.garment;
    const bb = DZ.garment.bboxWorld(g);
    const s = pxW / bb.w;
    const W = Math.round(bb.w * s), H = Math.round(bb.h * s);
    const hex = color ? DZ.garmentColor(color).hex : E.garmentHex();
    const L = DZ.garment.layers(g, side, hex, 'mx' + side[0], style);
    const [base, shadow, light] = await Promise.all(
      ['base', 'shadow', 'light'].map((k) => svgImage(DZ.garment.svgDocument(L[k], bb, W, H)))
    );
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0, W, H);
    const print = await IO.renderPrint(side, s);
    ctx.drawImage(print.canvas, Math.round((print.rect.left - bb.x) * s), Math.round((print.rect.top - bb.y) * s));
    if (!flat) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(shadow, 0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(light, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    return c;
  };

  const BACKDROPS = {
    studio: ['#ECE7DF', '#D9D2C6'],
    stone: ['#BDB6A8', '#A39C8E'],
    night: ['#2A2A2C', '#161617'],
  };

  IO.FORMATS = {
    sheet: { name: 'Full size', w: 0, h: 0 },
    square: { name: 'Post 1:1', w: 1080 * 2, h: 1080 * 2 },
    portrait: { name: 'Post 4:5', w: 1080 * 2, h: 1350 * 2 },
    story: { name: 'Story 9:16', w: 1080 * 2, h: 1920 * 2 },
  };

  // Mockups of the given sides × garment colors, laid out in a grid on a backdrop, then
  // optionally fitted into a social-media frame.
  IO.renderMockupSheet = async (sides, backdrop = 'studio', pxW = 2400, { colors, format = 'sheet', caption = '', style = 'photo' } = {}) => {
    const cols = colors && colors.length ? colors : [E.doc.color];
    const shots = [];
    for (const color of cols) for (const side of sides) shots.push(await IO.renderMockup(side, pxW, { color, style }));
    const perRow = cols.length > 1 ? Math.min(shots.length, sides.length > 1 ? sides.length * 2 : 4) : shots.length;
    const rows = Math.ceil(shots.length / perRow);
    const pad = Math.round(pxW * 0.1), gap = Math.round(pxW * 0.06);
    const cellW = shots[0].width, cellH = shots[0].height;
    const capH = caption ? Math.round(pxW * 0.09) : 0;
    let W = perRow * cellW + gap * (perRow - 1) + pad * 2;
    let H = rows * cellH + gap * (rows - 1) + pad * 2 + capH;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (backdrop !== 'transparent') {
      const [a, b] = BACKDROPS[backdrop] || BACKDROPS.studio;
      const grd = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.75);
      grd.addColorStop(0, a);
      grd.addColorStop(1, b);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }
    // garment-shaped soft shadow, like a flat lay photographed under a softbox
    ctx.save();
    if (backdrop !== 'transparent') {
      ctx.shadowColor = backdrop === 'night' ? 'rgba(0,0,0,0.5)' : 'rgba(40,30,20,0.24)';
      ctx.shadowBlur = Math.round(pxW * 0.022);
      ctx.shadowOffsetY = Math.round(pxW * 0.01);
    }
    shots.forEach((s, i) => {
      const x = pad + (i % perRow) * (cellW + gap), y = pad + Math.floor(i / perRow) * (cellH + gap);
      ctx.drawImage(s, x, y);
    });
    ctx.restore();
    if (caption) {
      const dark = backdrop === 'night';
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.86)' : 'rgba(20,20,20,0.82)';
      ctx.font = `600 ${Math.round(capH * 0.42)}px "Cinzel", "GFS Didot", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(capH * 0.12)}px`;
      ctx.fillText(caption.toUpperCase(), W / 2, H - pad * 0.6 - capH / 2);
    }
    const f = IO.FORMATS[format];
    if (!f || !f.w) return c;
    // Fit into a fixed social frame, keeping the backdrop edge to edge.
    const out = document.createElement('canvas');
    out.width = f.w;
    out.height = f.h;
    const o = out.getContext('2d');
    if (backdrop !== 'transparent') {
      const [a, b] = BACKDROPS[backdrop] || BACKDROPS.studio;
      const grd = o.createRadialGradient(f.w / 2, f.h * 0.42, 0, f.w / 2, f.h * 0.42, Math.max(f.w, f.h) * 0.75);
      grd.addColorStop(0, a);
      grd.addColorStop(1, b);
      o.fillStyle = grd;
      o.fillRect(0, 0, f.w, f.h);
    }
    const k = Math.min(f.w / W, f.h / H);
    o.drawImage(c, (f.w - W * k) / 2, (f.h - H * k) / 2, W * k, H * k);
    return out;
  };

  // ---------- exports ----------
  IO.exportPrint = async (sides, dpi = 300) => {
    const files = [];
    for (const side of sides) {
      const { canvas, count } = await IO.renderPrint(side, dpi / DZ.DPI);
      if (!count) continue;
      const blob = await withDPI(await canvasToBlob(canvas), dpi);
      const p = E.preset(side);
      files.push({ name: `${slug(E.doc.name)}-${E.doc.garment}-${side}-${p.w}x${p.h}in-${dpi}dpi.png`, blob });
    }
    if (!files.length) throw new Error('Nothing to export — the print area is empty.');
    if (files.length === 1) return saveBlob(files[0].blob, files[0].name, [{ name: 'PNG image', extensions: ['png'] }]);
    return saveBlobs(files);
  };

  IO.exportSVG = async (side) => {
    const r = E.printRect(side);
    const p = E.preset(side);
    const sc = new fabric.StaticCanvas(undefined, { width: r.width, height: r.height, renderOnAddRemove: false });
    const live = await E.enliven(await sideObjects(side));
    if (!live.length) throw new Error('Nothing to export — the print area is empty.');
    live.forEach((o) => sc.add(o));
    E.reapplyArcs(live);
    const svg = sc.toSVG({
      viewBox: { x: r.left, y: r.top, width: r.width, height: r.height },
      width: `${p.w}in`,
      height: `${p.h}in`,
    });
    sc.dispose();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    return saveBlob(blob, `${slug(E.doc.name)}-${E.doc.garment}-${side}.svg`, [{ name: 'SVG', extensions: ['svg'] }]);
  };

  IO.exportMockup = async (sides, backdrop, opts = {}) => {
    const c = await IO.renderMockupSheet(sides, backdrop, 2400, opts);
    const blob = await canvasToBlob(c);
    const tag = sides.length > 1 ? 'front-back' : sides[0];
    const colorTag = opts.colors && opts.colors.length > 1 ? `${opts.colors.length}-colorways` : String((opts.colors && opts.colors[0]) || E.doc.color).replace('#', '');
    const fmtTag = opts.format && opts.format !== 'sheet' ? `-${opts.format}` : '';
    return saveBlob(blob, `${slug(E.doc.name)}-${E.doc.garment}-${colorTag}-mockup-${tag}${fmtTag}.png`, [{ name: 'PNG image', extensions: ['png'] }]);
  };
})();
