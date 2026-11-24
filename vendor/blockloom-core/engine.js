/* Blockloom core texture engine — deterministic, tileable, pixel-first, no DOM. */
export const ENGINE_VERSION = '1.0.0';

const TAU = Math.PI * 2;
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;

function hash2(x, y, seed = 0) {
  let h = Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((y | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= Math.imul((seed | 0) + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/* Periodic value noise. Lattice wraps, so the finished texture tiles. */
function vnoise(x, y, cx, cy, seed) {
  const X = x * cx;
  const Y = y * cy;
  const xi = Math.floor(X);
  const yi = Math.floor(Y);
  const tx = smooth(X - xi);
  const ty = smooth(Y - yi);
  const x0 = mod(xi, cx);
  const y0 = mod(yi, cy);
  const x1 = mod(xi + 1, cx);
  const y1 = mod(yi + 1, cy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function fbm(x, y, cx, cy, seed, octaves = 4, persistence = 0.5) {
  let total = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += vnoise(x, y, cx * 2 ** i, cy * 2 ** i, seed + i * 101) * amp;
    norm += amp;
    amp *= persistence;
  }
  return total / norm;
}

function worley(x, y, cells, seed) {
  const X = x * cells;
  const Y = y * cells;
  const xi = Math.floor(X);
  const yi = Math.floor(Y);
  let d1 = 999;
  let d2 = 999;
  let id = 0;
  let cx0 = 0;
  let cy0 = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox;
      const cy = yi + oy;
      const wx = mod(cx, cells);
      const wy = mod(cy, cells);
      const px = cx + 0.18 + hash2(wx, wy, seed + 11) * 0.64;
      const py = cy + 0.18 + hash2(wx, wy, seed + 29) * 0.64;
      const dx = X - px;
      const dy = Y - py;
      const dist = dx * dx + dy * dy;
      if (dist < d1) {
        d2 = d1;
        d1 = dist;
        id = wx + wy * cells;
        cx0 = cx;
        cy0 = cy;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }
  return {
    d1: Math.sqrt(d1) / cells,
    edge: (Math.sqrt(d2) - Math.sqrt(d1)) / cells,
    id,
    cellX: mod(cx0, cells),
    cellY: mod(cy0, cells),
  };
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function bayer(x, y) {
  return BAYER[y & 3][x & 3] / 16 - 0.46875;
}

/* Colour helpers */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  h = mod(h, 360) / 360;
  s = clamp(s);
  l = clamp(l);
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    t = mod(t, 1);
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ];
}

function hexToHsl(hex) {
  return rgbToHsl(hexToRgb(hex));
}

function buildPalette(baseHex, opts = {}) {
  const base = hexToHsl(baseHex);
  const {
    hue = 0,
    hueTarget = null,
    satTarget = null,
    light = 0,
    count = 8,
    spread = 0.38,
    satBoost = 0,
  } = opts;
  const H = hueTarget == null ? base.h + hue : hueTarget + hue;
  const S = clamp(Math.max(base.s, satTarget == null ? base.s : satTarget) + satBoost);
  const L = clamp(base.l + light);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const shade = (t - 0.5) * spread;
    return hslToRgb(
      H + (t - 0.5) * 13,
      clamp(S + (t - 0.5) * 0.07),
      clamp(L + shade, 0.035, 0.97),
    );
  });
}

function shiftRgb([r, g, b], amount) {
  return [
    clamp(Math.round(r + amount), 0, 255),
    clamp(Math.round(g + amount), 0, 255),
    clamp(Math.round(b + amount), 0, 255),
  ];
}

function mixRgb(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

import {
  COLOR_WORDS,
  FINISHES,
  FINISH_CONFIG,
  MATERIALS,
  MATERIAL_GROUPS,
  MATERIAL_WORDS,
  MODIFIER_WORDS,
  getMaterial,
} from './data.js';

/* Prompt vocabulary helpers */
function wordInText(word, text) {
  return new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text);
}

export function parsePrompt(raw) {
  const text = ` ${String(raw || '').toLowerCase().replace(/[_-]/g, ' ')} `;
  let best = null;
  for (const candidate of MATERIAL_WORDS) {
    if (wordInText(candidate.word, text)) {
      const score = candidate.word.length * 10 + candidate.priority;
      if (!best || score > best.score) best = { id: candidate.id, score };
    }
  }

  const mods = [];
  for (const mod of MODIFIER_WORDS) {
    if (mod.words.some((word) => wordInText(word, text))) mods.push(mod.id);
  }

  let color = null;
  let colorAsAccent = false;
  for (const c of COLOR_WORDS) {
    const hit = c.words.find((word) => wordInText(word, text));
    if (hit && (!color || hit.length > color.matched.length)) {
      color = { ...c, matched: hit };
      const at = text.indexOf(` ${hit}`);
      const before = text.slice(Math.max(0, at - 34), at);
      const after = text.slice(at + hit.length, at + hit.length + 34);
      const context = `${before} ${after}`;
      colorAsAccent = /(crystal|gem|ore|vein|shard|flake|fleck|glow|accent|tip|speck)/.test(context);
    }
  }

  return {
    materialId: best?.id || null,
    modifiers: mods,
    color: color ? { name: color.name, hex: color.hex, hue: color.hue, sat: color.sat, light: color.light || 0 } : null,
    colorAsAccent,
    matchedColor: color?.name || null,
  };
}

export const MODIFIERS = MODIFIER_WORDS;

const NATURAL_GREEN = '#68893e';
const NATURAL_DARK = '#4c6732';

function put(buf, size, x, y, rgb, alpha = 255) {
  const i = (y * size + x) * 4;
  buf[i] = rgb[0];
  buf[i + 1] = rgb[1];
  buf[i + 2] = rgb[2];
  buf[i + 3] = alpha;
}

function getPx(buf, size, x, y) {
  const i = (y * size + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

function tune(ctx, t) {
  return clamp(0.5 + (t - 0.5) * ctx.depth + (hash2(ctx.x, ctx.y, ctx.seed + 991) - 0.5) * ctx.grain * 0.13);
}

function pick(ctx, palette, value, dither = true) {
  let v = clamp(value);
  if (dither) v += bayer(ctx.x, ctx.y) * 0.065 * ctx.dither;
  const idx = clamp(Math.floor(v * palette.length), 0, palette.length - 1);
  return palette[idx];
}

function topBorder(y, size) {
  return y < Math.max(1, Math.round(size * 0.12));
}

/* Stone-family renderers */
function renderStone(ctx) {
  const broad = fbm(ctx.u, ctx.v, 2, 2, ctx.seed + 1, 3, 0.58);
  const medium = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 8, 4, 0.52);
  const fine = fbm(ctx.u, ctx.v, 8, 8, ctx.seed + 44, 2, 0.5);
  const grain = hash2(ctx.x, ctx.y, ctx.seed + 80) - 0.5;
  let t = 0.5 + (broad - 0.5) * 0.42 + (medium - 0.5) * 0.38 + (fine - 0.5) * 0.26;
  t += grain * 0.11 * ctx.grain;
  if (hash2(ctx.x, ctx.y, ctx.seed + 3) < 0.045 * ctx.clutter) t -= 0.17;
  else if (grain > 0.44) t += 0.055;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderCobble(ctx) {
  const cells = ctx.size <= 16 ? 3 : ctx.size <= 32 ? 4 : 5;
  const w = worley(ctx.u, ctx.v, cells, ctx.seed + 5);
  const stone = hash2(w.id, 17, ctx.seed) - 0.5;
  const grain = hash2(ctx.x, ctx.y, ctx.seed + 61) - 0.5;
  let t = 0.5 + stone * 0.42 + (fbm(ctx.u, ctx.v, cells * 2, cells * 2, ctx.seed + 33, 3) - 0.5) * 0.32;
  t += grain * 0.15 * ctx.grain;
  const rim = w.edge;
  if (rim < 0.065) {
    const base = ctx.palette[0];
    return shiftRgb(base, -36 + grain * 14);
  }
  if (rim < 0.12) t -= 0.1;
  t += (0.1 - w.d1 * 0.16);
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderBricks(ctx) {
  const size = ctx.size;
  const rowH = Math.max(3, Math.round(size / 4));
  const brickW = rowH * 2;
  const row = Math.floor(ctx.y / rowH);
  const offset = (row & 1) * Math.floor(brickW / 2);
  const lx = mod(ctx.x + offset, brickW);
  const ly = ctx.y % rowH;
  const mortar = ly === 0 || lx === 0;
  const brickId = row * 31 + Math.floor((ctx.x + offset) / brickW);
  let t;
  if (mortar) {
    const n = 0.24 + (hash2(ctx.x, ctx.y, ctx.seed + 11) - 0.5) * 0.11;
    const v = Math.round(clamp(n) * 255);
    return [v, Math.round(v * 0.96), Math.round(v * 0.88)];
  }
  t = 0.53 + (hash2(brickId, row, ctx.seed + 4) - 0.5) * 0.31;
  t += (fbm(ctx.u, ctx.v, brickW, rowH, ctx.seed + 30, 3) - 0.5) * 0.3;
  t += (hash2(ctx.x, ctx.y, ctx.seed + 81) - 0.5) * 0.09 * ctx.grain;
  if (ly === rowH - 1) t -= 0.07;
  if (lx === brickW - 1) t -= 0.05;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderDeepslate(ctx) {
  const layers = fbm(ctx.u, ctx.v, 2, 8, ctx.seed + 6, 3, 0.56);
  const detail = fbm(ctx.u, ctx.v, 5, 5, ctx.seed + 17, 3, 0.5);
  let t = 0.43 + (layers - 0.5) * 0.7 + (detail - 0.5) * 0.3;
  if (hash2(ctx.x, ctx.y, ctx.seed + 42) < 0.035) t += 0.15;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderGravel(ctx) {
  const cells = ctx.size <= 16 ? 5 : 7;
  const w = worley(ctx.u, ctx.v, cells, ctx.seed + 22);
  const shade = hash2(w.id, 3, ctx.seed);
  let t = 0.42 + shade * 0.35;
  t += (fbm(ctx.u, ctx.v, cells * 2, cells * 2, ctx.seed + 72, 2) - 0.5) * 0.25;
  if (w.edge < 0.055) t -= 0.22;
  t -= w.d1 * 0.09;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderObsidian(ctx) {
  const n = fbm(ctx.u, ctx.v, 3, 4, ctx.seed + 2, 4, 0.55);
  const fleck = hash2(ctx.x, ctx.y, ctx.seed + 41);
  let t = 0.31 + (n - 0.5) * 0.7;
  if (fleck > 0.955) t = 0.72;
  if (fleck < 0.05) t = 0.08;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

/* Earth-family renderers */
function renderDirt(ctx) {
  const n = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 13, 4, 0.55);
  const coarse = fbm(ctx.u, ctx.v, 2, 2, ctx.seed + 90, 2);
  let t = 0.46 + (n - 0.5) * 0.65 + (coarse - 0.5) * 0.27;
  const pebble = hash2(ctx.x, ctx.y, ctx.seed + 7);
  if (pebble > 0.94) t += 0.16;
  else if (pebble < 0.055) t -= 0.18;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function grassTop(ctx, palette = ctx.palette, origin = 0) {
  const n = fbm(ctx.u, ctx.v, 4, 5, ctx.seed + 15 + origin, 4, 0.55);
  let t = 0.48 + (n - 0.5) * 0.5;
  const blade = hash2(ctx.x, ctx.y, ctx.seed + 25 + origin);
  if (blade > 0.89) t += 0.13 * ctx.clutter;
  else if (blade < 0.08) t -= 0.14 * ctx.clutter;
  return pick(ctx, palette, tune(ctx, t));
}

function renderGrassSide(ctx) {
  const size = ctx.size;
  const edgeBase = Math.max(2, Math.round(size * 0.23));
  const step = Math.max(1, Math.round(size / 16));
  const edge = edgeBase + Math.floor(hash2(ctx.x, 0, ctx.seed + 71) * edgeBase);
  const fringe = hash2(ctx.x, 1, ctx.seed + 33) > 0.8 ? step : 0;
  const greenZone = ctx.y < edge + fringe;
  if (greenZone) {
    const t = grassTop(ctx, ctx.greenPalette, 3);
    return t;
  }
  if (ctx.y < edge + fringe + step) {
    return pick(ctx, ctx.dirtPalette, tune(ctx, 0.43 + (hash2(ctx.x, ctx.y, ctx.seed + 9) - 0.5) * 0.16));
  }
  const n = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 14, 4, 0.55);
  let t = 0.44 + (n - 0.5) * 0.62;
  if (hash2(ctx.x, ctx.y, ctx.seed + 4) < 0.05 * ctx.clutter) t -= 0.18;
  return pick(ctx, ctx.dirtPalette, tune(ctx, t));
}

function renderSand(ctx) {
  const fine = hash2(ctx.x, ctx.y, ctx.seed + 92);
  const waves = Math.sin((ctx.u * 3 + ctx.v * 1.7) * TAU + ctx.seed) * 0.035;
  const n = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 18, 3);
  let t = 0.56 + (n - 0.5) * 0.28 + waves + (fine - 0.5) * 0.12 * ctx.grain;
  if (fine > 0.9) t += 0.08;
  if (fine < 0.06) t -= 0.09;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderSnow(ctx) {
  const n = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 21, 4);
  let t = 0.67 + (n - 0.5) * 0.2;
  const sparkle = hash2(ctx.x, ctx.y, ctx.seed + 5);
  if (sparkle > 0.94) t = 0.98;
  if (sparkle < 0.025) t -= 0.12;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderIce(ctx) {
  const w = worley(ctx.u, ctx.v, 2, ctx.seed + 51);
  const n = fbm(ctx.u, ctx.v, 3, 4, ctx.seed + 14, 4);
  let t = 0.5 + (n - 0.5) * 0.42;
  if (w.edge < 0.035) t -= 0.22;
  if (hash2(ctx.x, ctx.y, ctx.seed + 81) > 0.965) t += 0.2;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderMoss(ctx) {
  const n = fbm(ctx.u, ctx.v, 5, 5, ctx.seed + 12, 4, 0.58);
  let t = 0.47 + (n - 0.5) * 0.6;
  const clump = hash2(ctx.x, ctx.y, ctx.seed + 32);
  if (clump > 0.9) t += 0.1;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

/* Wood-family renderers */
function renderPlanks(ctx) {
  const size = ctx.size;
  const boardH = Math.max(3, Math.round(size / 4));
  const row = Math.floor(ctx.y / boardH);
  const ly = ctx.y % boardH;
  const boardTone = hash2(row, 3, ctx.seed + 18) - 0.5;
  const grain = fbm(ctx.u, ctx.v, 1, 9, ctx.seed + 8, 4, 0.6);
  const knot = hash2(Math.floor(ctx.x / Math.max(2, size / 8)), row, ctx.seed + 71);
  const joint = Math.floor(hash2(row, 11, ctx.seed + 33) * size);
  let t = 0.5 + boardTone * 0.24 + (grain - 0.5) * 0.62;
  t += (hash2(ctx.x, ctx.y, ctx.seed + 4) - 0.5) * 0.08 * ctx.grain;
  if (ly === 0) {
    const seam = ctx.palette[0];
    return shiftRgb(seam, -10);
  }
  if (ctx.x === joint && ly > 0) {
    const seam = ctx.palette[0];
    return shiftRgb(seam, -7);
  }
  if (ly === 1) t += 0.075;
  if (ly === boardH - 1) t -= 0.08;
  if (knot > 0.94 && ly > 0 && ly < boardH - 1) t -= 0.2;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderLogSide(ctx) {
  const grooves = 1 - Math.abs(fbm(ctx.u, ctx.v, 7, 2, ctx.seed + 2, 4, 0.58) * 2 - 1);
  const fine = fbm(ctx.u, ctx.v, 4, 8, ctx.seed + 44, 3);
  let t = 0.5 - grooves * 0.35 + (fine - 0.5) * 0.3;
  t += (hash2(ctx.x, ctx.y, ctx.seed + 3) - 0.5) * 0.1 * ctx.grain;
  if (hash2(ctx.x, 0, ctx.seed + 12) > 0.84) t -= 0.16;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderLogTop(ctx) {
  const size = ctx.size;
  const dx = (ctx.x + 0.5) / size - 0.5;
  const dy = (ctx.y + 0.5) / size - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy) * 2;
  const angle = Math.atan2(dy, dx) / TAU + 0.5;
  const wobble = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 5, 2) * 0.14;
  const rings = Math.sin((dist * 4.4 + wobble) * TAU) * 0.5 + 0.5;
  let t = 0.46 + rings * 0.23 - dist * 0.25;
  const border = Math.max(Math.abs(dx), Math.abs(dy));
  if (border > 0.39) t = 0.25 + rings * 0.06;
  if (dist < 0.08) t = 0.3;
  const crack = hash2(Math.floor(angle * 12), Math.floor(dist * 8), ctx.seed + 90) > 0.93 && dist > 0.12 && dist < 0.38;
  if (crack) t -= 0.19;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderLeaves(ctx) {
  const clump = fbm(ctx.u, ctx.v, 5, 5, ctx.seed + 9, 4, 0.55);
  const dark = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 51, 3);
  let t = 0.53 + (clump - 0.5) * 0.75 + (dark - 0.5) * 0.3;
  const cut = hash2(ctx.x, ctx.y, ctx.seed + 33);
  if (cut < 0.07 * ctx.clutter) t -= 0.3;
  if (cut > 0.95) t += 0.12;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

/* Other-family renderers */
function renderNetherrack(ctx) {
  const strands = fbm(ctx.u, ctx.v, 6, 3, ctx.seed + 4, 4, 0.6);
  const n = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 21, 3);
  let t = 0.42 + (n - 0.5) * 0.45 + (strands - 0.5) * 0.55;
  if (hash2(ctx.x, ctx.y, ctx.seed + 66) > 0.93) t += 0.2;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderEndStone(ctx) {
  const w = worley(ctx.u, ctx.v, 4, ctx.seed + 77);
  const n = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 8, 3);
  let t = 0.58 + (n - 0.5) * 0.3 - w.d1 * 0.12;
  if (w.edge < 0.045) t -= 0.13;
  if (hash2(ctx.x, ctx.y, ctx.seed + 20) < 0.035) t += 0.15;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderPrismarine(ctx) {
  const tile = 4;
  const gx = Math.floor(ctx.x / tile);
  const gy = Math.floor(ctx.y / tile);
  const lx = ctx.x % tile;
  const ly = ctx.y % tile;
  const tone = hash2(gx, gy, ctx.seed + 31) - 0.5;
  const n = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 9, 3);
  let t = 0.5 + tone * 0.18 + (n - 0.5) * 0.35;
  if (lx === 0 || ly === 0) t -= 0.15;
  if (ly === 1) t += 0.07;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderTerracotta(ctx) {
  const n = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 6, 4);
  const fine = fbm(ctx.u, ctx.v, 2, 9, ctx.seed + 19, 2);
  let t = 0.52 + (n - 0.5) * 0.34 + (fine - 0.5) * 0.12;
  if (hash2(ctx.x, ctx.y, ctx.seed + 5) < 0.04) t -= 0.1;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderWool(ctx) {
  const weaveX = (ctx.x + Math.floor(ctx.y / 2)) % 2 === 0 ? 0.035 : -0.035;
  const weaveY = (ctx.y + Math.floor(ctx.x / 2)) % 2 === 0 ? 0.025 : -0.025;
  const n = fbm(ctx.u, ctx.v, 3, 4, ctx.seed + 11, 4);
  let t = 0.58 + (n - 0.5) * 0.2 + weaveX + weaveY;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

/* Ore overlays */
const ORE_STYLE = {
  gold: { count: 4, radius: 0.108, shape: 'nugget', rim: true },
  diamond: { count: 4, radius: 0.105, shape: 'diamond', rim: true },
  redstone: { count: 7, radius: 0.058, shape: 'speck', rim: false },
  emerald: { count: 4, radius: 0.095, shape: 'shard', rim: true },
  copper: { count: 5, radius: 0.085, shape: 'nugget', rim: true },
  lapis: { count: 5, radius: 0.08, shape: 'cluster', rim: true },
};

function paintOre(buf, ctx, accent) {
  const size = ctx.size;
  const style = ORE_STYLE[ctx.material.ore] || ORE_STYLE.gold;
  const random = mulberry32(ctx.seed + 800);
  const blobs = [];
  for (let i = 0; i < style.count; i++) {
    const cx = Math.floor(random() * size);
    const cy = Math.floor(random() * size);
    const r = Math.max(1, Math.round(size * style.radius * (0.7 + random() * 0.6)));
    blobs.push({ cx, cy, r, seed: Math.floor(random() * 1e6) });
  }
  for (const blob of blobs) {
    const { cx, cy, r } = blob;
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const ax = Math.abs(ox);
        const ay = Math.abs(oy);
        let inside = false;
        if (style.shape === 'diamond') inside = ax + ay <= r + 0.4;
        else if (style.shape === 'shard') inside = ax + ay * 0.6 <= r + 0.6;
        else if (style.shape === 'speck') inside = ax <= 1 && ay <= 1 && ax + ay <= 1;
        else inside = ax * ax + ay * ay <= r * r + 0.4;
        if (!inside) continue;
        const x = mod(cx + ox, size);
        const y = mod(cy + oy, size);
        const edge = ax + ay >= r - 0.4 || Math.abs(ax - ay) >= r - 0.4;
        let color = edge ? accent[0] : accent[Math.min(accent.length - 1, 2 + ((ox + oy + 8) % 3))];
        if (ox <= -1 && oy <= -1) color = accent[accent.length - 1];
        put(buf, size, x, y, color);
      }
    }
    if (style.rim && r > 2) {
      const glintX = mod(cx - 1, size);
      const glintY = mod(cy - 1, size);
      put(buf, size, glintX, glintY, [255, 255, 244]);
    }
  }
}

/* Modifier overlays */
function drawCracks(buf, ctx, intensity = 1) {
  const size = ctx.size;
  const cells = size <= 16 ? 3 : 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const w = worley(u, v, cells, ctx.seed + 313);
      if (w.edge < 0.018 * intensity) {
        const p = getPx(buf, size, x, y);
        put(buf, size, x, y, shiftRgb(p, -46 * intensity));
      }
    }
  }
}

function mossOverlay(buf, ctx, intensity = 1, greenPalette, darkPalette) {
  const size = ctx.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const n = fbm(u, v, 4, 4, ctx.seed + 777, 4, 0.56);
      const sideBias = ctx.face === 'side' && y < size * 0.42 ? 0.06 : 0;
      if (n > 0.62 - intensity * 0.03 - sideBias) {
        const fine = hash2(x, y, ctx.seed + 41);
        const idx = clamp(Math.floor((n - 0.5) * 7 + fine * 0.8), 1, greenPalette.length - 1);
        const base = getPx(buf, size, x, y);
        const moss = greenPalette[idx];
        const alpha = 0.56 + fine * 0.34;
        put(buf, size, x, y, mixRgb(base, moss, alpha));
        if (fine < 0.13) {
          const yy = mod(y + 1, size);
          put(buf, size, x, yy, mixRgb(getPx(buf, size, x, yy), darkPalette[1], 0.35));
        }
      }
    }
  }
}

function fleckOverlay(buf, ctx, accent) {
  const size = ctx.size;
  const random = mulberry32(ctx.seed + 909);
  const count = Math.max(5, Math.round(size * 0.68));
  for (let i = 0; i < count; i++) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const color = accent[3 + Math.floor(random() * 3)];
    const base = getPx(buf, size, x, y);
    put(buf, size, x, y, mixRgb(base, color, 0.72));
    if (random() > 0.58) {
      const x2 = mod(x + (random() > 0.5 ? 1 : -1), size);
      const base2 = getPx(buf, size, x2, y);
      put(buf, size, x2, y, mixRgb(base2, color, 0.56));
    }
    if (random() > 0.8) {
      const y2 = mod(y + 1, size);
      const base3 = getPx(buf, size, x, y2);
      put(buf, size, x, y2, mixRgb(base3, accent[2], 0.4));
    }
  }
}

function glowOverlay(buf, ctx, accent) {
  const size = ctx.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = hash2(x, y, ctx.seed + 515);
      if (h > 0.965) {
        const base = getPx(buf, size, x, y);
        put(buf, size, x, y, mixRgb(base, accent[accent.length - 1], 0.82));
        if (h > 0.988) {
          put(buf, size, x, mod(y + 1, size), mixRgb(getPx(buf, size, x, mod(y + 1, size)), accent[2], 0.28));
        }
      }
    }
  }
}

function frostOverlay(buf, ctx) {
  const size = ctx.size;
  const frost = [208, 236, 242];
  const bright = [245, 253, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x + 0.5) / size, (y + 0.5) / size, 3, 4, ctx.seed + 606, 3);
      const h = hash2(x, y, ctx.seed + 87);
      if (n > 0.57) {
        const base = getPx(buf, size, x, y);
        put(buf, size, x, y, mixRgb(base, frost, 0.22 + (n - 0.57) * 0.9));
      }
      if (h > 0.976) put(buf, size, x, y, bright);
    }
  }
}

