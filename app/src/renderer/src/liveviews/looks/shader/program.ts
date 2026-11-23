/**
 * Linking a translated vertex and fragment shader and running the program on a picture (ADR 0121
 * D8; B629). Used inside the shader worker (`gl.worker.ts`) by the shader program's view and the
 * post effect chain (`../post/chain.ts`).
 *
 * A program runs only when every input it reads can be given: each `sampler2D` gets a picture,
 * each attribute is one of the full-screen square's (`Position`, `UV0`, `Color`, `Normal`), and
 * each uniform has a value from the file (a post pass's `uniforms`, a program's `uniforms`) or is
 * one of the values the game fills while playing that MSM stands in for ({@link STAND_IN_WORDS}).
 * Anything else is named and nothing is drawn, so the picture is never one the shader would
 * not make.
 */

import { type CompileResult, compileStage } from './compile';
import type { RgbaPicture } from './test-picture';
import type { LineOrigin } from './translate';

/** One translated stage as the worker gets it. */
export interface StageSource {
  /** The shader's id (`msm:post/sepia`). */
  readonly id: string;
  readonly stage: 'vertex' | 'fragment';
  readonly text: string;
  readonly lineMap: readonly number[];
  readonly origins: readonly LineOrigin[];
}

/** A linked program, or why not. */
export interface LinkAnswer {
  readonly vertex: CompileResult;
  readonly fragment: CompileResult;
  /** The linker's words when both stages compiled and the link failed. */
  readonly link: string | null;
  readonly program: WebGLProgram | null;
}

/** Compiles both stages and links them. Nothing is kept when a step fails. */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertex: StageSource,
  fragment: StageSource,
): LinkAnswer {
  const v = compileStage(gl, vertex.text, 'vertex', vertex.lineMap, vertex.origins);
  const f = compileStage(gl, fragment.text, 'fragment', fragment.lineMap, fragment.origins);
  const answers = { vertex: { ok: v.ok, lines: v.lines }, fragment: { ok: f.ok, lines: f.lines } };
  if (v.shader === null || f.shader === null) {
    gl.deleteShader(v.shader);
    gl.deleteShader(f.shader);
    return { ...answers, link: null, program: null };
  }
  const program = gl.createProgram();
  gl.attachShader(program, v.shader);
  gl.attachShader(program, f.shader);
  gl.linkProgram(program);
  gl.deleteShader(v.shader);
  gl.deleteShader(f.shader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const words = (gl.getProgramInfoLog(program) ?? '').trim() || 'The two shaders do not fit.';
    gl.deleteProgram(program);
    return { ...answers, link: words, program: null };
  }
  return { ...answers, link: null, program };
}

/** A value from a file: a number, a list, or a list of lists (a matrix). */
export type UniformJson = number | boolean | readonly UniformJson[];

/** The flat numbers of a value from a file. */
export function flatValues(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (typeof value === 'boolean') return [value ? 1 : 0];
  if (Array.isArray(value)) return value.flatMap(flatValues);
  return [];
}

/**
 * The members of each `uniform Block { ... }` declared in some shader texts, in the order
 * written (a post pass's values are matched to them by position, as the game does).
 */
export function blockMembersOf(texts: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const text of texts) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const block = /\buniform\s+(\w+)\s*\{([^}]*)\}/g;
    for (let match = block.exec(code); match !== null; match = block.exec(code)) {
      const name = match[1] as string;
      if (out.has(name)) continue;
      const members: string[] = [];
      for (const declaration of (match[2] as string).split(';')) {
        const words = declaration
          .replace(/\b(?:lowp|mediump|highp|layout\s*\([^)]*\))/g, ' ')
          .trim();
        if (words.length === 0) continue;
        const rest = words.replace(/^\S+\s+/, '');
        for (const part of rest.split(',')) {
          const member = /^\s*(\w+)/.exec(part)?.[1];
          if (member !== undefined) members.push(member);
        }
      }
      out.set(name, members);
    }
  }
  return out;
}

/**
 * Values the game fills itself while playing, which MSM stands in for on a still picture, in
 * plain words. Matrices are the identity (the picture is already the whole screen).
 */
