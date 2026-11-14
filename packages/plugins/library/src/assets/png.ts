/**
 * Deterministic placeholder textures for starters and examples (ADR 0020, D3): 16x16 block
 * and item patterns, 64x32 humanoid armour layers (ADR 0043 D2) and a 64x64 two-tone checker
 * for entity models.
 *
 * Every pixel comes from integer maths: no randomness, no Minecraft texture is read or
 * copied, and the work is original (CC0). The PNG encoder is self-contained and writes
 * stored (uncompressed) deflate blocks, so the bytes are identical on every machine, which
 * lets tests and the `examples/` mirror pin them. Ported from
 * `fixtures/sample-resourcepack/tools/make-textures.mjs`, without Node APIs so it also runs
 * in the renderer.
 *
 * @packageDocumentation
 */

/** Texture edge length in pixels. */
export const PLACEHOLDER_SIZE = 16;

/** An opaque colour as `[red, green, blue]`, each 0–255. */
export type Rgb = readonly [number, number, number];

/**
 * The placeholder patterns. 16x16 unless noted; every item pattern has a transparent
 * background.
 * - `plain`: a flat colour with a one-pixel bevel (block texture);
 * - `ore`: coloured specks on grey stone (block texture);
 * - `gem`: a cut gem (item texture);
 * - `disc`: a music disc with a coloured label (item texture);
 * - `egg`: a speckled spawn egg (item texture);
 * - `sword`, `pickaxe`, `axe`, `shovel`, `hoe`: a diagonal tool with a coloured head and a
 *   wooden grip (handheld item textures);
 * - `helmet`, `chestplate`, `leggings`, `boots`: an armour piece seen from the front (item
 *   textures);
 * - `ingot`: a metal bar (item texture);
 * - `armor_layer_1`, `armor_layer_2`: 64x32 worn armour in the vanilla humanoid layout,
 *   layer 1 the helmet, chestplate and boots, layer 2 the leggings (equipment textures under
 *   `entity/equipment/humanoid/` and `humanoid_leggings/`; see {@link armorLayerPng});
 * - `bow`, `crossbow`, `spear`, `mace`: ranged and melee weapons with wooden parts and a
 *   light string (handheld item textures);
 * - `shield`: a heater shield with a boss (item texture);
 * - `bottle`: a glass bottle of coloured liquid with a cork (item texture);
 * - `totem`: a small figure with spread arms, like the totem of undying (item texture);
 * - `smithing_template`: an engraved plate (item texture);
 * - `horse_armor`, `wolf_armor`: body armour for a horse and a wolf (item textures);
 * - `horse_armor_layer`: 64x64 worn horse armour in the vanilla horse texture layout
 *   (equipment texture under `entity/equipment/horse_body/`);
 * - `wolf_armor_layer`: 64x32 worn wolf armour in the vanilla wolf texture layout (equipment
 *   texture under `entity/equipment/wolf_body/`);
 * - `ball`: a round throwable, like a snowball (item texture);
 * - `knife`: a short throwing knife with a guard and a wooden grip (handheld item texture);
 * - `boomerang`: a bent boomerang with two painted stripes (handheld item texture);
 * - `flask`: a round-bottomed flask of coloured liquid with a cork, for thrown effects (item
 *   texture);
 * - `effect_icon`: 18x18 round badge with a sparkle, a status effect icon (texture under
 *   `mob_effect/`, named after the effect; ADR 0055 D6);
 * - `bark`, `log_top`: the side and the cut end of a log, bark in darker shades of the colour
 *   (block textures; ADR 0069 D2);
 * - `stripped_log`, `stripped_log_top`: the side and the end of a stripped log, lighter wood
 *   grain with rings on the end (block textures);
 * - `planks`: four boards with staggered joints (block texture);
 * - `door_top`, `door_bottom`: the two halves of a panelled door, the bottom with a handle
 *   (block textures);
 * - `trapdoor`: a framed hatch with cross bars (block texture);
 * - `leaves`: dense opaque foliage in shades of the colour (block texture);
 * - `sapling`: a young tree with a wooden stem on a transparent background, drawn as a cross
 *   (block and item texture);
 * - `stone`: rough speckled stone in shades of the colour (block texture);
 * - `polished_stone`: smooth stone with a bevelled rim (block texture);
 * - `bricks`: four courses of staggered bricks with mortar (block texture);
 * - `pillar_side`, `pillar_top`: the fluted side and the capped end of a pillar (block
 *   textures);
 * - `crop_stage0` to `crop_stage3`: a row of crop stalks on a transparent background, from
 *   sprouts to the ripe plant whose produce is drawn in the accent colour (block textures of
 *   the `minecraft:block/crop` model; ADR 0069 D2);
 * - `seeds`: a handful of seed grains (item texture);
 * - `produce`: a round vegetable or fruit with a green leafy top (item texture);
 * - `block_front`: a bevelled face with vents and a dark opening, the front of a furnace-like
 *   block (block texture).
 *
 * Paintings have their own placeholder of any size, {@link paintingPng}.
 */
export type PlaceholderPattern =
  | 'plain'
  | 'ore'
  | 'gem'
  | 'disc'
  | 'egg'
  | 'sword'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'hoe'
  | 'helmet'
  | 'chestplate'
  | 'leggings'
  | 'boots'
  | 'ingot'
  | 'armor_layer_1'
  | 'armor_layer_2'
  | 'bow'
  | 'bow_pulling_0'
  | 'bow_pulling_1'
  | 'bow_pulling_2'
  | 'crossbow'
  | 'crossbow_pulling_0'
  | 'crossbow_pulling_1'
  | 'crossbow_pulling_2'
  | 'crossbow_arrow'
  | 'crossbow_firework'
  | 'shield'
  | 'spear'
  | 'mace'
  | 'bottle'
  | 'totem'
  | 'smithing_template'
  | 'horse_armor'
  | 'wolf_armor'
  | 'horse_armor_layer'
  | 'wolf_armor_layer'
  | 'ball'
  | 'knife'
  | 'boomerang'
  | 'flask'
  | 'effect_icon'
  | 'bark'
  | 'log_top'
  | 'stripped_log'
  | 'stripped_log_top'
  | 'planks'
  | 'door_top'
  | 'door_bottom'
  | 'trapdoor'
  | 'leaves'
  | 'sapling'
  | 'stone'
  | 'polished_stone'
  | 'bricks'
  | 'pillar_side'
  | 'pillar_top'
  | 'crop_stage0'
  | 'crop_stage1'
  | 'crop_stage2'
  | 'crop_stage3'
  | 'seeds'
  | 'produce'
  | 'block_front';

/** Every pattern, in documentation order. */
export const PLACEHOLDER_PATTERNS: readonly PlaceholderPattern[] = Object.freeze([
  'plain',
  'ore',
  'gem',
  'disc',
  'egg',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'ingot',
  'armor_layer_1',
  'armor_layer_2',
  'bow',
  'bow_pulling_0',
  'bow_pulling_1',
  'bow_pulling_2',
  'crossbow',
  'crossbow_pulling_0',
  'crossbow_pulling_1',
  'crossbow_pulling_2',
  'crossbow_arrow',
  'crossbow_firework',
  'shield',
  'spear',
  'mace',
  'bottle',
  'totem',
  'smithing_template',
  'horse_armor',
  'wolf_armor',
  'horse_armor_layer',
  'wolf_armor_layer',
  'ball',
  'knife',
  'boomerang',
  'flask',
  'effect_icon',
  'bark',
  'log_top',
  'stripped_log',
  'stripped_log_top',
  'planks',
  'door_top',
  'door_bottom',
  'trapdoor',
  'leaves',
  'sapling',
  'stone',
  'polished_stone',
  'bricks',
  'pillar_side',
  'pillar_top',
  'crop_stage0',
  'crop_stage1',
  'crop_stage2',
  'crop_stage3',
  'seeds',
  'produce',
  'block_front',
]);

/** Width and height of the armour layer patterns, the vanilla humanoid armour texture size. */
export const ARMOR_LAYER_SIZE = Object.freeze({ width: 64, height: 32 });

/** Width and height of the horse armour layer, the vanilla horse texture size. */
export const HORSE_ARMOR_LAYER_SIZE = Object.freeze({ width: 64, height: 64 });

