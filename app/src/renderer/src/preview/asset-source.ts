/**
 * Builds deepslate's synchronous resource providers for one preview subject.
 *
 * deepslate asks for models, definitions and texture coordinates synchronously while it builds
 * meshes, so everything the subject needs is loaded up front: the subject's definition, every
 * model its parent chains reach (project, vanilla cache, MSM fallback parents — ADR 0010) and
 * every texture those models name. Textures that cannot be found are left out of the atlas, so
 * deepslate draws its missing-texture checker for them.
 *
 * A texture with a `.png.mcmeta` sidecar from the same source (project or vanilla cache) that
 * describes an `animation` is animated by stepping: the atlas is rebuilt through `createAtlas`
 * from the frame that shows at a given tick, cropped out of the strip. No interpolation.
 */

import { readPngHeader } from '@msm/interop';
import type { JsonObject, Project } from '@msm/plugin-api';
import { Identifier, ItemStack } from 'deepslate/core';
import { NbtString } from 'deepslate/nbt';
import {
  BlockDefinition,
  type BlockFlags,
  BlockModel,
  ItemModel,
  type ItemRendererResources,
  type Resources,
  TextureAtlas,
  type TextureAtlasProvider,
} from 'deepslate/render';
import {
  type FrameRect,
  frameRectAtTick,
  parseTextureAnimation,
  type TextureAnimation,
} from './animation';
import {
  collectBlockDefinitionModelRefs,
  collectItemModelRefs,
  collectTextureIds,
  createBlockDefinitionLookup,
  createModelLookup,
  createVanillaJsonCache,
  defaultVariantProperties,
  normaliseId,
  parseJsonObject,
  type ResolvedModel,
  type ResourceFolders,
  resolveModelChain,
  textureLocations,
  type VanillaAssetReader,
} from './model-chain';
import { structureFromTemplate, type TemplateStructure } from './structure';

/** The preview kinds the WebGL canvas renders. */
export type CanvasPreviewKind = 'model' | 'block_definition' | 'item_definition' | 'structure';

/**
 * The host hints on an element kind (`ElementKind.previewKind`) that the preview understands:
 * the canvas kinds, and `climate_map`, a 2D map drawn without WebGL.
 */
export type PreviewKind = CanvasPreviewKind | 'climate_map';

/** The element to preview in the canvas. */
export interface PreviewSubject {
  previewKind: CanvasPreviewKind;
  /** The element's identifier, for example `demo:block/ruby`. */
  id: string;
  /** The element's current data. */
  data: unknown;
}

/** Options for {@link createPreviewResources}. */
export interface PreviewResourcesOptions {
  project: Project;
  folders: ResourceFolders;
  subject: PreviewSubject;
  /** Reads a project asset (`path` relative to `assets/<namespace>/`), or `null` when absent. */
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  /** The extracted vanilla cache, or `null` when the user has not set it up. */
  vanilla: VanillaAssetReader | null;
  /**
   * Memoised vanilla JSON reads; pass the same function across rebuilds to avoid re-reading.
   * Built from `vanilla` when omitted.
   */
  vanillaJson?: ((path: string) => Promise<JsonObject | null>) | null;
  fallbackModels?: Readonly<Record<string, JsonObject>>;
  /** Builds the texture atlas (default `TextureAtlas.fromBlobs`); injectable for tests. */
  createAtlas?: (textures: Record<string, Blob>) => Promise<TextureAtlasProvider>;
  /**
   * Crops one frame out of an animated texture's strip (default: `createImageBitmap` and a
   * canvas); injectable for tests.
   */
  cropTexture?: (texture: Blob, rect: FrameRect) => Promise<Blob>;
}

/** An animated texture of the preview subject. */
export interface AnimatedTexture {
  /** The texture id, for example `minecraft:block/lava_still`. */
  id: string;
  animation: TextureAnimation;
}

