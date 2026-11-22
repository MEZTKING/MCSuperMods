/**
 * The files the live world generation preview reads (ADR 0119 D4, D5; B580).
 *
 * - **The project's files** come from the open session: each element whose kind's folder is a
 *   world generation folder (the target's `worldgen.terrainPreview.dataFolders`, plus
 *   `dimension`) is lowered for the target, and its JSON files go into a map of folder key to id
 *   to JSON. Lowered files are kept per element; after an edit only an element whose data
 *   changed is lowered again.
 * - **Vanilla's files** come from the user's own jar cache through `readWorldgenFiles` (B577),
 *   read once per version and kept for the run (an answer takes 190–340 ms). A `null` answer
 *   (no cache, or a target without the fact) is not kept: the next refresh asks again, and the
 *   views show the set-up banner meanwhile (ADR 0119 D10). The files stay in memory and in the
 *   worker; nothing here writes them anywhere.
 * - **Vanilla's biome lists** (B592): the answer's `resolvedBiomeLists` (from the runtime's dev
 *   mode after a Play) go into vanilla's files under {@link RESOLVED_BIOME_LISTS_FOLDER}, where the
 *   engine's `resolvePreset` reads them. An answer without them is asked again after
 *   {@link BIOME_LISTS_RECHECK_MS}, so a Play made while the app runs shows vanilla's biomes.
 * - **Biome additions** (`msm:biome_addition`, ADR 0060 D2) lower to the runtime's own folder,
 *   `msm/<ns>/biome_addition/<path>.json`; they are passed under the folder key
 *   {@link ADDITIONS_FOLDER} with the id `<ns>:<path>`, so the features stage places them (B583).
 * - **Facts:** the target's `terrainPreview` (data folders, approximate parts) with its feature
 *   steps and vanilla feature order (`worldgen.featureSteps`, `worldgen.vanillaFeatureOrder`).
 * - **Live:** a project change is picked up {@link TERRAIN_DEBOUNCE_MS} after the last edit; a
 *   new set of files is handed on only when its hash changed.
 *
 * Nothing here imports `@msm/terrain`; the engine runs in `worker.ts`.
 */

import type { Element, MaybePromise, OutputFile, Project, Target } from '@msm/plugin-api';
import type { ResolvedBiomeListsView, VanillaWorldgenFiles } from '../../../shared/platform';
import { bridge } from '../session/bridge-fs';
import { hashText, stableKey, type TerrainFacts, type WorldgenFileMap } from './client';

/** A view asks again this long after the last edit (ADR 0119 D5). */
export const TERRAIN_DEBOUNCE_MS = 150;

/** Folders a project has that vanilla's jar does not (the vanilla dimensions are in presets). */
const PROJECT_ONLY_FOLDERS: readonly string[] = ['dimension'];

/** The folder key the engine reads biome additions under (`@msm/terrain` `ADDITIONS_FOLDER`). */
export const ADDITIONS_FOLDER = 'msm/biome_addition';

/** The folder key the engine reads vanilla's resolved biome lists under (`@msm/terrain`'s `RESOLVED_BIOME_LISTS_FOLDER`). */
export const RESOLVED_BIOME_LISTS_FOLDER = 'msm/resolved_biome_list';

/** An answer without vanilla's biome lists is asked again after this long (B592). */
export const BIOME_LISTS_RECHECK_MS = 30_000;

/** The kind folder of `msm:biome_addition` (its elements are lowered for the features). */
const ADDITION_KIND_FOLDER = 'biome_addition';

/** The part of an element kind `files.ts` uses. */
export interface WorldgenKindLike {
  readonly folder: string;
  lower(element: Element, target: Target): MaybePromise<OutputFile[]>;
}

/** The part of the project session `files.ts` reads. */
export interface WorldgenSession {
  readonly snapshot: { readonly project: Project | null };
  subscribe(listener: (snapshot: { readonly project: Project | null }) => void): () => void;
  readonly registry: { get(kind: string): WorldgenKindLike | undefined };
  readonly target: Target;
}