/** Width and height of the wolf armour layer, the vanilla wolf texture size. */
export const WOLF_ARMOR_LAYER_SIZE = Object.freeze({ width: 64, height: 32 });

/** Edge length of the `effect_icon` pattern, the vanilla mob effect icon size (ADR 0055 D6). */
export const EFFECT_ICON_SIZE = 18;

/**
 * The size of a pattern's image in pixels: {@link ARMOR_LAYER_SIZE} for the humanoid armour
 * layers, {@link HORSE_ARMOR_LAYER_SIZE} and {@link WOLF_ARMOR_LAYER_SIZE} for the body armour
 * layers, {@link EFFECT_ICON_SIZE} square for `effect_icon`, {@link PLACEHOLDER_SIZE} square for
 * every other pattern.
 */
export function placeholderSize(pattern: PlaceholderPattern): { width: number; height: number } {
  if (pattern === 'effect_icon') return { width: EFFECT_ICON_SIZE, height: EFFECT_ICON_SIZE };
  if (pattern === 'armor_layer_1' || pattern === 'armor_layer_2') {
    return { width: ARMOR_LAYER_SIZE.width, height: ARMOR_LAYER_SIZE.height };
  }
  if (pattern === 'horse_armor_layer') {
    return { width: HORSE_ARMOR_LAYER_SIZE.width, height: HORSE_ARMOR_LAYER_SIZE.height };
  }
  if (pattern === 'wolf_armor_layer') {
    return { width: WOLF_ARMOR_LAYER_SIZE.width, height: WOLF_ARMOR_LAYER_SIZE.height };
  }
  return { width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE };
}

/** Options for {@link placeholderPng}. */
export interface PlaceholderOptions {
  /** The main colour; defaults to {@link DEFAULT_COLOUR}. */
  colour?: Rgb;
  /**
   * A second colour: the spots of the `egg` pattern and the produce of `crop_stage3`. Defaults
   * to a darker shade of the main colour (scaled to 71 per cent). Other patterns ignore it.
   */
  accent?: Rgb;
}

/** Ruby red, the default placeholder colour. */
export const DEFAULT_COLOUR: Rgb = Object.freeze([196, 28, 52]) as Rgb;

type Rgba = readonly [number, number, number, number];

const CLEAR: Rgba = [0, 0, 0, 0];

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** `colour` scaled towards black (`factor` < 1) or mixed towards white (`factor` > 1). */
function shade(colour: Rgb, factor: number): Rgba {
  const channel = (value: number): number =>
    factor <= 1 ? clamp(value * factor) : clamp(value + (255 - value) * (factor - 1));
  return [channel(colour[0]), channel(colour[1]), channel(colour[2]), 255];
}

interface Palette {
  /** The second colour (egg spots); defaults to {@link Palette.deep}. */
  accent: Rgba;
  dark: Rgba;
  deep: Rgba;
  mid: Rgba;
  light: Rgba;
  shine: Rgba;
}

function paletteOf(colour: Rgb, accent?: Rgb): Palette {
  return {
    accent: accent === undefined ? shade(colour, 0.71) : [accent[0], accent[1], accent[2], 255],
    dark: shade(colour, 0.47),
    deep: shade(colour, 0.71),
    mid: shade(colour, 1),
    light: shade(colour, 1.3),
    shine: shade(colour, 1.75),
  };
}

/** A small integer hash of a pixel position, stable across platforms. */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

type Pixel = (x: number, y: number) => Rgba;

/**
 * A storage block: a bevelled outer edge, an inset panel with its own shadow and light edges,
 * a little grain and a highlight in the top-left corner.
 */
function plain(palette: Palette): Pixel {
  const last = PLACEHOLDER_SIZE - 1;
  return (x, y) => {
    if (x === 0 || y === 0) return palette.light;
    if (x === last || y === last) return palette.deep;
    const inPanel = x >= 2 && x <= last - 2 && y >= 2 && y <= last - 2;
    if (inPanel && (x === 2 || y === 2)) return palette.deep;
    if (inPanel && (x === last - 2 || y === last - 2)) return palette.light;
    if ((x === 3 && y <= 5 && y >= 3) || (y === 3 && x <= 5 && x >= 3)) return palette.shine;
    return hash(x, y, 11) % 9 === 0 ? palette.deep : palette.mid;
  };
}

const STONE: readonly Rgba[] = [
  [104, 104, 104, 255],
  [120, 120, 120, 255],
  [128, 128, 128, 255],
  [142, 142, 142, 255],
];

/** Speck centres of the ore pattern; each speck is a plus of up to five pixels. */
const SPECKS: readonly (readonly [number, number])[] = [
  [3, 3],
  [11, 2],
  [7, 7],
  [2, 11],
  [12, 10],
  [8, 13],
];

function ore(palette: Palette): Pixel {
  return (x, y) => {
    for (const [cx, cy] of SPECKS) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return palette.light;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        return dx < 0 || dy < 0 ? palette.mid : palette.dark;
      }
    }
    return STONE[hash(x, y, 7) % STONE.length] as Rgba;
  };
}

function gem(palette: Palette): Pixel {
  const cx = 7.5;
  const top = 3;
  const bottom = 13;
  return (x, y) => {
    if (y < top || y > bottom) return CLEAR;
    // Crown: rows 3-6 widen; pavilion: rows 7-13 narrow to a point.
    const half = y <= 6 ? 2 + (y - top) : 5 - Math.floor(((y - 6) * 5) / 7);
    const dx = Math.abs(x - cx);
    if (dx > half) return CLEAR;
    if (dx > half - 1 || y === top) return palette.dark;
    if (y <= 6) {
      if ((x === 5 || x === 6) && y === 4) return palette.shine;
      return y === 6 ? palette.mid : palette.light;
    }
    return x < cx ? palette.mid : palette.deep;
  };
}

const VINYL: Rgba = [28, 28, 32, 255];
const VINYL_GROOVE: Rgba = [48, 48, 56, 255];
const VINYL_EDGE: Rgba = [12, 12, 14, 255];

function disc(palette: Palette): Pixel {
  const c = 7.5;
  return (x, y) => {
    const d2 = (x - c) * (x - c) + (y - c) * (y - c);
    if (d2 > 7.5 * 7.5) return CLEAR;
    if (d2 > 6.6 * 6.6) return VINYL_EDGE;
    if (d2 <= 0.75 * 0.75) return CLEAR;
    if (d2 <= 2.6 * 2.6) return x + y < 15 ? palette.light : palette.mid;
    if (d2 <= 3.4 * 3.4) return palette.dark;
    if (d2 > 4.9 * 4.9 && d2 <= 5.6 * 5.6) return VINYL_GROOVE;
    return VINYL;
  };
}

/** Spot centres of the egg pattern. */
const EGG_SPOTS: readonly (readonly [number, number])[] = [
  [6, 5],
  [9, 8],
  [5, 10],
  [9, 12],
];

function egg(palette: Palette): Pixel {
  const cx = 7.5;
  const cy = 8;
  const inside = (x: number, y: number): boolean => {
    // A little narrower at the top, like an egg.
    const rx = y < cy ? 4.6 : 5.4;
    return ((x - cx) / rx) ** 2 + ((y - cy) / 6.4) ** 2 <= 1;
  };
  return (x, y) => {
    if (!inside(x, y)) return CLEAR;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
      return palette.dark;
    }
    for (const [sx, sy] of EGG_SPOTS) {
      if (Math.abs(x - sx) + Math.abs(y - sy) <= 1) return palette.accent;
    }
    if (x < cx - 1 && y < cy - 2) return palette.shine;
    return palette.light;
  };
}

const GRIP: Rgba = [104, 72, 40, 255];
const GRIP_DARK: Rgba = [72, 48, 24, 255];
/** Bow strings and bottle glass. */
const STRING: Rgba = [218, 222, 226, 255];
/** Arrowheads on drawn bows and loaded crossbows. */
const ARROW_HEAD: Rgba = [168, 172, 178, 255];
/** The firework rocket on a crossbow loaded with one. */
const ROCKET: Rgba = [196, 52, 44, 255];

