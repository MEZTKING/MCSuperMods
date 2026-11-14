/**
 * Particles in Try it's view (ADR 0085 D5, slice 2): the live particles of the test area and
 * the pass that draws them as camera-facing quads.
 *
 * - {@link ParticleField} holds the particles alive, at most {@link MAX_PARTICLES}; a new one
 *   past the cap pushes out the oldest. Each particle follows `particle-sim.ts`, the twin of the
 *   runtime's `ParticleLook` (frame, size, colour, alpha, roll and movement), read and never
 *   changed here. Collision is off: particles pass through blocks, as the Studio's preview.
 * - A project particle (`msm/<ns>/particle/<path>.json` in the lowered files) is drawn with its
 *   own frame pictures. Any other particle (a vanilla id such as `minecraft:flame`, an options
 *   object such as dust, or an id the project does not define) is a small neutral dot, with
 *   one "Only in Minecraft" line per id: no Mojang sprite sheet is read. Dust keeps its colour.
 * - Emission is seeded: the field draws lifetimes and random frames from the `random` it is
 *   given, so a test run is repeatable.
 * - {@link ParticlePass} is the WebGL pass: one small shader of its own, one texture per frame
 *   picture, cut-out particles with depth writes, see-through ones after them from far to near
 *   without. It leaves the GL state for `resetGlForDeepslate` to restore.
 *
 * No deepslate here; the pure part runs under happy-dom.
 */

import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { readJsonFile, type SimFiles, type SimLog, type SimOrigin } from '@msm/sim';
import {
  frame,
  lifetime,
  type ParticleSpec,
  resolveSpec,
  rgba,
  roll,
  size,
  step,
} from '../../studios/blocks-items/particle-sim';

/** The most particles alive at once (B394). */
export const MAX_PARTICLES = 500;

/** A particle to spawn: a particle type id, or a vanilla options object (`{ type, ... }`). */
export type ParticleRef = string | JsonObject;

/** Where a particle starts and how fast it moves, in blocks and blocks per tick. */
export interface ParticleSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly xd?: number;
  readonly yd?: number;
  readonly zd?: number;
}

/** Something that takes emitted particles: {@link ParticleField.emit} fits. */
export type ParticleSink = (particle: ParticleRef, at: ParticleSpawn, origin?: SimOrigin) => void;

/** How a particle type looks in the view. */
export interface ParticleLook {
  /** The type id, or `''` for an options object without a type. */
  readonly id: string;
  readonly spec: ParticleSpec;
  /** Frame sprite ids in order; empty for a dot. */
  readonly sprites: readonly string[];
  /** True for the neutral dot that stands in for a particle the view does not draw. */
  readonly dot: boolean;
}

/** One live particle, as the draw pass reads it. */
export interface LiveParticle {
  readonly look: ParticleLook;
  x: number;
  y: number;
  z: number;
  xd: number;
  yd: number;
  zd: number;
  /** The position one tick ago, for drawing between ticks. */
  px: number;
  py: number;
  pz: number;
  age: number;
  readonly life: number;
  readonly randomFrame: number;
}

/** The dot's look: a small light grey square that drifts with its velocity for a second. */
export const DOT_SPEC_DATA: JsonObject = Object.freeze({
  lifetime: 20,
  size: 0.06,
  color: 0xd8d8d8,
  collision: false,
}) as JsonObject;

const PARTICLE_PATH = /^msm\/([a-z0-9_.-]+)\/particle\/(.+)\.json$/;

/**
 * Where frame pictures live without target facts, as `particleSpritePath` of the blocks-items
 * plugin falls back (the target gives `particles.textureFolder` and `folders.resource.textures`).
 */
const FALLBACK_TEXTURES = 'textures';
const FALLBACK_PARTICLE_FOLDER = 'particle';

/** Whether `sprite` is a vanilla sprite (never read here: no Mojang sprite sheets). */
export function isVanillaSprite(sprite: string): boolean {
  return !sprite.includes(':') || sprite.startsWith('minecraft:');
}

