/**
 * Mobs in Try it's view (ADR 0085 D5, slice 2, B395): the project's mobs drawn with the geo
 * preview's own baker and renderer, in the view's WebGL context.
 *
 * - {@link MobField} is what the owner of the area holds: the entity catalogue, the latest
 *   snapshots from `EntityWorld.step()` and the log. It is pure (no WebGL), so it runs under
 *   happy-dom; the view reads it every frame.
 * - {@link MobPass} draws the field. Each look (geo model, texture and animation set) is baked
 *   once through `preview/geo/geometry.ts` and drawn through `preview/geo/renderer.ts`, one
 *   renderer per look shared by every mob that has it; a new map of lowered files bakes a look
 *   again only when its model or animation file changed, and uploads its texture again only
 *   when the picture's bytes changed.
 * - Positions are drawn between ticks (`previousPosition` to `position` by the partial tick);
 *   the facing turns smoothly to the snapshot's yaw. A mob plays its `walk` animation (`fly`
 *   for flyers) while `walking`, else `idle`, each from its own start, as the geo preview plays
 *   them (linear keyframes; Molang as 0).
 * - Above each mob near the player a name plate gives its name and the label
 *   {@link MOB_PLATE_LABEL} (ADR 0085 D7: mobs only wander here).
 * - A mob without a geo model (no `msm:animated_model`, or a model the lowered files do not
 *   hold) is drawn as a plain box of its hitbox, with one log line.
 *
 * The view draws mobs after the blocks and before the portal and particle passes, with the
 * depth buffer kept; the geo renderer turns face culling off, so the frame ends with
 * `resetGlForDeepslate` (B385, B394).
 *
 * Models are found where GeckoLib reads them (`assets/<ns>/geckolib/models/<path>.geo.json` and
 * `assets/<ns>/geckolib/animations/<path>.animation.json`, ADR 0029 D2), the same layout the
 * models-anim plugin lowers to; the app may not import the plugin's internals.
 */

import type { CatalogueEntity, EntitySnapshot, SimFiles, SimLog, SimOrigin, Vec3 } from '@msm/sim';
import { readJsonFile } from '@msm/sim';
import { mat4 } from 'gl-matrix';
import {
  type BakedModel,
  type BonePose,
  bakeGeometry,
  boneMatrices,
} from '../../preview/geo/geometry';
import {
  type ParsedAnimation,
  parseAnimations,
  playbackTime,
  samplePose,
} from '../../preview/geo/keyframes';
import { createGeoRenderer, type GeoRenderer } from '../../preview/geo/renderer';
import { normaliseId } from '../../preview/model-chain';
import { boxInFrustum } from './camera';
import {
  cameraAxes,
  FLOATS_PER_VERTEX,
  pixelTexture,
  type QuadBatch,
  type QuadRun,
} from './particles';
import { type PortalPictureSource, readTexture } from './portal';

/** The label on every mob's name plate (ADR 0085 D7). */
export const MOB_PLATE_LABEL = 'wanders only in the preview';
/** Name plates show for mobs within this many blocks of the eye. */
export const PLATE_RANGE = 24;
/** Model units per block (Bedrock geometry). */
export const UNITS_PER_BLOCK = 16;
/** How long the drawn facing takes to close about two thirds of a turn, in milliseconds. */
export const TURN_MS = 90;
/** The colour of a mob drawn as a box (MSM's own, not a Minecraft look). */
export const MOB_BOX_RGBA: readonly [number, number, number, number] = [0.78, 0.52, 0.36, 1];
/** The hitbox of a mob the catalogue does not know, in blocks. */
const UNKNOWN_SIZE = { width: 0.6, height: 1.8 } as const;

/** The part of the entity catalogue the view reads. */
export interface MobCatalogue {
  get(id: string): CatalogueEntity | undefined;
}

/** Options of {@link MobField}. */
export interface MobFieldOptions {
  /** The project's mobs (`buildEntityCatalogue`). */
  catalogue: MobCatalogue;
  /** Where log lines go (the "What happened" log). */
  log?: SimLog;
}

