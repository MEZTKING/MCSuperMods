/**
 * The Examples gallery (ADR 0020): one commented example per registered kind, the blocks and
 * items behaviour examples (with the container and machine examples, ADR 0076 D4, the portal
 * example, ADR 0078 D4, and the firefly jar, ADR 0081 D5), the entity behaviour examples, the
 * script behaviour examples, the rules behaviour examples (ADR 0082 D11), then the four content
 * starters as complete projects.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { KINDS } from '../content/bundle';
import {
  customOreBundle,
  functionStarterBundle,
  musicDiscBundle,
  recipePackBundle,
} from '../starters/index';
import {
  behaviourExamples as blocksItemsBehaviourExamples,
  blocksItemsExamples,
} from './blocks-items';
import { containerExamples } from './containers';
import { dataKindExamples } from './data-kinds';
import { dataPackExamples } from './data-pack';
import { defineExample } from './define';
import { entityBehaviourExamples, entityKindExamples } from './entities';
import { particleExamples, particleKindExamples } from './particles';
import { portalExamples } from './portals';
import { registryExamples } from './registries';
import { resourcePackExamples } from './resource-pack';
import { rulesBehaviourExamples, rulesKindExamples } from './rules';
import { scriptBehaviourExamples, scriptKindExamples } from './scripts';
import { structureExamples } from './structures';
import { tagExamples } from './tags';
import { worldgenExamples } from './worldgen';

export { categoryTag, defineExample, type ExampleInput } from './define';
export { entityBehaviourExamples } from './entities';
export { rulesBehaviourExamples, rulesKindExamples } from './rules';
export { scriptBehaviourExamples } from './scripts';

/** The per-kind particle examples (ADR 0081 D5): the description first, then the type. */
const [particleDescriptionExample, particleTypeExample] = particleKindExamples as [
  ExampleProject,
  ExampleProject,
];

/**
 * The per-kind examples, in gallery order: resource pack (the particle description last),
 * data pack, tags, registries, the data kinds sweep, structures, worldgen, blocks and items
 * (the particle type last), entities, models and animations, scripts, rules (the lucky block,
 * ADR 0082 D11).
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
]);

/** The category of the starter projects in the gallery. */
export const STARTERS_CATEGORY = 'Starters';

/** The content starters as gallery entries; ids are `starter_<starter id>`. */
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
]);

/** Every gallery entry, in gallery order. */
export const libraryExamples: readonly ExampleProject[] = Object.freeze([
  ...kindExamples,
  ...behaviourExamples,
  ...entityBehaviourExamples,
  ...scriptBehaviourExamples,
  ...rulesBehaviourExamples,
  ...starterExamples,
]);
