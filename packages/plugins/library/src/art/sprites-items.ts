/**
 * More item silhouettes of the vanilla-style generator (ADR 0092 D7, B493), 16 rows of 16
 * characters each, in the notation of `sprites.ts`. They are original drawings made from the
 * words of the brief, not traced from any Minecraft texture. Besides the letters of
 * `sprites.ts` they use:
 * - `A` the second colour (a disc's label, an egg's spots, a rocket), shaded automatically;
 * - `G` glass, `P` the slab of a smithing template, `B` a bolt's wooden shaft, shaded
 *   automatically.
 *
 * The bows and crossbows are drawn in two layers: the silhouette here (with an outline) and the
 * string and arrow shaft, one pixel wide and without an outline, drawn by `recipes/items.ts`
 * from the string ends and nock points in `recipes/items.ts`.
 *
 * @packageDocumentation
 */

import type { Silhouette } from './sprites';

export const DISC: Silhouette = [
  '................',
  '.....MMMMMM.....',
  '...MMMMMMMMMM...',
  '..MM2MMMMMMMMM..',
  '..M2MMMMMMMM2M..',
  '.MM2MMAAAAMM2MM.',
  '.MMMMAAAAAAMMMM.',
  '.MMMMAA..AAMMMM.',
  '.MMMMAA..AAMMMM.',
  '.MMMMAAAAAAMMMM.',
  '.MM2MMAAAAMM2MM.',
  '..M2MMMMMMMM2M..',
  '..MMMMMMMMM2MM..',
  '...MMMMMMMMMM...',
  '.....MMMMMM.....',
  '................',
];

export const SPAWN_EGG: Silhouette = [
  '................',
  '.......MM.......',
  '......MMMM......',
  '.....MMMMAM.....',
  '....M*MMAAMM....',
  '....*MMMMMMM....',
  '...MMMMMMMMAM...',
  '...MAAMMMMAAM...',
  '...MAAMMMMMMM...',
  '...MMMMMMMMMM...',
  '...MMMMAAMMMM...',
  '....MMMAAMMAM...',
  '....MAMMMMMM....',
  '.....MMMMMM.....',
  '......MMMM......',
  '................',
];

export const SPEAR: Silhouette = [
  '................',
  '.............MM.',
  '...........MMMM.',
  '..........M*MMM.',
  '.........M*MMM..',
  '.........MMMM...',
  '........4MM.....',
  '.......HH4......',
  '......HH........',
  '.....HH.........',
  '....HH..........',
  '...HH...........',
  '..HH............',
  '.HH.............',
  '.H..............',
  '................',
];

export const MACE: Silhouette = [
  '................',
  '..........M.....',
  '........MMMMM...',
  '.......M*MMMMM..',
  '......MM*MMMMMM.',
  '.......MMMM5MM..',
  '.......MMMMMMM..',
  '........MMMMM...',
  '.......HHM......',
  '......HH........',
  '.....HH.........',
  '....HH..........',
  '...HH...........',
  '..HH............',
  '.HH.............',
  '................',
];

export const KNIFE: Silhouette = [
  '................',
  '................',
  '............MM..',
  '...........M*M..',
  '..........M*MM..',
  '.........M*MM...',
  '........MMMM....',
  '.....M.MMMM.....',
  '......MMMM......',
  '.....HHMM.......',
  '....HHH.M.......',
  '...HHH..........',
  '..HHH...........',
  '..HH............',
  '................',
  '................',
];

export const BOOMERANG: Silhouette = [
  '................',
  '................',
  '..MMMM..........',
  '.M*MMMMMM.......',
  '.M*MMMMMMMMM....',
  '.MMMM..MMMMMMM..',
  '.MMM......MMMM..',
  '.MMM.......MM...',
  '.MMM............',
  '.MMMM...........',
  '..MMM...........',
  '..MMM...........',
  '...MM...........',
  '................',
  '................',
  '................',
];

