import { useEffect, useRef } from 'react';
import { monaco } from '../json-editor/monaco-setup';
import {
  MCFUNCTION_LANGUAGE_ID,
  registerMcfunction,
  setModelCompleter,
  toMarkers,
} from './monaco-mcfunction';
import type { CompleteFunction, FunctionSourceEditorProps } from './types';

const MARKER_OWNER = 'msm-mcfunction';
const darkQuery = '(prefers-color-scheme: dark)';

function themeFor(dark: boolean): string {
  return dark ? 'vs-dark' : 'vs';
}

registerMcfunction(monaco);

/**
 * Monaco mcfunction editor (lazy-loaded; see `FunctionEditor`). Controlled: `value` replaces
 * the model's text when it differs, and every edit calls `onChange`. Problems become markers;
 * completions come from `complete`, inserted as snippets.
 */
export default function MonacoFunctionEditor({
  id,
  value,
  onChange,
  problems,
  complete,
  label,
  focus,
  onFocused,
}: FunctionSourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const completeRef = useRef<CompleteFunction | undefined>(complete);
  const initialValue = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
    completeRef.current = complete;
  }, [onChange, complete]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const media = window.matchMedia(darkQuery);
    const model = monaco.editor.createModel(initialValue.current, MCFUNCTION_LANGUAGE_ID);
    setModelCompleter(model, (source, offset) =>
      completeRef.current === undefined ? Promise.resolve([]) : completeRef.current(source, offset),
    );
    const editor = monaco.editor.create(host, {
      model,
      ariaLabel: label,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 4,
      fontSize: 13,
      wordWrap: 'off',
      theme: themeFor(media.matches),
    });
    editorRef.current = editor;
    host.querySelector('.native-edit-context, textarea')?.setAttribute('id', id);
    const subscription = model.onDidChangeContent(() => onChangeRef.current(model.getValue()));
    const onScheme = (event: MediaQueryListEvent): void =>
      monaco.editor.setTheme(themeFor(event.matches));
    media.addEventListener('change', onScheme);
    return () => {
      media.removeEventListener('change', onScheme);
      subscription.dispose();
      setModelCompleter(model, undefined);
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
  }, [id, label]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model !== null && model !== undefined && model.getValue() !== value) model.setValue(value);
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (focus === null || focus === undefined || editor === null) return;
    const lineNumber = focus.line + 1;
    editor.setPosition({ lineNumber, column: (focus.column ?? 0) + 1 });
    editor.revealLineInCenter(lineNumber);
    editor.focus();
    onFocused?.();
  }, [focus, onFocused]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model === null || model === undefined) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      toMarkers(monaco, problems, model.getLinesContent()),
    );
  }, [problems, value]);

  return (
    <div
      ref={hostRef}
      data-testid="monaco-host"
      className="size-full min-h-[200px] flex-1 overflow-hidden rounded border border-border"
    />
  );
}
