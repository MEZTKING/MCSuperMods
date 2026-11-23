/**
 * The Skyblock Creator flow (ADR 0117 D2, ADR 0114; B557): a game in a world of empty sky. The
 * player starts on a small island at the spawn with a chest and must make everything else from
 * it: the classic cobblestone generator of lava and water, a tree farm, and so on.
 *
 * It makes, all as plain data pack files through the games kinds (ADR 0113), so it works in a
 * vanilla data pack:
 *
 * - a `msm:world_setup` of the type `void` (its id, from the game's name, is the World Type's
 *   name on the Create New World screen and Play my game's world), whose start is the island,
 *   placed once at the first player's first join (ADR 0114 D2), with the spawn on its grass, a
 *   welcome and a few seconds of slow falling for the moment before the island appears;
 * - the island, a `minecraft:structure_template` drawn here from the answers out of vanilla blocks
 *   named by id (no Mojang file is copied): a corner island with a tree, a round one or a tiny one;
 *   its chest names its block entity `id` and the loot table of what is in it;
 * - the chest's loot table (a lava bucket and two ice by default, so the generator can be built,
 *   with seeds, a sapling and bone meal);
 * - what the sky lacks (ADR 0114 D5): extra wandering trader trades (sand, red sand, saplings,
 *   sugar cane, pumpkin seeds) added to vanilla's trade tag, and two recipes (cobblestone into
 *   gravel, gravel into sand);
 * - goals: a tab of advancements (the Goals flow's {@link goalsTabBundle}) named in the welcome;
 * - if chosen, a generator of the player's own (ADR 0114 D4, limit M5): vanilla's lava and water
 *   make what they make, so a liquid of the project's own (the Fluid flow, lava-like) mixes with
 *   water into the block chosen, its bucket in the chest. Liquids need the Fabric mod jar export.
 *
 * {@link islandTemplate} is shared with the Sky islands flow's start island.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  Json,
  JsonObject,
  ResourceLocation,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  setValue,
  stringValue,
} from '../content/parameters';
import { BoxBuilder, type Pos } from '../content/structures';
import { FLUID_PARAMETERS, fluidBundle, fluidIds } from './fluid';
import { goalsRootId, goalsTabBundle } from './goals';

// ---------------------------------------------------------------------------------------------
// Shared with the other game flows
// ---------------------------------------------------------------------------------------------

/** The games kinds (`@msm/plugin-games`), named by string: the library imports no plugin. */
export const GAME_KINDS = Object.freeze({
  worldSetup: 'msm:world_setup',
  oneBlock: 'msm:one_block',
  team: 'msm:team',
  objective: 'msm:objective',
  timer: 'msm:timer',
  area: 'msm:area',
  rules: 'msm:rules',
});

/** The starter ids of the eight game flows, in Home's order (ADR 0117 D2). */
export const GAME_FLOW_IDS = [
  'skyblock',
  'one-block',
  'sky-islands',
  'lucky-block',
  'adventure-map',
  'arena-game',
  'race',
  'goals',
] as const;

/**
 * A function the games kinds write (B552), `<ns>:msm_games/<path>`: a timer's
 * `timer/<path>/start` and `stop`, an area's `area/<path>/reset`. Flows call them from functions
 * of their own; the names are the games plugin's, rebuilt here since the library imports no
 * plugin.
 */
export const gamesFunction = (namespace: string, path: string): ResourceLocation =>
  `${namespace}:msm_games/${path}`;

/**
 * The criterion of a player standing in an area `<ns>:<path>`: the games kinds' area tick tags the
 * players inside with `<ns>.area.<path with / as .>` (B552), and a `minecraft:location` criterion
 * (checked about once a second) tests that tag, so an advancement is granted in the area with no
 * rule and no jar, and moving the area in the Area Studio moves it too.
 */
export function inAreaCriterion(area: string): JsonObject {
  const colon = area.indexOf(':');
  const tag = `${area.slice(0, colon)}.area.${area.slice(colon + 1).replace(/\//g, '.')}`;
  return {
    trigger: 'minecraft:location',
    conditions: {
      player: {
        type: 'minecraft:entity_properties',
        entity: 'this',
        predicate: { nbt: `{Tags:["${tag}"]}` },
      },
    },
  };
}

