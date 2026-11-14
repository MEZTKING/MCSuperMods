/**
 * Vanilla pack safety (ADR 0066): keeps a vanilla data pack loadable when the project also
 * has content only the Fabric mod jar provides.
 *
 * A vanilla server rejects a whole data pack when any file of a registry-loaded folder
 * (recipes, loot tables, advancements, predicates, item modifiers, villager trades, trade
 * sets, enchantments, jukebox songs) names an id or `#tag` it does not know. Mod-only ids are
 * the ids MSM runtime kinds register (blocks and their items, items, effects, potions and
 * their versions, entities and their spawn eggs) plus project tags that hold nothing else.
 * For the vanilla data pack, files that name one are left out (one warning per element), tag
 * entries that name one become `{ "id": ..., "required": false }`, and functions that name
 * one are kept with a warning (the game skips only that function).
 *
 * @packageDocumentation
 */

import type {
  DataFolderKey,
  Exporter,
  Json,
  OutputFile,
  Problem,
  ResourceLocation,
  Target,
} from '@msm/plugin-api';

/** A data pack file left out because it names something only the mod jar provides. */
export const MOD_ONLY_REFERENCE = 'export.mod-only-reference';

/** A function that names something only the mod jar provides (kept; the game skips it). */
export const MOD_ONLY_FUNCTION = 'export.mod-only-function';

/** The registries MSM runtime kinds register ids in (ADR 0066 D2). */
export const RUNTIME_REGISTRIES: readonly string[] = Object.freeze([
  'block',
  'item',
  'mob_effect',
  'potion',
  'entity_type',
]);

/**
 * Data folders where one unknown id or `#tag` makes the game reject the whole data pack
 * (ADR 0066, verified on vanilla servers of both targets; `trade_set` by inference).
 */
export const FATAL_DATA_FOLDERS: readonly DataFolderKey[] = Object.freeze([
  'recipe',
  'loot_table',
  'advancement',
  'predicate',
  'item_modifier',
  'villager_trade',
  'trade_set',
  'enchantment',
  'jukebox_song',
] satisfies DataFolderKey[]);

/**
 * Keys whose string values name data the game does not resolve at load time (advancement
 * `rewards.recipes` and `rewards.function`, recipe criteria): never scanned.
 */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(['recipes', 'recipe', 'recipe_id', 'function']);

/** Mod-only ids per registry: registry name to ids (namespaced, without `#`). */
export type ModOnlyIds = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The mod-only ids of a project: the ids in {@link RUNTIME_REGISTRIES} of `registryIds` (for
 * example `dataRegistryIds(project)`, which already adds block items, spawn eggs and potion
 * versions). Registries without ids are left out.
 *
 * @param registryIds - The project's registry ids, per registry.
 */
export function modOnlyIdsOf(registryIds: Readonly<Record<string, readonly string[]>>): ModOnlyIds {
  const out = new Map<string, Set<string>>();
  for (const registry of RUNTIME_REGISTRIES) {
    const ids = registryIds[registry] ?? [];
    if (ids.length > 0) out.set(registry, new Set(ids));
  }
  return out;
}

/** The outcome of {@link vanillaSafeDataFiles}. */
export interface VanillaSafeResult {
  /** The files to package: `files` itself when nothing changed. */
  files: OutputFile[];
  /** One warning per element with left-out files, and one per element with flagged functions. */
  problems: Problem[];
}

interface ParsedFile {
  file: OutputFile;
  /** Registry (folder) name for the file's own id. */
  registry: string;
  /** The file's id, `<ns>:<path>`. */
  id: string;
  json: Json;
}

interface TagFile extends ParsedFile {
  values: Json[];
}

const utf8Decoder = new TextDecoder();
const DATA_PREFIX = 'data/';
const JSON_SUFFIX = '.json';
const MINECRAFT = 'minecraft';

