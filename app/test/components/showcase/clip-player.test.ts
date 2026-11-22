/**
 * The clip player (B566, ADR 0118 D5): clip 1 plays to its end on both targets with every step's
 * expectation met; stepping is by ticks; the loop restarts from the setup; mobs and vehicles are
 * named by order; nothing runs before the scripts have loaded.
 */

import { SCRIPT_API } from '@msm/plugin-scripting';
import { type CompiledScript, inProcessRunner, type ScriptModuleFn } from '@msm/sim';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShowcaseClip } from '../../../src/renderer/src/showcase/clip';
import {
  ClipPlayer,
  MAX_TICKS_PER_FRAME,
  SCRIPT_WAIT_MS,
  TICK_MS,
} from '../../../src/renderer/src/showcase/clip-player';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import type {
  TranspileOutcome,
  TryItScripts,
} from '../../../src/renderer/src/tryit/session-source';
import { filesOf, TARGETS } from './showcase-fixture';

const woodSet = SHOWCASES[0] as ShowcaseClip;
const players: ClipPlayer[] = [];

afterEach(() => {
  for (const player of players.splice(0)) player.dispose();
});

async function playerFor(
  clip: ShowcaseClip,
  targetIndex = 0,
  scripts?: TryItScripts,
): Promise<ClipPlayer> {
  const target = TARGETS[targetIndex];
  if (target === undefined) throw new Error('no target');
  const example = await filesOf(clip.exampleId, target);
  const player = new ClipPlayer({ clip, example, ...(scripts === undefined ? {} : { scripts }) });
  players.push(player);
  return player;
}

const stateAt = (player: ClipPlayer, x: number, y: number, z: number): string | null => {
  const state = player.area.source.world.get({ x, y, z });
  if (state === null) return null;
  const props = Object.entries(state.properties)
    .map(([key, value]) => `${key}=${value}`)
    .sort();
  return props.length === 0 ? state.name : `${state.name}[${props.join(',')}]`;
};

describe('clip 1, a set of wood', () => {
  for (const [index, target] of TARGETS.entries()) {
    it(`plays to its end on ${target.id} with every step as expected`, async () => {
      const player = await playerFor(woodSet, index);
      expect(player.ready).toBe(true);
      // The setup is in place before the first frame.
      expect(stateAt(player, 21, 9, 21)).toBe('showcase:elm_log[axis=y]');
      expect(stateAt(player, 23, 12, 23)).toBe('showcase:elm_slab[type=bottom]');
      player.playToEnd();
      expect(player.tick).toBe(woodSet.length);
      expect(player.problems).toEqual([]);
      expect(player.records.map((record) => record.tick)).toEqual(
        woodSet.steps.map((step) => step.tick),
      );
      // Nothing only the game does, nothing skipped: placing and doors are the preview's own.
      expect(player.lines.filter((line) => line.kind !== 'info')).toEqual([]);
      expect(stateAt(player, 22, 10, 25)).toBe('showcase:elm_planks');
      expect(stateAt(player, 23, 9, 25)).toContain('open=false');
    });
  }

  it('reports a step that does not give what the clip expects', async () => {
    const clip: ShowcaseClip = {
      ...woodSet,
      steps: [
        ...woodSet.steps,
        {
          tick: 160,
          action: { type: 'break', pos: { x: 22, y: 9, z: 25 } },
          expect: [
            { at: { x: 22, y: 9, z: 25 }, state: './elm_planks' },
            { line: 'a line nobody writes', within: 5 },
          ],
        },
        { tick: 170, action: { type: 'set', pos: { x: 1, y: 9, z: 1 }, state: './no_such_block' } },
      ],
    };
    const player = await playerFor(clip);
    player.playToEnd();
    expect(player.problems).toEqual([
      'Step 11 (tick 160) should leave ./elm_planks at 22, 9, 25; found nothing.',
      // A line may come later, so it is missed only once its time is up.
      'Step 11 (tick 160) should say "a line nobody writes".',
      'No block ./no_such_block to put at 1, 9, 1.',
    ]);
  });

  it('starts over from the setup at the end', async () => {
    const player = await playerFor(woodSet);
    player.playToEnd();
    expect(player.loops).toBe(0);
    expect(player.stepTick()).toBe(true);
    expect(player.loops).toBe(1);
    expect(player.tick).toBe(0);
    // The placed planks and the door are gone; the hut of the setup is back.
    expect(stateAt(player, 22, 9, 25)).toBeNull();
    expect(stateAt(player, 23, 9, 25)).toBeNull();
    expect(stateAt(player, 21, 9, 21)).toBe('showcase:elm_log[axis=y]');
    // The ground came back too.
    expect(stateAt(player, 10, 8, 10)).toBe('minecraft:grass_block');
    expect(player.records).toEqual([]);
    player.playToEnd();
    expect(player.problems).toEqual([]);
    expect(player.records).toHaveLength(woodSet.steps.length);
  });

  it('steps by whole ticks of the elapsed time, never skipping one', async () => {
    const player = await playerFor(woodSet);
    player.advance(TICK_MS * 2 + 20);
    expect(player.tick).toBe(2);
    expect(player.alpha).toBeCloseTo(0.4);
    player.advance(30);
    expect(player.tick).toBe(3);
    // A long frame runs at most a few ticks; the clip slows down rather than jumping.
    player.advance(5_000);
    expect(player.tick).toBe(3 + MAX_TICKS_PER_FRAME);
    expect(player.alpha).toBeLessThanOrEqual(1);
  });

  it('gives the camera between its keys and the captions of the moment', async () => {
    const player = await playerFor(woodSet);
    expect(player.camera()).toEqual({ eye: { x: 23.5, y: 11.5, z: 33 }, yaw: 180, pitch: 12 });
    expect(player.captions()).toEqual([]);
    while (player.tick < 120) player.stepTick();
    expect(player.camera().eye).toEqual({ x: 30.5, y: 12.5, z: 31.5 });
    expect(player.captions().map((caption) => caption.text)).toEqual([
      'Your own door opens and shuts',
    ]);
  });
});

