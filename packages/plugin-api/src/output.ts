/**
 * Output types produced by lowering and consumed by exporters.
 *
 * @packageDocumentation
 */

import type { Json } from './json';

/**
 * Which part of an export a file belongs to.
 *
 * - `resourcepack`: client-side assets (`assets/...`).
 * - `datapack`: server-side data (`data/...`).
 * - `msm`: definitions read by the `msm_runtime` mod (`msm/...`).
 */
export type OutputLayer = 'resourcepack' | 'datapack' | 'msm';

/**
 * One file produced by lowering an element.
 *
 * Exporters merge every element's output files; two files with the same `layer` and `path`
 * are a conflict and stop the export, unless every one of them declares the same
 * {@link OutputFile.merge} mode.
 */
export interface OutputFile {
  /** POSIX path relative to the root of the layer, for example `data/my_mod/recipe/ruby.json`. */
  path: string;
  /**
   * The file's contents. Raw bytes are written as-is; a {@link Json} value is serialised by
   * the exporter deterministically.
   */
  contents: Uint8Array | Json;
  /** The layer the file belongs to. */
  layer: OutputLayer;
  /**
   * The schema the file is validated against by the export validation gate: an mcdoc type
   * path such as `::java::assets::model::Model`, or `resource:<category>` naming a member of
   * the `minecraft:resource` dispatcher, such as `resource:model`.
   *
   * Omitted for binary files and for files that are not validated.
   */
  schema?: string;
  /**
   * A text language id the export validation gate may check, such as `mcfunction`; omitted
   * for JSON and binary files.
   *
   * A file with a `language` carries its text as UTF-8 bytes in {@link OutputFile.contents}.
   */
  language?: string;
  /**
   * How this file combines with other files at the same `layer` and `path`. Since 0.6.0.
   *
   * Files at one path merge instead of conflicting only when every one of them declares the
   * same mode and the same {@link OutputFile.schema}; a file without `merge` that meets any
   * other file at its path is still a conflict.
   *
   * - `tag`: the contents are a tag file `{ replace?, values }`. The merged file holds the
   *   union of `values` in first-seen order (a value written as a string and as `{ id }`
   *   counts once) and `replace: true` when any input says so.
   * - `object`: the contents are a flat JSON object, such as a language file. Keys are
   *   merged; the same key with different values is a `lowering.merge-conflict` error.
   *
   * Merging contents are {@link Json} values (or UTF-8 JSON bytes).
   */
  merge?: OutputMergeMode;
}

/**
 * How files sharing a layer and path combine; see {@link OutputFile.merge}. Since 0.6.0.
 *
 * - `tag`: union of tag `values`.
 * - `object`: flat key merge.
 */
export type OutputMergeMode = 'tag' | 'object';

/**
 * Where an exporter writes. Paths are POSIX, relative to the export root.
 *
 * The host supplies the sink, so exporters never touch the file system directly. This keeps
 * exporters usable in a sandbox and in tests.
 */
export interface OutputSink {
  /**
   * Writes one file, replacing any file already written at the same path.
   *
   * @param path - POSIX path relative to the export root; never absolute, never containing `..`.
   * @param contents - The bytes to write.
   */
  writeFile(path: string, contents: Uint8Array): Promise<void>;
}
