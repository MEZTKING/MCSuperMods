/**
 * Vehicles in Try it's view (B428, ADR 0091 D6): each vehicle of the area drawn with its geo
 * model through the geo preview's baker and renderer, posed by the Vehicle Studio's pure pose
 * (`preview/geo/vehicle-pose.ts`, B419): wheels roll the distance driven, steering bones turn
 * with the steering, rotors and propellers spin with the throttle, and the turret and barrel
 * follow the aim the simulation gives. The model's `idle` and `moving` animations play under
 * that pose (linear keyframes; Molang as 0, as the geo preview plays them).
 *
 * Models come from where the runtime reads them (`model.geometry`, the GeckoLib layout
 * `assets/<ns>/geckolib/models/<path>.geo.json`, ADR 0090 D10); the texture is the model's own
 * (paints are the game's, said by the simulation). A vehicle whose model is not in the project
 * is drawn as a plain box of its hitbox, with one line.
 *
 * Drawn after the mobs with the depth buffer kept; the geo renderer leaves face culling off, so
 * the canvas restores deepslate's state afterwards. Part of the lazy `TryItCanvas` chunk.
 */

import type {
  CatalogueVehicle,
  SimFiles,
  SimLog,
  SimOrigin,
  Vec3,
  VehicleSnapshot,
} from '@msm/sim';
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
import {
  SPIN_TURNS_PER_SECOND,
  type VehiclePoseState,
  type VehicleRig,
  vehiclePose,
  vehicleRig,
  wrapDegrees,
} from '../../preview/geo/vehicle-pose';
import { normaliseId } from '../../preview/model-chain';
import { boxInFrustum } from '../render/camera';
import { animationFile, geoModelFile, writeMobBox } from '../render/mobs';
import { FLOATS_PER_VERTEX, type QuadBatch } from '../render/particles';
import { type PortalPictureSource, readTexture } from '../render/portal';

/** Model units per block (Bedrock geometry). */
export const UNITS_PER_BLOCK = 16;
/** The colour of a vehicle drawn as a box (MSM's own). */
export const VEHICLE_BOX_RGBA: readonly [number, number, number, number] = [0.42, 0.5, 0.62, 1];
/** Above this speed (blocks a tick) the `moving` animation plays instead of `idle`. */
export const MOVING_SPEED = 0.01;

/** What the pass reads each frame: the vehicles and their types. */
export interface VehicleDrawSource {
  snapshots(): readonly VehicleSnapshot[];
  kind(type: string): CatalogueVehicle | undefined;
  /** Where lines about missing models go. */
  readonly log?: SimLog;
}

/** A frame of the pass: the view's matrices and the time. */
export interface VehicleFrame {
  projection: mat4;
  view: mat4;
  clip: mat4;
  planes: Float32Array;
  alpha: number;
  nowMs: number;
  elapsedMs: number;
}