/**
 * A sword from the bottom-left grip to the top-right tip along the diagonal `x + y = 15`: a
 * blade with a light and a dark edge, a cross guard and a wooden grip with a pommel.
 */
function sword(palette: Palette): Pixel {
  return (x, y) => {
    const diagonal = x + y;
    // Cross guard: perpendicular to the blade through (5, 10).
    if (x - y === -5 && x >= 3 && x <= 7) return palette.dark;
    if (diagonal === 15) {
      if (x === 1) return GRIP_DARK;
      if (x >= 2 && x <= 4) return GRIP;
      if (x === 14) return palette.shine;
      if (x >= 6 && x <= 13) return palette.mid;
    }
    if (diagonal === 14 && x >= 6 && x <= 12) return palette.light;
    if (diagonal === 16 && x >= 7 && x <= 13) return palette.deep;
    return CLEAR;
  };
}

// Hand-drawn masks ------------------------------------------------------------------------

/**
 * A pixel mask: one string per row, one character per pixel. `.` is transparent; `x` is the
 * colour, shaded by {@link maskPattern}'s bevel rule; `d`, `m`, `l` and `s` are the dark, mid,
 * light and shine shades of the colour drawn as they are; `h` and `g` are the wooden grip and
 * its dark end; `w` is a light grey for strings and glass.
 */
type Mask = readonly string[];

/** A mask as a mutable grid of characters. */
const gridOf = (mask: Mask): string[][] => mask.map((row) => [...row]);
const maskOf = (grid: readonly string[][]): Mask => grid.map((row) => row.join(''));

/**
 * A diagonal tool from a head mask (only `x` pixels): with `mirror`, the head is made
 * symmetric about the handle's axis (the diagonal `x + y = 15`), then a two-tone wooden
 * handle runs from the bottom-left corner up to column `top` behind the head.
 */
function toolMask(head: Mask, top: number, mirror: boolean): Mask {
  const grid = gridOf(head);
  if (mirror) {
    for (let y = 0; y < PLACEHOLDER_SIZE; y += 1) {
      for (let x = 0; x < PLACEHOLDER_SIZE; x += 1) {
        if (head[15 - x]?.[15 - y] === 'x') (grid[y] as string[])[x] = 'x';
      }
    }
  }
  for (let x = 1; x <= top; x += 1) {
    const row = grid[15 - x] as string[];
    if (row[x] === '.') row[x] = x === 1 ? 'g' : 'h';
    if (x > 1 && row[x + 1] === '.') row[x + 1] = 'g';
  }
  return maskOf(grid);
}

