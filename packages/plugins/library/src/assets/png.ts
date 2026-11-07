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
 *   texture under `entity/equipment/wolf_body/`).
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
  | 'wolf_armor_layer';

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
]);

/** Width and height of the armour layer patterns, the vanilla humanoid armour texture size. */
export const ARMOR_LAYER_SIZE = Object.freeze({ width: 64, height: 32 });

/** Width and height of the horse armour layer, the vanilla horse texture size. */
export const HORSE_ARMOR_LAYER_SIZE = Object.freeze({ width: 64, height: 64 });

/** Width and height of the wolf armour layer, the vanilla wolf texture size. */
export const WOLF_ARMOR_LAYER_SIZE = Object.freeze({ width: 64, height: 32 });

/**
 * The size of a pattern's image in pixels: {@link ARMOR_LAYER_SIZE} for the humanoid armour
 * layers, {@link HORSE_ARMOR_LAYER_SIZE} and {@link WOLF_ARMOR_LAYER_SIZE} for the body armour
 * layers, {@link PLACEHOLDER_SIZE} square for every other pattern.
 */
export function placeholderSize(pattern: PlaceholderPattern): { width: number; height: number } {
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
   * A second colour: the spots of the `egg` pattern. Defaults to a darker shade of the main
   * colour (scaled to 71 per cent). Other patterns ignore it.
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
  const palette = paletteOf(options.colour ?? DEFAULT_COLOUR);
  const size = PLACEHOLDER_SKIN_SIZE;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const odd = (Math.floor(x / SKIN_CELL) + Math.floor(y / SKIN_CELL)) % 2 === 1;
      rgba.set(odd ? palette.dark : palette.light, (y * size + x) * 4);
    }
  }
  return rgba;
}

/**
 * A byte-stable 64x64 RGBA PNG of the entity skin placeholder.
 *
 * @param options - The main colour.
 */
export function placeholderSkinPng(options: PlaceholderOptions = {}): Uint8Array {
  return encodePng(placeholderSkinPixels(options), PLACEHOLDER_SKIN_SIZE, PLACEHOLDER_SKIN_SIZE);
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
