/**
 * Monaco set-up: the core editor API, the JSON language and a hand-picked set of editor
 * features (not `editor.main`, which bundles every language). Workers are Vite `?worker`
 * imports, so they are emitted as same-origin ES module workers. Only imported lazily. Other
 * languages (the script editor's TypeScript) add their worker with {@link registerWorker}, so
 * their worker chunk loads only with them.
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

/** Workers added by lazily loaded languages, by Monaco worker label. */
const extraWorkers = new Map<string, () => Worker>();

/**
 * Serves the worker `create` makes for each of `labels` (for example `typescript` and
 * `javascript`); a later registration for a label replaces the earlier one.
 */
export function registerWorker(labels: readonly string[], create: () => Worker): void {
  for (const label of labels) extraWorkers.set(label, create);
}

/** The worker for a Monaco worker label: a registered one, JSON, or the editor worker. */
export function workerFor(label: string): Worker {
  const extra = extraWorkers.get(label);
  if (extra !== undefined) return extra();
  return label === 'json' ? new JsonWorker() : new EditorWorker();
}

self.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) => workerFor(label),
};

export { jsonDefaults, monaco };
