/**
 * The stand-in bodies (ADR 0121 D4, B623): every body loads in the geo renderer's baker; drawn with
 * a marked test texture, every named part shows its own colour; and every face the spike B619
 * measured (`docs/reference/spikes/b619/results/bodies-*.json`, MSM's own coded pictures) lands
 * within half a model pixel of the body, on both targets.
 *
 * The spike's lists are read as its README says: a face seen square on whose texel scale is off
 * by more than 5 % was placed at the wrong depth along its camera's ray, so it is moved along that
 * ray until one texel is one model pixel (the cameras are in `client-*.json`); faces whose own
 * measurement contradicts one texel per model pixel (scale off by 3 to 5 %, or a triangulated face
 * stretched by more than 8 %) are not used; inflated layers keep their measured size. The few
 * faces the spike placed against its own neighbours are listed in {@link EXCLUDED} with the
 * reason.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '@msm/plugin-api';
import { type mat4, vec3 } from 'gl-matrix';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BODY_IDS,
  type BodyId,
  bodyFor,
  bodyIdFor,
  loadBody,
  SULFUR_CUBE_LAYERS,
  scaleBody,
  sulfurCubeScale,
} from '../../../../src/renderer/src/liveviews/looks/bodies/index';
import {
  bannerShape,
  frameShape,
  POT_ATLAS,
  potShape,
  shieldShape,
  wallShape,
} from '../../../../src/renderer/src/liveviews/looks/bodies/shapes';
import {
  type BakedModel,
  bakeGeometry,
  boneMatrices,
  VERTICES_PER_FACE,
} from '../../../../src/renderer/src/preview/geo/geometry';

const SPIKE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'reference',
  'spikes',
  'b619',
  'results',
);
const TARGETS = ['26.3', '26.4'] as const;

type P3 = [number, number, number];

interface SpikeFace {
  view: string;
  uv: [number, number, number, number];
  corners: [P3, P3, P3, P3];
  how: string;
  pxPerTexel: number;
}

/**
 * Which body each list of the spike measures, and the scale the game drew it at (the sulfur cube's
 * by its Size; the cat and the villager load at theirs).
 */
const LISTS: readonly { list: string; body: BodyId; scale?: number; squareOnly?: boolean }[] = [
  { list: 'wolf', body: 'wolf' },
  { list: 'wolf_baby', body: 'wolf_baby' },
  { list: 'cat', body: 'cat', scale: 0.8 },
  { list: 'cat_baby', body: 'cat_baby' },
  { list: 'pig', body: 'pig' },
  { list: 'pig_cold', body: 'pig_cold' },
  { list: 'pig_baby', body: 'pig_baby' },
  { list: 'pig_cold_baby', body: 'pig_baby' },
  { list: 'cow', body: 'cow' },
  { list: 'cow_cold', body: 'cow_cold' },
  { list: 'cow_warm', body: 'cow_warm' },
  { list: 'cow_baby', body: 'cow_baby' },
  { list: 'chicken', body: 'chicken' },
  { list: 'chicken_cold', body: 'chicken_cold' },
  { list: 'chicken_baby', body: 'chicken_baby' },
  { list: 'frog', body: 'frog' },
  { list: 'villager', body: 'villager', scale: 0.9375 },
  { list: 'villager_type', body: 'villager', scale: 0.9375 },
  { list: 'villager_profession', body: 'villager', scale: 0.9375 },
  { list: 'villager_level', body: 'villager', scale: 0.9375 },
  { list: 'villager_baby', body: 'villager_baby' },
  { list: 'villager_baby_type', body: 'villager_baby' },
  { list: 'sulfur_cube_outer', body: 'sulfur_cube', scale: 1.5 },
  { list: 'sulfur_cube_inner', body: 'sulfur_cube', scale: 1.5 },
  { list: 'sulfur_cube_small_outer', body: 'sulfur_cube', scale: 0.5, squareOnly: true },
  { list: 'sulfur_cube_small_inner', body: 'sulfur_cube', scale: 0.5 },
];

