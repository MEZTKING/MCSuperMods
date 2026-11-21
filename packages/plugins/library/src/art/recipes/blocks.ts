/**
 * Block recipes of the vanilla-style generator (ADR 0092 D7, D8): 16 by 16 faces with no
 * outline, five or six shades per material, light from the top left and clustered noise that
 * wraps where the face tiles. The rows without a drawing are stubs that still draw their
 * placeholder pattern; B492 draws them.
 *
 * @packageDocumentation
 */

import { pick, setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import { barkRamp, materialRamp, type Ramp, spreadShades, stoneRamp, woodRamp } from '../materials';
import { clusteredField, hashSeed, quantise, rng } from '../noise';
import { generateRamp } from '../ramp';

/** Grey stone in clustered blobs (a wrapping field, so the face tiles). */
function stoneBase(image: ArtImage, context: DrawContext, deepslate: boolean): Ramp {
  const ramp = stoneRamp(deepslate, context.hueShift);
  const seed = hashSeed('stone', context.seed, deepslate ? 1 : 0);
  const field = deepslate
    ? clusteredField(16, 16, seed, { blurX: 2, blurY: 0 })
    : clusteredField(16, 16, seed, { blurX: 1 });
  const shades = quantise(field, spreadShades([0.08, 0.22, 0.38, 0.22, 0.1], 2, context.noise));
  for (let i = 0; i < 256; i += 1) setPixel(image, i % 16, i >> 4, pick(ramp, shades[i] ?? 2));
  return ramp;
}

/** Small original vein shapes for ores, as offsets. */
const VEINS: readonly (readonly [number, number])[][] = [
  'XX.|XXX|.X.',
  '.XX|XXX|XX.',
  'XX..|XXX.|.XXX',
  '.X.|XXX|.XX',
  'XXX|.XX|..X',
  'X..|XXX|.XX',
].map((shape) =>
  shape
    .split('|')
    .flatMap((row, y) =>
      [...row].flatMap((ch, x): [number, number][] => (ch === 'X' ? [[x, y]] : [])),
    ),
);

/**
 * An ore: three or four veins of the colour in stone (or deepslate), each lit at its top-left
 * pixels with the odd shine, a dark rim of the material below and right of it, and the stone's
 * own dark shade above and left; everything wraps so the face tiles.
 */
function ore(context: DrawContext, deepslate: boolean): ArtImage {
  const image = blankImage(16, 16);
  const stone = stoneBase(image, context, deepslate);
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  const random = rng(hashSeed('ore', context.seed));
  const gem = new Set<number>();
  const centres: [number, number][] = [];
  const wrap = (v: number): number => (v + 16) % 16;
  const count = 3 + Math.floor(random() * 2);
  for (let attempt = 0; attempt < 400 && centres.length < count; attempt += 1) {
    const cx = Math.floor(random() * 16);
    const cy = Math.floor(random() * 16);
    const far = centres.every(([x, y]) => {
      const dx = Math.min(Math.abs(x - cx), 16 - Math.abs(x - cx));
      const dy = Math.min(Math.abs(y - cy), 16 - Math.abs(y - cy));
      return dx * dx + dy * dy >= 30;
    });
    if (!far) continue;
    centres.push([cx, cy]);
    const vein = VEINS[Math.floor(random() * VEINS.length)] ?? [];
    for (const [dx, dy] of vein) gem.add(wrap(cy + dy) * 16 + wrap(cx + dx));
    // A stray pixel or two beside the vein, so the clusters are not stamped shapes.
    for (let k = 0; k < 2; k += 1) {
      const [dx, dy] = vein[Math.floor(random() * vein.length)] ?? [0, 0];
      const side = Math.floor(random() * 4);
      const ox = side === 0 ? -1 : side === 1 ? 1 : 0;
      const oy = side === 2 ? -1 : side === 3 ? 1 : 0;
      if (random() < 0.6 * Math.min(1.5, context.noise)) {
        gem.add(wrap(cy + dy + oy) * 16 + wrap(cx + dx + ox));
      }
    }
  }
  const has = (x: number, y: number): boolean => gem.has(wrap(y) * 16 + wrap(x));
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (has(x, y)) continue;
      if (has(x - 1, y) || has(x, y - 1)) setPixel(image, x, y, pick(material, 1));
      else if (has(x + 1, y) || has(x, y + 1)) setPixel(image, x, y, pick(stone, 1));
    }
  }
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (!has(x, y)) continue;
      const lit = !has(x - 1, y) && !has(x, y - 1);
      const shadow = !has(x + 1, y) && !has(x, y + 1);
      let shade = shadow ? 2 : lit ? 4 : 3;
      if (lit && !shadow && random() < 0.4) {
        setPixel(image, x, y, shine);
        continue;
      }
      if (!lit && !shadow && has(x - 1, y) && has(x, y - 1)) shade = 4;
      setPixel(image, x, y, pick(material, shade));
    }
  }
  return image;
}

