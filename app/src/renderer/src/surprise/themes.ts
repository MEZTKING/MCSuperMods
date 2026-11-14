/**
 * The themes and flow recipes of "Surprise me" (ADR 0086 D1, D2). A theme is a word and four
 * colours; a recipe says which Creator flow fills which slot of a surprise, how its things are
 * named from the theme word and which answers are pinned or avoided. Everything else a flow asks
 * is answered from its own parameter list (`surprise.ts`), so a flow that gains a question
 * still works. Pure data, no DOM.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';

/** One theme: the word every name starts with and the colours of its pictures. */
export interface SurpriseTheme {
  /** Stable id (`surprise-theme-<id>`). */
  readonly id: string;
  /** The word, for example "Ruby"; a valid first word of a Creator name. */
  readonly word: string;
  /** Main, dark, light and accent colours as `#rrggbb`. */
  readonly colours: readonly [string, string, string, string];
}

/** The themes, in the order "Change theme" shows them. */
export const SURPRISE_THEMES: readonly SurpriseTheme[] = [
  { id: 'ruby', word: 'Ruby', colours: ['#c41c34', '#8b1425', '#f06878', '#ffd060'] },
  { id: 'frost', word: 'Frost', colours: ['#8fd3ff', '#3a7bd5', '#e8f6ff', '#d6e2ee'] },
  { id: 'ember', word: 'Ember', colours: ['#e8641c', '#8b2a0c', '#ffb040', '#ffe080'] },
  { id: 'moss', word: 'Moss', colours: ['#4c8a2c', '#2c5a1c', '#a0d060', '#c8b070'] },
  { id: 'sky', word: 'Sky', colours: ['#5ab4f0', '#2a6cc0', '#d0ecff', '#fff4b0'] },
  { id: 'void', word: 'Void', colours: ['#5a2a8a', '#1c0c2c', '#a060e0', '#e0c0ff'] },
  { id: 'sun', word: 'Sun', colours: ['#f0c020', '#c07010', '#fff080', '#ff9040'] },
  { id: 'coral', word: 'Coral', colours: ['#ff7f6a', '#c04040', '#ffc0b0', '#40c0c0'] },
  { id: 'amber', word: 'Amber', colours: ['#de9420', '#8a5a10', '#f8c870', '#604020'] },
  { id: 'storm', word: 'Storm', colours: ['#606878', '#303848', '#a0b0c8', '#f0f080'] },
];

/** The slots of a surprise: one material, then a few extras from different slots. */
export type SurpriseSlot =
  | 'material'
  | 'building'
  | 'weapon'
  | 'food'
  | 'creature'
  | 'magic'
  | 'plant'
  | 'sparkles'
  | 'portal';

/** How a recipe names one string answer: a list of names to try, best first. */
export type NameTemplate = (word: string, values: Readonly<Record<string, Json>>) => string[];

/** What "Surprise me" knows about one Creator flow. */
export interface FlowRecipe {
  readonly flowId: string;
  readonly slot: SurpriseSlot;
  /** How likely the flow is picked within its slot (default 1). */
  readonly weight?: number;
  /** Names of the flow's string answers; other string answers keep their defaults. */
  readonly names: Readonly<Record<string, NameTemplate>>;
  /** Answers that are always these values. */
  readonly fixed?: Readonly<Record<string, Json>>;
  /** Choice values never picked (a mob that spawns nowhere is no surprise). */
  readonly avoid?: Readonly<Record<string, readonly string[]>>;
  /** A short phrase for the dialog: "a gear set", "a food". */
  readonly what: string;
}

/** `word` followed by each noun. */
const nouns =
  (...list: string[]): NameTemplate =>
  (word) =>
    list.map((noun) => `${word} ${noun}`);

/** The nouns of a choice answer's value, else `fallback`. */
const nounsBy =
  (
    parameter: string,
    map: Readonly<Record<string, readonly string[]>>,
    fallback: readonly string[],
  ): NameTemplate =>
  (word, values) => {
    const value = values[parameter];
    const list = (typeof value === 'string' ? map[value] : undefined) ?? fallback;
    return list.map((noun) => `${word} ${noun}`);
  };

/** The theme word alone (a material: the ore, gem and block are named after it). */
const word: NameTemplate = (theme) => [theme];

/** The slot of each surprise extra and how likely it is (the material always comes first). */
export const SLOT_WEIGHTS: Readonly<Record<Exclude<SurpriseSlot, 'material'>, number>> = {
  building: 3,
  weapon: 3,
  food: 3,
  creature: 3,
  magic: 2,
  plant: 2,
  sparkles: 1,
  portal: 1,
};

