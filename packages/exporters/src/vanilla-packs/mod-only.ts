/**
 * Vanilla pack safety (ADR 0066): keeps a vanilla data pack loadable when the project also
 * has content only the Fabric mod jar provides.
 *
 * A vanilla server rejects a whole data pack when any file of a registry-loaded folder
 * (recipes, loot tables, advancements, predicates, item modifiers, villager trades, trade
 * sets, enchantments, jukebox songs, enchantment providers, dialogs, worldgen, dimensions)
 * names an id or `#tag` it does not know, or names a file of its own registries that is not
 * there. Mod-only ids are the ids MSM runtime kinds register (blocks and their items, items,
 * effects, potions and their versions, entities and their spawn eggs) plus project tags that
 * hold nothing else.
 * For the vanilla data pack, files that name one are left out (one warning per element), tag
 * entries that name one become `{ "id": ..., "required": false }`, and functions that name
 * one are kept with a warning (the game skips only that function; function tag entries naming
 * such a function become optional too, as a plain one would drop the whole tag).
 *
 * The rule is pure: the host computes the project's mod-only ids (it knows which kinds
 * register what) and passes them in; the app wraps `dataPackExporter` with
 * {@link vanillaSafeExporter} for its vanilla data pack exports, and the library test does the
 * same for its vanilla server packs.
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
import { ExportProblemCodes } from '../problem-codes';

/** A data pack file left out because it names something only the mod jar provides. */
export const MOD_ONLY_REFERENCE = ExportProblemCodes.modOnlyReference;

/** A function that names something only the mod jar provides (kept; the game skips it). */
export const MOD_ONLY_FUNCTION = ExportProblemCodes.modOnlyFunction;

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
 * (ADR 0066, verified on vanilla servers of both targets; `trade_set` by inference). Every
 * `worldgen` registry folder is one (`worldgen/<registry>/...`), and a reference to a
 * missing worldgen or dimension file is just as fatal.
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
  'enchantment_provider',
  'dialog',
  'worldgen',
  'dimension',
] satisfies DataFolderKey[]);

/**
 * Runtime registries whose unknown ids a file's registry tolerates (logged, that entry
 * dropped), per registry: a biome's spawners naming an unknown entity type (ADR 0066).
 */
const TOLERATED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['worldgen/biome', new Set(['entity_type'])],
]);

/**
 * Keys whose string values name data the game does not resolve at load time (advancement
 * `rewards.recipes` and `rewards.function`, recipe criteria): never scanned.
 */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(['recipes', 'recipe', 'recipe_id', 'function']);

/** Mod-only ids per registry: registry name to ids (namespaced, without `#`). */
export type ModOnlyIds = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The mod-only ids of a project: the ids in {@link RUNTIME_REGISTRIES} of `registryIds` (for
 * example the app's `dataRegistryIds(project)`, which already adds block items, spawn eggs and
 * potion versions). Registries without ids are left out.
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
const FUNCTION_SUFFIX = '.mcfunction';
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
  /** Every mod-only id of a registry a generic reference may name, with its registries. */
  readonly #generic = new Map<string, Set<string>>();
  #anyTag = new Set<string>();

  constructor(initial: ModOnlyIds) {
    for (const [registry, ids] of initial) for (const id of ids) this.add(registry, id);
  }

  add(registry: string, id: string): void {
    const ids = this.#ids.get(registry);
    if (ids === undefined) this.#ids.set(registry, new Set([id]));
    else ids.add(id);
    if (SKIPPED_REGISTRIES.has(registry)) return;
    const registries = this.#generic.get(id);
    if (registries === undefined) this.#generic.set(id, new Set([registry]));
    else registries.add(registry);
  }

  has(registry: string, id: string): boolean {
    return this.#ids.get(registry)?.has(id) === true;
  }

  hasTag(registry: string, id: string): boolean {
    return this.#tags.get(registry)?.has(id) === true;
  }

  /**
   * Whether a string in a generic position names a mod-only id or `#tag`.
   *
   * @param tolerated - Registries whose ids do not count here.
   */
  generic(value: string, tolerated?: ReadonlySet<string>): boolean {
    if (value.startsWith('#')) return this.#anyTag.has(value.slice(1));
    const registries = this.#generic.get(value);
    if (registries === undefined) return false;
    if (tolerated === undefined) return true;
    for (const registry of registries) if (!tolerated.has(registry)) return true;
    return false;
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
 * @param tolerated - Registries whose ids the file's own registry tolerates.
 */
function firstHit(
  value: Json,
  set: ModOnlySet,
  folders: DataRefFolders,
  tolerated?: ReadonlySet<string>,
): string | undefined {
  const check = (text: string, registry: string | undefined): boolean => {
    if (registry === undefined) return set.generic(text, tolerated);
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
      if (set.generic(key, tolerated)) return key;
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
 * name one are kept with a warning (function tag entries naming such a function become
 * optional, as the game drops the function and a plain entry would drop the tag). Returns
 * `files` itself and no problems when `modOnly` is empty, so a project without mod content
 * exports byte-identically.
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
    // A worldgen file's registry is `worldgen/<registry>`; its id is the path below that.
    const own = parts.folder === folders.worldgen ? splitTagRest(`worldgen/${rest}`) : undefined;
    if (parts.folder === folders.worldgen && own === undefined) continue;
    fatal.push({
      file,
      registry: own?.registry ?? parts.folder,
      id: `${parts.ns}:${own?.path ?? rest}`,
      json,
    });
  }

  const set = new ModOnlySet(modOnly);
  const dropped = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    set.refreshTags(tags);
    for (const parsed of fatal) {
      if (dropped.has(parsed.file.path)) continue;
      const hit = firstHit(parsed.json, set, refFolders, TOLERATED.get(parsed.registry));
      if (hit === undefined) continue;
      dropped.set(parsed.file.path, hit);
      set.add(parsed.registry, parsed.id);
      changed = true;
    }
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
  // The game drops a flagged function, and a function tag with a plain entry naming it is
  // then dropped too (with every pack's entries merged into it, such as `#minecraft:tick`),
  // so those entries become optional like mod-only ids.
  const skippedFunctions = new Set<string>();
  for (const path of flagged.keys()) {
    const parts = splitDataPath(path);
    if (parts === undefined || !parts.rest.endsWith(FUNCTION_SUFFIX)) continue;
    skippedFunctions.add(`${parts.ns}:${parts.rest.slice(0, -FUNCTION_SUFFIX.length)}`);
  }
  const optional = (registry: string, id: string): boolean =>
    set.entry(registry, id) || (registry === folders.function && skippedFunctions.has(id));

  const rewritten = new Map<OutputFile, OutputFile>();
  for (const tag of tags) {
    let touched = false;
    const values = tag.values.map((value) => {
      const entry = entryId(value);
      if (entry === undefined || entry.optional || !optional(tag.registry, entry.id)) return value;
      touched = true;
      return { id: entry.id, required: false };
    });
    if (!touched || !isObject(tag.json)) continue;
    rewritten.set(tag.file, { ...tag.file, contents: { ...tag.json, values } });
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
