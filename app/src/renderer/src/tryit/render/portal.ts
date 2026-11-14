/**
 * Portal looks in Try it's view (ADR 0085 D5, slice 2; portal blocks ADR 0077): a portal block
 * is drawn as its translucent picture, playing the picture's frames (`.png.mcmeta`), on the two
 * faces of the runtime's thin portal shape (4 pixels thick across its `axis`). Portals do not
 * travel here (limit L12); stepping in is the simulation's to log.
 *
 * deepslate does not draw portal blocks: {@link withoutPortals} hides them from the grid it
 * meshes (deepslate would show only the first frame, and without the client jar the vanilla
 * parent model is missing). The picture is the model's `portal` texture from the lowered
 * blockstate and models: a project picture, or the vanilla one read from the user's client jar
 * cache as every block texture is (ADR 0011). Without a picture the portal is a plain
 * translucent violet pane.
 *
 * Part of the lazy Try it chunk.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { type BlockPos, type BlockState, readJsonFile, type SimFiles } from '@msm/sim';
import {
  frameRect,
  parseTextureAnimation,
  stepAtTick,
  type TextureAnimation,
} from '../../preview/animation';
import {
  normaliseId,
  type ResourceFolders,
  textureLocations,
  type VanillaAssetReader,
  vanillaJsonPath,
} from '../../preview/model-chain';
import { FLOATS_PER_VERTEX, pixelTexture, type QuadBatch, type QuadRun } from './particles';
import type { TryItGrid, TryItGridChange } from './world-structure';

/** The portal picture vanilla's portal models fall back to (ADR 0077 D8). */
export const DEFAULT_PORTAL_TEXTURE = 'minecraft:block/nether_portal';
/** The runtime's shape: 6 to 10 pixels across the axis (ADR 0077 findings). */
export const PORTAL_NEAR = 6 / 16;
export const PORTAL_FAR = 10 / 16;
/** The pane drawn when no picture can be read: MSM's own violet, see-through. */
export const PORTAL_FALLBACK_RGBA: readonly [number, number, number, number] = [
  0.55, 0.42, 0.86, 0.6,
];

const BLOCK_PATH = /^msm\/([a-z0-9_.-]+)\/block\/(.+)\.json$/;

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A portal block's pictures by `axis` value. */
export interface PortalLook {
  readonly id: string;
  /** The texture id of each axis (`x`, `z`). */
  readonly textures: Readonly<Record<string, string>>;
}

/** The first model a blockstate variant names. */
function variantModel(variant: Json | undefined): string | undefined {
  const first = Array.isArray(variant) ? variant[0] : variant;
  return isObject(first) && typeof first.model === 'string' ? first.model : undefined;
}

/**
 * Every project portal block (type `portal` in `msm/<ns>/block/<path>.json`) with its picture
 * per axis, from the lowered blockstate and models.
 */
export function portalLooksFromFiles(
  files: SimFiles,
  folders: Pick<ResourceFolders, 'block_definition' | 'model'>,
): Map<string, PortalLook> {
  const out = new Map<string, PortalLook>();
  for (const path of [...files.keys()].sort()) {
    const match = BLOCK_PATH.exec(path);
    if (match === null) continue;
    const definition = readJsonFile(files, path);
    if (!isObject(definition) || definition.type !== 'portal') continue;
    const id = `${match[1]}:${match[2]}`;
    const blockstate = readJsonFile(files, vanillaJsonPath(id, folders.block_definition));
    const variants =
      isObject(blockstate) && isObject(blockstate.variants) ? blockstate.variants : {};
    const textures: Record<string, string> = {};
    for (const axis of ['x', 'z']) {
      const model = variantModel(variants[`axis=${axis}`]);
      let texture: string | undefined;
      if (model !== undefined) {
        const json = readJsonFile(files, vanillaJsonPath(normaliseId(model), folders.model));
        const modelTextures = isObject(json) && isObject(json.textures) ? json.textures : {};
        const portal = modelTextures.portal;
        if (typeof portal === 'string' && !portal.startsWith('#')) texture = portal;
      }
      textures[axis] = normaliseId(texture ?? DEFAULT_PORTAL_TEXTURE);
    }
    out.set(id, Object.freeze({ id, textures: Object.freeze(textures) }));
  }
  return out;
}