/** Where vanilla's files come from (default: the preload bridge). */
export type ReadVanillaWorldgen = (mcVersion: string) => Promise<VanillaWorldgenFiles | null>;

/** A file that could not be lowered. */
export interface TerrainFileProblem {
  readonly elementId: string;
  readonly message: string;
}

/** One set of files for the worker. */
export interface TerrainFilesState {
  readonly target: Target;
  /** The target's facts for the engine (`worldgen.terrainPreview`; empty without the fact). */
  readonly facts: TerrainFacts;
  /** The project's files. */
  readonly project: WorldgenFileMap;
  /** Vanilla's files, or `null` without the jar cache. */
  readonly vanilla: WorldgenFileMap | null;
  /** A key for {@link vanilla} (the version it came from), `null` with it. */
  readonly vanillaKey: string | null;
  /**
   * True when vanilla's files are missing although the target has the fact: a view that needs
   * a vanilla file shows the set-up banner (ADR 0119 D10).
   */
  readonly needsSetUp: boolean;
  /** The hash of the project files, the vanilla key and the facts. */
  readonly filesHash: string;
  readonly problems: readonly TerrainFileProblem[];
}

/** The engine's facts from the target's fact, or empty lists on a target without it. */
export function factsOf(target: Target): TerrainFacts {
  const fact = target.worldgen.terrainPreview;
  const order = target.worldgen.vanillaFeatureOrder;
  return {
    dataFolders: [...(fact?.dataFolders ?? [])],
    approximate: [...(fact?.approximate ?? [])],
    ...(target.worldgen.featureSteps === undefined
      ? {}
      : { featureSteps: [...target.worldgen.featureSteps] }),
    ...(order === undefined ? {} : { featureOrder: order }),
  };
}

/**
 * The folder key and id of a lowered biome addition (`msm/<ns>/biome_addition/<path>.json` to
 * {@link ADDITIONS_FOLDER} and `<ns>:<path>`), or `null` for any other path.
 */
export function additionAndId(path: string): { folder: string; id: string } | null {
  const match = /^msm\/([^/]+)\/biome_addition\/(.+)\.json$/.exec(path);
  if (match === null) return null;
  return { folder: ADDITIONS_FOLDER, id: `${match[1]}:${match[2]}` };
}

/**
 * The folder key and id of a lowered file, or `null` when it is not in one of `folders`:
 * `data/<ns>/<folder>/<path>.json` gives `<folder>` and `<ns>:<path>` (the longest folder wins,
 * as `tags/worldgen/biome` over a shorter one).
 */
export function folderAndId(
  path: string,
  folders: readonly string[],
): { folder: string; id: string } | null {
  const match = /^data\/([^/]+)\/(.+)\.json$/.exec(path);
  if (match === null) return null;
  const [, namespace, rest] = match as unknown as [string, string, string];
  let best: string | null = null;
  for (const folder of folders) {
    if (rest.startsWith(`${folder}/`) && (best === null || folder.length > best.length)) {
      best = folder;
    }
  }
  if (best === null) return null;
  return { folder: best, id: `${namespace}:${rest.slice(best.length + 1)}` };
}

interface Lowered {
  readonly element: Element;
  readonly signature: string;
  readonly files: readonly { folder: string; id: string; json: unknown }[];
  readonly problem: string | null;
}

/** Elements of different kinds may share an id (a dimension and its noise settings). */
function loweredKey(element: Element): string {
  return `${element.kind} ${element.id}`;
}

interface VanillaEntry {
  readonly answer: Promise<VanillaWorldgenFiles | null>;
  /** When it was asked. */
  readonly at: number;
  /** Set once the answer came without the resolved biome lists. */
  noLists: boolean;
}

const vanillaByVersion = new Map<string, VanillaEntry>();

/** Forgets the vanilla files read so far (after a new jar set-up, and in tests). */
export function forgetVanillaWorldgen(): void {
  vanillaByVersion.clear();
}