/** The mobs the view draws; see the module comment. */
export class MobField {
  private catalogue: MobCatalogue;
  private readonly log: SimLog | undefined;
  private live: readonly EntitySnapshot[] = [];
  private readonly said = new Set<string>();
  private revisionCount = 0;

  constructor(options: MobFieldOptions) {
    this.catalogue = options.catalogue;
    this.log = options.log;
  }

  /** The snapshots of the last tick (`EntityWorld.step()`). */
  update(snapshots: readonly EntitySnapshot[]): void {
    this.live = snapshots;
  }

  /** A new catalogue after an edit: the looks are worked out again. */
  setCatalogue(catalogue: MobCatalogue): void {
    if (catalogue === this.catalogue) return;
    this.catalogue = catalogue;
    this.revisionCount += 1;
  }

  /** Grows each time the catalogue changes. */
  get revision(): number {
    return this.revisionCount;
  }

  /** No mobs ("Clear the area"). */
  clear(): void {
    this.live = [];
  }

  /** The mobs of the last tick. */
  snapshots(): readonly EntitySnapshot[] {
    return this.live;
  }

  /** How many mobs there are. */
  get size(): number {
    return this.live.length;
  }

  /** The catalogue's entry for an entity type. */
  entity(type: string): CatalogueEntity | undefined {
    return this.catalogue.get(type);
  }

  /** Writes a line once per key for the field's life ("Only in Minecraft" or plain). */
  sayOnce(key: string, what: string, options: { origin?: SimOrigin; plain?: boolean } = {}): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    if (options.plain === true) this.log?.info(what, options.origin);
    else this.log?.onlyInMinecraft(what, options.origin);
  }
}

const splitId = (id: string): { namespace: string; path: string } => {
  const full = normaliseId(id);
  const colon = full.indexOf(':');
  return { namespace: full.slice(0, colon), path: full.slice(colon + 1) };
};

/** Where a geo model lowers to (GeckoLib's layout, ADR 0029 D2). */
export function geoModelFile(id: string): string {
  const { namespace, path } = splitId(id);
  return `assets/${namespace}/geckolib/models/${path}.geo.json`;
}

/** Where an animation set lowers to (GeckoLib's layout, ADR 0029 D2). */
export function animationFile(id: string): string {
  const { namespace, path } = splitId(id);
  return `assets/${namespace}/geckolib/animations/${path}.animation.json`;
}

/**
 * The animation a mob plays: `walk` while walking (`fly` first for flyers, then `walk`), else
 * `idle`; a missing walking animation falls back to `idle`. `undefined` when none is named.
 */
export function animationNameFor(
  entity: Pick<CatalogueEntity, 'mode' | 'model'> | undefined,
  walking: boolean,
): string | undefined {
  const model = entity?.model;
  if (model === undefined) return undefined;
  if (walking) {
    const moving = entity?.mode === 'fly' ? (model.fly ?? model.walk) : model.walk;
    if (moving !== undefined) return moving;
  }
  return model.idle;
}

/** The feet between the last two ticks, `alpha` 0..1 of the way. */
export function interpolatedPosition(snapshot: EntitySnapshot, alpha: number): Vec3 {
  const a = Math.min(1, Math.max(0, alpha));
  const { position: p, previousPosition: q } = snapshot;
  return { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a, z: q.z + (p.z - q.z) * a };
}

/** Turns a drawn yaw (degrees) towards the target the short way, by the time that passed. */
export function turnTowards(current: number, target: number, elapsedMs: number): number {
  const diff = ((((target - current) % 360) + 540) % 360) - 180;
  const share = 1 - Math.exp(-Math.max(0, elapsedMs) / TURN_MS);
  const next = current + diff * share;
  return Math.abs(target - next) < 1e-6 ? target : next;
}