const PICKAXE: Mask = toolMask(
  [
    '................',
    '....xxxxx.......',
    '..xxxxxxxxx.....',
    '.xxx.....xxx....',
    '.xx.......xx....',
    '.x..............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  11,
  true,
);

const AXE: Mask = toolMask(
  [
    '................',
    '.....xxx........',
    '....xxxxx.......',
    '...xxxxxxx......',
    '...xxxxxxxx.....',
    '....xxxxxxxx....',
    '.....xxxx.......',
    '......xx........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  13,
  false,
);

const SHOVEL: Mask = toolMask(
  [
    '................',
    '...........xxx..',
    '..........xxxxx.',
    '.........xxxxxx.',
    '........xxxxxx..',
    '........xxxxx...',
    '.........xxx....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  8,
  false,
);

const HOE: Mask = toolMask(
  [
    '................',
    '......xxxxxxx...',
    '.....xxxxxxxxx..',
    '.....xxx........',
    '.....xx.........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  13,
  false,
);

const HELMET: Mask = [
  '................',
  '................',
  '................',
  '.....xxxxxx.....',
  '....xxxxxxxx....',
  '...xxxxsxxxxx...',
  '...xxxxxxxxxx...',
  '...xxxxxxxxxx...',
  '...xxx....xxx...',
  '...xx......xx...',
  '...xx......xx...',
  '...xx......xx...',
  '................',
  '................',
  '................',
  '................',
];

const CHESTPLATE: Mask = [
  '................',
  '..xxx......xxx..',
  '.xxxxx....xxxxx.',
  '.xxxxxxxxxxxxxx.',
  '.xxsxxxxxxxxxxx.',
  '.xxxxxxxxxxxxxx.',
  '.xxx.xxxxxx.xxx.',
  '.xxx.xxxxxx.xxx.',
  '.....xxxxxx.....',
  '.....xxxxxx.....',
  '.....xxxxxx.....',
  '.....xxxxxx.....',
  '.....xxxxxx.....',
  '................',
  '................',
  '................',
];

const LEGGINGS: Mask = [
  '................',
  '................',
  '....dddddddd....',
  '....xxxxxxxx....',
  '....xsxxxxxx....',
  '....xxxxxxxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '....xxx..xxx....',
  '................',
  '................',
];

const BOOTS: Mask = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '...xxx....xxx...',
  '...xsx....xsx...',
  '...xxx....xxx...',
  '...xxx....xxx...',
  '...xxx....xxx...',
  '..xxxx....xxxx..',
  '.xxxxx....xxxxx.',
  '.xxxxx....xxxxx.',
  '................',
  '................',
  '................',
];

const INGOT: Mask = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......ddddddd...',
  '.....dllllllld..',
  '....dlssllllldd.',
  '...ddddddddddmd.',
  '...dmmmmmmmmdmd.',
  '...dmmmmmmmmdd..',
  '...dddddddddd...',
  '................',
  '................',
  '................',
  '................',
];

/**
 * Worn armour, layer 1, in the vanilla humanoid layout: the head box (helmet, with an opening
 * for the face), the body and arm boxes (chestplate) and the lower legs (boots). Each box face
 * has a dark rim and a light top row.
 */
const ARMOR_LAYER_1: Mask = [
  '........dddddddd................................................',
  '........dlllllld................................................',
  '........dmmmmmmd................................................',
  '........dmmmmmmd................................................',
  '........dmmmmmmd................................................',
  '........dmmmmmmd................................................',
  '........dmmmmmmd................................................',
  '........dddddddd................................................',
  'dddddddddddddddddddddddddddddddd................................',
  'dllllllddllllllddllllllddlllllld................................',
  'dmmmmmmddddddddddmmmmmmddmmmmmmd................................',
  'dmmmmmmddm....mddmmmmmmddmmmmmmd................................',
  'dmmmmmmddm....mddmmmmmmddmmmmmmd................................',
  'dmmmmmmddm....mddmmmmmmddmmmmmmd................................',
  'dmmmmmmddm....mddmmmmmmddmmmmmmd................................',
  'dddddddddd....dddddddddddddddddd................................',
  '........dddd........dddddddddddddddd........dddd................',
  '........dlld........dllllllddlllllld........dlld................',
  '........dmmd........dmmmmmmddmmmmmmd........dmmd................',
  '........dddd........dddddddddddddddd........dddd................',
  '................dddddddddddddddddddddddddddddddddddddddd........',
  '................dllddllllllddllddllllllddllddllddllddlld........',
  '................dmmddmmmmmmddmmddmmmmmmddmmddmmddmmddmmd........',
  '................dmmddmmmmmmddmmddmmmmmmddmmddmmddmmddmmd........',
  '................dmmddmmmmmmddmmddmmmmmmddmmddmmddmmddmmd........',
  '................dmmddmmmmmmddmmddmmmmmmddmmddmmddmmddmmd........',
  '................dmmddmmmmmmddmmddmmmmmmddmmddmmddmmddmmd........',
  'dddddddddddddddddmmddmmmmmmddmmddmmmmmmddddddddddddddddd........',
  'dllddllddllddllddmmddmmmmmmddmmddmmmmmmd........................',
  'dmmddmmddmmddmmddmmddmmmmmmddmmddmmmmmmd........................',
  'dmmddmmddmmddmmddmmddmmmmmmddmmddmmmmmmd........................',
  'dddddddddddddddddddddddddddddddddddddddd........................',
];

/** Worn armour, layer 2: the waist of the body box and the upper legs (leggings). */
const ARMOR_LAYER_2: Mask = [
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '....dddd....................dddddddd............................',
  '....dlld....................dlllllld............................',
  '....dmmd....................dmmmmmmd............................',
  '....dddd....................dddddddd............................',
  'dddddddddddddddd................................................',
  'dllddllddllddlld................................................',
  'dmmddmmddmmddmmd................................................',
  'dmmddmmddmmddmmd................................................',
  'dmmddmmddmmddmmd................................................',
  'dmmddmmddmmddmmd................................................',
  'dmmddmmddmmddmmd................................................',
  'dmmddmmddmmddmmddddddddddddddddddddddddd........................',
  'dmmddmmddmmddmmddllddllllllddllddlllllld........................',
  'dddddddddddddddddmmddmmmmmmddmmddmmmmmmd........................',
  '................dmmddmmmmmmddmmddmmmmmmd........................',
  '................dddddddddddddddddddddddd........................',
];

const BOW: Mask = [
  '................',
  '........xxxxxx..',
  '......xxxxxxw...',
  '.....xxx...w....',
  '....hh....w.....',
  '...xh....w......',
  '..xx....w.......',
  '..xx...w........',
  '.xx...w.........',
  '.xx..w..........',
  '.xx.w...........',
  '.xxw............',
  '.xw.............',
  '.x..............',
  '................',
  '................',
];

const CROSSBOW: Mask = [
  '................',
  '......xx........',
  '......wxx.......',
  '......w.xx......',
  '......w..xx.....',
  '.......w..xx....',
  '.......w.hhxx...',
  '.......whh..xx..',
  '.......hhwww.xx.',
  '......hh.....wx.',
  '.....hh.........',
  '....hh..........',
  '...hh...........',
  '..gg............',
  '................',
  '................',
];

const SHIELD: Mask = [
  '................',
  '..dddddddddddd..',
  '..dxxxxxxxxxxd..',
  '..dxxxxxxxxxxd..',
  '..dxxxxddxxxxd..',
  '..dxxxdssdxxxd..',
  '..dxxxdssdxxxd..',
  '..dxxxxddxxxxd..',
  '..dxxxxxxxxxxd..',
  '...dxxxxxxxxd...',
  '...dxxxxxxxxd...',
  '....dxxxxxxd....',
  '.....dxxxxd.....',
  '......dxxd......',
  '.......dd.......',
  '................',
];

const SPEAR: Mask = [
  '................',
  '.............xx.',
  '............xxx.',
  '...........xxx..',
  '..........xxx...',
  '.........xxx....',
  '........dxx.....',
  '........hd......',
  '.......h........',
  '......h.........',
  '.....h..........',
  '....h...........',
  '...h............',
  '..g.............',
  '.g..............',
  '................',
];

const MACE: Mask = [
  '................',
  '.........xx.....',
  '.........xx.....',
  '.......xxxxxx...',
  '.......xsxxxx...',
  '.....xxxxxxxxxx.',
  '.....xxxxxxxxxx.',
  '.......xxxxxx...',
  '.......xxxxxx...',
  '......h..xx.....',
  '.....h...xx.....',
  '....h...........',
  '...h............',
  '..h.............',
  '.gg.............',
  '................',
];

const BOTTLE: Mask = [
  '................',
  '......hhhh......',
  '......hhhh......',
  '.......ww.......',
  '.......ww.......',
  '......wxxw......',
  '.....wxxxxw.....',
  '....wxxsxxxw....',
  '....wxsxxxxw....',
  '....wxxxxxxw....',
  '....wxxxxxxw....',
  '....wxxxxxxw....',
  '.....wxxxxw.....',
  '......wwww......',
  '................',
  '................',
];

const TOTEM: Mask = [
  '................',
  '.....xxxxxx.....',
  '.....xsxxsx.....',
  '.....xdxxdx.....',
  '.....xxxxxx.....',
  '......xddx......',
  '..xxxxxxxxxxxx..',
  '.xxxxxxxxxxxxxx.',
  '.xx..xxxxxx..xx.',
  '.x...xxsxxx...x.',
  '.....xxxxxx.....',
  '.....xxxxxx.....',
  '......x..x......',
  '.....xx..xx.....',
  '................',
  '................',
];

const SMITHING_TEMPLATE: Mask = [
  '................',
  '................',
  '..xxxxxxxxxxx...',
  '.xxxxxxxxxxxxx..',
  '.xxsxxxxxxxxxx..',
  '.xxxxdddddxxxx..',
  '.xxxxdxxxdxxxx..',
  '.xxxxdxsxdxxxx..',
  '.xxxxdxxxdxxxx..',
  '.xxxxdddddxxxx..',
  '.xxxxxxxxxxxxx..',
  '.xxxxxxxxxxxxx..',
  '..xxxxxxxxxxx...',
  '................',
  '................',
  '................',
];

const HORSE_ARMOR: Mask = [
  '................',
  '..........xx....',
  '.........xxxx...',
  '........xxxxxx..',
  '.......xxxsxxxx.',
  '......xxxxxxdxx.',
  '.....xxxxxx..xx.',
  '....xxxxxxx.....',
  '...xxxxxxxx.....',
  '..xxxxxxxxx.....',
  '..xxxxxxxxxx....',
  '..xxxxxxxxxxx...',
  '..xxx....xxxx...',
  '................',
  '................',
  '................',
];

const WOLF_ARMOR: Mask = [
  '................',
  '................',
  '................',
  '....xxxxxxxx....',
  '...xxsxxxxxxx...',
  '..xxxxxxxxxxxx..',
  '..xxdxxdxxdxxx..',
  '..xxxxxxxxxxxx..',
  '..xxdxxdxxdxxx..',
  '..xxxxxxxxxxxx..',
  '..xx........xx..',
  '..xx........xx..',
  '................',
  '................',
  '................',
  '................',
];

const BALL: Mask = [
  '................',
  '................',
  '................',
  '......xxxx......',
  '....xxxxxxxx....',
  '....xsxxxxxx....',
  '...xsxxxxxxxx...',
  '...xxxxxxxdxx...',
  '...xxxxxxxxxx...',
  '...xxxdxxxxxx...',
  '....xxxxxxxx....',
  '....xxxxxdxx....',
  '......xxxx......',
  '................',
  '................',
  '................',
];

const KNIFE: Mask = [
  '................',
  '................',
  '.............xx.',
  '............xsx.',
  '...........xsx..',
  '..........xsx...',
  '.........xsx....',
  '........xxx.....',
  '......ddxx......',
  '.......hd.......',
  '......hh........',
  '.....hh.........',
  '....gg..........',
  '................',
  '................',
  '................',
];

const BOOMERANG: Mask = [
  '................',
  '................',
  '...xx...........',
  '...xsx..........',
  '...xxx..........',
  '...xdx..........',
  '...xxx..........',
  '...xdx..........',
  '...xxxx.........',
  '...xxxxxdxdxx...',
  '....xxxxxxxxsx..',
  '.....xxxxxxxxx..',
  '................',
  '................',
  '................',
  '................',
];

const FLASK: Mask = [
  '................',
  '......hhhh......',
  '.......ww.......',
  '.......ww.......',
  '......wxxw......',
  '.....wxxxxw.....',
  '....wxsxxxxw....',
  '...wxsxxxxxxw...',
  '...wxxxxxxxxw...',
  '...wxxxxxxxxw...',
  '...wxxxxxxxxw...',
  '....wxxxxxxw....',
  '.....wwwwww.....',
  '................',
  '................',
  '................',
];

/**
 * A status effect icon: a round badge with a dark rim, a light upper-left and a deep
 * lower-right edge and a four-pointed sparkle in the middle, transparent outside the circle.
 */
function effectIcon(palette: Palette): Pixel {
  const centre = (EFFECT_ICON_SIZE - 1) / 2;
  return (x, y) => {
    const dx = x - centre;
    const dy = y - centre;
    const squared = dx * dx + dy * dy;
    if (squared > 8.6 * 8.6) return CLEAR;
    if (squared > 7.4 * 7.4) return palette.dark;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if ((ax < 1 && ay < 4) || (ay < 1 && ax < 4) || (ax < 2 && ay < 2)) return palette.shine;
    if (dx + dy < -6) return palette.light;
    if (dx + dy > 6) return palette.deep;
    return palette.mid;
  };
}

// Block family patterns (ADR 0069 D2) ------------------------------------------------------

const LAST = PLACEHOLDER_SIZE - 1;

/** Bark: vertical furrows in the darker shades of the colour, broken now and then. */
function bark(palette: Palette): Pixel {
  return (x, y) => {
    const furrow = hash(x, 0, 21) % 3 === 0;
    const broken = hash(x, Math.floor(y / 3), 22) % 5 === 0;
    if (furrow && !broken) return palette.dark;
    return hash(x, y, 23) % 4 === 0 ? palette.mid : palette.deep;
  };
}

/** A cut log end: square growth rings, with a bark rim when `withBark` is set. */
function logTop(withBark: boolean): (palette: Palette) => Pixel {
  return (palette) => (x, y) => {
    const ring = Math.min(x, y, LAST - x, LAST - y);
    if (ring === 0) return withBark ? palette.dark : palette.deep;
    if (ring === 7) return palette.deep;
    return ring % 2 === 0 ? palette.mid : palette.light;
  };
}

/** A stripped log's side: light wood with a fine vertical grain. */
function strippedLog(palette: Palette): Pixel {
  return (x, y) => {
    if (hash(x, 0, 31) % 4 === 0 && hash(x, Math.floor(y / 4), 32) % 3 !== 0) {
      return palette.mid;
    }
    return hash(x, y, 33) % 7 === 0 ? palette.shine : palette.light;
  };
}

/** Planks: four boards four pixels high with a dark seam and staggered joints. */
function planks(palette: Palette): Pixel {
  return (x, y) => {
    const board = Math.floor(y / 4);
    if (y % 4 === 3) return palette.deep;
    if ((x + board * 5) % 16 === 0) return palette.deep;
    if (y % 4 === 0) return palette.light;
    return hash(x, y, 41) % 6 === 0 ? palette.deep : palette.mid;
  };
}

/** One half of a door: a dark frame and two sunken panels; the bottom half has a handle. */
function door(bottom: boolean): (palette: Palette) => Pixel {
  return (palette) => (x, y) => {
    if (x === 0 || x === LAST || (bottom ? y === LAST : y === 0)) return palette.dark;
    if (bottom && (x === 12 || x === 13) && (y === 1 || y === 2)) return palette.shine;
    const panelY = bottom ? y >= 4 && y <= 12 : y >= 3 && y <= 13;
    const panelX = (x >= 2 && x <= 6) || (x >= 9 && x <= 13);
    if (panelX && panelY) {
      const top = bottom ? 4 : 3;
      if (y === top || x === 2 || x === 9) return palette.deep;
      return palette.mid;
    }
    return palette.light;
  };
}

/** A trapdoor: a dark frame with a cross of bars over light boards. */
function trapdoor(palette: Palette): Pixel {
  return (x, y) => {
    if (x === 0 || y === 0 || x === LAST || y === LAST) return palette.dark;
    if (x === 7 || x === 8 || y === 7 || y === 8) return palette.deep;
    return y % 3 === 0 ? palette.mid : palette.light;
  };
}

/** Leaves: dense, opaque foliage in shades of the colour with dark gaps. */
function leaves(palette: Palette): Pixel {
  return (x, y) => {
    const value = hash(x, y, 51) % 10;
    if (value === 0) return palette.dark;
    if (value < 3) return palette.deep;
    if (value < 8) return palette.mid;
    return palette.light;
  };
}

/** A sapling: a thin wooden stem from the bottom edge with three leafy tufts. */
function sapling(palette: Palette): Pixel {
  const tufts: readonly (readonly [number, number, number])[] = [
    [7.5, 4.5, 3.2],
    [4.5, 8, 2.4],
    [10.5, 8.5, 2.4],
  ];
  return (x, y) => {
    for (const [cx, cy, r] of tufts) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= r * r) {
        if (d2 > (r - 1) * (r - 1)) return palette.deep;
        return x + y < cx + cy ? palette.light : palette.mid;
      }
    }
    if ((x === 7 || x === 8) && y >= 7) return x === 7 ? GRIP : GRIP_DARK;
    return CLEAR;
  };
}

