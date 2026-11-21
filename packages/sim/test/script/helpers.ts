/**
 * Script test helpers (B400): the Script API description read from the scripting plugin's JSON
 * (the package may not import the plugin), scripts transpiled with TypeScript as the app's main
 * process does (ADR 0031 D2: ES5, CommonJS, `downlevelIteration`, `alwaysStrict`) and run in
 * process, and a Try it area that runs the scripts of its lowered files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '@msm/plugin-api';
import ts from 'typescript';
import {
  type CompiledScript,
  inProcessRunner,
  LocalWorldSource,
  type ScriptApiDescription,
  type ScriptModuleFn,
  type ScriptProblem,
  type SimFiles,
  scriptSources,
  type TraceEntry,
} from '../../src/index.js';
import { REPO_ROOT } from '../lower-fixture.js';

/** `packages/plugins/scripting/api/script-api-v1.json`. */
export const API_PATH = join(REPO_ROOT, 'packages/plugins/scripting/api/script-api-v1.json');

/** The Script API description. */
export function readApi(): ScriptApiDescription {
  return JSON.parse(readFileSync(API_PATH, 'utf8')) as ScriptApiDescription;
}

/** TypeScript's ES5 output of a script, as `scripting-engine.ts` makes it. */
export function transpile(source: string, name = 'script.ts'): string {
  const result = ts.transpileModule(source, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
      alwaysStrict: true,
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    },
  });
  const errors = (result.diagnostics ?? []).filter(
    (one) => one.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(ts.flattenDiagnosticMessageText(errors[0]?.messageText ?? '', '\n'));
  }
  return result.outputText;
}

/** Wraps a compiled script as the worker's `Blob` does (tests may use `Function`). */
export function compileModule(script: CompiledScript): ScriptModuleFn {
  return new Function('exports', 'require', 'module', 'msm', `${script.js}\n`) as ScriptModuleFn;
}

/** The scripts of lowered files, transpiled; ones that do not transpile become problems. */
export function compileScripts(files: SimFiles): {
  scripts: CompiledScript[];
  problems: ScriptProblem[];
} {
  const scripts: CompiledScript[] = [];
  const problems: ScriptProblem[] = [];
  for (const source of scriptSources(files)) {
    const book = source.book === undefined ? {} : { book: source.book };
    try {
      scripts.push({ id: source.id, path: source.path, js: transpile(source.source), ...book });
    } catch (error) {
      problems.push({ id: source.id, path: source.path, message: String(error), ...book });
    }
  }
  return { scripts, problems };
}

/** A Try it area over `files` whose scripts run in process, loaded. */
export function scriptedArea(files: SimFiles, target: Target, seed = 1) {
  const source = new LocalWorldSource({
    files,
    target,
    seed,
    chance: 'always',
    scripts: { runner: inProcessRunner(compileModule), api: readApi(), version: '1.5.1' },
  });
  const compiled = compileScripts(files);
  source.loadScripts(compiled.scripts, compiled.problems);
  const texts = (from = 0): string[] => source.trace.slice(from).map((entry) => entry.text);
  const only = (from = 0): string[] =>
    source.trace
      .slice(from)
      .filter((entry: TraceEntry) => entry.kind === 'onlyInMinecraft')
      .map((entry) => entry.text);
  return { source, texts, only };
}

/** Lowered files from hand-written scripts (`<path>` to TypeScript source) in namespace `t`. */
export function scriptFiles(scripts: Readonly<Record<string, string>>): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, text] of Object.entries(scripts)) files.set(`msm/t/script/${path}.ts`, text);
  return files;
}
