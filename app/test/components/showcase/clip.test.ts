/** The clip format and `validateClip` (B566, ADR 0118 D4). */

import { describe, expect, it } from 'vitest';
import {
  CLIP_MAX_TICKS,
  type ClipIds,
  clipId,
  clipIdOf,
  type ShowcaseClip,
  validateClip,
} from '../../../src/renderer/src/showcase/clip';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import { filesOf, TARGETS } from './showcase-fixture';

const woodSet = SHOWCASES[0] as ShowcaseClip;
const IDS: ClipIds = {
  has: (id) =>
    ['showcase:elm_planks', 'showcase:elm_log', 'showcase:elm_slab', 'showcase:elm_door'].includes(
      id,
    ),
};

describe('clip ids', () => {
  it('makes ./ ids the showcase namespace and keeps the others', () => {
    expect(clipId('./elm_planks')).toBe('showcase:elm_planks');
    expect(clipId('./elm_log[axis=y]')).toBe('showcase:elm_log[axis=y]');
    expect(clipId('minecraft:bell')).toBe('minecraft:bell');
    expect(clipIdOf('./elm_door[open=true]')).toBe('showcase:elm_door');
  });
});

describe('validateClip', () => {
  it('accepts clip 1 against its example on both targets', async () => {
    for (const target of TARGETS) {
      const files = await filesOf(woodSet.exampleId, target);
      expect(validateClip(woodSet, files.ids)).toEqual([]);
    }
    expect(validateClip(woodSet, IDS)).toEqual([]);
  });

  it('rejects an id the example does not have', () => {
    const clip: ShowcaseClip = {
      ...woodSet,
      steps: [
        ...woodSet.steps,
        {
          tick: 160,
          action: { type: 'place', pos: { x: 1, y: 8, z: 1 }, face: 'up', block: './oak_planks' },
        },
      ],
    };
    expect(validateClip(clip, IDS)).toEqual([
      expect.stringContaining('the example has no ./oak_planks'),
    ]);
    const bare: ShowcaseClip = {
      ...woodSet,
      setup: [{ pos: { x: 1, y: 9, z: 1 }, state: 'planks' }],
    };
    expect(validateClip(bare, IDS)).toEqual([expect.stringContaining('is not an id')]);
  });

  it('rejects a step after the end and steps out of order', () => {
    const late: ShowcaseClip = {
      ...woodSet,
      steps: [
        ...woodSet.steps,
        { tick: 201, action: { type: 'break', pos: { x: 22, y: 9, z: 25 } } },
      ],
    };
    expect(validateClip(late, IDS)).toEqual([
      expect.stringContaining('tick 201 is after the end (200)'),
    ]);
    const backwards: ShowcaseClip = {
      ...woodSet,
      steps: [
        ...woodSet.steps,
        { tick: 5, action: { type: 'break', pos: { x: 22, y: 9, z: 25 } } },
      ],
    };
    expect(validateClip(backwards, IDS)).toEqual([
      expect.stringContaining('tick 5 comes before the step above it'),
    ]);
  });

  it('rejects a camera key out of the area', () => {
    const clip: ShowcaseClip = {
      ...woodSet,
      camera: {
        type: 'keys',
        keys: [
          { tick: 0, eye: { x: 23.5, y: 11.5, z: 33 }, yaw: 180, pitch: 12 },
          { tick: 100, eye: { x: 23.5, y: 40, z: 33 }, yaw: 180, pitch: 12 },
        ],
      },
    };
    expect(validateClip(clip, IDS)).toEqual([
      expect.stringContaining('the eye 23.5, 40, 33 is outside the area'),
    ]);
    const none: ShowcaseClip = { ...woodSet, camera: { type: 'keys', keys: [] } };
    expect(validateClip(none, IDS)).toEqual([expect.stringContaining('needs at least one key')]);
  });

  it('rejects a loop over 12 seconds', () => {
    const clip: ShowcaseClip = { ...woodSet, length: CLIP_MAX_TICKS + 1 };
    expect(validateClip(clip, IDS)).toEqual([
      expect.stringContaining('longer than 240 (12 seconds)'),
    ]);
    expect(validateClip({ ...woodSet, length: CLIP_MAX_TICKS }, IDS)).toEqual([]);
  });

  it('rejects a still, caption, tool, block or order outside what can play', () => {
    const clip: ShowcaseClip = {
      ...woodSet,
      stillAt: 300,
      captions: [{ start: 50, end: 40, text: 'Backwards' }],
      setup: [{ pos: { x: 48, y: 9, z: 1 }, state: './elm_planks' }],
      steps: [
        { tick: 1, action: { type: 'tool', tool: 'paint', pos: { x: 1, y: 8, z: 1 } } },
        { tick: 2, action: { type: 'useVehicle', vehicle: -1 } },
      ],
    };
    const problems = validateClip(clip, IDS);
    expect(problems).toEqual([
      expect.stringContaining('stillAt: tick 300'),
      expect.stringContaining('setup[0]: 48, 9, 1 is not a block in the area'),
      expect.stringContaining('unknown tool paint'),
      expect.stringContaining('-1 is not an order'),
      expect.stringContaining('captions[0]'),
    ]);
  });
});

describe('a generated ground (B588)', () => {
  const islands = SHOWCASES.find((clip) => clip.id === 'world-islands') as ShowcaseClip;
  const ground = islands.ground as Extract<ShowcaseClip['ground'], { kind: 'generated' }>;

  it('accepts the world cards against their examples on both targets', async () => {
    for (const clip of SHOWCASES.filter((one) => one.ground.kind === 'generated')) {
      for (const target of TARGETS) {
        const files = await filesOf(clip.exampleId, target);
        expect(validateClip(clip, files.ids), `${clip.id} ${target.id}`).toEqual([]);
      }
    }
  });

  it('rejects a seed, a centre, a bottom or an id that cannot be a world', () => {
    const bad: ShowcaseClip = {
      ...islands,
      ground: {
        ...ground,
        seed: 'twelve',
        centre: { x: 1.5, z: 0 },
        bottom: 54.5,
        preset: 'Coral Isles',
        dimension: 'overworld',
      },
    };
    expect(validateClip(bad)).toEqual([
      'world-islands ground: the seed "twelve" is not a whole number',
      'world-islands ground: the centre must be a whole block',
      'world-islands ground: the bottom must be a whole block',
      'world-islands ground: "Coral Isles" is not an id (write ./name or minecraft:name)',
      'world-islands ground: "overworld" is not a dimension id',
    ]);
  });
});