/** Texel rectangles of inflated layers: their faces keep the measured (larger) size. */
const INFLATED: Readonly<Record<string, readonly [number, number, number, number][]>> = {
  pig_cold: [[28, 32, 64, 56]],
  cow_cold: [[20, 32, 64, 60]],
  villager: [
    [32, 0, 64, 18],
    [0, 38, 28, 64],
  ],
  villager_baby: [
    [0, 30, 30, 45],
    [16, 21, 30, 30],
  ],
};
for (const name of ['villager_type', 'villager_profession', 'villager_level'])
  (INFLATED as Record<string, unknown>)[name] = INFLATED.villager;
(INFLATED as Record<string, unknown>).villager_baby_type = INFLATED.villager_baby;

const BETWEEN_LEGS =
  'a side face between the legs, placed by a hidden neighbour against the front and back faces of the same leg';
const VILLAGER_RIM =
  'the rim seen square on was placed against the hat by a neighbour; its other faces, triangulated from two views, agree a pixel lower';

/** Faces the spike placed against its own other measurements (view, texel rectangle, reason). */
const EXCLUDED: Readonly<Record<string, readonly [string, string, string][]>> = {
  cat: [
    ['west', '40,2,42,12', BETWEEN_LEGS],
    ['east', '44,2,46,12', BETWEEN_LEGS],
    ['west', '8,15,10,21', BETWEEN_LEGS],
    ['east', '12,15,14,21', BETWEEN_LEGS],
  ],
  cat_baby: [
    ['west', '12,24,14,26', BETWEEN_LEGS],
    ['east', '21,24,23,26', BETWEEN_LEGS],
    ['east', '14,24,16,26', 'seen edge on (scale 0.05)'],
    ['west', '19,24,21,26', 'seen edge on (scale 0.05)'],
  ],
  cow: [['bottom', '14,0,22,6', 'triangulated 0.7 below the head faces seen square on']],
  cow_warm: [
    ['bottom', '14,0,22,6', 'triangulated 0.7 below the head faces seen square on'],
    [
      'front',
      '29,2,33,4',
      'placed on the head front by its neighbour; the horn top and bottom agree 0.8 back',
    ],
    [
      'front',
      '41,2,43,4',
      'placed on the head front by its neighbour; the horn top and bottom agree 0.8 back',
    ],
    ['bottom', '33,0,37,2', 'triangulated at the height of the horn top, against the horn front'],
  ],
  cow_cold: [
    [
      'back',
      '11,20,16,30',
      'two faces merged (a leg side and back), so its texel scale is not one face',
    ],
    ['bottom', '14,0,22,6', 'triangulated 0.7 below the head faces seen square on'],
    ['front', '34,44,38,45', 'one row tall, stretched to 0.8 of a texel'],
  ],
  cow_baby: [
    ['back', '16,23,22,25', 'placed 1.5 inside the head by a neighbour (texel scale 0.9 tall)'],
  ],
  chicken: [
    ['back', '10,3,14,6', 'placed 1.5 inside the head by a neighbour'],
    ['west', '26,3,29,8', BETWEEN_LEGS],
    ['east', '32,3,35,8', BETWEEN_LEGS],
  ],
  chicken_cold: [
    ['back', '10,3,14,6', 'placed 1.5 inside the head by a neighbour'],
    ['west', '26,3,29,8', BETWEEN_LEGS],
    ['east', '32,3,35,8', BETWEEN_LEGS],
  ],
  frog: [
    ['top', '3,5,6,8', 'placed a pixel below the eye by a neighbour'],
    ['bottom', '18,32,21,39', 'a web seen through the leg, moved off the ground by its scale'],
  ],
  villager: [
    ['top', '31,48,47,64', VILLAGER_RIM],
    ['front', '61,54,64,56', 'a skewed sliver of the rim (its corners 0.6 apart in depth)'],
  ],
  villager_type: [['top', '44,41,52,42', 'one row tall, stretched to 1.4 texels']],
  villager_baby: [
    ['back', '14,26,16,28', 'placed 0.7 behind the leg by a neighbour'],
    ['west', '8,26,10,28', BETWEEN_LEGS],
    ['bottom', '15,30,23,37', 'the head seen from below, placed on the feet by a neighbour'],
    ['bottom', '28,47,38,55', 'the brim seen from below, moved off by a wrong texel scale'],
  ],
  villager_baby_type: [
    ['back', '14,26,16,28', 'placed 0.7 behind the leg by a neighbour'],
    ['west', '8,26,10,28', BETWEEN_LEGS],
    ['top', '19,21,23,24', 'the body top triangulated 3 below the body'],
  ],
  sulfur_cube_small_outer: [
    ['top', '18,0,26,8', 'triangulated a pixel below the top seen square on'],
    ['top', '22,2,33,10', 'triangulated a pixel below the top seen square on'],
  ],
};
for (const name of ['villager_profession', 'villager_level'])
  (EXCLUDED as Record<string, unknown>)[name] = EXCLUDED.villager;

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(SPIKE, file), 'utf8'));

