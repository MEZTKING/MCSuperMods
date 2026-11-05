/**
 * Contribution points: everything a plugin can add to MSM.
 *
 * Built-in plugins use exactly these interfaces; there are no private hooks.
 *
 * @packageDocumentation
 */

import type { MaybePromise } from './async';
import type { Json } from './json';
import type { ElementTemplate, ExampleProject, ProjectStarter } from './library';
import type { Asset, Element } from './model';
import type { OutputFile, OutputLayer, OutputSink } from './output';
import type { Problem, ProblemReporter } from './problems';
import type { Target, TargetFacts } from './target';

/**
 * A kind of element, such as `minecraft:recipe` or `msm:block`.
 *
 * Everything lowers to files: a kind's {@link ElementKind.lower} turns one element into the
 * output files that represent it for a given target.
 *
 * @typeParam D - The shape of the data of elements of this kind.
 */
export interface ElementKind<D extends Json = Json> {
  /** Kind id, a resource location such as `minecraft:recipe`. Unique across all plugins. */
  id: string;
  /** mcdoc type path, e.g. "::java::data::recipe::Recipe" */
  schema: string;
  /** kind-folder under content/<ns>/ */
  folder: string;
  /**
   * The registry the ids of elements of this kind belong to, without a `minecraft:` prefix,
   * for example `structure` or `worldgen/template_pool`: the name schema `#[id]` attributes
   * use, so that references to project elements resolve. Defaults to the kind id without
   * `minecraft:`; set it only when the two differ. Since 0.5.0.
   */
  registry?: string;
  /**
   * Data for a newly created element of this kind. The host deep-copies it for every new
   * element. When omitted, new elements start with an empty object.
   */
  defaultData?: D;
  /**
   * RFC 6901 pointers into `data` that the schema-driven form hides because lowering owns
   * them, for example `/pack/pack_format` when lowering writes the pack format from the
   * target. The fields are still validated and still visible in the raw JSON editor.
   */
  hiddenPaths?: string[];
  /**
   * A hint telling the host which preview to show for elements of this kind, for example
   * `model`, `block_definition` or `item_definition`. The host ignores values it does not
   * recognise; omit it for kinds without a preview.
   */
  previewKind?: string;
  /**
   * Turns one element into output files for a target.
   *
   * Must be pure and deterministic: the same element and target always produce the same files
   * in the same order. May return a Promise (a sandboxed plugin's functions resolve through a
   * worker); hosts await the result. Built-in kinds return the files directly. A Promise
   * return since 1.0.0.
   *
   * @example
   * ```ts
   * lower: (element, target) => [
   *   {
   *     path: `data/${element.id.split(':')[0]}/${target.folders.data.recipe}/ruby.json`,
   *     contents: element.data,
   *     layer: 'datapack',
   *   },
   * ],
   * ```
   *
   * @param element - The element to lower.
   * @param target - The facts of the target being exported for ({@link TargetFacts} since
   *   1.0.0; a host passes its full {@link Target}).
   * @returns The files that represent the element, or a Promise of them.
   */
  lower(element: Element<D>, target: TargetFacts): MaybePromise<OutputFile[]>;
}

/**
 * A custom editor for one element kind. Kinds without one use the schema-driven form.
 */
export interface EditorContribution {
  /** The {@link ElementKind.id} this editor edits. */
  kindId: string;
  /** React component; typed in Phase 1 */
  component: unknown;
}

/**
 * Everything an {@link Exporter} receives for one export run.
 */
export interface ExporterInput {
  /** The project's name, used for archive and folder names. */
  projectName: string;
  /**
   * The target being exported for: the full {@link Target}, hooks included (an exporter may
   * call {@link Target.javaProject}).
   */
  target: Target;
  /** The merged, validated output files of every element. */
  files: OutputFile[];
  /** Where to write the packaged result. */
  sink: OutputSink;
  /** Where to report problems found while packaging. */
  problems: ProblemReporter;
  /** Facts about the exporting host, written into export metadata such as `msm.export.json`. */
  meta: {
    /** The version of MSM performing the export. */
    msmVersion: string;
    /** Ids of the plugins the project requires. */
    plugins: string[];
  };
  /**
   * The value of every option the exporter declares in {@link Exporter.options}, keyed by
   * {@link ExporterOption.id}. The host fills in each option's default when the user chose
   * no value, so every declared id is present. Empty when the exporter declares no options.
   * Since 0.6.0.
   */
  options: Record<string, Json>;
}

/**
 * One user-facing option of an {@link Exporter}, rendered by the host's export dialog.
 * Only boolean options exist in 0.6.0. Since 0.6.0.
 */
export interface ExporterOption {
  /** Option id, unique within the exporter; the key in {@link ExporterInput.options}. */
  id: string;
  /** Label shown in the export dialog, in British English. */
  label: string;
  /** Optional longer explanation shown with the option, in British English. */
  description?: string;
  /** The option's value type. */
  type: 'boolean';
  /** The value used when the user chose none. */
  default: boolean;
}

/**
 * Packages output files into a deliverable, such as pack zips or a mod jar.
 */
export interface Exporter {
  /** Exporter id, for example `vanilla-packs`. Unique across all plugins. */
  id: string;
  /** Name shown in the export dialog, in British English. */
  displayName: string;
  /** The output layers this exporter packages. */
  layers: OutputLayer[];
  /**
   * Options the user can set in the export dialog; their values arrive in
   * {@link ExporterInput.options}. Since 0.6.0.
   */
  options?: ExporterOption[];
  /**
   * Packages the files. Output must be deterministic: stable ordering and fixed timestamps.
   *
   * @param input - The files, target and destination for this run.
   */
  run(input: ExporterInput): Promise<void>;
}

