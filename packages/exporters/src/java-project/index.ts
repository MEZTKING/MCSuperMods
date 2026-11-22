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
  entityRenderers,
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

/** Definition folders the eject leaves out, with a warning each (`export.not-in-eject`). */
const NOT_IN_EJECT_KINDS: Readonly<Record<string, { label: string; reason: string }>> = {
  key_bind: { label: 'key bind', reason: "it needs the runtime's client code" },
  hud: { label: 'HUD element', reason: "it needs the runtime's client code" },
  vehicle: { label: 'vehicle', reason: "it needs the runtime's vehicle code" },
};

/**
 * The definition folders the eject passes to the generator in their own `JavaProjectInput` lists
 * (ADR 0112 D3; plugin API 1.20.0, B537), besides blocks, items and entities.
 */
const LISTED_KINDS = [
  'effect',
  'potion',
  'particle',
  'biome_addition',
  'loot_addition',
  'command',
  'creative_tab',
  'vanilla_block_rules',
  'villager_profession',
  'fluid',
  'villager_type',
  'game_rule',
  'stat',
] as const;
type ListedKind = (typeof LISTED_KINDS)[number];

/**
 * Entity components of batch 2 (ADR 0098 D5, ADR 0107, ADR 0109 D2) the eject leaves out: the mob
 * itself is still generated, one warning per entity names the components it loses. Mount storage,
 * fish buckets, the habits, hovering, phasing and the dash are generated (B537b).
 */
const NOT_IN_EJECT_COMPONENTS: Readonly<Record<string, string>> = {
  'msm:trader': 'trader',
  'msm:shoulder_riding': 'shoulder riding',
};

/** `definition` without the components of {@link NOT_IN_EJECT_COMPONENTS}; the generator rejects them. */
function withoutBatch2Components(definition: JsonObject): JsonObject {
  const components = definition.components;
  if (!isObject(components) || notInEjectComponentsOf(definition).length === 0) return definition;
  const kept: JsonObject = {};
  for (const [key, value] of Object.entries(components)) {
    if (!(key in NOT_IN_EJECT_COMPONENTS)) kept[key] = value;
  }
  return { ...definition, components: kept };
}

/**
 * What an entity definition has that the eject leaves out, in a fixed order, in plain words: the
 * trader and shoulder riding components of batch 2 of vanilla parity 2.
 */
export function notInEjectComponentsOf(definition: JsonObject): string[] {
  const components = definition.components;
  if (!isObject(components)) return [];
  return Object.keys(NOT_IN_EJECT_COMPONENTS)
    .filter((key) => key in components)
    .map((key) => `${NOT_IN_EJECT_COMPONENTS[key]} (${key})`);
}

/**
 * The script events that need the runtime's Mixins (ADR 0096 D3, D6): a script subscribing to one
 * also gets `export.not-in-eject`, because the eject has neither scripts nor the Mixins.
 */
const MIXIN_EVENTS: Readonly<Record<string, string>> = {
  'block.place': 'block placement',
  'world.explosion': 'explosion',
};

