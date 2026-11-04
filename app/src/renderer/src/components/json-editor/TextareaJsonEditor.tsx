import type { JsonEditorProps } from './types';

/** A plain `<textarea>` JSON editor: the fallback while Monaco loads or when it is disabled. */
export function TextareaJsonEditor({ id, value, onChange, error, errorId }: JsonEditorProps) {
  return (
    <textarea
      id={id}
      value={value}
      spellCheck={false}
      aria-invalid={error !== null}
      aria-describedby={error === null ? undefined : errorId}
      onChange={(event) => onChange(event.target.value)}
      className="size-full min-h-[200px] resize-none rounded border border-border bg-panel p-2 font-mono text-[13px]"
    />
  );
}
