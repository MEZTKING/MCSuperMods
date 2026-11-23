/**
 * The shader worker's jobs and answers (ADR 0121 D8; B629): compile a shader program's two
 * stages and, where it may run, run it on MSM's test picture; or compile every pass of a post
 * effect and run the chain on the still frame. The host runs in `gl.worker.ts` on one
 * OffscreenCanvas WebGL 2 context; without one every answer is `webgl: false`, and the views
 * show what needs no graphics (the chain as a diagram, the translation's lines).
 */

import { type PassProgram, type PostChain, type PostRun, runPostChain } from '../post/chain';
import type { CompileResult } from './compile';
import {
  blockMembersOf,
  drawFullScreen,
  dropTarget,
  type LinkAnswer,
  linkProgram,
  makeTarget,
  prepareUniforms,
  programNeeds,
  readTarget,
  SQUARE_ATTRIBUTES,
  type StageSource,
  setFilter,
} from './program';
import { type RgbaPicture, testPicture } from './test-picture';

export type { StageSource };

/** A shader program to compile, and to run unless `compileOnly` says why not. */
export interface ProgramJob {
  readonly kind: 'program';
  readonly vertex: StageSource;
  readonly fragment: StageSource;
  /** The program file's uniform values by name. */
  readonly uniforms: Readonly<Record<string, unknown>>;
  /** Why the program is compiled but not run (a core shader of the game), or `null`. */
  readonly compileOnly: string | null;
}

/** A post effect: each pass's two stages (or `null` where a file is missing), and its pictures. */
export interface PostJob {
  readonly kind: 'post';
  readonly chain: PostChain;
  readonly passes: readonly ({ vertex: StageSource; fragment: StageSource } | null)[];
  readonly textures: Readonly<Record<string, RgbaPicture | null>>;
}

/** A job with its token. */
export type GlJob = (ProgramJob | PostJob) & { readonly token: number };

/** A program's compile, link and run. */
export interface StagesAnswer {
  readonly vertex: CompileResult;
  readonly fragment: CompileResult;
  readonly link: string | null;
}

/** A run on the test picture: before and after, or why not. */
export type PictureRun =
  | {
      readonly ran: true;
      readonly before: RgbaPicture;
      readonly after: RgbaPicture;
      readonly standIns: readonly string[];
      readonly gameTargets: readonly string[];
      readonly readsDepth: boolean;
      readonly blankTextures: readonly string[];
      readonly ms: number;
    }
  | { readonly ran: false; readonly reason: string };

/** The worker's answer. */
export type GlAnswer =
  | { readonly token: number; readonly webgl: false; readonly reason: string }
  | {
      readonly token: number;
      readonly webgl: true;
      readonly kind: 'program';
      readonly stages: StagesAnswer;
      readonly run: PictureRun;
    }
  | {
      readonly token: number;
      readonly webgl: true;
      readonly kind: 'post';
      /** Per pass: its compile and link, or `null` where a file is missing. */
      readonly passes: readonly (StagesAnswer | null)[];
      readonly run: PictureRun;
    };

/** Words for a missing WebGL 2. */
export const NO_WEBGL_WORDS =
  'This computer’s graphics cannot check shaders in the app (no WebGL 2 here).';

function stagesOf(link: LinkAnswer): StagesAnswer {
  return { vertex: link.vertex, fragment: link.fragment, link: link.link };
}

