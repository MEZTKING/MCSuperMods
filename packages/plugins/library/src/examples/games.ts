/**
 * The game examples (ADR 0117 D2; B557): one game from each "Make a game" flow, with answers of
 * its own, without the pack element (an example is copied into a project that has one). Each is
 * mirrored as a project of its own under `examples/games/`. The games kinds and the goals lower
 * to plain data pack files; only the lucky block needs the Fabric mod jar export. Below them, the
 * per-kind examples of the six games kinds (`gameKindExamples`), which join the gallery's per-kind
 * examples and the `examples/all-kinds` project.
 */
import type { BundleContext, ContentBundle, ExampleProject, Json } from '@msm/plugin-api';
import { element, KINDS, rl } from '../content/bundle';
import { BoxBuilder } from '../content/structures';
import { hasFabric } from '../content/supports';
import { adventureMapBundle } from '../starters/adventure-map';
import { arenaGameBundle } from '../starters/arena-game';
import { goalsBundle } from '../starters/goals';
import { luckyBlockBundle } from '../starters/lucky-block';
import { oneBlockBundle } from '../starters/one-block';
import { raceBundle } from '../starters/race';
import { skyIslandsBundle } from '../starters/sky-islands';
import { chestLootTable, GAME_KINDS, islandTemplate, skyblockBundle } from '../starters/skyblock';
import { defineExample } from './define';

/** The gallery category of the game examples. */
export const GAMES_CATEGORY = 'Games';

/** A flow's bundle with `values`, without its pack element. */
function fromFlow(
  build: (context: BundleContext) => ContentBundle,
  values: Readonly<Record<string, Json>>,
): (context: BundleContext) => ContentBundle {
  return (context) => {
    const bundle = build({ ...context, values: { ...values } });
    return {
      elements: bundle.elements.filter((entry) => entry.kind !== KINDS.pack),
      assets: bundle.assets,
    };
  };
}

export const gameExamples: readonly ExampleProject[] = Object.freeze([
  defineExample({
    id: 'example_game_cloud_farm',
    title: 'Cloud Farm',
    description:
      'A Skyblock on a round island with a tree, food in the chest and an empty Nether too, from the Skyblock flow.',
    kind: GAME_KINDS.worldSetup,
    category: GAMES_CATEGORY,
    tags: ['game', 'skyblock', 'void'],
    build: fromFlow(skyblockBundle, {
      game_name: 'Cloud Farm',
      island: 'round',
      chest: ['lava_ice', 'seeds', 'sapling', 'bread'],
      nether: 'void',
    }),
  }),
  defineExample({
    id: 'example_game_deep_block',
    title: 'Deep Block',
    description:
      'A one block game that goes underground, into the deep dark and on to the Nether, fifty breaks a phase, from the One block flow.',
    kind: GAME_KINDS.oneBlock,
    category: GAMES_CATEGORY,
    tags: ['game', 'one block'],
    build: fromFlow(oneBlockBundle, {
      game_name: 'Deep Block',
      phases: ['underground', 'deep_dark', 'nether'],
      breaks: 50,
    }),
  }),
  defineExample({
    id: 'example_game_blossom_isles',
    title: 'Blossom Isles',
    description:
      'Islands of cherry grove floating over the void, with a start island, from the Sky islands flow.',
    kind: GAME_KINDS.worldSetup,
    category: GAMES_CATEGORY,
    tags: ['game', 'sky islands'],
    build: fromFlow(skyIslandsBundle, {
      game_name: 'Blossom Isles',
      biome: 'minecraft:cherry_grove',
    }),
  }),
  defineExample({
    id: 'example_game_star_block',
    title: 'Star Block',
    description:
      'A blue lucky block with a star on it that often builds a hut, sometimes drops prizes and rarely brings a creeper, from the Lucky block flow.',
    kind: KINDS.block,
    category: GAMES_CATEGORY,
    tags: ['game', 'lucky block', 'rules', 'mod'],
    supports: hasFabric,
    build: fromFlow(luckyBlockBundle, {
      block_name: 'Star Block',
      loot: 'sometimes',
      mob: 'rarely',
      mob_kind: 'minecraft:creeper',
      explosion: 'never',
      building: 'often',
      effect: 'sometimes',
      effect_kind: 'minecraft:jump_boost',
      colour: '#3c78d8',
      mark: 'star',
    }),
  }),
  defineExample({
    id: 'example_game_crystal_road',
    title: 'Crystal Road',
    description:
      'An adventure map on flat land with a welcome screen, always day, no monsters, four checkpoints and goals, from the Adventure map flow.',
    kind: GAME_KINDS.worldSetup,
    category: GAMES_CATEGORY,
    tags: ['game', 'adventure map', 'rules'],
    build: fromFlow(adventureMapBundle, {
      map_name: 'Crystal Road',
      world: 'flat',
      welcome: 'dialog',
      welcome_text: 'Follow the crystal road to its end. The checkpoints keep your place.',
      game_rules: ['always_day', 'no_monsters', 'keep_inventory'],
      checkpoints: 4,
    }),
  }),
  defineExample({
    id: 'example_game_four_kingdoms',
    title: 'Four Kingdoms',
    description:
      'Four teams with bows in a large quartz arena, three-minute rounds and ten defeats to win, from the Arena game flow.',
    kind: GAME_KINDS.team,
    category: GAMES_CATEGORY,
    tags: ['game', 'arena', 'teams'],
    build: fromFlow(arenaGameBundle, {
      game_name: 'Four Kingdoms',
      teams: '4',
      size: 'large',
      floor: 'minecraft:quartz_block',
      minutes: 3,
      win_score: 10,
      kit: 'bow',
    }),
  }),
  defineExample({
    id: 'example_game_canyon_dash',
    title: 'Canyon Dash',
    description:
      'A race through three checkpoints against a ninety-second time limit, with the best times on the sidebar, from the Race flow.',
    kind: GAME_KINDS.area,
    category: GAMES_CATEGORY,
    tags: ['game', 'race', 'timer', 'rules'],
    build: fromFlow(raceBundle, {
      race_name: 'Canyon Dash',
      checkpoints: 3,
      count: 'down',
      limit: 90,
    }),
  }),
  defineExample({
    id: 'example_game_explorer',
    title: 'Explorer',
    description:
      'A tab of goals for travellers: a desert, an ocean, the heights and the depths, the Nether and the End, with a green timer on the tab, from the Goals flow.',
    kind: KINDS.advancement,
    category: GAMES_CATEGORY,
    tags: ['game', 'goals', 'advancements'],
    build: fromFlow(goalsBundle, {
      tab_name: 'Explorer',
      goals: [
        'visit_desert',
        'visit_ocean',
        'reach_sky',
        'reach_deep',
        'visit_nether',
        'visit_end',
      ],
      icon: 'timer',
      icon_colour: '#3c9a48',
      background: 'husbandry',
    }),
  }),
]);

