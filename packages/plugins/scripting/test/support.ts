/**
 * Test helpers: the schema index of every built-in target, element construction, sorted JSON,
 * and TypeScript parse and type checks of script sources against the generated typings.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Element, Json, ResourceLocation } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  type SchemaProblem,
  validateJson,
} from '@msm/schemas';
import { readVendoredJson, type TargetBundle } from '@msm/targets';
import ts from 'typescript';
import { MSM_RUNTIME_TYPINGS } from '../src/index';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

export interface TargetIndexes {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
}

const cache = new Map<string, Promise<TargetIndexes>>();

async function build(bundle: TargetBundle): Promise<TargetIndexes> {
  const symbols = parseVanillaMcdocSymbols(
    await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
  );
  const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
    string,
    string[]
  >;
  return {
    schemaIndex: createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion }),
    registries: createRegistryIndex({ vanilla }),
  };
}

/** The indexes of `bundle`, built once per test file. */
export function indexesFor(bundle: TargetBundle): Promise<TargetIndexes> {
  let entry = cache.get(bundle.target.id);
  if (entry === undefined) {
    entry = build(bundle);
    cache.set(bundle.target.id, entry);
  }
  return entry;
}

/** Validates `value` against `schemaRef` and returns every error and unknown-id warning. */
export function blockingProblems(
  indexes: TargetIndexes,
  schemaRef: string,
  value: Json,
): SchemaProblem[] {
  const node = indexes.schemaIndex.resolveSchemaRef(schemaRef);
  return validateJson(value, node, { registries: indexes.registries }).filter(
    (problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id',
  );
}

/** An element of `kind` with `id` and `data`. */
export const element = (kind: string, id: ResourceLocation, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

/** JSON text with sorted keys, 2-space indent and a trailing newline (project file style). */
export function sortedJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (typeof input === 'object' && input !== null) {
      const record = input as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, sort(record[key])]),
      );
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** The syntax errors TypeScript reports for `source`, as messages. */
export function syntaxErrors(source: string): string[] {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.Latest, true);
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  );
}

/** Type-checks `script` against the typings with `lib.es5` only (no DOM, no Node). */
export function typeCheck(script: string): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([
    ['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS],
    ['/script.ts', script],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    lib: ['lib.es5.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getDefaultLibLocation = () => libDir;
  host.getSourceFile = (fileName, languageVersion) => {
    const text =
      files.get(fileName) ?? readFileSync(join(libDir, fileName.split('/').pop() ?? ''), 'utf8');
    return ts.createSourceFile(fileName, text, languageVersion);
  };
  host.fileExists = (fileName) => files.has(fileName) || fileName.startsWith(libDir);
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram(['/msm-runtime.d.ts', '/script.ts'], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}
