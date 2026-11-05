/**
 * Cross-element checks of geo models and animations (ADR 0029 D2). Every validator is pure and
 * reads only the project's elements. Codes:
 *
 * - `models-anim.cube-outside-texture` (warning): a cube's box UV (the unfolded box,
 *   `2 * (size.x + size.z)` wide and `size.z + size.y` high from `uv`) or a face UV (`uv` plus
 *   `uv_size`, which may be negative to mirror) reaches outside `texture_width` x
 *   `texture_height`; GeckoLib samples wrapped or blank pixels there.
 * - `models-anim.duplicate-bone` (error): two bones of one geometry share a name; animations
 *   and parents cannot tell them apart.
 * - `models-anim.unknown-parent` (error): a bone's `parent` names no bone of the same geometry
 *   (or the bone itself); GeckoLib refuses the model.
 * - `models-anim.animation-unknown-bone` (warning): an animation moves a bone that no
 *   `msm:geo_model` element of the project declares. A warning, because the animation may
 *   belong to a model that is not imported yet.
 * - `models-anim.molang-unsupported` (info): a bone channel uses a Molang expression (a string
 *   that is not a plain number); the game evaluates it, the app's preview plays it as 0.
 *   Reported once per channel.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { ANIMATION_KIND, GEO_MODEL_KIND } from './kinds';
import { isRecord } from './lowering/paths';

/** Every code the validators report. */
export const MODELS_ANIM_PROBLEM_CODES = Object.freeze([
  'models-anim.cube-outside-texture',
  'models-anim.duplicate-bone',
  'models-anim.unknown-parent',
  'models-anim.animation-unknown-bone',
  'models-anim.molang-unsupported',
] as const);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const GEOMETRY_KEY = 'minecraft:geometry';
const CHANNELS = ['rotation', 'position', 'scale'] as const;
const FACES = ['north', 'south', 'east', 'west', 'up', 'down'] as const;

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;
const array = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : []);
const ofKind = (elements: readonly Element[], kind: string): Element[] =>
  elements.filter((element) => element.kind === kind);

/** A numeric triple or pair, or `undefined` when any entry is not a finite number. */
function numbers(value: Json | undefined, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== length) return undefined;
  const result: number[] = [];
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return undefined;
    result.push(entry);
  }
  return result;
}

/** One geometry definition of a geo model, with its pointer. */
interface GeometryEntry {
  definition: JsonObject;
  path: (string | number)[];
}

function geometries(element: Element): GeometryEntry[] {
  const entries: GeometryEntry[] = [];
  array(dataOf(element)[GEOMETRY_KEY]).forEach((definition, index) => {
    const fields = record(definition);
    if (fields !== undefined) entries.push({ definition: fields, path: [GEOMETRY_KEY, index] });
  });
  return entries;
}

const bonesOf = (definition: JsonObject): JsonObject[] =>
  array(definition.bones).map((bone) => record(bone) ?? {});

/** The `[low, high]` span of a UV axis from `start` over `size` (negative mirrors). */
const span = (start: number, size: number): [number, number] =>
  size < 0 ? [start + size, start] : [start, start + size];

const outside = ([low, high]: [number, number], limit: number): boolean => low < 0 || high > limit;

function cubesOutsideTexture(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, GEO_MODEL_KIND)) {
    for (const { definition, path } of geometries(element)) {
      const description = record(definition.description);
      const width = description?.texture_width;
      const height = description?.texture_height;
      if (typeof width !== 'number' || typeof height !== 'number') continue;
      bonesOf(definition).forEach((bone, boneIndex) => {
        array(bone.cubes).forEach((cube, cubeIndex) => {
          const fields = record(cube);
          if (fields === undefined) return;
          const cubePath = [...path, 'bones', boneIndex, 'cubes', cubeIndex, 'uv'];
          const name = typeof bone.name === 'string' ? bone.name : `#${boneIndex}`;
          const report = (where: (string | number)[], detail: string) =>
            problems.push({
              severity: 'warning',
              code: 'models-anim.cube-outside-texture',
              elementId: element.id,
              path: pointer(...where),
              message: `A cube of bone "${name}" ${detail} reaches outside the ${width}x${height} texture. Move its UV or enlarge texture_width and texture_height.`,
            });
          const box = numbers(fields.uv, 2);
          const size = numbers(fields.size, 3);
          if (box !== undefined) {
            if (size === undefined) return;
            const [u, v] = box as [number, number];
            const [x, y, z] = size.map(Math.abs) as [number, number, number];
            if (outside(span(u, 2 * (x + z)), width) || outside(span(v, z + y), height)) {
              report(cubePath, 'with box UV');
            }
            return;
          }
          const faces = record(fields.uv);
          if (faces === undefined) return;
          for (const face of FACES) {
            const faceUv = record(faces[face]);
            const start = numbers(faceUv?.uv, 2);
            if (start === undefined) continue;
            const faceSize = numbers(faceUv?.uv_size, 2) ?? [0, 0];
            if (
              outside(span(start[0] as number, faceSize[0] as number), width) ||
              outside(span(start[1] as number, faceSize[1] as number), height)
            ) {
              report([...cubePath, face], `on its ${face} face`);
            }
          }
        });
      });
    }
  }
  return problems;
}

