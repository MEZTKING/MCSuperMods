/**
 * The renderer-hosted project session (ADR 0007): one element-kind registry, one command
 * stack, load/save through the platform's file system with a save manifest (ADR 0012), live
 * schema problems (plan D5), live mcfunction problems through an injected checker (ADR 0014),
 * project assets, the reference index and rename refactor (ADR 0016), and export of the
 * resource and data packs and install of the resource pack. It also collects the plugins'
 * library contributions (templates, starters, examples; ADR 0020) and adds content bundles to
 * new or open projects. No DOM access, so it is testable with an in-memory platform.
 *
 * @packageDocumentation
 */

import {
  type CommandEffect,
  type CommandEvent,
  CommandStack,
  commands,
  createElement,
  createEmptyProject,
  DuplicateElementError,
  type Element,
  ElementKindRegistry,
  elementFilePath,
  isValidNamespace,
  type Json,
  loadProject,
  lowerProjectAsync,
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
  stableStringify,
} from '@msm/core';
import {
  combinedFileNames,
  contentJarFileName,
  createFabricContentJarExporter,
  createJavaProjectExporter,
  createMemorySink,
  createZipBytes,
  createZipSink,
  dataPackExporter,
  ExportProblemCodes,
  type ExportReport,
  FABRIC_MOD_ID_PATTERN,
  FABRIC_MOD_JSON_FILE,
  JAVA_PROJECT_MOD_JSON,
  packFileName,
  resourcePackExporter,
  runExport,
  sanitiseModId,
} from '@msm/exporters';
import type {
  BundleContext,
  Command,
  ContentBundle,
  ElementKind,
  ElementTemplate,
  ExampleProject,
  Exporter,
  ExporterOption,
  ImportResult,
  MaybePromise,
  MigrationReport,
  OutputFile,
  OutputSink,
  Plugin,
  ProjectStarter,
  StarterParameter,
  Target,
  TargetFacts,
} from '@msm/plugin-api';
import { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
import { type SchemaNode, type VanillaMcdocSymbols, validateJson } from '@msm/schemas';
import { targetFacts } from '@msm/targets';
import { PluginProblemCodes } from '../../../shared/ipc-channels';
import type {
  AppSettingsPatch,
  AppSettingsView,
  AssetCacheInfoView,
  GameLocationList,
  GameLocationRef,
  MinecraftStatus,
  PlatformAdapter,
  RecentProjectView,
  TestInMinecraftResult,
  TestInMinecraftStatus,
  WorldInfo,
} from '../../../shared/platform';
import { type ChangeAsset, type ChangeItem, planChangeItems } from '../changeset/changeset';
import type { ExternalPluginState, ExternalPluginStatus } from '../plugins/external-plugins';
import { assetImportError } from './asset-files';
import {
  assertElementIdAllowed,
  defaultElementData,
  isMergeableKind,
  mergeShared,
  namespaceFromFolderName,
  PACK_MCMETA_KIND,
  presentSingletonKinds,
} from './element-defaults';
import {
  collectImporters,
  importerFor,
  type RegisteredImporter,
  type TargetImporters,
} from './importers';
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
import {
  checkScriptElement,
  SCRIPT_KIND,
  SCRIPT_TYPINGS_FILE,
  type ScriptingChecker,
  scriptLines,
  scriptTextValidator,
  scriptTranspiler,
} from './scripting-problems';
import {
  blockingValidatorErrors,
  changedKinds,
  collectValidators,
  projectElements,
  type RegisteredValidator,
  runValidator,
  validatorsFor,
} from './validator-problems';

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
   * (with `elementId` and an RFC 6901 `path`) in element order, then the plugins' project
   * validator problems in validator order.
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

/** The result of {@link ProjectSession.testInMinecraft}: the export report plus the run. */
export type TestInMinecraftOutcome = ExportReport & {
  /** What the install and launch did; absent when the export was blocked. */
  test?: TestInMinecraftResult;
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
  /**
   * Third-party plugin facades (ADR 0035; built by `plugins/external-plugins.ts` before the
   * session is constructed), registered after {@link plugins}. One whose registration throws
   * is skipped.
   */
  externalPlugins?: readonly Plugin[];
  /** The live states of the third-party plugins (Settings > Plugins, `plugin.unavailable`). */
  externalPluginStatus?: ExternalPluginStatus;
  /** The third-party plugins' mcdoc symbol exports, merged into every schema context. */
  externalSymbols?: readonly VanillaMcdocSymbols[];
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
  /**
   * The TypeScript service for scripts (ADRs 0031 and 0032): live problems for `msm:script`
   * elements, the export gate's `validateText` for `typescript` files and the content jar's
   * transpiler. Without it scripts get only schema problems and a project with scripts
   * cannot be exported as a mod jar (`export.transpiler-missing`).
   */
  scripting?: ScriptingChecker;
  /** The script typings (`msm-runtime.d.ts`); default `MSM_RUNTIME_TYPINGS` of the plugin. */
  scriptTypings?: string;
  /**
   * Target-aware replacements for registered importers (default: the structure importers,
   * which need the target's data version).
   */
  targetImporters?: TargetImporters;
}

/** The result of {@link ProjectSession.importFiles}. */
export interface ImportFilesResult {
  /** Element ids added, in file order. */
  imported: ResourceLocation[];
  /**
   * Everything worth telling the user: unsupported or failed files, the importers' own
   * problems and skipped duplicates (`import.duplicate-id`).
   */
  problems: Problem[];
}

/** The result of {@link ProjectSession.replaceElementFromFile}. */
export interface ReplaceFromFileResult {
  /** Whether the element's data was replaced. */
  replaced: boolean;
  /**
   * The importer's own problems, plus `import.unsupported-file`, `import.failed` or
   * `import.kind-mismatch` when nothing was replaced.
   */
  problems: Problem[];
}

/**
 * Anything that builds a {@link ContentBundle}: a {@link ProjectStarter}, an
 * {@link ExampleProject}, or a host-made source.
 */
export interface ContentBundleBuilder {
  /** Shown in the undo label and in error messages. */
  title: string;
  /** The starter's parameters; their defaults fill {@link BundleContext.values}. */
  parameters?: readonly StarterParameter[];
  /** Builds the bundle for a namespace; must be pure. May return a Promise (ADR 0036). */
  build(context: BundleContext): MaybePromise<ContentBundle>;
}

/** Every parameter of a bundle source at its default (ADR 0036 D5). */
function defaultValues(source: ContentBundleBuilder): Record<string, Json> {
  return Object.fromEntries(
    (source.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
}

/**
 * A kind's `defaultDataFor(target)` result (ADR 0036 D8), or `undefined` when the kind has no
 * such hook or it throws or rejects (the caller falls back to `defaultData`).
 */
async function defaultDataFor(kind: ElementKind, target: TargetFacts): Promise<Json | undefined> {
  if (kind.defaultDataFor === undefined) return undefined;
  try {
    return await kind.defaultDataFor(target);
  } catch {
    return undefined;
  }
}

/** Options of {@link ProjectSession.newProject}. */
export interface NewProjectOptions {
  /** The starter whose bundle fills the new project. */
  starter?: ProjectStarter;
  /**
   * The id of a starter in {@link ProjectSession.library} (the New project dialog's choice);
   * `null` or absent with no {@link starter} is a blank project. Ignored when {@link starter}
   * is given.
   */
  starterId?: string | null;
  /** Any other bundle source, for example an example opened as a new project. */
  bundle?: ContentBundleBuilder;
  /** The target of the new project (ADR 0037 D4); default {@link ProjectSession.defaultTargetId}. */
  targetId?: string;
  /**
   * `BundleContext.values` for the starter's wizard (ADR 0040); merged over the parameters'
   * defaults.
   */
  values?: Record<string, Json>;
}

/** Options of {@link ProjectSession.addBundle}. */
export interface AddBundleOptions {
  /** The project namespace the bundle is built for; created when the project lacks it. */
  namespace: string;
  /** The undo label; default `Copy example <title>`. */
  label?: string;
}

/** The result of {@link ProjectSession.addBundle}. */
export interface AddBundleResult {
  /** Element ids added, in bundle order. */
  added: ResourceLocation[];
  /**
   * Element ids skipped because the project (or the bundle, earlier) already has them, or,
   * for `pack.mcmeta` and mod metadata elements, already has one of that kind.
   */
  duplicates: ResourceLocation[];
  /**
   * Language files and tags the project already had, merged with the bundle's (missing keys or
   * values added, nothing overwritten; `mergeShared`), in bundle order. Includes those that
   * already held everything.
   */
  merged: ResourceLocation[];
  /** Assets written and recorded, as `<namespace>:<path>`. */
  assets: string[];
  /** Assets skipped because the project already records that path, as `<namespace>:<path>`. */
  skippedAssets: string[];
}

/** Options of {@link ProjectSession.applyChangeset}. */
export interface ApplyChangesetOptions {
  /**
   * Bytes written over asset files (the Creator's replaced textures), in the same undo step:
   * Undo restores the previous bytes (or removes a file that did not exist), Redo writes these
   * again (ADR 0045). Asset records are not changed. Writes equal to the current bytes are
   * left out.
   */
  writes?: readonly ChangeAsset[];
}

/** The result of {@link ProjectSession.applyChangeset}. */
export interface ApplyChangesetResult {
  /** Item ids applied, in order. */
  applied: string[];
  /** Accepted item ids left out because they no longer fit the project. */
  skipped: string[];
  /** Files `options.writes` changed, as `<namespace>:<path>`. */
  written: string[];
}

/** The undo label of {@link ProjectSession.applyChangeset} (ADR 0041 D5). */
export const APPLY_CHANGESET_LABEL = 'Apply AI helper changes';

/**
 * The library contributions of the registered plugins (ADR 0020), filtered to what the
 * registered kinds support.
 */
export interface SessionLibrary {
  /**
   * Element templates in plugin order; a template counts only when its kind is one of its
   * own plugin's kinds. The first template with a given id wins.
   */
  templates: readonly ElementTemplate[];
  /** Project starters whose `requiresKinds` are all registered; first id wins. */
  starters: readonly ProjectStarter[];
  /** Examples whose `requiresKinds` are all registered; first id wins. */
  examples: readonly ExampleProject[];
}

/** A bundle checked against a project state, ready to write and apply. */
interface PreparedBundle {
  elements: Element[];
  duplicates: ResourceLocation[];
  assets: { namespace: string; path: string; bytes: Uint8Array }[];
  skippedAssets: string[];
}

/**
 * `bundle` without its elements of the singleton kinds `state` already has
 * ({@link presentSingletonKinds}), and the ids left out.
 */
function withoutPresentSingletons(
  bundle: ContentBundle,
  state: Project,
): { bundle: ContentBundle; dropped: ResourceLocation[] } {
  const present = presentSingletonKinds(state);
  if (present.size === 0) return { bundle, dropped: [] };
  const dropped = bundle.elements.filter((entry) => present.has(entry.kind));
  if (dropped.length === 0) return { bundle, dropped: [] };
  return {
    bundle: { ...bundle, elements: bundle.elements.filter((entry) => !present.has(entry.kind)) },
    dropped: dropped.map((entry) => entry.id),
  };
}

/**
 * The bundle's language files and tags whose id `state` already has with the same kind: the
 * merged data of each ({@link mergeShared}; only those that change are in `updates`), and the
 * remaining duplicates.
 */
function sharedMerges(
  bundle: ContentBundle,
  duplicates: readonly ResourceLocation[],
  state: Project,
): { merged: ResourceLocation[]; updates: Map<ResourceLocation, Json>; rest: ResourceLocation[] } {
  const existing = elementsById(state);
  const merged: ResourceLocation[] = [];
  const updates = new Map<ResourceLocation, Json>();
  const rest: ResourceLocation[] = [];
  const done = new Set<string>();
  for (const id of duplicates) {
    const element = existing.get(id);
    const entries = bundle.elements.filter((entry) => entry.id === id);
    const mergeable =
      element !== undefined &&
      isMergeableKind(element.kind) &&
      entries.every((entry) => entry.kind === element.kind);
    if (!mergeable) {
      rest.push(id);
      continue;
    }
    if (done.has(id)) continue;
    done.add(id);
    merged.push(id);
    let data = element.data;
    for (const entry of entries) data = mergeShared(element.kind, data, entry.data);
    if (stableStringify(data) !== stableStringify(element.data)) updates.set(id, data);
  }
  return { merged, updates, rest };
}

function dedupeById<T extends { id: string }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

/**
 * Checks a bundle against `state`: every kind registered, every id valid and allowed, every
 * asset a safe path with valid bytes. Elements and assets the project already has are
 * reported, not thrown.
 *
 * @throws Error If the bundle is invalid.
 */
function prepareBundle(
  bundle: ContentBundle,
  state: Project,
  registry: ElementKindRegistry,
  now: (() => string) | undefined,
): PreparedBundle {
  const existing = new Set(elementsById(state).keys());
  const prepared: PreparedBundle = { elements: [], duplicates: [], assets: [], skippedAssets: [] };
  for (const entry of bundle.elements) {
    if (registry.get(entry.kind) === undefined) {
      throw new Error(`Unknown element kind ${JSON.stringify(entry.kind)} for ${entry.id}.`);
    }
    assertElementIdAllowed(entry.kind, entry.id);
    const element = createElement({
      id: entry.id,
      kind: entry.kind,
      data: structuredClone(entry.data),
      ...(now === undefined ? {} : { now }),
      ...(entry.notes === undefined ? {} : { notes: entry.notes }),
      ...(entry.tags === undefined ? {} : { tags: entry.tags }),
    });
    if (existing.has(element.id)) {
      prepared.duplicates.push(element.id);
      continue;
    }
    existing.add(element.id);
    prepared.elements.push(element);
  }
  const recorded = assetKeys(state);
  for (const asset of bundle.assets) {
    if (!isValidNamespace(asset.namespace)) {
      throw new Error(`Invalid namespace name ${JSON.stringify(asset.namespace)}.`);
    }
    const slash = asset.path.lastIndexOf('/');
    const reason = assetImportError(
      slash < 0 ? '.' : asset.path.slice(0, slash),
      asset.path.slice(slash + 1),
      asset.bytes,
    );
    if (slash < 0 || reason !== undefined) {
      throw new Error(`Asset ${asset.namespace}:${asset.path}: ${reason ?? 'not in a folder.'}`);
    }
    const key = `${asset.namespace}\u0000${asset.path}`;
    if (recorded.has(key)) {
      prepared.skippedAssets.push(`${asset.namespace}:${asset.path}`);
      continue;
    }
    recorded.add(key);
    prepared.assets.push({ namespace: asset.namespace, path: asset.path, bytes: asset.bytes });
  }
  return prepared;
}

/**
 * One undoable command adding a prepared bundle: missing namespaces, then elements, then
 * asset records.
 */
function bundleCommand(prepared: PreparedBundle, label: string): ProjectCommand {
  const namespaces = new Set<string>();
  for (const element of prepared.elements) {
    namespaces.add(element.id.slice(0, element.id.indexOf(':')));
  }
  for (const asset of prepared.assets) namespaces.add(asset.namespace);
  const adds = prepared.elements.map((element) => commands.addElement(element));
  const assets = prepared.assets.map((asset) =>
    commands.addAsset(asset.namespace, {
      path: asset.path,
      mediaType: mediaTypeForPath(asset.path),
    }),
  );
  const namespaceAdds = [...namespaces].sort().map((name) => ({
    name,
    command: commands.addNamespace(name),
  }));
  return {
    id: 'app.add-bundle',
    label,
    apply(draft) {
      for (const { name, command } of namespaceAdds) {
        if (!draft.namespaces.some((entry) => entry.name === name)) command.apply(draft);
      }
      for (const command of adds) command.apply(draft);
      for (const command of assets) command.apply(draft);
    },
  };
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
  /** An imported element whose id the project (or an earlier imported file) already has. */
  importDuplicateId: 'import.duplicate-id',
  /** A target without a `migrateFrom` hook: an upgrade only changes the target id. */
  noMigrationNeeded: 'target.no-migration-needed',
  /** An imported asset whose path the project already records. */
  importDuplicateAsset: 'import.duplicate-asset',
  /** No registered importer accepts the file's extension. */
  importUnsupported: 'import.unsupported-file',
  /** An importer threw, or produced something the project cannot hold. */
  importFailed: 'import.failed',
  /** A replacement file imported no element of the replaced element's kind. */
  importKindMismatch: 'import.kind-mismatch',
  /** The named plugin exporter is not registered. */
  unknownExporter: 'export.unknown-exporter',
  /** The injected TypeScript service failed; scripts are not checked (reported once). */
  scriptingUnavailable: 'session.scripting-unavailable',
  /** The Java project's root folder already holds files (ADR 0033 D4); nothing is written. */
  folderNotEmpty: 'export.folder-not-empty',
} as const;

/**
 * Where removed assets' bytes wait so that undo can restore them (project-relative). The
 * folder is emptied when a project is opened or created: the undo history starts empty then,
 * so nothing in it can be restored any more. It is not emptied on save, because the undo
 * history survives a save.
 */
export const ASSET_TRASH_DIR = '.msm/trash';

/**
 * Where the bytes of undoable asset writes wait (ADR 0045, project-relative): for each write,
 * `<token>/before` (the bytes it replaced, absent when there was no file) and `<token>/after`
 * (the bytes it wrote). Emptied with the trash when a project is opened or created.
 */
export const ASSET_UNDO_DIR = '.msm/undo';

/** The {@link CommandEffect} type of an undoable asset byte write (ADR 0045). */
export const ASSET_WRITE_EFFECT = 'app.asset-write';

/** The `data` of an {@link ASSET_WRITE_EFFECT} effect. */
interface AssetWriteData {
  /** The live file, `assets/<namespace>/<path>`. */
  file: string;
  /** The stored bytes it replaced, or `null` when no file existed. */
  before: string | null;
  /** The stored bytes it writes. */
  after: string;
}

function isAssetWrite(effect: CommandEffect): effect is CommandEffect & { data: AssetWriteData } {
  return effect.type === ASSET_WRITE_EFFECT && typeof effect.data === 'object';
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Lowering problem codes {@link ProjectSession.checkProject} reports. */
const LOWERING_CONFLICT_CODES: ReadonlySet<string> = new Set([
  ProblemCodes.loweringConflict,
  ProblemCodes.loweringMergeConflict,
]);

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
/** The `id` of a written `fabric.mod.json`, or `undefined` when it has none. */
function modIdOf(bytes: Uint8Array | undefined): string | undefined {
  if (bytes === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const id = (parsed as Record<string, unknown>).id;
    return typeof id === 'string' && FABRIC_MOD_ID_PATTERN.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export class ProjectSession {
  readonly registry = new ElementKindRegistry();
  readonly #platform: PlatformAdapter;
  readonly #fs: ProjectFileSystem;
  readonly #now: (() => string) | undefined;
  readonly #plugins: readonly Plugin[];
  readonly #externalPluginIds: ReadonlySet<string>;
  readonly #externalStatus: ExternalPluginStatus | undefined;
  readonly #externalSymbols: readonly VanillaMcdocSymbols[];
  readonly #library: SessionLibrary;
  readonly #targets: readonly SessionTarget[];
  readonly #validationDelay: number;
  readonly #mcfunction: McfunctionChecker | undefined;
  readonly #scripting: ScriptingChecker | undefined;
  readonly #scriptTypings: string;
  readonly #importers: readonly RegisteredImporter[];
  readonly #validators: readonly RegisteredValidator[];
  readonly #exporters: readonly Exporter[];
  readonly #contentJarExporter: Exporter;
  readonly #javaProjectExporter: Exporter;
  readonly #kindPlugins: ReadonlyMap<string, string>;
  #scriptingProblem: Problem | null = null;
  #validatorProblems = new Map<string, Problem[]>();
  #pendingValidators = new Set<string>();
  readonly #loadedSchemas = new Map<string, SchemaContext>();
  /** `defaultDataFor(target)` results per target id, then per kind id (ADR 0036 D8). */
  readonly #kindDefaults = new Map<string, ReadonlyMap<string, Json>>();
  #availableTargets: readonly TargetFacts[] | null = null;
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
  /** Numbers the stored asset writes (ADR 0045). */
  #writeCounter = 0;
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
    const builtIn = options.plugins ?? [];
    for (const plugin of builtIn) registerPlugin(this.registry, plugin);
    const external: Plugin[] = [];
    for (const plugin of options.externalPlugins ?? []) {
      try {
        registerPlugin(this.registry, plugin);
        external.push(plugin);
      } catch {
        // `loadExternalPlugins` already refuses clashes; a facade that still fails is skipped.
      }
    }
    this.#plugins = [...builtIn, ...external];
    this.#externalPluginIds = new Set(external.map((plugin) => plugin.id));
    this.#externalStatus = options.externalPluginStatus;
    this.#externalSymbols = options.externalSymbols ?? [];
    // A plugin that fails later blocks the export of its elements (`plugin.unavailable`).
    this.#externalStatus?.subscribe(() => this.#publish());
    this.#targets = options.targets ?? [];
    this.#validationDelay = options.validationDelay ?? 150;
    this.#mcfunction = options.mcfunction;
    this.#scripting = options.scripting;
    this.#scriptTypings = options.scriptTypings ?? MSM_RUNTIME_TYPINGS;
    this.#library = this.#collectLibrary();
    const kindPlugins = new Map<string, string>();
    for (const plugin of this.#plugins) {
      for (const kind of plugin.contributes.elementKinds ?? []) {
        if (!kindPlugins.has(kind.id)) kindPlugins.set(kind.id, plugin.id);
      }
    }
    this.#kindPlugins = kindPlugins;
    this.#importers = Object.freeze(collectImporters(this.#plugins, options.targetImporters));
    this.#validators = Object.freeze(collectValidators(this.#plugins));
    this.#exporters = Object.freeze(
      dedupeById(this.#plugins.flatMap((plugin) => plugin.contributes.exporters ?? [])),
    );
    // The runtime version defaults to `meta.msmVersion`, the app's version (ADR 0026 D4);
    // main finds the open project's target's jar (packaged resources or
    // `engine-mod/build/libs/`). GeckoLib (ADR 0029
    // D4) is asked for only when the project has entities and nesting is on; main serves it from
    // its download cache or downloads it once for the open project's target.
    this.#contentJarExporter = createFabricContentJarExporter({
      // ADR 0038 D4: one runtime jar per target.
      loadRuntimeJar: async () => (await platform.exports.runtimeJar(this.target.id)) ?? undefined,
      loadGeckolibJar: async () =>
        (await platform.exports.geckolibJar(this.target.id)) ?? undefined,
      // Scripts are transpiled by TypeScript in main (ADR 0031 D2), for export and Test in
      // Minecraft alike.
      ...(options.scripting === undefined
        ? {}
        : { transpileScript: scriptTranspiler(options.scripting) }),
    });
    // ADR 0033 D2: main serves the Gradle wrapper (packaged resources or `engine-mod/`).
    this.#javaProjectExporter = createJavaProjectExporter({
      loadGradleWrapper: async () => (await platform.exports.gradleWrapper()) ?? undefined,
    });
  }

  /**
   * The script typings (`msm-runtime.d.ts`, ADR 0032 D5) the Script Studio gives Monaco and
   * the session writes to `.msm/msm-runtime.d.ts`.
   */
  get scriptTypings(): string {
    return this.#scriptTypings;
  }

  /** The id of the plugin that contributes each registered kind, by kind id. */
  get kindPlugins(): ReadonlyMap<string, string> {
    return this.#kindPlugins;
  }

  /** The options the Fabric mod jar export declares, shown in its dialog (ADR 0027 D2). */
  get fabricJarOptions(): readonly ExporterOption[] {
    return this.#contentJarExporter.options ?? [];
  }

  /** The third-party plugins found at start-up and their states (ADR 0035 D4). */
  get externalPlugins(): readonly ExternalPluginState[] {
    return this.#externalStatus?.states ?? [];
  }

  /**
   * `plugin.unavailable` errors (ADR 0035 D4), one per element whose kind belongs to a
   * registered third-party plugin that has failed since start-up. They block export.
   */
  #unavailablePluginProblems(project: Project): Problem[] {
    const status = this.#externalStatus;
    if (status === undefined) return [];
    const failed = new Set(
      status.states
        .filter((state) => state.state === 'failed' && this.#externalPluginIds.has(state.id))
        .map((state) => state.id),
    );
    if (failed.size === 0) return [];
    const kinds = new Map<string, string>();
    for (const plugin of this.#plugins) {
      if (!failed.has(plugin.id)) continue;
      for (const kind of plugin.contributes.elementKinds ?? []) kinds.set(kind.id, plugin.id);
    }
    const problems: Problem[] = [];
    for (const element of projectElements(project)) {
      const pluginId = kinds.get(element.kind);
      if (pluginId === undefined) continue;
      problems.push({
        severity: 'error',
        code: PluginProblemCodes.unavailable,
        elementId: element.id,
        message: `${element.id} cannot be exported: its plugin ${pluginId} stopped working. Restart MCSuperMods to load it again.`,
      });
    }
    return problems;
  }

  /** The registered plugins' importers, in plugin order (first id wins). */
  get importers(): readonly RegisteredImporter[] {
    return this.#importers;
  }

  /** The registered plugins' exporters, in plugin order (first id wins). */
  get pluginExporters(): readonly Exporter[] {
    return this.#exporters;
  }

  #collectLibrary(): SessionLibrary {
    const registered = (kind: string): boolean => this.registry.get(kind) !== undefined;
    const templates = this.#plugins.flatMap((plugin) => {
      const own = new Set((plugin.contributes.elementKinds ?? []).map((kind) => kind.id));
      return (plugin.contributes.elementTemplates ?? []).filter(
        (template) => own.has(template.kind) && registered(template.kind),
      );
    });
    const supported = (entry: { requiresKinds: readonly string[] }): boolean =>
      entry.requiresKinds.every(registered);
    return Object.freeze({
      templates: Object.freeze(dedupeById(templates)),
      starters: Object.freeze(
        dedupeById(
          this.#plugins.flatMap((plugin) => plugin.contributes.projectStarters ?? []),
        ).filter(supported),
      ),
      examples: Object.freeze(
        dedupeById(this.#plugins.flatMap((plugin) => plugin.contributes.examples ?? [])).filter(
          supported,
        ),
      ),
    });
  }

  /**
   * The registered plugins' templates, starters and examples (ADR 0020), filtered to the
   * registered kinds. Fixed for the session's lifetime.
   */
  get library(): SessionLibrary {
    return this.#library;
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

  /**
   * The default target for new projects (ADR 0037): the first target on the `release`
   * channel (targets are listed newest first, and a snapshot is never the default), else the
   * first target; `undefined` with no targets.
   */
  get #defaultTarget(): Target | undefined {
    return (
      this.#targets.find((entry) => entry.target.channel === 'release')?.target ??
      this.#targets[0]?.target
    );
  }

  /** The id of the default target for new projects, or `undefined` with no targets. */
  get defaultTargetId(): string | undefined {
    return this.#defaultTarget?.id;
  }

  /**
   * The built-in targets as hook-free facts (`targetFacts` of `@msm/targets`; a target that
   * package does not know is listed as given), newest first (ADR 0037 D4).
   */
  get availableTargets(): readonly TargetFacts[] {
    this.#availableTargets ??= Object.freeze(
      this.#targets.map((entry) => targetFacts(entry.target.id) ?? entry.target),
    );
    return this.#availableTargets;
  }

  /** The built-in target with `id`, or `undefined`. */
  #targetById(id: string): Target | undefined {
    return this.#targets.find((entry) => entry.target.id === id)?.target;
  }

  /** The open project's target, or `undefined` with no targets. */
  #currentTarget(): Target | undefined {
    try {
      return this.target;
    } catch {
      return undefined;
    }
  }

  /**
   * The default data for a new element of `kindId` on the open project's target: the kind's
   * `defaultDataFor(target)` result (ADR 0036 D8), cached per target when a project is opened
   * or created and after a target change, else its `defaultData`. `undefined` for an unknown
   * kind or a kind without defaults.
   */
  kindDefault(kindId: string): Json | undefined {
    const kind = this.registry.get(kindId);
    if (kind === undefined) return undefined;
    const target = this.#currentTarget();
    const cached =
      target === undefined ? undefined : this.#kindDefaults.get(target.id)?.get(kindId);
    return cached ?? kind.defaultData;
  }

  /**
   * Fills the {@link kindDefault} cache for `target` (once per target). A `defaultDataFor` that
   * throws or rejects leaves that kind on its `defaultData`.
   */
  async #fillKindDefaults(target: Target | undefined): Promise<void> {
    if (target === undefined || this.#kindDefaults.has(target.id)) return;
    const defaults = new Map<string, Json>();
    for (const kind of this.registry.all()) {
      if (kind.defaultDataFor === undefined) continue;
      const data = await defaultDataFor(kind, target);
      if (data !== undefined) defaults.set(kind.id, data);
    }
    this.#kindDefaults.set(target.id, defaults);
  }

  /**
   * What upgrading the open project to `targetId` would do (ADR 0037 D4): the target's
   * `migrateFrom(current target, project)` report, applied by nothing yet. A target without
   * the hook yields no changes and one info problem "No migration needed"; the project's own
   * target yields an empty report.
   *
   * @throws Error If no project is open or `targetId` is not a built-in target.
   */
  async upgradeTargetPreview(targetId: string): Promise<MigrationReport> {
    const stack = this.#requireStack();
    const next = this.#targetById(targetId);
    if (next === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
    const previous = this.target;
    if (previous.id === next.id && stack.state.targets[0] === next.id) {
      return { changes: [], problems: [] };
    }
    if (next.migrateFrom === undefined) {
      return {
        changes: [],
        problems: [
          {
            severity: 'info',
            code: SessionProblemCodes.noMigrationNeeded,
            message: 'No migration needed',
          },
        ],
      };
    }
    const report = next.migrateFrom(previous, stack.state);
    return structuredClone({ changes: report.changes, problems: report.problems });
  }

  /**
   * Upgrades (or downgrades) the open project to `targetId` as one undo step (ADR 0037 D4):
   * the project's targets become `[targetId]`, every `update` change with `data` replaces its
   * element's data and every `remove` change deletes its element (changes for elements the
   * project no longer has are skipped). Then the schema context of the new target loads and
   * every element is validated again. Undo reverts the target and the data together.
   *
   * @param report - The report {@link upgradeTargetPreview} returned for `targetId`.
   * @throws Error If no project is open or `targetId` is not a built-in target.
   */
  async upgradeTarget(targetId: string, report: MigrationReport): Promise<void> {
    const stack = this.#requireStack();
    const next = this.#targetById(targetId);
    if (next === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
    const existing = elementsById(stack.state);
    const parts: ProjectCommand[] = [commands.setTargets([targetId])];
    for (const change of report.changes) {
      if (!existing.has(change.elementId)) continue;
      if (change.kind === 'remove') {
        parts.push(commands.removeElement(change.elementId));
      } else if (change.data !== undefined) {
        parts.push(commands.setElementData(change.elementId, structuredClone(change.data)));
      }
    }
    stack.execute({
      id: 'app.upgrade-target',
      label: `Upgrade target to ${targetId}`,
      apply(draft) {
        for (const part of parts) part.apply(draft);
      },
    });
    await this.#fillKindDefaults(next);
    try {
      await this.schemas();
    } catch {
      // Reported by the validation pass as `schema.unavailable`.
    }
    await this.flushValidation();
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
    const target = found?.target ?? this.#defaultTarget;
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
      cached = loadSchemaContext(this.#platform, target, this.registry, this.#externalSymbols);
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
   * plugins that contribute element kinds, a namespace named after the folder and its
   * `pack.mcmeta` element. With a `starter` (or another `bundle` source) the bundle is built
   * for that namespace and added too: its asset bytes are written, its elements and asset
   * records go into the initial state (not an undo step), and the `pack.mcmeta` element is
   * added only when the bundle has none. A bundle that fails to build or check leaves no
   * project behind and is reported as `{ ok: false, reason }`.
   */
  async newProject(options: NewProjectOptions = {}): Promise<OpenOutcome> {
    const starter =
      options.starter ??
      (options.starterId === undefined || options.starterId === null
        ? undefined
        : this.#library.starters.find((entry) => entry.id === options.starterId));
    if (starter === undefined && typeof options.starterId === 'string') {
      return { ok: false, reason: `Unknown starter ${JSON.stringify(options.starterId)}.` };
    }
    const targetId = options.targetId ?? this.defaultTargetId;
    if (options.targetId !== undefined && this.#targetById(options.targetId) === undefined) {
      return { ok: false, reason: `Unknown target ${JSON.stringify(options.targetId)}.` };
    }
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const path = await this.#platform.dialogs.pickDirectory({
      title: 'Choose an empty folder for the new project',
      mustBeEmpty: true,
      purpose: 'project',
    });
    if (path === null) return { ok: false, cancelled: true };
    const name = baseName(path);
    const namespace = namespaceFromFolderName(name);
    const project = createEmptyProject(name, {
      targets: targetId === undefined ? [] : [targetId],
      plugins: this.#plugins
        .filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0)
        .map((plugin) => plugin.id),
    });
    project.namespaces.push({ name: namespace, elements: [], assets: [] });
    const source = starter ?? options.bundle;
    let prepared: PreparedBundle;
    try {
      const facts = this.#newProjectTarget(targetId);
      const bundle: ContentBundle =
        source === undefined
          ? { elements: [], assets: [] }
          : await source.build({
              namespace,
              projectName: name,
              target: facts,
              values: { ...defaultValues(source), ...(options.values ?? {}) },
            });
      const elements = [...bundle.elements];
      const packKind = this.registry.get(PACK_MCMETA_KIND);
      if (packKind !== undefined && !elements.some((entry) => entry.kind === PACK_MCMETA_KIND)) {
        const id: ResourceLocation = `${namespace}:pack`;
        elements.unshift({
          id,
          kind: PACK_MCMETA_KIND,
          data: defaultElementData(
            PACK_MCMETA_KIND,
            id,
            (await defaultDataFor(packKind, facts)) ?? packKind.defaultData,
          ),
        });
      }
      prepared = prepareBundle(
        { elements, assets: bundle.assets },
        project,
        this.registry,
        this.#now,
      );
    } catch (error) {
      const what = source === undefined ? 'the project' : `"${source.title}"`;
      return { ok: false, reason: `Could not build ${what}: ${messageOf(error)}` };
    }
    const created = await this.#platform.project.createRoot(path);
    if (!created.ok) return created;
    await this.#writeBundleAssets(prepared);
    const initial = new CommandStack(project);
    initial.execute(bundleCommand(prepared, 'New project'));
    const state = initial.state;
    const saved = await saveProject(this.#fs, state, this.registry);
    this.#adopt(path, state, [], saved.manifest);
    await this.#fillKindDefaults(this.#currentTarget());
    await this.#emptyTrash();
    await this.#writeScriptTypings();
    return { ok: true };
  }

  /**
   * Adds a content bundle (a copied example, for instance) to the open project. The bundle
   * is built for `options.namespace`; its asset bytes are written immediately (like
   * {@link importAssets}), then its elements, asset records and any namespaces the project
   * lacks go in as one undoable command. Element ids and asset paths the project already has
   * are skipped and reported, not thrown, except language files and tags: those are merged
   * into the project's (missing keys or values added, as the Creator does; reported under
   * `merged`). The bundle's `pack.mcmeta` and mod metadata elements are skipped when the
   * project already has one of that kind in any namespace (they would write the same file;
   * reported under `duplicates`).
   *
   * @throws Error If no project is open, the namespace is invalid, or the bundle fails to
   *   build or check (nothing is added then).
   */
  async addBundle(
    source: ContentBundleBuilder,
    options: AddBundleOptions,
  ): Promise<AddBundleResult> {
    const stack = this.#requireStack();
    if (!isValidNamespace(options.namespace)) {
      throw new Error(`Invalid namespace name ${JSON.stringify(options.namespace)}.`);
    }
    const bundle = await source.build({
      namespace: options.namespace,
      projectName: stack.state.name,
      target: this.target,
      values: defaultValues(source),
    });
    const prepared = prepareBundle(
      withoutPresentSingletons(bundle, stack.state).bundle,
      stack.state,
      this.registry,
      this.#now,
    );
    await this.#writeBundleAssets(prepared);
    // The state may have moved on while the bytes were written: check again.
    const kept = withoutPresentSingletons(bundle, stack.state);
    const current = prepareBundle(kept.bundle, stack.state, this.registry, this.#now);
    const shared = sharedMerges(kept.bundle, current.duplicates, stack.state);
    if (current.elements.length > 0 || current.assets.length > 0 || shared.updates.size > 0) {
      const add = bundleCommand(current, options.label ?? `Copy example ${source.title}`);
      const merges = [...shared.updates].map(([id, data]) => commands.setElementData(id, data));
      stack.execute({
        ...add,
        apply(draft) {
          add.apply(draft);
          for (const merge of merges) merge.apply(draft);
        },
      });
    }
    return {
      added: current.elements.map((element) => element.id),
      merged: shared.merged,
      duplicates: [...kept.dropped, ...shared.rest],
      assets: current.assets.map((asset) => `${asset.namespace}:${asset.path}`),
      skippedAssets: current.skippedAssets,
    };
  }

  /** The facts of the target a new project is created for. */
  #newProjectTarget(targetId: string | undefined): TargetFacts {
    const found = this.#targets.find((entry) => entry.target.id === targetId)?.target;
    if (found === undefined) throw new Error('No Minecraft target is available.');
    return found;
  }

  async #writeBundleAssets(prepared: PreparedBundle): Promise<void> {
    for (const asset of prepared.assets) {
      const file = `assets/${asset.namespace}/${asset.path}`;
      await this.#fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
      await this.#fs.writeFile(file, asset.bytes);
    }
  }

  /**
   * Asks for a project directory and loads it.
   */
  async openProject(): Promise<OpenOutcome> {
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const path = await this.#platform.dialogs.pickDirectory({
      title: 'Open an MSM project',
      purpose: 'project',
    });
    if (path === null) return { ok: false, cancelled: true };
    const opened = await this.#platform.project.openRoot(path);
    if (!opened.ok) return opened;
    return this.#loadOpened(path);
  }

  /**
   * Opens a project from the recent list, with the same unsaved-changes guard and outcome as
   * {@link openProject}. Main refuses a root that is not in the list.
   */
  async openRecent(root: string): Promise<OpenOutcome> {
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const opened = await this.#platform.project.openRecent(root);
    if (!opened.ok) return opened;
    return this.#loadOpened(root);
  }

  /** The recent projects, newest first, each with whether it still exists. */
  recentProjects(): Promise<RecentProjectView[]> {
    return this.#platform.project.recent();
  }

  /** Removes one project from the recent list. */
  removeRecentProject(root: string): Promise<void> {
    return this.#platform.project.removeRecent(root);
  }

  /** Empties the recent list. */
  clearRecentProjects(): Promise<void> {
    return this.#platform.project.clearRecent();
  }

  async #loadOpened(path: string): Promise<OpenOutcome> {
    try {
      const { project, problems, manifest } = await loadProject(this.#fs, this.registry);
      this.#adopt(path, project, problems, manifest);
      await this.#fillKindDefaults(this.#currentTarget());
      await this.#emptyTrash();
      await this.#writeScriptTypings();
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
   * Adds an element of a registered kind. Without `data`, the kind's default for the open
   * project's target ({@link kindDefault}) is used with its placeholders replaced by ids in the
   * element's namespace.
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
      data: input.data ?? defaultElementData(input.kind, input.id, this.kindDefault(input.kind)),
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
      element === undefined || index === null
        ? []
        : referencesForRename(index, element, this.registry);
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

  /**
   * The references a rename of `oldId` would rewrite in `project` (the F2 rename's choice:
   * text references and schema references in the registry of the element's kind). Uses the
   * live index for the live project and builds one for any other state; before schemas have
   * loaded only function-line references are found. Empty when `oldId` is not in `project`.
   */
  referencesForRename(project: Project, oldId: ResourceLocation): Reference[] {
    const element = elementsById(project).get(oldId);
    if (element === undefined) return [];
    const live = this.#stack !== null && this.#stack.state === project;
    const index = live ? this.#referenceIndex() : this.#indexFor(project);
    return index === null ? [] : referencesForRename(index, element, this.registry);
  }

  /** A fresh reference index of `project` with the loaded schemas of the current target. */
  #indexFor(project: Project): ReferenceIndex {
    const targetId = this.#targets.length === 0 ? undefined : this.target.id;
    const context =
      (targetId === undefined ? undefined : this.#loadedSchemas.get(targetId)) ?? null;
    return buildSessionReferenceIndex(project, this.registry, context);
  }

  // AI helper and Creator (ADR 0041 D4-D5, ADR 0043) ----------------------------------------

  /**
   * The schema problems of `data` as an element `id` of `kind` inside `project` (registries
   * from `project`, the kind's hidden paths left out). Changes no state.
   *
   * @throws Error If the kind is unknown or the schemas cannot be loaded.
   */
  async validateElementData(
    kind: string,
    id: ResourceLocation,
    data: Json,
    project: Project,
  ): Promise<Problem[]> {
    if (this.registry.get(kind) === undefined) {
      throw new Error(`Unknown element kind ${JSON.stringify(kind)}.`);
    }
    const context = await this.schemas();
    const element = createElement({ id, kind, data, now: () => '' });
    return this.#validateElement(element, context, context.registries(project));
  }

  /**
   * The full check of an arbitrary project, as the live pass runs it over the open one: the
   * schema pass per element (with the registries and dangling `#[id]` references of
   * `project`), the mcfunction checker and the TypeScript check for elements without schema
   * errors, then every plugin validator, then the lowering conflicts (two elements writing one
   * output file, `lowering.conflict` and `lowering.merge-conflict`, found by lowering in
   * memory as the export does). Problems are in element order, then validator order, then
   * lowering order.
   * Changes no session state and publishes nothing. A failing schema load is returned as one
   * `schema.unavailable` warning.
   */
  async checkProject(project: Project): Promise<Problem[]> {
    let context: SchemaContext;
    try {
      context = await this.schemas();
    } catch (error) {
      return [
        {
          severity: 'warning',
          code: SessionProblemCodes.schemasUnavailable,
          message: `Schemas could not be loaded, so elements are not validated: ${messageOf(error)}`,
        },
      ];
    }
    const registries = context.registries(project);
    const projectIds = mcfunctionProjectIds(project);
    const elementProblems: Problem[] = [];
    let scriptFailure: unknown;
    for (const element of elementsById(project).values()) {
      const problems = this.#validateElement(element, context, registries);
      const clean = !problems.some((problem) => problem.severity === 'error');
      if (clean && element.kind === FUNCTION_KIND && this.#mcfunction !== undefined) {
        problems.push(
          ...(await this.#functionProblems(this.#mcfunction, element, context, projectIds)),
        );
      } else if (clean && element.kind === SCRIPT_KIND && this.#scripting !== undefined) {
        try {
          problems.push(
            ...(await checkScriptElement(
              this.#scripting,
              element,
              scriptLines(element) ?? [],
              this.#scriptTypings,
            )),
          );
        } catch (error) {
          scriptFailure ??= error;
        }
      }
      elementProblems.push(...problems);
    }
    const input = this.#validatorInput(context, project);
    const results = await Promise.all(this.#validators.map((entry) => runValidator(entry, input)));
    const lowering = await this.#loweringConflicts(project, context.target);
    return [
      ...(scriptFailure === undefined
        ? []
        : [
            {
              severity: 'warning' as const,
              code: SessionProblemCodes.scriptingUnavailable,
              message: `Scripts could not be checked: ${messageOf(scriptFailure)}`,
            },
          ]),
      ...elementProblems,
      ...results.flat(),
      ...lowering,
    ];
  }

  /**
   * The lowering conflicts of `project`: two elements writing one output file
   * (`lowering.conflict`) or merging it with disagreeing keys (`lowering.merge-conflict`), as
   * the export's lowering step finds them. Lowers in memory only; other lowering problems
   * (unknown kinds, failing `lower` calls) are left to the export gate.
   */
  async #loweringConflicts(project: Project, target: Target): Promise<Problem[]> {
    const lowered = await lowerProjectAsync(project, this.registry, target);
    return lowered.problems.filter((problem) => LOWERING_CONFLICT_CODES.has(problem.code));
  }

  /**
   * Applies the accepted items of a changeset as one undo step (ADR 0041 D5). Items are
   * checked again against the live project, in order (`planChangeItems`): a `create` whose id
   * exists, an `update`, `delete` or `rename` whose element is missing or no longer has the
   * captured `before`, a rename onto a taken id and an `asset` whose path is recorded or
   * whose file exists are skipped. Asset bytes are written first (as {@link addBundle} does),
   * then one command `ai.apply-changeset` adds missing namespaces, creates, updates, deletes,
   * renames (rewriting references as the F2 rename does) and records the assets. The same
   * command carries `options.writes` as asset write effects (ADR 0045): their previous bytes
   * are kept in {@link ASSET_UNDO_DIR} and the new bytes are written once the command runs.
   * The normal validation pass follows; Undo reverts everything, moves created asset bytes to
   * the trash and restores the bytes of replaced files; Redo writes them again. Resolves when
   * the bytes are in place.
   *
   * @param items - The changeset's items; rejected ones (`accepted: false`) are left out.
   * @param label - The undo label; default "Apply AI helper changes".
   * @param options - `writes`: bytes written over existing asset files.
   * @throws Error If no project is open, or a write is not a valid asset file (nothing is
   *   applied then).
   */
  async applyChangeset(
    items: readonly ChangeItem[],
    label: string = APPLY_CHANGESET_LABEL,
    options: ApplyChangesetOptions = {},
  ): Promise<ApplyChangesetResult> {
    const stack = this.#requireStack();
    const writes = options.writes ?? [];
    for (const write of writes) {
      const slash = write.path.lastIndexOf('/');
      const reason =
        !isValidNamespace(write.namespace) || slash < 0
          ? 'not a valid asset path.'
          : assetImportError(write.path.slice(0, slash), write.path.slice(slash + 1), write.bytes);
      if (reason !== undefined) throw new Error(`${write.namespace}:${write.path}: ${reason}`);
    }
    // Earlier byte moves must finish before the current bytes are read.
    await this.flushAssetFiles();
    const effects = await this.#stageAssetWrites(writes);
    const accepted = items.filter((item) => item.accepted);
    const existing = new Set<string>();
    for (const item of accepted) {
      if (item.op !== 'asset' || item.asset === undefined) continue;
      const { namespace, path } = item.asset;
      if (await this.#fs.exists(`assets/${namespace}/${path}`)) {
        existing.add(`${namespace}\u0000${path}`);
      }
    }
    const plan = (state: Project) =>
      planChangeItems(state, accepted, {
        ...(this.#now === undefined ? {} : { now: this.#now }),
        renameReferences: (scratch, from) => this.referencesForRename(scratch, from),
        assetExists: (namespace, path) => existing.has(`${namespace}\u0000${path}`),
      });
    const first = plan(stack.state);
    const applied = new Set(first.applied);
    await this.#writeBundleAssets({
      elements: [],
      duplicates: [],
      skippedAssets: [],
      assets: accepted.flatMap((item): ChangeAsset[] =>
        item.op === 'asset' && item.asset !== undefined && applied.has(item.itemId)
          ? [item.asset]
          : [],
      ),
    });
    // The state may have moved on while the bytes were written: plan again.
    const current = plan(stack.state);
    if (current.commands.length > 0 || effects.length > 0) {
      const parts = current.commands;
      stack.execute({
        id: 'ai.apply-changeset',
        label,
        apply(draft) {
          for (const part of parts) part.apply(draft);
        },
        ...(effects.length === 0 ? {} : { effects }),
      });
      await this.flushAssetFiles();
    }
    return {
      applied: current.applied,
      skipped: current.skipped.map((entry) => entry.itemId),
      written: effects.map((effect) => {
        const file = (effect.data as AssetWriteData).file.slice('assets/'.length);
        const slash = file.indexOf('/');
        return `${file.slice(0, slash)}:${file.slice(slash + 1)}`;
      }),
    };
  }

  /**
   * Keeps the current and the new bytes of each write in {@link ASSET_UNDO_DIR} and returns
   * one {@link ASSET_WRITE_EFFECT} per write that changes the file. The live files are not
   * touched here: the effects write them when the command runs.
   */
  async #stageAssetWrites(writes: readonly ChangeAsset[]): Promise<CommandEffect[]> {
    const effects: CommandEffect[] = [];
    for (const write of writes) {
      const file = `assets/${write.namespace}/${write.path}`;
      const current = (await this.#fs.exists(file)) ? await this.#fs.readFile(file) : null;
      if (current !== null && sameBytes(current, write.bytes)) continue;
      this.#writeCounter += 1;
      const dir = `${ASSET_UNDO_DIR}/${this.#generation}-${this.#writeCounter}`;
      const before = current === null ? null : `${dir}/before`;
      if (current !== null) await this.#fs.writeFile(`${dir}/before`, current);
      await this.#fs.writeFile(`${dir}/after`, write.bytes);
      const data: AssetWriteData = { file, before, after: `${dir}/after` };
      effects.push({ type: ASSET_WRITE_EFFECT, data });
    }
    return effects;
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
   * Imports files through the registered importers (DESIGN §7): each file goes to the first
   * importer that accepts its lower-case extension, run for the current target. Every element
   * and asset of every file is added as one undoable command, "Import <n> files", together
   * with the namespace when the project lacks it; asset bytes are written first (like
   * {@link importAssets}). Elements whose id the project (or an earlier file) already has
   * are skipped and reported as `import.duplicate-id`. Never throws for a bad file: an
   * unsupported extension, a throwing importer or a result the project cannot hold is an
   * error problem, and the other files are still imported.
   *
   * @param files - The files' names and bytes.
   * @param namespace - The namespace the new elements and assets belong to.
   * @throws Error If no project is open or the namespace name is invalid.
   */
  async importFiles(
    files: readonly { name: string; data: Uint8Array }[],
    namespace: string,
  ): Promise<ImportFilesResult> {
    const stack = this.#requireStack();
    if (!isValidNamespace(namespace)) {
      throw new Error(`Invalid namespace name ${JSON.stringify(namespace)}.`);
    }
    const target = this.target;
    const problems: Problem[] = [];
    const bundle: {
      elements: ContentBundle['elements'][number][];
      assets: ContentBundle['assets'][number][];
    } = {
      elements: [],
      assets: [],
    };
    let accepted = 0;
    for (const file of files) {
      const entry = importerFor(this.#importers, file.name);
      if (entry === undefined) {
        problems.push({
          severity: 'error',
          code: SessionProblemCodes.importUnsupported,
          file: file.name,
          message: `${file.name} was not imported: no importer accepts this kind of file.`,
        });
        continue;
      }
      let result: ImportResult;
      try {
        result = await entry.run({ name: file.name, bytes: file.data }, namespace, target);
      } catch (error) {
        problems.push({
          severity: 'error',
          code: SessionProblemCodes.importFailed,
          file: file.name,
          message: `${file.name} could not be imported by ${entry.importer.displayName}: ${messageOf(error)}`,
        });
        continue;
      }
      problems.push(...result.problems);
      const part: ContentBundle = {
        elements: result.elements.map((element) => ({
          id: element.id,
          kind: element.kind,
          data: element.data,
          ...(element.meta?.notes === undefined ? {} : { notes: element.meta.notes }),
          ...(element.meta?.tags === undefined ? {} : { tags: element.meta.tags }),
        })),
        assets: result.assets.map(({ asset, bytes }) => ({
          namespace,
          path: asset.path,
          bytes,
        })),
      };
      try {
        // Checks kinds, ids and asset bytes; duplicates are reported below.
        prepareBundle(part, stack.state, this.registry, this.#now);
      } catch (error) {
        problems.push({
          severity: 'error',
          code: SessionProblemCodes.importFailed,
          file: file.name,
          message: `${file.name} could not be imported: ${messageOf(error)}`,
        });
        continue;
      }
      if (part.elements.length + part.assets.length > 0) accepted += 1;
      bundle.elements.push(...part.elements);
      bundle.assets.push(...part.assets);
    }
    const prepared = prepareBundle(bundle, stack.state, this.registry, this.#now);
    await this.#writeBundleAssets(prepared);
    // The state may have moved on while the bytes were written: check again.
    const current = prepareBundle(bundle, stack.state, this.registry, this.#now);
    for (const id of current.duplicates) {
      problems.push({
        severity: 'warning',
        code: SessionProblemCodes.importDuplicateId,
        elementId: id,
        message: `${id} already exists, so the imported copy was skipped. Rename or remove the existing element, then import again.`,
      });
    }
    for (const asset of current.skippedAssets) {
      problems.push({
        severity: 'warning',
        code: SessionProblemCodes.importDuplicateAsset,
        message: `The asset ${asset} already exists, so the imported copy was skipped.`,
      });
    }
    if (current.elements.length > 0 || current.assets.length > 0) {
      const label = `Import ${accepted} file${accepted === 1 ? '' : 's'}`;
      stack.execute({ ...bundleCommand(current, label), id: 'app.import-files' });
    }
    return { imported: current.elements.map((element) => element.id), problems };
  }

  /**
   * Replaces an element's data with the data a file imports to ("Replace from file…" in the
   * Structure Studio): the file goes to the importer that accepts its extension, run for the
   * current target like {@link importFiles}, and the first imported element of the same kind
   * replaces the data of `id`, which keeps its id and metadata. One undoable command,
   * "Replace <id> from <file>". Assets the importer returns are not added. Never throws for a
   * bad file: an unsupported extension, a throwing importer or a result without an element of
   * the element's kind is an error problem and changes nothing.
   *
   * @param id - The element to replace.
   * @param file - The file's name and bytes.
   * @throws Error If no project is open or the project has no element `id`.
   */
  async replaceElementFromFile(
    id: ResourceLocation,
    file: { name: string; data: Uint8Array },
  ): Promise<ReplaceFromFileResult> {
    const stack = this.#requireStack();
    const element = elementsById(stack.state).get(id);
    if (element === undefined) throw new Error(`There is no element ${id} to replace.`);
    const entry = importerFor(this.#importers, file.name);
    if (entry === undefined) {
      return {
        replaced: false,
        problems: [
          {
            severity: 'error',
            code: SessionProblemCodes.importUnsupported,
            file: file.name,
            elementId: id,
            message: `${file.name} was not imported: no importer accepts this kind of file.`,
          },
        ],
      };
    }
    const namespace = id.slice(0, id.indexOf(':'));
    let result: ImportResult;
    try {
      result = await entry.run({ name: file.name, bytes: file.data }, namespace, this.target);
    } catch (error) {
      return {
        replaced: false,
        problems: [
          {
            severity: 'error',
            code: SessionProblemCodes.importFailed,
            file: file.name,
            elementId: id,
            message: `${file.name} could not be imported by ${entry.importer.displayName}: ${messageOf(error)}`,
          },
        ],
      };
    }
    const problems: Problem[] = [...result.problems];
    const imported = result.elements.find((candidate) => candidate.kind === element.kind);
    if (imported === undefined) {
      problems.push({
        severity: 'error',
        code: SessionProblemCodes.importKindMismatch,
        file: file.name,
        elementId: id,
        message: `${file.name} holds no ${element.kind} element, so ${id} was not replaced.`,
      });
      return { replaced: false, problems };
    }
    // The project may have changed, or the element gone, while the file was imported.
    if (this.#requireStack() !== stack || !elementsById(stack.state).has(id)) {
      throw new Error(`There is no element ${id} to replace.`);
    }
    stack.execute({
      ...commands.setElementData(id, imported.data),
      id: 'app.replace-from-file',
      label: `Replace ${id} from ${file.name}`,
    });
    return { replaced: true, problems };
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

  /**
   * Runs a plugin's exporter (for example `structure-nbt` or `sponge-schematic`) through the
   * export pipeline into memory, then writes its files into a folder: `folder` when given,
   * else one the user picks (`platform.exports.pickFolder`). Errors, including project
   * validator errors, block as usual; nothing is asked or written then, nor when the
   * exporter wrote no files.
   *
   * @param exporterId - The id of a registered plugin exporter.
   * @param folder - A folder already picked in this session.
   * @param options - Values for the exporter's declared options, keyed by option id;
   *   missing ones take their default.
   * @throws Error If no project is open.
   */
  async runPluginExporter(
    exporterId: string,
    folder?: string,
    options: Record<string, Json> = {},
  ): Promise<ExportResult> {
    const exporter = this.#exporters.find((entry) => entry.id === exporterId);
    if (exporter === undefined) {
      return {
        ok: false,
        files: [],
        problems: [
          {
            severity: 'error',
            code: SessionProblemCodes.unknownExporter,
            message: `No plugin provides the exporter ${JSON.stringify(exporterId)}.`,
          },
        ],
      };
    }
    const sink = createMemorySink();
    const { report } = await this.#runPipeline(exporter, sink, options);
    if (!report.ok) return report;
    const written = sink.files();
    if (written.size === 0) return report;
    const chosen =
      folder ??
      (await this.#platform.exports.pickFolder(`${exporter.displayName}: choose a folder`));
    if (chosen === null) return { ...report, cancelled: true };
    await this.#platform.exports.writeFiles(
      chosen,
      [...written].map(([name, data]) => ({ name, data })),
    );
    return { ...report, location: chosen };
  }

  /**
   * Exports the Fabric mod jar (`fabric-content-jar`, ADR 0026) and asks where to save it as
   * `<mod id>.jar`. Every error problem blocks, as for the packs; nothing is asked or written
   * then. A missing runtime jar is `export.runtime-missing` unless `separateRuntime` is set.
   *
   * @param options - Values for {@link fabricJarOptions}, keyed by option id; missing ones
   *   take their default.
   * @throws Error If no project is open.
   */
  async exportFabricJar(options: Record<string, Json> = {}): Promise<ExportResult> {
    const sink = createMemorySink();
    const { report, project } = await this.#runPipeline(this.#contentJarExporter, sink, options);
    if (!report.ok) return report;
    const written = sink.files();
    const fileName = contentJarFileName(
      modIdOf(written.get(FABRIC_MOD_JSON_FILE)) ?? sanitiseModId(project.name) ?? 'mod',
    );
    const data = createZipBytes([...written].map(([path, bytes]) => ({ path, data: bytes })));
    const location = await this.#platform.dialogs.saveFile({
      title: 'Export Fabric mod jar',
      defaultName: fileName,
      filters: [{ name: 'Fabric mod', extensions: ['jar'] }],
      data,
    });
    return location === null ? { ...report, cancelled: true } : { ...report, location };
  }

  /**
   * Exports the project as a standalone Fabric Gradle project with generated Java
   * (`java-project`, ADR 0033) into `<folder>/<mod id>/`. Every error problem blocks, as for
   * the packs; nothing is asked or written then. `folder` is used when given (a folder picked
   * in this session), else the user picks one. A root folder that already holds files is the
   * blocking problem `export.folder-not-empty`. `location` is the written project folder.
   *
   * @param folder - A folder already picked in this session.
   * @throws Error If no project is open, or main refuses the tree.
   */
  async exportJavaProject(folder?: string): Promise<ExportResult> {
    const sink = createMemorySink();
    const { report, project } = await this.#runPipeline(this.#javaProjectExporter, sink);
    if (!report.ok) return report;
    const written = sink.files();
    if (written.size === 0) return report;
    const modId =
      modIdOf(written.get(JAVA_PROJECT_MOD_JSON)) ?? sanitiseModId(project.name) ?? 'msm_mod';
    const chosen =
      folder ?? (await this.#platform.exports.pickFolder('Export Java project: choose a folder'));
    if (chosen === null) return { ...report, cancelled: true };
    const result = await this.#platform.exports.writeTree(
      chosen,
      [...written].map(([path, data]) => ({ path: `${modId}/${path}`, data })),
    );
    if (!result.ok) {
      return {
        ...report,
        ok: false,
        problems: [
          {
            severity: 'error',
            code: SessionProblemCodes.folderNotEmpty,
            file: result.root,
            message: `The folder ${result.root} already exists and is not empty.`,
          },
          ...report.problems,
        ],
      };
    }
    return { ...report, location: result.root };
  }

  /**
   * What Test in Minecraft would do for the open project's target with the selected game
   * location (ADR 0026 D5).
   *
   * @throws Error If no project is open.
   */
  async testInMinecraftStatus(): Promise<TestInMinecraftStatus> {
    this.#requireStack();
    return this.#platform.testInMinecraft.status(this.target.id);
  }

  /**
   * Creates (or updates) the managed Prism instance for the target and makes it the install
   * target; returns the new status.
   *
   * @throws Error If no project is open, or main cannot create the instance.
   */
  async createTestInstance(): Promise<TestInMinecraftStatus> {
    this.#requireStack();
    return this.#platform.testInMinecraft.createInstance(this.target.id);
  }

  /**
   * Test in Minecraft (ADR 0026 D5): exports the Fabric mod jar with the runtime nested (as
   * {@link exportFabricJar} with default options; every error blocks), then main installs it
   * as `mods/<mod id>.jar` with Fabric API into the selected Fabric location and starts the
   * launcher when it can.
   *
   * @throws Error If no project is open, or the install fails in main.
   */
  async testInMinecraft(): Promise<TestInMinecraftOutcome> {
    const sink = createMemorySink();
    const { report, project, target } = await this.#runPipeline(this.#contentJarExporter, sink, {});
    if (!report.ok) return report;
    const written = sink.files();
    const modId =
      modIdOf(written.get(FABRIC_MOD_JSON_FILE)) ?? sanitiseModId(project.name) ?? 'mod';
    const data = createZipBytes([...written].map(([path, bytes]) => ({ path, data: bytes })));
    const test = await this.#platform.testInMinecraft.run(target.id, modId, data);
    return { ...report, test };
  }

  /** Runs the export pipeline for one pack into a zip; `data` is absent when blocked. */
  async #buildPack(
    pack: PackKind,
  ): Promise<{ report: ExportReport; fileName: string; data?: Uint8Array }> {
    const sink = createZipSink();
    const { report, project, target } = await this.#runPipeline(
      pack === 'data' ? dataPackExporter : resourcePackExporter,
      sink,
    );
    const fileName = packFileName(project.name, target, pack);
    if (!report.ok) return { report, fileName };
    return { report, fileName, data: sink.finish() };
  }

  /**
   * Runs `runExport` for the current project after pending validation. Project validator
   * errors of elements in the exporter's layers block the report (they come first in it).
   */
  async #runPipeline(
    exporter: Exporter,
    sink: OutputSink,
    options?: Record<string, Json>,
  ): Promise<{ report: ExportReport; project: Project; target: Target }> {
    const stack = this.#requireStack();
    await this.flushValidation();
    await this.flushAssetFiles();
    const project = stack.state;
    const context = await this.schemas();
    const info = await this.#platform.app.info();
    const validateText = this.#textValidator(project, context.target);
    const report = await runExport({
      project,
      registry: this.registry,
      target: context.target,
      schemaIndex: context.schemaIndex,
      registries: context.registries(project),
      exporter,
      sink,
      readAsset: (namespace, path) => this.readAsset(namespace, path),
      meta: { msmVersion: info.version, plugins: [...project.plugins] },
      ...(options === undefined ? {} : { options }),
      ...(validateText === undefined ? {} : { validateText }),
    });
    const blocking = [
      ...this.#unavailablePluginProblems(project),
      ...(await blockingValidatorErrors(
        [...this.#validatorProblems.values()].flat(),
        project,
        async (element) => {
          const kind = this.registry.get(element.kind);
          if (kind === undefined) return [];
          return kind.lower(element, context.target);
        },
        exporter.layers,
      )),
    ];
    if (blocking.length === 0) return { report, project, target: context.target };
    return {
      report: { ok: false, problems: [...blocking, ...report.problems], files: [] },
      project,
      target: context.target,
    };
  }

  /**
   * The export gate's `validateText`: mcfunction files through the injected mcfunction
   * checker, `typescript` files through the scripting checker (errors block, warnings pass).
   * `undefined` when neither checker is injected.
   */
  #textValidator(
    project: Project,
    target: Target,
  ): ((file: OutputFile) => Promise<Problem[]>) | undefined {
    const mcfunction =
      this.#mcfunction === undefined
        ? undefined
        : mcfunctionTextValidator(this.#mcfunction, project, target);
    const scripts =
      this.#scripting === undefined
        ? undefined
        : scriptTextValidator(this.#scripting, this.#scriptTypings);
    if (mcfunction === undefined && scripts === undefined) return undefined;
    return async (file) => {
      if (file.language === 'typescript') return scripts === undefined ? [] : scripts(file);
      return mcfunction === undefined ? [] : mcfunction(file);
    };
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
    if (this.#stack === null || (this.#pending.size === 0 && this.#pendingValidators.size === 0)) {
      return;
    }
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
      this.#pendingValidators.clear();
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
    const scripts: { element: Element; problems: Problem[] }[] = [];
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
      } else if (
        element.kind === SCRIPT_KIND &&
        this.#scripting !== undefined &&
        !problems.some((problem) => problem.severity === 'error')
      ) {
        scripts.push({ element, problems });
      } else {
        this.#schemaProblems.set(id, problems);
      }
    }
    await this.#runValidators(context, project);
    if (generation !== this.#generation || this.#stack === null) return;
    this.#publish();
    if (functions.length > 0) await this.#checkFunctions(functions, context, project, generation);
    if (scripts.length > 0) await this.#checkScripts(scripts, generation);
  }

  /**
   * Runs the injected TypeScript checker over script elements after their schema check and
   * publishes its problems after theirs. A failing checker is reported once, as
   * `session.scripting-unavailable`, until a check succeeds again.
   */
  async #checkScripts(
    scripts: readonly { element: Element; problems: Problem[] }[],
    generation: number,
  ): Promise<void> {
    const checker = this.#scripting;
    if (checker === undefined) return;
    for (const { element, problems: schemaProblems } of scripts) {
      const lines = scriptLines(element) ?? [];
      let problems: Problem[] = [];
      let failure: unknown;
      try {
        problems = await checkScriptElement(checker, element, lines, this.#scriptTypings);
      } catch (error) {
        failure = error;
      }
      if (generation !== this.#generation || this.#stack === null) return;
      if (failure === undefined) {
        this.#scriptingProblem = null;
      } else if (this.#scriptingProblem === null) {
        this.#scriptingProblem = {
          severity: 'warning',
          code: SessionProblemCodes.scriptingUnavailable,
          message: `Scripts could not be checked: ${messageOf(failure)}`,
        };
      }
      if (!elementsById(this.#stack.state).has(element.id)) continue;
      this.#schemaProblems.set(element.id, [...schemaProblems, ...problems]);
      this.#publish();
    }
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
      const problems = await this.#functionProblems(checker, element, context, projectIds);
      if (generation !== this.#generation || this.#stack === null) return;
      if (!elementsById(this.#stack.state).has(element.id)) continue;
      this.#schemaProblems.set(element.id, [...schemaProblems, ...problems]);
      this.#publish();
    }
  }

  /**
   * The mcfunction checker's problems for one function element, or one
   * `mcfunction.unavailable` warning when the checker fails.
   */
  async #functionProblems(
    checker: McfunctionChecker,
    element: Element,
    context: SchemaContext,
    projectIds: ReturnType<typeof mcfunctionProjectIds>,
  ): Promise<Problem[]> {
    try {
      return await checkFunctionElement(
        checker,
        element,
        functionLines(element) ?? [],
        context.target,
        projectIds,
      );
    } catch (error) {
      return [
        {
          severity: 'warning',
          code: SessionProblemCodes.mcfunctionUnavailable,
          elementId: element.id,
          message: `The function could not be checked: ${messageOf(error)}`,
        },
      ];
    }
  }

  /** What the plugin validators read for `project`. */
  #validatorInput(context: SchemaContext, project: Project) {
    return {
      elements: projectElements(project),
      target: context.target,
      registry: context.registries(project),
    };
  }

  /**
   * Runs the pending project validators (those whose kinds changed) over `project`, after the
   * schema pass, with the registry index of the session's registered kinds.
   */
  async #runValidators(context: SchemaContext, project: Project): Promise<void> {
    if (this.#pendingValidators.size === 0) return;
    const pending = this.#pendingValidators;
    this.#pendingValidators = new Set();
    const input = this.#validatorInput(context, project);
    const generation = this.#generation;
    // Validators of third-party plugins resolve through their workers (ADR 0035 D3); all run
    // at once and their problems are kept in validator order.
    const results = await Promise.all(
      this.#validators
        .filter((entry) => pending.has(entry.validator.id))
        .map(async (entry) => [entry.validator.id, await runValidator(entry, input)] as const),
    );
    if (generation !== this.#generation) return;
    for (const [id, problems] of results) this.#validatorProblems.set(id, problems);
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
    // Function objectives are project-wide too: a new `scoreboard objectives add` in one
    // function changes the warnings in every other function.
    const idsKey = (project: Project | null) =>
      project === null
        ? ''
        : JSON.stringify([
            projectRegistryIds(project, this.registry),
            mcfunctionProjectIds(project).objective ?? [],
          ]);
    this.#renameProblems = [];
    const targetChanged =
      this.#lastState !== null && this.#lastState.targets[0] !== event.state.targets[0];
    if (targetChanged) {
      // A target change (upgrade, or its undo) changes the schema and the registries: check
      // everything again, against the new target's defaults too.
      this.#targetProblems = this.#targetProblemsFor(event.state);
      void this.#fillKindDefaults(this.#currentTarget());
    }
    if (targetChanged || idsKey(this.#lastState) !== idsKey(event.state)) {
      // Project-defined ids changed, so `#[id]` warnings anywhere may change.
      for (const id of after.keys()) this.#pending.add(id);
      // Validators read registry ids too.
      for (const entry of this.#validators) this.#pendingValidators.add(entry.validator.id);
    } else {
      for (const entry of validatorsFor(
        this.#validators,
        changedKinds(this.#lastState, event.state),
      )) {
        this.#pendingValidators.add(entry.validator.id);
      }
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
    this.#replayAssetWrites(event);
    this.#lastState = event.state;
    if (this.#pending.size > 0 || this.#pendingValidators.size > 0) {
      this.#scheduleValidation(this.#validationDelay);
    }
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

  /**
   * Performs the asset write effects of a command (ADR 0045): on execute and redo the stored
   * new bytes go to the live file, in order; on undo, in reverse order, the stored previous
   * bytes go back, or the file is removed when there was none. Queued with the trash moves.
   */
  #replayAssetWrites(event: CommandEvent): void {
    const writes = event.effects.filter(isAssetWrite);
    if (writes.length === 0) return;
    const generation = this.#generation;
    const undo = event.type === 'undo';
    const ordered = undo ? [...writes].reverse() : writes;
    this.#assetOps = this.#assetOps.then(async () => {
      if (generation !== this.#generation) return;
      for (const { data } of ordered) {
        const source = undo ? data.before : data.after;
        try {
          if (source === null) {
            await this.#fs.remove(data.file);
          } else {
            await this.#fs.writeFile(data.file, await this.#fs.readFile(source));
          }
        } catch (error) {
          this.#assetProblems.push({
            severity: 'warning',
            code: SessionProblemCodes.assetTrashFailed,
            file: data.file,
            message: `Could not ${undo ? 'restore' : 'write'} ${data.file}: ${messageOf(error)}`,
          });
          this.#publish();
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

  /**
   * Writes the script typings to `.msm/msm-runtime.d.ts` when the scripting kind is registered
   * and the file differs (ADR 0032 D5). Never fails the open or create.
   */
  async #writeScriptTypings(): Promise<void> {
    if (this.registry.get(SCRIPT_KIND) === undefined) return;
    try {
      const wanted = new TextEncoder().encode(this.#scriptTypings);
      if (await this.#fs.exists(SCRIPT_TYPINGS_FILE)) {
        const current = await this.#fs.readFile(SCRIPT_TYPINGS_FILE);
        if (
          current.length === wanted.length &&
          current.every((byte, index) => byte === wanted[index])
        ) {
          return;
        }
      }
      await this.#fs.mkdirp(SCRIPT_TYPINGS_FILE.slice(0, SCRIPT_TYPINGS_FILE.lastIndexOf('/')));
      await this.#fs.writeFile(SCRIPT_TYPINGS_FILE, wanted);
    } catch (error) {
      console.warn(`MSM: could not write ${SCRIPT_TYPINGS_FILE}: ${messageOf(error)}`);
    }
  }

  async #emptyTrash(): Promise<void> {
    try {
      await this.#fs.remove(ASSET_TRASH_DIR);
      await this.#fs.remove(ASSET_UNDO_DIR);
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
    const fallback = this.#defaultTarget?.id;
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
    for (const entry of this.#validators) this.#pendingValidators.add(entry.validator.id);
    this.#publish();
    // Full pass on open, without the debounce.
    if (this.#pending.size > 0 || this.#pendingValidators.size > 0) this.#scheduleValidation(0);
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
    this.#validatorProblems = new Map();
    this.#pendingValidators = new Set();
    this.#lastState = null;
    this.#assetProblems = [];
    this.#renameProblems = [];
    this.#referenceCache = null;
    this.#scriptingProblem = null;
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
      const validatorProblems = this.#validators.flatMap(
        (entry) => this.#validatorProblems.get(entry.validator.id) ?? [],
      );
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
          ...(this.#scriptingProblem === null ? [] : [this.#scriptingProblem]),
          ...this.#renameProblems,
          ...this.#overwriteProblems(project),
          ...this.#unavailablePluginProblems(project),
          ...schemaProblems,
          ...validatorProblems,
        ],
      };
    }
    for (const listener of [...this.#listeners]) listener(this.#snapshot);
  }
}
