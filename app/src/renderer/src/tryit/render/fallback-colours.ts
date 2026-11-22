/**
 * MSM's own pictures for Minecraft blocks (B405, B499): without the user's client jar (ADR 0011)
 * a vanilla block of a ground or the picker has no picture. The terrain and wood families
 * (stone, cobblestone, dirt, grass top and side, sand, gravel, planks, logs and their ends,
 * leaves) are drawn by the library's vanilla-style recipes (ADR 0092 D16) in the colours of the
 * table below, seeded by the block id; every other block is a cube of one colour from the table
 * by block id or family, with a little shading so faces read. Water and lava always draw as
 * one-colour cubes (see-through blue, orange), because the game draws liquids with code, not
 * with a block model (ADR 0087, limit L7).
 *
 * Nothing here is Mojang's: the colours are MSM's own picks, the drawn pictures are MSM's own
 * recipes (`@msm/plugin-library`, never read from or compared with the game) and the plain
 * pictures are made here as 16 by 16 PNGs (a stored-deflate encoder, no dependency).
 */

import type { JsonObject } from '@msm/plugin-api';
// Only the type here: the library itself is loaded when the first drawn face is (see
// `fallbackTexturePng`), so the lazy canvas chunk stays as light to load as before.
import type { ArtRecipeId } from '@msm/plugin-library';

/** An RGBA colour, 0..255 each. */
export type Rgba = readonly [number, number, number, number];

/** The art recipes Try it draws Minecraft's terrain and wood with (ADR 0092 D16). */
export const DRAWN_RECIPES = [
  'stone',
  'cobblestone',
  'dirt',
  'grass_top',
  'grass_side',
  'sand',
  'gravel',
  'planks',
  'bark',
  'log_top',
  'stripped_log',
  'stripped_log_top',
  'leaves',
] as const satisfies readonly ArtRecipeId[];

/** A recipe Try it draws with; see {@link DRAWN_RECIPES}. */
export type DrawnRecipe = (typeof DRAWN_RECIPES)[number];

/** Which recipe draws each face of a block; a face without one is a plain colour. */
export interface FallbackDrawing {
  readonly top?: DrawnRecipe;
  readonly side?: DrawnRecipe;
  readonly bottom?: DrawnRecipe;
}

/** How a fallback block looks: one colour, or a top, side and bottom, and its shape. */
export interface FallbackLook {
  /** The colour of each face: the plain cube's colour, or a drawn face's main colour. */
  readonly top: Rgba;
  readonly side: Rgba;
  readonly bottom: Rgba;
  /** `cube`, `plant` (a small upright box) or `leaves` (a cube with holes). */
  readonly shape: 'cube' | 'plant' | 'leaves';
  /** The faces drawn by a recipe (B499); absent for one-colour cubes. */
  readonly drawn?: FallbackDrawing;
}

const rgb = (hex: number, alpha = 255): Rgba => [
  (hex >> 16) & 255,
  (hex >> 8) & 255,
  hex & 255,
  alpha,
];

/** Exact block paths (the part after `minecraft:`). */
const EXACT: Readonly<Record<string, Rgba>> = {
  dirt: rgb(0x86603f),
  coarse_dirt: rgb(0x77553a),
  rooted_dirt: rgb(0x8a6448),
  farmland: rgb(0x5c3e26),
  mud: rgb(0x3c3a3d),
  stone: rgb(0x7d7d7d),
  cobblestone: rgb(0x727272),
  mossy_cobblestone: rgb(0x6a7a5a),
  smooth_stone: rgb(0x9e9e9e),
  bedrock: rgb(0x3a3a3a),
  deepslate: rgb(0x50505a),
  tuff: rgb(0x6c6d66),
  granite: rgb(0x956756),
  diorite: rgb(0xbcbcbc),
  andesite: rgb(0x888889),
  calcite: rgb(0xdfe0dc),
  sand: rgb(0xdbcfa3),
  red_sand: rgb(0xbe6621),
  gravel: rgb(0x887e7d),
  clay: rgb(0xa0a6b3),
  snow: rgb(0xf2fafa),
  snow_block: rgb(0xf2fafa),
  powder_snow: rgb(0xf6fbfb),
  ice: rgb(0x91b7fd, 200),
  packed_ice: rgb(0x8db4fa),
  blue_ice: rgb(0x74a8fd),
  water: rgb(0x3f76e4, 150),
  lava: rgb(0xd5641a),
  bubble_column: rgb(0x3f76e4, 150),
  obsidian: rgb(0x15111f),
  lodestone: rgb(0x7c7e84),
  netherrack: rgb(0x6f3534),
  moss_block: rgb(0x596d2d),
  glass: rgb(0xd8ecf2, 90),
  tinted_glass: rgb(0x2c2731, 160),
  pumpkin: rgb(0xc27419),
  melon: rgb(0x72921e),
  hay_block: rgb(0xa88e10),
  bookshelf: rgb(0x6b5232),
  crafting_table: rgb(0x7a5a36),
  torch: rgb(0xf5c542),
  lantern: rgb(0x9b7a3b),
  air: rgb(0, 0),
};

