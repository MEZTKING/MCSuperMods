/**
 * The frame every games Studio shares (B555): its label and test id, the element's problems at
 * the top in plain words (ADR 0130 D2), and the line of chat commands in the section's More
 * options. Every setting is in `ElementForm`'s "Every setting".
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';
import { InMore } from '../../components/ui/MoreOptions';
import { displayNameOf, plainProblem } from '../../session/plain-problems';
import type { StudioProps } from '../types';

/** Props of {@link GamesStudioShell}. */
export interface GamesStudioShellProps {
  readonly studio: StudioProps;
  /** The Studio's name ("Team Studio"). */
  readonly label: string;
  /** The test id prefix (`team` gives `team-studio`). */
  readonly testId: string;
  readonly children: ReactNode;
}

/** The Studio's frame; see the module comment. */
export function GamesStudioShell(props: GamesStudioShellProps) {
  const { studio, testId } = props;
  return (
    <section
      aria-label={props.label}
      data-testid={`${testId}-studio`}
      className="flex flex-col gap-4"
    >
      <PlainProblems studio={studio} />
      {props.children}
    </section>
  );
}

/** The element's problems in plain words (no ids, ADR 0117 D3, ADR 0130 D2). */
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

/** Chat commands that reach the element in the game, in the section's More options. */
export function CommandLines(props: { lines: readonly string[]; testId: string }) {
  if (props.lines.length === 0) return null;
  return (
    <InMore fallbackKey={props.testId}>
      <div className="flex flex-col gap-0.5 text-muted text-xs" data-testid={props.testId}>
        <span>In chat or a function:</span>
        {props.lines.map((line) => (
          <code key={line} className="font-mono [overflow-wrap:anywhere]">
            {line}
          </code>
        ))}
      </div>
    </InMore>
  );
}
