/**
 * Bakes a Bedrock geometry (format 1.12.0, the `msm:geo_model` element data, ADR 0029 D2) into
 * flat vertex arrays, one range per bone, for the geo preview renderer. Pure: no DOM, no WebGL,
 * so it is unit-tested in happy-dom.
 *
 * Conventions follow Blockbench's own Bedrock renderer, read in Blockbench 4.12.4
 * (`js/io/formats/bedrock.js`, `js/preview/canvas.js`, `js/outliner/cube.js`,
 * `js/animations/timeline_animators.js` on raw GitHub, tag `v4.12.4`, 2026-11-05):
 *
 * - Blockbench works in its own scene space, which is Bedrock space with x mirrored. On import
 *   a cube's `from` is `[-(origin.x + size.x), origin.y, origin.z]` and `to = from + size`;
 *   every pivot has its x negated; every rest rotation (bone and cube) has x and y negated
 *   (`rotation[axis] *= -1` for `axis != 2`). The renderer draws this scene space as it is.
 * - Rotations are Euler angles in degrees with three.js order `'ZYX'`
 *   (`bone.rotation.order = 'ZYX'`, `mesh.rotation.order = 'ZYX'`): the matrix is
 *   `Rz * Ry * Rx`, so x is applied first.
 * - A bone (or a rotated cube) sits at its pivot relative to its parent's pivot
 *   (`bone.position = origin - parent.origin`); its vertices are stored relative to its own
 *   pivot (`from - origin`, `to - origin`). A root bone sits at its pivot.
 * - Inflate grows the cube about its centre by `inflate` on every side
 *   (`adjustFromAndToForInflateAndStretch`); the UV does not change.
 * - Box UV (`updateUV`): face sizes are the floored cube size; the six face rectangles are
 *   east `[0, z]` size `[z, y]`, west `[z + x, z]` `[z, y]`, up `[z + x, z]` `[-x, -z]`, down
 *   `[z + 2x, 0]` `[-x, z]`, south `[2z + x, z]` `[x, y]`, north `[z, z]` `[x, y]`, plus the
 *   cube's `uv` offset; `mirror` flips every rectangle horizontally and swaps east and west.
 *   A 1/64 pixel inset fights texture bleeding.
 * - Per-face UV: `[u, v, u + uv_size.w, v + uv_size.h]`, with the corners swapped for `up` and
 *   `down`; a face without an entry is not drawn; `uv_rotation` turns the corners in 90 degree
 *   steps.
 * - Face corners are three.js `BoxGeometry` order (top-left, top-right, bottom-left,
 *   bottom-right as seen from outside) with face order east, west, up, down, south, north.
 * - Animations (`displayRotation`, `displayPosition`, `displayScale`): keyframe values are in
 *   Bedrock orientation; rotation is added to the Euler angles with x and y negated, position
 *   is added to the bone's offset with x negated, scale multiplies about the pivot. GeckoLib
 *   reads the same Bedrock files, so the preview follows the Bedrock/GeckoLib signs.
 */

import type { JsonObject } from '@msm/plugin-api';
import { vec3 as glVec3, mat4 } from 'gl-matrix';
import { firstGeometry, isObject } from './json';

export { boneNames, firstGeometry } from './json';

/** A vector of three numbers. */
export type Vec3 = [number, number, number];

/** The six cube faces, in the order Blockbench builds them. */
export const FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north'] as const;
export type FaceName = (typeof FACE_ORDER)[number];

/** Vertices per drawn face: two triangles, not indexed. */
export const VERTICES_PER_FACE = 6;

/** A face rectangle in texture pixels: corner 1 is top-left, corner 2 bottom-right. */
export interface UvRect {
  u1: number;
  v1: number;
  u2: number;
  v2: number;
}

