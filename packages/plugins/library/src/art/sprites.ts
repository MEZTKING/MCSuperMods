/**
 * The silhouettes of the item recipes of the vanilla-style generator (ADR 0092, Proposed),
 * 16 rows of 16 characters each. They are original drawings, not traced from any Minecraft
 * texture. Outlines and most shading are added by the renderer ({@link renderSprite}), so a
 * silhouette mostly says which part a pixel belongs to:
 * - `.` transparent;
 * - `M` the material, shaded automatically;
 * - `0` to `5` the material at a fixed shade of its six-step ramp (0 darkest), `*` its shine;
 * - `H` the wooden handle, `L` a leaf, `C` pastry crust and `S` a stem, shaded automatically.
 *
 * @packageDocumentation
 */

/** A 16 by 16 silhouette. */
export type Silhouette = readonly string[];

export const SWORD: Silhouette = [
  '................',
  '.............MM.',
  '............MM..',
  '...........MM...',
  '..........MM....',
  '.........MM.....',
  '........MM......',
  '...MM..MM.......',
  '....MMMM........',
  '.....MM.........',
  '....HHMM........',
  '...HH..MM.......',
  '..HH............',
  '.MM.............',
  '.M..............',
  '................',
];

export const PICKAXE: Silhouette = [
  '................',
  '..MMMM..........',
  '..MMMMMMM.......',
  '....MMMMMMM.....',
  '.......MMMMM....',
  '.........MMMM...',
  '.........HMMM...',
  '........HH.MMM..',
  '.......HH..MMM..',
  '......HH....MM..',
  '.....HH.....MMM.',
  '....HH......MMM.',
  '...HH........MM.',
  '..HH.........MM.',
  '.HH.............',
  '................',
];

export const AXE: Silhouette = [
  '................',
  '......MMMMM.....',
  '.....MMMMMMMHH..',
  '....MMMMMMMHH...',
  '....MMMMMMHH....',
  '.....MMMMHH.....',
  '......MMHH......',
  '.......HH.......',
  '......HH........',
  '.....HH.........',
  '....HH..........',
  '...HH...........',
  '..HH............',
  '.HH.............',
  '................',
  '................',
];

export const SHOVEL: Silhouette = [
  '................',
  '...........MMMM.',
  '..........MMMMM.',
  '..........MMMMM.',
  '..........MMMMM.',
  '..........MMMM..',
  '.........HH.....',
  '........HH......',
  '.......HH.......',
  '......HH........',
  '.....HH.........',
  '....HH..........',
  '...HH...........',
  '..HH............',
  '.HH.............',
  '................',
];

export const HOE: Silhouette = [
  '................',
  '......MMMMMM....',
  '.....MMMMMMMM...',
  '.....MMMM..HH...',
  '.....MMM..HH....',
  '.....MM..HH.....',
  '........HH......',
  '.......HH.......',
  '......HH........',
  '.....HH.........',
  '....HH..........',
  '...HH...........',
  '..HH............',
  '.HH.............',
  '................',
  '................',
];

export const GEM: Silhouette = [
  '................',
  '................',
  '.....MMMMMM.....',
  '....M*5MMMMM....',
  '...M*55MMMMMM...',
  '..MMMMMMMMMMMM..',
  '..M44MMMMMM22M..',
  '...M4MMMMMM2M...',
  '....MMMMMMMM....',
  '.....MMMMMM.....',
  '......MMMM......',
  '.......MM.......',
  '................',
  '................',
  '................',
  '................',
];

export const INGOT: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......5555555..',
  '.....554444443..',
  '...554444443332.',
  '..333333332221..',
  '..322222222111..',
  '..211111111110..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

export const HELMET: Silhouette = [
  '................',
  '................',
  '................',
  '....MMMMMMMM....',
  '...MMMMMMMMMM...',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..MMM111111MMM..',
  '..MMM......MMM..',
  '..MM........MM..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

export const CHESTPLATE: Silhouette = [
  '................',
  '................',
  '..455......443..',
  '..4MM1....1MM3..',
  '..4MMM5554MMM2..',
  '..4MMMMMMMMMM2..',
  '...0MMMMMMMM0...',
  '....MMMMMMMM....',
  '....MMMMMMMM....',
  '....MMMMMMMM....',
  '....MMMMMMMM....',
  '................',
  '................',
  '................',
  '................',
  '................',
];

export const LEGGINGS: Silhouette = [
  '................',
  '................',
  '...4555555553...',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '...MMMM11MMMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '................',
  '................',
  '................',
  '................',
];

export const BOOTS: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '...MMM....MMM...',
  '..MMMM...MMMM...',
  '.MMMMM..MMMMM...',
  '.MMMMM..MMMMM...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

export const FRUIT: Silhouette = [
  '................',
  '.......S.LL.....',
  '.......SLLL.....',
  '....MMMSMMM.....',
  '...MM*MMMMMMM...',
  '..M**MMMMMMMMM..',
  '..M*MMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '....MMM..MMM....',
  '................',
  '................',
  '................',
];

export const PIE: Silhouette = [
  '................',
  '................',
  '................',
  '.....CCCCCC.....',
  '...CCMMCMMCCC...',
  '..CCMMMCMMMMCC..',
  '..CCCCCCCCCCCC..',
  '..CMMMMCMMMMMC..',
  '..CCMMMCMMMMCC..',
  '...CCCCCCCCCC...',
  '...CCCCCCCCCC...',
  '....CCCCCCCC....',
  '................',
  '................',
  '................',
  '................',
];