/** Where a project sprite's picture lives, as lowering writes it; `undefined` for a bad id. */
export function spritePicturePath(
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined,
  sprite: string,
): { namespace: string; path: string; assetPath: string } | undefined {
  const colon = sprite.indexOf(':');
  const namespace = sprite.slice(0, colon);
  const name = sprite.slice(colon + 1);
  if (
    colon < 1 ||
    name === '' ||
    !/^[a-z0-9_.-]+$/.test(namespace) ||
    !/^[a-z0-9_./-]+$/.test(name)
  ) {
    return undefined;
  }
  const textures = target?.folders.resource.textures ?? FALLBACK_TEXTURES;
  const folder = target?.particles?.textureFolder ?? FALLBACK_PARTICLE_FOLDER;
  const path = `${textures}/${folder}/${name}.png`;
  return { namespace, path, assetPath: `assets/${namespace}/${path}` };
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unit = (value: number): number => Math.max(0, Math.min(1, value));

/** A dust colour as `0xRRGGBB`: an int, or `[r, g, b]` floats 0..1; `undefined` otherwise. */
export function dustColour(value: Json | undefined): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return value;
  }
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')) {
    const [r, g, b] = (value as number[]).map((n) => Math.round(unit(n) * 255)) as [
      number,
      number,
      number,
    ];
    return (r << 16) | (g << 8) | b;
  }
  return undefined;
}

/** Options of {@link ParticleField}. */
export interface ParticleFieldOptions {
  /** The project's lowered files; `msm/<ns>/particle/<path>.json` give the project's particles. */
  files: SimFiles;
  /** The target's folders and particle facts, for where frame pictures live. */
  target?: Pick<TargetFacts, 'particles' | 'folders'>;
  /** Where "Only in Minecraft" lines go (the "What happened" log). */
  log?: SimLog;
  /** A random source in [0, 1); seed it for tests ({@link seededRandom} in `tryit/ambient`). */
  random?: () => number;
  /** The cap; default {@link MAX_PARTICLES}. */
  cap?: number;
}

/** The live particles of the test area; see the module comment. */
export class ParticleField {
  private files: SimFiles;
  private readonly target: Pick<TargetFacts, 'particles' | 'folders'> | undefined;
  private readonly log: SimLog | undefined;
  private readonly random: () => number;
  private readonly cap: number;
  private looks = new Map<string, ParticleLook>();
  private readonly dots = new Map<string, ParticleLook>();
  private readonly said = new Set<string>();
  private live: LiveParticle[] = [];
  private emittedCount = 0;
  private droppedCount = 0;
  private revisionCount = 0;

  constructor(options: ParticleFieldOptions) {
    this.files = options.files;
    this.target = options.target;
    this.log = options.log;
    this.random = options.random ?? Math.random;
    this.cap = Math.max(1, Math.floor(options.cap ?? MAX_PARTICLES));
    this.readLooks();
  }

  /** New lowered files: the looks are read again; live particles keep the look they had. */
  setFiles(files: SimFiles): void {
    if (files === this.files) return;
    this.files = files;
    this.readLooks();
  }

  /** Grows each time the looks are read again (the draw pass reloads pictures on a change). */
  get revision(): number {
    return this.revisionCount;
  }

  /** The project's particle type ids, sorted. */
  projectParticles(): string[] {
    return [...this.looks.keys()].sort();
  }

  /** The particles alive now, oldest first. Read only. */
  particles(): readonly LiveParticle[] {
    return this.live;
  }

  /** How many particles are alive. */
  get size(): number {
    return this.live.length;
  }

  /** How many particles were emitted since the start or the last {@link clear}. */
  get emitted(): number {
    return this.emittedCount;
  }

  /** How many were pushed out by the cap since the start or the last {@link clear}. */
  get dropped(): number {
    return this.droppedCount;
  }