export const STAND_IN_WORDS: Readonly<Record<string, string>> = {
  OutSize: 'the size of the picture drawn',
  InSize: 'the size of the picture read',
  ScreenSize: 'the size of the test picture',
  GameTime: '0 (the start of a day)',
  GlintAlpha: '1',
  CameraBlockPos: '0, 0, 0',
  CameraOffset: '0, 0, 0',
  MenuBlurRadius: '5 (the game’s usual menu blur)',
  UseRgss: '0',
  ProjMat: 'no change (identity)',
  ModelViewMat: 'no change (identity)',
  TextureMat: 'no change (identity)',
  ColorModulator: 'white (1, 1, 1, 1)',
  ModelOffset: '0, 0, 0',
};

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The sizes a stand-in needs. */
export interface StandInSizes {
  readonly out: readonly [number, number];
  readonly input: readonly [number, number];
  readonly screen: readonly [number, number];
}

/** The stand-in value of a member the game fills, or `undefined`. */
export function standInValue(name: string, sizes: StandInSizes): number[] | undefined {
  switch (name) {
    case 'OutSize':
      return [...sizes.out];
    case 'InSize':
      return [...sizes.input];
    case 'ScreenSize':
      return [...sizes.screen];
    case 'GameTime':
    case 'UseRgss':
      return [0];
    case 'GlintAlpha':
      return [1];
    case 'MenuBlurRadius':
      return [5];
    case 'CameraBlockPos':
    case 'CameraOffset':
    case 'ModelOffset':
      return [0, 0, 0];
    case 'ProjMat':
    case 'ModelViewMat':
    case 'TextureMat':
      return [...IDENTITY];
    case 'ColorModulator':
      return [1, 1, 1, 1];
    default:
      return undefined;
  }
}

/** Where the values of a run come from. */
export interface UniformValues {
  /** A post pass's values by block, matched to the block's members by position. */
  readonly byBlock?: Readonly<Record<string, readonly unknown[]>>;
  /** A program's values by uniform name. */
  readonly byName?: Readonly<Record<string, unknown>>;
}

interface TypeShape {
  readonly components: number;
  readonly columns: number;
  readonly int: boolean;
}

const GL_TYPES: Readonly<Record<number, TypeShape>> = {
  5126: { components: 1, columns: 1, int: false },
  35664: { components: 2, columns: 1, int: false },
  35665: { components: 3, columns: 1, int: false },
  35666: { components: 4, columns: 1, int: false },
  5124: { components: 1, columns: 1, int: true },
  35667: { components: 2, columns: 1, int: true },
  35668: { components: 3, columns: 1, int: true },
  35669: { components: 4, columns: 1, int: true },
  5125: { components: 1, columns: 1, int: true },
  36294: { components: 2, columns: 1, int: true },
  36295: { components: 3, columns: 1, int: true },
  36296: { components: 4, columns: 1, int: true },
  35670: { components: 1, columns: 1, int: true },
  35671: { components: 2, columns: 1, int: true },
  35672: { components: 3, columns: 1, int: true },
  35673: { components: 4, columns: 1, int: true },
  35674: { components: 2, columns: 2, int: false },
  35675: { components: 3, columns: 3, int: false },
  35676: { components: 4, columns: 4, int: false },
};

const SAMPLER_2D = 0x8b5e;
const SAMPLER_TYPES = new Set([
  0x8b5e, 0x8b5f, 0x8b60, 0x8dc1, 0x8b62, 0x8dc4, 0x8dc5, 0x8dca, 0x8dcb, 0x8dcc, 0x8dcf, 0x8dd2,
  0x8dd3, 0x8dd4, 0x8dd7,
]);

/** The member's own name (`Block.Name[0]` to `Name`). */
function bareName(name: string): string {
  return name.replace(/^.*\./, '').replace(/\[0\]$/, '');
}

/** What a program needs, read from the linked program. */
export interface ProgramNeeds {
  /** Sampler names (`InSampler`), in order, with whether each is a `sampler2D`. */
  readonly samplers: readonly { readonly name: string; readonly flat: boolean }[];
  /** Attribute names. */
  readonly attributes: readonly string[];
}

/** The samplers and attributes of a linked program. */
export function programNeeds(gl: WebGL2RenderingContext, program: WebGLProgram): ProgramNeeds {
  const samplers: { name: string; flat: boolean }[] = [];
  const count = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS));
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (info === null || !SAMPLER_TYPES.has(info.type)) continue;
    samplers.push({ name: bareName(info.name), flat: info.type === SAMPLER_2D });
  }
  const attributes: string[] = [];
  const attributeCount = Number(gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES));
  for (let index = 0; index < attributeCount; index += 1) {
    const info = gl.getActiveAttrib(program, index);
    if (info !== null && !info.name.startsWith('gl_')) attributes.push(info.name);
  }
  return { samplers, attributes };
}

