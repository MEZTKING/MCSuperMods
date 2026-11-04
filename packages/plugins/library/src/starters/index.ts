/**
 * The library's project starters (ADR 0020), in list order.
 */
import type { BundleContext, ContentBundle, OutputLayer, ProjectStarter } from '@msm/plugin-api';
import { kindsOf } from '../content/bundle';
import { customOreBundle } from './custom-ore';
import { functionStarterBundle } from './function-starter';
import { musicDiscBundle } from './music-disc';
import { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
import { recipePackBundle } from './recipe-pack';

export { customOreBundle } from './custom-ore';
export { functionStarterBundle } from './function-starter';
export { musicDiscBundle, SONG } from './music-disc';
export { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
export { recipePackBundle } from './recipe-pack';

/** The namespace used to work out a bundle's kinds; any valid namespace gives the same set. */
const PROBE: BundleContext = { namespace: 'probe', projectName: 'Probe' };

function starter(
  id: string,
  title: string,
  description: string,
  category: ProjectStarter['category'],
  layers: OutputLayer[],
  build: (context: BundleContext) => ContentBundle,
): ProjectStarter {
  return Object.freeze({
    id,
    title,
    description,
    category,
    layers,
    requiresKinds: kindsOf(build(PROBE)).sort(),
    build,
  });
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
    'Turns emerald ore into "Ruby Ore" and the emerald into "Ruby": textures, models, a loot table, a recipe, an item tag and advancements. A vanilla pack cannot add new blocks, so this reskins emerald ore until real blocks arrive in Phase 4.',
    'content',
    BOTH,
    customOreBundle,
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
]);
