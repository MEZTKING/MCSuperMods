/**
 * Functions and the game's own commands in Try it (B606, ADR 0120 D8): each command of B600's
 * list against the area, macro lines, the load and tick tags, schedules, `return`, the
 * 10,000-command cap of a tick, and every command or form not run said once by name.
 */
import { describe, expect, it } from 'vitest';
import {
  type CatalogueTarget,
  LocalWorldSource,
  lineSupport,
  PREVIEW_PLAYER_UUID,
  TICK_COMMAND_CAP,
  understands,
  type WorldEvent,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';
import { mobFiles } from '../entities/helpers.js';

/** The fake target with the data folders functions, tags and predicates live in. */
const TARGET = {
  ...FAKE_TARGET,
  folders: {
    ...FAKE_TARGET.folders,
    data: { tags: 'tags', function: 'function', predicate: 'predicate' },
  },
  commands: {
    vanillaNames: ['give', 'locate', 'say', 'weather', 'spreadplayers', 'tp'],
    argumentTypes: {},
  },
} as unknown as CatalogueTarget;

function fn(path: string, lines: readonly string[]): [string, string] {
  return [`data/fx/function/${path}.mcfunction`, `${lines.join('\n')}\n`];
}

function area(extra: Record<string, string> = {}): {
  source: LocalWorldSource;
  events: WorldEvent[];
  lines: () => string[];
  only: () => string[];
} {
  const files = new Map<string, string>([...testFiles(), ...mobFiles()]);
  for (const [path, text] of Object.entries(extra)) files.set(path, text);
  const source = new LocalWorldSource({ files, target: TARGET, seed: 3, logLimit: 100_000 });
  const events: WorldEvent[] = [];
  source.subscribe((event) => events.push(event));
  return {
    source,
    events,
    lines: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
    only: () => source.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text),
  };
}

const run = (source: LocalWorldSource, line: string) => source.chat(line);

