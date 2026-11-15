/**
 * Small boxed geometries for the vehicle examples (ADR 0091 D3): a tank, a motorboat and a
 * raft, drawn for MSM from plain boxes and never copied from a vanilla or mod model. Bedrock
 * geometry 1.12.0 with box UV packed row by row onto the smallest square power-of-two texture,
 * whole numbers only, no rotated cubes. The model's front is north (-z). The bone names are
 * those the examples name in `turret`, `parts` and `muzzle`.
 */
import type { JsonObject } from '@msm/plugin-api';

type Vec = [number, number, number];

interface Box {
  origin: Vec;
  size: Vec;
}

interface BoneSpec {
  name: string;
  pivot: Vec;
  boxes: Box[];
  parent?: string;
}

const box = (origin: Vec, size: Vec): Box => ({ origin, size });

/** The shapes of the examples. */
export type VehicleModel = 'tank' | 'motorboat' | 'raft';

const MODELS: Readonly<Record<VehicleModel, { bounds: [number, number]; bones: BoneSpec[] }>> = {
  tank: {
    bounds: [5, 3],
    bones: [
      { name: 'hull', pivot: [0, 0, 0], boxes: [box([-20, 4, -28], [40, 12, 56])] },
      { name: 'track_left', pivot: [24, 5, 0], boxes: [box([20, 0, -30], [8, 10, 60])] },
      { name: 'track_right', pivot: [-24, 5, 0], boxes: [box([-28, 0, -30], [8, 10, 60])] },
      { name: 'turret', pivot: [0, 16, 0], boxes: [box([-12, 16, -12], [24, 10, 24])] },
      {
        name: 'barrel',
        parent: 'turret',
        pivot: [0, 21, -12],
        boxes: [box([-2, 19, -40], [4, 4, 28])],
      },
    ],
  },
  motorboat: {
    bounds: [3, 1.5],
    bones: [
      {
        name: 'hull',
        pivot: [0, 0, 0],
        boxes: [box([-11, 0, -20], [22, 8, 40]), box([-9, 8, -10], [18, 6, 2])],
      },
      { name: 'propeller', pivot: [0, 1, 21], boxes: [box([-3, -2, 20], [6, 6, 1])] },
    ],
  },
  raft: {
    bounds: [3, 1.5],
    bones: [
      { name: 'deck', pivot: [0, 0, 0], boxes: [box([-14, 0, -16], [28, 3, 32])] },
      { name: 'crate', pivot: [0, 3, 0], boxes: [box([-5, 3, 6], [10, 10, 10])] },
    ],
  },
};

/** Box UV packing, row by row: each box's UV offset and the square texture size. */
function packUv(bones: readonly BoneSpec[]): { uvs: [number, number][][]; size: number } {
  const footprints = bones.map((bone) =>
    bone.boxes.map(({ size: [w, h, d] }) => [2 * (w + d), d + h] as const),
  );
  const widest = Math.max(...footprints.flat().map(([w]) => w));
  let size = 64;
  while (size < widest) size *= 2;
  for (;;) {
    let x = 0;
    let y = 0;
    let row = 0;
    const uvs: [number, number][][] = [];
    for (const boneFootprints of footprints) {
      const placed: [number, number][] = [];
      for (const [w, h] of boneFootprints) {
        if (x + w > size) {
          x = 0;
          y += row;
          row = 0;
        }
        placed.push([x, y]);
        x += w;
        row = Math.max(row, h);
      }
      uvs.push(placed);
    }
    if (y + row <= size) return { uvs, size };
    size *= 2;
  }
}

/** The texture size (square) a model's geometry declares. */
export function vehicleModelTextureSize(model: VehicleModel): number {
  return packUv(MODELS[model].bones).size;
}

/** The geometry `geometry.<name>` of a model: the data of an `msm:geo_model` element. */
export function vehicleModelGeometry(model: VehicleModel, name: string): JsonObject {
  const { bounds, bones } = MODELS[model];
  const { uvs, size } = packUv(bones);
  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${name}`,
          texture_width: size,
          texture_height: size,
          visible_bounds_width: bounds[0],
          visible_bounds_height: bounds[1],
          visible_bounds_offset: [0, bounds[1] / 2, 0],
        },
        bones: bones.map((bone, boneIndex) => ({
          name: bone.name,
          ...(bone.parent === undefined ? {} : { parent: bone.parent }),
          pivot: bone.pivot,
          cubes: bone.boxes.map((entry, index) => ({
            origin: entry.origin,
            size: entry.size,
            uv: (uvs[boneIndex] as [number, number][])[index] as [number, number],
          })),
        })),
      },
    ],
  };
}