function ancientOverlay(buf, ctx) {
  const size = ctx.size;
  const patina = [95, 116, 83];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = getPx(buf, size, x, y);
      const l = (base[0] + base[1] + base[2]) / 3;
      const n = fbm((x + 0.5) / size, (y + 0.5) / size, 3, 3, ctx.seed + 404, 3);
      let next = mixRgb(base, [l, l, l], 0.2);
      if (n > 0.6) next = mixRgb(next, patina, 0.14);
      if (hash2(x, y, ctx.seed + 44) < 0.03) next = shiftRgb(next, -35);
      put(buf, size, x, y, next);
    }
  }
}

function burnedOverlay(buf, ctx) {
  const size = ctx.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x + 0.5) / size, (y + 0.5) / size, 3, 4, ctx.seed + 121, 4);
      if (n > 0.53) {
        const base = getPx(buf, size, x, y);
        const amount = 0.2 + (n - 0.53) * 0.9;
        put(buf, size, x, y, mixRgb(base, [31, 27, 24], amount));
      }
      if (hash2(x, y, ctx.seed + 9) > 0.982) {
        put(buf, size, x, y, [223, 113, 50]);
      }
    }
  }
}

function gildedOverlay(buf, ctx, gold) {
  const size = ctx.size;
  const random = mulberry32(ctx.seed + 2024);
  const flecks = Math.max(4, Math.round(size * 0.45));
  for (let i = 0; i < flecks; i++) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const color = gold[Math.floor(random() * (gold.length - 2)) + 2];
    put(buf, size, x, y, color);
    if (random() > 0.5) put(buf, size, mod(x + 1, size), y, gold[gold.length - 1]);
    if (random() > 0.6) put(buf, size, x, mod(y + 1, size), gold[2]);
  }
}