/** Where the start of a sky world goes: its corner, as the world setup's default. */
export const SKY_START_AT: Pos = [0, 64, 0];

/** A chest facing south in a structure template. */
const CHEST = 'minecraft:chest[facing=south,type=single,waterlogged=false]';
const GRASS = 'minecraft:grass_block[snowy=false]';
const DIRT = 'minecraft:dirt';
const LOG = 'minecraft:oak_log[axis=y]';
const LEAVES = 'minecraft:oak_leaves[distance=1,persistent=true,waterlogged=false]';
const SAPLING = 'minecraft:oak_sapling[stage=0]';

/** The island shapes, with the words of the choice. */
export const ISLAND_SHAPES: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'classic', label: 'A corner island with a tree' },
  { value: 'round', label: 'A round island with a tree' },
  { value: 'tiny', label: 'A tiny island with a sapling' },
  { value: 'own', label: 'My own building (choose it later)' },
]);

/** A drawn island: its template data, where the player stands and where the chest is. */
export interface Island {
  data: Json;
  /** The spawn, relative to the template's corner: the air above a grass block. */
  spawn: Pos;
  /** The chest's position in the template. */
  chest: Pos;
  /** The template's size. */
  size: Pos;
  /** The words for the notes. */
  words: string;
}

/** A small oak with its trunk on `base` (the block above the ground): four logs, leaves round. */
function tree(builder: BoxBuilder, base: Pos): void {
  const [bx, by, bz] = base;
  for (let dy = 0; dy < 4; dy += 1) builder.set([bx, by + dy, bz], LOG);
  for (let dy = 2; dy <= 5; dy += 1) {
    const radius = dy <= 3 ? 2 : 1;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
        if (corner && (radius === 2 || dy === 5)) continue;
        if (dx === 0 && dz === 0 && dy < 4) continue;
        builder.set([bx + dx, by + dy, bz + dz], LEAVES);
      }
    }
  }
}

/**
 * The start island of `shape` (not `own`), drawn from vanilla blocks: dirt under grass, a tree or
 * a sapling, and a chest. The chest's block entity names its `id` and the loot table `chestLoot`.
 */
export function islandTemplate(shape: string, chestLoot: ResourceLocation): Island {
  let builder: BoxBuilder;
  let spawn: Pos;
  let chest: Pos;
  let size: Pos;
  let words: string;
  if (shape === 'round') {
    size = [11, 9, 11];
    builder = new BoxBuilder(size);
    for (let x = 0; x < 11; x += 1) {
      for (let z = 0; z < 11; z += 1) {
        const d = Math.hypot(x - 5, z - 5);
        if (d <= 2.2) builder.set([x, 0, z], DIRT);
        if (d <= 3.6) builder.set([x, 1, z], DIRT).set([x, 2, z], GRASS);
      }
    }
    tree(builder, [4, 3, 4]);
    chest = [7, 3, 6];
    spawn = [6, 3, 7];
    words = 'a round island seven blocks across, three deep, with an oak and a chest';
  } else if (shape === 'tiny') {
    size = [3, 3, 3];
    builder = new BoxBuilder(size);
    builder.fill([0, 0, 0], [2, 0, 2], DIRT).fill([0, 1, 0], [2, 1, 2], GRASS);
    builder.set([0, 2, 0], SAPLING);
    chest = [2, 2, 0];
    spawn = [1, 2, 1];
    words = 'a tiny island of three by three blocks with an oak sapling and a chest';
  } else {
    // The classic corner island: an L of six by six blocks less a three by three corner.
    size = [10, 9, 10];
    builder = new BoxBuilder(size);
    for (let gx = 0; gx < 6; gx += 1) {
      for (let gz = 0; gz < 6; gz += 1) {
        if (gx >= 3 && gz >= 3) continue;
        builder
          .set([gx + 2, 0, gz + 2], DIRT)
          .set([gx + 2, 1, gz + 2], DIRT)
          .set([gx + 2, 2, gz + 2], GRASS);
      }
    }
    tree(builder, [3, 3, 6]);
    chest = [7, 3, 3];
    spawn = [5, 3, 3];
    words = 'the classic corner island: an L of grass on dirt, three deep, with an oak and a chest';
  }
  builder.set(chest, CHEST);
  const data = {
    ...(builder.build() as JsonObject),
    block_entities: [{ pos: [...chest], nbt: `{LootTable:"${chestLoot}",id:"minecraft:chest"}` }],
  };
  return { data, spawn, chest, size, words };
}