/**
 * A storage block: a two-ring bevel (light top and left, dark bottom and right) round a
 * clustered centre; `gem` adds two or three glints running up to the right, `metal` two
 * plate seams with their lit edges.
 */
function storageBlock(context: DrawContext): ArtImage {
  const image = blankImage(16, 16);
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  const metal = context.finish === 'metal';
  const seed = hashSeed('block', context.seed);
  const field = metal
    ? clusteredField(16, 16, seed, { blurX: 3, blurY: 0 })
    : clusteredField(16, 16, seed, { blurX: 1 });
  const shades = metal
    ? quantise(field, spreadShades([0.2, 0.55, 0.25], 1, context.noise))
    : quantise(field, spreadShades([0.1, 0.8, 0.1], 1, context.noise));
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      let shade: number;
      if (ring === 0) {
        if (x === 0 || y === 0) shade = x === 15 || y === 15 ? 3 : 5;
        else shade = 1;
      } else if (ring === 1) {
        if (x === 1 || y === 1) shade = x === 14 || y === 14 ? 3 : 4;
        else shade = 2;
      } else {
        shade = 2 + (shades[y * 16 + x] ?? 1);
        if (metal && (y === 5 || y === 10)) shade = 2;
        if (metal && (y === 6 || y === 11)) shade = 4;
      }
      setPixel(image, x, y, pick(material, shade));
    }
  }
  if (!metal) {
    const random = rng(hashSeed('glint', context.seed));
    const glints = 2 + Math.floor(random() * 2);
    for (let g = 0; g < glints; g += 1) {
      const length = 3 + Math.floor(random() * 3);
      const x0 = 3 + Math.floor(random() * 7);
      const y0 = 5 + Math.floor(random() * 8);
      for (let k = 0; k < length; k += 1) {
        const x = x0 + k;
        const y = y0 - k;
        if (x < 2 || y < 2 || x > 13 || y > 13) continue;
        setPixel(image, x, y, k === 1 ? shine : pick(material, 5));
        if (x + 1 <= 13) setPixel(image, x + 1, y, pick(material, 4));
      }
    }
  }
  return image;
}

/**
 * Planks: four boards four pixels high, grain running along them, each board's top row lit and
 * its bottom row a dark gap, one staggered joint per board with a lit edge after it.
 */
function planks(context: DrawContext): ArtImage {
  const ramp = woodRamp(context.colour, context.hueShift);
  const image = blankImage(16, 16);
  const grain = quantise(
    clusteredField(16, 16, hashSeed('grain', context.seed), { blurX: 3, blurY: 0 }),
    spreadShades([0.22, 0.5, 0.28], 1, context.noise),
  );
  const random = rng(hashSeed('planks', context.seed));
  const joints = [0, 1, 2, 3].map((board) => (board * 7 + 3 + Math.floor(random() * 4)) % 16);
  for (let y = 0; y < 16; y += 1) {
    const board = y >> 2;
    const row = y & 3;
    for (let x = 0; x < 16; x += 1) {
      let shade = 1 + (grain[y * 16 + x] ?? 1);
      if (row === 0) shade = Math.min(4, shade + 1);
      if (row === 3) shade = Math.min(shade, 1) - (grain[y * 16 + x] === 0 ? 1 : 0);
      const joint = joints[board] ?? 0;
      if (row !== 3 && x === joint) shade = 0;
      if (row !== 3 && x === (joint + 1) % 16) shade = Math.max(shade, 2);
      setPixel(image, x, y, pick(ramp, shade));
    }
  }
  return image;
}

