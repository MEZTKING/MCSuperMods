/**
 * Pure helpers of the Block Studio's Type picker and Textures section (B268, ADR 0067 D7,
 * ADR 0069 D5): the types in words, which fields belong to which type, changing type in one
 * edit, texture and model slots in words, and the models lowering generates for the slots. No
 * React, no session.
 *
 * The slot names and the generated models come from `@msm/plugin-blocks-items` (the
 * lowering's own tables), so the Studio never restates them.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { ContentBundle, ResourceLocation } from '@msm/plugin-api';
import {
  BLOCK_TYPE_LOWERINGS,
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPES,
  type BlockTypeName,
  blockGeneratedBlockIds,
  blockItemIdOf,
  blockStateFlag,
  blockTypeModels,
  ITEM_MODEL_SLOT,
  PORTAL_COMPONENTS,
  SHAPED_BLOCK_TYPES,
  SHAPED_ONLY_COMPONENTS,
  STATE_MODEL_SLOTS,
  signGuiPicture,
  signGuiTextureId,
  VANILLA_PARITY_TYPES,
  WATERLOGGABLE_BLOCK_TYPES,
  WATERLOGGABLE_COMPONENT,
  WAXABLE_COMPONENT,
  WEATHERING_BLOCK_TYPES,
  WEATHERING_COMPONENT,
} from '@msm/plugin-blocks-items';
import { textureAsset } from '../../components/ai-pictures/texture-write';
import { isJsonObject } from '../../forms/pointer';
import { bundlePreviewProject } from '../../preview/bundle-source';
import { asObject, MODEL_KIND } from './blocks-items-model';

type JsonObject = { [key: string]: Json };

export type { BlockTypeName };

/** The plant types (ADR 0068 D1); their own fields come with the plant sections (B272). */
export const PLANT_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'crop',
  'sapling',
  'leaves',
]);

/**
 * The plant types of ADR 0094 D1 (ADR 0101 D1's group "Plants"); their own fields are in
 * `PlantSection` (B452).
 */
export const NEW_PLANT_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'berry_bush',
  'tall_plant',
  'potted_plant',
  'vine',
  'sea_pickle',
  'stem',
  'cocoa',
  'layers',
]);

/**
 * The furniture and light types of ADR 0094 D1 (ADR 0101 D1's group "Furniture and lights");
 * their own fields are in the Type section (cake's in `PlantSection`, with the food).
 */
export const FURNITURE_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'bed',
  'cake',
  'ladder',
  'torch',
  'lantern',
  'chain',
  'candle',
  'rod',
  'carpet',
  'scaffolding',
  'sign',
  'hanging_sign',
]);

/** The twenty types of ADR 0094 D1 (B452 offers them in the Type picker's groups). */
export const NEW_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  ...NEW_PLANT_BLOCK_TYPES,
  ...FURNITURE_BLOCK_TYPES,
]);

/**
 * The growing and climbing plants and the flower pot of ADR 0103 (ADR 0112 D1's batch 1, B516),
 * in the Type picker's group "Plants"; their own fields are in `PlantSection`.
 */
export const GROWING_PLANT_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'growing_plant',
  'column_plant',
  'multiface',
  'dripleaf',
  'flower_pot',
]);

/**
 * The building types the Type picker offers (ADR 0067 D1), in the format's order, with
 * `portal` (ADR 0077 D1; its fields in the Portal section, ADR 0078 D1) last.
 */
export const BUILDING_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze(
  BLOCK_TYPES.filter(
    (type) =>
      !(PLANT_BLOCK_TYPES as readonly string[]).includes(type) &&
      !(NEW_BLOCK_TYPES as readonly string[]).includes(type) &&
      !(GROWING_PLANT_BLOCK_TYPES as readonly string[]).includes(type),
  ),
);

/** One group of the Type picker (ADR 0101 D1). */
export interface BlockTypeGroup {
  id: 'building' | 'plants' | 'furniture';
  label: string;
  types: readonly BlockTypeName[];
}

/**
 * The Type picker's groups (ADR 0101 D1): the building types, then the plants (crop, sapling
 * and leaves first, the growing plants and the flower pot of ADR 0103 last) and the furniture
 * and lights. Every type is in exactly one group.
 */
export const BLOCK_TYPE_GROUPS: readonly BlockTypeGroup[] = Object.freeze([
  { id: 'building', label: 'Building blocks', types: BUILDING_BLOCK_TYPES },
  {
    id: 'plants',
    label: 'Plants',
    types: [...PLANT_BLOCK_TYPES, ...NEW_PLANT_BLOCK_TYPES, ...GROWING_PLANT_BLOCK_TYPES],
  },
  { id: 'furniture', label: 'Furniture and lights', types: FURNITURE_BLOCK_TYPES },
]);

/** Each type in words, as the Type picker shows it. */
export const BLOCK_TYPE_LABELS: Readonly<Record<BlockTypeName, string>> = Object.freeze({
  block: 'Simple block',
  pillar: 'Log or pillar (turns to the clicked face)',
  horizontal: 'Faces the player (four ways, like a furnace)',
  directional: 'Faces any way (six ways, like an observer)',
  slab: 'Slab',
  stairs: 'Stairs',
  wall: 'Wall',
  fence: 'Fence',
  fence_gate: 'Fence gate',
  door: 'Door',
  trapdoor: 'Trapdoor',
  button: 'Button',
  pressure_plate: 'Pressure plate',
  pane: 'Pane or bars',
  crop: 'Crop',
  sapling: 'Sapling',
  leaves: 'Leaves',
  portal: 'Portal',
  cake: 'Cake (eaten a slice at a time)',
  berry_bush: 'Berry bush (picked for its berries)',
  tall_plant: 'Tall plant (two blocks high)',
  potted_plant: 'Potted plant (a plant in a flower pot)',
  vine: 'Vine (climbs walls and spreads)',
  sea_pickle: 'Sea pickle (one to four, glows in water)',
  carpet: 'Carpet',
  layers: 'Layers (one to eight, like snow)',
  cocoa: 'Pod on a log (like cocoa)',
  candle: 'Candle (one to four, lit with flint and steel)',
  bed: 'Bed',
  ladder: 'Ladder',
  torch: 'Torch (stands or goes on a wall)',
  lantern: 'Lantern (stands or hangs)',
  chain: 'Chain',
  rod: 'Rod (like an end rod)',
  sign: 'Sign',
  hanging_sign: 'Hanging sign',
  stem: 'Stem (grows a fruit, like melons)',
  scaffolding: 'Scaffolding',
  // ADR 0103 (B516): the words before the bracket are the plan's Very easy wording.
  growing_plant: 'Grows in long strands (like kelp, weeping vines and cave vines)',
  column_plant: 'Grows tall like sugar cane (cane, cactus or bamboo)',
  multiface: 'Spreads over any side (like glow lichen)',
  dripleaf: 'Tips when you stand on it (like dripleaf)',
  flower_pot: 'A flower pot (takes the plants you list)',
});

