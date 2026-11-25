/**
 * The upgrade dry run (ADR 0136 D4, B816): before anything changes, the project is moved on an
 * in-memory copy (`migrationChain` and `runChain` of `@msm/core`, or `invert` with the saved
 * report when moving back), the copy is validated and lowered on the new target, the result is
 * compared with the same pass on the project as it is, and `buildUpgradeReport` makes the
 * report. The validation and lowering are injected ({@link DryRunHost}): the session passes
 * its own live pass for "before" and a scratch session over the moved copy for "after", and
 * `tools/check-project` runs the same code through the same session.
 *
 * Nothing here knows a Minecraft version: targets and their change sets arrive as arguments.
 *
 * @packageDocumentation
 */
import {
  type ChainRun,
  type ChainStep,
  type ChangeTouch,
  type InvertResult,
  type ProjectFileSystem,
  type UpgradeReport,
} from '@msm/core';
import type {
  MigrationReport,
  OutputFile,
  Problem,
  Project,
  Target,
  TargetChangeSet,
} from '@msm/plugin-api';
/** Problem code of a dry run's own outcome (not a problem of the project). */
export declare const DryRunProblemCodes: Readonly<{
  /** No target in the path has a migration hook: the move only changes the target. */
  noMigrationNeeded: 'target.no-migration-needed';
}>;
/** What a dry run validated and lowered on one side of the move. */
export interface DryRunSide {
  /** Validation and lowering problems, one per identity and message. */
  problems: Problem[];
  /** The lowered files (for the before and after views of B819). */
  files: OutputFile[];
}
/** The validation and lowering a dry run asks for. */
export interface DryRunHost {
  /** The project as it is, on its own target. */
  before(signal: AbortSignal): Promise<DryRunSide>;
  /** The moved copy, on the target it was moved to. */
  after(moved: Project, signal: AbortSignal): Promise<DryRunSide>;
}
/** The input of {@link dryRunUpgrade}. */
export interface DryRunInput {
  /** The project before the move; not changed. */
  project: Project;
  /** Every target the host knows. */
  targets: readonly Target[];
  /** The project's target. */
  fromId: string;
  /** The target to move to. */
  toId: string;
  /** Validation and lowering. */
  host: DryRunHost;
  /** The saved report of the move up, for moving back ({@link invert}). */
  savedReport?: MigrationReport;
  /** Cancels the run between its phases. */
  signal?: AbortSignal;
  /** Milliseconds for the timings; `performance.now` by default. */
  clock?: () => number;
}
/** Which way a move goes. */
export type MoveDirection = 'up' | 'down' | 'same';
/** One hop of the move, as plain ids. */
export interface DryRunHop {
  from: string;
  to: string;
  direction: 'up' | 'down';
}
/** The outcome of {@link dryRunUpgrade}. */
export interface UpgradeDryRun {
  /** The target moved from and its Minecraft version. */
  from: {
    targetId: string;
    mcVersion: string;
  };
  /** The target moved to and its Minecraft version. */
  to: {
    targetId: string;
    mcVersion: string;
  };
  /** Which way. */
  direction: MoveDirection;
  /** The hops, in order (one synthetic hop when the targets' `previous` links give no path). */
  hops: DryRunHop[];
  /**
   * The migration report to apply as the one undo step (`ProjectSession.upgradeTarget`): for a
   * single hop the hop's own changes, with the chain's in-game checks and reverses; for more
   * than one hop the chain's merged report; when moving back the inverse's report.
   */
  migration: MigrationReport;
  /** The chain's merged report (its reverses' hashes are core's `elementDataHash`). */
  chain: MigrationReport;
  /** When moving back: what was and was not put back. */
  inverted?: InvertResult;
  /** The moved copy. */
  moved: Project;
  /** The report (ADR 0136 D4). */
  report: UpgradeReport;
  /** The project's problems on its own target. */
  problemsBefore: Problem[];
  /** The moved copy's problems on the new target. */
  problemsAfter: Problem[];
  /** The lowered files on each side. */
  filesBefore: OutputFile[];
  filesAfter: OutputFile[];
  /** Milliseconds per phase, and `total`. */
  timings: Record<string, number>;
}
/** Thrown when a dry run is cancelled; `reason` says why. */
export declare class DryRunCancelled extends Error {
  readonly reason: string;
  constructor(reason?: string);
}
/**
 * The hops from `from` to `to`: the targets' `previous` links (`migrationChain`), or, when
 * they give no path (a third-party target that names no `previous`), one hop that runs `to`'s
 * own hook as before ADR 0136.
 */
export declare function upgradeSteps(
  targets: readonly Target[],
  from: Target,
  to: Target,
): {
  steps: ChainStep[];
  direction: MoveDirection;
};
/**
 * The report to apply for a chain that ran up: a single hop's own report (its change list as
 * the hook gave it) with the chain's in-game checks and reverses, or the merged report for
 * more than one hop. When no hop had a hook, no change and one info problem "No migration
 * needed".
 */
export declare function reportToApply(run: ChainRun, steps: readonly ChainStep[]): MigrationReport;
/** The change sets of a chain's up hops, in order. */
export declare function changeSetsOf(steps: readonly ChainStep[]): TargetChangeSet[];
/**
 * The places where a removed or renamed id of a change set stands inside longer text (a
 * function's lines, a script, SNBT, a rule's text): the token search of ADR 0136 D3 that the
 * migration engine reports as `target.removed-id-in-text`, here tied to the change it answers
 * so the report can name it once with its elements. Whole-string ids are left to
 * `matchChanges` and the migration's details; changes whose id is still in another registry
 * are skipped (the text cannot say which registry it means).
 *
 * @param changeSets - The chain's change sets.
 * @param project - The project before the move.
 * @returns One touch per change, element and string.
 */
export declare function textTouches(
  changeSets: readonly TargetChangeSet[],
  project: Project,
): ChangeTouch[];
/**
 * Problems without exact repeats (the same identity and message), in order: the live pass and
 * the lowering can report the same expander problem.
 */
export declare function distinctProblems(problems: readonly Problem[]): Problem[];
/**
 * Runs the dry run (ADR 0136 D4): the chain (or the inverse when moving back) on an in-memory
 * copy, then the host's validation and lowering of both sides at once, then the report.
 * Cancellable between phases through `input.signal` ({@link DryRunCancelled}).
 *
 * @param input - The project, the targets, the move and the host.
 * @returns The report, the report to apply, both sides' problems and files, and the timings.
 * @throws Error If `fromId` or `toId` names no target.
 */
export declare function dryRunUpgrade(input: DryRunInput): Promise<UpgradeDryRun>;
/**
 * The file system of the dry run's scratch session: the moved copy's `msm.project.json` and
 * `content/` in memory ({@link DryRunFileSystem.replace}), the project's own `assets/` read
 * through `shared` (a move never changes them, ADR 0136 D6), and every write kept in memory,
 * so the scratch session never changes the project folder (not its `.msm/` either).
 */
export interface DryRunFileSystem {
  /** The file system to give the scratch session. */
  readonly fs: ProjectFileSystem;
  /** Puts the files of the next copy in place of the last one's. */
  replace(files: Record<string, Uint8Array>): void;
}
/**
 * Makes a {@link DryRunFileSystem} over `shared` (the project's own file system).
 *
 * @param shared - The project's file system; only `assets/` is read from it, nothing written.
 */
export declare function createDryRunFileSystem(shared: ProjectFileSystem): DryRunFileSystem;
//# sourceMappingURL=dry-run.d.ts.map
