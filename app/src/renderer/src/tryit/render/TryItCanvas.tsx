/**
 * Try it's view of the test area (ADR 0085 D2, D7, D11): deepslate's `StructureRenderer` over
 * the block grid, seen from the player's eye. Drawing only: the grid, the camera and the picked
 * block come in as props, so it runs against a hand-made grid as well as the simulation's.
 *
 * - Chunks of 8 blocks; a changed block rebuilds its own chunk and, on a chunk face, the chunk
 *   across it (B385).
 * - Only chunks inside the view frustum are drawn, opaque meshes first, then see-through ones
 *   from far to near.
 * - Blocks carry real opacity flags (`resources.ts`), so hidden faces are culled.
 * - The GL state deepslate expects is set again before each frame, so another pass in the same
 *   context (the mobs of B395) cannot leave it culling or blending wrongly.
 * - The floor is MSM's own grid, drawn as a tinted quad and lines with no texture file, on
 *   purpose not a Minecraft landscape (D7).
 * - The render loop runs only while `active`, the page is visible and the window has focus, at
 *   most 60 frames a second; "Smaller picture" halves the resolution (D11).
 * - New definitions or textures re-prepare the resources and rebuild the meshes; the grid stays.
 * - Two passes of Try it's own follow the blocks (B394): portal blocks as their translucent,
 *   animated picture (`portal.ts`; deepslate does not mesh them), then the particles of the
 *   `particles` prop as camera-facing quads (`particles.ts`). Both use one small shader of their
 *   own; the frame ends with `resetGlForDeepslate`, so the next pass starts from deepslate's
 *   state.
 * - Mobs (B395) are drawn before those two passes, after the blocks and the outline, with the
 *   depth buffer kept: the `mobs` prop's snapshots through the geo preview's renderer, one baked
 *   look per model and texture, a box for a mob without a model, and a name plate (`mobs.ts`).
 * - Project fluids (B483) are drawn by their own pass before the portals (`fluids/fluid-pass.ts`;
 *   hidden from deepslate as portals are), and the sky is MSM's own colour or, when the view
 *   chooses one, a project dimension type's sky colour (`sky.ts`).
 *
 * This module is the lazy chunk: `TryItScene` imports it with `lazy()` after checking WebGL.
 */

import type { JsonObject } from '@msm/plugin-api';
import type { SimFiles } from '@msm/sim';
import { Vector } from 'deepslate/math';
import { type BlockFlags, Mesh, Quad, type Resources, StructureRenderer } from 'deepslate/render';
import { mat4 } from 'gl-matrix';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';
import { normaliseId } from '../../preview/model-chain';
import { TRYIT_FALLBACK_MODELS } from '../blocks2/fallback-parents';
import { type FluidLook, FluidPass } from '../fluids/fluid-pass';
import { type VehicleDrawSource, VehiclePass } from '../vehicles/vehicle-pass';
import {
  boxInFrustum,
  type CameraPose,
  frustumPlanes,
  type PickedOutline,
  viewMatrixFor,
} from './camera';
import { type MobField, type MobFrameStats, MobPass } from './mobs';
import { type ParticleField, ParticlePass, QuadBatch } from './particles';
import {
  PortalIndex,
  type PortalLook,
  PortalPass,
  portalLooksFromFiles,
  withoutPortals,
} from './portal';
import { prepareTryItResources, type TryItResources } from './resources';
import { PREVIEW_SKY } from './sky';
import { TRYIT_CHUNK_SIZE, type TryItGrid, WorldStructure } from './world-structure';

export type { CameraPose, PickedOutline } from './camera';
export type { TryItGrid } from './world-structure';

/** A value, or a function the view calls once per frame for the current value. */
export type PerFrame<T> = T | (() => T);

/** What a drawn frame cost, for tests and measurements. */
export interface TryItFrameStats {
  /** Chunk meshes drawn after culling. */
  meshes: number;
  /** Time spent rebuilding changed chunks this frame, in milliseconds. */
  rebuildMs: number;
  /** Particles drawn (after leaving out fully faded ones). */
  particles: number;
  /** Portal blocks drawn. */
  portals: number;
  /** Mobs drawn (with their model or as a box) and their name plates. */
  mobs: number;
  mobPlates: number;
  /** Vehicles drawn (B428). */
  vehicles: number;
  /** Project fluid blocks drawn (B483). */
  fluids: number;
}

/** What the resources found, for notes beside the view. */
export type TryItResourceInfo = Pick<
  TryItResources,
  'missingDefinitions' | 'missingModels' | 'missingTextures' | 'usedFallback' | 'fallbackBlocks'
>;

