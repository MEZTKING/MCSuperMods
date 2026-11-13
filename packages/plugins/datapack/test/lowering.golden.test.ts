import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  advancementKind,
  functionKind,
  GENERIC_DATA_REGISTRIES,
  type GenericDataRegistry,
  genericKinds,
  itemModifierKind,
  lootTableKind,
  predicateKind,
  recipeKind,
  TAG_REGISTRIES,
  tagKinds,
} from '../src/index';
import { blockingProblems, indexesFor, sortedJson } from './support';

/** Set `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing. */
const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** One vanilla entry and one vanilla tag per tag registry (`function` has no vanilla ids). */
const TAG_ENTRIES: Record<(typeof TAG_REGISTRIES)[number], [string, string]> = {
  block: ['minecraft:diamond_ore', '#minecraft:logs'],
  item: ['minecraft:diamond', '#minecraft:planks'],
  entity_type: ['minecraft:zombie', '#minecraft:skeletons'],
  fluid: ['minecraft:water', '#minecraft:lava'],
  game_event: ['minecraft:block_open', '#minecraft:vibrations'],
  function: ['example:greet', 'example:tick'],
  damage_type: ['minecraft:cactus', '#minecraft:is_fire'],
  enchantment: ['minecraft:sharpness', '#minecraft:curse'],
  painting_variant: ['minecraft:sunset', '#minecraft:placeable'],
  villager_trade: ['minecraft:fletcher/1/emerald_arrow', '#minecraft:fletcher/level_1'],
  'worldgen/biome': ['minecraft:plains', '#minecraft:is_overworld'],
  'worldgen/structure': ['minecraft:village_plains', '#minecraft:village'],
  'worldgen/world_preset': ['minecraft:flat', '#minecraft:extended'],
};

const tagSamples: Sample[] = tagKinds.map((kind, index) => {
  const registry = TAG_REGISTRIES[index] as (typeof TAG_REGISTRIES)[number];
  const [entry, other] = TAG_ENTRIES[registry];
  return {
    kind,
    name: 'mixed',
    id: 'example:mixed',
    data: {
      replace: false,
      values: [entry, other, '#example:others', { id: entry, required: false }],
    },
  };
});

/**
 * One sample per generic kind, using optional fields where the schema has them and project
 * ids where a sample references its own assets (textures, sounds, tags, functions).
 */
const GENERIC_SAMPLES: Record<GenericDataRegistry, Json> = {
  enchantment: {
    description: { text: 'Ruby Edge', color: 'red' },
    exclusive_set: '#example:others',
    supported_items: '#minecraft:enchantable/sharp_weapon',
    primary_items: '#minecraft:swords',
    weight: 2,
    max_level: 3,
    min_cost: { base: 10, per_level_above_first: 10 },
    max_cost: { base: 60, per_level_above_first: 10 },
    anvil_cost: 4,
    slots: ['mainhand'],
    effects: {
      'minecraft:damage': [
        {
          effect: {
            type: 'minecraft:add',
            value: { type: 'minecraft:linear', base: 1.5, per_level_above_first: 0.5 },
          },
        },
      ],
    },
  },
  damage_type: {
    message_id: 'example.ruby',
    scaling: 'never',
    exhaustion: 0,
    effects: 'burning',
    death_message_type: 'default',
  },
  dimension_type: {
    has_skylight: false,
    has_ceiling: true,
    has_ender_dragon_fight: false,
    coordinate_scale: 8,
    ambient_light: 0.1,
    logical_height: 128,
    infiniburn: '#minecraft:infiniburn_nether',
    min_y: 0,
    height: 256,
    monster_spawn_light_level: 7,
    monster_spawn_block_light_limit: 15,
    has_fixed_time: true,
  },
  chat_type: {
    chat: {
      translation_key: 'chat.type.announcement',
      parameters: ['sender', 'content'],
      style: { color: 'gold' },
    },
    narration: { translation_key: 'chat.type.text.narrate', parameters: ['sender', 'content'] },
  },
  jukebox_song: {
    sound_event: 'example:music_disc.ruby',
    description: { text: 'Ruby Waltz' },
    length_in_seconds: 92.5,
    comparator_output: 7,
  },
  banner_pattern: { asset_id: 'example:ruby', translation_key: 'block.example.banner.ruby' },
  painting_variant: {
    asset_id: 'example:ruby',
    width: 2,
    height: 1,
    title: { text: 'Ruby Landscape', color: 'yellow' },
    author: { text: 'Example', color: 'gray' },
  },
  trim_material: {
    palette_id: 'example:trim/ruby',
    description: { text: 'Ruby Material', color: '#9B111E' },
  },
  trim_pattern: {
    asset_id: 'example:ruby',
    description: { text: 'Ruby Armour Trim' },
    decal: true,
  },
  dialog: {
    type: 'minecraft:multi_action',
    title: 'Choose a gem',
    body: { type: 'minecraft:plain_message', contents: 'Pick one.' },
    actions: [
      {
        label: 'Ruby',
        action: { type: 'minecraft:run_command', command: 'function example:greet' },
      },
    ],
    columns: 2,
    can_close_with_escape: true,
  },
  villager_trade: {
    wants: { id: 'minecraft:emerald', count: 2 },
    additional_wants: { id: 'minecraft:paper', count: 4 },
    gives: { id: 'minecraft:diamond', count: 1 },
    max_uses: { type: 'minecraft:uniform', min: 4, max: 8 },
    xp: 10,
    reputation_discount: 0.05,
  },
  trade_set: {
    trades: ['example:ruby', 'minecraft:fletcher/1/stick_emerald'],
    amount: { type: 'minecraft:uniform', min: 1, max: 3 },
    allow_duplicates: false,
  },
};