/** Dye colours, for wool, carpet, concrete, terracotta, glass and the like. */
const DYES: Readonly<Record<string, number>> = {
  white: 0xe9ecec,
  orange: 0xf07613,
  magenta: 0xbd44b3,
  light_blue: 0x3aafd9,
  yellow: 0xf8c527,
  lime: 0x70b919,
  pink: 0xed8dac,
  gray: 0x3e4447,
  light_gray: 0x8e8e86,
  cyan: 0x158991,
  purple: 0x792aac,
  blue: 0x35399d,
  brown: 0x724728,
  green: 0x546d1b,
  red: 0xa12722,
  black: 0x141519,
};

/** Wood types by the start of the path, for logs, planks and leaves. */
const WOODS: Readonly<Record<string, { bark: number; inner: number; leaves: number }>> = {
  oak: { bark: 0x6d5532, inner: 0xb08f55, leaves: 0x4a8a2c },
  spruce: { bark: 0x3a2716, inner: 0x7a5a34, leaves: 0x3d5e3d },
  birch: { bark: 0xd8d7d2, inner: 0xc5b077, leaves: 0x6a9a4a },
  jungle: { bark: 0x55441c, inner: 0xa67652, leaves: 0x3e8a1e },
  acacia: { bark: 0x676157, inner: 0xad5d32, leaves: 0x5f8a26 },
  dark_oak: { bark: 0x3c2e1a, inner: 0x4c331a, leaves: 0x3b6a24 },
  mangrove: { bark: 0x54432b, inner: 0x773634, leaves: 0x4b8a2c },
  cherry: { bark: 0x37201f, inner: 0xe2b3ac, leaves: 0xe6a7c2 },
  pale_oak: { bark: 0x5d5752, inner: 0xe0d6d2, leaves: 0x8a9283 },
  crimson: { bark: 0x5c1d29, inner: 0x7e3a56, leaves: 0x8f1f1f },
  warped: { bark: 0x3a3b4e, inner: 0x2b6863, leaves: 0x167e7a },
  azalea: { bark: 0x6d5532, inner: 0xb08f55, leaves: 0x5e7a2c },
  bamboo: { bark: 0x7a8a26, inner: 0xc4b24c, leaves: 0x5e8a26 },
};

/** Words of a path that make a block draw as a small plant. */
const PLANT_WORDS = [
  'short_grass',
  'tall_grass',
  'fern',
  'sapling',
  'flower',
  'tulip',
  'dandelion',
  'poppy',
  'orchid',
  'allium',
  'azure_bluet',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'rose_bush',
  'peony',
  'lilac',
  'sunflower',
  'dead_bush',
  'bush',
  'mushroom',
  'sweet_berry',
  'seagrass',
  'kelp',
  'sugar_cane',
  'torch',
  'leaf_litter',
  'wildflowers',
  'propagule',
];

const FLOWER_TONE = 0xd65a8a;

/** A colour from the id, for blocks no rule knows: the same id always gets the same muted colour. */
function hashedColour(path: string): Rgba {
  let h = 2166136261;
  for (let i = 0; i < path.length; i += 1) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = 90 + ((h >>> 0) % 110);
  const g = 90 + ((h >>> 8) % 110);
  const b = 90 + ((h >>> 16) % 110);
  return [r, g, b, 255];
}

const same = (colour: Rgba, shape: FallbackLook['shape'] = 'cube'): FallbackLook => ({
  top: colour,
  side: colour,
  bottom: colour,
  shape,
});

/** Natural stones drawn with the stone recipe in their own colours. */
const STONES = new Set([
  'stone',
  'granite',
  'diorite',
  'andesite',
  'deepslate',
  'tuff',
  'calcite',
  'bedrock',
]);

