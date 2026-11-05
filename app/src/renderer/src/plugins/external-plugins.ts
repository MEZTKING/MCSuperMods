/**
 * Third-party plugins (ADR 0035): reads the plugin folders main found, checks each manifest's
 * API range before any code runs, starts one sandboxed worker per plugin, checks what the
 * worker describes, and builds an ordinary `Plugin` facade whose functions resolve through
 * the worker (D3). The session registers the facades after the built-ins.
 *
 * States: `loaded` (registered; warnings such as `plugin.capability-unsupported` may be
 * attached), `refused` (never registered: manifest, API range, capabilities, namespaces, a
 * clash with a registered id, schemas outside the plugin's namespace, too large) and
 * `failed` (the worker did not start, crashed or timed out; a plugin that fails after it was
 * loaded keeps its kinds registered so its elements still round-trip, and the session reports
 * `plugin.unavailable` for them).
 *
 * @packageDocumentation
 */

import { ElementKindRegistry, registerPlugin } from '@msm/core';
import type {
  BundleContext,
  ContentBundle,
  Element,
  ElementKind,
  ElementTemplate,
  ExampleProject,
  Exporter,
  ExporterInput,
  ExporterOption,
  ImportedFile,
  Importer,
  ImportResult,
  Json,
  OutputFile,
  OutputLayer,
  Plugin,
  PluginContributions,
  Problem,
  ProjectStarter,
  ProjectValidator,
  StarterParameter,
  Target,
  TargetFacts,
  TemplateContext,
  ValidationInput,
  ValidationRegistry,
} from '@msm/plugin-api';
import type { VanillaMcdocSymbols } from '@msm/schemas';
import { targetById, targetFacts } from '@msm/targets';
import { PluginProblemCodes } from '../../../shared/ipc-channels';
import type {
  ExternalPluginEntry,
  PlatformAdapter,
  PluginManifest,
} from '../../../shared/platform';
import { apiVersionProblem, checkDescription, parsePluginSchemas } from './manifest';
import {
  type CreatePluginWorkerOptions,
  createPluginWorker,
  type PluginWorker,
  SandboxError,
} from './sandbox/host';
import type { ContributionDescription } from './sandbox/protocol';

/** One plugin folder as the app sees it (shown in Settings > Plugins). */
export interface ExternalPluginState {
  /** The manifest id, or the folder name when the manifest is unusable. */
  id: string;
  /** The manifest name, or the folder name. */
  name: string;
  /** The manifest version, or `''`. */
  version: string;
  state: 'loaded' | 'refused' | 'failed';
  /** Why it was refused or failed, plus warnings of a loaded plugin. */
  problems: Problem[];
}

