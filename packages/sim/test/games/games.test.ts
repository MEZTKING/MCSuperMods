/**
 * Try it for games (B558, ADR 0117 D4): the games kinds lowered by the real games plugin run in
 * the function engine on the void and structure grounds: the start and the kit at the mock
 * join, the one block refilling by phase, a timer counting to its end, an area firing walks in
 * and out and rebuilding, the sidebar, teams, adventure mode and the mock generator.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AREA_SIZE_X,
  type GamesElement,
  type GamesProject,
  type LocalSourceTarget,
  LocalWorldSource,
  oneBlockStatuses,
  structureGamesGround,
  VOID_BASE_Y,
  voidGamesGround,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';
import { element, gamesProject, ISLAND, lowerGames } from './lower-games.js';

const SETUP = element('msm:world_setup', 'sky:skyblock', {
  world: { type: 'void', nether: 'vanilla', end: 'void' },
  start: { structure: 'sky:island', at: [0, 64, 0], spawn: [2, 3, 2] },
  game_mode: 'survival',
  difficulty: 'normal',
  game_rules: {},
  new_player: {
    items: [
      { item: 'minecraft:lava_bucket', count: 1 },
      { item: 'minecraft:ice', count: 2 },
    ],
    message: 'Welcome to the sky',
  },
});

const ONE_BLOCK = element('msm:one_block', 'sky:magic', {
  at: [2, 66, -3],
  phases: [
    {
      name: 'Plains',
      breaks: 2,
      blocks: [{ block: 'minecraft:dirt', weight: 1 }],
      mob_chance: 0,
      chest_chance: 0,
    },
    {
      name: 'Underground',
      breaks: 3,
      blocks: [{ block: 'minecraft:stone', weight: 1 }],
      mob_chance: 0,
      chest_chance: 0,
    },
  ],
  loop: true,
  announce: true,
});

const TIMER = element('msm:timer', 'sky:round', {
  name: 'Round',
  seconds: 3,
  count: 'down',
  show: 'boss_bar',
  colour: 'red',
  repeat: false,
  starts: 'world_start',
});

const AREA = element('msm:area', 'sky:home', {
  name: 'Home',
  dimension: 'minecraft:overworld',
  from: [0, 64, 0],
  to: [4, 70, 4],
  reset: { structures: [{ structure: 'sky:island', at: [0, 64, 0] }] },
});

const TEAM = element('msm:team', 'sky:red', {
  name: 'Red',
  colour: 'red',
  friendly_fire: false,
  see_invisible_friends: true,
  name_tags: 'always',
  collision: 'always',
  prefix: '[Red] ',
});

const POINTS = element('msm:objective', 'sky:points', {
  criterion: 'dummy',
  name: 'Points',
  display: 'sidebar',
  render: 'integer',
});

const ALL: readonly GamesElement[] = [SETUP, ONE_BLOCK, TIMER, AREA, TEAM, POINTS];

let targets: readonly Target[];
let target: Target;
let files: Map<string, string | Uint8Array>;

beforeAll(async () => {
  targets = await builtInTargets();
  target = targets[0] as Target;
  files = new Map(await lowerGames(ALL, target));
}, 120_000);

function voidArea(games: GamesProject = gamesProject(ALL, { 'sky:island': ISLAND })): {
  source: LocalWorldSource;
  lines: () => string[];
  only: () => string[];
} {
  const source = new LocalWorldSource({
    files,
    target: target as unknown as LocalSourceTarget,
    games,
    seed: 7,
    logLimit: 100_000,
  });
  const made = voidGamesGround(games);
  source.games.prepare(made.plan);
  source.loadGround('void', made.ground.ground);
  return {
    source,
    lines: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
    only: () => source.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text),
  };
}

const ticks = (source: LocalWorldSource, n: number): void => {
  for (let i = 0; i < n; i += 1) source.tick();
};

describe('the void ground', () => {
  it('centres the start structure and sets the corner so world positions land on it', () => {
    const games = gamesProject(ALL, { 'sky:island': ISLAND });
    const made = voidGamesGround(games);
    const placed = made.ground.placedAt;
    expect(placed).toEqual({ x: Math.floor((AREA_SIZE_X - 5) / 2), y: VOID_BASE_Y, z: 21 });
    expect(made.plan.corner).toEqual({ x: 0 - 21, y: 64 - VOID_BASE_Y, z: -21 });
    // The one block's and the chest's pictures are prepared with the ground.
    expect(made.ground.ground.palette).toContain('minecraft:dirt');
    expect(made.ground.ground.palette).toContain('minecraft:stone');
    expect(made.ground.ground.palette).toContain('minecraft:cobblestone');
    expect(made.plan.join?.spawn).toEqual({ x: 23.5, y: VOID_BASE_Y + 3, z: 23.5 });
  });

  it('says when the start structure is missing', () => {
    const made = voidGamesGround(gamesProject(ALL));
    expect(made.ground.placedAt).toBeNull();
    expect(made.plan.lines.join(' ')).toContain('not one of your project');
  });

  it('joins once: the player on the spawn, the kit from the setup’s first-join function', () => {
    const { source, lines } = voidArea();
    expect(source.world.get({ x: 21, y: VOID_BASE_Y + 2, z: 21 })?.name).toBe(
      'minecraft:grass_block',
    );
    source.tick();
    expect(source.player.position).toEqual({ x: 23.5, y: VOID_BASE_Y + 3, z: 23.5 });
    expect(source.inventory.count('minecraft:lava_bucket')).toBe(1);
    expect(source.inventory.count('minecraft:ice')).toBe(2);
    expect(lines().join('\n')).toContain('Welcome to the sky');
    ticks(source, 5);
    expect(source.inventory.count('minecraft:lava_bucket')).toBe(1);
    // "Clear the area" empties the inventory and joins again, as a new world would.
    source.player.teleport({ x: 3.5, y: 0, z: 3.5 });
    source.act({ type: 'clear' });
    expect(source.inventory.count('minecraft:lava_bucket')).toBe(0);
    source.tick();
    expect(source.inventory.count('minecraft:lava_bucket')).toBe(1);
    expect(source.player.position).toEqual({ x: 23.5, y: VOID_BASE_Y + 3, z: 23.5 });
  });
});

describe('the one block', () => {
  it('fills, refills after a break and moves on by phase', () => {
    const { source, lines } = voidArea();
    const corner = source.functions.state.corner;
    const pos = { x: 2 - corner.x, y: 66 - corner.y, z: -3 - corner.z };
    source.tick();
    expect(source.world.get(pos)?.name).toBe('minecraft:dirt');
    const status = () =>
      oneBlockStatuses(source.games.project, source.functions.state, corner, (p) =>
        source.world.inBounds(p),
      )[0];
    expect(status()?.phaseName).toBe('Plains');
    expect(status()?.breaks).toBe(0);
    for (let i = 0; i < 2; i += 1) {
      source.act({ type: 'break', pos });
      expect(source.world.get(pos)).toBeNull();
      source.tick();
    }
    expect(status()?.phaseName).toBe('Underground');
    expect(source.world.get(pos)?.name).toBe('minecraft:stone');
    expect(lines()).toContain('Underground');
    expect(source.games.status().oneBlocks[0]?.pos).toEqual(pos);
  });

  it('is outside the area on another ground, and says so', () => {
    const source = new LocalWorldSource({
      files,
      target: target as unknown as LocalSourceTarget,
      games: gamesProject(ALL, { 'sky:island': ISLAND }),
    });
    source.loadGround('flat');
    source.tick();
    expect(source.games.status().oneBlocks[0]?.away).toContain('outside the test area');
  });
});

describe('timers', () => {
  it('count down on the boss bar mock-up and end', () => {
    const { source, only } = voidArea();
    source.tick();
    let timer = source.games.status().timers[0];
    expect(timer?.running).toBe(true);
    expect(timer?.value).toBe(3);
    expect(timer?.fill).toBe(1);
    ticks(source, 20);
    timer = source.games.status().timers[0];
    expect(timer?.value).toBe(2);
    expect(timer?.text).toBe('Round 2s');
    ticks(source, 40);
    timer = source.games.status().timers[0];
    expect(timer?.value).toBe(0);
    expect(timer?.running).toBe(false);
    // B727: the boss bar itself runs in the engine too.
    const [bar] = source.functions.state.games.bossbars.values();
    expect(bar?.value).toBe(0);
    expect(bar?.max).toBe(3);
    expect(only().some((line) => line.includes('bossbar'))).toBe(false);
  });
});

describe('areas', () => {
  it('outline the box and fire walks in and out', () => {
    const { source, lines } = voidArea();
    const outline = source.games.outline();
    expect(outline?.boxes).toEqual([[21, VOID_BASE_Y, 21, 26, VOID_BASE_Y + 7, 26]]);
    source.tick();
    source.tick();
    expect(lines()).toContain('You walked into the area Home.');
    expect(source.games.status().areas[0]?.inside).toBe(true);
    source.player.teleport({ x: 5.5, y: 0, z: 5.5 });
    source.tick();
    expect(lines()).toContain('You walked out of the area Home.');
  });

  it('rebuild now runs the reset function and places the island again', () => {
    const { source } = voidArea();
    source.tick();
    const grass = { x: 22, y: VOID_BASE_Y + 2, z: 22 };
    source.world.set(grass, null);
    expect(source.games.rebuild('sky:home')).toBe(true);
    expect(source.world.get(grass)?.name).toBe('minecraft:grass_block');
  });
});

describe('teams and the sidebar', () => {
  it('shows the sidebar objective with the player’s score, and the picked team', () => {
    const { source } = voidArea();
    source.tick();
    source.chat('/scoreboard players set @s sky.points 4');
    const status = source.games.status();
    expect(status.sidebar?.title).toBe('Points');
    expect(status.sidebar?.rows).toEqual([{ holder: 'Player', score: 4 }]);
    expect(status.team).toBeNull();
    source.games.setTeam('sky:red');
    expect(source.games.status().team).toMatchObject({ colour: 'red', prefix: '[Red] ' });
  });
});

describe('adventure mode and the generator', () => {
  it('stops breaking in adventure mode', async () => {
    const setup = element('msm:world_setup', 'sky:skyblock', {
      ...(SETUP.data as object),
      game_mode: 'adventure',
    });
    const elements = [setup, AREA];
    const adventureFiles = await lowerGames(elements, target);
    const games = gamesProject(elements, { 'sky:island': ISLAND });
    const source = new LocalWorldSource({
      files: adventureFiles,
      target: target as unknown as LocalSourceTarget,
      games,
    });
    const made = voidGamesGround(games);
    source.games.prepare(made.plan);
    source.loadGround('void', made.ground.ground);
    source.tick();
    expect(source.games.gameMode).toBe('adventure');
    const grass = { x: 22, y: VOID_BASE_Y + 2, z: 22 };
    source.act({ type: 'break', pos: grass });
    expect(source.world.get(grass)?.name).toBe('minecraft:grass_block');
    source.games.setGameMode('survival');
    source.act({ type: 'break', pos: grass });
    expect(source.world.get(grass)).toBeNull();
  });

  it('turns a broken block between water and lava into cobblestone after a second', () => {
    const { source, lines } = voidArea();
    source.tick();
    const at = { x: 30, y: 4, z: 30 };
    const set = (pos: { x: number; y: number; z: number }, id: string) => {
      const block = source.catalogue.blockFor(id);
      if (block === undefined) throw new Error(id);
      source.world.set(pos, block.defaultState);
    };
    set(at, 'minecraft:stone');
    set({ ...at, x: 31 }, 'minecraft:water');
    set({ ...at, x: 29 }, 'minecraft:lava');
    source.act({ type: 'break', pos: at });
    ticks(source, 19);
    expect(source.world.get(at)).toBeNull();
    source.tick();
    expect(source.world.get(at)?.name).toBe('minecraft:cobblestone');
    expect(lines().join(' ')).toContain('generator, simplified');
  });
});

describe('the structure ground', () => {
  it('stands the template where the area rebuilds it', () => {
    const games = gamesProject(ALL, { 'sky:island': ISLAND });
    const made = structureGamesGround(games, 'sky:island');
    expect(made?.ground.placedAt).toEqual({ x: 21, y: 0, z: 21 });
    expect(made?.plan.corner).toEqual({ x: -21, y: 64, z: -21 });
    expect(made?.plan.join).toBeNull();
    expect(structureGamesGround(games, 'sky:none')).toBeUndefined();
  });
});

describe('the engine’s games commands', () => {
  it('rolls random values in range and places templates only with a host', () => {
    const { source } = voidArea();
    source.tick();
    for (let i = 0; i < 20; i += 1) {
      source.chat('/execute store result score #roll sky.points run random value 1..3');
      const value = source.functions.state.score('#roll', 'sky.points') ?? 0;
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(3);
    }
    expect(source.chat('/place template sky:island 0 64 0').result).toBe('ran');
    expect(source.chat('/place template sky:nothing 0 64 0').result).toBe('error');
    expect(source.chat('/place feature minecraft:oak').result).toBe('game');
  });
});

describe('every built-in target', () => {
  it('fills the one block, starts the timer and tags the player in the area', async () => {
    for (const each of targets) {
      const source = new LocalWorldSource({
        files: await lowerGames(ALL, each),
        target: each as unknown as LocalSourceTarget,
        games: gamesProject(ALL, { 'sky:island': ISLAND }),
      });
      const made = voidGamesGround(source.games.project);
      source.games.prepare(made.plan);
      source.loadGround('void', made.ground.ground);
      ticks(source, 2);
      const status = source.games.status();
      expect(status.oneBlocks[0]?.started, each.id).toBe(true);
      expect(status.timers[0]?.running, each.id).toBe(true);
      expect(status.areas[0]?.inside, each.id).toBe(true);
    }
  });
});