/** A column plant's shapes in words (ADR 0103 D1, `style`). */
export const COLUMN_PLANT_STYLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  cane: 'Cane (like sugar cane, next to water)',
  cactus: 'Cactus (spiny, hurts when touched)',
  bamboo: 'Bamboo (leafy, grows from a shoot)',
});

/** A dripleaf's sizes in words (ADR 0103 D1, `size`). */
export const DRIPLEAF_SIZE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  big: 'Big leaf (tips when you stand on it)',
  small: 'Small leaf (grows into a big one with bone meal)',
});

/** The bed rules in words (ADR 0094 D2; the names are the target's `blocks.bedRules` keys). */
export const BED_RULE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  bed: 'Like a bed (sleep, set your spawn; explodes in the Nether and the End)',
  straw_bed: 'Like a sleeping bag (the straw bed rule)',
});

/** The dye colours in words (the target's `blocks.dyeColours`). */
export function dyeColourLabel(colour: string): string {
  const words = colour.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What bone meal does to a tall plant, in words. */
export const TALL_PLANT_BONEMEAL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  drop_copy: 'Drops a copy (like tall flowers)',
  none: 'Nothing (like tall grass)',
});

/** The vanilla set types in words (ADR 0067 D2); unknown names show as written. */
export const SET_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  wood: 'Wood (oak sounds)',
  cherry: 'Cherry wood',
  bamboo: 'Bamboo',
  crimson: 'Crimson',
  warped: 'Warped',
  iron: 'Iron (not opened by hand)',
  copper: 'Copper',
  gold: 'Gold',
  stone: 'Stone',
  polished_blackstone: 'Polished blackstone',
});

/** The vanilla wood types in words (a fence gate's sounds). */
export const WOOD_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  oak: 'Oak',
  spruce: 'Spruce',
  birch: 'Birch',
  acacia: 'Acacia',
  cherry: 'Cherry',
  jungle: 'Jungle',
  dark_oak: 'Dark oak',
  pale_oak: 'Pale oak',
  poplar: 'Poplar',
  crimson: 'Crimson',
  warped: 'Warped',
  mangrove: 'Mangrove',
  bamboo: 'Bamboo',
});

/** The definition fields of each type (the format's `msm:block_type` dispatch, ADR 0067 D2). */
const TYPE_FIELDS: Readonly<Partial<Record<BlockTypeName, readonly string[]>>> = Object.freeze({
  stairs: ['base_block'],
  fence_gate: ['wood_type'],
  door: ['set_type'],
  trapdoor: ['set_type'],
  button: ['set_type', 'press_ticks'],
  pressure_plate: ['set_type', 'weighted_max'],
  crop: ['max_age', 'stage_heights', 'soil', 'bonemeal_growth'],
  sapling: ['tree', 'mega_tree', 'flower_tree', 'soil'],
  leaves: ['tint', 'particle_chance', 'falling_particle'],
  portal: [
    'frame',
    'frame_block',
    'igniter',
    'destination',
    'return_to',
    'travel',
    'sounds',
    'particles',
    'on_travel',
  ],
  bed: ['rule', 'colour'],
  cake: ['food', 'on_eat'],
  berry_bush: ['berry', 'harvest', 'hurts'],
  tall_plant: ['bonemeal'],
  torch: ['particle'],
  sign: ['wood_type'],
  hanging_sign: ['wood_type'],
  potted_plant: ['plant', 'pot'],
  stem: ['fruit', 'soil', 'fruit_soil'],
  vine: ['spreads'],
  cocoa: ['support'],
  growing_plant: [
    'direction',
    'max_age',
    'growth_chance',
    'bonemeal_growth',
    'needs_water',
    'berries',
    'climbable',
    'soil',
  ],
  column_plant: ['style', 'max_height', 'min_height', 'soil', 'needs_water_nearby', 'touch_damage'],
  multiface: ['light', 'spreads', 'waterloggable'],
  dripleaf: ['size', 'grows_into', 'tilt_ticks'],
  flower_pot: ['plants'],
});

/**
 * The defaults of the new types' required fields when a block becomes one (B452): a fruit and a
 * potted plant Minecraft has (melon; short grass, which vanilla does not pot). A berry bush's
 * `berry` is the block's own item ({@link withBlockType}).
 */
export const NEW_TYPE_DEFAULTS: Readonly<{ fruit: string; plant: string; berry: string }> =
  Object.freeze({
    fruit: 'minecraft:melon',
    plant: 'minecraft:short_grass',
    berry: 'minecraft:sweet_berries',
  });

/**
 * The required fields of the ADR 0103 types when a block becomes one (B516): a cane-like column,
 * a big dripleaf (a small one needs a big one to grow into) and a pot that takes a poppy.
 */
export const GROWING_TYPE_DEFAULTS: Readonly<{
  style: string;
  size: string;
  plants: readonly string[];
}> = Object.freeze({ style: 'cane', size: 'big', plants: Object.freeze(['minecraft:poppy']) });

/**
 * The required fields a block gets when it becomes a portal (ADR 0069 D5's rule): a frame no
 * vanilla portal uses (so the Nether portal keeps lighting as before) and the Nether, as the
 * "Portal to the Nether" template.
 */
export const PORTAL_TYPE_DEFAULTS: Readonly<{ frame: string; destination: string }> = Object.freeze(
  { frame: 'minecraft:crying_obsidian', destination: 'minecraft:the_nether' },
);

