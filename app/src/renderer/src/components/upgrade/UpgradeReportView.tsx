/**
 * The upgrade report (ADR 0136 D4, D15; B818): the six parts in plain words and the line on
 * what does not touch the mod. Empty parts are hidden; a mod nothing touches gets one sentence
 * and the in-game list. Ids, paths and registry names show only while `ids` is set (the
 * dialog's More options). The dialog loads this view as a lazy chunk.
 *
 * Presentational: the dialog hands it a report (a dry run's, or a saved move's) and the host's
 * Show me, Fix it and Ask the helper.
 *
 * @packageDocumentation
 */

import type { Problem, Project, UpgradeDoneItem, UpgradeReport } from '@msm/core';
import type { ReactNode } from 'react';
import type { PlainFix } from '../../session/plain-problems';
import { AddedPart } from './parts/AddedPart';
import { ChangedPart } from './parts/ChangedPart';
import { DonePart } from './parts/DonePart';
import { InGamePart } from './parts/InGamePart';
import { PlayersPart } from './parts/PlayersPart';
import { Raw, ReportContext, type ReportContextValue } from './parts/shared';
import { TodoPart } from './parts/TodoPart';
import { nothingTouchesSentence, untouchedSentence } from './sentences';

/** Props of {@link UpgradeReportView}. */
export interface UpgradeReportViewProps {
  /** The report. */
  report: UpgradeReport;
  /** The project, for the things' names. */
  project: Project | null;
  /** Whether ids, paths and registry names show. */
  ids: boolean;
  /** Whether the move is made (a saved report): past tense, Fix it, items marked done. */
  made: boolean;
  /** Whether the version moved to is a test version. */
  testVersion: boolean;
  /** Minecraft versions by target id, for a chain's changes. */
  versions?: Readonly<Record<string, string>>;
  /** For a saved report: the ids of part 3's items still open now. */
  open?: ReadonlySet<string>;
  onShow?(elementId: string, path?: string): void;
  onFix?(problem: Problem, fix: PlainFix): void;
  onAsk?(problem: Problem): void;
  /** Shown before the parts (moving back: what cannot be put back, B820). */
  lead?: ReactNode;
  /** Shown after the in-game checks (Check on other versions, B820). */
  after?: ReactNode;
  /** Shown under each item of part 2 (its before and after views, B819). */
  doneExtra?(item: UpgradeDoneItem): ReactNode;
}

/** Whether nothing in the mod is touched: no change, nothing done and nothing to do. */
export function nothingTouches(report: UpgradeReport): boolean {
  return (
    report.changed.length === 0 &&
    report.done.length === 0 &&
    report.todo.length === 0 &&
    report.players.exports.length === 0
  );
}

/** The report's parts. */
export default function UpgradeReportView(props: UpgradeReportViewProps) {
  const { report } = props;
  const mcVersion = report.to.mcVersion;
  const versions = props.versions ?? {};
  const context: ReportContextValue = {
    project: props.project,
    ids: props.ids,
    mcVersion,
    versionOf: (targetId) =>
      targetId === undefined ? mcVersion : (versions[targetId] ?? mcVersion),
    made: props.made,
    onShow: props.onShow,
    onFix: props.onFix,
    onAsk: props.onAsk,
    doneExtra: props.doneExtra,
  };
  const nothing = nothingTouches(report);
  return (
    <ReportContext.Provider value={context}>
      <div className="flex flex-col gap-3" data-testid="upgrade-report">
        {props.lead}
        {nothing ? (
          <p className="text-sm" data-testid="upgrade-nothing">
            {nothingTouchesSentence(report.untouched.total, mcVersion)}
          </p>
        ) : (
          <>
            <ChangedPart items={report.changed} />
            <DonePart items={report.done} />
            <TodoPart items={report.todo} open={props.open} />
          </>
        )}
        <PlayersPart players={report.players} testVersion={props.testVersion} />
        <AddedPart added={report.added} />
        <InGamePart inGame={report.inGame} />
        {props.after}
        {!nothing && report.untouched.total > 0 && (
          <p className="text-muted text-sm" data-testid="upgrade-untouched">
            {untouchedSentence(report.untouched.total, mcVersion)}{' '}
            <Raw>
              {Object.entries(report.untouched.byArea)
                .map(([area, total]) => `${area} ${total}`)
                .join(', ')}
            </Raw>
          </p>
        )}
      </div>
    </ReportContext.Provider>
  );
}