describe('the game commands of the chat box', () => {
  it('gives and clears items', () => {
    const { source } = area();
    expect(run(source, '/give @s minecraft:emerald 8').result).toBe('ran');
    expect(source.inventory.count('minecraft:emerald')).toBe(8);
    expect(run(source, '/give @p diamond').answer).toEqual(['Gave 1 Diamond to Player.']);
    expect(run(source, '/clear @s minecraft:emerald 3').answer).toEqual([
      'Removed 3 items from Player.',
    ]);
    expect(source.inventory.count('minecraft:emerald')).toBe(5);
    expect(run(source, '/clear @s minecraft:emerald 0').answer).toEqual([
      'Found 5 matching items on Player.',
    ]);
    run(source, '/clear');
    expect(source.inventory.count('minecraft:diamond')).toBe(0);
    expect(run(source, '/clear').result).toBe('error');
    expect(run(source, '/give @e[type=zoo:cow] stone').answer[0]).toContain('Only players');
  });

  it('sets, fills and clones blocks inside the area', () => {
    const { source, only } = area();
    run(source, '/setblock 3 0 3 test:cube');
    expect(source.world.get({ x: 3, y: 0, z: 3 })?.name).toBe('test:cube');
    expect(run(source, '/setblock 3 0 3 test:cube keep').result).toBe('error');
    const fill = run(source, '/fill 0 0 0 2 1 2 minecraft:stone');
    expect(fill.answer).toEqual(['Successfully filled 18 blocks.']);
    run(source, '/fill 0 0 0 2 1 2 minecraft:dirt replace minecraft:stone');
    expect(source.world.get({ x: 1, y: 1, z: 1 })?.name).toBe('minecraft:dirt');
    run(source, '/fill 10 0 10 12 2 12 minecraft:glass hollow');
    expect(source.world.get({ x: 11, y: 1, z: 11 })).toBeNull();
    expect(source.world.get({ x: 10, y: 1, z: 11 })?.name).toBe('minecraft:glass');
    expect(run(source, '/clone 0 0 0 2 1 2 20 0 20').answer).toEqual([
      'Successfully cloned 18 blocks.',
    ]);
    expect(source.world.get({ x: 21, y: 1, z: 21 })?.name).toBe('minecraft:dirt');
    expect(run(source, '/clone 0 0 0 2 1 2 1 0 1').answer).toEqual([
      'The source and destination areas cannot overlap',
    ]);
    run(source, '/clone 20 0 20 22 1 22 30 0 30 replace move');
    expect(source.world.get({ x: 21, y: 1, z: 21 })).toBeNull();
    expect(source.world.get({ x: 31, y: 1, z: 31 })?.name).toBe('minecraft:dirt');
    expect(run(source, '/fill 0 0 0 40 31 40 minecraft:stone').answer[0]).toContain(
      'Too many blocks',
    );
    expect(run(source, '/setblock ~ ~ ~5 test:cube').result).toBe('ran');
    expect(source.world.get({ x: 24, y: 0, z: 29 })?.name).toBe('test:cube');
    expect(run(source, '/setblock 3 0 4 othermod:thing').result).toBe('error');
    expect(only().some((line) => line.includes('othermod:thing'))).toBe(true);
    expect(run(source, '/clone from minecraft:the_nether 0 0 0 1 1 1 5 5 5').result).toBe('game');
  });

  it('summons project mobs, kills them and says vanilla mobs', () => {
    const { source, only } = area();
    expect(run(source, '/summon zoo:cow 10 0 10').result).toBe('ran');
    expect(source.entities.count).toBe(1);
    // B727: anything else is kept as a thing commands see, not drawn.
    expect(run(source, '/summon minecraft:zombie').result).toBe('ran');
    expect(only().some((line) => line.includes('how Zombie looks and acts'))).toBe(true);
    expect(source.entities.count).toBe(1);
    run(source, '/tag @e[type=zoo:cow] add marked');
    expect(run(source, '/kill @e[tag=marked]').answer).toEqual(['Killed Moo Cow.']);
    expect(source.entities.count).toBe(0);
    expect(run(source, '/kill @e[type=minecraft:zombie]').answer).toEqual(['Killed Zombie.']);
    // B727: the player dies and respawns a second later.
    run(source, '/kill');
    expect(only().some((line) => line.startsWith('the death screen'))).toBe(true);
  });

  it('teleports the player inside the area', () => {
    const { source } = area();
    run(source, '/tp 5 3 6');
    expect(source.player.position).toEqual({ x: 5.5, y: 3, z: 6.5 });
    run(source, '/teleport @s ~1 ~ ~');
    expect(source.player.position.x).toBe(6.5);
    expect(run(source, '/tp @s 0 120 0').answer[0]).toContain('outside the test area');
    expect(source.player.position.y).toBe(3);
  });

  it('gives effects as chips and remembers them', () => {
    const { source, events } = area();
    run(source, '/effect give @s minecraft:speed 30 1 true');
    const chip = events.find((event) => event.type === 'effect' && event.effect.kind === 'chip');
    expect(chip?.type === 'effect' && chip.effect.id).toBe('Speed II for 30 seconds');
    expect(run(source, '/effect clear @s minecraft:speed').result).toBe('ran');
    expect(run(source, '/effect clear @s').result).toBe('error');
  });

  it('says, tells, titles, plays sounds and shows particles', () => {
    const { source, events, lines } = area();
    expect(run(source, '/say Hello @s!').answer).toEqual(['[Player] Hello Player!']);
    run(source, '/tellraw @a ["You have ",{"text":"two"}," things."]');
    expect(lines()).toContain('You have two things.');
    run(source, '/title @s actionbar {"text":"Run!","color":"gold"}');
    expect(lines()).toContain('Above the hotbar: Run!');
    run(source, '/playsound minecraft:entity.cow.ambient neutral @a ~ ~ ~ 1 1.2');
    const sound = events.find((event) => event.type === 'effect' && event.effect.kind === 'sound');
    expect(sound?.type === 'effect' && sound.effect.pitch).toBe(1.2);
    run(source, '/particle minecraft:end_rod ~ ~1 ~ 0.3 0.3 0.3 0.02 10');
    expect(
      events.filter((event) => event.type === 'effect' && event.effect.kind === 'particle'),
    ).toHaveLength(10);
  });

  it('sets and reads the time of day', () => {
    const { source } = area();
    expect(run(source, '/time set 13000').answer).toEqual(['Set the time to 13000.']);
    expect(run(source, '/time add 1000').answer).toEqual(['Set the time to 14000.']);
    expect(run(source, '/time query time').answer).toEqual(['The time is 14000.']);
    expect(run(source, '/time set 1d').answer).toEqual(['Set the time to 0.']);
  });

  it('keeps scores, display slots and tags', () => {
    const { source, only } = area();
    run(source, '/scoreboard objectives add points dummy {"text":"Points"}');
    run(source, '/scoreboard players set @s points 5');
    run(source, '/scoreboard players add @s points 3');
    run(source, '/scoreboard players remove #fake points 2');
    expect(source.functions.state.score('Player', 'points')).toBe(8);
    expect(source.functions.state.score('#fake', 'points')).toBe(-2);
    expect(run(source, '/scoreboard players get @s points').answer).toEqual([
      'Player has 8 [Points].',
    ]);
    run(source, '/scoreboard players operation @s points += #fake points');
    expect(source.functions.state.score('Player', 'points')).toBe(6);
    run(source, '/scoreboard objectives setdisplay sidebar points');
    expect(source.functions.state.display.get('sidebar')).toBe('points');
    expect(only().some((line) => line.includes('sidebar on the screen'))).toBe(true);
    run(source, '/scoreboard objectives add jumps minecraft.custom:minecraft.jump');
    expect(only().some((line) => line.includes('minecraft.custom:minecraft.jump'))).toBe(true);
    run(source, '/scoreboard objectives remove points');
    expect(source.functions.state.display.has('sidebar')).toBe(false);
    expect(run(source, '/scoreboard players set @s points 1').answer).toEqual([
      "Unknown scoreboard objective 'points'",
    ]);
    run(source, '/tag @s add hero');
    expect(run(source, '/tag @s list').answer).toEqual(['Tags: hero']);
    run(source, '/tag @s remove hero');
    expect(run(source, '/tag @s list').answer).toEqual(['There are no tags.']);
    expect(run(source, '/scoreboard players display name @s jumps x').result).toBe('game');
  });

  it('reads named entity data and stores it', () => {
    const { source, only } = area();
    run(source, '/scoreboard objectives add health dummy');
    run(source, '/execute store result score @s health run data get entity @s Health');
    expect(source.functions.state.score('Player', 'health')).toBe(20);
    expect(run(source, '/data get entity @s FoodLevel').result).toBe('ran');
    expect(only().some((line) => line.includes("player's hunger"))).toBe(true);
    expect(run(source, '/data get entity @s Pos[1]').result).toBe('ran');
    expect(run(source, '/data get entity @s Inventory').result).toBe('ran');
    expect(run(source, '/data get entity @s Brain').result).toBe('error');
    expect(run(source, '/data merge entity @s {}').result).toBe('game');
  });

  it('shows dialogs by name', () => {
    const { source } = area();
    run(source, '/dialog show @s fx:welcome');
    expect(source.functions.state.dialog?.id).toBe('fx:welcome');
    run(source, '/dialog clear @s');
    expect(source.functions.state.dialog).toBeNull();
  });

  it('runs execute: as, at, positioned, align, in, if and unless, store', () => {
    const { source, lines, only } = area();
    run(source, '/setblock 24 0 24 minecraft:gold_block');
    run(source, '/tp 24 1 24');
    expect(
      run(source, '/execute as @a at @s if block ~ ~-1 ~ minecraft:gold_block run say gold').answer,
    ).toEqual(['[Player] gold']);
    expect(
      run(source, '/execute unless block ~ ~-1 ~ minecraft:gold_block run say no').result,
    ).toBe('error');
    expect(lines()).not.toContain('[Player] no');
    expect(
      run(source, '/execute positioned 3 0 3 align xz run setblock ~ ~ ~ test:cube').result,
    ).toBe('ran');
    expect(source.world.get({ x: 3, y: 0, z: 3 })?.name).toBe('test:cube');
    run(source, '/execute in minecraft:the_nether run say there');
    expect(only().some((line) => line.includes('the dimension minecraft:the_nether'))).toBe(true);
    expect(run(source, '/execute if dimension minecraft:overworld').answer).toEqual([
      'Test passed',
    ]);
    run(source, '/scoreboard objectives add n dummy');
    run(source, '/scoreboard players set @s n 7');
    expect(run(source, '/execute if score @s n matches 5..9 run say in range').result).toBe('ran');
    expect(run(source, '/execute if score @s n > #none n').result).toBe('error');
    run(source, '/execute store success score #ok n if entity @s');
    expect(source.functions.state.score('#ok', 'n')).toBe(1);
    // B727: storage, a failed test storing 0, counts, and `on` finding nobody here.
    expect(run(source, '/execute store result storage fx:s v int 1 run say x').result).toBe('ran');
    expect(source.functions.state.storage.get('fx:s')).toEqual({ v: 1 });
    run(source, '/scoreboard players set #none n 5');
    run(source, '/execute store result score #none n if entity @e[tag=nobody]');
    expect(source.functions.state.score('#none', 'n')).toBe(0);
    expect(run(source, '/execute on vehicle run say x').result).toBe('error');
    expect(only().some((line) => line.includes('/execute on vehicle'))).toBe(true);
  });

  it('says commands the preview does not run, once, by name', () => {
    const { source, only } = area();
    expect(run(source, '/locate biome minecraft:plains').result).toBe('game');
    run(source, '/locate biome minecraft:plains');
    expect(only().filter((line) => line.includes('locate'))).toHaveLength(1);
    expect(run(source, '/give @s').result).toBe('error');
  });
});

