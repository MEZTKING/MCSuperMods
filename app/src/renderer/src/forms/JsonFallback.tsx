import type { Json } from '@msm/core';
import { useEffect, useId, useState } from 'react';
import { Button } from '../components/ui/Button';
import { useForm } from './context';

function format(value: Json | undefined): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

/**
 * Inline JSON editor for a subtree the form cannot render (`any`, unsupported schema
 * constructs, values of the wrong shape, nesting beyond `maxDepth`). Small textarea, not
 * Monaco; changes apply only on "Apply".
 */
export function JsonFallback({
  pointer,
  value,
  label,
  notice,
}: {
  pointer: string;
  value: Json | undefined;
  label: string;
  notice?: string;
}) {
  const { onChange } = useForm();
  const [text, setText] = useState(() => format(value));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  useEffect(() => {
    setText(format(value));
    setError(null);
  }, [value]);

  const apply = () => {
    if (text.trim() === '') {
      onChange(pointer, undefined);
      setError(null);
      return;
    }
    try {
      onChange(pointer, JSON.parse(text) as Json);
      setError(null);
    } catch (caught) {
      setError(`Invalid JSON: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {notice !== undefined && <p className="text-xs text-muted">{notice}</p>}
      <textarea
        aria-label={`${label} (JSON)`}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        spellCheck={false}
        rows={Math.min(8, Math.max(2, text.split('\n').length))}
        className="w-full rounded border border-border bg-bg p-1 font-mono text-xs"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button onClick={apply} disabled={text === format(value)}>
          Apply
        </Button>
        {error !== null && (
          <span id={errorId} role="alert" className="text-xs text-error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
