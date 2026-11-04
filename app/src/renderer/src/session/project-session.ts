/**
 * The renderer-hosted project session (ADR 0007): one element-kind registry, one command
 * stack, load/save through the platform's file system with a save manifest (ADR 0012), live
 * schema problems (plan D5), live mcfunction problems through an injected checker (ADR 0014),
 * project assets, the reference index and rename refactor (ADR 0016), and export of the
 * resource and data packs and install of the resource pack. No DOM access, so it is testable
 * with an in-memory platform.
 *
 * @packageDocumentation
 */

import {
  type CommandEvent,
  CommandStack,
  commands,
  createElement,
  createEmptyProject,
  DuplicateElementError,
  type Element,
  ElementKindRegistry,
  elementFilePath,
  type Json,
  loadProject,
  mediaTypeForPath,
  type Problem,
  ProblemCodes,
  type Project,
  type ProjectCommand,
  type ProjectFileSystem,
  type Reference,
  type ReferenceIndex,
  type ResourceLocation,
  registerPlugin,
  type SaveManifest,
  saveProject,
} from '@msm/core';
import {
  combinedFileNames,
  createZipSink,
  dataPackExporter,
  ExportProblemCodes,
  type ExportReport,
  packFileName,
  resourcePackExporter,
  runExport,
} from '@msm/exporters';
import type { Command, Plugin, Target } from '@msm/plugin-api';
import { type SchemaNode, validateJson } from '@msm/schemas';
import type {
  AppSettingsPatch,
  AppSettingsView,
  AssetCacheInfoView,
  GameLocationList,
  GameLocationRef,
  MinecraftStatus,
  PlatformAdapter,
  WorldInfo,
} from '../../../shared/platform';
import { assetImportError } from './asset-files';
import {
  assertElementIdAllowed,
  defaultElementData,
  namespaceFromFolderName,
  PACK_MCMETA_KIND,
} from './element-defaults';
import {
  checkFunctionElement,
  FUNCTION_KIND,
  functionLines,
  type McfunctionChecker,
  mcfunctionProjectIds,
  mcfunctionTextValidator,
} from './mcfunction-problems';
import {
  buildSessionReferenceIndex,
  referencesForRename,
  type SessionReferences,
} from './references';
import { loadSchemaContext, projectRegistryIds, type SchemaContext } from './schema-context';

/** Everything the UI renders from the session. Replaced, never mutated. */
export interface SessionSnapshot {
  /** The absolute project directory, or `null` when no project is open. */
  root: string | null;
  /** The current (frozen) project state. */
  project: Project | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
  /**
   * Every live problem: load problems (with `file`), session warnings, then schema problems
   * (with `elementId` and an RFC 6901 `path`) in element order.
   */
  problems: readonly Problem[];
}

const EMPTY: SessionSnapshot = {
  root: null,
  project: null,
  dirty: false,
  canUndo: false,
  canRedo: false,
  undoLabel: undefined,
  redoLabel: undefined,
  problems: [],
};

/** The outcome of a new/open request. */
export type OpenOutcome =
  | { ok: true }
  | { ok: false; reason: string }
  | { ok: false; cancelled: true };

/** Where {@link ProjectSession.exportResourcePack} delivers the pack. */
export type ExportMode = 'zip' | 'install';

/** Which pack {@link ProjectSession.exportPack} builds. */
export type PackKind = 'resource' | 'data';

/**
 * How {@link ProjectSession.exportPack} delivers the pack: `zip` asks where to save it,
 * `install` writes it into the game (resource packs into `resourcepacks/`, data packs into a
 * world's `datapacks/`), and `combined` writes both packs into one folder the user picks.
 */
export type PackDelivery = 'zip' | 'install' | 'combined';

/** Options of {@link ProjectSession.exportPack}. */
export interface ExportPackOptions {
  /** The world folder under `saves/` for a data pack `install`. */
  worldDir?: string;
}

/** The result of {@link ProjectSession.renameElement}. */
export interface RenameResult {
  /** `false` when the rename was refused as `refs.rename-conflict`. */
  renamed: boolean;
  /** How many references were rewritten. */
  references: number;
}

/** The result of an export: the pipeline report plus where the pack went. */
export type ExportResult = ExportReport & {
  /** The written zip or installed pack path; absent when blocked or cancelled. */
  location?: string;
  /** `true` when the user cancelled the save dialog. */
  cancelled?: boolean;
};

/** The result of {@link ProjectSession.importAssets}. */
export interface ImportAssetsResult {
  /** Asset paths (relative to `assets/<ns>/`) written, in input order. */
  imported: string[];
  /** Files that were not imported, with the reason. */
  rejected: { name: string; reason: string }[];
}

/** A target as the session needs it (a `TargetBundle` from `@msm/targets` satisfies this). */
export interface SessionTarget {
  target: Target;
}

