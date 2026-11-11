// Boot + window chrome: top bar, toolbar, shortcuts, export dialog, drop/paste, status bar.
(function () {
  const E = DZ.editor;
  const IO = DZ.io;
  const P = DZ.panels;
  const I = DZ.ICONS;
  const $ = (id) => document.getElementById(id);
  const host = window.designHost || null;

  // ---------- toast ----------
  let toastT;
  DZ.toast = (msg, isError) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), isError ? 5200 : 2600);
  };

  const guard = (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      DZ.toast(err.message || String(err), true);
    }
  };

  // ---------- toolbar ----------
  const TOOLS = [
    { id: 'select', key: 'V', label: 'Selection' },
    { id: 'direct', key: 'A', label: 'Direct selection — edit path points' },
    { id: 'pen', key: 'P', label: 'Pen — click corners, drag curves' },
    { id: 'pencil', key: 'N', label: 'Pencil — vector line' },
    { id: 'brush', key: 'B', label: 'Brush — textured' },
    { id: 'eraser', key: 'E', label: 'Eraser — textured, erases images' },
    { id: 'wand', key: 'W', label: 'Magic wand — select by color' },
    { id: 'lasso', key: 'Q', label: 'Lasso — draw a selection on an image' },
    { sep: true },
    { id: 'rect', key: 'M', label: 'Rectangle' },
    { id: 'ellipse', key: 'L', label: 'Ellipse' },
    { id: 'line', key: '\\', label: 'Line' },
    { id: 'text', key: 'T', label: 'Text' },
    { sep: true },
    { id: 'image', key: '', label: 'Import artwork… (⇧⌘P)', action: true },
    { id: 'hand', key: 'H', label: 'Hand (or hold Space)' },
  ];

  // Tools are grouped like Illustrator / Photoshop: one button per family shows the last tool
  // used; hold it, right-click it, or click its corner mark to pick another one. Every tool
  // keeps its own shortcut.
  const GROUPS = [
    { id: 'sel', tools: ['select', 'direct'] },
    { id: 'draw', tools: ['pen', 'pencil'] },
    { id: 'paint', tools: ['brush', 'eraser'] },
    { id: 'pick', tools: ['wand', 'lasso'] },
    { sep: true },
    { id: 'shape', tools: ['rect', 'ellipse', 'line'] },
    { id: 'type', tools: ['text'] },
    { sep: true },
    { id: 'img', tools: ['image'] },
    { id: 'pan', tools: ['hand'] },
  ];
  GROUPS.forEach((g) => g.tools && (g.cur = g.tools[0]));
  const toolDef = (id) => TOOLS.find((t) => t.id === id);
  const shortName = (t) => t.label.split(' — ')[0].split(' (')[0];

  function renderTools() {
    GROUPS.forEach((g) => g.tools && g.tools.includes(E.state.tool) && (g.cur = E.state.tool));
    $('tools').innerHTML = GROUPS.map((g) => {
      if (g.sep) return '<span class="tool-sep"></span>';
      const t = toolDef(g.cur);
      const more = g.tools.length > 1;
      const others = more ? ` · hold for ${g.tools.filter((x) => x !== g.cur).map((x) => shortName(toolDef(x))).join(', ')}` : '';
      return `<button class="tool ${g.tools.includes(E.state.tool) ? 'on' : ''}" data-tool="${t.id}" data-group="${g.id}" ` +
        `title="${t.label}${t.key ? ` (${t.key})` : ''}${others}" aria-label="${shortName(t)}" ${more ? 'aria-haspopup="menu"' : ''}>${I[t.id]}` +
        (more ? '<span class="tool-more" data-more="1" aria-hidden="true"></span>' : '') + '</button>';
    }).join('');
  }

  function closeFlyout() {
    const f = document.getElementById('tool-flyout');
    if (f) f.remove();
  }
  function openFlyout(btn) {
    closeFlyout();
    const g = GROUPS.find((x) => x.id === btn.dataset.group);
    if (!g || g.tools.length < 2) return;
    const f = document.createElement('div');
    f.id = 'tool-flyout';
    f.className = 'flyout';
    f.setAttribute('role', 'menu');
    f.innerHTML = g.tools.map((id) => {
      const t = toolDef(id);
      return `<button role="menuitem" class="${E.state.tool === id ? 'on' : ''}" data-pick="${id}">${I[id]}<span>${shortName(t)}</span><kbd>${t.key || ''}</kbd></button>`;
    }).join('');
    const r = btn.getBoundingClientRect(), app = $('app').getBoundingClientRect();
    f.style.left = r.right - app.left + 6 + 'px';
    f.style.top = r.top - app.top + 'px';
    $('app').appendChild(f);
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      g.cur = b.dataset.pick;
      closeFlyout();
      E.setTool(g.cur);
    });
    f.querySelector('button').focus();
    f.addEventListener('keydown', (e) => {
      const items = [...f.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus();
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus();
      else if (e.key === 'Escape') {
        closeFlyout();
        btn.focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function wireTools() {
    let holdTimer = null, held = false;
    const root = $('tools');
    root.addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-group]');
      if (!b || e.button !== 0) return;
      held = false;
      holdTimer = setTimeout(() => {
        held = true;
        openFlyout(b);
      }, 380);
    });
    ['mouseup', 'mouseleave'].forEach((ev) => root.addEventListener(ev, () => clearTimeout(holdTimer)));
    root.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('[data-group]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      openFlyout(b);
    });
    root.addEventListener('keydown', (e) => {
      const b = e.target.closest('[data-group]');
      if (b && (e.key === 'ArrowRight' || (e.key === 'ArrowDown' && e.altKey))) {
        e.preventDefault();
        openFlyout(b);
      }
    });
    root.addEventListener('click', guard(async (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      if (held) {
        held = false;
        return;
      }
      if (e.target.closest('[data-more]')) return openFlyout(b);
      if (b.dataset.tool === 'image') {
        await IO.pickImages();
        return;
      }
      E.setTool(b.dataset.tool);
    }));
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest || (!e.target.closest('#tool-flyout') && !e.target.closest('#tools'))) closeFlyout();
    });
  }

  DZ.openHelp = () => {
    const tools = TOOLS.filter((t) => t.id && t.key).map((t) => [shortName(t), t.key]);
    const groups = [
      ['Tools', tools],
      ['Edit', [['Undo / Redo', '⌘Z / ⇧⌘Z'], ['Duplicate', '⌘D'], ['Option-drag', 'Duplicate while moving'], ['Array', '⇧⌘D'], ['Group / Ungroup', '⌘G / ⇧⌘G'], ['Merge into image', '⌥⌘E'], ['Delete', '⌫'], ['Nudge', 'Arrows (⇧ = bigger)']]],
      ['View', [['Search everything', '⌘K'], ['Preview mockup', '⌘Y'], ['Fit garment / print area', '⌘0 / ⌘1'], ['Zoom', '⌘+ / ⌘−'], ['Pan', 'Hold Space'], ['Hide panels', '⌃⌘S']]],
      ['Painting & layers', [['Brush / eraser size', '[ and ]'], ['New layer', '⇧⌘N'], ['Wand / lasso add · subtract', 'Shift · Option'], ['Clear pixel selection', 'Esc']]],
      ['File', [['New / Open', '⌘N / ⌘O'], ['Save / Save as', '⌘S / ⇧⌘S'], ['Export', '⌘E'], ['Import artwork', '⇧⌘P']]],
    ];
    $('help-grid').innerHTML = groups.map(([title, rows]) =>
      `<section><h3>${title}</h3>${rows.map(([a, b]) => `<div class="help-row"><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</section>`).join('');
    $('help-modal').hidden = false;
    $('help-close').focus();
  };

  // ---------- top bar ----------
  function renderTop() {
    const d = E.doc;
    $('garment-seg').innerHTML = `<span>${DZ.GARMENTS[d.garment].name}</span>${I.chevDown}`;
    document.querySelectorAll('#side-seg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.side === d.side);
      b.setAttribute('aria-checked', b.dataset.side === d.side);
    });
    document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === E.state.mode));
    if (document.activeElement !== $('doc-name')) $('doc-name').value = d.name;
  }

  function renderHistory() {
    $('btn-undo').disabled = !E.canUndo();
    $('btn-redo').disabled = !E.canRedo();
  }

  function wireTop() {
    $('btn-undo').innerHTML = I.undo;
    $('btn-redo').innerHTML = I.redo;
    $('doc-menu').innerHTML = I.chevDown;
    $('btn-panels').innerHTML = I.panels;

    // Pop-up garment picker: tops, then bottoms. The current garment is checked.
    $('garment-seg').addEventListener('click', () => {
      const item = ([id, g]) => ({ label: `${E.doc.garment === id ? '✓ ' : '\u2003'}${g.name}`, run: () => E.setGarment(id) });
      const all = Object.entries(DZ.GARMENTS);
      DZ.popMenu($('garment-seg'), [...all.filter(([, g]) => !g.bottom).map(item), { sep: true }, ...all.filter(([, g]) => g.bottom).map(item)]);
    });
    $('side-seg').addEventListener('click', guard(async (e) => {
      const b = e.target.closest('[data-side]');
      if (b) await E.switchSide(b.dataset.side);
    }));
    $('mode-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) E.setMode(b.dataset.mode);
    });
    $('doc-name').addEventListener('change', (e) => {
      E.doc.name = e.target.value.trim() || 'Untitled';
      e.target.value = E.doc.name;
      changed();
    });
    $('doc-name').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') e.target.blur();
    });
    $('btn-undo').addEventListener('click', () => E.undo());
    $('btn-redo').addEventListener('click', () => E.redo());
    $('doc-menu').addEventListener('click', guard(async () => {
      const recent = await IO.recent().catch(() => []);
      DZ.popMenu($('doc-menu'), [
        { label: 'New design', key: '⌘N', run: newDoc },
        { label: 'Open…', key: '⌘O', run: openDoc },
        ...(recent.length ? [{ label: 'Open recent', sub: recent.slice(0, 6).map((r) => ({ label: r.name, run: () => DZ.runCommand('openPath', r.path) })) }] : []),
        { sep: true },
        { label: 'Save', key: '⌘S', run: () => saveDoc(false) },
        { label: 'Save as…', key: '⇧⌘S', run: () => saveDoc(true) },
        { sep: true },
        { label: 'Export…', key: '⌘E', run: () => openExport() },
        { label: 'Export tech pack (PDF)', run: () => DZ.runCommand('techpack') },
        { label: 'Export screen-print separations', run: () => DZ.runCommand('separations') },
        { sep: true },
        { label: 'Import artwork…', key: '⇧⌘P', run: () => IO.pickImages() },
        { label: 'Edit brand palette…', run: () => DZ.openPaletteEditor() },
      ]);
    }));
    $('btn-panels').addEventListener('click', () => DZ.runCommand('togglePanels'));
    $('btn-help').addEventListener('click', () => DZ.openHelp());
    $('help-close').addEventListener('click', () => ($('help-modal').hidden = true));
    $('help-modal').addEventListener('click', (e) => e.target.id === 'help-modal' && ($('help-modal').hidden = true));
    $('btn-export').addEventListener('click', () => openExport());
    $('close').addEventListener('click', async () => {
      await IO.autosaveNow();
      if (host) host.closeWindow();
    });
  }

  let dirty = false;
  function changed() {
    dirty = true;
    $('dirty').hidden = false;
    IO.scheduleAutosave();
  }

  async function newDoc() {
    if (E.canvas.getObjects().length && dirty && !confirm('Start a new design? Unsaved changes to this one will be lost (the autosave is replaced).')) return;
    await E.setDoc(E.blankDoc());
    IO.docPath = null;
    dirty = false;
    $('dirty').hidden = true;
    IO.scheduleAutosave();
    DZ.renderRecent();
  }

  async function openDoc() {
    const d = await IO.open();
    if (!d) return;
    await E.setDoc(d);
    dirty = false;
    $('dirty').hidden = true;
    DZ.toast(`Opened “${d.name}”`);
    IO.scheduleAutosave();
  }

  async function saveDoc(saveAs = false) {
    const where = await IO.save(saveAs === true);
    if (!where) return;
    dirty = false;
    $('dirty').hidden = true;
    DZ.toast('Saved ' + String(where).split('/').pop());
    DZ.renderRecent();
  }

  // ---------- export dialog ----------
  const exp = { kind: 'print', sides: 'current', backdrop: 'studio', format: 'sheet', style: 'sketch', colors: null, caption: false };

  function renderExport() {
    const d = E.doc;
    if (!exp.colors || !exp.colors.length) exp.colors = [d.color];
    const pick = (sel, val) => document.querySelectorAll(`${sel} button`).forEach((b) => b.classList.toggle('on', (b.dataset.kind || b.dataset.v) === val));
    pick('#export-kinds', exp.kind);
    if (exp.kind === 'svg' || exp.kind === 'separations') exp.sides = 'current';
    pick('#export-sides', exp.sides);
    pick('#export-backdrop', exp.backdrop);
    pick('#export-format', exp.format);
    pick('#export-style', exp.style);
    $('export-sides-field').hidden = exp.kind === 'techpack';
    $('export-sides').querySelector('[data-v="both"]').disabled = exp.kind === 'svg' || exp.kind === 'separations';
    $('export-mockup-fields').hidden = exp.kind !== 'mockup';
    $('export-caption').checked = exp.caption;
    const extra = [...new Set([d.color, ...exp.colors])].filter((c) => c && c.startsWith('#')).map((hex) => DZ.garmentColor(hex));
    $('export-colors').innerHTML = [...DZ.GARMENT_COLORS, ...extra].map((c) =>
      `<button class="sw big ${exp.colors.includes(c.id) ? 'on' : ''}" style="--c:${c.hex}" data-color="${c.id}" title="${c.name}" aria-label="${c.name}" aria-pressed="${exp.colors.includes(c.id)}"></button>`
    ).join('') + '<label class="sw big custom" title="Add any fabric color"><input type="color" id="export-color-custom" value="#888888"/></label>';
    const p = E.preset();
    const a = DZ.production.analyze();
    const garment = `${DZ.garmentColor(d.color).name.toLowerCase()} ${DZ.GARMENTS[d.garment].name.toLowerCase()}`;
    const hints = {
      print: `Exact print size: ${p.w} × ${p.h} in → ${Math.round(p.w * 300)} × ${Math.round(p.h * 300)} px, transparent, sRGB, 300 DPI. This is the file a DTG, DTF or print-on-demand printer asks for.`,
      mockup: `${exp.colors.length > 1 ? `${exp.colors.length} colorways side by side` : `${exp.style === 'sketch' ? 'Technical flat sketch of the' : 'Photo-style'} ${garment}`}${exp.format !== 'sheet' ? `, framed for ${DZ.io.FORMATS[exp.format].name.toLowerCase()}` : ''}. Pick several colors to show a colorway lineup.`,
      techpack: 'A one-page PDF for the factory: front and back flats with the artwork, size, distance from the shoulder (HPS), technique, ink list and your notes.',
      separations: a.inks.length
        ? `${a.inks.length} ink film${a.inks.length > 1 ? 's' : ''}${DZ.isDark(DZ.editor.garmentHex()) ? ' + white underbase' : ''} at 300 DPI, black on transparent — what a screen printer burns screens from. Images aren’t included (they need halftones).`
        : 'This side has no solid inks to separate.',
      svg: 'Vector file of the print area. Text keeps its font names, so the printer needs the same fonts — use the PNG print file when in doubt.',
    };
    $('export-hint').textContent = hints[exp.kind];
  }

  function openExport() {
    if (E.state.tool === 'pen') DZ.pen.finish();
    exp.colors = [E.doc.color];
    renderExport();
    $('export-modal').hidden = false;
    $('export-go').focus();
  }
  const closeExport = () => ($('export-modal').hidden = true);

  function wireExport() {
    const pick = (sel, key) =>
      $(sel).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        exp[key] = b.dataset.kind || b.dataset.v;
        renderExport();
      });
    pick('export-kinds', 'kind');
    pick('export-sides', 'sides');
    pick('export-backdrop', 'backdrop');
    pick('export-format', 'format');
    pick('export-style', 'style');
    $('export-colors').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      const id = b.dataset.color;
      if (exp.colors.includes(id)) {
        if (exp.colors.length > 1) exp.colors = exp.colors.filter((c) => c !== id);
      } else exp.colors.push(id);
      renderExport();
    });
    $('export-colors').addEventListener('change', (e) => {
      if (e.target.id !== 'export-color-custom') return;
      const hex = e.target.value.toUpperCase();
      if (!exp.colors.includes(hex)) exp.colors.push(hex);
      renderExport();
    });
    $('export-caption').addEventListener('change', (e) => (exp.caption = e.target.checked));
    $('export-cancel').addEventListener('click', closeExport);
    $('export-modal').addEventListener('click', (e) => e.target.id === 'export-modal' && closeExport());
    $('export-go').addEventListener('click', guard(async () => {
      const sides = exp.sides === 'both' ? ['front', 'back'] : [E.doc.side];
      const btn = $('export-go');
      btn.disabled = true;
      btn.textContent = 'Exporting…';
      try {
        let res;
        if (exp.kind === 'print') res = await IO.exportPrint(sides);
        else if (exp.kind === 'mockup') res = await IO.exportMockup(sides, exp.backdrop, { colors: exp.colors, format: exp.format, style: exp.style, caption: exp.caption ? E.doc.name : '' });
        else if (exp.kind === 'techpack') res = await DZ.production.exportTechPack();
        else if (exp.kind === 'separations') res = await DZ.production.exportSeparations();
        else res = await IO.exportSVG(E.doc.side);
        if (res) {
          closeExport();
          const n = Array.isArray(res) ? `${res.length} files` : String(res).split('/').pop();
          DZ.toast('Exported ' + n);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Export';
      }
    }));
  }

  // ---------- status bar ----------
  function renderStatus() {
    $('st-tool').textContent = E.state.mode === 'preview'
      ? 'Preview — this is how it prints. Drag to pan · ⌘Y to edit'
      : DZ.TOOL_HINTS[E.state.tool] || '';
    $('zoom-val').textContent = E.zoomPercent() + '%';
    const issues = P.checks();
    $('st-warn').textContent = issues.length ? '⚠ ' + issues[0] : '';
  }

  function wireStatus() {
    $('zoom-in').addEventListener('click', () => E.zoomBy(1.25));
    $('zoom-out').addEventListener('click', () => E.zoomBy(0.8));
    $('zoom-val').addEventListener('click', () => E.fit());
    $('fit-print').addEventListener('click', () => E.fit('print'));
    E.on('cursor', (p) => {
      const r = E.printRect();
      $('st-cursor').textContent = `x ${((p.x - r.left) / 300).toFixed(2)}  y ${((p.y - r.top) / 300).toFixed(2)} in`;
    });
  }

  // ---------- keyboard ----------
  const typing = () => {
    const el = document.activeElement;
    const a = E.active();
    return (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) || (a && a.isEditing);
  };

  function wireKeys() {
    document.addEventListener('keydown', guard(async (e) => {
      if (!$('palette-modal').hidden || !$('cmd-modal').hidden) return;
      if (!$('help-modal').hidden) {
        if (e.key === 'Escape' || e.key === 'Enter') $('help-modal').hidden = true;
        return;
      }
      if (e.key === 'Escape' && document.getElementById('tool-flyout')) {
        closeFlyout();
        return;
      }
      if (!$('export-modal').hidden) {
        if (e.key === 'Escape') closeExport();
        if (e.key === 'Enter') $('export-go').click();
        return;
      }
      const a = E.active();
      if (a && a.isEditing) {
        if (e.key === 'Escape') {
          a.exitEditing();
          E.canvas.setActiveObject(a);
          E.canvas.requestRenderAll();
        }
        return;
      }
      if (typing()) return;
      const cmd = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (e.code === 'Space' && !e.repeat) {
        E.setSpace(true);
        e.preventDefault();
        return;
      }

      if (cmd && e.ctrlKey && e.code === 'KeyS') {
        e.preventDefault();
        return DZ.runCommand('togglePanels');
      }
      if (!cmd && e.key === '?') {
        e.preventDefault();
        return DZ.openHelp();
      }
      if (cmd && e.altKey && e.code === 'KeyE') {
        e.preventDefault();
        return DZ.runCommand('merge');
      }
      if (cmd) {
        const map = {
          z: () => (e.shiftKey ? E.redo() : E.undo()),
          y: () => E.setMode(E.state.mode === 'edit' ? 'preview' : 'edit'),
          s: () => saveDoc(e.shiftKey),
          o: openDoc,
          n: () => (e.shiftKey ? E.addLayer() : newDoc()),
          e: openExport,
          k: () => DZ.openCommand(),
          d: () => (e.shiftKey ? DZ.runCommand('array') : E.duplicate()),
          a: () => E.selectAll(),
          g: () => (e.shiftKey ? E.ungroup() : E.group()),
          c: () => E.copy(),
          x: async () => {
            if (await E.copy()) E.deleteSelected();
          },
          '0': () => E.fit(),
          '1': () => E.fit('print'),
          '=': () => E.zoomBy(1.25),
          '+': () => E.zoomBy(1.25),
          '-': () => E.zoomBy(0.8),
          ']': () => E.arrange(e.shiftKey ? 'front' : 'forward'),
          '[': () => E.arrange(e.shiftKey ? 'back' : 'backward'),
          '}': () => E.arrange('front'),
          '{': () => E.arrange('back'),
          p: () => e.shiftKey && IO.pickImages(),
        };
        if (map[k]) {
          e.preventDefault();
          await map[k]();
        }
        return; // ⌘V is handled by the paste event so images from the clipboard work
      }

      if (E.state.tool === 'pen' && DZ.pen.active()) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          DZ.pen.finish(false);
          e.preventDefault();
          return;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          DZ.pen.removeLast();
          e.preventDefault();
          return;
        }
      }

      if ((E.state.tool === 'wand' || E.state.tool === 'lasso') && DZ.wand.has() && !a) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          await DZ.wand.run('delete');
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          await DZ.wand.run('clear');
          return;
        }
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        E.deleteSelected();
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        E.exitPathEdit();
        E.canvas.discardActiveObject();
        E.canvas.requestRenderAll();
        if (E.state.tool !== 'select') E.setTool('select');
        return;
      }
      if (e.key.startsWith('Arrow') && a) {
        const step = (e.shiftKey ? 0.5 : 0.05) * 300;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        E.nudge(dx, dy);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && a && (a.isType('i-text') || a.isType('text'))) {
        a.enterEditing();
        a.selectAll();
        e.preventDefault();
        return;
      }
      if ((e.key === '[' || e.key === ']') && DZ.brush.isTool(E.state.tool)) {
        const st = E.state.tool === 'eraser' ? E.state.eraser : E.state.brush;
        st.size = Math.max(1, Math.min(400, Math.round(st.size * (e.key === ']' ? 1.2 : 1 / 1.2))));
        P.renderProps();
        e.preventDefault();
        return;
      }
      const tool = TOOLS.find((t) => t.key && t.key.toLowerCase() === k);
      if (tool && !e.altKey) {
        E.setTool(tool.id);
        e.preventDefault();
      }
    }));

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') E.setSpace(false);
    });
    window.addEventListener('blur', () => E.setSpace(false));

    document.addEventListener('paste', guard(async (e) => {
      if (typing()) return;
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      e.preventDefault();
      if (files.length) {
        await IO.importFiles(files);
        DZ.toast('Pasted image');
        return;
      }
      const text = e.clipboardData?.getData('text/plain') || '';
      if (/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(text)) {
        await E.addSVG(text, { name: 'Pasted SVG' });
        return;
      }
      if (E.hasClipboard()) await E.paste();
    }));
  }

  // ---------- menu bar + context menu commands ----------
  async function pasteFromMenu() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await it.getType(type);
          await IO.importFiles([new File([blob], 'Pasted image', { type })]);
          return;
        }
      }
    } catch {}
    if (E.hasClipboard()) await E.paste();
  }

  const COMMANDS = {
    new: newDoc, open: openDoc, save: () => saveDoc(false), saveAs: () => saveDoc(true),
    openPath: async (p) => {
      const d = await IO.openPath(p);
      await E.setDoc(d);
      dirty = false;
      $('dirty').hidden = true;
      DZ.toast(`Opened “${d.name}”`);
      IO.scheduleAutosave();
    }, export: openExport, import: () => IO.pickImages(),
    undo: () => E.undo(), redo: () => E.redo(),
    cut: async () => { if (await E.copy()) E.deleteSelected(); },
    copy: () => E.copy(), paste: pasteFromMenu, duplicate: () => E.duplicate(), delete: () => E.deleteSelected(),
    newLayer: () => E.addLayer(),
    togglePanels: () => {
      const on = !document.body.classList.contains('panels-hidden');
      document.body.classList.toggle('panels-hidden', on);
      $('btn-panels').setAttribute('aria-pressed', on);
      $('btn-panels').title = on ? 'Show panels (⌃⌘S)' : 'Hide panels (⌃⌘S)';
      $('btn-panels').setAttribute('aria-label', on ? 'Show panels' : 'Hide panels');
      requestAnimationFrame(() => E.resize && E.resize());
      setTimeout(() => (E.resize ? E.resize() : window.dispatchEvent(new Event('resize'))), 260);
    },
    help: () => DZ.openHelp(),
    merge: async () => {
      const objs = E.activeObjects();
      if (!objs.length) return DZ.toast('Select the objects to merge.', true);
      await E.mergeToImage(objs);
    },
    distort: async () => E.active() && DZ.warp.start(E.active(), 'perspective'),
    warp: async () => E.active() && DZ.warp.start(E.active(), 'mesh'),
    array: async () => {
      const a = E.active();
      if (!a || a.isType('activeselection')) return DZ.toast('Select one object to make an array.', true);
      if (!E.isArray(a)) await E.makeArray(a);
      DZ.panels.renderProps();
    },
    selectAll: () => E.selectAll(), group: () => E.group(), ungroup: () => E.ungroup(),
    front: () => E.arrange('front'), forward: () => E.arrange('forward'), backward: () => E.arrange('backward'), back: () => E.arrange('back'),
    flipH: () => E.flip('h'), flipV: () => E.flip('v'),
    editPoints: () => { E.setTool('direct'); E.enterPathEdit(E.active()); },
    preview: () => E.setMode(E.state.mode === 'edit' ? 'preview' : 'edit'),
    'side-front': () => E.switchSide('front'), 'side-back': () => E.switchSide('back'),
    zoomIn: () => E.zoomBy(1.25), zoomOut: () => E.zoomBy(0.8), fit: () => E.fit(), fitPrint: () => E.fit('print'),
    techpack: async () => {
      const r = await DZ.production.exportTechPack();
      if (r) DZ.toast('Exported ' + String(r).split('/').pop());
    },
    separations: async () => {
      const r = await DZ.production.exportSeparations();
      if (r) DZ.toast(`Exported ${Array.isArray(r) ? r.length + ' files' : r}`);
    },
    palette: () => DZ.openPaletteEditor(),
    search: () => DZ.openCommand(),
  };
  DZ.runCommand = guard(async (id, arg) => COMMANDS[id] && COMMANDS[id](arg));

  // Edit-menu commands typed into a text field act on the field, not the canvas.
  const NATIVE_EDIT = { undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste', selectAll: 'selectAll', delete: 'delete' };

  function wireCommands() {
    if (!host || !host.onCommand) return;
    host.onCommand(guard(async (id) => {
      if (typing() && NATIVE_EDIT[id]) {
        document.execCommand(NATIVE_EDIT[id]);
        return;
      }
      if (id.startsWith('align-')) return E.align(id.slice(6));
      if (id.startsWith('tool-')) return E.setTool(id.slice(5));
      if (COMMANDS[id]) await COMMANDS[id]();
    }));
    $('stage').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (E.state.mode === 'preview') return;
      const a = E.active();
      host.contextMenu({
        hasSelection: !!a,
        multi: !!a && a.isType('activeselection'),
        isGroup: !!a && a.isType('group'),
        isPath: !!a && a.isType('path'),
        canPaste: true,
      });
    });
  }

  // ---------- drop artwork / library items on the stage ----------
  function wireDrop() {
    const stage = $('stage');
    const hint = $('drop-hint');
    let depth = 0;
    const scenePoint = (e) => {
      const r = stage.getBoundingClientRect();
      const v = E.canvas.viewportTransform;
      return new fabric.Point((e.clientX - r.left - v[4]) / v[0], (e.clientY - r.top - v[5]) / v[3]);
    };
    stage.addEventListener('dragenter', (e) => {
      if (![...e.dataTransfer.types].some((t) => t === 'Files' || t === 'application/x-design')) return;
      depth++;
      stage.classList.add('dropping');
      hint.textContent = [...e.dataTransfer.types].includes('Files') ? 'Drop artwork to place it' : 'Drop to place';
    });
    stage.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) stage.classList.remove('dropping');
    });
    stage.addEventListener('dragover', (e) => {
      if ([...e.dataTransfer.types].some((t) => t === 'Files' || t === 'application/x-design')) e.preventDefault();
    });
    stage.addEventListener('drop', guard(async (e) => {
      e.preventDefault();
      depth = 0;
      stage.classList.remove('dropping');
      if (E.state.mode === 'preview') E.setMode('edit');
      const at = scenePoint(e);
      const lib = e.dataTransfer.getData('application/x-design');
      if (lib) {
        const d = JSON.parse(lib);
        if (d.motif) await P.addMotif(d.motif, at);
        else if (d.word !== undefined) P.addWord(d.word, at);
        return;
      }
      if (e.dataTransfer.files.length) await IO.importFiles([...e.dataTransfer.files], at);
    }));
    // Keep a stray file drop elsewhere from navigating the window away.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  // ---------- boot ----------
  async function loadFonts() {
    const jobs = [];
    DZ.FONTS.forEach((f) => f.weights.forEach((w) => jobs.push(document.fonts.load(`${w} 40px "${f.family}"`, 'AΩaω'))));
    try {
      await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 4000))]);
    } catch {}
  }

  async function boot() {
    await loadFonts();
    await DZ.loadBrand();
    E.init();
    DZ.wand.init();
    DZ.warp.init();
    P.init();
    DZ.ux.init();
    renderTools();
    wireTools();
    wireTop();
    wireExport();
    wireStatus();
    wireKeys();
    wireDrop();
    wireCommands();

    E.on('tool', () => {
      renderTools();
      renderStatus();
      if (!E.active()) P.renderProps();
    });
    E.on('mode', () => {
      DZ.updateOnboarding();
      renderTop();
      renderTools();
      P.renderProps();
      renderStatus();
    });
    E.on('selection', () => {
      P.renderProps();
      P.renderLayers();
    });
    E.on('objects', () => {
      P.renderLayers();
      renderStatus();
      DZ.updateOnboarding();
      if (!E.active()) P.renderProps();
    });
    E.on('modified', () => {
      P.renderProps();
      P.renderLayers();
      renderStatus();
    });
    E.on('transforming', () => P.refreshTransform());
    E.on('doc', () => {
      DZ.updateOnboarding();
      renderTop();
      P.renderProps();
      P.renderLayers();
      renderStatus();
    });
    E.on('layers', () => {
      P.renderLayers();
      if (!E.active()) P.renderProps();
    });
    E.on('wand', () => P.renderProps());
    E.on('warp', () => P.renderProps());
    E.on('history', renderHistory);
    E.on('changed', changed);
    E.on('viewport', () => ($('zoom-val').textContent = E.zoomPercent() + '%'));

    const saved = await IO.readAutosave();
    await E.setDoc(IO.validDoc(saved) ? saved : E.blankDoc());
    dirty = false;
    $('dirty').hidden = true;
    renderTop();
    renderHistory();
    renderStatus();
    document.body.classList.add('ready');
    window.addEventListener('beforeunload', () => IO.autosaveNow());
  }

  boot().catch((err) => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#f88;padding:24px;font:12px ui-monospace">${String(err.stack || err)}</pre>`;
  });
})();
