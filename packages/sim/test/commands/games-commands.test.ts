/**
 * The commands games use in Try it (B727, `src/commands/games-commands.ts` and the forms
 * `vanilla.ts` grew): game modes, attributes and the hearts row, boss bars, the world border,
 * spreading players, items with components in slots, triggers, game rules, weather, difficulty,
 * the player's death and respawn with the death scores, things that are not project mobs,
 * storage paths and macros, conditions that store 0, empty function tags and the selector
 * filters `gamemode=`, `nbt=` and `advancements=`.
 */
import { describe, expect, it } from 'vitest';
import {
  type CatalogueTarget,
  FIRST_THING_ID,
  LocalWorldSource,
  lineSupport,
  RESPAWN_TICKS,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';
import { mobFiles } from '../entities/helpers.js';

/** The fake target with the data folders and the game rule words games read. */
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
  gameRules: { vanillaNames: ['block_drops', 'immediate_respawn', 'keep_inventory'] },
} as unknown as CatalogueTarget;

function fn(path: string, lines: readonly string[]): [string, string] {
  return [`data/fx/function/${path}.mcfunction`, `${lines.join('\n')}\n`];
}

function area(extra: Record<string, string> = {}): {
  source: LocalWorldSource;
  lines: () => string[];
  only: () => string[];
  ticks: (n: number) => void;
  score: (holder: string, objective: string) => number | undefined;
} {
  const files = new Map<string, string>([...testFiles(), ...mobFiles()]);
  for (const [path, text] of Object.entries(extra)) files.set(path, text);
  const source = new LocalWorldSource({ files, target: TARGET, seed: 3, logLimit: 100_000 });
  return {
    source,
    lines: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
    only: () => source.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text),
    ticks: (n) => {
      for (let i = 0; i < n; i += 1) source.tick();
    },
    score: (holder, objective) => source.functions.state.score(holder, objective),
  };
}

const run = (source: LocalWorldSource, line: string) => source.chat(line);

describe('game modes', () => {
  it('sets the mode, filters selectors by it and keeps a spectator from touching', () => {
    const { source } = area();
    expect(run(source, '/execute if entity @a[gamemode=survival]').result).toBe('ran');
    expect(run(source, '/gamemode spectator').answer).toEqual([
      'Set own game mode to Spectator Mode',
    ]);
    expect(source.games.gameMode).toBe('spectator');
    expect(run(source, '/execute if entity @a[gamemode=!spectator]').result).toBe('error');
    source.act({
      type: 'place',
      pos: { x: 3, y: -1, z: 3 },
      face: 'up',
      hit: { x: 3.5, y: 0, z: 3.5 },
      block: 'test:cube',
    });
    expect(source.world.get({ x: 3, y: 0, z: 3 })).toBeNull();
    run(source, '/gamemode adventure @a');
    expect(source.games.status().gameMode).toBe('adventure');
    expect(run(source, '/gamemode flying').result).toBe('error');
  });
});

describe('attributes and hearts', () => {
  it('sets most health, adds and removes modifiers and holds a player still', () => {
    const { source, ticks } = area();
    expect(source.games.status().hearts).toEqual({ health: 20, most: 20, dead: false });
    run(source, '/attribute @s minecraft:max_health base set 30');
    expect(source.games.status().hearts.most).toBe(30);
    expect(run(source, '/attribute @s minecraft:max_health get').answer[0]).toContain('is 30');
    run(source, '/attribute @s minecraft:max_health base set 2000');
    expect(source.games.status().hearts.most).toBe(1024);
    run(source, '/attribute @s minecraft:max_health base reset');
    run(
      source,
      '/attribute @s minecraft:movement_speed modifier add fx:held -1 add_multiplied_total',
    );
    expect(run(source, '/attribute @s minecraft:movement_speed get').answer[0]).toContain('is 0');
    const before = { ...source.player.position };
    source.act({
      type: 'move',
      forward: 1,
      strafe: 0,
      jump: false,
      sneak: false,
      toggleFly: false,
      yaw: 0,
      pitch: 0,
    });
    ticks(10);
    expect(source.player.position.x).toBeCloseTo(before.x);
    expect(source.player.position.z).toBeCloseTo(before.z);
    expect(
      run(source, '/attribute @s minecraft:movement_speed modifier add fx:held 1 add_value').result,
    ).toBe('error');
    run(source, '/attribute @s minecraft:movement_speed modifier remove fx:held');
    ticks(10);
    expect(source.player.position).not.toEqual(before);
    expect(run(source, '/attribute @s minecraft:luck get').result).toBe('error');
  });

  it('adds values before multiplying them, as the game does', () => {
    const { source } = area();
    run(source, '/attribute @s minecraft:attack_damage modifier add fx:a 2 add_value');
    run(source, '/attribute @s minecraft:attack_damage modifier add fx:b 0.5 add_multiplied_base');
    run(source, '/attribute @s minecraft:attack_damage modifier add fx:c 1 add_multiplied_total');
    // (1 + 2) + 3 * 0.5 = 4.5, then doubled.
    expect(source.functions.state.games.attribute('Player', 'minecraft:attack_damage')).toBe(9);
  });
});

