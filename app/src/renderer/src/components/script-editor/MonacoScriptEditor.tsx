import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';
// Registers the `typescript` language id (tokeniser); without it the model is plain text and
// the language features below never start (they wait for `onLanguage('typescript')`).
import 'monaco-editor/languages/definitions/typescript/register';
import * as typescriptLanguage from 'monaco-editor/languages/features/typescript/register';
import { useEffect, useRef } from 'react';
import { toMarkers } from '../function-editor/monaco-mcfunction';
import { bindControlledModel, type ControlledModelBinding } from '../json-editor/controlled-model';
import { monaco, registerWorker } from '../json-editor/monaco-setup';
import {
  registerScriptTypeScript,
  setScriptTypings,
  TYPESCRIPT_LANGUAGE_ID,
} from './monaco-typescript';
import type { ScriptSourceEditorProps } from './types';

const MARKER_OWNER = 'msm-script';
const darkQuery = '(prefers-color-scheme: dark)';

function themeFor(dark: boolean): string {
  return dark ? 'vs-dark' : 'vs';
}

registerScriptTypeScript(typescriptLanguage, registerWorker, () => new TypeScriptWorker());

/**
 * Monaco script editor with the TypeScript language (lazy-loaded; see `ScriptStudio`). The
 * model lives at the script's `file:///<ns>/<path>.ts` URI and the runtime typings are an
 * extra lib, so `msm.` completes and type errors show as the TypeScript worker's own markers.
 * Controlled through `bindControlledModel`; the session's other problems (`problems`) are
 * markers of their own.
 */
export default function MonacoScriptEditor({
  id,
  value,
  onChange,
  label,
  modelUri,
  typings,
  problems,
  focus,
  onFocused,
}: ScriptSourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const bindingRef = useRef<ControlledModelBinding | null>(null);
  /** The latest `value`, for a model created after `id`, `label` or the URI changes. */
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setScriptTypings(typescriptLanguage, typings);
  }, [typings]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const media = window.matchMedia(darkQuery);
    const uri = monaco.Uri.parse(modelUri);
    // A model left at this URI (a quick remount) is replaced, not reused with stale text.
    monaco.editor.getModel(uri)?.dispose();
    const model = monaco.editor.createModel(valueRef.current, TYPESCRIPT_LANGUAGE_ID, uri);
    const editor = monaco.editor.create(host, {
      model,
      ariaLabel: label,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      fontSize: 13,
      wordWrap: 'off',
      theme: themeFor(media.matches),
    });
    editorRef.current = editor;
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
  }, [id, label, modelUri]);

  // Echoes of the editor's own edits are ignored; external changes keep the selection.
  useEffect(() => {
    bindingRef.current?.setValue(value);
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
    const markers = toMarkers(monaco, problems, model.getLinesContent()).map((marker) => ({
      ...marker,
      source: 'msm',
    }));
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }, [problems, value]);

  return (
    <div
      ref={hostRef}
      data-testid="monaco-host"
      className="size-full min-h-[240px] flex-1 overflow-hidden rounded border border-border"
    />
  );
}