/** The chest's loot table: one pool for each item, so each comes exactly once. */
export function chestLootTable(items: readonly { item: string; count: number }[]): Json {
  return {
    type: 'minecraft:chest',
    pools: items.map(({ item, count }) => ({
      rolls: 1,
      entries: [
        {
          type: 'minecraft:item',
          name: item,
          ...(count > 1 ? { modifier: { type: 'minecraft:set_count', count } } : {}),
        },
      ],
    })),
  };
}

/** A vanilla game rule's name if the target lists it (or lists none), else undefined. */
export function vanillaRule(target: TargetFacts, name: string): string | undefined {
  const names = target.gameRules?.vanillaNames;
  return names === undefined || names.includes(name) ? name : undefined;
}

/** The void biome of the target (no mob spawns). */
export function voidBiome(target: TargetFacts): string {
  return target.worlds?.voidBiome ?? 'minecraft:the_void';
}

// ---------------------------------------------------------------------------------------------
// The Skyblock flow
// ---------------------------------------------------------------------------------------------

/** What the chest can hold, with the words of each choice. */
export const CHEST_CHOICES: readonly {
  value: string;
  label: string;
  items: readonly { item: string; count: number }[];
}[] = Object.freeze([
  {
    value: 'lava_ice',
    label: 'A lava bucket and two ice (for a cobblestone generator)',
    items: [
      { item: 'minecraft:lava_bucket', count: 1 },
      { item: 'minecraft:ice', count: 2 },
    ],
  },
  { value: 'seeds', label: 'Seeds', items: [{ item: 'minecraft:wheat_seeds', count: 3 }] },
  { value: 'sapling', label: 'A sapling', items: [{ item: 'minecraft:oak_sapling', count: 1 }] },
  { value: 'bone_meal', label: 'Bone meal', items: [{ item: 'minecraft:bone_meal', count: 4 }] },
  { value: 'bread', label: 'Bread', items: [{ item: 'minecraft:bread', count: 4 }] },
  {
    value: 'mushrooms',
    label: 'Mushrooms',
    items: [
      { item: 'minecraft:red_mushroom', count: 1 },
      { item: 'minecraft:brown_mushroom', count: 1 },
    ],
  },
]);

/** The wandering trader's extra trades: one emerald for each. */
const SKY_TRADES: readonly { item: string; count: number }[] = [
  { item: 'minecraft:sand', count: 8 },
  { item: 'minecraft:red_sand', count: 8 },
  { item: 'minecraft:birch_sapling', count: 1 },
  { item: 'minecraft:spruce_sapling', count: 1 },
  { item: 'minecraft:sugar_cane', count: 2 },
  { item: 'minecraft:pumpkin_seeds', count: 2 },
];

/** What a generator of one's own can make with water (the Fluid flow's lava-like mixes). */
const GENERATOR_MAKES = (
  FLUID_PARAMETERS.find((parameter) => parameter.id === 'mixes_into') as {
    choices: readonly { value: string; label: string }[];
  }
).choices.filter((choice) => choice.value !== 'none');

