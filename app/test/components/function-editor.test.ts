import { describe, expect, it, vi } from 'vitest';
import {
  completionKind,
  MCFUNCTION_LANGUAGE_ID,
  mcfunctionMonarch,
  provideSuggestions,
  registerMcfunction,
  setModelCompleter,
  toMarkers,
  toSuggestion,
} from '../../src/renderer/src/components/function-editor/monaco-mcfunction';
import {
  joinLines,
  problemLine,
  snippetToText,
  splitLines,
  tokenStart,
} from '../../src/renderer/src/components/function-editor/source-text';

/** The parts of the Monaco namespace the helpers read, with Monaco's enum values. */
const fakeMonaco = {
  MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
  languages: {
    CompletionItemKind: {
      Method: 0,
      Function: 1,
      Value: 13,
      Keyword: 17,
      Text: 18,
      EnumMember: 16,
      Snippet: 27,
    },
    CompletionItemInsertTextRule: { None: 0, KeepWhitespace: 1, InsertAsSnippet: 4 },
    register: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
  },
};
// biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for the Monaco namespace
const monaco = fakeMonaco as any;

describe('source text helpers', () => {
  it('splits and joins lines', () => {
    expect(splitLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
    expect(splitLines('')).toEqual(['']);
    expect(joinLines(['a', 'b'])).toBe('a\nb');
  });

  it('reads the line of a problem', () => {
    expect(problemLine({ path: '/lines/3' })).toBe(3);
    expect(problemLine({ path: '/lines' })).toBeUndefined();
    expect(problemLine({ path: '' })).toBeUndefined();
  });

  it('finds the start of the completion token', () => {
    expect(tokenStart('give @s minecraft:sto', 21)).toBe(8);
    expect(tokenStart('execute as @e[type=pig', 22)).toBe(19);
    expect(tokenStart('say', 3)).toBe(0);
    expect(tokenStart('say ', 4)).toBe(4);
  });

  it('turns snippets into plain text', () => {
    expect(snippetToText('minecraft:stone')).toBe('minecraft:stone');
    expect(snippetToText('\\$(name) \\} \\\\')).toBe('$(name) } \\');
    // `%` stands for `$` (template-like strings in plain literals trip the linter).
    const snippet = (text: string) => snippetToText(text.replaceAll('%', '$'));
    expect(snippet('tp %{1:target} %2%0')).toBe('tp target ');
    expect(snippet('%{1|a,b|} %{2}')).toBe('a ');
    expect(snippet('%{1:outer %{2:inner}}')).toBe('outer inner');
    expect(snippetToText('cost $')).toBe('cost $');
  });
});

describe('mcfunction for Monaco', () => {
  it('maps completion kinds by LSP name', () => {
    expect(completionKind(monaco, 'keyword')).toBe(17);
    expect(completionKind(monaco, 'enumMember')).toBe(16);
    expect(completionKind(monaco, 'nonsense')).toBe(18);
  });

  it('builds snippet suggestions that also match without a namespace', () => {
    const range = { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 12 };
    expect(
      toSuggestion(
        monaco,
        { label: 'minecraft:stone', insertText: 'minecraft:stone', kind: 'value', detail: 'item' },
        range,
        'sto',
      ),
    ).toEqual({
      label: 'minecraft:stone',
      kind: 13,
      insertText: 'minecraft:stone',
      insertTextRules: 4,
      range,
      detail: 'item',
      filterText: 'stone',
    });
    const typed = toSuggestion(
      monaco,
      { label: 'minecraft:stone', insertText: 'minecraft:stone', kind: 'value' },
      range,
      'minecraft:st',
    );
    expect(typed.filterText).toBeUndefined();
  });

  it('turns line problems into markers', () => {
    const lines = ['say hi', 'tp @s 1 2', ''];
    expect(
      toMarkers(
        monaco,
        [
          {
            path: '/lines/1',
            message: 'Expected a float',
            severity: 'error',
            range: { start: 9, end: 9 },
          },
          { path: '/lines/0', message: 'Whole line', severity: 'warning' },
          {
            path: '/lines/9',
            message: 'Past the end',
            severity: 'info',
            range: { start: 0, end: 1 },
          },
          { path: '', message: 'Not a line', severity: 'error' },
        ],
        lines,
      ),
    ).toEqual([
      {
        severity: 8,
        message: 'Expected a float',
        source: 'mcfunction',
        startLineNumber: 2,
        startColumn: 10,
        endLineNumber: 2,
        endColumn: 11,
      },
      {
        severity: 4,
        message: 'Whole line',
        source: 'mcfunction',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 7,
      },
      {
        severity: 2,
        message: 'Past the end',
        source: 'mcfunction',
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 2,
      },
    ]);
  });

  it('asks the model completer with the source and offset', async () => {
    const model = {
      getLineContent: () => 'give @s sto',
      getValue: () => 'say hi\ngive @s sto',
      getOffsetAt: () => 18,
    };
    // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for a text model
    const textModel = model as any;
    const position = { lineNumber: 2, column: 12 };
    // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for a position
    const at = position as any;
    expect(await provideSuggestions(monaco, textModel, at)).toEqual({ suggestions: [] });
    const complete = vi.fn(async () => [
      { label: 'minecraft:stone', insertText: 'minecraft:stone', kind: 'value' },
    ]);
    setModelCompleter(textModel, complete);
    const list = await provideSuggestions(monaco, textModel, at);
    expect(complete).toHaveBeenCalledWith('say hi\ngive @s sto', 18);
    expect(list.suggestions[0]?.range).toEqual({
      startLineNumber: 2,
      startColumn: 9,
      endLineNumber: 2,
      endColumn: 12,
    });
    setModelCompleter(textModel, async () => {
      throw new Error('IPC failed');
    });
    expect(await provideSuggestions(monaco, textModel, at)).toEqual({ suggestions: [] });
    setModelCompleter(textModel, undefined);
  });

  it('registers the language once per Monaco instance', () => {
    registerMcfunction(monaco);
    registerMcfunction(monaco);
    expect(fakeMonaco.languages.register).toHaveBeenCalledOnce();
    expect(fakeMonaco.languages.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: MCFUNCTION_LANGUAGE_ID }),
    );
    expect(fakeMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      MCFUNCTION_LANGUAGE_ID,
      mcfunctionMonarch,
    );
    expect(fakeMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledOnce();
  });

  it('tokenizes the main mcfunction constructs', () => {
    const rules = mcfunctionMonarch.tokenizer.root as [RegExp, string][];
    /** The token of the first rule matching at the start of `text`. */
    const tokenAt = (text: string): string | undefined => {
      for (const [pattern, token] of rules) {
        const match = new RegExp(`^(?:${pattern.source})`).exec(text);
        if (match !== null && match[0] !== '') return token;
      }
      return undefined;
    };
    expect(tokenAt('# a comment')).toBe('comment');
    expect(tokenAt('#minecraft:logs')).toBe('type.identifier');
    expect(tokenAt('$(name)')).toBe('variable.parameter');
    expect(tokenAt('$say')).toBe('keyword');
    expect(tokenAt('@a[tag=x]')).toBe('variable');
    expect(tokenAt('minecraft:stone')).toBe('type.identifier');
    expect(tokenAt('~-1.5')).toBe('number');
    expect(tokenAt('12.5f')).toBe('number');
    expect(tokenAt('"text"')).toBe('string');
    expect(tokenAt('execute')).toBe('identifier');
  });
});
