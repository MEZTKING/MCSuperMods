import { useEffect, useRef } from 'react';
import { lineOffset } from '../function-editor/source-text';
import type { ScriptSourceEditorProps } from './types';

/**
 * Plain `<textarea>` script editor: used when Monaco is disabled (`window.msmNoMonaco`) and
 * while Monaco loads. No completions or type checking here; the Script Studio lists the
 * session's problems under the editor.
 */
export function TextareaScriptEditor({
  id,
  value,
  onChange,
  label,
  problems,
  focus,
  onFocused,
}: ScriptSourceEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hasError = problems.some((problem) => problem.severity === 'error');

  useEffect(() => {
    const area = areaRef.current;
    if (focus === null || focus === undefined || area === null) return;
    const offset = lineOffset(area.value, focus.line, focus.column ?? 0);
    area.focus();
    area.setSelectionRange(offset, offset);
    onFocused?.();
  }, [focus, onFocused]);

  return (
    <textarea
      ref={areaRef}
      id={id}
      aria-label={label}
      aria-invalid={hasError}
      data-testid="script-textarea"
      spellCheck={false}
      className="min-h-[240px] w-full flex-1 resize-none rounded border border-border bg-bg p-2 font-mono text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
