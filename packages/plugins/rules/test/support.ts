/**
 * Test helpers of the rules plugin: a small project with a subject for every trigger, the real
 * schema and registry indexes of the built-in targets, patch application and golden files.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Element, ElementPatch, Json, JsonObject, ResourceLocation } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  type SchemaProblem,
  validateJson,
} from '@msm/schemas';
import { readVendoredJson, type TargetBundle } from '@msm/targets';

export const UPDATE = process.env.UPDATE_GOLDENS === '1';

/** An element of `kind` with `id` and `data`. */
export const element = (kind: string, id: string, data: Json): Element => ({
  formatVersion: 1,
  id: id as ResourceLocation,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const ANIMATED_MODEL = {
  model: 'demo:entity/guard',
  texture: 'demo:entity/guard',
};

/** The project the tests compile books against: one subject per kind of trigger. */
export const PROJECT: readonly Element[] = Object.freeze([
  element('msm:block', 'demo:ruby_block', {
    format: 1,
    display_name: 'Ruby Block',
    model: 'minecraft:block/stone',
    components: { 'msm:on_interact': { event: 'demo:ruby_block_use' } },
    events: {
      'demo:ruby_block_use': {
        actions: [{ type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime' }],
      },
    },
  }),
  element('msm:block', 'demo:plain_block', { format: 1, display_name: 'Plain Block' }),
  element('msm:block', 'demo:crate', {
    format: 1,
    display_name: 'Crate',
    components: { 'msm:container': { layout: 'chest', rows: 3 } },
  }),
  element('msm:block', 'demo:press', {
    format: 1,
    display_name: 'Press',
    components: { 'msm:machine': {} },
  }),
  element('msm:block', 'demo:gate', {
    format: 1,
    display_name: 'Gate',
    type: 'portal',
    frame: 'minecraft:obsidian',
    destination: 'minecraft:the_nether',
  }),
  element('msm:item', 'demo:wand', { format: 1, display_name: 'Wand' }),
  element('msm:item', 'demo:ruby', { format: 1, display_name: 'Ruby' }),
  element('msm:item', 'demo:dart', {
    format: 1,
    display_name: 'Dart',
    components: { 'msm:throwable': { speed: 2 } },
  }),
  element('msm:item', 'demo:helmet', {
    format: 1,
    display_name: 'Helmet',
    max_stack_size: 1,
    components: { 'msm:armor': { slot: 'helmet', material: 'iron' } },
  }),
  element('msm:entity', 'demo:guard', {
    format: 1,
    display_name: 'Guard',
    category: 'monster',
    size: { width: 0.6, height: 1.95 },
    components: {
      'msm:animated_model': ANIMATED_MODEL,
      'msm:attack': { damage: 3 },
    },
  }),
  element('msm:effect', 'demo:glow', {
    format: 1,
    display_name: 'Glow',
    category: 'beneficial',
    color: 16777215,
  }),
  element('msm:key_bind', 'demo:dash', {
    format: 1,
    display_name: 'Dash',
    default_key: 'key.keyboard.z',
  }),
  element('msm:vehicle', 'demo:tank', {
    format: 1,
    display_name: 'Tank',
    model: { geometry: 'demo:entity/tank', texture: 'demo:entity/tank' },
    movement: { mode: 'ground' },
    weapons: [
      { id: 'cannon', projectile: 'minecraft:fire_charge' },
      { id: 'gun', key: 'second', projectile: 'minecraft:arrow' },
    ],
  }),
  element('msm:hud', 'demo:mana', {
    format: 1,
    type: 'bar',
    value: { source: 'set' },
  }),
]);

/** Ids the registry index treats as project ids. */
export const PROJECT_IDS: Readonly<Record<string, readonly string[]>> = {
  block: ['demo:ruby_block', 'demo:plain_block', 'demo:crate', 'demo:press', 'demo:gate'],
  item: [
    'demo:ruby_block',
    'demo:plain_block',
    'demo:crate',
    'demo:press',
    'demo:gate',
    'demo:wand',
    'demo:ruby',
    'demo:dart',
    'demo:helmet',
  ],
  entity_type: ['demo:guard', 'demo:tank'],
  mob_effect: ['demo:glow'],
  function: ['demo:reward'],
  model: ['demo:entity/guard'],
  texture: ['demo:entity/guard', 'demo:entity/tank'],
  particle_type: ['demo:spark'],
};

/** A rule book element. */
export const book = (rules: Json[], counters: Json[] = [], id = 'demo:rules'): Element =>
  element('msm:rules', id, { counters, format: 1, rules });

/** Applies patches to copies of the elements, as `@msm/core` will (B367). */
export function applyPatches(
  elements: readonly Element[],
  patches: readonly ElementPatch[],
): Element[] {
  return elements.map((original) => {
    const mine = patches.filter((patch) => patch.elementId === original.id);
    if (mine.length === 0) return original;
    const data = structuredClone(original.data) as JsonObject;
    for (const patch of mine) {
      let node: JsonObject = data;
      patch.path.slice(0, -1).forEach((key) => {
        node = node[String(key)] as JsonObject;
      });
      node[String(patch.path[patch.path.length - 1])] = structuredClone(patch.value);
    }
    return { ...original, data };
  });
}

export interface TargetIndexes {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
}

const cache = new Map<string, Promise<TargetIndexes>>();
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

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

const SCHEMA_OF_KIND: Record<string, string> = {
  'msm:block': MSM_SCHEMA_REFS.block,
  'msm:item': MSM_SCHEMA_REFS.item,
  'msm:entity': MSM_SCHEMA_REFS.entity,
  'msm:effect': MSM_SCHEMA_REFS.effect,
  'msm:key_bind': MSM_SCHEMA_REFS.keyBind,
  'msm:vehicle': MSM_SCHEMA_REFS.vehicle,
  'msm:hud': MSM_SCHEMA_REFS.hud,
  'msm:rules': MSM_SCHEMA_REFS.rules,
};

/** Errors and unknown-id warnings of `value` against the schema of `kind`. */
export function blockingProblems(
  indexes: TargetIndexes,
  kind: string,
  value: Json,
): SchemaProblem[] {
  const ref = SCHEMA_OF_KIND[kind];
  if (ref === undefined) throw new Error(`no schema for ${kind}`);
  const node = indexes.schemaIndex.resolveSchemaRef(ref);
  return validateJson(value, node, { registries: indexes.registries }).filter(
    (problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id',
  );
}

/** JSON text with sorted keys, 2-space indent and a trailing newline. */
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

/** Compares `text` with the golden file at `url`, or rewrites it with `UPDATE_GOLDENS=1`. */
export async function golden(url: URL, text: string): Promise<string | null> {
  if (UPDATE) {
    await mkdir(dirname(url.pathname), { recursive: true });
    await writeFile(url, text);
    return null;
  }
  return readFile(url, 'utf8');
}