function decode(contents: OutputFile['contents']): Json | undefined {
  if (!(contents instanceof Uint8Array)) return contents;
  try {
    return JSON.parse(utf8Decoder.decode(contents)) as Json;
  } catch {
    return undefined;
  }
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Splits `data/<ns>/<folder>/<rest>` into its parts, or `undefined`. */
function splitDataPath(path: string): { ns: string; folder: string; rest: string } | undefined {
  if (!path.startsWith(DATA_PREFIX)) return undefined;
  const parts = path.slice(DATA_PREFIX.length).split('/');
  if (parts.length < 3) return undefined;
  const [ns = '', folder = '', ...rest] = parts;
  return { ns, folder, rest: rest.join('/') };
}

/** The registry folder of a tag path below the `tags` folder: two segments under `worldgen/`. */
function splitTagRest(rest: string): { registry: string; path: string } | undefined {
  const parts = rest.split('/');
  const width = parts[0] === 'worldgen' ? 2 : 1;
  if (parts.length <= width) return undefined;
  return { registry: parts.slice(0, width).join('/'), path: parts.slice(width).join('/') };
}

function entryId(entry: Json): { id: string; optional: boolean } | undefined {
  if (typeof entry === 'string') return { id: entry, optional: false };
  if (isObject(entry) && typeof entry.id === 'string') {
    return { id: entry.id, optional: entry.required === false };
  }
  return undefined;
}

/** Tracks mod-only ids and tags while files are left out. */
class ModOnlySet {
  readonly #ids = new Map<string, Set<string>>();
  #tags = new Map<string, Set<string>>();
  /** Every mod-only id of a registry a generic reference may name. */
  readonly #generic = new Set<string>();
  #anyTag = new Set<string>();

  constructor(initial: ModOnlyIds) {
    for (const [registry, ids] of initial) for (const id of ids) this.add(registry, id);
  }

  add(registry: string, id: string): void {
    const ids = this.#ids.get(registry);
    if (ids === undefined) this.#ids.set(registry, new Set([id]));
    else ids.add(id);
    if (!SKIPPED_REGISTRIES.has(registry)) this.#generic.add(id);
  }

  has(registry: string, id: string): boolean {
    return this.#ids.get(registry)?.has(id) === true;
  }

  hasTag(registry: string, id: string): boolean {
    return this.#tags.get(registry)?.has(id) === true;
  }

  /** Whether a string in a generic position names a mod-only id or `#tag`. */
  generic(value: string): boolean {
    return value.startsWith('#') ? this.#anyTag.has(value.slice(1)) : this.#generic.has(value);
  }

  /** Whether a tag entry of `registry` names a mod-only id or tag. */
  entry(registry: string, id: string): boolean {
    return id.startsWith('#') ? this.hasTag(registry, id.slice(1)) : this.has(registry, id);
  }

  /**
   * Recomputes the mod-only tags: a tag with at least one entry whose every entry is mod-only
   * (an id, or a mod-only tag of its registry). A `minecraft` tag that does not replace keeps
   * the game's own entries, so it is never mod-only.
   */
  refreshTags(tags: readonly TagFile[]): void {
    const found = new Map<string, Set<string>>();
    const isTag = (registry: string, id: string) => found.get(registry)?.has(id) === true;
    let changed = true;
    while (changed) {
      changed = false;
      for (const tag of tags) {
        if (isTag(tag.registry, tag.id) || tag.values.length === 0) continue;
        if (
          tag.id.startsWith(`${MINECRAFT}:`) &&
          !(isObject(tag.json) && tag.json.replace === true)
        ) {
          continue;
        }
        const all = tag.values.every((value) => {
          const entry = entryId(value);
          if (entry === undefined) return false;
          return entry.id.startsWith('#')
            ? isTag(tag.registry, entry.id.slice(1))
            : this.has(tag.registry, entry.id);
        });
        if (!all) continue;
        const set = found.get(tag.registry);
        if (set === undefined) found.set(tag.registry, new Set([tag.id]));
        else set.add(tag.id);
        changed = true;
      }
    }
    this.#tags = found;
    this.#anyTag = new Set([...found.values()].flatMap((set) => [...set]));
  }
}

/** Registries whose references the game does not resolve at load (see {@link SKIPPED_KEYS}). */
const SKIPPED_REGISTRIES: ReadonlySet<string> = new Set(['recipe', 'function']);

/** Folder names of the data registries a reference position may name. */
interface DataRefFolders {
  lootTable: string;
  predicate: string;
  itemModifier: string;
  villagerTrade: string;
}

function isType(value: Json | undefined, name: string): boolean {
  return value === name || value === `${MINECRAFT}:${name}`;
}

/**
 * The first mod-only id or `#tag` a JSON value names, or `undefined`. Strings are checked as
 * whole ids; object keys too (enchantment level maps). Positions that name data-pack
 * resources (loot table, predicate and item modifier references, trade lists) are checked
 * against that registry only, so a project loot table that shares an item's id is not a hit.
 *
 * @param value - The parsed JSON.
 * @param set - The mod-only ids and tags.
 * @param folders - Folder names of the referenced data registries.
 */
function firstHit(value: Json, set: ModOnlySet, folders: DataRefFolders): string | undefined {
  const check = (text: string, registry: string | undefined): boolean => {
    if (registry === undefined) return set.generic(text);
    return set.entry(registry, text);
  };
  const walk = (node: Json, registry: string | undefined): string | undefined => {
    if (typeof node === 'string') return check(node, registry) ? node : undefined;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, registry);
        if (hit !== undefined) return hit;
      }
      return undefined;
    }
    if (!isObject(node)) return undefined;
    for (const [key, child] of Object.entries(node)) {
      if (set.generic(key)) return key;
      if (SKIPPED_KEYS.has(key) && (typeof child === 'string' || Array.isArray(child))) continue;
      let childRegistry: string | undefined;
      let tagName = false;
      if (key === 'loot' || key === 'loot_table') childRegistry = folders.lootTable;
      else if (key === 'trades') childRegistry = folders.villagerTrade;
      else if (key === 'value' || key === 'name') {
        if (isType(node.type, 'loot_table')) childRegistry = folders.lootTable;
        else if (isType(node.condition, 'reference')) childRegistry = folders.predicate;
        else if (isType(node.function, 'reference')) childRegistry = folders.itemModifier;
        else if (key === 'name' && isType(node.type, 'tag')) tagName = true;
      }
      if (tagName && typeof child === 'string') {
        if (set.generic(`#${child}`)) return child;
        continue;
      }
      const hit = walk(child, childRegistry);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(value, undefined);
}