/** The model block of a vehicle definition: geometry, texture, animations and scale. */
export interface VehicleLook {
  geometry: string;
  texture: string;
  animations?: string;
  scale: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The look of a vehicle type, or `null` when its model block names no geometry. */
export function vehicleLook(kind: Pick<CatalogueVehicle, 'definition'>): VehicleLook | null {
  const model = isRecord(kind.definition.model) ? kind.definition.model : {};
  const geometry = typeof model.geometry === 'string' ? model.geometry : '';
  if (geometry === '') return null;
  const texture = typeof model.texture === 'string' ? model.texture : '';
  const scale = typeof model.scale === 'number' && model.scale > 0 ? model.scale : 1;
  return {
    geometry,
    texture,
    scale,
    ...(typeof model.animations === 'string' && model.animations !== ''
      ? { animations: model.animations }
      : {}),
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The drawn position and facing between the last two ticks. */
export function interpolatedVehicle(
  snapshot: VehicleSnapshot,
  alpha: number,
): { position: Vec3; yaw: number; pitch: number } {
  const a = Math.min(1, Math.max(0, alpha));
  const { position: p, previousPosition: q } = snapshot;
  return {
    position: { x: lerp(q.x, p.x, a), y: lerp(q.y, p.y, a), z: lerp(q.z, p.z, a) },
    yaw: snapshot.previousYaw + wrapDegrees(snapshot.yaw - snapshot.previousYaw) * a,
    pitch: lerp(snapshot.previousPitch, snapshot.pitch, a),
  };
}

/**
 * The model's root matrix: at the bottom's centre, turned to the yaw (sim degrees; the model's
 * front is -z, so the turn is 180 - yaw, as the mobs'), the nose down by the pitch, scaled from
 * model units to blocks.
 */
export function vehicleRootMatrix(
  position: Vec3,
  yaw: number,
  pitch: number,
  scale: number,
  out = mat4.create(),
): mat4 {
  mat4.fromTranslation(out, [position.x, position.y, position.z]);
  mat4.rotateY(out, out, ((180 - yaw) * Math.PI) / 180);
  mat4.rotateX(out, out, (-pitch * Math.PI) / 180);
  const factor = scale / UNITS_PER_BLOCK;
  mat4.scale(out, out, [factor, factor, factor]);
  return out;
}

/** The pose state of a snapshot: wheels from the distance, steering, turret aim, rotor spin. */
export function poseStateOf(snapshot: VehicleSnapshot, spin: number): VehiclePoseState {
  return {
    turretYaw: snapshot.turretYaw,
    turretPitch: snapshot.turretPitch,
    distance: snapshot.distance,
    steer: snapshot.steering,
    spin,
  };
}

/** The rotors' angle after `elapsedMs` at `throttle` (one full spin rate at full throttle). */
export function advanceSpin(spin: number, throttle: number, elapsedMs: number): number {
  const turns = Math.min(1, Math.abs(throttle)) * SPIN_TURNS_PER_SECOND * (elapsedMs / 1000);
  return wrapDegrees(spin + turns * 360);
}

/** The pose of every bone: the playing animation (if any), with the vehicle's own pose on top. */
export function combinedPose(
  rig: VehicleRig,
  state: VehiclePoseState,
  animated: ReadonlyMap<string, BonePose>,
): Map<string, BonePose> {
  const out = new Map<string, BonePose>();
  for (const [bone, pose] of animated) {
    out.set(bone, {
      rotation: [...pose.rotation],
      position: [...pose.position],
      scale: [...pose.scale],
    });
  }
  for (const [bone, pose] of vehiclePose(rig, state)) {
    const current = out.get(bone);
    if (current === undefined) out.set(bone, pose);
    else {
      current.rotation = [
        current.rotation[0] + pose.rotation[0],
        current.rotation[1] + pose.rotation[1],
        current.rotation[2] + pose.rotation[2],
      ];
    }
  }
  return out;
}

/** Decodes PNG bytes for `texImage2D`; `null` when they do not decode. */
export type DecodeVehiclePicture = (bytes: Uint8Array) => Promise<TexImageSource | null>;

const defaultDecode: DecodeVehiclePicture = async (bytes) => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch {
    return null;
  }
};

/** Makes a geo renderer for a baked model and its picture. */
export type MakeVehicleRenderer = (
  gl: WebGLRenderingContext,
  model: BakedModel,
  image: TexImageSource | null,
) => GeoRenderer;

const defaultMakeRenderer: MakeVehicleRenderer = (gl, model, image) =>
  createGeoRenderer(gl, model, image, { extent: 0, cell: 1 });

/** Test hooks of {@link VehiclePass}. */
export interface VehiclePassOptions {
  decode?: DecodeVehiclePicture;
  makeRenderer?: MakeVehicleRenderer;
}

interface Baked {
  geoSource: string | Uint8Array | undefined;
  animationSource: string | Uint8Array | undefined;
  model: BakedModel | null;
  animations: Map<string, ParsedAnimation>;
  image: TexImageSource | null;
  textureFiles: SimFiles | null;
  textureReady: boolean;
  textureLoading: boolean;
  generation: number;
  renderer: GeoRenderer | null;
  rig: VehicleRig;
}

interface DrawState {
  spin: number;
  animation: string | undefined;
  startedMs: number;
  seen: number;
}

/** What the pass drew in a frame. */
export interface VehicleFrameStats {
  models: number;
  boxes: number;
}

/** Try it's vehicle pass; see the module comment. */
export class VehiclePass {
  private readonly batch: Pick<QuadBatch, 'gl' | 'white' | 'draw'>;
  private source: PortalPictureSource;
  private readonly decode: DecodeVehiclePicture;
  private readonly makeRenderer: MakeVehicleRenderer;
  private readonly baked = new Map<string, Baked>();
  private readonly states = new Map<number, DrawState>();
  private readonly said = new Set<string>();
  private frameNumber = 0;
  private vertices = new Float32Array(8 * 36 * FLOATS_PER_VERTEX);
  private readonly root = mat4.create();
  private disposed = false;

  constructor(
    batch: Pick<QuadBatch, 'gl' | 'white' | 'draw'>,
    source: PortalPictureSource,
    options: VehiclePassOptions = {},
  ) {
    this.batch = batch;
    this.source = source;
    this.decode = options.decode ?? defaultDecode;
    this.makeRenderer = options.makeRenderer ?? defaultMakeRenderer;
  }

  /** The current lowered files and readers. */
  setSource(source: PortalPictureSource): void {
    this.source = source;
  }

  private sayOnce(log: SimLog | undefined, key: string, text: string, origin?: SimOrigin): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    log?.info(text, origin);
  }

  /** The baked look of a vehicle type, baked again when its files changed; `null` draws a box. */
  private bakedFor(kind: CatalogueVehicle, log: SimLog | undefined): Baked | null {
    const look = vehicleLook(kind);
    if (look === null) {
      this.sayOnce(
        log,
        `vehicle-no-model:${kind.id}`,
        `${kind.displayName} has no model yet; the preview draws it as a box.`,
        kind.origin,
      );
      return null;
    }
    const files = this.source.files;
    const geoPath = geoModelFile(look.geometry);
    const geoSource = files.get(geoPath);
    if (geoSource === undefined) {
      this.sayOnce(
        log,
        `vehicle-model:${kind.id}:${look.geometry}`,
        `${kind.displayName}'s model ${normaliseId(look.geometry)} is not in the project; the preview draws it as a box.`,
        kind.origin,
      );
      return null;
    }
    const animationSource =
      look.animations === undefined ? undefined : files.get(animationFile(look.animations));
    const key = `${normaliseId(look.geometry)}|${normaliseId(look.texture)}|${look.animations ?? ''}|${kind.id}`;
    let baked = this.baked.get(key);
    if (baked === undefined) {
      baked = {
        geoSource: undefined,
        animationSource: undefined,
        model: null,
        animations: new Map(),
        image: null,
        textureFiles: null,
        textureReady: false,
        textureLoading: false,
        generation: 0,
        renderer: null,
        rig: vehicleRig(kind.definition),
      };
      this.baked.set(key, baked);
    }
    baked.rig = vehicleRig(kind.definition);
    if (baked.model === null || baked.geoSource !== geoSource) {
      baked.geoSource = geoSource;
      baked.model = bakeGeometry(readJsonFile(files, geoPath));
      this.remake(baked);
    }
    if (baked.animationSource !== animationSource) {
      baked.animationSource = animationSource;
      baked.animations = new Map();
      if (look.animations !== undefined && animationSource !== undefined) {
        for (const animation of parseAnimations(
          readJsonFile(files, animationFile(look.animations)),
        )) {
          baked.animations.set(animation.name, animation);
        }
      }
    }
    if (baked.textureFiles !== files && !baked.textureLoading) {
      this.loadTexture(baked, look, kind, log);
    }
    return baked;
  }

  private loadTexture(baked: Baked, look: VehicleLook, kind: CatalogueVehicle, log?: SimLog): void {
    const files = this.source.files;
    baked.textureLoading = true;
    baked.generation += 1;
    const generation = baked.generation;
    const current = (): boolean => !this.disposed && generation === baked.generation;
    const read =
      look.texture === ''
        ? Promise.resolve(null)
        : readTexture(this.source, normaliseId(look.texture)).catch(() => null);
    void read.then(async (bytes) => {
      if (!current()) return;
      const image = bytes === null ? null : await this.decode(bytes).catch(() => null);
      if (!current()) {
        closeImage(image);
        return;
      }
      if (image === null) {
        this.sayOnce(
          log,
          `vehicle-texture:${kind.id}:${look.texture}`,
          `${kind.displayName}'s texture ${look.texture === '' ? '(none)' : normaliseId(look.texture)} is missing; it is drawn with the missing-texture pattern.`,
          kind.origin,
        );
      }
      if (baked.image !== image) closeImage(baked.image);
      baked.image = image;
      baked.textureReady = true;
      baked.textureFiles = files;
      baked.textureLoading = false;
      this.remake(baked);
    });
  }

  private remake(baked: Baked): void {
    baked.renderer?.dispose();
    baked.renderer =
      baked.model !== null && baked.textureReady
        ? this.makeRenderer(this.batch.gl, baked.model, baked.image)
        : null;
  }

  /** Draws the vehicles; see the module comment. */
  draw(source: VehicleDrawSource, frame: VehicleFrame): VehicleFrameStats {
    const stats: VehicleFrameStats = { models: 0, boxes: 0 };
    this.frameNumber += 1;
    const boxes: { feet: Vec3; width: number; height: number }[] = [];
    for (const snapshot of source.snapshots()) {
      const kind = source.kind(snapshot.type);
      if (kind === undefined) continue;
      let state = this.states.get(snapshot.id);
      if (state === undefined) {
        state = { spin: 0, animation: undefined, startedMs: frame.nowMs, seen: 0 };
        this.states.set(snapshot.id, state);
      }
      state.seen = this.frameNumber;
      state.spin = advanceSpin(state.spin, snapshot.throttle, frame.elapsedMs);
      const at = interpolatedVehicle(snapshot, frame.alpha);
      const look = vehicleLook(kind);
      const scale = look?.scale ?? 1;
      const reach = Math.max(kind.width, kind.height) * Math.max(1, scale) + 1;
      if (
        !boxInFrustum(
          frame.planes,
          at.position.x - reach,
          at.position.y - reach,
          at.position.z - reach,
          at.position.x + reach,
          at.position.y + reach,
          at.position.z + reach,
        )
      ) {
        continue;
      }
      const baked = this.bakedFor(kind, source.log);
      if (baked === null) {
        boxes.push({ feet: at.position, width: kind.width, height: kind.height });
        stats.boxes += 1;
        continue;
      }
      if (baked.renderer === null || baked.model === null) continue;
      const wanted = Math.abs(snapshot.speed) > MOVING_SPEED ? 'moving' : 'idle';
      if (wanted !== state.animation) {
        state.animation = wanted;
        state.startedMs = frame.nowMs;
      }
      let animated: ReadonlyMap<string, BonePose> = new Map();
      const animation = findNamed(baked.animations, wanted);
      if (animation !== undefined) {
        const time = playbackTime(animation, (frame.nowMs - state.startedMs) / 1000);
        if (!time.rest) animated = samplePose(animation, time.time);
      }
      const pose = combinedPose(baked.rig, poseStateOf(snapshot, state.spin), animated);
      vehicleRootMatrix(at.position, at.yaw, at.pitch, scale, this.root);
      baked.renderer.draw(frame.projection, frame.view, boneMatrices(baked.model, pose, this.root));
      stats.models += 1;
    }
    for (const [id, state] of this.states)
      if (state.seen !== this.frameNumber) this.states.delete(id);
    if (boxes.length > 0) {
      const needed = boxes.length * 36 * FLOATS_PER_VERTEX;
      if (this.vertices.length < needed) this.vertices = new Float32Array(needed);
      let offset = 0;
      for (const box of boxes) {
        offset = writeMobBox(
          this.vertices,
          offset,
          box.feet,
          box.width,
          box.height,
          VEHICLE_BOX_RGBA,
        );
      }
      this.batch.draw(frame.clip, this.vertices.subarray(0, offset), [
        {
          texture: this.batch.white,
          first: 0,
          count: offset / FLOATS_PER_VERTEX,
          cutout: 0.1,
          depthWrite: true,
        },
      ]);
    }
    return stats;
  }

  dispose(): void {
    this.disposed = true;
    for (const baked of this.baked.values()) {
      baked.renderer?.dispose();
      closeImage(baked.image);
    }
    this.baked.clear();
    this.states.clear();
  }
}

/** An animation by name, or the one whose name ends with `.<name>` (`animation.kart.moving`). */
export function findNamed<T>(animations: ReadonlyMap<string, T>, name: string): T | undefined {
  const exact = animations.get(name);
  if (exact !== undefined) return exact;
  for (const [key, value] of animations) if (key.endsWith(`.${name}`)) return value;
  return undefined;
}

function closeImage(image: TexImageSource | null): void {
  if (image !== null && 'close' in image && typeof image.close === 'function') image.close();
}
