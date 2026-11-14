import { API_VERSION, type ElementKind, type Json, type Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TOOLS,
  BlocksItemsLoweringError,
  blockDefinition,
  blocksItemsKinds,
  blocksItemsTemplates,
  blocksItemsValidators,
  burnTicks,
  compostProvider,
  definitionPath,
  descriptionKey,
  effectDefinition,
  effectKind,
  FULL_CUBE,
  incorrectForTierTag,
  isSeeThroughBlock,
  itemDefinition,
  lootAdditionKind,
  lowerBlock,
  lowerEffect,
  lowerItem,
  lowerMod,
  MSM_VANILLA_COMPONENTS,
  NEEDS_TIER_TAGS,
  needsTierTag,
  SHAPE_PRESET_BOXES,
  SHAPE_PRESETS,
  SPEAR_VANILLA_COMPONENTS,
  splitResourceLocation,
  TOOL_TIERS,
  WEAPON_ITEM_TAGS,
  weaponItemTags,
} from '../src/index';
import { blockingProblems, element, indexesFor } from './support';

const KIND_IDS = [
  'msm:block',
  'msm:item',
  'msm:effect',
  'msm:mod',
  'msm:biome_addition',
  'msm:loot_addition',
  'msm:potion',
];
const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];
const firstTarget = (builtInTargets[0] as TargetBundle).target;

/** What `registerPlugin` in `@msm/core` checks (core is not a dependency of this package). */
function registrationProblems(): string[] {
  const problems: string[] = [];
  const [major] = API_VERSION.split('.');
  if (plugin.apiVersion !== `^${major}.0.0`) problems.push(`range ${plugin.apiVersion}`);
  const ids = new Set<string>();
  const folders = new Set<string>();
  for (const kind of kinds()) {
    if (ids.has(kind.id)) problems.push(`duplicate id ${kind.id}`);
    if (folders.has(kind.folder)) problems.push(`duplicate folder ${kind.folder}`);
    ids.add(kind.id);
    folders.add(kind.folder);
  }
  return problems;
}