/** The editor-only fields of each type besides `textures` and `models` (ADR 0067 D7). */
const TYPE_ELEMENT_FIELDS: Readonly<Partial<Record<BlockTypeName, readonly string[]>>> =
  Object.freeze({
    fence: ['wooden'],
    crop: ['crop_drops', 'villager_plantable'],
    leaves: ['leaves_drops'],
  });

/** The loot presets that belong to one type. */
const TYPE_LOOT_PRESETS: Readonly<Partial<Record<BlockTypeName, string>>> = Object.freeze({
  crop: 'crop',
  leaves: 'leaves',
});

/** Every field that belongs to `type` alone (not shared by all blocks). */
export function typeOwnFields(type: BlockTypeName): string[] {
  const appearance = type === 'block' ? [] : ['textures', 'models'];
  return [...(TYPE_FIELDS[type] ?? []), ...appearance, ...(TYPE_ELEMENT_FIELDS[type] ?? [])];
}

/** Whether `value` is a block type. */
export function isBlockType(value: unknown): value is BlockTypeName {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * The block type of `msm:block` data: `block` when `type` is absent, `undefined` when `type`
 * is not a type (the schema reports it).
 */
export function blockTypeOfData(data: Json | undefined): BlockTypeName | undefined {
  const type = asObject(data).type;
  if (type === undefined) return 'block';
  return isBlockType(type) ? type : undefined;
}

/** Whether `type` takes `msm:shape` and `msm:redstone` (ADR 0067 D3). */
export function isShapedType(type: BlockTypeName): boolean {
  return SHAPED_BLOCK_TYPES.includes(type);
}

/** Whether the element's single `model` field is the appearance of `type`. */
export function acceptsSingleModel(type: BlockTypeName): boolean {
  return type === 'block' || BLOCK_TYPE_LOWERINGS[type].acceptsModel === true;
}

/** One texture slot of a type's `textures`, in words. */
export interface TextureSlot {
  key: string;
  label: string;
}

const ALL_SLOT: TextureSlot = { key: 'all', label: 'Every face' };
/** The one picture of the single-picture types (B443: `{all, texture}`). */
const PICTURE_SLOT: TextureSlot = { key: 'all', label: 'Picture' };
const ITEM_SLOT = (fallback: string): TextureSlot => ({
  key: 'item',
  label: `Item picture (empty: ${fallback})`,
});

/** The types whose `textures` is a `stages` list, one picture per age (ADR 0068, ADR 0094 D10). */
export const STAGE_TEXTURE_TYPES: readonly BlockTypeName[] = Object.freeze([
  'crop',
  'berry_bush',
  'cocoa',
]);

/** The most stage pictures a `berry_bush` (four ages) or `cocoa` (three) takes. */
export const STAGE_TEXTURE_COUNTS: Readonly<Partial<Record<BlockTypeName, number>>> = Object.freeze(
  { berry_bush: 4, cocoa: 3 },
);

/**
 * The texture keys of each type's `textures` (the format's per-type texture structs), `all`
 * first. A crop's textures are the `stages` list instead (no slots here); `block` has none.
 */
export const TEXTURE_SLOTS: Readonly<Record<BlockTypeName, readonly TextureSlot[]>> = Object.freeze(
  {
    block: [],
    pillar: [
      ALL_SLOT,
      { key: 'side', label: 'Sides (bark)' },
      { key: 'end', label: 'Ends (top and bottom)' },
    ],
    horizontal: [
      ALL_SLOT,
      { key: 'front', label: 'Front' },
      { key: 'side', label: 'Sides and back' },
      { key: 'top', label: 'Top and bottom' },
    ],
    directional: [
      ALL_SLOT,
      { key: 'front', label: 'Front' },
      { key: 'side', label: 'Sides and back' },
      { key: 'top', label: 'Top and bottom' },
    ],
    slab: [
      ALL_SLOT,
      { key: 'top', label: 'Top' },
      { key: 'bottom', label: 'Bottom' },
      { key: 'side', label: 'Sides' },
    ],
    stairs: [
      ALL_SLOT,
      { key: 'top', label: 'Top' },
      { key: 'bottom', label: 'Bottom' },
      { key: 'side', label: 'Sides' },
    ],
    wall: [ALL_SLOT, { key: 'texture', label: 'Wall' }],
    fence: [ALL_SLOT, { key: 'texture', label: 'Fence' }],
    fence_gate: [ALL_SLOT, { key: 'texture', label: 'Gate' }],
    door: [
      ALL_SLOT,
      { key: 'top', label: 'Top half' },
      { key: 'bottom', label: 'Bottom half (also the item)' },
    ],
    trapdoor: [ALL_SLOT, { key: 'texture', label: 'Trapdoor' }],
    button: [ALL_SLOT, { key: 'texture', label: 'Button' }],
    pressure_plate: [ALL_SLOT, { key: 'texture', label: 'Plate' }],
    pane: [
      ALL_SLOT,
      { key: 'pane', label: 'Face of the pane' },
      { key: 'edge', label: 'Thin edge' },
    ],
    crop: [],
    sapling: [{ key: 'sapling', label: 'Sapling (also the item)' }],
    leaves: [{ key: 'all', label: 'Leaves (every face)' }],
    portal: [{ key: 'portal', label: 'Portal surface' }],
    cake: [
      { key: 'top', label: 'Top' },
      { key: 'bottom', label: 'Bottom' },
      { key: 'side', label: 'Sides' },
      { key: 'inside', label: 'Cut face (inside)' },
      ITEM_SLOT('the cake'),
    ],
    berry_bush: [],
    tall_plant: [
      { key: 'top', label: 'Upper half (also the item)' },
      { key: 'bottom', label: 'Lower half' },
    ],
    potted_plant: [{ key: 'plant', label: "Plant in the pot (empty: the plant's own picture)" }],
    vine: [PICTURE_SLOT],
    sea_pickle: [PICTURE_SLOT],
    carpet: [PICTURE_SLOT],
    layers: [PICTURE_SLOT],
    cocoa: [],
    candle: [
      { key: 'candle', label: 'Candle' },
      { key: 'lit', label: 'Lit candle (empty: the candle)' },
      ITEM_SLOT('the candle'),
    ],
    bed: [
      { key: 'bed', label: "Bed picture (in vanilla's bed layout)" },
      ITEM_SLOT("the bed's own shape"),
    ],
    ladder: [PICTURE_SLOT],
    torch: [PICTURE_SLOT],
    lantern: [PICTURE_SLOT, ITEM_SLOT('the picture')],
    chain: [PICTURE_SLOT, ITEM_SLOT('the picture')],
    rod: [PICTURE_SLOT],
    sign: [
      { key: 'all', label: 'Board and post' },
      { key: 'sign', label: 'Writing screen picture (24 by 26; empty: the board)' },
      ITEM_SLOT('the board'),
    ],
    hanging_sign: [
      { key: 'all', label: 'Board and chains' },
      { key: 'hanging_gui', label: 'Writing screen picture (16 by 16; empty: the board)' },
      ITEM_SLOT('the board'),
    ],
    stem: [
      { key: 'stem', label: 'Growing stem' },
      { key: 'attached', label: 'Stem bent onto its fruit' },
    ],
    scaffolding: [
      { key: 'top', label: 'Top' },
      { key: 'side', label: 'Sides' },
      { key: 'bottom', label: 'Bottom (also the sides when not standing)' },
    ],
    // ADR 0103 (B516); a column plant's and a dripleaf's slots follow the shape
    // (`textureSlotsOf`), these are a cane's and a big leaf's.
    growing_plant: [
      { key: 'head', label: 'Tip (also the item)' },
      { key: 'body', label: 'Strand behind the tip (empty: the tip)' },
    ],
    column_plant: [{ key: 'all', label: 'Stalk (also the item)' }],
    multiface: [PICTURE_SLOT],
    dripleaf: [
      { key: 'top', label: 'Leaf from above (also the item)' },
      { key: 'side', label: 'Edge of the leaf' },
      { key: 'tip', label: 'Tip of the leaf when tilted' },
      { key: 'stem', label: 'Stem' },
    ],
    flower_pot: [
      { key: 'pot', label: "Pot picture (empty: vanilla's pot)" },
      { key: 'dirt', label: 'Earth in the pot (empty: dirt)' },
      ITEM_SLOT('the pot picture'),
    ],
  },
);

/** The texture slots of each column plant shape (`style`, ADR 0103 D1). */
const COLUMN_PLANT_TEXTURE_SLOTS: Readonly<Record<string, readonly TextureSlot[]>> = Object.freeze({
  cane: [{ key: 'all', label: 'Stalk (also the item)' }],
  cactus: [
    { key: 'side', label: 'Sides (also the item)' },
    { key: 'top', label: 'Top' },
    { key: 'bottom', label: 'Bottom (empty: the top)' },
  ],
  bamboo: [
    { key: 'stalk', label: 'Stalk (also the item)' },
    { key: 'leaves_small', label: 'Small leaves' },
    { key: 'leaves_large', label: 'Large leaves' },
    { key: 'shoot', label: 'Shoot (empty: the stalk)' },
  ],
});

/** The texture slots of a small dripleaf (`size: "small"`). */
const SMALL_DRIPLEAF_TEXTURE_SLOTS: readonly TextureSlot[] = Object.freeze([
  { key: 'top', label: 'Leaf from above (also the item)' },
  { key: 'side', label: 'Edge of the leaf' },
  { key: 'stem_top', label: 'Upper stem' },
  { key: 'stem_bottom', label: 'Lower stem (empty: the upper stem)' },
]);

/** The texture slots a growing plant with berries adds. */
const BERRY_TEXTURE_SLOTS: readonly TextureSlot[] = Object.freeze([
  { key: 'head_berries', label: 'Tip with berries (empty: the tip)' },
  { key: 'body_berries', label: 'Strand with berries (empty: the tip with berries)' },
]);

/** The type's own texture slots for its data: a column plant's by shape, and so on. */
function ownTextureSlots(type: BlockTypeName, data: Json | undefined): readonly TextureSlot[] {
  const object = asObject(data);
  if (type === 'column_plant') {
    const style = typeof object.style === 'string' ? object.style : 'cane';
    return COLUMN_PLANT_TEXTURE_SLOTS[style] ?? TEXTURE_SLOTS.column_plant;
  }
  if (type === 'dripleaf' && object.size === 'small') return SMALL_DRIPLEAF_TEXTURE_SLOTS;
  if (type === 'growing_plant' && isJsonObject(object.berries)) {
    return [...TEXTURE_SLOTS.growing_plant, ...BERRY_TEXTURE_SLOTS];
  }
  return TEXTURE_SLOTS[type];
}

/** Model slots in words (the keys of `BLOCK_TYPE_MODEL_SLOTS`). */
const MODEL_SLOT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  default: 'Block',
  horizontal: 'Lying on its side',
  vertical: 'Facing up or down',
  bottom: 'Bottom',
  top: 'Top',
  double: 'Double slab',
  straight: 'Straight',
  inner: 'Inner corner',
  outer: 'Outer corner',
  post: 'Post',
  side: 'Side',
  side_alt: 'Side (other way)',
  side_tall: 'Tall side',
  noside: 'No side',
  noside_alt: 'No side (other way)',
  inventory: 'In the inventory',
  closed: 'Closed',
  open: 'Open',
  wall: 'In a wall',
  wall_open: 'Open in a wall',
  bottom_left: 'Lower half, hinge left',
  bottom_left_open: 'Lower half, hinge left, open',
  bottom_right: 'Lower half, hinge right',
  bottom_right_open: 'Lower half, hinge right, open',
  top_left: 'Upper half, hinge left',
  top_left_open: 'Upper half, hinge left, open',
  top_right: 'Upper half, hinge right',
  top_right_open: 'Upper half, hinge right, open',
  lit: 'Working',
  pressed: 'Pressed',
  up: 'Up',
  down: 'Pressed down',
  sapling: 'Sapling',
  leaves: 'Leaves',
  ns: 'Along x (seen from north and south)',
  ew: 'Along z (seen from east and west)',
  [ITEM_MODEL_SLOT]: 'Block item',
  head: 'Head (the pillow end)',
  foot: 'Foot',
  cake: 'Whole',
  potted: 'In the pot',
  hanging: 'Hanging',
  stable: 'Standing (supported)',
  unstable: 'Not supported',
  attached: 'Bent onto its fruit',
  ladder: 'Ladder',
  chain: 'Chain',
  rod: 'Rod',
  vine: 'Vine',
  carpet: 'Carpet',
  // ADR 0103 (B516).
  head_berries: 'Tip with berries',
  body_berries: 'Strand with berries',
  stalk2: 'Thin stalk, second look',
  stalk3: 'Thin stalk, third look',
  stalk4: 'Thin stalk, fourth look',
  thick: 'Thick stalk',
  thick2: 'Thick stalk, second look',
  thick3: 'Thick stalk, third look',
  thick4: 'Thick stalk, fourth look',
  leaves_small: 'Small leaves',
  leaves_large: 'Large leaves',
  shoot: 'Shoot',
  face: 'On one face',
  leaf: 'Leaf',
  partial_tilt: 'Tipping a little',
  full_tilt: 'Tipped right over',
  stem: 'Stem',
  pot: 'Empty pot',
});