/**
 * Vanilla's files for `mcVersion`, read once a version; a `null` answer is asked again, and an
 * answer without the resolved biome lists once it is {@link BIOME_LISTS_RECHECK_MS} old (B592).
 */
export function vanillaWorldgen(
  mcVersion: string,
  read: ReadVanillaWorldgen,
  now: () => number = Date.now,
): Promise<VanillaWorldgenFiles | null> {
  const known = vanillaByVersion.get(mcVersion);
  if (known !== undefined && !(known.noLists && now() - known.at >= BIOME_LISTS_RECHECK_MS)) {
    return known.answer;
  }
  const forget = () => {
    if (vanillaByVersion.get(mcVersion) === entry) vanillaByVersion.delete(mcVersion);
  };
  const entry: VanillaEntry = {
    answer: read(mcVersion).then(
      (answer) => {
        if (answer === null) forget();
        else if (answer.resolvedBiomeLists === null) entry.noLists = true;
        return answer;
      },
      (error: unknown) => {
        forget();
        throw error;
      },
    ),
    at: now(),
    noLists: false,
  };
  vanillaByVersion.set(mcVersion, entry);
  return entry.answer;
}

/** Vanilla's files with the resolved biome lists laid in under their folder key (B592). */
function vanillaFiles(vanilla: VanillaWorldgenFiles): WorldgenFileMap {
  const lists = vanilla.resolvedBiomeLists;
  return lists === null
    ? vanilla.files
    : { ...vanilla.files, [RESOLVED_BIOME_LISTS_FOLDER]: lists };
}

/** A short key of the lists (preset ids and point counts) for the vanilla files' key. */
function listsKey(lists: ResolvedBiomeListsView): string {
  return Object.entries(lists)
    .map(([id, list]) => `${id}=${list.points.length}`)
    .sort()
    .join(',');
}

/** Options of {@link TerrainFiles}. */
export interface TerrainFilesOptions {
  /** Called with each new set of files (not when the hash is the same). */
  onFiles(state: TerrainFilesState): void;
  /** Called when reading the files fails as a whole. */
  onError?(error: unknown): void;
  /** Default {@link TERRAIN_DEBOUNCE_MS}. */
  debounceMs?: number;
  /** Default: `bridge().minecraft.readWorldgenFiles`. */
  readVanilla?: ReadVanillaWorldgen;
}

/** Follows the session and hands on the preview's files; see the module comment. */
export class TerrainFiles {
  readonly #session: WorldgenSession;
  readonly #options: TerrainFilesOptions;
  readonly #lowered = new Map<string, Lowered>();
  readonly #unsubscribe: () => void;
  #target: Target | null = null;
  #project: Project | null;
  #current: TerrainFilesState | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #generation = 0;
  #disposed = false;
  /** Elements lowered so far (for tests). */
  lowerings = 0;

