/**
 * A post effect's chain of passes and its run on a still frame (ADR 0121 D8; B629). Fields as
 * measured by the B619 spike (3S9): `targets` (name to `{width?, height?, persistent?,
 * clear_color?}`), `passes` (`vertex_shader`, `fragment_shader`, `inputs`, `output`,
 * `uniforms`), inputs that read a target (`target`, `sampler_name`, `use_depth_buffer?`,
 * `bilinear?`) or a picture (`location`, `sampler_name`, `width`, `height`, `bilinear?`), and
 * uniforms by block, each a list matched to the block's members in order.
 *
 * `runPostChain` runs in the shader worker on a WebGL 2 context. Every pass is checked before the
 * first one draws, so a chain the run cannot give every input to draws nothing.
 */

import type { Json } from '@msm/plugin-api';
import {
  blockMembersOf,
  drawFullScreen,
  dropTarget,
  makeTarget,
  type PreparedUniforms,
  prepareUniforms,
  readTarget,
  setFilter,
  type Target,
} from '../shader/program';
import type { RgbaPicture } from '../shader/test-picture';

/** The game's own screen target, which a chain reads and finally draws to. */
export const MAIN_TARGET = 'minecraft:main';

/** A target input or a texture input of a pass. */
export interface PostInput {
  /** `target` for a render target, `texture` for a picture. */
  type: 'target' | 'texture';
  /** The target's name (`minecraft:swap`) or the texture's location (`msm:noise`). */
  name: string;
  /** The sampler name; it binds as `<name>Sampler`. */
  samplerName: string;
  bilinear: boolean;
  /** A target input that reads the target's depth, not its colour. */
  useDepth?: boolean;
  /** A texture input's size, as the file states it. */
  width?: number;
  height?: number;
}

/** One uniform of a pass. */
export interface PostUniform {
  block: string;
  /** The written name, or `null` (since 1.21.6 names are optional: values go by position). */
  name: string | null;
  type: string;
  value: Json;
}

/** One pass. */
export interface PostPass {
  vertexShader: string;
  fragmentShader: string;
  inputs: PostInput[];
  output: string;
  uniforms: PostUniform[];
}

/** A named render target. */
export interface PostTarget {
  name: string;
  width?: number;
  height?: number;
  persistent: boolean;
  /** The colour a fresh target is filled with, 0 to 1 each. */
  clearColor?: [number, number, number, number];
}

/** The parsed effect. */
export interface PostChain {
  targets: PostTarget[];
  passes: PostPass[];
  /** What the file has that the view could not read, one plain line each. */
  problems: string[];
}

function isObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A target or shader name as the game reads it (`minecraft:` when none is written). */
export function fullName(name: string): string {
  return name.includes(':') ? name : `minecraft:${name}`;
}

/** An RGBA colour from the file (a list of four, or an `0xAARRGGBB` number), 0 to 1 each. */
function colourOf(value: Json | undefined): [number, number, number, number] | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b, a = 1] = value.map((v) => (typeof v === 'number' ? v : 0));
    return [r ?? 0, g ?? 0, b ?? 0, a];
  }
  if (typeof value === 'number') {
    const n = value >>> 0;
    return [
      ((n >>> 16) & 255) / 255,
      ((n >>> 8) & 255) / 255,
      (n & 255) / 255,
      ((n >>> 24) & 255) / 255,
    ];
  }
  return undefined;
}

