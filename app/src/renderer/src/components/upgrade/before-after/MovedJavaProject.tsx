/**
 * **If you exported a Java project** for a move's report (ADR 0136 D8, B822's part, wired by
 * B819 at the orchestrator's request): the two targets and the change sets of the move's hops
 * up, handed to `parts/JavaProject` with the platform's read-only scan and save dialog. Shown for
 * a move up only; moving back writes no notes.
 *
 * @packageDocumentation
 */

import type { TargetChangeSet } from '@msm/plugin-api';
import { useMemo } from 'react';
import type { MoveReport } from '../../UpgradeTargetDialog';
import { JavaProject, type JavaProjectProps } from '../parts/JavaProject';
import type { UpgradeViewsHost } from './host';

/** Props of {@link MovedJavaProject}. */
export interface MovedJavaProjectProps {
  readonly host: UpgradeViewsHost;
  readonly move: MoveReport;
  /** The platform's read-only scan (`exports.scanJavaProject`). */
  readonly scanJavaProject?: JavaProjectProps['scanJavaProject'];
  /** The platform's save dialog (`dialogs.saveFile`). */
  readonly saveFile: JavaProjectProps['saveFile'];
}

/** The part for a move up; nothing otherwise. */
export function MovedJavaProject({ host, move, scanJavaProject, saveFile }: MovedJavaProjectProps) {
  const hops = move.hops ?? [];
  const up = hops.length > 0 && hops.every((hop) => hop.direction === 'up');
  // The same as `changeSetsOf(chain.steps)`: the change set of each hop's target, in order.
  const changeSets = useMemo(
    () =>
      hops.flatMap((hop): TargetChangeSet[] => {
        const changes = host.targetOf(hop.to)?.changes;
        return hop.direction === 'up' && changes !== undefined ? [changes] : [];
      }),
    [hops, host],
  );
  const from = host.targetOf(move.report.from.targetId);
  const to = host.targetOf(move.report.to.targetId);
  if (!up || from === undefined || to === undefined) return null;
  return (
    <JavaProject
      from={from}
      to={to}
      changeSets={changeSets}
      scanJavaProject={scanJavaProject}
      saveFile={saveFile}
    />
  );
}
