/**
 * The cross-language geo golden (ADR 0072 D7, B285): the app's preview baker (`geometry.ts`, with
 * `keyframes.ts` for one posed sample) writes the world-space vertex positions and UVs of the models in
 * `fixtures/geo-parity/`; the runtime's JUnit `GeoParityTest` bakes the same files into vanilla
 * `ModelPart`s and compares, so the two bakers cannot drift apart.
 *
 * Set `UPDATE_GOLDENS=1` to rewrite `fixtures/geo-parity/expected-vertices.json` from the current baker.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonObject } from '@msm/plugin-api';
import type { mat4 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';
import {
  type BakedModel,
  bakeGeometry,
  boneMatrices,
  FACE_ORDER,
  type FaceName,
  faceUvRect,
  firstGeometry,
  VERTICES_PER_FACE,
  type Vec3,
} from '../../src/renderer/src/preview/geo/geometry';
import { parseAnimations, samplePose } from '../../src/renderer/src/preview/geo/keyframes';

const update = process.env.UPDATE_GOLDENS === '1';
const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'geo-parity');
const GOLDEN = join(FIXTURES, 'expected-vertices.json');

/** The models and poses in the golden. */
const CASES: {
  name: string;
  geo: string;
  animationFile?: string;
  animation?: string;
  time?: number;
}[] = [
  { name: 'biped', geo: 'biped.geo.json' },
  { name: 'features', geo: 'features.geo.json' },
  {
    name: 'features posed',
    geo: 'features.geo.json',
    animationFile: 'features.animation.json',
    animation: 'pose_check',
    time: 0.25,
  },
];

/** One drawn face: four corners (top-left, top-right, bottom-left, bottom-right), `x, y, z, u, v` each. */
interface GoldenFace {
  bone: string;
  cube: number;
  face: FaceName;
  /** Box UV faces carry the preview's 1/64 pixel inset; the runtime undoes it before comparing. */
  box: boolean;
  vertices: number[][];
}

interface GoldenModel {
  name: string;
  geo: string;
  animationFile?: string;
  animation?: string;
  time?: number;
  textureWidth: number;
  textureHeight: number;
  faces: GoldenFace[];
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Six decimals, and no negative zero, so the golden reads the same everywhere. */
const round = (n: number): number => {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

/** Triangle vertex index of each corner (the baker writes corners 0, 2, 1 and 2, 3, 1). */
const CORNER_VERTEX = [0, 2, 1, 4] as const;

/** The drawn faces of each baked bone's cubes, in the baker's order. */
function faceList(
  data: unknown,
  model: BakedModel,
): { bone: string; cube: number; face: FaceName; box: boolean }[] {
  const geometry = firstGeometry(data);
  const raw = Array.isArray(geometry?.bones) ? geometry.bones.filter(isObject) : [];
  const seen = new Set<string>();
  const sources = raw.filter((bone) => {
    const name = typeof bone.name === 'string' ? bone.name : '';
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  const out: { bone: string; cube: number; face: FaceName; box: boolean }[] = [];
  model.bones.forEach((bone, i) => {
    const rawCubes = sources[i]?.cubes;
    const cubes = Array.isArray(rawCubes) ? rawCubes.filter(isObject) : [];
    const before = out.length;
    cubes.forEach((cube, c) => {
      const size: Vec3 = Array.isArray(cube.size)
        ? [Number(cube.size[0] ?? 0), Number(cube.size[1] ?? 0), Number(cube.size[2] ?? 0)]
        : [0, 0, 0];
      if (Array.isArray(cube.uv)) {
        for (const face of FACE_ORDER) out.push({ bone: bone.name, cube: c, face, box: true });
      } else if (isObject(cube.uv)) {
        const uv = cube.uv;
        for (const face of FACE_ORDER) {
          if (faceUvRect(face, uv[face], size) !== null) {
            out.push({ bone: bone.name, cube: c, face, box: false });
          }
        }
      }
    });
    expect(out.length - before, `faces of bone ${bone.name}`).toBe(bone.count / VERTICES_PER_FACE);
  });
  return out;
}

function bakeCase(entry: (typeof CASES)[number]): GoldenModel {
  const data = readJson(entry.geo);
  const model = bakeGeometry(data);
  expect(model.problems).toEqual([]);
  let pose = new Map();
  if (entry.animationFile !== undefined) {
    const animation = parseAnimations(readJson(entry.animationFile)).find(
      (a) => a.name === entry.animation,
    );
    expect(animation, entry.animation).toBeDefined();
    if (animation !== undefined) {
      expect(animation.catmullrom || animation.molang).toBe(false);
      pose = samplePose(animation, entry.time ?? 0);
    }
  }
  const matrices = boneMatrices(model, pose);
  const list = faceList(data, model);
  const faces: GoldenFace[] = [];
  let next = 0;
  model.bones.forEach((bone, i) => {
    const m = matrices[i] as mat4;
    for (let first = bone.first; first < bone.first + bone.count; first += VERTICES_PER_FACE) {
      const meta = list[next++] as (typeof list)[number];
      const vertices = CORNER_VERTEX.map((offset) => {
        const v = first + offset;
        const x = model.positions[v * 3] as number;
        const y = model.positions[v * 3 + 1] as number;
        const z = model.positions[v * 3 + 2] as number;
        return [
          (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
          (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
          (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
          model.uvs[v * 2] as number,
          model.uvs[v * 2 + 1] as number,
        ].map(round);
      });
      faces.push({ ...meta, vertices });
    }
  });
  return {
    ...entry,
    textureWidth: model.textureWidth,
    textureHeight: model.textureHeight,
    faces,
  };
}

/** Two-space JSON with each vertex on one line. */
function serialise(golden: unknown): string {
  return `${JSON.stringify(golden, null, 2).replace(
    /\[\s+(-?[\d.e-]+(?:,\s+-?[\d.e-]+)*)\s+\]/g,
    (_, inner: string) => `[${inner.split(/,\s+/).join(', ')}]`,
  )}\n`;
}

/** Compares parsed goldens with a small numeric tolerance (platform `sin` and `cos` may differ in the last bit). */
function expectClose(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThan(1e-5);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((item, i) => {
      expectClose((actual as unknown[])[i], item, `${path}[${i}]`);
    });
    return;
  }
  if (isObject(expected)) {
    expect(isObject(actual), path).toBe(true);
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expectClose((actual as JsonObject)[key], value, `${path}.${key}`);
    }
    return;
  }
  expect(actual, path).toEqual(expected);
}

describe('geo parity golden', () => {
  const golden = { format: 1, models: CASES.map(bakeCase) };

  it('covers box UV, mirror, inflate, per-face UV, uv_rotation, cube rotation and a pose', () => {
    const features = golden.models[1] as GoldenModel;
    expect(features.faces.some((f) => f.box)).toBe(true);
    expect(features.faces.some((f) => !f.box)).toBe(true);
    // The neck's first cube has no down face.
    expect(
      features.faces.filter((f) => f.bone === 'neck' && f.cube === 0).map((f) => f.face),
    ).not.toContain('down');
  });

  it('matches fixtures/geo-parity/expected-vertices.json', () => {
    const text = serialise(golden);
    if (update) {
      writeFileSync(GOLDEN, text);
      return;
    }
    expectClose(JSON.parse(readFileSync(GOLDEN, 'utf8')), JSON.parse(text), 'golden');
  });
});