/** Props of {@link TryItCanvas}. */
export interface TryItCanvasProps {
  /** The blocks to draw; `SimWorld` or a hand-made grid. A new grid rebuilds everything. */
  grid: TryItGrid;
  /** The eye and look; a function is read every frame (player interpolation values). */
  camera: PerFrame<CameraPose>;
  /** The block the player points at, outlined; `null` for none. */
  picked?: PerFrame<PickedOutline | null>;
  /**
   * Block ids to prepare before they are placed (the hotbar and picker). Blocks already in the
   * grid, and any that appear later, are prepared as well.
   */
  blockIds?: readonly string[];
  /** The project's lowered files (`assets/...`); a new map re-prepares the pictures. */
  files: SimFiles;
  /** The target's folder names under `assets/<namespace>/`. */
  folders: ResourceFolders;
  /** The extracted vanilla cache, or `null` when the user has not set it up (ADR 0011). */
  vanilla: VanillaAssetReader | null;
  /** Memoised vanilla JSON reads, shared across rebuilds. */
  vanillaJson?: ((path: string) => Promise<JsonObject | null>) | null;
  /** Reads a project asset the lowered files do not hold (relative to `assets/<namespace>/`). */
  readProjectAsset?: (namespace: string, path: string) => Promise<Uint8Array | null>;
  /**
   * MSM's own models for vanilla parents by id (default `TRYIT_FALLBACK_MODELS`: the vanilla
   * templates the lowering names). Any other `minecraft:block/<x>` model missing from the files
   * and the jar draws as that block's fallback cube (`render/resources.ts`, B540).
   */
  fallbackModels?: Readonly<Record<string, JsonObject>>;
  /**
   * The live particles to draw (B394): a `ParticleField` from `particles.ts`, ticked by the
   * owner on each simulation tick. `null` or absent draws none.
   */
  particles?: ParticleField | null;
  /**
   * The mobs to draw (B395): a `MobField` from `mobs.ts`, given `EntityWorld.step()`'s
   * snapshots by the owner on each simulation tick. `null` or absent draws none.
   */
  mobs?: MobField | null;
  /**
   * The vehicles to draw (B428): read every frame from the simulation's `VehicleWorld`, drawn
   * with their geo models after the mobs (`vehicles/vehicle-pass.ts`). `null` or absent: none.
   */
  vehicles?: VehicleDrawSource | null;
  /**
   * How far the simulation is between its last tick and the next, 0..1 (`SimClock.alpha`), for
   * drawing mobs and particles between ticks. Default 0.
   */
  partialTick?: PerFrame<number>;
  /** The project's fluids by id (B483); their blocks are drawn by the fluid pass. */
  fluids?: ReadonlyMap<string, FluidLook>;
  /** The sky colour (0..1 RGB); absent or `null` for MSM's own (B483, ADR 0100 D4). */
  sky?: PerFrame<readonly [number, number, number] | null>;
  /** "Smaller picture": draws at half the resolution and scales it up. */
  smaller?: boolean;
  /**
   * The most device pixels per CSS pixel the picture is drawn at (ADR 0128 D3: the showcase's
   * clips pass 2). Absent: the screen's own `devicePixelRatio`, however high.
   */
  maxPixelRatio?: number;
  /** False stops the render loop (the view is hidden). Default true. */
  active?: boolean;
  /**
   * Called once per frame while the loop runs, before the camera is read, with the time since
   * the last frame: the place to advance the simulation's clock. Not called while stopped.
   */
  onFrame?: (elapsedMs: number) => void;
  /** Called after each drawn frame. */
  onFrameDrawn?: (stats: TryItFrameStats) => void;
  /** Called each time the resources are ready. */
  onResources?: (info: TryItResourceInfo) => void;
  /** Called when the canvas cannot get, or loses, its WebGL context. */
  onWebGLUnavailable?: () => void;
  /** The accessible name of the picture. */
  label?: string;
}

/** The sky behind the area: a plain MSM blue-grey, not Minecraft's sky colour. */
const SKY: readonly [number, number, number] = PREVIEW_SKY;
const NO_FLUIDS: ReadonlyMap<string, FluidLook> = new Map();
/** The floor's tint and its lines; every eighth line, and the edge, stand out. */
const FLOOR: [number, number, number] = [0.36, 0.4, 0.44];
const FLOOR_LINE: [number, number, number] = [0.46, 0.5, 0.55];
const FLOOR_LINE_MAJOR: [number, number, number] = [0.56, 0.6, 0.66];
const FLOOR_EDGE: [number, number, number] = [0.9, 0.72, 0.3];
const OUTLINE: [number, number, number] = [0.05, 0.05, 0.05];
/** How far lines sit above the floor, and outlines outside their box, to stay visible. */
const LINE_LIFT = 0.002;
const OUTLINE_GROW = 0.002;
/** At most 60 frames a second (D11). */
const FRAME_MS = 1000 / 60;
const REPREPARE_DELAY_MS = 60;

