/**
 * `.bbmodel` to Bedrock geometry (1.12.0) and animations (1.8.0) for GeckoLib (ADR 0029 D3).
 *
 * Pure and free of Node built-ins. Reads only documented project fields (`meta`, `name`,
 * `model_identifier`, `resolution`, `visible_box`, `elements`, `groups`, `outliner`,
 * `textures`, `animations`) and applies Blockbench's own Bedrock export conventions
 * (`js/io/formats/bedrock.js`, `js/animations/keyframe.js`, checked at v4.12.4 and v5.0.0):
 *
 * - cube `origin = [-(from.x + size.x), from.y, from.z]`, `size = to - from`, `inflate`;
 * - a rotated cube gets `pivot` (its `origin` with x negated) and `rotation` with x and y negated;
 * - box UV writes `uv: [u, v]` (`uv_offset`) and `mirror` when it differs from the bone's;
 * - per-face UV writes `{ uv, uv_size }` from `[u1, v1, u2, v2]`, the `up` and `down` faces
 *   flipped (`uv += uv_size`, `uv_size` negated); faces with `texture: null` are left out;
 * - bones write `pivot` (x negated) and `rotation` (x and y negated, left out when zero);
 * - keyframes: projects saved by Blockbench 5.x store position x and rotation x and y in
 *   Blockbench's own orientation and the export negates them; 4.x projects already store the
 *   Bedrock orientation and are written as they are.
 *
 * Project layouts: 4.x stores group fields inline in `outliner`; 5.x stores them in a `groups`
 * array and `outliner` holds `{ uuid, children }` nodes. Both are read. Loose cubes go under a
 * `root` bone (Blockbench itself names it `bb_main`).
 */
import type { Problem } from '@msm/plugin-api';
import { PngFormatError, readPngHeader } from '../png';
import {
  ANIMATION_FORMAT_VERSION,
  type AnimationEntry,
  type AnimationFile,
  type AxisValue,
  type BbmodelConversion,
  type BbmodelTexture,
  type BoneAnimation,
  type ChannelKeyframes,
  type ConvertBbmodelOptions,
  GEO_FORMAT_VERSION,
  type GeoBone,
  type GeoCube,
  type GeoFaceUv,
  type GeoFaceUvs,
  type GeoFile,
  type KeyframeObject,
  type KeyframeVec,
  type Vec3,
} from './types';

type Obj = Record<string, unknown>;

const FACE_NAMES = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
const CHANNELS = ['rotation', 'position', 'scale'] as const;
type Channel = (typeof CHANNELS)[number];

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

/** Rounds to four decimals and turns `-0` into `0`, so subtraction noise stays out of files. */
function clean(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

function neg(value: number): number {
  return value === 0 ? 0 : -value;
}

function vec3(value: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (!Array.isArray(value)) return [...fallback];
  return [num(value[0], fallback[0]), num(value[1], fallback[1]), num(value[2], fallback[2])];
}

function allZero(v: readonly number[]): boolean {
  return v.every((n) => n === 0);
}

/**
 * Cleans a model name for ids: lower-case, characters outside `a-z0-9_.-` become `_`.
 *
 * @param raw - For example `Two Bones`.
 * @returns For example `two_bones`; `model` when nothing is left.
 */
export function cleanModelName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/_+/g, '_');
  return cleaned === '' ? 'model' : cleaned;
}

/** The major version of `meta.format_version`, or undefined when unreadable. */
function majorVersion(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const match = /^(\d+)(\.\d+)*$/.exec(raw.trim());
  return match ? Number(match[1]) : undefined;
}

// ---------------------------------------------------------------------------------------------
// Textures

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readTextures(raw: unknown, problems: Problem[]): BbmodelTexture[] {
  if (!Array.isArray(raw)) return [];
  const textures: BbmodelTexture[] = [];
  raw.forEach((entry, index) => {
    if (!isObj(entry)) return;
    const name = typeof entry.name === 'string' ? entry.name : `texture_${index}`;
    const source = entry.source;
    if (typeof source !== 'string' || !source.startsWith('data:')) {
      problems.push({
        severity: 'warning',
        code: 'blockbench.texture-not-embedded',
        message: `Texture "${name}" is not embedded in the .bbmodel file; import its PNG separately or save the project with the texture embedded.`,
      });
      return;
    }
    const match = /^data:image\/png;base64,(.*)$/s.exec(source);
    if (!match) {
      problems.push({
        severity: 'warning',
        code: 'blockbench.texture-not-png',
        message: `Texture "${name}" is not a base64 PNG data URL and was skipped.`,
      });
      return;
    }
    try {
      const bytes = decodeBase64(match[1] ?? '');
      const header = readPngHeader(bytes);
      textures.push({ index, name, bytes, width: header.width, height: header.height });
    } catch (error) {
      if (!(error instanceof PngFormatError) && !(error instanceof DOMException)) throw error;
      problems.push({
        severity: 'warning',
        code: 'blockbench.texture-invalid',
        message: `Texture "${name}" could not be decoded: ${error.message}`,
      });
    }
  });
  return textures;
}

