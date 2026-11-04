import { useEffect, useRef } from 'react';
import { bindControlledModel, type ControlledModelBinding } from './controlled-model';
import { jsonDefaults, monaco } from './monaco-setup';
import type { JsonEditorProps } from './types';

const MARKER_OWNER = 'msm';
const darkQuery = '(prefers-color-scheme: dark)';

function themeFor(dark: boolean): string {
  return dark ? 'vs-dark' : 'vs';
}

jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  enableSchemaRequest: false,
});

/**
 * Monaco JSON editor (lazy-loaded; see `RawJsonPanel`). Controlled: every edit calls
 * `onChange`; a `value` the editor did not emit is applied as an edit that keeps the selection
 * (see `controlled-model`). The theme follows the
 * system colour scheme; `error` becomes a model marker.
 */
export default function MonacoJsonEditor({ id, value, onChange, error, label }: JsonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const bindingRef = useRef<ControlledModelBinding | null>(null);
  /** The latest `value`, for a model created after `id` or `label` changes. */
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const media = window.matchMedia(darkQuery);
    const model = monaco.editor.createModel(valueRef.current, 'json');
    const editor = monaco.editor.create(host, {
      model,
      ariaLabel: label,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      fontSize: 13,
      theme: themeFor(media.matches),
    });
    editorRef.current = editor;
    // The focusable input is an EditContext element or, on older engines, a textarea.
    host.querySelector('.native-edit-context, textarea')?.setAttribute('id', id);
    const binding = bindControlledModel(model, (text) => onChangeRef.current(text));
    bindingRef.current = binding;
    const onScheme = (event: MediaQueryListEvent): void =>
      monaco.editor.setTheme(themeFor(event.matches));
    media.addEventListener('change', onScheme);
    return () => {
      media.removeEventListener('change', onScheme);
      binding.dispose();
      bindingRef.current = null;
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
  }, [id, label]);

  // Echoes of the editor's own edits are ignored; external changes keep the selection.
  useEffect(() => {
    bindingRef.current?.setValue(value);
  }, [value]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model === null || model === undefined) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      error === null
        ? []
        : [
            {
              severity: monaco.MarkerSeverity.Error,
              message: `Invalid JSON: ${error.message}`,
              startLineNumber: error.line,
              startColumn: error.column,
              endLineNumber: error.line,
              endColumn: error.column + 1,
            },
          ],
    );
  }, [error]);

  return (
    <div
      ref={hostRef}
      data-testid="monaco-host"
      className="size-full min-h-[200px] overflow-hidden rounded border border-border"
    />
  );
}