/** One bone of a baked model. */
export interface BakedBone {
  name: string;
  /** Index of the parent bone in {@link BakedModel.bones}, or -1 for a root bone. */
  parent: number;
  /** Pivot in Blockbench scene space (x mirrored). */
  pivot: Vec3;
  /** Rest rotation in Bedrock degrees, as written in the file. */
  rotation: Vec3;
  /** First vertex of the bone's range in the baked arrays. */
  first: number;
  /** Number of vertices of the bone's range. */
  count: number;
}

/** A model ready for upload: positions relative to each bone's pivot, and UVs (0 to 1). */
export interface BakedModel {
  bones: BakedBone[];
  /** Bones in an order where every parent precedes its children. */
  order: number[];
  /** `x, y, z` per vertex, in model units (16 per block), relative to the bone's pivot. */
  positions: Float32Array;
  /** `u, v` per vertex, divided by the texture size of the description. */
  uvs: Float32Array;
  textureWidth: number;
  textureHeight: number;
  /** Number of cubes baked. */
  cubeCount: number;
  /** Things the preview could not draw as written. */
  problems: string[];
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function vec3(value: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (!Array.isArray(value)) return [...fallback];
  return [num(value[0], fallback[0]), num(value[1], fallback[1]), num(value[2], fallback[2])];
}

/** Bedrock pivot to Blockbench scene space (x negated). */
export const scenePoint = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

/** Bedrock rotation (degrees) to the Blockbench scene rotation (x and y negated). */
export const sceneRotation = (r: Vec3): Vec3 => [-r[0], -r[1], r[2]];

const DEG = Math.PI / 180;

/** `Rz * Ry * Rx` (three.js Euler order `'ZYX'`) for degrees in scene space, into `out`. */
export function rotateZYX(out: mat4, degrees: Vec3): mat4 {
  mat4.rotateZ(out, out, degrees[2] * DEG);
  mat4.rotateY(out, out, degrees[1] * DEG);
  mat4.rotateX(out, out, degrees[0] * DEG);
  return out;
}

/**
 * The box UV rectangles of a cube of `size` (Bedrock units, floored as Blockbench does) at
 * offset `[u, v]`, without the anti-bleeding inset.
 */
export function boxUvRects(
  size: Vec3,
  offset: [number, number],
  mirror: boolean,
): Record<FaceName, UvRect> {
  const epsilon = 0.0000001;
  const [x, y, z] = size.map((s) => Math.floor(s + epsilon)) as Vec3;
  const list: { face: FaceName; from: [number, number]; size: [number, number] }[] = [
    { face: 'east', from: [0, z], size: [z, y] },
    { face: 'west', from: [z + x, z], size: [z, y] },
    { face: 'up', from: [z + x, z], size: [-x, -z] },
    { face: 'down', from: [z + x * 2, 0], size: [-x, z] },
    { face: 'south', from: [z * 2 + x, z], size: [x, y] },
    { face: 'north', from: [z, z], size: [x, y] },
  ];
  if (mirror) {
    for (const entry of list) {
      entry.from[0] += entry.size[0];
      entry.size[0] *= -1;
    }
    const east = list[0] as (typeof list)[number];
    const west = list[1] as (typeof list)[number];
    [east.from, west.from] = [west.from, east.from];
    [east.size, west.size] = [west.size, east.size];
  }
  const out = {} as Record<FaceName, UvRect>;
  for (const entry of list) {
    out[entry.face] = {
      u1: entry.from[0] + offset[0],
      v1: entry.from[1] + offset[1],
      u2: entry.from[0] + entry.size[0] + offset[0],
      v2: entry.from[1] + entry.size[1] + offset[1],
    };
  }
  return out;
}

/** Default per-face UV size: the face's own dimensions, as Blockbench's auto UV. */
function faceSize(face: FaceName, size: Vec3): [number, number] {
  if (face === 'east' || face === 'west') return [size[2], size[1]];
  if (face === 'up' || face === 'down') return [size[0], size[2]];
  return [size[0], size[1]];
}

/** The per-face UV rectangle of one face entry, or `null` when the face is not drawn. */
export function faceUvRect(
  face: FaceName,
  entry: unknown,
  size: Vec3,
): { rect: UvRect; rotation: number } | null {
  if (!isObject(entry) || !Array.isArray(entry.uv)) return null;
  const u = num(entry.uv[0]);
  const v = num(entry.uv[1]);
  const fallback = faceSize(face, size);
  const uvSize = Array.isArray(entry.uv_size)
    ? [num(entry.uv_size[0], fallback[0]), num(entry.uv_size[1], fallback[1])]
    : fallback;
  let rect: UvRect = { u1: u, v1: v, u2: u + (uvSize[0] ?? 0), v2: v + (uvSize[1] ?? 0) };
  if (face === 'up' || face === 'down') {
    rect = { u1: rect.u2, v1: rect.v2, u2: rect.u1, v2: rect.v1 };
  }
  return { rect, rotation: num(entry.uv_rotation) };
}

/** Corner positions (top-left, top-right, bottom-left, bottom-right) of a face of a box. */
function faceCorners(face: FaceName, from: Vec3, to: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  switch (face) {
    case 'east':
      return [
        [x1, y1, z1],
        [x1, y1, z0],
        [x1, y0, z1],
        [x1, y0, z0],
      ];
    case 'west':
      return [
        [x0, y1, z0],
        [x0, y1, z1],
        [x0, y0, z0],
        [x0, y0, z1],
      ];
    case 'up':
      return [
        [x0, y1, z0],
        [x1, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
      ];
    case 'down':
      return [
        [x0, y0, z1],
        [x1, y0, z1],
        [x0, y0, z0],
        [x1, y0, z0],
      ];
    case 'south':
      return [
        [x0, y1, z1],
        [x1, y1, z1],
        [x0, y0, z1],
        [x1, y0, z1],
      ];
    case 'north':
      return [
        [x1, y1, z0],
        [x0, y1, z0],
        [x1, y0, z0],
        [x0, y0, z0],
      ];
  }
}

/** Triangle corner indices per face (three.js `BoxGeometry`: a, b, d and b, c, d). */
const TRIANGLES = [0, 2, 1, 2, 3, 1] as const;

/** Bakes the first geometry of `data` (an `msm:geo_model` element's data). Never throws. */
export function bakeGeometry(data: unknown): BakedModel {
  const problems: string[] = [];
  const geometry = firstGeometry(data);
  const description = isObject(geometry?.description) ? geometry.description : {};
  const textureWidth = Math.max(1, num(description.texture_width, 64));
  const textureHeight = Math.max(1, num(description.texture_height, 64));
  if (geometry === null) problems.push('The model has no geometry.');
  const rawBones = Array.isArray(geometry?.bones) ? geometry.bones.filter(isObject) : [];

  // Bones by name; later duplicates are skipped.
  const bones: BakedBone[] = [];
  const sources: JsonObject[] = [];
  const index = new Map<string, number>();
  for (const raw of rawBones) {
    const name = typeof raw.name === 'string' ? raw.name : '';
    if (index.has(name)) {
      problems.push(`Duplicate bone "${name}" skipped.`);
      continue;
    }
    index.set(name, bones.length);
    sources.push(raw);
    bones.push({
      name,
      parent: -1,
      pivot: scenePoint(vec3(raw.pivot)),
      rotation: vec3(raw.rotation),
      first: 0,
      count: 0,
    });
  }
  sources.forEach((raw, i) => {
    if (typeof raw.parent !== 'string') return;
    const parent = index.get(raw.parent);
    if (parent === undefined || parent === i) {
      problems.push(`Bone "${bones[i]?.name}" has an unknown parent "${raw.parent}".`);
      return;
    }
    (bones[i] as BakedBone).parent = parent;
  });
  // Break parent cycles: a bone whose ancestors loop back to it becomes a root.
  bones.forEach((bone, i) => {
    const seen = new Set<number>([i]);
    let current = bone.parent;
    while (current !== -1) {
      if (seen.has(current)) {
        problems.push(`Bone "${bone.name}" is part of a parent cycle; drawn as a root bone.`);
        bone.parent = -1;
        break;
      }
      seen.add(current);
      current = (bones[current] as BakedBone).parent;
    }
  });
  const order: number[] = [];
  const placed = new Set<number>();
  const place = (i: number): void => {
    if (placed.has(i)) return;
    const parent = (bones[i] as BakedBone).parent;
    if (parent !== -1) place(parent);
    placed.add(i);
    order.push(i);
  };
  for (let i = 0; i < bones.length; i++) place(i);

  const positions: number[] = [];
  const uvs: number[] = [];
  let cubeCount = 0;
  bones.forEach((bone, i) => {
    const raw = sources[i] as JsonObject;
    bone.first = positions.length / 3;
    const boneMirror = raw.mirror === true;
    const boneInflate = num(raw.inflate);
    const cubes = Array.isArray(raw.cubes) ? raw.cubes.filter(isObject) : [];
    for (const cube of cubes) {
      cubeCount += 1;
      const origin = vec3(cube.origin);
      const size = vec3(cube.size);
      const inflate = typeof cube.inflate === 'number' ? num(cube.inflate) : boneInflate;
      const mirror = typeof cube.mirror === 'boolean' ? cube.mirror : boneMirror;
      const from: Vec3 = [
        -(origin[0] + size[0]) - inflate,
        origin[1] - inflate,
        origin[2] - inflate,
      ];
      const to: Vec3 = [
        -(origin[0] + size[0]) + size[0] + inflate,
        origin[1] + size[1] + inflate,
        origin[2] + size[2] + inflate,
      ];
      // Cube transform into the bone's frame: about the cube pivot, then relative to the bone.
      const transform = mat4.create();
      const rotation = vec3(cube.rotation);
      if (rotation.some((r) => r !== 0)) {
        const pivot = scenePoint(vec3(cube.pivot));
        mat4.translate(transform, transform, [
          pivot[0] - bone.pivot[0],
          pivot[1] - bone.pivot[1],
          pivot[2] - bone.pivot[2],
        ]);
        rotateZYX(transform, sceneRotation(rotation));
        mat4.translate(transform, transform, [-pivot[0], -pivot[1], -pivot[2]]);
      } else {
        mat4.translate(transform, transform, [-bone.pivot[0], -bone.pivot[1], -bone.pivot[2]]);
      }
      const faces: { face: FaceName; rect: UvRect; rotation: number }[] = [];
      if (Array.isArray(cube.uv)) {
        const rects = boxUvRects(size, [num(cube.uv[0]), num(cube.uv[1])], mirror);
        for (const face of FACE_ORDER) faces.push({ face, rect: inset(rects[face]), rotation: 0 });
      } else if (isObject(cube.uv)) {
        for (const face of FACE_ORDER) {
          const entry = faceUvRect(face, cube.uv[face], size);
          if (entry !== null) faces.push({ face, ...entry });
        }
      } else {
        problems.push(`A cube of bone "${bone.name}" has no UV; skipped.`);
        continue;
      }
      for (const { face, rect, rotation: uvRotation } of faces) {
        const corners = faceCorners(face, from, to).map((corner) => {
          const out = glVec3.transformMat4(glVec3.create(), corner, transform);
          return [out[0], out[1], out[2]] as Vec3;
        });
        const cornerUvs = rotateUvs(
          [
            [rect.u1, rect.v1],
            [rect.u2, rect.v1],
            [rect.u1, rect.v2],
            [rect.u2, rect.v2],
          ],
          uvRotation,
        );
        for (const corner of TRIANGLES) {
          const p = corners[corner] as Vec3;
          const uv = cornerUvs[corner] as [number, number];
          positions.push(p[0], p[1], p[2]);
          uvs.push(uv[0] / textureWidth, uv[1] / textureHeight);
        }
      }
    }
    bone.count = positions.length / 3 - bone.first;
  });
  return {
    bones,
    order,
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    textureWidth,
    textureHeight,
    cubeCount,
    problems,
  };
}

/** Blockbench's 1/64 pixel inset for box UV faces, towards the rectangle's centre. */
function inset(rect: UvRect): UvRect {
  const margin = 1 / 64;
  const du = rect.u1 > rect.u2 ? -margin : margin;
  const dv = rect.v1 > rect.v2 ? -margin : margin;
  return { u1: rect.u1 + du, v1: rect.v1 + dv, u2: rect.u2 - du, v2: rect.v2 - dv };
}

/** Turns the four corner UVs in 90 degree steps, as Blockbench does for `uv_rotation`. */
function rotateUvs(corners: [number, number][], rotation: number): [number, number][] {
  const arr = [...corners];
  let rot = rotation;
  while (rot > 0) {
    const a = arr[0] as [number, number];
    arr[0] = arr[2] as [number, number];
    arr[2] = arr[3] as [number, number];
    arr[3] = arr[1] as [number, number];
    arr[1] = a;
    rot -= 90;
  }
  return arr;
}

/** A pose of one bone: Bedrock-oriented animation values added to the rest pose. */
export interface BonePose {
  /** Added rotation in degrees (Bedrock orientation). */
  rotation: Vec3;
  /** Added position in model units (Bedrock orientation). */
  position: Vec3;
  /** Scale factors. */
  scale: Vec3;
}

/**
 * The world matrix of every bone (model units, scene space) for a pose. Bones without an
 * entry in `pose` keep their rest pose. Indexed like {@link BakedModel.bones}.
 */
export function boneMatrices(
  model: BakedModel,
  pose: ReadonlyMap<string, BonePose> = new Map(),
  root: mat4 = mat4.create(),
): mat4[] {
  const out: mat4[] = model.bones.map(() => mat4.create());
  for (const i of model.order) {
    const bone = model.bones[i] as BakedBone;
    const animated = pose.get(bone.name);
    const parent = bone.parent === -1 ? null : (model.bones[bone.parent] as BakedBone);
    const parentPivot: Vec3 = parent === null ? [0, 0, 0] : parent.pivot;
    const offset = animated === undefined ? [0, 0, 0] : scenePoint(animated.position);
    const rotation: Vec3 =
      animated === undefined
        ? bone.rotation
        : [
            bone.rotation[0] + animated.rotation[0],
            bone.rotation[1] + animated.rotation[1],
            bone.rotation[2] + animated.rotation[2],
          ];
    const local = mat4.fromTranslation(mat4.create(), [
      bone.pivot[0] - parentPivot[0] + (offset[0] ?? 0),
      bone.pivot[1] - parentPivot[1] + (offset[1] ?? 0),
      bone.pivot[2] - parentPivot[2] + (offset[2] ?? 0),
    ]);
    rotateZYX(local, sceneRotation(rotation));
    if (animated !== undefined) mat4.scale(local, local, animated.scale);
    const base = parent === null ? root : (out[bone.parent] as mat4);
    mat4.multiply(out[i] as mat4, base, local);
  }
  return out;
}

/** The axis-aligned bounds of a baked model at rest, in model units; `null` when empty. */
export function modelBounds(model: BakedModel): { min: Vec3; max: Vec3 } | null {
  if (model.positions.length === 0) return null;
  const matrices = boneMatrices(model);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [i, bone] of model.bones.entries()) {
    const m = matrices[i] as mat4;
    for (let v = bone.first; v < bone.first + bone.count; v++) {
      const x = model.positions[v * 3] as number;
      const y = model.positions[v * 3 + 1] as number;
      const z = model.positions[v * 3 + 2] as number;
      const p: Vec3 = [
        (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
        (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
        (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
      ];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k] as number, p[k] as number);
        max[k] = Math.max(max[k] as number, p[k] as number);
      }
    }
  }
  return { min, max };
}
