// Library (left), inspector + layers (right).
(function () {
  const E = DZ.editor;
  const IO = DZ.io;
  const I = DZ.ICONS;
  const { DPI, PT } = DZ;
  const P = (DZ.panels = {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inch = (u) => +(u / DPI).toFixed(2);

  // ================= LIBRARY =================
  let libTab = 'motifs';
  const thumb = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/#000/g, '#E8E2D6'));

  P.renderLibrary = () => {
    const body = $('lib-body');
    document.querySelectorAll('#library .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === libTab));
    if (libTab === 'motifs') {
      const groups = {};
      DZ.MOTIFS.forEach((m) => (groups[m.group] = groups[m.group] || []).push(m));
      body.innerHTML = Object.entries(groups).map(([g, items]) =>
        `<div class="lib-group">${esc(g)}</div><div class="motif-grid">` +
        items.map((m) =>
          `<button class="motif" draggable="true" data-motif="${m.id}" title="${esc(m.name)} — click to add, or drag onto the garment">` +
          `<img src="${thumb(m.svg)}" alt="" draggable="false"/><span>${esc(m.name)}</span></button>`
        ).join('') + '</div>'
      ).join('') + '<p class="lib-note">Motifs take the current ink color. Ungroup (⇧⌘G) to recolor parts.</p>';
    } else if (libTab === 'textures') {
      body.innerHTML =
        '<div class="lib-group">Distress</div><div class="texture-grid">' +
        DZ.TEXTURES.map((t) => `<button class="texture" data-texture="${t.id}" title="${esc(t.note)}"><img src="${DZ.textureThumb(t.id)}" alt="" draggable="false"/><span><strong>${esc(t.name)}</strong>${esc(t.note)}</span></button>`).join('') +
        '</div><p class="lib-note">Textures erase the print under them so the shirt shows through, like a worn vintage print. Select one from Layers to change its strength.</p>';
    } else if (libTab === 'words') {
      body.innerHTML =
        '<div class="lib-group">Layouts</div><div class="template-list">' +
        TEMPLATES.map((t, i) => `<button class="template" data-template="${i}"><strong>${esc(t.name)}</strong><span>${esc(t.desc)}</span></button>`).join('') +
        '</div><div class="lib-group">Greek lettering</div><div class="word-list">' +
        DZ.WORDS.map((w, i) =>
          `<button class="word" data-word="${i}" draggable="true"><span class="greek">${esc(w.text)}</span><span class="meaning">${esc(w.meaning)}</span></button>`
        ).join('') + '</div>';
    } else {
      body.innerHTML =
        `<button class="import-btn" data-act="import">${I.upload}<span>Import artwork…</span></button>` +
        '<p class="lib-note">PNG, JPG, WebP or SVG. You can also drop files on the garment or paste an image with ⌘V.</p>' +
        (IO.uploads.length
          ? '<div class="lib-group">This session</div><div class="motif-grid">' +
            IO.uploads.map((u) =>
              `<button class="motif" data-upload="${u.id}" title="${esc(u.name)}"><img src="${u.kind === 'svg' ? thumb(u.data) : u.data}" alt="" draggable="false"/><span>${esc(u.name)}</span></button>`
            ).join('') + '</div>'
          : '');
    }
  };

  function greekFont() {
    const f = DZ.FONTS.find((x) => x.family === E.state.font);
    return f && f.greek ? f.family : 'Noto Serif Display';
  }

  P.addWord = (i, at) => {
    const w = DZ.WORDS[i];
    const r = E.printRect();
    const t = E.newText(w.text, at || new fabric.Point(r.left + r.width / 2, r.top + r.height * 0.35), {
      fontFamily: /[Α-Ωα-ω]/.test(w.text) ? greekFont() : E.state.font,
      fontSize: Math.min(110, (r.width / DPI) * 9) * PT,
    });
    E.addObject(t, { name: w.text });
    return t;
  };

  P.addMotif = (id, at) => {
    const m = DZ.MOTIFS.find((x) => x.id === id);
    if (!m) return;
    return E.addSVG(m.svg, { name: m.name, motif: m.id, size: m.size, at });
  };

  // Ready-made compositions built from the library pieces.
  const TEMPLATES = [
    {
      name: 'Laurel crest', desc: 'Wreath, word, est. line',
      async build(r) {
        const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height, r.width) * 0.45;
        const size = Math.min(r.width, r.height) / DPI * 0.82;
        const wr = await E.addSVG(DZ.MOTIFS.find((m) => m.id === 'wreath').svg, { name: 'Laurel wreath', motif: 'wreath', size, at: new fabric.Point(cx, cy) });
        const word = E.newText('ΑΡΕΤΗ', new fabric.Point(cx, cy - size * DPI * 0.04), { fontFamily: greekFont(), fontSize: size * 7 * PT, charSpacing: 120 });
        E.addObject(word, { name: 'ΑΡΕΤΗ', select: false });
        const est = E.newText('EST. MMXXVI', new fabric.Point(cx, cy + size * DPI * 0.17), { fontFamily: 'Cinzel', fontSize: size * 2.2 * PT, charSpacing: 400 });
        E.addObject(est, { name: 'EST. MMXXVI', select: false });
        return [wr, word, est];
      },
    },
    {
      name: 'Arched back', desc: 'Curved word over a column',
      async build(r) {
        const cx = r.left + r.width / 2;
        const w = r.width / DPI;
        const t = E.newText('ΑΘΑΝΑΤΟΣ', new fabric.Point(cx, r.top + r.height * 0.16), { fontFamily: greekFont(), fontSize: w * 9 * PT, charSpacing: 160 });
        E.addObject(t, { name: 'ΑΘΑΝΑΤΟΣ', select: false });
        E.applyArc(t, 38);
        const col = await E.addSVG(DZ.MOTIFS.find((m) => m.id === 'ionic').svg, {
          name: 'Ionic column', motif: 'ionic', size: (r.height / DPI) * 0.62,
          at: new fabric.Point(cx, r.top + r.height * 0.6),
        });
        return [t, col];
      },
    },
    {
      name: 'Meander chest', desc: 'Word between key bands',
      async build(r) {
        const cx = r.left + r.width / 2, w = r.width / DPI;
        const top = r.top + Math.min(r.height * 0.18, 2.2 * DPI);
        const m = DZ.MOTIFS.find((x) => x.id === 'meander-tile');
        const band = async (y) => {
          const t = await E.addSVG(m.svg, { name: 'Meander tile', motif: m.id, size: w * 0.08 * 1.15, at: new fabric.Point(cx, y) });
          const g = await E.makeArray(t);
          await E.updateArray(g, { count: 10 });
          const a = E.active();
          a.setPositionByOrigin(new fabric.Point(cx, y), 'center', 'center');
          a.setCoords();
          return a;
        };
        const a = await band(top);
        const word = E.newText('ΚΛΕΟΣ', new fabric.Point(cx, top + w * 0.13 * DPI), { fontFamily: greekFont(), fontSize: w * 8 * PT, charSpacing: 260 });
        E.addObject(word, { name: 'ΚΛΕΟΣ', select: false });
        const b = await band(top + w * 0.26 * DPI);
        return [a, word, b];
      },
    },
    {
      name: 'Coin', desc: 'Beaded medallion with a letter',
      async build(r) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const size = Math.min(r.width, r.height) / DPI * 0.7;
        const c = await E.addSVG(DZ.MOTIFS.find((m) => m.id === 'medallion').svg, { name: 'Coin frame', motif: 'medallion', size, at: new fabric.Point(cx, cy) });
        const t = E.newText('Ω', new fabric.Point(cx, cy), { fontFamily: greekFont(), fontSize: size * 34 * PT, charSpacing: 0 });
        E.addObject(t, { name: 'Ω', select: false });
        return [c, t];
      },
    },
  ];

  P.TEMPLATES = TEMPLATES;

  P.addTemplate = async (i) => {
    const r = E.printRect();
    let objs;
    await E.batch(async () => {
      objs = await TEMPLATES[i].build(r);
    });
    E.selectObjects(objs.filter(Boolean));
  };

  function wireLibrary() {
    document.querySelectorAll('#library .tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        libTab = b.dataset.tab;
        P.renderLibrary();
      })
    );
    const body = $('lib-body');
    body.addEventListener('click', async (e) => {
      const el = e.target.closest('button');
      if (!el) return;
      try {
        if (el.dataset.motif) await P.addMotif(el.dataset.motif);
        else if (el.dataset.word) P.addWord(+el.dataset.word);
        else if (el.dataset.template) await P.addTemplate(+el.dataset.template);
        else if (el.dataset.texture) await E.addTexture(el.dataset.texture);
        else if (el.dataset.upload) await IO.placeUpload(IO.uploads.find((u) => u.id === el.dataset.upload));
        else if (el.dataset.act === 'import') await IO.pickImages();
        if (E.state.mode === 'preview') E.setMode('edit');
      } catch (err) {
        DZ.toast(err.message || String(err), true);
      }
    });
    body.addEventListener('dragstart', (e) => {
      const el = e.target.closest('[data-motif],[data-word]');
      if (!el) return;
      e.dataTransfer.setData('application/x-design', JSON.stringify(el.dataset.motif ? { motif: el.dataset.motif } : { word: +el.dataset.word }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    E.on('uploads', () => libTab === 'uploads' && P.renderLibrary());
  }

  // ================= INSPECTOR =================
  // Recently picked custom colors, offered after the brand palette.
  DZ.recentColors = DZ.recentColors || [];
  P.rememberColor = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '') || DZ.paletteName(hex)) return;
    const h = hex.toUpperCase();
    DZ.recentColors = [h, ...DZ.recentColors.filter((c) => c !== h)].slice(0, 6);
  };

  const swatches = (current, act, { none = true, custom = true } = {}) => {
    const cur = (current || '').toString().toUpperCase();
    let html = '<div class="swatches">';
    if (none) html += `<button class="sw none ${!current ? 'on' : ''}" data-act="${act}" data-c="" title="None">${I.none}</button>`;
    DZ.PALETTE.forEach((c) => {
      html += `<button class="sw ${c.hex.toUpperCase() === cur ? 'on' : ''}" style="--c:${c.hex}" data-act="${act}" data-c="${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`;
    });
    DZ.recentColors.forEach((h) => {
      html += `<button class="sw recent ${h === cur ? 'on' : ''}" style="--c:${h}" data-act="${act}" data-c="${h}" title="Custom ${h}" aria-label="Custom ${h}"></button>`;
    });
    if (custom) {
      const isCustom = current && /^#[0-9a-f]{6}$/i.test(current) && !DZ.paletteName(current) && !DZ.recentColors.includes(cur);
      html += `<label class="sw custom ${isCustom ? 'on' : ''}" title="Pick any color" style="--c:${isCustom ? current : '#888'}"><input type="color" data-act="${act}-custom" value="${/^#[0-9a-f]{6}$/i.test(current || '') ? current : '#888888'}"/></label>`;
    }
    return html + '</div>';
  };

  const num = (label, key, value, { step = 0.01, unit = '', min, max, title = '' } = {}) =>
    `<label class="num" title="${esc(title || label)}"><span>${label}</span><input type="number" data-key="${key}" value="${value}" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}/>${unit ? `<em>${unit}</em>` : ''}</label>`;

  const iconBtn = (act, icon, title, extra = '') => `<button class="ibtn ${extra}" data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}">${I[icon]}</button>`;

  const typeName = (o) => {
    if (o.isType('activeselection')) return `${o.getObjects().length} objects`;
    if (o.arrayMod) return 'Array';
    if (o.motif) return 'Motif';
    if (o.isType('i-text') || o.isType('text') || o.isType('textbox')) return 'Text';
    if (o.isType('image')) return 'Image';
    if (o.isType('group')) return 'Group';
    if (o.isType('path')) return 'Path';
    if (o.isType('rect')) return 'Rectangle';
    if (o.isType('ellipse') || o.isType('circle')) return 'Ellipse';
    if (o.isType('line')) return 'Line';
    return 'Shape';
  };
  const isText = (o) => o && (o.isType('i-text') || o.isType('text') || o.isType('textbox'));

  P.imageDPI = (img) => Math.round((DPI * img.width) / Math.max(1, img.getScaledWidth()));

  let ratioLocked = true;

  function docSection() {
    const d = E.doc;
    const presets = E.presetList();
    const cur = E.preset();
    const s = d.sides[d.side];
    let html = `<div class="section"><div class="sec-title">Garment</div><div class="swatches garment">`;
    DZ.GARMENT_COLORS.forEach((c) => {
      html += `<button class="sw big ${c.id === d.color ? 'on' : ''}" style="--c:${c.hex}" data-act="garment-color" data-id="${c.id}" title="${c.name}" aria-label="${c.name}"></button>`;
    });
    const gc = DZ.garmentColor(d.color);
    const customG = d.color && d.color.startsWith('#');
    html += `<label class="sw big custom ${customG ? 'on' : ''}" title="Any fabric color" style="--c:${customG ? d.color : '#888'}"><input type="color" data-act="garment-custom" value="${gc.hex}"/></label>`;
    html += `</div><div class="caption">${esc(gc.name)} ${esc(DZ.GARMENTS[d.garment].name.toLowerCase())}</div></div>`;

    html += `<div class="section"><div class="sec-title">Print area · ${d.side === 'front' ? 'Front' : 'Back'}</div>`;
    html += `<select class="select" data-key="preset">` +
      presets.map((p) => `<option value="${p.id}" ${s.preset === p.id ? 'selected' : ''}>${esc(p.name)} — ${p.w} × ${p.h} in</option>`).join('') +
      `<option value="custom" ${s.preset === 'custom' ? 'selected' : ''}>Custom…</option></select>`;
    if (s.preset === 'custom') {
      html += '<div class="grid2">' +
        num('W', 'pw', cur.w, { step: 0.25, unit: 'in', min: 1, max: 20 }) +
        num('H', 'ph', cur.h, { step: 0.25, unit: 'in', min: 1, max: 24 }) +
        num('Top', 'ptop', cur.top, { step: 0.25, unit: 'in', min: 0, max: 24, title: 'Distance below the shoulder seam' }) +
        num('Offset', 'px', cur.x, { step: 0.25, unit: 'in', min: -10, max: 10, title: 'Horizontal offset from center' }) +
        '</div>';
    }
    html += `<div class="caption">${Math.round(cur.w * DPI)} × ${Math.round(cur.h * DPI)} px at 300 DPI</div></div>`;

    // print method
    const PRM = DZ.production.METHODS;
    const m = d.method || 'dtg';
    html += `<div class="section"><div class="sec-title">Print method</div><div class="seg small method">` +
      Object.entries(PRM).map(([id, x]) => `<button data-act="method" data-m="${id}" class="${m === id ? 'on' : ''}">${x.name}</button>`).join('') +
      `</div><div class="caption">${esc(PRM[m].note)}</div></div>`;

    // inks used
    const an = DZ.production.analyze();
    if (an.inks.length) {
      html += `<div class="section"><div class="sec-title">${m === 'embroidery' ? 'Threads' : 'Inks'} in this design<span class="sec-aside">${m === 'screen' ? DZ.production.screens(an) + ' screens' : an.inks.length}</span></div><div class="ink-list">` +
        an.inks.map((i) => `<div class="ink-row ${inkEditing === i.hex ? 'open' : ''}"><button class="ink" data-act="ink-select" data-hex="${i.hex}" title="Select everything in this ink"><span class="chip" style="--c:${i.hex}"></span><span class="ink-name">${esc(i.name || 'Custom')}</span><span class="ink-hex">${i.hex}</span></button>` +
          `<button class="text-btn small" data-act="ink-edit" data-hex="${i.hex}">${inkEditing === i.hex ? 'Done' : 'Swap'}</button></div>` +
          (inkEditing === i.hex ? `<div class="ink-swap">${swatches(i.hex, 'ink-swap', { none: false })}</div>` : '')
        ).join('') + '</div><div class="caption">Swap an ink to try a colorway — every layer using it changes.</div></div>';
    }

    html += `<div class="section"><div class="sec-title">Ink for new objects</div>${swatches(E.state.ink, 'default-ink', { none: false })}` +
      `<button class="text-btn small edit-palette" data-act="edit-palette">Edit brand palette…</button></div>`;
    html += `<div class="section"><label class="toggle"><input type="checkbox" data-key="snapping" ${E.state.snapping ? 'checked' : ''}/><span>Smart guides (hold ⌘ to bypass)</span></label></div>`;

    const issues = DZ.production.checks();
    if (issues.length) html += `<div class="section"><div class="sec-title">Print checks · ${esc(PRM[m].name)}</div>${issues.map((c) => `<div class="${c.level === 'warn' ? 'issue' : 'note'}">${esc(c.text)}</div>`).join('')}</div>`;
    html += `<div class="section"><div class="sec-title">Notes for the printer</div><textarea class="notes" data-key="notes" rows="3" placeholder="e.g. Use water-based inks, soft hand. Print on Gildan 5000 Black.">${esc(d.notes || '')}</textarea><div class="caption">Printed on the tech pack.</div></div>`;
    return html;
  }

  P.checks = () => DZ.production.checks().filter((c) => c.level === 'warn').map((c) => c.text);

  P._legacyChecks = () => {
    const r = E.printRect();
    const out = [];
    let outside = 0, lowDpi = 0;
    E.canvas.getObjects().forEach((o) => {
      if (!o.visible) return;
      const b = o.getBoundingRect();
      if (b.left < r.left - 1 || b.top < r.top - 1 || b.left + b.width > r.left + r.width + 1 || b.top + b.height > r.top + r.height + 1) outside++;
      if (o.isType('image') && P.imageDPI(o) < 150) lowDpi++;
    });
    if (outside) out.push(`${outside} object${outside > 1 ? 's extend' : ' extends'} past the print area and will be cropped.`);
    if (lowDpi) out.push(`${lowDpi} image${lowDpi > 1 ? 's are' : ' is'} below 150 DPI at this size — may print blurry.`);
    return out;
  };

  function textureSection(a) {
    const colored = a.globalCompositeOperation !== 'destination-out';
    const kind = a.texture ? 'Texture' : 'Eraser stroke';
    let html = `<div class="section obj-head"><input class="obj-name" data-key="name" value="${esc(a.name)}" spellcheck="false" aria-label="Layer name"/><span class="obj-type">${kind}</span></div><div class="section">`;
    if (a.texture) {
      html += '<div class="seg small method">' +
        `<button data-act="tex-mode" data-mode="erase" class="${colored ? '' : 'on'}" title="Wears away the print, the garment shows through">Erase (distress)</button>` +
        `<button data-act="tex-mode" data-mode="color" class="${colored ? 'on' : ''}" title="Prints the texture in an ink color">Color</button></div>`;
      if (colored) html += `<div class="sec-title sub">Texture color</div>${swatches(a.tint, 'tint', { none: false })}`;
    }
    html += `<label class="slider"><span>Strength</span><input type="range" min="5" max="100" step="1" data-key="opacity" value="${Math.round(a.opacity * 100)}"/><em id="op-val">${Math.round(a.opacity * 100)}%</em></label>` +
      `<div class="caption">${colored ? 'Prints the texture as a color on top of the design below it — grain, cracks or wear in gold, cream, any ink.' : 'Erases the print where the texture is dark. Lower strength = subtler wear.'} Select it from Layers.</div>` +
      `<div class="btn-row">${iconBtn('flip-h', 'flipH', 'Flip horizontal')}${iconBtn('flip-v', 'flipV', 'Flip vertical')}<span class="flex"></span>${iconBtn('delete', 'trash', 'Delete (⌫)', 'danger')}</div></div>`;
    return html;
  }

  function effectsSection(a) {
    const sh = a.shadow;
    const on = !!sh;
    let html = `<div class="section"><label class="toggle"><input type="checkbox" data-key="shadowOn" ${on ? 'checked' : ''}/><span>Offset shadow</span></label>`;
    if (on) {
      html += swatches(DZ.production.norm(sh.color) || '#161514', 'shadow-color', { none: false }) +
        '<div class="grid2">' +
        num('X', 'shadowX', +(sh.offsetX / DZ.PT).toFixed(1), { step: 1, unit: 'pt' }) +
        num('Y', 'shadowY', +(sh.offsetY / DZ.PT).toFixed(1), { step: 1, unit: 'pt' }) +
        num('Blur', 'shadowBlur', +(sh.blur / DZ.PT).toFixed(1), { step: 1, unit: 'pt', min: 0, title: 'Keep at 0 for screen print' }) +
        '</div>';
    }
    return html + '</div>';
  }

  // ---------- Array modifier ----------
  const arrNum = (label, key, value, { step = 1, unit = '', min, max, title = '' } = {}) =>
    `<label class="num" title="${esc(title || label)}"><span>${label}</span><input type="number" data-arr="${key}" value="${value}" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}/>${unit ? `<em>${unit}</em>` : ''}</label>`;

  function arraySection(a) {
    const m = a.arrayMod;
    const modes = [['linear', 'Line'], ['circle', 'Circle'], ['grid', 'Grid']];
    let html = '<div class="section array-sec"><div class="sec-title">Array<span class="sec-aside">editable</span></div>' +
      `<div class="seg small method">${modes.map(([id, n]) => `<button data-act="array-mode" data-mode="${id}" class="${m.mode === id ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    if (m.mode === 'linear') {
      html += '<div class="grid2">' +
        arrNum('Count', 'count', m.count, { min: 1, max: 200 }) +
        arrNum('Rotate', 'rot', m.rot, { unit: '°', title: 'Extra rotation per copy' }) +
        arrNum('X', 'sx', m.sx, { unit: '%', title: 'Horizontal step, % of the object width (100 = touching)' }) +
        arrNum('Y', 'sy', m.sy, { unit: '%', title: 'Vertical step, % of the object height' }) +
        arrNum('Scale', 'scale', m.scale, { unit: '%', min: 10, max: 200, title: 'Size of each copy vs. the previous one' }) +
        arrNum('Fade', 'fade', m.fade || 0, { unit: '%', min: 0, max: 95, title: 'Opacity lost by the last copy' }) +
        '</div><div class="caption">X 100% joins border motifs seamlessly. Y gives diagonals.</div>';
    } else if (m.mode === 'circle') {
      html += '<div class="grid2">' +
        arrNum('Count', 'count', m.count, { min: 1, max: 200 }) +
        arrNum('Radius', 'radius', m.radius, { step: 0.1, unit: 'in', min: 0 }) +
        arrNum('Arc', 'arc', m.arc, { unit: '°', min: 1, max: 360, title: '360 = full ring' }) +
        arrNum('Start', 'start', m.start, { unit: '°' }) +
        '</div>' +
        `<label class="toggle"><input type="checkbox" data-arr="follow" ${m.follow ? 'checked' : ''}/><span>Rotate copies to follow the circle</span></label>`;
    } else {
      html += '<div class="grid2">' +
        arrNum('Cols', 'cols', m.cols, { min: 1, max: 60 }) +
        arrNum('Rows', 'rows', m.rows, { min: 1, max: 60 }) +
        arrNum('X', 'sx', m.sx, { unit: '%', title: 'Column step, % of the object width' }) +
        arrNum('Y', 'sy', m.sy, { unit: '%', title: 'Row step, % of the object height' }) +
        arrNum('Drop', 'drop', m.drop, { unit: '%', min: 0, max: 100, title: 'Half-drop: shifts every other column down' }) +
        '</div><div class="btn-row"><button class="text-btn small" data-act="array-fill">Fill print area</button></div>';
    }
    html += '<div class="btn-row"><button class="text-btn small" data-act="array-apply" title="Keep the copies as a normal group">Apply</button>' +
      '<button class="text-btn small" data-act="array-remove" title="Back to the single original">Remove</button></div></div>';
    return html;
  }

  async function runArray(fn) {
    try {
      await fn();
    } catch (err) {
      DZ.toast(err.message, true);
    }
    P.renderProps();
    P.renderLayers();
  }

  // ---------- Gradient fills ----------
  // gradDef = { kind: 'linear' | 'radial', angle, stops: [{ c, p }] } lives on the object (no
  // `type` key, or Fabric would revive it as a live object on load). The real Fabric gradients
  // are rebuilt on every leaf so one gradient spans the whole motif.
  let gradSel = 0;
  const leafList = (o) => (o.isType('group') ? o.getObjects().flatMap(leafList) : [o]);
  const visibleColor = (v) => !!v && v !== 'none' && v !== 'transparent';
  P.applyGradient = (o) => {
    const g = o.gradDef;
    if (!g || !Array.isArray(g.stops)) return;
    const group = o.isType('group');
    const W = o.width, H = o.height;
    const x0 = group ? -W / 2 : 0, y0 = group ? -H / 2 : 0;
    const cx = x0 + W / 2, cy = y0 + H / 2;
    const rad = ((g.angle || 0) * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    const L = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
    const stops = [...g.stops].sort((a, b) => a.p - b.p).map((s) => ({ offset: Math.max(0, Math.min(1, s.p / 100)), color: s.c }));
    const artwork = group || !!o.motif;
    leafList(o).forEach((leaf) => {
      let ox = 0, oy = 0, sx = 1, sy = 1;
      if (group) {
        const tl = leaf.translateToGivenOrigin(new fabric.Point(leaf.left, leaf.top), leaf.originX, leaf.originY, 'left', 'top');
        ox = tl.x; oy = tl.y; sx = leaf.scaleX || 1; sy = leaf.scaleY || 1;
      }
      const T = (x, y) => [(x - ox) / sx, (y - oy) / sy];
      let coords;
      if (g.kind === 'radial') {
        const [x, y] = T(cx, cy);
        coords = { x1: x, y1: y, x2: x, y2: y, r1: 0, r2: Math.hypot(W, H) / 2 / sx };
      } else {
        const [x1, y1] = T(cx - dx * L, cy - dy * L), [x2, y2] = T(cx + dx * L, cy + dy * L);
        coords = { x1, y1, x2, y2 };
      }
      const make = () => new fabric.Gradient({ type: g.kind, gradientUnits: 'pixels', coords, colorStops: stops });
      const hasFill = visibleColor(leaf.fill) || (leaf.fill && typeof leaf.fill === 'object');
      const hasStroke = (visibleColor(leaf.stroke) || (leaf.stroke && typeof leaf.stroke === 'object')) && leaf.strokeWidth > 0;
      if (hasFill || !hasStroke) leaf.set('fill', make());
      if (hasStroke && artwork) leaf.set('stroke', make());
      leaf.set('dirty', true);
    });
    o.set('dirty', true);
    E.canvas.requestRenderAll();
  };
  const cssGrad = (g) => `linear-gradient(90deg, ${[...g.stops].sort((a, b) => a.p - b.p).map((s) => `${s.c} ${s.p}%`).join(', ')})`;

  function gradientEditor(a) {
    const g = a.gradDef;
    gradSel = Math.min(gradSel, g.stops.length - 1);
    const cur = g.stops[gradSel];
    let html = `<div class="grad-bar" style="background:${cssGrad(g)}">` +
      g.stops.map((s, i) => `<button class="grad-stop ${i === gradSel ? 'on' : ''}" data-act="grad-stop" data-i="${i}" style="left:${s.p}%;--c:${s.c}" title="Color stop ${i + 1}" aria-label="Color stop ${i + 1}"></button>`).join('') +
      '</div>' +
      `<div class="sec-title sub">Stop ${gradSel + 1} color</div>${swatches(cur.c, 'grad-color', { none: false })}` +
      `<label class="slider"><span>Position</span><input type="range" min="0" max="100" step="1" data-grad="pos" value="${cur.p}"/><em data-grad-val="pos">${cur.p}%</em></label>`;
    if (g.kind === 'linear') html += `<label class="slider"><span>Angle</span><input type="range" min="0" max="360" step="1" data-grad="angle" value="${g.angle || 0}"/><em data-grad-val="angle">${g.angle || 0}°</em></label>`;
    html += '<div class="btn-row"><button class="text-btn small" data-act="grad-add">Add stop</button>' +
      (g.stops.length > 2 ? '<button class="text-btn small" data-act="grad-remove">Remove stop</button>' : '') +
      '<button class="text-btn small" data-act="grad-reverse">Reverse</button></div>';
    return html;
  }

  const mix = (a, b) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round((((pa >> sh) & 255) + ((pb >> sh) & 255)) / 2);
    return '#' + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  function setFillKind(a, kind) {
    if (kind === 'solid') {
      if (!a.gradDef) return;
      const c = a.gradDef.stops[0].c;
      a.gradDef = null;
      if (a.isType('group') || a.motif) E.setInk(a, c);
      else a.set('fill', c);
      return;
    }
    const base = DZ.production.norm(E.inkOf(a)) || E.state.ink;
    const other = DZ.PALETTE.find((p) => p.hex.toUpperCase() !== base.toUpperCase() && p.id === 'gold') || DZ.PALETTE.find((p) => p.hex.toUpperCase() !== base.toUpperCase());
    a.gradDef = a.gradDef ? Object.assign({}, a.gradDef, { kind }) : { kind, angle: 90, stops: [{ c: base, p: 0 }, { c: other.hex, p: 100 }] };
    gradSel = 0;
    P.bakeAdjust(a);
    P.applyGradient(a);
  }

  // ---------- Distort / warp ----------
  function distortSection(a) {
    const img = a.isType('image');
    const editing = DZ.warp.editing() === a;
    const mode = a.warp && a.warp.mode;
    let html = `<div class="section"><div class="sec-title">Distort${a.warp ? '<button class="sec-link" data-act="warp-reset">Reset</button>' : ''}</div>` +
      '<div class="seg small method">' +
      `<button data-act="warp-start" data-mode="perspective" class="${editing && mode === 'perspective' ? 'on' : ''}" title="Drag the 4 corners — perspective">Corners</button>` +
      `<button data-act="warp-start" data-mode="mesh" class="${editing && mode === 'mesh' ? 'on' : ''}" title="Drag a 4×4 grid — bend freely">Warp</button>` +
      '</div>' +
      '<label class="slider" title="Bend along an arc — negative follows a hem, positive arches over the chest"><span>Arc</span><input type="range" min="-100" max="100" step="1" data-warp-arc value="${(a.warp && a.warp.arc) || 0}"/><em data-warp-val>${(a.warp && a.warp.arc) || 0}</em></label>';
    if (editing) html += '<div class="btn-row"><button class="text-btn small on" data-act="warp-done">Done</button></div><div class="caption">Drag the blue points on the canvas. Reset puts it back flat.</div>';
    else if (!img) html += '<div class="caption">Distorting turns this into a 300 DPI image.</div>';
    else html += '<div class="caption">Corners for perspective (a patch on a pocket), Warp or Arc to follow the garment’s curves — e.g. a pattern along the curved hem.</div>';
    if (!img) html += '<div class="btn-row"><button class="text-btn small" data-act="merge">Convert to image</button></div>';
    return html + '</div>';
  }

  // ---------- Adjust (color / tone) ----------
  // Images: non-destructive Fabric filters. Vectors (motifs, text, shapes): hue, saturation
  // and lightness applied to their real ink colors, so print checks and separations see the
  // result; the original colors are kept in adjustBase until a new color is picked.
  const ADJ_IMG = [
    ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['saturation', 'Saturation'],
    ['vibrance', 'Vibrance'], ['hue', 'Hue'], ['warmth', 'Warmth'],
    ['blur', 'Blur', 0, 100], ['sharpen', 'Sharpen', 0, 100], ['grain', 'Grain', 0, 100],
  ];
  const ADJ_VEC = [['hue', 'Hue'], ['saturation', 'Saturation'], ['brightness', 'Lightness']];

  function adjustSection(a) {
    if (E.isTexture(a)) return '';
    const isImg = a.isType('image');
    const adj = a.adjust || {};
    const rows = (isImg ? ADJ_IMG : ADJ_VEC).map(([k, label, min = -100, max = 100]) =>
      `<label class="slider" title="Double-click to reset"><span>${label}</span><input type="range" min="${min}" max="${max}" step="1" data-adj="${k}" value="${adj[k] || 0}"/><em data-adj-val="${k}">${adj[k] || 0}</em></label>`).join('');
    const toggles = isImg
      ? `<div class="btn-row adj-toggles"><button class="text-btn small ${adj.mono ? 'on' : ''}" data-act="adj-toggle" data-k="mono">Black &amp; white</button>` +
        `<button class="text-btn small ${adj.invert ? 'on' : ''}" data-act="adj-toggle" data-k="invert">Invert</button>` +
        `<button class="text-btn small ${adj.sepia ? 'on' : ''}" data-act="adj-toggle" data-k="sepia">Vintage</button></div>`
      : '';
    const any = Object.values(adj).some(Boolean);
    return `<div class="section"><div class="sec-title">Adjust${any ? '<button class="sec-link" data-act="adj-reset">Reset</button>' : ''}</div>${rows}${toggles}</div>`;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return ('#' + to(r) + to(g) + to(b)).toUpperCase();
  }
  function adjustColor(color, adj) {
    const hex = DZ.production.norm(color);
    if (!hex) return color;
    let [h, s, l] = hexToHsl(hex);
    h += (adj.hue || 0) * 1.8;
    const sv = (adj.saturation || 0) / 100;
    s = clamp(sv >= 0 ? s + (1 - s) * sv : s * (1 + sv), 0, 1);
    const lv = (adj.brightness || 0) / 100;
    l = clamp(lv >= 0 ? l + (1 - l) * lv : l * (1 + lv), 0, 1);
    return hslToHex(h, s, l);
  }
  const leaves = (o) => (o.isType('group') ? o.getObjects().flatMap(leaves) : [o]);
  function applyVectorAdjust(o) {
    const list = leaves(o);
    const adj = o.adjust || {};
    const isColor = (v) => typeof v === 'string' && v && v !== 'none' && v !== 'transparent';
    if (!o.adjustBase) o.adjustBase = list.map((x) => ({ f: isColor(x.fill) ? x.fill : null, s: isColor(x.stroke) ? x.stroke : null }));
    const active = ['hue', 'saturation', 'brightness'].some((k) => adj[k]);
    list.forEach((x, i) => {
      const b = o.adjustBase[i];
      if (!b) return;
      if (b.f) x.set('fill', active ? adjustColor(b.f, adj) : b.f);
      if (b.s) x.set('stroke', active ? adjustColor(b.s, adj) : b.s);
      x.set('dirty', true);
    });
    o.set('dirty', true);
    if (!active) {
      o.adjust = null;
      o.adjustBase = null;
    }
    E.canvas.requestRenderAll();
  }
  // A newly picked color becomes the new original.
  P.bakeAdjust = (o) => {
    if (o && !o.isType('image') && o.adjustBase) {
      o.adjust = null;
      o.adjustBase = null;
    }
  };

  let adjRaf = 0;
  function applyAdjust(a) {
    if (a.isType('image')) {
      cancelAnimationFrame(adjRaf);
      adjRaf = requestAnimationFrame(() => applyImageFilters(a));
    } else applyVectorAdjust(a);
  }

  function objectSection(a) {
    if (E.isTexture(a)) return textureSection(a);
    const multi = a.isType('activeselection');
    const r = E.printRect();
    const b = a.getBoundingRect();
    let html = '<div class="section obj-head">';
    if (multi) html += `<div class="obj-name static">${typeName(a)}</div>`;
    else html += `<input class="obj-name" data-key="name" value="${esc(a.name || typeName(a))}" spellcheck="false" aria-label="Layer name"/><span class="obj-type">${typeName(a)}</span>`;
    html += '</div>';
    if (!multi && E.isArray(a)) html += arraySection(a);

    // transform
    html += '<div class="section"><div class="grid2">' +
      num('X', 'x', inch(b.left - r.left), { step: 0.05, unit: 'in', title: 'Left edge, from the print area' }) +
      num('Y', 'y', inch(b.top - r.top), { step: 0.05, unit: 'in', title: 'Top edge, from the print area' }) +
      num('W', 'w', inch(a.getScaledWidth()), { step: 0.05, unit: 'in', min: 0.01 }) +
      num('H', 'h', inch(a.getScaledHeight()), { step: 0.05, unit: 'in', min: 0.01 }) +
      num('°', 'angle', Math.round(a.angle || 0), { step: 1, title: 'Rotation' }) +
      `<button class="ibtn ratio ${ratioLocked ? 'on' : ''}" data-act="ratio" title="${ratioLocked ? 'Proportions locked' : 'Proportions free'}" aria-label="Lock proportions">${ratioLocked ? I.link : I.unlink}</button>` +
      '</div>';
    html += '<div class="btn-row">' +
      iconBtn('align-left', 'alignLeft', 'Align left') + iconBtn('align-hcenter', 'alignHCenter', 'Align horizontal centers') +
      iconBtn('align-right', 'alignRight', 'Align right') + iconBtn('align-top', 'alignTop', 'Align top') +
      iconBtn('align-vcenter', 'alignVCenter', 'Align vertical centers') + iconBtn('align-bottom', 'alignBottom', 'Align bottom') +
      '</div>';
    html += `<div class="caption">${multi ? 'Aligns to the selection' : 'Aligns to the print area'}</div>`;
    if (multi && a.getObjects().length >= 3) {
      html += '<div class="btn-row">' + iconBtn('dist-h', 'distH', 'Distribute horizontally') + iconBtn('dist-v', 'distV', 'Distribute vertically') + '</div>';
    }
    html += '</div>';

    // arrange
    html += '<div class="section"><div class="btn-row">' +
      iconBtn('front', 'front', 'Bring to front (⇧⌘])') + iconBtn('forward', 'forward', 'Bring forward (⌘])') +
      iconBtn('backward', 'backward', 'Send backward (⌘[)') + iconBtn('back', 'back', 'Send to back (⇧⌘[)') +
      iconBtn('flip-h', 'flipH', 'Flip horizontal') + iconBtn('flip-v', 'flipV', 'Flip vertical') +
      '</div><div class="btn-row">' +
      iconBtn('duplicate', 'duplicate', 'Duplicate (⌘D)') +
      (multi ? iconBtn('group', 'group', 'Group (⌘G)') : '') +
      (!multi && a.isType('group') ? iconBtn('ungroup', 'ungroup', 'Ungroup (⇧⌘G)') : '') +
      (!multi && a.isType('path') ? `<button class="text-btn small" data-act="edit-points">Edit points</button>` : '') +
      (!multi && !E.isArray(a) ? `<button class="text-btn small" data-act="array-make" title="Duplicate in a line, circle or grid (editable)">Array</button>` : '') +
      '<span class="flex"></span>' + iconBtn('delete', 'trash', 'Delete (⌫)', 'danger') +
      '</div></div>';

    // appearance
    const objs = multi ? a.getObjects() : [a];
    const first = objs[0];
    const fill = E.inkOf(first);
    const isImg = !multi && a.isType('image');
    if (!isImg) {
      const strokeOnlyGroup = first.isType('group') || !!first.motif;
      const canGrad = !multi && !first.isType('line');
      const kind = (a.gradDef && a.gradDef.kind) || 'solid';
      html += `<div class="section"><div class="sec-title">${strokeOnlyGroup || first.isType('line') ? 'Color' : 'Fill'}</div>`;
      if (canGrad) {
        html += '<div class="seg small method fill-kind">' +
          [['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial']].map(([k, n]) => `<button data-act="fill-kind" data-kind="${k}" class="${kind === k ? 'on' : ''}">${n}</button>`).join('') + '</div>';
      }
      html += canGrad && a.gradDef && Array.isArray(a.gradDef.stops) ? gradientEditor(a) : swatches(first.isType('line') ? first.stroke : fill, 'fill', { none: !first.isType('line') && !strokeOnlyGroup });
      if (!strokeOnlyGroup && !first.isType('line')) {
        const sw = first.strokeWidth && first.stroke ? +(first.strokeWidth / PT).toFixed(1) : 0;
        html += `<div class="sec-title sub">Stroke</div>${swatches(first.stroke && sw ? first.stroke : null, 'stroke')}` +
          `<div class="grid2">${num('Weight', 'strokeWidth', sw, { step: 0.5, unit: 'pt', min: 0 })}</div>`;
      } else if (first.isType('line')) {
        html += `<div class="grid2">${num('Weight', 'strokeWidth', +(first.strokeWidth / PT).toFixed(1), { step: 0.5, unit: 'pt', min: 0.1 })}</div>`;
      }
      html += '</div>';
    }

    // text
    if (!multi && isText(a)) {
      const f = DZ.FONTS.find((x) => x.family === a.fontFamily) || DZ.FONTS[0];
      const hasGreek = /[Ͱ-Ͽἀ-῿]/.test(a.text);
      html += '<div class="section"><div class="sec-title">Type</div>' +
        `<select class="select font-select" data-key="fontFamily" style="font-family:'${esc(a.fontFamily)}'">` +
        DZ.FONTS.map((x) => `<option value="${esc(x.family)}" ${x.family === a.fontFamily ? 'selected' : ''}>${esc(x.label)} — ${esc(x.note)}</option>`).join('') +
        '</select>';
      if (hasGreek && !f.greek) html += '<div class="issue">This font has no Greek letters — pick GFS Didot, Noto Serif Display or Inter.</div>';
      html += '<div class="grid2">' +
        num('Size', 'fontSize', +((a.fontSize * a.scaleY) / PT).toFixed(1), { step: 1, unit: 'pt', min: 4 }) +
        num('Track', 'charSpacing', Math.round(a.charSpacing || 0), { step: 10, title: 'Letter spacing (1/1000 em)' }) +
        num('Leading', 'lineHeight', +(a.lineHeight || 1).toFixed(2), { step: 0.05, min: 0.5, max: 3, title: 'Line height' }) +
        `<div class="seg small weight">` +
        f.weights.map((w) => `<button data-act="weight" data-w="${w}" class="${+a.fontWeight === w || (a.fontWeight === 'normal' && w === 400) || (a.fontWeight === 'bold' && w === 700) ? 'on' : ''}">${w === 400 ? 'Regular' : w === 600 ? 'Semi' : w === 700 ? 'Bold' : 'Heavy'}</button>`).join('') +
        '</div></div>' +
        '<div class="btn-row">' +
        ['left', 'center', 'right'].map((al) => `<button class="text-btn small ${a.textAlign === al ? 'on' : ''}" data-act="text-align" data-al="${al}">${al[0].toUpperCase() + al.slice(1)}</button>`).join('') +
        '<button class="text-btn small" data-act="upper" title="Convert to capitals">AA</button></div>' +
        `<label class="slider"><span>Arc</span><input type="range" min="-100" max="100" step="1" data-key="arc" value="${a.arc || 0}"/><em id="arc-val">${a.arc || 0}</em></label>` +
        '<div class="caption">Double-click text on the garment to edit it.</div></div>';
    }

    // image
    if (isImg) {
      const dpi = P.imageDPI(a);
      const k = a.knockout || null;
      html += '<div class="section"><div class="sec-title">Image</div>' +
        `<div class="dpi ${dpi < 150 ? 'bad' : dpi < 250 ? 'ok' : 'good'}"><strong>${dpi} DPI</strong> at this size · ${a.width} × ${a.height} px</div>` +
        `<label class="toggle"><input type="checkbox" data-key="knockout" ${k ? 'checked' : ''}/><span>Remove white background</span></label>` +
        (k ? `<label class="slider"><span>Tolerance</span><input type="range" min="1" max="60" step="1" data-key="knockoutTol" value="${Math.round((k.tol || 0.12) * 100)}"/></label>` : '') +
        `<label class="toggle"><input type="checkbox" data-key="tintOn" ${a.tint ? 'checked' : ''}/><span>One-color (tint to ink)</span></label>` +
        (a.tint ? swatches(a.tint, 'tint', { none: false }) : '') +
        '</div>';
    }

    if (!multi && a.clipPath) html += '<div class="section"><div class="sec-title">Alpha lock</div><div class="caption">Painted only on its layer’s art (as it was when you painted).</div><div class="btn-row"><button class="text-btn small" data-act="unclip">Release</button><button class="text-btn small" data-act="reclip" title="Re-clip to the layer’s current art">Update to layer</button></div></div>';
    if (!multi) html += adjustSection(a);
    if (!multi && !E.isTexture(a)) html += distortSection(a);
    if (multi) html += '<div class="section"><div class="sec-title">Combine</div><div class="btn-row"><button class="text-btn small" data-act="merge" title="⌥⌘E">Merge into one image</button></div><div class="caption">Flattens the selection into a single 300 DPI image — then you can erase, lasso or distort it as one piece.</div></div>';
    if (!multi && !a.isType('image')) html += effectsSection(a);

    // opacity
    html += `<div class="section"><label class="slider"><span>Opacity</span><input type="range" min="0" max="100" step="1" data-key="opacity" value="${Math.round((first.opacity ?? 1) * 100)}"/><em id="op-val">${Math.round((first.opacity ?? 1) * 100)}%</em></label></div>`;
    return html;
  }

  P.renderProps = () => {
    const a = E.active();
    const edit = E.state.mode === 'edit';
    const extra = edit && DZ.brush.isTool(E.state.tool) ? brushSection() : edit && (E.state.tool === 'wand' || E.state.tool === 'lasso') ? wandSection() : '';
    $('props').innerHTML = a && edit ? objectSection(a) : extra + docSection();
    collapsify(a && edit ? a : null);
  };

  // ---------- progressive disclosure ----------
  // Every inspector section gets a clickable header with a disclosure chevron. Everyday
  // sections start open; advanced ones (Adjust, Distort, Shadow, Notes…) start closed and show
  // a short summary when they hold changes. Open/closed state is remembered per section.
  const CLOSED_BY_DEFAULT = new Set(['adjust', 'distort', 'shadow', 'notes', 'guides', 'combine', 'alpha']);
  let collapseState = {};
  try { collapseState = JSON.parse(localStorage.getItem('dz-sections') || '{}'); } catch {}
  const saveCollapse = () => { try { localStorage.setItem('dz-sections', JSON.stringify(collapseState)); } catch {} };
  const slug = (t) => t.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

  const firstTitle = (sec) => {
    const f = sec.firstElementChild;
    return f && f.classList.contains('sec-title') && !f.classList.contains('sub') ? f : null;
  };
  function sectionTitle(sec) {
    if (sec.querySelector(':scope > .sec-title')) return '';
    if (sec.querySelector('[data-key="x"]')) return 'Position & size';
    if (sec.querySelector('[data-act="front"]')) return 'Arrange';
    if (sec.querySelector('[data-key="shadowOn"]')) return 'Shadow';
    if (sec.querySelector('[data-key="snapping"]')) return 'Guides';
    if (sec.querySelector('[data-key="opacity"]') && !sec.querySelector('.sec-title')) return 'Opacity';
    return '';
  }

  function summaryFor(id, a) {
    if (!a) return '';
    if (id === 'adjust' && a.adjust && Object.values(a.adjust).some(Boolean)) return 'Edited';
    if (id === 'distort' && a.warp) return a.warp.arc ? `Arc ${a.warp.arc}` : a.warp.mode === 'perspective' ? 'Corners' : 'Warped';
    if (id === 'shadow' && a.shadow) return 'On';
    if (id === 'opacity' && a.opacity < 1) return Math.round(a.opacity * 100) + '%';
    return '';
  }

  function collapsify(a) {
    const root = $('props');
    root.querySelectorAll(':scope > .section').forEach((sec) => {
      if (sec.classList.contains('obj-head')) return;
      let head = firstTitle(sec);
      const synthetic = head ? '' : sectionTitle(sec);
      if (!head) {
        if (!synthetic) return;
        head = document.createElement('div');
        head.className = 'sec-title';
        head.textContent = synthetic;
        sec.prepend(head);
      }
      const label = (head.childNodes[0] && head.childNodes[0].textContent ? head.childNodes[0].textContent : head.textContent).trim();
      const id = slug(label.split('·')[0]) || 'section';
      const body = document.createElement('div');
      body.className = 'sec-body';
      while (head.nextSibling) body.appendChild(head.nextSibling);
      sec.appendChild(body);
      const closedDefault = [...CLOSED_BY_DEFAULT].some((c) => id === c || id.startsWith(c + '-'));
      const open = collapseState[id] !== undefined ? collapseState[id] : !closedDefault;
      sec.classList.add('coll');
      sec.classList.toggle('open', open);
      sec.dataset.sec = id;
      head.classList.add('sec-head');
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      head.setAttribute('aria-expanded', open);
      head.insertAdjacentHTML('afterbegin', '<span class="chev" aria-hidden="true"></span>');
      const sum = summaryFor(id, a);
      if (sum) head.insertAdjacentHTML('beforeend', `<span class="sec-sum">${esc(sum)}</span>`);
    });
  }

  function toggleSection(head) {
    const sec = head.closest('.section');
    const open = !sec.classList.contains('open');
    sec.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open);
    collapseState[sec.dataset.sec] = open;
    saveCollapse();
  }

  function wandSection() {
    const w = E.state.wand;
    const has = DZ.wand.has();
    const lasso = E.state.tool === 'lasso';
    let html = `<div class="section brush-sec"><div class="sec-title">${lasso ? 'Lasso' : 'Magic wand'}</div>` + (lasso ? '' :
      `<label class="slider"><span>Tolerance</span><input type="range" min="0" max="100" step="1" data-wand="tol" value="${w.tol}"/><em data-wand-val="tol">${w.tol}</em></label>` +
      `<label class="toggle"><input type="checkbox" data-wand="contiguous" ${w.contiguous ? 'checked' : ''}/><span>Contiguous (only touching pixels)</span></label>`);
    if (has) {
      const pct = Math.max(0.1, (100 * DZ.wand.count()) / DZ.wand.total()).toFixed(1);
      html += `<div class="caption">${DZ.wand.count().toLocaleString()} px selected · ${pct}% of the image</div>` +
        '<div class="btn-row wand-actions">' +
        '<button class="text-btn small" data-act="wand" data-w="delete" title="⌫">Delete</button>' +
        '<button class="text-btn small" data-act="wand" data-w="keep">Keep only</button>' +
        '<button class="text-btn small" data-act="wand" data-w="fill">Fill with ink</button>' +
        '<button class="text-btn small" data-act="wand" data-w="copy">Copy to new layer</button>' +
        '<button class="text-btn small" data-act="wand" data-w="cutDistort" title="Lift the selection onto its own layer and drag its corners">Cut &amp; distort</button>' +
        '<button class="text-btn small" data-act="wand" data-w="invert">Invert</button>' +
        '<button class="text-btn small" data-act="wand" data-w="clear" title="Esc">Deselect</button></div>';
      html += `<div class="sec-title sub">Fill ink</div>${swatches(E.state.ink, 'default-ink', { none: false })}`;
    } else {
      if (lasso) html += '<div class="caption">Drag around part of a photo, brush stroke or merged art to select it. Shift adds, Option subtracts. Then Delete, Keep only, Fill, or Cut &amp; distort to bend just that piece.</div>';
      else html += '<div class="caption">Click a color in a photo or brush stroke to select it — great for dropping a white or flat background. Shift-click adds, Option-click subtracts. Click vector art to select every object in that color.</div>';
    }
    return html + '</div>';
  }

  const thumbs = {};
  function brushSection() {
    const eraser = E.state.tool === 'eraser';
    const st = eraser ? E.state.eraser : E.state.brush;
    const color = eraser ? '#E8E2D6' : E.state.ink;
    const tiles = DZ.BRUSHES.map((b) => {
      const key = b.id + color;
      if (!thumbs[key]) thumbs[key] = DZ.brush.thumb(b.id, color);
      return `<button class="brush-tile ${st.id === b.id ? 'on' : ''}" data-act="brush-pick" data-id="${b.id}" title="${esc(b.note)}"><img src="${thumbs[key]}" alt=""/><span>${b.name}</span></button>`;
    }).join('');
    const slider = (k, label, min, max, unit = '') =>
      `<label class="slider"><span>${label}</span><input type="range" min="${min}" max="${max}" step="1" data-bk="${k}" value="${st[k]}"/><em data-bk-val="${k}">${st[k]}${unit}</em></label>`;
    let html = `<div class="section brush-sec"><div class="sec-title">${eraser ? 'Eraser' : 'Brush'}<span class="sec-aside">[ ] size</span></div><div class="brush-grid">${tiles}</div>` +
      slider('size', 'Size', 1, 200, ' pt') + (eraser ? '' : slider('opacity', 'Opacity', 5, 100, '%')) + slider('texture', 'Texture', 0, 100, '%');
    if (eraser) html += '<div class="caption">Rubs out images and brush strokes in the active layer. Over vector art it adds an eraser stroke that knocks out what’s below.</div>';
    else html += `<div class="sec-title sub">Color</div>${swatches(E.state.ink, 'default-ink', { none: false })}<div class="caption">Each stroke becomes a 300 DPI image layer you can move, erase or adjust.</div>`;
    return html + '</div>';
  }

  // Live-update the transform numbers while dragging, without rebuilding the panel.
  P.refreshTransform = () => {
    const a = E.active();
    if (!a) return;
    const r = E.printRect();
    const b = a.getBoundingRect();
    const vals = { x: inch(b.left - r.left), y: inch(b.top - r.top), w: inch(a.getScaledWidth()), h: inch(a.getScaledHeight()), angle: Math.round(a.angle || 0) };
    for (const [k, v] of Object.entries(vals)) {
      const el = document.querySelector(`#props input[data-key="${k}"]`);
      if (el && document.activeElement !== el) el.value = v;
    }
    if (isText(a)) {
      const el = document.querySelector('#props input[data-key="fontSize"]');
      if (el && document.activeElement !== el) el.value = +((a.fontSize * a.scaleY) / PT).toFixed(1);
    }
  };

  let inkEditing = null;
  P.applyImageFilters = (img) => applyImageFilters(img);
  function applyImageFilters(img) {
    const f = [];
    if (img.knockout) f.push(new fabric.filters.RemoveColor({ color: '#FFFFFF', distance: img.knockout.tol || 0.12 }));
    const j = img.adjust || {};
    const F = fabric.filters;
    if (j.brightness) f.push(new F.Brightness({ brightness: j.brightness / 200 }));
    if (j.contrast) f.push(new F.Contrast({ contrast: j.contrast / 150 }));
    if (j.saturation) f.push(new F.Saturation({ saturation: j.saturation / 100 }));
    if (j.vibrance) f.push(new F.Vibrance({ vibrance: j.vibrance / 100 }));
    if (j.hue) f.push(new F.HueRotation({ rotation: j.hue / 100 }));
    if (j.warmth) {
      const w = j.warmth / 100;
      f.push(new F.ColorMatrix({ matrix: [1 + w * 0.12, 0, 0, 0, w * 0.03, 0, 1, 0, 0, 0, 0, 0, 1 - w * 0.12, 0, -w * 0.03, 0, 0, 0, 1, 0] }));
    }
    if (j.mono) f.push(new F.Grayscale());
    if (j.sepia) f.push(new F.Sepia());
    if (j.invert) f.push(new F.Invert());
    if (j.sharpen) {
      const k = j.sharpen / 100;
      f.push(new F.Convolute({ matrix: [0, -k, 0, -k, 1 + 4 * k, -k, 0, -k, 0] }));
    }
    if (j.blur) f.push(new F.Blur({ blur: j.blur / 400 }));
    if (j.grain) f.push(new F.Noise({ noise: j.grain * 1.5 }));
    if (img.tint) f.push(new fabric.filters.BlendColor({ color: img.tint, mode: 'tint', alpha: 1 }));
    img.filters = f;
    img.applyFilters();
    E.canvas.requestRenderAll();
  }

  const targets = () => {
    const a = E.active();
    if (!a) return [];
    return a.isType('activeselection') ? a.getObjects() : [a];
  };

  function commit() {
    E.canvas.requestRenderAll();
    E.record();
    P.renderLayers();
  }

  function setColor(act, c) {
    if (act === 'default-ink') {
      E.state.ink = c;
      P.renderProps();
      return;
    }
    if (act === 'tint') {
      const a = E.active();
      a.tint = c;
      applyImageFilters(a);
      commit();
      P.renderProps();
      return;
    }
    targets().forEach((o) => {
      if (act === 'fill') {
        P.bakeAdjust(o);
        o.gradDef = null;
        if (o.isType('line')) o.set('stroke', c || E.state.ink);
        else if (o.isType('group') || o.motif) E.setInk(o, c || E.state.ink);
        else o.set('fill', c || '');
        if (c) E.state.ink = c;
      } else if (act === 'stroke') {
        o.set('stroke', c || null);
        if (c && !o.strokeWidth) o.set('strokeWidth', E.state.strokePt * PT);
        if (!c) o.set('strokeWidth', 0);
        E.state.stroke = c || null;
      }
      o.set('dirty', true);
    });
    commit();
    P.renderProps();
  }

  function setNumber(key, v) {
    const a = E.active();
    if (!a || !isFinite(v)) return;
    const r = E.printRect();
    if (key === 'x' || key === 'y') {
      const b = a.getBoundingRect();
      if (key === 'x') a.set('left', a.left + (r.left + v * DPI - b.left));
      else a.set('top', a.top + (r.top + v * DPI - b.top));
    } else if (key === 'w' || key === 'h') {
      if (v <= 0) return;
      const c = a.getCenterPoint();
      const target = v * DPI;
      if (key === 'w') {
        const s = target / (a.width + (a.strokeUniform ? 0 : a.strokeWidth || 0));
        const k = s / a.scaleX;
        a.set('scaleX', s);
        if (ratioLocked) a.set('scaleY', a.scaleY * k);
      } else {
        const s = target / (a.height + (a.strokeUniform ? 0 : a.strokeWidth || 0));
        const k = s / a.scaleY;
        a.set('scaleY', s);
        if (ratioLocked) a.set('scaleX', a.scaleX * k);
      }
      a.setPositionByOrigin(c, 'center', 'center');
    } else if (key === 'angle') {
      a.rotate(v);
    } else if (key === 'strokeWidth') {
      targets().forEach((o) => {
        o.set('strokeWidth', v * PT);
        if (v > 0 && !o.stroke) o.set('stroke', E.state.ink);
        if (v > 0) E.state.strokePt = v;
      });
    } else if (key === 'fontSize') {
      a.set('fontSize', (v * PT) / a.scaleY);
      if (a.arc) E.applyArc(a, a.arc);
    } else if (key === 'charSpacing') {
      a.set('charSpacing', v);
      if (a.arc) E.applyArc(a, a.arc);
    } else if (key === 'lineHeight') {
      a.set('lineHeight', v);
    }
    a.setCoords();
    commit();
    P.refreshTransform();
  }

  function setPrintCustom(key, v) {
    const cur = E.preset();
    const c = { w: cur.w, h: cur.h, top: cur.top, x: cur.x };
    c[{ pw: 'w', ph: 'h', ptop: 'top', px: 'x' }[key]] = v;
    E.setPreset('custom', c);
  }

  function wireProps() {
    const root = $('props');
    root.addEventListener('click', (e) => {
      const head = e.target.closest('.sec-head');
      if (head && !e.target.closest('button, input, select, label')) return toggleSection(head);
      const el = e.target.closest('[data-act]');
      if (!el || el.tagName === 'INPUT') return;
      const act = el.dataset.act;
      const a = E.active();
      if (act === 'unclip' && a) {
        a.clipPath = undefined;
        a.name = (a.name || '').replace(' (alpha lock)', '');
        a.set('dirty', true);
        commit();
        return P.renderProps();
      }
      if (act === 'reclip' && a) {
        return E.layerClip(a.layer, [a]).then((clip) => {
          a.clipPath = clip || undefined;
          a.set('dirty', true);
          commit();
          P.renderProps();
        });
      }
      if (act === 'tex-mode' && a) {
        E.setTextureMode(a, el.dataset.mode);
        commit();
        return P.renderProps();
      }
      if (act === 'fill-kind' && a) {
        setFillKind(a, el.dataset.kind);
        commit();
        return P.renderProps();
      }
      if (act === 'grad-stop') {
        gradSel = +el.dataset.i;
        return P.renderProps();
      }
      if (act === 'grad-color' && a && a.gradDef) {
        a.gradDef.stops[gradSel].c = el.dataset.c;
        P.applyGradient(a);
        commit();
        return P.renderProps();
      }
      if (act === 'grad-add' && a && a.gradDef) {
        const st = [...a.gradDef.stops].sort((x, y) => x.p - y.p);
        const cur = a.gradDef.stops[gradSel];
        const i = st.indexOf(cur), next = st[i + 1] || st[i - 1];
        const ns = { c: mix(cur.c, next.c), p: Math.round((cur.p + next.p) / 2) };
        a.gradDef.stops.push(ns);
        gradSel = a.gradDef.stops.length - 1;
        P.applyGradient(a);
        commit();
        return P.renderProps();
      }
      if (act === 'grad-remove' && a && a.gradDef && a.gradDef.stops.length > 2) {
        a.gradDef.stops.splice(gradSel, 1);
        gradSel = 0;
        P.applyGradient(a);
        commit();
        return P.renderProps();
      }
      if (act === 'grad-reverse' && a && a.gradDef) {
        a.gradDef.stops.forEach((s) => (s.p = 100 - s.p));
        P.applyGradient(a);
        commit();
        return P.renderProps();
      }
      if (act === 'wand') return DZ.wand.run(el.dataset.w).catch((err) => DZ.toast(err.message, true));
      if (act === 'merge') return E.mergeToImage(E.activeObjects()).then(() => P.renderProps()).catch((err) => DZ.toast(err.message, true));
      if (act === 'warp-start' && a) return DZ.warp.start(a, el.dataset.mode).then(() => P.renderProps()).catch((err) => DZ.toast(err.message, true));
      if (act === 'warp-done') {
        DZ.warp.done();
        return P.renderProps();
      }
      if (act === 'warp-reset' && a) return DZ.warp.reset(a).then(() => P.renderProps());
      if (act === 'brush-pick') {
        (E.state.tool === 'eraser' ? E.state.eraser : E.state.brush).id = el.dataset.id;
        return P.renderProps();
      }
      if (act === 'array-make') return runArray(() => E.makeArray(a));
      if (act === 'array-mode') return runArray(() => E.updateArray(a, { mode: el.dataset.mode }));
      if (act === 'array-fill') return runArray(() => E.fillPrintArea(a));
      if (act === 'array-apply') return runArray(() => E.applyArray(a));
      if (act === 'array-remove') return runArray(() => E.removeArray(a));
      if (act === 'adj-toggle' && a) {
        a.adjust = Object.assign({}, a.adjust, { [el.dataset.k]: !(a.adjust && a.adjust[el.dataset.k]) });
        applyAdjust(a);
        commit();
        return P.renderProps();
      }
      if (act === 'adj-reset' && a) {
        a.adjust = a.isType('image') ? null : {};
        applyAdjust(a);
        commit();
        return P.renderProps();
      }
      if (act === 'garment-color') return E.setColor(el.dataset.id);
      if (act === 'method') {
        E.doc.method = el.dataset.m;
        E.emit('changed');
        P.renderProps();
        return E.emit('objects');
      }
      if (act === 'ink-edit') {
        inkEditing = inkEditing === el.dataset.hex ? null : el.dataset.hex;
        return P.renderProps();
      }
      if (act === 'ink-swap') {
        const to = el.dataset.c;
        if (inkEditing && to && to.toUpperCase() !== inkEditing) {
          DZ.production.swapInk(inkEditing, to.toUpperCase());
          inkEditing = to.toUpperCase();
        }
        return P.renderProps();
      }
      if (act === 'ink-select') {
        const ink = DZ.production.analyze().inks.find((i) => i.hex === el.dataset.hex);
        if (ink) E.selectObjects([...ink.objects].filter((o) => !o.locked));
        return;
      }
      if (act === 'edit-palette') return DZ.openPaletteEditor();
      if (act === 'shadow-color') {
        if (a && a.shadow) {
          a.shadow.color = el.dataset.c;
          a.set('dirty', true);
          commit();
        }
        return P.renderProps();
      }
      if (['fill', 'stroke', 'default-ink', 'tint'].includes(act)) return setColor(act, el.dataset.c || null);
      if (act === 'ratio') {
        ratioLocked = !ratioLocked;
        return P.renderProps();
      }
      if (act.startsWith('align-')) return E.align(act.slice(6));
      if (act === 'dist-h') return E.distribute('h');
      if (act === 'dist-v') return E.distribute('v');
      if (['front', 'forward', 'backward', 'back'].includes(act)) return E.arrange(act);
      if (act === 'flip-h') return E.flip('h');
      if (act === 'flip-v') return E.flip('v');
      if (act === 'duplicate') return E.duplicate();
      if (act === 'group') return E.group();
      if (act === 'ungroup') return E.ungroup();
      if (act === 'delete') return E.deleteSelected();
      if (act === 'edit-points') {
        E.setTool('direct');
        return E.enterPathEdit(a);
      }
      if (!a) return;
      if (act === 'weight') {
        a.set('fontWeight', +el.dataset.w);
        if (a.arc) E.applyArc(a, a.arc);
        commit();
        return P.renderProps();
      }
      if (act === 'text-align') {
        a.set('textAlign', el.dataset.al);
        commit();
        return P.renderProps();
      }
      if (act === 'upper') {
        a.set('text', a.text.toUpperCase());
        a.initDimensions();
        if (a.arc) E.applyArc(a, a.arc);
        commit();
        return P.renderProps();
      }
    });

    root.addEventListener('input', (e) => {
      const el = e.target;
      const a = E.active();
      if (el.dataset.grad && a && a.gradDef) {
        if (el.dataset.grad === 'pos') a.gradDef.stops[gradSel].p = +el.value;
        else a.gradDef.angle = +el.value;
        const v = root.querySelector(`[data-grad-val="${el.dataset.grad}"]`);
        if (v) v.textContent = el.value + (el.dataset.grad === 'pos' ? '%' : '°');
        const bar = root.querySelector('.grad-bar');
        if (bar) bar.style.background = cssGrad(a.gradDef);
        const dot = root.querySelector('.grad-stop.on');
        if (dot && el.dataset.grad === 'pos') dot.style.left = el.value + '%';
        return P.applyGradient(a);
      }
      if (el.dataset.warpArc !== undefined) {
        const v = root.querySelector('[data-warp-val]');
        if (v) v.textContent = el.value;
        return;
      }
      if (el.dataset.wand === 'tol') {
        E.state.wand.tol = +el.value;
        const v = root.querySelector('[data-wand-val="tol"]');
        if (v) v.textContent = el.value;
        return;
      }
      if (el.dataset.bk) {
        const st = E.state.tool === 'eraser' ? E.state.eraser : E.state.brush;
        st[el.dataset.bk] = +el.value;
        const v = root.querySelector(`[data-bk-val="${el.dataset.bk}"]`);
        if (v) v.textContent = el.value + (el.dataset.bk === 'size' ? ' pt' : '%');
        return;
      }
      if (el.dataset.adj && a) {
        a.adjust = Object.assign({}, a.adjust, { [el.dataset.adj]: +el.value });
        const v = root.querySelector(`[data-adj-val="${el.dataset.adj}"]`);
        if (v) v.textContent = el.value;
        return applyAdjust(a);
      }
      if (el.dataset.key === 'arc' && a) {
        E.applyArc(a, +el.value);
        $('arc-val').textContent = el.value;
      } else if (el.dataset.key === 'opacity') {
        targets().forEach((o) => o.set('opacity', +el.value / 100));
        $('op-val').textContent = el.value + '%';
        E.canvas.requestRenderAll();
      } else if (el.dataset.key === 'knockoutTol' && a) {
        a.knockout = { tol: +el.value / 100 };
        applyImageFilters(a);
      } else if (el.dataset.act === 'garment-custom') {
        E.setColor(el.value.toUpperCase(), true);
      } else if (el.dataset.act && el.dataset.act.endsWith('-custom')) {
        const act = el.dataset.act.replace('-custom', '');
        if (act === 'default-ink') E.state.ink = el.value;
        else if (act === 'ink-swap') return;
        else if (act === 'grad-color' && a && a.gradDef) {
          a.gradDef.stops[gradSel].c = el.value.toUpperCase();
          P.applyGradient(a);
          const bar = root.querySelector('.grad-bar');
          if (bar) bar.style.background = cssGrad(a.gradDef);
        }
        else if (act === 'tint' && a) {
          a.tint = el.value;
          applyImageFilters(a);
        } else if (act === 'shadow-color' && a && a.shadow) {
          a.shadow.color = el.value;
          a.set('dirty', true);
        } else
          targets().forEach((o) => {
            if (act === 'fill') P.bakeAdjust(o), o.isType('group') || o.motif ? E.setInk(o, el.value) : o.isType('line') ? o.set('stroke', el.value) : o.set('fill', el.value);
            else o.set('stroke', el.value);
            o.set('dirty', true);
          });
        E.canvas.requestRenderAll();
      }
    });

    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.grad) return commit();
      if (el.dataset.warpArc !== undefined) {
        const g = E.active();
        if (g) DZ.warp.arc(g, +el.value).then(() => P.renderProps()).catch((err) => DZ.toast(err.message, true));
        return;
      }
      if (el.dataset.wand === 'contiguous') {
        E.state.wand.contiguous = el.checked;
        return;
      }
      if (el.dataset.adj) {
        commit();
        return P.renderProps();
      }
      if (el.dataset.arr) {
        const g = E.active();
        const v = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        if (el.type !== 'checkbox' && !Number.isFinite(v)) return P.renderProps();
        return runArray(() => E.updateArray(g, { [el.dataset.arr]: v }));
      }
      const key = el.dataset.key;
      const a = E.active();
      if (el.dataset.act === 'garment-custom') {
        E.setColor(el.value.toUpperCase());
        return P.renderProps();
      }
      if (el.dataset.act && el.dataset.act.endsWith('-custom')) {
        P.rememberColor(el.value);
        if (el.dataset.act === 'ink-swap-custom') {
          const to = el.value.toUpperCase();
          if (inkEditing && to !== inkEditing) {
            DZ.production.swapInk(inkEditing, to);
            inkEditing = to;
          }
          return P.renderProps();
        }
        if (el.dataset.act !== 'default-ink-custom') commit();
        return P.renderProps();
      }
      if (!key) return;
      if (key === 'preset') return E.setPreset(el.value, el.value === 'custom' ? { w: E.preset().w, h: E.preset().h, top: E.preset().top, x: E.preset().x } : null);
      if (['pw', 'ph', 'ptop', 'px'].includes(key)) return setPrintCustom(key, +el.value);
      if (key === 'notes') {
        E.doc.notes = el.value;
        return E.emit('changed');
      }
      if (key === 'snapping') {
        E.state[key] = el.checked;
        return P.renderProps();
      }
      if (!a) return;
      if (key === 'name') {
        a.name = el.value.trim() || typeName(a);
        return commit();
      }
      if (key === 'fontFamily') {
        a.set('fontFamily', el.value);
        E.state.font = el.value;
        const f = DZ.FONTS.find((x) => x.family === el.value);
        if (f && !f.weights.includes(+a.fontWeight)) a.set('fontWeight', f.weights[0]);
        document.fonts.load(`${a.fontWeight} 40px "${el.value}"`, a.text).then(() => {
          fabric.cache.clearFontCache(el.value);
          a.initDimensions();
          if (a.arc) E.applyArc(a, a.arc);
          a.setCoords();
          commit();
          P.renderProps();
        });
        return;
      }
      if (key === 'arc' || key === 'opacity') return commit();
      if (key === 'shadowOn') {
        a.set('shadow', el.checked ? new fabric.Shadow({ color: '#161514', offsetX: 6 * PT, offsetY: 6 * PT, blur: 0, nonScaling: true }) : null);
        a.set('dirty', true);
        commit();
        return P.renderProps();
      }
      if (['shadowX', 'shadowY', 'shadowBlur'].includes(key) && a.shadow) {
        const v = parseFloat(el.value) * PT;
        if (key === 'shadowX') a.shadow.offsetX = v;
        if (key === 'shadowY') a.shadow.offsetY = v;
        if (key === 'shadowBlur') a.shadow.blur = Math.max(0, v);
        a.set('dirty', true);
        return commit();
      }
      if (key === 'knockout') {
        a.knockout = el.checked ? { tol: 0.12 } : null;
        applyImageFilters(a);
        commit();
        return P.renderProps();
      }
      if (key === 'knockoutTol') return commit();
      if (key === 'tintOn') {
        a.tint = el.checked ? E.state.ink : null;
        applyImageFilters(a);
        commit();
        return P.renderProps();
      }
      setNumber(key, parseFloat(el.value));
    });

    root.addEventListener('dblclick', (e) => {
      const el = e.target.closest('input[data-adj]');
      const a = E.active();
      if (!el || !a) return;
      el.value = 0;
      a.adjust = Object.assign({}, a.adjust, { [el.dataset.adj]: 0 });
      applyAdjust(a);
      commit();
      P.renderProps();
    });

    root.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sec-head')) {
        e.preventDefault();
        e.stopPropagation();
        return toggleSection(e.target);
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
      if (e.key === 'Escape' && e.target.tagName === 'TEXTAREA') e.target.blur();
      e.stopPropagation();
    });
  }

  // ================= LAYERS =================
  const layerIcon = (o) => {
    if (isText(o)) return I.text;
    if (o.isType('image')) return I.image;
    if (o.isType('group')) return I.group;
    if (o.isType('rect')) return I.rect;
    if (o.isType('ellipse') || o.isType('circle')) return I.ellipse;
    if (o.isType('line')) return I.line;
    return I.pen;
  };

  let layersRaf = 0;
  const collapsed = new Set();
  const objRow = (o, active) =>
    `<div class="layer ${active.has(o) ? 'on' : ''} ${o.visible ? '' : 'hidden-layer'} ${o.locked ? 'locked' : ''}" draggable="true" data-uid="${o.uid}">` +
    `<span class="licon">${layerIcon(o)}</span><span class="lname">${esc(o.name || typeName(o))}</span>` +
    `<button class="lbtn" data-lact="vis" title="${o.visible ? 'Hide' : 'Show'}" aria-label="${o.visible ? 'Hide' : 'Show'}">${o.visible ? I.eye : I.eyeOff}</button>` +
    `<button class="lbtn ${o.locked ? 'show' : ''}" data-lact="lock" title="${o.locked ? 'Unlock' : 'Lock'}" aria-label="${o.locked ? 'Unlock' : 'Lock'}">${o.locked ? I.lock : I.unlock}</button>` +
    '</div>';

  P.renderLayers = () => {
    clearTimeout(layersRaf);
    layersRaf = setTimeout(() => {
      if (!E.doc) return;
      const all = E.canvas.getObjects();
      const active = new Set(E.activeObjects());
      const cur = E.activeLayer();
      const L = E.layers().slice().reverse();
      $('layer-count').textContent = all.length ? all.length : '';
      $('layers').innerHTML = L.map((l) => {
        const objs = all.filter((o) => o.layer === l.id).reverse();
        const open = !collapsed.has(l.id);
        return `<div class="lgroup ${l.id === cur.id ? 'cur' : ''} ${l.visible ? '' : 'hidden-layer'}" data-lid="${l.id}" draggable="true">` +
          `<button class="lcaret ${open ? 'open' : ''}" data-gact="fold" aria-label="${open ? 'Collapse' : 'Expand'}">›</button>` +
          `<span class="lgname">${esc(l.name)}</span><span class="lgcount">${objs.length || ''}</span>` +
          (E.layers().length > 1 ? `<button class="lbtn" data-gact="delete" title="Delete layer and its contents" aria-label="Delete layer">${I.trash}</button>` : '') +
          `<button class="lbtn ${l.visible ? '' : 'show'}" data-gact="vis" title="${l.visible ? 'Hide layer' : 'Show layer'}" aria-label="${l.visible ? 'Hide layer' : 'Show layer'}">${l.visible ? I.eye : I.eyeOff}</button>` +
          `<button class="lbtn alpha ${l.alphaLock ? 'show on' : ''}" data-gact="alpha" title="${l.alphaLock ? 'Alpha lock on — new brush strokes and textures only paint on this layer’s art' : 'Alpha lock: paint only on this layer’s existing art'}" aria-label="Alpha lock" aria-pressed="${!!l.alphaLock}">${I.alpha}</button>` +
          `<button class="lbtn ${l.locked ? 'show' : ''}" data-gact="lock" title="${l.locked ? 'Unlock layer' : 'Lock layer'}" aria-label="${l.locked ? 'Unlock layer' : 'Lock layer'}">${l.locked ? I.lock : I.unlock}</button>` +
          '</div>' +
          (open ? (objs.length ? objs.map((o) => objRow(o, active)).join('') : '<div class="lempty">Empty — new art goes here while this layer is selected</div>') : '');
      }).join('');
    }, 0);
  };

  const byUid = (uid) => E.canvas.getObjects().find((o) => o.uid === uid);

  function renameInline(span, value, save) {
    const input = document.createElement('input');
    input.className = 'lrename';
    input.value = value;
    span.replaceWith(input);
    input.focus();
    input.select();
    let cancelled = false;
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') input.blur();
      if (ev.key === 'Escape') {
        cancelled = true;
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      if (!cancelled) save(input.value.trim());
      P.renderLayers();
    });
  }

  function wireLayers() {
    const root = $('layers');
    $('layer-add').innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 4.5 V15.5 M4.5 10 H15.5"/></svg>';
    $('layer-add').addEventListener('click', () => E.addLayer());

    root.addEventListener('click', (e) => {
      const grp = e.target.closest('.lgroup');
      if (grp) {
        const id = grp.dataset.lid;
        const act = e.target.closest('[data-gact]');
        if (act) {
          const g = act.dataset.gact;
          if (g === 'fold') collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
          else if (g === 'vis') E.toggleLayerVisible(id);
          else if (g === 'lock') E.toggleLayerLock(id);
          else if (g === 'alpha') {
            E.toggleLayerAlpha(id);
            const l = E.layerOf(id);
            DZ.toast(l.alphaLock ? `Alpha lock on for “${l.name}”: brush strokes and textures paint only on its art.` : `Alpha lock off for “${l.name}”.`);
          }
          else if (g === 'delete') {
            const n = E.layerObjects(id).length;
            E.removeLayer(id);
            DZ.toast(n ? `Layer deleted with ${n} object${n > 1 ? 's' : ''} — ⌘Z to undo` : 'Layer deleted');
          }
          return P.renderLayers();
        }
        E.canvas.discardActiveObject();
        E.canvas.requestRenderAll();
        E.setActiveLayer(id);
        return P.renderLayers();
      }
      const row = e.target.closest('.layer');
      if (!row) return;
      const o = byUid(row.dataset.uid);
      if (!o) return;
      const btn = e.target.closest('[data-lact]');
      if (btn) {
        if (btn.dataset.lact === 'vis') E.toggleVisible(o);
        else E.toggleLock(o);
        return;
      }
      if (E.state.mode === 'preview') E.setMode('edit');
      if (o.locked || !o.visible) return;
      if (e.shiftKey || e.metaKey) {
        const cur = E.activeObjects();
        E.selectObjects(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
      } else E.selectObjects([o]);
    });
    root.addEventListener('dblclick', (e) => {
      const gname = e.target.closest('.lgname');
      if (gname) {
        const id = gname.closest('.lgroup').dataset.lid;
        return renameInline(gname, E.layerOf(id).name, (v) => E.renameLayer(id, v));
      }
      const name = e.target.closest('.lname');
      if (!name) return;
      const o = byUid(name.closest('.layer').dataset.uid);
      renameInline(name, o.name || typeName(o), (v) => {
        if (v) o.name = v;
        commit();
        P.renderProps();
      });
    });

    // Drag objects between/within layers; drag layer headers to reorder layers.
    let drag = null; // { kind: 'obj', uid } | { kind: 'layer', id }
    const clearMarks = () => root.querySelectorAll('.drop-above,.drop-below,.drop-into').forEach((r) => r.classList.remove('drop-above', 'drop-below', 'drop-into'));
    root.addEventListener('dragstart', (e) => {
      const grp = e.target.closest('.lgroup');
      const row = e.target.closest('.layer');
      if (grp) drag = { kind: 'layer', id: grp.dataset.lid };
      else if (row) drag = { kind: 'obj', uid: row.dataset.uid };
      else return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'layer');
    });
    root.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault();
      clearMarks();
      const grp = e.target.closest('.lgroup');
      const row = e.target.closest('.layer');
      if (grp) {
        if (drag.kind === 'obj') grp.classList.add('drop-into');
        else {
          const r = grp.getBoundingClientRect();
          grp.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
        }
      } else if (row && drag.kind === 'obj') {
        const r = row.getBoundingClientRect();
        row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
      }
    });
    root.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      const d = drag;
      drag = null;
      const grp = e.target.closest('.lgroup');
      const row = e.target.closest('.layer');
      const above = (grp || row) && (grp || row).classList.contains('drop-above');
      clearMarks();
      if (d.kind === 'layer') {
        if (!grp || grp.dataset.lid === d.id) return P.renderLayers();
        // the panel lists top layer first; array order is bottom → top
        const L = E.layers().filter((l) => l.id !== d.id);
        const ti = L.findIndex((l) => l.id === grp.dataset.lid);
        return E.moveLayer(d.id, above ? ti + 1 : ti);
      }
      const moving = byUid(d.uid);
      if (!moving) return P.renderLayers();
      if (grp) return E.moveToLayer([moving], grp.dataset.lid);
      if (!row) return P.renderLayers();
      const target = byUid(row.dataset.uid);
      if (!target || target === moving) return P.renderLayers();
      moving.layer = target.layer;
      const objs = E.canvas.getObjects();
      let idx = objs.indexOf(target) + (above ? 1 : 0);
      if (objs.indexOf(moving) < idx) idx--;
      E.canvas.moveObjectTo(moving, Math.max(0, Math.min(objs.length - 1, idx)));
      commit();
    });
    root.addEventListener('dragend', () => {
      drag = null;
      clearMarks();
    });
  }

  P.init = () => {
    // text width changes move the gradient's ends: rebuild it
    E.canvas.on('text:changed', (opt) => opt.target && opt.target.gradDef && P.applyGradient(opt.target));
    wireLibrary();
    wireProps();
    wireLayers();
    P.renderLibrary();
  };
})();
