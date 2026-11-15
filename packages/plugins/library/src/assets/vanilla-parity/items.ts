/**
 * Item pictures of the vanilla parity flows (B459): original 16 by 16 silhouettes drawn with
 * the art generator's sprite renderer (outline, light from the top left, hue-shifted ramps; ADR
 * 0092). They are MSM's own drawings, not traced from any Minecraft texture. In a silhouette `.`
 * is clear, `M` the main material and each other letter a part with its own colour.
 *
 * @packageDocumentation
 */

import { generateArtPng } from '../../art/generator';
import type { Silhouette } from '../../art/sprites';
import type { Rgb } from '../png';
import { lighten, mix, spritePng } from './painter';

/** A lantern: handle loop, cap, glass with the light inside, base. */
export const LANTERN_ITEM: Silhouette = [
  '................',
  '......MMMM......',
  '......M..M......',
  '.....MMMMMM.....',
  '....MMMMMMMM....',
  '....MGGGGGGM....',
  '....MGFFFFGM....',
  '....MGFFFFGM....',
  '....MGFFFFGM....',
  '....MGGGGGGM....',
  '....MMMMMMMM....',
  '.....MMMMMM.....',
  '................',
  '................',
  '................',
  '................',
];

/** A chain of four links running from top right to bottom left. */
export const CHAIN_ITEM: Silhouette = [
  '................',
  '..........MMMMM.',
  '..........M...M.',
  '..........M...M.',
  '.......MMMMM..M.',
  '.......M..MMMMM.',
  '.......M...M....',
  '....MMMMM..M....',
  '....M..MMMMM....',
  '....M...M.......',
  '.MMMMM..M.......',
  '.M..MMMMM.......',
  '.M...M..........',
  '.M...M..........',
  '.MMMMM..........',
  '................',
];

/** A candle with its wick (`W`) and, lit, a flame (`F`). */
export const CANDLE_ITEM: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '.......F........',
  '.......W........',
  '......MMM.......',
  '......MMM.......',
  '......MMM.......',
  '......MMM.......',
  '......MMM.......',
  '......MMM.......',
  '......MMM.......',
  '......MMM.......',
  '................',
  '................',
];

/** Three berries (`M`) on a leafy stem (`L`). */
export const BERRIES_ITEM: Silhouette = [
  '................',
  '................',
  '.........LL.....',
  '........LLLL....',
  '.......L..LL....',
  '......L.........',
  '....MMM.L.......',
  '...MMMMM.L......',
  '...MMMMM..MMM...',
  '...MMMMM.MMMMM..',
  '....MMM..MMMMM..',
  '.......MMMMMMM..',
  '......MMMMMMM...',
  '......MMMMM.....',
  '.......MMM......',
  '................',
];

/** A whole cake: icing (`M`) over sponge (`C`), with berries (`B`) on top. */
export const CAKE_ITEM: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '.......BB.......',
  '....MMMMMMMM....',
  '..MMMMBMMMMMMM..',
  '.MMMMMMMMMBMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.CMMCMMMCMMMCMC.',
  '.CCCCCCCCCCCCCC.',
  '.CCCCCCCCCCCCCC.',
  '.BBBBBBBBBBBBBB.',
  '.CCCCCCCCCCCCCC.',
  '..CCCCCCCCCCCC..',
  '................',
];

/** A pie: a crust rim and lattice (`C`) over the filling (`M`). */
export const PIE_ITEM: Silhouette = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....CCCCCCCC....',
  '..CCMCMMCMMCCC..',
  '.CCMMCMMCMMCMCC.',
  '.CCCCCCCCCCCCCC.',
  '.CMMCMMCMMCMMCC.',
  '.CCCCCCCCCCCCCC.',
  '..CCCCCCCCCCCC..',
  '...CCCCCCCCCC...',
  '................',
  '................',
  '................',
];