/** Slot words that depend on the type (`wall` of a torch or sign is not a fence gate's). */
const TYPE_MODEL_SLOT_LABELS: Readonly<Partial<Record<BlockTypeName, Record<string, string>>>> =
  Object.freeze({
    torch: { torch: 'Standing', wall: 'On a wall' },
    lantern: { lantern: 'Standing' },
    sign: { wall: 'On a wall' },
    hanging_sign: { wall: 'On a wall' },
    tall_plant: { bottom: 'Lower half', top: 'Upper half' },
    growing_plant: { head: 'Tip', body: 'Strand behind the tip' },
    column_plant: { default: 'Stalk' },
    dripleaf: { bottom: 'Lower half (small leaf)' },
  });

const COUNT_WORDS: Readonly<Record<string, string>> = {
  one: 'One',
  two: 'Two',
  three: 'Three',
  four: 'Four',
};

/**
 * The texture slots of the block states a container (`open`) or machine (`lit`) adds (ADR 0076
 * D1), on the types with a `front` texture.
 */
export const STATE_TEXTURE_SLOTS: Readonly<Record<'open' | 'lit', TextureSlot>> = Object.freeze({
  open: { key: 'front_open', label: 'Front when open' },
  lit: { key: 'front_lit', label: 'Front when working' },
});

