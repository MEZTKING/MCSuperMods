/**
 * Loads the schema model for a project's target through the platform (vendored files are
 * served by main, plan D10) and derives the project's own registry ids for `#[id]` checks.
 *
 * @packageDocumentation
 */

import { defaultKindRegistry, type Project } from '@msm/core';
import type { Plugin, Target } from '@msm/plugin-api';
import {
  BUILT_IN_EXTENSIONS,
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  type VanillaMcdocSymbols,
} from '@msm/schemas';
import type { PlatformAdapter } from '../../../shared/platform';
import { builtInPlugins } from '../plugins/built-in';

/** Everything validation and the forms need for one target. */
export interface SchemaContext {
  /** The target the schemas belong to. */
  target: Target;
  /** Version-gated schema index over the target's vanilla-mcdoc export. */
  schemaIndex: SchemaIndex;
  /**
   * Vanilla registry ids (mcmeta `registries.json`, ids without a namespace) plus
   * {@link SEEDED_VANILLA_IDS}.
   */
  vanillaRegistries: Readonly<Record<string, readonly string[]>>;
  /**
   * The registry index for `project`: vanilla ids plus the project's own models, textures,
   * sounds and data pack ids. Memoised on the set of project ids.
   */
  registries(project: Project): RegistryIndex;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function parseJsonBytes(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(
      `The vendored ${what} file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseRegistries(json: unknown): Record<string, string[]> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('The vendored registries file is not a JSON object.');
  }
  const out: Record<string, string[]> = {};
  for (const [name, ids] of Object.entries(json)) {
    if (Array.isArray(ids)) out[name] = ids.filter((id): id is string => typeof id === 'string');
  }
  return out;
}

/** Strips `prefix` and `suffix` from `path`, or returns `undefined` when either is absent. */
function between(path: string, prefix: string, suffix: string): string | undefined {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const middle = path.slice(prefix.length, path.length - suffix.length);
  return middle === '' ? undefined : middle;
}

/**
 * Data pack kinds whose element ids form a registry of the same name (ADR 0015): the tier-A
 * kinds plus the tier-B generic kinds. Matched by kind id string, never by importing the
 * plugin; they count even when no plugin registers them (tests, unknown kinds on load).
 */
export const DATA_REGISTRY_KINDS: readonly string[] = Object.freeze([
  'advancement',
  'banner_pattern',
  'chat_type',
  'damage_type',
  'dialog',
  'dimension_type',
  'enchantment',
  'function',
  'item_modifier',
  'jukebox_song',
  'loot_table',
  'painting_variant',
  'predicate',
  'recipe',
  'trim_material',
  'trim_pattern',
]);

const DATA_REGISTRIES = new Set(DATA_REGISTRY_KINDS);
const MINECRAFT_PREFIX = 'minecraft:';
const TAG_PREFIX = 'tag/';

/**
 * Resource pack kinds whose ids `projectRegistryIds` derives itself (models), or whose element
 * ids are not registry ids at all (the sounds file, `pack.mcmeta`).
 */
const NON_DATA_KINDS: ReadonlySet<string> = new Set([
  'minecraft:block_definition',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:model',
  'minecraft:pack_mcmeta',
  'minecraft:sounds',
]);

/**
 * Looks up the registry of a registered kind; `@msm/core`'s `ElementKindRegistry` is one.
 */
export interface KindRegistryLookup {
  /** The registry of `kindId`'s element ids, or `undefined` when the kind is not registered. */
  registryFor(kindId: string): string | undefined;
}

/** A {@link KindRegistryLookup} over the kinds of `plugins` (`ElementKind.registry` first). */
export function kindLookupFor(plugins: readonly Plugin[]): KindRegistryLookup {
  const registries = new Map<string, string>();
  for (const plugin of plugins) {
    for (const kind of plugin.contributes.elementKinds ?? []) {
      registries.set(kind.id, kind.registry ?? defaultKindRegistry(kind.id));
    }
  }
  return { registryFor: (kindId) => registries.get(kindId) };
}

/** The kinds of the built-in plugins: the default lookup of the functions below. */
export const BUILT_IN_KIND_LOOKUP: KindRegistryLookup = kindLookupFor(builtInPlugins);

/**
 * The registry the ids of `kind`'s elements belong to: the registered kind's
 * `ElementKind.registry` (for example `structure` for `minecraft:structure_template`), else
 * the kind id without `minecraft:`, for example `recipe`, `model` or `tag/item`.
 *
 * @param kind - An element kind id.
 * @param kinds - The registered kinds; defaults to the built-in plugins' kinds.
 */
export function kindRegistry(
  kind: string,
  kinds: KindRegistryLookup = BUILT_IN_KIND_LOOKUP,
): string {
  return kinds.registryFor(kind) ?? defaultKindRegistry(kind);
}

function sortedRecord(map: Map<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const name of [...map.keys()].sort()) out[name] = (map.get(name) ?? []).sort();
  return out;
}

/**
 * The data pack ids a project defines, per registry: `function`, `recipe`, `loot_table`,
 * `advancement`, `predicate`, `item_modifier`, the tier-B registries, `tag/<registry>` (tag
 * ids without `#`) and the registry of every other registered `minecraft:` kind outside the
 * resource pack (for example `structure`, `worldgen/biome`, `dimension`). A registered kind of
 * another namespace counts when it declares a plain `ElementKind.registry` (no `:`), for
 * example `msm:block` in `block` and `msm:item` in `item`. An element in the `block` registry
 * also registers its block item under the same id, so it is in `item` too unless its data has
 * `"item": false` ({@link blockHasItem}). An `msm:entity` element (registry `entity_type`)
 * also registers its spawn egg `<id>_spawn_egg` in `item` unless `spawn_egg` is `false`
 * ({@link entityHasSpawnEgg}); `msm:geo_model` and `msm:animation` ids land in their own
 * plain registries, which no vanilla schema reads. Only registries with at least one id appear. Sorted,
 * namespaced, without duplicates.
 *
 * @param project - The project.
 * @param kinds - The registered kinds; defaults to the built-in plugins' kinds.
 */
export function dataRegistryIds(
  project: Project,
  kinds: KindRegistryLookup = BUILT_IN_KIND_LOOKUP,
): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  const add = (registry: string, id: string): void => {
    const ids = map.get(registry);
    if (ids === undefined) map.set(registry, new Set([id]));
    else ids.add(id);
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const registered = kinds.registryFor(element.kind);
      if (!element.kind.startsWith(MINECRAFT_PREFIX)) {
        // Another plugin's kind: only a declared, plain registry name counts.
        if (registered === undefined || registered.includes(':')) continue;
        add(registered, element.id);
        if (registered === BLOCK_REGISTRY && blockHasItem(element.data)) {
          add(ITEM_REGISTRY, element.id);
        }
        if (element.kind === ENTITY_KIND && entityHasSpawnEgg(element.data)) {
          add(ITEM_REGISTRY, spawnEggId(element.id));
        }
        continue;
      }
      const registry = registered ?? defaultKindRegistry(element.kind);
      const isData =
        DATA_REGISTRIES.has(registry) ||
        registry.startsWith(TAG_PREFIX) ||
        (registered !== undefined && !NON_DATA_KINDS.has(element.kind));
      if (!isData) continue;
      add(registry, element.id);
      if (registry === BLOCK_REGISTRY && blockHasItem(element.data)) add(ITEM_REGISTRY, element.id);
    }
  }
  return sortedRecord(new Map([...map].map(([name, ids]) => [name, [...ids]])));
}

const BLOCK_REGISTRY = 'block';
const ITEM_REGISTRY = 'item';
const ENTITY_KIND = 'msm:entity';

/** The spawn egg item id of an entity: `<id>_spawn_egg`. */
export function spawnEggId(entityId: string): string {
  return `${entityId}_spawn_egg`;
}

/**
 * Whether an `msm:entity` element registers a spawn egg: `spawn_egg` absent or an object, as
 * the entity lowering decides (so `false` means no egg).
 *
 * @param data - The entity element's data.
 */
export function entityHasSpawnEgg(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return true;
  const egg = (data as { spawn_egg?: unknown }).spawn_egg;
  return egg === undefined || (typeof egg === 'object' && egg !== null && !Array.isArray(egg));
}

/**
 * The item model the entity lowering generates for a spawn egg with a texture,
 * `<ns>:item/<path>_spawn_egg`, or `undefined` when the egg has no texture (or no egg).
 *
 * @param entityId - The entity element's id.
 * @param data - Its data.
 */
export function spawnEggModelId(entityId: string, data: unknown): string | undefined {
  if (!entityHasSpawnEgg(data)) return undefined;
  const egg = (data as { spawn_egg?: { texture?: unknown } } | null)?.spawn_egg;
  if (typeof egg?.texture !== 'string' || egg.texture.trim() === '') return undefined;
  const colon = entityId.indexOf(':');
  return `${entityId.slice(0, colon)}:item/${spawnEggId(entityId.slice(colon + 1))}`;
}

/**
 * Whether a block element registers a block item under its own id: every block does, as in
 * the game, unless its data is an object with `"item": false`.
 *
 * @param data - The block element's data.
 */
export function blockHasItem(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return true;
  return (data as { item?: unknown }).item !== false;
}

/** The event keys of a `minecraft:sounds` element's data (a map from event key to event). */
function soundEventKeys(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  return Object.keys(data).filter((key) => key !== '');
}

/**
 * The ids a project defines, per registry: `model` (model elements and the item models of
 * entity spawn eggs with a texture), `texture` (PNG assets
 * under `textures/`), `sound` (Ogg assets under `sounds/`), `sound_event` (every event key of
 * a `minecraft:sounds` element: key `foo.bar` in namespace `ns` is `ns:foo.bar`) and the data
 * pack registries of {@link dataRegistryIds}. Sorted, namespaced, without duplicates.
 *
 * @param project - The project.
 * @param kinds - The registered kinds; defaults to the built-in plugins' kinds.
 */
export function projectRegistryIds(
  project: Project,
  kinds: KindRegistryLookup = BUILT_IN_KIND_LOOKUP,
): Record<string, string[]> {
  const model: string[] = [];
  const texture: string[] = [];
  const sound: string[] = [];
  const soundEvent = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === 'minecraft:model') model.push(element.id);
      if (element.kind === ENTITY_KIND) {
        const eggModel = spawnEggModelId(element.id, element.data);
        if (eggModel !== undefined) model.push(eggModel);
      }
      if (element.kind === 'minecraft:sounds') {
        for (const key of soundEventKeys(element.data)) soundEvent.add(`${namespace.name}:${key}`);
      }
    }
    for (const asset of namespace.assets) {
      const textureId = between(asset.path, 'textures/', '.png');
      if (textureId !== undefined) texture.push(`${namespace.name}:${textureId}`);
      const soundId = between(asset.path, 'sounds/', '.ogg');
      if (soundId !== undefined) sound.push(`${namespace.name}:${soundId}`);
    }
  }
  return {
    ...dataRegistryIds(project, kinds),
    model: model.sort(),
    sound: sound.sort(),
    sound_event: [...soundEvent].sort(),
    texture: texture.sort(),
  };
}