function boneStructure(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, GEO_MODEL_KIND)) {
    for (const { definition, path } of geometries(element)) {
      const bones = bonesOf(definition);
      const names = new Set<string>();
      bones.forEach((bone, index) => {
        if (typeof bone.name !== 'string') return;
        if (names.has(bone.name)) {
          problems.push({
            severity: 'error',
            code: 'models-anim.duplicate-bone',
            elementId: element.id,
            path: pointer(...path, 'bones', index, 'name'),
            message: `Bone "${bone.name}" is declared more than once. Give every bone a unique name.`,
          });
        }
        names.add(bone.name);
      });
      bones.forEach((bone, index) => {
        if (typeof bone.parent !== 'string') return;
        if (names.has(bone.parent) && bone.parent !== bone.name) return;
        problems.push({
          severity: 'error',
          code: 'models-anim.unknown-parent',
          elementId: element.id,
          path: pointer(...path, 'bones', index, 'parent'),
          message:
            bone.parent === bone.name
              ? `Bone "${bone.name}" names itself as its parent. Pick another bone or remove "parent".`
              : `Parent "${bone.parent}" is not a bone of this geometry. Pick an existing bone or remove "parent".`,
        });
      });
    }
  }
  return problems;
}

/** Every bone name declared by any geo model of the project. */
function projectBones(elements: readonly Element[]): Set<string> {
  const names = new Set<string>();
  for (const element of ofKind(elements, GEO_MODEL_KIND)) {
    for (const { definition } of geometries(element)) {
      for (const bone of bonesOf(definition)) {
        if (typeof bone.name === 'string') names.add(bone.name);
      }
    }
  }
  return names;
}

/** `[animation name, bone name, bone channels]` for every animated bone of an element. */
function animatedBones(element: Element): [string, string, JsonObject][] {
  const result: [string, string, JsonObject][] = [];
  for (const [name, animation] of Object.entries(record(dataOf(element).animations) ?? {})) {
    for (const [bone, channels] of Object.entries(record(record(animation)?.bones) ?? {})) {
      result.push([name, bone, record(channels) ?? {}]);
    }
  }
  return result;
}

function unknownAnimationBones(elements: readonly Element[]): Problem[] {
  const declared = projectBones(elements);
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ANIMATION_KIND)) {
    for (const [name, bone] of animatedBones(element)) {
      if (declared.has(bone)) continue;
      problems.push({
        severity: 'warning',
        code: 'models-anim.animation-unknown-bone',
        elementId: element.id,
        path: pointer('animations', name, 'bones', bone),
        message: `Animation "${name}" moves bone "${bone}", which no geo model of the project declares. Import or add the model, or rename the bone.`,
      });
    }
  }
  return problems;
}

const PLAIN_NUMBER = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/;

/** True when `value` (a vector value or keyframe) holds a Molang string anywhere. */
function hasMolang(value: Json | undefined): boolean {
  if (typeof value === 'string') return !PLAIN_NUMBER.test(value);
  if (Array.isArray(value)) return value.some(hasMolang);
  const fields = record(value);
  if (fields === undefined) return false;
  if ('pre' in fields || 'post' in fields) return hasMolang(fields.pre) || hasMolang(fields.post);
  return false;
}

/** True when a channel (a vector value or a map of keyframes) holds a Molang string. */
function channelHasMolang(channel: Json | undefined): boolean {
  const keyframes = record(channel);
  if (keyframes === undefined || 'pre' in keyframes || 'post' in keyframes) {
    return hasMolang(channel);
  }
  return Object.values(keyframes).some(hasMolang);
}

function molangChannels(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ANIMATION_KIND)) {
    for (const [name, bone, channels] of animatedBones(element)) {
      for (const channel of CHANNELS) {
        if (!channelHasMolang(channels[channel])) continue;
        problems.push({
          severity: 'info',
          code: 'models-anim.molang-unsupported',
          elementId: element.id,
          path: pointer('animations', name, 'bones', bone, channel),
          message: `The ${channel} of bone "${bone}" in animation "${name}" uses a Molang expression. The game evaluates it; the preview plays it as 0.`,
        });
      }
    }
  }
  return problems;
}

/** The project validators of `@msm/plugin-models-anim`, in reporting order. */
export const modelsAnimValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.models-anim.cube-outside-texture',
    kinds: [GEO_MODEL_KIND],
    validate: ({ elements }) => cubesOutsideTexture(elements),
  },
  {
    id: 'msm.models-anim.bones',
    kinds: [GEO_MODEL_KIND],
    validate: ({ elements }) => boneStructure(elements),
  },
  {
    id: 'msm.models-anim.animation-unknown-bone',
    kinds: [GEO_MODEL_KIND, ANIMATION_KIND],
    validate: ({ elements }) => unknownAnimationBones(elements),
  },
  {
    id: 'msm.models-anim.molang-unsupported',
    kinds: [ANIMATION_KIND],
    validate: ({ elements }) => molangChannels(elements),
  },
] satisfies ProjectValidator[]);