export const BALL: Silhouette = [
  '................',
  '................',
  '................',
  '......MMMM......',
  '....MMMMMMMM....',
  '...M**MMMMMMM...',
  '...M*MMMMMMMM...',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '....MMMMMMMM....',
  '......MMMM......',
  '................',
];

/** The bow: two limbs in the colour round a wooden grip; the string is drawn on top. */
export const BOW: Silhouette = [
  '................',
  '................',
  '..........MMMM..',
  '.......MMMM.....',
  '.....HHM........',
  '....HH..........',
  '....H...........',
  '...MM...........',
  '...M............',
  '...M............',
  '..MM............',
  '..M.............',
  '..M.............',
  '..M.............',
  '................',
  '................',
];

/** A point of a silhouette or of a one-pixel layer drawn on top of one. */
export type Point = readonly [number, number];

/** A bow's arrowhead beyond the grip, in fixed light shades of the colour (frames with an arrow). */
export const BOW_ARROWHEAD: readonly (readonly [number, number, string])[] = [
  [1, 1, '4'],
  [2, 1, '4'],
  [1, 2, '4'],
  [2, 2, '4'],
  [3, 2, '3'],
  [2, 3, '3'],
];

/** The ends of a bow's string, at the limb tips. */
export const BOW_STRING_ENDS: readonly [Point, Point] = [
  [13, 2],
  [2, 13],
];

/** The crossbow: a wooden stock and a prod in the colour across its front. */
export const CROSSBOW: Silhouette = [
  '................',
  '......MM........',
  '.......MM.......',
  '........MM..MM..',
  '.........MMMM...',
  '..........MM....',
  '.........HHMM...',
  '........HH..MM..',
  '.......HH....MM.',
  '......HH......M.',
  '.....HH.........',
  '....HH..........',
  '...HH...........',
  '..HH............',
  '.HHH............',
  '................',
];

/** The ends of a crossbow's string, at the prod's tips. */
export const CROSSBOW_STRING_ENDS: readonly [Point, Point] = [
  [6, 1],
  [14, 9],
];

/** A bolt lying on the stock (`B`, wood) with its head beyond the front (`M`). */
export const CROSSBOW_BOLT: readonly (readonly [number, number, string])[] = [
  [7, 7, 'B'],
  [8, 6, 'B'],
  [9, 5, 'B'],
  [11, 3, 'B'],
  [12, 2, 'B'],
  [12, 1, 'M'],
  [13, 1, 'M'],
  [13, 2, 'M'],
];

/** A rocket on the stock (`A`, the second colour) with its cap beyond the front. */
export const CROSSBOW_ROCKET: readonly (readonly [number, number, string])[] = [
  [6, 7, 'A'],
  [7, 7, 'A'],
  [7, 6, 'A'],
  [8, 6, 'A'],
  [8, 5, 'A'],
  [9, 5, 'A'],
  [10, 3, 'A'],
  [11, 3, 'A'],
  [11, 2, 'A'],
  [12, 2, 'A'],
  [12, 1, 'A'],
  [13, 1, 'A'],
];

export const SHIELD: Silhouette = [
  '................',
  '..333333333332..',
  '..3MMMMMMMMMM2..',
  '..3MMMMMMMMMM1..',
  '..3MMMMMMMMMM1..',
  '..3MMMM54MMMM1..',
  '..3MMM5*42MMM1..',
  '..3MMM4421MMM1..',
  '..3MMMM21MMMM1..',
  '..3MMMMMMMMMM1..',
  '..3MMMMMMMMMM1..',
  '...3MMMMMMMM1...',
  '....3MMMMMM1....',
  '.....3MMMM1.....',
  '......3111......',
  '................',
];