  /** Where a frame sprite's picture lives, or `undefined` for a vanilla sprite or a bad id. */
  spritePicture(
    sprite: string,
  ): { namespace: string; path: string; assetPath: string } | undefined {
    if (sprite === '' || isVanillaSprite(sprite)) return undefined;
    return spritePicturePath(this.target, sprite);
  }

  /** The look of a particle reference, saying once per id what the view cannot show. */
  lookFor(particle: ParticleRef, origin?: SimOrigin): ParticleLook {
    if (typeof particle === 'string') {
      const id = particle.includes(':') ? particle : `minecraft:${particle}`;
      const look = this.looks.get(id);
      if (look !== undefined) return look;
      return this.dot(id, undefined, origin);
    }
    const type = typeof particle.type === 'string' ? particle.type : '';
    const id = type === '' || type.includes(':') ? type : `minecraft:${type}`;
    const look = this.looks.get(id);
    if (look !== undefined) return look;
    return this.dot(id, id === 'minecraft:dust' ? dustColour(particle.color) : undefined, origin);
  }

  /**
   * Spawns one particle. With the field full, the oldest particle goes. Returns the particle.
   */
  emit(particle: ParticleRef, at: ParticleSpawn, origin?: SimOrigin): LiveParticle {
    const look = this.lookFor(particle, origin);
    const { spec } = look;
    if (!look.dot && spec.collision) {
      this.sayOnce(
        `collision:${look.id}`,
        `the particle ${look.id} stopping on blocks; here it passes through them`,
        origin,
      );
    }
    const life = lifetime(spec.lifetimeMin, spec.lifetimeMax, this.random());
    const frames = Math.max(1, look.sprites.length);
    const randomFrame = spec.animation === 'random' ? Math.floor(this.random() * frames) : 0;
    const live: LiveParticle = {
      look,
      x: at.x,
      y: at.y,
      z: at.z,
      xd: at.xd ?? 0,
      yd: at.yd ?? 0,
      zd: at.zd ?? 0,
      px: at.x,
      py: at.y,
      pz: at.z,
      age: 0,
      life,
      randomFrame,
    };
    this.live.push(live);
    this.emittedCount += 1;
    if (this.live.length > this.cap) {
      const over = this.live.length - this.cap;
      this.live.splice(0, over);
      this.droppedCount += over;
    }
    return live;
  }

  /** {@link emit} as a {@link ParticleSink}, bound to this field. */
  readonly sink: ParticleSink = (particle, at, origin) => {
    this.emit(particle, at, origin);
  };

  /** One game tick: every particle moves (no collision) and ages; the old ones go. */
  tick(): void {
    const next: LiveParticle[] = [];
    for (const particle of this.live) {
      const moved = step(particle, particle.look.spec);
      particle.px = particle.x;
      particle.py = particle.y;
      particle.pz = particle.z;
      particle.x = moved.x;
      particle.y = moved.y;
      particle.z = moved.z;
      particle.xd = moved.xd;
      particle.yd = moved.yd;
      particle.zd = moved.zd;
      particle.age += 1;
      if (particle.age < particle.life) next.push(particle);
    }
    this.live = next;
  }

  /** Removes every particle ("Clear the area"); the counts start again. */
  clear(): void {
    this.live = [];
    this.emittedCount = 0;
    this.droppedCount = 0;
  }

  private readLooks(): void {
    const looks = new Map<string, ParticleLook>();
    for (const path of [...this.files.keys()].sort()) {
      const match = PARTICLE_PATH.exec(path);
      if (match === null) continue;
      const id = `${match[1]}:${match[2]}`;
      const definition = readJsonFile(this.files, path);
      const spec = resolveSpec(isObject(definition) ? definition : undefined);
      const textures = isObject(definition) ? definition.textures : undefined;
      const sprites = Array.isArray(textures)
        ? textures.map((sprite) => (typeof sprite === 'string' ? sprite : ''))
        : [];
      looks.set(id, Object.freeze({ id, spec, sprites: Object.freeze(sprites), dot: false }));
    }
    this.looks = looks;
    this.revisionCount += 1;
  }

