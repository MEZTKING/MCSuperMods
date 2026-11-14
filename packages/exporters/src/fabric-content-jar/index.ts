/**
 * The `fabric-content-jar` exporter (ADR 0026): one Fabric mod jar holding the project's
 * `assets/`, `data/` and `msm/` files, `fabric.mod.json` and, by default, the `msm_runtime`
 * jar nested under `META-INF/jars/`. A project whose entities are drawn with GeckoLib also
 * depends on GeckoLib and, by default, nests its jar (ADR 0029 D4, ADR 0072 D5).
 *
 * The exporter writes jar entries to its sink; the host passes a zip sink
 * (`createZipSink`), whose archive is deterministic (sorted entries, fixed timestamps,
 * ADR 0013). It never reads files itself: the runtime jar's bytes come from the factory's
 * `loadRuntimeJar` (ADR 0026 D4) and GeckoLib's from `loadGeckolibJar`.
 *
 * @packageDocumentation
 */

import { utf8 } from '@msm/core';
import type {
  Exporter,
  ExporterInput,
  FabricFacts,
  GeckolibFacts,
  Json,
  JsonObject,
  OutputFile,
  Problem,
} from '@msm/plugin-api';
import { outputFileBytes } from '../contents';
import { EXPORT_MANIFEST_FILE, exportManifest } from '../manifest';
import { ExportProblemCodes } from '../problem-codes';
import { comparePaths } from '../zip';

/** The exporter's id. */
export const FABRIC_CONTENT_JAR_EXPORTER_ID = 'fabric-content-jar';

/** The mod metadata file at the jar root. */
export const FABRIC_MOD_JSON_FILE = 'fabric.mod.json';

/** The id of the boolean option that leaves the runtime (and GeckoLib) out of the jar. */
export const SEPARATE_RUNTIME_OPTION = 'separateRuntime';

/** The runtime mod's id, written into `depends`. */
export const MSM_RUNTIME_MOD_ID = 'msm_runtime';

/** The folder nested jars live in. */
const NESTED_JARS_FOLDER = 'META-INF/jars/';

/**
 * Entity definitions: `msm/<ns>/entity/...`. Their renderers decide whether the jar needs
 * GeckoLib ({@link needsGeckolib}).
 */
const ENTITY_DEFINITION_PATTERN = /^msm\/([^/]+)\/entity\//;

/**
 * The first `msm_runtime` that runs scripts and the `run_script` action (ADR 0032 D4): a jar
 * with scripts depends on at least this version, whatever the exporter's runtime version.
 */
export const SCRIPT_RUNTIME_MINIMUM = '0.6.0';

/**
 * The later of two `major.minor.patch` versions (numeric parts compared; a pre-release or
 * build suffix is ignored for the comparison and kept on the version returned).
 */
export function laterVersion(a: string, b: string): string {
  const parts = (v: string): number[] =>
    (v.split(/[-+]/)[0] ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? a : b;
  }
  return a;
}

/** The version written into a synthesised `fabric.mod.json`. */
export const DEFAULT_MOD_VERSION = '1.0.0';

/** Fabric's mod id rule. */
export const FABRIC_MOD_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

/**
 * Mod ids the synthesised `fabric.mod.json` never uses (ADR 0026 D2): the game, Java, Fabric
 * Loader, Fabric API and the MSM runtime. A derived id equal to one gains a `mod_` prefix.
 */
export const RESERVED_MOD_IDS: readonly string[] = Object.freeze([
  'minecraft',
  'java',
  'fabricloader',
  'fabric-api',
  MSM_RUNTIME_MOD_ID,
]);

/**
 * The codes this exporter reports, kept under their earlier name.
 *
 * @deprecated Use the same entries of `ExportProblemCodes`.
 */
export const FabricContentJarProblemCodes = {
  noFabricTarget: ExportProblemCodes.noFabricTarget,
  runtimeMissing: ExportProblemCodes.runtimeMissing,
  geckolibMissing: ExportProblemCodes.geckolibMissing,
  noGeckolibTarget: ExportProblemCodes.noGeckolibTarget,
  invalidModJson: ExportProblemCodes.invalidModJson,
  outsideJarFolders: ExportProblemCodes.outsideJarFolders,
} as const;

