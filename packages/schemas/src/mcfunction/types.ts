/**
 * Public types of the mcfunction service (ADR 0014). These are MSM's own shapes; no Spyglass
 * type appears here.
 */

/**
 * The vendored data the service is built from, injected by the caller (the target package
 * vendors it; this package never reads files).
 */
export interface McfunctionData {
  /** misode/mcmeta Brigadier command tree (`commands/data.min.json`). */
  commands: unknown;
  /** misode/mcmeta block states, `[properties, defaults]` per block (`blocks/data.min.json`). */
  blocks: unknown;
  /** misode/mcmeta registry contents, ids without namespace (`registries/data.min.json`). */
  registries: Readonly<Record<string, readonly string[]>>;
}

/** Options of `createMcfunctionService`. */
export interface McfunctionServiceOptions {
  /** The target's Minecraft version; gates command syntax and mcdoc `#[since]`/`#[until]`. */
  mcVersion: string;
  /**
   * The parsed vanilla-mcdoc symbol export (`mcdoc-cli export symbols.json`) the target vendors.
   * When given, JSON text components, SNBT and item components inside commands are typed and
   * checked; without it they are only parsed.
   */
  mcdocSymbols?: unknown;
}

/** One diagnostic in an mcfunction source. */
export interface McfunctionProblem {
  severity: 'error' | 'warning' | 'info';
  code: 'mcfunction.parse' | 'mcfunction.check' | `mcfunction.lint.${string}`;
  /** British English where MSM writes it; Spyglass messages pass through unchanged. */
  message: string;
  /** 0-based line of `offset.start`. */
  line: number;
  /** UTF-16 offset of the start within `line`. */
  start: number;
  /** UTF-16 offset of the end within `line`, clipped to the end of that line. */
  end: number;
  /** UTF-16 offsets within the whole document. */
  offset: { start: number; end: number };
}

/** One completion proposal. */
export interface McfunctionCompletion {
  label: string;
  /** Text to insert in place of the token prefix; may contain TextMate snippet escapes. */
  insertText: string;
  /** Lower-case LSP completion kind name, for example `keyword`, `value` or `text`. */
  kind: string;
  detail?: string;
}

export interface McfunctionCheckOptions {
  /**
   * Document URI. Defaults to an untitled function URI; use `defaultFunctionUri` for a
   * project function so relative ids and diagnostics refer to the right file.
   */
  uri?: string;
  /**
   * Ids the project declares, keyed by Spyglass symbol category: for example `function`,
   * `loot_table`, `predicate`, `advancement`, `tag/function` or `tag/item`. Ids are
   * `namespace:path` (a bare path is taken as `minecraft:`); tag ids are given without `#`.
   *
   * The `objective` category is project-wide scoreboard objectives, plain names declared as
   * written: Spyglass checks each function on its own, so an objective created in one function
   * (for example `load`) is declared here for the others. Collect them with
   * `collectProjectObjectives` over every project function.
   */
  projectIds?: Readonly<Record<string, readonly string[]>>;
}

export interface McfunctionCompleteOptions extends McfunctionCheckOptions {
  /** Maximum number of proposals returned (default 200). */
  limit?: number;
}

/** An offline mcfunction checker for one Minecraft version. Calls are serialised. */
export interface McfunctionService {
  check(source: string, options?: McfunctionCheckOptions): Promise<McfunctionProblem[]>;
  complete(
    source: string,
    offset: number,
    options?: McfunctionCompleteOptions,
  ): Promise<McfunctionCompletion[]>;
  readonly mcVersion: string;
}