  /** Says a line once per key. */
  sayOnce(key: string, what: string, origin?: SimOrigin): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.log?.onlyInMinecraft(what, origin);
  }

  private dot(id: string, colour: number | undefined, origin?: SimOrigin): ParticleLook {
    const key = `${id}|${colour ?? ''}`;
    const known = this.dots.get(key);
    if (known === undefined) {
      const spec = resolveSpec(
        colour === undefined ? DOT_SPEC_DATA : { ...DOT_SPEC_DATA, color: colour },
      );
      this.dots.set(key, Object.freeze({ id, spec, sprites: Object.freeze([]), dot: true }));
    }
    this.sayOnce(`dot:${id}`, dotWords(id, this.files), origin);
    return this.dots.get(key) as ParticleLook;
  }
}

/** The "Only in Minecraft" words for a particle the view shows as a dot. */
export function dotWords(id: string, files?: SimFiles): string {
  if (id === '') return 'a particle with no type; the preview shows a small dot';
  if (id.startsWith('minecraft:')) {
    return `how the vanilla particle ${id} looks; the preview shows a small dot`;
  }
  const [namespace] = id.split(':');
  const ownNamespace =
    files !== undefined && [...files.keys()].some((path) => path.startsWith(`msm/${namespace}/`));
  return ownNamespace
    ? `the particle ${id}, which the project does not define; the preview shows a small dot`
    : `the particle ${id} of another mod; the preview shows a small dot`;
}

// Drawing ---------------------------------------------------------------------------------

/** One quad the draw pass will draw: its corners come from the camera. */
export interface ParticleQuad {
  /** The centre, between ticks. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Half the square's width, in blocks. */
  readonly half: number;
  readonly roll: number;
  readonly rgba: readonly [number, number, number, number];
  /** The frame picture's sprite id, or `null` for a plain square (a dot or a missing picture). */
  readonly sprite: string | null;
  readonly translucent: boolean;
  readonly dot: boolean;
}

/** The quads of the field's particles at `alpha` (0..1) between the last tick and the next. */
export function particleQuads(particles: readonly LiveParticle[], alpha: number): ParticleQuad[] {
  const t = unit(alpha);
  const out: ParticleQuad[] = [];
  for (const particle of particles) {
    const { spec, sprites } = particle.look;
    const index = frame(spec, particle.age, particle.life, sprites.length, particle.randomFrame);
    const colour = rgba(spec, particle.age, particle.life);
    if (colour[3] <= 0) continue;
    out.push({
      x: particle.px + (particle.x - particle.px) * t,
      y: particle.py + (particle.y - particle.py) * t,
      z: particle.pz + (particle.z - particle.pz) * t,
      half: size(spec, particle.age, particle.life, t),
      roll: roll(spec, particle.age),
      rgba: colour,
      sprite: sprites[index] ?? null,
      translucent: spec.translucent,
      dot: particle.look.dot,
    });
  }
  return out;
}

/** The camera's right and up vectors in the world, from a view matrix (column-major). */
export function cameraAxes(view: ArrayLike<number>): {
  right: [number, number, number];
  up: [number, number, number];
} {
  return {
    right: [view[0] as number, view[4] as number, view[8] as number],
    up: [view[1] as number, view[5] as number, view[9] as number],
  };
}

/** Floats per vertex in {@link QuadBatch}: position 3, texture 2, colour 4. */
export const FLOATS_PER_VERTEX = 9;

/**
 * Writes the six vertices (two triangles) of a camera-facing square into `out` at `offset`.
 * Returns the next offset.
 */