/**
 * Vanilla ids MSM adds to the vendored registries: mcmeta lists no `tag/function` ids, but
 * the game always defines `#minecraft:tick` and `#minecraft:load`.
 */
export const SEEDED_VANILLA_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'tag/function': Object.freeze(['load', 'tick']),
});

function withSeeds(
  vanilla: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = { ...vanilla };
  for (const [registry, ids] of Object.entries(SEEDED_VANILLA_IDS)) {
    out[registry] = [...new Set([...(vanilla[registry] ?? []), ...ids])];
  }
  return out;
}

/**
 * `vanilla` with third-party plugin symbol exports added (ADR 0035): types and dispatchers
 * a plugin defines are added, and on a clash the vanilla (and earlier plugin) entry wins, as
 * `mergeMsmSymbols` does for MSM's own types. `loadExternalPlugins` has already refused
 * exports outside a plugin's namespace, so no clash is expected.
 */
export function mergeExternalSymbols(
  vanilla: VanillaMcdocSymbols,
  extra: readonly VanillaMcdocSymbols[],
): VanillaMcdocSymbols {
  if (extra.length === 0) return vanilla;
  const mcdoc: VanillaMcdocSymbols['mcdoc'] = { ...vanilla.mcdoc };
  const dispatchers: VanillaMcdocSymbols['dispatchers'] = { ...vanilla.dispatchers };
  for (const symbols of extra) {
    for (const [path, type] of Object.entries(symbols.mcdoc)) {
      if (!Object.hasOwn(mcdoc, path)) mcdoc[path] = type;
    }
    for (const [registry, members] of Object.entries(symbols.dispatchers)) {
      dispatchers[registry] = { ...members, ...dispatchers[registry] };
    }
  }
  return { ref: vanilla.ref, mcdoc, dispatchers };
}