/** Reads a post effect's JSON (see the module comment). */
export function parsePostEffect(json: Json): PostChain {
  const problems: string[] = [];
  const targets: PostTarget[] = [];
  const passes: PostPass[] = [];
  if (!isObject(json)) return { targets, passes, problems: ['The effect is not a JSON object.'] };
  const rawTargets = json.targets;
  if (isObject(rawTargets)) {
    for (const [name, raw] of Object.entries(rawTargets)) {
      const target: PostTarget = { name: fullName(name), persistent: false };
      if (isObject(raw)) {
        if (typeof raw.width === 'number') target.width = raw.width;
        if (typeof raw.height === 'number') target.height = raw.height;
        target.persistent = raw.persistent === true;
        const clear = colourOf(raw.clear_color);
        if (clear !== undefined) target.clearColor = clear;
      }
      targets.push(target);
    }
  } else if (rawTargets !== undefined) {
    problems.push('targets is written in an older form the view does not read.');
  }
  const rawPasses = Array.isArray(json.passes) ? json.passes : [];
  rawPasses.forEach((raw, index) => {
    if (!isObject(raw)) {
      problems.push(`Pass ${index + 1} is not an object.`);
      return;
    }
    const vertex = typeof raw.vertex_shader === 'string' ? raw.vertex_shader : '';
    const fragment = typeof raw.fragment_shader === 'string' ? raw.fragment_shader : '';
    if (vertex === '' || fragment === '') {
      problems.push(`Pass ${index + 1} names no vertex_shader or fragment_shader.`);
    }
    const inputs: PostInput[] = [];
    for (const input of Array.isArray(raw.inputs) ? raw.inputs : []) {
      if (!isObject(input)) continue;
      const samplerName = typeof input.sampler_name === 'string' ? input.sampler_name : '';
      const bilinear = input.bilinear === true;
      if (typeof input.target === 'string') {
        inputs.push({
          type: 'target',
          name: fullName(input.target),
          samplerName,
          bilinear,
          ...(input.use_depth_buffer === true ? { useDepth: true } : {}),
        });
      } else if (typeof input.location === 'string') {
        inputs.push({
          type: 'texture',
          name: fullName(input.location),
          samplerName,
          bilinear,
          ...(typeof input.width === 'number' ? { width: input.width } : {}),
          ...(typeof input.height === 'number' ? { height: input.height } : {}),
        });
      } else {
        problems.push(`An input of pass ${index + 1} names neither a target nor a location.`);
      }
    }
    const uniforms: PostUniform[] = [];
    if (isObject(raw.uniforms)) {
      for (const [block, list] of Object.entries(raw.uniforms)) {
        for (const value of Array.isArray(list) ? list : []) {
          if (!isObject(value)) continue;
          uniforms.push({
            block,
            name: typeof value.name === 'string' ? value.name : null,
            type: typeof value.type === 'string' ? value.type : '',
            value: value.value ?? null,
          });
        }
      }
    } else if (raw.uniforms !== undefined) {
      problems.push(`The uniforms of pass ${index + 1} are written in an older form.`);
    }
    passes.push({
      vertexShader: vertex === '' ? '' : fullName(vertex),
      fragmentShader: fragment === '' ? '' : fullName(fragment),
      inputs,
      output: typeof raw.output === 'string' ? fullName(raw.output) : MAIN_TARGET,
      uniforms,
    });
  });
  if (rawPasses.length === 0) problems.push('The effect has no passes.');
  return { targets, passes, problems };
}

/** The targets a chain reads or draws that it does not declare and the game fills (blank here). */
export function gameTargetsOf(chain: PostChain): string[] {
  const declared = new Set([MAIN_TARGET, ...chain.targets.map((target) => target.name)]);
  const out = new Set<string>();
  for (const pass of chain.passes) {
    for (const input of pass.inputs) {
      if (input.type === 'target' && !declared.has(input.name)) out.add(input.name);
    }
    if (!declared.has(pass.output)) out.add(pass.output);
  }
  return [...out].sort();
}

/** A pass's linked program as the run gets it. */
export interface PassProgram {
  readonly program: WebGLProgram;
  readonly attributes: readonly string[];
  /** The translated texts of both stages (the block members are read from them). */
  readonly texts: readonly string[];
}

/** The result of a run: the picture, or why not. */
export type PostRun =
  | {
      ok: true;
      frame: RgbaPicture;
      /** Targets the game fills (blank in this run). */
      gameTargets: string[];
      /** Whether a pass read a depth buffer (blank in this run). */
      readsDepth: boolean;
      /** Picture inputs the run had no picture for (blank). */
      blankTextures: string[];
      /** Stand-in names used ({@link STAND_IN_WORDS}). */
      standIns: string[];
      /** The time of the run in milliseconds. */
      ms: number;
    }
  | { ok: false; reason: string };

/** Options of a run. */
export interface PostRunOptions {
  /** The pictures of texture inputs by location, or `null` where none was found. */
  readonly textures?: ReadonlyMap<string, RgbaPicture | null>;
  /** The clock (tests). */
  readonly now?: () => number;
}

const MAX_TARGET = 4096;

function clampSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(MAX_TARGET, Math.round(value)));
}

/**
 * Runs the chain on a still frame. `programs` holds each pass's linked program by its index;
 * every pass must have one. Nothing is drawn when a pass lacks an input the run can give.
 */