/** Factory options of {@link createFabricContentJarExporter}. */
export interface FabricContentJarOptions {
  /**
   * Returns the `msm_runtime` jar's bytes, or `undefined` when the host has none (a
   * development build without `engine-mod/build/libs/`). Called only when the runtime is
   * nested. A throw counts as missing.
   */
  loadRuntimeJar?: () => Promise<Uint8Array | undefined>;
  /**
   * The runtime's version, used in the nested file name and the `msm_runtime` dependency.
   * Defaults to `ExporterInput.meta.msmVersion`: the runtime carries the app's version
   * (ADR 0026 D4).
   */
  runtimeVersion?: string;
  /**
   * Returns the GeckoLib jar's bytes (`Target.geckolib.fileName`), or `undefined` when the
   * host has none (not downloaded yet and offline). Called only when the project's entities
   * need GeckoLib ({@link needsGeckolib}) and the runtime is nested. A throw counts as missing.
   */
  loadGeckolibJar?: () => Promise<Uint8Array | undefined>;
  /**
   * Transpiles one script (an `msm`-layer file with `language: 'typescript'`, ADR 0031 D5)
   * to the ES5 CommonJS JavaScript the runtime's Rhino runs. Returns the JavaScript, or the
   * problems that stopped it (syntax errors). Called once per script, in path order; `name`
   * is the script's path in the jar. Without it, a project with scripts reports
   * `export.transpiler-missing` and writes nothing. Since Phase 6.
   */
  transpileScript?: (source: string, name: string) => Promise<ScriptTranspileResult>;
}

/** What {@link FabricContentJarOptions.transpileScript} returns. */
export type ScriptTranspileResult = { js: string } | { problems: Problem[] };

/** Whether a lowered file is a script the content jar transpiles. */
export function isScriptFile(file: OutputFile): boolean {
  return file.layer === 'msm' && file.language === 'typescript';
}

/** The jar path of a transpiled script: the script's path with `.js` for `.ts`. */
export function transpiledScriptPath(path: string): string {
  return path.endsWith('.ts') ? `${path.slice(0, -'.ts'.length)}.js` : `${path}.js`;
}

/**
 * Transpiles every script; returns the `.js` files, or `undefined` after reporting why the
 * export must stop.
 */
async function transpileScripts(
  scripts: readonly OutputFile[],
  transpile: FabricContentJarOptions['transpileScript'],
  problems: ExporterInput['problems'],
): Promise<OutputFile[] | undefined> {
  if (scripts.length === 0) return [];
  if (transpile === undefined) {
    problems.report({
      severity: 'error',
      code: ExportProblemCodes.transpilerMissing,
      message: `The project has ${scripts.length} script(s), but this host cannot transpile scripts, so no mod jar was built.`,
    });
    return undefined;
  }
  const out: OutputFile[] = [];
  let failed = false;
  for (const script of [...scripts].sort((a, b) => comparePaths(a.path, b.path))) {
    const source = utf8.decode(outputFileBytes(script));
    let result: ScriptTranspileResult;
    try {
      result = await transpile(source, script.path);
    } catch (error) {
      problems.report({
        severity: 'error',
        code: ExportProblemCodes.scriptTranspileFailed,
        file: script.path,
        message: `${script.path} could not be transpiled: ${error instanceof Error ? error.message : String(error)}`,
      });
      failed = true;
      continue;
    }
    if ('problems' in result) {
      for (const problem of result.problems) {
        problems.report({ ...problem, file: problem.file ?? script.path });
      }
      if (!result.problems.some((problem) => problem.severity === 'error')) {
        problems.report({
          severity: 'error',
          code: ExportProblemCodes.scriptTranspileFailed,
          file: script.path,
          message: `${script.path} could not be transpiled.`,
        });
      }
      failed = true;
      continue;
    }
    out.push({
      path: transpiledScriptPath(script.path),
      contents: utf8.encode(result.js),
      layer: 'msm',
    });
  }
  return failed ? undefined : out;
}

