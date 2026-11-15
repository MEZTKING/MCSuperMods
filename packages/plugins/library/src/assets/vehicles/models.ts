/**
 * The boxed models of the vehicle Creator flows (ADR 0091 D2): a car, a tank, a biplane and a
 * motorboat, drawn for MSM from plain boxes and never copied from a vanilla or mod model. The
 * tank and the motorboat are the examples' shapes (`content/vehicle-models.ts`); the car and
 * the biplane are the entities plugin's starter shapes of the same names, repeated here because
 * the library imports no other plugin (ADR 0020). Bedrock geometry 1.12.0 with box UV packed row
 * by row onto the smallest square power-of-two texture, whole numbers only, no rotated cubes.
 * The model's front is north (-z). The flows name these bones in `turret`, `parts` and `muzzle`.
 *
 * @packageDocumentation
 */
import type { JsonObject } from '@msm/plugin-api';
import { vehicleModelGeometry } from '../../content/vehicle-models';

/** The shape of each flow. */
export const VEHICLE_FLOW_SHAPES = ['car', 'tank', 'plane', 'boat'] as const;

/** A flow's shape. */
export type VehicleFlowShape = (typeof VEHICLE_FLOW_SHAPES)[number];

type Vec = [number, number, number];

interface Box {
  origin: Vec;
  size: Vec;
}

interface BoneSpec {
  name: string;
  pivot: Vec;
  boxes: Box[];
}

const box = (origin: Vec, size: Vec): Box => ({ origin, size });

/** A wheel of `width` and `diameter` on the `side` x (left is +x) at `z`. */
function wheel(name: string, side: number, z: number, width: number, diameter: number): BoneSpec {
  const r = diameter / 2;
  return {
    name,
    pivot: [side, r, z],
    boxes: [box([side < 0 ? side - width : side, 0, z - r], [width, diameter, diameter])],
  };
}

/** The four wheels of the car, front first. */
export const CAR_WHEELS = [
  'wheel_front_left',
  'wheel_front_right',
  'wheel_back_left',
  'wheel_back_right',
] as const;

/** The wheels that steer the car. */
export const CAR_STEERING = ['wheel_front_left', 'wheel_front_right'] as const;

/** The biplane's wheels. */
export const PLANE_WHEELS = ['wheel_front_left', 'wheel_front_right'] as const;

const OWN_SHAPES: Readonly<
  Record<'car' | 'plane', { bounds: [number, number]; bones: BoneSpec[] }>
> = {
  car: {
    bounds: [3, 2],
    bones: [
      { name: 'body', pivot: [0, 0, 0], boxes: [box([-12, 3, -20], [24, 10, 40])] },
      { name: 'cabin', pivot: [0, 13, 0], boxes: [box([-10, 13, -6], [20, 8, 18])] },
      wheel('wheel_front_left', 12, -13, 4, 8),
      wheel('wheel_front_right', -12, -13, 4, 8),
      wheel('wheel_back_left', 12, 13, 4, 8),
      wheel('wheel_back_right', -12, 13, 4, 8),
    ],
  },
  plane: {
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
      wheel('wheel_front_left', 6, -14, 2, 6),
      wheel('wheel_front_right', -6, -14, 2, 6),
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

function ownGeometry(shape: 'car' | 'plane', name: string): JsonObject {
  const { bounds, bones } = OWN_SHAPES[shape];
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

/**
 * The geometry `geometry.<name>` of a flow's shape: the data of an `msm:geo_model` element.
 *
 * @param shape - The flow's shape.
 * @param name - The geometry's name, `entity.<id>` in the flows.
 */
export function vehicleFlowGeometry(shape: VehicleFlowShape, name: string): JsonObject {
  switch (shape) {
    case 'tank':
      return vehicleModelGeometry('tank', name);
    case 'boat':
      return vehicleModelGeometry('motorboat', name);
    default:
      return ownGeometry(shape, name);
  }
}

/** One cube of a geometry on its texture, with the bone it belongs to. */
export interface GeometryCube {
  bone: string;
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
}

/** The texture size and the cubes of a geometry made by {@link vehicleFlowGeometry}. */
export function geometryCubes(geometry: JsonObject): { size: number; cubes: GeometryCube[] } {
  const entry = (geometry['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
  const description = entry.description as JsonObject;
  const cubes: GeometryCube[] = [];
  for (const bone of entry.bones as JsonObject[]) {
    for (const cube of (bone.cubes ?? []) as JsonObject[]) {
      const [u, v] = cube.uv as [number, number];
      const [w, h, d] = cube.size as [number, number, number];
      cubes.push({ bone: bone.name as string, u, v, w, h, d });
    }
  }
  return { size: description.texture_width as number, cubes };
}