/** `msm.events.on("<event>"` (any quote) in a script's text. */
const MIXIN_EVENT_PATTERN = /\.on\(\s*["'`](block\.place|world\.explosion)["'`]/g;

/** The Mixin events a script's text subscribes to, sorted. */
export function mixinEventsOf(text: string): string[] {
  return [
    ...new Set([...text.matchAll(MIXIN_EVENT_PATTERN)].map((match) => match[1] as string)),
  ].sort();
}

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
 * `export.outside-jar-folders` (info) for pack files outside `assets/` and `data/`;
 * `export.not-in-eject` (warning) per key bind, HUD element and vehicle, which the eject leaves out
 * (ADR 0088 D10, ADR 0090 D14), per mob with a trader or shoulder riding component (one warning
 * per mob, naming them; the mob is generated without them, ADR 0098 D5, ADR 0109 D2; boats, mount
 * storage, fish buckets, the habits, hovering, phasing and the dash are generated, B537b), and per script and
 * Mixin event it listens to (`block.place`, `world.explosion`; ADR 0096 D6); command, creative tab,
 * villager profession, fluid, villager type, game rule, statistic and vanilla block rules
 * definitions go to the generator (ADR 0096 D6, ADR 0112 D3; B537); `export.eject-uses-geckolib` (info) per entity with renderer `vanilla`, which the eject draws
 * with GeckoLib (ADR 0072 D8).
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
      const lists = new Map<ListedKind, DefinitionInput[]>(LISTED_KINDS.map((kind) => [kind, []]));
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
          const text =
            file.contents instanceof Uint8Array
              ? utf8.decode(file.contents)
              : typeof file.contents === 'string'
                ? file.contents
                : '';
          for (const event of mixinEventsOf(text)) {
            problems.report({
              severity: 'warning',
              code: ExportProblemCodes.notInEject,
              file: file.path,
              message: `Script ${id} listens to the ${MIXIN_EVENTS[event] ?? event} event (${event}), which only the Fabric mod jar has (the runtime's Mixins are not ejected, ADR 0096 D6). Export the Fabric mod jar to use it.`,
            });
          }
          continue;
        }
        const match = DEFINITION_PATTERN.exec(file.path);
        if (match === null) continue;
        const kind = match[2];
        const leftOut = NOT_IN_EJECT_KINDS[kind as string];
        if (leftOut !== undefined) {
          problems.report({
            severity: 'warning',
            code: ExportProblemCodes.notInEject,
            file: file.path,
            message: `${match[1]}:${match[3]} is a ${leftOut.label}, which the Java project does not include (${leftOut.reason}). Export the Fabric mod jar to use it.`,
          });
          continue;
        }
        if (
          kind !== 'block' &&
          kind !== 'item' &&
          kind !== 'entity' &&
          !(LISTED_KINDS as readonly string[]).includes(kind as string)
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
        if (kind === 'entity') {
          const lost = notInEjectComponentsOf(definition);
          if (lost.length > 0) {
            problems.report({
              severity: 'warning',
              code: ExportProblemCodes.notInEject,
              file: file.path,
              message: `${match[1]}:${match[3]} uses ${lost.join(', ')}, which the Java project does not include yet (${lost.length === 1 ? 'it needs' : 'they need'} the runtime's mob code). The mob is still generated without ${lost.length === 1 ? 'it' : 'them'}. Export the Fabric mod jar to use ${lost.length === 1 ? 'it' : 'them'}.`,
            });
          }
        }
        const entry: DefinitionInput = {
          id: `${match[1]}:${match[3]}`,
          path: file.path,
          definition: kind === 'entity' ? withoutBatch2Components(definition) : definition,
        };
        if (kind === 'block') blocks.push(entry);
        else if (kind === 'item') items.push(entry);
        else if (kind === 'entity') entities.push(entry);
        else lists.get(kind as ListedKind)?.push(entry);
      }
      const listed = (kind: ListedKind): DefinitionInput[] => lists.get(kind) ?? [];
      const optionalList = <K extends string>(key: K, kind: ListedKind) =>
        (listed(kind).length > 0 ? { [key]: listed(kind) } : {}) as Partial<
          Record<K, DefinitionInput[]>
        >;
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
      // ADR 0072 D8: the eject has no vanilla renderer, so `vanilla` entities use GeckoLib.
      for (const entry of entityRenderers(input.files)) {
        if (entry.renderer !== 'vanilla') continue;
        problems.report({
          severity: 'info',
          code: ExportProblemCodes.ejectUsesGeckolib,
          file: entry.path,
          message: `Entity ${entry.id} asks for the vanilla renderer, but the Java project draws every entity with GeckoLib (same model, more animation features).`,
        });
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
          effects: listed('effect'),
          soundEvents,
          ...optionalList('potions', 'potion'),
          ...optionalList('particles', 'particle'),
          ...optionalList('biomeAdditions', 'biome_addition'),
          ...optionalList('lootAdditions', 'loot_addition'),
          // Commands and creative tabs (ADR 0096 D6; plugin API 1.18.0).
          ...optionalList('commands', 'command'),
          ...optionalList('creativeTabs', 'creative_tab'),
          // ADR 0112 D3 (plugin API 1.20.0, B537).
          ...optionalList('vanillaBlockRules', 'vanilla_block_rules'),
          ...optionalList('villagerProfessions', 'villager_profession'),
          ...optionalList('fluids', 'fluid'),
          ...optionalList('villagerTypes', 'villager_type'),
          ...optionalList('gameRules', 'game_rule'),
          ...optionalList('stats', 'stat'),
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
