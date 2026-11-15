/**
 * Vanilla parity 2 in Try it (B463) over `fixtures/sample-vanilla-blocks` lowered on every
 * built-in target: the twenty types and their companions are read, placed and used with the
 * states the runtime has (B445, B446, B448 notes), signs keep their text, ladders are climbed,
 * blocks hold water, tin ages with the neighbour rule, bags open their screens, the chat box
 * checks commands as the runtime does, and the place and explosion rules stop or keep.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AGEING_TRY,
  ageingChance,
  type BlockPos,
  FIRST_STAGE_MODIFIER,
  LocalWorldSource,
  type SimFiles,
} from '../../src/index.js';
import { builtInTargets, lowerFixture } from '../lower-fixture.js';

const NS = 'msm_sample_vanilla_blocks';
const id = (path: string): string => `${NS}:${path}`;
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number): BlockPos => ({ x, y: -1, z });

const targets = await builtInTargets();

/** A generated Rules script, as the rules compiler writes it (goldens of `@msm/plugin-rules`). */
function rulesScript(body: string): string {
  return [
    '// Made by Rules from demo:rules; edit the rules, not this file.',
    'import { msm } from "msm:runtime";',
    '',
    body,
  ].join('\n');
}

const STOP_PLACING = rulesScript(`// When a player places Ember Torch.
msm.events.on("block.place", (e) => {
  if (e.block !== "${id('ember_torch')}") return;
  const player: Player | undefined = e.player;
  // When a player places Ember Torch, stop the placing.
  rule("no_torches", () => { // rule:no_torches
    e.cancel(); // rule:no_torches
    players([player]).forEach((target) => target.sendMessage("Not here.")); // rule:no_torches
  }); // rule:no_torches
});`);

const EXPLOSIONS = rulesScript(`// When something explodes.
msm.events.on("world.explosion", (e) => {
  const other: Entity | undefined = e.source;
  // When something explodes, if it was caused by Creeper, stop the explosion.
  rule("creepers", () => { // rule:creepers
    if (!(isType(other, "minecraft:creeper"))) return; // rule:creepers
    e.cancel(); // rule:creepers
  }); // rule:creepers
  // When something explodes, if it was caused by a block, keep the blocks safe.
  rule("beds", () => { // rule:beds
    if (!(other === undefined)) return; // rule:beds
    e.keepBlocks(); // rule:beds
  }); // rule:beds
});`);

