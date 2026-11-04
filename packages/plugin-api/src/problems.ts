/**
 * Diagnostics reported by lowering, validation, import and export.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from './json';

/**
 * How serious a {@link Problem} is. An `error` stops an export; `warning` and `info` do not.
 */
export type ProblemSeverity = 'error' | 'warning' | 'info';

/**
 * A single diagnostic shown to the user in the problems panel.
 */
export interface Problem {
  /** How serious the problem is. */
  severity: ProblemSeverity;
  /** Stable machine-readable code, namespaced by the reporter, for example `vanilla-packs.conflict`. */
  code: string;
  /** Human-readable message in British English. */
  message: string;
  /** The element the problem concerns, if any. */
  elementId?: ResourceLocation;
  /** RFC 6901 pointer into element data, for example `/ingredients/0`. */
  path?: string;
  /**
   * The file the problem concerns, if any: a POSIX path relative to the project root (for
   * load problems, for example `content/my_mod/model/ruby.json`) or to the export root (for
   * export problems, for example `assets/my_mod/models/ruby.json`).
   */
  file?: string;
  /**
   * A span within the string at {@link Problem.path} (or, for problems in text output files,
   * within {@link Problem.file}), as UTF-16 code unit offsets: `start` is inclusive and `end`
   * is exclusive. Omitted when the problem concerns the whole value or file.
   */
  range?: { start: number; end: number };
}

/**
 * Receives problems as they are found. Supplied by the host to exporters and other
 * long-running contributions.
 */
export interface ProblemReporter {
  /**
   * Records one problem.
   *
   * @param problem - The problem to record.
   */
  report(problem: Problem): void;
}