/** Rough stone: speckles of every shade of the colour with a few dark cracks. */
function stone(palette: Palette): Pixel {
  return (x, y) => {
    const value = hash(x, y, 61) % 12;
    if (value === 0) return palette.dark;
    if (value < 4) return palette.deep;
    if (value < 10) return palette.mid;
    return palette.light;
  };
}

/** Polished stone: a smooth face with a light top-left and a deep bottom-right rim. */
function polishedStone(palette: Palette): Pixel {
  return (x, y) => {
    if (x === 0 || y === 0) return palette.light;
    if (x === LAST || y === LAST) return palette.deep;
    return hash(x, y, 71) % 13 === 0 ? palette.light : palette.mid;
  };
}

/** Bricks: four courses with deep mortar lines and joints staggered every other course. */
function bricks(palette: Palette): Pixel {
  return (x, y) => {
    const course = Math.floor(y / 4);
    if (y % 4 === 3) return palette.deep;
    if ((x + (course % 2) * 4) % 8 === 7) return palette.deep;
    if (y % 4 === 0) return palette.light;
    return hash(x, y, 81) % 7 === 0 ? palette.light : palette.mid;
  };
}

/** A pillar's side: dark edges and two light flutes running from top to bottom. */
function pillarSide(palette: Palette): Pixel {
  return (x, y) => {
    if (x === 0 || x === LAST) return palette.deep;
    if (x === 4 || x === 11) return palette.light;
    if (x === 5 || x === 12) return palette.deep;
    return hash(x, y, 91) % 11 === 0 ? palette.light : palette.mid;
  };
}

/** A pillar's end: a deep rim and an inner ring around a smooth centre. */
function pillarTop(palette: Palette): Pixel {
  return (x, y) => {
    const ring = Math.min(x, y, LAST - x, LAST - y);
    if (ring === 0) return palette.deep;
    if (ring === 3) return palette.light;
    if (ring === 4) return palette.deep;
    return palette.mid;
  };
}

// Crop patterns (ADR 0069 D2) ----------------------------------------------------------------

/** The columns the crop stalks stand in, and how far each one is offset in height. */
const CROP_STALKS: readonly (readonly [number, number])[] = [
  [1, 1],
  [4, 0],
  [7, 2],
  [10, 0],
  [13, 1],
];

/** The stalk height of each crop stage, in pixels from the bottom edge. */
const CROP_HEIGHTS: readonly number[] = [3, 6, 10, 13];

/** The green of a vegetable's leafy top and a seed's sheen. */
const LEAF_GREEN: Rgba = [72, 148, 56, 255];
const LEAF_GREEN_DARK: Rgba = [44, 100, 36, 255];

/**
 * Crop stage `stage` (0 to 3): five stalks in the colour, taller each stage, with a leaf every
 * few pixels; the ripe stage 3 carries produce in the accent colour near the top of each stalk.
 */
function cropStage(stage: number): (palette: Palette) => Pixel {
  const height = CROP_HEIGHTS[stage] ?? 3;
  return (palette) => (x, y) => {
    for (const [column, offset] of CROP_STALKS) {
      const top = PLACEHOLDER_SIZE - Math.max(1, height - offset);
      if (stage === 3 && y >= top + 1 && y <= top + 2 && (x === column || x === column + 1)) {
        return y === top + 1 && x === column ? palette.light : palette.accent;
      }
      if (x === column && y >= top) return y === top ? palette.light : palette.mid;
      if (x === column + 1 && y >= top + 2 && (y + column) % 3 === 0) return palette.deep;
      if (x === column - 1 && y >= top + 3 && (y + column) % 3 === 1) return palette.dark;
    }
    return CLEAR;
  };
}

/** Seeds: five small grains with a light top and a dark bottom on a transparent background. */
function seeds(palette: Palette): Pixel {
  const grains: readonly (readonly [number, number])[] = [
    [4, 4],
    [9, 3],
    [6, 8],
    [11, 8],
    [7, 12],
  ];
  return (x, y) => {
    for (const [gx, gy] of grains) {
      if (x >= gx && x <= gx + 1 && y >= gy && y <= gy + 2) {
        if (y === gy) return palette.light;
        if (y === gy + 2) return palette.dark;
        return x === gx ? palette.mid : palette.deep;
      }
    }
    return CLEAR;
  };
}

