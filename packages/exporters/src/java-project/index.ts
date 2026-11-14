/**
 * The `java-project` exporter (ADR 0033): ejects a project as a conventional Fabric Gradle
 * project with generated Java that does what `msm_runtime` would do, with no dependency on
 * the runtime. One-way: the generated README says edits do not flow back.
 *
 * This module is version-free. It reads the definitions from the `msm` layer, writes the
 * Gradle files, README, licence notes, wrapper, `fabric.mod.json`, the copied `assets/` and
 * `data/` files and the manifest, and calls the target's `javaProject` generator for the Java
 * sources. Scripts are not ejected (`export.scripts-not-ejected`).
 *
 * @packageDocumentation
 */

import { utf8 } from '@msm/core';
import type {
  DefinitionInput,
  Exporter,
  ExporterInput,
  GeneratedFile,
  Json,
  JsonObject,
  OutputFile,
} from '@msm/plugin-api';
import { outputFileBytes } from '../contents';
import {
  defaultFabricModJson,
  FABRIC_MOD_JSON_FILE,
  MSM_RUNTIME_MOD_ID,
} from '../fabric-content-jar/index';
import { EXPORT_MANIFEST_FILE, exportManifest } from '../manifest';
import { ExportProblemCodes } from '../problem-codes';
import { comparePaths } from '../zip';
import {
  buildGradle,
  gitignore,
  gradleProperties,
  licenceNotes,
  type ProjectFacts,
  readme,
  settingsGradle,
  wrapperProperties,
} from './files';

/** The exporter's id. */
export const JAVA_PROJECT_EXPORTER_ID = 'java-project';

/** The Gradle wrapper files the host serves (ADR 0033 D2). */
export interface GradleWrapper {
  /** `gradle/wrapper/gradle-wrapper.jar`. */
  jar: Uint8Array;
  /** The `gradlew` shell script. */
  gradlew: string;
  /** The `gradlew.bat` script. */
  gradlewBat: string;
}

/** Factory options of {@link createJavaProjectExporter}. */
export interface JavaProjectOptions {
  /**
   * Returns the Gradle wrapper (from `engine-mod/gradle/wrapper/` in development, from the
   * packaged runtime resources in a release), or `undefined` when the host has none; the
   * project is then written without it and `export.gradle-wrapper-missing` (info) is
   * reported. A throw counts as missing.
   */
  loadGradleWrapper?: () => Promise<GradleWrapper | undefined>;
}

/** Where `fabric.mod.json` goes in the ejected project. */
export const JAVA_PROJECT_MOD_JSON = `src/main/resources/${FABRIC_MOD_JSON_FILE}`;

/** The version placeholder Loom's `processResources` expands in `fabric.mod.json`. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: Gradle's placeholder, not a template
const VERSION_PLACEHOLDER = '${version}';

const DEFINITION_PATTERN = /^msm\/([^/]+)\/([^/]+)\/(.+)\.json$/;
const SOUNDS_JSON_PATTERN = /^assets\/([^/]+)\/sounds\.json$/;
const SOUND_KEY_PATTERN = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/;
const SCRIPT_PATTERN = /^msm\/([^/]+)\/script\/(.+)\.ts$/;

const JAVA_KEYWORDS = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'exports',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'module',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'requires',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'var',
  'void',
  'volatile',
  'while',
  'yield',
  'record',
  'sealed',
  'permits',
  '_',
]);

/**
 * The Java package of an ejected mod (ADR 0033 D2): the mod id with `-` (and any other
 * character a Java identifier cannot hold) as `_`, prefixed `mod_` when it starts with a
 * digit or is a Java keyword.
 *
 * @param modId - The mod id from `fabric.mod.json`.
 */
export function javaPackageFor(modId: string): string {
  let name = modId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (name === '') name = 'mod';
  if (/^[0-9]/.test(name) || JAVA_KEYWORDS.has(name)) name = `mod_${name}`;
  return name;
}