/**
 * Device pixels per CSS pixel of the drawing buffer: the screen's ratio (at least 1 when it is
 * missing), capped at `max` when given, halved for "Smaller picture".
 */
export function canvasPixelScale(devicePixelRatio: number, smaller: boolean, max?: number): number {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const capped = max === undefined ? ratio : Math.min(ratio, max);
  return capped * (smaller ? 0.5 : 1);
}

/** The drawing buffer's size for a canvas shown at `width` by `height` CSS pixels. */
export function canvasBufferSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const read = <T,>(value: PerFrame<T>): T =>
  typeof value === 'function' ? (value as () => T)() : value;

/**
 * Sets the GL state deepslate's renderer expects (B385: the geo renderer turns face culling
 * off and never restores it). Call before deepslate draws after any other pass.
 */
export function resetGlForDeepslate(gl: WebGLRenderingContext): void {
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  const attributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
  for (let i = 0; i < Math.min(attributes, 16); i += 1) gl.disableVertexAttribArray(i);
}

/** The floor: a tinted quad over the area's width and depth with a line on every block edge. */
export function floorMesh(sizeX: number, sizeZ: number): Mesh {
  const mesh = new Mesh();
  mesh.quads.push(
    Quad.fromPoints(
      new Vector(0, 0, 0),
      new Vector(0, 0, sizeZ),
      new Vector(sizeX, 0, sizeZ),
      new Vector(sizeX, 0, 0),
    ).setColor(FLOOR),
  );
  const y = LINE_LIFT;
  for (let x = 1; x < sizeX; x += 1) {
    mesh.addLine(x, y, 0, x, y, sizeZ, x % TRYIT_CHUNK_SIZE === 0 ? FLOOR_LINE_MAJOR : FLOOR_LINE);
  }
  for (let z = 1; z < sizeZ; z += 1) {
    mesh.addLine(0, y, z, sizeX, y, z, z % TRYIT_CHUNK_SIZE === 0 ? FLOOR_LINE_MAJOR : FLOOR_LINE);
  }
  mesh.addLine(0, y, 0, sizeX, y, 0, FLOOR_EDGE);
  mesh.addLine(0, y, sizeZ, sizeX, y, sizeZ, FLOOR_EDGE);
  mesh.addLine(0, y, 0, 0, y, sizeZ, FLOOR_EDGE);
  mesh.addLine(sizeX, y, 0, sizeX, y, sizeZ, FLOOR_EDGE);
  return mesh;
}

/** The outline mesh of a picked block: each box, grown a little, as lines. */
export function outlineMesh(picked: PickedOutline): Mesh {
  const mesh = new Mesh();
  const { x, y, z } = picked.pos;
  for (const [x0, y0, z0, x1, y1, z1] of picked.boxes) {
    mesh.addLineCube(
      x + x0 - OUTLINE_GROW,
      y + y0 - OUTLINE_GROW,
      z + z0 - OUTLINE_GROW,
      x + x1 + OUTLINE_GROW,
      y + y1 + OUTLINE_GROW,
      z + z1 + OUTLINE_GROW,
      OUTLINE,
    );
  }
  return mesh;
}

const outlineKey = (picked: PickedOutline | null): string =>
  picked === null ? '' : JSON.stringify([picked.pos.x, picked.pos.y, picked.pos.z, picked.boxes]);

/** A stable `Resources` whose answers come from whichever resources were prepared last. */
function resourceSwitch(): { resources: Resources; set(next: Resources): void } {
  let current: Resources | null = null;
  const now = (): Resources => {
    if (current === null) throw new Error('Try it resources are not ready.');
    return current;
  };
  return {
    set: (next) => {
      current = next;
    },
    resources: {
      getBlockDefinition: (id) => now().getBlockDefinition(id),
      getBlockModel: (id) => now().getBlockModel(id),
      getTextureAtlas: () => now().getTextureAtlas(),
      getTextureUV: (id) => now().getTextureUV(id),
      getPixelSize: () => now().getPixelSize?.() ?? 0,
      getBlockFlags: (id): BlockFlags | null => now().getBlockFlags(id),
      getBlockProperties: (id) => now().getBlockProperties(id),
      getDefaultBlockProperties: (id) => now().getDefaultBlockProperties(id),
    },
  };
}

type DrawOptions = { pos?: boolean; color?: boolean; texture?: boolean; normal?: boolean };

