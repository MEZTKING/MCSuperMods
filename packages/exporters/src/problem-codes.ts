/**
 * Problem codes reported by the export pipeline and the built-in exporters.
 *
 * @packageDocumentation
 */

export const ExportProblemCodes = {
  /** An output file path is not a safe relative POSIX path. The export is blocked. */
  unsafePath: 'export.unsafe-path',
  /** Two output files (lowered or asset) share a path. The export is blocked. */
  conflict: 'export.conflict',
  /** A project asset lies outside the folders the export passes through; it is not exported. */
  assetSkipped: 'export.asset-skipped',
  /** A project asset's bytes could not be read. The export is blocked. */
  assetReadFailed: 'export.asset-read-failed',
  /** An output file names a schema the schema index does not know. The export is blocked. */
  unknownSchema: 'export.unknown-schema',
  /** An output file with a schema holds bytes that are not UTF-8 JSON. The export is blocked. */
  invalidJson: 'export.invalid-json',
  /** Output files of layers the chosen exporter does not package were left out. */
  layerSkipped: 'export.layer-skipped',
  /** An output file uses a path the exporter reserves, such as `msm.export.json`. */
  reservedPath: 'export.reserved-path',
  /**
   * The injected `validateText` checker threw for an output file with a `language`. The
   * export is blocked.
   */
  textValidationFailed: 'export.text-validation-failed',
  /**
   * Output files carry a `language` but the request has no `validateText` checker, so their
   * text was not checked. One info per language; the export goes ahead.
   */
  languageUnchecked: 'export.language-unchecked',
  /** Fabric content jar: the target has no Fabric facts (`Target.fabric`). Nothing is written. */
  noFabricTarget: 'export.no-fabric-target',
  /**
   * Fabric content jar: nesting the runtime was asked for but the host supplied no runtime
   * jar. Nothing is written.
   */
  runtimeMissing: 'export.runtime-missing',
  /** Fabric content jar: the layer-`msm` `fabric.mod.json` is not a JSON object. Nothing is written. */
  invalidModJson: 'export.invalid-mod-json',
  /**
   * Fabric content jar: a resource or data layer file outside `assets/` or `data/` (such as
   * `pack.mcmeta`) was left out.
   */
  outsideJarFolders: 'export.outside-jar-folders',
  /** The exporter threw while packaging. Some files may already have been written. */
  failed: 'export.failed',
} as const;

/** Any problem code reported by `@msm/exporters` itself (schema problems keep `schema.*`). */
export type ExportProblemCode = (typeof ExportProblemCodes)[keyof typeof ExportProblemCodes];
