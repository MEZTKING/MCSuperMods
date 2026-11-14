/**
 * Loads the schema model for a project's target through the platform (vendored files are
 * served by main, plan D10) and derives the project's own registry ids for `#[id]` checks.
 *
 * @packageDocumentation
 */

import { defaultKindRegistry, type Project, parseJsonPointer } from '@msm/core';
import type { Element, Json, OutputFile, Plugin, Target } from '@msm/plugin-api';
import { blockGeneratedModelIds, blockItemIdOf, potionVariantIds } from '@msm/plugin-blocks-items';
import {
  BUILT_IN_EXTENSIONS,
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  type SchemaProblem,
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
   * {@link SEEDED_VANILLA_IDS} and {@link WEIGHED_SOUND_EVENT} (the vanilla sound events).
   */
  vanillaRegistries: Readonly<Record<string, readonly string[]>>;
  /**
   * The registry index for `project`: vanilla ids plus the project's own models, textures,
   * sounds and data pack ids. With `kindId` the view is kind-aware (ADR 0057 D3): for an MSM
   * kind (`msm:*`) the project's `sounds.json` event keys are `sound_event` ids too, since the
   * MSM runtime registers them ({@link soundAwareRegistryIds}); for any other kind, or without
   * `kindId`, they are only `weighed_sound_event` ids. Memoised on the project and on the set
   * of project ids.
   */
  registries(project: Project, kindId?: string): RegistryIndex;
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
  'dimension',
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
 * also registers its block item, so the item id is in `item` too: the block's own id, or its
 * `item.id` when the block item has its own id (seeds planting a crop, ADR 0068 D2), and none
 * when its data has `"item": false` (`blockItemIdOf`, the single source; {@link blockHasItem}).
 * An `msm:entity` element (registry `entity_type`) also registers its spawn egg
 * `<id>_spawn_egg` in `item` unless `spawn_egg` is `false` ({@link entityHasSpawnEgg}); `msm:geo_model` and `msm:animation` ids land in their own
 * plain registries, which no vanilla schema reads. An `msm:potion` element (registry `potion`)
 * also registers its `long_` and `strong_` versions ({@link potionRegistryIds}, ADR 0063 D9).
 * Only registries with at least one id appear. Sorted,
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
        if (registered === BLOCK_REGISTRY) {
          const itemId = blockItemIdOf(element.id, element.data);
          if (itemId !== undefined) add(ITEM_REGISTRY, itemId);
        }
        if (element.kind === ENTITY_KIND && entityHasSpawnEgg(element.data)) {
          add(ITEM_REGISTRY, spawnEggId(element.id));
        }
        if (element.kind === POTION_KIND) {
          for (const id of potionRegistryIds(element)) add(registered, id);
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
      if (registry === BLOCK_REGISTRY) {
        const itemId = blockItemIdOf(element.id, element.data);
        if (itemId !== undefined) add(ITEM_REGISTRY, itemId);
      }
    }
  }
  return sortedRecord(new Map([...map].map(([name, ids]) => [name, [...ids]])));
}

const BLOCK_REGISTRY = 'block';
const ITEM_REGISTRY = 'item';
const BLOCK_KIND = 'msm:block';
const ENTITY_KIND = 'msm:entity';
const POTION_KIND = 'msm:potion';

/**
 * The `potion` registry ids an `msm:potion` element registers (ADR 0063 D3, D9): its own id
 * plus `<ns>:long_<path>` and `<ns>:strong_<path>` when it has those versions, as the plugin's
 * lowering writes them. Only the element id when its data or id cannot be lowered.
 *
 * @param element - The `msm:potion` element.
 */
export function potionRegistryIds(element: Element): string[] {
  try {
    return potionVariantIds(element);
  } catch {
    return [element.id];
  }
}

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
 * Whether a block element registers a block item: every block does, as in the game, unless its
 * data is an object with `"item": false`. The item's id is `blockItemIdOf` (the block's id or
 * its `item.id`).
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
 * The ids a project defines, per registry: `model` (model elements, the item models of
 * entity spawn eggs with a texture and the models lowering generates for `msm:block` elements,
 * `blockGeneratedModelIds`: a typed block's `<ns>:block/<path>` models and the flat item model
 * of doors, panes, crops and saplings), `texture` (PNG assets
 * under `textures/`), `sound` (Ogg assets under `sounds/`), `weighed_sound_event` (every event
 * key of a `minecraft:sounds` element: key `foo.bar` in namespace `ns` is `ns:foo.bar`) and
 * the data pack registries of {@link dataRegistryIds}. Sorted, namespaced, without duplicates.
 *
 * Event keys are not `sound_event` ids: the game decodes a `sound_event` string as a
 * reference into its registry, where a key from a resource pack's `sounds.json` is not; such
 * a key is written `{ "sound_id": "ns:foo.bar" }` (registry `weighed_sound_event`). The
 * registry view of an MSM kind adds them to `sound_event` ({@link soundAwareRegistryIds}).
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
      if (element.kind === BLOCK_KIND)
        model.push(...blockGeneratedModelIds(element.id, element.data));
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
    model: [...new Set(model)].sort(),
    sound: sound.sort(),
    texture: texture.sort(),
    [WEIGHED_SOUND_EVENT]: [...soundEvent].sort(),
  };
}