/** The attributes the full-screen square gives. */
export const SQUARE_ATTRIBUTES: readonly string[] = ['Position', 'UV0', 'Color', 'Normal'];

/** A set of uniform values ready to apply before a draw. */
export interface PreparedUniforms {
  /** `Block.Member` or `Name` the run cannot give. */
  readonly missing: readonly string[];
  /** Stand-in names used. */
  readonly standIns: readonly string[];
  /** Applies them to the program (it must be in use). */
  apply(): void;
  /** Frees the buffers. */
  dispose(): void;
}

function writeValue(
  view: DataView,
  offset: number,
  shape: TypeShape,
  matrixStride: number,
  values: readonly number[],
): void {
  for (let column = 0; column < shape.columns; column += 1) {
    for (let row = 0; row < shape.components; row += 1) {
      const value = values[column * shape.components + row];
      if (value === undefined) continue;
      const at = offset + (shape.columns > 1 ? column * matrixStride : 0) + row * 4;
      if (at + 4 > view.byteLength) continue;
      if (shape.int) view.setInt32(at, Math.trunc(value), true);
      else view.setFloat32(at, value, true);
    }
  }
}

/**
 * Works out every uniform of a program from the values given and the stand-ins (see the module
 * comment); members the run cannot give are listed in `missing`.
 */
export function prepareUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  declared: ReadonlyMap<string, readonly string[]>,
  values: UniformValues,
  sizes: StandInSizes,
): PreparedUniforms {
  const missing: string[] = [];
  const standIns = new Set<string>();
  const buffers: { index: number; buffer: WebGLBuffer }[] = [];
  const plain: (() => void)[] = [];

  const lookup = (
    block: string | null,
    name: string,
  ): { values: number[]; standIn: boolean } | undefined => {
    if (block !== null && values.byBlock?.[block] !== undefined) {
      const position = (declared.get(block) ?? []).indexOf(name);
      const given = position < 0 ? undefined : values.byBlock[block]?.[position];
      if (given !== undefined) return { values: flatValues(given), standIn: false };
    }
    if (values.byName !== undefined && Object.hasOwn(values.byName, name)) {
      return { values: flatValues(values.byName[name]), standIn: false };
    }
    const standIn = standInValue(name, sizes);
    return standIn === undefined ? undefined : { values: standIn, standIn: true };
  };

  const blockCount = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS));
  for (let block = 0; block < blockCount; block += 1) {
    const blockName = gl.getActiveUniformBlockName(program, block) ?? `block ${block}`;
    const size = Number(
      gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_DATA_SIZE),
    );
    const indices = gl.getActiveUniformBlockParameter(
      program,
      block,
      gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES,
    ) as Uint32Array;
    const list = [...indices];
    const offsets = gl.getActiveUniforms(program, list, gl.UNIFORM_OFFSET) as number[];
    const arrayStrides = gl.getActiveUniforms(program, list, gl.UNIFORM_ARRAY_STRIDE) as number[];
    const matrixStrides = gl.getActiveUniforms(program, list, gl.UNIFORM_MATRIX_STRIDE) as number[];
    const data = new ArrayBuffer(Math.max(16, size));
    const view = new DataView(data);
    list.forEach((uniform, at) => {
      const info = gl.getActiveUniform(program, uniform);
      if (info === null) return;
      const name = bareName(info.name);
      const shape = GL_TYPES[info.type];
      const found = lookup(blockName, name);
      if (shape === undefined || found === undefined) {
        missing.push(`${blockName}.${name}`);
        return;
      }
      if (found.standIn) standIns.add(name);
      const per = shape.components * shape.columns;
      for (let element = 0; element < info.size; element += 1) {
        writeValue(
          view,
          (offsets[at] ?? 0) + element * (arrayStrides[at] ?? 0),
          shape,
          matrixStrides[at] ?? 16,
          found.values.slice(element * per, (element + 1) * per),
        );
      }
    });
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW);
    buffers.push({ index: block, buffer });
  }

  const count = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS));
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (info === null || SAMPLER_TYPES.has(info.type)) continue;
    const blockIndex = (
      gl.getActiveUniforms(program, [index], gl.UNIFORM_BLOCK_INDEX) as number[]
    )[0];
    if (blockIndex !== undefined && blockIndex >= 0) continue;
    const name = bareName(info.name);
    const shape = GL_TYPES[info.type];
    const found = lookup(null, name);
    const location = gl.getUniformLocation(program, info.name);
    if (shape === undefined || found === undefined) {
      missing.push(name);
      continue;
    }
    if (found.standIn) standIns.add(name);
    const numbers = found.values.slice(0, shape.components * shape.columns * info.size);
    while (numbers.length < shape.components * shape.columns * info.size) numbers.push(0);
    plain.push(() => {
      if (location === null) return;
      if (shape.columns === 4) gl.uniformMatrix4fv(location, false, numbers);
      else if (shape.columns === 3) gl.uniformMatrix3fv(location, false, numbers);
      else if (shape.columns === 2) gl.uniformMatrix2fv(location, false, numbers);
      else if (shape.int) {
        const ints = new Int32Array(numbers.map((n) => Math.trunc(n)));
        [gl.uniform1iv, gl.uniform2iv, gl.uniform3iv, gl.uniform4iv][shape.components - 1]?.call(
          gl,
          location,
          ints,
        );
      } else {
        [gl.uniform1fv, gl.uniform2fv, gl.uniform3fv, gl.uniform4fv][shape.components - 1]?.call(
          gl,
          location,
          numbers,
        );
      }
    });
  }

  return {
    missing,
    standIns: [...standIns].sort(),
    apply() {
      for (const { index, buffer } of buffers) {
        gl.uniformBlockBinding(program, index, index);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, index, buffer);
      }
      for (const set of plain) set();
    },
    dispose() {
      for (const { buffer } of buffers) gl.deleteBuffer(buffer);
    },
  };
}

