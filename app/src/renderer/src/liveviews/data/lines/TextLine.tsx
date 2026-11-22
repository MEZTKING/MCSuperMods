/** Styled runs of a text component as spans (B611; `text-component.ts`). */

import { cssOfStyle, type TextRun } from './text-component';

/** Props of {@link TextLine}. */
export interface TextLineProps {
  readonly runs: readonly TextRun[];
  readonly testId?: string;
  readonly className?: string;
}

/** The runs, each in its own style; the whole line's words are its text. */
export function TextLine({ runs, testId, className }: TextLineProps) {
  return (
    <span data-testid={testId} className={className}>
      {runs.map((run, index) => (
        <span
          // Runs may repeat; their order is their identity.
          key={index}
          style={cssOfStyle(run.style)}
        >
          {run.text}
        </span>
      ))}
    </span>
  );
}
