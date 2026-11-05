/**
 * Golden tests of lowering: every sample is lowered for every built-in target, each output is
 * validated against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/<kind folder>/<sample>.json`. Set `UPDATE_GOLDENS=1` to
 * rewrite the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { blockKind, blocksItemsKinds, itemKind, modKind } from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** Every kind's default data, plus samples covering every editor field and component. */
const SAMPLES: Sample[] = [
  ...blocksItemsKinds.map((kind) => ({
    kind,
    name: 'default',
    id: (kind === modKind ? 'demo:mod' : 'demo:sample') as ResourceLocation,
    data: kind.defaultData as Json,
  })),
  {
    kind: blockKind,
    name: 'ruby_ore',
    id: 'example:ruby_ore',
    data: {
      format: 1,
      model: 'example:block/ruby_ore',
      display_name: 'Ruby Ore',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:natural_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 4 },
        'msm:on_interact': { event: 'example:shimmer' },
      },
      events: {
        'example:shimmer': {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
            { type: 'spawn_particle', particle: 'minecraft:glow', count: 12, spread: 0.4 },
            { type: 'run_function', function: 'example:ruby/shimmer' },
          ],
        },
      },
    },
  },
  {
    kind: blockKind,
    name: 'chime_block',
    id: 'example:chime_block',
    data: {
      format: 1,
      model: 'minecraft:block/note_block',
      display_name: 'Chime Block',
      loot: 'self',
      sound_type: 'wood',
      components: {
        'msm:breakable': { hardness: 0.8, tool: 'axe', min_tier: 'copper', requires_tool: false },
        'msm:redstone': {
          emit: 0,
          on_powered: 'example:wake',
          on_unpowered: 'example:sleep',
        },
        'msm:on_step': { event: 'example:wake', cooldown_ticks: 20 },
      },
      events: {
        'example:wake': {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.note_block.bell', pitch: 1.5 },
            { type: 'set_block_state', state: 'minecraft:glowstone', offset: [0, 1, 0] },
          ],
        },
        'example:sleep': {
          actions: [
            { type: 'set_block_state', state: 'minecraft:air', offset: [0, 1, 0] },
            { type: 'trigger_event', event: 'example:wake' },
          ],
        },
      },
    },
  },
  {
    kind: blockKind,
    name: 'glow_stone_no_item',
    id: 'example:ores/glow_stone',
    data: {
      format: 1,
      model: 'minecraft:block/glowstone',
      display_name: 'Glow Stone',
      loot: 'self',
      item: false,
      components: {
        'msm:breakable': { hardness: 2, tool: 'shovel', min_tier: 'netherite' },
        'msm:light_emitter': { level: 15 },
      },
    },
  },
  {
    kind: blockKind,
    name: 'loot_id_no_model',
    id: 'example:ruby_ore',
    data: { format: 1, loot: 'example:blocks/ruby_ore_rare', sound_type: 'deepslate' },
  },
  {
    kind: itemKind,
    name: 'ruby',
    id: 'example:ruby',
    data: {
      format: 1,
      model: 'example:item/ruby',
      display_name: 'Ruby',
      max_stack_size: 64,
      rarity: 'uncommon',
      creative_tab: 'minecraft:ingredients',
    },
  },
  {
    kind: itemKind,
    name: 'wand',
    id: 'example:wand',
    data: {
      format: 1,
      model: 'minecraft:item/blaze_rod',
      display_name: 'Wand',
      max_stack_size: 1,
      rarity: 'epic',
      components: {
        'msm:tool': { type: 'sword', tier: 'gold' },
        'msm:durability': { max: 32 },
        'msm:food': { nutrition: 1, saturation: 0.1, can_always_eat: true },
        'msm:on_use': { event: 'example:zap', cooldown_ticks: 10 },
      },
      events: {
        'example:zap': {
          actions: [
            { type: 'give_item', item: 'example:ruby', count: 2 },
            { type: 'spawn_particle', particle: 'minecraft:electric_spark', count: 5, speed: 0.1 },
          ],
        },
      },
    },
  },
  {
    kind: modKind,
    name: 'full',
    id: 'example:mod',
    data: {
      mod_id: 'example-mod',
      version: '1.2.0',
      name: 'Example Mod',
      description: 'Rubies and a wand.',
      authors: ['Alex', 'Sam'],
      licence: 'MIT',
    },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(`${targetId}/expected/${sample.kind.folder}/${sample.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it('covers every kind', () => {
      expect(new Set(SAMPLES.map((sample) => sample.kind.id))).toEqual(
        new Set(blocksItemsKinds.map((kind) => kind.id)),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = sample.kind.lower(
          element(sample.kind.id, sample.id, sample.data),
          bundle.target,
        );
        const indexes = await indexesFor(bundle);
        const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
        expect(problems(sample.kind.schema, sample.data)).toEqual([]);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
        }
        expect(sample.kind.lower(element(sample.kind.id, sample.id, sample.data), bundle.target)).toEqual(
          files,
        );

        const actual = sortedJson(files.map(recorded));
        const url = fixtureUrl(targetId, sample);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);
