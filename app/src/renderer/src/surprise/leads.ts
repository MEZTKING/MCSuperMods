/**
 * The leads of Home's **More ideas** (ADR 0129 D3): which Creator flows can head an idea card,
 * in which group, how the lead thing is named from the theme word and what the card is called
 * after it ("Frost Wolf", "Ember Kart", "Moss Ruins"). **Surprise me** keeps its own table
 * (`themes.ts`, a material first); an idea starts from one of these and adds one or two of
 * Surprise me's extras. Pure data, no DOM.
 *
 * The groups are dealt evenly (`ideas/idea-plan.ts`), so no group dominates however many flows
 * it has; within a group a flow is picked by its weight.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { FLOW_RECIPES, type FlowRecipe, type NameTemplate, type SurpriseSlot } from './themes';

/** The groups an idea's lead comes from, in the order the deck starts with. */
export const LEAD_GROUPS = [
  'mob',
  'vehicle',
  'building',
  'pet',
  'portal',
  'plant',
  'gear',
  'machine',
  'world',
  'food',
  'tree',
  'magic',
  'storage',
  'game',
  'particle',
  'music',
  'art',
  'village',
  'rules',
  'material',
] as const;

/** One lead group. */
export type LeadGroup = (typeof LEAD_GROUPS)[number];

/** The Surprise me slot an idea's extras leave out for each lead group (a mob, then no other mob). */
export const LEAD_GROUP_SLOT: Readonly<Partial<Record<LeadGroup, SurpriseSlot>>> = {
  mob: 'creature',
  pet: 'creature',
  village: 'creature',
  building: 'building',
  gear: 'weapon',
  food: 'food',
  magic: 'magic',
  plant: 'plant',
  tree: 'plant',
  particle: 'sparkles',
  portal: 'portal',
};

/** What an idea knows about one lead flow. */
export interface LeadRecipe extends Omit<FlowRecipe, 'slot'> {
  /** Surprise me's slot of the flow, when it has one (an extra never shares it). */
  readonly slot?: FlowRecipe['slot'];
  readonly group: LeadGroup;
  /** The card's (and the new mod's) name from the lead thing's name; default the name itself. */
  readonly modName?: (name: string) => string;
}

/** `word` followed by each noun, leaving out a noun that is the word itself ("Moss Moss"). */
const nouns =
  (...list: string[]): NameTemplate =>
  (word) =>
    list.filter((noun) => !noun.split(' ').includes(word)).map((noun) => `${word} ${noun}`);

/** The nouns of a choice answer's value, else `fallback`. */
const nounsBy =
  (
    parameter: string,
    map: Readonly<Record<string, readonly string[]>>,
    fallback: readonly string[],
  ): NameTemplate =>
  (word, values: Readonly<Record<string, Json>>) => {
    const value = values[parameter];
    const list = (typeof value === 'string' ? map[value] : undefined) ?? fallback;
    return nouns(...list)(word, values);
  };

/** Surprise me's recipe of `flowId` as a lead of `group`. */
function surpriseRecipe(
  flowId: string,
  group: LeadGroup,
  extra: Partial<Omit<LeadRecipe, 'flowId' | 'group'>> = {},
): LeadRecipe {
  const recipe = FLOW_RECIPES.find((entry) => entry.flowId === flowId);
  if (recipe === undefined) throw new Error(`No Surprise me recipe for ${flowId}`);
  return { ...recipe, ...extra, group };
}

