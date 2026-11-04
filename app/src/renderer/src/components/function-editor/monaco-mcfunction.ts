/**
 * The `mcfunction` language for Monaco: a Monarch tokenizer (comments, `$` macro lines and
 * `$(name)` arguments, selectors, numbers, strings, resource locations and tags), the language
 * configuration, a completion provider that asks each model's own completion callback, and
 * problem-to-marker mapping. Takes the Monaco namespace as an argument, so it is only ever
 * loaded with the lazy Monaco chunk (and tests can pass a stand-in).
 *
 * @packageDocumentation
 */

import type { monaco as MonacoNamespace } from '../json-editor/monaco-setup';
import { problemLine, tokenStart } from './source-text';
import type { CompleteFunction, FunctionCompletion, FunctionProblem } from './types';

type Monaco = typeof MonacoNamespace;
type TextModel = MonacoNamespace.editor.ITextModel;

/** The Monaco language id. */
export const MCFUNCTION_LANGUAGE_ID = 'mcfunction';

/** Characters after which completions are requested automatically. */
export const MCFUNCTION_TRIGGER_CHARACTERS: readonly string[] = [
  ' ',
  ':',
  '@',
  '[',
  '=',
  ',',
  '#',
  '/',
];

/** Monarch tokenizer. Rules are tried in order at each position. */
export const mcfunctionMonarch: MonacoNamespace.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.mcfunction',
  tokenizer: {
    root: [
      // A tag reference (`#minecraft:logs`) before comments, which need not be at a line start.
      [/#[a-z0-9_.-]+:[a-z0-9_./-]*/, 'type.identifier'],
      [/#.*$/, 'comment'],
      [/\$\([A-Za-z0-9_]+\)/, 'variable.parameter'],
      [/\$/, 'keyword'],
      [/@[a-z]\b/, 'variable'],
      [/[a-z0-9_.-]+:[a-z0-9_./-]+/, 'type.identifier'],
      [/"/, 'string', '@doubleString'],
      [/'/, 'string', '@singleString'],
      [/[~^](-?\d*\.?\d+)?/, 'number'],
      [/-?\d+(\.\d+)?[bBsSlLfFdD]?\b/, 'number'],
      [/-?\.\d+[fFdD]?\b/, 'number'],
      [/\b(true|false)\b/, 'keyword'],
      [/[A-Za-z_][\w.+-]*/, 'identifier'],
      [/[[\]{}()]/, '@brackets'],
      [/[=,:;!.]/, 'delimiter'],
    ],
    doubleString: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
    singleString: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
  },
};

/** Comments, brackets and auto-closing pairs. */
export const mcfunctionConfiguration: MonacoNamespace.languages.LanguageConfiguration = {
  comments: { lineComment: '#' },
  brackets: [
    ['[', ']'],
    ['{', '}'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  wordPattern: /[^\s[\]{}(),=]+/,
};

/** Completion callbacks per model (each editor registers its own). */
const completers = new WeakMap<TextModel, CompleteFunction>();
/** Monaco namespaces the language is registered with. */
const registered = new WeakSet<object>();

/** Sets (or, with `undefined`, clears) the completion callback for one model. */
export function setModelCompleter(model: TextModel, complete: CompleteFunction | undefined): void {
  if (complete === undefined) completers.delete(model);
  else completers.set(model, complete);
}

/** The Monaco kind for an LSP completion kind name, `Text` when unknown. */
export function completionKind(monaco: Pick<Monaco, 'languages'>, kind: string): number {
  const kinds = monaco.languages.CompletionItemKind as unknown as Record<string, number>;
  const wanted = kind.toLowerCase();
  for (const [name, value] of Object.entries(kinds)) {
    if (typeof value === 'number' && name.toLowerCase() === wanted) return value;
  }
  return monaco.languages.CompletionItemKind.Text;
}

/**
 * A Monaco suggestion for one completion, replacing `range` (the token before the caret,
 * whose text is `prefix`). The insert text is a snippet. A `minecraft:` id also matches a
 * prefix typed without the namespace.
 */
export function toSuggestion(
  monaco: Pick<Monaco, 'languages'>,
  item: FunctionCompletion,
  range: MonacoNamespace.IRange,
  prefix: string,
): MonacoNamespace.languages.CompletionItem {
  const suggestion: MonacoNamespace.languages.CompletionItem = {
    label: item.label,
    kind: completionKind(monaco, item.kind),
    insertText: item.insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
  };
  if (item.detail !== undefined) suggestion.detail = item.detail;
  const namespace = 'minecraft:';
  if (item.label.startsWith(namespace) && !prefix.includes(':')) {
    suggestion.filterText = item.label.slice(namespace.length);
  }
  return suggestion;
}

/** Severity values of the Monaco markers. */
function markerSeverity(monaco: Pick<Monaco, 'MarkerSeverity'>, severity: string): number {
  if (severity === 'error') return monaco.MarkerSeverity.Error;
  if (severity === 'warning') return monaco.MarkerSeverity.Warning;
  return monaco.MarkerSeverity.Info;
}

/**
 * Markers for the line-addressed problems (`/lines/<n>` with an optional `range` within the
 * line); a problem without a range marks the whole line, one beyond the end the last line.
 */
export function toMarkers(
  monaco: Pick<Monaco, 'MarkerSeverity'>,
  problems: readonly FunctionProblem[],
  lines: readonly string[],
): MonacoNamespace.editor.IMarkerData[] {
  const markers: MonacoNamespace.editor.IMarkerData[] = [];
  const last = Math.max(0, lines.length - 1);
  for (const problem of problems) {
    const index = problemLine(problem);
    if (index === undefined) continue;
    const line = Math.min(index, last);
    const length = lines[line]?.length ?? 0;
    const start = Math.min(problem.range?.start ?? 0, length);
    const end =
      problem.range === undefined
        ? length
        : Math.min(Math.max(problem.range.end, problem.range.start + 1), length + 1);
    markers.push({
      severity: markerSeverity(monaco, problem.severity),
      message: problem.message,
      source: 'mcfunction',
      startLineNumber: line + 1,
      startColumn: start + 1,
      endLineNumber: line + 1,
      endColumn: Math.max(end, start + 1) + 1,
    });
  }
  return markers;
}

/** Suggestions for a model at a position, from the model's completion callback. */
export async function provideSuggestions(
  monaco: Pick<Monaco, 'languages'>,
  model: TextModel,
  position: MonacoNamespace.Position,
): Promise<MonacoNamespace.languages.CompletionList> {
  const complete = completers.get(model);
  if (complete === undefined) return { suggestions: [] };
  const lineText = model.getLineContent(position.lineNumber);
  const caret = position.column - 1;
  const start = tokenStart(lineText, caret);
  const range = {
    startLineNumber: position.lineNumber,
    startColumn: start + 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };
  const prefix = lineText.slice(start, caret);
  let items: FunctionCompletion[];
  try {
    items = await complete(model.getValue(), model.getOffsetAt(position));
  } catch {
    return { suggestions: [] };
  }
  return { suggestions: items.map((item) => toSuggestion(monaco, item, range, prefix)) };
}

/** Registers the language with a Monaco namespace once. */
export function registerMcfunction(monaco: Monaco): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);
  monaco.languages.register({
    id: MCFUNCTION_LANGUAGE_ID,
    extensions: ['.mcfunction'],
    aliases: ['mcfunction'],
  });
  monaco.languages.setLanguageConfiguration(MCFUNCTION_LANGUAGE_ID, mcfunctionConfiguration);
  monaco.languages.setMonarchTokensProvider(MCFUNCTION_LANGUAGE_ID, mcfunctionMonarch);
  monaco.languages.registerCompletionItemProvider(MCFUNCTION_LANGUAGE_ID, {
    triggerCharacters: [...MCFUNCTION_TRIGGER_CHARACTERS],
    provideCompletionItems: (model, position) => provideSuggestions(monaco, model, position),
  });
}
