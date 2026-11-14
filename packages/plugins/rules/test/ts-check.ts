/**
 * The Script API type check and the ES5 transpile of generated rule scripts, with the app's
 * options (`app/src/main/platform/scripting-engine.ts`, ADR 0031 D2, ADR 0032 D5): `noLib` with
 * the lib files Rhino implements, the generated `msm-runtime.d.ts` read from disk, strict mode;
 * ES5 CommonJS with `downlevelIteration`.
" *
 * The real typings include Script API 1.4 (B370), which rules use for weather, day time,
 * explosions, dropped items, breaking blocks and removing mobs.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const LIB_DIR = dirname(require.resolve('typescript/lib/lib.es5.d.ts'));
const LIBS = [
  'lib.es5.d.ts',
  'lib.decorators.d.ts',
  'lib.decorators.legacy.d.ts',
  'lib.es2015.core.d.ts',
  'lib.es2015.collection.d.ts',
  'lib.es2015.iterable.d.ts',
  'lib.es2015.generator.d.ts',
  'lib.es2015.promise.d.ts',
  'lib.es2015.proxy.d.ts',
  'lib.es2015.reflect.d.ts',
  'lib.es2015.symbol.d.ts',
  'lib.es2015.symbol.wellknown.d.ts',
  'lib.es2016.array.include.d.ts',
  'lib.es2017.object.d.ts',
  'lib.es2017.string.d.ts',
  'lib.es2018.regexp.d.ts',
];

const TYPINGS = readFileSync(
  new URL('../../scripting/api/msm-runtime.d.ts', import.meta.url),
  'utf8',
);

const CHECK_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2018,
  module: ts.ModuleKind.CommonJS,
  strict: true,
  noLib: true,
  noEmit: true,
  types: [],
  skipLibCheck: true,
  ignoreDeprecations: '6.0',
};

const TRANSPILE_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS,
  downlevelIteration: true,
  ignoreDeprecations: '6.0',
  alwaysStrict: true,
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
};

const libFiles = new Map(
  LIBS.map((name) => [
    `/lib/${name}`,
    ts.createSourceFile(
      `/lib/${name}`,
      readFileSync(join(LIB_DIR, name), 'utf8'),
      ts.ScriptTarget.ES2018,
    ),
  ]),
);

/** Type-check diagnostics of `source` as messages with line numbers. */
export function check(source: string): string[] {
  const files = new Map(libFiles);
  files.set(
    '/types/msm-runtime.d.ts',
    ts.createSourceFile('/types/msm-runtime.d.ts', TYPINGS, ts.ScriptTarget.ES2018),
  );
  const script = ts.createSourceFile('/scripts/rules.ts', source, ts.ScriptTarget.ES2018, true);
  files.set('/scripts/rules.ts', script);
  const host: ts.CompilerHost = {
    getSourceFile: (path) => files.get(path),
    getDefaultLibFileName: () => '/lib/lib.es5.d.ts',
    getDefaultLibLocation: () => '/lib/',
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
  const program = ts.createProgram({ rootNames: [...files.keys()], options: CHECK_OPTIONS, host });
  return [
    ...program.getSyntacticDiagnostics(script),
    ...program.getSemanticDiagnostics(script),
  ].map((diagnostic) => {
    const line = script.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
    return `${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  });
}

/** ES5 JavaScript of `source`, or the syntax errors. */
export function transpile(source: string): { js: string; errors: string[] } {
  const result = ts.transpileModule(source, {
    compilerOptions: TRANSPILE_OPTIONS,
    fileName: 'rules.ts',
    reportDiagnostics: true,
  });
  return {
    js: result.outputText,
    errors: (result.diagnostics ?? []).map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    ),
  };
}

/** JavaScript without its comments, to look for ES2015 syntax. */
export const withoutComments = (js: string): string =>
  js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** ES2015 syntax that must not be left in transpiled JavaScript. */
export const ES2015_SYNTAX = /=>|\bclass\b|\blet\b|\bconst\b|`/;