describe.each(targets.map((target) => [target.id, target] as const))(
  'sample-vanilla-blocks on %s',
  (_, target: Target) => {
    let files: SimFiles;

    beforeAll(async () => {
      const lowered = await lowerFixture('sample-vanilla-blocks', target);
      expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      files = lowered.files;
    }, 60_000);

    const area = (extra: Record<string, string> = {}): LocalWorldSource =>
      new LocalWorldSource({
        files: new Map([...files, ...Object.entries(extra)]),
        target,
        seed: 3,
        chance: 'always',
      });

    const placeOn = (
      source: LocalWorldSource,
      block: string,
      pos: BlockPos,
      face: 'up' | 'down' | 'north' | 'south' | 'west' | 'east' = 'up',
      hit = UP,
    ) => source.act({ type: 'place', pos, face, hit, block: id(block) });

    const props = (source: LocalWorldSource, pos: BlockPos) => source.world.get(pos)?.properties;
    const nameAt = (source: LocalWorldSource, pos: BlockPos) => source.world.get(pos)?.name;

    it('reads every block of the twenty types, none as a prop', () => {
      const source = area();
      const types = new Map(
        source.catalogue.ids().map((one) => [one, source.catalogue.get(one)?.type] as const),
      );
      expect(types.get(id('honey_cake'))).toBe('cake');
      expect(types.get(id('cedar_hanging_sign'))).toBe('hanging_sign');
      expect(types.get(id('bamboo_frame'))).toBe('scaffolding');
      expect(new Set(types.values()).size).toBeGreaterThanOrEqual(21);
      for (const one of source.catalogue.ids()) expect(source.catalogue.get(one)?.prop).toBe(false);
      // Companions are known, but not offered on their own.
      expect(source.catalogue.get(id('ember_torch_wall'))?.types2?.companion?.of).toBe(
        id('ember_torch'),
      );
      expect(source.catalogue.ids()).not.toContain(id('cedar_sign_wall'));
      expect(source.lines.filter((line) => line.text.includes('prop for looks'))).toEqual([]);
    });

    it('places every type on the floor or a block', () => {
      const source = area();
      const blocks = source.catalogue.ids().filter((one) => one.startsWith(`${NS}:`));
      let x = 2;
      placeOn(source, 'tin', floor(1, 2));
      for (const block of blocks) {
        const path = block.slice(NS.length + 1);
        if (['cocoa', 'ladder'].includes(source.catalogue.get(block)?.type ?? '')) continue;
        if (path === 'ivy' || path === 'cedar_hanging_sign') continue;
        placeOn(source, path, floor(x, 2));
        expect(source.world.get({ x, y: 0, z: 2 })?.name, path).toBeDefined();
        x += 2;
        if (x > 44) break;
      }
    });

    it('cuts a cake slice by slice and fires its on_eat', () => {
      const source = area();
      const at = { x: 3, y: 0, z: 3 };
      placeOn(source, 'honey_cake', floor(3, 3));
      for (let bite = 1; bite <= 6; bite++) {
        source.act({ type: 'use', pos: at, face: 'up', hit: UP });
        expect(props(source, at)?.bites).toBe(String(bite));
      }
      source.act({ type: 'use', pos: at, face: 'up', hit: UP });
      expect(source.world.get(at)).toBeNull();
      expect(source.trace.some((entry) => entry.text.includes('honey_cake_eaten'))).toBe(true);
    });

    it('grows and harvests a berry bush', () => {
      const source = area();
      const at = { x: 4, y: 0, z: 4 };
      placeOn(source, 'blue_berry_bush', floor(4, 4));
      source.act({ type: 'tool', tool: 'grow', pos: at });
      source.act({ type: 'tool', tool: 'grow', pos: at });
      expect(props(source, at)?.age).toBe('2');
      source.act({ type: 'use', pos: at, face: 'up', hit: UP });
      expect(props(source, at)?.age).toBe('1');
      const picked = source.inventory.count(id('blue_berries'));
      expect(picked).toBeGreaterThanOrEqual(1);
      expect(picked).toBeLessThanOrEqual(2);
    });

    it('stacks candles, pickles and layers, and lights a candle', () => {
      const source = area();
      const candle = { x: 5, y: 0, z: 5 };
      placeOn(source, 'tallow_candle', floor(5, 5));
      placeOn(source, 'tallow_candle', candle, 'up');
      placeOn(source, 'tallow_candle', candle, 'north');
      expect(props(source, candle)?.candles).toBe('3');
      source.act({ type: 'use', pos: candle, face: 'up', hit: UP });
      expect(props(source, candle)?.lit).toBe('true');
      const layer = { x: 7, y: 0, z: 5 };
      placeOn(source, 'ash_layer', floor(7, 5));
      placeOn(source, 'ash_layer', layer, 'up');
      expect(props(source, layer)?.layers).toBe('2');
      const pickle = { x: 9, y: 0, z: 5 };
      placeOn(source, 'glow_pod', floor(9, 5));
      placeOn(source, 'glow_pod', pickle, 'up');
      expect(props(source, pickle)).toMatchObject({ pickles: '2', waterlogged: 'false' });
    });

    it('takes two blocks for a bed and a tall plant, and breaks both', () => {
      const source = area();
      source.player.teleport({ x: 30.5, y: 0, z: 30.5 });
      // Looking south (yaw 0): the head goes south of the foot.
      placeOn(source, 'cosy_bed', floor(10, 10));
      expect(props(source, { x: 10, y: 0, z: 10 })).toMatchObject({
        part: 'foot',
        facing: 'south',
      });
      expect(props(source, { x: 10, y: 0, z: 11 })).toMatchObject({
        part: 'head',
        facing: 'south',
      });
      source.act({ type: 'break', pos: { x: 10, y: 0, z: 11 } });
      expect(source.world.get({ x: 10, y: 0, z: 10 })).toBeNull();
      placeOn(source, 'tall_bluebell', floor(12, 10));
      expect(props(source, { x: 12, y: 1, z: 10 })?.half).toBe('upper');
      source.act({ type: 'break', pos: { x: 12, y: 0, z: 10 } });
      expect(source.world.get({ x: 12, y: 1, z: 10 })).toBeNull();
    });

    it('puts torches and signs on walls as their companions, and hanging signs under blocks', () => {
      const source = area();
      const wall = { x: 14, y: 0, z: 14 };
      placeOn(source, 'tin', floor(14, 14));
      placeOn(source, 'ember_torch', wall, 'east', { x: 1, y: 0.5, z: 0.5 });
      expect(nameAt(source, { x: 15, y: 0, z: 14 })).toBe(id('ember_torch_wall'));
      expect(props(source, { x: 15, y: 0, z: 14 })?.facing).toBe('east');
      placeOn(source, 'cedar_sign', wall, 'north', { x: 0.5, y: 0.5, z: 0 });
      expect(nameAt(source, { x: 14, y: 0, z: 13 })).toBe(id('cedar_sign_wall'));
      placeOn(source, 'cedar_sign', floor(17, 14));
      expect(props(source, { x: 17, y: 0, z: 14 })?.rotation).toBe('8');
      placeOn(source, 'tin', { x: 14, y: 0, z: 14 }, 'up');
      placeOn(source, 'tin', { x: 14, y: 1, z: 14 }, 'west', { x: 0, y: 0.5, z: 0.5 });
      placeOn(source, 'cedar_hanging_sign', { x: 13, y: 1, z: 14 }, 'down', {
        x: 0.5,
        y: 0,
        z: 0.5,
      });
      expect(props(source, { x: 13, y: 0, z: 14 })).toMatchObject({
        attached: 'false',
        rotation: '8',
      });
      source.act({ type: 'break', pos: { x: 13, y: 0, z: 14 } });
      source.act({
        type: 'move',
        forward: 0,
        strafe: 0,
        jump: false,
        sneak: true,
        toggleFly: false,
        yaw: 0,
        pitch: 0,
      });
      source.tick();
      placeOn(source, 'cedar_hanging_sign', { x: 13, y: 1, z: 14 }, 'down', {
        x: 0.5,
        y: 0,
        z: 0.5,
      });
      expect(props(source, { x: 13, y: 0, z: 14 })?.attached).toBe('true');
    });

    it('keeps sign text and opens the editor when a sign is placed', () => {
      const source = area();
      placeOn(source, 'cedar_sign', floor(18, 18));
      const pos = { x: 18, y: 0, z: 18 };
      expect(source.parity2.signEditing?.pos).toEqual(pos);
      source.parity2.writeSign({ lines: ['Welcome', 'to the', 'Cedar Inn', ''], colour: 'blue' });
      expect(source.parity2.signEditing).toBeNull();
      expect(source.parity2.signText(pos).front.lines).toEqual([
        'Welcome',
        'to the',
        'Cedar Inn',
        '',
      ]);
      expect(
        source.lines.some((line) => line.text.includes('"Welcome / to the / Cedar Inn"')),
      ).toBe(true);
      source.parity2.waxSign(pos);
      source.act({ type: 'use', pos, face: 'up', hit: UP });
      expect(source.parity2.signEditing).toBeNull();
      source.act({ type: 'break', pos });
      expect(source.parity2.signs.has(pos)).toBe(false);
    });

    it('hangs lanterns, turns chains and rods with the face', () => {
      const source = area();
      placeOn(source, 'tin', floor(20, 20));
      placeOn(source, 'tin', { x: 20, y: 0, z: 20 }, 'up');
      placeOn(source, 'tin', { x: 20, y: 1, z: 20 }, 'up');
      placeOn(source, 'paper_lantern', { x: 20, y: 2, z: 20 }, 'east', { x: 1, y: 0.5, z: 0.5 });
      expect(props(source, { x: 21, y: 2, z: 20 })?.hanging).toBe('false');
      placeOn(source, 'paper_lantern', { x: 20, y: 2, z: 20 }, 'down', { x: 0.5, y: 0, z: 0.5 });
      expect(source.world.get({ x: 20, y: 1, z: 20 })?.name).toBe(id('tin'));
      placeOn(source, 'brass_chain', { x: 20, y: 0, z: 20 }, 'west', { x: 0, y: 0.5, z: 0.5 });
      expect(props(source, { x: 19, y: 0, z: 20 })?.axis).toBe('x');
      placeOn(source, 'crystal_rod', { x: 20, y: 1, z: 20 }, 'north', { x: 0.5, y: 0.5, z: 0 });
      expect(props(source, { x: 20, y: 1, z: 19 })?.facing).toBe('north');
    });

    it('grows a stem into its fruit and an attached stem', () => {
      const source = area();
      const at = { x: 24, y: 0, z: 8 };
      placeOn(source, 'gourd_stem', floor(24, 8));
      for (let i = 0; i < 8; i++) source.act({ type: 'tool', tool: 'grow', pos: at });
      expect(nameAt(source, at)).toBe(id('gourd_stem_attached'));
      const facing = props(source, at)?.facing as string;
      const step = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[
        facing
      ] as number[];
      expect(
        nameAt(source, { x: 24 + (step[0] as number), y: 0, z: 8 + (step[1] as number) }),
      ).toBe(id('gourd'));
    });

    it('counts scaffolding distance and builds columns and rows', () => {
      const source = area();
      placeOn(source, 'bamboo_frame', floor(30, 4));
      expect(props(source, { x: 30, y: 0, z: 4 })).toMatchObject({
        distance: '0',
        bottom: 'false',
      });
      // A side face builds up the column.
      placeOn(source, 'bamboo_frame', { x: 30, y: 0, z: 4 }, 'north', { x: 0.5, y: 0.5, z: 0 });
      expect(props(source, { x: 30, y: 1, z: 4 })?.distance).toBe('0');
      // The top face builds a row the way the player looks (east, yaw 270), at most six along.
      source.player.teleport({ x: 10.5, y: 0, z: 10.5 });
      source.act({
        type: 'move',
        forward: 0,
        strafe: 0,
        jump: false,
        sneak: false,
        toggleFly: false,
        yaw: 270,
        pitch: 0,
      });
      source.tick();
      for (let i = 0; i < 8; i++) placeOn(source, 'bamboo_frame', { x: 30, y: 1, z: 4 }, 'up');
      expect(props(source, { x: 31, y: 1, z: 4 })).toMatchObject({ distance: '1', bottom: 'true' });
      expect(props(source, { x: 36, y: 1, z: 4 })?.distance).toBe('6');
      expect(source.world.get({ x: 37, y: 1, z: 4 })).toBeNull();
    });

    it('lets the player climb a ladder', () => {
      const source = area();
      placeOn(source, 'tin', floor(36, 36));
      placeOn(source, 'tin', { x: 36, y: 0, z: 36 }, 'up');
      placeOn(source, 'tin', { x: 36, y: 1, z: 36 }, 'up');
      placeOn(source, 'rope_ladder', { x: 36, y: 0, z: 36 }, 'south', { x: 0.5, y: 0.5, z: 1 });
      placeOn(source, 'rope_ladder', { x: 36, y: 1, z: 36 }, 'south', { x: 0.5, y: 0.5, z: 1 });
      expect(source.catalogue.get(id('rope_ladder'))?.climbable).toBe(true);
      source.player.teleport({ x: 36.5, y: 0, z: 37.5 });
      // Facing north into the ladder, walking forward.
      for (let i = 0; i < 20; i++) {
        source.act({
          type: 'move',
          forward: 1,
          strafe: 0,
          jump: false,
          sneak: false,
          toggleFly: false,
          yaw: 180,
          pitch: 0,
        });
        source.tick();
      }
      expect(source.player.position.y).toBeGreaterThan(1);
    });

    it('puts water in a block that can hold it, and leaves it when broken', () => {
      const source = area();
      const at = { x: 40, y: 0, z: 40 };
      placeOn(source, 'sea_lamp', floor(40, 40));
      source.act({ type: 'tool', tool: 'water', pos: at });
      expect(props(source, at)?.waterlogged).toBe('true');
      source.act({ type: 'break', pos: at });
      expect(nameAt(source, at)).toBe('minecraft:water');
      placeOn(source, 'tin', floor(41, 40));
      source.act({ type: 'tool', tool: 'water', pos: { x: 41, y: 0, z: 40 } });
      expect(source.lines.at(-1)?.text).toContain('cannot hold water');
    });

    it('ages tin with the neighbour rule', () => {
      const source = area();
      const tin = { x: 6, y: 0, z: 30 };
      placeOn(source, 'tin', floor(6, 30));
      expect(ageingChance(source.world, source.catalogue, tin)).toBeCloseTo(
        AGEING_TRY * FIRST_STAGE_MODIFIER,
        10,
      );
      // An older neighbour makes it likelier; then a younger one next to the older stops that.
      placeOn(source, 'exposed_tin', floor(8, 30));
      const exposed = { x: 8, y: 0, z: 30 };
      expect(ageingChance(source.world, source.catalogue, exposed)).toBe(0);
      let steps = 0;
      while (nameAt(source, tin) === id('tin') && steps < 200) {
        source.timeLapse();
        steps += 1;
      }
      expect(nameAt(source, tin)).toBe(id('exposed_tin'));
      expect(source.lines.some((line) => line.text.includes('could not age'))).toBe(true);
    });

    it('opens bag screens with the runtime slot counts', () => {
      const source = area();
      expect(source.useItem(id('seed_pouch'))).toBe(true);
      expect(source.parity2.bag?.spec).toMatchObject({ screen: 'hopper', rows: 1, columns: 5 });
      source.parity2.closeBag();
      source.useItem(id('tool_kit'));
      expect(source.parity2.bag?.spec).toMatchObject({ screen: 'dispenser', rows: 3, columns: 3 });
      source.parity2.closeBag();
      // The satchel opens only while sneaking.
      source.useItem(id('satchel'));
      expect(source.parity2.bag).toBeNull();
      source.act({
        type: 'move',
        forward: 0,
        strafe: 0,
        jump: false,
        sneak: true,
        toggleFly: false,
        yaw: 0,
        pitch: 0,
      });
      source.tick();
      source.useItem(id('satchel'));
      expect(source.parity2.bag?.spec).toMatchObject({ screen: 'chest', rows: 2, columns: 9 });
      source.useItem(id('charm_bundle'));
      expect(source.lines.at(-1)?.text).toContain('a bundle');
    });

    it('checks commands as the runtime does and fires the event', () => {
      const source = area();
      const greet = source.chat('/greet');
      expect(greet.result).toBe('ran');
      expect(greet.answer).toEqual(['Hello from the vanilla blocks sample!']);
      // A Rules command trigger (B458) adds its own event; the command's own "wave" runs too.
      expect(source.trace.some((entry) => /event "wave" (ran|too)/.test(entry.text))).toBe(true);
      expect(source.chat('/hiya').result).toBe('ran');
      const kit = source.chat('/kit Player 5');
      expect(kit.result).toBe('ran');
      expect(
        source.lines.some(
          (line) =>
            line.onlyInMinecraft &&
            line.text.includes(
              `run function ${id('give_kit')} with who = "Player's UUID", count = 5`,
            ),
        ),
      ).toBe(true);
      expect(source.chat('/kit Player 0').answer).toEqual([
        'Integer must not be less than 1, found 0',
        '...it Player <--[HERE]',
      ]);
      expect(source.chat('/kit Player').answer[0]).toBe(
        'Unknown or incomplete command, see below for error',
      );
      expect(source.chat('/kit @a 2').answer[0]).toBe(
        'Only one player is allowed, but the provided selector allows more than one',
      );
      expect(source.chat('/greet now').answer[0]).toBe('Incorrect argument for command');
      expect(source.chat('/give @s stone').result).toBe('game');
      expect(source.chat('/nothing').answer).toEqual([
        'Unknown or incomplete command, see below for error',
        'nothing<--[HERE]',
      ]);
    });

    it('lets a place rule stop the placing', () => {
      const source = area({ [`msm/${NS}/script/rules/demo.ts`]: STOP_PLACING });
      placeOn(source, 'ember_torch', floor(3, 40));
      expect(source.world.get({ x: 3, y: 0, z: 40 })).toBeNull();
      expect(source.trace.some((entry) => entry.text.includes('it stopped the placing'))).toBe(
        true,
      );
      expect(source.lines.some((line) => line.text.includes('the other steps of rule'))).toBe(true);
      placeOn(source, 'tin', floor(4, 40));
      expect(source.world.get({ x: 4, y: 0, z: 40 })).not.toBeNull();
    });

    it('fires the explosion rules: caused by a block keeps the blocks safe', () => {
      const plain = area();
      placeOn(plain, 'tin', floor(10, 40));
      placeOn(plain, 'tin', floor(11, 40));
      plain.act({ type: 'tool', tool: 'explode', pos: { x: 10, y: 0, z: 40 } });
      expect(plain.world.get({ x: 11, y: 0, z: 40 })).toBeNull();
      const ruled = area({ [`msm/${NS}/script/rules/demo.ts`]: EXPLOSIONS });
      placeOn(ruled, 'tin', floor(10, 40));
      ruled.act({ type: 'tool', tool: 'explode', pos: { x: 10, y: 0, z: 40 } });
      expect(ruled.world.get({ x: 10, y: 0, z: 40 })).not.toBeNull();
      const texts = ruled.trace.map((entry) => entry.text);
      expect(texts.some((text) => text.includes('rule "creepers" did not apply'))).toBe(true);
      expect(texts.some((text) => text.includes('rule "beds" ran: it kept the blocks safe'))).toBe(
        true,
      );
    });
  },
);