/**
 * A Fabric mod id derived from free text: lower case, runs of other characters become `_`,
 * leading characters that are not letters are dropped, cut to 64 characters, and a reserved
 * id ({@link RESERVED_MOD_IDS}) gains a `mod_` prefix. Returns `undefined` when nothing valid
 * remains.
 *
 * @param value - A project name or namespace.
 */
export function sanitiseModId(value: string): string | undefined {
  let id = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/[_-]+$/, '')
    .slice(0, 64);
  if (RESERVED_MOD_IDS.includes(id)) id = `mod_${id}`;
  return FABRIC_MOD_ID_PATTERN.test(id) ? id : undefined;
}

/** The namespace of the first `assets/`, `data/` or `msm/` file, used as a mod id fallback. */
function firstNamespace(files: readonly OutputFile[]): string | undefined {
  for (const file of files) {
    const match = /^(?:assets|data|msm)\/([^/]+)\//.exec(file.path);
    if (match?.[1] !== undefined && match[1] !== 'minecraft') return match[1];
  }
  return undefined;
}

/** The nested runtime jar's path: `META-INF/jars/msm_runtime-<version>.jar`. */
export function nestedRuntimePath(version: string): string {
  return `${NESTED_JARS_FOLDER}${MSM_RUNTIME_MOD_ID}-${version}.jar`;
}

/** The renderer an entity asks for (`msm:animated_model.renderer`, ADR 0072 D4). */
export type EntityRendererChoice = 'auto' | 'geckolib' | 'vanilla';

/** One entity definition of the lowered files and the renderer it asks for. */
export interface EntityRendererEntry {
  /** The definition's path, `msm/<ns>/entity/<path>.json`. */
  path: string;
  /** The entity id, `<ns>:<path>`. */
  id: string;
  /** The renderer; `auto` when the field is absent or not one of the three values. */
  renderer: EntityRendererChoice;
}

/** The parsed JSON of a lowered file; `undefined` when its bytes are not JSON. */
function fileJson(file: OutputFile): Json | undefined {
  if (!(file.contents instanceof Uint8Array)) return file.contents;
  try {
    return JSON.parse(utf8.decode(file.contents)) as Json;
  } catch {
    return undefined;
  }
}

/** The renderer field of an entity definition, `auto` when absent or unknown. */
function rendererOf(definition: Json | undefined): EntityRendererChoice {
  if (!isObject(definition) || !isObject(definition.components)) return 'auto';
  const model = definition.components['msm:animated_model'];
  if (!isObject(model)) return 'auto';
  const renderer = model.renderer;
  return renderer === 'geckolib' || renderer === 'vanilla' ? renderer : 'auto';
}

/**
 * Every entity definition among the lowered files (`msm`-layer files under
 * `msm/<ns>/entity/`) with the renderer it asks for, in path order.
 *
 * @param files - The lowered files.
 */
export function entityRenderers(files: readonly OutputFile[]): EntityRendererEntry[] {
  const entries: EntityRendererEntry[] = [];
  for (const file of files) {
    if (file.layer !== 'msm') continue;
    const match = ENTITY_DEFINITION_PATTERN.exec(file.path);
    if (match === null) continue;
    const rest = file.path.slice(match[0].length).replace(/\.json$/, '');
    entries.push({
      path: file.path,
      id: `${match[1]}:${rest}`,
      renderer: rendererOf(fileJson(file)),
    });
  }
  return entries.sort((a, b) => comparePaths(a.path, b.path));
}

/**
 * Whether the files need GeckoLib on `target` (ADR 0072 D5): true when an entity definition
 * asks for the `geckolib` renderer, or for `auto` (the default) and the target has GeckoLib
 * facts. A project whose entities are all `vanilla`, or one exported for a target without
 * GeckoLib whose entities are `auto`, does not.
 *
 * @param files - The lowered files.
 * @param target - The export target; only its GeckoLib facts are read.
 */
