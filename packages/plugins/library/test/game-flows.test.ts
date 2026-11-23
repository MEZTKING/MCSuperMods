/**
 * The game flows (ADR 0117 D2, D3; B557): Skyblock, One block, Sky islands, Lucky block, Adventure
 * map, Arena game, Race and Goals, in the Creator group `games`; the islands drawn from vanilla
 * blocks with the chest's block entity `id`; readable world setup ids; the lucky block's random
 * pick and its drawn picture; the functions and advancements that call the games kinds by their
 * generated names; and the pictures they draw following the pixel rules (`checkArtRules`).
 * Validation and export with the real plugins on both targets (zero problems) live in
 * `packages/exporters/test/library.test.ts`, which also pins the `examples/` mirror.
 */

import { inflateSync } from 'node:zlib';
import type { ContentBundle, ContentBundleElement, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  type ArtRecipeId,
  artLookPng,
  artPixels,
  artRecipeInfo,
  checkArtRules,
  GAME_FLOW_IDS,
  GAME_KINDS,
  libraryStarters,
  type Rgb,
} from '../src/index';
import { adventureMapBundle } from '../src/starters/adventure-map';
import { arenaGameBundle } from '../src/starters/arena-game';
import { goalsBundle } from '../src/starters/goals';
import { luckyBlockBundle } from '../src/starters/lucky-block';
import { oneBlockBundle } from '../src/starters/one-block';
import { raceBundle } from '../src/starters/race';
import { skyIslandsBundle } from '../src/starters/sky-islands';
import { islandTemplate, skyblockBundle } from '../src/starters/skyblock';

type Build = (context: Parameters<typeof skyblockBundle>[0]) => ContentBundle;

const run = (
  build: Build,
  values: Record<string, Json> = {},
  bundle = builtInTargets[0] as (typeof builtInTargets)[number],
): ContentBundle =>
  build({ namespace: 'demo', projectName: 'Demo', target: bundle.target, values });