function crystalOverlay(buf, ctx, accent) {
  const size = ctx.size;
  const random = mulberry32(ctx.seed + 6060);
  const count = Math.max(3, Math.round(size * 0.18));
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(random() * size);
    const cy = Math.floor(random() * size);
    const r = ctx.size <= 16 ? 1 : 2;
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (Math.abs(ox) + Math.abs(oy) > r + 0.5) continue;
        const x = mod(cx + ox, size);
        const y = mod(cy + oy, size);
        const isCore = ox === 0 && oy === 0;
        const color = isCore ? [240, 255, 251] : ox + oy < 0 ? accent[accent.length - 1] : accent[Math.max(1, accent.length - 3)];
        const base = getPx(buf, size, x, y);
        put(buf, size, x, y, mixRgb(base, color, isCore ? 0.9 : 0.76));
      }
    }
  }
}

function wetOverlay(buf, ctx) {
  const size = ctx.size;
  for (let y = 0; y < size; y++) {
    const depth = y / Math.max(1, size - 1);
    for (let x = 0; x < size; x++) {
      let base = getPx(buf, size, x, y);
      if (depth > 0.55 && hash2(x, y, ctx.seed + 70) > 0.5) {
        base = shiftRgb(base, -8 - depth * 12);
      }
      if (hash2(x, y, ctx.seed + 81) > 0.986) base = mixRgb(base, [220, 245, 239], 0.4);
      put(buf, size, x, y, base);
    }
  }
}

