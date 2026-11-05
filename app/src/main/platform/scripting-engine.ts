/**
 * The TypeScript engine behind the scripting service (ADRs 0031 D2 and D5, 0032 D5). This
 * module imports `typescript` and the curated lib files, so `scripting.ts` loads it with a lazy
 * `import()`: it becomes its own main chunk and start-up never pays for the compiler.
 *
 * - `transpile`: `transpileModule` to ES5 CommonJS with `downlevelIteration` (Rhino 1.9.2 does
 *   not parse `class`, `for...of` or `async`), `ignoreDeprecations: "6.0"` for the deprecated
 *   ES5 target. Syntax errors stop it.
 * - `check`: a `ts.Program` over a virtual host holding the script, the generated
 *   `msm-runtime.d.ts` and the lib set Rhino implements (`noLib`, so nothing else is visible).
 *   Syntax diagnostics are errors, semantic ones warnings. Lib source files are parsed once;
 *   the typings are parsed once per distinct text.
 *
 * @packageDocumentation
 */

import ts from 'typescript';
import libDecorators from 'typescript/lib/lib.decorators.d.ts?raw';
import libDecoratorsLegacy from 'typescript/lib/lib.decorators.legacy.d.ts?raw';
import libEs5 from 'typescript/lib/lib.es5.d.ts?raw';
import libEs2015Collection from 'typescript/lib/lib.es2015.collection.d.ts?raw';
import libEs2015Core from 'typescript/lib/lib.es2015.core.d.ts?raw';
import libEs2015Generator from 'typescript/lib/lib.es2015.generator.d.ts?raw';
import libEs2015Iterable from 'typescript/lib/lib.es2015.iterable.d.ts?raw';
import libEs2015Promise from 'typescript/lib/lib.es2015.promise.d.ts?raw';
import libEs2015Proxy from 'typescript/lib/lib.es2015.proxy.d.ts?raw';
import libEs2015Reflect from 'typescript/lib/lib.es2015.reflect.d.ts?raw';
import libEs2015Symbol from 'typescript/lib/lib.es2015.symbol.d.ts?raw';
import libEs2015SymbolWellknown from 'typescript/lib/lib.es2015.symbol.wellknown.d.ts?raw';
import libEs2016ArrayInclude from 'typescript/lib/lib.es2016.array.include.d.ts?raw';
import libEs2017Object from 'typescript/lib/lib.es2017.object.d.ts?raw';
import libEs2017String from 'typescript/lib/lib.es2017.string.d.ts?raw';
import libEs2018Regexp from 'typescript/lib/lib.es2018.regexp.d.ts?raw';
import type { ScriptDiagnostic, ScriptTranspileOutcome } from '../../shared/platform';

/**
 * The curated lib set (ADR 0032 D5): what Rhino 1.9.2 implements. `lib.es5.d.ts` references
 * the two decorator libs, which `noLib` would otherwise leave out.
 */
export const SCRIPT_LIB_FILES: Readonly<Record<string, string>> = Object.freeze({
  'lib.es5.d.ts': libEs5,
  'lib.decorators.d.ts': libDecorators,
  'lib.decorators.legacy.d.ts': libDecoratorsLegacy,
  'lib.es2015.core.d.ts': libEs2015Core,
  'lib.es2015.collection.d.ts': libEs2015Collection,
  'lib.es2015.iterable.d.ts': libEs2015Iterable,
  'lib.es2015.generator.d.ts': libEs2015Generator,
  'lib.es2015.promise.d.ts': libEs2015Promise,
  'lib.es2015.proxy.d.ts': libEs2015Proxy,
  'lib.es2015.reflect.d.ts': libEs2015Reflect,
  'lib.es2015.symbol.d.ts': libEs2015Symbol,
  'lib.es2015.symbol.wellknown.d.ts': libEs2015SymbolWellknown,
  'lib.es2016.array.include.d.ts': libEs2016ArrayInclude,
  'lib.es2017.object.d.ts': libEs2017Object,
  'lib.es2017.string.d.ts': libEs2017String,
  'lib.es2018.regexp.d.ts': libEs2018Regexp,
});

/** ADR 0031 D2: the transpiler options. */
export const TRANSPILE_OPTIONS: ts.CompilerOptions = Object.freeze({
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS,
  downlevelIteration: true,
  ignoreDeprecations: '6.0',
  alwaysStrict: true,
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
});

/** ADR 0032 D5: the checker options. */
export const CHECK_OPTIONS: ts.CompilerOptions = Object.freeze({
  target: ts.ScriptTarget.ES2018,
  module: ts.ModuleKind.CommonJS,
  strict: true,
  noLib: true,
  noEmit: true,
  types: [],
  skipLibCheck: true,
  ignoreDeprecations: '6.0',
  newLine: ts.NewLineKind.LineFeed,
});

const LIB_DIR = '/lib/';
const TYPINGS_FILE = '/types/msm-runtime.d.ts';
const SCRIPT_DIR = '/scripts/';