export function needsGeckolib(
  files: readonly OutputFile[],
  target: { readonly geckolib?: GeckolibFacts | undefined },
): boolean {
  return entityRenderers(files).some(
    (entry) =>
      entry.renderer === 'geckolib' || (entry.renderer === 'auto' && target.geckolib !== undefined),
  );
}

/** The nested GeckoLib jar's path: `META-INF/jars/<fileName>`. */
export function nestedGeckolibPath(geckolib: GeckolibFacts): string {
  return `${NESTED_JARS_FOLDER}${geckolib.fileName}`;
}

/** The `depends` block of ADR 0026 D2. */
function dependencies(fabric: FabricFacts, runtimeVersion: string): JsonObject {
  return {
    'fabric-api': '*',
    fabricloader: `>=${fabric.loader}`,
    minecraft: fabric.minecraftDependency,
    [MSM_RUNTIME_MOD_ID]: `>=${runtimeVersion}`,
  };
}

/**
 * The `fabric.mod.json` written when the project has no `msm:mod` element (ADR 0025 D6):
 * mod id from the project name (or the first namespace, or `msm_mod`), version
 * {@link DEFAULT_MOD_VERSION}, no entrypoints.
 *
 * @param input - The project name, the files (for the namespace fallback) and the facts.
 */
