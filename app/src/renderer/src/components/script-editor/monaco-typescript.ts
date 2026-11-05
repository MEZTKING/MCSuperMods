/**
 * The TypeScript language for the script editor (ADR 0032 D5): compiler options that match
 * what Rhino 1.9.2 runs (`target: ES2018` for checking, `strict`, the curated `lib` set, no
 * DOM), the generated `msm-runtime.d.ts` as an extra lib, diagnostics on, and the worker
 * served for the `typescript` and `javascript` labels. Takes the Monaco TypeScript namespace
 * (`monaco-editor/languages/features/typescript/register`) and the worker factory as
 * arguments, so it is only ever loaded with the lazy script editor chunk and tests can pass
 * stand-ins.
 *
 * @packageDocumentation
 */

import type * as TypeScriptLanguage from 'monaco-editor/languages/features/typescript/register';

/** The parts of the Monaco TypeScript namespace the script editor uses. */
export type TypeScriptNamespace = Pick<
  typeof TypeScriptLanguage,
  'typescriptDefaults' | 'ScriptTarget' | 'ModuleKind'
>;

/** Compiler options as the TypeScript defaults take them. */
export type ScriptCompilerOptions = TypeScriptLanguage.CompilerOptions;

/** The Monaco language id of script models. */
export const TYPESCRIPT_LANGUAGE_ID = 'typescript';

/** The Monaco worker labels the TypeScript worker serves. */
export const TYPESCRIPT_WORKER_LABELS: readonly string[] = Object.freeze([
  'typescript',
  'javascript',
]);

/**
 * The curated `lib` set (ADR 0032 D5: `lib.es5`, `lib.es2015.*`, `lib.es2016.array.include`,
 * `lib.es2017.object`, `lib.es2017.string`, `lib.es2018.regexp`) as lib names; the Monaco
 * worker maps `es2015` to `lib.es2015.d.ts`, which references `lib.es5` and every
 * `lib.es2015.*` file.
 */
export const SCRIPT_LIBS: readonly string[] = Object.freeze([
  'es2015',
  'es2016.array.include',
  'es2017.object',
  'es2017.string',
  'es2018.regexp',
]);

/** Where the typings live in the TypeScript service's virtual file system. */
export const RUNTIME_TYPINGS_PATH = 'file:///msm-runtime.d.ts';

/** The compiler options of script models. */
export function scriptCompilerOptions(ts: TypeScriptNamespace): ScriptCompilerOptions {
  return {
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    noLib: false,
    lib: [...SCRIPT_LIBS],
    allowNonTsExtensions: true,
    noEmit: true,
  };
}

/** Namespaces the worker and the compiler options were set up for. */
const registered = new WeakSet<object>();
/** The typings each namespace currently holds, so unchanged text does not restart the worker. */
const typingsSet = new WeakMap<object, string>();

/**
 * Sets up the TypeScript language once per namespace: the worker for the
 * {@link TYPESCRIPT_WORKER_LABELS}, the compiler options and diagnostics.
 *
 * @param ts - The Monaco TypeScript namespace.
 * @param registerWorker - Adds a worker factory for Monaco worker labels (`monaco-setup`).
 * @param createWorker - Makes the TypeScript worker (`ts.worker?worker`).
 */
export function registerScriptTypeScript(
  ts: TypeScriptNamespace,
  registerWorker: (labels: readonly string[], create: () => Worker) => void,
  createWorker: () => Worker,
): void {
  if (registered.has(ts)) return;
  registered.add(ts);
  registerWorker(TYPESCRIPT_WORKER_LABELS, createWorker);
  ts.typescriptDefaults.setCompilerOptions(scriptCompilerOptions(ts));
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

/**
 * Gives the TypeScript service the runtime typings as its one extra lib, unless it already
 * holds exactly this text.
 */
export function setScriptTypings(ts: TypeScriptNamespace, typings: string): void {
  if (typingsSet.get(ts) === typings) return;
  typingsSet.set(ts, typings);
  ts.typescriptDefaults.setExtraLibs([{ content: typings, filePath: RUNTIME_TYPINGS_PATH }]);
}

/**
 * The Monaco model URI of a script: `file:///<ns>/<path>.ts` (`mymod:ore/glow` becomes
 * `file:///mymod/ore/glow.ts`). An id without a namespace goes under `minecraft`.
 */
export function scriptModelUri(id: string): string {
  const colon = id.indexOf(':');
  const namespace = colon === -1 ? 'minecraft' : id.slice(0, colon);
  const path = colon === -1 ? id : id.slice(colon + 1);
  const encoded = [namespace, ...path.split('/')].map(encodeURIComponent).join('/');
  return `file:///${encoded}.ts`;
}
