/**
 * Contribution points: everything a plugin can add to MSM.
 *
 * Built-in plugins use exactly these interfaces; there are no private hooks.
 *
 * @packageDocumentation
 */

import type { Json } from './json';
import type { Asset, Element } from './model';
import type { OutputFile, OutputLayer, OutputSink } from './output';
import type { Problem, ProblemReporter } from './problems';
import type { Target } from './target';

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
   * Turns one element into output files for a target.
   *
   * Must be pure and deterministic: the same element and target always produce the same files
   * in the same order.
   *
   * @param element - The element to lower.
   * @param target - The target being exported for.
   * @returns The files that represent the element.
   */
  lower(element: Element<D>, target: Target): OutputFile[];
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
  /** The target being exported for. */
  target: Target;
  /** The merged, validated output files of every element. */
  files: OutputFile[];
  /** Where to write the packaged result. */
  sink: OutputSink;
  /** Where to report problems found while packaging. */
  problems: ProblemReporter;
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
}