const find = (bundle: ContentBundle, id: string): ContentBundleElement => {
  const found = bundle.elements.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const data = (bundle: ContentBundle, id: string): JsonObject => find(bundle, id).data as JsonObject;
const ofKind = (bundle: ContentBundle, kind: string): ContentBundleElement[] =>
  bundle.elements.filter((entry) => entry.kind === kind);
const lines = (bundle: ContentBundle, id: string): string[] => data(bundle, id).lines as string[];

const FLOWS: readonly [string, Build][] = [
  ['skyblock', skyblockBundle],
  ['one-block', oneBlockBundle],
  ['sky-islands', skyIslandsBundle],
  ['lucky-block', luckyBlockBundle],
  ['adventure-map', adventureMapBundle],
  ['arena-game', arenaGameBundle],
  ['race', raceBundle],
  ['goals', goalsBundle],
];

describe('the game flows (ADR 0117 D2)', () => {
  it('are the eight Creator flows of the group games, in Home order', () => {
    const games = libraryStarters.filter((starter) => starter.creator?.group === 'games');
    expect(games.map((starter) => starter.id)).toEqual([...GAME_FLOW_IDS]);
    expect(FLOWS.map(([id]) => id)).toEqual([...GAME_FLOW_IDS]);
    for (const starter of games) {
      expect(starter.parameters?.length ?? 0, starter.id).toBeGreaterThan(0);
      expect(starter.creator?.blurb, starter.id).toMatch(/^[A-Z].*\.$/);
    }
    // Only the lucky block needs the Fabric mod jar (a block of its own and Rules, limit M1).
    expect(games.filter((starter) => starter.supports !== undefined).map((s) => s.id)).toEqual([
      'lucky-block',
    ]);
  });

  it.each(FLOWS)('%s gives unique element ids and asset paths, on both targets', (_id, build) => {
    for (const bundle of builtInTargets) {
      const built = run(build, {}, bundle);
      const ids = built.elements.map((entry) => entry.id);
      expect(new Set(ids).size, ids.join(' ')).toBe(ids.length);
      const paths = built.assets.map((asset) => `${asset.namespace}/${asset.path}`);
      expect(new Set(paths).size).toBe(paths.length);
      for (const entry of built.elements) {
        if (entry.kind !== 'minecraft:pack_mcmeta')
          expect(entry.notes ?? '', entry.id).not.toBe('');
      }
    }
  });

  it('gives a world setup a readable id from the game name, which names the World Type', () => {
    for (const [build, values, id] of [
      [skyblockBundle, { game_name: 'Cloud Farm' }, 'demo:cloud_farm'],
      [oneBlockBundle, { game_name: 'Deep One' }, 'demo:deep_one'],
      [skyIslandsBundle, { game_name: 'High Isles' }, 'demo:high_isles'],
      [adventureMapBundle, { map_name: 'Lost Temple' }, 'demo:lost_temple'],
    ] as const) {
      const setups = ofKind(run(build, values), GAME_KINDS.worldSetup);
      expect(setups.map((entry) => entry.id)).toEqual([id]);
    }
    for (const build of [luckyBlockBundle, arenaGameBundle, raceBundle, goalsBundle]) {
      expect(ofKind(run(build), GAME_KINDS.worldSetup)).toEqual([]);
    }
  });
});

describe('Skyblock', () => {
  it('makes a void world whose start is the island, placed at the first join', () => {
    const built = run(skyblockBundle);
    const setup = data(built, 'demo:sky_survival');
    expect(setup.world).toEqual({ type: 'void', nether: 'vanilla', end: 'vanilla' });
    expect(setup.start).toEqual({
      structure: 'demo:sky_survival/island',
      at: [0, 64, 0],
      spawn: [5, 3, 3],
    });
    expect(setup.goals).toBe('demo:sky_survival/goals/root');
    expect(ofKind(built, 'minecraft:villager_trade')).toHaveLength(6);
    expect(data(built, 'minecraft:wandering_trader/common').values).toHaveLength(6);
    expect(ofKind(built, 'minecraft:recipe')).toHaveLength(2);
    // Mobs off: the void biome of the target, which spawns nothing.
    const quiet = data(run(skyblockBundle, { mobs: false, nether: 'void' }), 'demo:sky_survival');
    expect(quiet.world).toEqual({
      type: 'void',
      nether: 'void',
      end: 'vanilla',
      biome: 'minecraft:the_void',
    });
  });

  it('draws every island from vanilla blocks, the chest naming its id and loot table', () => {
    for (const shape of ['classic', 'round', 'tiny']) {
      const island = islandTemplate(shape, 'demo:x/start_chest');
      const template = island.data as JsonObject;
      const palette = template.palette as string[];
      for (const state of palette) expect(state, shape).toMatch(/^minecraft:[a-z_]+(\[.*\])?$/);
      expect(template.block_entities).toEqual([
        { pos: island.chest, nbt: '{LootTable:"demo:x/start_chest",id:"minecraft:chest"}' },
      ]);
      const blocks = template.blocks as [number, number, number, number][];
      const at = (x: number, y: number, z: number): string | undefined => {
        const cell = blocks.find(([bx, by, bz]) => bx === x && by === y && bz === z);
        return cell === undefined ? undefined : palette[cell[3]];
      };
      const [sx, sy, sz] = island.spawn;
      // The player stands in air (structure void) on grass.
      expect(at(sx, sy, sz), shape).toBeUndefined();
      expect(at(sx, sy - 1, sz), shape).toMatch(/^minecraft:grass_block/);
      for (const axis of [0, 2]) expect(island.size[axis] ?? 99).toBeLessThanOrEqual(48);
    }
  });

  it('fills the chest with the answers, a lava bucket and ice by default', () => {
    const table = data(run(skyblockBundle), 'demo:sky_survival/start_chest');
    const names = (table.pools as JsonObject[]).map(
      (pool) => ((pool.entries as JsonObject[])[0] as JsonObject).name,
    );
    expect(names).toEqual([
      'minecraft:lava_bucket',
      'minecraft:ice',
      'minecraft:wheat_seeds',
      'minecraft:oak_sapling',
      'minecraft:bone_meal',
    ]);
  });

  it('adds a liquid of its own for a generator, its bucket in the chest', () => {
    const built = run(skyblockBundle, { generator: true, generator_makes: 'obsidian' });
    const fluid = data(built, 'demo:sky_lava');
    expect(find(built, 'demo:sky_lava').kind).toBe('msm:fluid');
    expect(fluid.mixing).toEqual([
      { with: 'water', source: 'minecraft:obsidian', flowing: 'minecraft:cobblestone' },
    ]);
    const names = (data(built, 'demo:sky_survival/start_chest').pools as JsonObject[]).map(
      (pool) => ((pool.entries as JsonObject[])[0] as JsonObject).name,
    );
    expect(names).toContain('demo:sky_lava_bucket');
    expect(built.elements.filter((entry) => entry.kind === 'minecraft:pack_mcmeta')).toHaveLength(
      1,
    );
  });

  it('leaves the start out for my own building', () => {
    const setup = data(run(skyblockBundle, { island: 'own' }), 'demo:sky_survival');
    expect(setup.start).toBeUndefined();
  });
});

describe('One block', () => {
  it('puts the magic block where the start is, with the phases picked in order', () => {
    const built = run(oneBlockBundle, { phases: ['end', 'plains'], breaks: 30 });
    const setup = data(built, 'demo:one_block');
    const block = data(built, 'demo:one_block/magic_block');
    expect((setup.start as JsonObject).at).toEqual(block.at);
    expect((setup.start as JsonObject).spawn).toEqual([0, 1, 0]);
    expect((block.phases as JsonObject[]).map((phase) => [phase.name, phase.breaks])).toEqual([
      ['Plains', 30],
      ['End', 30],
    ]);
    const vanilla = run(oneBlockBundle, { world: 'vanilla', mobs: false, chests: false });
    expect((data(vanilla, 'demo:one_block').world as JsonObject).type).toBe('vanilla');
    for (const phase of data(vanilla, 'demo:one_block/magic_block').phases as JsonObject[]) {
      expect([phase.mob_chance, phase.chest_chance, phase.mobs, phase.chest_loot]).toEqual([
        0,
        0,
        undefined,
        undefined,
      ]);
    }
  });
});

describe('Sky islands', () => {
  it('makes a sky islands world with a start island, or of one biome', () => {
    const setup = data(run(skyIslandsBundle), 'demo:sky_islands');
    expect(setup.world).toEqual({ type: 'sky_islands', nether: 'vanilla', end: 'vanilla' });
    expect((setup.start as JsonObject).at).toEqual([0, 160, 0]);
    const one = data(
      run(skyIslandsBundle, { biome: 'minecraft:jungle', start_island: false }),
      'demo:sky_islands',
    );
    expect((one.world as JsonObject).biome).toBe('minecraft:jungle');
    expect(one.start).toBeUndefined();
  });

  it("uses floating islands for the End's islands until the target measures them", () => {
    for (const bundle of builtInTargets) {
      const built = run(skyIslandsBundle, { islands: 'end' }, bundle);
      const world = data(built, 'demo:sky_islands').world as JsonObject;
      if (bundle.target.worlds?.endLikeSettings === undefined) {
        expect(world.type).toBe('sky_islands');
        expect(find(built, 'demo:sky_islands').notes).toMatch(/not measured yet/);
      } else {
        expect(world).toMatchObject({ type: 'preset', preset: 'demo:sky_islands_islands' });
      }
    }
  });
});

describe('Lucky block', () => {
  it('picks one outcome at random by weight when the block is broken', () => {
    const built = run(luckyBlockBundle);
    const book = data(built, 'demo:lucky_block_rules');
    const rule = (book.rules as JsonObject[])[0] as JsonObject;
    expect(rule.when).toEqual({ subject: 'demo:lucky_block', trigger: 'block_broken' });
    const pick = (rule.do as JsonObject[])[0] as JsonObject;
    expect(pick.step).toBe('pick_random');
    expect((pick.do as JsonObject[]).map((step) => step.step)).toEqual([
      'drop_loot',
      'spawn_mob',
      'explode',
      'place_structure',
      'give_effect',
    ]);
    expect(pick.weights).toEqual([6, 3, 1, 3, 3]);
    expect(data(built, 'demo:lucky_block').loot).toBeUndefined();
    // Never: left out; the building only when it can happen.
    const plain = run(luckyBlockBundle, { building: 'never', mob: 'never' });
    const steps = (
      ((data(plain, 'demo:lucky_block_rules').rules as JsonObject[])[0] as JsonObject)
        .do as JsonObject[]
    )[0] as JsonObject;
    expect((steps.do as JsonObject[]).map((step) => step.step)).toEqual([
      'drop_loot',
      'explode',
      'give_effect',
    ]);
    expect(plain.elements.some((entry) => entry.id === 'demo:lucky_block/surprise_hut')).toBe(
      false,
    );
    // All never: the prizes still drop.
    const none = run(luckyBlockBundle, {
      loot: 'never',
      mob: 'never',
      explosion: 'never',
      building: 'never',
      effect: 'never',
    });
    const only = (
      ((data(none, 'demo:lucky_block_rules').rules as JsonObject[])[0] as JsonObject)
        .do as JsonObject[]
    )[0] as JsonObject;
    expect(only.weights).toEqual([1]);
  });

  it('draws its picture with the lucky block recipe in its colour and mark', () => {
    const star = run(luckyBlockBundle, { colour: '#3c78d8', mark: 'star' });
    const question = run(luckyBlockBundle, { colour: '#3c78d8' });
    const bytes = (bundle: ContentBundle) =>
      Buffer.from(
        bundle.assets.find((entry) => entry.path === 'textures/block/lucky_block.png')?.bytes ??
          new Uint8Array(),
      );
    expect(bytes(star).length).toBeGreaterThan(0);
    expect(bytes(star).equals(bytes(question))).toBe(false);
  });
});

describe('Adventure map', () => {
  it('starts in adventure mode with the game rules, a welcome and checkpoints', () => {
    const built = run(adventureMapBundle, { welcome: 'dialog', checkpoints: 2 });
    const setup = data(built, 'demo:lost_temple');
    expect(setup.game_mode).toBe('adventure');
    expect(setup.game_rules).toEqual({ keep_inventory: true, mob_griefing: false });
    expect((setup.new_player as JsonObject).dialog).toBe('demo:lost_temple/welcome');
    expect(ofKind(built, GAME_KINDS.area).map((entry) => entry.id)).toEqual([
      'demo:lost_temple/checkpoint_1',
      'demo:lost_temple/checkpoint_2',
    ]);
    // Each checkpoint's goal is granted in its area (the area's entity tag) and sets the spawn.
    const goal = data(built, 'demo:lost_temple/goals/checkpoint_2');
    expect(goal.rewards).toEqual({ function: 'demo:lost_temple/reached_checkpoint_2' });
    expect(JSON.stringify(goal.criteria)).toContain('demo.area.lost_temple.checkpoint_2');
    expect(lines(built, 'demo:lost_temple/reached_checkpoint_2')).toContain('spawnpoint @s ~ ~ ~');
    // No rule book: it all works in a vanilla data pack.
    expect(ofKind(built, GAME_KINDS.rules)).toEqual([]);
    // Without goals the checkpoints are hidden advancements with the same reward.
    const hidden = run(adventureMapBundle, { goals: false });
    expect(data(hidden, 'demo:lost_temple/checkpoints/checkpoint_1').display).toBeUndefined();
  });
});

describe('Arena game', () => {
  it('makes teams, points, a round timer and an arena its functions start and rebuild', () => {
    const built = run(arenaGameBundle, { teams: '3' });
    expect(ofKind(built, GAME_KINDS.team).map((entry) => entry.id)).toEqual([
      'demo:arena/red',
      'demo:arena/blue',
      'demo:arena/green',
    ]);
    expect(data(built, 'demo:arena/round')).toMatchObject({
      seconds: 300,
      count: 'down',
      show: 'boss_bar',
      on_end: 'demo:arena/round_end',
    });
    const area = data(built, 'demo:arena/arena');
    expect(area.reset).toEqual({
      structures: [{ structure: 'demo:arena/arena_build', at: [-12, 100, -12] }],
    });
    const start = lines(built, 'demo:arena/start');
    expect(start).toContain('team join demo.arena.green @r[team=]');
    expect(start).toContain('function demo:msm_games/area/arena/arena/reset');
    expect(start).toContain('function demo:msm_games/timer/arena/round/start');
    expect(lines(built, 'demo:arena/round_end').join('\n')).toContain('demo.arena.points=5..');
    const size = data(built, 'demo:arena/arena_build').size as number[];
    expect(size).toEqual([24, 5, 24]);
  });
});

describe('Race', () => {
  it('times a run from the start to the finish with hidden advancements on the areas', () => {
    const built = run(raceBundle);
    expect(ofKind(built, GAME_KINDS.area).map((entry) => entry.id)).toEqual([
      'demo:sky_sprint/start',
      'demo:sky_sprint/checkpoint_1',
      'demo:sky_sprint/checkpoint_2',
      'demo:sky_sprint/finish',
    ]);
    const start = data(built, 'demo:sky_sprint/lines/start');
    expect(start.rewards).toEqual({ function: 'demo:sky_sprint/started' });
    expect(JSON.stringify(start.criteria)).toContain('demo.area.sky_sprint.start');
    expect(lines(built, 'demo:sky_sprint/started')).toEqual([
      '# The start line of Sky Sprint: run as a runner standing in the start',
      'function demo:msm_games/timer/sky_sprint/clock/start',
      'advancement revoke @s only demo:sky_sprint/lines/checkpoint_1',
      'advancement revoke @s only demo:sky_sprint/lines/checkpoint_2',
      'advancement revoke @s only demo:sky_sprint/lines/finish',
      'advancement revoke @s only demo:sky_sprint/lines/start',
    ]);
    const finished = lines(built, 'demo:sky_sprint/finished');
    expect(finished[1]).toBe(
      'execute unless score #sky_sprint.clock.on demo.msm_timers matches 1 run return 0',
    );
    expect(finished.at(-1)).toBe(
      'scoreboard players operation @s demo.sky_sprint.best < #sky_sprint.clock demo.msm_timers',
    );
    const down = run(raceBundle, { count: 'down', limit: 90 });
    expect(data(down, 'demo:sky_sprint/clock')).toMatchObject({
      seconds: 90,
      count: 'down',
      on_end: 'demo:sky_sprint/time_up',
    });
    expect(lines(down, 'demo:sky_sprint/finished').at(-1)).toContain(' > ');
    expect(ofKind(built, GAME_KINDS.rules)).toEqual([]);
  });
});

describe('Goals', () => {
  it('makes a tab whose goals hang from each other in the list order', () => {
    const built = run(goalsBundle, { goals: ['visit_end', 'get_wood'] });
    const root = data(built, 'demo:my_goals/root');
    expect((root.criteria as JsonObject).started).toEqual({ trigger: 'minecraft:tick' });
    expect((root.display as JsonObject).icon).toEqual({
      id: 'minecraft:paper',
      components: { 'minecraft:item_model': 'demo:my_goals/flag' },
    });
    expect(data(built, 'demo:my_goals/get_wood').parent).toBe('demo:my_goals/root');
    expect(data(built, 'demo:my_goals/visit_end').parent).toBe('demo:my_goals/get_wood');
    expect(built.assets.map((asset) => asset.path)).toEqual(['textures/item/my_goals/flag.png']);
    const item = run(goalsBundle, { icon: 'minecraft:diamond' });
    expect((data(item, 'demo:my_goals/root').display as JsonObject).icon).toEqual({
      id: 'minecraft:diamond',
    });
    expect(item.assets).toEqual([]);
  });
});

/** Decodes the RGBA pixels of a PNG written by the library's encoder (filter 0). */
function decode(png: Uint8Array): { width: number; height: number; data: Uint8Array } {
  const buffer = Buffer.from(png);
  let offset = 8;
  let width = 0;
  let height = 0;
  const parts: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
    } else if (type === 'IDAT') {
      parts.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    data.set(raw.subarray(y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4)), y * width * 4);
  }
  return { width, height, data };
}