/**
 * The model's root matrix: at the feet, turned to the yaw (simulation degrees: 0 faces +z, 90
 * faces -x; Bedrock models face -z, so the turn is 180 - yaw as the game's renderers do), scaled
 * from model units to blocks.
 */
export function mobRootMatrix(feet: Vec3, yaw: number, scale: number, out = mat4.create()): mat4 {
  mat4.fromTranslation(out, [feet.x, feet.y, feet.z]);
  mat4.rotateY(out, out, ((180 - yaw) * Math.PI) / 180);
  const factor = scale / UNITS_PER_BLOCK;
  mat4.scale(out, out, [factor, factor, factor]);
  return out;
}

/** Shading of a box's faces, so its sides read in a flat colour: up, down, then the sides. */
const BOX_SHADE = { up: 1, down: 0.5, x: 0.8, z: 0.65 } as const;

/**
 * Writes the 36 vertices of an axis-aligned box from its feet centre (the hitbox of a mob
 * without a model) into `out` at `offset`. Returns the next offset.
 */
export function writeMobBox(
  out: Float32Array,
  offset: number,
  feet: Vec3,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number] = MOB_BOX_RGBA,
): number {
  const h = width / 2;
  const x0 = feet.x - h;
  const x1 = feet.x + h;
  const y0 = feet.y;
  const y1 = feet.y + height;
  const z0 = feet.z - h;
  const z1 = feet.z + h;
  const faces: [number, Vec3[]][] = [
    [BOX_SHADE.up, [p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)]],
    [BOX_SHADE.down, [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)]],
    [BOX_SHADE.x, [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)]],
    [BOX_SHADE.x, [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)]],
    [BOX_SHADE.z, [p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)]],
    [BOX_SHADE.z, [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)]],
  ];
  let at = offset;
  for (const [shade, corners] of faces) {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const c = corners[index] as Vec3;
      out[at] = c.x;
      out[at + 1] = c.y;
      out[at + 2] = c.z;
      out[at + 3] = 0.5;
      out[at + 4] = 0.5;
      out[at + 5] = rgba[0] * shade;
      out[at + 6] = rgba[1] * shade;
      out[at + 7] = rgba[2] * shade;
      out[at + 8] = rgba[3];
      at += FLOATS_PER_VERTEX;
    }
  }
  return at;
}

function p(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/**
 * Writes a camera-facing rectangle (a name plate) centred at `centre`, `halfWidth` by
 * `halfHeight` blocks, into `out` at `offset`. Returns the next offset.
 */
export function writePlate(
  out: Float32Array,
  offset: number,
  centre: Vec3,
  halfWidth: number,
  halfHeight: number,
  axes: ReturnType<typeof cameraAxes>,
): number {
  const { right, up } = axes;
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
    out[at] = centre.x + sx * right[0] * halfWidth + sy * up[0] * halfHeight;
    out[at + 1] = centre.y + sx * right[1] * halfWidth + sy * up[1] * halfHeight;
    out[at + 2] = centre.z + sx * right[2] * halfWidth + sy * up[2] * halfHeight;
    out[at + 3] = u;
    out[at + 4] = v;
    out[at + 5] = 1;
    out[at + 6] = 1;
    out[at + 7] = 1;
    out[at + 8] = 1;
    at += FLOATS_PER_VERTEX;
  }
  return at;
}

/** A name plate's picture and its size in blocks. */
export interface PlatePicture {
  image: TexImageSource;
  /** Width and height in blocks. */
  width: number;
  height: number;
}

/** Draws a name plate picture: the mob's name over the label; `null` without a 2D canvas. */
export type MakePlate = (name: string, label: string) => PlatePicture | null;

/** Blocks per pixel of a plate picture. */
const PLATE_BLOCKS_PER_PIXEL = 1 / 96;

