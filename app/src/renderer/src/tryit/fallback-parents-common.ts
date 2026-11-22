/**
 * MSM-authored fallback parents for the common block types in Try it (found by B565): the vanilla
 * templates the blocks-items lowering names as parents for slabs, stairs, walls, fences, gates,
 * doors, trapdoors, buttons, pressure plates, panes, crops, leaves, sideways pillars, orientable
 * blocks, fluid cauldrons and portals, and a few whole vanilla block models that MSM's own
 * templates and examples name (`minecraft:block/glass`, `minecraft:block/lodestone`, …). Without
 * the user's client jar they would draw as the missing texture; with it the game's own models
 * come first in the model chain, so these are only the stand-ins.
 *
 * Written from scratch (ADR 0010, ADR 0092 D12): no Mojang model is read, copied, measured or
 * derived. The shapes follow the outlines in `@msm/sim`'s `blocks/shapes.ts` and the turns of the
 * block states the lowering writes (stairs and doors face east, gates south, the rest north);
 * the texture variable names are the ones the lowered models fill (`#top`, `#side`, `#bottom`,
 * `#texture`, `#wall`, `#edge`, `#pane`, `#crop`, `#all`, `#end`, `#front`, `#content`, …). The
 * whole models are MSM's own fallback cubes (`render/fallback-colours.ts`). Part of the lazy Try
 * it chunk; never written to an export.
 */
import type { JsonObject } from '@msm/plugin-api';
import { fallbackModel } from './render/fallback-colours';
import { box, type FaceName, model } from './render/model-boxes';

/** Faces reading `top` up, `bottom` down and `side` around. */
const topSideBottom = (top: string, side: string, bottom: string) => ({
  up: top,
  down: bottom,
  north: side,
  south: side,
  west: side,
  east: side,
});

/** A full cube with one variable per face, each face culled by its neighbour. */
function cube(faces: Partial<Record<FaceName, string>>): JsonObject {
  const element = box([0, 0, 0], [16, 16, 16], faces);
  const out = element.faces as Record<string, JsonObject>;
  for (const [name, face] of Object.entries(out)) out[name] = { ...face, cullface: name };
  return element;
}

/** A model of `elements` with `textures` set (for the whole models, which name their pictures). */
const withTextures = (elements: JsonObject[], textures: Record<string, string>): JsonObject => ({
  textures,
  elements,
});

/** The half-slab boxes, bottom or top. */
const slabBox = (top: boolean): JsonObject =>
  box([0, top ? 8 : 0, 0], [16, top ? 16 : 8, 16], topSideBottom('top', 'side', 'bottom'));

/** A step of stairs: one upper eighth of the block in pixels `[x1, z1, x2, z2]`. */
const step = (x1: number, z1: number, x2: number, z2: number): JsonObject =>
  box([x1, 8, z1], [x2, 16, z2], topSideBottom('top', 'side', 'bottom'));

/** A fence gate's two posts and its bars, lowered by `drop` pixels in a wall. */
function fenceGate(open: boolean, drop: number): JsonObject {
  const y = (value: number): number => value - drop;
  const posts = [0, 14].map((x) => box([x, y(5), 7], [x + 2, y(16), 9], 'texture'));
  const bars = open
    ? [0, 14].flatMap((x) => [
        box([x, y(6), 9], [x + 2, y(9), 15], 'texture'),
        box([x, y(12), 9], [x + 2, y(15), 15], 'texture'),
      ])
    : [
        box([2, y(6), 7], [14, y(9), 9], 'texture'),
        box([2, y(12), 7], [14, y(15), 9], 'texture'),
        box([6, y(9), 7], [10, y(12), 9], 'texture'),
      ];
  return model([...posts, ...bars], 'texture');
}

/** A cauldron of MSM's own: four walls on short legs, a floor, and a surface at `level`. */
function cauldron(level: number): JsonObject {
  const wall = topSideBottom('top', 'side', 'bottom');
  const walls = [
    box([0, 3, 0], [16, 16, 2], wall),
    box([0, 3, 14], [16, 16, 16], wall),
    box([0, 3, 2], [2, 16, 14], wall),
    box([14, 3, 2], [16, 16, 14], wall),
  ];
  const legs = [
    [0, 0],
    [12, 0],
    [0, 12],
    [12, 12],
  ].map(([x, z]) =>
    box([x as number, 0, z as number], [(x as number) + 4, 3, (z as number) + 4], 'side'),
  );
  const floor = box([2, 3, 2], [14, 4, 14], { up: 'inside', down: 'bottom' });
  const surface = box([2, level, 2], [14, level, 14], { up: 'content' });
  return model([...walls, ...legs, floor, surface], 'particle');
}

