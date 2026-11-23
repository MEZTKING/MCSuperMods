/**
 * The Examples gallery (ADR 0020): one commented example per registered kind, the blocks and
 * items behaviour examples (with the container and machine examples, ADR 0076 D4, the portal
 * example, ADR 0078 D4, and the firefly jar, ADR 0081 D5), the entity behaviour examples, the
 * script behaviour examples, the rules behaviour examples (ADR 0082 D11), the world examples
 * (ADR 0119 D11), the game examples (ADR 0117 D2), the flow examples (ADR 0129 D2), the
 * "Popular ideas" examples, then the starters as complete projects.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { KINDS } from '../content/bundle';
import {
  combinedBundle,
  customBiomeBundle,
  customOreBundle,
  dataPackBundle,
  functionStarterBundle,
  jigsawStructureBundle,
  musicDiscBundle,
  recipePackBundle,
  resourcePackBundle,
  scriptedOreBundle,
  worldgenPackBundle,
} from '../starters/index';
import { vanillaBlockRulesKindExample } from './block-types';
import {
  behaviourExamples as blocksItemsBehaviourExamples,
  blocksItemsExamples,
} from './blocks-items';
import { containerExamples } from './containers';
import { dataKindExamples } from './data-kinds';
import { dataPackExamples } from './data-pack';
import { defineExample } from './define';
import { entityKindExamples, entityBehaviourExamples as mobBehaviourExamples } from './entities';
import { flowExamples } from './flows';
import { gameExamples, gameKindExamples } from './games';
import { particleExamples, particleKindExamples } from './particles';
import { popularExamples } from './popular';
import { portalExamples } from './portals';
import { registryExamples } from './registries';
import { resourcePackExamples } from './resource-pack';
import { rulesBehaviourExamples, rulesKindExamples } from './rules';
import {
  scriptKindExamples,
  scriptBehaviourExamples as scriptOnlyBehaviourExamples,
} from './scripts';
import { structureExamples } from './structures';
import { tagExamples } from './tags';
import {
  vanillaParityBehaviourExamples,
  vanillaParityKindExamples,
  vanillaParityScriptExamples,
} from './vanilla-parity';
import { vehicleBehaviourExamples, vehicleKindExamples } from './vehicles';
import { villagerBehaviourExamples, villagerFluidKindExamples } from './villagers-and-fluids';
import { worldgenExamples } from './worldgen';
import { worldExamples } from './worlds';

export { categoryTag, defineExample, type ExampleInput } from './define';
export {
  FLOW_EXAMPLE_IDS,
  FLOW_EXAMPLE_PREFIX,
  flowExamples,
  STARTERS_WITHOUT_EXAMPLE,
} from './flows';
export { GAMES_CATEGORY, gameExamples, gameKindExamples } from './games';
export { POPULAR_CATEGORY, popularExamples, popularFolder } from './popular';
export { rulesBehaviourExamples, rulesKindExamples } from './rules';
export { vehicleBehaviourExamples } from './vehicles';
export { WORLDS_CATEGORY, worldExamples } from './worlds';

/**
 * The script behaviour examples, then the Server helper (commands, a function and a rule book,
 * B461); the `examples/scripts` mirror holds them all in one project.
 */
export const scriptBehaviourExamples: readonly ExampleProject[] = Object.freeze([
  ...scriptOnlyBehaviourExamples,
  ...vanillaParityScriptExamples,
]);

/**
 * The entity behaviour examples, then the Roadside merchant (a trader, ADR 0101 D3; B481); the
 * `examples/entities` mirror holds them all in one project.
 */
export const entityBehaviourExamples: readonly ExampleProject[] = Object.freeze([
  ...mobBehaviourExamples,
  ...villagerBehaviourExamples,
]);

/** The per-kind particle examples (ADR 0081 D5): the description first, then the type. */
const [particleDescriptionExample, particleTypeExample] = particleKindExamples as [
  ExampleProject,
  ExampleProject,
];

/**
 * The per-kind examples, in gallery order: resource pack (the particle description last),
 * data pack, tags, registries, the data kinds sweep, structures, worldgen, blocks and items
 * (the particle type last), entities, models and animations, scripts, rules (the lucky block,
 * ADR 0082 D11), the vehicle, key bind and HUD examples (ADR 0091 D3), the command and creative
 * tab examples (B461), the villager profession and fluid examples (B481), the rules for
 * vanilla blocks (B518) and the six games kinds (B557).
 */
export const kindExamples: readonly ExampleProject[] = Object.freeze([
  ...resourcePackExamples,
  particleDescriptionExample,
  ...dataPackExamples,
  ...tagExamples,
  ...registryExamples,
  ...dataKindExamples,
  ...structureExamples,
  ...worldgenExamples,
  ...blocksItemsExamples,
  particleTypeExample,
  ...entityKindExamples,
  ...scriptKindExamples,
  ...rulesKindExamples,
  ...vehicleKindExamples,
  ...vanillaParityKindExamples,
  ...villagerFluidKindExamples,
  vanillaBlockRulesKindExample,
  ...gameKindExamples,
]);