describe('death and respawn', () => {
  it('moves the death scores, empties the hands, hides the player from @e and respawns', () => {
    const { source, ticks, score } = area();
    run(source, '/scoreboard objectives add deaths deathCount');
    run(source, '/scoreboard objectives add hp health');
    run(source, '/give @s minecraft:emerald 3');
    ticks(1);
    expect(score('Player', 'hp')).toBe(20);
    run(source, '/kill @s');
    expect(score('Player', 'deaths')).toBe(1);
    expect(source.inventory.count('minecraft:emerald')).toBe(0);
    expect(run(source, '/execute if entity @e[type=minecraft:player]').result).toBe('error');
    expect(run(source, '/execute if entity @a').result).toBe('ran');
    ticks(1);
    expect(score('Player', 'hp')).toBe(0);
    expect(source.games.status().hearts.dead).toBe(true);
    ticks(RESPAWN_TICKS);
    expect(run(source, '/execute if entity @e[type=minecraft:player]').result).toBe('ran');
    expect(score('Player', 'hp')).toBe(20);
  });

  it('keeps the inventory when the keep-inventory rule is on', () => {
    const { source } = area();
    expect(run(source, '/gamerule keep_inventory true').result).toBe('ran');
    run(source, '/give @s minecraft:emerald 3');
    run(source, '/kill @s');
    expect(source.inventory.count('minecraft:emerald')).toBe(3);
    expect(run(source, '/gamerule minecraft:keep_inventory').answer[0]).toContain('true');
    expect(run(source, '/gamerule doTileDrops false').result).toBe('error');
  });

  it('counts kills when the player hits a mob', () => {
    const { source, score } = area();
    run(source, '/scoreboard objectives add kills totalKillCount');
    run(source, '/summon zoo:cow 24 0 26');
    const [cow] = source.entities.entities();
    if (cow === undefined) throw new Error('no cow');
    source.act({ type: 'hit', entity: cow.id });
    expect(score('Player', 'kills')).toBe(1);
  });
});

describe('boss bars, the border, weather and difficulty', () => {
  it('makes and changes a boss bar and stores into it', () => {
    const { source } = area();
    run(source, '/bossbar add fx:clock {"text":"Clock"}');
    run(source, '/bossbar set fx:clock max 60');
    run(source, '/bossbar set fx:clock players @a');
    run(source, '/scoreboard objectives add t dummy');
    run(source, '/scoreboard players set #t t 42');
    run(source, '/execute store result bossbar fx:clock value run scoreboard players get #t t');
    const bar = source.functions.state.games.bossbars.get('fx:clock');
    expect(bar).toMatchObject({ name: 'Clock', max: 60, value: 42 });
    expect(bar?.players.has('Player')).toBe(true);
    expect(run(source, '/bossbar get fx:clock value').answer[0]).toContain('42');
    run(source, '/bossbar remove fx:clock');
    expect(run(source, '/bossbar get fx:clock value').result).toBe('error');
  });

  it('moves the border over time', () => {
    const { source, ticks } = area();
    expect(source.games.status().border).toBeNull();
    run(source, '/worldborder center 10 -10');
    run(source, '/worldborder set 100');
    run(source, '/worldborder set 50 10s');
    ticks(100);
    expect(source.games.status().border).toEqual({ x: 10.5, z: -9.5, size: 75 });
    ticks(100);
    expect(run(source, '/worldborder get').answer).toEqual([
      'The world border is currently 50 block(s) wide',
    ]);
  });

  it('keeps the weather for predicates and the difficulty', () => {
    const { source } = area({
      'data/fx/predicate/raining.json': JSON.stringify({
        condition: 'minecraft:weather_check',
        raining: true,
      }),
    });
    expect(run(source, '/execute if predicate fx:raining').result).toBe('error');
    run(source, '/weather rain');
    expect(run(source, '/execute if predicate fx:raining').result).toBe('ran');
    run(source, '/difficulty hard');
    expect(run(source, '/difficulty').answer).toEqual(['The difficulty is Hard']);
  });
});

describe('spreadplayers', () => {
  it('puts the player on the highest block within the range', () => {
    const { source } = area();
    run(source, '/fill 0 0 0 47 0 47 minecraft:stone');
    expect(run(source, '/spreadplayers 24 24 0 10 false @s').result).toBe('ran');
    const { x, y, z } = source.player.position;
    expect(y).toBe(1);
    expect(Math.abs(x - 24)).toBeLessThanOrEqual(11);
    expect(Math.abs(z - 24)).toBeLessThanOrEqual(11);
  });
});

