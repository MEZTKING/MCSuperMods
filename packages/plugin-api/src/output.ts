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
 * are a conflict and stop the export.
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
}

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