/**
 * A file the user chose to import.
 */
export interface ImportedFile {
  /** The file's base name including its extension, for example `ruby_golem.bbmodel`. */
  name: string;
  /** The file's raw bytes. */
  bytes: Uint8Array;
}

/**
 * What an {@link Importer} produced from one file.
 */
export interface ImportResult {
  /** New elements to add to the project. */
  elements: Element[];
  /** New assets to add to the project, with their bytes. */
  assets: { asset: Asset; bytes: Uint8Array }[];
  /** Anything the importer could not convert faithfully. */
  problems: Problem[];
}

/**
 * Converts an external file type into elements and assets.
 */
export interface Importer {
  /** Importer id, for example `blockbench`. Unique across all plugins. */
  id: string;
  /** Name shown in the import dialog, in British English. */
  displayName: string;
  /** File extensions this importer accepts, lower-case without the dot, for example `bbmodel`. */
  extensions: string[];
  /**
   * Converts one file. The importer does not modify the project; the host adds the result.
   *
   * @param file - The file to import.
   * @param namespace - The namespace the new elements and assets belong to.
   * @returns The elements, assets and problems produced.
   */
  import(file: ImportedFile, namespace: string): Promise<ImportResult>;
}

/**
 * An entry in the command palette.
 */
export interface Command {
  /** Command id, for example `msm.blocks-items.new-block`. Unique across all plugins. */
  id: string;
  /** Title shown in the palette, in British English. */
  title: string;
  /** Runs the command. */
  run(): void | Promise<void>;
}

/**
 * The registry ids a {@link ProjectValidator} may look up: vanilla ids of the target plus the
 * project's own ids, as the host's registry index sees them.
 */
export interface ValidationRegistry {
  /**
   * True when `id` is known in `registry`.
   *
   * @param registry - Registry name without a `minecraft:` prefix, e.g. `worldgen/biome`.
   * @param id - A namespaced id such as `minecraft:plains`.
   */
  has(registry: string, id: string): boolean;
  /**
   * Every known id of `registry`, namespaced and sorted; empty for an unknown registry.
   *
   * @param registry - Registry name without a `minecraft:` prefix.
   */
  ids(registry: string): readonly string[];
}

/**
 * Everything a {@link ProjectValidator} receives. Carries no Node or DOM types.
 */
export interface ValidationInput {
  /** Every element of the project (all kinds), in a stable order. */
  elements: readonly Element[];
  /** The facts of the target being validated for ({@link TargetFacts} since 1.0.0). */
  target: TargetFacts;
  /** Vanilla plus project ids, as the host's registry index sees them. */
  registry: ValidationRegistry;
}

/**
 * Cross-element checks a plugin runs over the whole project, such as the order of features in
 * biomes. The host runs validators after schema checks and merges their problems into the
 * project's problems, so an error blocks export like any other. Since 0.5.0.
 *
 * @example
 * ```ts
 * const validator: ProjectValidator = {
 *   id: 'msm.example.non-empty',
 *   kinds: ['minecraft:recipe'],
 *   validate: ({ elements }) =>
 *     elements.length === 0
 *       ? [{ severity: 'info', code: 'example.empty', message: 'The project has no elements.' }]
 *       : [],
 * };
 * ```
 */
export interface ProjectValidator {
  /** Unique id, for example `msm.worldgen.feature-order`. */
  id: string;
  /**
   * Kind ids whose elements this validator reads; the host re-runs it when an element of any
   * of them changes.
   */
  kinds: readonly string[];
  /**
   * Checks the project. Must be pure and deterministic. Problems carry `elementId` and an
   * RFC 6901 `path` where possible; codes are `<area>.<check>`. May return a Promise (a
   * Promise return since 1.0.0); hosts await the result.
   *
   * @param input - The project's elements, the target and the registry ids.
   * @returns The problems found (empty when there are none), or a Promise of them.
   */
  validate(input: ValidationInput): MaybePromise<Problem[]>;
}

/**
 * Everything one plugin contributes. Every field is optional; omit the ones a plugin does not
 * use.
 */
export interface PluginContributions {
  /** Element kinds; see {@link ElementKind}. */
  elementKinds?: ElementKind[];
  /** Custom editors; see {@link EditorContribution}. */
  editors?: EditorContribution[];
  /** Exporters; see {@link Exporter}. */
  exporters?: Exporter[];
  /** Targets; see {@link Target}. */
  targets?: Target[];
  /** Importers; see {@link Importer}. */
  importers?: Importer[];
  /** Command palette entries; see {@link Command}. */
  commands?: Command[];
  /** paths to extra mcdoc files, relative to the plugin package */
  schemas?: string[];
  /**
   * "New element" picker entries; see {@link ElementTemplate}. Each template's `kind` must be
   * one of this plugin's own {@link PluginContributions.elementKinds}. Since 0.4.0.
   */
  elementTemplates?: ElementTemplate[];
  /** "New project" starters; see {@link ProjectStarter}. Since 0.4.0. */
  projectStarters?: ProjectStarter[];
  /** Examples gallery entries; see {@link ExampleProject}. Since 0.4.0. */
  examples?: ExampleProject[];
  /** Cross-element project checks; see {@link ProjectValidator}. Since 0.5.0. */
  validators?: ProjectValidator[];
}
