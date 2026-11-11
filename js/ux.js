// Helpers that make the editor easier to learn: brand palette editor, ⌘K command search,
// a start card for empty designs, and per-tool hints.
(function () {
  const E = DZ.editor;
  const P = DZ.panels;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = window.designHost || null;
  const DEFAULT_PALETTE = DZ.PALETTE.map((c) => Object.assign({}, c));

  // ================= brand kit =================
  DZ.loadBrand = async () => {
    try {
      const text = host && host.readBrand ? await host.readBrand() : localStorage.getItem('design-brand');
      const kit = text ? JSON.parse(text) : null;
      if (kit && Array.isArray(kit.palette) && kit.palette.length) {
        DZ.PALETTE.splice(0, DZ.PALETTE.length, ...kit.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)));
      }
    } catch {}
  };

  async function saveBrand() {
    const text = JSON.stringify({ version: 1, palette: DZ.PALETTE }, null, 2);
    if (host && host.writeBrand) await host.writeBrand(text);
    else localStorage.setItem('design-brand', text);
  }

  DZ.openPaletteEditor = () => {
    const modal = $('palette-modal');
    let rows = DZ.PALETTE.map((c) => Object.assign({}, c));
    const render = () => {
      $('palette-rows').innerHTML = rows.map((c, i) =>
        `<div class="pal-row" data-i="${i}">` +
        `<label class="pal-chip" style="--c:${c.hex}"><input type="color" value="${c.hex}" data-f="hex" aria-label="Color"/></label>` +
        `<input class="pal-name" value="${esc(c.name)}" data-f="name" aria-label="Color name" spellcheck="false"/>` +
        `<input class="pal-hex" value="${c.hex}" data-f="hexText" aria-label="HEX value" spellcheck="false" maxlength="7"/>` +
        `<button class="ibtn danger" data-pal="remove" title="Remove" aria-label="Remove color">${DZ.ICONS.trash}</button></div>`
      ).join('');
      $('pal-add').disabled = rows.length >= 14;
    };
    render();
    modal.hidden = false;
    const onInput = (e) => {
      const row = e.target.closest('.pal-row');
      if (!row) return;
      const c = rows[+row.dataset.i];
      const f = e.target.dataset.f;
      if (f === 'name') c.name = e.target.value;
      if (f === 'hex') {
        c.hex = e.target.value.toUpperCase();
        row.querySelector('.pal-hex').value = c.hex;
        row.querySelector('.pal-chip').style.setProperty('--c', c.hex);
      }
      if (f === 'hexText' && /^#?[0-9a-f]{6}$/i.test(e.target.value)) {
        c.hex = ('#' + e.target.value.replace('#', '')).toUpperCase();
        row.querySelector('.pal-chip').style.setProperty('--c', c.hex);
        row.querySelector('input[type=color]').value = c.hex;
      }
    };
    const onClick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pal === 'remove') {
        if (rows.length <= 1) return;
        rows.splice(+b.closest('.pal-row').dataset.i, 1);
        render();
      } else if (b.id === 'pal-add') {
        rows.push({ id: DZ.uid(), name: 'New color', hex: '#888888' });
        render();
        const last = $('palette-rows').lastElementChild;
        last && last.querySelector('.pal-name').select();
      } else if (b.id === 'pal-reset') {
        rows = DEFAULT_PALETTE.map((c) => Object.assign({}, c));
        render();
      } else if (b.id === 'pal-cancel') {
        close();
      } else if (b.id === 'pal-save') {
        DZ.PALETTE.splice(0, DZ.PALETTE.length, ...rows.map((c) => ({ id: c.id || DZ.uid(), name: c.name.trim() || c.hex, hex: c.hex.toUpperCase() })));
        await saveBrand();
        close();
        P.renderProps();
        DZ.toast('Brand palette saved');
      }
    };
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    };
    function close() {
      modal.hidden = true;
      modal.removeEventListener('input', onInput);
      modal.removeEventListener('click', onClick);
      modal.removeEventListener('keydown', onKey);
    }
    modal.addEventListener('input', onInput);
    modal.addEventListener('click', onClick);
    modal.addEventListener('keydown', onKey);
  };

  // ================= pop-up menu (document menu) =================
  // A small menu anchored under a button; keyboard: arrows, Enter, Esc. Items:
  // { label, key, run } | { sep: true } | { label, sub: [...] }
  DZ.popMenu = (anchor, items) => {
    document.querySelectorAll('.popmenu').forEach((m) => m.remove());
    const app = document.getElementById('app');
    const build = (list, x, y, parent) => {
      const m = document.createElement('div');
      m.className = 'popmenu flyout';
      m.setAttribute('role', 'menu');
      m.innerHTML = list.map((it, i) => it.sep ? '<div class="pm-sep" role="separator"></div>'
        : `<button role="menuitem" data-i="${i}" ${it.sub ? 'aria-haspopup="menu"' : ''}><span>${esc(it.label)}</span>${it.key ? `<kbd>${it.key}</kbd>` : it.sub ? '<kbd>›</kbd>' : ''}</button>`).join('');
      m.style.left = x + 'px';
      m.style.top = y + 'px';
      app.appendChild(m);
      const close = () => {
        document.querySelectorAll('.popmenu').forEach((n) => n.remove());
        document.removeEventListener('mousedown', outside, true);
      };
      const outside = (e) => !(e.target.closest && e.target.closest('.popmenu')) && close();
      if (!parent) setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
      const open = (btn) => {
        const it = list[+btn.dataset.i];
        if (it.sub) {
          m.querySelectorAll('.popmenu').forEach((n) => n.remove());
          const r = btn.getBoundingClientRect(), a = app.getBoundingClientRect();
          const sm = build(it.sub, r.right - a.left + 2, r.top - a.top - 4, m);
          sm.querySelector('button')?.focus();
          return;
        }
        close();
        Promise.resolve(it.run && it.run()).catch((err) => DZ.toast(err.message || String(err), true));
        anchor.focus();
      };
      m.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (b) open(b);
      });
      m.addEventListener('keydown', (e) => {
        const btns = [...m.querySelectorAll(':scope > button')];
        const i = btns.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') btns[(i + 1) % btns.length].focus();
        else if (e.key === 'ArrowUp') btns[(i - 1 + btns.length) % btns.length].focus();
        else if (e.key === 'ArrowRight' && i >= 0 && list[+btns[i].dataset.i].sub) open(btns[i]);
        else if (e.key === 'ArrowLeft' && parent) {
          m.remove();
          parent.querySelector('button')?.focus();
        } else if (e.key === 'Escape') {
          close();
          anchor.focus();
        } else return;
        e.preventDefault();
        e.stopPropagation();
      });
      return m;
    };
    const r = anchor.getBoundingClientRect(), a = app.getBoundingClientRect();
    const m = build(items, r.left - a.left, r.bottom - a.top + 6, null);
    m.querySelector('button')?.focus();
  };

  // ================= command search (⌘K) =================
  const CMD_LABELS = {
    new: 'New design', open: 'Open…', save: 'Save…', export: 'Export…', import: 'Import artwork…',
    undo: 'Undo', redo: 'Redo', duplicate: 'Duplicate', array: 'Array (repeat in a line, circle or grid)', newLayer: 'New layer', merge: 'Merge into one image', distort: 'Distort corners (perspective)', warp: 'Warp (mesh)', delete: 'Delete selection', selectAll: 'Select all',
    group: 'Group', ungroup: 'Ungroup', front: 'Bring to front', back: 'Send to back', flipH: 'Flip horizontal', flipV: 'Flip vertical',
    preview: 'Toggle preview', 'side-front': 'Show front', 'side-back': 'Show back', fit: 'Fit garment', fitPrint: 'Zoom to print area',
    techpack: 'Export tech pack (PDF)', separations: 'Export screen-print separations', palette: 'Edit brand palette…',
  };
  const TOOL_LABELS = { select: 'Selection', direct: 'Direct selection', pen: 'Pen', pencil: 'Pencil', brush: 'Brush', eraser: 'Eraser', wand: 'Magic wand', lasso: 'Lasso', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', text: 'Text', hand: 'Hand' };

  function allItems() {
    const items = [];
    Object.entries(CMD_LABELS).forEach(([id, label]) => items.push({ group: 'Command', label, run: () => DZ.runCommand(id) }));
    Object.entries(TOOL_LABELS).forEach(([id, label]) => items.push({ group: 'Tool', label: `${label} tool`, run: () => E.setTool(id) }));
    DZ.MOTIFS.forEach((m) => items.push({ group: 'Motif', label: m.name, hint: m.group, run: () => P.addMotif(m.id) }));
    DZ.WORDS.forEach((w, i) => items.push({ group: 'Word', label: w.text, hint: w.meaning, run: () => P.addWord(i) }));
    P.TEMPLATES.forEach((t, i) => items.push({ group: 'Layout', label: t.name, hint: t.desc, run: () => P.addTemplate(i) }));
    DZ.TEXTURES.forEach((t) => items.push({ group: 'Texture', label: `${t.name} distress`, hint: t.note, run: () => E.addTexture(t.id) }));
    Object.entries(DZ.GARMENTS).forEach(([id, g]) => items.push({ group: 'Garment', label: g.name, run: () => E.setGarment(id) }));
    DZ.GARMENT_COLORS.forEach((c) => items.push({ group: 'Garment color', label: c.name, swatch: c.hex, run: () => E.setColor(c.id) }));
    Object.entries(DZ.production.METHODS).forEach(([id, m]) => items.push({ group: 'Print method', label: m.name, hint: m.long, run: () => { E.doc.method = id; E.emit('changed'); P.renderProps(); E.emit('objects'); } }));
    E.presetList().forEach((p) => items.push({ group: 'Print area', label: p.name, hint: `${p.w} × ${p.h} in`, run: () => E.setPreset(p.id) }));
    return items;
  }

  let cmdItems = [], cmdSel = 0, cmdShown = [];
  function score(item, q) {
    if (!q) return 1;
    const hay = `${item.label} ${item.group} ${item.hint || ''}`.toLowerCase();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let s = 0;
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i < 0) return 0;
      s += i === 0 ? 3 : hay[i - 1] === ' ' ? 2 : 1;
    }
    return s;
  }
  function renderCmd() {
    const q = $('cmd-input').value.trim();
    cmdShown = cmdItems.map((it) => ({ it, s: score(it, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.it);
    cmdSel = Math.min(cmdSel, Math.max(0, cmdShown.length - 1));
    $('cmd-list').innerHTML = cmdShown.length
      ? cmdShown.map((it, i) =>
          `<button class="cmd-item ${i === cmdSel ? 'on' : ''}" data-i="${i}" role="option" aria-selected="${i === cmdSel}">` +
          (it.swatch ? `<span class="chip" style="--c:${it.swatch}"></span>` : '') +
          `<span class="cmd-label">${esc(it.label)}</span>${it.hint ? `<span class="cmd-hint">${esc(it.hint)}</span>` : ''}<span class="cmd-group">${esc(it.group)}</span></button>`
        ).join('')
      : '<div class="empty">Nothing matches. Try “laurel”, “hoodie”, “screen print” or “export”.</div>';
    const on = $('cmd-list').querySelector('.on');
    on && on.scrollIntoView({ block: 'nearest' });
  }
  async function runCmd(i) {
    const it = cmdShown[i];
    closeCmd();
    if (!it) return;
    try {
      if (E.state.mode === 'preview' && ['Motif', 'Word', 'Layout', 'Texture', 'Tool'].includes(it.group)) E.setMode('edit');
      await it.run();
    } catch (err) {
      DZ.toast(err.message || String(err), true);
    }
  }
  DZ.openCommand = () => {
    cmdItems = allItems();
    cmdSel = 0;
    $('cmd-modal').hidden = false;
    $('cmd-input').value = '';
    renderCmd();
    $('cmd-input').focus();
  };
  function closeCmd() {
    $('cmd-modal').hidden = true;
  }
  function wireCmd() {
    $('cmd-input').addEventListener('input', () => {
      cmdSel = 0;
      renderCmd();
    });
    $('cmd-input').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { cmdSel = Math.min(cmdShown.length - 1, cmdSel + 1); renderCmd(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cmdSel = Math.max(0, cmdSel - 1); renderCmd(); e.preventDefault(); }
      else if (e.key === 'Enter') { runCmd(cmdSel); e.preventDefault(); }
      else if (e.key === 'Escape') closeCmd();
    });
    $('cmd-list').addEventListener('click', (e) => {
      const b = e.target.closest('.cmd-item');
      if (b) runCmd(+b.dataset.i);
    });
    $('cmd-modal').addEventListener('mousedown', (e) => e.target.id === 'cmd-modal' && closeCmd());
  }

  // ================= start card =================
  DZ.updateOnboarding = () => {
    const show = E.state.mode === 'edit' && !E.canvas.getObjects().length && !DZ.pen.active();
    $('onboard').hidden = !show;
  };
  DZ.renderRecent = async () => {
    const list = await DZ.io.recent();
    const el = $('onboard-recent');
    if (!el) return;
    el.hidden = !list.length;
    el.innerHTML = list.length
      ? '<div class="onboard-sub">Recent</div>' + list.map((r) => `<button data-recent="${esc(r.path)}">${esc(r.name)}</button>`).join('')
      : '';
  };

  function wireOnboarding() {
    DZ.renderRecent();
    $('onboard').addEventListener('click', async (e) => {
      const rb = e.target.closest('[data-recent]');
      if (rb) return DZ.runCommand('openPath', rb.dataset.recent);
      const b = e.target.closest('[data-ob]');
      if (!b) return;
      try {
        const k = b.dataset.ob;
        if (k === 'layout') await P.addTemplate(0);
        else if (k === 'word') P.addWord(0);
        else if (k === 'import') await DZ.io.pickImages();
        else if (k === 'search') DZ.openCommand();
      } catch (err) {
        DZ.toast(err.message || String(err), true);
      }
    });
  }

  // ================= tool hints =================
  DZ.TOOL_HINTS = {
    select: 'Click to select · Shift-click to add · Drag handles to resize (Shift = free) · Double-click a path to edit points',
    direct: 'Click a path, then drag its points and curve handles · Esc to finish',
    pen: 'Click to add corners · Drag to make curves · Click the first point to close · Enter to finish · Delete removes last point',
    pencil: 'Drag to draw a vector line · Stroke color and weight come from the inspector',
    brush: 'Drag to paint · Pick the brush, size and texture on the right · [ and ] change size',
    eraser: 'Drag to rub out images and brush strokes in the active layer · [ and ] change size',
    lasso: 'Drag around part of an image to select it · Shift adds · Option subtracts · then delete, keep, fill or Cut & distort',
    wand: 'Click a color in an image · Shift adds · Option subtracts · ⌫ deletes the selection · Click vector art to select everything in that color',
    rect: 'Drag to draw · Shift for a square · Click for a 2 in square',
    ellipse: 'Drag to draw · Shift for a circle',
    line: 'Drag to draw · Shift snaps to 45°',
    text: 'Click on the garment to type · Esc when done',
    hand: 'Drag to pan · Pinch or ⌘-scroll to zoom',
  };

  DZ.ux = {
    init() {
      wireCmd();
      wireOnboarding();
    },
  };
})();
