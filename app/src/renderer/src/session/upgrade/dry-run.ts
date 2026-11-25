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
  applyMigration,
  buildUpgradeReport,
  type ChainRun,
  type ChainStep,
  type ChangeTouch,
  createMemoryFileSystem,
  type DirEntry,
  type InvertResult,
  invert,
  type MemoryFileSystem,
  migrationChain,
  type ProjectFileSystem,
  problemKey,
  runChain,
  type UpgradeReport,
} from '@msm/core';
import type {
  Json,
  MigrationReport,
  OutputFile,
  Problem,
  Project,
  ResourceLocation,
  Target,
  TargetChangeSet,
} from '@msm/plugin-api';

/** Problem code of a dry run's own outcome (not a problem of the project). */
export const DryRunProblemCodes = Object.freeze({
  /** No target in the path has a migration hook: the move only changes the target. */
  noMigrationNeeded: 'target.no-migration-needed',
});

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
  from: { targetId: string; mcVersion: string };
  /** The target moved to and its Minecraft version. */
  to: { targetId: string; mcVersion: string };
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
export class DryRunCancelled extends Error {
  readonly reason: string;
  constructor(reason = 'cancelled') {
    super(`The dry run was cancelled (${reason}).`);
    this.name = 'DryRunCancelled';
    this.reason = reason;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return;
  const reason: unknown = signal.reason;
  throw new DryRunCancelled(typeof reason === 'string' ? reason : 'cancelled');
}

/**
 * The hops from `from` to `to`: the targets' `previous` links (`migrationChain`), or, when
 * they give no path (a third-party target that names no `previous`), one hop that runs `to`'s
 * own hook as before ADR 0136.
 */
export function upgradeSteps(
  targets: readonly Target[],
  from: Target,
  to: Target,
): { steps: ChainStep[]; direction: MoveDirection } {
  const chain = migrationChain(targets, from.id, to.id);
  if (chain.ok) {
    const first = chain.steps[0];
    return { steps: chain.steps, direction: first === undefined ? 'same' : first.direction };
  }
  return { steps: [{ from, to, direction: 'up' }], direction: 'up' };
}

/**
 * The report to apply for a chain that ran up: a single hop's own report (its change list as
 * the hook gave it) with the chain's in-game checks and reverses, or the merged report for
 * more than one hop. When no hop had a hook, no change and one info problem "No migration
 * needed".
 */
export function reportToApply(run: ChainRun, steps: readonly ChainStep[]): MigrationReport {
  if (steps.length > 0 && steps.every((step) => step.to.migrateFrom === undefined)) {
    return {
      changes: [],
      problems: [
        {
          severity: 'info',
          code: DryRunProblemCodes.noMigrationNeeded,
          message: 'No migration needed',
        },
      ],
    };
  }
  const [only, ...rest] = run.hops;
  if (only === undefined || rest.length > 0) return structuredClone(run.report);
  const out: MigrationReport = {
    changes: structuredClone(only.report.changes),
    problems: structuredClone(only.report.problems),
  };
  if (run.report.inGameChecks !== undefined) {
    out.inGameChecks = structuredClone(run.report.inGameChecks);
  }
  if (run.report.reverses !== undefined) out.reverses = structuredClone(run.report.reverses);
  return out;
}

/**
 * Whether moving from `fromId` to `toId` goes back along the targets' `previous` links (so the
 * saved report of the move up is needed, ADR 0136 D7).
 */
export function isMoveBack(targets: readonly Target[], fromId: string, toId: string): boolean {
  const chain = migrationChain(targets, fromId, toId);
  return chain.ok && chain.steps[0]?.direction === 'down';
}

/**
 * The report to apply for a move, without validating anything (what `upgradeTargetPreview`
 * answers): the chain up ({@link reportToApply}), or, moving back, the inverse of the saved
 * move up (`invert`), which puts back what it dropped.
 *
 * @param targets - Every target the host knows.
 * @param from - The project's target.
 * @param to - The target to move to.
 * @param project - The project; not changed.
 * @param savedReport - The saved report of the move up, when moving back.
 */
export function previewMove(
  targets: readonly Target[],
  from: Target,
  to: Target,
  project: Project,
  savedReport?: MigrationReport,
): MigrationReport {
  const { steps, direction } = upgradeSteps(targets, from, to);
  const run = runChain(project, steps);
  if (direction === 'down') {
    return structuredClone(invert(run.report, savedReport, project).report);
  }
  if (direction === 'same') return { changes: [], problems: [] };
  return reportToApply(run, steps);
}

/** The change sets of a chain's up hops, in order. */
export function changeSetsOf(steps: readonly ChainStep[]): TargetChangeSet[] {
  const out: TargetChangeSet[] = [];
  for (const step of steps) {
    if (step.direction === 'up' && step.to.changes !== undefined) out.push(step.to.changes);
  }
  return out;
}

/** Kinds holding plain text, never searched for ids (ADR 0136 D3). */
const TEXT_KINDS: ReadonlySet<string> = new Set(['minecraft:lang']);
/** A `minecraft:` id inside longer text, as the migration engine's token search finds it. */
const TEXT_ID = /(?<![A-Za-z0-9_.:/#-])(#?)minecraft:([a-z0-9_./-]+)/g;

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
export function textTouches(
  changeSets: readonly TargetChangeSet[],
  project: Project,
): ChangeTouch[] {
  const byToken = new Map<string, { targetId: string; changeId: string }[]>();
  for (const set of changeSets) {
    for (const change of set.changes) {
      if (change.area !== 'ids') continue;
      if (change.what !== 'member-removed' && change.what !== 'member-renamed') continue;
      if ((change.stillIn ?? []).length > 0) continue;
      const registry = change.registry;
      if (registry === undefined || !change.subject.startsWith(`${registry}/`)) continue;
      const member = change.subject.slice(registry.length + 1);
      const token = `${registry.startsWith('tag/') ? '#' : ''}${member}`;
      const list = byToken.get(token) ?? [];
      list.push({ targetId: set.to, changeId: change.id });
      byToken.set(token, list);
    }
  }
  if (byToken.size === 0) return [];
  const out: ChangeTouch[] = [];
  const seen = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (TEXT_KINDS.has(element.kind)) continue;
      walkStrings(element.data, [], (value, segments) => {
        for (const match of value.matchAll(TEXT_ID)) {
          if (match[0] === value) continue;
          const token = `${match[1] ?? ''}${match[2] ?? ''}`;
          for (const found of byToken.get(token) ?? []) {
            const path = pointer(segments);
            const key = `${found.targetId}\u0000${found.changeId}\u0000${element.id}\u0000${path}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ ...found, elementId: element.id as ResourceLocation, path });
          }
        }
      });
    }
  }
  return out;
}

function walkStrings(
  node: Json,
  segments: (string | number)[],
  visit: (value: string, segments: (string | number)[]) => void,
): void {
  if (typeof node === 'string') {
    visit(node, segments);
  } else if (Array.isArray(node)) {
    node.forEach((item, index) => {
      walkStrings(item, [...segments, index], visit);
    });
  } else if (node !== null && typeof node === 'object') {
    for (const [key, item] of Object.entries(node)) walkStrings(item, [...segments, key], visit);
  }
}

function pointer(segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

/**
 * Problems without exact repeats (the same identity and message), in order: the live pass and
 * the lowering can report the same expander problem.
 */
export function distinctProblems(problems: readonly Problem[]): Problem[] {
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const problem of problems) {
    const key = `${problemKey(problem)}\u0000${problem.severity}\u0000${problem.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(problem);
  }
  return out;
}

/**
 * Runs the dry run (ADR 0136 D4): the chain (or the inverse when moving back) on an in-memory
 * copy, then the host's validation and lowering of both sides at once, then the report.
 * Cancellable between phases through `input.signal` ({@link DryRunCancelled}).
 *
 * @param input - The project, the targets, the move and the host.
 * @returns The report, the report to apply, both sides' problems and files, and the timings.
 * @throws Error If `fromId` or `toId` names no target.
 */
export async function dryRunUpgrade(input: DryRunInput): Promise<UpgradeDryRun> {
  const clock = input.clock ?? (() => performance.now());
  const signal = input.signal ?? new AbortController().signal;
  const started = clock();
  const timings: Record<string, number> = {};
  let mark = started;
  const lap = (name: string): void => {
    const now = clock();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  const from = input.targets.find((target) => target.id === input.fromId);
  const to = input.targets.find((target) => target.id === input.toId);
  if (from === undefined) throw new Error(`Unknown target ${JSON.stringify(input.fromId)}.`);
  if (to === undefined) throw new Error(`Unknown target ${JSON.stringify(input.toId)}.`);
  throwIfAborted(signal);

  const { steps, direction } = upgradeSteps(input.targets, from, to);
  const run = runChain(input.project, steps);
  let migration: MigrationReport;
  let inverted: InvertResult | undefined;
  if (direction === 'down') {
    inverted = invert(run.report, input.savedReport, input.project);
    migration = structuredClone(inverted.report);
  } else if (direction === 'same') {
    migration = { changes: [], problems: [] };
  } else {
    migration = reportToApply(run, steps);
  }
  const moved = applyMigration(input.project, migration, to.id);
  lap('migrate');
  throwIfAborted(signal);

  const empty: DryRunSide = { problems: [], files: [] };
  const [before, after] =
    direction === 'same'
      ? [empty, empty]
      : await Promise.all([input.host.before(signal), input.host.after(moved, signal)]);
  lap('validate and lower');
  throwIfAborted(signal);

  const changeSets = direction === 'up' ? changeSetsOf(steps) : [];
  const problemsBefore = distinctProblems(before.problems);
  const problemsAfter = distinctProblems(after.problems);
  const report = buildUpgradeReport({
    changeSets,
    migration,
    problemsBefore,
    problemsAfter,
    factsBefore: from,
    factsAfter: to,
    project: input.project,
    moved,
    touches: textTouches(changeSets, input.project),
  });
  lap('report');
  timings.total = Math.round(clock() - started);
  return {
    from: { targetId: from.id, mcVersion: from.mcVersion },
    to: { targetId: to.id, mcVersion: to.mcVersion },
    direction,
    hops: steps.map((step) => ({
      from: step.from.id,
      to: step.to.id,
      direction: step.direction,
    })),
    migration,
    chain: run.report,
    ...(inverted === undefined ? {} : { inverted }),
    moved,
    report,
    problemsBefore,
    problemsAfter,
    filesBefore: before.files,
    filesAfter: after.files,
    timings,
  };
}

/** Whether `path` is `assets/` or below it. */
function isAssetPath(path: string): boolean {
  return path === 'assets' || path.startsWith('assets/');
}

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
export function createDryRunFileSystem(shared: ProjectFileSystem): DryRunFileSystem {
  let memory: MemoryFileSystem = createMemoryFileSystem();
  const fs: ProjectFileSystem = {
    readFile: (path) => (isAssetPath(path) ? shared.readFile(path) : memory.readFile(path)),
    writeFile: (path, data) => memory.writeFile(path, data),
    readDir: async (path): Promise<DirEntry[]> =>
      isAssetPath(path) ? shared.readDir(path) : memory.readDir(path),
    exists: (path) => (isAssetPath(path) ? shared.exists(path) : memory.exists(path)),
    mkdirp: (path) => memory.mkdirp(path),
    remove: (path) => memory.remove(path),
  };
  return {
    fs,
    replace(files) {
      memory = createMemoryFileSystem(files);
    },
  };
}