/**
 * Whether the state slot `state` (`open` or `lit`) belongs on the block now: its component
 * makes the state, or the element already sets the slot in `holder` (so it can be cleared).
 */
function stateSlotShown(
  type: BlockTypeName,
  data: Json | undefined,
  state: string,
  holder: 'textures' | 'models',
  key: string,
): boolean {
  return (
    blockStateFlag(type, data) === state || asObject(asObject(data)[holder])[key] !== undefined
  );
}

/**
 * The texture slots the Textures section shows for block data: the type's slots, plus "Front
 * when open" or "Front when working" for a facing type with a container or machine (or with
 * that texture already set).
 */
export function textureSlotsOf(type: BlockTypeName, data: Json | undefined): TextureSlot[] {
  const slots = [...ownTextureSlots(type, data)];
  // A key the element sets that the type's list leaves out (a single-picture type's `texture`)
  // shows by its name, so it can be seen and cleared.
  if (slots.length > 0 && !STAGE_TEXTURE_TYPES.includes(type)) {
    for (const key of Object.keys(asObject(asObject(data).textures))) {
      const stateKeys = Object.values(STATE_TEXTURE_SLOTS).map((slot) => slot.key);
      if (!slots.some((slot) => slot.key === key) && !stateKeys.includes(key)) {
        slots.push({ key, label: key.replaceAll('_', ' ') });
      }
    }
  }
  if (!slots.some((slot) => slot.key === 'front')) return slots;
  for (const state of STATE_MODEL_SLOTS) {
    const slot = STATE_TEXTURE_SLOTS[state];
    if (stateSlotShown(type, data, state, 'textures', slot.key)) slots.push(slot);
  }
  return slots;
}

/**
 * The model slots shown for block data: {@link modelSlots} without the state slots `open` and
 * `lit` the block does not use (no container or machine, and not set in `models`).
 */
export function shownModelSlots(type: BlockTypeName, data: Json | undefined): string[] {
  return modelSlots(type).filter(
    (slot) => !isStateSlot(type, slot) || stateSlotShown(type, data, slot, 'models', slot),
  );
}

/** The container or machine state slots (`open`, `lit`) {@link shownModelSlots} shows. */
export function shownStateModelSlots(type: BlockTypeName, data: Json | undefined): string[] {
  return shownModelSlots(type, data).filter((slot) => isStateSlot(type, slot));
}

/** Whether `slot` is a container or machine state slot of `type` (not a trapdoor's `open`). */
function isStateSlot(type: BlockTypeName, slot: string): boolean {
  return (
    (STATE_MODEL_SLOTS as readonly string[]).includes(slot) &&
    !BLOCK_TYPE_LOWERINGS[type].slots.includes(slot) &&
    !(BLOCK_TYPE_LOWERINGS[type].optionalSlots ?? []).includes(slot)
  );
}

/**
 * A model slot in words: `stage3` is "Stage 3", `slice2` "2 slices eaten", `layers4` "4
 * layers", `rot1` "Turned a sixteenth", `one_lit` "One, lit"; `type` picks the words a type
 * gives a shared slot name (a torch's `wall` is "On a wall"). Unknown slots show with spaces.
 */
export function modelSlotLabel(slot: string, type?: BlockTypeName): string {
  const own = type === undefined ? undefined : TYPE_MODEL_SLOT_LABELS[type]?.[slot];
  if (own !== undefined) return own;
  const stage = /^stage(\d+)$/.exec(slot);
  if (stage !== null) return `Stage ${stage[1]}`;
  const slice = /^slice(\d)$/.exec(slot);
  if (slice !== null) return `${slice[1]} ${slice[1] === '1' ? 'slice' : 'slices'} eaten`;
  const layers = /^layers(\d)$/.exec(slot);
  if (layers !== null) return `${layers[1]} ${layers[1] === '1' ? 'layer' : 'layers'}`;
  const rotation = /^(attached_)?rot(\d)$/.exec(slot);
  if (rotation !== null) {
    const turn = ['Straight', 'Turned a sixteenth', 'Turned an eighth', 'Turned three sixteenths'][
      Number(rotation[2])
    ];
    return rotation[1] === undefined ? (turn ?? slot) : `Under a block, ${turn?.toLowerCase()}`;
  }
  const count = /^(dead_)?(one|two|three|four)(_lit)?$/.exec(slot);
  if (count !== null) {
    const words = COUNT_WORDS[count[2] ?? ''] ?? slot;
    if (count[1] !== undefined) return `${words}, out of water`;
    if (count[3] !== undefined) return `${words}, lit`;
    return words;
  }
  return MODEL_SLOT_LABELS[slot] ?? slot.replaceAll('_', ' ');
}

