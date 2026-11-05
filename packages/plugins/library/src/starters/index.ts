/**
 * The library's project starters (ADR 0020), in list order.
 */
import type {
  BundleContext,
  ContentBundle,
  OutputLayer,
  ProjectStarter,
  StarterCreatorInfo,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import { kindsOf } from '../content/bundle';
import { PROBE_CONTEXT } from '../content/probe';
import { hasGeckolib } from '../content/supports';
import { customBiomeBundle } from './custom-biome';
import { CUSTOM_MOB_PARAMETERS, customMobBundle } from './custom-mob';
import { CUSTOM_ORE_PARAMETERS, customOreBundle } from './custom-ore';
import { CUSTOM_SWORD_PARAMETERS, customSwordBundle } from './custom-sword';
import { FOOD_PARAMETERS, foodBundle } from './food';
import { functionStarterBundle } from './function-starter';
import { GEAR_SET_PARAMETERS, gearSetBundle } from './gear-set';
import { jigsawStructureBundle } from './jigsaw-structure';
import { musicDiscBundle } from './music-disc';
import { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
import { recipePackBundle } from './recipe-pack';
import { SCRIPTED_ITEM_PARAMETERS, scriptedItemBundle } from './scripted-item';
import { scriptedOreBundle } from './scripted-ore';
import { SIMPLE_BLOCK_PARAMETERS, simpleBlockBundle } from './simple-block';
import { worldgenPackBundle } from './worldgen-pack';

export { customBiomeBundle, customBiomeContent, customBiomeIds } from './custom-biome';
export { CUSTOM_MOB_PARAMETERS, customMobBundle } from './custom-mob';
export { CUSTOM_ORE_PARAMETERS, customOreBundle } from './custom-ore';
export { CUSTOM_SWORD_PARAMETERS, customSwordBundle } from './custom-sword';
export { FOOD_PARAMETERS, foodBundle } from './food';
export { functionStarterBundle } from './function-starter';
export { GEAR_SET_PARAMETERS, gearSetBundle, gearSetIds } from './gear-set';
export { hamletIds, jigsawStructureBundle, jigsawStructureContent } from './jigsaw-structure';
export { musicDiscBundle, SONG } from './music-disc';
export { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
export { recipePackBundle } from './recipe-pack';
export {
  SCRIPTED_ITEM_PARAMETERS,
  scriptedItemBundle,
  scriptedItemIds,
} from './scripted-item';
export { scriptedOreBundle, scriptedOreIds } from './scripted-ore';
export { SIMPLE_BLOCK_PARAMETERS, simpleBlockBundle } from './simple-block';
export { worldgenPackBundle } from './worldgen-pack';

function starter(
  id: string,
  title: string,
  description: string,
  category: ProjectStarter['category'],
  layers: OutputLayer[],
  build: (context: BundleContext) => ContentBundle,
  options: {
    /** The targets the starter works on; omitted means every target (ADR 0036 D4). */
    supports?: (target: TargetFacts) => boolean;
    /** The wizard's questions (ADR 0040); omitted means no wizard. */
    parameters?: readonly StarterParameter[];
    /** Lists the starter in the Creator (ADR 0043 D1); omitted means New project only. */
    creator?: StarterCreatorInfo;
  } = {},
): ProjectStarter {
  const entry: ProjectStarter = {
    id,
    title,
    description,
    category,
    layers,
    requiresKinds: kindsOf(build(PROBE_CONTEXT)).sort(),
    build,
  };
  if (options.parameters !== undefined) {
    entry.parameters = options.parameters.map((parameter) => structuredClone(parameter));
  }
  if (options.creator !== undefined) entry.creator = { ...options.creator };
  if (options.supports !== undefined) entry.supports = options.supports;
  return Object.freeze(entry);
}

const BOTH: OutputLayer[] = ['resourcepack', 'datapack'];

/** The project starters, in list order. */
export const libraryStarters: readonly ProjectStarter[] = Object.freeze([
  starter(
    'blank',
    'Blank project',
    'An empty project with only its pack.mcmeta. Add elements yourself.',
    'blank',
    BOTH,
    blankBundle,
  ),
  starter(
    'resource_pack',
    'Resource pack',
    'A minimal resource pack: the vanilla stick gets a new model, texture and English name.',
    'pack',
    ['resourcepack'],
    resourcePackBundle,
  ),
  starter(
    'data_pack',
    'Data pack',
    'A minimal data pack: a load message, a function to run and one crafting recipe.',
    'pack',
    ['datapack'],
    dataPackBundle,
  ),
  starter(
    'combined',
    'Resource and data pack',
    'Both minimal packs in one project: the painted stick plus the load message, function and recipe.',
    'pack',
    BOTH,
    combinedBundle,
  ),
  starter(
    'custom_ore',
    'Custom ore',
    'A real ruby ore block that drops rubies when mined with an iron pickaxe, the ruby item and a block of ruby: textures, models, a loot table, recipes, an item tag, advancements and the mod metadata. New blocks and items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    customOreBundle,
    {
      parameters: CUSTOM_ORE_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'An ore that drops gems, the gem item and a storage block, with recipes.',
      },
    },
  ),
  starter(
    'custom-sword',
    'Custom sword',
    'A new sword with its own name, colour, tier and durability: a handheld texture and model, a crafting recipe, its English name and the mod metadata. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    customSwordBundle,
    { parameters: CUSTOM_SWORD_PARAMETERS },
  ),
  starter(
    'gear-set',
    'Gear set',
    'Tools and armour of one new material: a sword, pickaxe, axe, shovel and hoe, a helmet, chestplate, leggings and boots, the material (from a new ore or as an ingot), recipes or smithing upgrades, the worn armour look and the vanilla tags. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    gearSetBundle,
    {
      parameters: GEAR_SET_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'Tools and armour of one material, with recipes and the worn armour look.',
      },
    },
  ),
  starter(
    'simple-block',
    'Simple block',
    'One new block with its own name, colour, hardness, tool, light level and drops, a texture and model, and an optional recipe. New blocks need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    simpleBlockBundle,
    {
      parameters: SIMPLE_BLOCK_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'One block: how hard it is, what mines it, whether it glows and what it drops.',
      },
    },
  ),
  starter(
    'food',
    'Food',
    'A new food with its own name, colour, hunger and saturation, a texture and model, and an optional recipe. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    foodBundle,
    {
      parameters: FOOD_PARAMETERS,
      creator: { group: 'food', blurb: 'Something to eat: how much it fills and how it is made.' },
    },
  ),
  starter(
    'recipe_pack',
    'Recipe pack',
    'Shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag used as an ingredient and an advancement for crafting.',
    'content',
    ['datapack'],
    recipePackBundle,
  ),
  starter(
    'music_disc',
    'Custom music disc',
    'A new jukebox song on a music disc with its own texture, plus a function that gives the disc. It plays a vanilla track until you import your own .ogg.',
    'content',
    BOTH,
    musicDiscBundle,
  ),
  starter(
    'function_starter',
    'Functions',
    'Load and tick functions wired to #minecraft:load and #minecraft:tick, a scoreboard, and a function tag of your own.',
    'content',
    ['datapack'],
    functionStarterBundle,
  ),
  starter(
    'custom_biome',
    'Custom biome',
    'A new biome, Amber Woods, with its own tree and copper ore, reached through a World Type of its own: choose it under More > World Type when creating a world. A data pack cannot add a biome to the normal overworld, so the World Type lists the new biome beside a few vanilla ones.',
    'content',
    BOTH,
    customBiomeBundle,
  ),
  starter(
    'jigsaw_structure',
    'Jigsaw village-style structure',
    'A small hamlet built by jigsaw blocks: a centre hut, streets that follow the terrain and lamp posts, with four template pools, a structure set and a biome tag that places it in forests.',
    'content',
    ['datapack'],
    jigsawStructureBundle,
  ),
  starter(
    'worldgen_pack',
    'Custom biome with a jigsaw structure',
    'Both worldgen starters in one project: the Amber Woods biome and World Type, and jigsaw hamlets that generate in Amber Woods and in every vanilla forest.',
    'content',
    BOTH,
    worldgenPackBundle,
  ),
  starter(
    'custom_mob',
    'Custom mob',
    'An animated Ruby Golem that wanders forests, fights back when hit and drops emeralds: its GeckoLib model, animations, texture and spawn egg, a loot table, a death function and the mod metadata. New mobs need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    customMobBundle,
    {
      supports: hasGeckolib,
      parameters: CUSTOM_MOB_PARAMETERS,
      creator: {
        group: 'mobs',
        blurb: 'An animated mob with its behaviour, spawning, spawn egg and drops.',
      },
    },
  ),
  starter(
    'scripted_ore',
    'Scripted ore',
    'The Custom ore starter with scripts: sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a run_script action, and joining players are greeted. Scripts need the Fabric mod jar export and are not part of the Java project export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    scriptedOreBundle,
  ),
  starter(
    'scripted-item',
    'Scripted behaviour',
    'An item that runs a script when used: it heals you, launches you upward, strikes lightning where you look or gives you an effect. The script opens in the Script Studio for editing. Scripts need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'msm'],
    scriptedItemBundle,
    {
      parameters: SCRIPTED_ITEM_PARAMETERS,
      creator: {
        group: 'scripts',
        blurb: 'An item whose use runs a script you can open and change.',
      },
    },
  ),
]);