// ---------------------------------------------------------------------------------------------
// Geometry


interface GeometryContext {
  boxUvDefault: boolean;
  cubes: Map<string, Obj>;
  usedCubes: Set<string>;
  groupFields: Map<string, Obj>;
  names: Set<string>;
  boneNameByUuid: Map<string, string>;
  bones: GeoBone[];
  problems: Problem[];
  bounds: { min: Vec3; max: Vec3; any: boolean };
}

function uniqueBoneName(ctx: GeometryContext, wanted: string): string {
  let name = wanted === '' ? 'bone' : wanted;
  if (ctx.names.has(name)) {
    let n = 2;
    while (ctx.names.has(`${name}_${n}`)) n++;
    const renamed = `${name}_${n}`;
    ctx.problems.push({
      severity: 'warning',
      code: 'blockbench.duplicate-bone-name',
      message: `Bone name "${name}" is used more than once; the later bone is renamed to "${renamed}".`,
    });
    name = renamed;
  }
  ctx.names.add(name);
  return name;
}

function expandBounds(ctx: GeometryContext, from: Vec3, to: Vec3, inflate: number): void {
  for (let axis = 0; axis < 3; axis++) {
    const lo = Math.min(from[axis] as number, to[axis] as number) - inflate;
    const hi = Math.max(from[axis] as number, to[axis] as number) + inflate;
    if (!ctx.bounds.any || lo < (ctx.bounds.min[axis] as number)) ctx.bounds.min[axis] = lo;
    if (!ctx.bounds.any || hi > (ctx.bounds.max[axis] as number)) ctx.bounds.max[axis] = hi;
  }
  ctx.bounds.any = true;
}

function compileFace(face: Obj, key: (typeof FACE_NAMES)[number]): GeoFaceUv | undefined {
  if (face.texture === null) return undefined;
  const raw = Array.isArray(face.uv) ? face.uv : [0, 0, 0, 0];
  const u1 = num(raw[0]);
  const v1 = num(raw[1]);
  const u2 = num(raw[2]);
  const v2 = num(raw[3]);
  let uv: [number, number] = [clean(u1), clean(v1)];
  let size: [number, number] = [clean(u2 - u1), clean(v2 - v1)];
  if (key === 'up' || key === 'down') {
    uv = [clean(u1 + size[0]), clean(v1 + size[1])];
    size = [neg(size[0]), neg(size[1])];
  }
  const result: GeoFaceUv = { uv, uv_size: size };
  const rotation = num(face.rotation);
  if (rotation !== 0) result.uv_rotation = rotation;
  return result;
}

function compileCube(ctx: GeometryContext, cube: Obj, boneMirror: boolean): GeoCube {
  const from = vec3(cube.from);
  const to = vec3(cube.to);
  const size: Vec3 = [clean(to[0] - from[0]), clean(to[1] - from[1]), clean(to[2] - from[2])];
  const inflate = num(cube.inflate);
  expandBounds(ctx, from, to, inflate);
  const result: GeoCube = {
    origin: [clean(neg(from[0] + size[0])), clean(from[1]), clean(from[2])],
    size,
    uv: [0, 0],
  };
  if (inflate !== 0) result.inflate = inflate;
  const rotation = vec3(cube.rotation);
  if (!allZero(rotation)) {
    const origin = vec3(cube.origin);
    result.pivot = [clean(neg(origin[0])), clean(origin[1]), clean(origin[2])];
    result.rotation = [neg(rotation[0]), neg(rotation[1]), rotation[2]];
  }
  const boxUv = typeof cube.box_uv === 'boolean' ? cube.box_uv : ctx.boxUvDefault;
  if (boxUv) {
    const offset = Array.isArray(cube.uv_offset) ? cube.uv_offset : [0, 0];
    result.uv = [num(offset[0]), num(offset[1])];
    const mirror = cube.mirror_uv === true;
    if (mirror !== boneMirror) result.mirror = mirror;
  } else {
    const faces: GeoFaceUvs = {};
    const rawFaces = isObj(cube.faces) ? cube.faces : {};
    for (const key of FACE_NAMES) {
      const face = rawFaces[key];
      if (!isObj(face)) continue;
      const compiled = compileFace(face, key);
      if (compiled) faces[key] = compiled;
    }
    result.uv = faces;
  }
  return result;
}

