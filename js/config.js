// Shared constants. World units are print pixels at 300 DPI: 1 inch = 300 units.
// World origin (0,0) is the garment's high point shoulder (HPS) on the center line, so
// design objects keep their place on the garment when the print-area preset changes.
window.DZ = window.DZ || {};

DZ.DPI = 300;
DZ.PT = DZ.DPI / 72; // world units per typographic point

// Proposed brand palette (brand book lists the family; exact values are a first pass and
// can be edited here — every swatch in the app reads from this list).
DZ.PALETTE = [
  { id: 'black', name: 'Black', hex: '#161514' },
  { id: 'navy', name: 'Navy', hex: '#1E2A44' },
  { id: 'cream', name: 'Cream', hex: '#EFE6D2' },
  { id: 'stone', name: 'Stone', hex: '#A9A294' },
  { id: 'camel', name: 'Camel', hex: '#B88A57' },
  { id: 'olive', name: 'Olive', hex: '#5E6237' },
  { id: 'terracotta', name: 'Terracotta', hex: '#B0532E' },
  { id: 'gold', name: 'Gold', hex: '#B8913E' },
];

// Fabric colors a garment can be dyed in.
DZ.GARMENT_COLORS = [
  { id: 'black', name: 'Black', hex: '#1A1918' },
  { id: 'navy', name: 'Navy', hex: '#222D45' },
  { id: 'olive', name: 'Olive', hex: '#5A5E38' },
  { id: 'terracotta', name: 'Terracotta', hex: '#A9563A' },
  { id: 'camel', name: 'Camel', hex: '#B48C5E' },
  { id: 'stone', name: 'Stone', hex: '#ADA697' },
  { id: 'cream', name: 'Cream', hex: '#EAE0CB' },
  { id: 'ecru', name: 'Ecru', hex: '#F2EEE5' },
];

DZ.FONTS = [
  { family: 'Cinzel', label: 'Cinzel', note: 'Roman inscription', weights: [400, 700] },
  { family: 'GFS Didot', label: 'GFS Didot', note: 'Greek + Latin', weights: [400], greek: true },
  { family: 'Noto Serif Display', label: 'Noto Serif Display', note: 'Greek + Latin', weights: [400, 700], greek: true },
  { family: 'Cormorant Garamond', label: 'Cormorant Garamond', note: 'Old-style serif', weights: [400, 600] },
  { family: 'Bodoni Moda', label: 'Bodoni Moda', note: 'High-contrast serif', weights: [400, 700] },
  { family: 'Marcellus', label: 'Marcellus', note: 'Flared classical', weights: [400] },
  { family: 'Old Standard TT', label: 'Old Standard', note: 'Victorian serif', weights: [400, 700] },
  { family: 'Inter', label: 'Inter', note: 'Neutral sans, Greek', weights: [400, 600, 800], greek: true },
];

DZ.GARMENTS = {
  tee: { name: 'T-shirt', short: 'Tee' },
  longtee: { name: 'Long sleeve tee', short: 'Long sleeve' },
  hoodie: { name: 'Hoodie', short: 'Hoodie' },
  crew: { name: 'Crewneck', short: 'Crew' },
  ziphoodie: { name: 'Zip hoodie', short: 'Zip hoodie' },
  jacket: { name: 'Bomber jacket', short: 'Bomber' },
  shorts: { name: 'Sweat shorts', short: 'Shorts', bottom: true },
  pants: { name: 'Sweatpants', short: 'Sweatpants', bottom: true },
};

