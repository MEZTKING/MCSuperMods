/**
 * The Sky islands Creator flow (ADR 0117 D2, ADR 0114 D1; B557): a World Type of islands floating
 * over the void, of the overworld's biomes or of one biome, with a start island of the Skyblock
 * flow at the spawn (on by default; without it the game kits warn that new players may fall).
 *
 * It makes a `msm:world_setup` of the type `sky_islands` (the floating-islands noise settings of
 * the target's world facts over the overworld's biomes, or one fixed biome). "Islands like the
 * End's" uses the target's End-like noise settings through a World Type of the project's own (a
 * `minecraft:worldgen/world_preset` the setup names) where the target has measured them, and
 * floating islands with land where it has not (said in the notes). Everything lowers to plain
 * data pack files.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  stringValue,
} from '../content/parameters';
import type { Pos } from '../content/structures';
import { CHEST_CHOICES, chestLootTable, GAME_KINDS, islandTemplate } from './skyblock';

/** The biomes the islands can have. */
export const SKY_ISLAND_BIOMES: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'overworld', label: "The overworld's biomes" },
  { value: 'minecraft:plains', label: 'Plains' },
  { value: 'minecraft:cherry_grove', label: 'Cherry grove' },
  { value: 'minecraft:snowy_plains', label: 'Snowy plains' },
  { value: 'minecraft:desert', label: 'Desert' },
  { value: 'minecraft:jungle', label: 'Jungle' },
  { value: 'minecraft:mushroom_fields', label: 'Mushroom fields (no monsters)' },
]);

/** The Sky islands flow's questions, groups "Game" and "Islands". */
export const SKY_ISLANDS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'game_name',
    label: 'What is your world called?',
    description: 'The World Type has this name on the Create New World screen.',
    group: 'Game',
    type: 'string',
    default: 'Sky Islands',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'islands',
    label: 'The islands',
    group: 'Islands',
    type: 'choice',
    default: 'floating',
    choices: [
      { value: 'floating', label: 'Floating islands with land' },
      { value: 'end', label: "Islands like the End's" },
    ],
  },
  {
    id: 'biome',
    label: 'Biomes',
    group: 'Islands',
    type: 'choice',
    default: 'overworld',
    choices: SKY_ISLAND_BIOMES.map((biome) => ({ ...biome })),
  },
  {
    id: 'start_island',
    label: 'Start island',
    description:
      'A small island with a tree and a chest where players start, high above the others. Without it players start wherever the game finds land, or fall.',
    group: 'Islands',
    type: 'boolean',
    default: true,
  },
]);

/** Where the start island goes: above the floating islands. */
const START_AT: Pos = [0, 160, 0];

export function skyIslandsBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName, target } = context;
  const values = readValues(SKY_ISLANDS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'game_name'));
  const id = name.id;
  const biome = stringValue(values, 'biome');
  const oneBiome = biome !== 'overworld' ? biome : undefined;
  const endSettings =
    stringValue(values, 'islands') === 'end' ? target.worlds?.endLikeSettings : undefined;
  const wantsEnd = stringValue(values, 'islands') === 'end';
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.display}, sky islands`),
  ];
  const world: JsonObject = { type: 'sky_islands', nether: 'vanilla', end: 'vanilla' };
  if (oneBiome !== undefined) world.biome = oneBiome;
  let typeWords = `islands floating over the void, ${oneBiome === undefined ? "with the overworld's biomes" : `all ${SKY_ISLAND_BIOMES.find((entry) => entry.value === oneBiome)?.label.toLowerCase() ?? oneBiome}`}`;
  if (endSettings !== undefined) {
    const preset = rl(namespace, `${id}_islands`);
    elements.push(
      element(
        preset,
        KINDS.worldPreset,
        {
          dimensions: {
            'minecraft:overworld': {
              type: 'minecraft:overworld',
              generator: {
                type: 'minecraft:noise',
                settings: endSettings,
                biome_source: { type: 'minecraft:fixed', biome: oneBiome ?? 'minecraft:plains' },
              },
            },
            'minecraft:the_nether': {
              type: 'minecraft:the_nether',
              generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:nether',
                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
              },
            },
            'minecraft:the_end': {
              type: 'minecraft:the_end',
              generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:end',
                biome_source: { type: 'minecraft:the_end' },
              },
            },
          },
        },
        `The world's land: islands like the End's (the noise settings ${endSettings}) with the biome ${oneBiome ?? 'minecraft:plains'}. The world setup names it, so it is the World Type.`,
      ),
    );
    world.type = 'preset';
    world.preset = preset;
    delete world.biome;
    typeWords = "islands like the End's";
  } else if (wantsEnd) {
    typeWords +=
      " (islands like the End's need the target's End-like noise settings, which are not measured yet, so these are floating islands with land)";
  }
  const setup: JsonObject = {
    world,
    spawn_radius: 0,
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: {},
  };
  let startWords = 'no start island: players start wherever the game finds land';
  if (booleanValue(values, 'start_island')) {
    const chestLoot = rl(namespace, `${id}/start_chest`);
    const island = islandTemplate('classic', chestLoot);
    const template = rl(namespace, `${id}/island`);
    const items = CHEST_CHOICES.filter((choice) =>
      ['seeds', 'sapling', 'bread'].includes(choice.value),
    ).flatMap((choice) => choice.items);
    elements.push(
      element(
        template,
        KINDS.structureTemplate,
        island.data,
        `The start island: ${island.words}, drawn from vanilla blocks named by id. Its chest names its block entity id and the loot table ${chestLoot}.`,
      ),
      element(
        chestLoot,
        KINDS.lootTable,
        chestLootTable(items),
        'What the start chest holds: seeds, a sapling and bread, one pool each.',
      ),
    );
    setup.start = { structure: template, at: [...START_AT], spawn: [...island.spawn] };
    setup.new_player = {
      effects: [{ effect: 'minecraft:slow_falling', seconds: 10, hide_particles: true }],
    };
    startWords = `the start island ${template} high above the others at ${START_AT.join(' ')}, placed when the first player joins, with the spawn on it and ten seconds of slow falling for each new player`;
  }
  elements.splice(
    1,
    0,
    element(
      rl(namespace, id),
      GAME_KINDS.worldSetup,
      setup,
      `How the world starts: a World Type called ${name.display} of ${typeWords}, listed on the Create New World screen, and ${startWords}. Everything lowers to plain data pack files.`,
    ),
  );
  return { elements, assets: [] };
}