/** Options for {@link ProjectSession}. */
export interface ProjectSessionOptions {
  /** Plugins to register. */
  plugins?: readonly Plugin[];
  /** Clock for element timestamps. */
  now?: () => string;
  /** Built-in targets, newest first; the first is the default for new projects. */
  targets?: readonly SessionTarget[];
  /** Debounce for live validation in milliseconds (default 150). */
  validationDelay?: number;
  /**
   * Checks function sources (ADR 0014): live problems for `minecraft:function` elements and
   * the export gate's `validateText`. Without it functions get only schema problems and the
   * export reports them as unchecked.
   */
  mcfunction?: McfunctionChecker;
}

/** Problem codes the session itself reports. */
export const SessionProblemCodes = {
  unknownTarget: 'project.unknown-target',
  overwritesSkippedFile: 'project.overwrites-skipped-file',
  schemasUnavailable: 'schema.unavailable',
  assetTrashFailed: 'assets.trash-failed',
  /** The injected mcfunction checker failed; the function is not checked. */
  mcfunctionUnavailable: 'mcfunction.unavailable',
  /** A rename onto an id that already exists (from `@msm/core`). */
  renameConflict: ProblemCodes.refsRenameConflict,
} as const;

/**
 * Where removed assets' bytes wait so that undo can restore them (project-relative). The
 * folder is emptied when a project is opened or created: the undo history starts empty then,
 * so nothing in it can be restored any more. It is not emptied on save, because the undo
 * history survives a save.
 */
export const ASSET_TRASH_DIR = '.msm/trash';

/** `namespace` + asset `path` pairs of a project, keyed `<ns>\u0000<path>`. */
function assetKeys(project: Project | null): Set<string> {
  const keys = new Set<string>();
  for (const namespace of project?.namespaces ?? []) {
    for (const asset of namespace.assets) keys.add(`${namespace.name}\u0000${asset.path}`);
  }
  return keys;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? 'Untitled';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether pointer `path` is `hidden` or inside it. */
function isUnder(path: string, hidden: string): boolean {
  return path === hidden || path.startsWith(`${hidden}/`);
}

function elementsById(project: Project | null): Map<ResourceLocation, Element> {
  const map = new Map<ResourceLocation, Element>();
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) map.set(element.id, element);
  }
  return map;
}

