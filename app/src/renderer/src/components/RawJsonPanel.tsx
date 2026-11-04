import {
  type Element,
  type Json,
  parseJson,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import { useId, useState } from 'react';

/** Props of {@link RawJsonPanel}. Remount (via `key`) when the element's data changes. */
export interface RawJsonPanelProps {
  element: Element | null;
  onApply(id: ResourceLocation, data: Json): void;
}

/** Raw JSON editor for one element's `data`. */
export function RawJsonPanel({ element, onApply }: RawJsonPanelProps) {
  const source = element === null ? '' : stableStringify(element.data);
  const [draft, setDraft] = useState(source);
  const [error, setError] = useState<string | null>(null);
  const textareaId = useId();
  const errorId = useId();

  if (element === null) {
    return (
      <section className="raw-json" aria-label="Raw JSON">
        <p className="empty">Select an element to edit its JSON.</p>
      </section>
    );
  }

  const apply = (): void => {
    let data: Json;
    try {
      data = parseJson(draft);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
      return;
    }
    setError(null);
    onApply(element.id, data);
  };

  return (
    <section className="raw-json" aria-label="Raw JSON">
      <label htmlFor={textareaId}>
        Data of <code>{element.id}</code>
      </label>
      <textarea
        id={textareaId}
        value={draft}
        spellCheck={false}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error !== null && (
        <p id={errorId} className="error" role="alert">
          Invalid JSON: {error}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={apply} disabled={draft === source}>
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(source);
            setError(null);
          }}
          disabled={draft === source}
        >
          Revert
        </button>
      </div>
    </section>
  );
}