/** Produce: a round body in shades of the colour under a short green leafy top. */
function produce(palette: Palette): Pixel {
  const cx = 7.5;
  const cy = 9.5;
  const r = 5.5;
  return (x, y) => {
    const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    if (d2 <= r * r) {
      if (d2 > (r - 1) * (r - 1)) return palette.dark;
      if (x + y <= 12 && d2 < 9) return palette.shine;
      return x + y < cx + cy ? palette.light : palette.mid;
    }
    if (y === 3 && x >= 6 && x <= 9) return x === 6 || x === 9 ? LEAF_GREEN_DARK : LEAF_GREEN;
    if (y === 2 && (x === 7 || x === 8)) return LEAF_GREEN;
    if (y === 1 && x === 8) return LEAF_GREEN_DARK;
    return CLEAR;
  };
}

/**
 * The front of a furnace-like block: the `plain` bevel, two dark vents near the top and a dark
 * opening below with a light lip.
 */
function blockFront(palette: Palette): Pixel {
  const base = plain(palette);
  return (x, y) => {
    const inner = x >= 4 && x <= LAST - 4;
    if (inner && (y === 4 || y === 6)) return palette.dark;
    if (inner && y === 9) return palette.light;
    if (inner && y >= 10 && y <= 12) return y === 12 ? palette.deep : palette.dark;
    return base(x, y);
  };
}

/**
 * One cuboid of an entity model as it unwraps onto its texture (vanilla box UV): the texture
 * offset `u`, `v` and the box's width, height and depth in pixels.
 */
type TextureBox = readonly [u: number, v: number, w: number, h: number, d: number];

/**
 * The horse armour boxes, from the vanilla horse model's texture offsets (body, neck, head,
 * muzzle, ears and legs; the tail and mane are not armoured). A preview aid: the game draws
 * the real model.
 */
const HORSE_BOXES: readonly TextureBox[] = [
  [0, 32, 10, 10, 22],
  [0, 35, 4, 12, 7],
  [0, 13, 6, 5, 7],
  [0, 25, 4, 5, 5],
  [19, 16, 2, 3, 1],
  [48, 21, 4, 11, 4],
];

/** The wolf armour boxes, from the vanilla wolf model's texture offsets (body, mane, legs, head). */
const WOLF_BOXES: readonly TextureBox[] = [
  [0, 0, 6, 6, 4],
  [21, 0, 8, 6, 7],
  [18, 14, 6, 9, 6],
  [0, 18, 2, 8, 2],
];

/**
 * A pattern from model boxes: every face of every box is the colour with a dark rim and a
 * light row under its top edge, as the humanoid layers are drawn; outside the faces is clear.
 */
function boxPattern(boxes: readonly TextureBox[]): (palette: Palette) => Pixel {
  const faces: (readonly [number, number, number, number])[] = [];
  for (const [u, v, w, h, d] of boxes) {
    faces.push(
      [u + d, v, w, d],
      [u + d + w, v, w, d],
      [u, v + d, d, h],
      [u + d, v + d, w, h],
      [u + d + w, v + d, d, h],
      [u + 2 * d + w, v + d, w, h],
    );
  }
  return (palette) => (x, y) => {
    let pixel: Rgba = CLEAR;
    for (const [fx, fy, fw, fh] of faces) {
      if (fw === 0 || fh === 0 || x < fx || y < fy || x >= fx + fw || y >= fy + fh) continue;
      if (x === fx || y === fy || x === fx + fw - 1 || y === fy + fh - 1) pixel = palette.dark;
      else if (y === fy + 1) pixel = palette.light;
      else pixel = palette.mid;
    }
    return pixel;
  };
}

/**
 * A pattern from a {@link Mask}. An `x` pixel is light where the pixel above or to the left is
 * transparent, dark where the pixel below or to the right is, and the colour itself inside,
 * so every shape gets a bevel from its base colour (as the `sword` pattern's edges do).
 */
function maskPattern(mask: Mask): (palette: Palette) => Pixel {
  const opaque = (x: number, y: number): boolean => {
    const row = mask[y];
    return row !== undefined && x >= 0 && x < row.length && row[x] !== '.';
  };
  // Worn layers (wider than an item) get a little grain so their faces are not flat.
  const grain = (mask[0]?.length ?? 0) > PLACEHOLDER_SIZE;
  return (palette) => (x, y) => {
    switch (mask[y]?.[x]) {
      case 'x':
        if (!opaque(x + 1, y) || !opaque(x, y + 1)) return palette.dark;
        if (!opaque(x - 1, y) || !opaque(x, y - 1)) return palette.light;
        return grain && hash(x, y, 13) % 7 === 0 ? palette.deep : palette.mid;
      case 'd':
        return palette.dark;
      case 'm':
        return grain && hash(x, y, 13) % 7 === 0 ? palette.deep : palette.mid;
      case 'l':
        return palette.light;
      case 's':
        return palette.shine;
      case 'h':
        return GRIP;
      case 'g':
        return GRIP_DARK;
      case 'w':
        return STRING;
      case 'a':
        return ARROW_HEAD;
      case 'r':
        return ROCKET;
      default:
        return CLEAR;
    }
  };
}

/**
 * Draws a line of `char` from (x0, y0) to (x1, y1) (Bresenham). With `over` false only empty
 * pixels are drawn, so a string passes behind the limbs and the grip.
 */
