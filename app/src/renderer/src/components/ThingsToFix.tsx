/**
 * "Things to fix" (ADR 0083 D5): Very easy mode's strip in place of the Problems panel. One line
 * per error in plain words (`session/plain-problems.ts`), naming the thing by its display name,
 * with "Show me" (opens the thing at the field) and "Fix it" where one step fixes it; codes the
 * table lacks read "Something in <thing> needs fixing" with "Show details" for the original
 * message. Warnings and info are folded under "Tips". With the AI helper, each row also offers
 * "Ask the helper" (ADR 0125 D11), which opens the helper with the problem attached and sends
 * nothing. Presentational: the host opens things, runs the fixes and asks the helper.
 *
 * @packageDocumentation
 */

import type { Problem, Project } from '@msm/core';
import { CircleAlert, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import {
  PLAIN_FIX_LABELS,
  type PlainFix,
  plainProblem,
  problemThingName,
} from '../session/plain-problems';

/** Props of {@link ThingsToFix}. */
export interface ThingsToFixProps {
  project: Project | null;
  /** The live problems and the last Play or Share problems; duplicates are shown once. */
  problems: readonly Problem[];
  /** Opens the thing a problem is on, at its field. */
  onShow(problem: Problem): void;
  /** Runs a one-step fix; without it no "Fix it" buttons are shown. */
  onFix?(problem: Problem, fix: PlainFix): void;
  /** Opens the AI helper with the problem attached (sends nothing); without it no "Ask the helper". */
  onAsk?(problem: Problem): void;
}

/** The label of the row's button that asks the AI helper about the problem. */
export const ASK_THE_HELPER = 'Ask the helper';

/** The problems without repeats (same code, thing, place and message), errors first. */
export function uniqueProblems(problems: readonly Problem[]): Problem[] {
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const problem of problems) {
    const key = [problem.code, problem.elementId ?? '', problem.path ?? '', problem.message].join(
      '\u0000',
    );
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(problem);
  }
  return out;
}

const linkClass =
  'cursor-pointer rounded px-1.5 py-0.5 text-xs text-accent underline-offset-2 hover:underline';

function Row(props: {
  project: Project | null;
  problem: Problem;
  testId: string;
  onShow(problem: Problem): void;
  onFix?: ((problem: Problem, fix: PlainFix) => void) | undefined;
  onAsk?: ((problem: Problem) => void) | undefined;
}) {
  const { problem, testId } = props;
  const [details, setDetails] = useState(false);
  const plain = plainProblem(problem, problemThingName(props.project, problem));
  return (
    <li className="flex flex-col gap-0.5" data-testid={testId} data-code={problem.code}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-sm" data-testid={`${testId}-text`}>
          {plain.text}
        </span>
        {problem.elementId !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid={`${testId}-show`}
            onClick={() => props.onShow(problem)}
          >
            Show me
          </button>
        )}
        {plain.fix !== undefined && props.onFix !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid={`${testId}-fix`}
            onClick={() => {
              if (plain.fix !== undefined) props.onFix?.(problem, plain.fix);
            }}
          >
            Fix it: {PLAIN_FIX_LABELS[plain.fix]}
          </button>
        )}
        {!plain.known && (
          <button
            type="button"
            className={linkClass}
            aria-expanded={details}
            data-testid={`${testId}-details`}
            onClick={() => setDetails((open) => !open)}
          >
            {details ? 'Hide details' : 'Show details'}
          </button>
        )}
        {props.onAsk !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid={`${testId}-ask`}
            onClick={() => props.onAsk?.(problem)}
          >
            {ASK_THE_HELPER}
          </button>
        )}
      </div>
      {details && (
        <p className="pl-2 text-muted text-xs" data-testid={`${testId}-message`}>
          {problem.message}
        </p>
      )}
    </li>
  );
}

/** The "Things to fix" strip. */
export function ThingsToFix(props: ThingsToFixProps) {
  const unique = uniqueProblems(props.problems);
  const errors = unique.filter((problem) => problem.severity === 'error');
  const tips = unique.filter((problem) => problem.severity !== 'error');
  return (
    <section
      aria-label="Things to fix"
      data-testid="things-to-fix"
      className="flex max-h-48 flex-col gap-1 overflow-auto border-t border-border bg-panel px-3 py-2"
    >
      <h2 className="flex items-center gap-1 font-medium text-sm">
        <CircleAlert size={14} aria-hidden />
        {errors.length === 0 ? 'Nothing to fix' : `Things to fix (${errors.length})`}
      </h2>
      {errors.length === 0 ? (
        <p className="text-muted text-xs" data-testid="things-to-fix-none">
          Everything is ready to play.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {errors.map((problem, index) => (
            <Row
              key={`${problem.code}-${problem.elementId ?? ''}-${problem.path ?? ''}-${index}`}
              project={props.project}
              problem={problem}
              testId={`things-to-fix-${index}`}
              onShow={props.onShow}
              onFix={props.onFix}
              onAsk={props.onAsk}
            />
          ))}
        </ul>
      )}
      {tips.length > 0 && (
        <details data-testid="things-to-fix-tips">
          <summary className="flex cursor-pointer items-center gap-1 text-muted text-xs">
            <Lightbulb size={12} aria-hidden />
            Tips ({tips.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {tips.map((problem, index) => (
              <Row
                key={`${problem.code}-${problem.elementId ?? ''}-${problem.path ?? ''}-${index}`}
                project={props.project}
                problem={problem}
                testId={`things-to-fix-tip-${index}`}
                onShow={props.onShow}
                onFix={props.onFix}
                onAsk={props.onAsk}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
