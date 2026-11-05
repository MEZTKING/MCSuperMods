/**
 * The `fabric-content-jar` exporter (ADR 0026): one Fabric mod jar holding the project's
 * `assets/`, `data/` and `msm/` files, `fabric.mod.json` and, by default, the `msm_runtime`
 * jar nested under `META-INF/jars/`. A project with entities also depends on GeckoLib and, by
 * default, nests its jar (ADR 0029 D4).
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

/** Entity definitions: `msm/<ns>/entity/...`. Their presence makes the jar need GeckoLib. */
const ENTITY_DEFINITION_PATTERN = /^msm\/[^/]+\/entity\//;

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
   * host has none (not downloaded yet and offline). Called only when the project has entities
   * and the runtime is nested. A throw counts as missing.
   */
  loadGeckolibJar?: () => Promise<Uint8Array | undefined>;
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

/**
 * Whether the files need GeckoLib: true when any `msm`-layer file is an entity definition
 * (`msm/<ns>/entity/...`).
 *
 * @param files - The lowered files.
 */
export function needsGeckolib(files: readonly OutputFile[]): boolean {
  return files.some((file) => file.layer === 'msm' && ENTITY_DEFINITION_PATTERN.test(file.path));
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
 * When the project has entities ({@link needsGeckolib}), `fabric.mod.json` also depends on
 * GeckoLib (`Target.geckolib`) and, unless `separateRuntime` is set, the GeckoLib jar is
 * nested as `META-INF/jars/<fileName>`. Without `Target.geckolib` it reports
 * `export.no-geckolib-target`; when nesting without GeckoLib bytes,
 * `export.geckolib-missing`; both write nothing. Projects without entities are unaffected.
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
      const runtimeVersion = options.runtimeVersion ?? input.meta.msmVersion;
      const nest = input.options[SEPARATE_RUNTIME_OPTION] !== true;
      const entities = needsGeckolib(input.files);
      const geckolib = entities ? input.target.geckolib : undefined;
      if (entities && geckolib === undefined) {
        input.problems.report({
          severity: 'error',
          code: ExportProblemCodes.noGeckolibTarget,
          message: `Target ${input.target.id} has no GeckoLib version, so a mod jar with animated entities cannot be built for it.`,
        });
        return;
      }

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
          runtimeVersion,
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
      let finalModJson = withRuntime(modJson, runtimeVersion, nestedPath);
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