function cubeIncluded(ctx: GeometryContext, uuid: string): Obj | undefined {
  const cube = ctx.cubes.get(uuid);
  if (!cube || cube.export === false || ctx.usedCubes.has(uuid)) return undefined;
  ctx.usedCubes.add(uuid);
  return cube;
}

function compileGroup(
  ctx: GeometryContext,
  node: Obj,
  parent: string | undefined,
  boxUvProject: boolean,
): void {
  const uuid = typeof node.uuid === 'string' ? node.uuid : undefined;
  const fields: Obj = { ...(uuid ? (ctx.groupFields.get(uuid) ?? {}) : {}), ...node };
  if (fields.export === false) return;
  const name = uniqueBoneName(ctx, typeof fields.name === 'string' ? fields.name : 'bone');
  if (uuid) ctx.boneNameByUuid.set(uuid, name);
  const origin = vec3(fields.origin);
  const bone: GeoBone = { name, pivot: [0, 0, 0] };
  if (parent !== undefined) bone.parent = parent;
  bone.pivot = [clean(neg(origin[0])), clean(origin[1]), clean(origin[2])];
  const rotation = vec3(fields.rotation);
  if (!allZero(rotation)) bone.rotation = [neg(rotation[0]), neg(rotation[1]), rotation[2]];
  if (fields.reset === true) bone.reset = true;
  const mirror = fields.mirror_uv === true && boxUvProject;
  if (mirror) bone.mirror = true;
  ctx.bones.push(bone);
  const cubes: GeoCube[] = [];
  const childGroups: Obj[] = [];
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (typeof child === 'string') {
      const cube = cubeIncluded(ctx, child);
      if (cube) cubes.push(compileCube(ctx, cube, mirror));
    } else if (isObj(child)) {
      childGroups.push(child);
    }
  }
  if (cubes.length > 0) bone.cubes = cubes;
  for (const child of childGroups) compileGroup(ctx, child, name, boxUvProject);
}

function visibleBox(ctx: GeometryContext, saved: unknown): Vec3 {
  // Blockbench's calculateVisibleBox, without rotations: it grows the project's saved box.
  const base = vec3(saved, [1, 1, 0]);
  if (!ctx.bounds.any) return [base[0], base[1], base[2]];
  const { min, max } = ctx.bounds;
  const radius = Math.max(max[0], max[2], -min[0], -min[2]);
  const width = Math.max(Math.ceil((radius * 2) / 16), base[0]);
  const yMin = Math.min(Math.floor(min[1] / 16), base[2] - base[1] / 2);
  const yMax = Math.max(Math.ceil(max[1] / 16), base[2] + base[1] / 2);
  return [width, clean(yMax - yMin), clean((yMax + yMin) / 2)];
}

