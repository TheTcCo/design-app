// Production awareness: print methods, ink analysis, method-specific checks,
// screen-print separations and the tech pack for the factory.
(function () {
  const E = DZ.editor;
  const { DPI, PT } = DZ;
  const PR = (DZ.production = {});

  PR.METHODS = {
    dtg: { name: 'DTG', long: 'Direct to garment', note: 'Full color, best for small runs and print on demand.' },
    screen: { name: 'Screen print', long: 'Screen printing', note: 'Flat spot inks, one screen per color. Cheapest for runs of 30+.' },
    embroidery: { name: 'Embroidery', long: 'Embroidery', note: 'Thread, up to ~6 colors. Best small: left chest, sleeves.' },
    dtf: { name: 'DTF', long: 'Direct to film transfer', note: 'Full color heat transfer, works on any fabric color.' },
  };

  const method = () => E.doc.method || 'dtg';

  // ---------- color normalization ----------
  const ctx = document.createElement('canvas').getContext('2d');
  PR.norm = (c) => {
    if (!c || typeof c !== 'string') return null;
    const s = c.trim().toLowerCase();
    if (s === 'none' || s === 'transparent' || s === '') return null;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    const v = ctx.fillStyle; // '#rrggbb' or 'rgba(r, g, b, a)'
    if (v.startsWith('#')) return v.toUpperCase();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v);
    if (!m || (m[4] !== undefined && +m[4] === 0)) return null;
    return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  const isErase = (o) => o.globalCompositeOperation === 'destination-out';

  // Walk every visible leaf object (into groups) with its effective opacity.
  function walk(objs, fn, opacity = 1) {
    objs.forEach((o) => {
      if (!o.visible) return;
      const op = opacity * (o.opacity ?? 1);
      if (o.isType && o.isType('group')) walk(o.getObjects(), fn, op);
      else fn(o, op);
    });
  }

  // { inks: [{hex, name, count, objects:Set}], images, gradients, translucent, softShadows, textures }
  PR.analyze = (objects = E.canvas.getObjects()) => {
    const inks = new Map();
    const res = { inks: [], images: 0, gradients: 0, translucent: 0, softShadows: 0, textures: 0, smallText: 0, thinLines: 0 };
    const add = (hex, top) => {
      if (!inks.has(hex)) inks.set(hex, { hex, name: DZ.paletteName(hex), count: 0, objects: new Set() });
      const i = inks.get(hex);
      i.count++;
      i.objects.add(top);
    };
    objects.forEach((top) => {
      if (!top.visible) return;
      walk([top], (o, op) => {
        if (isErase(o)) return res.textures++;
        if (o.isType('image')) return res.images++;
        let used = false;
        for (const key of ['fill', 'stroke']) {
          const v = o[key];
          if (key === 'stroke' && !(o.strokeWidth > 0)) continue;
          if (v && typeof v === 'object') {
            res.gradients++;
            used = true;
            continue;
          }
          const hex = PR.norm(v);
          if (hex) {
            add(hex, top);
            used = true;
          }
        }
        if (used && op < 0.999) res.translucent++;
        if (o.shadow && o.shadow.blur > 0) res.softShadows++;
        if (o.shadow && PR.norm(o.shadow.color)) add(PR.norm(o.shadow.color), top);
        // embroidery minimums, measured in real inches on the garment
        const sy = Math.abs(o.getObjectScaling ? o.getObjectScaling().y : o.scaleY);
        if ((o.isType('i-text') || o.isType('text') || o.isType('textbox')) && o.fontSize * sy * 0.7 < 0.25 * DPI) res.smallText++;
        if (o.stroke && o.strokeWidth > 0 && o.strokeWidth * sy < 0.04 * DPI && !(o.fill && PR.norm(o.fill))) res.thinLines++;
      });
    });
    res.inks = [...inks.values()].sort((a, b) => b.count - a.count);
    return res;
  };

  PR.screens = (a) => a.inks.length + (DZ.isDark(E.garmentHex()) && a.inks.length ? 1 : 0);

  // Method-aware print checks. Each item: { level: 'warn'|'info', text }
  PR.checks = () => {
    const out = [];
    const r = E.printRect();
    const objs = E.canvas.getObjects();
    let outside = 0, lowDpi = 0;
    objs.forEach((o) => {
      if (!o.visible || isErase(o)) return;
      const b = o.getBoundingRect();
      if (b.left < r.left - 1 || b.top < r.top - 1 || b.left + b.width > r.left + r.width + 1 || b.top + b.height > r.top + r.height + 1) outside++;
      if (o.isType('image') && DZ.panels.imageDPI(o) < 150) lowDpi++;
    });
    if (outside) out.push({ level: 'warn', text: `${outside} object${outside > 1 ? 's extend' : ' extends'} past the print area and will be cropped (Preview hides the cut-off parts). Use the Hem band or All-over print area for designs that reach the edges.` });
    if (!objs.length) return out;
    const a = PR.analyze(objs);
    const m = method();
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

    if (m === 'screen') {
      const s = PR.screens(a);
      out.push({ level: s > 4 ? 'warn' : 'info', text: `${plural(s, 'screen')}: ${plural(a.inks.length, 'ink')}${s > a.inks.length ? ' + white underbase (dark garment)' : ''}.${s > 4 ? ' Most runs use 1–4; each screen adds setup cost.' : ''}` });
      if (a.images) out.push({ level: 'warn', text: `${plural(a.images, 'image')} need halftone separation by the printer. Use “One-color” on the image to make it a single ink.` });
      if (a.gradients || a.translucent) out.push({ level: 'warn', text: 'Gradients or transparency become halftone dots in screen print. Use solid inks at 100% opacity for crisp results.' });
      if (a.softShadows) out.push({ level: 'warn', text: 'Soft (blurred) shadows can’t be screen printed cleanly — use a hard offset shadow.' });
    } else if (m === 'embroidery') {
      if (a.inks.length > 6) out.push({ level: 'warn', text: `${a.inks.length} thread colors — embroidery usually allows up to 6.` });
      else out.push({ level: 'info', text: `${plural(a.inks.length, 'thread color')}.` });
      if (a.images) out.push({ level: 'warn', text: 'Photos and raster images can’t be embroidered — they need to be redrawn as flat shapes.' });
      if (a.gradients || a.translucent || a.softShadows) out.push({ level: 'warn', text: 'Gradients, transparency and soft shadows don’t exist in thread. Use solid colors.' });
      if (a.smallText) out.push({ level: 'warn', text: `${plural(a.smallText, 'text layer')} below 0.25 in letter height — too small to stitch legibly.` });
      if (a.thinLines) out.push({ level: 'warn', text: 'Some lines are thinner than 1 mm and will disappear in thread.' });
      if (r.width > 5 * DPI) out.push({ level: 'info', text: 'Large embroidery gets heavy and expensive. Left chest (about 3.5–4 in) is the classic size.' });
    } else {
      if (lowDpi) out.push({ level: 'warn', text: `${plural(lowDpi, 'image')} below 150 DPI at this size — may print blurry.` });
      if (a.translucent || a.softShadows) out.push({ level: 'warn', text: 'Semi-transparent areas and soft shadows often print as a muddy halo, especially on dark shirts.' });
      if (m === 'dtg' && DZ.isDark(E.garmentHex())) out.push({ level: 'info', text: 'Dark garment: DTG prints a white base under the design, so colors stay bright.' });
    }
    if (m !== 'embroidery' && lowDpi && m === 'screen') out.push({ level: 'warn', text: `${plural(lowDpi, 'image')} below 150 DPI.` });
    return out;
  };

  // ---------- global ink swap (colorways of the same design) ----------
  PR.swapInk = (fromHex, toHex) => {
    E.canvas.getObjects().forEach((o) => DZ.panels.bakeAdjust(o));
    walk(E.canvas.getObjects(), (o) => {
      for (const key of ['fill', 'stroke']) if (PR.norm(o[key]) === fromHex) o.set(key, toHex);
      if (o.shadow && PR.norm(o.shadow.color) === fromHex) o.shadow.color = toHex;
      if (o.isType('image') && o.tint && PR.norm(o.tint) === fromHex) {
        o.tint = toHex;
        DZ.panels.applyImageFilters(o);
      }
      o.set('dirty', true);
    });
    E.canvas.getObjects().forEach((o) => o.isType('group') && o.set('dirty', true));
    E.canvas.requestRenderAll();
    E.record();
  };

  // ---------- separations ----------
  // Rewrite serialized objects so only `ink` prints (as black); other inks knock it out,
  // like stacked screens do. ink === '*' makes the underbase (every ink prints).
  // Offset shadows print as their own ink: turn each into a real shape behind its object.
  function expandShadows(list) {
    const out = [];
    list.forEach((o) => {
      if (o.objects) o.objects = expandShadows(o.objects);
      const sc = o.shadow && PR.norm(o.shadow.color);
      if (sc) {
        const copy = JSON.parse(JSON.stringify(o));
        copy.shadow = null;
        copy.left += o.shadow.offsetX || 0;
        copy.top += o.shadow.offsetY || 0;
        const paint = (x) => {
          if (x.objects) return x.objects.forEach(paint);
          if (PR.norm(typeof x.fill === 'string' ? x.fill : null)) x.fill = sc;
          if (x.strokeWidth > 0 && PR.norm(typeof x.stroke === 'string' ? x.stroke : null)) x.stroke = sc;
        };
        paint(copy);
        out.push(copy);
      }
      o.shadow = null;
      out.push(o);
    });
    return out;
  }

  function plateObjects(objects, ink) {
    const clone = expandShadows(JSON.parse(JSON.stringify(objects)));
    const leaf = (o) => {
      o.objectCaching = false;
      if (o.globalCompositeOperation === 'destination-out') return; // distress textures stay erasers
      if (o.type === 'Image' || o.type === 'image') {
        o.visible = false;
        return;
      }
      const fillHex = PR.norm(typeof o.fill === 'string' ? o.fill : null);
      const strokeHex = o.strokeWidth > 0 ? PR.norm(typeof o.stroke === 'string' ? o.stroke : null) : null;
      const hit = (h) => h && (ink === '*' || h === ink);
      const fillMine = hit(fillHex), strokeMine = hit(strokeHex);
      if (o.shadow) o.shadow = null;
      o.opacity = 1;
      if (fillMine || strokeMine) {
        if (fillHex) o.fill = fillMine ? '#000000' : o.fill;
        if (strokeHex) o.stroke = strokeMine ? '#000000' : o.stroke;
        // a shape whose fill is mine but stroke isn't: print the fill, knock out the stroke later is rare; keep simple
        if (fillHex && !fillMine) o.fill = '';
        if (strokeHex && !strokeMine) o.strokeWidth = 0;
      } else if (fillHex || strokeHex) {
        // another ink on top knocks this plate out
        o.fill = fillHex ? '#000000' : '';
        o.stroke = strokeHex ? '#000000' : o.stroke;
        o.globalCompositeOperation = 'destination-out';
      } else {
        o.visible = false;
      }
    };
    const rec = (list) =>
      list.forEach((o) => {
        if (o.objects) {
          o.objectCaching = false;
          rec(o.objects);
        } else leaf(o);
      });
    rec(clone);
    return clone;
  }

  PR.exportSeparations = async () => {
    const side = E.doc.side;
    const objects = E.serializeObjects();
    const a = PR.analyze();
    if (!a.inks.length) throw new Error('No solid inks to separate.');
    const plates = a.inks.map((i, n) => ({ ink: i.hex, label: `${n + 1}-${(i.name || i.hex.slice(1)).toLowerCase()}` }));
    if (DZ.isDark(E.garmentHex())) plates.unshift({ ink: '*', label: '0-white-underbase' });
    const files = [];
    for (const p of plates) {
      const { canvas } = await DZ.io.renderPrint(side, 1, plateObjects(objects, p.ink));
      files.push({ name: `${DZ.io.slug(E.doc.name)}-${side}-sep-${p.label}.png`, blob: await DZ.io.pngWithDPI(canvas, 300) });
    }
    return DZ.io.saveBlobs(files);
  };

  // ---------- tech pack ----------
  function designBounds(objs, rect) {
    const vis = objs.filter((o) => o.visible && !isErase(o));
    if (!vis.length) return null;
    const bs = vis.map((o) => o.getBoundingRect());
    let l = Math.min(...bs.map((b) => b.left)), t = Math.min(...bs.map((b) => b.top));
    let r = Math.max(...bs.map((b) => b.left + b.width)), btm = Math.max(...bs.map((b) => b.top + b.height));
    l = Math.max(l, rect.left); t = Math.max(t, rect.top);
    r = Math.min(r, rect.left + rect.width); btm = Math.min(btm, rect.top + rect.height);
    if (r <= l || btm <= t) return null;
    return { left: l, top: t, width: r - l, height: btm - t };
  }

  const fmt = (u) => (u / DPI).toFixed(2).replace(/\.00$/, '');

  async function annotatedFlat(side, pxW) {
    const c = await DZ.io.renderMockup(side, pxW, { flat: true });
    const bb = DZ.garment.bboxWorld(E.doc.garment);
    const s = c.width / bb.w;
    const g = c.getContext('2d');
    const X = (x) => (x - bb.x) * s, Y = (y) => (y - bb.y) * s;
    const live = await DZ.io.enliven(side === E.doc.side ? E.serializeObjects() : E.doc.sides[side].objects || []);
    const rect = E.printRect(side);
    const db = designBounds(live, rect);
    g.save();
    g.lineWidth = Math.max(1.5, pxW / 700);
    g.font = `600 ${Math.round(pxW / 46)}px -apple-system, Helvetica, sans-serif`;
    // print area
    g.setLineDash([8, 6]);
    g.strokeStyle = 'rgba(47,123,255,0.9)';
    g.strokeRect(X(rect.left), Y(rect.top), rect.width * s, rect.height * s);
    g.setLineDash([]);
    if (db) {
      g.strokeStyle = '#E2352B';
      g.fillStyle = '#E2352B';
      g.strokeRect(X(db.left), Y(db.top), db.width * s, db.height * s);
      const arrow = (x1, y1, x2, y2, label, lx, ly, align = 'center') => {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1), h = pxW / 120;
        for (const [px, py, a] of [[x1, y1, ang + Math.PI], [x2, y2, ang]]) {
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px - Math.cos(a - 0.4) * h, py - Math.sin(a - 0.4) * h);
          g.lineTo(px - Math.cos(a + 0.4) * h, py - Math.sin(a + 0.4) * h);
          g.closePath(); g.fill();
        }
        g.textAlign = align;
        g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.strokeText(label, lx, ly);
        g.lineWidth = Math.max(1.5, pxW / 700); g.strokeStyle = '#E2352B'; g.fillText(label, lx, ly);
      };
      const off = pxW / 40;
      arrow(X(db.left), Y(db.top + db.height) + off, X(db.left + db.width), Y(db.top + db.height) + off, `${fmt(db.width)} in`, X(db.left + db.width / 2), Y(db.top + db.height) + off * 2.1);
      arrow(X(db.left + db.width) + off, Y(db.top), X(db.left + db.width) + off, Y(db.top + db.height), `${fmt(db.height)} in`, X(db.left + db.width) + off * 1.4, Y(db.top + db.height / 2), 'left');
      // from HPS (y=0) down to artwork top, on the center line
      arrow(X(0), Y(0), X(0), Y(db.top), `${fmt(db.top)} in from ${DZ.GARMENTS[E.doc.garment].bottom ? 'waist' : 'HPS'}`, X(0) + off * 0.5, Y(db.top / 2) , 'left');
      const cx = db.left + db.width / 2;
      if (Math.abs(cx) > 0.05 * DPI) arrow(X(0), Y(db.top) - off, X(cx), Y(db.top) - off, `${fmt(Math.abs(cx))} in ${cx > 0 ? 'right' : 'left'} of center`, X(cx / 2), Y(db.top) - off * 1.5);
    }
    // HPS marker + center line
    g.setLineDash([4, 6]);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.moveTo(X(0), Y(bb.y)); g.lineTo(X(0), Y(bb.y + bb.h)); g.stroke();
    g.restore();
    return { url: c.toDataURL('image/png'), bounds: db, rect, analysis: PR.analyze(live) };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  PR.techPackHTML = async () => {
    const d = E.doc;
    const garment = DZ.GARMENTS[d.garment].name;
    const color = DZ.garmentColor(d.color);
    const m = PR.METHODS[method()];
    const sides = [];
    for (const side of ['front', 'back']) {
      const objs = side === d.side ? E.canvas.getObjects() : d.sides[side].objects || [];
      if (!objs.length) continue;
      sides.push({ side, preset: E.preset(side), ...(await annotatedFlat(side, 1400)) });
    }
    if (!sides.length) throw new Error('Both sides are empty — add artwork first.');
    const date = new Date().toISOString().slice(0, 10);
    const inkRows = (a) =>
      a.inks.map((i) => `<tr><td><span class="chip" style="background:${i.hex}"></span></td><td>${esc(i.name || 'Custom')}</td><td>${i.hex}</td><td>Pantone: match to swatch</td></tr>`).join('') +
      (a.images ? `<tr><td></td><td colspan="3">${a.images} raster image(s) — full color / halftone</td></tr>` : '');
    const sidesHTML = sides.map((s) => `
      <section class="side">
        <h2>${s.side === 'front' ? 'Front' : 'Back'}</h2>
        <img src="${s.url}"/>
        <table class="spec">
          <tr><th>Placement</th><td>${esc(s.preset.name)} (max ${s.preset.w} × ${s.preset.h} in)</td></tr>
          <tr><th>Artwork size</th><td>${s.bounds ? `${fmt(s.bounds.width)} × ${fmt(s.bounds.height)} in` : '—'}</td></tr>
          <tr><th>Top of artwork</th><td>${s.bounds ? `${fmt(s.bounds.top)} in below ${DZ.GARMENTS[d.garment].bottom ? 'top of waistband' : 'HPS'}` : '—'}</td></tr>
          <tr><th>Horizontal</th><td>${s.bounds ? (Math.abs(s.bounds.left + s.bounds.width / 2) < 0.05 * DPI ? 'Centered' : `${fmt(Math.abs(s.bounds.left + s.bounds.width / 2))} in ${s.bounds.left + s.bounds.width / 2 > 0 ? 'right' : 'left'} of center (as viewed)`) : '—'}</td></tr>
          <tr><th>Technique</th><td>${esc(m.long)}</td></tr>
          ${method() === 'screen' ? `<tr><th>Screens</th><td>${PR.screens(s.analysis)}${DZ.isDark(color.hex) ? ' (incl. white underbase)' : ''}</td></tr>` : ''}
        </table>
        <table class="inks"><tr><th></th><th>Ink</th><th>HEX</th><th>Match</th></tr>${inkRows(s.analysis)}</table>
      </section>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.name)} — Tech pack</title><style>
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; }
      body { font: 10.5px -apple-system, Helvetica, Arial, sans-serif; color: #1b1b1b; margin: 0; padding: 9mm 11mm; }
      header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1b1b1b; padding-bottom: 6px; margin-bottom: 8px; }
      h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
      .meta { display: grid; grid-template-columns: repeat(4, auto); gap: 2px 18px; text-align: left; }
      .meta b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; font-weight: 600; }
      .sides { display: grid; grid-template-columns: repeat(${sides.length}, 1fr); gap: 18px; }
      h2 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.08em; }
      img { display: block; width: 100%; height: 92mm; object-fit: contain; border: 1px solid #ddd; background: #f6f4f0; }
      html, body { height: 210mm; overflow: hidden; }
      .side { break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; margin-top: 5px; }
      th, td { font-size: 9.5px; text-align: left; padding: 2px 6px; border-bottom: 1px solid #e3e3e3; vertical-align: middle; }
      .spec th { width: 32%; color: #666; font-weight: 600; }
      .inks th { color: #666; font-weight: 600; }
      .chip { display: inline-block; width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.2); }
      .notes { margin-top: 8px; border: 1px solid #ddd; padding: 6px 10px; min-height: 30px; white-space: pre-wrap; }
      .notes b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; margin-bottom: 4px; }
      footer { margin-top: 6px; color: #888; font-size: 9px; }
    </style></head><body>
      <header>
        <div><div class="meta"><div><b>Tech pack</b></div></div><h1>${esc(d.name)}</h1></div>
        <div class="meta">
          <div><b>Garment</b>${esc(garment)}</div>
          <div><b>Body color</b>${esc(color.name)} · ${color.hex}</div>
          <div><b>Technique</b>${esc(m.long)}</div>
          <div><b>Date</b>${date}</div>
        </div>
      </header>
      <div class="sides">${sidesHTML}</div>
      <div class="notes"><b>Notes for the factory</b>${esc(d.notes || 'Measurements are taken on a flat garment: HPS = high point shoulder (where shoulder seam meets collar). Artwork files are supplied as 300 DPI transparent PNGs at 1:1 print size.')}</div>
      <footer>Print files: ${sides.map((s) => `${DZ.io.slug(d.name)}-${d.garment}-${s.side}-${s.preset.w}x${s.preset.h}in-300dpi.png`).join(' · ')}</footer>
    </body></html>`;
  };

  PR.exportTechPack = async () => {
    const html = await PR.techPackHTML();
    const name = `${DZ.io.slug(E.doc.name)}-tech-pack.pdf`;
    const host = window.designHost;
    if (host && host.exportPDF) return host.exportPDF({ html, defaultName: name });
    const w = window.open('', '_blank');
    if (!w) throw new Error('Allow pop-ups to print the tech pack.');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
    return name;
  };
})();