function flowerOverlay(buf, ctx) {
  const size = ctx.size;
  if (ctx.face === 'bottom') return;
  const random = mulberry32(ctx.seed + 505);
  const count = Math.max(2, Math.round(size / 8));
  const petals = [[242, 241, 218], [238, 213, 91], [220, 105, 128], [157, 194, 233]];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * (size * 0.55));
    const color = petals[Math.floor(random() * petals.length)];
    put(buf, size, x, y, color);
    if (random() > 0.45) put(buf, size, mod(x + 1, size), y, shiftRgb(color, -22));
    put(buf, size, x, mod(y + 1, size), [78, 127, 54]);
  }
}

/* Family renderers */
function renderGlass(ctx) {
  const size = ctx.size;
  const edge = Math.min(ctx.x, ctx.y, size - 1 - ctx.x, size - 1 - ctx.y);
  const edgeBand = Math.max(1, Math.round(size * 0.08));
  if (edge < edgeBand) {
    ctx.alpha = edge === 0 ? 235 : 190;
    const shine = hash2(ctx.x, ctx.y, ctx.seed + 13) > 0.6 ? 1 : 0;
    return pick(ctx, ctx.palette, 0.74 + shine * 0.08);
  }
  ctx.alpha = 0;
  return [220, 240, 240];
}