/** Cobbles drawn with the cobblestone recipe. */
const COBBLES: Readonly<Record<string, number>> = {
  cobblestone: 0x727272,
  mossy_cobblestone: 0x6a7a5a,
  cobbled_deepslate: 0x4d4d55,
};

/** Grass-like blocks: a top colour drawn as grass, a dirt bottom, and the grass side. */
const GRASSES: Readonly<Record<string, number>> = {
  grass_block: 0x5f9f35,
  podzol: 0x5b3d1a,
  mycelium: 0x6f6265,
};

const DIRT = 0x86603f;

const all = (recipe: DrawnRecipe): FallbackDrawing => ({
  top: recipe,
  side: recipe,
  bottom: recipe,
});

/**
 * The drawn look of a terrain or wood block (ADR 0092 D16), or `null` when the block stays a
 * one-colour cube. Liquids never draw here.
 */
function drawnLook(path: string): FallbackLook | null {
  const grass = GRASSES[path];
  if (grass !== undefined) {
    return {
      top: rgb(grass),
      side: rgb(grass),
      bottom: rgb(DIRT),
      shape: 'cube',
      drawn: {
        top: path === 'grass_block' ? 'grass_top' : 'dirt',
        side: 'grass_side',
        bottom: 'dirt',
      },
    };
  }
  const plain = (colour: Rgba, recipe: DrawnRecipe): FallbackLook => ({
    ...same(colour),
    drawn: all(recipe),
  });
  if (STONES.has(path)) return plain(EXACT[path] as Rgba, 'stone');
  const cobble = COBBLES[path];
  if (cobble !== undefined) return plain(rgb(cobble), 'cobblestone');
  if (path === 'dirt' || path === 'coarse_dirt' || path === 'rooted_dirt') {
    return plain(EXACT[path] as Rgba, 'dirt');
  }
  if (path === 'sand' || path === 'red_sand') return plain(EXACT[path] as Rgba, 'sand');
  if (path === 'gravel') return plain(EXACT[path] as Rgba, 'gravel');
  for (const [wood, tones] of Object.entries(WOODS)) {
    const stripped = path.startsWith(`stripped_${wood}_`);
    if (!path.startsWith(`${wood}_`) && !stripped) continue;
    const rest = path.slice(stripped ? `stripped_${wood}_`.length : `${wood}_`.length);
    if (rest === 'leaves' || rest === 'flowering_leaves') {
      return { ...same(rgb(tones.leaves), 'leaves'), drawn: all('leaves') };
    }
    if (rest === 'planks') return plain(rgb(tones.inner), 'planks');
    if (rest === 'log' || rest === 'stem') {
      return {
        top: rgb(tones.inner),
        side: rgb(stripped ? tones.inner : tones.bark),
        bottom: rgb(tones.inner),
        shape: 'cube',
        drawn: stripped
          ? { top: 'stripped_log_top', side: 'stripped_log', bottom: 'stripped_log_top' }
          : { top: 'log_top', side: 'bark', bottom: 'log_top' },
      };
    }
    if (rest === 'wood' || rest === 'hyphae') {
      return stripped ? plain(rgb(tones.inner), 'stripped_log') : plain(rgb(tones.bark), 'bark');
    }
  }
  if (path.endsWith('_leaves')) return { ...same(rgb(0x4a8a2c), 'leaves'), drawn: all('leaves') };
  return null;
}