describe('functions', () => {
  it('runs a function line by line with the expected world', () => {
    const { source, lines } = area(
      Object.fromEntries([
        fn('build', [
          '# a little tower',
          'setblock ~ ~ ~2 test:cube',
          'fill ~2 ~ ~2 ~2 ~2 ~2 minecraft:stone',
          'give @s minecraft:emerald 2',
          'say Built.',
        ]),
      ]),
    );
    const done = source.runFunction('fx:build');
    expect(done.commands).toBe(4);
    expect(done.answer).toContain('[Player] Built.');
    expect(source.world.get({ x: 24, y: 0, z: 26 })?.name).toBe('test:cube');
    expect(source.world.get({ x: 26, y: 2, z: 26 })?.name).toBe('minecraft:stone');
    expect(source.inventory.count('minecraft:emerald')).toBe(2);
    expect(lines()).toContain('Ran 4 commands from function fx:build.');
  });

  it('runs nested functions depth first and returns values', () => {
    const { source } = area(
      Object.fromEntries([
        fn('outer', [
          'scoreboard objectives add r dummy',
          'execute store result score #v r run function fx:inner',
          'say after',
          'return run function fx:value',
          'say never',
        ]),
        fn('inner', ['say inner', 'return 42', 'say not this']),
        fn('value', ['return 7']),
      ]),
    );
    const done = source.runFunction('fx:outer');
    expect(done.answer).toEqual(['Created new objective [r].', '[Player] inner', '[Player] after']);
    expect(source.functions.state.score('#v', 'r')).toBe(42);
    expect(done.result).toBe(7);
  });

  it('fills macro lines from the arguments and stops without them', () => {
    const { source, lines } = area(
      Object.fromEntries([
        fn('kit', ['$give $(who) minecraft:candle $(count)', '$say $(who) got $(count)']),
        fn('call', ['function fx:kit {who:"@s",count:3}']),
        fn('stored', ['function fx:kit with storage fx:args']),
      ]),
    );
    source.runFunction('fx:call');
    expect(source.inventory.count('minecraft:candle')).toBe(3);
    source.runFunction('fx:kit', { who: PREVIEW_PLAYER_UUID, count: 2 });
    expect(source.inventory.count('minecraft:candle')).toBe(5);
    source.runFunction('fx:kit');
    expect(lines().some((line) => line.includes('needs arguments'))).toBe(true);
    source.runFunction('fx:kit', { who: '@s' });
    expect(lines().some((line) => line.includes('Missing argument count'))).toBe(true);
    expect(source.inventory.count('minecraft:candle')).toBe(5);
  });

  it('runs the load tag once and the tick tag every tick, and schedules', () => {
    const { source, lines } = area(
      Object.fromEntries([
        fn('load', [
          'scoreboard objectives add t dummy',
          'say loaded',
          'schedule function fx:later 3t',
        ]),
        fn('tick', ['scoreboard players add #ticks t 1']),
        fn('later', ['say later']),
        ['data/minecraft/tags/function/load.json', JSON.stringify({ values: ['fx:load'] })],
        ['data/minecraft/tags/function/tick.json', JSON.stringify({ values: ['fx:tick'] })],
      ]),
    );
    for (let i = 0; i < 5; i += 1) source.tick();
    expect(lines().filter((line) => line === '[Server] loaded')).toHaveLength(1);
    expect(source.functions.state.score('#ticks', 't')).toBe(5);
    expect(lines()).toContain('[Server] later');
    // The tick tag's commands do not fill the log; only what the game shows is there.
    expect(lines().filter((line) => line.includes('#ticks'))).toHaveLength(0);
    source.clear();
    source.tick();
    expect(lines().filter((line) => line === '[Server] loaded')).toHaveLength(2);
  });

  it('stops a runaway function at the cap of a tick with one line', () => {
    const { source, lines } = area(
      Object.fromEntries([fn('loop', ['scoreboard players add #n c 1', 'function fx:loop'])]),
    );
    source.chat('/scoreboard objectives add c dummy');
    const started = performance.now();
    const done = source.runFunction('fx:loop');
    const took = performance.now() - started;
    expect(done.stopped).toBe(true);
    // One command of the tick went to the chat line; the rest to the loop.
    expect(done.commands).toBe(TICK_COMMAND_CAP - 1);
    expect(source.functions.state.score('#n', 'c')).toBe(Math.ceil((TICK_COMMAND_CAP - 1) / 2));
    expect(
      lines().filter((line) => line.includes('stopped the functions after 10,000')),
    ).toHaveLength(1);
    expect(took).toBeLessThan(2000);
    // The next tick has a new budget.
    source.tick();
    expect(source.runFunction('fx:loop').commands).toBe(TICK_COMMAND_CAP);
  });

  it('says a line it does not run, once, with the command name, and goes on', () => {
    const { source, only, lines } = area(
      Object.fromEntries([
        fn('travel', [
          'execute in fx:sky run locate biome minecraft:plains',
          'locate biome minecraft:plains',
          'forceload add 0 0',
          'say still here',
        ]),
      ]),
    );
    source.runFunction('fx:travel');
    source.runFunction('fx:travel');
    expect(lines()).toContain('[Player] still here');
    expect(only().filter((line) => line.includes('/locate'))).toHaveLength(1);
    expect(only().filter((line) => line.includes('/forceload'))).toHaveLength(1);
  });

  it('runs a project command through its function in the chat box', () => {
    const { source } = area({
      'msm/fx/command/kit.json': JSON.stringify({
        format: 1,
        name: 'kit',
        arguments: [
          { name: 'who', type: 'player' },
          { name: 'count', type: 'integer', min: 1 },
        ],
        function: 'fx:kit',
      }),
      ...Object.fromEntries([fn('kit', ['$give $(who) minecraft:candle $(count)'])]),
    });
    expect(source.chat('/kit Player 4').result).toBe('ran');
    expect(source.inventory.count('minecraft:candle')).toBe(4);
  });

  it('asks predicates for execute if predicate', () => {
    const night = {
      type: 'minecraft:time_check',
      clock: 'minecraft:overworld',
      period: 24000,
      value: { min: 13000, max: 23000 },
    };
    const { source, lines } = area({
      'data/fx/predicate/night.json': JSON.stringify(night),
      'data/fx/predicate/storm.json': JSON.stringify({
        type: 'minecraft:weather_check',
        thundering: true,
      }),
      ...Object.fromEntries([
        fn('sky', [
          'execute if predicate fx:night run say Night',
          'execute unless predicate fx:night run say Day',
          'execute if predicate fx:storm run say Storm',
        ]),
      ]),
    });
    source.runFunction('fx:sky');
    expect(lines()).toContain('[Player] Day');
    source.chat('/time set 14000');
    source.runFunction('fx:sky');
    expect(lines()).toContain('[Player] Night');
    expect(lines()).not.toContain('[Player] Storm');
  });
});

describe('understands', () => {
  it('answers for the gutter without running anything', () => {
    expect(understands('say hi')).toBe(true);
    expect(
      understands(
        'execute as @a at @s if block ~ ~-1 ~ minecraft:gold_block run effect give @s minecraft:speed 1 1 true',
      ),
    ).toBe(true);
    expect(understands('$give $(who) fx:candle $(count)')).toBe(true);
    expect(understands('$effect give @s minecraft:speed 30 $(power) true')).toBe(true);
    // B727: games' commands run.
    expect(understands('spreadplayers ~ ~ 0 64 false @s')).toBe(true);
    expect(understands('execute store result storage a:b c int 1 run say x')).toBe(true);
    expect(lineSupport('execute in fx:sky run locate biome minecraft:plains')).toMatchObject({
      runs: false,
      why: '/locate',
    });
    expect(lineSupport('execute store result entity @s Health float 1 run say x')).toMatchObject({
      runs: false,
      why: '/execute store result entity',
    });
    expect(lineSupport('# a comment')).toMatchObject({ runs: true, blank: true });
    expect(understands('# a comment')).toBe(false);
    expect(lineSupport('give @s')).toMatchObject({ runs: false, why: 'Expected an item' });
  });
});
