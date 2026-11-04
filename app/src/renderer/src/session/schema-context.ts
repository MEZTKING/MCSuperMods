/**
 * Loads the schema model for a project's target through the platform (vendored files are
 * served by main, plan D10) and derives the project's own registry ids for `#[id]` checks.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import {
  BUILT_IN_EXTENSIONS,
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
} from '@msm/schemas';
import type { PlatformAdapter } from '../../../shared/platform';

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
 * plugin.
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
 * The registry the ids of `kind`'s elements belong to: the kind id without `minecraft:`, for
 * example `recipe`, `model` or `tag/item`.
 *
 * @param kind - An element kind id.
 */
export function kindRegistry(kind: string): string {
  return kind.startsWith(MINECRAFT_PREFIX) ? kind.slice(MINECRAFT_PREFIX.length) : kind;
}

function sortedRecord(map: Map<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const name of [...map.keys()].sort()) out[name] = (map.get(name) ?? []).sort();
  return out;
}

/**
 * The data pack ids a project defines, per registry: `function`, `recipe`, `loot_table`,
 * `advancement`, `predicate`, `item_modifier`, the tier-B registries and `tag/<registry>`
 * (tag ids without `#`). Only registries with at least one id appear. Sorted, namespaced.
 *
 * @param project - The project.
 */
export function dataRegistryIds(project: Project): Record<string, string[]> {
  const map = new Map<string, string[]>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (!element.kind.startsWith(MINECRAFT_PREFIX)) continue;
      const registry = kindRegistry(element.kind);
      if (!DATA_REGISTRIES.has(registry) && !registry.startsWith(TAG_PREFIX)) continue;
      const ids = map.get(registry);
      if (ids === undefined) map.set(registry, [element.id]);
      else ids.push(element.id);
    }
  }
  return sortedRecord(map);
}

/** The event keys of a `minecraft:sounds` element's data (a map from event key to event). */
function soundEventKeys(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  return Object.keys(data).filter((key) => key !== '');
}

/**
 * The ids a project defines, per registry: `model` (model elements), `texture` (PNG assets
 * under `textures/`), `sound` (Ogg assets under `sounds/`), `sound_event` (every event key of
 * a `minecraft:sounds` element: key `foo.bar` in namespace `ns` is `ns:foo.bar`) and the data
 * pack registries of {@link dataRegistryIds}. Sorted, namespaced, without duplicates.
 *
 * @param project - The project.
 */
export function projectRegistryIds(project: Project): Record<string, string[]> {
  const model: string[] = [];
  const texture: string[] = [];
  const sound: string[] = [];
  const soundEvent = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === 'minecraft:model') model.push(element.id);
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
    ...dataRegistryIds(project),
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
 * Reads and parses the target's vendored symbols and registries through the platform.
 *
 * @param platform - Supplies `targets.readVendored`.
 * @param target - The target to load.
 */
export async function loadSchemaContext(
  platform: Pick<PlatformAdapter, 'targets'>,
  target: Target,
): Promise<SchemaContext> {
  const [symbolBytes, registryBytes] = await Promise.all([
    platform.targets.readVendored(target.id, 'vanillaMcdocSymbols'),
    platform.targets.readVendored(target.id, 'mcmetaRegistries'),
  ]);
  const symbols = parseVanillaMcdocSymbols(parseJsonBytes(symbolBytes, 'vanilla-mcdoc symbols'));
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
      const ids = projectRegistryIds(project);
      const key = JSON.stringify(ids);
      if (cached === null || key !== cachedKey) {
        cached = createRegistryIndex({ vanilla: vanillaRegistries, project: ids });
        cachedKey = key;
      }
      return cached;
    },
  };
}