/** The template parents, by `block/<name>` path (the `minecraft:` names the lowering uses). */
function buildParents(): Record<string, JsonObject> {
  const out: Record<string, JsonObject> = {};

  // Slabs and stairs: `top`, `side`, `bottom`. Stairs face east (their block state's turns).
  out['block/slab'] = model([slabBox(false)], 'side');
  out['block/slab_top'] = model([slabBox(true)], 'side');
  out['block/stairs'] = model([slabBox(false), step(8, 0, 16, 16)], 'side');
  out['block/inner_stairs'] = model(
    [slabBox(false), step(8, 0, 16, 16), step(0, 8, 8, 16)],
    'side',
  );
  out['block/outer_stairs'] = model([slabBox(false), step(8, 8, 16, 16)], 'side');

  // Doors: a 3-pixel panel on the west side, facing east; the block state turns the open ones.
  for (const part of ['bottom', 'top'] as const) {
    for (const hinge of ['left', 'right']) {
      for (const open of ['', '_open']) {
        out[`block/door_${part}_${hinge}${open}`] = model(
          [box([0, 0, 0], [3, 16, 16], part)],
          part,
        );
      }
    }
  }

  // Fences: a 4 by 4 post and two bars towards the north (the block state turns the side).
  out['block/fence_post'] = model([box([6, 0, 6], [10, 16, 10], 'texture')], 'texture');
  out['block/fence_side'] = model(
    [box([7, 12, 0], [9, 15, 6], 'texture'), box([7, 6, 0], [9, 9, 6], 'texture')],
    'texture',
  );
  out['block/fence_inventory'] = model(
    [
      box([6, 0, 0], [10, 16, 4], 'texture'),
      box([6, 0, 12], [10, 16, 16], 'texture'),
      box([7, 12, 4], [9, 15, 12], 'texture'),
      box([7, 6, 4], [9, 9, 12], 'texture'),
    ],
    'texture',
  );

  // Fence gates face south; in a wall they sit three pixels lower.
  out['block/template_fence_gate'] = fenceGate(false, 0);
  out['block/template_fence_gate_open'] = fenceGate(true, 0);
  out['block/template_fence_gate_wall'] = fenceGate(false, 3);
  out['block/template_fence_gate_wall_open'] = fenceGate(true, 3);

  // Trapdoors: 3 pixels thick in their half, or open against the south side (facing north).
  for (const prefix of ['template_orientable_trapdoor', 'template_trapdoor']) {
    out[`block/${prefix}_bottom`] = model([box([0, 0, 0], [16, 3, 16], 'texture')], 'texture');
    out[`block/${prefix}_top`] = model([box([0, 13, 0], [16, 16, 16], 'texture')], 'texture');
    out[`block/${prefix}_open`] = model([box([0, 0, 13], [16, 16, 16], 'texture')], 'texture');
  }

  // Buttons: 6 by 4, 2 deep (1 pressed), on the floor facing north; plates 14 by 14.
  out['block/button'] = model([box([5, 0, 6], [11, 2, 10], 'texture')], 'texture');
  out['block/button_pressed'] = model([box([5, 0, 6], [11, 1, 10], 'texture')], 'texture');
  out['block/button_inventory'] = model([box([5, 6, 6], [11, 10, 10], 'texture')], 'texture');
  out['block/pressure_plate_up'] = model([box([1, 0, 1], [15, 1, 15], 'texture')], 'texture');
  out['block/pressure_plate_down'] = model([box([1, 0, 1], [15, 0.5, 15], 'texture')], 'texture');

  // Walls: an 8-pixel post and 6-pixel sides towards the north, low or tall.
  out['block/template_wall_post'] = model([box([4, 0, 4], [12, 16, 12], 'wall')], 'wall');
  out['block/template_wall_side'] = model([box([5, 0, 0], [11, 14, 8], 'wall')], 'wall');
  out['block/template_wall_side_tall'] = model([box([5, 0, 0], [11, 16, 8], 'wall')], 'wall');
  out['block/wall_inventory'] = model(
    [box([4, 0, 4], [12, 16, 12], 'wall'), box([5, 0, 0], [11, 13, 16], 'wall')],
    'wall',
  );

  // Panes: a 2-pixel post (its ends only), arms to the north and the south, and the patches a
  // post shows on a side with no arm (`noside` north, `noside_alt` east).
  const arm = (z1: number, z2: number, end: 'north' | 'south'): JsonObject =>
    box([7, 0, z1], [9, 16, z2], {
      up: 'edge',
      down: 'edge',
      west: 'pane',
      east: 'pane',
      [end]: 'edge',
    });
  out['block/template_glass_pane_post'] = model(
    [box([7, 0, 7], [9, 16, 9], { up: 'edge', down: 'edge' })],
    'pane',
  );
  out['block/template_glass_pane_side'] = model([arm(0, 7, 'north')], 'pane');
  out['block/template_glass_pane_side_alt'] = model([arm(9, 16, 'south')], 'pane');
  out['block/template_glass_pane_noside'] = model(
    [box([7, 0, 7], [9, 16, 7], { north: 'pane' })],
    'pane',
  );
  out['block/template_glass_pane_noside_alt'] = model(
    [box([9, 0, 7], [9, 16, 9], { east: 'pane' })],
    'pane',
  );

  // Crops: four planes inset 4 pixels, both sides each.
  out['block/crop'] = model(
    [
      ...[4, 12].map((z) => box([0, 0, z], [16, 16, z], { north: 'crop', south: 'crop' })),
      ...[4, 12].map((x) => box([x, 0, 0], [x, 16, 16], { west: 'crop', east: 'crop' })),
    ],
    'crop',
  );

  // Full cubes with their own variables.
  out['block/leaves'] = model([cube(topSideBottom('all', 'all', 'all'))], 'all');
  out['block/cube_column_horizontal'] = model([cube(topSideBottom('end', 'side', 'end'))], 'side');
  out['block/orientable'] = model(
    [cube({ ...topSideBottom('top', 'side', 'top'), north: 'front' })],
    'side',
  );
  out['block/orientable_with_bottom'] = model(
    [cube({ ...topSideBottom('top', 'side', 'bottom'), north: 'front' })],
    'side',
  );
  out['block/orientable_vertical'] = model([cube(topSideBottom('front', 'side', 'side'))], 'side');

  // Fluid cauldrons (ADR 0108): the surface at a third, two thirds and full.
  out['block/template_cauldron_level1'] = cauldron(9);
  out['block/template_cauldron_level2'] = cauldron(12);
  out['block/template_cauldron_full'] = cauldron(15);

  // Portals (also drawn by Try it's portal pass): a 4-pixel sheet across the axis.
  out['block/nether_portal_ns'] = model(
    [box([0, 0, 6], [16, 16, 10], { north: 'portal', south: 'portal' })],
    'portal',
  );
  out['block/nether_portal_ew'] = model(
    [box([6, 0, 0], [10, 16, 16], { west: 'portal', east: 'portal' })],
    'portal',
  );

  // The root of vanilla's block models (only display settings): an empty model.
  out['block/block'] = {};
  return out;
}

