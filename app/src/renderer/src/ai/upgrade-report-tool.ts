/**
 * The AI helper's `upgrade_report` (ADR 0136 D15, B825): the report of moving the mod to another
 * Minecraft version, in the sentences the app's report shows (`components/upgrade/sentences.ts`),
 * with the ids and paths the helper needs to explain or fix a thing. It is the only way the
 * helper learns what changed in Minecraft: the prompt tells it never to state a change the
 * report does not list. Nothing here moves the mod or changes the project.
 *
 * Which move: with no `version`, the last move made to the mod's own version (its items still
 * open marked), else the newer version the notice would offer (test versions included, since
 * the user is asking); with a `version` (a Minecraft version as the user says it, or a target
 * id), that version: a move already made to it when the mod is on it, else a dry run on a copy.
 *
 * @packageDocumentation
 */

import {
  openItems,
  type Problem,
  type Project,
  type UpgradeReport,
  type UpgradeTodoItem,
} from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import {
  changeSentence,
  detailSentence,
  inGameLimit,
  moveSummary,
  nothingTouchesSentence,
  PLAYER_FACT_LABELS,
  plainText,
  playerValue,
  savedSummary,
  standingCheck,
  todoItemHint,
  todoItemText,
  untouchedSentence,
} from '../components/upgrade/sentences';
import type { SavedUpgrade } from '../session/upgrade/saved-report';

/** What the tool reads of the session. */
export interface UpgradeReportHost {
  /** The mod's Minecraft target. */
  readonly target: TargetFacts;
  /** Every target the app can move the mod to (and the mod's own). */
  readonly targets: readonly TargetFacts[];
  /** The project as it is, and its problems now. */
  readonly project: Project;
  readonly problems: readonly Problem[];
  /** The saved moves, newest first. */
  savedMoves(): Promise<readonly SavedUpgrade[]>;
  /** The report of a move not made yet, tried on a copy (`session.upgradeReport`). */
  dryRun(targetId: string, signal: AbortSignal): Promise<{ report: UpgradeReport; back: boolean }>;
}

/** Why a report cannot be given; the message is for the model. */
export class UpgradeReportUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpgradeReportUnavailable';
  }
}

/** A target's facts with the `previous` a built-in target carries (`Target.previous`). */
type ChainedFacts = TargetFacts & { readonly previous?: unknown };

/** The targets whose `previous` chain reaches `fromId`, nearest first. */
export function newerTargets(fromId: string, targets: readonly TargetFacts[]): TargetFacts[] {
  const byId = new Map(targets.map((target) => [target.id, target as ChainedFacts]));
  const steps = (target: TargetFacts): number => {
    const seen = new Set<string>([target.id]);
    let at: ChainedFacts | undefined = target as ChainedFacts;
    let steps = 0;
    while (at !== undefined) {
      const previous = at.previous;
      if (typeof previous !== 'string' || seen.has(previous)) return -1;
      steps += 1;
      if (previous === fromId) return steps;
      seen.add(previous);
      at = byId.get(previous);
    }
    return -1;
  };
  return targets
    .map((target) => ({ target, steps: steps(target) }))
    .filter((entry) => entry.steps > 0)
    .sort((a, b) => a.steps - b.steps)
    .map((entry) => entry.target);
}

/**
 * The target a version names: a target id, a Minecraft version, or a release number of a test
 * version ("1.2" for "1.2-snapshot-3").
 */
export function targetForVersion(
  version: string,
  targets: readonly TargetFacts[],
): TargetFacts | undefined {
  const wanted = version
    .trim()
    .toLowerCase()
    .replace(/^minecraft\s+/, '');
  return (
    targets.find((target) => target.id.toLowerCase() === wanted) ??
    targets.find((target) => target.mcVersion.toLowerCase() === wanted) ??
    targets.find((target) => target.mcVersion.toLowerCase().split('-')[0] === wanted)
  );
}

/** One thing the user needs to change, as the tool shows it. */
interface TodoView {
  id: string;
  sentence: string;
  hint?: string;
  elementId?: string;
  path?: string;
  severity: Problem['severity'];
  code: string;
  /** After a move: whether it still needs doing. */
  open?: boolean;
}

/** The report as the tool answers it. */
export interface UpgradeReportView {
  from: string;
  to: string;
  targetIds: { from: string; to: string };
  /** Whether the move is made (a saved report) or only tried on a copy. */
  made: boolean;
  /** A move back to an older version. */
  back: boolean;
  summary: string;
  changedInMinecraft: { sentence: string; changeId: string; things: string[] }[];
  changedForYou: { elementId: string; sentences: string[]; removed?: true }[];
  needsYou: TodoView[];
  playersNeed: { what: string; before: string; after: string }[];
  checkInTheGame: string[];
  cannotKnow: string;
  untouched: string;
  /** Other moves made, newest first, for "what changed when I moved". */
  otherMoves?: string[];
  rule: string;
}

const RULE =
  'These are the only changes in Minecraft that MCSuperMods knows touch this mod. Do not name others; to see one, the user opens the move dialog or plays the new version once.';