/** Everything a preview renderer needs. */
export interface PreviewResources {
  resources: Resources & ItemRendererResources;
  /**
   * `block` renders a one-block structure; `item` renders the item in the GUI view;
   * `structure` renders {@link PreviewResources.structure}.
   */
  mode: 'block' | 'item' | 'structure';
  /** The structure template in `structure` mode, else `null`. */
  structure: TemplateStructure | null;
  /** Block ids of a structure with no block definition; drawn with the missing texture. */
  missingDefinitions: string[];
  /** The block to place in `block` mode. */
  block: { name: Identifier; properties: Record<string, string> };
  /** The item stack to draw in `item` mode. */
  item: ItemStack;
  /** Models no source could provide. */
  missingModels: string[];
  /** Textures found neither in the project nor in the vanilla cache. */
  missingTextures: string[];
  /** True when at least one MSM fallback parent was used. */
  usedFallback: boolean;
  /** Animated textures, sorted by id; empty when every texture is static. */
  animations: AnimatedTexture[];
  /**
   * Rebuilds the atlas for game tick `tick` (each animated texture shows the frame of its own
   * loop at that tick) and swaps it into `resources`. Resolves to `true` when the atlas
   * changed, so the caller re-uploads `resources.getTextureAtlas()`; to `false` when every
   * animated texture already showed the right frame.
   */
  showTick(tick: number): Promise<boolean>;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

/** Crops `rect` out of `texture` with `createImageBitmap` and a 2D canvas. */
async function defaultCropTexture(texture: Blob, rect: FrameRect): Promise<Blob> {
  const bitmap = await createImageBitmap(texture, rect.x, rect.y, rect.width, rect.height);
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    throw new Error('No 2D canvas context.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('Could not encode the frame.')) : resolve(blob)),
      'image/png',
    );
  });
}

/** An animated texture with what is needed to crop its frames. */
interface AnimatedSource extends AnimatedTexture {
  blob: Blob;
  imageWidth: number;
}

/**
 * The model drawn for a structure block whose definition or model cannot be found: a full cube
 * whose texture is never in the atlas, so deepslate draws its missing-texture checker.
 */
export const MISSING_BLOCK_MODEL = 'msm:preview/missing_block';
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

/** What {@link prepareBlockResources} found for a set of block ids. */
export interface PreparedBlocks {
  /** Block definition JSON by normalised block id. */
  definitions: Map<string, JsonObject>;
  /** Properties selecting each definition's first variant, by block id. */
  defaults: Map<string, Record<string, string>>;
  /** Model ids the definitions reference, sorted. */
  models: string[];
  /** Block ids with no definition, sorted. */
  missing: string[];
}

/**
 * Looks up the block definition of every id (project elements first, then the vanilla cache)
 * and collects the models they reference. Generalises the single-block path to many blocks.
 */
export async function prepareBlockResources(
  ids: readonly string[],
  lookup: ReturnType<typeof createBlockDefinitionLookup>,
): Promise<PreparedBlocks> {
  const definitions = new Map<string, JsonObject>();
  const defaults = new Map<string, Record<string, string>>();
  const models = new Set<string>();
  const missing: string[] = [];
  const unique = [...new Set(ids.map(normaliseId))].sort();
  const found = await Promise.all(unique.map((id) => lookup(id).catch(() => null)));
  unique.forEach((id, i) => {
    const definition = found[i];
    if (definition === null || definition === undefined) {
      missing.push(id);
      return;
    }
    definitions.set(id, definition.json);
    defaults.set(id, defaultVariantProperties(definition.json));
    for (const model of collectBlockDefinitionModelRefs(definition.json)) models.add(model);
  });
  return { definitions, defaults, models: [...models].sort(), missing };
}

const defaultCreateAtlas = async (textures: Record<string, Blob>): Promise<TextureAtlasProvider> =>
  TextureAtlas.fromBlobs(await decodableOnly(textures));

