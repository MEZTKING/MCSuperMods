import { useEffect, useId, useRef, useState } from 'react';
import { lineOffset, problemLine, snippetToText, tokenStart } from './source-text';
import type { FunctionCompletion, FunctionSourceEditorProps } from './types';

/** At most this many proposals are listed. */
const MAX_SHOWN = 30;

/**
 * Plain `<textarea>` function editor: used when Monaco is disabled (`window.msmNoMonaco`)
 * and while Monaco loads. Ctrl+Space lists completions (Enter or Tab inserts, Escape
 * closes); line problems are listed under the editor.
 */
export function TextareaFunctionEditor({
  id,
  value,
  onChange,
  problems,
  complete,
  label,
  focus,
  onFocused,
}: FunctionSourceEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [items, setItems] = useState<FunctionCompletion[]>([]);
  const [active, setActive] = useState(0);
  const [caretAfter, setCaretAfter] = useState<number | null>(null);
  const request = useRef(0);
  const listId = useId();
  const problemsId = useId();

  useEffect(() => {
    const area = areaRef.current;
    if (focus === null || focus === undefined || area === null) return;
    const offset = lineOffset(area.value, focus.line, focus.column);
    area.focus();
    area.setSelectionRange(offset, offset);
    onFocused?.();
  }, [focus, onFocused]);

  useEffect(() => {
    if (caretAfter === null) return;
    areaRef.current?.setSelectionRange(caretAfter, caretAfter);
    setCaretAfter(null);
  }, [caretAfter]);

  const close = () => {
    request.current++;
    setItems([]);
    setActive(0);
  };

  const open = async () => {
    const area = areaRef.current;
    if (complete === undefined || area === null) return;
    const ticket = ++request.current;
    let found: FunctionCompletion[];
    try {
      found = await complete(area.value, area.selectionStart);
    } catch {
      found = [];
    }
    if (ticket !== request.current) return;
    setItems(found.slice(0, MAX_SHOWN));
    setActive(0);
  };

  const accept = (item: FunctionCompletion) => {
    const area = areaRef.current;
    if (area === null) return;
    const caret = area.selectionStart;
    const lineStart = area.value.lastIndexOf('\n', caret - 1) + 1;
    const start = lineStart + tokenStart(area.value.slice(lineStart, caret), caret - lineStart);
    const text = snippetToText(item.insertText);
    onChange(area.value.slice(0, start) + text + area.value.slice(caret));
    setCaretAfter(start + text.length);
    close();
  };

  const listed = problems.filter((problem) => problemLine(problem) !== undefined);
  const hasError = problems.some((problem) => problem.severity === 'error');
  const shown = items.length > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-1">
      <textarea
        ref={areaRef}
        id={id}
        aria-label={label}
        aria-invalid={hasError}
        aria-describedby={listed.length > 0 ? problemsId : undefined}
        aria-autocomplete="list"
        aria-controls={shown ? listId : undefined}
        data-testid="function-editor-fallback"
        spellCheck={false}
        wrap="off"
        className="min-h-[200px] w-full flex-1 resize-y rounded border border-border bg-bg p-1.5 font-mono text-sm"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (shown) close();
        }}
        onKeyDown={(event) => {
          if (event.key === ' ' && event.ctrlKey) {
            event.preventDefault();
            void open();
            return;
          }
          if (!shown) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((active + 1) % items.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((active - 1 + items.length) % items.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            const item = items[active];
            if (item !== undefined) {
              event.preventDefault();
              accept(item);
            }
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
        onBlur={close}
      />
      {shown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Completions"
          data-testid="function-completions"
          className="absolute top-8 left-2 z-10 max-h-60 min-w-48 overflow-auto rounded border border-border bg-panel p-1 text-sm shadow"
        >
          {items.map((item, index) => (
            <div
              key={item.label}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              className={`cursor-pointer rounded px-1.5 py-0.5 font-mono ${index === active ? 'bg-bg text-accent' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(item);
              }}
            >
              {item.label}
              {item.detail !== undefined && (
                <span className="ml-2 text-muted text-xs">{item.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {listed.length > 0 && (
        <ul
          id={problemsId}
          aria-label="Function problems"
          className="flex flex-col gap-0.5 text-xs"
        >
          {listed.map((problem, index) => (
            <li
              key={index}
              data-severity={problem.severity}
              className={
                problem.severity === 'error'
                  ? 'text-error'
                  : problem.severity === 'warning'
                    ? 'text-warning'
                    : 'text-muted'
              }
            >
              Line {(problemLine(problem) ?? 0) + 1}: {problem.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
