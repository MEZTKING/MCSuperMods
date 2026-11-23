/**
 * The frame every games Studio shares (B555): its label and test id, "Advanced (all fields)"
 * (the full schema form; hidden in Very easy, where only the Studio's section list shows), the
 * element's problems at the top, and the line of chat commands shown outside Very easy.
 *
 * @packageDocumentation
 */

import { type ReactNode, useState } from 'react';
import { ProblemList } from '../../forms';
import { displayNameOf, plainProblem } from '../../session/plain-problems';
import type { StudioProps } from '../types';
import { useVeryEasy } from '../very-easy';
import { AdvancedToggle } from '../worldgen/parts';

/** Props of {@link GamesStudioShell}. */
export interface GamesStudioShellProps {
  readonly studio: StudioProps;
  /** The Studio's name ("Team Studio"). */
  readonly label: string;
  /** The test id prefix (`team` gives `team-studio` and `team-advanced-toggle`). */
  readonly testId: string;
  readonly children: ReactNode;
}

/** The Studio's frame; see the module comment. */
export function GamesStudioShell(props: GamesStudioShellProps) {
  const { studio, testId } = props;
  const [advanced, setAdvanced] = useState(false);
  const veryEasy = useVeryEasy();
  return (
    <section
      aria-label={props.label}
      data-testid={`${testId}-studio`}
      className="flex flex-col gap-4"
    >
      <AdvancedToggle
        checked={advanced}
        onChange={setAdvanced}
        testId={`${testId}-advanced-toggle`}
      />
      {advanced ? (
        studio.form
      ) : (
        <>
          {veryEasy ? (
            <PlainProblems studio={studio} />
          ) : (
            <ProblemList problems={studio.problems} />
          )}
          {props.children}
        </>
      )}
    </section>
  );
}

/** The element's problems in plain words (Very easy shows no ids, ADR 0117 D3). */
function PlainProblems({ studio }: { studio: StudioProps }) {
  if (studio.sessionProblems.length === 0) return null;
  const thing = displayNameOf(studio.element);
  const lines = [
    ...new Set(studio.sessionProblems.map((problem) => plainProblem(problem, thing).text)),
  ];
  return (
    <ul className="flex flex-col gap-0.5 text-warning text-xs" data-testid="games-plain-problems">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** Chat commands that reach the element in the game, shown outside Very easy only. */
export function CommandLines(props: { lines: readonly string[]; testId: string }) {
  const veryEasy = useVeryEasy();
  if (veryEasy || props.lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 text-muted text-xs" data-testid={props.testId}>
      <span>In chat or a function:</span>
      {props.lines.map((line) => (
        <code key={line} className="font-mono [overflow-wrap:anywhere]">
          {line}
        </code>
      ))}
    </div>
  );
}