describe('items with components', () => {
  it('gives, replaces, modifies, finds and clears items by their components', () => {
    const { source } = area();
    run(source, '/give @s minecraft:compass[minecraft:custom_data={tracker:1b}] 1');
    expect(source.inventory.slots[0]?.components).toEqual({
      'minecraft:custom_data': { tracker: 1 },
    });
    expect(
      run(
        source,
        '/execute if items entity @s weapon.mainhand minecraft:compass[minecraft:custom_data~{tracker:1b}]',
      ).result,
    ).toBe('ran');
    run(
      source,
      '/item modify entity @s weapon.mainhand {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"minecraft:overworld",pos:[I;1,2,3]},tracked:false}}}',
    );
    expect(source.inventory.slots[0]?.components?.['minecraft:lodestone_tracker']).toEqual({
      target: { dimension: 'minecraft:overworld', pos: [1, 2, 3] },
      tracked: false,
    });
    run(source, '/item replace entity @s armor.head with minecraft:iron_helmet');
    run(
      source,
      '/item replace entity @s hotbar.4 with minecraft:diamond_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}] 1',
    );
    expect(source.inventory.slots[4]?.id).toBe('minecraft:diamond_shovel');
    expect(run(source, '/clear @s minecraft:iron_helmet 0').answer).toEqual([
      'Found 1 matching item on Player.',
    ]);
    expect(
      run(source, '/clear @s minecraft:compass[minecraft:custom_data~{tracker:2b}] 0').result,
    ).toBe('error');
    expect(run(source, '/data get entity @s Inventory[{Slot:103b}].id').answer[0]).toContain(
      'iron_helmet',
    );
    run(source, '/clear @s');
    expect(source.inventory.slots.every((slot) => slot === null)).toBe(true);
    expect(run(source, '/clear @s minecraft:iron_helmet 0').result).toBe('error');
  });
});

describe('triggers', () => {
  it('lets a player trigger only once enabled, then locks again', () => {
    const { source, score } = area();
    run(source, '/scoreboard objectives add vote trigger');
    expect(run(source, '/trigger vote').answer).toEqual(['You cannot trigger this objective yet']);
    run(source, '/scoreboard players enable @a vote');
    expect(run(source, '/trigger vote set 3').result).toBe('ran');
    expect(score('Player', 'vote')).toBe(3);
    expect(run(source, '/trigger vote add 1').result).toBe('error');
    run(source, '/scoreboard objectives add plain dummy');
    expect(run(source, '/scoreboard players enable @s plain').result).toBe('error');
  });
});

describe('things that are not project mobs', () => {
  it('keeps them for selectors, nbt=, data and kill, and merges dropped items', () => {
    const { source, score } = area();
    run(source, '/summon minecraft:item 10 1 10 {Item:{id:"minecraft:iron_ingot",count:1}}');
    run(source, '/summon minecraft:item 10 1 10.5 {Item:{id:"minecraft:iron_ingot",count:1}}');
    run(source, '/summon minecraft:item 10 1 10 {Item:{id:"minecraft:gold_ingot",count:1}}');
    expect(source.functions.state.games.things.size).toBe(2);
    run(source, '/scoreboard objectives add n dummy');
    run(
      source,
      '/execute as @e[type=minecraft:item,x=10.5,y=1,z=10.5,distance=..1.5,limit=1,nbt={Item:{id:"minecraft:iron_ingot"}}] run execute store result score #n n run data get entity @s Item.count',
    );
    expect(score('#n', 'n')).toBe(2);
    run(source, '/summon minecraft:interaction 5 1 5 {Tags:["shop"],width:1f}');
    expect(run(source, '/execute if entity @e[type=minecraft:interaction,tag=shop]').result).toBe(
      'ran',
    );
    const shop = [...source.functions.state.games.things.values()].find(
      (one) => one.type === 'minecraft:interaction',
    );
    if (shop === undefined) throw new Error('no interaction');
    expect(shop.id).toBeGreaterThanOrEqual(FIRST_THING_ID);
    // B728's practice players set who hit it; here the player did.
    shop.attacker = { kind: 'player' };
    expect(run(source, '/execute as @e[tag=shop] on attacker run tag @s add hit').result).toBe(
      'ran',
    );
    expect(source.functions.state.tags.get('Player')?.has('hit')).toBe(true);
    run(source, '/kill @e[type=minecraft:item]');
    expect(source.functions.state.games.things.size).toBe(1);
  });
});

