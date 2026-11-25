/**
 * **Move to another Minecraft version** (ADR 0037 D4, ADR 0136 D4, D6, D13, D15; B818): the
 * dialog is the report. It lists the other Minecraft versions MCSuperMods builds for (a
 * "snapshot" badge on test versions), asks the host for the dry run of the chosen one
 * (`session.upgradeReport`) and shows its report: what changed in Minecraft for this mod, what
 * MCSuperMods changes for you, what you need to change, what your players need, what is new and
 * what to check in the game, with the count of what does not touch the mod
 * (`upgrade/UpgradeReportView`, a lazy chunk). **Move my mod to Minecraft X** hands the dry run
 * to the host, which applies it as one undo step and keeps a copy; **Not now** closes.
 *
 * The report is live: when the project changes underneath it, the dry run is asked for again
 * and the move waits for it, so what is applied is always the report of the project as it is.
 * **What changed when I moved** lists the saved moves and reopens one's report, with the items
 * fixed since marked done.
 *
 * Plain words by default; the versions' ids, the things' ids, paths and the raw counts show
 * under the dialog's More options (ADR 0130 D3). Presentational: the host owns the session.
 *
 * @packageDocumentation
 */

import { openItems, type Problem, type Project, type UpgradeReport } from '@msm/core';
import type { MigrationReport, OutputFile, ProblemSeverity, TargetFacts } from '@msm/plugin-api';
import { Dialog } from 'radix-ui';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { PlainFix } from '../session/plain-problems';
import type { MoveBackResult } from '../session/upgrade/move-back';
import { Button } from './ui/Button';
import { DialogContent, DialogRoot } from './ui/DialogContent';
import { MoreOptions, rememberedMoreOptions } from './ui/MoreOptions';
import { dayOf, moveSummary, savedSummary } from './upgrade/sentences';
import type { UpgradeReportViewProps } from './upgrade/UpgradeReportView';
import { targetLabel } from './wizard/wizard-model';

const UpgradeReportView = lazy(() => import('./upgrade/UpgradeReportView'));

/** The dialog's title: the File menu's words (ADR 0130 D2). */
export const UPGRADE_TARGET_TITLE = 'Move to another Minecraft version';

/** The title of a saved move's report, and of the list of saved moves. */
export const WHAT_CHANGED_TITLE = 'What changed when I moved';

/** The key the dialog's More options is remembered by. */
const MORE_KEY = 'dialog-upgrade-target';

/** How often a dry run cancelled by an edit is asked for again before the dialog gives up. */
const STALE_RETRIES = 5;

/** Whether the dialog's More options starts open (as `MoreOptions` decides it). */
function moreStartsOpen(): boolean {
  return (
    rememberedMoreOptions(MORE_KEY) ??
    (typeof window !== 'undefined' && window.msmMoreOptionsOpen === true)
  );
}

/** The migration's counts, as More options shows them ("2 changes, 3 problems."). */
export function upgradeSummary(report: MigrationReport): string {
  const changes = report.changes.length;
  const problems = report.problems.length;
  const changeText = changes === 1 ? '1 change' : `${changes} changes`;
  const problemText = problems === 1 ? '1 problem' : `${problems} problems`;
  return `${changeText}, ${problemText}.`;
}

/** The problems of `report` with `severity`. */
export function problemsOfSeverity(
  report: MigrationReport,
  severity: ProblemSeverity,
): readonly Problem[] {
  return report.problems.filter((problem) => problem.severity === severity);
}

/** The migration's problems counted by severity (" (1 error, 2 warnings)"), or "". */
function severityCounts(report: MigrationReport): string {
  const parts = SEVERITIES.map(([severity, one, many]) => {
    const total = problemsOfSeverity(report, severity).length;
    return total === 0 ? null : `${total} ${total === 1 ? one : many}`;
  }).filter((part): part is string => part !== null);
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}

const SEVERITIES: readonly [ProblemSeverity, string, string][] = [
  ['error', 'error', 'errors'],
  ['warning', 'warning', 'warnings'],
  ['info', 'note', 'notes'],
];