const genericSamples: Sample[] = genericKinds.map((kind, index) => {
  const registry = GENERIC_DATA_REGISTRIES[index] as GenericDataRegistry;
  return { kind, name: 'ruby', id: 'example:ruby', data: GENERIC_SAMPLES[registry] };
});

const SAMPLES: Sample[] = [
  {
    kind: recipeKind,
    name: 'shaped',
    id: 'example:diamond_sword',
    data: {
      type: 'minecraft:crafting_shaped',
      category: 'equipment',
      pattern: ['D', 'D', 'S'],
      key: { D: 'minecraft:diamond', S: '#minecraft:planks' },
      result: { id: 'minecraft:diamond_sword', count: 1 },
    },
  },
  {
    kind: recipeKind,
    name: 'shapeless',
    id: 'example:emerald_from_logs',
    data: {
      type: 'minecraft:crafting_shapeless',
      category: 'misc',
      ingredients: ['minecraft:diamond', '#minecraft:logs'],
      result: { id: 'minecraft:emerald', count: 2 },
    },
  },
  {
    kind: recipeKind,
    name: 'smelting',
    id: 'example:iron_from_raw',
    data: {
      type: 'minecraft:smelting',
      category: 'misc',
      ingredient: 'minecraft:raw_iron',
      result: { id: 'minecraft:iron_ingot' },
      experience: 0.7,
      cookingtime: 200,
    },
  },
  {
    kind: lootTableKind,
    name: 'block',
    id: 'example:blocks/ruby_ore',
    data: {
      type: 'minecraft:block',
      pools: [
        {
          rolls: 1,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:diamond',
              modifier: { type: 'minecraft:set_count', count: 2 },
            },
          ],
          condition: { type: 'minecraft:survives_explosion' },
        },
      ],
    },
  },
  {
    kind: advancementKind,
    name: 'root',
    id: 'example:root',
    data: {
      display: {
        icon: { id: 'minecraft:diamond' },
        title: 'Shiny',
        background: 'minecraft:gui/advancements/backgrounds/stone',
        description: 'Pick up a diamond',
        frame: 'task',
      },
      criteria: {
        has_diamond: {
          trigger: 'minecraft:inventory_changed',
          conditions: { items: [{ items: 'minecraft:diamond' }] },
        },
      },
      rewards: {
        experience: 10,
        function: 'example:reward',
        loot: ['example:blocks/ruby_ore'],
        recipes: ['example:diamond_sword'],
      },
    },
  },
  {
    kind: predicateKind,
    name: 'sneaking',
    id: 'example:sneaking',
    data: {
      type: 'minecraft:entity_properties',
      entity: 'this',
      predicate: { flags: { is_sneaking: true } },
    },
  },
  {
    kind: itemModifierKind,
    name: 'random_count',
    id: 'example:random_count',
    data: {
      type: 'minecraft:set_count',
      count: { type: 'minecraft:uniform', min: 1, max: 3 },
      condition: 'example:sneaking',
    },
  },
  {
    kind: functionKind,
    name: 'greet',
    id: 'example:greet',
    data: {
      lines: [
        '# Greets the player.',
        'say Hello',
        '$tellraw @s {"text":"Hello, $(name)"}',
        'function example:reward',
      ],
    },
  },
  ...tagSamples,
  ...genericSamples,
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(`${targetId}/expected/${sample.kind.folder}/${sample.name}.json`, fixturesRoot);

const element = (sample: Sample): Element => ({
  formatVersion: 1,
  id: sample.id,
  kind: sample.kind.id,
  data: sample.data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

/** The golden form of a file: JSON contents as-is, text contents as a UTF-8 string. */
const recorded = (file: OutputFile): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    contents:
      file.contents instanceof Uint8Array
        ? new TextDecoder('utf-8', { fatal: true }).decode(file.contents)
        : file.contents,
    layer: file.layer,
    path: file.path,
  };
  if (file.schema !== undefined) out.schema = file.schema;
  if (file.language !== undefined) out.language = file.language;
  return out;
};

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it('covers every kind', () => {
      const covered = new Set(SAMPLES.map((sample) => sample.kind.id));
      expect([...covered].sort()).toEqual(
        [
          recipeKind,
          lootTableKind,
          advancementKind,
          predicateKind,
          itemModifierKind,
          functionKind,
          ...tagKinds,
          ...genericKinds,
        ]
          .map((kind) => kind.id)
          .sort(),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = await sample.kind.lower(element(sample), bundle.target);
        expect(files).toHaveLength(1);
        const [file] = files;
        if (file === undefined) throw new Error('no output');
        expect(file.layer).toBe('datapack');

        const indexes = await indexesFor(bundle);
        if (file.language === undefined) {
          expect(file.schema).toBe(sample.kind.schema);
          expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
        } else {
          expect(file.schema).toBeUndefined();
          expect(file.contents).toBeInstanceOf(Uint8Array);
        }
        // The element data itself passes the kind schema (for functions, `msm:function`).
        expect(blockingProblems(indexes, sample.kind.schema, sample.data)).toEqual([]);

        const actual = sortedJson(recorded(file));
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