/** A texture with a framebuffer, of a size. */
export interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

/** A new RGBA8 texture (with `pixels`, rows from the top, or cleared) and its framebuffer. */
export function makeTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  pixels: Uint8ClampedArray | null,
  clear: readonly [number, number, number, number] = [0, 0, 0, 0],
): Target {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels === null ? null : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
  );
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  setFilter(gl, texture, false);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (pixels === null) {
    gl.viewport(0, 0, width, height);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  // Leave no unit holding the new texture (a draw into it would read it back).
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { texture, framebuffer, width, height };
}

/** Frees a target. */
export function dropTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/** Sets a texture's filter (bilinear or nearest) and clamps it at the edges. */
export function setFilter(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  bilinear: boolean,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const filter = bilinear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** Reads a target back as a picture, rows from the top, fully opaque (as the screen shows it). */
export function readTarget(gl: WebGL2RenderingContext, target: Target): RgbaPicture {
  const { width, height } = target;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const data = new Uint8ClampedArray(raw.length);
  const row = width * 4;
  for (let y = 0; y < height; y += 1) {
    data.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  for (let at = 3; at < data.length; at += 4) data[at] = 255;
  return { width, height, data };
}

/** The full-screen square's data per attribute (two triangles), as the game's vertex formats name them. */
const SQUARE: Readonly<Record<string, { size: number; data: readonly number[] }>> = {
  Position: { size: 3, data: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0] },
  UV0: { size: 2, data: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1] },
};
const CONSTANT: Readonly<Record<string, readonly [number, number, number, number]>> = {
  Color: [1, 1, 1, 1],
  Normal: [0, 0, 1, 0],
};

/**
 * Draws the program into `output` over its whole size: the full-screen square when the program
 * reads attributes, else the game's full-screen triangle by vertex number (3 vertices, as the
 * post passes' `screenquad` and `screentriangle` expect). Answers the graphics' error, or `null`.
 */
export function drawFullScreen(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  attributes: readonly string[],
  output: Target,
): string | null {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffers: WebGLBuffer[] = [];
  for (const name of attributes) {
    const location = gl.getAttribLocation(program, name);
    if (location < 0) continue;
    const square = SQUARE[name];
    if (square !== undefined) {
      const buffer = gl.createBuffer();
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(square.data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, square.size, gl.FLOAT, false, 0, 0);
    } else {
      const value = CONSTANT[name] ?? [0, 0, 0, 1];
      gl.disableVertexAttribArray(location);
      gl.vertexAttrib4f(location, value[0], value[1], value[2], value[3]);
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
  gl.viewport(0, 0, output.width, output.height);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.drawArrays(gl.TRIANGLES, 0, attributes.length > 0 ? 6 : 3);
  const error = gl.getError();
  gl.bindVertexArray(null);
  gl.deleteVertexArray(vao);
  for (const buffer of buffers) gl.deleteBuffer(buffer);
  return error === gl.NO_ERROR ? null : `The graphics refused to draw (error ${error}).`;
}