/** Loads and wires everything needed to render `options.subject`. */
export async function createPreviewResources(
  options: PreviewResourcesOptions,
): Promise<PreviewResources> {
  const { project, folders, subject } = options;
  const vanillaJson =
    options.vanillaJson ??
    (options.vanilla === null ? null : createVanillaJsonCache(options.vanilla));
  const lookupOptions = {
    folders,
    project,
    vanillaJson,
    ...(options.fallbackModels === undefined ? {} : { fallbackModels: options.fallbackModels }),
  };
  const lookup = createModelLookup(lookupOptions);
  const subjectId = normaliseId(subject.id);
  const data = isObject(subject.data) ? subject.data : {};

  // 1. The subject's definition and the models it references.
  const definitions = new Map<string, BlockDefinition>();
  const itemModels = new Map<string, ItemModel>();
  let rootModels: string[];
  let properties: Record<string, string> = {};
  let structure: TemplateStructure | null = null;
  let blockDefaults = new Map<string, Record<string, string>>();
  let missingDefinitions: string[] = [];
  if (subject.previewKind === 'structure') {
    structure = structureFromTemplate(data);
    const blocks = await prepareBlockResources(
      structure.blockIds,
      createBlockDefinitionLookup({ project, folders, vanillaJson }),
    );
    for (const [id, json] of blocks.definitions) {
      definitions.set(id, BlockDefinition.fromJson(structuredClone(json)));
    }
    for (const id of blocks.missing) {
      definitions.set(
        id,
        BlockDefinition.fromJson({ variants: { '': { model: MISSING_BLOCK_MODEL } } }),
      );
    }
    blockDefaults = blocks.defaults;
    missingDefinitions = blocks.missing;
    rootModels = blocks.models;
  } else if (subject.previewKind === 'block_definition') {
    definitions.set(subjectId, BlockDefinition.fromJson(structuredClone(data)));
    rootModels = collectBlockDefinitionModelRefs(data);
    properties = defaultVariantProperties(data);
  } else if (subject.previewKind === 'item_definition') {
    itemModels.set(subjectId, ItemModel.fromJson(structuredClone(data.model ?? {})));
    rootModels = collectItemModelRefs(data.model);
  } else {
    definitions.set(
      subjectId,
      BlockDefinition.fromJson({ variants: { '': { model: subjectId } } }),
    );
    itemModels.set(subjectId, ItemModel.fromJson({ model: subjectId, type: 'minecraft:model' }));
    rootModels = [subjectId];
  }

  // 2. Every parent chain, with the subject's own (unsaved) data for a model subject.
  const resolved = new Map<string, ResolvedModel>();
  const missingModels = new Set<string>();
  let subjectGenerated = false;
  const subjectLookup: typeof lookup =
    subject.previewKind === 'model'
      ? async (id) =>
          normaliseId(id) === subjectId
            ? { id: subjectId, json: data, source: 'project' }
            : lookup(id)
      : lookup;
  for (const root of rootModels) {
    const result = await resolveModelChain(root, subjectLookup);
    for (const model of result.chain) if (!resolved.has(model.id)) resolved.set(model.id, model);
    for (const id of result.missing) missingModels.add(id);
    if (root === subjectId && result.generated) subjectGenerated = true;
  }

  // 3. deepslate block models, flattened against each other.
  const blockModels = new Map<string, BlockModel>();
  for (const [id, model] of resolved) {
    blockModels.set(id, BlockModel.fromJson(structuredClone(model.json)));
  }
  if (structure !== null) {
    // A structure never drops a block: missing definitions and models draw the checker cube.
    for (const id of [MISSING_BLOCK_MODEL, ...missingModels]) {
      blockModels.set(id, BlockModel.fromJson(structuredClone(MISSING_BLOCK_JSON)));
    }
  }
  const modelProvider = {
    getBlockModel: (id: Identifier): BlockModel | null => blockModels.get(id.toString()) ?? null,
  };
  for (const model of blockModels.values()) model.flatten(modelProvider);

  // 4. Textures: project namespace assets first, then the vanilla cache.
  const textureIds = new Set<string>();
  for (const root of rootModels) {
    const chain: ResolvedModel[] = [];
    let current = resolved.get(root);
    const seen = new Set<string>();
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current);
      const parent = current.json.parent;
      current = typeof parent === 'string' ? resolved.get(normaliseId(parent)) : undefined;
    }
    for (const id of collectTextureIds(chain)) textureIds.add(id);
  }
  const blobs: Record<string, Blob> = {};
  const missingTextures: string[] = [];
  const animated: AnimatedSource[] = [];
  const vanilla = options.vanilla;
  for (const id of [...textureIds].sort()) {
    const { namespace, projectPath, vanillaPath } = textureLocations(id, folders);
    let bytes = await options.readProjectAsset(namespace, projectPath).catch(() => null);
    // The sidecar comes from the same source as the image, as in the game.
    let readSidecar = (): Promise<Uint8Array | null> =>
      options.readProjectAsset(namespace, `${projectPath}.mcmeta`);
    if (bytes === null && vanilla !== null) {
      bytes = await vanilla.readAsset(vanillaPath).catch(() => null);
      readSidecar = () => vanilla.readAsset(`${vanillaPath}.mcmeta`);
    }
    if (bytes === null) {
      missingTextures.push(id);
      continue;
    }
    const blob = new Blob([bytes.slice()], { type: 'image/png' });
    blobs[id] = blob;
    const sidecar = parseJsonObject(await readSidecar().catch(() => null));
    if (sidecar === null) continue;
    let size: { width: number; height: number };
    try {
      size = readPngHeader(bytes);
    } catch {
      continue; // Not a PNG: left to the atlas, which skips it.
    }
    const animation = parseTextureAnimation(sidecar, size.width, size.height);
    if (animation !== null) animated.push({ id, animation, blob, imageWidth: size.width });
  }

  // 4b. The atlas for a tick: animated textures are replaced by their current frame.
  const createAtlas = options.createAtlas ?? defaultCreateAtlas;
  const cropTexture = options.cropTexture ?? defaultCropTexture;
  const frames = new Map<string, Promise<Blob>>();
  const frameBlob = (source: AnimatedSource, rect: FrameRect): Promise<Blob> => {
    const key = `${source.id}\u0000${rect.x},${rect.y}`;
    let frame = frames.get(key);
    if (frame === undefined) {
      frame = cropTexture(source.blob, rect).catch(() => source.blob);
      frames.set(key, frame);
    }
    return frame;
  };
  const rectsAt = (tick: number): FrameRect[] =>
    animated.map((source) => frameRectAtTick(source.animation, tick, source.imageWidth));
  const atlasFor = async (rects: readonly FrameRect[]): Promise<TextureAtlasProvider> => {
    if (animated.length === 0) return createAtlas(blobs);
    const current: Record<string, Blob> = { ...blobs };
    await Promise.all(
      animated.map(async (source, i) => {
        current[source.id] = await frameBlob(source, rects[i] as FrameRect);
      }),
    );
    return createAtlas(current);
  };
  const rectsKey = (rects: readonly FrameRect[]): string =>
    rects.map((rect) => `${rect.x},${rect.y}`).join(';');
  let shownKey = rectsKey(rectsAt(0));
  let atlas = await atlasFor(rectsAt(0));
  let latestRequest = 0;
  const showTick = async (tick: number): Promise<boolean> => {
    latestRequest += 1;
    const request = latestRequest;
    const rects = rectsAt(tick);
    const key = rectsKey(rects);
    if (key === shownKey) return false;
    const next = await atlasFor(rects);
    // A later request superseded this one while the atlas was built.
    if (request !== latestRequest) return false;
    atlas = next;
    shownKey = key;
    return true;
  };

  // 5. The synchronous providers deepslate calls while meshing.
  const flags: BlockFlags = { opaque: false };
  const resources: Resources & ItemRendererResources = {
    getBlockDefinition: (id) => definitions.get(id.toString()) ?? null,
    getBlockModel: modelProvider.getBlockModel,
    getTextureAtlas: () => atlas.getTextureAtlas(),
    getTextureUV: (id) => atlas.getTextureUV(id),
    getPixelSize: () => atlas.getPixelSize?.() ?? 0,
    getBlockFlags: () => flags,
    getBlockProperties: () => null,
    getDefaultBlockProperties: (id) => {
      if (structure !== null) {
        const defaults = blockDefaults.get(id.toString());
        return defaults === undefined ? null : { ...defaults };
      }
      return id.toString() === subjectId ? { ...properties } : null;
    },
    getItemModel: (id) => itemModels.get(id.toString()) ?? null,
    getItemComponents: () => new Map(),
  };

  const name = Identifier.parse(subjectId);
  const item = new ItemStack(
    name,
    1,
    new Map([['minecraft:item_model', new NbtString(subjectId)]]),
  );
  const mode =
    structure !== null
      ? 'structure'
      : subject.previewKind === 'item_definition' ||
          (subject.previewKind === 'model' && subjectGenerated)
        ? 'item'
        : 'block';
  return {
    resources,
    mode,
    block: { name, properties },
    item,
    structure,
    missingDefinitions,
    missingModels: [...missingModels].sort(),
    missingTextures,
    usedFallback: [...resolved.values()].some((model) => model.source === 'fallback'),
    animations: animated.map(({ id, animation }) => ({ id, animation })),
    showTick,
  };
}