/** The gallery category of the per-kind examples of the games kinds. */
const GAME_KITS_CATEGORY = 'Game kits';

/**
 * The per-kind examples of the six games kinds (ADR 0113 D2 to D7): a world setup, a one block,
 * a team, an objective, a timer and an area. Their ids start with `example_` so they sit beside
 * every other per-kind example in the `examples/all-kinds` project, which holds at most one
 * world setup.
 */
export const gameKindExamples: readonly ExampleProject[] = Object.freeze([
  defineExample({
    id: 'example_msm_world_setup',
    title: 'World setup: an island in the sky',
    description:
      'How a world starts: a World Type of empty sky, a tiny island placed at the first join, the spawn on it and a welcome for each new player.',
    kind: GAME_KINDS.worldSetup,
    category: GAME_KITS_CATEGORY,
    tags: ['world_setup', 'void', 'first join', 'kit'],
    build: ({ namespace }) => {
      const template = rl(namespace, 'example_sky_island');
      const loot = rl(namespace, 'example_sky_island_chest');
      const island = islandTemplate('tiny', loot);
      return {
        elements: [
          element(
            rl(namespace, 'example_world_setup'),
            GAME_KINDS.worldSetup,
            {
              world: { type: 'void', nether: 'vanilla', end: 'vanilla' },
              start: { structure: template, at: [0, 64, 0], spawn: [...island.spawn] },
              spawn_radius: 0,
              game_mode: 'survival',
              difficulty: 'normal',
              game_rules: { spawn_phantoms: false },
              new_player: {
                items: [{ item: 'minecraft:bread', count: 4 }],
                message: 'Welcome! Do not fall.',
              },
            },
            `How the world starts, once: world.type void makes a World Type of empty sky called Example World Setup on the Create New World screen. When the first player joins, start places ${template} with its corner at 0 64 0, sets the world spawn on it and sends the player there. game_rules are set when the world first starts (no phantoms here). new_player gives each player four bread and a welcome, once, by an advancement on their first tick. It all lowers to plain data pack files under msm_games/.`,
          ),
          element(
            template,
            KINDS.structureTemplate,
            island.data,
            `The start: ${island.words}, its chest filling from ${loot}.`,
          ),
          element(
            loot,
            KINDS.lootTable,
            chestLootTable([
              { item: 'minecraft:lava_bucket', count: 1 },
              { item: 'minecraft:ice', count: 2 },
            ]),
            'The chest of the island: a lava bucket and two ice, for a cobblestone generator.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_one_block',
    title: 'One block: grass, then stone',
    description:
      'A block at 0 100 0 that turns into the next block each time it is broken: grass and wood for 50 breaks, then stone and ores, then again.',
    kind: GAME_KINDS.oneBlock,
    category: GAME_KITS_CATEGORY,
    tags: ['one_block', 'phases'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'example_one_block'),
          GAME_KINDS.oneBlock,
          {
            at: [0, 100, 0],
            phases: [
              {
                name: 'Meadow',
                breaks: 50,
                blocks: [
                  { block: 'minecraft:grass_block', weight: 3 },
                  { block: 'minecraft:oak_log', weight: 2 },
                ],
                mobs: [{ mob: 'minecraft:sheep', weight: 1 }],
                mob_chance: 0.05,
                chest_chance: 0,
              },
              {
                name: 'Mine',
                breaks: 100,
                blocks: [
                  { block: 'minecraft:stone', weight: 8 },
                  { block: 'minecraft:iron_ore', weight: 1 },
                ],
                mob_chance: 0,
                chest_chance: 0.02,
                chest_loot: 'minecraft:chests/simple_dungeon',
              },
            ],
            loop: true,
            announce: true,
          },
          'A one block: each time the block at 0 100 0 is broken, a tick function sets the next block of its phase, picked by weight. The first phase lasts 50 breaks and now and then brings a sheep; the second 100 breaks, with a dungeon chest now and then. announce says each phase in chat, and loop starts again after the last. It runs in a vanilla data pack.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_team',
    title: 'Team: the gold team',
    description:
      'A team with gold names and a star before them, whose players cannot hurt each other.',
    kind: GAME_KINDS.team,
    category: GAME_KITS_CATEGORY,
    tags: ['team', 'colour'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'example_gold_team'),
          GAME_KINDS.team,
          {
            name: 'Gold',
            colour: 'gold',
            friendly_fire: false,
            see_invisible_friends: true,
            name_tags: 'hideForOtherTeams',
            collision: 'pushOtherTeams',
            prefix: '* ',
          },
          'A team, made when the world loads if it is missing; its options are set on every load. Its players have gold names with a star before them, cannot hurt each other and see each other when invisible. Other teams do not see their name tags, and they push only other teams. Put players on it with /team join or the Rules step Join a team.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_objective',
    title: 'Objective: coins on the sidebar',
    description: 'A score shown on the right of the screen, changed by commands and Rules.',
    kind: GAME_KINDS.objective,
    category: GAME_KITS_CATEGORY,
    tags: ['objective', 'sidebar', 'scoreboard'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'example_coins'),
          GAME_KINDS.objective,
          {
            criterion: 'dummy',
            name: 'Coins',
            display: 'sidebar',
            render: 'integer',
            number_format: { type: 'styled', colour: 'yellow', bold: true },
          },
          `A scoreboard objective, made when the world loads if it is missing, named ${namespace}.example_coins in commands. The criterion dummy means only commands and Rules change it. It shows on the sidebar with yellow bold numbers. Change a player's coins with /scoreboard players add or the Rules step Add to a score.`,
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_timer',
    title: 'Timer: a one-minute countdown',
    description:
      'One minute counting down on a blue boss bar, started when the world starts, again and again.',
    kind: GAME_KINDS.timer,
    category: GAME_KITS_CATEGORY,
    tags: ['timer', 'boss bar', 'countdown'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'example_countdown'),
          GAME_KINDS.timer,
          {
            name: 'Next wave',
            seconds: 60,
            count: 'down',
            show: 'boss_bar',
            colour: 'blue',
            repeat: true,
            starts: 'world_start',
          },
          'A timer in whole seconds, shared by every player: one minute counting down on a blue boss bar named Next wave. It starts when the world first starts and, with repeat, starts again whenever the time is up. A function in on_end, or a rule on "The time is up", says what happens then. It runs in a vanilla data pack.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_area',
    title: 'Area: a pen rebuilt on reset',
    description: 'A box that knows when players walk in or out, and rebuilds its fence when reset.',
    kind: GAME_KINDS.area,
    category: GAME_KITS_CATEGORY,
    tags: ['area', 'reset', 'enter', 'leave'],
    build: ({ namespace }) => {
      const fence = rl(namespace, 'example_pen_fence');
      const builder = new BoxBuilder([7, 2, 7]);
      builder.fill([0, 0, 0], [6, 0, 6], 'minecraft:grass_block[snowy=false]');
      for (let x = 0; x < 7; x += 1) {
        for (let z = 0; z < 7; z += 1) {
          const edge = x === 0 || z === 0 || x === 6 || z === 6;
          builder.set(
            [x, 1, z],
            edge
              ? 'minecraft:oak_fence[east=false,north=false,south=false,waterlogged=false,west=false]'
              : 'minecraft:air',
          );
        }
      }
      return {
        elements: [
          element(
            rl(namespace, 'example_pen'),
            GAME_KINDS.area,
            {
              name: 'Pen',
              dimension: 'minecraft:overworld',
              from: [20, 64, 20],
              to: [26, 66, 26],
              reset: { structures: [{ structure: fence, at: [20, 64, 20] }] },
            },
            `An area: a box of the overworld from 20 64 20 to 26 66 26, both corners inside. Its tick function tags the players who walk in and runs the hook a rule listens to, and the same when they walk out. Resetting it removes the mobs and items in it and places ${fence} again. Run the reset with /function ${namespace}:msm_games/area/example_pen/reset or the Rules step Rebuild an area.`,
          ),
          element(
            fence,
            KINDS.structureTemplate,
            builder.build(),
            'The pen: grass with an oak fence round it and air inside, so placing it again clears the pen.',
          ),
        ],
        assets: [],
      };
    },
  }),
]);