/**
 * The mod initialiser's class name: the mod id's words capitalised, with `Mod` appended
 * unless the name already ends with it (`msm_sample_mod` is `MsmSampleMod`, `ruby` is
 * `RubyMod`); a leading digit gains a `Mod` prefix.
 *
 * @param modId - The mod id from `fabric.mod.json`.
 */
export function modClassNameFor(modId: string): string {
  let name = modId
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  if (name === '' || /^[0-9]/.test(name)) name = `Mod${name}`;
  return name.endsWith('Mod') ? name : `${name}Mod`;
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonOf(file: OutputFile): Json | undefined {
  if (!(file.contents instanceof Uint8Array)) return file.contents;
  try {
    return JSON.parse(utf8.decode(file.contents)) as Json;
  } catch {
    return undefined;
  }
}

/** JSON with sorted keys, two-space indent, LF, a trailing newline, and `$` as `$`. */
function modJsonText(value: JsonObject): string {
  const sort = (json: Json): Json => {
    if (Array.isArray(json)) return json.map(sort);
    if (isObject(json)) {
      const out: JsonObject = {};
      for (const key of Object.keys(json).sort()) out[key] = sort(json[key] as Json);
      return out;
    }
    return json;
  };
  // Gradle's expand() treats every "$" as a template; escape them so only the version expands.
  const text = JSON.stringify(sort(value), null, 2).replaceAll('$', '\\u0024');
  const escaped = JSON.stringify(VERSION_PLACEHOLDER).replaceAll('$', '\\u0024');
  return `${text.replace(escaped, () => JSON.stringify(VERSION_PLACEHOLDER))}\n`;
}

/** A definition without its `run_script` actions; the dropped ones as `[event, handler]`. */
function withoutScripts(definition: JsonObject): {
  definition: JsonObject;
  dropped: [string, string][];
} {
  const events = definition.events;
  if (!isObject(events)) return { definition, dropped: [] };
  const dropped: [string, string][] = [];
  const kept: JsonObject = {};
  for (const id of Object.keys(events).sort()) {
    const event = events[id];
    if (!isObject(event) || !Array.isArray(event.actions)) {
      kept[id] = event as Json;
      continue;
    }
    const actions = event.actions.filter((action) => {
      if (isObject(action) && action.type === 'run_script') {
        dropped.push([id, typeof action.handler === 'string' ? action.handler : '?']);
        return false;
      }
      return true;
    });
    kept[id] = { ...event, actions };
  }
  return {
    definition: dropped.length === 0 ? definition : { ...definition, events: kept },
    dropped,
  };
}

/**
 * The sound event keys of every `assets/<ns>/sounds.json` in the resources, namespaced,
 * sorted, without `minecraft` (ADR 0057 D5). A file that is not a JSON object, and a key that
 * is not a valid sound id, is reported as a warning and skipped.
 */
function collectSoundEvents(
  resources: OutputFile[],
  problems: ExporterInput['problems'],
): string[] {
  const events = new Set<string>();
  for (const file of resources) {
    const match = SOUNDS_JSON_PATTERN.exec(file.path);
    if (match === null || file.layer !== 'resourcepack') continue;
    const namespace = match[1] as string;
    const json = jsonOf(file);
    if (!isObject(json)) {
      problems.report({
        severity: 'warning',
        code: ExportProblemCodes.javaGenerationFailed,
        file: file.path,
        message: `${file.path} is not a JSON object, so its sound events are not registered in the Java project.`,
      });
      continue;
    }
    if (namespace === 'minecraft') continue;
    for (const key of Object.keys(json)) {
      if (!/^[a-z0-9_.-]+$/.test(namespace) || !SOUND_KEY_PATTERN.test(key)) {
        problems.report({
          severity: 'warning',
          code: ExportProblemCodes.javaGenerationFailed,
          file: file.path,
          message: `${file.path}: "${namespace}:${key}" is not a valid sound id and is not registered in the Java project.`,
        });
        continue;
      }
      events.add(`${namespace}:${key}`);
    }
  }
  return [...events].sort(comparePaths);
}

async function loadWrapper(
  load: JavaProjectOptions['loadGradleWrapper'],
): Promise<GradleWrapper | undefined> {
  if (load === undefined) return undefined;
  try {
    const wrapper = await load();
    return wrapper === undefined || wrapper.jar.length === 0 ? undefined : wrapper;
  } catch {
    return undefined;
  }
}

/**
 * Builds the `java-project` exporter ("Fabric Java project (eject)", layers `resourcepack`,
 * `datapack` and `msm`, no options). The host writes into an empty folder named after the
 * mod id through a folder sink.
 *
 * Problems: `export.no-fabric-target` and `export.no-java-project-target` when the target
 * lacks Fabric facts or a generator, `export.no-geckolib-target` for entities without
 * GeckoLib facts, `export.invalid-mod-json`, `export.java-generation-failed` when the
 * generator throws (all write nothing); `export.scripts-not-ejected` (warning) per script
 * and per definition event with `run_script` actions; `export.java-generation-failed` is also a
 * warning for a malformed `assets/<ns>/sounds.json` or an invalid key (skipped; ADR 0057 D5); `export.gradle-wrapper-missing` (info);
 * `export.outside-jar-folders` (info) for pack files outside `assets/` and `data/`.
 *
 * @param options - Where the Gradle wrapper comes from.
 */
export function createJavaProjectExporter(options: JavaProjectOptions = {}): Exporter {
  return {
    id: JAVA_PROJECT_EXPORTER_ID,
    displayName: 'Fabric Java project (eject)',
    layers: ['resourcepack', 'datapack', 'msm'],
    async run(input: ExporterInput) {
      const { target, problems } = input;
      const fabric = target.fabric;
      if (fabric === undefined) {
        problems.report({
          severity: 'error',
          code: ExportProblemCodes.noFabricTarget,
          message: `Target ${target.id} has no Fabric versions, so no Java project can be generated for it.`,
        });
        return;
      }
      const generator = target.javaProject;
      if (generator === undefined) {
        problems.report({
          severity: 'error',
          code: ExportProblemCodes.noJavaProjectTarget,
          message: `Target ${target.id} has no Java generator, so the project cannot be exported as a Java project for it.`,
        });
        return;
      }

      const blocks: DefinitionInput[] = [];
      const items: DefinitionInput[] = [];
      const entities: DefinitionInput[] = [];
      const effects: DefinitionInput[] = [];
      const potions: DefinitionInput[] = [];
      const biomeAdditions: DefinitionInput[] = [];
      const lootAdditions: DefinitionInput[] = [];
      const scripts: string[] = [];
      const resources: OutputFile[] = [];
      let provided: OutputFile | undefined;
      let outside = 0;
      const sorted = [...input.files].sort((a, b) => comparePaths(a.path, b.path));
      for (const file of sorted) {
        if (file.layer !== 'msm') {
          const prefix = file.layer === 'resourcepack' ? 'assets/' : 'data/';
          if (file.path.startsWith(prefix)) resources.push(file);
          else outside++;
          continue;
        }
        if (file.path === FABRIC_MOD_JSON_FILE) {
          provided = file;
          continue;
        }
        const script = SCRIPT_PATTERN.exec(file.path);
        if (script !== null || file.language === 'typescript') {
          const id = script === null ? file.path : `${script[1]}:${script[2]}`;
          scripts.push(id);
          problems.report({
            severity: 'warning',
            code: ExportProblemCodes.scriptsNotEjected,
            file: file.path,
            message: `Script ${id} is not ejected; the Java project does without it (see its README).`,
          });
          continue;
        }
        const match = DEFINITION_PATTERN.exec(file.path);
        if (match === null) continue;
        const kind = match[2];
        if (
          kind !== 'block' &&
          kind !== 'item' &&
          kind !== 'entity' &&
          kind !== 'effect' &&
          kind !== 'potion' &&
          kind !== 'biome_addition' &&
          kind !== 'loot_addition'
        ) {
          problems.report({
            severity: 'warning',
            code: ExportProblemCodes.javaGenerationFailed,
            file: file.path,
            message: `${file.path} is in the unknown definition folder msm/${match[1]}/${kind}/, so no Java is generated for it.`,
          });
          continue;
        }
        const json = jsonOf(file);
        if (!isObject(json)) {
          problems.report({
            severity: 'error',
            code: ExportProblemCodes.javaGenerationFailed,
            file: file.path,
            message: `${file.path} is not a JSON object, so no Java can be generated for it.`,
          });
          return;
        }
        const { definition, dropped } = withoutScripts(json);
        for (const [event, handler] of dropped) {
          problems.report({
            severity: 'warning',
            code: ExportProblemCodes.scriptsNotEjected,
            file: file.path,
            message: `${file.path}: event ${event} runs script handler ${handler}; run_script actions are not ejected and were left out.`,
          });
        }
        const entry: DefinitionInput = {
          id: `${match[1]}:${match[3]}`,
          path: file.path,
          definition,
        };
        if (match[2] === 'block') blocks.push(entry);
        else if (match[2] === 'item') items.push(entry);
        else if (kind === 'effect') effects.push(entry);
        else if (kind === 'potion') potions.push(entry);
        else if (kind === 'biome_addition') biomeAdditions.push(entry);
        else if (kind === 'loot_addition') lootAdditions.push(entry);
        else entities.push(entry);
      }
      const soundEvents = collectSoundEvents(resources, problems);
      if (outside > 0) {
        problems.report({
          severity: 'info',
          code: ExportProblemCodes.outsideJarFolders,
          message: `${outside} resource or data pack file(s) outside assets/ and data/ (such as pack.mcmeta) are not needed in a mod and were left out.`,
        });
      }

      const geckolib = entities.length > 0 ? target.geckolib : undefined;
      if (entities.length > 0 && geckolib === undefined) {
        problems.report({
          severity: 'error',
          code: ExportProblemCodes.noGeckolibTarget,
          message: `Target ${target.id} has no GeckoLib version, so a Java project with animated entities cannot be generated for it.`,
        });
        return;
      }

      let modJson: JsonObject;
      if (provided === undefined) {
        modJson = defaultFabricModJson({
          projectName: input.projectName,
          files: input.files,
          fabric,
          runtimeVersion: input.meta.msmVersion,
        });
      } else {
        const parsed = jsonOf(provided);
        if (!isObject(parsed)) {
          problems.report({
            severity: 'error',
            code: ExportProblemCodes.invalidModJson,
            file: FABRIC_MOD_JSON_FILE,
            message: `${FABRIC_MOD_JSON_FILE} from the msm:mod element is not a JSON object.`,
          });
          return;
        }
        modJson = parsed;
      }
      const modId = typeof modJson.id === 'string' ? modJson.id : 'msm_mod';
      const modVersion = typeof modJson.version === 'string' ? modJson.version : '1.0.0';
      const javaPackage = javaPackageFor(modId);
      const modClassName = modClassNameFor(modId);

      let generated: GeneratedFile[];
      try {
        generated = generator.generate({
          modId,
          javaPackage,
          modClassName,
          blocks,
          items,
          entities,
          effects,
          soundEvents,
          ...(potions.length > 0 ? { potions } : {}),
          ...(biomeAdditions.length > 0 ? { biomeAdditions } : {}),
          ...(lootAdditions.length > 0 ? { lootAdditions } : {}),
          geckolib: geckolib !== undefined,
        });
      } catch (error) {
        problems.report({
          severity: 'error',
          code: ExportProblemCodes.javaGenerationFailed,
          message: `The Java sources could not be generated: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }

      const wrapper = await loadWrapper(options.loadGradleWrapper);
      if (wrapper === undefined) {
        problems.report({
          severity: 'info',
          code: ExportProblemCodes.gradleWrapperMissing,
          message: `The Gradle wrapper is not available, so the project was written without it; run "gradle wrapper --gradle-version ${fabric.gradle}" in the project folder once.`,
        });
      }

      // fabric.mod.json: the lowered one without msm_runtime, with the entrypoints and GeckoLib.
      const javaRoot = `src/main/java/${javaPackage.replaceAll('.', '/')}`;
      const clientClass = `${javaPackage}.client.${modClassName}Client`;
      const hasClient = generated.some(
        (file) => file.path === `${javaRoot}/client/${modClassName}Client.java`,
      );
      const depends: JsonObject = isObject(modJson.depends) ? { ...modJson.depends } : {};
      delete depends[MSM_RUNTIME_MOD_ID];
      if (geckolib !== undefined && !Object.hasOwn(depends, geckolib.modId))
        depends[geckolib.modId] = geckolib.dependency;
      const entrypoints: JsonObject = isObject(modJson.entrypoints)
        ? { ...modJson.entrypoints }
        : {};
      entrypoints.main = [`${javaPackage}.${modClassName}`];
      if (hasClient) entrypoints.client = [clientClass];
      const finalModJson: JsonObject = {
        ...modJson,
        depends,
        entrypoints,
        version: VERSION_PLACEHOLDER,
      };
      delete finalModJson.jars; // Loom writes the nested jar entries itself.

      const facts: ProjectFacts = {
        modId,
        modName:
          typeof modJson.name === 'string' && modJson.name.trim() !== '' ? modJson.name : modId,
        modVersion,
        javaPackage,
        modClassName,
        mcVersion: target.mcVersion,
        java: target.java,
        fabric,
        geckolib,
        msmVersion: input.meta.msmVersion,
        scripts,
        wrapper: wrapper !== undefined,
      };

      const out = new Map<string, Uint8Array>();
      const conflicts = new Set<string>();
      const put = (path: string, data: Uint8Array | string): void => {
        if (out.has(path)) conflicts.add(path);
        out.set(path, typeof data === 'string' ? utf8.encode(data) : data);
      };
      put('settings.gradle.kts', settingsGradle(facts));
      put('build.gradle.kts', buildGradle(facts));
      put('gradle.properties', gradleProperties(facts));
      put('.gitignore', gitignore());
      put('README.md', readme(facts));
      put('LICENSE-NOTES.md', licenceNotes(facts));
      put('gradle/wrapper/gradle-wrapper.properties', wrapperProperties(facts));
      if (wrapper !== undefined) {
        put('gradlew', wrapper.gradlew);
        put('gradlew.bat', wrapper.gradlewBat);
        put('gradle/wrapper/gradle-wrapper.jar', wrapper.jar);
      }
      put(JAVA_PROJECT_MOD_JSON, modJsonText(finalModJson));
      for (const file of resources) put(`src/main/resources/${file.path}`, outputFileBytes(file));
      for (const file of generated) put(file.path, file.contents);
      if (out.has(EXPORT_MANIFEST_FILE)) conflicts.add(EXPORT_MANIFEST_FILE);
      if (conflicts.size > 0) {
        for (const path of [...conflicts].sort(comparePaths)) {
          problems.report({
            severity: 'error',
            code: ExportProblemCodes.conflict,
            file: path,
            message: `Two sources write ${path} in the Java project.`,
          });
        }
        return;
      }
      const manifest = exportManifest({
        target,
        meta: input.meta,
        exporterId: JAVA_PROJECT_EXPORTER_ID,
        fileCount: out.size,
      });
      out.set(
        EXPORT_MANIFEST_FILE,
        outputFileBytes({ path: EXPORT_MANIFEST_FILE, contents: manifest, layer: 'msm' }),
      );
      for (const path of [...out.keys()].sort(comparePaths)) {
        await input.sink.writeFile(path, out.get(path) as Uint8Array);
      }
    },
  };
}