/** How a Minecraft block id draws without the client jar; see the module comment. */
export function fallbackLook(id: string): FallbackLook {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  if (!alwaysFallback(`minecraft:${path}`)) {
    const drawn = drawnLook(path);
    if (drawn !== null) return drawn;
  }
  if (path === 'grass_block') {
    return { top: rgb(0x5f9f35), side: rgb(0x7f6a3e), bottom: rgb(0x86603f), shape: 'cube' };
  }
  if (path === 'podzol') {
    return { top: rgb(0x5b3d1a), side: rgb(0x7a5a3a), bottom: rgb(0x86603f), shape: 'cube' };
  }
  if (path === 'mycelium') {
    return { top: rgb(0x6f6265), side: rgb(0x7f6a5e), bottom: rgb(0x86603f), shape: 'cube' };
  }
  const exact = EXACT[path];
  if (exact !== undefined) {
    const plant = PLANT_WORDS.some((word) => path.includes(word));
    return same(exact, plant ? 'plant' : 'cube');
  }
  for (const [wood, tones] of Object.entries(WOODS)) {
    if (!path.startsWith(`${wood}_`) && !path.startsWith(`stripped_${wood}_`)) continue;
    if (path.endsWith('_leaves')) return same(rgb(tones.leaves), 'leaves');
    if (/_(log|wood|stem|hyphae)$/.test(path)) {
      const stripped = path.startsWith('stripped_');
      const side = stripped ? tones.inner : tones.bark;
      return { top: rgb(tones.inner), side: rgb(side), bottom: rgb(tones.inner), shape: 'cube' };
    }
    if (path.includes('sapling') || path.includes('propagule'))
      return same(rgb(tones.leaves), 'plant');
    return same(rgb(tones.inner));
  }
  if (path.endsWith('_leaves')) return same(rgb(0x4a8a2c), 'leaves');
  if (path.includes('sandstone')) return same(rgb(path.startsWith('red') ? 0xb5621f : 0xd8cb9b));
  for (const [dye, colour] of Object.entries(DYES)) {
    if (!path.startsWith(`${dye}_`)) continue;
    if (path.includes('glass')) return same(rgb(colour, 120));
    return same(rgb(colour), PLANT_WORDS.some((word) => path.includes(word)) ? 'plant' : 'cube');
  }
  if (PLANT_WORDS.some((word) => path.includes(word))) {
    const flower =
      /tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily|rose|peony|lilac|sunflower|flower/.test(
        path,
      );
    return same(rgb(flower ? FLOWER_TONE : 0x5d8f2f), 'plant');
  }
  if (path.includes('glass')) return same(rgb(0xd8ecf2, 90));
  if (path.includes('deepslate')) return same(rgb(0x50505a));
  if (path.includes('copper')) return same(rgb(0xc06c50));
  if (path.includes('brick')) return same(rgb(0x96614f));
  if (path.endsWith('_ore')) return same(rgb(0x8a8a8a));
  if (path.includes('planks')) return same(rgb(0xb08f55));
  if (path.includes('stone')) return same(rgb(0x7d7d7d));
  if (path.includes('ice')) return same(rgb(0x91b7fd, 200));
  return same(hashedColour(path));
}

// ---- PNG --------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib with stored (uncompressed) deflate blocks: tiny pictures need nothing better. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let i = 0; i < blocks; i += 1) {
    const start = i * 65535;
    const length = Math.min(65535, data.length - start);
    out[at] = i === blocks - 1 ? 1 : 0;
    out[at + 1] = length & 255;
    out[at + 2] = length >> 8;
    out[at + 3] = ~length & 255;
    out[at + 4] = (~length >> 8) & 255;
    out.set(data.subarray(start, start + length), at + 5);
    at += 5 + length;
  }
  const check = adler32(data);
  out[at] = check >>> 24;
  out[at + 1] = (check >>> 16) & 255;
  out[at + 2] = (check >>> 8) & 255;
  out[at + 3] = check & 255;
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An RGBA picture as PNG bytes (8 bits a channel, no filtering). */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 4)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * A 16 by 16 picture of one colour with a faint, fixed speckle (so faces are not flat), and for
 * `holes` some fully clear pixels (leaves read as leaves and draw in the cut-out pass).
 */
export function fallbackPicture(colour: Rgba, holes = false): Uint8Array {
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i += 1) {
    const x = i % 16;
    const y = Math.floor(i / 16);
    let h = Math.imul((x * 73856093) ^ (y * 19349663), 0x9e3779b1) >>> 0;
    h ^= h >>> 15;
    const shade = 0.88 + ((h % 1000) / 1000) * 0.2;
    rgba[i * 4] = Math.min(255, Math.round(colour[0] * shade));
    rgba[i * 4 + 1] = Math.min(255, Math.round(colour[1] * shade));
    rgba[i * 4 + 2] = Math.min(255, Math.round(colour[2] * shade));
    rgba[i * 4 + 3] = holes && h % 5 === 0 ? 0 : colour[3];
  }
  return encodeRgbaPng(16, 16, rgba);
}

// ---- Models ------------------------------------------------------------------------------------

/** The namespace of fallback models and textures; never a real game path. */
export const FALLBACK_NAMESPACE = 'msm';

const hex = (colour: Rgba): string =>
  colour.map((value) => value.toString(16).padStart(2, '0')).join('');

/** The texture id of a colour (`msm:tryit_colour/<rrggbbaa>[_holes]`). */
export function fallbackTextureId(colour: Rgba, holes = false): string {
  return `${FALLBACK_NAMESPACE}:tryit_colour/${hex(colour)}${holes ? '_holes' : ''}`;
}