function convertGeometry(
  model: Obj,
  name: string,
  problems: Problem[],
): { geometry: GeoFile; boneNames: Map<string, string> } {
  const meta = isObj(model.meta) ? model.meta : {};
  const boxUvProject = meta.box_uv === true;
  const ctx: GeometryContext = {
    boxUvDefault: boxUvProject,
    cubes: new Map(),
    usedCubes: new Set(),
    groupFields: new Map(),
    names: new Set(),
    boneNameByUuid: new Map(),
    bones: [],
    problems,
    bounds: { min: [0, 0, 0], max: [0, 0, 0], any: false },
  };
  const elements = Array.isArray(model.elements) ? model.elements : [];
  const cubeOrder: string[] = [];
  const unsupported = new Map<string, number>();
  elements.forEach((element, index) => {
    if (!isObj(element)) return;
    const type = typeof element.type === 'string' ? element.type : 'cube';
    if (type !== 'cube') {
      unsupported.set(type, (unsupported.get(type) ?? 0) + 1);
      return;
    }
    const uuid = typeof element.uuid === 'string' ? element.uuid : `#${index}`;
    ctx.cubes.set(uuid, element);
    cubeOrder.push(uuid);
  });
  for (const [type, count] of unsupported) {
    problems.push({
      severity: 'warning',
      code: 'blockbench.unsupported-element',
      message: `${count} element(s) of type "${type}" were skipped; only cubes are converted.`,
    });
  }
  if (Array.isArray(model.groups)) {
    for (const group of model.groups) {
      if (isObj(group) && typeof group.uuid === 'string') ctx.groupFields.set(group.uuid, group);
    }
  }
  const outliner = Array.isArray(model.outliner) ? model.outliner : [];
  // Reserve top-level group names first so the catch bone for loose cubes never clashes.
  const looseCubes: string[] = [];
  const topGroups: Obj[] = [];
  for (const node of outliner) {
    if (typeof node === 'string') looseCubes.push(node);
    else if (isObj(node)) topGroups.push(node);
  }
  const groupNames = new Set<string>();
  const collect = (node: Obj): void => {
    const uuid = typeof node.uuid === 'string' ? node.uuid : undefined;
    const fields = { ...(uuid ? (ctx.groupFields.get(uuid) ?? {}) : {}), ...node };
    if (typeof fields.name === 'string') groupNames.add(fields.name);
    for (const child of Array.isArray(node.children) ? node.children : []) {
      if (isObj(child)) collect(child);
    }
  };
  topGroups.forEach(collect);
  let rootName = 'root';
  for (let n = 2; groupNames.has(rootName); n++) rootName = `root_${n}`;

  const rootIndex = ctx.bones.length;
  for (const group of topGroups) compileGroup(ctx, group, undefined, boxUvProject);
  // Loose cubes, and cubes the outliner does not reference, go under the catch bone.
  const catchCubes: GeoCube[] = [];
  for (const uuid of [...looseCubes, ...cubeOrder]) {
    const cube = cubeIncluded(ctx, uuid);
    if (cube) catchCubes.push(compileCube(ctx, cube, false));
  }
  if (catchCubes.length > 0) {
    ctx.names.add(rootName);
    ctx.bones.splice(rootIndex, 0, { name: rootName, pivot: [0, 0, 0], cubes: catchCubes });
  }

  const resolution = isObj(model.resolution) ? model.resolution : {};
  const box = visibleBox(ctx, model.visible_box);
  const description: GeoFile['minecraft:geometry'][number]['description'] = {
    identifier: `geometry.${name}`,
    texture_width: Math.max(1, Math.round(num(resolution.width, 16))),
    texture_height: Math.max(1, Math.round(num(resolution.height, 16))),
  };
  const bones = ctx.bones;
  if (bones.length > 0) {
    description.visible_bounds_width = box[0];
    description.visible_bounds_height = box[1];
    description.visible_bounds_offset = [0, box[2], 0];
  }
  const geometry: GeoFile['minecraft:geometry'][number] = { description };
  if (bones.length > 0) geometry.bones = bones;
  return {
    geometry: { format_version: GEO_FORMAT_VERSION, 'minecraft:geometry': [geometry] },
    boneNames: ctx.boneNameByUuid,
  };
}

// ---------------------------------------------------------------------------------------------
// Animations

