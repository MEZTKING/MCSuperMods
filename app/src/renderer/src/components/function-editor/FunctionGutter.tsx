/**
 * The Function editor's marks of what Try it does with each line (B613, ADR 0120 D8):
 *
 * - {@link TextareaGutter}: the column of marks beside the `<textarea>` editor (Monaco draws the
 *   same marks in its own glyph margin, `MonacoFunctionEditor`), kept level with the text as it
 *   scrolls.
 * - {@link FunctionRunBar}: under either editor, how many lines run in Try it, each line that does
 *   not with its reason in plain words, and **Run in Try it** (with a box for the values of macro
 *   lines when the function has some).
 *
 * @packageDocumentation
 */

import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import {
  type LineMark,
  marksSummary,
  ONLY_WORDS,
  RUN_IN_TRY_IT_WORDS,
  RUNS_WORDS,
} from './line-marks';

/** The mark's glyph: a filled dot runs, a hollow ring is only in the game. */
export function markGlyph(mark: LineMark): string {
  return mark.runs ? '●' : '○';
}

/** Props of {@link TextareaGutter}. */
export interface TextareaGutterProps {
  readonly marks: readonly LineMark[] | null;
  /** How many source lines the editor shows. */
  readonly lineCount: number;
  /** The editor's scroll offset, so the marks stay level with their lines. */
  readonly scrollTop: number;
}

/** The marks beside the `<textarea>` editor, one row per source line. */
export function TextareaGutter({ marks, lineCount, scrollTop }: TextareaGutterProps) {
  const byLine = new Map((marks ?? []).map((mark) => [mark.line, mark]));
  const rows = Array.from({ length: Math.max(1, lineCount) }, (_unused, line) => line);
  return (
    <div
      data-testid="function-gutter"
      aria-hidden="true"
      className="w-5 shrink-0 overflow-hidden py-[calc(0.375rem+1px)] text-center font-mono text-sm leading-5"
    >
      <div style={{ transform: `translateY(${-scrollTop}px)` }}>
        {rows.map((line) => {
          const mark = byLine.get(line);
          return (
            <div
              key={line}
              data-testid={mark === undefined ? undefined : 'function-line-mark'}
              data-line={line}
              data-runs={mark === undefined ? undefined : String(mark.runs)}
              title={mark?.words}
              className={`h-5 ${mark?.runs === false ? 'text-warning' : 'text-accent'}`}
            >
              {mark === undefined ? '' : markGlyph(mark)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Props of {@link FunctionRunBar}. */
export interface FunctionRunBarProps {
  readonly marks: readonly LineMark[] | null;
  /** The function's id, or `undefined` when the editor does not know it (no Run in Try it). */
  readonly functionId?: string | undefined;
  /** Runs the function in Try it, with the macro values typed (if any). */
  onRun?(id: string, values: string): void;
}

/** Under the editor: what runs in Try it, what does not and why, and Run in Try it. */
export function FunctionRunBar({ marks, functionId, onRun }: FunctionRunBarProps) {
  const valuesId = useId();
  const [values, setValues] = useState('');
  if (marks === null) {
    return (
      <p data-testid="function-run-summary" className="text-xs text-muted">
        Reading what Try it can run…
      </p>
    );
  }
  const { runs, lines } = marksSummary(marks);
  const notRun = marks.filter((mark) => !mark.runs && mark.continues === undefined);
  const macro = marks.some((mark) => mark.macro === true);
  return (
    <div data-testid="function-run-bar" className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="function-run-summary" data-runs={runs} data-lines={lines}>
          {lines === 0
            ? 'No commands yet.'
            : runs === lines
              ? `${RUNS_WORDS}: every line (${lines}).`
              : `${RUNS_WORDS}: ${runs} of ${lines} lines. The rest are said in What happened.`}
        </span>
        {functionId !== undefined && onRun !== undefined && (
          <>
            {macro && (
              <label htmlFor={valuesId} className="flex items-center gap-1">
                <span>Values for the macro lines</span>
                <input
                  id={valuesId}
                  data-testid="function-run-values"
                  className="w-48 rounded border border-border bg-bg px-1 py-0.5 font-mono"
                  placeholder='{n:7,item:"emerald"}'
                  value={values}
                  onChange={(event) => setValues(event.target.value)}
                />
              </label>
            )}
            <Button
              data-testid="function-run-in-tryit"
              title="Opens Try it and runs this function at you, as /function does"
              onClick={() => onRun(functionId, values)}
            >
              {RUN_IN_TRY_IT_WORDS}
            </Button>
          </>
        )}
      </div>
      {notRun.length > 0 && (
        <ul
          aria-label={ONLY_WORDS}
          data-testid="function-not-run"
          className="flex flex-col gap-0.5"
        >
          {notRun.map((mark) => (
            <li key={mark.line} data-line={mark.line} className="text-warning">
              {`Line ${mark.line + 1}: ${mark.words}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