// Print-area presets in inches. top = distance below the HPS, x = horizontal offset of the
// area's center from the garment center line (positive = viewer's right).
DZ.PRINT_PRESETS = {
  tee: {
    front: [
      { id: 'full', name: 'Full front', w: 12, h: 16, top: 3.5, x: 0 },
      { id: 'oversized', name: 'Oversized front', w: 14, h: 18, top: 3.5, x: 0 },
      { id: 'chest', name: 'Center chest', w: 10, h: 4, top: 3.5, x: 0 },
      { id: 'left-chest', name: 'Left chest', w: 4, h: 4, top: 4.5, x: 5 },
    ],
    back: [
      { id: 'full', name: 'Full back', w: 12, h: 16, top: 4, x: 0 },
      { id: 'oversized', name: 'Oversized back', w: 14, h: 18, top: 3.5, x: 0 },
      { id: 'upper', name: 'Upper back', w: 12, h: 4, top: 2.5, x: 0 },
    ],
  },
  longtee: {
    front: [
      { id: 'full', name: 'Full front', w: 12, h: 16, top: 3.5, x: 0 },
      { id: 'chest', name: 'Center chest', w: 10, h: 4, top: 3.5, x: 0 },
      { id: 'left-chest', name: 'Left chest', w: 4, h: 4, top: 4.5, x: 5 },
    ],
    back: [
      { id: 'full', name: 'Full back', w: 12, h: 16, top: 4, x: 0 },
      { id: 'upper', name: 'Upper back', w: 12, h: 4, top: 2.5, x: 0 },
    ],
  },
  hoodie: {
    front: [
      { id: 'full', name: 'Front (above pocket)', w: 12, h: 10, top: 5, x: 0 },
      { id: 'chest', name: 'Center chest', w: 10, h: 4, top: 5, x: 0 },
      { id: 'left-chest', name: 'Left chest', w: 4, h: 4, top: 5.5, x: 5 },
    ],
    back: [
      { id: 'full', name: 'Full back', w: 14, h: 14, top: 11.5, x: 0 },
      { id: 'lower', name: 'Lower back', w: 12, h: 8, top: 16, x: 0 },
    ],
  },
  crew: {
    front: [
      { id: 'full', name: 'Full front', w: 12, h: 14, top: 3.5, x: 0 },
      { id: 'chest', name: 'Center chest', w: 10, h: 4, top: 3.5, x: 0 },
      { id: 'left-chest', name: 'Left chest', w: 4, h: 4, top: 4.5, x: 5 },
    ],
    back: [
      { id: 'full', name: 'Full back', w: 12, h: 16, top: 4, x: 0 },
      { id: 'upper', name: 'Upper back', w: 12, h: 4, top: 2.5, x: 0 },
    ],
  },
  // Zip front: chest prints sit either side of the zip.
  ziphoodie: {
    front: [
      { id: 'left-chest', name: 'Left chest', w: 4, h: 4, top: 5.5, x: 5 },
      { id: 'right-chest', name: 'Right chest', w: 4, h: 4, top: 5.5, x: -5 },
    ],
    back: [
      { id: 'full', name: 'Full back', w: 14, h: 14, top: 11.5, x: 0 },
      { id: 'lower', name: 'Lower back', w: 12, h: 8, top: 16, x: 0 },
    ],
  },
  jacket: {
    front: [
      { id: 'left-chest', name: 'Left chest', w: 4, h: 4, top: 5.5, x: 5.5 },
      { id: 'right-chest', name: 'Right chest', w: 4, h: 4, top: 5.5, x: -5.5 },
    ],
    back: [
      { id: 'full', name: 'Full back', w: 12, h: 12, top: 4.5, x: 0 },
      { id: 'upper', name: 'Upper back', w: 12, h: 4, top: 3.5, x: 0 },
    ],
  },
  // Bottoms: top = distance below the top of the waistband. Front view: the wearer's left
  // leg is on the viewer's right (x > 0); back view flips it.
  shorts: {
    front: [
      { id: 'left-leg', name: 'Left leg', w: 4, h: 4, top: 13.5, x: 7 },
      { id: 'right-leg', name: 'Right leg', w: 4, h: 4, top: 13.5, x: -7 },
    ],
    back: [
      { id: 'waist', name: 'Below waistband', w: 6, h: 2, top: 2.6, x: 0 },
      { id: 'left-leg', name: 'Left leg', w: 4, h: 4, top: 13.5, x: -7 },
    ],
  },
  pants: {
    front: [
      { id: 'left-thigh', name: 'Left thigh', w: 4, h: 4, top: 15, x: 6.2 },
      { id: 'left-leg', name: 'Down the left leg', w: 3, h: 20, top: 15, x: 6.3 },
      { id: 'right-thigh', name: 'Right thigh', w: 4, h: 4, top: 15, x: -6.2 },
    ],
    back: [
      { id: 'waist', name: 'Below waistband', w: 6, h: 2, top: 2.6, x: 0 },
      { id: 'left-leg', name: 'Down the left leg', w: 3, h: 20, top: 15, x: -6.3 },
    ],
  },
};

// Custom properties that must survive serialization (save/load, undo/redo, side switching).
DZ.SERIAL_PROPS = ['uid', 'name', 'locked', 'selectable', 'evented', 'motif', 'arc', 'tint', 'knockout', 'globalCompositeOperation', 'adjust', 'adjustBase', 'arrayMod', 'arraySrc', 'arrayCenter', 'layer', 'warp', 'warpSrc', 'warpBox', 'texture', 'gradDef'];

// A garment color is a GARMENT_COLORS id or any '#RRGGBB' (custom fabric).
DZ.garmentColor = (v) => {
  const c = DZ.GARMENT_COLORS.find((x) => x.id === v);
  if (c) return c;
  if (/^#[0-9a-f]{6}$/i.test(v || '')) return { id: v.toUpperCase(), name: `Custom ${v.toUpperCase()}`, hex: v.toUpperCase() };
  return DZ.GARMENT_COLORS[0];
};

DZ.paletteName = (hex) => {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.toUpperCase();
  const p = DZ.PALETTE.find((c) => c.hex.toUpperCase() === h);
  return p ? p.name : null;
};

DZ.isDark = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
};

DZ.shade = (hex, amt) => {
  // amt in [-1, 1]: negative darkens toward black, positive lightens toward white.
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

DZ.uid = () => Math.random().toString(36).slice(2, 10);