/**
 * The members of deepslate 0.27.2's renderer that per-chunk culling needs. They are protected
 * or private in the type declarations, so they are read through this cast, as `PreviewCanvas`
 * reads the atlas texture.
 */
interface RendererInternals {
  chunkBuilder: { getChunk(pos: [number, number, number]): { mesh: Mesh; transparentMesh: Mesh } };
  shaderProgram: WebGLProgram;
  gridShaderProgram: WebGLProgram;
  atlasTexture: WebGLTexture;
  projMatrix: mat4;
  setShader(program: WebGLProgram): void;
  setTexture(texture: WebGLTexture, pixelSize?: number): void;
  prepareDraw(view: mat4): void;
  drawMesh(mesh: Mesh, options: DrawOptions): void;
}

function internalsOf(renderer: StructureRenderer): RendererInternals | null {
  const internals = renderer as unknown as Partial<RendererInternals>;
  return typeof internals.chunkBuilder?.getChunk === 'function' &&
    internals.shaderProgram !== undefined &&
    internals.gridShaderProgram !== undefined &&
    internals.atlasTexture !== undefined &&
    typeof internals.drawMesh === 'function'
    ? (internals as RendererInternals)
    : null;
}

const BLOCK_DRAW: DrawOptions = { pos: true, color: true, texture: true, normal: true };
const LINE_DRAW: DrawOptions = { pos: true, color: true };

/** A live renderer bound to one canvas. */
interface Scene {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  switcher: ReturnType<typeof resourceSwitch>;
  renderer: StructureRenderer | null;
  internals: RendererInternals | null;
  floor: Mesh | null;
  floorSize: string;
  outline: Mesh | null;
  outlineKey: string;
  view: mat4;
  clip: mat4;
  planes: Float32Array;
  /** Try it's own passes, made with the renderer. */
  batch: QuadBatch | null;
  portalPass: PortalPass | null;
  fluidPass: FluidPass | null;
  particlePass: ParticlePass | null;
  mobPass: MobPass | null;
  vehiclePass: VehiclePass | null;
  portalIndex: PortalIndex;
  /** The fluid blocks of the grid (B483). */
  fluidIndex: PortalIndex;
  /** Milliseconds drawn so far, for the portal pictures' frames. */
  animationMs: number;
}

function createScene(): Scene | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'block size-full';
  const gl = canvas.getContext('webgl', { antialias: false });
  if (gl === null) return null;
  return {
    canvas,
    gl,
    switcher: resourceSwitch(),
    renderer: null,
    internals: null,
    floor: null,
    floorSize: '',
    outline: null,
    outlineKey: '',
    view: mat4.create(),
    clip: mat4.create(),
    planes: new Float32Array(24),
    batch: null,
    portalPass: null,
    fluidPass: null,
    particlePass: null,
    mobPass: null,
    vehiclePass: null,
    portalIndex: new PortalIndex(),
    fluidIndex: new PortalIndex(),
    animationMs: 0,
  };
}

function disposeScene(scene: Scene | null): void {
  if (scene === null) return;
  scene.portalPass?.dispose();
  scene.fluidPass?.dispose();
  scene.particlePass?.dispose();
  scene.mobPass?.dispose();
  scene.vehiclePass?.dispose();
  scene.batch?.dispose();
  scene.portalIndex.dispose();
  scene.fluidIndex.dispose();
  scene.gl.getExtension('WEBGL_lose_context')?.loseContext();
  scene.canvas.remove();
}

/** Replaces the pixels of the renderer's atlas texture (its size may change). */
function uploadAtlas(scene: Scene, image: ImageData): void {
  const texture = scene.internals?.atlasTexture;
  if (texture === undefined) return;
  const { gl } = scene;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
}

/** Rebuilds the chunks the grid changed since the last frame; returns the time it took. */
function rebuildDirty(scene: Scene, structure: WorldStructure): number {
  if (scene.renderer === null || !structure.hasDirty) return 0;
  const started = performance.now();
  const dirty = structure.takeDirty();
  if (dirty.all) scene.renderer.updateStructureBuffers();
  else {
    const renderer = scene.renderer;
    structure.withScope(dirty.chunks, () => renderer.updateStructureBuffers(dirty.chunks));
  }
  return performance.now() - started;
}

/** What Try it's own passes draw in a frame, besides the blocks. */
interface FrameExtras {
  /** The whole grid, portals included. */
  grid: TryItGrid;
  portalLooks: ReadonlyMap<string, PortalLook>;
  isPortal: (id: string) => boolean;
  fluidLooks: ReadonlyMap<string, FluidLook>;
  isFluid: (id: string) => boolean;
  /** The sky colour, or `null` for MSM's own. */
  sky: readonly [number, number, number] | null;
  particles: ParticleField | null;
  mobs: MobField | null;
  vehicles: VehicleDrawSource | null;
  partialTick: number;
  /** Milliseconds since the last frame. */
  elapsedMs: number;
  props: TryItCanvasProps;
}