function runProgram(
  gl: WebGL2RenderingContext,
  job: ProgramJob,
  link: LinkAnswer,
  now: () => number,
): PictureRun {
  if (link.program === null) return { ran: false, reason: 'It did not compile.' };
  if (job.compileOnly !== null) return { ran: false, reason: job.compileOnly };
  const program = link.program;
  const needs = programNeeds(gl, program);
  const strange = needs.attributes.filter((name) => !SQUARE_ATTRIBUTES.includes(name));
  if (strange.length > 0) {
    return { ran: false, reason: `It reads ${strange.join(', ')} from the game’s vertex data.` };
  }
  const otherSamplers = needs.samplers.filter((sampler) => !sampler.flat);
  if (otherSamplers.length > 0) {
    return {
      ran: false,
      reason: `It reads ${otherSamplers.map((s) => s.name).join(', ')}, a picture kind only the game gives.`,
    };
  }
  const before = testPicture();
  const sizes = {
    out: [before.width, before.height] as const,
    input: [before.width, before.height] as const,
    screen: [before.width, before.height] as const,
  };
  const uniforms = prepareUniforms(
    gl,
    program,
    blockMembersOf([job.vertex.text, job.fragment.text]),
    { byName: job.uniforms },
    sizes,
  );
  if (uniforms.missing.length > 0) {
    uniforms.dispose();
    return {
      ran: false,
      reason: `It needs ${uniforms.missing.join(', ')}, which only the game gives.`,
    };
  }
  const started = now();
  const input = makeTarget(gl, before.width, before.height, before.data);
  const output = makeTarget(gl, before.width, before.height, null);
  try {
    gl.useProgram(program);
    needs.samplers.forEach((sampler, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      setFilter(gl, input.texture, false);
      const location = gl.getUniformLocation(program, sampler.name);
      if (location !== null) gl.uniform1i(location, unit);
    });
    uniforms.apply();
    const error = drawFullScreen(gl, program, needs.attributes, output);
    if (error !== null) return { ran: false, reason: error };
    const after = readTarget(gl, output);
    return {
      ran: true,
      before,
      after,
      standIns: uniforms.standIns,
      gameTargets: [],
      readsDepth: false,
      blankTextures: [],
      ms: Math.round(now() - started),
    };
  } finally {
    uniforms.dispose();
    dropTarget(gl, input);
    dropTarget(gl, output);
  }
}

/** Answers jobs on a context made by `context` (once, on the first job). */
export function createGlHost(
  context: () => WebGL2RenderingContext | null,
  now: () => number = () => performance.now(),
): (job: GlJob, cancel: { readonly cancelled: boolean }) => Promise<GlAnswer> {
  let gl: WebGL2RenderingContext | null | undefined;
  return async (job, cancel) => {
    if (gl === undefined) {
      try {
        gl = context();
      } catch {
        gl = null;
      }
    }
    if (gl === null || gl.isContextLost()) {
      return { token: job.token, webgl: false, reason: NO_WEBGL_WORDS };
    }
    const ctx = gl;
    if (job.kind === 'program') {
      const link = linkProgram(ctx, job.vertex, job.fragment);
      try {
        return {
          token: job.token,
          webgl: true,
          kind: 'program',
          stages: stagesOf(link),
          run: runProgram(ctx, job, link, now),
        };
      } finally {
        if (link.program !== null) ctx.deleteProgram(link.program);
      }
    }
    const links = job.passes.map((pass) =>
      pass === null ? null : linkProgram(ctx, pass.vertex, pass.fragment),
    );
    const programs = new Map<number, PassProgram>();
    links.forEach((link, index) => {
      const pass = job.passes[index];
      if (link?.program == null || pass == null) return;
      programs.set(index, {
        program: link.program,
        attributes: programNeeds(ctx, link.program).attributes,
        texts: [pass.vertex.text, pass.fragment.text],
      });
    });
    try {
      let run: PictureRun;
      if (programs.size !== job.chain.passes.length || job.chain.passes.length === 0) {
        run = {
          ran: false,
          reason:
            job.chain.passes.length === 0
              ? 'The effect has no passes.'
              : job.passes.some((pass) => pass === null)
                ? 'A shader file of a pass is missing, so nothing is drawn.'
                : 'Not every pass compiled, so nothing is drawn.',
        };
      } else {
        const before = testPicture();
        const result: PostRun = await runPostChain(ctx, job.chain, programs, before, cancel, {
          textures: new Map(Object.entries(job.textures)),
          now,
        });
        run = result.ok
          ? {
              ran: true,
              before,
              after: result.frame,
              standIns: result.standIns,
              gameTargets: result.gameTargets,
              readsDepth: result.readsDepth,
              blankTextures: result.blankTextures,
              ms: result.ms,
            }
          : { ran: false, reason: result.reason };
      }
      return {
        token: job.token,
        webgl: true,
        kind: 'post',
        passes: links.map((link) => (link === null ? null : stagesOf(link))),
        run,
      };
    } finally {
      for (const link of links) if (link?.program != null) ctx.deleteProgram(link.program);
    }
  };
}
