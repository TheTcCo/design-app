// Distress textures (vintage / worn print look).
// A texture is an image layer drawn with "destination-out": it erases the artwork under it,
// exactly like a printer's distressed screen. The garment shows through.
(function () {
  const E = DZ.editor;
  const { DPI } = DZ;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Smooth value noise on a coarse grid, bilinearly interpolated.
  function valueNoise(w, h, cell, rand) {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const g = new Float32Array(gw * gh).map(() => rand());
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < w; x++) {
        const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
        out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      }
    }
    return out;
  }

  function canvasOf(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function fromAlpha(w, h, alphaFn) {
    const c = canvasOf(w, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = alphaFn(i);
    ctx.putImageData(img, 0, 0);
    return c;
  }

  const GEN = {
    grain(w, h) {
      const r = rng(7);
      const n = valueNoise(w, h, Math.max(4, w / 60), rng(3));
      return fromAlpha(w, h, (i) => (r() < 0.06 + n[i] * 0.14 ? 255 : 0));
    },
    worn(w, h) {
      const r = rng(11);
      const a = valueNoise(w, h, w / 7, rng(5));
      const b = valueNoise(w, h, w / 22, rng(9));
      const c = valueNoise(w, h, w / 70, rng(13));
      return fromAlpha(w, h, (i) => {
        const v = a[i] * 0.55 + b[i] * 0.3 + c[i] * 0.15;
        if (v > 0.66) return 255;
        if (v > 0.56) return r() < (v - 0.56) * 8 ? 255 : 0;
        return r() < 0.025 ? 255 : 0;
      });
    },
    cracked(w, h) {
      const c = canvasOf(w, h);
      const ctx = c.getContext('2d');
      const r = rng(21);
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const n = Math.round((w * h) / 9000);
      for (let k = 0; k < n; k++) {
        let x = r() * w, y = r() * h, ang = r() * Math.PI * 2;
        ctx.lineWidth = 0.6 + r() * 1.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const steps = 4 + Math.floor(r() * 10);
        for (let s = 0; s < steps; s++) {
          ang += (r() - 0.5) * 1.3;
          const len = 4 + r() * 16;
          x += Math.cos(ang) * len;
          y += Math.sin(ang) * len;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      return c;
    },
    fade(w, h) {
      // Halftone dots growing toward the bottom: the classic vintage fade-out.
      const c = canvasOf(w, h);
      const ctx = c.getContext('2d');
      const step = Math.max(6, Math.round(w / 90));
      ctx.fillStyle = '#000';
      for (let y = 0; y < h + step; y += step) {
        const t = Math.max(0, (y / h - 0.35) / 0.65);
        const rad = (step * 0.72) * Math.pow(t, 1.1);
        if (rad < 0.3) continue;
        for (let x = (Math.floor(y / step) % 2) * (step / 2); x < w + step; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return c;
    },
  };

  DZ.TEXTURES = [
    { id: 'grain', name: 'Grain', note: 'Fine speckle, soft vintage feel' },
    { id: 'worn', name: 'Worn', note: 'Patchy wear like an old washed tee' },
    { id: 'cracked', name: 'Cracked', note: 'Cracked plastisol ink' },
    { id: 'fade', name: 'Halftone fade', note: 'Dots fade the bottom out' },
  ];

  const cache = {};
  DZ.textureURL = (id, w = 1200, h = 1600) => {
    const key = `${id}-${w}x${h}`;
    if (!cache[key]) cache[key] = GEN[id](w, h).toDataURL('image/png');
    return cache[key];
  };

  DZ.textureThumb = (id) => {
    const key = `thumb-${id}`;
    if (!cache[key]) {
      const src = GEN[id](150, 120);
      const c = canvasOf(150, 120);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#E8E2D6';
      ctx.fillRect(0, 0, 150, 120);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(src, 0, 0);
      cache[key] = c.toDataURL('image/png');
    }
    return cache[key];
  };

  E.addTexture = async (id) => {
    const r = E.printRect();
    const long = 1400;
    const w = r.width >= r.height ? long : Math.round((long * r.width) / r.height);
    const h = r.width >= r.height ? Math.round((long * r.height) / r.width) : long;
    const t = DZ.TEXTURES.find((x) => x.id === id);
    const img = await fabric.FabricImage.fromURL(DZ.textureURL(id, w, h));
    img.set({
      left: r.left, top: r.top, originX: 'left', originY: 'top',
      scaleX: r.width / w, scaleY: r.height / h,
      globalCompositeOperation: 'destination-out',
      opacity: id === 'fade' ? 1 : 0.9,
    });
    img.texture = id;
    img.layer = E.activeLayer().id;
    const clipped = await E.applyAlphaLock(img);
    E.addObject(img, { name: `Distress · ${t.name}${clipped ? ' (alpha lock)' : ''}` });
    return img;
  };

  E.isTexture = (o) => !!o && (o.globalCompositeOperation === 'destination-out' || !!o.texture);

  // A texture either erases the print (distress) or prints as its own ink color.
  E.setTextureMode = (o, mode, color) => {
    if (mode === 'color') {
      o.globalCompositeOperation = 'source-over';
      o.tint = color || o.tint || E.state.ink;
    } else {
      o.globalCompositeOperation = 'destination-out';
      o.tint = null;
    }
    DZ.panels.applyImageFilters(o);
    o.set('dirty', true);
    E.canvas.requestRenderAll();
  };

})();
