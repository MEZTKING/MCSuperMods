/**
 * Test helpers: the real schema and registry indexes of every built-in target, with the
 * project ids the samples and templates reference.
 */
import { readFile } from 'node:fs/promises';
import type { Json } from '@msm/plugin-api';
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

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

/**
 * Ids the tests treat as project elements, per registry. `demo:sample` is what a template
 * creates when the user keeps the default name, so templates that derive a reference from their
 * own id as a placeholder reference (a placed feature's `feature`, a dimension's biome) resolve. The `example:` ids are the golden samples' cross-references.
 */
export const PROJECT_IDS: Readonly<Record<string, readonly string[]>> = {
  'worldgen/biome': ['demo:sample', 'example:ruby_grove'],
  'worldgen/feature': ['demo:sample', 'example:ruby_ore'],
  'worldgen/placed_feature': ['demo:sample', 'example:ruby_ore'],
  'worldgen/density_function': ['example:ruby_hills'],
  'worldgen/noise': ['example:ruby_noise'],
};

export interface TargetIndexes {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  vanilla: Readonly<Record<string, readonly string[]>>;
}

const cache = new Map<string, Promise<TargetIndexes>>();

async function build(bundle: TargetBundle): Promise<TargetIndexes> {
  const symbols = parseVanillaMcdocSymbols(
    await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
  );
  const schemaIndex = createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion });
  const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
    string,
    string[]
  >;
  return {
    schemaIndex,
    registries: createRegistryIndex({ vanilla, project: PROJECT_IDS }),
    vanilla,
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

/**
 * Validates `value` against `schemaRef` and returns the problems that would stop a clean
 * load: every error and every `schema.unknown-id` warning.
 */
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

/** The schema reference of noise settings, the one kind with a known gap between targets. */
export const NOISE_SETTINGS_SCHEMA = 'resource:worldgen/noise_settings';

/**
 * Whether the target's noise settings schema has `default_block`. The worldgen default data
 * and the noise settings template carry it (required on the release target); a newer target's
 * vanilla-mcdoc gates it out, so there the schema check reports one `schema.unknown-field`
 * (the known gap, B153: no shared data is valid on both, and the plugin may not know versions).
 */
export function noiseSettingsHasDefaultBlock(indexes: TargetIndexes): boolean {
  const node = indexes.schemaIndex.resolveSchemaRef(NOISE_SETTINGS_SCHEMA);
  return node.kind === 'struct' && node.fields.some((field) => field.key === 'default_block');
}

/**
 * `problems` without the known noise settings gap: on a target whose schema lacks
 * `default_block`, exactly one `schema.unknown-field` at `/default_block` is removed; anything
 * else stays. `templates.test.ts` asserts the gap itself.
 */
export function withoutKnownGap(
  problems: readonly SchemaProblem[],
  indexes: TargetIndexes,
  schemaRef: string,
): SchemaProblem[] {
  if (schemaRef !== NOISE_SETTINGS_SCHEMA || noiseSettingsHasDefaultBlock(indexes)) {
    return [...problems];
  }
  const gap = (problem: SchemaProblem): boolean =>
    problem.code === 'schema.unknown-field' && problem.path === '/default_block';
  return problems.filter((problem) => !gap(problem));
}

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