/** Matches a namespaced id or `#tag` token in a command line. */
const ID_TOKEN = /(?<![A-Za-z0-9_.\-:/#])#?[a-z0-9_.-]+:[a-z0-9_./-]+/g;

/** Text that ends with the `function` command word (also after `schedule` or `run`). */
const AFTER_FUNCTION = /(?:^|\s)function\s+$/;

/** The first mod-only id or `#tag` a function's text names, skipping comment lines. */
function firstFunctionHit(text: string, set: ModOnlySet): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    for (const match of line.matchAll(ID_TOKEN)) {
      // `function <id>` names a function, which the mod does not register.
      if (AFTER_FUNCTION.test(line.slice(0, match.index))) continue;
      if (set.generic(match[0])) return match[0];
    }
  }
  return undefined;
}

/** Groups paths by element (the path itself when no element made it), in path order. */
function byElement(
  hits: ReadonlyMap<string, string>,
  elementOf: (path: string) => ResourceLocation | undefined,
): { elementId: ResourceLocation | undefined; paths: string[] }[] {
  const groups = new Map<string, { elementId: ResourceLocation | undefined; paths: string[] }>();
  for (const path of [...hits.keys()].sort()) {
    const elementId = elementOf(path);
    const key = elementId ?? `\0${path}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { elementId, paths: [path] });
    else group.paths.push(path);
  }
  return [...groups.values()];
}

function others(count: number): string {
  if (count === 0) return '';
  return count === 1 ? ' (and 1 other file)' : ` (and ${count} other files)`;
}

/**
 * The warning for an element whose data pack files were left out.
 *
 * @param file - The first left-out file.
 * @param id - The first mod-only id or `#tag` it names.
 * @param more - How many more files of the element were left out.
 */
export function modOnlyReferenceMessage(file: string, id: string, more = 0): string {
  return `Left out of the vanilla data pack: ${file}${others(more)} names ${id}, which only the Fabric mod jar provides. A vanilla server would refuse the whole data pack; export the Fabric mod jar to use it.`;
}

/**
 * The warning for an element whose functions name mod-only content.
 *
 * @param file - The first such function.
 * @param id - The first mod-only id or `#tag` it names.
 * @param more - How many more functions of the element do.
 */
export function modOnlyFunctionMessage(file: string, id: string, more = 0): string {
  return `${file}${others(more)} names ${id}, which only the Fabric mod jar provides. A vanilla server skips this function; export the Fabric mod jar to use it.`;
}

/**
 * The vanilla data pack's files made safe to load (ADR 0066 D2): data pack files in a
 * {@link FATAL_DATA_FOLDERS} folder that name a mod-only id or `#tag` are left out (and so
 * are files that name a file left out, as a missing loot table reference is just as fatal),
 * tag entries that name one become `{ "id": ..., "required": false }`, and functions that
 * name one are kept with a warning. Returns `files` itself and no problems when `modOnly` is
 * empty, so a project without mod content exports byte-identically.
 *
 * @param files - The merged, validated output files.
 * @param modOnly - The project's mod-only ids ({@link modOnlyIdsOf}).
 * @param folders - The target's data folder names.
 * @param elementOf - The element that produced a file, if known.
 */
export function vanillaSafeDataFiles(
  files: OutputFile[],
  modOnly: ModOnlyIds,
  folders: Target['folders']['data'],
  elementOf: (path: string) => ResourceLocation | undefined = () => undefined,
): VanillaSafeResult {
  if ([...modOnly.values()].every((ids) => ids.size === 0)) return { files, problems: [] };
  const fatalFolders = new Map(FATAL_DATA_FOLDERS.map((key) => [folders[key], key]));
  const refFolders: DataRefFolders = {
    lootTable: folders.loot_table,
    predicate: folders.predicate,
    itemModifier: folders.item_modifier,
    villagerTrade: folders.villager_trade,
  };
  const fatal: ParsedFile[] = [];
  const tags: TagFile[] = [];
  const functions: OutputFile[] = [];
  for (const file of files) {
    if (file.layer !== 'datapack') continue;
    const parts = splitDataPath(file.path);
    if (parts === undefined) continue;
    if (parts.folder === folders.function && file.language === 'mcfunction') {
      functions.push(file);
      continue;
    }
    if (!parts.rest.endsWith(JSON_SUFFIX)) continue;
    const rest = parts.rest.slice(0, -JSON_SUFFIX.length);
    if (parts.folder === folders.tags) {
      const tag = splitTagRest(rest);
      const json = decode(file.contents);
      if (tag === undefined || !isObject(json) || !Array.isArray(json.values)) continue;
      tags.push({
        file,
        registry: tag.registry,
        id: `${parts.ns}:${tag.path}`,
        json,
        values: json.values,
      });
      continue;
    }
    if (!fatalFolders.has(parts.folder)) continue;
    const json = decode(file.contents);
    if (json === undefined) continue;
    fatal.push({ file, registry: parts.folder, id: `${parts.ns}:${rest}`, json });
  }

  const set = new ModOnlySet(modOnly);
  const dropped = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    set.refreshTags(tags);
    for (const parsed of fatal) {
      if (dropped.has(parsed.file.path)) continue;
      const hit = firstHit(parsed.json, set, refFolders);
      if (hit === undefined) continue;
      dropped.set(parsed.file.path, hit);
      set.add(parsed.registry, parsed.id);
      changed = true;
    }
  }

  const rewritten = new Map<OutputFile, OutputFile>();
  for (const tag of tags) {
    let touched = false;
    const values = tag.values.map((value) => {
      const entry = entryId(value);
      if (entry === undefined || entry.optional || !set.entry(tag.registry, entry.id)) return value;
      touched = true;
      return { id: entry.id, required: false };
    });
    if (!touched || !isObject(tag.json)) continue;
    rewritten.set(tag.file, { ...tag.file, contents: { ...tag.json, values } });
  }

  const flagged = new Map<string, string>();
  for (const file of functions) {
    const text =
      file.contents instanceof Uint8Array
        ? utf8Decoder.decode(file.contents)
        : String(file.contents);
    const hit = firstFunctionHit(text, set);
    if (hit !== undefined) flagged.set(file.path, hit);
  }

  const problems: Problem[] = [];
  for (const [hits, code, message] of [
    [dropped, MOD_ONLY_REFERENCE, modOnlyReferenceMessage],
    [flagged, MOD_ONLY_FUNCTION, modOnlyFunctionMessage],
  ] as const) {
    for (const { elementId, paths } of byElement(hits, elementOf)) {
      const [first = ''] = paths;
      problems.push({
        severity: 'warning',
        code,
        file: first,
        ...(elementId === undefined ? {} : { elementId }),
        message: message(first, hits.get(first) ?? '', paths.length - 1),
      });
    }
  }
  if (dropped.size === 0 && rewritten.size === 0) return { files, problems };
  return {
    files: files
      .filter((file) => !dropped.has(file.path) || file.layer !== 'datapack')
      .map((file) => rewritten.get(file) ?? file),
    problems,
  };
}

/**
 * `exporter` wrapped so that it packages {@link vanillaSafeDataFiles} and reports their
 * warnings; `exporter` itself when `modOnly` is empty.
 *
 * @param exporter - The vanilla data pack exporter.
 * @param modOnly - The project's mod-only ids.
 * @param elementOf - The element that produced a file, if known.
 */
export function vanillaSafeExporter(
  exporter: Exporter,
  modOnly: ModOnlyIds,
  elementOf?: (path: string) => ResourceLocation | undefined,
): Exporter {
  if (modOnly.size === 0) return exporter;
  return {
    ...exporter,
    async run(input) {
      const safe = vanillaSafeDataFiles(input.files, modOnly, input.target.folders.data, elementOf);
      for (const problem of safe.problems) input.problems.report(problem);
      await exporter.run({ ...input, files: safe.files });
    },
  };
}
