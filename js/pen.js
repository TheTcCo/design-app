// Pen tool: click for corner points, click-drag for smooth points, click the first point
// to close the shape, Enter/Esc to finish an open path, Delete to remove the last point.
(function () {
  const E = DZ.editor;
  const BLUE = '#2F7BFF';
  let pts = [];
  let dragging = null;
  let hover = null;

  const P = (x, y) => ({ x, y });

  function near(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < 9 / E.zoom();
  }

  function segment(a, b) {
    const c1 = a.hout || a, c2 = b.hin || b;
    return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
  }

  function buildD(closed) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ' ' + segment(pts[i - 1], pts[i]);
    if (closed) d += ' ' + segment(pts[pts.length - 1], pts[0]) + ' Z';
    return d;
  }

  DZ.pen = {
    active: () => pts.length > 0,

    down(p) {
      if (pts.length >= 2 && near(p, pts[0])) {
        this.finish(true);
        return;
      }
      const pt = { x: p.x, y: p.y, hin: null, hout: null };
      pts.push(pt);
      dragging = pt;
      E.canvas.requestRenderAll();
    },

    move(p, e) {
      hover = p;
      if (dragging && e.buttons & 1) {
        dragging.hout = P(p.x, p.y);
        dragging.hin = P(2 * dragging.x - p.x, 2 * dragging.y - p.y);
      } else {
        dragging = null;
      }
      if (pts.length) E.canvas.requestRenderAll();
    },

    removeLast() {
      pts.pop();
      E.canvas.requestRenderAll();
      if (!pts.length) this.clear();
    },

    finish(closed = false) {
      if (pts.length >= 2) {
        const ink = E.state.ink;
        const stroke = closed ? E.state.stroke : E.state.stroke || ink;
        const path = new fabric.Path(buildD(closed), {
          fill: closed ? ink : '',
          stroke: stroke || null,
          strokeWidth: stroke ? E.state.strokePt * DZ.PT : 0,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
        });
        pts = [];
        dragging = null;
        E.addObject(path, { name: closed ? 'Shape' : 'Path', select: false });
      }
      this.clear();
    },

    clear() {
      pts = [];
      dragging = null;
      hover = null;
      const c = E.canvas;
      if (c) {
        c.clearContext(c.contextTop);
        c.requestRenderAll();
      }
    },

    render() {
      const c = E.canvas;
      if (E.state.tool !== 'pen' || !pts.length) return;
      const ctx = c.contextTop;
      c.clearContext(ctx);
      const v = c.viewportTransform;
      const z = v[0];
      ctx.save();
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
      ctx.lineWidth = 1.5 / z;
      ctx.strokeStyle = BLUE;
      // committed segments
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const c1 = a.hout || a, c2 = b.hin || b;
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      }
      // rubber band to cursor
      if (hover && !dragging) {
        const a = pts[pts.length - 1];
        const c1 = a.hout || a;
        ctx.bezierCurveTo(c1.x, c1.y, hover.x, hover.y, hover.x, hover.y);
      }
      ctx.stroke();
      // handles
      const last = pts[pts.length - 1];
      ctx.lineWidth = 1 / z;
      [last, pts[pts.length - 2]].filter(Boolean).forEach((pt) => {
        ['hin', 'hout'].forEach((k) => {
          if (!pt[k]) return;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt[k].x, pt[k].y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pt[k].x, pt[k].y, 3.5 / z, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        });
      });
      // anchors
      const s = 7 / z;
      pts.forEach((pt, i) => {
        const closing = i === 0 && hover && pts.length >= 2 && near(hover, pts[0]);
        ctx.fillStyle = closing ? BLUE : '#fff';
        ctx.fillRect(pt.x - s / 2, pt.y - s / 2, s, s);
        ctx.strokeRect(pt.x - s / 2, pt.y - s / 2, s, s);
      });
      ctx.restore();
    },
  };
})();