describe('storage, macros and stores', () => {
  it('stores into storage paths, copies entity data and calls macros with storage', () => {
    const { source, score } = area(
      Object.fromEntries([
        fn('point', ['$scoreboard players set #x n $(x)', '$scoreboard players set #y n $(y)']),
        fn('read', [
          'data modify storage fx:s p set from entity @s Pos',
          'execute store result storage fx:s x int 1 run data get storage fx:s p[0]',
          'execute store result storage fx:s y int 1 run data get storage fx:s p[1]',
          'function fx:point with storage fx:s',
        ]),
      ]),
    );
    run(source, '/scoreboard objectives add n dummy');
    run(source, '/tp 12 3 14');
    source.runFunction('fx:read');
    expect(score('#x', 'n')).toBe(12);
    expect(score('#y', 'n')).toBe(3);
    run(source, '/data modify storage fx:s list append value 5');
    run(source, '/data modify storage fx:s list prepend value 4');
    expect(source.functions.state.storage.get('fx:s')?.list).toEqual([4, 5]);
    run(source, '/data remove storage fx:s list[0]');
    expect(run(source, '/data get storage fx:s list[0]').answer[0]).toContain('5');
    run(source, '/data merge storage fx:s {a:{b:1}}');
    run(source, '/data merge storage fx:s {a:{c:2}}');
    expect(source.functions.state.storage.get('fx:s')?.a).toEqual({ b: 1, c: 2 });
  });

  it('stores 0 when a condition at the end fails and the count when it holds', () => {
    const { source, score } = area();
    run(source, '/scoreboard objectives add n dummy');
    run(source, '/scoreboard players set #c n 9');
    run(source, '/execute store result score #c n if entity @e[type=zoo:cow]');
    expect(score('#c', 'n')).toBe(0);
    run(source, '/summon zoo:cow 20 0 20');
    run(source, '/summon zoo:cow 22 0 20');
    run(source, '/execute store result score #c n if entity @e[type=zoo:cow]');
    expect(score('#c', 'n')).toBe(2);
    run(source, '/execute store success score #c n unless entity @e[type=zoo:cow]');
    expect(score('#c', 'n')).toBe(0);
  });

  it('runs an empty function tag as nothing', () => {
    const { source, lines } = area({
      'data/fx/tags/function/hooks.json': JSON.stringify({ values: [] }),
    });
    expect(run(source, '/function #fx:hooks').result).toBe('ran');
    expect(lines().some((line) => line.includes('Unknown function'))).toBe(false);
    expect(run(source, '/function #fx:missing').result).toBe('error');
  });
});

describe('selector filters', () => {
  it('reads advancements= from the advancements done', () => {
    const { source } = area({
      'data/fx/advancement/won.json': JSON.stringify({
        criteria: {
          a: { trigger: 'minecraft:impossible' },
          b: { trigger: 'minecraft:impossible' },
        },
      }),
    });
    expect(run(source, '/execute if entity @a[advancements={fx:won=true}]').result).toBe('error');
    run(source, '/advancement grant @s only fx:won a');
    expect(
      run(source, '/execute if entity @a[advancements={fx:won={a=true,b=false}}]').result,
    ).toBe('ran');
    run(source, '/advancement grant @s only fx:won');
    expect(run(source, '/execute if entity @a[advancements={fx:won=true}]').result).toBe('ran');
    run(source, '/advancement revoke @s only fx:won');
    expect(run(source, '/execute if entity @a[advancements={fx:won=false}]').result).toBe('ran');
  });

  it('tests a block by a tag and a state', () => {
    // The test project's furnace has a `lit` state (vanilla props keep theirs once Try it reads
    // Minecraft's block states; these tests run without them).
    const { source } = area({
      'data/minecraft/tags/block/beds.json': JSON.stringify({ values: ['test:furnace'] }),
    });
    run(source, '/setblock 6 0 6 test:furnace[facing=north,lit=true]');
    expect(run(source, '/execute if block 6 0 6 #minecraft:beds[lit=true]').result).toBe('ran');
    expect(run(source, '/execute if block 6 0 6 #minecraft:beds[lit=false]').result).toBe('error');
  });

  it('reads every form games write', () => {
    for (const line of [
      'gamemode survival @a[tag=x.in]',
      'execute as @e[type=minecraft:item,x=1,y=2,z=3,dx=4,dy=5,dz=6,nbt={Item:{id:"minecraft:iron_ingot"}}] run kill @s',
      'execute in minecraft:overworld run worldborder set 16 120s',
      'scoreboard objectives modify x.kills rendertype hearts',
      '$attribute @s minecraft:max_health base set $(hp)',
      'execute on attacker run tag @s add x',
    ]) {
      expect(lineSupport(line), line).toMatchObject({ runs: true });
    }
  });
});
