/**
 * Item recipes of the vanilla-style generator (ADR 0092 D7, D8): 16 by 16 silhouettes
 * (`sprites.ts`) on a transparent background with a dark one-pixel outline, drawn by
 * {@link drawSprite}. The rows without a drawing are stubs that still draw their placeholder
 * pattern; B493 draws them.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../../assets/png';
import { drawSprite, type SpriteRamps } from '../canvas';
import type { ArtImage } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import { CRUST, handleRamp, LEAF_GREEN, materialRamp } from '../materials';
import { hashSeed } from '../noise';
import { generateRamp } from '../ramp';
import {
  AXE,
  BOOTS,
  CHESTPLATE,
  FRUIT,
  GEM,
  HELMET,
  HOE,
  INGOT,
  LEGGINGS,
  PICKAXE,
  PIE,
  SHOVEL,
  type Silhouette,
  SWORD,
} from '../sprites';

/**
 * The ramps of an item: the material and its shine from the main colour, `H` the shared handle
 * wood, `L` a leaf in the second colour ({@link LEAF_GREEN} by default) and a fruit's stem
 * `S` in the same green (a brown stem would take the fruit past ten colours), `C` pastry crust.
 */
function itemRamps(context: DrawContext): SpriteRamps {
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  // A leaf takes three shades of a six-shade ramp, so a leaf and a fruit of one green lean
  // the same way.
  const leafRamp = generateRamp(context.accent ?? LEAF_GREEN, {
    count: 6,
    anchor: 3,
    hueShift: context.hueShift,
  });
  const leaf = [0, 2, 4].map((i) => leafRamp[i] as Rgb);
  return {
    material,
    shine,
    parts: {
      H: handleRamp(context.hueShift),
      S: leaf,
      L: leaf,
      C: generateRamp(CRUST, { count: 4, anchor: 2, hueShift: context.hueShift }),
    },
  };
}

/** A drawing function for a silhouette. */
const sprite =
  (id: string, rows: Silhouette) =>
  (context: DrawContext): ArtImage =>
    drawSprite(rows, itemRamps(context), {
      seed: hashSeed(id, context.seed),
      noise: context.noise,
    });

type ItemRow = Parameters<typeof recipeEntry>[0];

const item = (
  id: ItemRow['id'],
  label: string,
  fallback: ItemRow['fallback'],
  more: Partial<ItemRow> = {},
): ItemRow => ({ id, label, kind: 'item', fallback, ...more });

/** The item recipes, in table order. */
export const ITEM_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(item('gem', 'Gem', 'gem'), sprite('gem', GEM)),
  recipeEntry(item('ingot', 'Ingot', 'ingot'), sprite('ingot', INGOT)),
  recipeEntry(item('disc', 'Music disc', 'disc', { colours: 2 })),
  recipeEntry(item('spawn_egg', 'Spawn egg', 'egg', { colours: 2 })),
  recipeEntry(item('sword', 'Sword', 'sword'), sprite('sword', SWORD)),
  recipeEntry(item('pickaxe', 'Pickaxe', 'pickaxe'), sprite('pickaxe', PICKAXE)),
  recipeEntry(item('axe', 'Axe', 'axe'), sprite('axe', AXE)),
  recipeEntry(item('shovel', 'Shovel', 'shovel'), sprite('shovel', SHOVEL)),
  recipeEntry(item('hoe', 'Hoe', 'hoe'), sprite('hoe', HOE)),
  recipeEntry(item('spear', 'Spear', 'spear')),
  recipeEntry(item('mace', 'Mace', 'mace')),
  recipeEntry(item('knife', 'Throwing knife', 'knife')),
  recipeEntry(item('boomerang', 'Boomerang', 'boomerang')),
  recipeEntry(item('ball', 'Ball', 'ball')),
  recipeEntry(item('bow', 'Bow', 'bow')),
  recipeEntry(item('bow_pulling_0', 'Bow, pulled a little', 'bow_pulling_0')),
  recipeEntry(item('bow_pulling_1', 'Bow, pulled further', 'bow_pulling_1')),
  recipeEntry(item('bow_pulling_2', 'Bow, pulled all the way', 'bow_pulling_2')),
  recipeEntry(item('crossbow', 'Crossbow', 'crossbow')),
  recipeEntry(item('crossbow_pulling_0', 'Crossbow, pulled a little', 'crossbow_pulling_0')),
  recipeEntry(item('crossbow_pulling_1', 'Crossbow, pulled further', 'crossbow_pulling_1')),
  recipeEntry(item('crossbow_pulling_2', 'Crossbow, pulled all the way', 'crossbow_pulling_2')),
  recipeEntry(item('crossbow_arrow', 'Crossbow with a bolt', 'crossbow_arrow')),
  recipeEntry(
    item('crossbow_firework', 'Crossbow with a rocket', 'crossbow_firework', { colours: 2 }),
  ),
  recipeEntry(item('shield', 'Shield', 'shield')),
  recipeEntry(item('bottle', 'Bottle', 'bottle')),
  recipeEntry(item('flask', 'Flask', 'flask')),
  recipeEntry(item('totem', 'Totem', 'totem')),
  recipeEntry(item('smithing_template', 'Smithing template', 'smithing_template')),
  recipeEntry(item('horse_armor', 'Horse armour', 'horse_armor')),
  recipeEntry(item('wolf_armor', 'Wolf armour', 'wolf_armor')),
  recipeEntry(item('helmet', 'Helmet', 'helmet'), sprite('helmet', HELMET)),
  recipeEntry(item('chestplate', 'Chestplate', 'chestplate'), sprite('chestplate', CHESTPLATE)),
  recipeEntry(item('leggings', 'Leggings', 'leggings'), sprite('leggings', LEGGINGS)),
  recipeEntry(item('boots', 'Boots', 'boots'), sprite('boots', BOOTS)),
  recipeEntry(item('fruit', 'Fruit', 'produce', { colours: 2 }), sprite('fruit', FRUIT)),
  recipeEntry(item('pie', 'Pie', 'produce'), sprite('pie', PIE)),
  recipeEntry(item('seeds', 'Seeds', 'seeds')),
  recipeEntry(item('produce', 'Vegetable', 'produce')),
]);
