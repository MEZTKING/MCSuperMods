/**
 * The world setup cases (B551) the goldens, the checker and the generated ids test lower: each
 * world type, both start routes and every new-player option.
 */
import type { Json } from '@msm/plugin-api';

/** The cases, by golden name. */
export const WORLD_SETUP_CASES: Readonly<Record<string, Json>> = {
  // A void Skyblock: start at the first join, a kit, effects, a message, goals and a dialog.
  skyblock: {
    world: { type: 'void', nether: 'vanilla', end: 'void' },
    start: { structure: 'sky:island', at: [0, 64, 0], spawn: [2, 3, 2] },
    spawn_radius: 0,
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: { keep_inventory: true, 'minecraft:spawn_wandering_traders': true },
    new_player: {
      items: [
        { item: 'minecraft:lava_bucket', count: 1 },
        { item: 'minecraft:ice', count: 2, slot: 'hotbar.1' },
      ],
      message: 'Welcome to "Sky" block!',
      dialog: 'minecraft:server_links',
      effects: [{ effect: 'minecraft:slow_falling', seconds: 30, hide_particles: true }],
    },
    goals: 'sky:goals/root',
  },
  // A flat world, its own biome, a loot table kit and a wider respawn area.
  flat: {
    world: {
      type: 'flat',
      layers: [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:sandstone', height: 3 },
      ],
      biome: 'minecraft:desert',
      nether: 'void',
      end: 'vanilla',
    },
    spawn_radius: 10,
    game_mode: 'adventure',
    difficulty: 'hard',
    game_rules: { respawn_radius: 4, max_block_modifications: 32768 },
    new_player: { loot_table: 'minecraft:chests/simple_dungeon' },
  },
  // Sky islands with the start placed while the world generates (Advanced).
  islands_worldgen: {
    world: { type: 'sky_islands', nether: 'vanilla', end: 'vanilla' },
    start: { structure: 'sky:island', spawn: [2, 3, 2], when: 'world_generation' },
    game_mode: 'survival',
    difficulty: 'easy',
    game_rules: {},
  },
  // A void world with the start placed while it generates: listed in `structure_overrides`.
  void_worldgen: {
    world: { type: 'void', biome: 'minecraft:plains', nether: 'void', end: 'void' },
    start: { structure: 'sky:island', at: [0, 80, 0], spawn: [2, 3, 2], when: 'world_generation' },
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: {},
  },
  // The game's own world: setup only.
  vanilla: {
    world: { type: 'vanilla', nether: 'vanilla', end: 'vanilla' },
    game_mode: 'creative',
    difficulty: 'peaceful',
    game_rules: { advance_time: false },
  },
  // A project preset: only its `#minecraft:normal` entry.
  preset: {
    world: { type: 'preset', preset: 'sky:my_preset', nether: 'vanilla', end: 'vanilla' },
    game_mode: 'survival',
    difficulty: 'normal',
    game_rules: {},
  },
};
