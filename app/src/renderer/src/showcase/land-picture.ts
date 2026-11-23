/**
 * A world card's drawn still (ADR 0128 D3): the clip's own generated land, seen from its camera
 * at `stillAt`, drawn on the main thread without WebGL by casting one ray per pixel through the
 * block grid. Each block face is MSM's fallback colour for the block (`fallback-colours.ts`),
 * shaded by the way it faces and broken into 16 by 16 texels of slightly different brightness,
 * so the picture reads as blocks; water is see-through, the sky is the preview's own colour.
 *
 * Pure: the same grid, pose and size give the same bytes. The camera matches Try it's
 * (`viewMatrixFor`: yaw 0 faces +z, 90 faces -x, positive pitch looks down) and deepslate's
 * 70 degree field of view.
 *
 * @packageDocumentation
 */

import type { RgbaImage } from '../components/texture-editor/pixels';
import type { CameraPose } from '../tryit/render/camera';
import { type FallbackLook, fallbackLook, type Rgba } from '../tryit/render/fallback-colours';
import { PREVIEW_SKY } from '../tryit/render/sky';

/** The part of a block grid the land picture reads (Try it's `TryItGrid`). */
export interface LandGrid {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  get(pos: { x: number; y: number; z: number }): { readonly name: string } | null | undefined;
}

/** deepslate's vertical field of view, in degrees. */
export const LAND_FOV = 70;
/** How much of what lies under water shows through it. */
const UNDER_WATER = 0.45;
const SKY: readonly [number, number, number] = [
  Math.round(PREVIEW_SKY[0] * 255),
  Math.round(PREVIEW_SKY[1] * 255),
  Math.round(PREVIEW_SKY[2] * 255),
];
const AIR = 'minecraft:air';
const WATER = new Set(['minecraft:water', 'minecraft:bubble_column']);

/** The world direction of a camera-space ray `(u, v, -1)` for `pose`; see the module comment. */
export function rayDirection(pose: CameraPose, u: number, v: number): [number, number, number] {
  const pitch = (pose.pitch * Math.PI) / 180;
  const yaw = (pose.yaw * Math.PI) / 180;
  // Undo rotateX(pitch): rotate by -pitch about x.
  const y1 = v * Math.cos(pitch) - -1 * Math.sin(-pitch);
  const z1 = v * Math.sin(-pitch) + -1 * Math.cos(pitch);
  // Undo rotateY(yaw + pi): rotate by -(yaw + pi) about y.
  const b = -(yaw + Math.PI);
  const x2 = u * Math.cos(b) + z1 * Math.sin(b);
  const z2 = -u * Math.sin(b) + z1 * Math.cos(b);
  const length = Math.hypot(x2, y1, z2);
  return [x2 / length, y1 / length, z2 / length];
}

