/**
 * The generated scripts type-check against the Script API typings and transpile to ES5 (B365):
 * the checker and transpiler options are the app's (`app/src/main/platform/scripting-engine.ts`,
 * ADR 0031 D2, ADR 0032 D5): `noLib` with the lib files Rhino implements, the generated
 * `msm-runtime.d.ts` read from disk, strict mode; ES5 CommonJS with `downlevelIteration`.
 *
 * Script API 1.4 members (B370) come from `fixtures/script-api-1-4.d.ts` while the real typings
 * lack them; once B370 is merged the test reads only the real typings.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Json } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileRuleBook } from '../src/compile';
import { SAMPLES } from './samples';
import { book, PROJECT } from './support';

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
const API_1_4 = readFileSync(new URL('./fixtures/script-api-1-4.d.ts', import.meta.url), 'utf8');
/** Whether the real typings already have Script API 1.4 (B370). */
const HAS_1_4 = /\breadonly dayTime\b/.test(TYPINGS);

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
function check(source: string): string[] {
  const files = new Map(libFiles);
  files.set(
    '/types/msm-runtime.d.ts',
    ts.createSourceFile('/types/msm-runtime.d.ts', TYPINGS, ts.ScriptTarget.ES2018),
  );
  if (!HAS_1_4) {
    files.set(
      '/types/script-api-1-4.d.ts',
      ts.createSourceFile('/types/script-api-1-4.d.ts', API_1_4, ts.ScriptTarget.ES2018),
    );
  }
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
function transpile(source: string): { js: string; errors: string[] } {
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

const [defaultTarget] = builtInTargets;

/** JavaScript without its comments, to look for ES2015 syntax. */
const withoutComments = (js: string): string =>
  js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every sample's rules in one book, with distinct keys, so one script uses every entry. */
function everythingBook() {
  const rules: Json[] = [];
  const counters = new Map<string, Json>();
  SAMPLES.forEach((sample, index) => {
    for (const rule of sample.rules) {
      if (typeof rule === 'object' && rule !== null && !Array.isArray(rule)) {
        rules.push({ ...rule, key: `r${index}` });
      }
    }
    for (const counter of sample.counters ?? []) counters.set(JSON.stringify(counter), counter);
  });
  return book(rules, [...counters.values()]);
}

describe('generated scripts', () => {
  const scripts: { name: string; source: string }[] = [];
  if (defaultTarget !== undefined) {
    for (const sample of SAMPLES) {
      const result = compileRuleBook(
        book(sample.rules, sample.counters ?? []),
        PROJECT,
        defaultTarget.target,
      );
      if (result.script !== null)
        scripts.push({ name: sample.name, source: result.script.join('\n') });
    }
  }

  it('reads Script API 1.4 from the local declarations until B370 lands', () => {
    expect(typeof HAS_1_4).toBe('boolean');
    expect(scripts.length).toBeGreaterThan(30);
  });

  it('reports type errors (the check is real)', () => {
    expect(check('import { msm } from "msm:runtime";\nmsm.nothing();\n')).toHaveLength(1);
    expect(check('import { msm } from "msm:runtime";\nmsm.players().length;\n')).toEqual([]);
  });

  it('compiles one book using every step, condition and value into one script', () => {
    if (defaultTarget === undefined) return;
    const result = compileRuleBook(everythingBook(), PROJECT, defaultTarget.target);
    // The plain light_portal sample cannot share a trigger with rules that need a script.
    expect(result.problems.map((problem) => problem.code)).toEqual(['rules.needs-plain']);
    expect(result.script).not.toBeNull();
    const source = (result.script ?? []).join('\n');
    const problems = check(source);
    expect(problems).toEqual([]);
    const { js, errors } = transpile(source);
    expect(errors).toEqual([]);
    expect(withoutComments(js)).not.toMatch(/=>|\bclass\b|\blet\b|\bconst\b|`/);
  });

  for (const { name, source } of scripts) {
    it(`${name} type-checks and transpiles to ES5`, () => {
      expect(check(source)).toEqual([]);
      const { js, errors } = transpile(source);
      expect(errors).toEqual([]);
      expect(withoutComments(js)).not.toMatch(/=>|\bclass\b|\blet\b|\bconst\b|`/);
      expect(js).toContain('// rule:sample');
    });
  }
});