export async function runPostChain(
  gl: WebGL2RenderingContext,
  chain: PostChain,
  programs: ReadonlyMap<number, PassProgram>,
  frame: RgbaPicture,
  cancel: { readonly cancelled: boolean },
  options: PostRunOptions = {},
): Promise<PostRun> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const { width, height } = frame;
  const sizeOf = (name: string): [number, number] => {
    const declared = chain.targets.find((target) => target.name === name);
    return [clampSize(declared?.width, width), clampSize(declared?.height, height)];
  };
  const gameTargets = gameTargetsOf(chain);
  const blankTextures: string[] = [];
  let readsDepth = false;

  // Check every pass before drawing anything.
  const prepared: { pass: PostPass; program: PassProgram; uniforms: PreparedUniforms }[] = [];
  const disposeAll = () => {
    for (const entry of prepared) entry.uniforms.dispose();
  };
  for (const [index, pass] of chain.passes.entries()) {
    const program = programs.get(index);
    if (program === undefined) {
      disposeAll();
      return { ok: false, reason: `Pass ${index + 1} has no program to run.` };
    }
    const firstInput = pass.inputs[0];
    const inputSize: [number, number] =
      firstInput === undefined
        ? [width, height]
        : firstInput.type === 'target'
          ? sizeOf(firstInput.name)
          : [clampSize(firstInput.width, 1), clampSize(firstInput.height, 1)];
    const byBlock: Record<string, unknown[]> = {};
    for (const uniform of pass.uniforms) {
      const list = byBlock[uniform.block] ?? [];
      list.push(uniform.value);
      byBlock[uniform.block] = list;
    }
    const uniforms = prepareUniforms(
      gl,
      program.program,
      blockMembersOf(program.texts),
      { byBlock },
      { out: sizeOf(pass.output), input: inputSize, screen: [width, height] },
    );
    prepared.push({ pass, program, uniforms });
    if (uniforms.missing.length > 0) {
      disposeAll();
      return {
        ok: false,
        reason: `Pass ${index + 1} needs ${uniforms.missing.join(', ')}, which only the game gives.`,
      };
    }
    const unknown = program.attributes.filter(
      (name) => !['Position', 'UV0', 'Color', 'Normal'].includes(name),
    );
    if (unknown.length > 0) {
      disposeAll();
      return {
        ok: false,
        reason: `Pass ${index + 1} reads ${unknown.join(', ')} from the game’s vertex data.`,
      };
    }
  }

  const targets = new Map<string, Target>();
  const textures = new Map<string, Target>();
  const blank = makeTarget(gl, 1, 1, null);
  const targetOf = (name: string): Target => {
    let target = targets.get(name);
    if (target === undefined) {
      const declared = chain.targets.find((entry) => entry.name === name);
      const [w, h] = sizeOf(name);
      target = makeTarget(gl, w, h, null, declared?.clearColor ?? [0, 0, 0, 0]);
      targets.set(name, target);
    }
    return target;
  };
  targets.set(MAIN_TARGET, makeTarget(gl, width, height, frame.data));
  const free = () => {
    disposeAll();
    for (const target of targets.values()) dropTarget(gl, target);
    for (const target of textures.values()) dropTarget(gl, target);
    dropTarget(gl, blank);
  };

  try {
    for (const [index, { pass, program, uniforms }] of prepared.entries()) {
      if (cancel.cancelled) {
        free();
        return { ok: false, reason: 'Stopped: the effect changed.' };
      }
      // Draw into a fresh target and put it in the output's place, so a pass may read the
      // target it writes (the game's swap does the same). Made before the inputs are bound.
      const old = targetOf(pass.output);
      const declared = chain.targets.find((entry) => entry.name === pass.output);
      const fresh = makeTarget(
        gl,
        old.width,
        old.height,
        null,
        declared?.clearColor ?? [0, 0, 0, 0],
      );
      gl.useProgram(program.program);
      let unit = 0;
      for (const input of pass.inputs) {
        // The unit first: a target made below leaves the active unit empty.
        gl.activeTexture(gl.TEXTURE0 + unit);
        let texture: WebGLTexture;
        if (input.type === 'texture') {
          let picture = textures.get(input.name);
          if (picture === undefined) {
            const given = options.textures?.get(input.name) ?? null;
            if (given === null) {
              if (!blankTextures.includes(input.name)) blankTextures.push(input.name);
              picture = blank;
            } else {
              picture = makeTarget(gl, given.width, given.height, given.data);
              textures.set(input.name, picture);
            }
          }
          texture = picture.texture;
        } else if (input.useDepth === true) {
          readsDepth = true;
          texture = blank.texture;
        } else {
          texture = targetOf(input.name).texture;
        }
        setFilter(gl, texture, input.bilinear);
        const location = gl.getUniformLocation(program.program, `${input.samplerName}Sampler`);
        if (location !== null) gl.uniform1i(location, unit);
        unit += 1;
      }
      uniforms.apply();
      const error = drawFullScreen(gl, program.program, program.attributes, fresh);
      if (error !== null) {
        dropTarget(gl, fresh);
        free();
        return { ok: false, reason: `Pass ${index + 1}: ${error}` };
      }
      dropTarget(gl, old);
      targets.set(pass.output, fresh);
      // Let a newer request in between passes (a long chain takes half a second under
      // SwiftShader): a message to the worker can set `cancel` only in a new task.
      if (index < prepared.length - 1) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const picture = readTarget(gl, targetOf(MAIN_TARGET));
    const standIns = [...new Set(prepared.flatMap((entry) => entry.uniforms.standIns))].sort();
    free();
    return {
      ok: true,
      frame: picture,
      gameTargets,
      readsDepth,
      blankTextures,
      standIns,
      ms: Math.round(now() - started),
    };
  } catch (error) {
    free();
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