function renderStainedGlass(ctx) {
  const size = ctx.size;
  const edge = Math.min(ctx.x, ctx.y, size - 1 - ctx.x, size - 1 - ctx.y);
  const edgeBand = Math.max(1, Math.round(size * 0.09));
  const n = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 71, 3);
  if (edge < edgeBand) {
    ctx.alpha = edge === 0 ? 235 : 180;
    return pick(ctx, ctx.palette, 0.72 + (n - 0.5) * 0.18);
  }
  ctx.alpha = 118 + Math.round(n * 34);
  if (hash2(ctx.x, ctx.y, ctx.seed + 5) > 0.972) ctx.alpha = 210;
  return pick(ctx, ctx.palette, 0.58 + (n - 0.5) * 0.22);
}

function renderConcrete(ctx) {
  const n = fbm(ctx.u, ctx.v, 3, 3, ctx.seed + 17, 4);
  const fine = fbm(ctx.u, ctx.v, 8, 8, ctx.seed + 31, 2);
  const t = 0.56 + (n - 0.5) * 0.12 + (fine - 0.5) * 0.05;
  return pick(ctx, ctx.palette, tune(ctx, t));
}

function renderMetal(ctx) {
  const size = ctx.size;
  const panel = Math.max(4, Math.round(size / 4));
  const x = ctx.x;
  const y = ctx.y;
  const border = x % panel === 0 || y % panel === 0 || x === size - 1 || y === size - 1;
  const highlight = x % panel === 1 || y % panel === 1;
  const n = fbm(ctx.u, ctx.v, 5, 5, ctx.seed + 33, 4);
  let t = 0.58 + (n - 0.5) * 0.16;
  if (border) t = 0.31;
  else if (highlight) t = 0.78;
  if (hash2(x, y, ctx.seed + 9) > 0.982) t = 0.9;
  const rgb = pick(ctx, ctx.palette, tune(ctx, t));
  if (border) return shiftRgb(rgb, -18);
  return rgb;
}