describe('mobs and vehicles by order', () => {
  const pet: ShowcaseClip = {
    ...woodSet,
    id: 'pet-test',
    exampleId: 'example_msm_tameable_pet',
    setup: [],
    spawns: [{ on: { x: 23, y: 8, z: 24 }, egg: './ember_fox_spawn_egg' }],
    steps: [
      { tick: 5, action: { type: 'interact', mob: 0 } },
      { tick: 6, action: { type: 'interact', mob: 3 } },
      { tick: 7, action: { type: 'useVehicle', vehicle: 0 } },
    ],
    camera: {
      type: 'follow',
      mob: 0,
      offset: { x: 0, y: 2.5, z: 5 },
      keys: [{ tick: 0, eye: { x: 1, y: 12, z: 1 }, yaw: 0, pitch: 0 }],
    },
    captions: [],
    stillAt: 10,
    length: 20,
  };

  it('uses the first mob, follows it with the camera and says when one is missing', async () => {
    const player = await playerFor(pet);
    expect(player.area.source.entities.count).toBe(1);
    player.playToEnd();
    expect(player.problems).toEqual([
      'There is no mob number 4 to use.',
      'There is no vehicle number 1 to use.',
    ]);
    const mob = player.area.source.entities.snapshots()[0];
    if (mob === undefined) throw new Error('no mob');
    const pose = player.camera();
    expect(pose.eye.y).toBeCloseTo(mob.position.y + 2.5, 0);
    // It looks back at the mob (north, slightly down).
    expect(Math.abs((((pose.yaw % 360) + 360) % 360) - 180)).toBeLessThan(5);
    expect(pose.pitch).toBeGreaterThan(0);
  });

  it('drives the first vehicle with a held move and rides with the driver camera', async () => {
    const clip: ShowcaseClip = {
      ...woodSet,
      id: 'vehicle-test',
      exampleId: 'example_msm_vehicle',
      ground: { kind: 'flat' },
      player: { x: 24.5, y: 4, z: 34.5 },
      setup: [],
      steps: [
        { tick: 1, action: { type: 'look', yaw: 180, pitch: 0 } },
        {
          tick: 5,
          action: { type: 'use', pos: { x: 24, y: 3, z: 30 }, face: 'up', item: './tank' },
        },
        {
          tick: 20,
          action: { type: 'useVehicle', vehicle: 0 },
          expect: [{ line: 'You got into' }],
        },
        { tick: 30, action: { type: 'move', forward: 1, strafe: 0 } },
      ],
      camera: { type: 'driver' },
      captions: [],
      stillAt: 60,
      length: 70,
    };
    const player = await playerFor(clip);
    while (player.tick < 30) player.stepTick();
    const start = player.area.source.vehicles.snapshots()[0]?.position.z ?? 0;
    expect(player.area.source.vehicles.riding).not.toBeNull();
    player.playToEnd();
    expect(player.problems).toEqual([]);
    const end = player.area.source.vehicles.snapshots()[0]?.position.z ?? 0;
    // One `move` step holds: the tank drove north for 40 ticks.
    expect(start - end).toBeGreaterThan(4);
    const pose = player.camera();
    expect(pose.yaw).toBe(180);
    expect(pose.eye.z).toBeGreaterThan(end);
  });
});