describe('the pictures the game flows draw follow the pixel rules (ADR 0092 D8)', () => {
  const looks: [ArtRecipeId, Build, string, Record<string, Json>][] = [
    ['lucky_block', luckyBlockBundle, 'textures/block/lucky_block.png', {}],
    [
      'lucky_block',
      luckyBlockBundle,
      'textures/block/lucky_block.png',
      { mark: 'star', colour: '#204080' },
    ],
    ['flag', goalsBundle, 'textures/item/my_goals/flag.png', {}],
    [
      'timer',
      goalsBundle,
      'textures/item/my_goals/timer.png',
      { icon: 'timer', icon_colour: '#3c9a48' },
    ],
    ['flag', skyblockBundle, 'textures/item/sky_survival/goals/flag.png', {}],
  ];
  it.each(looks)('%s at %s', (recipe, build, path, values) => {
    const built = run(build, values);
    const asset = built.assets.find((entry) => entry.path === path);
    if (build === skyblockBundle) {
      // Skyblock's tab shows a grass block, a vanilla item: no picture of its own.
      expect(asset).toBeUndefined();
      return;
    }
    expect(asset).toBeDefined();
    const pixels = decode(asset?.bytes as Uint8Array);
    const info = artRecipeInfo(recipe);
    expect([pixels.width, pixels.height]).toEqual([info.width, info.height]);
    expect(checkArtRules(pixels, info)).toEqual([]);
  });

  it('draws every new recipe within the rules for each finish and a few colours and seeds', () => {
    for (const recipe of ['lucky_block', 'flag', 'timer'] as const) {
      const info = artRecipeInfo(recipe);
      for (const finish of info.finishes.length > 0 ? info.finishes : [undefined]) {
        for (const colour of [
          [60, 120, 216],
          [232, 176, 40],
          [40, 40, 40],
          [240, 240, 240],
        ] as Rgb[]) {
          for (const seed of [0, 5]) {
            expect(
              checkArtRules(artPixels({ recipe, colour, seed, finish }), info),
              `${recipe} ${finish ?? ''} ${colour.join(',')} ${seed}`,
            ).toEqual([]);
          }
        }
      }
      expect(artLookPng({ recipe, colour: [1, 2, 3], seed: 0 }).length).toBeGreaterThan(0);
    }
  });
});
