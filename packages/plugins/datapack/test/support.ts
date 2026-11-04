/**
 * Test helpers: the real schema and registry indexes of every built-in target, with the
 * project ids the samples reference.
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
 * Ids the test samples define as if they were project elements, per registry (tags under
 * `tag/<registry>`, without the `#`). The `demo:` ids are what the element templates derive
 * from the project namespace (`demo:root`, `demo:tick`, `demo:load`) or reference as a
 * project tag (`demo:gems`).
 */
export const PROJECT_IDS: Readonly<Record<string, readonly string[]>> = {
  advancement: ['demo:root', 'example:root'],
  function: ['demo:load', 'demo:tick', 'example:greet', 'example:reward', 'example:tick'],
  item_modifier: ['example:random_count'],
  loot_table: ['example:blocks/ruby_ore'],
  predicate: ['example:sneaking'],
  recipe: ['example:diamond_sword', 'example:emerald_from_logs', 'example:iron_from_raw'],
  sound_event: ['example:music_disc.ruby'],
  'tag/block': ['example:others'],
  'tag/damage_type': ['example:others'],
  'tag/enchantment': ['example:others'],
  'tag/entity_type': ['example:others'],
  'tag/fluid': ['example:others'],
  'tag/function': ['example:others'],
  'tag/game_event': ['example:others'],
  'tag/item': ['demo:gems', 'example:others'],
  // Full texture paths, as a project's own `textures/` files would declare them.
  texture: ['example:entity/banner/ruby', 'example:painting/ruby', 'example:palettes/trim/ruby'],
};

export interface TargetIndexes {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
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
  return { schemaIndex, registries: createRegistryIndex({ vanilla, project: PROJECT_IDS }) };
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
