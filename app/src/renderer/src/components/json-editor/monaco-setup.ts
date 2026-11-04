/**
 * Monaco set-up: the core editor API, the JSON language and a hand-picked set of editor
 * features (not `editor.main`, which bundles every language). Workers are Vite `?worker`
 * imports, so they are emitted as same-origin ES module workers. Only imported lazily.
 *
 * @packageDocumentation
 */

import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/codicon/register';
import 'monaco-editor/features/bracketMatching/register';
import 'monaco-editor/features/clipboard/register';
import 'monaco-editor/features/contextmenu/register';
import 'monaco-editor/features/cursorUndo/register';
import 'monaco-editor/features/find/register';
import 'monaco-editor/features/folding/register';
import 'monaco-editor/features/format/register';
import 'monaco-editor/features/gotoError/register';
import 'monaco-editor/features/hover/register';
import 'monaco-editor/features/indentation/register';
import 'monaco-editor/features/linesOperations/register';
import 'monaco-editor/features/suggest/register';
import 'monaco-editor/features/wordOperations/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register';

self.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) =>
    label === 'json' ? new JsonWorker() : new EditorWorker(),
};

export { jsonDefaults, monaco };
