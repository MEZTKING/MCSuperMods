/**
 * deepslate resources for the blocks Try it draws (ADR 0085 D3): block state definitions,
 * models and textures read from the project's lowered files first, then the extracted vanilla
 * cache (ADR 0011), then MSM's fallback parents (ADR 0010), through the preview's own model
 * chain (`preview/model-chain`, `preview/asset-source`). A block with no definition draws as
 * the preview's missing-texture cube.
 *
 * Unlike the single-subject preview, every block gets real flags (B385: marking every block
 * non-opaque, as the preview does, halves the frame rate): a block is opaque when each of its
 * models is a full cube whose six faces use fully opaque textures; it is drawn in the
 * see-through pass when one of its faces uses a texture with partly transparent pixels; a full
 * cube that is not opaque culls the faces it shares with itself (glass).
 *
 * A Minecraft block with no definition (no client jar, or a block the jar does not have) and the
 * liquids (always: the game draws them in code) draw as MSM's own plain coloured cubes from
 * `fallback-colours.ts` (B405), so a ground's blocks stay visible without the jar.
 *
 * Part of the lazy Try it chunk: it imports deepslate.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { SimFiles } from '@msm/sim';
import { Identifier } from 'deepslate/core';
import {
  BlockDefinition,
  type BlockFlags,
  BlockModel,
  type Resources,
  TextureAtlas,
  type TextureAtlasProvider,
} from 'deepslate/render';
import { MISSING_BLOCK_MODEL, prepareBlockResources } from '../../preview/asset-source';
import {
  collectBlockDefinitionModelRefs,
  collectTextureIds,
  createVanillaJsonCache,
  fallbackModelFor,
  type ModelLookup,
  mergedTextures,
  normaliseId,
  type ResolvedModel,
  type ResourceFolders,
  resolveModelChain,
  textureLocations,
  type VanillaAssetReader,
  vanillaJsonPath,
} from '../../preview/model-chain';
import {
  alwaysFallback,
  fallbackDefinition,
  fallbackModel,
  fallbackPicture,
  parseFallbackTextureId,
} from './fallback-colours';

/** Where Try it's pictures come from. */
export interface TryItResourceOptions {
  /** The project's lowered files by path (`assets/<namespace>/...`), as the simulation gets them. */
  files: SimFiles;
  /** The target's folder names under `assets/<namespace>/`. */
  folders: ResourceFolders;
  /**
   * Reads a project asset (`path` relative to `assets/<namespace>/`) the lowered files do not
   * hold, such as a texture; `null` when absent.
   */
  readProjectAsset?: (namespace: string, path: string) => Promise<Uint8Array | null>;
  /** The extracted vanilla cache, or `null` when the user has not set it up. */
  vanilla: VanillaAssetReader | null;
  /** Memoised vanilla JSON reads, shared across rebuilds; built from `vanilla` when omitted. */
  vanillaJson?: ((path: string) => Promise<JsonObject | null>) | null;
  fallbackModels?: Readonly<Record<string, JsonObject>>;
  /** Builds the texture atlas (default `TextureAtlas.fromBlobs`); injectable for tests. */
  createAtlas?: (textures: Record<string, Blob>) => Promise<TextureAtlasProvider>;
}

/** How a texture's pixels let light through. */
export type TextureAlpha = 'opaque' | 'cutout' | 'translucent';

/** Everything the Try it renderer needs for a set of blocks. */
export interface TryItResources {
  /** deepslate's synchronous providers. */
  resources: Resources;
  /** The block ids prepared (normalised). An id outside it draws nothing until re-prepared. */
  blockIds: ReadonlySet<string>;
  /** The flags of each prepared block. */
  flags: ReadonlyMap<string, BlockFlags>;
  /** Block ids with no block state definition; drawn with the missing texture. */
  missingDefinitions: string[];
  /** Models no source could provide. */
  missingModels: string[];
  /** Textures found neither in the files, the project nor the vanilla cache. */
  missingTextures: string[];
  /** True when at least one MSM fallback parent was used. */
  usedFallback: boolean;
  /** Minecraft blocks drawn as MSM's plain coloured cubes (no client jar, or liquids). */
  fallbackBlocks: string[];
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The text of a lowered file parsed as a JSON object, or `null`. */
function fileJson(files: SimFiles, path: string): JsonObject | null {
  const value = files.get(path);
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(
      typeof value === 'string' ? value : new TextDecoder().decode(value),
    ) as Json;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The model a missing definition or model draws: a cube whose texture is never in the atlas. */
const MISSING_BLOCK_JSON: JsonObject = {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: Object.fromEntries(
        ['down', 'up', 'north', 'south', 'west', 'east'].map((face) => [
          face,
          { cullface: face, texture: '#missing' },
        ]),
      ),
    },
  ],
  textures: { missing: 'msm:preview/missing' },
};

const FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** Drops textures the browser cannot decode, so one bad file does not fail the whole atlas. */
async function decodableOnly(textures: Record<string, Blob>): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  await Promise.all(
    Object.entries(textures).map(async ([id, blob]) => {
      try {
        const bitmap = await createImageBitmap(blob);
        bitmap.close();
        out[id] = blob;
      } catch {
        // Left out of the atlas: deepslate draws the missing-texture checker instead.
      }
    }),
  );
  return out;
}

const defaultCreateAtlas = async (textures: Record<string, Blob>): Promise<TextureAtlasProvider> =>
  TextureAtlas.fromBlobs(await decodableOnly(textures));

/**
 * How each texture's pixels let light through, read from the atlas image: `translucent` when a
 * pixel is partly transparent, `cutout` when some are fully transparent, else `opaque`.
 */
export function textureAlphaFromAtlas(
  atlas: TextureAtlasProvider,
  ids: Iterable<string>,
): Map<string, TextureAlpha> {
  const out = new Map<string, TextureAlpha>();
  let image: { width: number; height: number; data: ArrayLike<number> } | null = null;
  try {
    image = atlas.getTextureAtlas();
  } catch {
    image = null;
  }
  for (const id of ids) {
    if (image === null || image.data === undefined) {
      out.set(id, 'opaque');
      continue;
    }
    const [u0, v0, u1, v1] = atlas.getTextureUV(Identifier.parse(id)) as [
      number,
      number,
      number,
      number,
    ];
    const x0 = Math.max(0, Math.round(u0 * image.width));
    const y0 = Math.max(0, Math.round(v0 * image.height));
    const x1 = Math.min(image.width, Math.round(u1 * image.width));
    const y1 = Math.min(image.height, Math.round(v1 * image.height));
    let kind: TextureAlpha = 'opaque';
    for (let y = y0; y < y1 && kind !== 'translucent'; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const alpha = image.data[(y * image.width + x) * 4 + 3] as number;
        if (alpha === 255) continue;
        if (alpha === 0) kind = 'cutout';
        else {
          kind = 'translucent';
          break;
        }
      }
    }
    out.set(id, kind);
  }
  return out;
}

/** A resolved model chain from a model id down to its root parent. */
function chainOf(id: string, resolved: ReadonlyMap<string, ResolvedModel>): ResolvedModel[] {
  const chain: ResolvedModel[] = [];
  const seen = new Set<string>();
  let current = resolved.get(normaliseId(id));
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    const parent = current.json.parent;
    current = typeof parent === 'string' ? resolved.get(normaliseId(parent)) : undefined;
  }
  return chain;
}

/** What a model's geometry and textures say about the light it lets through. */
interface ModelLight {
  /** One unrotated element covers the whole block with all six faces. */
  fullCube: boolean;
  /** Every face of that cube uses an opaque texture. */
  opaqueCube: boolean;
  /** A face of any element uses a partly transparent texture. */
  translucent: boolean;
}

/** The light facts of one model chain, `alpha` giving each texture's kind. */
export function modelLight(
  chain: readonly ResolvedModel[],
  alpha: (texture: string) => TextureAlpha,
): ModelLight {
  const light: ModelLight = { fullCube: false, opaqueCube: false, translucent: false };
  const holder = chain.find((model) => Array.isArray(model.json.elements));
  if (holder === undefined) return light;
  const textures = mergedTextures(chain);
  const resolve = (ref: Json | undefined): string | null => {
    let value = typeof ref === 'string' ? ref : undefined;
    const seen = new Set<string>();
    while (value?.startsWith('#') && !seen.has(value)) {
      seen.add(value);
      value = textures.get(value.slice(1));
    }
    return value === undefined || value === '' || value.startsWith('#') ? null : normaliseId(value);
  };
  for (const element of holder.json.elements as Json[]) {
    if (!isObject(element) || !isObject(element.faces)) continue;
    const faces = element.faces;
    const kinds = new Map<string, TextureAlpha>();
    for (const [name, face] of Object.entries(faces)) {
      if (!isObject(face)) continue;
      const texture = resolve(face.texture);
      const kind = texture === null ? 'opaque' : alpha(texture);
      kinds.set(name, kind);
      if (kind === 'translucent') light.translucent = true;
    }
    const from = element.from;
    const to = element.to;
    const rotation = element.rotation;
    const unrotated =
      !isObject(rotation) || typeof rotation.angle !== 'number' || rotation.angle === 0;
    const whole =
      Array.isArray(from) &&
      Array.isArray(to) &&
      from.every((value) => value === 0) &&
      to.every((value) => value === 16);
    if (whole && unrotated && FACES.every((face) => kinds.has(face))) {
      light.fullCube = true;
      if (FACES.every((face) => kinds.get(face) === 'opaque')) light.opaqueCube = true;
    }
  }
  return light;
}

