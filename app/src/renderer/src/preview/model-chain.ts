/**
 * Pure model resolution for the preview: identifier handling, the parent-chain lookup order
 * (project, extracted vanilla cache, MSM fallback parents), texture collection and the mapping
 * from identifiers to files. Nothing here touches the DOM, WebGL or deepslate, so it runs in
 * Node tests.
 */

import type { Element, Json, JsonObject, Project, ResourceFolderKey } from '@msm/plugin-api';
import { FALLBACK_MODELS, FALLBACK_NAMESPACE } from './fallback-models';

/** Vanilla folder names under `assets/<namespace>/`, from the project's target. */
export type ResourceFolders = Readonly<Record<ResourceFolderKey, string>>;

/** Read access to the extracted vanilla asset cache (ADR 0011), by jar path. */
export interface VanillaAssetReader {
  /** The bytes of `path` (for example `assets/minecraft/models/block/stone.json`), or `null`. */
  readAsset(path: string): Promise<Uint8Array | null>;
}

/** Where a model in a resolved chain came from. */
export type ModelSource = 'project' | 'vanilla' | 'fallback';

/** One model in a parent chain. */
export interface ResolvedModel {
  /** The normalised identifier, for example `minecraft:block/cube_all`. */
  id: string;
  json: JsonObject;
  source: ModelSource;
}

/** The result of {@link resolveModelChain}. */
export interface ModelChain {
  /** The models from the requested one up to the root parent. */
  chain: ResolvedModel[];
  /** Identifiers that no source could provide (at most one: the chain stops there). */
  missing: string[];
  /** True when the chain ends at `builtin/generated` (a flat item made from `layer<n>`). */
  generated: boolean;
}

/** Looks a model up by normalised identifier. */
export type ModelLookup = (id: string) => Promise<ResolvedModel | null>;

const DEFAULT_NAMESPACE = 'minecraft';
const MAX_CHAIN = 32;

/** Adds the default `minecraft:` namespace to an identifier that has none. */
export function normaliseId(id: string): string {
  return id.includes(':') ? id : `${DEFAULT_NAMESPACE}:${id}`;
}

/** Splits an identifier into namespace and path (the namespace defaults to `minecraft`). */
export function splitId(id: string): { namespace: string; path: string } {
  const normalised = normaliseId(id);
  const colon = normalised.indexOf(':');
  return { namespace: normalised.slice(0, colon), path: normalised.slice(colon + 1) };
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every element of `kind` in the project, keyed by its identifier. */
export function projectElementsOfKind(project: Project, kind: string): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === kind) out.set(normaliseId(element.id), element);
    }
  }
  return out;
}

/** The jar path of a vanilla JSON resource, e.g. `assets/minecraft/models/block/stone.json`. */
export function vanillaJsonPath(id: string, folder: string): string {
  const { namespace, path } = splitId(id);
  return `assets/${namespace}/${folder}/${path}.json`;
}

/** Where a texture identifier lives: in the project's namespace assets and in the vanilla cache. */
export function textureLocations(
  id: string,
  folders: ResourceFolders,
): { namespace: string; projectPath: string; vanillaPath: string } {
  const { namespace, path } = splitId(id);
  const projectPath = `${folders.textures}/${path}.png`;
  return { namespace, projectPath, vanillaPath: `assets/${namespace}/${projectPath}` };
}

