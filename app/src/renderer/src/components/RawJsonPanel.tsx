import {
  type Element,
  type Json,
  parseJson,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import { lazy, Suspense, useId, useState } from 'react';
import { type JsonErrorLocation, locateJsonError } from './json-editor/json-error';
import { TextareaJsonEditor } from './json-editor/TextareaJsonEditor';
import type { JsonEditorProps } from './json-editor/types';
import { Button } from './ui/Button';

/** Monaco is loaded on demand, so first paint never pays for it. */
const MonacoJsonEditor = lazy(() => import('./json-editor/MonacoJsonEditor'));

/** Whether Monaco is disabled (`window.msmNoMonaco`, set by tests and smoke runs). */
export function monacoDisabled(): boolean {
  return typeof window !== 'undefined' && window.msmNoMonaco === true;
}

function JsonEditor(props: JsonEditorProps) {
  if (monacoDisabled()) return <TextareaJsonEditor {...props} />;
  return (
    <Suspense fallback={<TextareaJsonEditor {...props} />}>
      <MonacoJsonEditor {...props} />
    </Suspense>
  );
}

/** Props of {@link RawJsonPanel}. */
export interface RawJsonPanelProps {
  element: Element | null;
  onApply(id: ResourceLocation, data: Json): void;
}

/**
 * Raw JSON editor for one element's `data`, with Apply and Revert. When the element's data
 * changes from outside (undo, another editor), the draft is reset to it, as in Phase 0.
 */
export function RawJsonPanel({ element, onApply }: RawJsonPanelProps) {
  const source = element === null ? '' : stableStringify(element.data);
  const [draft, setDraft] = useState(source);
  const [shownSource, setShownSource] = useState(source);
  const [error, setError] = useState<JsonErrorLocation | null>(null);
  const editorId = useId();
  const errorId = useId();

  if (source !== shownSource) {
    setShownSource(source);
    setDraft(source);
    setError(null);
  }

  if (element === null) {
    return <p className="p-2 text-muted">Select an element to edit its JSON.</p>;
  }

  const apply = (): void => {
    let data: Json;
    try {
      data = parseJson(draft);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      setError(locateJsonError(draft, message));
      return;
    }
    setError(null);
    onApply(element.id, data);
  };

  return (
    <section aria-label="Raw JSON" className="flex h-full min-h-0 flex-col gap-1.5 p-2">
      <label htmlFor={editorId}>
        Data of <code className="font-mono">{element.id}</code>
      </label>
      <div className="min-h-0 flex-1">
        <JsonEditor
          id={editorId}
          value={draft}
          onChange={(value) => {
            setDraft(value);
            if (error !== null) setError(null);
          }}
          error={error}
          errorId={errorId}
          label={`Data of ${element.id}`}
        />
      </div>
      {error !== null && (
        <p id={errorId} className="whitespace-pre-line text-error" role="alert">
          Invalid JSON (line {error.line}, column {error.column}): {error.message}
        </p>
      )}
      <div className="flex gap-1.5">
        <Button onClick={apply} disabled={draft === source}>
          Apply
        </Button>
        <Button
          onClick={() => {
            setDraft(source);
            setError(null);
          }}
          disabled={draft === source}
        >
          Revert
        </Button>
      </div>
    </section>
  );
}