/** A project session over a {@link PlatformAdapter}. */
export class ProjectSession {
  readonly registry = new ElementKindRegistry();
  readonly #platform: PlatformAdapter;
  readonly #fs: ProjectFileSystem;
  readonly #now: (() => string) | undefined;
  readonly #plugins: readonly Plugin[];
  readonly #targets: readonly SessionTarget[];
  readonly #validationDelay: number;
  readonly #mcfunction: McfunctionChecker | undefined;
  readonly #loadedSchemas = new Map<string, SchemaContext>();
  #referenceCache: {
    state: Project;
    context: SchemaContext | null;
    index: ReferenceIndex;
  } | null = null;
  #renameProblems: Problem[] = [];
  readonly #listeners = new Set<(snapshot: SessionSnapshot) => void>();
  readonly #schemaCache = new Map<string, Promise<SchemaContext>>();
  #stack: CommandStack | null = null;
  #unsubscribeStack: (() => void) | null = null;
  #root: string | null = null;
  #manifest: SaveManifest | undefined;
  #loadProblems: readonly Problem[] = [];
  #targetProblems: readonly Problem[] = [];
  #schemaLoadProblems: readonly Problem[] = [];
  #schemaProblems = new Map<ResourceLocation, Problem[]>();
  #pending = new Set<ResourceLocation>();
  #lastState: Project | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #validation: Promise<void> = Promise.resolve();
  #assetOps: Promise<void> = Promise.resolve();
  #assetProblems: Problem[] = [];
  #generation = 0;
  #snapshot: SessionSnapshot = EMPTY;

  /**
   * @param platform - Host services; `platform.fs` is scoped to the open root.
   * @param options - Plugins, targets, clock and validation debounce.
   */
  constructor(platform: PlatformAdapter, options: ProjectSessionOptions = {}) {
    this.#platform = platform;
    this.#fs = platform.fs;
    this.#now = options.now;
    this.#plugins = options.plugins ?? [];
    this.#targets = options.targets ?? [];
    this.#validationDelay = options.validationDelay ?? 150;
    this.#mcfunction = options.mcfunction;
    for (const plugin of this.#plugins) registerPlugin(this.registry, plugin);
  }

  /** The current snapshot. */
  get snapshot(): SessionSnapshot {
    return this.#snapshot;
  }

  /** Subscribes to snapshot changes; returns an unsubscribe function. */
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Command palette entries the registered plugins contribute, in plugin order. */
  get pluginCommands(): readonly Command[] {
    return this.#plugins.flatMap((plugin) => plugin.contributes.commands ?? []);
  }

  /** The live problems of one element. */
  problemsFor(elementId: ResourceLocation): Problem[] {
    return this.#snapshot.problems.filter((problem) => problem.elementId === elementId);
  }

  /** The id of the default target for new projects, or `undefined` with no targets. */
  get defaultTargetId(): string | undefined {
    return this.#targets[0]?.target.id;
  }

  /**
   * The target the open project exports for: its first listed target when built in, else
   * the default target (the session then reports `project.unknown-target`).
   *
   * @throws Error If no built-in target is configured.
   */
  get target(): Target {
    const wanted = this.#stack?.state.targets[0];
    const found = this.#targets.find((entry) => entry.target.id === wanted);
    const target = found?.target ?? this.#targets[0]?.target;
    if (target === undefined) throw new Error('No Minecraft target is available.');
    return target;
  }

  /**
   * The schema model and registries for the current {@link target}, loaded through
   * `platform.targets.readVendored` on first use and memoised per target.
   */
  async schemas(): Promise<SchemaContext> {
    const target = this.target;
    let cached = this.#schemaCache.get(target.id);
    if (cached === undefined) {
      cached = loadSchemaContext(this.#platform, target);
      this.#schemaCache.set(target.id, cached);
      cached.then(
        (context) => this.#loadedSchemas.set(target.id, context),
        () => this.#schemaCache.delete(target.id),
      );
    }
    return cached;
  }

  /**
   * Asks for an empty directory and creates a project there: the default target, the
   * registered plugins, a namespace named after the folder and its `pack.mcmeta` element.
   */
  async newProject(): Promise<OpenOutcome> {
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const path = await this.#platform.dialogs.pickDirectory({
      title: 'Choose an empty folder for the new project',
      mustBeEmpty: true,
    });
    if (path === null) return { ok: false, cancelled: true };
    const created = await this.#platform.project.createRoot(path);
    if (!created.ok) return created;
    const name = baseName(path);
    const targetId = this.defaultTargetId;
    const project = createEmptyProject(name, {
      targets: targetId === undefined ? [] : [targetId],
      plugins: this.#plugins.map((plugin) => plugin.id),
    });
    const namespace = namespaceFromFolderName(name);
    const elements: Element[] = [];
    const packKind = this.registry.get(PACK_MCMETA_KIND);
    if (packKind !== undefined) {
      const id: ResourceLocation = `${namespace}:pack`;
      elements.push(
        createElement({
          id,
          kind: PACK_MCMETA_KIND,
          data: defaultElementData(PACK_MCMETA_KIND, id, packKind.defaultData),
          ...(this.#now === undefined ? {} : { now: this.#now }),
        }),
      );
    }
    project.namespaces.push({ name: namespace, elements, assets: [] });
    const saved = await saveProject(this.#fs, project, this.registry);
    this.#adopt(path, project, [], saved.manifest);
    await this.#emptyTrash();
    return { ok: true };
  }

  /**
   * Asks for a project directory and loads it.
   */
  async openProject(): Promise<OpenOutcome> {
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const path = await this.#platform.dialogs.pickDirectory({ title: 'Open an MSM project' });
    if (path === null) return { ok: false, cancelled: true };
    const opened = await this.#platform.project.openRoot(path);
    if (!opened.ok) return opened;
    try {
      const { project, problems, manifest } = await loadProject(this.#fs, this.registry);
      this.#adopt(path, project, problems, manifest);
      await this.#emptyTrash();
      return { ok: true };
    } catch (error) {
      await this.#platform.project.closeRoot();
      this.#close();
      return { ok: false, reason: messageOf(error) };
    }
  }

  /**
   * The number of element files the last open could not load and left untouched on disk.
   */
  get skippedFileCount(): number {
    return this.#skippedFiles().size;
  }

  /**
   * Saves the project. Saving is never blocked (ADR 0012): it deletes only element files
   * the last load or save owned, so files that failed to load stay on disk.
   *
   * @throws Error If no project is open, or two elements map to the same file.
   */
  async save(): Promise<void> {
    const stack = this.#requireStack();
    const result = await saveProject(
      this.#fs,
      stack.state,
      this.registry,
      this.#manifest === undefined ? {} : { manifest: this.#manifest },
    );
    this.#manifest = result.manifest;
    // A skipped file that this save overwrote is now the session's own file.
    const written = new Set(result.written);
    this.#loadProblems = this.#loadProblems.filter(
      (problem) => problem.file === undefined || !written.has(problem.file),
    );
    stack.markSaved();
    this.#publish();
  }

  /** Adds an empty namespace. */
  addNamespace(name: string): void {
    this.#requireStack().execute(commands.addNamespace(name));
  }

  /**
   * Adds an element of a registered kind. Without `data`, the kind's `defaultData` is used
   * with its placeholders replaced by ids in the element's namespace.
   *
   * @throws Error If the kind is unknown or the id breaks a kind rule (`<ns>:sounds`).
   */
  addElement(input: { id: ResourceLocation; kind: string; data?: Json }): void {
    const kind = this.registry.get(input.kind);
    if (kind === undefined) {
      throw new Error(`Unknown element kind ${JSON.stringify(input.kind)}.`);
    }
    assertElementIdAllowed(input.kind, input.id);
    const element = createElement({
      id: input.id,
      kind: input.kind,
      data: input.data ?? defaultElementData(input.kind, input.id, kind.defaultData),
      ...(this.#now === undefined ? {} : { now: this.#now }),
    });
    const stack = this.#requireStack();
    const add = commands.addElement(element);
    const namespace = input.id.slice(0, input.id.indexOf(':'));
    if (stack.state.namespaces.some((entry) => entry.name === namespace)) {
      stack.execute(add);
      return;
    }
    // A template may target a namespace the project lacks (for example `minecraft:tick`):
    // create it in the same undo step.
    const addNamespace = commands.addNamespace(namespace);
    const command: ProjectCommand = {
      id: 'app.add-element-in-new-namespace',
      label: add.label,
      apply(draft) {
        addNamespace.apply(draft);
        add.apply(draft);
      },
    };
    stack.execute(command);
  }

  /** Removes an element. */
  removeElement(id: ResourceLocation): void {
    this.#requireStack().execute(commands.removeElement(id));
  }

  /** Replaces an element's data. */
  setElementData(id: ResourceLocation, data: Json): void {
    this.#requireStack().execute(commands.setElementData(id, data));
  }

  /**
   * Sets one value inside an element's data (RFC 6901 pointer; `undefined` deletes). Pass a
   * `coalesce` key such as `typing:<pointer>` so typing merges into one undo step.
   */
  setElementValue(
    id: ResourceLocation,
    pointer: string,
    value: Json | undefined,
    options: { coalesce?: string } = {},
  ): void {
    this.#requireStack().execute(
      commands.setElementValue(
        id,
        pointer,
        value,
        options.coalesce === undefined ? {} : { coalesce: options.coalesce },
      ),
    );
  }

  // References ---------------------------------------------------------------------------

  /**
   * Lookups over the current project's references (ADR 0016). The index is rebuilt lazily
   * from the command stack's state, memoised on the state object and the loaded schemas;
   * before schemas have loaded only function-line references are found.
   */
  readonly references: SessionReferences = {
    to: (id, registry) => this.#referenceIndex()?.referencesTo(id, registry) ?? [],
    from: (elementId) => this.#referenceIndex()?.referencesFrom(elementId) ?? [],
  };

  /**
   * Renames an element and rewrites every reference to it (schema references of its kind's
   * registry and function-line references) as one undoable command. A rename onto an existing
   * id does not throw: it is reported as the problem `refs.rename-conflict`, which clears on
   * the next command.
   *
   * @returns Whether the element was renamed and how many references were rewritten.
   * @throws Error If no project is open, `oldId` does not exist, the new namespace does not
   *   exist or the new id breaks a kind rule.
   */
  renameElement(oldId: ResourceLocation, newId: ResourceLocation): RenameResult {
    const stack = this.#requireStack();
    const element = elementsById(stack.state).get(oldId);
    if (element !== undefined) assertElementIdAllowed(element.kind, newId);
    const index = this.#referenceIndex();
    const references: Reference[] =
      element === undefined || index === null ? [] : referencesForRename(index, element);
    try {
      stack.execute(commands.renameElement(oldId, newId, references));
      return { renamed: true, references: references.length };
    } catch (error) {
      if (!(error instanceof DuplicateElementError)) throw error;
      this.#renameProblems = [
        {
          severity: 'error',
          code: SessionProblemCodes.renameConflict,
          elementId: oldId,
          message: `Cannot rename ${oldId} to ${newId}: an element with that id already exists.`,
        },
      ];
      this.#publish();
      return { renamed: false, references: 0 };
    }
  }

  #referenceIndex(): ReferenceIndex | null {
    const stack = this.#stack;
    if (stack === null) return null;
    const state = stack.state;
    const targetId = this.#targets.length === 0 ? undefined : this.target.id;
    const context =
      (targetId === undefined ? undefined : this.#loadedSchemas.get(targetId)) ?? null;
    const cached = this.#referenceCache;
    if (cached !== null && cached.state === state && cached.context === context) {
      return cached.index;
    }
    const index = buildSessionReferenceIndex(state, this.registry, context);
    this.#referenceCache = { state, context, index };
    return index;
  }

  /** Undoes the last command; returns `false` if there was none. */
  undo(): boolean {
    return this.#stack?.undo() ?? false;
  }

  /** Redoes the last undone command; returns `false` if there was none. */
  redo(): boolean {
    return this.#stack?.redo() ?? false;
  }

  // Assets ------------------------------------------------------------------------------

  /**
   * Imports files into `assets/<namespace>/<subfolder>/`. Each file is checked (safe name,
   * PNG header for textures, Ogg signature for sounds), written immediately (not undoable)
   * and then recorded with an undoable `addAsset` command. Re-importing an existing path
   * replaces its bytes and keeps the record.
   *
   * @param namespace - An existing namespace.
   * @param files - The files' names and bytes.
   * @param subfolder - For example `textures/block`, `textures/item` or `sounds`.
   * @throws Error If no project is open or the namespace does not exist.
   */
  async importAssets(
    namespace: string,
    files: readonly { name: string; data: Uint8Array }[],
    subfolder: 'textures/block' | 'textures/item' | 'sounds' | (string & {}),
  ): Promise<ImportAssetsResult> {
    const stack = this.#requireStack();
    const target = stack.state.namespaces.find((entry) => entry.name === namespace);
    if (target === undefined) throw new Error(`Namespace "${namespace}" does not exist.`);
    const result: ImportAssetsResult = { imported: [], rejected: [] };
    for (const file of files) {
      const reason = assetImportError(subfolder, file.name, file.data);
      if (reason !== undefined) {
        result.rejected.push({ name: file.name, reason });
        continue;
      }
      const path = `${subfolder}/${file.name}`;
      const dir = `assets/${namespace}/${subfolder}`;
      try {
        await this.#fs.mkdirp(dir);
        await this.#fs.writeFile(`${dir}/${file.name}`, file.data);
      } catch (error) {
        result.rejected.push({ name: file.name, reason: messageOf(error) });
        continue;
      }
      const current = stack.state.namespaces.find((entry) => entry.name === namespace);
      if (current?.assets.some((asset) => asset.path === path) !== true) {
        stack.execute(commands.addAsset(namespace, { path, mediaType: mediaTypeForPath(path) }));
      }
      result.imported.push(path);
    }
    return result;
  }

  /**
   * Removes an asset. The record goes through an undoable command; its bytes move to
   * {@link ASSET_TRASH_DIR} so that undo (which restores the record) can move them back.
   * Resolves when the bytes have moved.
   *
   * @param namespace - The asset's namespace.
   * @param path - The asset path relative to `assets/<namespace>/`.
   */
  async removeAsset(namespace: string, path: string): Promise<void> {
    this.#requireStack().execute(commands.removeAsset(namespace, path));
    await this.flushAssetFiles();
  }

  /**
   * Resolves when every pending asset byte move (to or from the trash after a remove, undo or
   * redo) has finished.
   */
  flushAssetFiles(): Promise<void> {
    return this.#assetOps;
  }

  /** Reads a project asset's bytes. */
  readAsset(namespace: string, path: string): Promise<Uint8Array> {
    return this.#fs.readFile(`assets/${namespace}/${path}`);
  }

  // Export -------------------------------------------------------------------------------

  /**
   * Exports the resource pack with `runExport` and the `vanilla-packs` exporter. Schema
   * errors (and every other error problem) block the export; nothing is written then.
   *
   * - `zip`: asks where to save the zip (`platform.dialogs.saveFile`), as
   *   {@link exportPack}`('resource', 'zip')`.
   * - `install`: writes the zip into the game's `resourcepacks/` folder.
   *
   * @throws Error If no project is open.
   */
  async exportResourcePack(mode: ExportMode): Promise<ExportResult> {
    if (mode === 'zip') return this.exportPack('resource', 'zip');
    const built = await this.#buildPack('resource');
    if (built.data === undefined) return built.report;
    const { path } = await this.#platform.minecraft.installResourcePack(built.fileName, built.data);
    return { ...built.report, location: path };
  }

  /**
   * Exports the resource pack (`vanilla-packs`) or the data pack (`vanilla-packs-data`) as a
   * zip the user saves. Every error problem blocks the export, including mcfunction errors
   * from the injected checker (`validateText`); warnings pass.
   *
   * @param pack - Which pack to build (ignored for `combined`, which builds both).
   * @param mode - `zip`: asks where to save it (`platform.dialogs.saveFile`); `install`: the
   *   game's `resourcepacks/` folder, or `saves/<options.worldDir>/datapacks/` for a data
   *   pack; `combined`: both packs into a folder the user picks (`platform.exports`).
   * @param options - `worldDir` for a data pack install.
   * @throws Error If no project is open, or a data pack install names no world.
   */
  async exportPack(
    pack: PackKind,
    mode: PackDelivery,
    options: ExportPackOptions = {},
  ): Promise<ExportResult> {
    if (mode === 'combined') return this.#exportCombined();
    if (pack === 'data' && mode === 'install' && options.worldDir === undefined) {
      throw new Error('Choose a world to install the data pack into.');
    }
    const built = await this.#buildPack(pack);
    if (built.data === undefined) return built.report;
    if (mode === 'install') {
      const { path } =
        pack === 'data'
          ? await this.#platform.minecraft.installDataPack(
              options.worldDir ?? '',
              built.fileName,
              built.data,
            )
          : await this.#platform.minecraft.installResourcePack(built.fileName, built.data);
      return { ...built.report, location: path };
    }
    const label = pack === 'data' ? 'Data pack' : 'Resource pack';
    const location = await this.#platform.dialogs.saveFile({
      title: `Export ${label.toLowerCase()}`,
      defaultName: built.fileName,
      filters: [{ name: label, extensions: ['zip'] }],
      data: built.data,
    });
    return location === null ? { ...built.report, cancelled: true } : { ...built.report, location };
  }

  /** Installs the data pack into the world folder `worldDir` under `saves/`. */
  installDataPack(worldDir: string): Promise<ExportResult> {
    return this.exportPack('data', 'install', { worldDir });
  }

  /** The worlds of the selected install target (rejects when there is none). */
  listWorlds(): Promise<WorldInfo[]> {
    return this.#platform.minecraft.listWorlds();
  }

  /**
   * Builds both packs, then asks for a folder and writes them there as
   * `combinedFileNames`. Nothing is asked or written when either pack is blocked; the
   * report merges both packs' problems.
   */
  async #exportCombined(): Promise<ExportResult> {
    const resources = await this.#buildPack('resource');
    const data = await this.#buildPack('data');
    // Each pack leaves out the other's layer; that note is noise when both are written.
    const relevant = (problems: readonly Problem[]) =>
      problems.filter((problem) => problem.code !== ExportProblemCodes.layerSkipped);
    const report: ExportReport = {
      ok: resources.report.ok && data.report.ok,
      problems: [...relevant(resources.report.problems), ...relevant(data.report.problems)],
      files: [...resources.report.files, ...data.report.files],
    };
    if (resources.data === undefined || data.data === undefined) return report;
    const folder = await this.#platform.exports.pickFolder('Export both packs into a folder');
    if (folder === null) return { ...report, cancelled: true };
    const project = this.#requireStack().state;
    const names = combinedFileNames(project.name, this.target);
    await this.#platform.exports.writeFiles(folder, [
      { name: names.resources, data: resources.data },
      { name: names.data, data: data.data },
    ]);
    return { ...report, location: folder };
  }

  /** Runs the export pipeline for one pack into a zip; `data` is absent when blocked. */
  async #buildPack(
    pack: PackKind,
  ): Promise<{ report: ExportReport; fileName: string; data?: Uint8Array }> {
    const stack = this.#requireStack();
    await this.flushValidation();
    await this.flushAssetFiles();
    const project = stack.state;
    const context = await this.schemas();
    const info = await this.#platform.app.info();
    const sink = createZipSink();
    const checker = this.#mcfunction;
    const report = await runExport({
      project,
      registry: this.registry,
      target: context.target,
      schemaIndex: context.schemaIndex,
      registries: context.registries(project),
      exporter: pack === 'data' ? dataPackExporter : resourcePackExporter,
      sink,
      readAsset: (namespace, path) => this.readAsset(namespace, path),
      meta: { msmVersion: info.version, plugins: [...project.plugins] },
      ...(checker === undefined
        ? {}
        : { validateText: mcfunctionTextValidator(checker, project, context.target) }),
    });
    const fileName = packFileName(project.name, context.target, pack);
    if (!report.ok) return { report, fileName };
    return { report, fileName, data: sink.finish() };
  }

  // Minecraft and settings ----------------------------------------------------------------

  /** The Minecraft installation and asset cache status for the current target. */
  async minecraftStatus(): Promise<MinecraftStatus> {
    return this.#platform.minecraft.status(this.target.mcVersion);
  }

  /**
   * Extracts preview assets from the client jar for the current target (ADR 0011). Progress
   * arrives on the bridge's `onMinecraftProgress`.
   */
  async extractVanillaAssets(): Promise<AssetCacheInfoView> {
    return this.#platform.minecraft.extract(this.target.mcVersion);
  }

  /** Reads the application settings. */
  getSettings(): Promise<AppSettingsView> {
    return this.#platform.settings.get();
  }

  /** Merges a change into the application settings; fields left out keep their value. */
  setSettings(settings: AppSettingsPatch): Promise<void> {
    return this.#platform.settings.set(settings);
  }

  /**
   * Every game location main found (official launcher, Prism, MultiMC, CurseForge), with
   * warnings such as a version mismatch computed against the current target (ADR 0019).
   */
  listLocations(): Promise<GameLocationList> {
    return this.#platform.minecraft.listLocations(this.target.mcVersion);
  }

  /**
   * Makes `ref` the install target for resource and data pack installs; `null` goes back to
   * the official launcher folder. Read the status again afterwards.
   */
  setInstallTarget(ref: GameLocationRef | null): Promise<void> {
    return this.#platform.settings.set({ installTarget: ref });
  }

  // Validation ---------------------------------------------------------------------------

  /**
   * Runs any pending validation now instead of after the debounce, and resolves when the
   * snapshot's problems are up to date.
   */
  flushValidation(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    return this.#runValidation();
  }

  #scheduleValidation(delay: number): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#runValidation();
    }, delay);
  }

  #runValidation(): Promise<void> {
    this.#validation = this.#validation.then(() => this.#validatePending());
    return this.#validation;
  }

  async #validatePending(): Promise<void> {
    const generation = this.#generation;
    if (this.#stack === null || this.#pending.size === 0) return;
    let context: SchemaContext;
    try {
      context = await this.schemas();
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#schemaLoadProblems = [
        {
          severity: 'warning',
          code: SessionProblemCodes.schemasUnavailable,
          message: `Schemas could not be loaded, so elements are not validated: ${messageOf(error)}`,
        },
      ];
      this.#pending.clear();
      this.#publish();
      return;
    }
    if (generation !== this.#generation || this.#stack === null) return;
    this.#schemaLoadProblems = [];
    const project = this.#stack.state;
    const elements = elementsById(project);
    const registries = context.registries(project);
    const pending = [...this.#pending];
    this.#pending.clear();
    const functions: { element: Element; problems: Problem[] }[] = [];
    for (const id of pending) {
      const element = elements.get(id);
      if (element === undefined) {
        this.#schemaProblems.delete(id);
        continue;
      }
      const problems = this.#validateElement(element, context, registries);
      if (
        element.kind === FUNCTION_KIND &&
        this.#mcfunction !== undefined &&
        !problems.some((problem) => problem.severity === 'error')
      ) {
        // Published together with the checker's problems, so they do not flicker.
        functions.push({ element, problems });
      } else {
        this.#schemaProblems.set(id, problems);
      }
    }
    this.#publish();
    if (functions.length > 0) await this.#checkFunctions(functions, context, project, generation);
  }

  /**
   * Runs the injected mcfunction checker over function elements after their schema check and
   * publishes its problems after theirs. An element that changed meanwhile is already queued
   * for another pass, which replaces these problems.
   */
  async #checkFunctions(
    functions: readonly { element: Element; problems: Problem[] }[],
    context: SchemaContext,
    project: Project,
    generation: number,
  ): Promise<void> {
    const checker = this.#mcfunction;
    if (checker === undefined) return;
    const projectIds = mcfunctionProjectIds(project);
    for (const { element, problems: schemaProblems } of functions) {
      const lines = functionLines(element) ?? [];
      let problems: Problem[];
      try {
        problems = await checkFunctionElement(checker, element, lines, context.target, projectIds);
      } catch (error) {
        problems = [
          {
            severity: 'warning',
            code: SessionProblemCodes.mcfunctionUnavailable,
            elementId: element.id,
            message: `The function could not be checked: ${messageOf(error)}`,
          },
        ];
      }
      if (generation !== this.#generation || this.#stack === null) return;
      if (!elementsById(this.#stack.state).has(element.id)) continue;
      this.#schemaProblems.set(element.id, [...schemaProblems, ...problems]);
      this.#publish();
    }
  }

  #validateElement(
    element: Element,
    context: SchemaContext,
    registries: ReturnType<SchemaContext['registries']>,
  ): Problem[] {
    const kind = this.registry.get(element.kind);
    if (kind === undefined) return [];
    let node: SchemaNode;
    try {
      node = context.schemaIndex.resolveSchemaRef(kind.schema);
    } catch {
      return [
        {
          severity: 'warning',
          code: SessionProblemCodes.schemasUnavailable,
          elementId: element.id,
          message: `The schema ${kind.schema} of kind ${kind.id} is not available for ${context.target.id}; the element is not validated.`,
        },
      ];
    }
    const hidden = kind.hiddenPaths ?? [];
    return validateJson(element.data, node, { registries })
      .filter((problem) => !hidden.some((path) => isUnder(problem.path, path)))
      .map((schemaProblem) => {
        const problem: Problem = {
          severity: schemaProblem.severity,
          code: schemaProblem.code,
          elementId: element.id,
          message: schemaProblem.message,
        };
        if (schemaProblem.path !== '') problem.path = schemaProblem.path;
        return problem;
      });
  }

  /** Marks elements whose data changed (by structural identity) for validation. */
  #onCommand(event: CommandEvent): void {
    const before = elementsById(this.#lastState);
    const after = elementsById(event.state);
    const idsKey = (project: Project | null) =>
      project === null ? '' : JSON.stringify(projectRegistryIds(project));
    this.#renameProblems = [];
    if (idsKey(this.#lastState) !== idsKey(event.state)) {
      // Project-defined ids changed, so `#[id]` warnings anywhere may change.
      for (const id of after.keys()) this.#pending.add(id);
    } else {
      for (const [id, element] of after) {
        if (before.get(id) !== element) this.#pending.add(id);
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) {
        this.#schemaProblems.delete(id);
        this.#pending.delete(id);
      }
    }
    this.#syncAssetFiles(this.#lastState, event.state);
    this.#lastState = event.state;
    if (this.#pending.size > 0) this.#scheduleValidation(this.#validationDelay);
    this.#publish();
  }

  // Asset trash --------------------------------------------------------------------------

  /**
   * Moves the bytes of assets whose records disappeared into the trash, and moves trashed
   * bytes back for records that reappeared (undo of a remove, redo of an import). Runs after
   * every command, in order, without blocking the command itself.
   */
  #syncAssetFiles(before: Project | null, after: Project): void {
    const old = assetKeys(before);
    const now = assetKeys(after);
    const removed = [...old].filter((key) => !now.has(key));
    const added = [...now].filter((key) => !old.has(key));
    if (removed.length === 0 && added.length === 0) return;
    const generation = this.#generation;
    const split = (key: string): [string, string] => {
      const at = key.indexOf('\u0000');
      return [key.slice(0, at), key.slice(at + 1)];
    };
    this.#assetOps = this.#assetOps.then(async () => {
      if (generation !== this.#generation) return;
      for (const key of removed) {
        const [namespace, path] = split(key);
        await this.#moveAssetFile(
          `assets/${namespace}/${path}`,
          `${ASSET_TRASH_DIR}/${namespace}/${path}`,
          'move to the trash',
        );
      }
      for (const key of added) {
        const [namespace, path] = split(key);
        const live = `assets/${namespace}/${path}`;
        const trashed = `${ASSET_TRASH_DIR}/${namespace}/${path}`;
        if (await this.#fs.exists(live)) {
          // Freshly imported bytes win; an older trashed copy is stale.
          await this.#fs.remove(trashed).catch(() => {});
        } else {
          await this.#moveAssetFile(trashed, live, 'restore');
        }
      }
    });
  }

  async #moveAssetFile(from: string, to: string, what: string): Promise<void> {
    try {
      if (!(await this.#fs.exists(from))) return;
      const data = await this.#fs.readFile(from);
      await this.#fs.writeFile(to, data);
      await this.#fs.remove(from);
    } catch (error) {
      this.#assetProblems.push({
        severity: 'warning',
        code: SessionProblemCodes.assetTrashFailed,
        file: from,
        message: `Could not ${what} ${from}: ${messageOf(error)}`,
      });
      this.#publish();
    }
  }

  async #emptyTrash(): Promise<void> {
    try {
      await this.#fs.remove(ASSET_TRASH_DIR);
    } catch {
      // Leftover trash is harmless: load never reads `.msm/`.
    }
  }

  // Internals ----------------------------------------------------------------------------

  async #confirmDiscard(): Promise<boolean> {
    if (!this.#snapshot.dirty) return true;
    return this.#platform.dialogs.confirmDiscard(
      'The current project has unsaved changes. Discard them?',
    );
  }

  #requireStack(): CommandStack {
    if (this.#stack === null) throw new Error('No project is open.');
    return this.#stack;
  }

  /** Element files that failed to load (error problems with `file`) and are not owned. */
  #skippedFiles(): Set<string> {
    const owned = new Set(this.#manifest?.elementFiles ?? []);
    const skipped = new Set<string>();
    for (const problem of this.#loadProblems) {
      if (problem.severity === 'error' && problem.file !== undefined && !owned.has(problem.file)) {
        skipped.add(problem.file);
      }
    }
    return skipped;
  }

  /** Warnings for elements that a save would write over a file that failed to load. */
  #overwriteProblems(project: Project): Problem[] {
    const skipped = this.#skippedFiles();
    if (skipped.size === 0) return [];
    const out: Problem[] = [];
    for (const namespace of project.namespaces) {
      for (const element of namespace.elements) {
        const folder = this.registry.folderFor(element.kind);
        if (folder === undefined) continue;
        const file = elementFilePath(element, folder);
        if (!skipped.has(file)) continue;
        out.push({
          severity: 'warning',
          code: SessionProblemCodes.overwritesSkippedFile,
          elementId: element.id,
          file,
          message: `Saving will replace ${file}, which could not be loaded. Rename ${element.id} to keep that file.`,
        });
      }
    }
    return out;
  }

  #targetProblemsFor(project: Project): Problem[] {
    const wanted = project.targets[0];
    if (wanted === undefined || this.#targets.some((entry) => entry.target.id === wanted)) {
      return [];
    }
    const fallback = this.#targets[0]?.target.id;
    return [
      {
        severity: 'warning',
        code: SessionProblemCodes.unknownTarget,
        message:
          fallback === undefined
            ? `Target "${wanted}" is not supported by this version of MSM.`
            : `Target "${wanted}" is not supported by this version of MSM; using ${fallback} instead.`,
      },
    ];
  }

  #adopt(
    root: string,
    project: Project,
    problems: readonly Problem[],
    manifest: SaveManifest,
  ): void {
    this.#reset();
    this.#stack = new CommandStack(project);
    this.#unsubscribeStack = this.#stack.subscribe((event) => this.#onCommand(event));
    this.#root = root;
    this.#manifest = manifest;
    this.#loadProblems = problems;
    this.#targetProblems = this.#targetProblemsFor(project);
    this.#lastState = project;
    for (const id of elementsById(project).keys()) this.#pending.add(id);
    this.#publish();
    // Full pass on open, without the debounce.
    if (this.#pending.size > 0) this.#scheduleValidation(0);
  }

  #reset(): void {
    this.#generation += 1;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#unsubscribeStack?.();
    this.#unsubscribeStack = null;
    this.#stack = null;
    this.#root = null;
    this.#manifest = undefined;
    this.#loadProblems = [];
    this.#targetProblems = [];
    this.#schemaLoadProblems = [];
    this.#schemaProblems = new Map();
    this.#pending.clear();
    this.#lastState = null;
    this.#assetProblems = [];
    this.#renameProblems = [];
    this.#referenceCache = null;
  }

  #close(): void {
    this.#reset();
    this.#publish();
  }

  #publish(): void {
    const stack = this.#stack;
    if (stack === null) {
      this.#snapshot = EMPTY;
    } else {
      const project = stack.state;
      const schemaProblems: Problem[] = [];
      for (const id of elementsById(project).keys()) {
        schemaProblems.push(...(this.#schemaProblems.get(id) ?? []));
      }
      this.#snapshot = {
        root: this.#root,
        project,
        dirty: stack.isDirty,
        canUndo: stack.canUndo,
        canRedo: stack.canRedo,
        undoLabel: stack.undoLabel(),
        redoLabel: stack.redoLabel(),
        problems: [
          ...this.#loadProblems,
          ...this.#targetProblems,
          ...this.#schemaLoadProblems,
          ...this.#assetProblems,
          ...this.#renameProblems,
          ...this.#overwriteProblems(project),
          ...schemaProblems,
        ],
      };
    }
    for (const listener of [...this.#listeners]) listener(this.#snapshot);
  }
}
