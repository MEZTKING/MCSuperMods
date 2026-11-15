/**
 * Test helpers of the controls plugin: the real schema and registry indexes of every built-in
 * target, with the project ids the tests reference, elements and sorted JSON.
 */
import { readFile } from 'node:fs/promises';
import type { Element, Json, ResourceLocation, ValidationRegistry } from '@msm/plugin-api';
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
 * Ids the tests treat as project elements, per registry: `demo:tank` is a vehicle and
 * `demo:guard` a mob (both entity types).
 */
export const PROJECT_IDS: Readonly<Record<string, readonly string[]>> = {
  entity_type: ['demo:tank', 'demo:guard'],
  texture: ['demo:gui/sprites/hud/mana', 'demo:gui/sprites/hud/heart'],
  function: ['demo:reward'],
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
  const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
    string,
    string[]
  >;
  return {
    schemaIndex: createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion }),
    registries: createRegistryIndex({ vanilla, project: PROJECT_IDS }),
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

/** The registry a validator receives. */
export const registryOf = (indexes: TargetIndexes): ValidationRegistry => ({
  has: (name, id) => indexes.registries.has(name, id),
  ids: (name) => indexes.registries.ids(name),
});

/** Errors and unknown-id warnings of `value` against `schemaRef`. */
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
export const element = (kind: string, id: string, data: Json): Element => ({
  formatVersion: 1,
  id: id as ResourceLocation,
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
