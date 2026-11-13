/**
 * Which chunk layer a project texture draws in (ADR 0059 D4) and the session's
 * `blocks-items.transparent-texture-on-solid-block` warning.
 *
 * Minecraft 26.x picks the layer from the sprite's pixels, with no code: no transparent
 * pixels is solid, only fully transparent ones (alpha 0) is cut-out, any partly transparent
 * one is translucent ("see-through"). A block that is not see-through (`isSeeThroughBlock`)
 * but whose model textures have transparent pixels shows holes into the world, so the session
 * warns. Only project textures are read (vanilla ones stay in the extraction cache); the PNG
 * is decoded here with the platform's `DecompressionStream`, and each file's layer is cached
 * until asset bytes change.
 *
 * @packageDocumentation
 */

import type { Element, Json, Problem, Project } from '@msm/core';
import { isSeeThroughBlock, transparentTextureProblem } from '@msm/plugin-blocks-items';

/** The layer a texture draws in. */
export type TextureLayer = 'solid' | 'cutout' | 'translucent';

/** The words the Block Studio shows for a layer (ADR 0059 D4). */
export const TEXTURE_LAYER_LABELS: Readonly<Record<TextureLayer, string>> = Object.freeze({
  solid: 'solid',
  cutout: 'cut-out',
  translucent: 'see-through',
});

/** One project texture of a block's model and the file that holds it. */
export interface BlockTexture {
  /** The texture id, for example `demo:block/ruby_glass`. */
  texture: string;
  namespace: string;
  /** Relative to `assets/<namespace>/`, for example `textures/block/ruby_glass.png`. */
  path: string;
}

const BLOCK_KIND = 'msm:block';
const MODEL_KIND = 'minecraft:model';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `id` with the `minecraft` namespace when it has none. */
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

// PNG -------------------------------------------------------------------------------------

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    length += value.length;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Adam7 passes: x start, y start, x step, y step. */
const ADAM7: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/**
 * The layer a PNG draws in: `translucent` when any pixel has an alpha strictly between 0 and
 * the maximum, `cutout` when some are fully transparent and none partly, else `solid`. Grey
 * and true-colour images count their `tRNS` colour key as fully transparent; palette images
 * read `tRNS` per index.
 *
 * @param bytes - The PNG file.
 * @throws Error If the bytes are not a readable PNG.
 */
export async function pngLayer(bytes: Uint8Array): Promise<TextureLayer> {
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) {
    throw new Error('Not a PNG file.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 8;
  let colour = 6;
  let interlace = 0;
  let trns: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      depth = bytes[offset + 16] ?? 8;
      colour = bytes[offset + 17] ?? 6;
      interlace = bytes[offset + 20] ?? 0;
    } else if (type === 'tRNS') {
      trns = body;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0 || idat.length === 0) throw new Error('Not a PNG file.');
  const hasAlphaChannel = colour === 4 || colour === 6;
  if (!hasAlphaChannel && trns === undefined) return 'solid';
  if (colour === 3 && trns !== undefined && trns.every((alpha) => alpha === 255)) return 'solid';

  const channels = colour === 0 || colour === 3 ? 1 : colour === 4 ? 2 : colour === 2 ? 3 : 4;
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const max = (1 << depth) - 1;
  const data = await inflate(Uint8Array.from(idat.flatMap((part) => [...part])));

  // The colour key of grey or true-colour images, as samples.
  const key: number[] =
    trns === undefined || colour === 3 || hasAlphaChannel
      ? []
      : colour === 0
        ? [((trns[0] ?? 0) << 8) | (trns[1] ?? 0)]
        : [0, 2, 4].map((i) => ((trns[i] ?? 0) << 8) | (trns[i + 1] ?? 0));

  let zero = false;
  let partial = false;
  const sample = (line: Uint8Array, index: number): number => {
    if (depth === 16) return ((line[index * 2] ?? 0) << 8) | (line[index * 2 + 1] ?? 0);
    if (depth === 8) return line[index] ?? 0;
    const bit = index * depth;
    return ((line[bit >> 3] ?? 0) >> (8 - depth - (bit & 7))) & max;
  };
  const visit = (line: Uint8Array, pixels: number) => {
    for (let x = 0; x < pixels && !partial; x++) {
      let alpha: number;
      let full = max;
      if (hasAlphaChannel) {
        alpha = sample(line, x * channels + channels - 1);
      } else if (colour === 3) {
        alpha = trns?.[sample(line, x)] ?? 255;
        full = 255;
      } else {
        const matches = key.every((value, c) => sample(line, x * channels + c) === value);
        alpha = matches ? 0 : max;
      }
      if (alpha === 0) zero = true;
      else if (alpha < full) partial = true;
    }
  };

  const passes = interlace === 1 ? ADAM7 : [[0, 0, 1, 1] as const];
  let offset = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pixels = Math.ceil((width - x0) / dx);
    const rows = Math.ceil((height - y0) / dy);
    if (pixels <= 0 || rows <= 0) continue;
    const stride = Math.ceil((pixels * bitsPerPixel) / 8);
    let previous = new Uint8Array(stride);
    for (let y = 0; y < rows; y++) {
      const filter = data[offset] ?? 0;
      const raw = data.subarray(offset + 1, offset + 1 + stride);
      offset += 1 + stride;
      const line = new Uint8Array(stride);
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? (line[i - bpp] ?? 0) : 0;
        const up = previous[i] ?? 0;
        const corner = i >= bpp ? (previous[i - bpp] ?? 0) : 0;
        const value = raw[i] ?? 0;
        line[i] =
          (filter === 1
            ? value + left
            : filter === 2
              ? value + up
              : filter === 3
                ? value + ((left + up) >> 1)
                : filter === 4
                  ? value + paeth(left, up, corner)
                  : value) & 255;
      }
      visit(line, pixels);
      if (partial) return 'translucent';
      previous = line;
    }
  }
  return zero ? 'cutout' : 'solid';
}

