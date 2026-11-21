/**
 * Project fluids in Try it's view (B483, ADR 0099, ADR 0101 D5): each poured source is drawn as
 * a see-through block of liquid, its top (8/9 of a block high under open air, as a source in the
 * game looks) with the fluid's still picture and its sides with the flowing picture, both playing
 * their frames (`.png.mcmeta`) and multiplied by the fluid's tint, as the runtime's renderer does
 * (B475). Faces against the same fluid are left out. Nothing flows (limit Q29): the simulation
 * keeps sources only.
 *
 * deepslate does not draw them: the liquid block's model has no elements (B477), and the view
 * hides fluid blocks from the grid it meshes as it hides portals. The pictures are read as every
 * Try it picture is: the lowered files, the project, then the vanilla cache from the user's
 * client jar (ADR 0011). Without a picture a fluid is a plain see-through pane in its tint (or
 * MSM's own water blue or lava orange).
 *
 * Part of the lazy Try it chunk.
 */

import type { BlockPos, BlockState, FluidSpec } from '@msm/sim';
import { parseTextureAnimation, type TextureAnimation } from '../../preview/animation';
import { normaliseId } from '../../preview/model-chain';
import { FLOATS_PER_VERTEX, pixelTexture, type QuadBatch, type QuadRun } from '../render/particles';
import {
  type DecodeSizedPicture,
  FULL_UV,
  type PortalPictureSource,
  portalFrameUv,
  readTexture,
  type UvRect,
} from '../render/portal';

/** How a fluid is drawn. */
export interface FluidLook {
  readonly id: string;
  /** The still and flowing pictures (texture ids), when the model names them. */
  readonly still?: string;
  readonly flowing?: string;
  /** The tint as 0..1 RGB, or `null` for none. */
  readonly tint: readonly [number, number, number] | null;
  /** Lava-like fluids draw opaque in their fallback colour. */
  readonly behavesLike: FluidSpec['behavesLike'];
}

/** A source's surface under open air: 8/9 of a block, as the game draws one. */
export const SOURCE_HEIGHT = 8 / 9;
/** MSM's own colours of a fluid without a picture and without a tint. */
export const FALLBACK_WATER: readonly [number, number, number] = [0.25, 0.46, 0.89];
export const FALLBACK_LAVA: readonly [number, number, number] = [0.85, 0.4, 0.12];
/** How see-through a fluid without a picture is (lava-like ones are opaque). */
export const FALLBACK_ALPHA = 0.7;

/** `[r, g, b]` from `0xRRGGBB`. */
export function rgbOf(colour: number): [number, number, number] {
  return [((colour >> 16) & 0xff) / 255, ((colour >> 8) & 0xff) / 255, (colour & 0xff) / 255];
}

/** The looks of the project's fluids, from the simulation's fluid catalogue. */
export function fluidLooks(fluids: readonly FluidSpec[]): Map<string, FluidLook> {
  const out = new Map<string, FluidLook>();
  for (const fluid of fluids) {
    out.set(
      fluid.id,
      Object.freeze({
        id: fluid.id,
        ...(fluid.textures.still === undefined ? {} : { still: normaliseId(fluid.textures.still) }),
        ...(fluid.textures.flowing === undefined
          ? {}
          : { flowing: normaliseId(fluid.textures.flowing) }),
        tint: fluid.tint === undefined ? null : rgbOf(fluid.tint),
        behavesLike: fluid.behavesLike,
      }),
    );
  }
  return out;
}

/** The six faces, with their direction. */
const FACES = [
  { face: 'up', d: [0, 1, 0] },
  { face: 'down', d: [0, -1, 0] },
  { face: 'north', d: [0, 0, -1] },
  { face: 'south', d: [0, 0, 1] },
  { face: 'west', d: [-1, 0, 0] },
  { face: 'east', d: [1, 0, 0] },
] as const;

/** Which faces of a fluid block show: none against the same fluid or the area's floor. */
export function fluidFaces(
  pos: BlockPos,
  id: string,
  at: (pos: BlockPos) => BlockState | null,
): { faces: (typeof FACES)[number]['face'][]; height: number } {
  const same = (dx: number, dy: number, dz: number): boolean =>
    at({ x: pos.x + dx, y: pos.y + dy, z: pos.z + dz })?.name === id;
  const faces = FACES.filter(({ face, d }) => {
    if (face === 'down' && pos.y === 0) return false;
    return !same(d[0], d[1], d[2]);
  }).map(({ face }) => face);
  return { faces, height: same(0, 1, 0) ? 1 : SOURCE_HEIGHT };
}

/**
 * One face of a fluid block as two triangles (six vertices), written into `out` at `offset`;
 * returns the next offset. Sides take the top `height` of the picture.
 */
