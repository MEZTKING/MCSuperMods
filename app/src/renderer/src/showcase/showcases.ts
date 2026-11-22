/**
 * The showcase list (ADR 0118 D3, D12): the cards of **See what you can make**, in order, each a
 * clip drawn from a library example by id, with Home's own Make this actions. The list belongs
 * to the app, as Home's tiles do (`components/home/tiles.ts`); the examples stay in the library
 * unchanged. B566 holds the first card only; B567 adds the other nine.
 *
 * The clip scripts follow B565's measured action sequences
 * (`docs/reference/spikes/b565/README.md`).
 *
 * @packageDocumentation
 */

import type { ExampleProject, TargetFacts } from '@msm/plugin-api';
import type { ClipBlock, ClipPoint, ClipStep, ShowcaseClip } from './clip';

/** The showcase list: clips in the order the cards show. */
export type ShowcaseList = readonly ShowcaseClip[];

const v = (x: number, y: number, z: number): ClipPoint => ({ x, y, z });

/** The quick flat ground of grass over dirt and stone with a few trees (first air at y 9). */
const QUICK_FEW_TREES = {
  kind: 'quick',
  options: {
    shape: 'flat',
    layers: [
      { block: 'minecraft:grass_block[snowy=false]', thickness: 1 },
      { block: 'minecraft:dirt', thickness: 3 },
      { block: 'minecraft:stone', thickness: 4 },
      { block: 'minecraft:bedrock', thickness: 1 },
    ],
    water: false,
    waterLevel: 4,
    trees: 'few',
    seed: 11,
  },
} as const;

/** Card 1: a small elm hut; planks and slabs are placed, the door opens and shuts. */
function woodSet(): ShowcaseClip {
  const s = 9;
  const setup: ClipBlock[] = [];
  for (const [x, z] of [
    [21, 21],
    [25, 21],
    [21, 25],
    [25, 25],
  ] as const) {
    for (let y = s; y < s + 3; y += 1) setup.push({ pos: v(x, y, z), state: './elm_log[axis=y]' });
  }
  for (let y = s; y < s + 3; y += 1) {
    for (let x = 22; x <= 24; x += 1) setup.push({ pos: v(x, y, 21), state: './elm_planks' });
    for (let z = 22; z <= 24; z += 1) {
      setup.push({ pos: v(21, y, z), state: './elm_planks' });
      setup.push({ pos: v(25, y, z), state: './elm_planks' });
    }
  }
  for (let x = 21; x <= 25; x += 1) {
    for (let z = 21; z <= 25; z += 1) {
      setup.push({ pos: v(x, s + 3, z), state: './elm_slab[type=bottom]' });
    }
  }
  const plank = (tick: number, x: number, y: number): ClipStep => ({
    tick,
    action: { type: 'place', pos: v(x, y - 1, 25), face: 'up', block: './elm_planks' },
    expect: [{ at: v(x, y, 25), state: './elm_planks' }],
  });
  return {
    id: 'wood-set',
    title: 'A set of wood',
    sentence: 'Logs, planks, stairs, a door and a tree of your own.',
    exampleId: 'example_msm_wood_set',
    make: { type: 'flows', flowIds: ['wood-set'] },
    ground: QUICK_FEW_TREES,
    player: v(23.5, s, 29.5),
    setup,
    steps: [
      // Placed blocks face the player's look (B565 Z6): the door faces north, out of the hut.
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 30 } },
      plank(10, 22, s),
      plank(18, 24, s),
      plank(26, 22, s + 1),
      plank(34, 24, s + 1),
      {
        tick: 42,
        action: { type: 'place', pos: v(22, s + 1, 25), face: 'up', block: './elm_slab' },
        expect: [{ at: v(22, s + 2, 25), state: './elm_slab[type=bottom]' }],
      },
      {
        tick: 50,
        action: { type: 'place', pos: v(24, s + 1, 25), face: 'up', block: './elm_slab' },
        expect: [{ at: v(24, s + 2, 25), state: './elm_slab[type=bottom]' }],
      },
      {
        tick: 60,
        action: { type: 'use', pos: v(23, s - 1, 25), face: 'up', item: './elm_door' },
        expect: [
          { at: v(23, s, 25), state: './elm_door[half=lower,facing=north,open=false]' },
          { at: v(23, s + 1, 25), state: './elm_door[half=upper]' },
        ],
      },
      {
        tick: 100,
        action: { type: 'use', pos: v(23, s, 25), face: 'south' },
        expect: [{ at: v(23, s, 25), state: './elm_door[open=true]' }],
      },
      {
        tick: 150,
        action: { type: 'use', pos: v(23, s, 25), face: 'south' },
        expect: [{ at: v(23, s, 25), state: './elm_door[open=false]' }],
      },
    ],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(23.5, s + 2.5, 33), yaw: 180, pitch: 12 },
        { tick: 120, eye: v(30.5, s + 3.5, 31.5), yaw: 150, pitch: 15 },
        { tick: 200, eye: v(31.5, s + 4, 27.5), yaw: 120, pitch: 18 },
      ],
    },
    captions: [
      { start: 8, end: 58, text: 'Build with your own planks and slabs' },
      { start: 95, end: 175, text: 'Your own door opens and shuts' },
    ],
    stillAt: 120,
    length: 200,
  };
}

/** The showcase cards, in order (B567 adds cards 2 to 10). */
export const SHOWCASES: ShowcaseList = Object.freeze([woodSet()]);

/**
 * The cards whose example is offered on `target`: among `examples` (the session library's) and
 * supported there. A card whose example is missing or unsupported is hidden (ADR 0118 D3, U11).
 */
export function showcasesFor(
  target: TargetFacts,
  examples: readonly ExampleProject[],
  list: ShowcaseList = SHOWCASES,
): ShowcaseClip[] {
  const byId = new Map(examples.map((example) => [example.id, example]));
  return list.filter((clip) => {
    const example = byId.get(clip.exampleId);
    return example !== undefined && (example.supports?.(target) ?? true);
  });
}
