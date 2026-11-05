/**
 * The library's project starters (ADR 0020), in list order.
 */
import type {
  BundleContext,
  ContentBundle,
  OutputLayer,
  ProjectStarter,
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
import { functionStarterBundle } from './function-starter';
import { jigsawStructureBundle } from './jigsaw-structure';
import { musicDiscBundle } from './music-disc';
import { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
import { recipePackBundle } from './recipe-pack';
import { scriptedOreBundle } from './scripted-ore';
import { worldgenPackBundle } from './worldgen-pack';

export { customBiomeBundle, customBiomeContent, customBiomeIds } from './custom-biome';
export { CUSTOM_MOB_PARAMETERS, customMobBundle } from './custom-mob';
export { CUSTOM_ORE_PARAMETERS, customOreBundle } from './custom-ore';
export { CUSTOM_SWORD_PARAMETERS, customSwordBundle } from './custom-sword';
export { functionStarterBundle } from './function-starter';
export { hamletIds, jigsawStructureBundle, jigsawStructureContent } from './jigsaw-structure';
export { musicDiscBundle, SONG } from './music-disc';
export { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
export { recipePackBundle } from './recipe-pack';
export { scriptedOreBundle, scriptedOreIds } from './scripted-ore';
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
    { parameters: CUSTOM_ORE_PARAMETERS },
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
    { supports: hasGeckolib, parameters: CUSTOM_MOB_PARAMETERS },
  ),
  starter(
    'scripted_ore',
    'Scripted ore',
    'The Custom ore starter with scripts: sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a run_script action, and joining players are greeted. Scripts need the Fabric mod jar export and are not part of the Java project export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    scriptedOreBundle,
  ),
]);