/** A small, stable hash of whole numbers, 0..1. */
function hash(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1);
  h = Math.imul(h ^ d, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

interface Hit {
  readonly colour: [number, number, number];
}

/**
 * Draws the land of `grid` as seen from `pose`, `width` by `height` pixels. Blocks without a
 * fallback look of their own draw in the fallback table's grey.
 */
export function drawLand(
  grid: LandGrid,
  pose: CameraPose,
  width: number,
  height: number,
  lookOf: (id: string) => FallbackLook = cachedLook(),
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const tanY = Math.tan((LAND_FOV * Math.PI) / 360);
  const tanX = tanY * (width / height);
  const eye = pose.eye;
  for (let j = 0; j < height; j += 1) {
    const v = (1 - ((j + 0.5) / height) * 2) * tanY;
    for (let i = 0; i < width; i += 1) {
      const u = (((i + 0.5) / width) * 2 - 1) * tanX;
      const direction = rayDirection(pose, u, v);
      const hit = castRay(grid, eye, direction, lookOf);
      const at = (j * width + i) * 4;
      const colour = hit?.colour ?? SKY;
      data[at] = colour[0];
      data[at + 1] = colour[1];
      data[at + 2] = colour[2];
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Looks kept by block id for one picture. */
function cachedLook(): (id: string) => FallbackLook {
  const looks = new Map<string, FallbackLook>();
  return (id) => {
    let look = looks.get(id);
    if (look === undefined) {
      look = fallbackLook(id);
      looks.set(id, look);
    }
    return look;
  };
}

/** Where a ray enters and leaves the grid's box (`null` when it misses it). */
function boxSpan(
  grid: LandGrid,
  eye: CameraPose['eye'],
  direction: readonly [number, number, number],
): [number, number] | null {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  const sizes = [grid.sizeX, grid.sizeY, grid.sizeZ];
  const starts = [eye.x, eye.y, eye.z];
  for (let axis = 0; axis < 3; axis += 1) {
    const d = direction[axis] as number;
    const o = starts[axis] as number;
    const size = sizes[axis] as number;
    if (Math.abs(d) < 1e-9) {
      if (o < 0 || o > size) return null;
      continue;
    }
    let t0 = (0 - o) / d;
    let t1 = (size - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return null;
  }
  return [near, far];
}

/** The colour the ray from `eye` along `direction` sees, or `null` for the sky. */
function castRay(
  grid: LandGrid,
  eye: CameraPose['eye'],
  direction: readonly [number, number, number],
  lookOf: (id: string) => FallbackLook,
): Hit | null {
  const span = boxSpan(grid, eye, direction);
  if (span === null) return null;
  const [dx, dy, dz] = direction;
  const start = span[0] + 1e-6;
  let px = eye.x + dx * start;
  let py = eye.y + dy * start;
  let pz = eye.z + dz * start;
  let x = Math.min(grid.sizeX - 1, Math.max(0, Math.floor(px)));
  let y = Math.min(grid.sizeY - 1, Math.max(0, Math.floor(py)));
  let z = Math.min(grid.sizeZ - 1, Math.max(0, Math.floor(pz)));
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const deltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const deltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  const deltaZ = dz === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dz);
  let maxX = dx === 0 ? Number.POSITIVE_INFINITY : ((dx > 0 ? x + 1 : x) - eye.x) / dx;
  let maxY = dy === 0 ? Number.POSITIVE_INFINITY : ((dy > 0 ? y + 1 : y) - eye.y) / dy;
  let maxZ = dz === 0 ? Number.POSITIVE_INFINITY : ((dz > 0 ? z + 1 : z) - eye.z) / dz;
  // The face the ray came in through: 0 x, 1 y, 2 z (the box's face at the start).
  let face = entryFace(eye, direction, start);
  let t = start;
  let water: [number, number, number] | null = null;
  while (t <= span[1]) {
    const state = grid.get({ x, y, z });
    const name = state?.name;
    if (name !== undefined && name !== AIR) {
      px = eye.x + dx * t;
      py = eye.y + dy * t;
      pz = eye.z + dz * t;
      const colour = faceColour(lookOf(name), face, dy, x, y, z, px, py, pz);
      if (WATER.has(name)) {
        water ??= colour;
      } else {
        return { colour: water === null ? colour : mix(water, colour, UNDER_WATER) };
      }
    }
    if (maxX < maxY && maxX < maxZ) {
      x += stepX;
      t = maxX;
      maxX += deltaX;
      face = 0;
    } else if (maxY < maxZ) {
      y += stepY;
      t = maxY;
      maxY += deltaY;
      face = 1;
    } else {
      z += stepZ;
      t = maxZ;
      maxZ += deltaZ;
      face = 2;
    }
    if (x < 0 || y < 0 || z < 0 || x >= grid.sizeX || y >= grid.sizeY || z >= grid.sizeZ) break;
  }
  return water === null ? null : { colour: mix(water, SKY, UNDER_WATER) };
}

/** The axis of the box face a ray entering at `t` crosses (the one closest to a whole number). */
function entryFace(
  eye: CameraPose['eye'],
  direction: readonly [number, number, number],
  t: number,
): number {
  const at = [eye.x + direction[0] * t, eye.y + direction[1] * t, eye.z + direction[2] * t];
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis += 1) {
    const value = at[axis] as number;
    const gap = Math.abs(value - Math.round(value));
    if (gap < bestGap) {
      bestGap = gap;
      best = axis;
    }
  }
  return best;
}

/** A face's colour: the look's top, side or bottom, shaded, with a texel's brightness. */
function faceColour(
  look: FallbackLook,
  face: number,
  dy: number,
  x: number,
  y: number,
  z: number,
  px: number,
  py: number,
  pz: number,
): [number, number, number] {
  let base: Rgba;
  let shade: number;
  let tu: number;
  let tv: number;
  if (face === 1) {
    base = dy < 0 ? look.top : look.bottom;
    shade = dy < 0 ? 1 : 0.5;
    tu = px;
    tv = pz;
  } else {
    base = look.side;
    shade = face === 0 ? 0.8 : 0.65;
    tu = face === 0 ? pz : px;
    tv = py;
  }
  // A grass block's side keeps its green edge along the top, as the game's picture does.
  if (face !== 1 && look.top !== look.side && py - y > 13 / 16 && look.drawn?.side === 'grass_side')
    base = look.top;
  const texelU = Math.min(15, Math.floor((tu - Math.floor(tu)) * 16));
  const texelV = Math.min(15, Math.floor((tv - Math.floor(tv)) * 16));
  const grain = 0.9 + hash(x * 16 + texelU, y * 16 + texelV, z * 16 + face, face) * 0.2;
  const k = shade * grain;
  return [
    Math.min(255, Math.round(base[0] * k)),
    Math.min(255, Math.round(base[1] * k)),
    Math.min(255, Math.round(base[2] * k)),
  ];
}

function mix(
  over: readonly [number, number, number],
  under: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    Math.round(over[0] * (1 - amount) + under[0] * amount),
    Math.round(over[1] * (1 - amount) + under[1] * amount),
    Math.round(over[2] * (1 - amount) + under[2] * amount),
  ];
}