describe('@msm/plugin-blocks-items', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.blocks-items');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(registrationProblems()).toEqual([]);
  });

  it('contributes the seven kinds with their schemas, folders and registries', () => {
    expect(kinds().map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(blocksItemsKinds.map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(kinds().map((kind) => [kind.schema, kind.folder, kind.registry])).toEqual([
      [MSM_SCHEMA_REFS.block, 'block', 'block'],
      [MSM_SCHEMA_REFS.item, 'item', 'item'],
      [MSM_SCHEMA_REFS.effect, 'effect', 'mob_effect'],
      [MSM_SCHEMA_REFS.mod, 'mod', undefined],
      [MSM_SCHEMA_REFS.biomeAddition, 'biome_addition', undefined],
      [MSM_SCHEMA_REFS.lootAddition, 'loot_addition', undefined],
      [MSM_SCHEMA_REFS.potion, 'potion', 'potion'],
    ]);
  });

  it('contributes its templates, the twenty-one validators and the eight type validators', () => {
    expect(plugin.contributes.elementTemplates?.map((t) => t.id)).toEqual(
      blocksItemsTemplates.map((t) => t.id),
    );
    expect(plugin.contributes.validators?.map((v) => v.id)).toEqual([
      'msm.blocks-items.missing-model',
      'msm.blocks-items.missing-pull-model',
      'msm.blocks-items.passthrough-needs-data-pack',
      'msm.blocks-items.model-not-cube',
      'msm.blocks-items.unknown-event',
      'msm.blocks-items.event-cycle',
      'msm.blocks-items.mod-id',
      'msm.blocks-items.tool-tier',
      'msm.blocks-items.item-collision',
      'msm.blocks-items.armor-material',
      'msm.blocks-items.equipment-asset',
      'msm.blocks-items.component-conflict',
      'msm.blocks-items.while-worn',
      'msm.blocks-items.entity-inside',
      'msm.blocks-items.fast-tick-trigger',
      'msm.blocks-items.spawn-group-size',
      'msm.blocks-items.duplicate-biome-feature',
      'msm.blocks-items.loot-pool',
      'msm.blocks-items.potion-effect',
      'msm.blocks-items.potion-brewing',
      'msm.blocks-items.potion-id',
      'msm.blocks-items.type-components',
      'msm.blocks-items.type-appearance',
      'msm.blocks-items.type-facts',
      'msm.blocks-items.type-references',
      'msm.blocks-items.crop',
      'msm.blocks-items.sapling',
      'msm.blocks-items.leaves-particle',
      'msm.blocks-items.block-item-id',
      'msm.blocks-items.containers',
      'msm.blocks-items.machines',
    ]);
    expect(blocksItemsValidators).toHaveLength(21);
  });

  it('rejects unsafe ids and non-object data', () => {
    expect(() => splitResourceLocation('Bad:Id')).toThrow(BlocksItemsLoweringError);
    expect(() => splitResourceLocation('demo:a/../b')).toThrow(BlocksItemsLoweringError);
    expect(() => lowerBlock(element('msm:block', 'demo:a', []), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
    expect(() => lowerItem(element('msm:item', 'demo:a', 'x'), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
    expect(() => lowerEffect(element('msm:effect', 'demo:a', [1]), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
    expect(() => lowerMod(element('msm:mod', 'demo:mod', { mod_id: 'a' }), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
  });

  it('refuses fabric.mod.json for a target without Fabric facts', () => {
    const { fabric: _fabric, ...rest } = firstTarget;
    const noFabric: Target = rest;
    expect(() =>
      lowerMod(element('msm:mod', 'demo:mod', { mod_id: 'demo', version: '1' }), noFabric),
    ).toThrow(/no Fabric facts/);
  });

  it('writes description ids with dots for path separators', () => {
    expect(descriptionKey('block', 'demo', 'ores/ruby')).toBe('block.demo.ores.ruby');
    expect(descriptionKey('effect', 'demo', 'curses/frost')).toBe('effect.demo.curses.frost');
    expect(definitionPath('effect', 'demo', 'curses/frost')).toBe(
      'msm/demo/effect/curses/frost.json',
    );
  });

  it('strips editor fields, keeps an explicit requires_tool and writes format 1', () => {
    const data: Json = {
      format: 1,
      model: 'minecraft:block/stone',
      display_name: 'X',
      loot: 'demo:blocks/other',
      item: false,
      components: { 'msm:breakable': { tool: 'axe', requires_tool: false, hardness: 2 } },
    };
    const definition = blockDefinition(element('msm:block', 'demo:x', data));
    expect(definition).toEqual({
      format: 1,
      item: false,
      loot_table: 'demo:blocks/other',
      components: { 'msm:breakable': { requires_tool: false, hardness: 2 } },
    });
    expect((data as { model?: string }).model).toBe('minecraft:block/stone');
    expect(
      blockDefinition(
        element('msm:block', 'demo:x', { format: 1, loot: 'demo:a', loot_table: 'demo:b' }),
      ).loot_table,
    ).toBe('demo:b');
    expect(
      itemDefinition(element('msm:item', 'demo:x', { format: 1, model: 'm:x', display_name: 'D' })),
    ).toEqual({ format: 1 });
  });

  it('lowers an effect to its definition without the name, plus the name key (ADR 0055 D2)', () => {
    const data: Json = {
      format: 1,
      display_name: 'Frost',
      category: 'harmful',
      color: 255,
      components: { 'msm:on_tick': { event: 'demo:bite' } },
      events: { 'demo:bite': { actions: [{ type: 'damage', amount: 1 }] } },
    };
    const effect = element('msm:effect', 'demo:frost', data);
    const { display_name: _name, ...definition } = data as Record<string, Json>;
    expect(effectDefinition(effect)).toEqual(definition);
    expect((data as { display_name?: string }).display_name).toBe('Frost');
    const files = lowerEffect(effect, firstTarget);
    expect(files.map((file) => [file.path, file.layer, file.schema, file.merge])).toEqual([
      ['msm/demo/effect/frost.json', 'msm', MSM_SCHEMA_REFS.effectDefinition, undefined],
      [
        `assets/demo/${firstTarget.folders.resource.lang}/en_us.json`,
        'resourcepack',
        '::java::assets::lang::Lang',
        'object',
      ],
    ]);
    expect(files[1]?.contents).toEqual({ 'effect.demo.frost': 'Frost' });
    expect(lowerEffect(element('msm:effect', 'demo:x', { format: 1 }), firstTarget)).toHaveLength(
      1,
    );
    expect(effectKind.defaultData).toMatchObject({ format: 1, category: 'beneficial' });
    expect(effectKind.hiddenPaths).toEqual(['/format']);
  });

  it('maps every tier to a needs tag by mining level', () => {
    expect(TOOL_TIERS.map((tier) => needsTierTag(tier))).toEqual([
      undefined,
      'needs_stone_tool',
      'needs_stone_tool',
      'needs_iron_tool',
      'needs_diamond_tool',
      undefined,
      'needs_diamond_tool',
    ]);
    expect(needsTierTag('mithril')).toBeUndefined();
    expect(incorrectForTierTag('wood')).toBe('minecraft:incorrect_for_wooden_tool');
  });
});

describe('fuel and compost lowering (ADR 0060 D4)', () => {
  it('turns burn seconds into whole ticks, at least one', () => {
    expect(burnTicks(80)).toBe(1600);
    expect(burnTicks(0.05)).toBe(1);
    expect(burnTicks(0.01)).toBe(1);
    expect(burnTicks(12.34)).toBe(247);
  });

  it('writes the components into msm:components, the friendly field winning', () => {
    const definition = itemDefinition(
      element('msm:item', 'demo:x', {
        format: 1,
        fuel: { burn_seconds: 10 },
        compost: '50%',
        components: {
          'msm:components': { cooking_fuel: { burn_time: 1, speed_multiplier: 2 }, glider: {} },
        },
      }),
      firstTarget,
    );
    expect(definition).toEqual({
      format: 1,
      components: {
        'msm:components': {
          glider: {},
          'minecraft:cooking_fuel': { burn_time: 200, speed_multiplier: 1 },
          'minecraft:compostable': { layers: compostProvider(firstTarget, '50%') },
        },
      },
    });
  });

  it('leaves definitions without the fields untouched (byte-identical lowering)', () => {
    const data = { format: 1, item: { max_stack_size: 16 } };
    expect(blockDefinition(element('msm:block', 'demo:x', data), firstTarget)).toEqual(data);
    expect(blockDefinition(element('msm:block', 'demo:y', { format: 1, item: false }))).toEqual({
      format: 1,
      item: false,
    });
    expect(itemDefinition(element('msm:item', 'demo:x', { format: 1 }), firstTarget)).toEqual({
      format: 1,
    });
  });

  it('strips the fields from a block item and refuses a chance the target cannot give', () => {
    const block = (compost: string) =>
      element('msm:block', 'demo:x', { format: 1, item: { compost } });
    expect(blockDefinition(block('30%'), firstTarget)).toEqual({
      format: 1,
      item: {
        components: {
          'msm:components': {
            'minecraft:compostable': { layers: compostProvider(firstTarget, '30%') },
          },
        },
      },
    });
    expect(() => blockDefinition(block('42%'), firstTarget)).toThrow(BlocksItemsLoweringError);
    expect(() => blockDefinition(block('30%'))).toThrow(BlocksItemsLoweringError);
  });

  it('lowers additions to the msm layer only', async () => {
    const files = await lootAdditionKind.lower(
      element('msm:loot_addition', 'demo:extra/zombie', lootAdditionKind.defaultData as Json),
      firstTarget,
    );
    expect(files.map((file) => [file.path, file.layer, file.schema])).toEqual([
      [
        definitionPath('loot_addition', 'demo', 'extra/zombie'),
        'msm',
        MSM_SCHEMA_REFS.lootAdditionDefinition,
      ],
    ]);
  });
});

describe('msm:shape lowering (ADR 0059 D2)', () => {
  const shaped = (shape: Json): Json => ({
    format: 1,
    model: 'minecraft:block/stone',
    components: { 'msm:shape': shape },
  });
  const loweredShape = (shape: Json): Json => {
    const definition = blockDefinition(element('msm:block', 'demo:x', shaped(shape)));
    return (definition.components as Record<string, Json>)['msm:shape'] as Json;
  };

  it('has one box list per preset other than custom', () => {
    expect(Object.keys(SHAPE_PRESET_BOXES).sort()).toEqual(
      SHAPE_PRESETS.filter((preset) => preset !== 'custom').sort(),
    );
    expect(SHAPE_PRESET_BOXES.full).toEqual([FULL_CUBE]);
  });

  it.each([
    ['full', { boxes: [[0, 0, 0, 16, 16, 16]] }],
    ['slab_bottom', { boxes: [[0, 0, 0, 16, 8, 16]] }],
    ['slab_top', { boxes: [[0, 8, 0, 16, 16, 16]] }],
    ['carpet', { boxes: [[0, 0, 0, 16, 1, 16]] }],
    ['pillar', { boxes: [[4, 0, 4, 12, 16, 12]] }],
    ['cross', { boxes: [[2, 0, 2, 14, 16, 14]], collision: false }],
  ] as const)('lowers preset %s to its boxes and strips the preset', (preset, expected) => {
    // A stale `boxes` from an earlier custom shape is replaced by the preset's.
    expect(loweredShape({ preset, boxes: [[1, 1, 1, 2, 2, 2]] })).toEqual(expected);
  });

  it('keeps custom boxes, an explicit collision on a cross and see_through', () => {
    const boxes = [
      [0, 0, 0, 16, 8, 16],
      [0, 8, 0, 8, 16, 16],
    ];
    expect(loweredShape({ preset: 'custom', boxes, see_through: false })).toEqual({
      boxes,
      see_through: false,
    });
    expect(loweredShape({ boxes })).toEqual({ boxes });
    expect(loweredShape({ preset: 'cross', collision: true, see_through: true })).toEqual({
      boxes: [[2, 0, 2, 14, 16, 14]],
      collision: true,
      see_through: true,
    });
    expect(loweredShape({ preset: 'custom' })).toEqual({});
  });

  it('never mutates the element data', () => {
    const data = shaped({ preset: 'slab_top' });
    blockDefinition(element('msm:block', 'demo:x', data));
    expect(data).toEqual(shaped({ preset: 'slab_top' }));
  });

  it('tells see-through blocks by the runtime default (ADR 0059 D1)', () => {
    expect(isSeeThroughBlock({ format: 1 })).toBe(false);
    expect(isSeeThroughBlock(shaped({}))).toBe(false);
    expect(isSeeThroughBlock(shaped({ preset: 'full' }))).toBe(false);
    expect(isSeeThroughBlock(shaped({ preset: 'full', see_through: true }))).toBe(true);
    expect(isSeeThroughBlock(shaped({ preset: 'slab_bottom' }))).toBe(true);
    expect(isSeeThroughBlock(shaped({ preset: 'cross', see_through: false }))).toBe(false);
    expect(isSeeThroughBlock(shaped({ boxes: [[0, 0, 0, 16, 16, 16]] }))).toBe(false);
    expect(isSeeThroughBlock(shaped({ boxes: [[0, 0, 0, 16, 15, 16]] }))).toBe(true);
  });
});

describe('weapon item tags (ADR 0044 D3)', () => {
  const tags = (components: Json): string[] => weaponItemTags({ format: 1, components });

  it('joins the enchanting tags of each weapon kind', () => {
    expect(tags({ 'msm:tool': { type: 'spear', tier: 'iron' } })).toEqual(['spears']);
    expect(tags({ 'msm:tool': { type: 'mace', tier: 'iron' } })).toEqual([
      'enchantable/durability',
      'enchantable/fire_aspect',
      'enchantable/mace',
      'enchantable/weapon',
    ]);
    expect(tags({ 'msm:ranged_weapon': { type: 'bow' } })).toEqual(['enchantable/bow']);
    expect(
      tags({ 'msm:ranged_weapon': { type: 'crossbow' }, 'msm:durability': { max: 9 } }),
    ).toEqual(['enchantable/crossbow', 'enchantable/durability']);
    expect(tags({ 'msm:shield': {}, 'msm:durability': { max: 9 } })).toEqual([
      'enchantable/durability',
    ]);
  });

  it('adds none for other items', () => {
    expect(tags({ 'msm:shield': {} })).toEqual([]);
    expect(tags({ 'msm:tool': { type: 'sword', tier: 'iron' } })).toEqual([]);
    expect(tags({ 'msm:durability': { max: 9 } })).toEqual([]);
    expect(weaponItemTags({ format: 1 })).toEqual([]);
  });

  it('lowers them as merged data pack item tags', () => {
    const files = lowerItem(
      element('msm:item', 'demo:spear', {
        format: 1,
        components: { 'msm:tool': { type: 'spear', tier: 'iron' } },
      }),
      firstTarget,
    );
    expect(files.at(-1)).toEqual({
      path: `data/minecraft/${firstTarget.folders.data.tags}/item/spears.json`,
      contents: { values: ['demo:spear'] },
      layer: 'datapack',
      schema: 'tag:item',
      merge: 'tag',
    });
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'vanilla facts for %s',
  (_targetId, bundle) => {
    it('has every tag the lowering and the tier check name', async () => {
      const { registries } = await indexesFor(bundle);
      for (const tool of BLOCK_TOOLS)
        expect(registries.has('tag/block', `minecraft:mineable/${tool}`), tool).toBe(true);
      for (const tag of NEEDS_TIER_TAGS)
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      for (const tier of TOOL_TIERS)
        expect(registries.has('tag/block', incorrectForTierTag(tier)), tier).toBe(true);
      for (const tag of WEAPON_ITEM_TAGS)
        expect(registries.has('tag/item', `minecraft:${tag}`), tag).toBe(true);
    });

    it('has every vanilla data component the conflict check names', async () => {
      const { registries } = await indexesFor(bundle);
      const ids = new Set([
        ...Object.values(MSM_VANILLA_COMPONENTS).flat(),
        ...SPEAR_VANILLA_COMPONENTS,
      ]);
      for (const id of ids)
        expect(registries.has('data_component_type', `minecraft:${id}`), id).toBe(true);
    });

    it('has the folders lowering uses', () => {
      const { resource, data } = bundle.target.folders;
      for (const folder of [
        resource.block_definition,
        resource.item_definition,
        resource.lang,
        data.tags,
        data.loot_table,
      ])
        expect(folder).toMatch(/^[a-z_]+$/);
      expect(bundle.target.fabric).toBeDefined();
    });

    it('checks effect data and throwables against the real schemas', async () => {
      const indexes = await indexesFor(bundle);
      const bad = blockingProblems(indexes, MSM_SCHEMA_REFS.effect, {
        format: 1,
        category: 'awful',
        color: -1,
        attribute_modifiers: [
          { attribute: 'minecraft:no_such_stat', amount: 1, operation: 'add_value' },
        ],
      });
      expect(bad.length).toBeGreaterThanOrEqual(3);
      expect(bad.some((problem) => problem.code === 'schema.unknown-id')).toBe(true);
      const item = (throwable: Json): Json => ({
        format: 1,
        components: { 'msm:throwable': throwable },
        events: {
          'demo:hit': {
            actions: [{ type: 'apply_effect', effect: 'demo:sample', seconds: 1, target: 'other' }],
          },
        },
      });
      expect(
        blockingProblems(
          indexes,
          MSM_SCHEMA_REFS.item,
          item({ on_hit_entity: { event: 'demo:hit' } }),
        ),
      ).toEqual([]);
      expect(
        blockingProblems(
          indexes,
          MSM_SCHEMA_REFS.item,
          item({ speed: 9, after_throw: 'boomerang' }),
        ),
      ).not.toEqual([]);
    });

    it('has a compost provider for every chance the format offers', () => {
      for (const chance of ['30%', '50%', '65%', '85%', '100%']) {
        expect(compostProvider(bundle.target, chance), chance).toMatch(/^minecraft:compostable\//);
      }
    });

    it('has loot addition pools in the default and the template that the vanilla pool schema accepts', async () => {
      const indexes = await indexesFor(bundle);
      const template = blocksItemsTemplates.find((t) => t.kind === 'msm:loot_addition');
      if (template === undefined) throw new Error('no loot addition template');
      const created = (await template.data({
        id: 'demo:sample',
        namespace: 'demo',
        path: 'sample',
        projectNamespace: 'demo',
        namespaces: ['demo'],
        kindDefault: undefined,
        target: bundle.target,
      })) as { pools: Json[] };
      const pools = [
        ...(lootAdditionKind.defaultData as { pools: Json[] }).pools,
        ...created.pools,
      ];
      expect(pools.length).toBe(2);
      for (const pool of pools) {
        expect(blockingProblems(indexes, '::java::data::loot::LootPool', pool)).toEqual([]);
      }
      expect(
        blockingProblems(indexes, '::java::data::loot::LootPool', { rolls: 1 }).length,
      ).toBeGreaterThan(0);
    });

    it.each(KIND_IDS.map((id) => [id] as const))('%s default data validates', async (kindId) => {
      const kind = kinds().find((entry) => entry.id === kindId) as ElementKind;
      const indexes = await indexesFor(bundle);
      expect(blockingProblems(indexes, kind.schema, kind.defaultData as Json)).toEqual([]);
      const files = await kind.lower(
        element(
          kind.id,
          kindId === 'msm:mod' ? 'demo:mod' : 'demo:sample',
          kind.defaultData as Json,
        ),
        bundle.target,
      );
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        if (file.schema === undefined) continue;
        expect(blockingProblems(indexes, file.schema, file.contents as Json), file.path).toEqual(
          [],
        );
      }
    });
  },
);
