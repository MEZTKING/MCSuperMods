/**
 * A post effect's chain of passes and its run on a still frame (ADR 0121 D8; B620 interface,
 * B629 builds it). Fields as measured by the B619 spike (3S9).
 */

import type { Json } from '@msm/plugin-api';

/** A target input or a texture input of a pass. */
export interface PostInput {
  /** `target` for a render target, `texture` for a picture. */
  type: 'target' | 'texture';
  /** The target's name or the texture's location. */
  name: string;
  /** The sampler name; it binds as `<name>Sampler`. */
  samplerName: string;
  bilinear: boolean;
}

/** One uniform of a pass. */
export interface PostUniform {
  block: string;
  name: string;
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
}

/** The parsed effect. */
export interface PostChain {
  targets: PostTarget[];
  passes: PostPass[];
}

/** Reads a post effect's JSON. Until B629 it answers an empty chain. */
export function parsePostEffect(_json: Json): PostChain {
  return { targets: [], passes: [] };
}

/** The result of a run: the picture, or why not. */
export type PostRun = { ok: true; frame: ImageData } | { ok: false; reason: string };

/** Runs the chain on a still frame. Until B629 it answers that it is not built. */
export async function runPostChain(
  _gl: unknown,
  _chain: PostChain,
  _programs: ReadonlyMap<string, unknown>,
  _frame: ImageData,
  _cancel: { readonly cancelled: boolean },
): Promise<PostRun> {
  return { ok: false, reason: 'not built yet' };
}