/** The Skyblock flow's questions, groups "Game", "Island", "World" and "Extras". */
export const SKYBLOCK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'game_name',
    label: 'What is your game called?',
    description:
      'The World Type has this name on the Create New World screen. Ids derive from it: Sky Survival gives sky_survival.',
    group: 'Game',
    type: 'string',
    default: 'Sky Survival',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'island',
    label: 'The island you start on',
    group: 'Island',
    type: 'choice',
    default: 'classic',
    choices: ISLAND_SHAPES.map((shape) => ({ ...shape })),
  },
  {
    id: 'chest',
    label: 'What is in the chest',
    group: 'Island',
    type: 'set',
    default: ['lava_ice', 'seeds', 'sapling', 'bone_meal'],
    choices: CHEST_CHOICES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'mobs',
    label: 'Mobs spawn on my islands',
    description: 'Monsters at night and on dark blocks, as on plains. Off: nothing spawns.',
    group: 'World',
    type: 'boolean',
    default: true,
  },
  {
    id: 'nether',
    label: 'The Nether',
    description:
      'An empty Nether is sky too: the game builds an obsidian platform where the portal comes out.',
    group: 'World',
    type: 'choice',
    default: 'vanilla',
    choices: [
      { value: 'vanilla', label: 'As normal' },
      { value: 'void', label: 'Empty sky too' },
    ],
  },
  {
    id: 'trades',
    label: 'Extra trades for the wandering trader',
    description: 'Sand, red sand, saplings, sugar cane and pumpkin seeds, an emerald each.',
    group: 'Extras',
    type: 'boolean',
    default: true,
  },
  {
    id: 'recipes',
    label: 'Recipes for what the sky lacks',
    description: 'Cobblestone into gravel and gravel into sand.',
    group: 'Extras',
    type: 'boolean',
    default: true,
  },
  {
    id: 'generator',
    label: 'A generator of my own',
    description:
      'Lava and water always make cobblestone and obsidian. Turn this on for a liquid of your own whose bucket is in the chest and which makes another block with water. Liquids need the Fabric mod jar export.',
    group: 'Extras',
    type: 'boolean',
    default: false,
  },
  {
    id: 'generator_name',
    label: 'What is the liquid called?',
    group: 'Extras',
    type: 'string',
    default: 'Sky Lava',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'generator_makes',
    label: 'What it makes with water',
    group: 'Extras',
    type: 'choice',
    default: 'stone',
    choices: GENERATOR_MAKES.map((choice) => ({ ...choice })),
  },
  {
    id: 'goals',
    label: 'Goals',
    description:
      'A tab in the advancements screen: wood, cobblestone, a furnace, iron, the Nether.',
    group: 'Extras',
    type: 'boolean',
    default: true,
  },
]);

/** The item id of a vanilla item, as a word for ids (`minecraft:red_sand` gives `red_sand`). */
const itemWord = (id: string): string => id.slice(id.indexOf(':') + 1);