/** What the dialog needs of a dry run (`UpgradeDryRun` of `session/upgrade/dry-run` has it). */
export interface MoveReport {
  /** The report (ADR 0136 D4). */
  report: UpgradeReport;
  /** What to apply as the one undo step. */
  migration: MigrationReport;
  /** The moved copy (B819's after views); a dry run always has it. */
  moved?: Project;
  /** The lowered files of the project as it is and of the moved copy (B819). */
  filesBefore?: readonly OutputFile[];
  filesAfter?: readonly OutputFile[];
  /** The hops of the move, in order (whose change sets the report's parts read). */
  hops?: readonly { from: string; to: string; direction: 'up' | 'down' }[];
  /** Moving back: what is and is not put back (B820). */
  inverted?: MoveBackResult;
}

/** What the dialog gives {@link UpgradeTargetDialogProps.extras} besides the move. */
export interface UpgradeExtrasContext {
  /** Opens another version's report in the dialog (Check on other versions, B820). */
  choose(targetId: string): void;
}

/** What the dialog needs of a saved move (`SavedUpgrade` of `session/upgrade/saved-report`). */
export interface SavedMove {
  /** The move's folder in the project. */
  folder: string;
  from: { targetId: string; mcVersion: string };
  to: { targetId: string; mcVersion: string };
  /** When it was made (ISO 8601). */
  movedAt: string;
  /** Its report, when the dry run had finished before the move. */
  report?: UpgradeReport;
  /** The After moving items ticked by hand. */
  ticked: readonly string[];
}

export interface UpgradeTargetDialogProps {
  /** The open project's target id (not offered). */
  currentTargetId: string;
  /** Every built-in target, newest first (`session.availableTargets`). */
  targets: readonly TargetFacts[];
  /** The open project: names the things, and a new one asks for the report again. */
  project?: Project | null;
  /** The project's live problems, for which items of a saved report are still open. */
  problems?: readonly Problem[];
  /** The dry run of moving to `targetId` (`session.upgradeReport`). */
  report(targetId: string, signal: AbortSignal): Promise<MoveReport>;
  /** Applies the move (`session.upgradeTarget`); the host closes the dialog. */
  onMove(targetId: string, move: MoveReport): void;
  /** **Not now**, Escape and Close. */
  onCancel(): void;
  /** The saved moves, newest first (`session.savedUpgradeReports`); without it none are listed. */
  loadSaved?(): Promise<readonly SavedMove[]>;
  /** The version to show first (the notice's newer version); the newest other one by default. */
  initialTargetId?: string;
  /** Opens on this saved move's report (**What changed when I moved** in Things to fix). */
  initialSavedFolder?: string;
  /** Opens a thing at a field (the host closes the dialog first). */
  onShow?(elementId: string, path?: string): void;
  /** Runs a one-step fix (saved reports only). */
  onFix?(problem: Problem, fix: PlainFix): void;
  /** Opens the AI helper with the problem attached. */
  onAsk?(problem: Problem): void;
  /**
   * The report to show for a move: `move.report` with what the host adds to it before the move
   * (the modpacks' part 3 items, B821's `withModpackItems`); `move.report` by default.
   */
  shownReport?(targetId: string, move: MoveReport): UpgradeReport;
  /**
   * More for a move's report: `lead` before its parts, `after` after them, `doneExtra` under
   * each thing MCSuperMods changes (the slots of B819's before and after views and B820's other
   * versions and moving back); `context.choose` opens another version's report.
   */
  extras?(
    targetId: string,
    move: MoveReport,
    context: UpgradeExtrasContext,
  ): Pick<UpgradeReportViewProps, 'lead' | 'after' | 'doneExtra'>;
}

type MoveState =
  | { state: 'idle' }
  | { state: 'loading'; targetId: string }
  | { state: 'ready'; targetId: string; move: MoveReport; checking: boolean }
  | { state: 'failed'; targetId: string; message: string };

type View = { kind: 'move' } | { kind: 'saved'; folder: string };