// Block textures --------------------------------------------------------------------------

/**
 * The project textures a block model uses: its `textures` merged with those of its project
 * parents (the child's entry wins), without `#` references and the `particle` texture, kept
 * only when the project has the PNG. Vanilla models and textures are not followed.
 *
 * @param project - The project.
 * @param model - The block's model id.
 */
export function modelTextures(project: Project, model: string): BlockTexture[] {
  const models = new Map<string, JsonObject>();
  const assets = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === MODEL_KIND && isObject(element.data)) {
        models.set(element.id, element.data);
      }
    }
    for (const asset of namespace.assets) assets.add(`${namespace.name}\u0000${asset.path}`);
  }
  const textures = new Map<string, string>();
  const seen = new Set<string>();
  for (let current: string | undefined = namespaced(model); current !== undefined; ) {
    const data = models.get(current);
    if (data === undefined || seen.has(current)) break;
    seen.add(current);
    if (isObject(data.textures)) {
      for (const [slot, value] of Object.entries(data.textures)) {
        if (!textures.has(slot) && typeof value === 'string') textures.set(slot, value);
      }
    }
    current = typeof data.parent === 'string' ? namespaced(data.parent) : undefined;
  }
  const out = new Map<string, BlockTexture>();
  for (const [slot, value] of textures) {
    if (slot === 'particle' || value.startsWith('#') || value === '') continue;
    const texture = namespaced(value);
    const [namespace = '', path = ''] = texture.split(':');
    const file = `textures/${path}.png`;
    if (assets.has(`${namespace}\u0000${file}`)) {
      out.set(texture, { texture, namespace, path: file });
    }
  }
  return [...out.values()].sort((a, b) => (a.texture < b.texture ? -1 : 1));
}

/**
 * Layers of project texture files, read once per file until {@link clear} (asset bytes
 * changed). A read that started before a clear is not kept.
 */
export class TextureLayerCache {
  #layers = new Map<string, Promise<TextureLayer | undefined>>();
  #epoch = 0;

  /**
   * The layer of `assets/<namespace>/<path>`, or `undefined` when it cannot be read or
   * decoded.
   */
  layer(
    texture: BlockTexture,
    read: (namespace: string, path: string) => Promise<Uint8Array>,
  ): Promise<TextureLayer | undefined> {
    const key = `${texture.namespace}\u0000${texture.path}`;
    const known = this.#layers.get(key);
    if (known !== undefined) return known;
    const epoch = this.#epoch;
    const pending = read(texture.namespace, texture.path).then(pngLayer, () => undefined);
    const result = pending.catch(() => undefined);
    if (epoch === this.#epoch) this.#layers.set(key, result);
    return result;
  }

  /** Forgets every layer (asset bytes may have changed). */
  clear(): void {
    this.#layers.clear();
    this.#epoch += 1;
  }
}

/**
 * The `blocks-items.transparent-texture-on-solid-block` warnings of `project` (ADR 0059 D4):
 * one per block that is not see-through and per project texture of its model with
 * transparent pixels.
 *
 * @param project - The project.
 * @param layerOf - The layer of one texture (cached by the caller).
 */
export async function transparentTextureProblems(
  project: Project,
  layerOf: (texture: BlockTexture) => Promise<TextureLayer | undefined>,
): Promise<Problem[]> {
  const blocks: Element[] = project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === BLOCK_KIND);
  const problems: Problem[] = [];
  for (const block of blocks) {
    const data = block.data;
    if (!isObject(data) || typeof data.model !== 'string' || data.model === '') continue;
    if (isSeeThroughBlock(data)) continue;
    for (const texture of modelTextures(project, data.model)) {
      const layer = await layerOf(texture);
      if (layer === 'cutout' || layer === 'translucent') {
        problems.push(transparentTextureProblem(block.id, texture.texture));
      }
    }
  }
  return problems;
}
