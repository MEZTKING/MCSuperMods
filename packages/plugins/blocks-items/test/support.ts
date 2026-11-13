/**
 * Test helpers: the real schema and registry indexes of every built-in target, with the
 * project ids the samples and templates reference.
 */
import { readFile } from 'node:fs/promises';
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

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

/**
 * Ids the tests treat as project elements, per registry. `demo:sample` is what a template
 * creates when the user keeps the default name; the `example:` ids are the golden samples. A
 * block's item shares the block's id, so block ids are items too, as the app's registry index
 * counts them (`dataRegistryIds`).
 */
export const PROJECT_IDS: Readonly<Record<string, readonly string[]>> = {
  block: ['demo:sample', 'example:ruby_ore', 'example:chime_block', 'example:ores/glow_stone'],
  item: [
    'demo:sample',
    'example:ruby_ore',
    'example:chime_block',
    'example:ores/glow_stone',
    'example:ruby',
    'example:wand',
    'example:ruby_mace',
    'example:ruby_crossbow',
    'example:ruby_dart',
  ],
  mob_effect: ['demo:sample', 'example:frost', 'example:curses/withering'],
  model: ['example:block/ruby_ore', 'example:item/ruby'],
  loot_table: ['example:blocks/ruby_ore_rare'],
  function: ['example:ruby/shimmer'],
  equipment: ['example:ruby'],
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