/** The model slots of `type` (required, optional, then `item`). */
export function modelSlots(type: BlockTypeName): readonly string[] {
  return BLOCK_TYPE_MODEL_SLOTS[type];
}

/** Whether `slot` is one the block state needs (not optional, not `item`). */
export function isRequiredSlot(type: BlockTypeName, slot: string): boolean {
  return BLOCK_TYPE_LOWERINGS[type].slots.includes(slot);
}

/** The first texture a model names: `all`, `side`, `texture`, `layer0`, then any. */
function firstModelTexture(textures: Json | undefined): string | undefined {
  if (!isJsonObject(textures)) return undefined;
  const preferred = ['all', 'side', 'texture', 'layer0', 'top', 'particle'];
  for (const key of [...preferred, ...Object.keys(textures)]) {
    const value = textures[key];
    if (typeof value === 'string' && value !== '' && !value.startsWith('#')) return value;
  }
  return undefined;
}

/**
 * The one texture that best describes the block's look, carried to the new type when the type
 * changes: `textures.all` (or a crop's first stage, or the first texture), else the first
 * texture of the project model `model` names, else a vanilla `block/` model id read as the
 * texture of the same name (vanilla cube models use their own name). `undefined` when none.
 */
export function appearanceTexture(
  project: Project | null,
  data: Json | undefined,
): string | undefined {
  const object = asObject(data);
  const textures = asObject(object.textures);
  if (typeof textures.all === 'string' && textures.all !== '') return textures.all;
  const stages = textures.stages;
  if (Array.isArray(stages) && typeof stages[0] === 'string' && stages[0] !== '') return stages[0];
  const first = firstModelTexture(textures);
  if (first !== undefined) return first;
  const model = typeof object.model === 'string' ? object.model : '';
  if (model === '') return undefined;
  const own = project?.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((element) => element.kind === MODEL_KIND && element.id === model);
  if (own !== undefined) return firstModelTexture(asObject(own.data).textures);
  const id = model.includes(':') ? model : `minecraft:${model}`;
  return id.slice(id.indexOf(':') + 1).startsWith('block/') ? id : undefined;
}

/** What {@link withBlockType} needs besides the data. */
export interface TypeChangeOptions {
  /** The target's set type names (`Target.blocks.setTypes`); the first is the default. */
  setTypes?: readonly string[] | undefined;
  /** The target's wood type names (`Target.blocks.woodTypes`); the first is the default. */
  woodTypes?: readonly string[] | undefined;
  /** The texture to carry to the new type ({@link appearanceTexture}). */
  texture?: string | undefined;
  /** The element's id: a new berry bush's `berry` is its own block item (B452). */
  blockId?: string | undefined;
}

/**
 * The block data after changing its type to `next` (ADR 0069 D5), as one edit: shared fields
 * (name, sounds, mining, light, item, triggers, events) stay; the old type's own fields go
 * (`textures`, `models`, set and wood types, ...); components the new type does not take
 * (`msm:shape`, `msm:redstone`, `msm:container`, `msm:machine`) go, with a machine's
 * `recipes` (the container and machine state textures and models go with `textures` and
 * `models`); a loot preset of the old type becomes `self`. Required
 * fields of the new type get a default (the target's first set or wood type, the vanilla oak
 * tree for a sapling), and the old look is carried over as the new type's `all` texture (a
 * crop's first stage), or kept as `model` where the new type takes one.
 *
 * A portal (ADR 0077 D1) keeps only the components it takes (`PORTAL_COMPONENTS`), has no
 * block item by default (so an `item` that only says the default, `false` or `{}`, goes, and
 * with no item `loot: "self"` goes too), shows vanilla's portal surface rather than the old
 * look, and gets a frame and a destination ({@link PORTAL_TYPE_DEFAULTS}).
 */
