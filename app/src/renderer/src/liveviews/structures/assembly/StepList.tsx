/**
 * The list of an assembly's steps (ADR 0122 D5; B640): each piece placed, each piece tried and
 * refused with its reason in plain words, a jigsaw left empty, and how the assembly ended. Names
 * are words made from the ids; the ids themselves only in Advanced (Very easy shows none). The
 * newest piece is marked: the two jigsaw blocks that met are the lit ones in the 3D view.
 */

import type { ViewStep } from './client';
import { idWords, pieceWords, REFUSAL_WORDS, stoppedLine } from './steps';

/** The most steps the list draws (the newest); the rest are counted. */
export const STEPS_DRAWN = 300;

/** Props of {@link StepList}. */
export interface StepListProps {
  /** The steps shown so far, oldest first. */
  readonly steps: readonly ViewStep[];
  /** Ids after the words (Advanced only). */
  readonly advanced: boolean;
}

function line(step: ViewStep, advanced: boolean, newest: boolean): string {
  switch (step.kind) {
    case 'placed': {
      const { piece } = step;
      const name = pieceWords(piece, advanced);
      const joined =
        piece.parent === null ? 'the start piece' : `joined to piece ${piece.parent + 1}`;
      const pool = advanced ? `, from ${piece.pool}` : '';
      const lit = newest && step.met !== null ? '; the two jigsaw blocks that met are lit' : '';
      return `Piece ${piece.index + 1}: ${name}, ${joined}${pool}${lit}.`;
    }
    case 'refused': {
      const what =
        step.template === null
          ? `A piece from ${idWords(step.pool, advanced)}`
          : idWords(step.template, advanced);
      const at = step.parent < 0 ? 'at the start' : `on piece ${step.parent + 1}`;
      return `Tried ${what} ${at}: ${REFUSAL_WORDS[step.reason]}`;
    }
    case 'tried':
      return step.parent < 0
        ? 'The start was left empty.'
        : `A jigsaw on piece ${step.parent + 1} was left empty (the pool’s empty piece).`;
    case 'stopped':
      return step.reason === 'piece_limit'
        ? stoppedLine(step.pieces)
        : `Done: ${step.pieces} ${step.pieces === 1 ? 'piece' : 'pieces'}.`;
  }
}

/** The step list; see the module comment. */
export function StepList({ steps, advanced }: StepListProps) {
  // A tried step with a piece is always answered by the step after it; only empty picks show.
  const shown = steps.filter((step) => step.kind !== 'tried' || step.template === null);
  const drawn = shown.slice(-STEPS_DRAWN);
  const hidden = shown.length - drawn.length;
  let newestPlaced = -1;
  for (let i = drawn.length - 1; i >= 0; i -= 1) {
    if (drawn[i]?.kind === 'placed') {
      newestPlaced = i;
      break;
    }
  }
  if (shown.length === 0) {
    return (
      <p data-testid="assembly-steps-empty" className="text-sm text-muted">
        No pieces yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {hidden > 0 && <p className="text-xs text-muted">{`${hidden} earlier steps not listed.`}</p>}
      <ol
        aria-label="Steps"
        data-testid="assembly-steps"
        className="flex max-h-72 flex-col gap-0.5 overflow-y-auto text-xs [overflow-wrap:anywhere]"
      >
        {drawn.map((step, index) => (
          <li
            key={hidden + index}
            data-testid="assembly-step"
            data-kind={step.kind}
            data-newest={index === newestPlaced ? 'true' : undefined}
            {...(step.kind === 'refused' ? { 'data-reason': step.reason } : {})}
            className={
              step.kind === 'refused'
                ? 'text-muted'
                : index === newestPlaced
                  ? 'font-medium'
                  : undefined
            }
          >
            {line(step, advanced, index === newestPlaced)}
          </li>
        ))}
      </ol>
    </div>
  );
}