const KIND_PREFIX_MSM = 'msm:';

/** The registry the game decodes a plain sound event string against. */
export const SOUND_EVENT = 'sound_event';

/**
 * Whether elements of `kindId` take the project's `sounds.json` event keys as plain
 * `sound_event` ids: MSM's own kinds (`msm:*`), whose data the MSM runtime reads and whose
 * project sound events it registers (ADR 0057 D1, D3). Vanilla kinds do not.
 *
 * @param kindId - An element kind id.
 */
export function takesProjectSoundEvents(kindId: string): boolean {
  return kindId.startsWith(KIND_PREFIX_MSM);
}

/**
 * `ids` (from {@link projectRegistryIds}) with the project's event keys (its
 * {@link WEIGHED_SOUND_EVENT} ids) added to {@link SOUND_EVENT}: the project ids of an MSM
 * kind's registry view (ADR 0057 D3). Sorted, without duplicates.
 *
 * @param ids - The project's registry ids.
 */
export function soundAwareRegistryIds(
  ids: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, list] of Object.entries(ids)) out[name] = [...list];
  const keys = ids[WEIGHED_SOUND_EVENT] ?? [];
  if (keys.length === 0) return out;
  out[SOUND_EVENT] = [...new Set([...(ids[SOUND_EVENT] ?? []), ...keys])].sort();
  return out;
}

/**
 * The kind id the registry view of an MSM output file is asked for: any `msm:*` id selects
 * the kind-aware view ({@link takesProjectSoundEvents}); no element has this kind.
 */
const MSM_OUTPUT_KIND = 'msm:output';

/** The layer of the files the MSM runtime reads (definitions under `msm/<ns>/`). */
const MSM_LAYER = 'msm';
const MSM_OUTPUT_PREFIX = 'msm/';

/**
 * Whether a lowered output file takes the project's `sounds.json` event keys as plain
 * `sound_event` ids: a file of the `msm` layer (or under `msm/`), which the MSM runtime reads
 * and whose project sound events it registers (ADR 0057 D3). Vanilla data and resource pack
 * files do not.
 *
 * @param file - The output file's layer and path.
 */
export function outputTakesProjectSoundEvents(file: Pick<OutputFile, 'layer' | 'path'>): boolean {
  return file.layer === MSM_LAYER || file.path.startsWith(MSM_OUTPUT_PREFIX);
}

/**
 * The kind id whose registry view and sound event rules apply to an output file:
 * {@link MSM_OUTPUT_KIND} for an MSM file, `undefined` (the plain view) otherwise.
 *
 * @param file - The output file's layer and path.
 */
export function outputKindFor(file: Pick<OutputFile, 'layer' | 'path'>): string | undefined {
  return outputTakesProjectSoundEvents(file) ? MSM_OUTPUT_KIND : undefined;
}

/**
 * Vanilla ids MSM adds to the vendored registries: mcmeta lists no `tag/function` ids, but
 * the game always defines `#minecraft:tick` and `#minecraft:load`.
 */
export const SEEDED_VANILLA_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'tag/function': Object.freeze(['load', 'tick']),
});

/**
 * The registry of `sounds.json` event keys, which mcmeta does not list: the ids a
 * `{ "sound_id": ... }` sound event names. It holds the project's event keys plus, as the
 * vanilla resource pack defines an event for each, the vanilla `sound_event` ids.
 */
export const WEIGHED_SOUND_EVENT = 'weighed_sound_event';

