/**
 * The function editor: the source of a `minecraft:function` element (`{ lines }`) in Monaco
 * with the `mcfunction` language (lazy-loaded), or a `<textarea>` when Monaco is disabled.
 * Edits are debounced and reported as one `/lines` change per pause, coalesced into one undo
 * step while typing. Presentational: props and callbacks only.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { joinLines, problemLine, splitLines } from '../components/function-editor/source-text';
import { TextareaFunctionEditor } from '../components/function-editor/TextareaFunctionEditor';
import type {
  CompleteFunction,
  FunctionProblem,
  FunctionSourceEditorProps,
} from '../components/function-editor/types';
import { monacoDisabled } from '../components/RawJsonPanel';
import type { ChangeOptions } from '../forms';

export type {
  CompleteFunction,
  FunctionCompletion,
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
}: FunctionEditorProps) {
  const source = joinLines(lines);
  const [draft, setDraft] = useState(source);
  const [shownSource, setShownSource] = useState(source);
  const editorId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  /** Sources this editor reported; their echo through `lines` must not reset the draft. */
  const reported = useRef(new Set<string>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    pending.current = null;
    if (text === null) return;
    reported.current.add(text);
    onChangeRef.current('/lines', splitLines(text), { coalesce: FUNCTION_SOURCE_COALESCE });
  }, []);

  // Report a pending edit when the editor goes away (element switch, Studio closed).
  useEffect(() => flush, [flush]);

  if (source !== shownSource) {
    setShownSource(source);
    if (reported.current.has(source)) {
      reported.current.delete(source);
    } else if (pending.current === null) {
      // Changed elsewhere (undo, Raw JSON, a rename): show it.
      reported.current.clear();
      setDraft(source);
    }
  }

  const edit = (text: string) => {
    setDraft(text);
    pending.current = text;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, FUNCTION_EDIT_DEBOUNCE_MS);
  };

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
      />
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