  constructor(session: WorldgenSession, options: TerrainFilesOptions) {
    this.#session = session;
    this.#options = options;
    this.#project = session.snapshot.project;
    this.#unsubscribe = session.subscribe((snapshot) => {
      if (snapshot.project === this.#project && session.target === this.#target) return;
      this.#project = snapshot.project;
      this.#schedule();
    });
  }

  /** The last files handed on, or `null` before the first refresh finished. */
  get current(): TerrainFilesState | null {
    return this.#current;
  }

  /** Reads the files now (the first time; later refreshes follow the session by themselves). */
  async refresh(): Promise<TerrainFilesState | null> {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    const generation = ++this.#generation;
    const project = this.#session.snapshot.project;
    const target = this.#session.target;
    try {
      const facts = factsOf(target);
      const read =
        this.#options.readVanilla ?? ((version) => bridge().minecraft.readWorldgenFiles(version));
      const vanillaAsk =
        facts.dataFolders.length > 0
          ? vanillaWorldgen(target.mcVersion, read)
          : Promise.resolve(null);
      const projectFiles = await this.#projectFiles(project, target, facts);
      const vanilla = await vanillaAsk;
      if (this.#disposed || generation !== this.#generation) return this.#current;
      const lists = vanilla?.resolvedBiomeLists ?? null;
      const vanillaKey =
        vanilla === null
          ? null
          : `${target.id}:${vanilla.version}:${lists === null ? 'no-lists' : `lists-${listsKey(lists)}`}`;
      const map = projectFiles.map;
      const filesHash = hashText(
        `${vanillaKey ?? 'none'}:${vanilla?.fileCount ?? 0}|${stableKey(facts)}|${stableKey(map)}`,
      );
      this.#target = target;
      if (this.#current !== null && this.#current.filesHash === filesHash) return this.#current;
      this.#current = {
        target,
        facts,
        project: map,
        vanilla: vanilla === null ? null : vanillaFiles(vanilla),
        vanillaKey,
        needsSetUp: vanilla === null && facts.dataFolders.length > 0,
        filesHash,
        problems: projectFiles.problems,
      };
      this.#options.onFiles(this.#current);
    } catch (error) {
      if (!this.#disposed && generation === this.#generation) this.#options.onError?.(error);
    }
    return this.#current;
  }

  /** Stops following the session. */
  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#unsubscribe();
  }

  async #projectFiles(
    project: Project | null,
    target: Target,
    facts: TerrainFacts,
  ): Promise<{ map: WorldgenFileMap; problems: TerrainFileProblem[] }> {
    if (this.#target !== null && this.#target !== target) this.#lowered.clear();
    const folders = [...new Set([...facts.dataFolders, ...PROJECT_ONLY_FOLDERS])];
    const wanted = new Set(folders);
    const seen = new Set<string>();
    const map: Record<string, Record<string, unknown>> = {};
    const problems: TerrainFileProblem[] = [];
    for (const namespace of project?.namespaces ?? []) {
      for (const element of namespace.elements) {
        const kind = this.#session.registry.get(element.kind);
        if (kind === undefined) continue;
        if (!wanted.has(kind.folder) && kind.folder !== ADDITION_KIND_FOLDER) continue;
        seen.add(loweredKey(element));
        const lowered = await this.#lower(element, kind, target, folders);
        if (lowered.problem !== null) {
          problems.push({ elementId: element.id, message: lowered.problem });
        }
        for (const file of lowered.files) {
          map[file.folder] ??= {};
          (map[file.folder] as Record<string, unknown>)[file.id] = file.json;
        }
      }
    }
    for (const id of [...this.#lowered.keys()]) if (!seen.has(id)) this.#lowered.delete(id);
    return { map, problems };
  }

  async #lower(
    element: Element,
    kind: WorldgenKindLike,
    target: Target,
    folders: readonly string[],
  ): Promise<Lowered> {
    const key = loweredKey(element);
    const before = this.#lowered.get(key);
    if (before !== undefined && before.element === element) return before;
    const signature = stableKey({ data: element.data, kind: element.kind });
    if (before !== undefined && before.signature === signature) {
      const kept = { ...before, element };
      this.#lowered.set(key, kept);
      return kept;
    }
    this.lowerings += 1;
    let lowered: Lowered;
    try {
      const files: { folder: string; id: string; json: unknown }[] = [];
      for (const file of await kind.lower(element, target)) {
        if (file.contents instanceof Uint8Array) continue;
        const where = folderAndId(file.path, folders) ?? additionAndId(file.path);
        if (where !== null) files.push({ ...where, json: file.contents });
      }
      lowered = { element, signature, files, problem: null };
    } catch (error) {
      lowered = {
        element,
        signature,
        files: [],
        problem: error instanceof Error ? error.message : String(error),
      };
    }
    this.#lowered.set(key, lowered);
    return lowered;
  }

  #schedule(): void {
    if (this.#disposed) return;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.refresh();
    }, this.#options.debounceMs ?? TERRAIN_DEBOUNCE_MS);
  }
}