/** The lead flows, by group. */
export const LEAD_RECIPES: readonly LeadRecipe[] = [
  // Material: the old shape of a card, now one group among many.
  surpriseRecipe('custom_ore', 'material', {
    what: 'an ore, its gem and its block',
    modName: (name) => `${name} Ore`,
  }),
  surpriseRecipe('gear-set', 'material', {
    what: 'tools and armour from an ore of their own',
    modName: (name) => `${name} Gear`,
  }),
  // Building.
  surpriseRecipe('simple-block', 'building'),
  surpriseRecipe('stone-set', 'building'),
  {
    flowId: 'copper-set',
    group: 'building',
    what: 'a weathering metal and its blocks',
    names: { metal_name: nouns('Bronze', 'Brass', 'Tin') },
  },
  {
    flowId: 'lights',
    group: 'building',
    what: 'a set of lights',
    names: { light_name: nouns('Glow', 'Flame', 'Shine') },
    modName: (name) => `${name} Lights`,
  },
  // Gear.
  surpriseRecipe('weapon', 'gear'),
  {
    flowId: 'throwable',
    group: 'gear',
    what: 'something to throw',
    names: {
      throwable_name: nounsBy(
        'style',
        {
          ball: ['Ball', 'Orb'],
          knife: ['Knife', 'Dagger'],
          boomerang: ['Boomerang'],
          bomb: ['Bomb', 'Grenade'],
        },
        ['Orb'],
      ),
    },
  },
  {
    flowId: 'totem',
    group: 'gear',
    what: 'a totem that saves its holder',
    names: { totem_name: nouns('Totem', 'Idol') },
  },
  {
    flowId: 'enchantment',
    group: 'gear',
    what: 'an enchantment',
    names: { enchantment_name: nouns('Edge', 'Ward', 'Touch') },
  },
  // Food.
  surpriseRecipe('food', 'food'),
  surpriseRecipe('consumable', 'food'),
  {
    flowId: 'cake',
    group: 'food',
    what: 'a cake to place and share',
    names: { cake_name: nouns('Cake', 'Pie', 'Tart') },
  },
  // Mobs.
  {
    ...surpriseRecipe('custom_mob', 'mob'),
    names: { mob_name: nouns('Golem', 'Guardian', 'Walker', 'Ghoul', 'Knight') },
  },
  surpriseRecipe('flying-mob', 'mob'),
  {
    flowId: 'water-mob',
    group: 'mob',
    what: 'a water mob',
    names: { mob_name: nouns('Darter', 'Ray', 'Eel') },
    avoid: { spawn_biomes: ['nowhere'] },
  },
  {
    flowId: 'boss',
    group: 'mob',
    what: 'a boss to fight',
    names: { boss_name: nouns('Tyrant', 'Titan', 'Colossus') },
  },
  // Pets and animals.
  {
    ...surpriseRecipe('pet', 'pet'),
    names: {
      pet_name: nounsBy(
        'preset',
        {
          quadruped: ['Wolf', 'Fox', 'Cat', 'Pup'],
          bird: ['Finch', 'Parrot'],
          flyer: ['Wisp', 'Sprite'],
          biped: ['Imp', 'Sprout'],
        },
        ['Wolf'],
      ),
    },
  },
  surpriseRecipe('farm-animal', 'pet'),
  {
    flowId: 'mount',
    group: 'pet',
    what: 'a mount to ride',
    names: { mount_name: nouns('Runner', 'Strider', 'Steed') },
    avoid: { spawn_biomes: ['nowhere'] },
  },
  {
    flowId: 'mob-skin',
    group: 'pet',
    what: 'a new coat for an animal',
    names: { skin_name: nouns('Coat', 'Fur') },
  },
  // Vehicles.
  {
    flowId: 'vehicle-car',
    group: 'vehicle',
    what: 'a car to drive',
    names: { car_name: nouns('Kart', 'Racer', 'Roadster') },
  },
  {
    flowId: 'vehicle-tank',
    group: 'vehicle',
    what: 'a tank to drive',
    names: { tank_name: nouns('Tank', 'Crawler') },
  },
  {
    flowId: 'vehicle-plane',
    group: 'vehicle',
    what: 'a plane to fly',
    names: { plane_name: nouns('Plane', 'Jet', 'Flyer') },
  },
  {
    flowId: 'vehicle-boat',
    group: 'vehicle',
    what: 'a boat with an engine',
    names: { boat_name: nouns('Boat', 'Skiff', 'Cutter') },
  },
  {
    flowId: 'glider',
    group: 'vehicle',
    what: 'a glider to fly with',
    names: { glider_name: nouns('Glider', 'Wings') },
  },
  // Portals and new worlds.
  surpriseRecipe('portal', 'portal'),
  {
    flowId: 'dimension',
    group: 'portal',
    what: 'a new dimension',
    names: { dimension_name: nouns('Realm', 'Lands', 'Reach') },
  },
  // Plants and trees.
  surpriseRecipe('crop', 'plant'),
  {
    flowId: 'cave-plants',
    group: 'plant',
    what: 'a cave plant',
    names: { plant_name: nouns('Vine', 'Tendril', 'Creeper') },
  },
  {
    flowId: 'desert-plants',
    group: 'plant',
    what: 'a tall plant',
    names: { plant_name: nouns('Reed', 'Cane', 'Stalk') },
  },
  {
    flowId: 'flower-pot',
    group: 'plant',
    what: 'a flower pot',
    names: { pot_name: nouns('Planter', 'Pot') },
  },
  surpriseRecipe('tree', 'tree', { modName: (name) => `${name} Trees` }),
  {
    flowId: 'wood-set',
    group: 'tree',
    what: 'a wood, its planks, doors and tree',
    names: { wood_name: nouns('Elm', 'Birch', 'Cedar') },
    modName: (name) => `${name} Wood`,
  },
  // Machines and storage.
  {
    flowId: 'machine',
    group: 'machine',
    what: 'a machine that makes things',
    names: { machine_name: nouns('Grinder', 'Press', 'Mill') },
  },
  {
    flowId: 'storage-crate',
    group: 'storage',
    what: 'a crate to store things',
    names: { crate_name: nouns('Crate', 'Chest', 'Trunk') },
  },
  {
    flowId: 'backpack',
    group: 'storage',
    what: 'a backpack',
    names: { bag_name: nouns('Backpack', 'Satchel', 'Pouch') },
  },
  // Magic and sparkles.
  surpriseRecipe('potion', 'magic'),
  surpriseRecipe('status-effect', 'magic'),
  surpriseRecipe('particle', 'particle', { modName: (name) => `${name}s` }),
  // Music.
  {
    flowId: 'music-disc-item',
    group: 'music',
    what: 'a music disc',
    names: { song_name: nouns('Waltz', 'Ballad', 'Song') },
  },
  {
    flowId: 'goat-horn',
    group: 'music',
    what: 'a horn with its own call',
    names: { horn_name: nouns('Call', 'Horn') },
  },
  // Art.
  {
    flowId: 'painting',
    group: 'art',
    what: 'a painting to hang',
    names: { painting_name: nouns('Sunset', 'Valley', 'Portrait') },
  },
  {
    flowId: 'banner-pattern',
    group: 'art',
    what: 'a banner pattern',
    names: { pattern_name: nouns('Star', 'Crest', 'Banner') },
  },
  {
    flowId: 'pot-pattern',
    group: 'art',
    what: 'a pot pattern',
    names: { pattern_name: nouns('Dawn', 'Mark', 'Sherd') },
  },
  {
    flowId: 'armour-trim',
    group: 'art',
    what: 'an armour trim',
    names: { trim_name: nouns('Lines', 'Trim') },
  },
  // Worlds.
  {
    flowId: 'world-islands',
    group: 'world',
    what: 'a world of islands',
    names: { world_name: nouns('Isles', 'Islands', 'Atolls') },
  },
  {
    flowId: 'world-mountains',
    group: 'world',
    what: 'a world of tall mountains',
    names: { world_name: nouns('Peaks', 'Mountains', 'Heights') },
  },
  {
    flowId: 'world-one-biome',
    group: 'world',
    what: 'a world of one biome',
    names: { world_name: nouns('World', 'Lands', 'Plains') },
  },
  {
    flowId: 'world-caves',
    group: 'world',
    what: 'a world of caves',
    names: { world_name: nouns('Caverns', 'Depths', 'Caves') },
  },
  {
    flowId: 'world-empty-sky',
    group: 'world',
    what: 'an empty sky with a start island',
    names: { world_name: nouns('Skies', 'Haven', 'Heaven') },
  },
  {
    flowId: 'fluid',
    group: 'world',
    what: 'a new fluid with its lakes',
    names: { fluid_name: nouns('Water', 'Tide', 'Spring') },
  },
  // Game modes.
  {
    flowId: 'skyblock',
    group: 'game',
    what: 'a skyblock game',
    names: { game_name: nouns('Skyblock', 'Survival') },
  },
  {
    flowId: 'one-block',
    group: 'game',
    what: 'a one block game',
    names: { game_name: nouns('One Block', 'Block') },
  },
  {
    flowId: 'sky-islands',
    group: 'game',
    what: 'a sky islands game',
    names: { game_name: nouns('Islands', 'Isles') },
  },
  {
    flowId: 'lucky-block',
    group: 'game',
    what: 'a lucky block',
    names: { block_name: nouns('Lucky Block', 'Mystery Block') },
  },
  {
    flowId: 'adventure-map',
    group: 'game',
    what: 'an adventure map',
    names: { map_name: nouns('Ruins', 'Temple', 'Quest') },
  },
  {
    flowId: 'arena-game',
    group: 'game',
    what: 'an arena game for teams',
    names: { game_name: nouns('Arena', 'Colosseum') },
  },
  {
    flowId: 'race',
    group: 'game',
    what: 'a race against the clock',
    names: { race_name: nouns('Sprint', 'Dash', 'Race') },
  },
  // Villages.
  {
    flowId: 'village-job',
    group: 'village',
    what: 'a new village job',
    names: { job_name: nouns('Smith', 'Weaver', 'Tinker') },
  },
  {
    flowId: 'villager-look',
    group: 'village',
    what: 'a new look for villagers',
    names: { look_name: nouns('Folk', 'Villagers') },
  },
  {
    flowId: 'wandering-merchant',
    group: 'village',
    what: 'a wandering merchant',
    names: { merchant_name: nouns('Merchant', 'Pedlar', 'Trader') },
    avoid: { spawn_biomes: ['nowhere'] },
  },
  // Rules: things that do something when used.
  {
    flowId: 'scripted-item',
    group: 'rules',
    what: 'a wand that does something when used',
    names: { item_name: nouns('Wand', 'Staff', 'Rod') },
  },
  {
    flowId: 'game-rule',
    group: 'rules',
    what: 'a game rule of its own',
    names: { rule_name: nouns('Welcome', 'Greeting') },
  },
];