describe('scripts', () => {
  const compile = (script: CompiledScript): ScriptModuleFn =>
    new Function('exports', 'require', 'module', 'msm', `${script.js}\n`) as ScriptModuleFn;
  const transpileNow = (source: string): TranspileOutcome => ({
    js: ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        downlevelIteration: true,
        alwaysStrict: true,
      },
    }).outputText,
  });

  const rules: ShowcaseClip = {
    ...woodSet,
    id: 'rules-test',
    exampleId: 'example_msm_rules',
    ground: { kind: 'flat' },
    player: { x: 24.5, y: 4, z: 28.5 },
    setup: [{ pos: { x: 24, y: 4, z: 24 }, state: './lucky_block' }],
    steps: [
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 0 } },
      {
        tick: 10,
        action: { type: 'break', pos: { x: 24, y: 4, z: 24 } },
        expect: [{ line: 'ran as a script', within: 3 }],
      },
    ],
    camera: {
      type: 'keys',
      keys: [{ tick: 0, eye: { x: 24.5, y: 6.5, z: 30 }, yaw: 180, pitch: 18 }],
    },
    captions: [],
    stillAt: 10,
    length: 20,
  };

  it('waits for the scripts to load before the first step', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scripts: TryItScripts = {
      transpile: async (source) => {
        await gate;
        return transpileNow(source);
      },
      api: SCRIPT_API,
      runner: () => inProcessRunner(compile),
    };
    const player = await playerFor(rules, 0, scripts);
    expect(player.ready).toBe(false);
    expect(player.stepTick()).toBe(false);
    player.advance(TICK_MS * 3);
    expect(player.tick).toBe(0);
    release();
    await player.whenReady();
    expect(player.ready).toBe(true);
    player.playToEnd();
    expect(player.problems).toEqual([]);
    expect(player.lines.some((line) => line.text.includes('Open a lucky block'))).toBe(true);
    // Silent: the rule's sound is a caption, with no sound output (B565 Z13).
    expect(player.lines.some((line) => line.text.includes('played sound'))).toBe(true);
    expect(player.area.effects.captions.length).toBeGreaterThan(0);
  });

  it('plays without the scripts once it has waited long enough', async () => {
    const scripts: TryItScripts = {
      transpile: () => new Promise<TranspileOutcome>(() => undefined),
      api: SCRIPT_API,
      runner: () => inProcessRunner(compile),
    };
    const player = await playerFor(rules, 0, scripts);
    player.advance(SCRIPT_WAIT_MS - 1);
    expect(player.tick).toBe(0);
    player.advance(TICK_MS);
    expect(player.ready).toBe(true);
    expect(player.tick).toBe(1);
    expect(player.problems).toEqual([
      'The scripts did not load in time; the clip plays without them.',
    ]);
  });
});