function renderCopper(ctx) {
  const stage = Number(ctx.material.stage) || 0;
  const n = fbm(ctx.u, ctx.v, 4, 4, ctx.seed + 41, 4);
  const patina = fbm(ctx.u, ctx.v, 2, 2, ctx.seed + 77, 3);
  let t = 0.54 + (n - 0.5) * 0.2;
  let rgb = pick(ctx, ctx.palette, tune(ctx, t));
  const green = [66, 145, 116];
  const strength = stage * 0.2 + Math.max(0, patina - 0.48) * 0.7;
  if (strength > 0) rgb = mixRgb(rgb, green, Math.min(0.72, strength));
  if (hash2(ctx.x, ctx.y, ctx.seed + 15) > 0.985) rgb = mixRgb(rgb, ctx.accent[3] || green, 0.4);
  return rgb;
}

function renderLeavesCutout(ctx) {
  const rgb = renderLeaves(ctx);
  const thickness = vnoise(ctx.u, ctx.v, 4, 4, ctx.seed + 121);
  ctx.alpha = thickness < 0.34 ? 0 : 255;
  return rgb;
}

/* Main generator */
export function renderTextureBuffer(params = {}) {
  const material = getMaterial(params.materialId);
  const size = params.size || 16;
  const seed = Number(params.seed) || 1;
  const finish = FINISH_CONFIG[params.finish] || FINISH_CONFIG.balanced;
  const face = params.face || 'side';
  const mods = new Set(params.modifiers || []);
  const promptColor = params.promptColor || null;
  const accentHex = params.accent || material.accent || '#b8e264';

  const hueTarget = promptColor ? promptColor.hue : null;
  const satTarget = promptColor ? Math.max(promptColor.sat, 0.24) : null;
  const lightShift = promptColor ? promptColor.light : 0;

  const palette = buildPalette(material.base, {
    hue: params.hue || 0,
    hueTarget,
    satTarget,
    light: lightShift,
    count: size <= 16 ? 8 : size <= 32 ? 10 : 12,
    spread: 0.4,
  });

  const accent = buildPalette(accentHex, {
    hue: params.accentHue || 0,
    count: 6,
    spread: 0.46,
    satBoost: 0.06,
  });

  const overlayBase = params.overlayAccent || (mods.has('gilded')
    ? '#e9c253'
    : mods.has('crystal')
      ? '#5ee8df'
      : mods.has('glowing')
        ? '#b9ee6a'
        : mods.has('flecked')
          ? '#e5bf58'
          : material.accent || '#b8e264');
  const overlayAccent = buildPalette(overlayBase, {
    hue: params.overlayAccentHue || params.accentHue || 0,
    count: 6,
    spread: 0.48,
    satBoost: 0.07,
  });

  const greenPalette = buildPalette(face === 'top' && material.type === 'grass' ? material.base : NATURAL_GREEN, {
    hue: params.hue || 0,
    count: 8,
    spread: 0.43,
    satBoost: 0.08,
  });
  const darkPalette = buildPalette(NATURAL_DARK, { hue: params.hue || 0, count: 5, spread: 0.34 });
  const dirtBase = material.dirt || '#79573d';
  const dirtPalette = buildPalette(dirtBase, {
    hue: params.hue || 0,
    hueTarget: promptColor ? promptColor.hue : null,
    satTarget: promptColor ? Math.max(promptColor.sat, 0.2) : null,
    count: 8,
    spread: 0.38,
  });

  const ctx = {
    size,
    seed,
    face,
    material,
    palette,
    accent,
    greenPalette,
    dirtPalette,
    depth: (0.55 + (params.contrast ?? 55) / 100 * 1.05) * finish.depth,
    grain: ((params.grain ?? 55) / 100) * finish.grain,
    dither: finish.dither,
    clutter: finish.clutter,
    x: 0,
    y: 0,
    u: 0,
    v: 0,
  };

  const buf = new Uint8ClampedArray(size * size * 4);
  let mode = material.type;
  if (material.type === 'grass') mode = face === 'top' ? 'grassTop' : face === 'bottom' ? 'dirt' : 'grassSide';
  if (material.type === 'log') mode = face === 'side' ? 'logSide' : 'logTop';

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.x = x;
      ctx.y = y;
      ctx.u = (x + 0.5) / size;
      ctx.v = (y + 0.5) / size;
      ctx.alpha = 255;
      let rgb;
      switch (mode) {
        case 'stone': rgb = renderStone(ctx); break;
        case 'cobble': rgb = renderCobble(ctx); break;
        case 'bricks': rgb = renderBricks(ctx); break;
        case 'deepslate': rgb = renderDeepslate(ctx); break;
        case 'gravel': rgb = renderGravel(ctx); break;
        case 'obsidian': rgb = renderObsidian(ctx); break;
        case 'dirt': rgb = renderDirt(ctx); break;
        case 'grassTop': rgb = grassTop(ctx); break;
        case 'grassSide': rgb = renderGrassSide(ctx); break;
        case 'sand': rgb = renderSand(ctx); break;
        case 'snow': rgb = renderSnow(ctx); break;
        case 'ice': rgb = renderIce(ctx); break;
        case 'moss': rgb = renderMoss(ctx); break;
        case 'planks': rgb = renderPlanks(ctx); break;
        case 'logSide': rgb = renderLogSide(ctx); break;
        case 'logTop': rgb = renderLogTop(ctx); break;
        case 'leaves': rgb = renderLeaves(ctx); break;
        case 'netherrack': rgb = renderNetherrack(ctx); break;
        case 'endstone': rgb = renderEndStone(ctx); break;
        case 'prismarine': rgb = renderPrismarine(ctx); break;
        case 'terracotta': rgb = renderTerracotta(ctx); break;
        case 'wool': rgb = renderWool(ctx); break;
        case 'glass': rgb = renderGlass(ctx); break;
        case 'stained_glass': rgb = renderStainedGlass(ctx); break;
        case 'concrete': rgb = renderConcrete(ctx); break;
        case 'metal': rgb = renderMetal(ctx); break;
        case 'copper': rgb = renderCopper(ctx); break;
        case 'leaves_cutout': rgb = renderLeavesCutout(ctx); break;
        case 'ore': {
          rgb = renderStone(ctx);
          break;
        }
        default: rgb = renderStone(ctx);
      }
      put(buf, size, x, y, rgb, ctx.alpha);
    }
  }

  if (mode === 'ore') paintOre(buf, ctx, accent);

  if (mods.has('mossy')) mossOverlay(buf, ctx, 1, greenPalette, darkPalette);
  if (mods.has('cracked')) drawCracks(buf, ctx, 1);
  if (mods.has('glowing')) glowOverlay(buf, ctx, overlayAccent);
  if (mods.has('frosted')) frostOverlay(buf, ctx);
  if (mods.has('ancient')) ancientOverlay(buf, ctx);
  if (mods.has('burned')) burnedOverlay(buf, ctx);
  if (mods.has('gilded')) gildedOverlay(buf, ctx, overlayAccent);
  if (mods.has('flecked')) fleckOverlay(buf, ctx, overlayAccent);
  if (mods.has('crystal')) crystalOverlay(buf, ctx, overlayAccent);
  if (mods.has('wet')) wetOverlay(buf, ctx);
  if (mods.has('flowery')) flowerOverlay(buf, ctx);

  const colorSet = [...new Set(palette.slice(1, 7).map((rgb) => rgb.join(',')))]
    .map((s) => s.split(',').map(Number));

  return {
    buffer: buf,
    size,
    face,
    material,
    palette,
    swatches: colorSet.map((rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
    accentSwatches: accent.slice(2, 5).map((rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
    overlayAccentSwatches: overlayAccent.slice(2, 5).map((rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
    modifiers: [...mods],
  };
}


/* Title helpers */
const MODIFIER_LABELS = Object.fromEntries(MODIFIER_WORDS.map((modifier) => [modifier.id, modifier.label]));
const NAME_ORDER = ['ancient', 'burned', 'cracked', 'frosted', 'gilded', 'mossy', 'glowing', 'flecked', 'wet', 'flowery'];

export function textureTitle(materialId, modifiers = []) {
  const material = getMaterial(materialId);
  const pre = NAME_ORDER.filter((modifier) => modifiers.includes(modifier))
    .slice(0, 2)
    .map((modifier) => MODIFIER_LABELS[modifier]);
  return [...pre, material.name].join(' ');
}

export function modifierLabel(id) {
  return MODIFIER_LABELS[id] || id;
}

function normalizeHex(value) {
  if (!value) return null;
  const hex = String(value).trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
}

function cleanPrompt(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeModifiers(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  return [...new Set(list.filter((item) => MODIFIER_LABELS[item]))];
}

function resolveRecipe(options = {}) {
  const prompt = cleanPrompt(options.prompt);
  const parsed = parsePrompt(prompt);
  const supplied = options.recipe && typeof options.recipe === 'object' ? options.recipe : {};
  const rawMaterial = supplied.materialId || supplied.id || options.materialId || options.material
    || (typeof options.recipe === 'string' ? options.recipe : '') || parsed.materialId || 'stone';
  const materialId = getMaterial(rawMaterial).id;
  const material = getMaterial(materialId);
  const explicitModifiers = supplied.modifiers ?? options.modifiers;
  const modifiers = explicitModifiers === undefined || explicitModifiers === null
    ? parsed.modifiers
    : normalizeModifiers(explicitModifiers);
  const size = clampInt(supplied.size ?? options.size, 1, 512, 16);
  const seed = clampInt(supplied.seed ?? options.seed, 1, 999999999, 1);
  const face = ['side', 'top', 'bottom'].includes(supplied.face ?? options.face)
    ? supplied.face ?? options.face
    : 'side';
  const finish = FINISHES.some((item) => item.id === (supplied.finish ?? options.finish))
    ? supplied.finish ?? options.finish
    : 'balanced';
  const grain = clampInt(supplied.grain ?? options.grain, 0, 100, 58);
  const contrast = clampInt(supplied.contrast ?? options.contrast, 0, 100, 55);
  const hue = clampInt(supplied.hue ?? options.hue, -180, 180, 0);

  const tint = normalizeHex(supplied.tint ?? options.tint);
  let promptColor = supplied.promptColor && typeof supplied.promptColor === 'object'
    ? { ...supplied.promptColor }
    : tint ? hexToHsl(tint) : null;
  let accent = normalizeHex(supplied.accent ?? options.accent);
  if (parsed.color) {
    if (parsed.colorAsAccent) accent ||= parsed.color.hex;
    else if (!promptColor) {
      promptColor = {
        name: parsed.color.name,
        hue: parsed.color.hue,
        sat: parsed.color.sat,
        light: parsed.color.light || 0,
      };
    }
  }
  if (!accent) {
    if (modifiers.includes('gilded')) accent = '#e9c253';
    else if (modifiers.includes('crystal')) accent = '#5ee8df';
    else if (modifiers.includes('glowing')) accent = '#b9ee6a';
    else if (modifiers.includes('flecked')) accent = '#e5bf58';
    else if (material.accent) accent = material.accent;
  }

  return {
    prompt,
    materialId,
    materialName: material.name,
    modifiers,
    accent,
    promptColor,
    seed,
    size,
    face,
    finish,
    grain,
    contrast,
    hue,
  };
}

/**
 * Generate one deterministic texture face.
 * @param {object} [options]
 * @param {string} [options.prompt]
 * @param {object|string} [options.recipe] Material recipe object or material id.
 * @param {number} [options.seed=1]
 * @param {number} [options.size=16]
 * @param {'side'|'top'|'bottom'} [options.face='side']
 * @param {'rugged'|'balanced'|'smooth'} [options.finish='balanced']
 * @param {number} [options.grain=58]
 * @param {number} [options.contrast=55]
 * @param {number} [options.hue=0]
 * @returns {{width:number,height:number,rgba:Uint8ClampedArray,recipe:object,version:string}}
 */
export function generate(options = {}) {
  const recipe = resolveRecipe(options);
  const texture = renderTextureBuffer({
    materialId: recipe.materialId,
    seed: recipe.seed,
    size: recipe.size,
    face: recipe.face,
    finish: recipe.finish,
    grain: recipe.grain,
    contrast: recipe.contrast,
    hue: recipe.hue,
    modifiers: recipe.modifiers,
    promptColor: recipe.promptColor,
    overlayAccent: recipe.accent,
  });
  return {
    width: texture.size,
    height: texture.size,
    rgba: texture.buffer,
    recipe: { ...recipe, engineVersion: ENGINE_VERSION },
    version: ENGINE_VERSION,
  };
}

export function generateSet(options = {}) {
  const recipe = resolveRecipe({ ...options, face: 'side' });
  const faces = {};
  for (const face of ['side', 'top', 'bottom']) {
    const texture = renderTextureBuffer({
      materialId: recipe.materialId,
      seed: recipe.seed,
      size: recipe.size,
      face,
      finish: recipe.finish,
      grain: recipe.grain,
      contrast: recipe.contrast,
      hue: recipe.hue,
      modifiers: recipe.modifiers,
      promptColor: recipe.promptColor,
      overlayAccent: recipe.accent,
    });
    faces[face] = {
      width: texture.size,
      height: texture.size,
      rgba: texture.buffer,
    };
  }
  return {
    width: recipe.size,
    height: recipe.size,
    version: ENGINE_VERSION,
    recipe: { ...recipe, engineVersion: ENGINE_VERSION },
    faces,
  };
}

export function listMaterials() {
  return MATERIALS.map((material) => ({ ...material, keywords: [...material.keywords] }));
}

export function listModifiers() {
  return MODIFIER_WORDS.map(({ id, label, words }) => ({ id, label, words: [...words] }));
}

export { ENGINE_VERSION as version };
