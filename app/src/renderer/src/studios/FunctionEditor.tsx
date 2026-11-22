/**
 * The function editor: the source of a `minecraft:function` element (`{ lines }`) in Monaco
 * with the `mcfunction` language (lazy-loaded), or a `<textarea>` when Monaco is disabled.
 * Edits are debounced and reported as one `/lines` change per pause, coalesced into one undo
 * step while typing. Presentational: props and callbacks only.
 *
 * Beside each line, what Try it does with it (B613, ADR 0120 D8): **Runs in Try it** or **Only in
 * the game** with the reason, in the gutter (Monaco's glyph margin, or a column beside the
 * `<textarea>`) and under the editor, 150 ms after the last keystroke; **Run in Try it** opens Try
 * it and runs the function at the player.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { lazy, Suspense, useId } from 'react';
import { FunctionRunBar } from '../components/function-editor/FunctionGutter';
import { runInTryIt } from '../components/function-editor/run-in-tryit';
import { problemLine } from '../components/function-editor/source-text';
import { TextareaFunctionEditor } from '../components/function-editor/TextareaFunctionEditor';
import type {
  CompleteFunction,
  FunctionFocus,
  FunctionProblem,
  FunctionSourceEditorProps,
} from '../components/function-editor/types';
import { useDebouncedLines } from '../components/function-editor/use-debounced-lines';
import { useLineMarks } from '../components/function-editor/use-line-marks';
import { monacoDisabled } from '../components/RawJsonPanel';
import type { ChangeOptions } from '../forms';

export type {
  CompleteFunction,
  FunctionCompletion,
  FunctionFocus,
  FunctionProblem,
} from '../components/function-editor/types';

/** Monaco and the mcfunction language load on demand. */
const MonacoFunctionEditor = lazy(
  () => import('../components/function-editor/MonacoFunctionEditor'),
);

/** Pause after the last keystroke before the edit is reported. */
export const FUNCTION_EDIT_DEBOUNCE_MS = 150;

/** Coalescing key: consecutive source edits form one undo step. */
export const FUNCTION_SOURCE_COALESCE = 'function-source';

export interface FunctionEditorProps {
  lines: readonly string[];
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  problems?: readonly FunctionProblem[];
  complete?: CompleteFunction;
  /** Accessible name of the editor; default "Function source". */
  label?: string;
  /** A line to move the caret to and focus (Problems navigation), or `null`. */
  focusLine?: FunctionFocus | null;
  /** Called once {@link focusLine} has been handled. */
  onFocused?: () => void;
  /** The function's id (`ns:path`), for **Run in Try it**; without it the button is not shown. */
  functionId?: string;
  /** Runs the function in Try it (default: opens Try it and runs it there, `run-in-tryit.ts`). */
  onRunInTryIt?: (id: string, values: string) => void;
}

const NO_PROBLEMS: readonly FunctionProblem[] = [];

function SourceEditor(props: FunctionSourceEditorProps) {
  if (monacoDisabled()) return <TextareaFunctionEditor {...props} />;
  return (
    <Suspense fallback={<TextareaFunctionEditor {...props} />}>
      <MonacoFunctionEditor {...props} />
    </Suspense>
  );
}

export function FunctionEditor({
  lines,
  onChange,
  problems = NO_PROBLEMS,
  complete,
  label = 'Function source',
  focusLine = null,
  onFocused,
  functionId,
  onRunInTryIt = runInTryIt,
}: FunctionEditorProps) {
  const editorId = useId();
  const { draft, edit } = useDebouncedLines(
    lines,
    onChange,
    FUNCTION_SOURCE_COALESCE,
    FUNCTION_EDIT_DEBOUNCE_MS,
  );

  const marks = useLineMarks(draft);
  const other = problems.filter((problem) => problemLine(problem) === undefined);

  return (
    <section
      aria-label="Function"
      data-testid="function-editor"
      className="flex min-h-0 flex-1 flex-col gap-1 px-2"
    >
      <SourceEditor
        id={editorId}
        value={draft}
        onChange={edit}
        problems={problems}
        complete={complete}
        label={label}
        focus={focusLine}
        onFocused={onFocused}
        marks={marks}
      />
      <FunctionRunBar marks={marks} functionId={functionId} onRun={onRunInTryIt} />
      {other.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs" aria-label="Other function problems">
          {other.map((problem, index) => (
            <li
              key={index}
              data-severity={problem.severity}
              className={problem.severity === 'error' ? 'text-error' : 'text-warning'}
            >
              {problem.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