/** A data point axis as a number or a Molang string (newlines removed). */
function axisValue(value: unknown): AxisValue {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const text = value.replace(/\n/g, '').trim();
  if (text === '') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

/** Negates a number or wraps a Molang expression as `-(expr)`. */
function invertAxis(value: AxisValue): AxisValue {
  if (typeof value === 'number') return neg(value);
  const inner = /^-\((.*)\)$/.exec(value);
  if (inner && balanced(inner[1] ?? '')) return inner[1] as string;
  return `-(${value})`;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

interface RawKeyframe {
  time: number;
  interpolation: string;
  points: KeyframeVec[];
}

function readKeyframe(raw: Obj): RawKeyframe {
  const points: KeyframeVec[] = [];
  for (const point of Array.isArray(raw.data_points) ? raw.data_points : []) {
    if (!isObj(point)) continue;
    points.push([axisValue(point.x), axisValue(point.y), axisValue(point.z)]);
  }
  if (points.length === 0) points.push([0, 0, 0]);
  return {
    time: num(raw.time),
    interpolation: typeof raw.interpolation === 'string' ? raw.interpolation : 'linear',
    points,
  };
}

function timecode(time: number): string {
  const text = String(clean(time));
  return text.includes('.') ? text : `${text}.0`;
}

function compileChannel(
  channel: Channel,
  keyframes: RawKeyframe[],
  flipSigns: boolean,
): ChannelKeyframes {
  const flip = (v: KeyframeVec): KeyframeVec => {
    if (!flipSigns || channel === 'scale') return [...v];
    if (channel === 'position') return [invertAxis(v[0]), v[1], v[2]];
    return [invertAxis(v[0]), invertAxis(v[1]), v[2]];
  };
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const result: ChannelKeyframes = {};
  sorted.forEach((kf, i) => {
    const previous = i > 0 ? sorted[i - 1] : undefined;
    const point = (k: RawKeyframe, n: number): KeyframeVec =>
      (k.points[n] ?? k.points[0]) as KeyframeVec;
    let value: KeyframeVec | KeyframeObject;
    if (kf.interpolation === 'catmullrom') {
      const includePre =
        (!previous && kf.time > 0) || (previous !== undefined && previous.interpolation !== 'catmullrom');
      const entry: KeyframeObject = {};
      if (includePre) entry.pre = flip(point(kf, 0));
      entry.post = flip(point(kf, includePre ? 1 : 0));
      entry.lerp_mode = 'catmullrom';
      value = entry;
    } else if (kf.points.length >= 2) {
      value = { pre: flip(point(kf, 0)), post: flip(point(kf, 1)) };
    } else if (previous?.interpolation === 'step') {
      value = { pre: flip(point(previous, 1)), post: flip(point(kf, 0)) };
    } else {
      value = flip(point(kf, 0));
    }
    result[timecode(kf.time)] = value;
  });
  return result;
}

function molangField(value: unknown): number | string | undefined {
  if (typeof value === 'number') return value === 0 ? undefined : value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  if (Number.isFinite(n)) return n === 0 ? undefined : n;
  return value.replace(/\n/g, '');
}

function convertAnimations(
  raw: unknown,
  boneNames: Map<string, string>,
  knownBones: Set<string>,
  flipSigns: boolean,
  problems: Problem[],
): AnimationFile | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const animations: Record<string, AnimationEntry> = {};
  raw.forEach((animation, index) => {
    if (!isObj(animation)) return;
    const name =
      typeof animation.name === 'string' && animation.name !== ''
        ? animation.name
        : `animation_${index}`;
    if (name in animations) {
      problems.push({
        severity: 'warning',
        code: 'blockbench.duplicate-animation',
        message: `Animation "${name}" appears more than once; the later one is kept.`,
      });
    }
    const entry: AnimationEntry = { bones: {} };
    const animators = isObj(animation.animators) ? animation.animators : {};
    let maxTime = 0;
    let skippedChannels = false;
    let bezier = false;
    for (const [uuid, animator] of Object.entries(animators)) {
      if (!isObj(animator)) continue;
      const keyframes = Array.isArray(animator.keyframes) ? animator.keyframes : [];
      if (keyframes.length === 0) continue;
      const type = typeof animator.type === 'string' ? animator.type : 'bone';
      if (type !== 'bone') {
        skippedChannels = true;
        continue;
      }
      const byChannel = new Map<Channel, RawKeyframe[]>();
      for (const kf of keyframes) {
        if (!isObj(kf)) continue;
        const channel = kf.channel;
        if (!CHANNELS.includes(channel as Channel)) {
          skippedChannels = true;
          continue;
        }
        const read = readKeyframe(kf);
        if (read.interpolation === 'bezier') bezier = true;
        maxTime = Math.max(maxTime, read.time);
        const list = byChannel.get(channel as Channel) ?? [];
        list.push(read);
        byChannel.set(channel as Channel, list);
      }
      if (byChannel.size === 0) continue;
      const boneName =
        boneNames.get(uuid) ?? (typeof animator.name === 'string' ? animator.name : uuid);
      if (!knownBones.has(boneName)) {
        problems.push({
          severity: 'warning',
          code: 'blockbench.unknown-animation-bone',
          message: `Animation "${name}" animates "${boneName}", which is not a bone of the model.`,
        });
      }
      const boneTag: BoneAnimation = entry.bones[boneName] ?? {};
      for (const channel of CHANNELS) {
        const list = byChannel.get(channel);
        if (list) boneTag[channel] = compileChannel(channel, list, flipSigns);
      }
      entry.bones[boneName] = boneTag;
    }
    if (skippedChannels) {
      problems.push({
        severity: 'info',
        code: 'blockbench.unsupported-channel',
        message: `Animation "${name}" has sound, particle or timeline keyframes; only rotation, position and scale are converted.`,
      });
    }
    if (bezier) {
      problems.push({
        severity: 'warning',
        code: 'blockbench.unsupported-interpolation',
        message: `Animation "${name}" uses bezier keyframes; they are written as linear keyframes.`,
      });
    }
    const loop = animation.loop;
    if (loop === 'hold') entry.loop = 'hold_on_last_frame';
    else if (loop === 'loop' || maxTime === 0) entry.loop = true;
    const length = num(animation.length);
    if (length > 0) entry.animation_length = clean(length);
    if (animation.override === true) entry.override_previous_animation = true;
    if (typeof animation.anim_time_update === 'string' && animation.anim_time_update.trim() !== '') {
      entry.anim_time_update = animation.anim_time_update.replace(/\n/g, '');
    }
    const blend = molangField(animation.blend_weight);
    if (blend !== undefined) entry.blend_weight = blend;
    const startDelay = molangField(animation.start_delay);
    if (startDelay !== undefined) entry.start_delay = startDelay;
    const loopDelay = molangField(animation.loop_delay);
    if (loopDelay !== undefined && entry.loop !== undefined) entry.loop_delay = loopDelay;
    animations[name] = entry;
  });
  if (Object.keys(animations).length === 0) return undefined;
  return { format_version: ANIMATION_FORMAT_VERSION, animations };
}

// ---------------------------------------------------------------------------------------------
// Entry point

/**
 * Converts a parsed `.bbmodel` project into a Bedrock geometry, an animation file and its
 * embedded textures. Never throws on malformed input: what cannot be read becomes a
 * `blockbench.*` problem.
 *
 * Problem codes: `blockbench.not-a-model` (error, not a project object),
 * `blockbench.unknown-format-version` (warning, `meta.format_version` not 4.x or 5.x; the
 * conversion continues), `blockbench.java-block-not-supported` (error, `java_block` format; no
 * output), `blockbench.unsupported-element`, `blockbench.texture-not-embedded`,
 * `blockbench.texture-not-png`, `blockbench.texture-invalid`, `blockbench.duplicate-bone-name`,
 * `blockbench.duplicate-animation`, `blockbench.unknown-animation-bone`,
 * `blockbench.unsupported-interpolation` (warnings) and `blockbench.unsupported-channel` (info).
 *
 * @param json - The parsed `.bbmodel` file.
 * @param options - See {@link ConvertBbmodelOptions}.
 * @returns See {@link BbmodelConversion}.
 */
export function convertBbmodel(json: unknown, options: ConvertBbmodelOptions = {}): BbmodelConversion {
  const problems: Problem[] = [];
  if (!isObj(json) || !isObj(json.meta)) {
    return {
      name: cleanModelName(options.name ?? 'model'),
      textures: [],
      problems: [
        {
          severity: 'error',
          code: 'blockbench.not-a-model',
          message: 'The file is not a Blockbench project: it has no "meta" object.',
        },
      ],
    };
  }
  const meta = json.meta;
  const rawName =
    options.name ??
    (typeof json.model_identifier === 'string' && json.model_identifier !== ''
      ? json.model_identifier
      : typeof json.name === 'string' && json.name !== ''
        ? json.name
        : 'model');
  const name = cleanModelName(rawName);

  const major = majorVersion(meta.format_version);
  if (major !== 4 && major !== 5) {
    problems.push({
      severity: 'warning',
      code: 'blockbench.unknown-format-version',
      message: `Blockbench project format ${JSON.stringify(meta.format_version ?? null)} is not 4.x or 5.x; the conversion continues but may be incomplete.`,
    });
  }
  if (meta.model_format === 'java_block') {
    problems.push({
      severity: 'error',
      code: 'blockbench.java-block-not-supported',
      message:
        'Java block and item .bbmodel files are not converted yet; use Blockbench\'s own "Export Block/Item Model" and import the JSON model instead.',
    });
    return { name, textures: [], problems };
  }
  // Keyframe orientation: 5.x (and anything newer or unversioned) stores Blockbench's own.
  const flipSigns = major === undefined || major >= 5;

  const { geometry, boneNames } = convertGeometry(json, name, problems);
  const knownBones = new Set((geometry['minecraft:geometry'][0]?.bones ?? []).map((b) => b.name));
  const animations = convertAnimations(json.animations, boneNames, knownBones, flipSigns, problems);
  const textures = readTextures(json.textures, problems);
  const result: BbmodelConversion = { name, geometry, textures, problems };
  if (animations) result.animations = animations;
  return result;
}