/** The colour (and holes) a fallback texture id stands for, or `null` for any other id. */
export function parseFallbackTextureId(id: string): { colour: Rgba; holes: boolean } | null {
  const match = /^msm:tryit_colour\/([0-9a-f]{8})(_holes)?$/.exec(id);
  if (match === null) return null;
  const value = match[1] as string;
  const colour = [0, 2, 4, 6].map((at) =>
    Number.parseInt(value.slice(at, at + 2), 16),
  ) as unknown as Rgba;
  return { colour, holes: match[2] !== undefined };
}

/**
 * The texture id of a drawn face (`msm:tryit_drawn/<recipe>/<rrggbb>/<block path>`); the block
 * path seeds the drawing (`hashSeed('tryit', path)`), so each block id has its own variation.
 */
export function drawnTextureId(recipe: DrawnRecipe, colour: Rgba, path: string): string {
  return `${FALLBACK_NAMESPACE}:tryit_drawn/${recipe}/${hex(colour).slice(0, 6)}/${path}`;
}

/** The recipe, colour and block path a drawn texture id stands for, or `null` for any other id. */
export function parseDrawnTextureId(
  id: string,
): { recipe: DrawnRecipe; colour: readonly [number, number, number]; path: string } | null {
  const match = /^msm:tryit_drawn\/([a-z_]+)\/([0-9a-f]{6})\/([a-z0-9_.-]+)$/.exec(id);
  if (match === null) return null;
  const recipe = match[1] as DrawnRecipe;
  if (!(DRAWN_RECIPES as readonly string[]).includes(recipe)) return null;
  const value = match[2] as string;
  const colour = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
  return { recipe, colour, path: match[3] as string };
}

/**
 * The PNG of a fallback texture id: a drawn face (the library's recipe, byte-stable for the same
 * id) or a plain colour; `null` for any other id. The library is imported on the first drawn
 * face (it is already in the app's main chunk, so this costs no download).
 */
export async function fallbackTexturePng(id: string): Promise<Uint8Array | null> {
  const drawn = parseDrawnTextureId(id);
  if (drawn !== null) {
    const { artLookPng, hashSeed } = await import('@msm/plugin-library');
    return artLookPng({
      recipe: drawn.recipe,
      colour: drawn.colour,
      seed: hashSeed('tryit', drawn.path),
    });
  }
  const plain = parseFallbackTextureId(id);
  return plain === null ? null : fallbackPicture(plain.colour, plain.holes);
}

/** The model id of a block's fallback cube. */
export function fallbackModelId(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return `${FALLBACK_NAMESPACE}:tryit_fallback/${path}`;
}

/** A block state definition with one variant: the fallback model. */
export function fallbackDefinition(id: string): JsonObject {
  return { variants: { '': { model: fallbackModelId(id) } } };
}

/** The fallback model of a block: a cube (or a small upright box) with its pictures. */
export function fallbackModel(id: string): JsonObject {
  const look = fallbackLook(id);
  const holes = look.shape === 'leaves';
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const texture = (face: 'top' | 'side' | 'bottom'): string => {
    const recipe = look.drawn?.[face];
    return recipe === undefined
      ? fallbackTextureId(look[face], holes)
      : drawnTextureId(recipe, look[face], path);
  };
  const textures = { top: texture('top'), side: texture('side'), bottom: texture('bottom') };
  const plant = look.shape === 'plant';
  const cull = (face: string) => (plant ? {} : { cullface: face });
  const face = (texture: string, name: string) => ({
    uv: [0, 0, 16, 16],
    texture: `#${texture}`,
    ...cull(name),
  });
  return {
    textures: { ...textures, particle: textures.side },
    elements: [
      {
        from: plant ? [4, 0, 4] : [0, 0, 0],
        to: plant ? [12, 12, 12] : [16, 16, 16],
        faces: {
          down: face('bottom', 'down'),
          up: face('top', 'up'),
          north: face('side', 'north'),
          south: face('side', 'south'),
          west: face('side', 'west'),
          east: face('side', 'east'),
        },
      },
    ],
  };
}

/** Whether a Minecraft block always draws as a fallback cube (liquids: the game draws them in code). */
export function alwaysFallback(id: string): boolean {
  return id === 'minecraft:water' || id === 'minecraft:lava' || id === 'minecraft:bubble_column';
}