export function writeFluidFace(
  out: Float32Array,
  offset: number,
  pos: BlockPos,
  face: (typeof FACES)[number]['face'],
  height: number,
  uv: UvRect,
  rgba: readonly [number, number, number, number],
): number {
  const { x, y, z } = pos;
  const top = y + height;
  const vTop = uv.v0;
  const vBottom = face === 'up' || face === 'down' ? uv.v1 : uv.v0 + (uv.v1 - uv.v0) * height;
  // Corners from bottom left, counter-clockwise seen from outside; texture v grows downwards.
  const corners: Record<typeof face, [number, number, number, number, number][]> = {
    up: [
      [x, top, z + 1, uv.u0, vBottom],
      [x + 1, top, z + 1, uv.u1, vBottom],
      [x + 1, top, z, uv.u1, vTop],
      [x, top, z, uv.u0, vTop],
    ],
    down: [
      [x, y, z, uv.u0, vBottom],
      [x + 1, y, z, uv.u1, vBottom],
      [x + 1, y, z + 1, uv.u1, vTop],
      [x, y, z + 1, uv.u0, vTop],
    ],
    north: [
      [x + 1, y, z, uv.u0, vBottom],
      [x, y, z, uv.u1, vBottom],
      [x, top, z, uv.u1, vTop],
      [x + 1, top, z, uv.u0, vTop],
    ],
    south: [
      [x, y, z + 1, uv.u0, vBottom],
      [x + 1, y, z + 1, uv.u1, vBottom],
      [x + 1, top, z + 1, uv.u1, vTop],
      [x, top, z + 1, uv.u0, vTop],
    ],
    west: [
      [x, y, z, uv.u0, vBottom],
      [x, y, z + 1, uv.u1, vBottom],
      [x, top, z + 1, uv.u1, vTop],
      [x, top, z, uv.u0, vTop],
    ],
    east: [
      [x + 1, y, z + 1, uv.u0, vBottom],
      [x + 1, y, z, uv.u1, vBottom],
      [x + 1, top, z, uv.u1, vTop],
      [x + 1, top, z + 1, uv.u0, vTop],
    ],
  };
  let at = offset;
  const quad = corners[face];
  for (const corner of [0, 1, 2, 0, 2, 3]) {
    const [cx, cy, cz, u, v] = quad[corner] as [number, number, number, number, number];
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
  return at;
}

/** The colour a face is multiplied by: the tint over a picture, or the fallback pane. */
export function fluidColour(
  look: FluidLook | undefined,
  hasPicture: boolean,
): readonly [number, number, number, number] {
  const tint = look?.tint ?? null;
  if (hasPicture) return tint === null ? [1, 1, 1, 1] : [tint[0], tint[1], tint[2], 1];
  const lava = look?.behavesLike === 'lava';
  const base = tint ?? (lava ? FALLBACK_LAVA : FALLBACK_WATER);
  return [base[0], base[1], base[2], lava ? 1 : FALLBACK_ALPHA];
}

/** A loaded fluid picture. */
interface FluidPicture {
  texture: WebGLTexture;
  width: number;
  height: number;
  animation: TextureAnimation | null;
}

const defaultDecode: DecodeSizedPicture = async (bytes) => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch {
    return null;
  }
};

/** Try it's fluid pass: each fluid block's visible faces, see-through, far to near. */
export class FluidPass {
  private readonly batch: QuadBatch;
  private readonly pictures = new Map<string, FluidPicture | null>();
  private readonly loading = new Set<string>();
  private source: PortalPictureSource;
  private generation = 0;
  private vertices = new Float32Array(64 * 36 * FLOATS_PER_VERTEX);
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

  private pictureFor(id: string | undefined): FluidPicture | null {
    if (id === undefined) return null;
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

  /** The frame of a picture at `tick`; a flowing picture shows its top left quarter, as the game's. */
  private frame(picture: FluidPicture | null, tick: number, flowing: boolean): UvRect {
    if (picture === null) return FULL_UV;
    const uv = portalFrameUv(picture.animation, picture.width, picture.height, tick);
    if (!flowing) return uv;
    return {
      u0: uv.u0,
      v0: uv.v0,
      u1: uv.u0 + (uv.u1 - uv.u0) / 2,
      v1: uv.v0 + (uv.v1 - uv.v0) / 2,
    };
  }

  /**
   * Draws `blocks` at game tick `tick` with their neighbours from `at`. `clip` is projection
   * times view. Returns how many fluid blocks were drawn.
   */
  draw(
    blocks: readonly { pos: BlockPos; state: BlockState }[],
    looks: ReadonlyMap<string, FluidLook>,
    at: (pos: BlockPos) => BlockState | null,
    tick: number,
    clip: ArrayLike<number>,
    eye: { x: number; y: number; z: number },
  ): number {
    if (blocks.length === 0) return 0;
    const needed = blocks.length * 36 * FLOATS_PER_VERTEX;
    if (this.vertices.length < needed) this.vertices = new Float32Array(needed);
    const sorted = blocks
      .map((block) => ({
        block,
        distance:
          (block.pos.x + 0.5 - eye.x) ** 2 +
          (block.pos.y + 0.5 - eye.y) ** 2 +
          (block.pos.z + 0.5 - eye.z) ** 2,
      }))
      .sort((a, b) => b.distance - a.distance);
    const runs: QuadRun[] = [];
    let offset = 0;
    for (const { block } of sorted) {
      const look = looks.get(block.state.name);
      const { faces, height } = fluidFaces(block.pos, block.state.name, at);
      for (const face of faces) {
        const flowing = face !== 'up' && face !== 'down';
        const id = flowing ? (look?.flowing ?? look?.still) : look?.still;
        const picture = this.pictureFor(id);
        const uv = this.frame(picture, tick, flowing && id === look?.flowing);
        const texture = picture?.texture ?? this.batch.white;
        const first = offset / FLOATS_PER_VERTEX;
        offset = writeFluidFace(
          this.vertices,
          offset,
          block.pos,
          face,
          height,
          uv,
          fluidColour(look, picture !== null),
        );
        const last = runs[runs.length - 1];
        if (last !== undefined && last.texture === texture) last.count += 6;
        else runs.push({ texture, first, count: 6, cutout: 0.004, depthWrite: false });
      }
    }
    this.batch.draw(clip, this.vertices.subarray(0, offset), runs);
    return blocks.length;
  }

  dispose(): void {
    this.generation += 1;
    for (const picture of this.pictures.values()) {
      if (picture !== null) this.batch.gl.deleteTexture(picture.texture);
    }
    this.pictures.clear();
  }
}