/** Whether `error` is a dry run cancelled because the project changed meanwhile. */
function isStale(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'DryRunCancelled' &&
    (error as Error & { reason?: string }).reason === 'stale'
  );
}

export function UpgradeTargetDialog(props: UpgradeTargetDialogProps) {
  const { currentTargetId, targets, report: askReport, loadSaved } = props;
  const project = props.project ?? null;
  const offered = targets.filter((target) => target.id !== currentTargetId);
  const [chosen, setChosen] = useState<string | null>(
    offered.find((target) => target.id === props.initialTargetId)?.id ?? offered[0]?.id ?? null,
  );
  const [state, setState] = useState<MoveState>({ state: 'idle' });
  const [view, setView] = useState<View>(
    props.initialSavedFolder === undefined
      ? { kind: 'move' }
      : { kind: 'saved', folder: props.initialSavedFolder },
  );
  const [saved, setSaved] = useState<readonly SavedMove[] | null>(null);
  // The ids (versions and things) show only while More options is open (ADR 0130 D3).
  const [more, setMore] = useState(moreStartsOpen);

  // The dry run of the chosen version, asked for again whenever the project changes (D13).
  useEffect(() => {
    if (chosen === null) return;
    const controller = new AbortController();
    let tries = 0;
    setState((previous) =>
      previous.state === 'ready' && previous.targetId === chosen
        ? { ...previous, checking: true }
        : { state: 'loading', targetId: chosen },
    );
    const ask = (): void => {
      askReport(chosen, controller.signal).then(
        (move) => {
          if (!controller.signal.aborted) {
            setState({ state: 'ready', targetId: chosen, move, checking: false });
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          if (isStale(error) && tries < STALE_RETRIES) {
            tries += 1;
            setTimeout(ask, 50);
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          setState({ state: 'failed', targetId: chosen, message });
        },
      );
    };
    ask();
    return () => controller.abort();
    // `project` is a dependency on purpose: a new project state asks again.
  }, [chosen, askReport, project]);

  useEffect(() => {
    if (loadSaved === undefined) return;
    let live = true;
    loadSaved().then(
      (list) => {
        if (live) setSaved(list);
      },
      () => {
        if (live) setSaved([]);
      },
    );
    return () => {
      live = false;
    };
  }, [loadSaved]);

  const current = targets.find((target) => target.id === currentTargetId);
  const ready = state.state === 'ready' && state.targetId === chosen ? state : null;
  const chosenTarget = targets.find((target) => target.id === chosen);
  const versions = useMemo(
    () => Object.fromEntries(targets.map((target) => [target.id, target.mcVersion])),
    [targets],
  );
  const savedMove =
    view.kind === 'saved' ? saved?.find((entry) => entry.folder === view.folder) : undefined;
  const savedOpen = useMemo(() => {
    if (savedMove?.report === undefined || project === null) return undefined;
    const open = openItems(
      savedMove.report,
      props.problems ?? [],
      project,
      new Set(savedMove.ticked),
    );
    return new Set(open.map((item) => item.id));
  }, [savedMove, project, props.problems]);

  const reportProps = {
    project,
    ids: more,
    versions,
    ...(props.onShow === undefined ? {} : { onShow: props.onShow }),
    ...(props.onAsk === undefined ? {} : { onAsk: props.onAsk }),
  };
  const moveLabel =
    chosenTarget === undefined
      ? 'Move my mod'
      : `Move my mod to Minecraft ${chosenTarget.mcVersion}`;
  const canMove = view.kind === 'move' && ready !== null && !ready.checking;
  const shown = ready === null ? null : (props.shownReport?.(ready.targetId, ready.move) ?? null);

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          aria-describedby={undefined}
          data-testid="upgrade-target-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border bg-panel text-text shadow-lg"
        >
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (canMove) props.onMove(ready.targetId, ready.move);
            }}
          >
            <div className="flex min-h-0 flex-col gap-2 overflow-auto p-4">
              <Dialog.Title className="text-base font-semibold">
                {view.kind === 'saved' ? WHAT_CHANGED_TITLE : UPGRADE_TARGET_TITLE}
              </Dialog.Title>
              {view.kind === 'move' ? (
                <>
                  <p className="text-sm" data-testid="upgrade-target-intro">
                    Your mod is made for{' '}
                    <span data-testid="upgrade-target-current">
                      {current === undefined ? 'another Minecraft version' : targetLabel(current)}
                    </span>
                    . Choose the version to move it to: MCSuperMods changes what that version needs
                    and lists what you must check. A copy of your mod as it is now is kept, and Undo
                    moves it back.
                  </p>
                  {offered.length === 0 ? (
                    <p className="text-muted text-sm" data-testid="upgrade-target-none">
                      There is no other Minecraft version to move this mod to.
                    </p>
                  ) : (
                    <fieldset className="flex flex-wrap gap-1">
                      <legend className="mb-1 text-sm">Minecraft version</legend>
                      {offered.map((target) => (
                        <Button
                          key={target.id}
                          type="button"
                          aria-pressed={chosen === target.id}
                          data-testid={`upgrade-target-${target.id}`}
                          className={`flex items-center justify-between gap-2 text-left ${chosen === target.id ? 'border-accent' : ''}`}
                          onClick={() => setChosen(target.id)}
                        >
                          <span>
                            {targetLabel(target)}
                            {more && <span className="text-muted"> ({target.id})</span>}
                          </span>
                          {target.channel === 'snapshot' && (
                            <span
                              className="rounded border border-border px-1 text-[0.7rem] text-muted"
                              title="A test version of Minecraft"
                              data-testid={`upgrade-target-${target.id}-snapshot`}
                            >
                              snapshot
                            </span>
                          )}
                        </Button>
                      ))}
                    </fieldset>
                  )}
                  {chosen !== null && state.state === 'loading' && (
                    <p
                      className="text-muted text-sm"
                      role="status"
                      data-testid="upgrade-target-loading"
                    >
                      Checking your mod…
                    </p>
                  )}
                  {state.state === 'failed' && state.targetId === chosen && (
                    <p className="whitespace-pre-line text-error text-sm" role="alert">
                      {`Could not work out what moving your mod would change: ${state.message}`}
                    </p>
                  )}
                  {ready !== null && (
                    <section
                      aria-live="polite"
                      className="flex flex-col gap-2"
                      data-testid="upgrade-target-preview"
                    >
                      <p className="font-medium text-sm" data-testid="upgrade-report-summary">
                        {moveSummary(shown ?? ready.move.report)}
                        {ready.checking && (
                          <span
                            className="ml-2 font-normal text-muted"
                            data-testid="upgrade-report-checking"
                          >
                            Checking again…
                          </span>
                        )}
                      </p>
                      <Suspense fallback={<p className="text-muted text-sm">Checking your mod…</p>}>
                        <UpgradeReportView
                          {...reportProps}
                          report={shown ?? ready.move.report}
                          made={false}
                          testVersion={chosenTarget?.channel === 'snapshot'}
                          {...(props.extras?.(ready.targetId, ready.move, { choose: setChosen }) ??
                            {})}
                        />
                      </Suspense>
                    </section>
                  )}
                  {saved !== null && saved.length > 0 && (
                    <section
                      aria-label={WHAT_CHANGED_TITLE}
                      className="flex flex-col gap-1"
                      data-testid="upgrade-saved"
                    >
                      <h3 className="font-semibold text-sm">{WHAT_CHANGED_TITLE}</h3>
                      <ul className="flex flex-col gap-0.5">
                        {saved.map((entry, index) => (
                          <li key={entry.folder}>
                            <button
                              type="button"
                              className="cursor-pointer text-accent text-sm underline-offset-2 hover:underline"
                              data-testid={`upgrade-saved-${index}`}
                              onClick={() => setView({ kind: 'saved', folder: entry.folder })}
                            >
                              {`From Minecraft ${entry.from.mcVersion} to ${entry.to.mcVersion}, ${dayOf(entry.movedAt)}`}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              ) : (
                <SavedView
                  saved={saved}
                  move={savedMove}
                  open={savedOpen}
                  reportProps={reportProps}
                  onFix={props.onFix}
                  targets={targets}
                />
              )}
              <MoreOptions storageKey={MORE_KEY} open={more} onOpenChange={setMore}>
                <p className="text-muted text-xs" data-testid="upgrade-target-ids">
                  {`The lists above show the ids of the things they name. This mod's version id: ${currentTargetId}.`}
                </p>
                {view.kind === 'move' && ready !== null && (
                  <p className="text-muted text-xs">
                    {'What the move applies: '}
                    <span data-testid="upgrade-target-summary">
                      {upgradeSummary(ready.move.migration)}
                    </span>
                    {severityCounts(ready.move.migration)}
                  </p>
                )}
                {view.kind === 'saved' && savedMove !== undefined && (
                  <p className="text-muted text-xs" data-testid="upgrade-saved-folder">
                    {`Kept in ${savedMove.folder} (${savedMove.from.targetId} to ${savedMove.to.targetId}).`}
                  </p>
                )}
              </MoreOptions>
            </div>
            <div className="flex flex-wrap gap-1.5 border-border border-t px-4 py-2">
              {view.kind === 'move' ? (
                <>
                  <Button
                    type="submit"
                    disabled={!canMove}
                    data-testid="upgrade-target-dialog-submit"
                  >
                    {moveLabel}
                  </Button>
                  <Dialog.Close asChild>
                    <Button data-testid="upgrade-target-dialog-cancel">Not now</Button>
                  </Dialog.Close>
                </>
              ) : (
                <>
                  {offered.length > 0 && (
                    <Button
                      data-testid="upgrade-saved-back"
                      onClick={() => setView({ kind: 'move' })}
                    >
                      {UPGRADE_TARGET_TITLE}
                    </Button>
                  )}
                  <Dialog.Close asChild>
                    <Button data-testid="upgrade-target-dialog-cancel">Close</Button>
                  </Dialog.Close>
                </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog.Portal>
    </DialogRoot>
  );
}

/** A saved move's report (**What changed when I moved**), with the items fixed since marked. */
function SavedView(props: {
  saved: readonly SavedMove[] | null;
  move: SavedMove | undefined;
  open: ReadonlySet<string> | undefined;
  reportProps: {
    project: Project | null;
    ids: boolean;
    versions: Readonly<Record<string, string>>;
    onShow?(elementId: string, path?: string): void;
    onAsk?(problem: Problem): void;
  };
  onFix?: ((problem: Problem, fix: PlainFix) => void) | undefined;
  targets: readonly TargetFacts[];
}) {
  const { move } = props;
  if (props.saved === null) {
    return (
      <p className="text-muted text-sm" role="status">
        Reading the moves you made…
      </p>
    );
  }
  if (move === undefined) {
    return (
      <p className="text-sm" data-testid="upgrade-saved-missing">
        MCSuperMods has no record of that move any more: it keeps the three newest.
      </p>
    );
  }
  const to = props.targets.find((target) => target.id === move.to.targetId);
  return (
    <section className="flex flex-col gap-2" data-testid="upgrade-saved-report">
      <p className="font-medium text-sm" data-testid="upgrade-report-summary">
        {savedSummary(move.from.mcVersion, move.to.mcVersion, move.movedAt)}
      </p>
      {move.report === undefined ? (
        <p className="text-sm" data-testid="upgrade-saved-no-report">
          This move was made before its report was ready, so there is no report to show. The copy of
          your mod as it was is kept.
        </p>
      ) : (
        <Suspense fallback={<p className="text-muted text-sm">Opening the report…</p>}>
          <UpgradeReportView
            {...props.reportProps}
            report={move.report}
            made
            testVersion={to?.channel === 'snapshot'}
            {...(props.open === undefined ? {} : { open: props.open })}
            {...(props.onFix === undefined ? {} : { onFix: props.onFix })}
          />
        </Suspense>
      )}
    </section>
  );
}