export function writeBillboard(
  out: Float32Array,
  offset: number,
  quad: Pick<ParticleQuad, 'x' | 'y' | 'z' | 'half' | 'roll' | 'rgba'>,
  axes: ReturnType<typeof cameraAxes>,
): number {
  const cos = Math.cos(quad.roll);
  const sin = Math.sin(quad.roll);
  const { right, up } = axes;
  // The rolled axes, scaled by half the width.
  const rx = (right[0] * cos + up[0] * sin) * quad.half;
  const ry = (right[1] * cos + up[1] * sin) * quad.half;
  const rz = (right[2] * cos + up[2] * sin) * quad.half;
  const ux = (up[0] * cos - right[0] * sin) * quad.half;
  const uy = (up[1] * cos - right[1] * sin) * quad.half;
  const uz = (up[2] * cos - right[2] * sin) * quad.half;
  const corners: [number, number, number, number][] = [
    [-1, -1, 0, 1],
    [1, -1, 1, 1],
    [1, 1, 1, 0],
    [-1, -1, 0, 1],
    [1, 1, 1, 0],
    [-1, 1, 0, 0],
  ];
  let at = offset;
  for (const [sx, sy, u, v] of corners) {
    out[at] = quad.x + sx * rx + sy * ux;
    out[at + 1] = quad.y + sx * ry + sy * uy;
    out[at + 2] = quad.z + sx * rz + sy * uz;
    out[at + 3] = u;
    out[at + 4] = v;
    out[at + 5] = quad.rgba[0];
    out[at + 6] = quad.rgba[1];
    out[at + 7] = quad.rgba[2];
    out[at + 8] = quad.rgba[3];
    at += FLOATS_PER_VERTEX;
  }
  return at;
}