/** Bark: vertical streaks of clustered shades with a few dark cracks, each lit on its right. */
function bark(context: DrawContext): ArtImage {
  const ramp = barkRamp(context.colour, context.hueShift);
  const image = blankImage(16, 16);
  const field = clusteredField(16, 16, hashSeed('bark', context.seed), { blurX: 0, blurY: 3 });
  const shades = quantise(field, spreadShades([0.12, 0.24, 0.32, 0.22, 0.1], 2, context.noise));
  for (let i = 0; i < 256; i += 1) setPixel(image, i % 16, i >> 4, pick(ramp, shades[i] ?? 2));
  const random = rng(hashSeed('cracks', context.seed));
  const cracks = Math.max(2, Math.round(4 * context.noise));
  for (let c = 0; c < cracks; c += 1) {
    const x = Math.floor(random() * 16);
    const y0 = Math.floor(random() * 16);
    const length = 3 + Math.floor(random() * 5);
    for (let k = 0; k < length; k += 1) {
      setPixel(image, x, (y0 + k) % 16, pick(ramp, 0));
      setPixel(image, (x + 1) % 16, (y0 + k) % 16, pick(ramp, 3));
    }
  }
  return image;
}

/**
 * The cut end of a log: a ring of bark (lighter on its top and left sides), a dark ring inside
 * it that is lit on the top and left, then rings of growth alternating light and dark, rounded
 * at the corners, with a few clustered flecks.
 */
function logTop(context: DrawContext): ArtImage {
  const wood = woodRamp(context.colour, context.hueShift);
  const barkShades = barkRamp(context.colour, context.hueShift);
  const image = blankImage(16, 16);
  const field = clusteredField(16, 16, hashSeed('end', context.seed), { blurX: 1 });
  const dark = 0.08 * context.noise;
  const light = 1 - 0.06 * context.noise;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      const rank = field[y * 16 + x] ?? 0.5;
      const litSide = (x === ring || y === ring) && x !== 15 - ring && y !== 15 - ring;
      if (ring === 0) {
        const base = rank < 0.3 ? 0 : rank < 0.75 ? 1 : 2;
        setPixel(image, x, y, pick(barkShades, base + (litSide ? 1 : 0)));
        continue;
      }
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const d = Math.max(dx, dy) * 0.75 + Math.hypot(dx, dy) * 0.25;
      const band = Math.floor(d) % 2;
      let shade = band === 0 ? 3 : 2;
      if (ring === 1) shade = litSide ? 2 : 1;
      if (d < 1.2) shade = 2;
      if (rank < dark) shade -= 1;
      if (rank > light) shade += 1;
      setPixel(image, x, y, pick(wood, shade));
    }
  }
  return image;
}

/**
 * Leaves: clustered foliage in five shades of the colour with see-through gaps (about a tenth of
 * the face) in the darkest blobs; the field wraps so the face tiles.
 */
function leaves(context: DrawContext): ArtImage {
  const ramp = generateRamp(context.colour, { count: 5, anchor: 2, hueShift: context.hueShift });
  const image = blankImage(16, 16);
  const field = clusteredField(16, 16, hashSeed('leaves', context.seed), { blurX: 1 });
  const visible = spreadShades([0.14, 0.26, 0.3, 0.14, 0.06], 2, context.noise);
  const shades = quantise(field, [0.1, ...visible.map((share) => share * 0.9)]);
  for (let i = 0; i < 256; i += 1) {
    const s = shades[i] ?? 3;
    if (s === 0) continue;
    setPixel(image, i % 16, i >> 4, pick(ramp, s - 1));
  }
  return image;
}

