/**
 * The Script Studio (B137b, ADR 0032 D5): the TypeScript source of an `msm:script` element
 * (`{ lines }`) in Monaco with the TypeScript language and the runtime typings (lazy-loaded),
 * or a `<textarea>` when Monaco is disabled. Edits are debounced and reported as one `/lines`
 * change per pause, coalesced into one undo step while typing (`script-source`). Under the
 * editor: the session's problems for the script (line problems as buttons that move the caret
 * there) and an "Events and handlers" summary found textually.
 *
 * @packageDocumentation
 */

import type { Problem } from '@msm/core';
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { problemLine, splitLines } from '../../components/function-editor/source-text';
import { useDebouncedLines } from '../../components/function-editor/use-debounced-lines';
import { monacoDisabled } from '../../components/RawJsonPanel';
import { scriptModelUri } from '../../components/script-editor/monaco-typescript';
import { TextareaScriptEditor } from '../../components/script-editor/TextareaScriptEditor';
import type {
  ScriptFocus,
  ScriptProblem,
  ScriptSourceEditorProps,
} from '../../components/script-editor/types';
import type { StudioProps } from '../types';
import { useScriptStudioHost } from './host';
import { scriptLinesOf, summariseScript } from './script-model';

/** Monaco and the TypeScript language load on demand. */
const MonacoScriptEditor = lazy(() => import('../../components/script-editor/MonacoScriptEditor'));

/** Pause after the last keystroke before the edit is reported. */
export const SCRIPT_EDIT_DEBOUNCE_MS = 150;

/** Coalescing key: consecutive source edits form one undo step. */
export const SCRIPT_SOURCE_COALESCE = 'script-source';

/** The accessible name of the source editor. */
export const SCRIPT_SOURCE_LABEL = 'Script source';

/** Where completions come from (shown in the Studio header). */
export const SCRIPT_TYPINGS_NOTE = 'Completions come from msm-runtime.d.ts, also written to .msm/.';

/** Shown in the summary when a script registers nothing. */
export const SCRIPT_SUMMARY_EMPTY = 'This script registers no events or handlers yet.';

/** Maps session problems to the editor's shape (`/lines/<n>` plus `range`). */
export function scriptProblems(problems: readonly Problem[]): ScriptProblem[] {
  return problems.map((problem) => ({
    path: problem.path ?? '',
    message: problem.message,
    severity: problem.severity,
    range: problem.range,
  }));
}

/**
 * Whether Monaco's own TypeScript diagnostics already show a session problem: the session's
 * TypeScript check reports the same syntax and type errors, so only the other problems
 * (scripting validators) become extra markers.
 */
export function isTypeScriptProblem(problem: Pick<Problem, 'code'>): boolean {
  return problem.code.startsWith('typescript');
}

const LINE_POINTER = /^\/lines\/(\d+)(?:\/|$)/;

/** The line a pointer addresses (`/lines/<n>`), or `null`. */
export function scriptFocusLine(pointer: string | null): number | null {
  if (pointer === null) return null;
  const match = LINE_POINTER.exec(pointer);
  return match === null ? null : Number(match[1]);
}

function SourceEditor(props: ScriptSourceEditorProps) {
  if (monacoDisabled()) return <TextareaScriptEditor {...props} />;
  return (
    <Suspense fallback={<TextareaScriptEditor {...props} />}>
      <MonacoScriptEditor {...props} />
    </Suspense>
  );
}

function severityClass(severity: Problem['severity']): string {
  if (severity === 'error') return 'text-error';
  if (severity === 'warning') return 'text-warning';
  return 'text-muted';
}

interface ScriptEditorViewProps extends StudioProps {
  lines: readonly string[];
}