export function defaultFabricModJson(input: {
  projectName: string;
  files: readonly OutputFile[];
  fabric: FabricFacts;
  runtimeVersion: string;
}): JsonObject {
  const namespace = firstNamespace(input.files);
  const id =
    sanitiseModId(input.projectName) ??
    (namespace === undefined ? undefined : sanitiseModId(namespace)) ??
    'msm_mod';
  return {
    depends: dependencies(input.fabric, input.runtimeVersion),
    environment: '*',
    id,
    name: input.projectName.trim() === '' ? id : input.projectName,
    schemaVersion: 1,
    version: DEFAULT_MOD_VERSION,
  };
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses a lowered `fabric.mod.json`; `undefined` when it is not a JSON object. */
function modJsonContents(file: OutputFile): JsonObject | undefined {
  let value: Json;
  if (file.contents instanceof Uint8Array) {
    try {
      value = JSON.parse(utf8.decode(file.contents)) as Json;
    } catch {
      return undefined;
    }
  } else {
    value = file.contents;
  }
  return isObject(value) ? value : undefined;
}

/**
 * Applies the runtime choice to a `fabric.mod.json`: adds the `msm_runtime` dependency when
 * absent, removes any earlier `msm_runtime` entry from `jars`, and adds the nested runtime
 * entry when nesting. `jars` is dropped when it ends up empty.
 */
function withRuntime(
  modJson: JsonObject,
  runtimeVersion: string,
  nestedPath: string | undefined,
): JsonObject {
  const result: JsonObject = { ...modJson };
  const depends: JsonObject = isObject(result.depends) ? { ...result.depends } : {};
  if (!Object.hasOwn(depends, MSM_RUNTIME_MOD_ID)) {
    depends[MSM_RUNTIME_MOD_ID] = `>=${runtimeVersion}`;
  }
  result.depends = depends;
  const runtimePrefix = `${NESTED_JARS_FOLDER}${MSM_RUNTIME_MOD_ID}-`;
  const jars = (Array.isArray(result.jars) ? result.jars : []).filter(
    (entry) => !(isObject(entry) && String(entry.file).startsWith(runtimePrefix)),
  );
  if (nestedPath !== undefined) jars.push({ file: nestedPath });
  if (jars.length > 0) result.jars = jars;
  else delete result.jars;
  return result;
}

/**
 * Applies the GeckoLib choice to a `fabric.mod.json`: adds the GeckoLib dependency when
 * absent, removes any earlier entry for the same nested file from `jars`, and adds the nested
 * GeckoLib entry when nesting. `jars` is dropped when it ends up empty.
 */
function withGeckolib(
  modJson: JsonObject,
  geckolib: GeckolibFacts,
  nestedPath: string | undefined,
): JsonObject {
  const result: JsonObject = { ...modJson };
  const depends: JsonObject = isObject(result.depends) ? { ...result.depends } : {};
  if (!Object.hasOwn(depends, geckolib.modId)) depends[geckolib.modId] = geckolib.dependency;
  result.depends = depends;
  const path = nestedGeckolibPath(geckolib);
  const jars = (Array.isArray(result.jars) ? result.jars : []).filter(
    (entry) => !(isObject(entry) && entry.file === path),
  );
  if (nestedPath !== undefined) jars.push({ file: nestedPath });
  if (jars.length > 0) result.jars = jars;
  else delete result.jars;
  return result;
}

/** Where a file lands in the jar, or why it is left out. */
function placement(file: OutputFile): 'jar' | 'reserved' | 'outside' {
  if (file.path === EXPORT_MANIFEST_FILE || file.path.startsWith(NESTED_JARS_FOLDER)) {
    return 'reserved';
  }
  if (file.layer === 'msm') return file.path === FABRIC_MOD_JSON_FILE ? 'reserved' : 'jar';
  const prefix = file.layer === 'resourcepack' ? 'assets/' : 'data/';
  return file.path.startsWith(prefix) ? 'jar' : 'outside';
}

async function loadGeckolib(
  load: FabricContentJarOptions['loadGeckolibJar'],
): Promise<Uint8Array | undefined> {
  if (load === undefined) return undefined;
  try {
    const bytes = await load();
    return bytes === undefined || bytes.length === 0 ? undefined : bytes;
  } catch {
    return undefined;
  }
}

async function loadRuntime(
  load: FabricContentJarOptions['loadRuntimeJar'],
): Promise<{ bytes: Uint8Array } | { reason: string }> {
  if (load === undefined) return { reason: 'the host supplies no runtime jar' };
  try {
    const bytes = await load();
    return bytes === undefined || bytes.length === 0
      ? { reason: 'the runtime jar was not found' }
      : { bytes };
  } catch (error) {
    return {
      reason: `the runtime jar could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Builds the `fabric-content-jar` exporter (layers `resourcepack`, `datapack`, `msm`).
 *
 * It writes resource-layer files under `assets/`, data-layer files under `data/` (other
 * paths of those layers, such as `pack.mcmeta`, are left out with an
 * `export.outside-jar-folders` info), every `msm`-layer file at its path,
 * `fabric.mod.json` (the layer-`msm` file when present, otherwise
 * {@link defaultFabricModJson}), the nested runtime jar unless `separateRuntime` is set,
 * and `msm.export.json` last. Without `Target.fabric` it reports `export.no-fabric-target`;
 * when nesting without runtime bytes, `export.runtime-missing`; both write nothing.
 *
 * When the project's entities need GeckoLib ({@link needsGeckolib}: a `geckolib` renderer, or
 * `auto` on a target with GeckoLib facts; ADR 0072 D5), `fabric.mod.json` also depends on
 * GeckoLib (`Target.geckolib`) and, unless `separateRuntime` is set, the GeckoLib jar is
 * nested as `META-INF/jars/<fileName>`; when nesting without GeckoLib bytes it reports
 * `export.geckolib-missing` and writes nothing. On a target without `Target.geckolib`, each
 * `auto` entity gives an `export.entity-vanilla-renderer` info and the jar is built without
 * GeckoLib, while each `geckolib` entity gives `export.no-geckolib-target` and nothing is
 * written. Projects without entities, or whose entities are all `vanilla`, are unaffected.
 *
 * Scripts (`msm`-layer files with `language: 'typescript'`) are transpiled with the factory's
 * `transpileScript` and written as `.js` at the same path; the `.ts` is not written. Without
 * a transpiler: `export.transpiler-missing`; a failed transpile reports its problems with the
 * script's path; both write nothing. Jars with scripts depend on `msm_runtime` at
 * `runtimeVersion` or {@link SCRIPT_RUNTIME_MINIMUM}, whichever is later (ADR 0032 D4).
 *
 * @param options - Where the runtime and GeckoLib jars come from, and the runtime version.
 */
export function createFabricContentJarExporter(options: FabricContentJarOptions = {}): Exporter {
  return {
    id: FABRIC_CONTENT_JAR_EXPORTER_ID,
    displayName: 'Fabric mod jar',
    layers: ['resourcepack', 'datapack', 'msm'],
    options: [
      {
        id: SEPARATE_RUNTIME_OPTION,
        label: 'Separate runtime and GeckoLib (for modpacks)',
        description:
          'Leave msm_runtime and GeckoLib out of the jar. The modpack must then include both itself.',
        type: 'boolean',
        default: false,
      },
    ],
    async run(input: ExporterInput) {
      const fabric = input.target.fabric;
      if (fabric === undefined) {
        input.problems.report({
          severity: 'error',
          code: ExportProblemCodes.noFabricTarget,
          message: `Target ${input.target.id} has no Fabric versions, so no mod jar can be built for it.`,
        });
        return;
      }
      // Scripts first: a syntax error stops the export before any jar is read.
      const transpiled = await transpileScripts(
        input.files.filter(isScriptFile),
        options.transpileScript,
        input.problems,
      );
      if (transpiled === undefined) return;

      const runtimeVersion = options.runtimeVersion ?? input.meta.msmVersion;
      // The `msm_runtime` floor in `depends`: scripts need SCRIPT_RUNTIME_MINIMUM or later.
      const dependsVersion =
        transpiled.length > 0
          ? laterVersion(runtimeVersion, SCRIPT_RUNTIME_MINIMUM)
          : runtimeVersion;
      const nest = input.options[SEPARATE_RUNTIME_OPTION] !== true;
      if (input.target.geckolib === undefined) {
        // ADR 0072 D5: `auto` entities fall back to the vanilla renderer; `geckolib` ones stop.
        let blocked = false;
        for (const entry of entityRenderers(input.files)) {
          if (entry.renderer === 'auto') {
            input.problems.report({
              severity: 'info',
              code: ExportProblemCodes.entityVanillaRenderer,
              file: entry.path,
              message: `Target ${input.target.id} has no GeckoLib version, so entity ${entry.id} is exported without GeckoLib and drawn by the runtime's vanilla renderer (Molang, easings and sound or particle keyframes do not play).`,
            });
          } else if (entry.renderer === 'geckolib') {
            blocked = true;
            input.problems.report({
              severity: 'error',
              code: ExportProblemCodes.noGeckolibTarget,
              file: entry.path,
              message: `Target ${input.target.id} has no GeckoLib version, so a mod jar with entity ${entry.id} (renderer "geckolib") cannot be built for it. Choose the renderer "auto" or "vanilla", or target a version with GeckoLib.`,
            });
          }
        }
        if (blocked) return;
      }
      const geckolib = needsGeckolib(input.files, input.target) ? input.target.geckolib : undefined;

      let runtimeBytes: Uint8Array | undefined;
      if (nest) {
        const runtime = await loadRuntime(options.loadRuntimeJar);
        if ('reason' in runtime) {
          input.problems.report({
            severity: 'error',
            code: ExportProblemCodes.runtimeMissing,
            message: `The msm_runtime jar cannot be nested: ${runtime.reason}. Build the runtime, or choose "Separate runtime and GeckoLib (for modpacks)".`,
          });
          return;
        }
        runtimeBytes = runtime.bytes;
      }

      let geckolibBytes: Uint8Array | undefined;
      if (nest && geckolib !== undefined) {
        geckolibBytes = await loadGeckolib(options.loadGeckolibJar);
        if (geckolibBytes === undefined) {
          input.problems.report({
            severity: 'error',
            code: ExportProblemCodes.geckolibMissing,
            message: `GeckoLib ${geckolib.version} is needed for animated entities; connect to the internet once so MCSuperMods can download it.`,
          });
          return;
        }
      }

      const files: OutputFile[] = [];
      let provided: OutputFile | undefined;
      let outside = 0;
      for (const file of input.files) {
        if (file.layer === 'msm' && file.path === FABRIC_MOD_JSON_FILE) {
          provided = file;
          continue;
        }
        if (isScriptFile(file)) continue; // replaced by its transpiled .js below
        const where = placement(file);
        if (where === 'reserved') {
          input.problems.report({
            severity: 'error',
            code: ExportProblemCodes.reservedPath,
            file: file.path,
            message: `${file.path} is written by the exporter; the ${file.layer} file at that path was not exported.`,
          });
          continue;
        }
        if (where === 'outside') {
          outside++;
          continue;
        }
        files.push(file);
      }
      files.push(...transpiled);
      if (outside > 0) {
        input.problems.report({
          severity: 'info',
          code: ExportProblemCodes.outsideJarFolders,
          message: `${outside} resource or data pack file(s) outside assets/ and data/ (such as pack.mcmeta) are not needed in a mod jar and were left out.`,
        });
      }

      let modJson: JsonObject;
      if (provided === undefined) {
        modJson = defaultFabricModJson({
          projectName: input.projectName,
          files: input.files,
          fabric,
          runtimeVersion: dependsVersion,
        });
      } else {
        const parsed = modJsonContents(provided);
        if (parsed === undefined) {
          input.problems.report({
            severity: 'error',
            code: ExportProblemCodes.invalidModJson,
            file: FABRIC_MOD_JSON_FILE,
            message: `${FABRIC_MOD_JSON_FILE} from the msm:mod element is not a JSON object.`,
          });
          return;
        }
        modJson = parsed;
      }
      const nestedPath = nest ? nestedRuntimePath(runtimeVersion) : undefined;
      let finalModJson = withRuntime(modJson, dependsVersion, nestedPath);
      const geckolibPath =
        geckolib !== undefined && geckolibBytes !== undefined
          ? nestedGeckolibPath(geckolib)
          : undefined;
      if (geckolib !== undefined) {
        finalModJson = withGeckolib(finalModJson, geckolib, geckolibPath);
      }
      files.push({ path: FABRIC_MOD_JSON_FILE, contents: finalModJson, layer: 'msm' });

      const conflicts = new Set<string>();
      const seen = new Set<string>();
      for (const file of files) {
        if (seen.has(file.path)) conflicts.add(file.path);
        seen.add(file.path);
      }
      if (conflicts.size > 0) {
        for (const path of [...conflicts].sort(comparePaths)) {
          input.problems.report({
            severity: 'error',
            code: ExportProblemCodes.conflict,
            file: path,
            message: `Two layers write ${path}; a mod jar can hold only one file at that path.`,
          });
        }
        return;
      }

      files.sort((a, b) => comparePaths(a.path, b.path));
      const entries: { path: string; data: Uint8Array }[] = files.map((file) => ({
        path: file.path,
        data: outputFileBytes(file),
      }));
      if (nestedPath !== undefined && runtimeBytes !== undefined) {
        entries.push({ path: nestedPath, data: runtimeBytes });
      }
      if (geckolibPath !== undefined && geckolibBytes !== undefined) {
        entries.push({ path: geckolibPath, data: geckolibBytes });
      }
      entries.sort((a, b) => comparePaths(a.path, b.path));
      for (const entry of entries) await input.sink.writeFile(entry.path, entry.data);

      const manifest = exportManifest({
        target: input.target,
        meta: input.meta,
        exporterId: FABRIC_CONTENT_JAR_EXPORTER_ID,
        fileCount: entries.length,
      });
      await input.sink.writeFile(
        EXPORT_MANIFEST_FILE,
        outputFileBytes({ path: EXPORT_MANIFEST_FILE, contents: manifest, layer: 'msm' }),
      );
    },
  };
}

/**
 * The content jar file name: `<mod id>.jar` (ADR 0026 D5 identifies the installed copy by
 * this name).
 *
 * @param modId - The mod id written into `fabric.mod.json`.
 */
export function contentJarFileName(modId: string): string {
  return `${modId}.jar`;
}
