/**
 * MSM-authored fallback parents for the twenty block types of vanilla parity 2 in Try it (B463,
 * ADR 0010): the vanilla templates the lowering names as parents (`template_torch`,
 * `template_sign_rot_0`, `template_bed_head`, `cake_slice3`, …), drawn as plain boxes of MSM's
 * own when the user has not pointed MSM at a Minecraft installation, so a bed, a sign or a
 * lantern still shows its rough shape with the project's own pictures. With the client jar the
 * game's own templates are used instead (they come first in the model chain).
 *
 * Written from scratch: no Mojang model is read, copied or derived; the shapes follow the
 * blocks' visible outlines in `@msm/sim`'s `blocks/types2/shapes.ts`. The texture variable names
 * are the ones the lowered models fill (`#torch`, `#lantern`, `#all`, …). Part of the lazy Try
 * it chunk; never written to an export.
 */
import type { JsonObject } from '@msm/plugin-api';
import { FALLBACK_MODELS } from '../../preview/fallback-models';
import { BLOCKS3_FALLBACK_PARENTS } from '../blocks3/fallback-parents';
import { box, cross, model, type Vec } from '../render/model-boxes';

/** A sign board on its post, turned by `angle` (the four in-between turns of a standing sign). */
function standingSign(angle: number): JsonObject {
  const rotation = angle === 0 ? {} : { rotation: { angle, axis: 'y', origin: [8, 8, 8] } };
  return model(
    [box([0, 7, 7], [16, 15, 9], 'all', rotation), box([7, 0, 7], [9, 7, 9], 'all', rotation)],
    'all',
  );
}

/** A hanging sign's board under its chains (or its bar, when attached), turned by `angle`. */
function hangingSign(angle: number, attached: boolean): JsonObject {
  const rotation = angle === 0 ? {} : { rotation: { angle, axis: 'y', origin: [8, 8, 8] } };
  return model(
    [
      box([1, 0, 7], [15, 10, 9], 'all', rotation),
      ...(attached
        ? [box([7, 10, 7], [9, 16, 9], 'all', rotation)]
        : [
            box([2, 10, 8], [3, 16, 8.01], 'all', rotation),
            box([13, 10, 8], [14, 16, 8.01], 'all', rotation),
          ]),
    ],
    'all',
  );
}

/** Candles in a group of `count`. */
function candles(count: number): JsonObject {
  const spots: Vec[] = [
    [7, 0, 7],
    [9, 0, 6],
    [5, 0, 8],
    [8, 0, 9],
  ];
  return model(
    spots.slice(0, count).map(([x, , z]) => box([x, 0, z], [x + 2, 6, z + 2], 'all')),
    'all',
  );
}

/** Sea pickles in a group of `count`. */
function pickles(count: number): JsonObject {
  const spots: Vec[] = [
    [6, 0, 6],
    [3, 0, 3],
    [10, 0, 9],
    [9, 0, 3],
  ];
  return model(
    spots.slice(0, count).map(([x, , z]) => box([x, 0, z], [x + 4, 6, z + 4], 'all')),
    'all',
  );
}

const cakeFaces = (bites: number): JsonObject =>
  box([1 + 2 * bites, 0, 1], [15, 8, 15], {
    down: 'bottom',
    up: 'top',
    north: 'side',
    south: 'side',
    east: 'side',
    west: bites === 0 ? 'side' : 'inside',
  });

