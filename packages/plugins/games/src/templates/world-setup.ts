/**
 * "New element" templates of `msm:world_setup` (ADR 0113 D2, ADR 0114 D1): one per world type
 * that needs no other element. A start structure is added in the World Setup Studio or by a
 * flow, since a template makes one element only and the start must name a structure the project
 * has.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';

/** The picker group of the games kinds. */
export const GAMES_CATEGORY = 'Games';

const template = (
  fields: Omit<ElementTemplate, 'kind' | 'category' | 'data'>,
  data: Json,
): ElementTemplate => ({
  ...fields,
  kind: 'msm:world_setup',
  category: GAMES_CATEGORY,
  defaultName: 'world_setup',
  data: () => structuredClone(data),
});

export const worldSetupTemplates: readonly ElementTemplate[] = Object.freeze([
  template(
    {
      id: 'world_setup_empty_sky',
      title: 'Empty sky world',
      description:
        'A world type of empty sky with a sky biome of your own, survival on normal; add a start island for players to stand on.',
    },
    {
      world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
      spawn_radius: 0,
      game_mode: 'survival',
      difficulty: 'normal',
      game_rules: {},
    },
  ),
  template(
    {
      id: 'world_setup_flat_build',
      title: 'Flat building world',
      description:
        'A flat world type of grass on dirt in creative, with the time and weather standing still and no mobs.',
    },
    {
      world: {
        type: 'flat',
        layers: [
          { block: 'minecraft:bedrock', height: 1 },
          { block: 'minecraft:dirt', height: 2 },
          { block: 'minecraft:grass_block', height: 1 },
        ],
        biome: 'minecraft:plains',
        nether: 'vanilla',
        end: 'vanilla',
      },
      spawn_radius: 0,
      game_mode: 'creative',
      difficulty: 'peaceful',
      game_rules: { advance_time: false, advance_weather: false, spawn_mobs: false },
    },
  ),
  template(
    {
      id: 'world_setup_sky_islands',
      title: 'Floating islands world',
      description:
        "A world type of floating islands over the overworld's biomes, survival on normal.",
    },
    {
      world: { type: 'sky_islands', nether: 'vanilla', end: 'vanilla' },
      spawn_radius: 0,
      game_mode: 'survival',
      difficulty: 'normal',
      game_rules: {},
    },
  ),
  template(
    {
      id: 'world_setup_adventure',
      title: 'Adventure in the normal world',
      description:
        'No world type of its own: players start in adventure mode on hard, keep their things when they die and get a welcome.',
    },
    {
      world: { type: 'vanilla', nether: 'vanilla', end: 'vanilla' },
      spawn_radius: 0,
      game_mode: 'adventure',
      difficulty: 'hard',
      game_rules: { keep_inventory: true },
      new_player: { message: 'Welcome! Find your way through.' },
    },
  ),
]);