function drawLine(
  grid: string[][],
  from: readonly [number, number],
  to: readonly [number, number],
  char: string,
  over: boolean,
): void {
  let [x, y] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    const row = grid[y];
    if (row !== undefined && x >= 0 && x < row.length && (over || row[x] === '.')) row[x] = char;
    if (x === x1 && y === y1) return;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/**
 * A pulling or loaded frame derived from a bow or crossbow mask: the string is redrawn from
 * both tips to `nock`, and with `head` an arrow (or a rocket) lies from the nock to the head.
 */
function pulledMask(
  base: Mask,
  tips: readonly [readonly [number, number], readonly [number, number]],
  nock: readonly [number, number],
  head?: { at: readonly [number, number]; char: 'a' | 'r' },
): Mask {
  const grid = gridOf(base.map((row) => row.replaceAll('w', '.')));
  drawLine(grid, tips[0], nock, 'w', false);
  drawLine(grid, tips[1], nock, 'w', false);
  if (head !== undefined) {
    drawLine(grid, nock, head.at, 'g', true);
    const [hx, hy] = head.at;
    for (const [x, y] of [
      [hx, hy],
      [hx - 1, hy],
      [hx, hy + 1],
      ...(head.char === 'r' ? [[hx + 1, hy - 1] as const, [hx - 1, hy + 1] as const] : []),
    ] as const) {
      const row = grid[y];
      if (row !== undefined && x >= 0 && x < row.length) row[x] = head.char;
    }
  }
  return maskOf(grid);
}

/** The bow's string tips; the grip is top left, so a drawn string moves to the bottom right. */
const BOW_TIPS = [
  [12, 2],
  [2, 12],
] as const;
/** The crossbow's string tips; a pulled string moves down its stock to the bottom left. */
const CROSSBOW_TIPS = [
  [6, 2],
  [13, 9],
] as const;

/** Bow pulling frames 0 to 2 (vanilla `bow_pulling_<n>`), each drawn further back. */
const BOW_PULLING: readonly Mask[] = [0, 1, 2].map((n) =>
  pulledMask(BOW, BOW_TIPS, [8 + n, 8 + n], { at: [4 + n, 4 + n], char: 'a' }),
);
/** Crossbow pulling frames 0 to 2, then loaded with an arrow and with a firework rocket. */
const CROSSBOW_PULLING: readonly Mask[] = [0, 1, 2].map((n) =>
  pulledMask(CROSSBOW, CROSSBOW_TIPS, [6 - n, 9 + n]),
);
const CROSSBOW_ARROW: Mask = pulledMask(CROSSBOW, CROSSBOW_TIPS, [4, 11], {
  at: [12, 3],
  char: 'a',
});
const CROSSBOW_FIREWORK: Mask = pulledMask(CROSSBOW, CROSSBOW_TIPS, [4, 11], {
  at: [12, 3],
  char: 'r',
});

const PATTERNS: Readonly<Record<PlaceholderPattern, (palette: Palette) => Pixel>> = {
  plain,
  ore,
  gem,
  disc,
  egg,
  sword,
  pickaxe: maskPattern(PICKAXE),
  axe: maskPattern(AXE),
  shovel: maskPattern(SHOVEL),
  hoe: maskPattern(HOE),
  helmet: maskPattern(HELMET),
  chestplate: maskPattern(CHESTPLATE),
  leggings: maskPattern(LEGGINGS),
  boots: maskPattern(BOOTS),
  ingot: maskPattern(INGOT),
  armor_layer_1: maskPattern(ARMOR_LAYER_1),
  armor_layer_2: maskPattern(ARMOR_LAYER_2),
  bow: maskPattern(BOW),
  bow_pulling_0: maskPattern(BOW_PULLING[0] as Mask),
  bow_pulling_1: maskPattern(BOW_PULLING[1] as Mask),
  bow_pulling_2: maskPattern(BOW_PULLING[2] as Mask),
  crossbow: maskPattern(CROSSBOW),
  crossbow_pulling_0: maskPattern(CROSSBOW_PULLING[0] as Mask),
  crossbow_pulling_1: maskPattern(CROSSBOW_PULLING[1] as Mask),
  crossbow_pulling_2: maskPattern(CROSSBOW_PULLING[2] as Mask),
  crossbow_arrow: maskPattern(CROSSBOW_ARROW),
  crossbow_firework: maskPattern(CROSSBOW_FIREWORK),
  shield: maskPattern(SHIELD),
  spear: maskPattern(SPEAR),
  mace: maskPattern(MACE),
  bottle: maskPattern(BOTTLE),
  totem: maskPattern(TOTEM),
  smithing_template: maskPattern(SMITHING_TEMPLATE),
  horse_armor: maskPattern(HORSE_ARMOR),
  wolf_armor: maskPattern(WOLF_ARMOR),
  horse_armor_layer: boxPattern(HORSE_BOXES),
  wolf_armor_layer: boxPattern(WOLF_BOXES),
  ball: maskPattern(BALL),
  knife: maskPattern(KNIFE),
  boomerang: maskPattern(BOOMERANG),
  flask: maskPattern(FLASK),
  effect_icon: effectIcon,
  bark,
  log_top: logTop(true),
  stripped_log: strippedLog,
  stripped_log_top: logTop(false),
  planks,
  door_top: door(false),
  door_bottom: door(true),
  trapdoor,
  leaves,
  sapling,
  stone,
  polished_stone: polishedStone,
  bricks,
  pillar_side: pillarSide,
  pillar_top: pillarTop,
  crop_stage0: cropStage(0),
  crop_stage1: cropStage(1),
  crop_stage2: cropStage(2),
  crop_stage3: cropStage(3),
  seeds,
  produce,
  block_front: blockFront,
};

/**
 * The RGBA pixels (row-major, 4 bytes each) of a placeholder pattern, of the size
 * {@link placeholderSize} gives.
 *
 * @param pattern - The pattern to draw.
 * @param options - The main colour and, for `egg`, the spot colour.
 */
export function placeholderPixels(
  pattern: PlaceholderPattern,
  options: PlaceholderOptions = {},
): Uint8Array {
  const draw = PATTERNS[pattern];
  if (draw === undefined) throw new Error(`Unknown placeholder pattern ${String(pattern)}.`);
  const pixel = draw(paletteOf(options.colour ?? DEFAULT_COLOUR, options.accent));
  const { width, height } = placeholderSize(pattern);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rgba.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return rgba;
}

/**
 * A byte-stable RGBA PNG of a placeholder pattern, of the size {@link placeholderSize} gives.
 *
 * @param pattern - The pattern to draw.
 * @param options - The main colour.
 */
export function placeholderPng(
  pattern: PlaceholderPattern,
  options: PlaceholderOptions = {},
): Uint8Array {
  const { width, height } = placeholderSize(pattern);
  return encodePng(placeholderPixels(pattern, options), width, height);
}

/**
 * A byte-stable 64x32 PNG of worn armour in one colour (ADR 0043 D2): layer 1 (helmet,
 * chestplate and boots) goes under `textures/entity/equipment/humanoid/`, layer 2 (leggings)
 * under `textures/entity/equipment/humanoid_leggings/`, both named after the equipment asset.
 *
 * @param layer - 1 or 2.
 * @param colour - The armour colour; defaults to {@link DEFAULT_COLOUR}.
 */
export function armorLayerPng(layer: 1 | 2, colour: Rgb = DEFAULT_COLOUR): Uint8Array {
  return placeholderPng(layer === 1 ? 'armor_layer_1' : 'armor_layer_2', { colour });
}

/**
 * A byte-stable PNG of worn body armour in one colour (ADR 0044 D5): `horse` is 64x64 and goes
 * under `textures/entity/equipment/horse_body/`, `wolf` is 64x32 and goes under
 * `textures/entity/equipment/wolf_body/`, both named after the equipment asset's texture.
 *
 * @param animal - `horse` or `wolf`.
 * @param colour - The armour colour; defaults to {@link DEFAULT_COLOUR}.
 */
export function bodyArmorLayerPng(
  animal: 'horse' | 'wolf',
  colour: Rgb = DEFAULT_COLOUR,
): Uint8Array {
  return placeholderPng(animal === 'horse' ? 'horse_armor_layer' : 'wolf_armor_layer', { colour });
}

// Paintings -------------------------------------------------------------------------------

/** Pixels per block of a painting placeholder, as vanilla paintings are drawn. */
export const PAINTING_PIXELS_PER_BLOCK = 16;

/**
 * The RGBA pixels of a painting placeholder `width` by `height` blocks (16 pixels per block):
 * a landscape in shades of the colour, with a pale sky, a sun, two rows of hills and a dark
 * one-pixel border, all from integer maths.
 *
 * @param width - Width in blocks, 1 to 16.
 * @param height - Height in blocks, 1 to 16.
 * @param colour - The main colour; defaults to {@link DEFAULT_COLOUR}.
 * @throws Error If a size is not a whole number from 1 to 16.
 */
export function paintingPixels(
  width: number,
  height: number,
  colour: Rgb = DEFAULT_COLOUR,
): Uint8Array {
  for (const size of [width, height]) {
    if (!Number.isInteger(size) || size < 1 || size > 16) {
      throw new Error(`Painting sizes are whole numbers of blocks from 1 to 16, got ${size}.`);
    }
  }
  const palette = paletteOf(colour);
  const w = width * PAINTING_PIXELS_PER_BLOCK;
  const h = height * PAINTING_PIXELS_PER_BLOCK;
  const sky = shade(colour, 1.85);
  const haze = shade(colour, 1.6);
  const sunX = Math.floor((w * 3) / 4);
  const sunY = Math.floor(h / 4);
  const sunR = Math.max(2, Math.floor(Math.min(w, h) / 8));
  /** A triangle wave of period `period` and amplitude `amplitude`, in whole pixels. */
  const wave = (x: number, period: number, amplitude: number): number => {
    const phase = x % period;
    const half = period / 2;
    return Math.floor((Math.abs(phase - half) * amplitude) / half);
  };
  const farPeriod = Math.max(8, Math.floor(w / 2));
  const nearPeriod = Math.max(8, Math.floor((w * 2) / 3));
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const far = Math.floor(h / 2) + wave(x, farPeriod, Math.max(2, Math.floor(h / 8)));
      const near =
        Math.floor((h * 3) / 4) +
        wave(x + Math.floor(nearPeriod / 3), nearPeriod, Math.max(2, Math.floor(h / 10)));
      let pixel: Rgba;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) pixel = palette.dark;
      else if (y >= near) pixel = y === near ? palette.mid : palette.deep;
      else if (y >= far) pixel = y === far ? palette.light : palette.mid;
      else if ((x - sunX) * (x - sunX) + (y - sunY) * (y - sunY) <= sunR * sunR)
        pixel = palette.shine;
      else pixel = y < Math.floor(h / 3) ? sky : haze;
      rgba.set(pixel, (y * w + x) * 4);
    }
  }
  return rgba;
}