/**
 * Reads and parses the target's vendored symbols and registries through the platform.
 *
 * @param platform - Supplies `targets.readVendored`.
 * @param target - The target to load.
 * @param kinds - The registered kinds, whose registries receive the project's element ids;
 *   defaults to the built-in plugins' kinds.
 * @param extraSymbols - Third-party plugin symbol exports merged after the vanilla symbols
 *   (vanilla wins on a clash).
 */
export async function loadSchemaContext(
  platform: Pick<PlatformAdapter, 'targets'>,
  target: Target,
  kinds: KindRegistryLookup = BUILT_IN_KIND_LOOKUP,
  extraSymbols: readonly VanillaMcdocSymbols[] = [],
): Promise<SchemaContext> {
  const [symbolBytes, registryBytes] = await Promise.all([
    platform.targets.readVendored(target.id, 'vanillaMcdocSymbols'),
    platform.targets.readVendored(target.id, 'mcmetaRegistries'),
  ]);
  const symbols = mergeExternalSymbols(
    parseVanillaMcdocSymbols(parseJsonBytes(symbolBytes, 'vanilla-mcdoc symbols')),
    extraSymbols,
  );
  const vanillaRegistries = withSeeds(parseRegistries(parseJsonBytes(registryBytes, 'registries')));
  const schemaIndex = createSchemaIndex(symbols, {
    mcVersion: target.mcVersion,
    extensions: BUILT_IN_EXTENSIONS,
  });

  let cachedKey: string | null = null;
  let cached: RegistryIndex | null = null;
  return {
    target,
    schemaIndex,
    vanillaRegistries,
    registries(project) {
      const ids = projectRegistryIds(project, kinds);
      const key = JSON.stringify(ids);
      if (cached === null || key !== cachedKey) {
        cached = createRegistryIndex({ vanilla: vanillaRegistries, project: ids });
        cachedKey = key;
      }
      return cached;
    },
  };
}