export const BOTTLE: Silhouette = [
  '................',
  '.......HH.......',
  '......GHHG......',
  '.......GG.......',
  '.......GG.......',
  '.....GGGGGG.....',
  '....GMMMMMMG....',
  '...GMM*MMMMMG...',
  '...GM*MMMMMMG...',
  '...G*MMMMMMMG...',
  '...GMMMMMMMMG...',
  '...GMMMMMMMMG...',
  '....GMMMMMMG....',
  '.....GGGGGG.....',
  '................',
  '................',
];

export const FLASK: Silhouette = [
  '................',
  '......HHHH......',
  '......GGGG......',
  '.......GG.......',
  '.......GG.......',
  '......GGGG......',
  '......GMMG......',
  '.....GM*MMG.....',
  '.....G*MMMG.....',
  '....GMMMMMMG....',
  '....GMMMMMMG....',
  '...GMMMMMMMMG...',
  '...GMMMMMMMMG...',
  '..GMMMMMMMMMMG..',
  '..GGGGGGGGGGGG..',
  '................',
];

export const TOTEM: Silhouette = [
  '................',
  '.....MMMMMM.....',
  '....M*MMMMMM....',
  '....M1MMMM1M....',
  '....MMMMMMMM....',
  '.....M1111M.....',
  '..MMMMMMMMMMMM..',
  '.MMMMMMMMMMMMMM.',
  '.MM..MMMMMM..MM.',
  '.....MMMMMM.....',
  '.....M2222M.....',
  '.....MMMMMM.....',
  '.....MM..MM.....',
  '.....MM..MM.....',
  '....MMM..MMM....',
  '................',
];

export const SMITHING_TEMPLATE: Silhouette = [
  '................',
  '..PPPPPPPPPPPP..',
  '..PPPPPPPPPPPP..',
  '..PPPPPMMPPPPP..',
  '..PPPPMPPMPPPP..',
  '..PPPMPPPPMPPP..',
  '..PPMPPMMPPMPP..',
  '..PPMPMPPMPMPP..',
  '..PPMPMPPMPMPP..',
  '..PPMPPMMPPMPP..',
  '..PPPMPPPPMPPP..',
  '..PPPPMPPMPPPP..',
  '..PPPPPMMPPPPP..',
  '..PPPPPPPPPPPP..',
  '...PPPPPPPPPP...',
  '................',
];

export const HORSE_ARMOR: Silhouette = [
  '................',
  '................',
  '.MM.............',
  '.MMM.........MM.',
  '.MMMM.......MMM.',
  '.MMMMMMMMMMMMMM.',
  '..MMMMMMMMMMMM..',
  '..MM5MMMMMM5MM..',
  '...MMMMMMMMMM...',
  '....MMMMMMMM....',
  '.....MMMMMM.....',
  '.......H........',
  '......HHH.......',
  '......H.H.......',
  '......HHH.......',
  '................',
];

export const WOLF_ARMOR: Silhouette = [
  '................',
  '................',
  '................',
  '....MMMMMMMM....',
  '..MMMMMMMMMMMM..',
  '.MMM........MMM.',
  '.MM..........MM.',
  '.MMM........MMM.',
  '..MMMMMMMMMMMM..',
  '...MM5MMMM5MM...',
  '....MMMMMMMM....',
  '.....MM..MM.....',
  '.....MM..MM.....',
  '......M..M......',
  '................',
  '................',
];

export const SEEDS: Silhouette = [
  '................',
  '................',
  '................',
  '.....MM.........',
  '....M*M.........',
  '....MM.....MM...',
  '..........M*M...',
  '..........MM....',
  '................',
  '...MM...........',
  '..M*M....MM.....',
  '..MM....M*M.....',
  '........MM......',
  '................',
  '................',
  '................',
];

export const PRODUCE: Silhouette = [
  '................',
  '......L..L......',
  '.....LLLLL......',
  '......LLL.......',
  '.....MMMMMM.....',
  '....M**MMMMM....',
  '...M*MMMMMMMM...',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '....MMMMMMMM....',
  '.....MMMMMM.....',
  '......MMMM......',
  '.......MM.......',
  '.......M........',
  '................',
  '................',
];