function withSeeds(
  vanilla: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = { ...vanilla };
  for (const [registry, ids] of Object.entries(SEEDED_VANILLA_IDS)) {
    out[registry] = [...new Set([...(vanilla[registry] ?? []), ...ids])];
  }
  if (out[WEIGHED_SOUND_EVENT] === undefined && vanilla.sound_event !== undefined) {
    out[WEIGHED_SOUND_EVENT] = vanilla.sound_event;
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

  // Both views are rebuilt only when the project's ids change; the ids are recomputed only
  // when the project (an immutable command stack state) changes.
  let cachedProject: Project | null = null;
  let cachedIds: Record<string, string[]> | null = null;
  let cachedKey: string | null = null;
  let cached: { plain: RegistryIndex; msm: RegistryIndex | null } | null = null;
  return {
    target,
    schemaIndex,
    vanillaRegistries,
    registries(project, kindId) {
      if (project !== cachedProject || cachedIds === null) {
        cachedIds = projectRegistryIds(project, kinds);
        cachedProject = project;
      }
      const ids = cachedIds;
      const key = JSON.stringify(ids);
      if (cached === null || key !== cachedKey) {
        cached = {
          plain: createRegistryIndex({ vanilla: vanillaRegistries, project: ids }),
          msm: null,
        };
        cachedKey = key;
      }
      if (kindId === undefined || !takesProjectSoundEvents(kindId)) return cached.plain;
      cached.msm ??= createRegistryIndex({
        vanilla: vanillaRegistries,
        project: soundAwareRegistryIds(ids),
      });
      return cached.msm;
    },
  };
}

// Sound event references the game cannot load. A `sound_event` field written as a string (a
// jukebox song's `sound_event`, a consumable's `sound`, an equippable's `equip_sound`, …) is
// decoded as a reference into the game's sound event registry. An event key that only a
// resource pack's `sounds.json` defines (a project `minecraft:sounds` element) is not in that
// registry, so the data pack entry fails to load; the inline form `{ "sound_id": "<key>" }`
// names it instead.

/** Problem code of a `sounds.json` event key written where a registered sound event belongs. */
export const UNREGISTERED_SOUND_EVENT = 'schema.unregistered-sound-event';

/** The `expected` text `validateJson` gives an unknown `sound_event` id. */
const SOUND_EVENT_EXPECTED = 'sound_event id';

/** The value at RFC 6901 `pointer` in `data`, or `undefined`. */
function soundValueAt(data: Json | undefined, pointer: string): Json | undefined {
  let segments: string[];
  try {
    segments = parseJsonPointer(pointer);
  } catch {
    return undefined;
  }
  let current: Json | undefined = data;
  for (const segment of segments) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (typeof current === 'object' && current !== null) current = current[segment];
    else return undefined;
  }
  return current;
}

/** `x` becomes `minecraft:x`; a namespaced id is returned unchanged. */
function namespacedSoundId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/**
 * The message for an event key `id` written as a plain string in a `sound_event` field.
 *
 * @param id - The event key as written.
 */
export function unregisteredSoundEventMessage(id: string): string {
  const key = namespacedSoundId(id);
  return `Sound event ${JSON.stringify(id)} comes from a sounds element, not the game's sound event registry, so the game cannot load a plain string here. Write it as { "sound_id": ${JSON.stringify(key)} } instead.`;
}

/**
 * Rewrites the `schema.unknown-id` problems of `sound_event` strings that name a `sounds.json`
 * event key (an id of {@link WEIGHED_SOUND_EVENT}, usually from a project `minecraft:sounds`
 * element) into an error with code {@link UNREGISTERED_SOUND_EVENT} that asks for the
 * `{ "sound_id": ... }` form. Other problems pass through unchanged.
 *
 * Elements of MSM's own kinds (`msm:*`) are read by the MSM runtime, which registers the
 * project's event keys as sound events (ADR 0057 D1); they take a plain string only. Their
 * kind-aware registry view ({@link SchemaContext.registries} with the kind id) already
 * accepts project keys, so no such problem arises there; one that does (a view without the
 * kind) passes through unchanged, as the `{ "sound_id" }` advice does not apply to them.
 *
 * @param problems - The element's schema problems.
 * @param kindId - The element's kind id.
 * @param data - The element's data.
 * @param registries - The project's registry index.
 */
export function rewriteSoundEventProblems(
  problems: readonly SchemaProblem[],
  kindId: string,
  data: Json | undefined,
  registries: RegistryIndex,
): SchemaProblem[] {
  const out: SchemaProblem[] = [];
  for (const problem of problems) {
    if (problem.code !== 'schema.unknown-id' || problem.expected !== SOUND_EVENT_EXPECTED) {
      out.push(problem);
      continue;
    }
    const value = soundValueAt(data, problem.path);
    if (typeof value !== 'string' || !registries.has(WEIGHED_SOUND_EVENT, value)) {
      out.push(problem);
      continue;
    }
    if (takesProjectSoundEvents(kindId)) {
      out.push(problem);
      continue;
    }
    out.push({
      ...problem,
      severity: 'error',
      // A session code; `SchemaProblemCode` has no member for it.
      code: UNREGISTERED_SOUND_EVENT as SchemaProblem['code'],
      message: unregisteredSoundEventMessage(value),
    });
  }
  return out;
}