/** The view of one report. */
export function reportView(
  report: UpgradeReport,
  options: {
    project: Project | null;
    made: boolean;
    back: boolean;
    versions: ReadonlyMap<string, string>;
    open?: ReadonlySet<string>;
  },
): UpgradeReportView {
  const to = report.to.mcVersion;
  const versionOf = (targetId: string): string => options.versions.get(targetId) ?? to;
  const touched =
    report.changed.length + report.done.length + report.todo.length > 0 ||
    report.players.exports.length > 0;
  let previous: UpgradeTodoItem | undefined;
  const needsYou = report.todo.map((item): TodoView => {
    const hint = todoItemHint(item, previous);
    previous = item;
    return {
      id: item.id,
      sentence: todoItemText(item, options.project, to),
      ...(hint === null ? {} : { hint }),
      ...(item.problem.elementId === undefined ? {} : { elementId: item.problem.elementId }),
      ...(item.problem.path === undefined ? {} : { path: item.problem.path }),
      severity: item.problem.severity,
      code: item.problem.code,
      ...(options.open === undefined ? {} : { open: options.open.has(item.id) }),
    };
  });
  return {
    from: report.from.mcVersion,
    to,
    targetIds: { from: report.from.targetId, to: report.to.targetId },
    made: options.made,
    back: options.back,
    summary: touched
      ? moveSummary(report, options.back)
      : nothingTouchesSentence(report.untouched.total, to, options.back),
    changedInMinecraft: report.changed.map((item) => ({
      sentence: changeSentence(item.change, versionOf(item.targetId)),
      changeId: item.change.id,
      things: [...item.elementIds],
    })),
    changedForYou: report.done
      .filter((item) => item.kind !== 'note')
      .map((item) => ({
        elementId: item.elementId,
        sentences: [
          ...new Set(
            item.details.length > 0
              ? item.details.map((detail) => detailSentence(detail, to))
              : [
                  item.kind === 'remove'
                    ? 'It is taken out of your mod.'
                    : plainText(item.description),
                ],
          ),
        ],
        ...(item.kind === 'remove' ? { removed: true as const } : {}),
      })),
    needsYou,
    playersNeed: report.players.rows
      .filter((row) => row.changed)
      .map((row) => ({
        what: PLAYER_FACT_LABELS[row.fact],
        before: playerValue(row.fact, row.before),
        after: playerValue(row.fact, row.after),
      })),
    checkInTheGame: [
      ...report.inGame.standing.map((check) => standingCheck(check, to)),
      ...report.inGame.checks.map((check) => plainText(check.check)),
    ],
    cannotKnow: inGameLimit(to),
    untouched: untouchedSentence(report.untouched.total, to),
    rule: RULE,
  };
}

/**
 * The report `upgrade_report` answers with.
 *
 * @throws UpgradeReportUnavailable When there is no such version or no move to report.
 */
export async function upgradeReportFor(
  host: UpgradeReportHost,
  version: string | undefined,
  signal: AbortSignal,
): Promise<UpgradeReportView> {
  const versions = new Map(host.targets.map((target) => [target.id, target.mcVersion]));
  const saved = await host.savedMoves();
  const madeTo = (targetId: string): SavedUpgrade | undefined =>
    saved.find((move) => move.to.targetId === targetId && move.report !== undefined);
  const others = (shown: SavedUpgrade | undefined): string[] | undefined => {
    const lines = saved
      .filter((move) => move !== shown)
      .map((move) => savedSummary(move.from.mcVersion, move.to.mcVersion, move.movedAt));
    return lines.length === 0 ? undefined : lines;
  };
  const savedView = (move: SavedUpgrade): UpgradeReportView => {
    const report = move.report as UpgradeReport;
    const open = new Set(
      openItems(report, host.problems, host.project, new Set(move.ticked)).map((item) => item.id),
    );
    const back = newerTargets(move.to.targetId, host.targets).some(
      (target) => target.id === move.from.targetId,
    );
    const view = reportView(report, { project: host.project, made: true, back, versions, open });
    const rest = others(move);
    return rest === undefined ? view : { ...view, otherMoves: rest };
  };
  const tried = async (target: TargetFacts): Promise<UpgradeReportView> => {
    const { report, back } = await host.dryRun(target.id, signal);
    const view = reportView(report, { project: host.project, made: false, back, versions });
    const rest = others(undefined);
    return rest === undefined ? view : { ...view, otherMoves: rest };
  };

  if (version === undefined) {
    const last = saved[0];
    if (last?.report !== undefined && last.to.targetId === host.target.id) return savedView(last);
    const newer = newerTargets(host.target.id, host.targets);
    const offered = newer.find((target) => target.channel === 'release') ?? newer[0];
    if (offered !== undefined) return tried(offered);
    throw new UpgradeReportUnavailable(
      `The mod is made for Minecraft ${host.target.mcVersion}, the newest version MCSuperMods knows, and it has not been moved. Name a version to see the report of moving to it.`,
    );
  }
  const target = targetForVersion(version, host.targets);
  if (target === undefined) {
    throw new UpgradeReportUnavailable(
      `MCSuperMods does not know Minecraft ${version}. It knows ${host.targets.map((entry) => entry.mcVersion).join(', ')}.`,
    );
  }
  if (target.id === host.target.id) {
    const move = madeTo(target.id);
    if (move !== undefined) return savedView(move);
    throw new UpgradeReportUnavailable(
      `The mod is already made for Minecraft ${target.mcVersion} and no move to it with a report was kept.`,
    );
  }
  return tried(target);
}
