/**
 * Starter geometries for the vehicle templates (ADR 0091 D3): plain boxes drawn for MSM, never
 * copied from a vanilla or mod model. Each is Bedrock geometry 1.12.0 with box UV packed onto
 * the smallest square power-of-two texture that holds it; every size and UV offset is a whole
 * number and no cube is rotated, as the mob presets of the library (B285). The model's front is
 * north (-z), as Bedrock entity models; the format's seat and muzzle offsets count z forwards in
 * blocks (ADR 0090 D2), so a muzzle at the barrel's tip of `n` pixels north has offset z `n/16`.
 *
 * The templates name these bones in `turret`, `parts` and `muzzle`; the tests build a project
 * from a template plus its geometry and expect zero problems. The Vehicle Studio (B419) and the
 * Creator flows (B422) may offer the same shapes.
 *
 * @packageDocumentation
 */
import type { JsonObject } from '@msm/plugin-api';

/** The geometry format version the starters use. */
export const VEHICLE_GEOMETRY_FORMAT_VERSION = '1.12.0';

/** The starter shapes, one per vehicle template. */
export const VEHICLE_SHAPES = [
  'go_kart',
  'car',
  'tank',
  'biplane',
  'helicopter',
  'motorboat',
  'raft',
  'hovercraft',
] as const;

/** A starter shape's name. */
export type VehicleShape = (typeof VEHICLE_SHAPES)[number];

type Vec = [number, number, number];

/** A cube before UV packing: origin and size in pixels. */
interface Box {
  origin: Vec;
  size: Vec;
}

/** A bone before UV packing. */
interface BoneSpec {
  name: string;
  pivot: Vec;
  boxes: Box[];
  parent?: string;
}

const box = (origin: Vec, size: Vec): Box => ({ origin, size });

/** Box UV packing, row by row; returns each box's UV offset and the square texture size. */
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

function geometry(name: string, bounds: { width: number; height: number }, bones: BoneSpec[]) {
  const { uvs, size } = packUv(bones);
  return {
    format_version: VEHICLE_GEOMETRY_FORMAT_VERSION,
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${name}`,
          texture_width: size,
          texture_height: size,
          visible_bounds_width: bounds.width,
          visible_bounds_height: bounds.height,
          visible_bounds_offset: [0, bounds.height / 2, 0],
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
  } satisfies JsonObject;
}

/** Four wheels of `size` (x thickness, diameter) at `x` either side and `front`/`back` z. */
function wheels(
  x: number,
  front: number,
  back: number,
  width: number,
  diameter: number,
): BoneSpec[] {
  const r = diameter / 2;
  const at = (name: string, side: number, z: number): BoneSpec => ({
    name,
    pivot: [side, r, z],
    boxes: [box([side < 0 ? side - width : side, 0, z - r], [width, diameter, diameter])],
  });
  return [
    at('wheel_front_left', x, front),
    at('wheel_front_right', -x, front),
    at('wheel_back_left', x, back),
    at('wheel_back_right', -x, back),
  ];
}

const SHAPES: Readonly<
  Record<VehicleShape, () => { bounds: [number, number]; bones: BoneSpec[] }>
> = {
  go_kart: () => ({
    bounds: [2, 1.5],
    bones: [
      {
        name: 'body',
        pivot: [0, 0, 0],
        boxes: [box([-8, 2, -12], [16, 3, 24]), box([-5, 5, 2], [10, 8, 2])],
      },
      { name: 'steering_wheel', pivot: [0, 9, -5], boxes: [box([-3, 6, -6], [6, 6, 1])] },
      ...wheels(8, -8, 8, 3, 6),
    ],
  }),
  car: () => ({
    bounds: [3, 2],
    bones: [
      {
        name: 'body',
        pivot: [0, 0, 0],
        boxes: [box([-12, 3, -20], [24, 10, 40]), box([-10, 13, -6], [20, 8, 18])],
      },
      ...wheels(12, -13, 13, 4, 8),
    ],
  }),
  tank: () => ({
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
  }),
  biplane: () => ({
    bounds: [6, 3],
    bones: [
      {
        name: 'fuselage',
        pivot: [0, 0, 0],
        boxes: [
          box([-5, 6, -24], [10, 10, 48]),
          box([-40, 22, -16], [80, 2, 14]),
          box([-40, 6, -16], [80, 2, 14]),
          box([-15, 12, 18], [30, 2, 8]),
          box([-1, 14, 18], [2, 10, 8]),
        ],
      },
      { name: 'propeller', pivot: [0, 11, -25], boxes: [box([-1, 1, -26], [2, 20, 1])] },
      ...wheels(6, -14, -14, 2, 6).slice(0, 2),
    ],
  }),
  helicopter: () => ({
    bounds: [6, 3.5],
    bones: [
      {
        name: 'cabin',
        pivot: [0, 0, 0],
        boxes: [
          box([-10, 4, -16], [20, 18, 30]),
          box([-2, 14, 14], [4, 4, 30]),
          box([-11, 0, -14], [2, 2, 26]),
          box([9, 0, -14], [2, 2, 26]),
        ],
      },
      {
        name: 'rotor',
        pivot: [0, 24, 0],
        boxes: [
          box([-1, 22, -1], [2, 3, 2]),
          box([-36, 25, -2], [72, 1, 4]),
          box([-2, 25, -36], [4, 1, 72]),
        ],
      },
      { name: 'tail_rotor', pivot: [3, 16, 42], boxes: [box([2, 9, 41], [1, 14, 2])] },
    ],
  }),
  motorboat: () => ({
    bounds: [3, 1.5],
    bones: [
      {
        name: 'hull',
        pivot: [0, 0, 0],
        boxes: [box([-11, 0, -20], [22, 8, 40]), box([-9, 8, -10], [18, 6, 2])],
      },
      { name: 'propeller', pivot: [0, 1, 21], boxes: [box([-3, -2, 20], [6, 6, 1])] },
    ],
  }),
  raft: () => ({
    bounds: [3, 1.5],
    bones: [
      { name: 'deck', pivot: [0, 0, 0], boxes: [box([-14, 0, -16], [28, 3, 32])] },
      { name: 'crate', pivot: [0, 3, 0], boxes: [box([-5, 3, 6], [10, 10, 10])] },
    ],
  }),
  hovercraft: () => ({
    bounds: [3.5, 2],
    bones: [
      {
        name: 'skirt',
        pivot: [0, 0, 0],
        boxes: [box([-15, 0, -20], [30, 6, 40]), box([-10, 6, -12], [20, 8, 20])],
      },
      { name: 'fan', pivot: [0, 14, 18], boxes: [box([-8, 6, 17], [16, 16, 2])] },
    ],
  }),
};

/**
 * The starter geometry of `shape`, with identifier `geometry.<name>`: the data of an
 * `msm:geo_model` element.
 *
 * @param shape - The starter shape (one per vehicle template).
 * @param name - The geometry's name, usually the vehicle's path with `/` as `.`.
 * @returns Bedrock geometry 1.12.0.
 */
export function vehicleGeometry(shape: VehicleShape, name: string): JsonObject {
  const { bounds, bones } = SHAPES[shape]();
  return geometry(name, { width: bounds[0], height: bounds[1] }, bones);
}