/**
 * The grid without portal blocks, for deepslate: portals read as air and their changes still
 * reach the renderer (so a removed portal's chunk is rebuilt too).
 */
export function withoutPortals(grid: TryItGrid, isPortal: (id: string) => boolean): TryItGrid {
  const view: TryItGrid = {
    sizeX: grid.sizeX,
    sizeY: grid.sizeY,
    sizeZ: grid.sizeZ,
    get: (pos) => {
      const state = grid.get(pos);
      return state === null || isPortal(state.name) ? null : state;
    },
    *blocks() {
      for (const block of grid.blocks()) if (!isPortal(block.state.name)) yield block;
    },
  };
  if (grid.onChange !== undefined) {
    const onChange = grid.onChange.bind(grid);
    view.onChange = (listener: (change: TryItGridChange) => void) => onChange(listener);
  }
  return view;
}

/** The portal blocks of a grid, kept from its change events (or found again each frame). */
export class PortalIndex {
  private grid: TryItGrid | null = null;
  private unsubscribe: (() => void) | null = null;
  private index: Map<string, BlockPos> | null = null;
  private isPortal: (id: string) => boolean = () => false;

  /** Follows `grid` and counts `isPortal` blocks; a new test starts a new scan. */
  follow(grid: TryItGrid, isPortal: (id: string) => boolean): void {
    if (isPortal !== this.isPortal) {
      this.isPortal = isPortal;
      this.index = null;
    }
    if (grid === this.grid) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.grid = grid;
    this.index = null;
    if (grid.onChange !== undefined) {
      this.unsubscribe = grid.onChange(({ pos }) => {
        if (this.index === null) return;
        const key = `${pos.x},${pos.y},${pos.z}`;
        const state = grid.get(pos);
        if (state !== null && this.isPortal(state.name)) this.index.set(key, pos);
        else this.index.delete(key);
      });
    }
  }

  /** The portal blocks with their states, in a fixed order. */
  portals(): { pos: BlockPos; state: BlockState }[] {
    const grid = this.grid;
    if (grid === null) return [];
    if (this.index === null || grid.onChange === undefined) {
      const index = new Map<string, BlockPos>();
      for (const { pos, state } of grid.blocks()) {
        if (this.isPortal(state.name)) index.set(`${pos.x},${pos.y},${pos.z}`, pos);
      }
      this.index = index;
    }
    const out: { pos: BlockPos; state: BlockState }[] = [];
    for (const pos of this.index.values()) {
      const state = grid.get(pos);
      if (state !== null) out.push({ pos, state });
    }
    return out;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.grid = null;
    this.index = null;
  }
}

/** A rectangle of texture coordinates, 0..1. */
export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** The whole picture. */
export const FULL_UV: UvRect = Object.freeze({ u0: 0, v0: 0, u1: 1, v1: 1 });

/** The texture coordinates of the frame showing at `tick` (the whole picture when still). */
export function portalFrameUv(
  animation: TextureAnimation | null,
  width: number,
  height: number,
  tick: number,
): UvRect {
  if (animation === null || width < 1 || height < 1) return FULL_UV;
  const step = stepAtTick(animation, tick);
  const index = (animation.frames[step] ?? animation.frames[0])?.index ?? 0;
  const rect = frameRect(animation, index, width);
  return {
    u0: rect.x / width,
    v0: rect.y / height,
    u1: (rect.x + rect.width) / width,
    v1: (rect.y + rect.height) / height,
  };
}

/**
 * The two faces of a portal block as triangles (six vertices each), written into `out` at
 * `offset`; returns the next offset. `axis` `x` spans x (thin across z), `z` spans z.
 */