/** A standing sign: a board (`M`) on a post (`P`). */
export const SIGN_ITEM: Silhouette = [
  '................',
  '................',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.......PP.......',
  '.......PP.......',
  '.......PP.......',
  '.......PP.......',
  '.......PP.......',
  '.......PP.......',
  '................',
];

/** A hanging sign: two chains (`K`) above a board (`M`). */
export const HANGING_SIGN_ITEM: Silhouette = [
  '................',
  '...K......K.....',
  '...K......K.....',
  '...K......K.....',
  '...K......K.....',
  '.MMMMMMMMMMMMM..',
  '.MMMMMMMMMMMMM..',
  '.MMMMMMMMMMMMM..',
  '.MMMMMMMMMMMMM..',
  '.MMMMMMMMMMMMM..',
  '.MMMMMMMMMMMMM..',
  '.MMMMMMMMMMMMM..',
  '................',
  '................',
  '................',
  '................',
];

/** A backpack: the bag (`M`), its flap (`F`), a buckle (`K`) and a strap (`S`). */
export const BACKPACK_ITEM: Silhouette = [
  '................',
  '......SSSS......',
  '.....S....S.....',
  '....MMMMMMMM....',
  '...MFFFFFFFFM...',
  '...MFFFFFFFFM...',
  '...MFFFKKFFFM...',
  '...MMMMKKMMMM...',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '..SMMMMMMMMMMS..',
  '..SMMMMMMMMMMS..',
  '...MMMMMMMMMM...',
  '...MMMMMMMMMM...',
  '....MMMMMMMM....',
  '................',
];

const IRON: Rgb = [150, 154, 164];
const WICK: Rgb = [60, 50, 44];

/** The lantern item in `metal` with a light of `flame`. */
export function lanternItemPng(metal: Rgb, flame: Rgb): Uint8Array {
  return spritePng(
    LANTERN_ITEM,
    metal,
    { G: mix(flame, [255, 255, 255], 0.35), F: lighten(flame, 0.12) },
    'lantern',
  );
}

/** The chain item in `metal`. */
export function chainItemPng(metal: Rgb): Uint8Array {
  return spritePng(CHAIN_ITEM, metal, {}, 'chain');
}

/** The candle item in `wax`, unlit, its wick ready for `flame`. */
export function candleItemPng(wax: Rgb, flame: Rgb): Uint8Array {
  return spritePng(CANDLE_ITEM, wax, { W: WICK, F: flame }, 'candle');
}

/** The berry item: berries of `berry` on a stem of `leaf`. */
export function berriesItemPng(berry: Rgb, leaf: Rgb): Uint8Array {
  return spritePng(BERRIES_ITEM, berry, { L: leaf }, 'berries');
}

/** The cake item (`pie` false) or the pie item (`pie` true). */
export function cakeItemPng(topping: Rgb, filling: Rgb, pie: boolean): Uint8Array {
  return pie
    ? spritePng(PIE_ITEM, filling, { C: [206, 150, 84] }, 'pie')
    : spritePng(CAKE_ITEM, topping, { C: [226, 186, 120], B: filling }, 'cake');
}

/** The sign item in `wood`. */
export function signItemPng(wood: Rgb): Uint8Array {
  return spritePng(SIGN_ITEM, wood, { P: lighten(wood, -0.08) }, 'sign');
}

/** The hanging sign item in `wood`. */
export function hangingSignItemPng(wood: Rgb): Uint8Array {
  return spritePng(HANGING_SIGN_ITEM, wood, { K: IRON }, 'hanging-sign');
}

/** The backpack item in `cloth`, its flap a shade lighter and a strap of `strap`. */
export function backpackItemPng(cloth: Rgb, strap: Rgb = [112, 76, 44]): Uint8Array {
  return spritePng(
    BACKPACK_ITEM,
    cloth,
    { F: lighten(cloth, 0.05), K: [214, 178, 72], S: strap },
    'backpack',
  );
}

/** An ingot of `colour`, the art generator's own ingot. */
export function ingotItemPng(colour: Rgb): Uint8Array {
  return generateArtPng('ingot', { colour, seed: 3 });
}