/** The deepslate flags of a block whose definition uses `models`. */
export function blockFlagsFor(models: readonly ModelLight[]): BlockFlags {
  if (models.length === 0) return { opaque: false };
  const opaque = models.every((model) => model.opaqueCube);
  const fullCube = models.every((model) => model.fullCube);
  const translucent = models.some((model) => model.translucent);
  return {
    opaque,
    ...(translucent ? { semi_transparent: true } : {}),
    ...(fullCube && !opaque ? { self_culling: true } : {}),
  };
}

/** Loads and wires everything needed to draw `blockIds`. */
export async function prepareTryItResources(
  blockIds: Iterable<string>,
  options: TryItResourceOptions,
): Promise<TryItResources> {
  const { files, folders } = options;
  const vanillaJson =
    options.vanillaJson ??
    (options.vanilla === null ? null : createVanillaJsonCache(options.vanilla));

  // 1. Block state definitions: lowered files, then the vanilla cache.
  const fallbackBlocks = new Set<string>();
  const fallback = (id: string): { json: JsonObject; source: 'project' } => {
    fallbackBlocks.add(id);
    return { json: fallbackDefinition(id), source: 'project' };
  };
  const definitionLookup = async (
    id: string,
  ): Promise<{ json: JsonObject; source: 'project' | 'vanilla' } | null> => {
    if (alwaysFallback(id)) return fallback(id);
    // Lowered files use the jar's own paths: `assets/<ns>/<folder>/<path>.json`.
    const json = fileJson(files, vanillaJsonPath(id, folders.block_definition));
    if (json !== null) return { json, source: 'project' };
    const isVanilla = id.startsWith('minecraft:');
    if (vanillaJson === null) return isVanilla ? fallback(id) : null;
    const vanilla = await vanillaJson(vanillaJsonPath(id, folders.block_definition));
    if (vanilla === null) return isVanilla ? fallback(id) : null;
    return { json: vanilla, source: 'vanilla' };
  };
  const ids = [...new Set([...blockIds].map(normaliseId))].sort();
  const blocks = await prepareBlockResources(ids, definitionLookup);

  // 2. Models: lowered files, then the vanilla cache, then MSM's fallback parents.
  const fallbackModels = new Map<string, JsonObject>();
  for (const block of fallbackBlocks) {
    const definition = fallbackDefinition(block);
    const variant = (definition.variants as Record<string, { model: string }>)[''];
    if (variant !== undefined) fallbackModels.set(variant.model, fallbackModel(block));
  }
  const modelLookup: ModelLookup = async (rawId) => {
    const id = normaliseId(rawId);
    const plain = fallbackModels.get(id);
    if (plain !== undefined) return { id, json: plain, source: 'project' };
    const json = fileJson(files, vanillaJsonPath(id, folders.model));
    if (json !== null) return { id, json, source: 'project' };
    if (vanillaJson !== null) {
      const vanilla = await vanillaJson(vanillaJsonPath(id, folders.model));
      if (vanilla !== null) return { id, json: vanilla, source: 'vanilla' };
    }
    const fallback = fallbackModelFor(id, options.fallbackModels);
    return fallback === null ? null : { id, json: fallback, source: 'fallback' };
  };
  const resolved = new Map<string, ResolvedModel>();
  const missingModels = new Set<string>();
  for (const root of blocks.models) {
    const result = await resolveModelChain(root, modelLookup);
    for (const model of result.chain) if (!resolved.has(model.id)) resolved.set(model.id, model);
    for (const id of result.missing) missingModels.add(id);
  }

  // 3. deepslate definitions and flattened models.
  const definitions = new Map<string, BlockDefinition>();
  for (const [id, json] of blocks.definitions) {
    definitions.set(id, BlockDefinition.fromJson(structuredClone(json)));
  }
  for (const id of blocks.missing) {
    definitions.set(
      id,
      BlockDefinition.fromJson({ variants: { '': { model: MISSING_BLOCK_MODEL } } }),
    );
  }
  const blockModels = new Map<string, BlockModel>();
  for (const [id, model] of resolved) {
    blockModels.set(id, BlockModel.fromJson(structuredClone(model.json)));
  }
  for (const id of [MISSING_BLOCK_MODEL, ...missingModels]) {
    blockModels.set(id, BlockModel.fromJson(structuredClone(MISSING_BLOCK_JSON)));
  }
  const getBlockModel = (id: Identifier): BlockModel | null =>
    blockModels.get(id.toString()) ?? null;
  for (const model of blockModels.values()) model.flatten({ getBlockModel });

  // 4. Textures: lowered files, then the project's assets, then the vanilla cache.
  const textureIds = new Set<string>();
  for (const root of blocks.models) {
    for (const id of collectTextureIds(chainOf(root, resolved))) textureIds.add(id);
  }
  const blobs: Record<string, Blob> = {};
  const missingTextures: string[] = [];
  for (const id of [...textureIds].sort()) {
    const plain = parseFallbackTextureId(id);
    if (plain !== null) {
      const bytes = fallbackPicture(plain.colour, plain.holes);
      blobs[id] = new Blob([bytes.slice()], { type: 'image/png' });
      continue;
    }
    const { namespace, projectPath, vanillaPath } = textureLocations(id, folders);
    const lowered = files.get(vanillaPath);
    let bytes: Uint8Array | null = lowered instanceof Uint8Array ? lowered : null;
    if (bytes === null && options.readProjectAsset !== undefined) {
      bytes = await options.readProjectAsset(namespace, projectPath).catch(() => null);
    }
    if (bytes === null && options.vanilla !== null) {
      bytes = await options.vanilla.readAsset(vanillaPath).catch(() => null);
    }
    if (bytes === null) {
      missingTextures.push(id);
      continue;
    }
    blobs[id] = new Blob([bytes.slice()], { type: 'image/png' });
  }
  const atlas = await (options.createAtlas ?? defaultCreateAtlas)(blobs);

  // 5. Flags from geometry and texture pixels. Textures not in the atlas draw the opaque checker.
  const alphaById = textureAlphaFromAtlas(atlas, Object.keys(blobs));
  const alpha = (texture: string): TextureAlpha => alphaById.get(texture) ?? 'opaque';
  const lightById = new Map<string, ModelLight>();
  const lightOf = (model: string): ModelLight => {
    let light = lightById.get(model);
    if (light === undefined) {
      light = missingModels.has(model)
        ? { fullCube: true, opaqueCube: true, translucent: false }
        : modelLight(chainOf(model, resolved), alpha);
      lightById.set(model, light);
    }
    return light;
  };
  const flags = new Map<string, BlockFlags>();
  for (const [id, json] of blocks.definitions) {
    flags.set(id, blockFlagsFor(collectBlockDefinitionModelRefs(json).map(lightOf)));
  }
  for (const id of blocks.missing) flags.set(id, { opaque: true });

  // 6. The synchronous providers deepslate calls while meshing.
  const notOpaque: BlockFlags = { opaque: false };
  const resources: Resources = {
    getBlockDefinition: (id) => definitions.get(id.toString()) ?? null,
    getBlockModel,
    getTextureAtlas: () => atlas.getTextureAtlas(),
    getTextureUV: (id) => atlas.getTextureUV(id),
    getPixelSize: () => atlas.getPixelSize?.() ?? 0,
    getBlockFlags: (id) => flags.get(id.toString()) ?? notOpaque,
    getBlockProperties: () => null,
    getDefaultBlockProperties: (id) => {
      const defaults = blocks.defaults.get(id.toString());
      return defaults === undefined ? null : { ...defaults };
    },
  };

  return {
    resources,
    blockIds: new Set(ids),
    flags,
    missingDefinitions: blocks.missing,
    missingModels: [...missingModels].sort(),
    missingTextures,
    usedFallback: [...resolved.values()].some((model) => model.source === 'fallback'),
    fallbackBlocks: [...fallbackBlocks].sort(),
  };
}