export function writePortalFaces(
  out: Float32Array,
  offset: number,
  pos: BlockPos,
  axis: string,
  uv: UvRect,
  rgba: readonly [number, number, number, number],
): number {
  let at = offset;
  const { x, y, z } = pos;
  for (const depth of [PORTAL_NEAR, PORTAL_FAR]) {
    // Corners from bottom left, counter-clockwise; texture v grows downwards.
    const corners: [number, number, number, number, number][] =
      axis === 'z'
        ? [
            [x + depth, y, z, uv.u0, uv.v1],
            [x + depth, y, z + 1, uv.u1, uv.v1],
            [x + depth, y + 1, z + 1, uv.u1, uv.v0],
            [x + depth, y + 1, z, uv.u0, uv.v0],
          ]
        : [
            [x, y, z + depth, uv.u0, uv.v1],
            [x + 1, y, z + depth, uv.u1, uv.v1],
            [x + 1, y + 1, z + depth, uv.u1, uv.v0],
            [x, y + 1, z + depth, uv.u0, uv.v0],
          ];
    for (const corner of [0, 1, 2, 0, 2, 3]) {
      const [cx, cy, cz, u, v] = corners[corner] as [number, number, number, number, number];
      out[at] = cx;
      out[at + 1] = cy;
      out[at + 2] = cz;
      out[at + 3] = u;
      out[at + 4] = v;
      out[at + 5] = rgba[0];
      out[at + 6] = rgba[1];
      out[at + 7] = rgba[2];
      out[at + 8] = rgba[3];
      at += FLOATS_PER_VERTEX;
    }
  }
  return at;
}

/** Where the portal pass reads pictures. */
export interface PortalPictureSource {
  files: SimFiles;
  folders: ResourceFolders;
  vanilla: VanillaAssetReader | null;
  readProjectAsset?: (namespace: string, path: string) => Promise<Uint8Array | null>;
}

/** A loaded portal picture. */
interface PortalPicture {
  texture: WebGLTexture;
  width: number;
  height: number;
  animation: TextureAnimation | null;
}

/** Decodes PNG bytes to an image `texImage2D` takes, with its size; `null` when it fails. */
export type DecodeSizedPicture = (
  bytes: Uint8Array,
) => Promise<(TexImageSource & { width: number; height: number }) | null>;

const defaultDecode: DecodeSizedPicture = async (bytes) => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch {
    return null;
  }
};

/** Reads a texture's bytes: the lowered files, the project, then the vanilla cache. */
export async function readTexture(
  source: PortalPictureSource,
  id: string,
  suffix = '',
): Promise<Uint8Array | null> {
  const { namespace, projectPath, vanillaPath } = textureLocations(id, source.folders);
  const lowered = source.files.get(`${vanillaPath}${suffix}`);
  if (lowered !== undefined) {
    return typeof lowered === 'string' ? new TextEncoder().encode(lowered) : lowered;
  }
  if (namespace !== 'minecraft' && source.readProjectAsset !== undefined) {
    const bytes = await source
      .readProjectAsset(namespace, `${projectPath}${suffix}`)
      .catch(() => null);
    if (bytes !== null) return bytes;
  }
  if (source.vanilla === null) return null;
  return source.vanilla.readAsset(`${vanillaPath}${suffix}`).catch(() => null);
}

/** Try it's portal pass: each portal block's two faces, see-through, far to near. */
export class PortalPass {
  private readonly batch: QuadBatch;
  private readonly pictures = new Map<string, PortalPicture | null>();
  private readonly loading = new Set<string>();
  private source: PortalPictureSource;
  private generation = 0;
  private vertices = new Float32Array(64 * 12 * FLOATS_PER_VERTEX);
  private readonly decode: DecodeSizedPicture;

  constructor(
    batch: QuadBatch,
    source: PortalPictureSource,
    decode: DecodeSizedPicture = defaultDecode,
  ) {
    this.batch = batch;
    this.source = source;
    this.decode = decode;
  }