/**
 * The whole vanilla block models MSM's own templates, examples and fixtures name as a block's
 * `model`, by block path. Each is MSM's fallback cube of that block (a plant's small upright box);
 * `smooth_stone_slab` is the bottom half of smooth stone's.
 */
const WHOLE_MODELS: readonly string[] = [
  'amethyst_block',
  'barrel',
  'calcite',
  'cobweb',
  'copper_block',
  'crying_obsidian',
  'dispenser',
  'emerald_ore',
  'glass',
  'glowstone',
  'lodestone',
  'note_block',
  'observer',
  'obsidian',
  'poppy',
  'purpur_block',
  'red_mushroom_block',
  'red_stained_glass',
  'redstone_lamp',
  'redstone_ore',
  'sea_lantern',
  'slime_block',
  'smooth_stone_slab',
  'stone',
  'stripped_dark_oak_log',
];

function buildWholeModels(): Record<string, JsonObject> {
  const out: Record<string, JsonObject> = {};
  for (const path of WHOLE_MODELS) {
    if (path.endsWith('_slab')) {
      const full = fallbackModel(`minecraft:${path.slice(0, -'_slab'.length)}`);
      out[`block/${path}`] = withTextures(
        [slabBox(false)],
        full.textures as Record<string, string>,
      );
    } else {
      out[`block/${path}`] = fallbackModel(`minecraft:${path}`);
    }
  }
  return out;
}

/** The template parents of the common block types and the whole models, by `block/<name>`. */
export const COMMON_FALLBACK_PARENTS: Readonly<Record<string, JsonObject>> = Object.freeze({
  ...buildParents(),
  ...buildWholeModels(),
});

/** The whole vanilla block models covered, by `block/<name>`. */
export const COMMON_WHOLE_MODELS: readonly string[] = Object.freeze(
  WHOLE_MODELS.map((path) => `block/${path}`),
);
