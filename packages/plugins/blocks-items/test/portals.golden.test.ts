/**
 * Golden tests of the `portal` block type (ADR 0077 D1, D8; B335): portals are lowered for
 * every built-in target, every output is validated against the schema it declares, and the
 * outputs are compared with `fixtures/<target id>/expected/block/portal-<name>.json`. Set
 * `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, JsonObject, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPES,
  blockDefinition,
  blockGeneratedModelIds,
  blockItemIdOf,
  blockKind,
  DEFAULT_PORTAL_TEXTURE,
  PORTAL_BLOCK_TAGS,
  PORTAL_MODEL_PARENTS,
  TYPE_BLOCK_TAGS,
} from '../src/index';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface PortalSample {
  name: string;
  id: ResourceLocation;
  data: JsonObject;
}

const sample = (name: string, id: string, data: JsonObject): PortalSample => ({
  name: `portal-${name}`,
  id: id as ResourceLocation,
  data: { format: 1, type: 'portal', ...data },
});

const SAMPLES: PortalSample[] = [
  sample('minimal', 'example:nether_gate', {
    frame: 'minecraft:crying_obsidian',
    destination: 'minecraft:the_nether',
  }),
  sample('textured', 'example:sky_portal', {
    display_name: 'Sky Portal',
    frame: 'example:chime_block',
    destination: 'minecraft:the_end',
    return_to: 'minecraft:the_nether',
    textures: { portal: 'example:block/sky_portal' },
    item: { creative_tab: 'minecraft:functional_blocks' },
    loot: 'self',
  }),
  sample('full', 'example:ember_portal', {
    display_name: 'Ember Portal',
    frame: '#minecraft:beacon_base_blocks',
    frame_block: 'minecraft:gold_block',
    igniter: '#minecraft:creeper_igniters',
    destination: 'minecraft:the_nether',
    travel: {
      scale: 8,
      arrival: 'portal',
      delay_ticks: 40,
      cooldown_ticks: 100,
      players_only: true,
      overlay: false,
    },
    sounds: { ambient: 'minecraft:block.beacon.ambient', travel: false },
    particles: { color: 0xe0561c, count: 8 },
    on_travel: 'example:arrived',
    events: {
      'example:arrived': { actions: [{ type: 'run_function', function: 'example:ruby/shimmer' }] },
    },
    components: {
      'msm:breakable': { hardness: 50, resistance: 1200, tool: 'pickaxe', min_tier: 'diamond' },
      'msm:light_emitter': { level: 15 },
    },
  }),
  sample('quiet', 'example:still_portal', {
    frame: 'minecraft:quartz_block',
    igniter: false,
    destination: 'minecraft:the_end',
    travel: { arrival: 'surface' },
    sounds: { ambient: false, travel: false },
    particles: { count: 0 },
    item: false,
  }),
];

/** Every string in `value`, nested lists and objects included. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** The test indexes with the ids a portal sample brings: its block, item, models and textures. */
function withSampleIds(
  indexes: TargetIndexes,
  portal: PortalSample,
  files: OutputFile[],
): TargetIndexes {
  const itemId = blockItemIdOf(portal.id, portal.data);
  const modelIds = files
    .filter((file) => file.path.includes('/models/'))
    .map((file) => file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'));
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [...(PROJECT_IDS.block ?? []), portal.id],
    item: [...(PROJECT_IDS.item ?? []), ...(itemId === undefined ? [] : [itemId])],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds],
    texture: strings(portal.data.textures),
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, portal: PortalSample): URL =>
  new URL(`${targetId}/expected/${blockKind.folder}/${portal.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

const byName = (name: string): PortalSample => {
  const found = SAMPLES.find((entry) => entry.name === `portal-${name}`);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const lower = async (portal: PortalSample): Promise<OutputFile[]> => {
  const target = builtInTargets[0]?.target;
  if (target === undefined) throw new Error('no built-in target');
  return blockKind.lower(element(blockKind.id, portal.id, portal.data), target);
};

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'portal lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((portal) => [portal.name, portal] as const))('%s', async (_, portal) => {
      const files = await blockKind.lower(
        element(blockKind.id, portal.id, portal.data),
        bundle.target,
      );
      const indexes = withSampleIds(await indexesFor(bundle), portal, files);
      const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
      expect(problems(blockKind.schema, portal.data)).toEqual([]);
      for (const file of files) {
        expect(file.schema, file.path).toBeDefined();
        if (file.schema === undefined) continue;
        expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
      }

      const actual = sortedJson(files.map(recorded));
      const url = fixtureUrl(targetId, portal);
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });

    it("names only vanilla's portal tag and models", async () => {
      const { registries } = await indexesFor(bundle);
      for (const tag of PORTAL_BLOCK_TAGS)
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      for (const parent of Object.values(PORTAL_MODEL_PARENTS))
        expect(registries.has('model', parent), parent).toBe(true);
      expect(registries.has('texture', DEFAULT_PORTAL_TEXTURE)).toBe(true);
    });
  },
);

describe('portal type', () => {
  it('is the last block type, with the slots ns and ew', () => {
    expect(BLOCK_TYPES.at(-1)).toBe('portal');
    expect(BLOCK_TYPE_MODEL_SLOTS.portal).toEqual(['ns', 'ew', 'item']);
    expect(TYPE_BLOCK_TAGS).toContain('portals');
  });

  it('has no block item unless item is given (ADR 0077 D1)', () => {
    const id = 'demo:gate';
    expect(blockItemIdOf(id, { type: 'portal' })).toBeUndefined();
    expect(blockItemIdOf(id, { type: 'portal', item: false })).toBeUndefined();
    expect(blockItemIdOf(id, { type: 'portal', item: {} })).toBe(id);
    expect(blockItemIdOf(id, { type: 'portal', item: { id: 'demo:gate_item' } })).toBe(
      'demo:gate_item',
    );
    expect(blockItemIdOf(id, { type: 'leaves' })).toBe(id);
  });

  it('keeps the type fields in the definition and strips textures, name and loot', () => {
    const full = byName('full');
    const definition = blockDefinition(element(blockKind.id, full.id, full.data));
    for (const field of [
      'frame',
      'frame_block',
      'igniter',
      'destination',
      'travel',
      'sounds',
      'particles',
      'on_travel',
    ]) {
      expect(definition[field], field).toEqual(full.data[field]);
    }
    const textured = byName('textured');
    const lowered = blockDefinition(element(blockKind.id, textured.id, textured.data));
    expect(lowered.textures).toBeUndefined();
    expect(lowered.display_name).toBeUndefined();
    expect(lowered.loot).toBeUndefined();
    expect(lowered.loot_table).toBeUndefined();
  });

  it('writes vanilla Nether portal models with the default texture when none is given', async () => {
    const files = await lower(byName('minimal'));
    const models = files.filter((file) => file.path.includes('/models/'));
    expect(models.map((file) => [file.path, file.contents])).toEqual([
      [
        'assets/example/models/block/nether_gate_ns.json',
        {
          parent: 'minecraft:block/nether_portal_ns',
          textures: { particle: DEFAULT_PORTAL_TEXTURE, portal: DEFAULT_PORTAL_TEXTURE },
        },
      ],
      [
        'assets/example/models/block/nether_gate_ew.json',
        {
          parent: 'minecraft:block/nether_portal_ew',
          textures: { particle: DEFAULT_PORTAL_TEXTURE, portal: DEFAULT_PORTAL_TEXTURE },
        },
      ],
    ]);
    // No item, no item model definition, no loot table, no lang key without a name.
    expect(files.some((file) => file.path.includes('/items/'))).toBe(false);
    expect(files.some((file) => file.path.includes('loot_table'))).toBe(false);
    expect(files.some((file) => file.path.includes('/lang/'))).toBe(false);
    expect(blockGeneratedModelIds('example:nether_gate', byName('minimal').data)).toEqual([
      'example:block/nether_gate_ns',
      'example:block/nether_gate_ew',
    ]);
  });

  it('gives an explicit block item a flat model of the portal texture', async () => {
    const files = await lower(byName('textured'));
    const item = files.find((file) => file.path === 'assets/example/models/item/sky_portal.json');
    expect(item?.contents).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'example:block/sky_portal' },
    });
    expect(blockGeneratedModelIds('example:sky_portal', byName('textured').data)).toEqual([
      'example:block/sky_portal_ns',
      'example:block/sky_portal_ew',
      'example:item/sky_portal',
    ]);
  });

  it('joins #minecraft:portals as a block tag only', async () => {
    const files = await lower(byName('quiet'));
    const tags = files.filter((file) => file.path.includes('/tags/'));
    expect(tags.map((file) => [file.path, file.contents, file.merge])).toEqual([
      ['data/minecraft/tags/block/portals.json', { values: ['example:still_portal'] }, 'tag'],
    ]);
  });
});