const defaultMakePlate: MakePlate = (name, label) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }
  if (context === null || typeof context.measureText !== 'function') return null;
  const nameFont = 'bold 22px sans-serif';
  const labelFont = '16px sans-serif';
  context.font = nameFont;
  const nameWidth = context.measureText(name).width;
  context.font = labelFont;
  const labelWidth = context.measureText(label).width;
  const width = Math.ceil(Math.max(nameWidth, labelWidth) + 16);
  const height = 52;
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = 'rgba(0, 0, 0, 0.45)';
  context.fillRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = nameFont;
  context.fillStyle = '#ffffff';
  context.fillText(name, width / 2, 16);
  context.font = labelFont;
  context.fillStyle = '#e8d9a8';
  context.fillText(label, width / 2, 38);
  return {
    image: canvas,
    width: width * PLATE_BLOCKS_PER_PIXEL,
    height: height * PLATE_BLOCKS_PER_PIXEL,
  };
};

/** Decodes PNG bytes for `texImage2D`; `null` when they do not decode. */
export type DecodeMobPicture = (bytes: Uint8Array) => Promise<TexImageSource | null>;

const defaultDecode: DecodeMobPicture = async (bytes) => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch {
    return null;
  }
};

/** Makes a geo renderer for a baked model and its picture (the geo preview's own). */
export type MakeGeoRenderer = (
  gl: WebGLRenderingContext,
  model: BakedModel,
  image: TexImageSource | null,
) => GeoRenderer;

/** The geo grid is drawn with no extent (B385): the view has its own floor. */
const defaultMakeRenderer: MakeGeoRenderer = (gl, model, image) =>
  createGeoRenderer(gl, model, image, { extent: 0, cell: 1 });

/** One look: a model, its picture and its animations, baked and ready to draw. */
interface Look {
  /** The model and animation files it was baked from (baked again when either changes). */
  geoSource: string | Uint8Array | undefined;
  animationSource: string | Uint8Array | undefined;
  model: BakedModel | null;
  animations: Map<string, ParsedAnimation>;
  /** The picture's bytes and decoded image (`null` draws the missing-texture pattern). */
  textureBytes: Uint8Array | null;
  image: TexImageSource | null;
  /** True once the picture has been read at least once. */
  textureReady: boolean;
  /** The files the picture was last read for; new files read it again. */
  textureFiles: SimFiles | null;
  textureLoading: boolean;
  /** Bumped on each read, so a late read is dropped. */
  generation: number;
  renderer: GeoRenderer | null;
}

/** Per-mob drawing state: the animation playing, since when, and the drawn facing. */
interface MobState {
  animation: string | undefined;
  startedMs: number;
  yaw: number;
  seen: number;
}

/** What a frame of the mob pass needs from the view. */
export interface MobFrame {
  projection: mat4;
  view: mat4;
  /** Projection times view, for the boxes and plates. */
  clip: mat4;
  /** The frustum planes (`frustumPlanes`); mobs wholly outside are not drawn. */
  planes: Float32Array;
  eye: Vec3;
  /** The partial tick, 0..1. */
  alpha: number;
  /** Milliseconds drawn so far (animation time) and since the last frame. */
  nowMs: number;
  elapsedMs: number;
}

/** What the mob pass drew in a frame. */
export interface MobFrameStats {
  /** Mobs drawn with their model. */
  models: number;
  /** Mobs drawn as a box. */
  boxes: number;
  /** Name plates drawn. */
  plates: number;
}

/** Test hooks and options of {@link MobPass}. */
export interface MobPassOptions {
  decode?: DecodeMobPicture;
  makeRenderer?: MakeGeoRenderer;
  makePlate?: MakePlate;
}

const sameBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean => {
  if (a === b) return true;
  if (a === null || b === null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

const lookKey = (model: NonNullable<CatalogueEntity['model']>): string =>
  `${normaliseId(model.model)}|${normaliseId(model.texture)}|${
    model.animations === undefined ? '' : normaliseId(model.animations)
  }`;

/** Try it's mob pass; see the module comment. */
export class MobPass {
  private readonly batch: Pick<QuadBatch, 'gl' | 'white' | 'draw'>;
  private source: PortalPictureSource;
  private readonly decode: DecodeMobPicture;
  private readonly makeRenderer: MakeGeoRenderer;
  private readonly makePlate: MakePlate;
  private readonly looks = new Map<string, Look>();
  private readonly states = new Map<number, MobState>();
  private readonly plates = new Map<
    string,
    { texture: WebGLTexture; picture: PlatePicture } | null
  >();
  private frameNumber = 0;
  private vertices = new Float32Array(64 * 36 * FLOATS_PER_VERTEX);
  private readonly root = mat4.create();
  private disposed = false;

  constructor(
    batch: Pick<QuadBatch, 'gl' | 'white' | 'draw'>,
    source: PortalPictureSource,
    options: MobPassOptions = {},
  ) {
    this.batch = batch;
    this.source = source;
    this.decode = options.decode ?? defaultDecode;
    this.makeRenderer = options.makeRenderer ?? defaultMakeRenderer;
    this.makePlate = options.makePlate ?? defaultMakePlate;
  }

  /** The current lowered files and readers; looks whose files changed are baked again. */
  setSource(source: PortalPictureSource): void {
    this.source = source;
  }

  /** How many looks are baked (for tests). */
  get lookCount(): number {
    return this.looks.size;
  }

  /** The look of an entity, baked or re-baked as needed; `null` draws a box. */
  private lookFor(field: MobField, entity: CatalogueEntity): Look | null {
    const model = entity.model;
    const origin = entity.origin;
    if (model === undefined) {
      field.sayOnce(
        `mob-box:${entity.id}`,
        `how ${entity.displayName} looks (it has no geo model); the preview draws it as a box`,
        { origin },
      );
      return null;
    }
    const files = this.source.files;
    const geoPath = geoModelFile(model.model);
    const geoSource = files.get(geoPath);
    if (geoSource === undefined) {
      field.sayOnce(
        `mob-model:${entity.id}:${model.model}`,
        `${entity.displayName}'s model ${normaliseId(model.model)} is not in the project; the preview draws it as a box`,
        { origin, plain: true },
      );
      return null;
    }
    const animationSource =
      model.animations === undefined ? undefined : files.get(animationFile(model.animations));
    if (model.animations !== undefined && animationSource === undefined) {
      field.sayOnce(
        `mob-animations:${entity.id}:${model.animations}`,
        `${entity.displayName}'s animations ${normaliseId(model.animations)} are not in the project; it stands still`,
        { origin, plain: true },
      );
    }
    const key = lookKey(model);
    let look = this.looks.get(key);
    if (look === undefined) {
      look = {
        geoSource: undefined,
        animationSource: undefined,
        model: null,
        animations: new Map(),
        textureBytes: null,
        image: null,
        textureReady: false,
        textureFiles: null,
        textureLoading: false,
        generation: 0,
        renderer: null,
      };
      this.looks.set(key, look);
    }
    if (look.model === null || look.geoSource !== geoSource) {
      look.geoSource = geoSource;
      look.model = bakeGeometry(readJsonFile(files, geoPath));
      const problem = look.model.problems[0];
      if (problem !== undefined) {
        field.sayOnce(
          `mob-problem:${key}:${problem}`,
          `${entity.displayName}'s model is drawn in part: ${problem}`,
          { origin, plain: true },
        );
      }
      this.remakeRenderer(look);
    }
    if (look.animationSource !== animationSource) {
      look.animationSource = animationSource;
      look.animations = new Map();
      if (model.animations !== undefined && animationSource !== undefined) {
        const data = readJsonFile(files, animationFile(model.animations));
        for (const animation of parseAnimations(data)) {
          look.animations.set(animation.name, animation);
        }
      }
    }
    if (look.textureFiles !== files && !look.textureLoading) this.loadTexture(field, entity, look);
    return look;
  }

  /** Reads the look's picture for the current files; different bytes make a new renderer. */
  private loadTexture(field: MobField, entity: CatalogueEntity, look: Look): void {
    const model = entity.model;
    if (model === undefined) return;
    const files = this.source.files;
    look.textureLoading = true;
    look.generation += 1;
    const generation = look.generation;
    const current = (): boolean => !this.disposed && generation === look.generation;
    void readTexture(this.source, normaliseId(model.texture))
      .catch(() => null)
      .then(async (bytes) => {
        if (!current()) return;
        if (look.textureReady && sameBytes(bytes, look.textureBytes)) {
          look.textureFiles = files;
          look.textureLoading = false;
          return;
        }
        const image = bytes === null ? null : await this.decode(bytes).catch(() => null);
        if (!current()) {
          closeImage(image);
          return;
        }
        if (image === null) {
          field.sayOnce(
            `mob-texture:${entity.id}:${model.texture}`,
            `${entity.displayName}'s texture ${normaliseId(model.texture)} is missing; it is drawn with the missing-texture pattern`,
            { origin: entity.origin, plain: true },
          );
        }
        if (look.image !== image) closeImage(look.image);
        look.textureBytes = bytes;
        look.image = image;
        look.textureReady = true;
        look.textureFiles = files;
        look.textureLoading = false;
        this.remakeRenderer(look);
      });
  }

  /** Makes the look's renderer again from its model and picture, once the picture is read. */
  private remakeRenderer(look: Look): void {
    look.renderer?.dispose();
    look.renderer =
      look.model !== null && look.textureReady
        ? this.makeRenderer(this.batch.gl, look.model, look.image)
        : null;
  }

  private plateFor(entity: { id: string; displayName: string }) {
    if (this.plates.has(entity.displayName)) return this.plates.get(entity.displayName) ?? null;
    const picture = this.makePlate(entity.displayName, MOB_PLATE_LABEL);
    const plate =
      picture === null
        ? null
        : { texture: pixelTexture(this.batch.gl, 0, 0, picture.image), picture };
    this.plates.set(entity.displayName, plate);
    return plate;
  }

  /** Draws the field's mobs; see the module comment. */
  draw(field: MobField, frame: MobFrame): MobFrameStats {
    const stats: MobFrameStats = { models: 0, boxes: 0, plates: 0 };
    this.frameNumber += 1;
    const snapshots = field.snapshots();
    const boxes: { feet: Vec3; width: number; height: number }[] = [];
    const plates: {
      centre: Vec3;
      plate: { texture: WebGLTexture; picture: PlatePicture };
      distance: number;
    }[] = [];
    for (const snapshot of snapshots) {
      const entity = field.entity(snapshot.type);
      if (entity === undefined) {
        field.sayOnce(
          `mob-unknown:${snapshot.type}`,
          `the mob ${snapshot.type}, which the project does not define; the preview draws it as a box`,
        );
      }
      const width = entity?.width ?? UNKNOWN_SIZE.width;
      const height = entity?.height ?? UNKNOWN_SIZE.height;
      const feet = interpolatedPosition(snapshot, frame.alpha);
      let state = this.states.get(snapshot.id);
      if (state === undefined) {
        state = { animation: undefined, startedMs: frame.nowMs, yaw: snapshot.yaw, seen: 0 };
        this.states.set(snapshot.id, state);
      }
      state.seen = this.frameNumber;
      state.yaw = turnTowards(state.yaw, snapshot.yaw, frame.elapsedMs);
      const animationName = animationNameFor(entity, snapshot.walking === true);
      if (animationName !== state.animation) {
        state.animation = animationName;
        state.startedMs = frame.nowMs;
      }
      const scale = entity?.model?.scale ?? 1;
      // A margin of a block around the hitbox: models may reach past it.
      const margin = 1 + Math.max(0, scale - 1) * Math.max(width, height);
      const inView = boxInFrustum(
        frame.planes,
        feet.x - width / 2 - margin,
        feet.y - margin,
        feet.z - width / 2 - margin,
        feet.x + width / 2 + margin,
        feet.y + height + margin,
        feet.z + width / 2 + margin,
      );
      if (!inView) continue;
      const look = entity === undefined ? null : this.lookFor(field, entity);
      if (look === null) {
        boxes.push({ feet, width, height });
        stats.boxes += 1;
      } else if (look.renderer !== null && look.model !== null) {
        let pose: ReadonlyMap<string, BonePose> = new Map();
        const animation =
          state.animation === undefined ? undefined : look.animations.get(state.animation);
        if (state.animation !== undefined && animation === undefined && look.animations.size > 0) {
          field.sayOnce(
            `mob-animation:${entity?.id}:${state.animation}`,
            `${entity?.displayName}'s animation "${state.animation}" is not in its animation set; it stands still`,
            { ...(entity === undefined ? {} : { origin: entity.origin }), plain: true },
          );
        }
        if (animation !== undefined) {
          const at = playbackTime(animation, (frame.nowMs - state.startedMs) / 1000);
          if (!at.rest) pose = samplePose(animation, at.time);
        }
        mobRootMatrix(feet, state.yaw, scale, this.root);
        look.renderer.draw(frame.projection, frame.view, boneMatrices(look.model, pose, this.root));
        stats.models += 1;
      }
      const distance = Math.hypot(
        feet.x - frame.eye.x,
        feet.y + height - frame.eye.y,
        feet.z - frame.eye.z,
      );
      if (distance <= PLATE_RANGE) {
        const plate = this.plateFor(entity ?? { id: snapshot.type, displayName: snapshot.type });
        if (plate !== null) {
          plates.push({
            centre: { x: feet.x, y: feet.y + height + 0.3 + plate.picture.height / 2, z: feet.z },
            plate,
            distance,
          });
        }
      }
    }
    // Forget mobs that are gone.
    for (const [id, state] of this.states)
      if (state.seen !== this.frameNumber) this.states.delete(id);
    this.drawQuads(frame, boxes, plates);
    stats.plates = plates.length;
    return stats;
  }

  private drawQuads(
    frame: MobFrame,
    boxes: readonly { feet: Vec3; width: number; height: number }[],
    plates: {
      centre: Vec3;
      plate: { texture: WebGLTexture; picture: PlatePicture };
      distance: number;
    }[],
  ): void {
    if (boxes.length === 0 && plates.length === 0) return;
    const needed = (boxes.length * 36 + plates.length * 6) * FLOATS_PER_VERTEX;
    if (this.vertices.length < needed) this.vertices = new Float32Array(needed);
    const runs: QuadRun[] = [];
    let offset = 0;
    if (boxes.length > 0) {
      for (const box of boxes) {
        offset = writeMobBox(this.vertices, offset, box.feet, box.width, box.height);
      }
      runs.push({
        texture: this.batch.white,
        first: 0,
        count: offset / FLOATS_PER_VERTEX,
        cutout: 0.1,
        depthWrite: true,
      });
    }
    if (plates.length > 0) {
      const axes = cameraAxes(frame.view);
      plates.sort((a, b) => b.distance - a.distance);
      for (const { centre, plate } of plates) {
        const first = offset / FLOATS_PER_VERTEX;
        offset = writePlate(
          this.vertices,
          offset,
          centre,
          plate.picture.width / 2,
          plate.picture.height / 2,
          axes,
        );
        runs.push({ texture: plate.texture, first, count: 6, cutout: 0.004, depthWrite: false });
      }
    }
    this.batch.draw(frame.clip, this.vertices.subarray(0, offset), runs);
  }

  dispose(): void {
    this.disposed = true;
    for (const look of this.looks.values()) {
      look.renderer?.dispose();
      closeImage(look.image);
    }
    this.looks.clear();
    for (const plate of this.plates.values()) {
      if (plate !== null) this.batch.gl.deleteTexture(plate.texture);
    }
    this.plates.clear();
    this.states.clear();
  }
}

function closeImage(image: TexImageSource | null): void {
  if (image !== null && 'close' in image && typeof image.close === 'function') image.close();
}