const NO_MOBS: MobFrameStats = { models: 0, boxes: 0, plates: 0 };

/** Draws the mobs after the blocks (B395); the caller restores deepslate's state after. */
function drawMobs(
  scene: Scene,
  projection: mat4,
  view: mat4,
  pose: CameraPose,
  extras: FrameExtras,
): MobFrameStats {
  const mobs = extras.mobs;
  if (mobs === null || mobs.size === 0) return NO_MOBS;
  if (scene.batch === null) scene.batch = new QuadBatch(scene.gl);
  const { props } = extras;
  const source = {
    files: props.files,
    folders: props.folders,
    vanilla: props.vanilla,
    ...(props.readProjectAsset === undefined ? {} : { readProjectAsset: props.readProjectAsset }),
  };
  if (scene.mobPass === null) scene.mobPass = new MobPass(scene.batch, source);
  else scene.mobPass.setSource(source);
  return scene.mobPass.draw(mobs, {
    projection,
    view,
    clip: scene.clip,
    planes: scene.planes,
    eye: pose.eye,
    alpha: extras.partialTick,
    nowMs: scene.animationMs,
    elapsedMs: extras.elapsedMs,
  });
}

/** Draws the vehicles after the mobs (B428); returns how many. */
function drawVehicles(scene: Scene, projection: mat4, view: mat4, extras: FrameExtras): number {
  const vehicles = extras.vehicles;
  if (vehicles === null) return 0;
  const list = vehicles.snapshots();
  if (list.length === 0) return 0;
  if (scene.batch === null) scene.batch = new QuadBatch(scene.gl);
  const { props } = extras;
  const source = {
    files: props.files,
    folders: props.folders,
    vanilla: props.vanilla,
    ...(props.readProjectAsset === undefined ? {} : { readProjectAsset: props.readProjectAsset }),
  };
  if (scene.vehiclePass === null) scene.vehiclePass = new VehiclePass(scene.batch, source);
  else scene.vehiclePass.setSource(source);
  const drawn = scene.vehiclePass.draw(
    {
      snapshots: () => list,
      kind: (type) => vehicles.kind(type),
      ...(vehicles.log === undefined ? {} : { log: vehicles.log }),
    },
    {
      projection,
      view,
      clip: scene.clip,
      planes: scene.planes,
      alpha: extras.partialTick,
      nowMs: scene.animationMs,
      elapsedMs: extras.elapsedMs,
    },
  );
  resetGlForDeepslate(scene.gl);
  return drawn.models + drawn.boxes;
}

/** Draws the fluid, portal and particle passes after the blocks; returns what they drew. */
function drawExtras(
  scene: Scene,
  view: mat4,
  pose: CameraPose,
  extras: FrameExtras,
): { particles: number; portals: number; fluids: number } {
  const { props } = extras;
  scene.portalIndex.follow(extras.grid, extras.isPortal);
  const portals = extras.portalLooks.size === 0 ? [] : scene.portalIndex.portals();
  scene.fluidIndex.follow(extras.grid, extras.isFluid);
  const fluids = extras.fluidLooks.size === 0 ? [] : scene.fluidIndex.portals();
  const particles = extras.particles;
  if (portals.length === 0 && fluids.length === 0 && (particles === null || particles.size === 0)) {
    return { particles: 0, portals: 0, fluids: 0 };
  }
  if (scene.batch === null) scene.batch = new QuadBatch(scene.gl);
  const batch = scene.batch;
  const readProjectAsset = props.readProjectAsset;
  let drawnFluids = 0;
  if (fluids.length > 0) {
    const source = {
      files: props.files,
      folders: props.folders,
      vanilla: props.vanilla,
      ...(readProjectAsset === undefined ? {} : { readProjectAsset }),
    };
    if (scene.fluidPass === null) scene.fluidPass = new FluidPass(batch, source);
    else scene.fluidPass.setSource(source);
    drawnFluids = scene.fluidPass.draw(
      fluids,
      extras.fluidLooks,
      (pos) => extras.grid.get(pos),
      scene.animationMs / 50,
      scene.clip,
      pose.eye,
    );
  }
  let drawnPortals = 0;
  if (portals.length > 0) {
    const source = {
      files: props.files,
      folders: props.folders,
      vanilla: props.vanilla,
      ...(readProjectAsset === undefined ? {} : { readProjectAsset }),
    };
    if (scene.portalPass === null) scene.portalPass = new PortalPass(batch, source);
    else scene.portalPass.setSource(source);
    drawnPortals = scene.portalPass.draw(
      portals,
      extras.portalLooks,
      scene.animationMs / 50,
      scene.clip,
      pose.eye,
    );
  }
  let drawnParticles = 0;
  if (particles !== null && particles.size > 0) {
    const source = {
      files: props.files,
      ...(readProjectAsset === undefined ? {} : { readProjectAsset }),
    };
    if (scene.particlePass === null) scene.particlePass = new ParticlePass(batch, source);
    scene.particlePass.setSource(source, particles.revision);
    drawnParticles = scene.particlePass.draw(
      particles,
      extras.partialTick,
      view,
      scene.clip,
      pose.eye,
    );
  }
  resetGlForDeepslate(scene.gl);
  return { particles: drawnParticles, portals: drawnPortals, fluids: drawnFluids };
}