export function withBlockType(
  data: Json | undefined,
  next: BlockTypeName,
  options: TypeChangeOptions = {},
): JsonObject {
  const current = blockTypeOfData(data);
  const source = asObject(data);
  if (current === next) return { ...source };
  const keep = new Set(typeOwnFields(next));
  const drop = new Set(
    BLOCK_TYPES.flatMap((type) => typeOwnFields(type)).filter((field) => !keep.has(field)),
  );
  // Fields shared between the old and new types (a door's set type for a trapdoor) stay, but
  // the old appearance is rebuilt below for the new type's own slots.
  drop.add('textures');
  drop.add('models');
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'type' || drop.has(key)) continue;
    out[key] = value;
  }
  if (next !== 'block') out.type = next;
  if (!acceptsSingleModel(next)) delete out.model;
  if (!isShapedType(next) && isJsonObject(out.components)) {
    const components: JsonObject = { ...out.components };
    for (const id of SHAPED_ONLY_COMPONENTS) delete components[id];
    // ADR 0094 D4: the new types are never stripped by axes.
    if (VANILLA_PARITY_TYPES.includes(next)) delete components['msm:strippable'];
    if (Object.keys(components).length === 0) delete out.components;
    else out.components = components;
    // A machine's recipes go with `msm:machine` (ADR 0075 D8): the type cannot lower them.
    delete out.recipes;
  }
  // Waterlogging and weathering stay only on the types that take them (ADR 0094 D7, D8).
  if (isJsonObject(out.components)) {
    const components: JsonObject = { ...out.components };
    if (!WATERLOGGABLE_BLOCK_TYPES.includes(next)) delete components[WATERLOGGABLE_COMPONENT];
    if (!WEATHERING_BLOCK_TYPES.includes(next)) {
      delete components[WEATHERING_COMPONENT];
      delete components[WAXABLE_COMPONENT];
    }
    if (Object.keys(components).length === 0) delete out.components;
    else out.components = components;
  }
  const preset = typeof out.loot === 'string' ? out.loot : undefined;
  const presetType = Object.entries(TYPE_LOOT_PRESETS).find(([, value]) => value === preset)?.[0];
  if (presetType !== undefined && presetType !== next) out.loot = 'self';
  // The new type's required fields.
  const fields = TYPE_FIELDS[next] ?? [];
  // An own set type (ADR 0105 D2, an object) stays when a door becomes a trapdoor.
  if (
    fields.includes('set_type') &&
    typeof out.set_type !== 'string' &&
    !isJsonObject(out.set_type)
  ) {
    out.set_type = options.setTypes?.[0] ?? 'wood';
  }
  if (fields.includes('wood_type') && typeof out.wood_type !== 'string') {
    out.wood_type = options.woodTypes?.[0] ?? 'oak';
  }
  if (next === 'sapling' && typeof out.tree !== 'string') out.tree = 'minecraft:oak';
  if (next === 'stem' && typeof out.fruit !== 'string') out.fruit = NEW_TYPE_DEFAULTS.fruit;
  if (next === 'potted_plant') {
    if (typeof out.plant !== 'string') out.plant = NEW_TYPE_DEFAULTS.plant;
    // A potted plant has no item unless one is given (B448), as a portal.
    if (out.item === false || (isJsonObject(out.item) && Object.keys(out.item).length === 0)) {
      delete out.item;
    }
  }
  if (next === 'column_plant' && typeof out.style !== 'string') {
    out.style = GROWING_TYPE_DEFAULTS.style;
  }
  if (next === 'dripleaf' && typeof out.size !== 'string') out.size = GROWING_TYPE_DEFAULTS.size;
  if (next === 'flower_pot' && !Array.isArray(out.plants)) {
    out.plants = [...GROWING_TYPE_DEFAULTS.plants];
  }
  if (next === 'berry_bush' && typeof out.berry !== 'string') {
    const own = options.blockId === undefined ? undefined : blockItemIdOf(options.blockId, out);
    out.berry = own ?? NEW_TYPE_DEFAULTS.berry;
  }
  if (next === 'portal') {
    if (isJsonObject(out.components)) {
      const components: JsonObject = {};
      for (const [id, value] of Object.entries(out.components)) {
        if (PORTAL_COMPONENTS.includes(id)) components[id] = value;
      }
      if (Object.keys(components).length === 0) delete out.components;
      else out.components = components;
    }
    if (out.item === false || (isJsonObject(out.item) && Object.keys(out.item).length === 0)) {
      delete out.item;
    }
    if (out.item === undefined && out.loot === 'self') delete out.loot;
    if (typeof out.frame !== 'string') out.frame = PORTAL_TYPE_DEFAULTS.frame;
    if (typeof out.destination !== 'string') out.destination = PORTAL_TYPE_DEFAULTS.destination;
    return out;
  }
  // The look, carried over.
  const texture = options.texture;
  const keepsModel = acceptsSingleModel(next) && typeof out.model === 'string' && out.model !== '';
  if (next !== 'block' && texture !== undefined && !keepsModel) {
    if (STAGE_TEXTURE_TYPES.includes(next)) out.textures = { stages: [texture] };
    else out.textures = { [ownTextureSlots(next, out)[0]?.key ?? 'all']: texture };
  }
  return out;
}

/** One model slot of a typed block and where its model comes from. */
export interface SlotModelRow {
  slot: string;
  /** The model id the slot uses, or `undefined` when the block has no appearance yet. */
  model: string | undefined;
  /** `models` (the user's own), `generated` (from `textures`), `model` (the single model) or `first` (a required slot left empty takes the first model). */
  source: 'models' | 'generated' | 'model' | 'first' | 'none';
  /** For a generated model: its vanilla template and textures. */
  parent?: string;
  textures?: Readonly<Record<string, string>>;
}

/** The namespace and path of an element id. */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/**
 * Every model slot of a typed block with the model lowering uses for it (through the plugin's
 * own `blockTypeModels`), for the Textures section's list of generated models; no item row for
 * a block without an item. `[]` for `block` and for data whose `type` is not a type.
 */
export function slotModelRows(element: Pick<Element, 'id' | 'data'>): SlotModelRow[] {
  const type = blockTypeOfData(element.data);
  if (type === undefined || type === 'block') return [];
  const data = asObject(element.data);
  const { namespace, path } = splitId(element.id);
  const itemId = blockItemIdOf(element.id, data);
  let models: ReturnType<typeof blockTypeModels>;
  try {
    models = blockTypeModels(type, {
      blockId: element.id,
      itemId,
      namespace,
      path,
      data,
    });
  } catch {
    return [];
  }
  const given = asObject(data.models);
  const single = acceptsSingleModel(type) && typeof data.model === 'string' ? data.model : '';
  const primary = BLOCK_TYPE_LOWERINGS[type].slots[0] ?? 'default';
  // A block without an item (`"item": false`, or a portal without `item`) has no item model.
  const slots = shownModelSlots(type, data).filter(
    (slot) => itemId !== undefined || slot !== ITEM_MODEL_SLOT,
  );
  return slots.map((slot): SlotModelRow => {
    const model = models.slots[slot];
    const generated = models.generated.find((entry) => entry.slot === slot);
    if (typeof given[slot] === 'string' && given[slot] !== '') {
      return { slot, model, source: 'models' };
    }
    if (generated !== undefined && generated.id === model) {
      return {
        slot,
        model,
        source: 'generated',
        parent: generated.parent,
        textures: generated.textures,
      };
    }
    if (slot === primary && single !== '') return { slot, model, source: 'model' };
    if (model !== undefined) return { slot, model, source: 'first' };
    return { slot, model: undefined, source: 'none' };
  });
}

/**
 * The generated models of a typed block as an in-memory bundle of `minecraft:model` elements
 * (for a 3D preview over {@link typePreviewProject}); empty for `block`.
 */