/** The block recipes, in table order. */
export const BLOCK_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry({ id: 'plain', label: 'Plain block', kind: 'block', fallback: 'plain', tiles: true }),
  recipeEntry({ id: 'stone', label: 'Stone', kind: 'block', fallback: 'stone', tiles: true }),
  recipeEntry({
    id: 'cobblestone',
    label: 'Cobblestone',
    kind: 'block',
    fallback: 'stone',
    tiles: true,
  }),
  recipeEntry({
    id: 'polished_stone',
    label: 'Polished stone',
    kind: 'block',
    fallback: 'polished_stone',
  }),
  recipeEntry({ id: 'bricks', label: 'Bricks', kind: 'block', fallback: 'bricks', tiles: true }),
  recipeEntry({
    id: 'pillar_side',
    label: 'Pillar side',
    kind: 'block',
    fallback: 'pillar_side',
    tiles: true,
  }),
  recipeEntry({ id: 'pillar_top', label: 'Pillar top', kind: 'block', fallback: 'pillar_top' }),
  recipeEntry({ id: 'ore', label: 'Ore', kind: 'block', fallback: 'ore', tiles: true }, (context) =>
    ore(context, false),
  ),
  recipeEntry(
    { id: 'deepslate_ore', label: 'Deepslate ore', kind: 'block', fallback: 'ore', tiles: true },
    (context) => ore(context, true),
  ),
  recipeEntry(
    {
      id: 'block',
      label: 'Storage block',
      kind: 'block',
      fallback: 'plain',
      finishes: ['gem', 'metal'],
    },
    storageBlock,
  ),
  recipeEntry({
    id: 'block_front',
    label: 'Furnace front',
    kind: 'block',
    fallback: 'block_front',
  }),
  recipeEntry({ id: 'bark', label: 'Bark', kind: 'block', fallback: 'bark', tiles: true }, bark),
  recipeEntry({ id: 'log_top', label: 'Log end', kind: 'block', fallback: 'log_top' }, logTop),
  recipeEntry({
    id: 'stripped_log',
    label: 'Stripped log',
    kind: 'block',
    fallback: 'stripped_log',
    tiles: true,
  }),
  recipeEntry({
    id: 'stripped_log_top',
    label: 'Stripped log end',
    kind: 'block',
    fallback: 'stripped_log_top',
  }),
  recipeEntry(
    { id: 'planks', label: 'Planks', kind: 'block', fallback: 'planks', tiles: true },
    planks,
  ),
  recipeEntry({ id: 'door_top', label: 'Door top', kind: 'block', fallback: 'door_top' }),
  recipeEntry({ id: 'door_bottom', label: 'Door bottom', kind: 'block', fallback: 'door_bottom' }),
  recipeEntry({ id: 'trapdoor', label: 'Trapdoor', kind: 'block', fallback: 'trapdoor' }),
  recipeEntry(
    { id: 'leaves', label: 'Leaves', kind: 'block', fallback: 'leaves', tiles: true },
    leaves,
  ),
  recipeEntry({ id: 'sapling', label: 'Sapling', kind: 'block', fallback: 'sapling' }),
  recipeEntry({
    id: 'crop_stage0',
    label: 'Crop, sprouts',
    kind: 'block',
    fallback: 'crop_stage0',
  }),
  recipeEntry({ id: 'crop_stage1', label: 'Crop, young', kind: 'block', fallback: 'crop_stage1' }),
  recipeEntry({
    id: 'crop_stage2',
    label: 'Crop, growing',
    kind: 'block',
    fallback: 'crop_stage2',
  }),
  recipeEntry({
    id: 'crop_stage3',
    label: 'Crop, ripe',
    kind: 'block',
    fallback: 'crop_stage3',
    colours: 2,
  }),
  recipeEntry({
    id: 'portal',
    label: 'Portal surface',
    kind: 'block',
    fallback: 'portal',
    tiles: true,
  }),
  recipeEntry({
    id: 'portal_frame',
    label: 'Portal frame',
    kind: 'block',
    fallback: 'portal_frame',
  }),
  recipeEntry({ id: 'dirt', label: 'Dirt', kind: 'block', fallback: 'plain', tiles: true }),
  recipeEntry({
    id: 'grass_top',
    label: 'Grass top',
    kind: 'block',
    fallback: 'plain',
    tiles: true,
  }),
  recipeEntry({ id: 'grass_side', label: 'Grass side', kind: 'block', fallback: 'plain' }),
  recipeEntry({ id: 'sand', label: 'Sand', kind: 'block', fallback: 'plain', tiles: true }),
  recipeEntry({ id: 'gravel', label: 'Gravel', kind: 'block', fallback: 'stone', tiles: true }),
]);