/** The engine `scripting.ts` loads. */
export interface ScriptingEngine {
  transpile(source: string, name: string): ScriptTranspileOutcome;
  check(source: string, name: string, typings: string): ScriptDiagnostic[];
}

/** The virtual file name of a script (always `.ts`). */
function scriptFileName(name: string): string {
  const safe = name.replace(/^\/+/, '');
  return `${SCRIPT_DIR}${safe.endsWith('.ts') ? safe : `${safe}.ts`}`;
}

/** Index of the first character of each line of `text`. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    if (char === 10) starts.push(index + 1);
    else if (char === 13) {
      if (text.charCodeAt(index + 1) === 10) index += 1;
      starts.push(index + 1);
    }
  }
  return starts;
}

/** The end of line `line` (before its line break). */
function lineEnd(text: string, starts: readonly number[], line: number): number {
  const next = starts[line + 1];
  if (next === undefined) return text.length;
  let end = next;
  if (end > 0 && text.charCodeAt(end - 1) === 10) end -= 1;
  if (end > 0 && text.charCodeAt(end - 1) === 13) end -= 1;
  return Math.max(end, starts[line] ?? 0);
}

/** Maps a TypeScript diagnostic on `source` to a {@link ScriptDiagnostic}. */
export function toScriptDiagnostic(
  diagnostic: ts.Diagnostic,
  source: string,
  kind: 'syntax' | 'semantic',
  starts: readonly number[] = lineStarts(source),
): ScriptDiagnostic {
  const startOffset = Math.min(Math.max(diagnostic.start ?? 0, 0), source.length);
  const endOffset = Math.min(startOffset + Math.max(diagnostic.length ?? 0, 0), source.length);
  let line = 0;
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((starts[mid] ?? 0) <= startOffset) {
      line = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  const lineStart = starts[line] ?? 0;
  const end = Math.min(endOffset, lineEnd(source, starts, line));
  return {
    severity: kind === 'syntax' ? 'error' : 'warning',
    code: kind === 'syntax' ? 'typescript.syntax' : 'typescript.semantic',
    tsCode: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    line,
    start: startOffset - lineStart,
    end: Math.max(end - lineStart, startOffset - lineStart),
    offset: { start: startOffset, end: endOffset },
  };
}

/** Creates the engine. Lib files are parsed on the first check and kept. */
export function createScriptingEngine(): ScriptingEngine {
  let libFiles: Map<string, ts.SourceFile> | null = null;
  let typingsFile: { text: string; file: ts.SourceFile } | null = null;

  const libs = (): Map<string, ts.SourceFile> => {
    if (libFiles === null) {
      libFiles = new Map(
        Object.entries(SCRIPT_LIB_FILES).map(([name, text]) => [
          `${LIB_DIR}${name}`,
          ts.createSourceFile(`${LIB_DIR}${name}`, text, ts.ScriptTarget.ES2018, false),
        ]),
      );
    }
    return libFiles;
  };

  const typingsFor = (text: string): ts.SourceFile => {
    if (typingsFile === null || typingsFile.text !== text) {
      typingsFile = {
        text,
        file: ts.createSourceFile(TYPINGS_FILE, text, ts.ScriptTarget.ES2018, false),
      };
    }
    return typingsFile.file;
  };

  return {
    transpile(source, name) {
      const result = ts.transpileModule(source, {
        compilerOptions: { ...TRANSPILE_OPTIONS },
        fileName: scriptFileName(name),
        reportDiagnostics: true,
      });
      const errors = (result.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length > 0) {
        const starts = lineStarts(source);
        return {
          problems: errors.map((diagnostic) =>
            toScriptDiagnostic(diagnostic, source, 'syntax', starts),
          ),
        };
      }
      return { js: result.outputText };
    },

    check(source, name, typings) {
      const fileName = scriptFileName(name);
      const script = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2018, true);
      const files = new Map<string, ts.SourceFile>(libs());
      files.set(TYPINGS_FILE, typingsFor(typings));
      files.set(fileName, script);
      const host: ts.CompilerHost = {
        getSourceFile: (path) => files.get(path),
        getDefaultLibFileName: () => `${LIB_DIR}lib.es5.d.ts`,
        getDefaultLibLocation: () => LIB_DIR,
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (path) => path,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: (path) => files.has(path),
        readFile: (path) => files.get(path)?.text,
        directoryExists: () => true,
        getDirectories: () => [],
      };
      const program = ts.createProgram({
        rootNames: [...files.keys()],
        options: { ...CHECK_OPTIONS },
        host,
      });
      const starts = lineStarts(source);
      const syntax = program
        .getSyntacticDiagnostics(script)
        .map((diagnostic) => toScriptDiagnostic(diagnostic, source, 'syntax', starts));
      const semantic = program
        .getSemanticDiagnostics(script)
        .map((diagnostic) => toScriptDiagnostic(diagnostic, source, 'semantic', starts));
      return [...syntax, ...semantic];
    },
  };
}