/** The flows "Surprise me" uses, by slot. */
export const FLOW_RECIPES: readonly FlowRecipe[] = [
  {
    flowId: 'custom_ore',
    slot: 'material',
    what: 'an ore with its gem and block',
    names: { ore_name: word },
    fixed: { generate: true, make_block: true },
  },
  {
    flowId: 'gear-set',
    slot: 'material',
    what: 'a set of tools and armour, with its ore',
    names: { material_name: word },
    fixed: { material_source: 'ore', trim_material: false },
  },
  {
    flowId: 'simple-block',
    slot: 'building',
    what: 'a block',
    names: { block_name: nouns('Bricks', 'Tiles', 'Lamp', 'Planks', 'Glass') },
  },
  {
    flowId: 'stone-set',
    slot: 'building',
    what: 'a stone with stairs, slab and wall',
    names: { stone_name: nouns('Stone', 'Rock', 'Slate') },
  },
  {
    flowId: 'weapon',
    slot: 'weapon',
    what: 'a weapon',
    names: {
      weapon_name: nounsBy(
        'weapon_type',
        {
          sword: ['Blade', 'Sword', 'Sabre'],
          spear: ['Spear', 'Lance'],
          mace: ['Mace', 'Hammer'],
          bow: ['Bow', 'Longbow'],
          crossbow: ['Crossbow', 'Repeater'],
          shield: ['Shield', 'Guard'],
        },
        ['Blade'],
      ),
    },
  },
  {
    flowId: 'food',
    slot: 'food',
    what: 'a food',
    names: { food_name: nouns('Apple', 'Pie', 'Bun', 'Candy', 'Stew', 'Cookie') },
  },
  {
    flowId: 'consumable',
    slot: 'food',
    what: 'a food, drink or charm with effects',
    names: {
      consumable_name: nounsBy(
        'kind',
        {
          food: ['Snack', 'Bar', 'Tart'],
          drink: ['Tonic', 'Juice', 'Tea'],
          charm: ['Charm', 'Amulet', 'Trinket'],
        },
        ['Tonic'],
      ),
    },
  },
  {
    flowId: 'custom_mob',
    slot: 'creature',
    what: 'a mob',
    names: { mob_name: nouns('Golem', 'Guardian', 'Walker') },
  },
  {
    flowId: 'pet',
    slot: 'creature',
    what: 'a pet',
    names: {
      pet_name: nounsBy(
        'preset',
        {
          quadruped: ['Fox', 'Cat', 'Pup'],
          bird: ['Finch', 'Parrot'],
          flyer: ['Wisp', 'Sprite'],
          biped: ['Imp', 'Sprout'],
        },
        ['Fox'],
      ),
    },
    avoid: { spawn_biomes: ['nowhere'] },
  },
  {
    flowId: 'farm-animal',
    slot: 'creature',
    what: 'a farm animal',
    names: {
      animal_name: nounsBy(
        'preset',
        { quadruped: ['Boar', 'Calf', 'Goat'], bird: ['Hen', 'Duck'] },
        ['Boar'],
      ),
    },
    avoid: { spawn_biomes: ['nowhere'] },
  },
  {
    flowId: 'flying-mob',
    slot: 'creature',
    what: 'a flying mob',
    names: { mob_name: nouns('Moth', 'Bat', 'Wisp') },
    avoid: { spawn_biomes: ['nowhere'] },
  },
  {
    flowId: 'potion',
    slot: 'magic',
    what: 'a potion to brew',
    names: { potion_name: nouns('Brew', 'Draught', 'Elixir') },
  },
  {
    flowId: 'status-effect',
    slot: 'magic',
    what: 'a status effect',
    names: { effect_name: nouns('Rush', 'Glow', 'Blessing') },
  },
  {
    flowId: 'crop',
    slot: 'plant',
    what: 'a crop to farm',
    names: { crop_name: nouns('Berry', 'Bean', 'Melon', 'Root') },
  },
  {
    flowId: 'tree',
    slot: 'plant',
    what: 'a tree and its sapling',
    names: { tree_name: nouns('Oak', 'Willow', 'Pine') },
  },
  {
    flowId: 'particle',
    slot: 'sparkles',
    what: 'sparkles',
    names: { particle_name: nouns('Spark', 'Glimmer', 'Twinkle') },
  },
  {
    flowId: 'portal',
    slot: 'portal',
    what: 'a portal to a new world',
    names: {
      portal_name: nouns('Gate', 'Portal', 'Door'),
      dimension_name: nouns('Realm', 'Lands', 'World'),
    },
    fixed: { destination: 'new' },
  },
];