/** Parses UTF-8 JSON bytes into an object, or `null` when they are not a JSON object. */
export function parseJsonObject(bytes: Uint8Array | null): JsonObject | null {
  if (bytes === null) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Json;
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Memoises vanilla JSON reads by jar path. The cache never changes while the app runs (a new
 * extraction produces a new reader), so a failed or missing read is remembered too.
 */
export function createVanillaJsonCache(
  vanilla: VanillaAssetReader,
): (path: string) => Promise<JsonObject | null> {
  const cache = new Map<string, Promise<JsonObject | null>>();
  return (path) => {
    let entry = cache.get(path);
    if (entry === undefined) {
      entry = vanilla.readAsset(path).then(parseJsonObject, () => null);
      cache.set(path, entry);
    }
    return entry;
  };
}

/** The fallback parent for `id`: `msm:<path>` always, `minecraft:<path>` as an alias. */
export function fallbackModelFor(
  id: string,
  fallbackModels: Readonly<Record<string, JsonObject>> = FALLBACK_MODELS,
): JsonObject | null {
  const { namespace, path } = splitId(id);
  if (namespace !== FALLBACK_NAMESPACE && namespace !== DEFAULT_NAMESPACE) return null;
  return fallbackModels[path] ?? null;
}

/** Options for {@link createModelLookup}. */
export interface ModelLookupOptions {
  project: Project;
  /** The `minecraft:model` kind id (default `minecraft:model`). */
  modelKind?: string;
  folders: ResourceFolders;
  /** Cached vanilla JSON reads, or `null` when no vanilla assets are available. */
  vanillaJson: ((path: string) => Promise<JsonObject | null>) | null;
  fallbackModels?: Readonly<Record<string, JsonObject>>;
}

/**
 * The model lookup in the order ADR 0010 fixes: project `minecraft:model` elements, then the
 * extracted vanilla cache, then the MSM fallback parents (which also answer the
 * `minecraft:` names of the common parents when vanilla does not provide them).
 */
export function createModelLookup(options: ModelLookupOptions): ModelLookup {
  const projectModels = projectElementsOfKind(
    options.project,
    options.modelKind ?? 'minecraft:model',
  );
  return async (rawId) => {
    const id = normaliseId(rawId);
    const element = projectModels.get(id);
    if (element !== undefined && isObject(element.data)) {
      return { id, json: element.data, source: 'project' };
    }
    if (options.vanillaJson !== null) {
      const json = await options.vanillaJson(vanillaJsonPath(id, options.folders.model));
      if (json !== null) return { id, json, source: 'vanilla' };
    }
    const fallback = fallbackModelFor(id, options.fallbackModels);
    return fallback === null ? null : { id, json: fallback, source: 'fallback' };
  };
}

const isBuiltin = (id: string): boolean => splitId(id).path.startsWith('builtin/');

/**
 * Follows `parent` links from `id` until a model without a parent, a `builtin/*` parent, a
 * missing model or a cycle. A cycle stops the chain without reporting anything missing.
 */
export async function resolveModelChain(id: string, lookup: ModelLookup): Promise<ModelChain> {
  const chain: ResolvedModel[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  let generated = false;
  let next: string | undefined = normaliseId(id);
  while (next !== undefined && chain.length < MAX_CHAIN && !seen.has(next)) {
    seen.add(next);
    if (isBuiltin(next)) {
      generated = splitId(next).path === 'builtin/generated';
      break;
    }
    const model = await lookup(next);
    if (model === null) {
      missing.push(next);
      break;
    }
    chain.push(model);
    const parent = model.json.parent;
    next = typeof parent === 'string' && parent !== '' ? normaliseId(parent) : undefined;
  }
  return { chain, missing, generated };
}

/** The value of a texture variable: a string, or the `{ sprite }` object form. */
function textureValue(value: Json | undefined): string | null {
  if (typeof value === 'string') return value;
  if (isObject(value) && typeof value.sprite === 'string') return value.sprite;
  return null;
}

/** The texture variables of a chain merged child-first (a child overrides its parents). */
export function mergedTextures(chain: readonly ResolvedModel[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const model of chain) {
    const textures = model.json.textures;
    if (!isObject(textures)) continue;
    for (const [name, value] of Object.entries(textures)) {
      const texture = textureValue(value);
      if (texture !== null && !merged.has(name)) merged.set(name, texture);
    }
  }
  return merged;
}

/**
 * The texture identifiers a chain uses: every texture variable resolved through `#` references,
 * normalised and sorted. Variables that resolve to nothing (or loop) are skipped; deepslate draws
 * its missing-texture checker for them.
 */
export function collectTextureIds(chain: readonly ResolvedModel[]): string[] {
  const textures = mergedTextures(chain);
  const out = new Set<string>();
  for (const start of textures.values()) {
    let value: string | undefined = start;
    const seen = new Set<string>();
    while (value?.startsWith('#') && !seen.has(value)) {
      seen.add(value);
      value = textures.get(value.slice(1));
    }
    if (value !== undefined && value !== '' && !value.startsWith('#')) out.add(normaliseId(value));
  }
  return [...out].sort();
}

/** Model identifiers referenced by an item definition's `model` tree (`model` and `base`). */
export function collectItemModelRefs(value: Json | undefined): string[] {
  const out = new Set<string>();
  const walk = (node: Json | undefined): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isObject(node)) return;
    for (const key of ['model', 'base'] as const) {
      const ref = node[key];
      if (typeof ref === 'string') out.add(normaliseId(ref));
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(value);
  return [...out].sort();
}

/** Model identifiers referenced by a block definition's `variants` and `multipart`. */
export function collectBlockDefinitionModelRefs(value: Json | undefined): string[] {
  if (!isObject(value)) return [];
  const out = new Set<string>();
  const addEntry = (entry: Json | undefined): void => {
    const list = Array.isArray(entry) ? entry : [entry];
    for (const variant of list) {
      if (isObject(variant) && typeof variant.model === 'string')
        out.add(normaliseId(variant.model));
    }
  };
  if (isObject(value.variants)) for (const entry of Object.values(value.variants)) addEntry(entry);
  if (Array.isArray(value.multipart)) {
    for (const part of value.multipart) if (isObject(part)) addEntry(part.apply);
  }
  return [...out].sort();
}

/**
 * Block properties that select the first variant of a block definition, so the preview shows
 * something without the user picking a state. `"facing=north,lit=false"` gives
 * `{ facing: 'north', lit: 'false' }`; multipart-only and `""` variants give `{}`.
 */
export function defaultVariantProperties(value: Json | undefined): Record<string, string> {
  if (!isObject(value) || !isObject(value.variants)) return {};
  const first = Object.keys(value.variants)[0];
  const props: Record<string, string> = {};
  if (first === undefined || first === '') return props;
  for (const pair of first.split(',')) {
    const eq = pair.indexOf('=');
    if (eq > 0) props[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return props;
}