/**
 * A byte-stable PNG of a painting placeholder `width` by `height` blocks, 16 pixels per block
 * (see {@link paintingPixels}).
 *
 * @param width - Width in blocks, 1 to 16.
 * @param height - Height in blocks, 1 to 16.
 * @param colour - The main colour.
 */
export function paintingPng(
  width: number,
  height: number,
  colour: Rgb = DEFAULT_COLOUR,
): Uint8Array {
  return encodePng(
    paintingPixels(width, height, colour),
    width * PAINTING_PIXELS_PER_BLOCK,
    height * PAINTING_PIXELS_PER_BLOCK,
  );
}

// Entity skins ----------------------------------------------------------------------------

/** Edge length of the entity skin placeholder, matching the 64x64 model templates. */
export const PLACEHOLDER_SKIN_SIZE = 64;

/** Side of one checker cell of the skin placeholder, in pixels. */
const SKIN_CELL = 4;

/**
 * The RGBA pixels of a 64x64 entity skin placeholder: a two-tone checker of 4-pixel cells
 * (the colour and a darker shade), fully opaque, so a model preview shows how each cube's
 * faces map onto the texture.
 *
 * @param options - The main colour.
 */
export function placeholderSkinPixels(options: PlaceholderOptions = {}): Uint8Array {
  return checkerPixels(PLACEHOLDER_SKIN_SIZE, PLACEHOLDER_SKIN_SIZE, options);
}

/** The two-tone checker of {@link placeholderSkinPixels} at any size. */
function checkerPixels(width: number, height: number, options: PlaceholderOptions): Uint8Array {
  const palette = paletteOf(options.colour ?? DEFAULT_COLOUR);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const odd = (Math.floor(x / SKIN_CELL) + Math.floor(y / SKIN_CELL)) % 2 === 1;
      rgba.set(odd ? palette.dark : palette.light, (y * width + x) * 4);
    }
  }
  return rgba;
}

/**
 * A byte-stable RGBA PNG of the two-tone skin checker at a given size, for vanilla mob
 * variant textures (ADR 0064 D6): the size must match the vanilla texture the model maps,
 * for example 64 by 32 for a wolf.
 *
 * @param width - Width in pixels.
 * @param height - Height in pixels.
 * @param options - The main colour.
 */
export function mobSkinPng(
  width: number,
  height: number,
  options: PlaceholderOptions = {},
): Uint8Array {
  return encodePng(checkerPixels(width, height, options), width, height);
}

/**
 * A byte-stable 64x64 RGBA PNG of the entity skin placeholder.
 *
 * @param options - The main colour.
 */
export function placeholderSkinPng(options: PlaceholderOptions = {}): Uint8Array {
  return encodePng(placeholderSkinPixels(options), PLACEHOLDER_SKIN_SIZE, PLACEHOLDER_SKIN_SIZE);
}

// Model skins -----------------------------------------------------------------------------

/**
 * One box-UV cube of a model as it unfolds onto its texture (ADR 0073 D1): the texture offset
 * `u`, `v` and the cube's width, height and depth in pixels, plus how it is drawn. `face`
 * draws two eyes on the front (north) face, `side_face` one eye on each side (east and west)
 * near the front, `saddle` draws the box in leather brown whatever the colour; `plain` (the
 * default) draws it in the colour.
 */
export interface SkinBox {
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
  role?: 'plain' | 'face' | 'side_face' | 'saddle';
}

/** Leather brown, the saddle's colour on every model skin. */
export const SADDLE_COLOUR: Rgb = Object.freeze([124, 78, 42]) as Rgb;

const EYE: Rgba = [24, 22, 28, 255];
const EYE_SHINE: Rgba = [236, 236, 240, 255];

/**
 * The RGBA pixels of a model skin drawn from its box-UV cubes (ADR 0073 D1): every face of
 * every box in the colour with a darker rim, the top face lighter and the bottom face darker,
 * eyes on the front face of `face` boxes, and nothing (transparent) outside the faces. Boxes
 * later in the list are drawn over earlier ones.
 *
 * @param boxes - The model's cubes on the texture.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param options - The main colour.
 */
export function boxSkinPixels(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  options: PlaceholderOptions = {},
): Uint8Array {
  const body = paletteOf(options.colour ?? DEFAULT_COLOUR);
  const leather = paletteOf(SADDLE_COLOUR);
  const rgba = new Uint8Array(width * height * 4);
  const fill = (
    x0: number,
    y0: number,
    w: number,
    h: number,
    inner: Rgba,
    rim: Rgba,
    palette: Palette,
  ): void => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
        const speck = !edge && hash(x, y, 7) % 11 === 0;
        rgba.set(edge ? rim : speck ? palette.deep : inner, (y * width + x) * 4);
      }
    }
  };
  for (const box of boxes) {
    const palette = box.role === 'saddle' ? leather : body;
    const { u, v, w, h, d } = box;
    fill(u + d, v, w, d, palette.light, palette.mid, palette);
    fill(u + d + w, v, w, d, palette.deep, palette.dark, palette);
    fill(u, v + d, d, h, palette.mid, palette.deep, palette);
    fill(u + d, v + d, w, h, palette.mid, palette.deep, palette);
    fill(u + d + w, v + d, d, h, palette.mid, palette.deep, palette);
    fill(u + 2 * d + w, v + d, w, h, palette.mid, palette.deep, palette);
    if (box.role === 'face' && w >= 4 && h >= 3) {
      const row = v + d + Math.max(1, Math.floor(h / 3));
      const inset = Math.max(1, Math.floor(w / 4));
      const left = u + d + inset;
      const right = u + d + w - 1 - inset;
      for (const [x, shine] of [
        [left, left + 1],
        [right, right - 1],
      ] as const) {
        if (row < height && x < width) rgba.set(EYE, (row * width + x) * 4);
        if (w >= 8 && row < height && shine < width && shine !== left && shine !== right) {
          rgba.set(EYE_SHINE, (row * width + shine) * 4);
        }
      }
    }
    if (box.role === 'side_face' && d >= 3 && h >= 3) {
      // East is left of the front face and west right of it, so their front columns touch it.
      const row = v + d + Math.max(1, Math.floor(h / 3));
      for (const x of [u + d - 2, u + d + w + 1]) {
        if (row < height && x < width) rgba.set(EYE, (row * width + x) * 4);
      }
    }
  }
  return rgba;
}

/**
 * A byte-stable RGBA PNG of {@link boxSkinPixels}.
 *
 * @param boxes - The model's cubes on the texture.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param options - The main colour.
 */
export function boxSkinPng(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  options: PlaceholderOptions = {},
): Uint8Array {
  return encodePng(boxSkinPixels(boxes, width, height, options), width, height);
}

// PNG encoding ----------------------------------------------------------------------------

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
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
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

const u32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

function chunk(type: string, data: readonly number[]): number[] {
  const body = Uint8Array.from([...Array.from(type, (char) => char.charCodeAt(0)), ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** A zlib stream of stored deflate blocks (each at most 65535 bytes). */
function zlibStored(raw: Uint8Array): number[] {
  const out: number[] = [0x78, 0x01];
  for (let offset = 0; ; offset += 65535) {
    const block = raw.subarray(offset, offset + 65535);
    const last = offset + 65535 >= raw.length ? 1 : 0;
    out.push(last, block.length & 0xff, block.length >>> 8);
    out.push(~block.length & 0xff, (~block.length >>> 8) & 0xff);
    for (const byte of block) out.push(byte);
    if (last === 1) break;
  }
  out.push(...u32(adler32(raw)));
  return out;
}

/**
 * Encodes RGBA pixels as an 8-bit RGBA PNG with stored deflate blocks (no compression), so
 * the output is byte-stable.
 *
 * @param rgba - Row-major pixels, 4 bytes each; length `width * height * 4`.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @throws Error If `rgba` has the wrong length.
 */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}.`);
  }
  const stride = 1 + width * 4;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const ihdr = [...u32(width), ...u32(height), 8, 6, 0, 0, 0]; // 8-bit RGBA
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', []),
  ]);
}
