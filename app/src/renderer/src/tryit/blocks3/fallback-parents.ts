/**
 * MSM-authored fallback parents for the growing and climbing plants and the flower pot of
 * vanilla parity 3 in Try it (B519, ADR 0103): the vanilla templates their lowering names as
 * parents (`bamboo1_age0` to `bamboo4_age1`, both bamboo leaves, `cactus`, `glow_lichen`, the big
 * dripleaf with its tilts and stem, the small dripleaf's halves, `flower_pot`), drawn as plain
 * boxes and crossed planes of MSM's own when the user has not pointed MSM at a Minecraft
 * installation. With the client jar the game's own templates are used instead.
 *
 * Written from scratch: no Mojang model is read, copied or derived; the shapes follow the
 * outlines in `@msm/sim`'s `blocks/types3/shapes.ts`, and the texture variable names are the ones
 * the lowered models fill (B511, B512: `#all`, `#texture`, `#side`, `#top`, `#stem`, …). Part of
 * the lazy Try it chunk; never written to an export.
 */
import type { JsonObject } from '@msm/plugin-api';
import { box, cross, model } from '../render/model-boxes';

/** A big dripleaf's leaf tilted by `angle` about its back edge, on its short stem. */
function bigLeaf(angle: number): JsonObject {
  const rotation = angle === 0 ? {} : { rotation: { angle, axis: 'x', origin: [8, 15, 16] } };
  return model(
    [
      box(
        [0, 11, 0],
        [16, 15, 16],
        { up: 'top', down: 'top', north: 'side', south: 'side', west: 'side', east: 'side' },
        rotation,
      ),
      ...cross('stem', 11, 4),
    ],
    'top',
  );
}

/** The parents, by `block/<name>` path (the `minecraft:` names the lowering uses). */
function buildParents(): Record<string, JsonObject> {
  const out: Record<string, JsonObject> = {};
  for (let stalk = 1; stalk <= 4; stalk++) {
    out[`block/bamboo${stalk}_age0`] = model([box([6.5, 0, 6.5], [9.5, 16, 9.5], 'all')], 'all');
    out[`block/bamboo${stalk}_age1`] = model([box([5, 0, 5], [11, 16, 11], 'all')], 'all');
  }
  out['block/bamboo_small_leaves'] = model(cross('texture', 16, 4), 'texture');
  out['block/bamboo_large_leaves'] = model(cross('texture', 16, 0), 'texture');
  out['block/cactus'] = model(
    [
      box([1, 0, 1], [15, 16, 15], {
        up: 'top',
        down: 'bottom',
        north: 'side',
        south: 'side',
        west: 'side',
        east: 'side',
      }),
    ],
    'side',
  );
  out['block/glow_lichen'] = model(
    [box([0, 0, 0.1], [16, 16, 0.1], { north: 'glow_lichen', south: 'glow_lichen' })],
    'glow_lichen',
  );
  out['block/big_dripleaf'] = bigLeaf(0);
  out['block/big_dripleaf_partial_tilt'] = bigLeaf(22.5);
  out['block/big_dripleaf_full_tilt'] = bigLeaf(45);
  out['block/big_dripleaf_stem'] = model(cross('stem', 16, 4), 'stem');
  out['block/small_dripleaf_top'] = model(
    [
      box([2, 12, 2], [14, 13, 14], {
        up: 'top',
        down: 'top',
        north: 'side',
        south: 'side',
        west: 'side',
        east: 'side',
      }),
      ...cross('stem', 12, 5),
    ],
    'top',
  );
  out['block/small_dripleaf_bottom'] = model(cross('stem', 16, 5), 'stem');
  out['block/flower_pot'] = model(
    [
      box([5, 0, 5], [11, 6, 11], {
        down: 'flowerpot',
        north: 'flowerpot',
        south: 'flowerpot',
        west: 'flowerpot',
        east: 'flowerpot',
      }),
      box([6, 0, 6], [10, 5, 10], { up: 'dirt' }),
    ],
    'flowerpot',
  );
  return out;
}

/** The parents of ADR 0103's five types, by `block/<name>`. */
export const BLOCKS3_FALLBACK_PARENTS: Readonly<Record<string, JsonObject>> = Object.freeze(
  buildParents(),
);