/** Camera positions per target, list and view, in model pixels from the entity's feet. */
function cameras(mc: string): Map<string, Map<string, P3>> {
  const client = readJson(`client-${mc}.json`) as Record<string, unknown>;
  try {
    const rerun = readJson(`client-${mc}-rerun.json`) as Record<string, unknown>;
    for (const [key, value] of Object.entries(rerun))
      if (key.startsWith('body.')) client[key] = value;
  } catch {
    // No rerun file.
  }
  const out = new Map<string, Map<string, P3>>();
  for (const [key, value] of Object.entries(client)) {
    if (!key.startsWith('body.') || typeof value !== 'object' || value === null) continue;
    const meta = value as { entity?: number[]; views?: { view: string; camera: number[] }[] };
    if (meta.entity === undefined || meta.views === undefined) continue;
    const [ex, ey, ez] = meta.entity as [number, number, number];
    const views = new Map<string, P3>();
    for (const view of meta.views) {
      const [cx, cy, cz] = view.camera as [number, number, number];
      views.set(view.view, [(cx - ex) * 16, (cy - ey) * 16, (cz - ez) * 16]);
    }
    out.set(key.slice(5), views);
  }
  return out;
}

const dist = (a: P3, b: P3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The spike's faces of one list that are used, after the depth correction. */
function usedFaces(
  mc: string,
  list: string,
  scale: number,
  squareOnly: boolean,
  cams: Map<string, Map<string, P3>>,
): { face: SpikeFace; corners: P3[] }[] {
  const all = readJson(`bodies-${mc}.json`) as Record<string, { faceList: SpikeFace[] }>;
  const faces = all[list]?.faceList ?? [];
  const excluded = new Set((EXCLUDED[list] ?? []).map(([view, uv]) => `${view}:${uv}`));
  const inflated = INFLATED[list] ?? [];
  const out: { face: SpikeFace; corners: P3[] }[] = [];
  for (const face of faces) {
    if (excluded.has(`${face.view}:${face.uv.join(',')}`)) continue;
    const [u0, v0, u1, v1] = face.uv;
    let corners: P3[] = face.corners.map((c) => [...c] as P3);
    if (face.how === 'triangulated corners') {
      const su = dist(corners[0] as P3, corners[1] as P3) / scale / Math.max(1, u1 - u0);
      const sv = dist(corners[0] as P3, corners[3] as P3) / scale / Math.max(1, v1 - v0);
      if (Math.abs(su - 1) > 0.08 || Math.abs(sv - 1) > 0.08) continue;
    } else if (!inflated.some(([a, b, c, d]) => a <= u0 && b <= v0 && u1 <= c && v1 <= d)) {
      const dev = Math.abs(face.pxPerTexel / scale - 1);
      if (dev > 0.03) {
        if (squareOnly || dev <= 0.05 || Math.min(u1 - u0, v1 - v0) < 3) continue;
        const cam = cams.get(list)?.get(face.view);
        if (cam === undefined) continue;
        const k = scale / face.pxPerTexel;
        corners = corners.map((c) => [
          cam[0] + (c[0] - cam[0]) * k,
          cam[1] + (c[1] - cam[1]) * k,
          cam[2] + (c[2] - cam[2]) * k,
        ]);
      }
    }
    out.push({ face, corners });
  }
  return out;
}

/** One drawn face of a baked body in the spike's space (feet at 0, facing +z), with its texels. */
interface WorldFace {
  bone: number;
  /** Corners top-left, top-right, bottom-left (positions and texel uv). */
  p: [P3, P3, P3, P3];
  uv: [[number, number], [number, number], [number, number], [number, number]];
}

function worldFaces(model: BakedModel): WorldFace[] {
  const matrices = boneMatrices(model);
  const out: WorldFace[] = [];
  model.bones.forEach((bone, index) => {
    const m = matrices[index] as mat4;
    for (let f = bone.first; f < bone.first + bone.count; f += VERTICES_PER_FACE) {
      // Triangles a, c, b and c, d, b (geometry.ts): vertices 0, 2, 1 are corners a, b, c; 4 is d.
      const pick = [f, f + 2, f + 1, f + 4];
      const p = pick.map((v) => {
        const out3 = vec3.transformMat4(
          vec3.create(),
          [
            model.positions[v * 3] ?? 0,
            model.positions[v * 3 + 1] ?? 0,
            model.positions[v * 3 + 2] ?? 0,
          ],
          m,
        );
        // Scene space is the spike's space turned half a turn: x and z negated.
        return [-(out3[0] ?? 0), out3[1] ?? 0, -(out3[2] ?? 0)] as P3;
      }) as WorldFace['p'];
      // Texel corners, without the renderer's 1/64 inset against bleeding (all corners here lie
      // on whole texels).
      const uv = pick.map(
        (v) =>
          [
            Math.round((model.uvs[v * 2] ?? 0) * model.textureWidth),
            Math.round((model.uvs[v * 2 + 1] ?? 0) * model.textureHeight),
          ] as [number, number],
      ) as WorldFace['uv'];
      out.push({ bone: index, p, uv });
    }
  });
  return out;
}

/** The position of texel point (u, v) on a face, by the face's affine map. */
function at(face: WorldFace, u: number, v: number): P3 {
  const [a, b, c] = face.p;
  const [ua, va] = face.uv[0];
  const ub = face.uv[1][0];
  const vc = face.uv[2][1];
  const s = (u - ua) / (ub - ua);
  const t = (v - va) / (vc - va);
  return ([0, 1, 2] as const).map((k) => a[k] + s * (b[k] - a[k]) + t * (c[k] - a[k])) as P3;
}

const contains = (
  face: WorldFace,
  [u0, v0, u1, v1]: readonly [number, number, number, number],
): boolean => {
  const us = face.uv.map((x) => x[0]);
  const vs = face.uv.map((x) => x[1]);
  const e = 1e-6;
  return (
    Math.min(...us) - e <= u0 &&
    Math.max(...us) + e >= u1 &&
    Math.min(...vs) - e <= v0 &&
    Math.max(...vs) + e >= v1
  );
};

/** Parts wholly inside another part of the same body. */
const COVERED: Readonly<Partial<Record<BodyId, readonly string[]>>> = {
  sulfur_cube: ['inner'],
  villager: ['head', 'body'],
};

const bodies = new Map<BodyId, BakedModel>();
let unscaledSulfur: Json = null;

beforeAll(async () => {
  for (const id of BODY_IDS) bodies.set(id, bakeGeometry(await loadBody(id)));
  unscaledSulfur = await loadBody('sulfur_cube');
});

describe('stand-in bodies', () => {
  it('every body loads in the geo renderer, each part a bone of its own', () => {
    expect(BODY_IDS).toHaveLength(18);
    for (const id of BODY_IDS) {
      const model = bodies.get(id) as BakedModel;
      expect(model.problems, id).toEqual([]);
      expect(model.cubeCount, id).toBeGreaterThan(0);
      expect(
        model.bones.every((bone) => bone.count > 0),
        id,
      ).toBe(true);
      expect(new Set(model.bones.map((bone) => bone.name)).size, id).toBe(model.bones.length);
    }
  });

  it('every body is drawn with its parts showing their own colours of a marked texture', () => {
    for (const id of BODY_IDS) {
      const model = bodies.get(id) as BakedModel;
      const faces = worldFaces(model);
      // The marked texture: each texel the colour (bone index + 1) of the bones that sample it;
      // bones that sample exactly the same texels (a pair of legs) share one colour.
      const { textureWidth: w, textureHeight: h } = model;
      const owners = new Map<number, Set<number>>();
      for (const face of faces) {
        const us = face.uv.map((x) => x[0]);
        const vs = face.uv.map((x) => x[1]);
        for (let v = Math.floor(Math.min(...vs) + 0.1); v < Math.max(...vs) - 0.1; v++)
          for (let u = Math.floor(Math.min(...us) + 0.1); u < Math.max(...us) - 0.1; u++) {
            const key = v * w + u;
            if (!owners.has(key)) owners.set(key, new Set());
            owners.get(key)?.add(face.bone);
          }
      }
      const colour = new Int32Array(w * h).fill(0);
      for (const [key, set] of owners) colour[key] = Math.min(...set) + 1;
      const sameTexels = (a: number, b: number): boolean =>
        [...owners.values()].every((set) => set.has(a) === set.has(b));
      // Every part, drawn from twelve sides on its own and with the rest of the body, shows a
      // colour that is its own, never another part's.
      model.bones.forEach((bone, index) => {
        const seen = raster(
          faces.filter((face) => face.bone === index),
          colour,
          w,
        );
        expect(seen.size, `${id} ${bone.name} is drawn`).toBeGreaterThan(0);
        for (const c of seen) {
          const ownerBone = c - 1;
          expect(
            ownerBone === index || sameTexels(ownerBone, index),
            `${id} ${bone.name} shows the colour of ${model.bones[ownerBone]?.name}`,
          ).toBe(true);
        }
      });
      const whole = raster(faces, colour, w);
      const visible = model.bones.filter((_, index) =>
        [...whole].some((c) => c - 1 === index || sameTexels(c - 1, index)),
      );
      // Parts inside an inflated layer show only through its clear texels (the sulfur cube's
      // inner box, the villager's head and body under the hat and robe); every other part shows.
      const covered = COVERED[id] ?? [];
      expect(visible.map((bone) => bone.name).sort(), id).toEqual(
        model.bones
          .map((bone) => bone.name)
          .filter((name) => !covered.includes(name))
          .sort(),
      );
    }
  });

  it('every face the spike measured lands within half a model pixel, on both targets', () => {
    let checked = 0;
    for (const mc of TARGETS) {
      const cams = cameras(mc);
      for (const { list, body, scale = 1, squareOnly = false } of LISTS) {
        const model =
          body === 'sulfur_cube'
            ? bakeGeometry(scaleBody(unscaledSulfur, scale))
            : (bodies.get(body) as BakedModel);
        const faces = worldFaces(model);
        const used = usedFaces(mc, list, scale, squareOnly, cams);
        expect(used.length, `${mc} ${list}`).toBeGreaterThan(3);
        for (const { face, corners } of used) {
          const [u0, v0, u1, v1] = face.uv;
          let best = Number.POSITIVE_INFINITY;
          let bone = '';
          for (const candidate of faces) {
            if (!contains(candidate, face.uv)) continue;
            const ours = [
              at(candidate, u0, v0),
              at(candidate, u1, v0),
              at(candidate, u1, v1),
              at(candidate, u0, v1),
            ];
            const error = Math.max(...ours.map((p, i) => dist(p, corners[i] as P3)));
            if (error < best) {
              best = error;
              bone = model.bones[candidate.bone]?.name ?? '';
            }
          }
          expect(
            best,
            `${mc} ${list} ${face.view} ${face.uv.join(',')} (${bone})`,
          ).toBeLessThanOrEqual(0.5);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

/**
 * Draws faces from twelve directions (orthographic, depth tested) and returns the colours seen:
 * each pixel samples the marked texture at its texel.
 */
function raster(faces: WorldFace[], colour: Int32Array, width: number): Set<number> {
  const seen = new Set<number>();
  const size = 72;
  const directions: P3[] = [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ];
  for (const yaw of [45, 135, 225, 315])
    for (const pitch of [30, -30]) {
      const y = (yaw * Math.PI) / 180;
      const p = (pitch * Math.PI) / 180;
      directions.push([Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)]);
    }
  for (const d of directions) {
    const up: P3 = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), up, d));
    const top = vec3.cross(vec3.create(), d, right);
    const project = (q: P3): P3 => [vec3.dot(q, right), vec3.dot(q, top), vec3.dot(q, d)];
    const projected = faces.map((face) => face.p.map(project));
    const xs = projected.flatMap((q) => q.map((x) => x[0]));
    const ys = projected.flatMap((q) => q.map((x) => x[1]));
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const scale = (size - 2) / Math.max(1e-6, Math.max(...xs) - minX, Math.max(...ys) - minY);
    const depth = new Float64Array(size * size).fill(Number.NEGATIVE_INFINITY);
    const pixel = new Int32Array(size * size).fill(0);
    faces.forEach((face, fi) => {
      const q = (projected[fi] as P3[]).map(
        (x) => [(x[0] - minX) * scale + 1, (x[1] - minY) * scale + 1, x[2]] as P3,
      );
      // Two triangles a, b, c and b, d, c with their uvs.
      for (const [i, j, k] of [
        [0, 1, 2],
        [1, 3, 2],
      ] as const) {
        const A = q[i] as P3;
        const B = q[j] as P3;
        const C = q[k] as P3;
        const area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
        const x1 = Math.min(size - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
        const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
        const y1 = Math.min(size - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
        for (let py = y0; py <= y1; py++)
          for (let px = x0; px <= x1; px++) {
            const x = px + 0.5;
            const y = py + 0.5;
            const wa = ((B[0] - x) * (C[1] - y) - (C[0] - x) * (B[1] - y)) / area;
            const wb = ((C[0] - x) * (A[1] - y) - (A[0] - x) * (C[1] - y)) / area;
            const wc = 1 - wa - wb;
            if (wa < 0 || wb < 0 || wc < 0) continue;
            const z = wa * A[2] + wb * B[2] + wc * C[2];
            const at = py * size + px;
            // The viewer looks along -d: the nearest point has the largest depth.
            if (z <= (depth[at] as number)) continue;
            depth[at] = z;
            const uvA = face.uv[i];
            const uvB = face.uv[j];
            const uvC = face.uv[k];
            // Sampled a hair inside the face, as the renderer's inset does.
            const us = face.uv.map((t) => t[0]);
            const vs = face.uv.map((t) => t[1]);
            const clamp = (x: number, values: number[]): number =>
              Math.min(Math.max(x, Math.min(...values) + 0.01), Math.max(...values) - 0.01);
            const u = clamp(wa * uvA[0] + wb * uvB[0] + wc * uvC[0], us);
            const v = clamp(wa * uvA[1] + wb * uvB[1] + wc * uvC[1], vs);
            pixel[at] = colour[Math.floor(v) * width + Math.floor(u)] ?? 0;
          }
      }
    });
    for (const c of pixel) if (c > 0) seen.add(c);
  }
  return seen;
}

describe('which body a variant names', () => {
  it('maps the data’s model strings and the baby flag; the zombie nautilus is the flat sheet', () => {
    expect(bodyIdFor('minecraft:pig_variant', 'cold', false)).toBe('pig_cold');
    expect(bodyIdFor('minecraft:pig_variant', 'cold', true)).toBe('pig_baby');
    expect(bodyIdFor('minecraft:cow_variant', 'warm', false)).toBe('cow_warm');
    expect(bodyIdFor('minecraft:cow_variant', 'minecraft:cold', false)).toBe('cow_cold');
    expect(bodyIdFor('minecraft:chicken_variant', 'cold', false)).toBe('chicken_cold');
    expect(bodyIdFor('minecraft:chicken_variant', 'normal', true)).toBe('chicken_baby');
    expect(bodyIdFor('minecraft:wolf_variant', undefined, false)).toBe('wolf');
    expect(bodyIdFor('minecraft:cat_sound_variant', undefined, true)).toBe('cat_baby');
    expect(bodyIdFor('minecraft:frog_variant', undefined, false)).toBe('frog');
    expect(bodyIdFor('msm:villager_type', undefined, true)).toBe('villager_baby');
    expect(bodyIdFor('minecraft:sulfur_cube_archetype', undefined, false)).toBe('sulfur_cube');
    expect(bodyIdFor('minecraft:pig_variant', 'unheard_of', false)).toBe('pig');
    expect(bodyFor('minecraft:zombie_nautilus_variant', 'warm', false)).toBe('flat_sheet');
    expect(bodyFor('minecraft:painting_variant', undefined, false)).toBe('flat_sheet');
    expect(typeof bodyFor('minecraft:cow_variant', 'cold', false)).toBe('function');
  });

  it('scales the sulfur cube by Size and names the picture each bone samples', () => {
    expect([0, 1, 2].map(sulfurCubeScale)).toEqual([0.5, 1, 1.5]);
    const bones = (bodies.get('sulfur_cube') as BakedModel).bones.map((bone) => bone.name).sort();
    expect(SULFUR_CUBE_LAYERS.map((layer) => layer.bone).sort()).toEqual(bones);
  });
});

describe('shapes for paintings, banners, shields and pots', () => {
  /** The texel rectangles (u0, v0, u1, v1) each bone of a shape samples, and their normals. */
  const rects = (geo: Json): Map<string, string[]> => {
    const model = bakeGeometry(geo);
    expect(model.problems).toEqual([]);
    const out = new Map<string, string[]>();
    for (const face of worldFaces(model)) {
      const us = face.uv.map((t) => t[0]);
      const vs = face.uv.map((t) => t[1]);
      const name = model.bones[face.bone]?.name ?? '';
      const list = out.get(name) ?? [];
      list.push([Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)].join(','));
      out.set(name, list);
    }
    return out;
  };

  it('a painting shows its whole picture on the front, on a wall', () => {
    expect(rects(frameShape(4, 3)).get('picture')).toContain('0,0,64,48');
    expect(rects(frameShape(2, 1, 64, 32)).get('picture')).toContain('0,0,64,32');
    expect(rects(wallShape(4, 3)).get('wall')).toContain('0,0,16,16');
  });

  it('a banner flag and a shield plate use the pattern layouts MSM draws', () => {
    const banner = rects(bannerShape());
    expect(banner.get('flag')).toEqual(expect.arrayContaining(['1,1,21,41', '22,1,42,41']));
    expect([...banner.keys()].sort()).toEqual(['bar', 'flag', 'pole']);
    expect(rects(shieldShape()).get('plate')).toContain('1,1,13,23');
  });

  it('a pot shows one picture per side', () => {
    const body = rects(potShape()).get('body') ?? [];
    for (const [u, v, w, h] of Object.values(POT_ATLAS.sides))
      expect(body).toContain([u, v, u + w, v + h].join(','));
  });
});