/** Draws one frame; returns what was drawn. */
function drawFrame(
  scene: Scene,
  structure: WorldStructure,
  pose: CameraPose,
  picked: PickedOutline | null,
  extras: FrameExtras,
): Omit<TryItFrameStats, 'rebuildMs'> {
  const { gl, renderer, internals } = scene;
  const none = {
    meshes: 0,
    particles: 0,
    portals: 0,
    mobs: 0,
    mobPlates: 0,
    vehicles: 0,
    fluids: 0,
  };
  if (renderer === null) return none;
  resetGlForDeepslate(gl);
  const sky = extras.sky ?? SKY;
  gl.clearColor(sky[0], sky[1], sky[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const view = viewMatrixFor(pose, scene.view);
  if (internals === null) {
    // A deepslate without the members culling needs: draw everything the public way.
    renderer.drawGrid(view);
    renderer.drawStructure(view);
    if (picked !== null) renderer.drawOutline(view, [picked.pos.x, picked.pos.y, picked.pos.z]);
    return { ...none, meshes: -1 };
  }
  const [sizeX, sizeY, sizeZ] = structure.getSize();
  const floorSize = `${sizeX},${sizeZ}`;
  if (scene.floor === null || scene.floorSize !== floorSize) {
    scene.floor = floorMesh(sizeX, sizeZ).rebuild(gl, LINE_DRAW);
    scene.floorSize = floorSize;
  }
  internals.setShader(internals.gridShaderProgram);
  internals.prepareDraw(view);
  internals.drawMesh(scene.floor, LINE_DRAW);

  mat4.multiply(scene.clip, internals.projMatrix, view);
  frustumPlanes(scene.clip, scene.planes);
  const opaque: Mesh[] = [];
  const seeThrough: { mesh: Mesh; distance: number }[] = [];
  const size = TRYIT_CHUNK_SIZE;
  const half = size / 2;
  for (let cx = 0; cx * size < sizeX; cx += 1) {
    for (let cy = 0; cy * size < sizeY; cy += 1) {
      for (let cz = 0; cz * size < sizeZ; cz += 1) {
        const x0 = cx * size;
        const y0 = cy * size;
        const z0 = cz * size;
        if (!boxInFrustum(scene.planes, x0, y0, z0, x0 + size, y0 + size, z0 + size)) continue;
        const chunk = internals.chunkBuilder.getChunk([cx, cy, cz]);
        if (!chunk.mesh.isEmpty()) opaque.push(chunk.mesh);
        if (!chunk.transparentMesh.isEmpty()) {
          const distance = Math.hypot(
            x0 + half - pose.eye.x,
            y0 + half - pose.eye.y,
            z0 + half - pose.eye.z,
          );
          seeThrough.push({ mesh: chunk.transparentMesh, distance });
        }
      }
    }
  }
  seeThrough.sort((a, b) => b.distance - a.distance);
  internals.setShader(internals.shaderProgram);
  internals.setTexture(internals.atlasTexture, scene.switcher.resources.getPixelSize?.());
  internals.prepareDraw(view);
  for (const mesh of opaque) internals.drawMesh(mesh, BLOCK_DRAW);
  for (const { mesh } of seeThrough) internals.drawMesh(mesh, BLOCK_DRAW);

  const key = outlineKey(picked);
  if (key !== scene.outlineKey) {
    scene.outline =
      picked === null || picked.boxes.length === 0
        ? null
        : outlineMesh(picked).rebuild(gl, LINE_DRAW);
    scene.outlineKey = key;
  }
  if (scene.outline !== null) {
    internals.setShader(internals.gridShaderProgram);
    internals.prepareDraw(view);
    internals.drawMesh(scene.outline, LINE_DRAW);
  }
  // Mobs first, keeping the depth buffer, then the see-through passes; the geo renderer leaves
  // face culling off, so deepslate's state is put back whatever drew.
  const mobs = drawMobs(scene, internals.projMatrix, view, pose, extras);
  const vehicles = drawVehicles(scene, internals.projMatrix, view, extras);
  const drawn = drawExtras(scene, view, pose, extras);
  if (extras.mobs !== null && extras.mobs.size > 0) resetGlForDeepslate(gl);
  return {
    meshes: opaque.length + seeThrough.length,
    ...drawn,
    mobs: mobs.models + mobs.boxes,
    mobPlates: mobs.plates,
    vehicles,
  };
}

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/** Draws the test area; see the module comment. */
export default function TryItCanvas(props: TryItCanvasProps) {
  const {
    grid,
    files,
    folders,
    vanilla,
    vanillaJson,
    // MSM's own parents, with those of the twenty block types (B463).
    fallbackModels = TRYIT_FALLBACK_MODELS,
    smaller = false,
  } = props;
  const active = props.active ?? true;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const structureRef = useRef<WorldStructure | null>(null);
  const preparedRef = useRef<TryItResources | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const smallerRef = useRef(smaller);
  smallerRef.current = smaller;
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [extraIds, setExtraIds] = useState<readonly string[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const blockIdsKey = useMemo(
    () => [...new Set(props.blockIds ?? [])].sort().join('\n'),
    [props.blockIds],
  );
  // Portal blocks are drawn by the portal pass, so deepslate meshes the grid without them.
  const portalLooks = useMemo(() => portalLooksFromFiles(files, folders), [files, folders]);
  const portalKey = useMemo(() => [...portalLooks.keys()].sort().join('\n'), [portalLooks]);
  const isPortal = useMemo(() => {
    const ids = new Set(portalKey === '' ? [] : portalKey.split('\n'));
    return (id: string): boolean => ids.has(id);
  }, [portalKey]);
  // Project fluids (B483) are drawn by the fluid pass, so deepslate meshes without them too.
  const fluidLooks = props.fluids ?? NO_FLUIDS;
  const fluidKey = useMemo(() => [...fluidLooks.keys()].sort().join('\n'), [fluidLooks]);
  const isFluid = useMemo(() => {
    const ids = new Set(fluidKey === '' ? [] : fluidKey.split('\n'));
    return (id: string): boolean => ids.has(id);
  }, [fluidKey]);
  const meshGrid = useMemo(
    () =>
      portalKey === '' && fluidKey === ''
        ? grid
        : withoutPortals(grid, (id) => isPortal(id) || isFluid(id)),
    [grid, portalKey, isPortal, fluidKey, isFluid],
  );
  const extrasRef = useRef({ portalLooks, isPortal, fluidLooks, isFluid });
  extrasRef.current = { portalLooks, isPortal, fluidLooks, isFluid };

  // The canvas and its context, once.
  useEffect(() => {
    const scene = createScene();
    if (scene === null) {
      propsRef.current.onWebGLUnavailable?.();
      setStatus({ state: 'error', message: 'Preview unavailable: WebGL is disabled.' });
      return;
    }
    const onLost = (event: Event): void => {
      event.preventDefault();
      propsRef.current.onWebGLUnavailable?.();
      setStatus({ state: 'error', message: 'Preview unavailable: WebGL stopped working.' });
    };
    scene.canvas.addEventListener('webglcontextlost', onLost);
    sceneRef.current = scene;
    hostRef.current?.append(scene.canvas);
    setSceneReady(true);
    return () => {
      scene.canvas.removeEventListener('webglcontextlost', onLost);
      disposeScene(scene);
      sceneRef.current = null;
    };
  }, []);

  // The grid: a new one replaces the structure and rebuilds every chunk.
  useEffect(() => {
    const structure = new WorldStructure(meshGrid);
    structureRef.current = structure;
    const renderer = sceneRef.current?.renderer;
    if (renderer !== null && renderer !== undefined) {
      renderer.setStructure(structure);
      structure.takeDirty();
    }
    return () => {
      structure.dispose();
      if (structureRef.current === structure) structureRef.current = null;
    };
  }, [meshGrid]);

  // The resources: prepared again when the files or wanted blocks change; the grid stays.
  useEffect(() => {
    if (!sceneReady) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const structure = structureRef.current;
      const ids = new Set<string>([
        ...blockIdsKey.split('\n').filter((id) => id !== ''),
        ...extraIds,
        ...(structure?.blockIds() ?? []),
      ]);
      const { readProjectAsset } = propsRef.current;
      prepareTryItResources(ids, {
        files,
        folders,
        vanilla,
        ...(vanillaJson === undefined ? {} : { vanillaJson }),
        fallbackModels,
        ...(readProjectAsset === undefined ? {} : { readProjectAsset }),
      })
        .then((prepared) => {
          const scene = sceneRef.current;
          const current = structureRef.current;
          if (cancelled || scene === null || current === null) return;
          preparedRef.current = prepared;
          scene.switcher.set(prepared.resources);
          if (scene.renderer === null) {
            scene.renderer = new StructureRenderer(scene.gl, current, scene.switcher.resources, {
              chunkSize: TRYIT_CHUNK_SIZE,
              useInvisibleBlockBuffer: false,
            });
            scene.internals = internalsOf(scene.renderer);
            current.takeDirty();
          } else {
            uploadAtlas(scene, prepared.resources.getTextureAtlas());
            // Rebuild at once, so no frame draws old texture coordinates on the new atlas.
            current.takeDirty();
            scene.renderer.updateStructureBuffers();
          }
          setStatus({ state: 'ready' });
          propsRef.current.onResources?.({
            missingDefinitions: prepared.missingDefinitions,
            missingModels: prepared.missingModels,
            missingTextures: prepared.missingTextures,
            usedFallback: prepared.usedFallback,
            fallbackBlocks: prepared.fallbackBlocks,
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setStatus({
            state: 'error',
            message: `Try it could not load its pictures: ${error instanceof Error ? error.message : String(error)}`,
          });
        });
    }, REPREPARE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    sceneReady,
    grid,
    files,
    folders,
    vanilla,
    vanillaJson,
    fallbackModels,
    blockIdsKey,
    extraIds,
  ]);

  // The render loop: only while active, visible and focused; at most 60 frames a second.
  useEffect(() => {
    if (!sceneReady || !active) return;
    let frame: number | null = null;
    let focused = true;
    let last = 0;
    let due = 0;
    const running = (): boolean =>
      focused && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
    const loop = (now: number): void => {
      frame = null;
      if (!running()) return;
      frame = requestAnimationFrame(loop);
      if (now < due - 1) return;
      due = Math.max(due, now - FRAME_MS) + FRAME_MS;
      const elapsed = last === 0 ? FRAME_MS : now - last;
      last = now;
      const scene = sceneRef.current;
      const structure = structureRef.current;
      const current = propsRef.current;
      try {
        current.onFrame?.(elapsed);
        if (scene === null || structure === null) return;
        const prepared = preparedRef.current;
        if (prepared !== null) {
          const fresh = structure
            .takeNewBlockIds()
            .map(normaliseId)
            .filter((id) => !prepared.blockIds.has(id));
          if (fresh.length > 0) {
            setExtraIds((before) => [...new Set([...before, ...fresh])].sort());
          }
        }
        const { canvas } = scene;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0 || scene.renderer === null) return;
        const scale = canvasPixelScale(
          window.devicePixelRatio || 1,
          smallerRef.current,
          current.maxPixelRatio,
        );
        const { width: pixelWidth, height: pixelHeight } = canvasBufferSize(width, height, scale);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        scene.renderer.setViewport(0, 0, pixelWidth, pixelHeight);
        const rebuildMs = rebuildDirty(scene, structure);
        scene.animationMs += elapsed;
        const drawn = drawFrame(
          scene,
          structure,
          read(current.camera),
          read(current.picked ?? null),
          {
            grid: current.grid,
            portalLooks: extrasRef.current.portalLooks,
            isPortal: extrasRef.current.isPortal,
            fluidLooks: extrasRef.current.fluidLooks,
            isFluid: extrasRef.current.isFluid,
            sky: read(current.sky ?? null),
            particles: current.particles ?? null,
            mobs: current.mobs ?? null,
            vehicles: current.vehicles ?? null,
            partialTick: read(current.partialTick ?? 0),
            elapsedMs: elapsed,
            props: current,
          },
        );
        current.onFrameDrawn?.({ ...drawn, rebuildMs });
      } catch (error) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        setStatus({
          state: 'error',
          message: `Try it stopped drawing: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    };
    const start = (): void => {
      if (frame !== null || !running()) return;
      last = 0;
      due = 0;
      frame = requestAnimationFrame(loop);
    };
    const onBlur = (): void => {
      focused = false;
    };
    const onFocus = (): void => {
      focused = true;
      start();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', start);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [sceneReady, active]);

  return (
    <div className="relative size-full overflow-hidden bg-bg">
      <div
        ref={hostRef}
        role="img"
        aria-label={props.label ?? 'The Try it test area'}
        className="size-full"
        style={smaller ? { imageRendering: 'pixelated' } : undefined}
      />
      {status.state === 'loading' ? (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted">
          Loading the test area…
        </p>
      ) : null}
      {status.state === 'error' ? (
        <p role="alert" className="absolute inset-x-0 top-0 p-2 text-sm text-error">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
