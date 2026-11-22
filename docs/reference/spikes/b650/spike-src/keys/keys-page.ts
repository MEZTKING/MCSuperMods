// B650 spike: SQ9 and SQ15 page: the app's Monaco features, a text field, and a draft combobox
// with a grouped listbox and a live region. Bundled by esbuild; loaded in Electron.
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/codicon/register';
import 'monaco-editor/features/clipboard/register';
import 'monaco-editor/features/contextmenu/register';
import 'monaco-editor/features/cursorUndo/register';
import 'monaco-editor/features/find/register';
import 'monaco-editor/features/folding/register';
import 'monaco-editor/features/format/register';
import 'monaco-editor/features/indentation/register';
import 'monaco-editor/features/linesOperations/register';
import 'monaco-editor/features/wordOperations/register';

const log: unknown[] = [];
(window as unknown as { __log: unknown[] }).__log = log;
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'z') log.push({ where: 'window-bubble', key: e.key, ctrl: e.ctrlKey, target: (e.target as HTMLElement).dataset.where ?? (e.target as HTMLElement).tagName, defaultPrevented: e.defaultPrevented });
});
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'k') log.push({ where: 'window-capture', key: e.key, target: (e.target as HTMLElement).dataset.where ?? (e.target as HTMLElement).tagName });
}, true);
const host = document.getElementById('editor') as HTMLElement;
const editor = monaco.editor.create(host, { value: '  a line with spaces   \nsecond line', language: 'plaintext' });
(window as unknown as { __editor: unknown }).__editor = editor;
(window as unknown as { __value: () => string }).__value = () => editor.getValue();
const ta = host.querySelector('textarea');
if (ta) ta.dataset.where = 'monaco';