/** The parents, by `block/<name>` path (the `minecraft:` names the lowering uses). */
function buildParents(): Record<string, JsonObject> {
  const out: Record<string, JsonObject> = {};
  out['block/cake'] = model([cakeFaces(0)], 'side');
  for (let bites = 1; bites <= 6; bites++)
    out[`block/cake_slice${bites}`] = model([cakeFaces(bites)], 'side');
  out['block/carpet'] = model([box([0, 0, 0], [16, 1, 16], 'wool')], 'wool');
  for (let age = 0; age <= 2; age++) {
    const half = 2 + age;
    const height = 5 + 2 * age;
    out[`block/cocoa_stage${age}`] = model(
      [box([8 - half, 12 - height, 1], [8 + half, 12, 1 + 2 * half], 'cocoa')],
      'cocoa',
    );
  }
  const counts = ['', 'two_', 'three_', 'four_'];
  counts.forEach((prefix, index) => {
    out[`block/${prefix}sea_pickles`.replace('block/sea_pickles', 'block/sea_pickle')] = pickles(
      index + 1,
    );
    out[
      `block/${prefix}dead_sea_pickles`.replace('block/dead_sea_pickles', 'block/dead_sea_pickle')
    ] = pickles(index + 1);
  });
  out['block/end_rod'] = model(
    [box([7, 0, 7], [9, 16, 9], 'end_rod'), box([6, 0, 6], [10, 1, 10], 'end_rod')],
    'end_rod',
  );
  out['block/flower_pot_cross'] = model(
    [box([5, 0, 5], [11, 6, 11], 'plant'), ...cross('plant', 12, 4)],
    'plant',
  );
  out['block/ladder'] = model(
    [box([0, 0, 15.2], [16, 16, 15.2], { north: 'texture', south: 'texture' })],
    'texture',
  );
  for (const kind of ['stable', 'unstable']) {
    out[`block/scaffolding_${kind}`] = model(
      [
        box([0, 14, 0], [16, 16, 16], {
          up: 'top',
          down: 'bottom',
          north: 'side',
          south: 'side',
          east: 'side',
          west: 'side',
        }),
        ...[
          [0, 0],
          [14, 0],
          [0, 14],
          [14, 14],
        ].map(([x, z]) =>
          box([x as number, 0, z as number], [(x as number) + 2, 14, (z as number) + 2], 'side'),
        ),
      ],
      'side',
    );
  }
  for (let height = 2; height <= 14; height += 2) {
    out[`block/snow_height${height}`] = model(
      [box([0, 0, 0], [16, height, 16], 'texture')],
      'texture',
    );
  }
  for (let age = 0; age <= 7; age++) {
    out[`block/stem_growth${age}`] = model(cross('stem', 2 + 2 * age, 0), 'stem');
  }
  out['block/stem_fruit'] = model(
    [box([0, 0, 8], [9, 10, 8], { north: 'upperstem', south: 'upperstem' })],
    'stem',
  );
  for (let rot = 0; rot <= 3; rot++) {
    const angle = [0, -22.5, -45, 22.5][rot] as number;
    out[`block/template_sign_rot_${rot}`] = standingSign(angle);
    out[`block/template_hanging_sign_rot_${rot}`] = hangingSign(angle, false);
    out[`block/template_attached_hanging_sign_rot_${rot}`] = hangingSign(angle, true);
  }
  out['block/template_wall_sign'] = model([box([0, 4.5, 14], [16, 12.5, 16], 'all')], 'all');
  out['block/template_wall_hanging_sign'] = model(
    [box([0, 0, 7], [16, 10, 9], 'all'), box([0, 14, 6], [16, 16, 10], 'all')],
    'all',
  );
  out['block/template_bed_foot'] = model(
    [
      box([0, 3, 0], [16, 9, 16], {
        up: 'up',
        south: 'south',
        east: 'east',
        west: 'west',
        down: 'up',
      }),
      box([0, 0, 13], [3, 3, 16], 'up'),
      box([13, 0, 13], [16, 3, 16], 'up'),
    ],
    'up',
  );
  out['block/template_bed_head'] = model(
    [
      box([0, 3, 0], [16, 9, 16], {
        up: 'up',
        north: 'north',
        east: 'east',
        west: 'west',
        down: 'up',
      }),
      box([0, 0, 0], [3, 3, 3], 'up'),
      box([13, 0, 0], [16, 3, 3], 'up'),
    ],
    'up',
  );
  out['block/template_candle'] = candles(1);
  out['block/template_two_candles'] = candles(2);
  out['block/template_three_candles'] = candles(3);
  out['block/template_four_candles'] = candles(4);
  out['block/template_chain'] = model(
    [
      box([6.5, 0, 8], [9.5, 16, 8], { north: 'texture', south: 'texture' }),
      box([8, 0, 6.5], [8, 16, 9.5], { east: 'texture', west: 'texture' }),
    ],
    'texture',
  );
  out['block/template_lantern'] = model(
    [box([5, 0, 5], [11, 7, 11], 'lantern'), box([6, 7, 6], [10, 9, 10], 'lantern')],
    'lantern',
  );
  out['block/template_hanging_lantern'] = model(
    [
      box([5, 1, 5], [11, 8, 11], 'lantern'),
      box([6, 8, 6], [10, 10, 10], 'lantern'),
      box([7.5, 10, 7.5], [8.5, 16, 8.5], 'lantern'),
    ],
    'lantern',
  );
  out['block/template_torch'] = model([box([7, 0, 7], [9, 10, 9], 'torch')], 'torch');
  out['block/template_torch_wall'] = model(
    [
      box([-1, 3.5, 7], [1, 13.5, 9], 'torch', {
        rotation: { angle: -22.5, axis: 'z', origin: [0, 3.5, 8] },
      }),
    ],
    'torch',
  );
  out['block/vine'] = model(
    [box([0, 0, 0.8], [16, 16, 0.8], { north: 'vine', south: 'vine' })],
    'vine',
  );
  return out;
}

/** The parents of the twenty types, by `block/<name>`. */
export const BLOCKS2_FALLBACK_PARENTS: Readonly<Record<string, JsonObject>> = Object.freeze(
  buildParents(),
);

/** MSM's fallback parents for Try it: the preview's own, the twenty types' and ADR 0103's five. */
export const TRYIT_FALLBACK_MODELS: Readonly<Record<string, JsonObject>> = Object.freeze({
  ...FALLBACK_MODELS,
  ...BLOCKS2_FALLBACK_PARENTS,
  ...BLOCKS3_FALLBACK_PARENTS,
});