/** Live plugin states: the session republishes when one changes (a plugin failing later). */
export interface ExternalPluginStatus {
  readonly states: readonly ExternalPluginState[];
  /** Subscribes to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** What {@link loadExternalPlugins} returns. */
export interface ExternalPluginSet extends ExternalPluginStatus {
  /** The facades of the loaded plugins, in folder order. */
  readonly plugins: Plugin[];
  /** The loaded plugins' schema exports (merged into every schema context). */
  readonly symbols: VanillaMcdocSymbols[];
  /** Terminates every worker. */
  terminate(): void;
}

/** Options of {@link loadExternalPlugins}. */
export interface LoadExternalPluginsOptions {
  /** The host's plugin API version (default `API_VERSION`). */
  apiVersion?: string;
  /** The built-in plugins: their ids always win (a clash refuses the external plugin). */
  builtIns?: readonly Plugin[];
  /** Starts a worker (tests pass a stand-in; default a `blob:` worker). */
  spawn?: CreatePluginWorkerOptions['spawn'];
  /** Start deadline (default 10 s, then `plugin.timeout`). */
  startDeadlineMs?: number;
}

/** An empty set (no plugins folder, or no platform support). */
export const NO_EXTERNAL_PLUGINS: ExternalPluginSet = Object.freeze({
  plugins: [],
  symbols: [],
  states: [],
  subscribe: () => () => undefined,
  terminate: () => undefined,
});

const OUTPUT_LAYERS: ReadonlySet<string> = new Set(['resourcepack', 'datapack', 'msm']);
const SEVERITIES: ReadonlySet<string> = new Set(['error', 'warning', 'info']);

const facts = new WeakMap<object, TargetFacts>();

/**
 * The data fields of a target, without its hook functions (`javaProject`, `migrateFrom`),
 * which cannot be structured-cloned (ADR 0036 D3). Memoised per target object.
 */
export function toTargetFacts(target: TargetFacts | Target): TargetFacts {
  const cached = facts.get(target);
  if (cached !== undefined) return cached;
  // A built-in target: `@msm/targets` strips its hooks. Any other (tests, future targets):
  // copy the data fields.
  const builtIn = targetById(target.id)?.target === target ? targetFacts(target.id) : undefined;
  const out: TargetFacts = builtIn ?? structuredClone({
    id: target.id,
    mcVersion: target.mcVersion,
    channel: target.channel,
    java: target.java,
    packFormats: target.packFormats,
    mcdocRef: target.mcdocRef,
    mcmetaRef: target.mcmetaRef,
    folders: target.folders,
    dataVersion: target.dataVersion,
    worldgen: target.worldgen,
    ...(target.fabric === undefined ? {} : { fabric: target.fabric }),
    ...(target.geckolib === undefined ? {} : { geckolib: target.geckolib }),
  });
  facts.set(target, out);
  return out;
}

function badResult(what: string, why: string): SandboxError {
  return new SandboxError(PluginProblemCodes.badResult, `${what} returned ${why}.`);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks one problem a plugin returned or reported; `null` when it is malformed. */
export function asPluginProblem(value: unknown): Problem | null {
  if (!isObject(value)) return null;
  const { severity, code, message } = value;
  if (typeof severity !== 'string' || !SEVERITIES.has(severity)) return null;
  if (typeof code !== 'string' || code === '' || typeof message !== 'string') return null;
  const out: Problem = {
    severity: severity as Problem['severity'],
    code: code.slice(0, 128),
    message: message.slice(0, 4096),
  };
  for (const key of ['elementId', 'path', 'file'] as const) {
    const field = value[key];
    if (typeof field === 'string') (out as unknown as Record<string, string>)[key] = field;
  }
  return out;
}

function checkOutputFiles(value: unknown, what: string): OutputFile[] {
  if (!Array.isArray(value)) throw badResult(what, 'no list of output files');
  for (const file of value) {
    if (!isObject(file) || typeof file.path !== 'string') {
      throw badResult(what, 'an output file without a path');
    }
    if (typeof file.layer !== 'string' || !OUTPUT_LAYERS.has(file.layer)) {
      throw badResult(what, `an output file with an unknown layer (${file.path})`);
    }
    if (!('contents' in file))
      throw badResult(what, `an output file without contents (${file.path})`);
  }
  return value as OutputFile[];
}

function checkBundle(value: unknown, what: string): ContentBundle {
  if (!isObject(value) || !Array.isArray(value.elements) || !Array.isArray(value.assets)) {
    throw badResult(what, 'no { elements, assets } bundle');
  }
  for (const asset of value.assets) {
    if (!isObject(asset) || !(asset.bytes instanceof Uint8Array)) {
      throw badResult(what, 'an asset without bytes');
    }
  }
  return value as unknown as ContentBundle;
}

function checkProblems(value: unknown, what: string): Problem[] {
  if (!Array.isArray(value)) throw badResult(what, 'no list of problems');
  return value.map((entry) => {
    const problem = asPluginProblem(entry);
    if (problem === null) throw badResult(what, 'a malformed problem');
    return problem;
  });
}

function checkImport(value: unknown, what: string): ImportResult {
  if (
    !isObject(value) ||
    !Array.isArray(value.elements) ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.problems)
  ) {
    throw badResult(what, 'no { elements, assets, problems } result');
  }
  for (const asset of value.assets) {
    if (!isObject(asset) || !isObject(asset.asset) || !(asset.bytes instanceof Uint8Array)) {
      throw badResult(what, 'an asset without bytes');
    }
  }
  return { ...(value as unknown as ImportResult), problems: checkProblems(value.problems, what) };
}

/** Registry snapshot keys per registry object, and which keys each worker has. */
const registryKeys = new WeakMap<object, string>();
let nextRegistryKey = 1;

function registryKey(registry: ValidationRegistry): string {
  let key = registryKeys.get(registry);
  if (key === undefined) {
    key = `r${nextRegistryKey++}`;
    registryKeys.set(registry, key);
  }
  return key;
}

/** Ids per registry: `RegistryIndex.registries()` when the registry has it, else nothing. */
function registrySnapshot(registry: ValidationRegistry): Record<string, string[]> {
  const names = (registry as { registries?: () => readonly string[] }).registries;
  if (typeof names !== 'function') return {};
  const out: Record<string, string[]> = {};
  for (const name of names.call(registry)) out[name] = [...registry.ids(name)];
  return out;
}

/** Data fields copied from a description entry onto a facade (functions are added after). */
function dataOf(entry: ContributionDescription): Record<string, unknown> {
  return { ...entry.data };
}

/**
 * Builds the `Plugin` facade over a running worker.
 *
 * @param manifest - The validated manifest.
 * @param points - The checked contribution points.
 * @param worker - The worker.
 */
export function buildFacade(
  manifest: PluginManifest,
  points: Partial<Record<keyof PluginContributions, ContributionDescription[]>>,
  worker: PluginWorker,
): Plugin {
  const sentKeys = new Set<string>();
  const contributes: PluginContributions = {};

  const kinds = points.elementKinds;
  if (kinds !== undefined) {
    contributes.elementKinds = kinds.map((entry) => {
      const id = String(entry.data.id);
      const what = `${manifest.id} kind ${id} lower`;
      return {
        ...(dataOf(entry) as Omit<ElementKind, 'lower'>),
        async lower(element: Element, target: TargetFacts) {
          return checkOutputFiles(
            await worker.call('lower', [id, element, toTargetFacts(target)]),
            what,
          );
        },
      };
    });
  }

  const templates = points.elementTemplates;
  if (templates !== undefined) {
    contributes.elementTemplates = templates.map((entry) => {
      const id = String(entry.data.id);
      return {
        ...(dataOf(entry) as Omit<ElementTemplate, 'data'>),
        async data(context: TemplateContext): Promise<Json> {
          const value = await worker.call('data', [
            id,
            { ...context, target: toTargetFacts(context.target) },
          ]);
          return value as Json;
        },
      };
    });
  }

  const bundleBuilder =
    (point: 'projectStarters' | 'examples', id: string) =>
    async (context: BundleContext): Promise<ContentBundle> =>
      checkBundle(
        await worker.call('build', [
          point,
          id,
          { ...context, target: toTargetFacts(context.target) },
        ]),
        `${manifest.id} ${point === 'examples' ? 'example' : 'starter'} ${id} build`,
      );

  const starters = points.projectStarters;
  if (starters !== undefined) {
    contributes.projectStarters = starters.map((entry) => {
      const id = String(entry.data.id);
      const data = dataOf(entry) as Omit<ProjectStarter, 'build'> & {
        parameters?: StarterParameter[];
      };
      return { ...data, build: bundleBuilder('projectStarters', id) };
    });
  }

  const examples = points.examples;
  if (examples !== undefined) {
    contributes.examples = examples.map((entry) => {
      const id = String(entry.data.id);
      return {
        ...(dataOf(entry) as Omit<ExampleProject, 'build'>),
        build: bundleBuilder('examples', id),
      };
    });
  }

  const validators = points.validators;
  if (validators !== undefined) {
    contributes.validators = validators.map((entry) => {
      const id = String(entry.data.id);
      return {
        ...(dataOf(entry) as Omit<ProjectValidator, 'validate'>),
        async validate(input: ValidationInput): Promise<Problem[]> {
          const key = registryKey(input.registry);
          const snapshot = sentKeys.has(key) ? null : registrySnapshot(input.registry);
          sentKeys.add(key);
          // The worker keeps a few snapshots; forget the oldest key so it is sent again.
          if (sentKeys.size > 4) {
            const oldest = sentKeys.values().next().value;
            if (oldest !== undefined) sentKeys.delete(oldest);
          }
          let value: unknown;
          try {
            value = await worker.call('validate', [
              id,
              { elements: input.elements, target: toTargetFacts(input.target) },
              key,
              snapshot,
            ]);
          } catch (error) {
            if (error instanceof SandboxError && /Unknown registry snapshot/.test(error.message)) {
              sentKeys.delete(key);
            }
            throw error;
          }
          return checkProblems(value, `${manifest.id} validator ${id}`);
        },
      };
    });
  }

  const exporters = points.exporters;
  if (exporters !== undefined) {
    contributes.exporters = exporters.map((entry) => {
      const id = String(entry.data.id);
      const data = dataOf(entry) as Omit<Exporter, 'run'> & { options?: ExporterOption[] };
      return {
        ...data,
        layers: [...(data.layers as OutputLayer[])],
        async run(input: ExporterInput): Promise<void> {
          await worker.call(
            'run',
            [
              id,
              {
                projectName: input.projectName,
                target: toTargetFacts(input.target),
                files: input.files,
                meta: input.meta,
                options: input.options,
              },
            ],
            undefined,
            {
              writeFile: (path, contents) => input.sink.writeFile(path, contents),
              report: (value) => {
                const problem = asPluginProblem(value);
                if (problem !== null) input.problems.report(problem);
              },
            },
          );
        },
      };
    });
  }

  const importers = points.importers;
  if (importers !== undefined) {
    contributes.importers = importers.map((entry) => {
      const id = String(entry.data.id);
      return {
        ...(dataOf(entry) as Omit<Importer, 'import'>),
        async import(file: ImportedFile, namespace: string): Promise<ImportResult> {
          return checkImport(
            await worker.call('import', [id, { name: file.name, bytes: file.bytes }, namespace]),
            `${manifest.id} importer ${id}`,
          );
        },
      };
    });
  }

  return { id: manifest.id, apiVersion: manifest.apiVersion, contributes };
}

/** Ids already taken by registered plugins, per contribution point (not kinds: the registry checks those). */
type TakenIds = Record<
  'exporters' | 'importers' | 'elementTemplates' | 'projectStarters' | 'examples' | 'validators',
  Set<string>
>;

function takenIdsOf(plugins: readonly Plugin[]): TakenIds {
  const taken: TakenIds = {
    exporters: new Set(),
    importers: new Set(),
    elementTemplates: new Set(),
    projectStarters: new Set(),
    examples: new Set(),
    validators: new Set(),
  };
  for (const plugin of plugins) addTaken(taken, plugin);
  return taken;
}

function addTaken(taken: TakenIds, plugin: Plugin): void {
  for (const point of Object.keys(taken) as (keyof TakenIds)[]) {
    for (const entry of plugin.contributes[point] ?? []) taken[point].add(entry.id);
  }
}

/** The first id of `plugin` that is already taken, or `null`. */
function clashOf(taken: TakenIds, plugin: Plugin): string | null {
  for (const point of Object.keys(taken) as (keyof TakenIds)[]) {
    const own = new Set<string>();
    for (const entry of plugin.contributes[point] ?? []) {
      if (taken[point].has(entry.id) || own.has(entry.id)) return `${point} id ${entry.id}`;
      own.add(entry.id);
    }
  }
  return null;
}

/** The `plugin.*` code at the start of an error message (IPC errors carry a prefix). */
export function pluginCodeOf(error: unknown, fallback: string): string {
  if (error instanceof SandboxError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(plugin\.[a-z-]+)\b/.exec(message)?.[1] ?? fallback;
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Electron prefixes remote errors with "Error invoking remote method '<channel>': Error: ".
  return message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '');
}

interface Started {
  entry: ExternalPluginEntry;
  state: ExternalPluginState;
  manifest?: PluginManifest;
  worker?: PluginWorker;
  symbols?: VanillaMcdocSymbols[];
  points?: ReturnType<typeof checkDescription>['points'];
}

/**
 * Reads every plugin folder through `platform.plugins`, checks and starts each plugin, and
 * returns the facades with their states. Never rejects: a broken plugin is a state.
 */
export async function loadExternalPlugins(
  platform: Pick<PlatformAdapter, 'plugins'>,
  options: LoadExternalPluginsOptions = {},
): Promise<ExternalPluginSet> {
  const service = platform.plugins;
  if (service === undefined) return NO_EXTERNAL_PLUGINS;
  let entries: ExternalPluginEntry[];
  try {
    entries = await service.list();
  } catch {
    return NO_EXTERNAL_PLUGINS;
  }
  if (entries.length === 0) return NO_EXTERNAL_PLUGINS;

  const start = async (entry: ExternalPluginEntry): Promise<Started> => {
    const manifest = entry.manifest;
    const base = {
      id: entry.id,
      name: manifest?.name ?? entry.folder,
      version: manifest?.version ?? '',
    };
    const refuse = (problems: Problem[]): Started => ({
      entry,
      state: { ...base, state: 'refused', problems },
    });
    if (manifest === null) return refuse(entry.problems);
    const incompatible = apiVersionProblem(manifest, options.apiVersion);
    if (incompatible !== null) return refuse([incompatible]);
    let bundle: Awaited<ReturnType<NonNullable<PlatformAdapter['plugins']>['read']>>;
    try {
      bundle = await service.read(manifest.id);
    } catch (error) {
      return refuse([
        {
          severity: 'error',
          code: pluginCodeOf(error, PluginProblemCodes.manifestInvalid),
          message: messageOf(error),
        },
      ]);
    }
    const schemas = parsePluginSchemas(manifest, bundle.schemas);
    if (!schemas.ok) return refuse([schemas.problem]);
    const worker = createPluginWorker(bundle.main, {
      name: `msm-plugin:${manifest.id}`,
      ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
      ...(options.startDeadlineMs === undefined
        ? {}
        : { startDeadlineMs: options.startDeadlineMs }),
    });
    let description: Awaited<PluginWorker['ready']>;
    try {
      description = await worker.ready;
    } catch (error) {
      worker.terminate();
      return {
        entry,
        state: {
          ...base,
          state: 'failed',
          problems: [
            {
              severity: 'error',
              code: pluginCodeOf(error, PluginProblemCodes.crashed),
              message: `${manifest.id} did not start: ${messageOf(error)}`,
            },
          ],
        },
      };
    }
    const checked = checkDescription(description, manifest);
    if (checked.refused) {
      worker.terminate();
      return refuse(checked.problems);
    }
    return {
      entry,
      manifest,
      worker,
      symbols: schemas.symbols,
      points: checked.points,
      state: { ...base, state: 'loaded', problems: checked.problems },
    };
  };

  const started = await Promise.all(entries.map((entry) => start(entry)));

  // Register in folder order against the built-ins and the plugins before, as the session
  // will, so a clash refuses the later plugin and the session's registration cannot throw.
  const registry = new ElementKindRegistry();
  const apiOptions = options.apiVersion === undefined ? {} : { apiVersion: options.apiVersion };
  const builtIns = options.builtIns ?? [];
  for (const plugin of builtIns) {
    try {
      registerPlugin(registry, plugin, apiOptions);
    } catch {
      // A built-in that does not register here is not an external plugin's concern.
    }
  }
  const taken = takenIdsOf(builtIns);
  const plugins: Plugin[] = [];
  const symbols: VanillaMcdocSymbols[] = [];
  const states: ExternalPluginState[] = [];
  let snapshot: readonly ExternalPluginState[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  for (const item of started) {
    const { manifest, worker, points } = item;
    if (manifest === undefined || worker === undefined || points === undefined) {
      states.push(item.state);
      continue;
    }
    const facade = buildFacade(manifest, points, worker);
    const clash = clashOf(taken, facade);
    let refusal: string | null =
      clash === null ? null : `${manifest.id}: ${clash} is already registered.`;
    if (refusal === null) {
      try {
        registerPlugin(registry, facade, apiOptions);
      } catch (error) {
        refusal = messageOf(error);
      }
    }
    if (refusal !== null) {
      worker.terminate();
      states.push({
        ...item.state,
        state: 'refused',
        problems: [
          ...item.state.problems,
          { severity: 'error', code: PluginProblemCodes.refused, message: refusal },
        ],
      });
      continue;
    }
    addTaken(taken, facade);
    plugins.push(facade);
    symbols.push(...(item.symbols ?? []));
    const index = states.length;
    states.push(item.state);
    worker.onFail((error) => {
      const current = snapshot[index];
      if (current === undefined) return;
      const next = [...snapshot];
      next[index] = {
        ...current,
        state: 'failed',
        problems: [
          ...current.problems,
          {
            severity: 'error',
            code: error.code,
            message: `${manifest.id} stopped: ${error.message} It is unavailable until MCSuperMods restarts.`,
          },
        ],
      };
      snapshot = Object.freeze(next);
      notify();
    });
  }
  snapshot = Object.freeze([...states]);

  return {
    plugins,
    symbols,
    get states() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    terminate() {
      for (const item of started) item.worker?.terminate();
    },
  };
}
