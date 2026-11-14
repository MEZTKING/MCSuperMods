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
  /**
   * Fabric content jar: the project's entities need GeckoLib, so it must be nested, but the
   * host supplied no GeckoLib jar. Nothing is written.
   */
  geckolibMissing: 'export.geckolib-missing',
  /**
   * Fabric content jar and Java project: an entity needs GeckoLib (in the jar: its
   * `msm:animated_model.renderer` is `geckolib`, ADR 0072 D5; in the eject: any entity) but
   * the target has no GeckoLib facts (`Target.geckolib`). Nothing is written.
   */
  noGeckolibTarget: 'export.no-geckolib-target',
  /**
   * Fabric content jar (ADR 0072 D5): an entity with renderer `auto` (or none) is exported
   * for a target without GeckoLib, so the runtime draws it with its vanilla renderer. Info,
   * one per entity; the export goes ahead without GeckoLib.
   */
  entityVanillaRenderer: 'export.entity-vanilla-renderer',
  /**
   * Java project (ADR 0072 D8): an entity with renderer `vanilla` is drawn with GeckoLib in
   * the ejected project, which has no vanilla renderer. Info, one per entity; the export goes
   * ahead.
   */
  ejectUsesGeckolib: 'export.eject-uses-geckolib',
  /** Fabric content jar: the layer-`msm` `fabric.mod.json` is not a JSON object. Nothing is written. */
  invalidModJson: 'export.invalid-mod-json',
  /**
   * Fabric content jar: a resource or data layer file outside `assets/` or `data/` (such as
   * `pack.mcmeta`) was left out.
   */
  outsideJarFolders: 'export.outside-jar-folders',
  /**
   * Fabric content jar: the project has scripts (`language: 'typescript'` files in the `msm`
   * layer) but the host supplied no `transpileScript`. Nothing is written.
   */
  transpilerMissing: 'export.transpiler-missing',
  /**
   * Fabric content jar: a script could not be transpiled (the transpiler threw or returned
   * no problem that explains the failure). Nothing is written. Problems the transpiler
   * returns keep their own codes.
   */
  scriptTranspileFailed: 'export.script-transpile-failed',
  /** Java project: the target has no Java generator (`Target.javaProject`). Nothing is written. */
  noJavaProjectTarget: 'export.no-java-project-target',
  /**
   * Java project: the target's generator threw, or a definition is not a JSON object.
   * Nothing is written.
   */
  javaGenerationFailed: 'export.java-generation-failed',
  /**
   * Java project: a script, or a definition event's `run_script` action, is left out of the
   * eject (ADR 0033 D1). One warning per script and per event; the export goes ahead.
   */
  scriptsNotEjected: 'export.scripts-not-ejected',
  /**
   * Java project: the host supplied no Gradle wrapper, so the project is written without
   * `gradlew` and the wrapper jar. Info; the export goes ahead.
   */
  gradleWrapperMissing: 'export.gradle-wrapper-missing',
  /** The exporter threw while packaging. Some files may already have been written. */
  failed: 'export.failed',
  /**
   * Vanilla data pack (ADR 0066 D3): files naming ids or `#tags` only the Fabric mod jar
   * provides were left out. One warning per element.
   */
  modOnlyReference: 'export.mod-only-reference',
  /**
   * Vanilla data pack (ADR 0066 D5): functions naming ids or `#tags` only the Fabric mod jar
   * provides are kept; the game skips them. One warning per element.
   */
  modOnlyFunction: 'export.mod-only-function',
} as const;

/** Any problem code reported by `@msm/exporters` itself (schema problems keep `schema.*`). */
export type ExportProblemCode = (typeof ExportProblemCodes)[keyof typeof ExportProblemCodes];