function ScriptEditorView(props: ScriptEditorViewProps) {
  const { element, sessionProblems, focusPointer, onFocused, onChange, lines } = props;
  const { typings } = useScriptStudioHost();
  const editorId = useId();
  const { draft, edit } = useDebouncedLines(
    lines,
    onChange,
    SCRIPT_SOURCE_COALESCE,
    SCRIPT_EDIT_DEBOUNCE_MS,
  );

  // Focus from the Problems panel (`/lines/<n>` with a caret column) or the list below.
  const [focus, setFocus] = useState<ScriptFocus | null>(null);
  const pointerLine = scriptFocusLine(focusPointer);
  useEffect(() => {
    if (focusPointer !== null && pointerLine === null) onFocused();
  }, [focusPointer, pointerLine, onFocused]);
  const focusColumn = props.focusColumn;
  const focusKey = pointerLine === null ? null : `${pointerLine}:${focusColumn ?? 0}`;
  useEffect(() => {
    if (focusKey === null) return;
    const [line = 0, column = 0] = focusKey.split(':').map(Number);
    setFocus(column === 0 ? { line } : { line, column });
  }, [focusKey]);
  const focused = useCallback(() => {
    setFocus(null);
    onFocused();
  }, [onFocused]);

  const listed = useMemo(() => scriptProblems(sessionProblems), [sessionProblems]);
  const markers = useMemo(
    () => scriptProblems(sessionProblems.filter((problem) => !isTypeScriptProblem(problem))),
    [sessionProblems],
  );
  const summary = useMemo(() => summariseScript(splitLines(draft)), [draft]);

  return (
    <section
      aria-label="Script"
      data-testid="script-studio"
      className="flex min-h-0 flex-1 flex-col gap-2 px-2"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-medium font-mono text-sm" data-testid="script-id">
          {element.id}
        </h2>
        <p className="text-muted text-xs" data-testid="script-typings-note">
          Typings: {SCRIPT_TYPINGS_NOTE}
        </p>
      </header>
      <div data-testid="script-editor" className="flex min-h-0 flex-1 flex-col">
        <SourceEditor
          id={editorId}
          value={draft}
          onChange={edit}
          label={SCRIPT_SOURCE_LABEL}
          modelUri={scriptModelUri(element.id)}
          typings={typings}
          problems={markers}
          focus={focus}
          onFocused={focused}
        />
      </div>
      {listed.length > 0 && (
        <ul
          aria-label="Script problems"
          data-testid="script-problems"
          className="flex flex-col gap-0.5 text-xs"
        >
          {listed.map((problem, index) => {
            const line = problemLine(problem);
            return (
              <li
                key={index}
                data-severity={problem.severity}
                className={severityClass(problem.severity)}
              >
                {line === undefined ? (
                  problem.message
                ) : (
                  <button
                    type="button"
                    data-testid="problem-line"
                    className="text-left hover:underline"
                    onClick={() =>
                      setFocus(
                        problem.range === undefined
                          ? { line }
                          : { line, column: problem.range.start },
                      )
                    }
                  >
                    Line {line + 1}: {problem.message}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <section
        aria-label="Events and handlers"
        data-testid="script-summary"
        className="flex flex-col gap-1 text-xs"
      >
        <h3 className="font-medium text-sm">Events and handlers</h3>
        {summary.events.length === 0 && summary.handlers.length === 0 ? (
          <p className="text-muted">{SCRIPT_SUMMARY_EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {summary.events.map((name) => (
              <li key={`event:${name}`} data-testid="script-summary-event">
                Event <code className="font-mono">{name}</code>
              </li>
            ))}
            {summary.handlers.map((handler) => (
              <li key={`handler:${handler}`} data-testid="script-summary-handler">
                Handler <code className="font-mono">{handler}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/** The Script Studio for one `msm:script` element. */
export function ScriptStudio(props: StudioProps) {
  const lines = scriptLinesOf(props.element.data) ?? [];
  // Keyed by element so a pending edit is flushed to the right element on switch.
  return <ScriptEditorView key={props.element.id} {...props} lines={lines} />;
}