export function skyblockBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName, target } = context;
  const values = readValues(SKYBLOCK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'game_name'));
  const id = name.id;
  const shape = stringValue(values, 'island');
  const chestLoot = rl(namespace, `${id}/start_chest`);
  const goals = booleanValue(values, 'goals');
  const generator = booleanValue(values, 'generator');
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.display}, a Skyblock`),
  ];
  const assets: ContentBundle['assets'] = [];

  // What the chest holds, and the generator's liquid when chosen.
  const chestItems = setValue(values, 'chest').flatMap(
    (value) => CHEST_CHOICES.find((choice) => choice.value === value)?.items ?? [],
  );
  let generatorWords = '';
  if (generator) {
    const liquid = nameForms(stringValue(values, 'generator_name'));
    const makes = stringValue(values, 'generator_makes');
    const fluid = fluidBundle({
      ...context,
      values: { fluid_name: liquid.display, behaves_like: 'lava', mixes_into: makes, lakes: false },
    });
    elements.push(...fluid.elements.filter((entry) => entry.kind !== KINDS.pack));
    assets.push(...fluid.assets);
    const bucket = fluidIds(namespace, liquid.id).bucket;
    chestItems.push({ item: bucket, count: 1 });
    generatorWords = ` The chest also holds a bucket of ${liquid.lower}, a liquid of your own that makes ${GENERATOR_MAKES.find((choice) => choice.value === makes)?.label.toLowerCase() ?? makes} where water touches it (it needs the Fabric mod jar export).`;
  }

  // The island.
  const setup: JsonObject = {
    world: {
      type: 'void',
      nether: stringValue(values, 'nether') === 'void' ? 'void' : 'vanilla',
      end: 'vanilla',
      ...(booleanValue(values, 'mobs') ? {} : { biome: voidBiome(target) }),
    },
    spawn_radius: 0,
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: {},
    new_player: {
      message: `Welcome to ${name.display}! Everything you need is in the chest. Do not fall!`,
      effects: [{ effect: 'minecraft:slow_falling', seconds: 10, hide_particles: true }],
    },
  };
  let islandWords =
    "no island of MSM's: choose your own building as the start in the World Setup Studio";
  if (shape !== 'own') {
    const island = islandTemplate(shape, chestLoot);
    const template = rl(namespace, `${id}/island`);
    elements.push(
      element(
        template,
        KINDS.structureTemplate,
        island.data,
        `The start island: ${island.words}, drawn by the Skyblock flow from vanilla blocks named by id. The chest at ${island.chest.join(', ')} names its block entity id and the loot table ${chestLoot}, so it fills the first time it is opened. Change it in the Structure Studio, or build your own in the game and bring it in.`,
      ),
      element(
        chestLoot,
        KINDS.lootTable,
        chestLootTable(chestItems),
        `What the island's chest holds: ${chestItems.map(({ item, count }) => `${count} ${itemWord(item).replace(/_/g, ' ')}`).join(', ')}. One pool for each, rolled once, so each comes exactly once.${generatorWords}`,
      ),
    );
    setup.start = { structure: template, at: [...SKY_START_AT], spawn: [...island.spawn] };
    islandWords = `the island ${template}, placed with its corner at ${SKY_START_AT.join(' ')} when the first player joins, the spawn on its grass`;
  }
  if (goals) {
    const root = goalsRootId(namespace, `${id}/goals`);
    const tab = goalsTabBundle(namespace, target, {
      base: `${id}/goals`,
      title: name.display,
      description: 'Grow your island',
      goals: ['get_wood', 'get_cobblestone', 'craft_furnace', 'get_iron', 'visit_nether'],
      icon: 'minecraft:grass_block',
      colour: [76, 138, 44],
      background: 'adventure',
    });
    elements.push(...tab.elements);
    assets.push(...tab.assets);
    setup.goals = root;
  }
  elements.splice(
    1,
    0,
    element(
      rl(namespace, id),
      GAME_KINDS.worldSetup,
      setup,
      `How the world starts: a World Type called ${name.display} of empty sky (void), listed on the Create New World screen, with ${islandWords}. Players start in survival on normal difficulty; each new player gets a welcome and ten seconds of slow falling, once.${goals ? ' The welcome names the goals tab.' : ''} Mobs ${booleanValue(values, 'mobs') ? 'spawn on what players build, as on plains (the sky biome of the game kits)' : 'never spawn (the void biome)'}; the Nether is ${setup.world && (setup.world as JsonObject).nether === 'void' ? 'empty sky too' : 'as normal'}. Everything lowers to plain data pack files.`,
    ),
  );

  if (booleanValue(values, 'trades')) {
    const tradeIds = SKY_TRADES.map(({ item }) =>
      rl(namespace, `wandering_trader/${id}_${itemWord(item)}`),
    );
    SKY_TRADES.forEach(({ item, count }, index) => {
      elements.push(
        element(
          tradeIds[index] as ResourceLocation,
          KINDS.villagerTrade,
          {
            wants: { id: 'minecraft:emerald', count: 1 },
            gives: { id: item, count },
            max_uses: 8,
            xp: 1,
            reputation_discount: 0.05,
          },
          `A trade for the sky: the wandering trader sells ${count} ${itemWord(item).replace(/_/g, ' ')} for an emerald, up to eight times.`,
        ),
      );
    });
    elements.push(
      element(
        'minecraft:wandering_trader/common',
        KINDS.tagVillagerTrade,
        { values: tradeIds },
        "Adds the sky trades to the vanilla trade tag the wandering trader draws its common trades from. The export merges it into vanilla's tag (replace stays false), so the vanilla trades stay; each trader draws a few, so a trade is a candidate, not a certainty.",
      ),
    );
  }
  if (booleanValue(values, 'recipes')) {
    elements.push(
      element(
        rl(namespace, `${id}/gravel_from_cobblestone`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'building',
          ingredients: ['minecraft:cobblestone'],
          result: { id: 'minecraft:gravel', count: 1 },
        },
        'One cobblestone crafts into gravel, which the sky has none of: for flint, and for sand by the next recipe.',
      ),
      element(
        rl(namespace, `${id}/sand_from_gravel`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'building',
          ingredients: ['minecraft:gravel'],
          result: { id: 'minecraft:sand', count: 1 },
        },
        'One gravel crafts into sand, for glass, cactus and sugar cane.',
      ),
    );
  }
  return { elements, assets };
}