/**
 * The blocks and items behaviour examples, then the container and machine examples (ADR 0076
 * D4), the portal example (ADR 0078 D4) and the firefly jar (ADR 0081 D5); the
 * `examples/blocks-items` mirror holds them all in one project.
 */
export const behaviourExamples: readonly ExampleProject[] = Object.freeze([
  ...blocksItemsBehaviourExamples,
  ...containerExamples,
  ...portalExamples,
  ...particleExamples,
  ...vanillaParityBehaviourExamples,
]);

/** The category of the starter projects in the gallery. */
export const STARTERS_CATEGORY = 'Starters';

/**
 * The starters as gallery entries, ids `starter_<starter id>`: the first four content starters,
 * then the pack starters and the rest of the starters that are not Creator flows (ADR 0129 D2).
 */
export const starterExamples: readonly ExampleProject[] = Object.freeze([
  defineExample({
    id: 'starter_custom_ore',
    title: 'Custom ore project',
    description:
      'The Custom ore starter: a real ruby ore block, the ruby item and a block of ruby, with loot, recipes, a tag, advancements and the mod metadata.',
    kind: KINDS.block,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'ore', 'mod'],
    build: customOreBundle,
  }),
  defineExample({
    id: 'starter_recipe_pack',
    title: 'Recipe pack project',
    description: 'The Recipe pack starter: one recipe of each common type and an advancement.',
    kind: KINDS.recipe,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'recipes'],
    build: recipePackBundle,
  }),
  defineExample({
    id: 'starter_music_disc',
    title: 'Custom music disc project',
    description: 'The Custom music disc starter: a jukebox song, its disc model and texture.',
    kind: KINDS.jukeboxSong,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'music', 'jukebox'],
    build: musicDiscBundle,
  }),
  defineExample({
    id: 'starter_function_starter',
    title: 'Functions project',
    description: 'The Functions starter: load and tick functions, a scoreboard and function tags.',
    kind: KINDS.function,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'functions', 'tick'],
    build: functionStarterBundle,
  }),
  defineExample({
    id: 'starter_resource_pack',
    title: 'Resource pack project',
    description:
      'The Resource pack starter: the vanilla stick gets a new model, picture and English name.',
    kind: KINDS.model,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'resource pack'],
    build: resourcePackBundle,
  }),
  defineExample({
    id: 'starter_data_pack',
    title: 'Data pack project',
    description:
      'The Data pack starter: a load message, a function to run and one crafting recipe.',
    kind: KINDS.function,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'data pack'],
    build: dataPackBundle,
  }),
  defineExample({
    id: 'starter_combined',
    title: 'Resource and data pack project',
    description:
      'The Resource and data pack starter: the painted stick plus the load message, function and recipe.',
    kind: KINDS.recipe,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'resource pack', 'data pack'],
    build: combinedBundle,
  }),
  defineExample({
    id: 'starter_custom_biome',
    title: 'Custom biome project',
    description:
      'The Custom biome starter: Amber Woods, a biome with its own tree and copper ore, and a World Type that has it.',
    kind: KINDS.biome,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'biome', 'world generation'],
    build: customBiomeBundle,
  }),
  defineExample({
    id: 'starter_jigsaw_structure',
    title: 'Jigsaw structure project',
    description:
      'The Jigsaw structure starter: a hamlet of a centre hut, streets and lamp posts joined by jigsaw blocks, placed in forests.',
    kind: KINDS.structure,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'structure', 'jigsaw'],
    build: jigsawStructureBundle,
  }),
  defineExample({
    id: 'starter_worldgen_pack',
    title: 'Biome and structure project',
    description:
      'The Custom biome with a jigsaw structure starter: Amber Woods and its World Type, with jigsaw hamlets that generate in it and in forests.',
    kind: KINDS.biome,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'biome', 'structure', 'world generation'],
    build: worldgenPackBundle,
  }),
  defineExample({
    id: 'starter_scripted_ore',
    title: 'Scripted ore project',
    description:
      'The Scripted ore starter: the ruby ore with scripts that give a bonus ruby, heal you on a block of ruby and greet joining players.',
    kind: KINDS.script,
    category: STARTERS_CATEGORY,
    tags: ['starter', 'ore', 'scripts', 'mod'],
    build: scriptedOreBundle,
  }),
]);

/** Every gallery entry, in gallery order. */
export const libraryExamples: readonly ExampleProject[] = Object.freeze([
  ...kindExamples,
  ...behaviourExamples,
  ...entityBehaviourExamples,
  ...scriptBehaviourExamples,
  ...rulesBehaviourExamples,
  ...vehicleBehaviourExamples,
  ...worldExamples,
  ...gameExamples,
  ...flowExamples,
  ...popularExamples,
  ...starterExamples,
]);