export function generatedModelBundle(element: Pick<Element, 'id' | 'data'>): ContentBundle {
  const elements = slotModelRows(element).flatMap((row) =>
    row.source === 'generated' && row.model !== undefined && row.parent !== undefined
      ? [
          {
            id: row.model as ResourceLocation,
            kind: MODEL_KIND,
            data: { parent: row.parent, textures: { ...(row.textures ?? {}) } },
          },
        ]
      : [],
  );
  const unique = elements.filter(
    (entry, index) => elements.findIndex((other) => other.id === entry.id) === index,
  );
  return { elements: unique, assets: [] };
}

/**
 * `project` with the block's generated models laid over it (through
 * `preview/bundle-source.ts`), so the model preview can draw a generated model by its id
 * without applying anything.
 */
export function typePreviewProject(
  project: Project,
  element: Pick<Element, 'id' | 'data'>,
): Project {
  return bundlePreviewProject(project, generatedModelBundle(element));
}

/** The texture asset path of a project texture id under `textures/`, for thumbnails. */
export function textureAssetPath(textureId: string): string | undefined {
  const { namespace, path } = splitId(textureId);
  if (namespace === 'minecraft' || path === '') return undefined;
  return `assets/${namespace}/textures/${path}.png`;
}

/** A companion block an element makes (ADR 0094 D3), with its words. */
export interface CompanionRow {
  /** The generated id: `<id>_wall`, `<id>_attached`, `<id>_plant`, `<id>_shoot`, `<id>_stem`, or a pot's `<id>_<plant path>`. */
  id: string;
  /** What the companion is, in words ("the torch on a wall"). */
  words: string;
  /** For a pot's companion (ADR 0103 D2): the plant it holds. */
  plant?: string;
}

/** Words for an id's last path part ("Red tulip" for `minecraft:red_tulip`). */
export function idWords(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const last = path.slice(path.lastIndexOf('/') + 1).replaceAll('_', ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** The plants a flower pot's data lists (`plants`), strings only. */
export function potPlantsOf(data: Json | undefined): string[] {
  const plants = asObject(data).plants;
  return Array.isArray(plants)
    ? plants.filter((plant): plant is string => typeof plant === 'string' && plant !== '')
    : [];
}

/**
 * The companion blocks of an `msm:block` element (`blockGeneratedBlockIds`, B448), shown as part
 * of the element ("Also makes: ..."): the wall block of a torch, sign or hanging sign, the attached
 * stem, and (ADR 0103, B516) the strand behind a growing plant's tip, a bamboo's shoot, a big
 * dripleaf's stem and one potted plant per plant a flower pot takes. Empty for the other types.
 */
export function companionRows(element: { id: string; data: Json | undefined }): CompanionRow[] {
  const type = blockTypeOfData(element.data);
  const thing =
    type === undefined ? 'block' : BLOCK_TYPE_LABELS[type].split(' (')[0]?.toLowerCase();
  const plants = type === 'flower_pot' ? potPlantsOf(element.data) : [];
  return blockGeneratedBlockIds(element.id, element.data).map((id): CompanionRow => {
    if (type === 'flower_pot') {
      const plant = plants.find(
        (entry) => id === `${element.id}_${entry.slice(entry.indexOf(':') + 1)}`,
      );
      return plant === undefined
        ? { id, words: 'the pot with a plant in it' }
        : { id, words: `the pot with ${idWords(plant).toLowerCase()} in it`, plant };
    }
    const suffix = id.slice(element.id.length);
    if (type === 'growing_plant' && suffix === '_plant') {
      return { id, words: 'the strand behind the tip' };
    }
    if (type === 'column_plant' && suffix === '_shoot') {
      return { id, words: 'the shoot it starts from' };
    }
    if (type === 'dripleaf' && suffix === '_stem') return { id, words: 'the stem under the leaf' };
    return {
      id,
      words: id.endsWith('_attached')
        ? 'the stem bent onto a grown fruit'
        : `the ${thing} on a wall`,
    };
  });
}

/** The sign types (ADR 0094 D6), whose writing screen needs a picture of its own. */
export type SignType = 'sign' | 'hanging_sign';

/** Whether `type` is a sign type. */
export function isSignType(type: BlockTypeName | undefined): type is SignType {
  return type === 'sign' || type === 'hanging_sign';
}

/** The texture slot of each sign type's writing screen picture (B443). */
export const SIGN_GUI_SLOTS: Readonly<Record<SignType, string>> = Object.freeze({
  sign: 'sign',
  hanging_sign: 'hanging_gui',
});

/** Where the writing screen picture is copied from and to (an asset of the project). */
export interface SignPictureCopy {
  /** The chosen picture's texture id. */
  picture: string;
  /** The chosen picture's asset (`textures/<path>.png` in its namespace). */
  from: { namespace: string; path: string };
  /** The asset at `signGuiTextureId` the game reads. */
  to: { namespace: string; path: string };
  /** The element data with the texture set. */
  data: JsonObject;
}

/**
 * What setting the texture slot `key` of a sign or hanging sign to `value` copies (ADR 0094 D6
 * amended at B448): when the writing screen picture (`sign` or `hanging_gui`, else `all`) is
 * chosen and is a project picture, it is copied to `signGuiTextureId(blockId, type)`, the asset
 * the game reads. `undefined` for other types and slots, for a vanilla picture (never copied
 * into the project) and when the `all` picture changes while the writing screen has its own.
 */
export function signPictureCopy(
  element: { id: string; data: Json | undefined },
  key: string,
  value: string,
): SignPictureCopy | undefined {
  const type = blockTypeOfData(element.data);
  if (!isSignType(type) || value === '') return undefined;
  const guiSlot = SIGN_GUI_SLOTS[type];
  const source = asObject(element.data);
  const textures = asObject(source.textures);
  if (key !== guiSlot && key !== 'all') return undefined;
  const ownGui = typeof textures[guiSlot] === 'string' && textures[guiSlot] !== '';
  if (key === 'all' && ownGui) return undefined;
  const data: JsonObject = { ...source, textures: { ...textures, [key]: value } };
  const picture = signGuiPicture(data, type);
  if (picture === undefined) return undefined;
  const from = textureAsset(picture);
  const to = textureAsset(signGuiTextureId(element.id, type));
  if (from === null || to === null) return undefined;
  return { picture, from, to, data };
}