const VERTEX_SHADER = `
attribute vec3 aPos;
attribute vec2 aTex;
attribute vec4 aColor;
uniform mat4 uClip;
varying vec2 vTex;
varying vec4 vColor;
void main() {
  vTex = aTex;
  vColor = aColor;
  gl_Position = uClip * vec4(aPos, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexture;
uniform float uCutout;
varying vec2 vTex;
varying vec4 vColor;
void main() {
  vec4 color = texture2D(uTexture, vTex) * vColor;
  if (color.a < uCutout) discard;
  gl_FragColor = color;
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('Try it could not make a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Try it's particle shader did not compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** A texture of RGBA pixels with nearest filtering and clamped edges. */
export function pixelTexture(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  pixels: Uint8Array | TexImageSource,
): WebGLTexture {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('Try it could not make a texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (pixels instanceof Uint8Array) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/** The dot's picture: an 8 by 8 white disc, so a dot reads as a dot and not as a picture. */
export function dotPixels(): Uint8Array {
  const pixels = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const dx = x - 3.5;
      const dy = y - 3.5;
      const at = (y * 8 + x) * 4;
      pixels[at] = 255;
      pixels[at + 1] = 255;
      pixels[at + 2] = 255;
      pixels[at + 3] = dx * dx + dy * dy <= 13 ? 255 : 0;
    }
  }
  return pixels;
}

/** One draw call's worth of quads: a texture and the vertices that use it. */
export interface QuadRun {
  texture: WebGLTexture;
  /** First vertex and vertex count in the batch. */
  first: number;
  count: number;
  /** Alpha below which pixels are dropped (cut-out); 0 for see-through. */
  cutout: number;
  /** Whether the run writes depth. */
  depthWrite: boolean;
}

/**
 * The shader, buffer and plain textures Try it's own passes (particles, portals) share: draws
 * runs of textured, coloured triangles with the given clip matrix. Leaves face culling off,
 * blending on and its attributes enabled; `resetGlForDeepslate` puts deepslate's state back.
 */
export class QuadBatch {
  readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly aPos: number;
  private readonly aTex: number;
  private readonly aColor: number;
  private readonly uClip: WebGLUniformLocation | null;
  private readonly uCutout: WebGLUniformLocation | null;
  private readonly uTexture: WebGLUniformLocation | null;
  /** A 1 by 1 white texture: a plain square in the vertex colour. */
  readonly white: WebGLTexture;
  /** The dot's disc. */
  readonly dot: WebGLTexture;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (program === null || buffer === null)
      throw new Error('Try it could not make its particle pass.');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Try it's particle shader did not link: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.buffer = buffer;
    this.aPos = gl.getAttribLocation(program, 'aPos');
    this.aTex = gl.getAttribLocation(program, 'aTex');
    this.aColor = gl.getAttribLocation(program, 'aColor');
    this.uClip = gl.getUniformLocation(program, 'uClip');
    this.uCutout = gl.getUniformLocation(program, 'uCutout');
    this.uTexture = gl.getUniformLocation(program, 'uTexture');
    this.white = pixelTexture(gl, 1, 1, new Uint8Array([255, 255, 255, 255]));
    this.dot = pixelTexture(gl, 8, 8, dotPixels());
  }

  /** Draws `runs` over `vertices` (`FLOATS_PER_VERTEX` floats each) with `clip`. */
  draw(clip: ArrayLike<number>, vertices: Float32Array, runs: readonly QuadRun[]): void {
    if (runs.length === 0) return;
    const { gl } = this;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aTex);
    gl.vertexAttribPointer(this.aTex, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 20);
    gl.uniformMatrix4fv(
      this.uClip,
      false,
      clip instanceof Float32Array ? clip : Float32Array.from(clip),
    );
    gl.uniform1i(this.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    for (const run of runs) {
      gl.depthMask(run.depthWrite);
      gl.uniform1f(this.uCutout, run.cutout);
      gl.bindTexture(gl.TEXTURE_2D, run.texture);
      gl.drawArrays(gl.TRIANGLES, run.first, run.count);
    }
    gl.depthMask(true);
    gl.disableVertexAttribArray(this.aPos);
    gl.disableVertexAttribArray(this.aTex);
    gl.disableVertexAttribArray(this.aColor);
  }

  dispose(): void {
    const { gl } = this;
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.white);
    gl.deleteTexture(this.dot);
  }
}

/** Where the draw pass reads frame pictures from. */
export interface ParticlePictureSource {
  files: SimFiles;
  readProjectAsset?: (namespace: string, path: string) => Promise<Uint8Array | null>;
}

/** Turns PNG bytes into something `texImage2D` takes; `null` when they do not decode. */
export type DecodePicture = (bytes: Uint8Array) => Promise<TexImageSource | null>;

const defaultDecode: DecodePicture = async (bytes) => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch {
    return null;
  }
};

/** Reads the bytes of a project picture: the lowered files first, then the project. */
export async function readPicture(
  source: ParticlePictureSource,
  picture: { namespace: string; path: string; assetPath: string },
): Promise<Uint8Array | null> {
  const lowered = source.files.get(picture.assetPath);
  if (lowered instanceof Uint8Array) return lowered;
  if (source.readProjectAsset === undefined) return null;
  return source.readProjectAsset(picture.namespace, picture.path).catch(() => null);
}

/**
 * Try it's particle pass: loads each frame picture once into a texture (a missing picture
 * draws a plain square in the particle's colour, said once), then draws the field.
 */
export class ParticlePass {
  private readonly batch: QuadBatch;
  private readonly textures = new Map<string, WebGLTexture | null>();
  private readonly loading = new Set<string>();
  private source: ParticlePictureSource;
  private revision = -1;
  private vertices = new Float32Array(MAX_PARTICLES * 6 * FLOATS_PER_VERTEX);
  private readonly decode: DecodePicture;
  private generation = 0;

  constructor(
    batch: QuadBatch,
    source: ParticlePictureSource,
    decode: DecodePicture = defaultDecode,
  ) {
    this.batch = batch;
    this.source = source;
    this.decode = decode;
  }

  /**
   * The current files and reader. New files, or a new look revision of the field, load every
   * picture again; a new reader function alone does not.
   */
  setSource(source: ParticlePictureSource, revision: number): void {
    const before = this.source;
    this.source = source;
    if (source.files === before.files && revision === this.revision) return;
    this.revision = revision;
    this.generation += 1;
    for (const texture of this.textures.values()) {
      if (texture !== null) this.batch.gl.deleteTexture(texture);
    }
    this.textures.clear();
    this.loading.clear();
  }

  private textureFor(field: ParticleField, sprite: string): WebGLTexture | null {
    if (this.textures.has(sprite)) return this.textures.get(sprite) ?? null;
    if (this.loading.has(sprite)) return null;
    const picture = field.spritePicture(sprite);
    if (picture === undefined) {
      this.textures.set(sprite, null);
      if (isVanillaSprite(sprite)) {
        field.sayOnce(
          `sprite:${sprite}`,
          `the vanilla particle picture ${sprite}; the preview draws a plain square`,
        );
      }
      return null;
    }
    this.loading.add(sprite);
    const generation = this.generation;
    void readPicture(this.source, picture)
      .then((bytes) => (bytes === null ? null : this.decode(bytes)))
      .then((image) => {
        if (generation !== this.generation) return;
        this.loading.delete(sprite);
        if (image === null) {
          this.textures.set(sprite, null);
          field.sayOnce(
            `sprite:${sprite}`,
            `the particle picture ${sprite}, which is missing; the preview draws a plain square`,
          );
          return;
        }
        this.textures.set(sprite, pixelTexture(this.batch.gl, 0, 0, image));
      })
      .catch(() => {
        if (generation === this.generation) this.loading.delete(sprite);
      });
    return null;
  }

  /**
   * Draws the field's particles at `alpha` between ticks. `view` is the camera's view matrix,
   * `clip` projection times view. Returns how many particles were drawn.
   */
  draw(
    field: ParticleField,
    alpha: number,
    view: ArrayLike<number>,
    clip: ArrayLike<number>,
    eye: { x: number; y: number; z: number },
  ): number {
    const quads = particleQuads(field.particles(), alpha);
    if (quads.length === 0) return 0;
    const needed = quads.length * 6 * FLOATS_PER_VERTEX;
    if (this.vertices.length < needed) this.vertices = new Float32Array(needed);
    const axes = cameraAxes(view);
    const textureOf = (quad: ParticleQuad): WebGLTexture => {
      if (quad.dot) return this.batch.dot;
      if (quad.sprite === null) return this.batch.white;
      return this.textureFor(field, quad.sprite) ?? this.batch.white;
    };
    const distance = (quad: ParticleQuad): number =>
      (quad.x - eye.x) ** 2 + (quad.y - eye.y) ** 2 + (quad.z - eye.z) ** 2;
    const cutout = quads.filter((quad) => !quad.translucent);
    const seeThrough = quads
      .filter((quad) => quad.translucent)
      .map((quad) => ({ quad, distance: distance(quad) }))
      .sort((a, b) => b.distance - a.distance)
      .map(({ quad }) => quad);
    const runs: QuadRun[] = [];
    let offset = 0;
    const add = (list: readonly ParticleQuad[], translucent: boolean): void => {
      for (const quad of list) {
        const texture = textureOf(quad);
        const first = offset / FLOATS_PER_VERTEX;
        offset = writeBillboard(this.vertices, offset, quad, axes);
        const last = runs[runs.length - 1];
        if (last !== undefined && last.texture === texture && last.depthWrite === !translucent) {
          last.count += 6;
        } else {
          runs.push({
            texture,
            first,
            count: 6,
            cutout: translucent ? 0.004 : 0.1,
            depthWrite: !translucent,
          });
        }
      }
    };
    add(cutout, false);
    add(seeThrough, true);
    this.batch.draw(clip, this.vertices.subarray(0, offset), runs);
    return quads.length;
  }

  dispose(): void {
    this.generation += 1;
    for (const texture of this.textures.values()) {
      if (texture !== null) this.batch.gl.deleteTexture(texture);
    }
    this.textures.clear();
  }
}
