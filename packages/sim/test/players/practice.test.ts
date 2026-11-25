/**
 * Practice players (B728, ADR 0132 D10): selectors see them (`@a`, `@p`, `@r`, `@e`, a name,
 * `execute as`), `@p` and `@r` skip the dead as the game's do, items and data are each player's
 * own, hits hurt and kill with the kill scores and the killer's advancement, `execute on attacker`
 * finds a hitter, walks, falls and the void, leaving and joining, and you watching from outside.
 */
import { describe, expect, it } from 'vitest';
import {
  type CatalogueTarget,
  KILL_CREDIT_TICKS,
  LocalWorldSource,
  MAX_PRACTICE_PLAYERS,
  PRACTICE_HIT_DAMAGE,
  RESPAWN_TICKS,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';

const TARGET = {
  ...FAKE_TARGET,
  folders: {
    ...FAKE_TARGET.folders,
    data: {
      tags: 'tags',
      function: 'function',
      predicate: 'predicate',
      advancement: 'advancement',
    },
  },
  dev: { gameRules: { keepInventory: 'keep_inventory' } },
  gameRules: { vanillaNames: ['keep_inventory', 'pvp'] },
} as unknown as CatalogueTarget;

const fn = (path: string, lines: readonly string[]): [string, string] => [
  `data/fx/function/${path}.mcfunction`,
  `${lines.join('\n')}\n`,
];

function area(extra: readonly [string, string][] = []) {
  const files = new Map<string, string>([...testFiles(), ...extra]);
  const source = new LocalWorldSource({ files, target: TARGET, seed: 5, logLimit: 100_000 });
  return {
    source,
    run: (line: string) => source.chat(line),
    ticks: (n: number) => {
      for (let i = 0; i < n; i += 1) source.tick();
    },
    score: (holder: string, objective: string) => source.functions.state.score(holder, objective),
    tags: (holder: string) => [...(source.functions.state.tags.get(holder) ?? [])].sort(),
    said: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
  };
}

describe('practice players and selectors', () => {
  it('are found by @a, @e, a name and execute as, and @p finds the nearest', () => {
    const { source, run, score } = area();
    source.tick();
    source.practice.add('Alex', { at: { pos: [10.5, 0, 10.5] } });
    source.practice.add('Sam', { at: { pos: [40.5, 0, 40.5] } });
    run('/scoreboard objectives add n dummy');
    run('/execute as @a run scoreboard players add @s n 1');
    expect([score('Player', 'n'), score('Alex', 'n'), score('Sam', 'n')]).toEqual([1, 1, 1]);
    run('/execute store result score #all n if entity @e[type=minecraft:player]');
    expect(score('#all', 'n')).toBe(3);
    run('/execute positioned 39 0 39 run tag @p add near');
    expect(source.functions.state.tags.get('Sam')).toContain('near');
    run('/tag Alex add named');
    expect(source.functions.state.tags.get('Alex')).toContain('named');
    expect(run('/execute if entity @a[name=Alex]').result).toBe('ran');
    expect(run('/execute if entity @a[name=Ann]').result).toBe('error');
  });

  it('@r picks among every living player; at most seven practice players', () => {
    const { source, run, score } = area();
    source.tick();
    for (let i = 0; i < MAX_PRACTICE_PLAYERS; i += 1) expect(source.practice.add()).toBeDefined();
    expect(source.practice.add()).toBeUndefined();
    run('/scoreboard objectives add r dummy');
    for (let i = 0; i < 80; i += 1) run('/scoreboard players add @r r 1');
    const picked = source.practice.views().filter((view) => (score(view.name, 'r') ?? 0) > 0);
    expect(picked.length).toBe(8);
  });

  it('@p and @r skip a dead player, @a still finds them, @e does not', () => {
    const { source, run, score } = area();
    source.tick();
    source.practice.add('Alex', { at: { pos: [24.5, 0, 24.5] } });
    run('/kill Alex');
    run('/scoreboard objectives add c dummy');
    run('/execute store result score #a c if entity @a');
    run('/execute store result score #e c if entity @e[type=minecraft:player]');
    expect(score('#a', 'c')).toBe(2);
    expect(score('#e', 'c')).toBe(1);
    run('/execute positioned 24 0 24 run tag @p add near');
    expect(source.functions.state.tags.get('Alex') ?? new Set()).not.toContain('near');
    for (let i = 0; i < 20; i += 1) run('/tag @r add picked');
    expect(source.functions.state.tags.get('Alex') ?? new Set()).not.toContain('picked');
  });

  it('a player who left is found by nobody until they join again; you can watch from outside', () => {
    const { source, run, score } = area();
    source.tick();
    source.practice.add('Alex');
    source.practice.act({ do: 'leave', who: 'Alex' });
    run('/scoreboard objectives add c dummy');
    run('/execute store result score #a c if entity @a');
    expect(score('#a', 'c')).toBe(1);
    source.practice.setUserAway(true);
    source.practice.act({ do: 'join', who: 'Alex' });
    run('/execute store result score #a c if entity @a');
    expect(score('#a', 'c')).toBe(1);
    expect(run('/execute if entity @a[name=Player]').result).toBe('error');
    source.practice.setUserAway(false);
    run('/execute store result score #a c if entity @a');
    expect(score('#a', 'c')).toBe(2);
  });
});

describe("practice players' items, data and modes", () => {
  it('give and clear reach each player; data get reads their place', () => {
    const { source, run } = area();
    source.tick();
    const alex = source.practice.add('Alex', { at: { pos: [5.5, 0, 6.5] } });
    run('/give @a minecraft:stone 3');
    expect(alex?.inventory.count('minecraft:stone')).toBe(3);
    expect(run('/clear Alex minecraft:stone 0').answer).toEqual([
      'Found 3 matching items on Alex.',
    ]);
    expect(run('/data get entity Alex Pos[0]').result).toBe('ran');
    run('/scoreboard objectives add x dummy');
    run('/execute store result score Alex x run data get entity Alex Pos[2]');
    expect(source.functions.state.score('Alex', 'x')).toBe(6);
    run('/item replace entity Alex weapon.offhand with minecraft:shield');
    expect(run('/execute if items entity Alex weapon.offhand minecraft:shield').result).toBe('ran');
  });

  it('game modes, teleports and spawn points are their own', () => {
    const { source, run, ticks } = area();
    source.tick();
    const alex = source.practice.add('Alex');
    run('/gamemode spectator Alex');
    expect(source.functions.state.games.gameMode('Alex')).toBe('spectator');
    expect(source.functions.state.games.gameMode('Player')).toBe('survival');
    expect(source.practice.act({ do: 'hit', who: 'Player', target: 'Alex' }).ok).toBe(false);
    run('/gamemode survival Alex');
    run('/tp Alex 20 3 20');
    expect(alex?.pos).toEqual({ x: 20.5, y: 3, z: 20.5 });
    run('/spawnpoint Alex 30 0 30');
    run('/kill Alex');
    ticks(RESPAWN_TICKS + 1);
    expect(alex?.pos).toEqual({ x: 30.5, y: 0, z: 30.5 });
  });
});

describe('hits, deaths and kills', () => {
  const ADVANCEMENT = JSON.stringify({
    criteria: {
      killed_player: {
        trigger: 'minecraft:player_killed_entity',
        conditions: {
          entity: {
            condition: 'minecraft:entity_properties',
            entity: 'this',
            predicate: { 'minecraft:entity_type': 'minecraft:player' },
          },
        },
      },
    },
    rewards: { function: 'fx:killed' },
  });

  it('a hit hurts; enough hits kill, with the kill scores and the killer’s advancement', () => {
    const { source, run, score, said } = area([
      ['data/fx/advancement/kill.json', ADVANCEMENT],
      fn('killed', [
        'advancement revoke @s only fx:kill',
        'scoreboard players add @s rewarded 1',
        'tellraw @a [{"selector":"@s"},{"text":" took a heart from "},{"selector":"@a[scores={deaths=1..}]"},{"text":"."}]',
      ]),
    ]);
    source.tick();
    for (const line of [
      '/scoreboard objectives add kills playerKillCount',
      '/scoreboard objectives add all totalKillCount',
      '/scoreboard objectives add deaths deathCount',
      '/scoreboard objectives add rewarded dummy',
      '/team add red',
      '/team modify red color red',
      '/scoreboard objectives add tk teamkill.red',
    ]) {
      run(line);
    }
    source.practice.add('Alex', { at: { pos: [10, 0, 10] } });
    source.practice.add('Sam', { team: 'red', at: { pos: [11, 0, 10] } });
    expect(source.practice.act({ do: 'hit', who: 'Alex', target: 'Sam' }).said).toBe(
      'Alex hit Sam.',
    );
    expect(source.functions.state.games.healthOf('Sam')).toBe(20 - PRACTICE_HIT_DAMAGE);
    for (let i = 0; i < 3; i += 1) source.practice.act({ do: 'hit', who: 'Alex', target: 'Sam' });
    expect(source.functions.state.games.dead.has('Sam')).toBe(true);
    expect([score('Alex', 'kills'), score('Alex', 'all'), score('Sam', 'deaths')]).toEqual([
      1, 1, 1,
    ]);
    expect(score('Alex', 'tk')).toBe(1);
    expect(score('Alex', 'rewarded')).toBe(1);
    expect(said()).toContain('Sam was slain by Alex');
    expect(said()).toContain('Alex took a heart from Sam.');
  });

  it('a knock-out of you by a practice player counts for them; a team does not hurt its own', () => {
    const { source, run, score } = area();
    source.tick();
    run('/scoreboard objectives add kills playerKillCount');
    run('/team add blue');
    run('/team modify blue friendlyFire false');
    source.practice.add('Alex', { team: 'blue' });
    source.practice.add('Kai', { team: 'blue' });
    expect(source.practice.act({ do: 'hit', who: 'Alex', target: 'Kai' }).ok).toBe(false);
    source.practice.act({ do: 'knock_out', who: 'Player', by: 'Alex' });
    expect(source.functions.state.games.dead.has('Player')).toBe(true);
    expect(score('Alex', 'kills')).toBe(1);
  });

  it('execute on attacker finds who hit a thing, and who hurt a player lately', () => {
    const { source, run, ticks } = area();
    source.tick();
    source.practice.add('Alex', { at: { pos: [10, 0, 10] } });
    source.practice.add('Sam', { at: { pos: [12, 0, 10] } });
    run('/summon minecraft:interaction 11 0 11');
    expect(source.practice.act({ do: 'hit_thing', who: 'Sam', type: 'interaction' }).ok).toBe(true);
    run('/execute as @e[type=minecraft:interaction] on attacker run tag @s add buyer');
    expect(source.functions.state.tags.get('Sam')).toContain('buyer');
    source.practice.act({ do: 'hit', who: 'Alex', target: 'Sam' });
    run('/execute as Sam on attacker run tag @s add hitter');
    expect(source.functions.state.tags.get('Alex')).toContain('hitter');
    ticks(KILL_CREDIT_TICKS + 1);
    run('/tag @a remove hitter');
    run('/execute as Sam on attacker run tag @s add hitter');
    expect(source.functions.state.tags.get('Alex') ?? new Set()).not.toContain('hitter');
  });

  it('a practice player below the world dies, the kill going to a recent hitter', () => {
    const { source, run, score, ticks, said } = area();
    source.tick();
    run('/scoreboard objectives add kills playerKillCount');
    source.practice.add('Alex');
    source.practice.add('Sam');
    source.practice.act({ do: 'hit', who: 'Alex', target: 'Sam' });
    run('/tp Sam 10 -120 10');
    ticks(30);
    expect(said()).toContain('Sam was knocked into the void by Alex');
    expect(score('Alex', 'kills')).toBe(1);
  });
});

describe('walking, falling and breaking', () => {
  it('walks to a place, steps up one block and falls when the block under is broken', () => {
    const { source, run, ticks } = area();
    source.tick();
    run('/fill 0 0 0 47 0 47 minecraft:stone');
    run('/setblock 20 1 10 minecraft:stone');
    const alex = source.practice.add('Alex', { at: { pos: [10.5, 1, 10.5] } });
    source.practice.act({ do: 'walk', who: 'Alex', to: { pos: [30.5, 1, 10.5] } });
    ticks(120);
    expect(alex?.pos.x).toBeCloseTo(30.5, 1);
    expect(alex?.pos.y).toBe(1);
    source.practice.add('Sam', { at: { pos: [12.5, 1, 12.5] } });
    expect(source.practice.act({ do: 'break_under', who: 'Alex', target: 'Sam' }).ok).toBe(true);
    ticks(20);
    expect(source.practice.all()[1]?.pos.y).toBe(0);
  });

  it('in adventure mode only an item whose can_break names the block breaks it', () => {
    const { source, run } = area();
    source.tick();
    run('/fill 0 0 0 47 0 47 minecraft:snow_block');
    source.practice.add('Alex', { at: { pos: [10.5, 1, 10.5] } });
    run('/gamemode adventure Alex');
    expect(source.practice.act({ do: 'break_under', who: 'Alex' }).ok).toBe(false);
    run(
      '/give Alex minecraft:diamond_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}] 1',
    );
    expect(source.practice.act({ do: 'break_under', who: 'Alex' }).ok).toBe(true);
  });

  it('the panel lists you first, then the practice players with their hearts', () => {
    const { source, run } = area();
    source.tick();
    source.practice.add('Alex');
    run('/attribute Alex minecraft:max_health base set 30');
    const views = source.practice.views();
    expect(views.map((view) => view.name)).toEqual(['Player', 'Alex']);
    expect(views[1]?.most).toBe(30);
    expect(source.games.outline()?.boxes.length).toBe(1);
  });
});