  /** New files, folders or vanilla cache: pictures are loaded again. */
  setSource(source: PortalPictureSource): void {
    const before = this.source;
    this.source = source;
    // The reader is often a new function on each render; only new files or folders reload.
    if (
      before.files === source.files &&
      before.folders === source.folders &&
      before.vanilla === source.vanilla
    ) {
      return;
    }
    this.generation += 1;
    for (const picture of this.pictures.values()) {
      if (picture !== null) this.batch.gl.deleteTexture(picture.texture);
    }
    this.pictures.clear();
    this.loading.clear();
  }

  private pictureFor(id: string): PortalPicture | null {
    const known = this.pictures.get(id);
    if (known !== undefined || this.loading.has(id)) return known ?? null;
    this.loading.add(id);
    const generation = this.generation;
    const source = this.source;
    void (async () => {
      const bytes = await readTexture(source, id);
      const image = bytes === null ? null : await this.decode(bytes);
      let animation: TextureAnimation | null = null;
      if (image !== null) {
        const sidecar = await readTexture(source, id, '.mcmeta');
        if (sidecar !== null) {
          try {
            animation = parseTextureAnimation(
              JSON.parse(new TextDecoder().decode(sidecar)),
              image.width,
              image.height,
            );
          } catch {
            animation = null;
          }
        }
      }
      if (generation !== this.generation) return;
      this.loading.delete(id);
      this.pictures.set(
        id,
        image === null
          ? null
          : {
              texture: pixelTexture(this.batch.gl, 0, 0, image),
              width: image.width,
              height: image.height,
              animation,
            },
      );
    })().catch(() => {
      if (generation === this.generation) this.loading.delete(id);
    });
    return null;
  }

  /**
   * Draws `portals` at game tick `tick` (fractional; frames step whole ticks). `clip` is
   * projection times view. Returns how many portal blocks were drawn.
   */
  draw(
    portals: readonly { pos: BlockPos; state: BlockState }[],
    looks: ReadonlyMap<string, PortalLook>,
    tick: number,
    clip: ArrayLike<number>,
    eye: { x: number; y: number; z: number },
  ): number {
    if (portals.length === 0) return 0;
    const needed = portals.length * 12 * FLOATS_PER_VERTEX;
    if (this.vertices.length < needed) this.vertices = new Float32Array(needed);
    const sorted = portals
      .map((portal) => ({
        portal,
        distance:
          (portal.pos.x + 0.5 - eye.x) ** 2 +
          (portal.pos.y + 0.5 - eye.y) ** 2 +
          (portal.pos.z + 0.5 - eye.z) ** 2,
      }))
      .sort((a, b) => b.distance - a.distance);
    const runs: QuadRun[] = [];
    let offset = 0;
    for (const { portal } of sorted) {
      const axis = portal.state.properties.axis === 'z' ? 'z' : 'x';
      const look = looks.get(portal.state.name);
      const textureId = look?.textures[axis] ?? DEFAULT_PORTAL_TEXTURE;
      const picture = this.pictureFor(textureId);
      const uv =
        picture === null
          ? FULL_UV
          : portalFrameUv(picture.animation, picture.width, picture.height, tick);
      const rgba = picture === null ? PORTAL_FALLBACK_RGBA : ([1, 1, 1, 1] as const);
      const texture = picture?.texture ?? this.batch.white;
      const first = offset / FLOATS_PER_VERTEX;
      offset = writePortalFaces(this.vertices, offset, portal.pos, axis, uv, rgba);
      const last = runs[runs.length - 1];
      if (last !== undefined && last.texture === texture) last.count += 12;
      else runs.push({ texture, first, count: 12, cutout: 0.004, depthWrite: false });
    }
    this.batch.draw(clip, this.vertices.subarray(0, offset), runs);
    return portals.length;
  }

  dispose(): void {
    this.generation += 1;
    for (const picture of this.pictures.values()) {
      if (picture !== null) this.batch.gl.deleteTexture(picture.texture);
    }
    this.pictures.clear();
  }
}
