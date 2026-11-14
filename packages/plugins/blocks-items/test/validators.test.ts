import { readFile } from 'node:fs/promises';
import type { Element, Problem, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BLOCKS_ITEMS_PROBLEM_CODES,
  blocksItemsValidators,
  DELAYED_PASSTHROUGH_COMPONENTS,
  isCubeModel,
  RESERVED_MOD_IDS,
  THROWABLE_CONFLICTS,
  TRANSPARENT_TEXTURE_CODE,
  transparentTextureProblem,
} from '../src/index';
import { element, indexesFor } from './support';

const bundle = builtInTargets[0] as TargetBundle;

async function validate(elements: Element[], withTags = true): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  const registry: ValidationInput['registry'] = withTags
    ? registries
    : createRegistryIndex({ vanilla: {} });
  const results = await Promise.all(
    blocksItemsValidators.map((validator) =>
      validator.validate({ elements, target: bundle.target, registry }),
    ),
  );
  return results.flat();
}

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);

const block = (id: `${string}:${string}`, data: Record<string, unknown>): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const item = (id: `${string}:${string}`, data: Record<string, unknown>): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick', ...data } as never);
const effect = (id: `${string}:${string}`, data: Record<string, unknown>): Element =>
  element('msm:effect', id, { format: 1, category: 'harmful', color: 0, ...data } as never);
const THROWABLE = { 'msm:throwable': { damage: 1 } };

describe('blocks-items validators', () => {
  it('lists every code it reports', () => {
    expect(BLOCKS_ITEMS_PROBLEM_CODES).toHaveLength(25);
    expect(BLOCKS_ITEMS_PROBLEM_CODES).toContain(TRANSPARENT_TEXTURE_CODE);
  });

  it('warns when a block has a non-cube project model and no shape (ADR 0059 D4)', async () => {
    const model = (id: `${string}:${string}`, data: Record<string, unknown>) =>
      element('minecraft:model', id, data as never);
    const problems = await validate([
      model('demo:block/cube_child', { parent: 'minecraft:block/cube_all' }),
      model('demo:block/column', { parent: 'block/cube_column' }),
      model('demo:block/furnace_like', { parent: 'minecraft:block/orientable' }),
      model('demo:block/grandchild', { parent: 'demo:block/cube_child' }),
      model('demo:block/slab', { parent: 'minecraft:block/slab' }),
      model('demo:block/via_slab', { parent: 'demo:block/slab' }),
      model('demo:block/own', { elements: [{ from: [0, 0, 0], to: [16, 8, 16] }] }),
      model('demo:block/loop_a', { parent: 'demo:block/loop_b' }),
      model('demo:block/loop_b', { parent: 'demo:block/loop_a' }),
      block('demo:a', { model: 'demo:block/cube_child' }),
      block('demo:b', { model: 'demo:block/column' }),
      block('demo:c', { model: 'demo:block/furnace_like' }),
      block('demo:d', { model: 'demo:block/grandchild' }),
      block('demo:e', { model: 'demo:block/slab' }),
      block('demo:f', { model: 'demo:block/via_slab' }),
      block('demo:g', { model: 'demo:block/own' }),
      block('demo:h', { model: 'demo:block/loop_a' }),
      block('demo:i', { model: 'minecraft:block/oak_slab' }),
      block('demo:j', {
        model: 'demo:block/slab',
        components: { 'msm:shape': { preset: 'slab_bottom' } },
      }),
    ]);
    const found = problems.filter((problem) => problem.code === 'blocks-items.model-not-cube');
    expect(found.map((problem) => problem.elementId)).toEqual(['demo:e', 'demo:f', 'demo:g']);
    expect(found.every((problem) => problem.severity === 'warning')).toBe(true);
    expect(found.every((problem) => problem.path === '/model')).toBe(true);
    expect(found[0]?.message).toContain('"minecraft:block/slab" is not a cube');
    expect(found[1]?.message).toContain('"minecraft:block/slab" is not a cube');
    expect(found[2]?.message).toContain('has its own elements');
  });

  it('knows the vanilla cube model families', () => {
    for (const id of ['minecraft:block/cube', 'block/cube_all', 'minecraft:block/orientable']) {
      expect(isCubeModel(id), id).toBe(true);
    }
    for (const id of ['minecraft:block/slab', 'minecraft:block/cross', 'minecraft:block/cubes']) {
      expect(isCubeModel(id), id).toBe(false);
    }
  });

  it('words the app-side transparent texture warning (ADR 0059 D4)', () => {
    expect(transparentTextureProblem('demo:a', 'demo:block/glass')).toMatchObject({
      severity: 'warning',
      code: TRANSPARENT_TEXTURE_CODE,
      elementId: 'demo:a',
      path: '/model',
    });
  });

  it('warns when a custom bow or crossbow model has no pulling models', async () => {
    const bow = { components: { 'msm:ranged_weapon': { type: 'bow' } } };
    const crossbow = { components: { 'msm:ranged_weapon': { type: 'crossbow' } } };
    const model = (id: `${string}:${string}`) =>
      element('minecraft:model', id, { parent: 'minecraft:item/bow' } as never);
    const problems = await validate([
      item('demo:vanilla_bow', { ...bow, model: 'minecraft:item/bow' }),
      item('demo:ruby_bow', { ...bow, model: 'demo:item/ruby_bow' }),
      model('demo:item/ruby_bow_pulling_0'),
      model('demo:item/ruby_bow_pulling_1'),
      model('demo:item/ruby_bow_pulling_2'),
      item('demo:ruby_crossbow', { ...crossbow, model: 'demo:item/ruby_crossbow' }),
      model('demo:item/ruby_crossbow_pulling_0'),
    ]);
    const pull = problems.filter((problem) => problem.code === 'blocks-items.missing-pull-model');
    expect(pull.map((problem) => problem.elementId)).toEqual(['demo:ruby_crossbow']);
    expect(pull[0]?.message).toContain(
      'demo:item/ruby_crossbow_pulling_1, demo:item/ruby_crossbow_pulling_2, demo:item/ruby_crossbow_arrow, demo:item/ruby_crossbow_firework',
    );
  });

  it('warns about passthrough components that name data pack entries the runtime cannot wait for', async () => {
    const problems = await validate([
      item('demo:book', {
        components: {
          'msm:components': {
            'minecraft:stored_enchantments': { 'minecraft:sharpness': 1 },
            jukebox_playable: 'minecraft:cat',
            'minecraft:max_damage': 10,
          },
        },
      }),
    ]);
    const found = problems.filter(
      (problem) => problem.code === 'blocks-items.passthrough-needs-data-pack',
    );
    expect(found.map((problem) => problem.path)).toEqual([
      '/components/msm:components/minecraft:stored_enchantments',
    ]);
    expect(found[0]?.severity).toBe('warning');
    expect(found[0]?.message).toContain('"jukebox_playable"');
  });

  it('mirrors the runtime list of late passthrough components', async () => {
    const java = await readFile(
      new URL(
        '../../../../engine-mod/src/main/java/dev/mcsupermods/runtime/registry/ComponentPassthrough.java',
        import.meta.url,
      ),
      'utf8',
    );
    const delayed = java.slice(
      java.indexOf('DELAYED = Set.of('),
      java.indexOf(');', java.indexOf('DELAYED = Set.of(')),
    );
    const ids = [...delayed.matchAll(/withDefaultNamespace\("([a-z_/]+)"\)/g)].map(
      (match) => match[1],
    );
    expect([...ids].sort()).toEqual([...DELAYED_PASSTHROUGH_COMPONENTS]);
  });

  it('accepts a clean project', async () => {
    const problems = await validate([
      block('demo:ore', {
        components: {
          'msm:breakable': { tool: 'pickaxe', min_tier: 'copper' },
          'msm:on_interact': { event: 'demo:a' },
        },
        events: {
          'demo:a': { actions: [{ type: 'trigger_event', event: 'demo:b' }] },
          'demo:b': { actions: [{ type: 'play_sound', sound: 'minecraft:block.stone.break' }] },
        },
      }),
      block('demo:plain', { item: false }),
      item('demo:plain', { components: { 'msm:tool': { type: 'axe', tier: 'netherite' } } }),
      element('msm:mod', 'demo:mod', { mod_id: 'demo_mod-2', version: '1.0.0' }),
    ]);
    expect(problems).toEqual([]);
  });

  it('warns about a missing model', async () => {
    const problems = await validate([
      element('msm:block', 'demo:a', { format: 1 }),
      element('msm:item', 'demo:b', { format: 1, model: '' }),
    ]);
    expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
      ['blocks-items.missing-model', 'warning', 'demo:a', '/model'],
      ['blocks-items.missing-model', 'warning', 'demo:b', '/model'],
    ]);
  });

  it('reports unknown events in trigger components and trigger_event actions', async () => {
    const problems = await validate([
      block('demo:a', {
        components: {
          'msm:on_interact': { event: 'demo:x' },
          'msm:on_step': { event: 'demo:ok' },
          'msm:redstone': { on_powered: 'demo:y', on_unpowered: 'demo:ok' },
        },
        events: { 'demo:ok': { actions: [{ type: 'trigger_event', event: 'demo/z' }] } },
      }),
      item('demo:b', { components: { 'msm:on_use': { event: 'demo:w' } } }),
    ]);
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['blocks-items.unknown-event', 'demo:a', '/components/msm:on_interact/event'],
      ['blocks-items.unknown-event', 'demo:a', '/components/msm:redstone/on_powered'],
      ['blocks-items.unknown-event', 'demo:a', '/events/demo:ok/actions/0/event'],
      ['blocks-items.unknown-event', 'demo:b', '/components/msm:on_use/event'],
    ]);
  });

  it('does not treat run_script actions as event references (ADR 0032 D4)', async () => {
    const problems = await validate([
      block('demo:a', {
        components: { 'msm:on_interact': { event: 'demo:x' } },
        events: {
          'demo:x': {
            actions: [
              { type: 'run_script', handler: 'demo:x' },
              { type: 'run_script', handler: 'demo:undeclared' },
              { type: 'trigger_event', event: 'demo:y' },
            ],
          },
          'demo:y': { actions: [{ type: 'run_script', handler: 'demo:y' }] },
        },
      }),
      item('demo:b', {
        events: { 'demo/self': { actions: [{ type: 'run_script', handler: 'demo/self' }] } },
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it('reports event cycles, including a self-loop', async () => {
    const trigger = (event: string) => ({ actions: [{ type: 'trigger_event', event }] });
    const problems = await validate([
      block('demo:a', {
        events: {
          'demo:x': trigger('demo:y'),
          'demo:y': trigger('demo:x'),
          'demo:z': trigger('demo:x'),
        },
      }),
      item('demo:b', { events: { 'demo/self': trigger('demo/self') } }),
    ]);
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['blocks-items.event-cycle', 'demo:a', '/events/demo:x'],
      ['blocks-items.event-cycle', 'demo:b', '/events/demo~1self'],
    ]);
    expect(problems[0]?.message).toContain('"demo:x", "demo:y"');
  });

  it('reports a mod id that breaks the Fabric rule', async () => {
    const mod = (modId: string) => element('msm:mod', 'demo:mod', { mod_id: modId, version: '1' });
    for (const bad of ['1mod', 'Mod', 'a', 'my.mod', `a${'b'.repeat(64)}`]) {
      expect(codes(await validate([mod(bad)])), bad).toEqual(['blocks-items.bad-mod-id']);
    }
    expect(await validate([mod('ab')])).toEqual([]);
  });

  it('reports a reserved mod id (ADR 0026 D2)', async () => {
    const mod = (modId: string) => element('msm:mod', 'demo:mod', { mod_id: modId, version: '1' });
    for (const reserved of RESERVED_MOD_IDS) {
      const problems = await validate([mod(reserved)]);
      expect(codes(problems), reserved).toEqual(['blocks-items.reserved-mod-id']);
      expect(problems[0]?.path).toBe('/mod_id');
      expect(problems[0]?.message).toContain(`mod_${reserved}`);
    }
    expect(await validate([mod('mod_minecraft')])).toEqual([]);
  });

  it('reports tool tiers the target does not know, unless it has no block tags', async () => {
    const elements = [
      block('demo:a', { components: { 'msm:breakable': { min_tier: 'mithril' } } }),
      item('demo:b', { components: { 'msm:tool': { type: 'pickaxe', tier: 'adamant' } } }),
    ];
    const problems = await validate(elements);
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['blocks-items.unknown-tool-tier', 'demo:a', '/components/msm:breakable/min_tier'],
      ['blocks-items.unknown-tool-tier', 'demo:b', '/components/msm:tool/tier'],
    ]);
    expect(problems[0]?.message).toContain('minecraft:incorrect_for_mithril_tool');
    expect(await validate(elements, false)).toEqual([]);
  });

  it('reports an item that collides with a block item', async () => {
    const problems = await validate([
      block('demo:ruby', {}),
      block('demo:gem', { item: false }),
      item('demo:ruby', {}),
      item('demo:gem', {}),
    ]);
    expect(problems.map((p) => [p.code, p.elementId])).toEqual([
      ['blocks-items.item-collision', 'demo:ruby'],
    ]);
  });

  describe('armour and custom tool materials (ADR 0042)', () => {
    const customMaterial = (asset: string) => ({
      durability: 20,
      defense: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
      enchantment_value: 10,
      toughness: 0,
      knockback_resistance: 0,
      equipment_asset: asset,
    });
    const equipment = (id: `${string}:${string}`): Element =>
      element('minecraft:equipment', id, {
        layers: { humanoid: [{ texture: id }], humanoid_leggings: [{ texture: id }] },
      });

    it('accepts vanilla and custom armour, custom tool materials and attack overrides', async () => {
      const problems = await validate([
        item('demo:iron_cap', {
          components: { 'msm:armor': { slot: 'helmet', material: 'iron' } },
        }),
        item('demo:ruby_chestplate', {
          components: {
            'msm:armor': { slot: 'chestplate', material: customMaterial('demo:ruby') },
            'msm:durability': { max: 400 },
          },
        }),
        item('demo:steel_boots', {
          components: { 'msm:armor': { slot: 'boots', material: customMaterial('chainmail') } },
        }),
        equipment('demo:ruby'),
        item('demo:ruby_pickaxe', {
          components: {
            'msm:tool': {
              type: 'pickaxe',
              tier: {
                durability: 900,
                speed: 8,
                attack_damage_bonus: 3,
                enchantment_value: 12,
                incorrect_blocks_for_drops: '#minecraft:incorrect_for_diamond_tool',
              },
              attack_speed: -2.6,
            },
          },
        }),
      ]);
      expect(problems).toEqual([]);
    });

    it('reports an armour material the target does not have', async () => {
      const problems = await validate([
        item('demo:a', { components: { 'msm:armor': { slot: 'helmet', material: 'mithril' } } }),
      ]);
      expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
        [
          'blocks-items.unknown-armor-material',
          'error',
          'demo:a',
          '/components/msm:armor/material',
        ],
      ]);
      expect(problems[0]?.message).toContain('"turtle_scute"');
    });

    it('skips the armour material check for a target without the fact', async () => {
      const { registries } = await indexesFor(bundle);
      const { items: _items, ...facts } = bundle.target;
      const input: ValidationInput = {
        elements: [
          item('demo:a', { components: { 'msm:armor': { slot: 'helmet', material: 'mithril' } } }),
        ],
        target: facts,
        registry: registries,
      };
      const results = await Promise.all(blocksItemsValidators.map((v) => v.validate(input)));
      expect(codes(results.flat())).toEqual([]);
    });

    it('warns about an equipment asset that is neither a project element nor vanilla', async () => {
      const problems = await validate([
        item('demo:a', {
          components: { 'msm:armor': { slot: 'leggings', material: customMaterial('demo:ruby') } },
        }),
        equipment('demo:sapphire'),
      ]);
      expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
        [
          'blocks-items.unknown-equipment-asset',
          'warning',
          'demo:a',
          '/components/msm:armor/material/equipment_asset',
        ],
      ]);
      expect(
        await validate(
          [
            item('demo:a', {
              components: {
                'msm:armor': { slot: 'leggings', material: customMaterial('demo:ruby') },
              },
            }),
          ],
          false,
        ),
      ).toEqual([]);
    });

    it('reports armour and a tool on one item', async () => {
      const problems = await validate([
        item('demo:a', {
          components: {
            'msm:armor': { slot: 'helmet', material: 'iron' },
            'msm:tool': { type: 'sword', tier: 'iron' },
          },
        }),
      ]);
      expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
        ['blocks-items.component-conflict', 'error', 'demo:a', '/components/msm:armor'],
      ]);
    });

    it('reports each pair of exclusive components, naming both', async () => {
      const problems = await validate([
        item('demo:a', {
          components: {
            'msm:tool': { type: 'sword', tier: 'iron' },
            'msm:ranged_weapon': { type: 'bow' },
            'msm:shield': {},
          },
        }),
        item('demo:b', {
          components: { 'msm:armor': { slot: 'helmet', material: 'iron' }, 'msm:shield': {} },
        }),
      ]);
      expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
        ['blocks-items.component-conflict', 'demo:a', '/components/msm:ranged_weapon'],
        ['blocks-items.component-conflict', 'demo:a', '/components/msm:shield'],
        ['blocks-items.component-conflict', 'demo:b', '/components/msm:shield'],
      ]);
      expect(problems[0]?.message).toContain('"msm:tool" and "msm:ranged_weapon"');
      expect(problems[2]?.message).toContain('"msm:armor" and "msm:shield"');
    });

    it('accepts the new components and the passthrough when nothing clashes', async () => {
      const problems = await validate([
        item('demo:tonic', {
          max_stack_size: 16,
          components: {
            'msm:food': { nutrition: 2, saturation: 0.1 },
            'msm:consumable': { seconds: 1.6, animation: 'drink' },
            'msm:components': { 'minecraft:glider': {}, enchantment_glint_override: true },
          },
        }),
        item('demo:totem', {
          components: {
            'msm:death_protection': { effects: [] },
            'msm:on_use': { event: 'demo:e' },
          },
          events: {
            'demo:e': {
              actions: [{ type: 'apply_effect', effect: 'minecraft:speed', seconds: 5 }],
            },
          },
        }),
        item('demo:spear', { components: { 'msm:tool': { type: 'spear', tier: 'iron' } } }),
      ]);
      expect(problems).toEqual([]);
    });

    it('reports a passthrough entry that an MSM component or field also sets', async () => {
      const problems = await validate([
        item('demo:a', {
          max_stack_size: 16,
          components: {
            'msm:food': { nutrition: 2, saturation: 0.1 },
            'msm:durability': { max: 10 },
            'msm:tool': { type: 'spear', tier: 'iron' },
            'msm:components': {
              food: {},
              'minecraft:max_damage': 5,
              'minecraft:max_stack_size': 2,
              'minecraft:kinetic_weapon': {},
              'minecraft:glider': {},
            },
          },
        }),
      ]);
      expect(problems.map((p) => [p.code, p.path])).toEqual([
        ['blocks-items.component-conflict', '/components/msm:components/food'],
        ['blocks-items.component-conflict', '/components/msm:components/minecraft:kinetic_weapon'],
        ['blocks-items.component-conflict', '/components/msm:components/minecraft:max_damage'],
        ['blocks-items.component-conflict', '/components/msm:components/minecraft:max_stack_size'],
      ]);
      expect(problems[0]?.message).toContain('"msm:food" and the "msm:components" entry "food"');
      expect(problems[2]?.message).toContain('"msm:tool"');
      expect(problems[3]?.message).toContain('the "max_stack_size" field');
    });

    it('warns when horse or wolf armour uses project equipment without the body layer', async () => {
      const horse = (id: `${string}:${string}`, asset: string, slot = 'horse') =>
        item(id, { components: { 'msm:armor': { slot, material: customMaterial(asset) } } });
      const problems = await validate([
        horse('demo:a', 'demo:ruby'),
        horse('demo:b', 'demo:ruby', 'wolf'),
        horse('demo:c', 'demo:ruby_body'),
        horse('demo:d', 'demo:ruby', 'helmet'),
        equipment('demo:ruby'),
        element('minecraft:equipment', 'demo:ruby_body', {
          layers: { horse_body: [{ texture: 'demo:ruby' }] },
        }),
      ]);
      expect(problems.map((p) => [p.code, p.severity, p.elementId])).toEqual([
        ['blocks-items.unknown-equipment-asset', 'warning', 'demo:a'],
        ['blocks-items.unknown-equipment-asset', 'warning', 'demo:b'],
      ]);
      expect(problems[0]?.message).toContain('no "horse_body" layer');
      expect(problems[1]?.message).toContain('no "wolf_body" layer');
    });

    it('does not check a custom tool material against the tier tags', async () => {
      const problems = await validate([
        item('demo:a', {
          components: {
            'msm:tool': {
              type: 'axe',
              tier: {
                durability: 10,
                speed: 2,
                attack_damage_bonus: 0,
                enchantment_value: 1,
                incorrect_blocks_for_drops: '#demo:incorrect_for_bronze_tool',
              },
            },
          },
        }),
      ]);
      expect(codes(problems)).toEqual([]);
    });
  });

  describe('effects and throwables (ADR 0055, ADR 0056)', () => {
    const conflicts = (problems: Problem[]) =>
      problems
        .filter((problem) => problem.code === 'blocks-items.component-conflict')
        .map((problem) => [problem.severity, problem.elementId, problem.path]);

    it.each(
      THROWABLE_CONFLICTS.map((id) => {
        const value: Record<string, unknown> = {
          'msm:armor': { slot: 'helmet', material: 'iron' },
          'msm:ranged_weapon': { type: 'bow' },
          'msm:shield': {},
          'msm:consumable': { seconds: 1 },
          'msm:food': { nutrition: 1, saturation: 0.1 },
        };
        return [id, value[id]] as const;
      }),
    )('reports msm:throwable with %s', async (id, value) => {
      const problems = await validate([
        item('demo:a', { components: { ...THROWABLE, [id]: value } }),
      ]);
      expect(conflicts(problems)).toEqual([['error', 'demo:a', '/components/msm:throwable']]);
      const found = problems.find((problem) => problem.code === 'blocks-items.component-conflict');
      expect(found?.message).toContain(`"msm:throwable" and "${id}"`);
    });

    it('reports msm:throwable on a mace', async () => {
      const problems = await validate([
        item('demo:a', {
          components: { ...THROWABLE, 'msm:tool': { type: 'mace', tier: 'iron' } },
        }),
      ]);
      expect(conflicts(problems)).toEqual([['error', 'demo:a', '/components/msm:throwable']]);
      expect(problems[0]?.message).toContain('A mace cannot be thrown');
    });

    it('reports each clash of one throwable item once per pair', async () => {
      const problems = await validate([
        item('demo:a', {
          components: {
            ...THROWABLE,
            'msm:shield': {},
            'msm:food': { nutrition: 1, saturation: 0.1 },
          },
        }),
      ]);
      expect(problems.map((problem) => problem.message)).toEqual([
        expect.stringContaining('"msm:throwable" and "msm:shield"'),
        expect.stringContaining('"msm:throwable" and "msm:food"'),
      ]);
    });

    it('accepts msm:throwable with another tool, durability and msm:on_use', async () => {
      const problems = await validate([
        item('demo:a', {
          components: {
            'msm:throwable': {
              after_throw: 'drop',
              on_hit_entity: { event: 'demo:hit' },
              on_hit_block: { event: 'demo:land' },
            },
            'msm:tool': { type: 'sword', tier: 'iron' },
            'msm:durability': { max: 100 },
            'msm:on_use': { event: 'demo:hit' },
          },
          events: {
            'demo:hit': { actions: [{ type: 'damage', amount: 2, target: 'other' }] },
            'demo:land': { actions: [{ type: 'heal', amount: 1 }] },
          },
        }),
      ]);
      expect(problems).toEqual([]);
    });

    it.each([
      ['on_hit_entity', '/components/msm:throwable/on_hit_entity/event'],
      ['on_hit_block', '/components/msm:throwable/on_hit_block/event'],
    ])('reports a throwable %s naming an undeclared event', async (field, path) => {
      const problems = await validate([
        item('demo:a', { components: { 'msm:throwable': { [field]: { event: 'demo:gone' } } } }),
      ]);
      expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
        ['blocks-items.unknown-event', 'error', 'demo:a', path],
      ]);
      expect(problems[0]?.message).toContain('"demo:gone"');
    });

    it.each([
      ['msm:on_start', { event: 'demo:gone' }],
      ['msm:on_tick', { event: 'demo:gone', interval_ticks: 10 }],
      ['msm:on_end', { event: 'demo:gone' }],
    ])('reports an effect %s naming an undeclared event', async (component, value) => {
      const problems = await validate([
        effect('demo:frost', { components: { [component]: value } }),
      ]);
      expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
        ['blocks-items.unknown-event', 'error', 'demo:frost', `/components/${component}/event`],
      ]);
    });

    it('reports an undeclared trigger_event and a loop inside an effect', async () => {
      const problems = await validate([
        effect('demo:frost', {
          components: { 'msm:on_tick': { event: 'demo:a' } },
          events: {
            'demo:a': { actions: [{ type: 'trigger_event', event: 'demo:b' }] },
            'demo:b': {
              actions: [
                { type: 'trigger_event', event: 'demo:a' },
                { type: 'trigger_event', event: 'demo:c' },
              ],
            },
          },
        }),
      ]);
      expect(problems.map((p) => [p.code, p.path])).toEqual([
        ['blocks-items.unknown-event', '/events/demo:b/actions/1/event'],
        ['blocks-items.event-cycle', '/events/demo:a'],
      ]);
    });

    it('accepts a clean effect and asks it for no model', async () => {
      const problems = await validate([
        effect('demo:frost', {
          display_name: 'Frost',
          attribute_modifiers: [
            { attribute: 'minecraft:movement_speed', amount: -0.1, operation: 'add_value' },
          ],
          components: {
            'msm:on_start': { event: 'demo:a' },
            'msm:on_tick': { event: 'demo:a', interval_ticks: 20, faster_per_level: true },
            'msm:on_end': { event: 'demo:b' },
          },
          events: {
            'demo:a': { actions: [{ type: 'damage', amount: 1 }] },
            'demo:b': { actions: [{ type: 'heal', amount: 1, target: 'other' }] },
          },
        }),
      ]);
      expect(problems).toEqual([]);
    });
  });
});

describe('trigger and addition validators (ADRs 0060, 0061)', () => {
  const NOISE = {
    'demo:e': { actions: [{ type: 'play_sound', sound: 'minecraft:block.stone.break' }] },
  };
  const biomeAddition = (id: `${string}:${string}`, data: Record<string, unknown>): Element =>
    element('msm:biome_addition', id, {
      format: 1,
      biomes: ['minecraft:plains'],
      ...data,
    } as never);
  const lootAddition = (id: `${string}:${string}`, pools: unknown[]): Element =>
    element('msm:loot_addition', id, {
      format: 1,
      tables: ['minecraft:entities/zombie'],
      pools,
    } as never);
  const summary = (problems: Problem[]) =>
    problems.map((p) => [p.code, p.severity, p.elementId, p.path]);

  it('reports unknown events of the eight block and item trigger components', async () => {
    const problems = await validate([
      block('demo:a', {
        components: {
          'msm:shape': { preset: 'carpet' },
          'msm:on_break': { event: 'demo:x' },
          'msm:on_place': { event: 'demo:e' },
          'msm:on_random_tick': { event: 'demo:x' },
          'msm:on_entity_inside': { event: 'demo:x' },
        },
        events: NOISE,
      }),
      item('demo:b', {
        components: {
          'msm:armor': { slot: 'boots', material: 'iron' },
          'msm:on_hit': { event: 'demo:x' },
          'msm:on_use_on_block': { event: 'demo:x' },
          'msm:while_held': { event: 'demo:e' },
          'msm:while_worn': { event: 'demo:x' },
        },
        events: NOISE,
      }),
    ]);
    expect(problems.map((p) => [p.code, p.elementId, p.path])).toEqual([
      ['blocks-items.unknown-event', 'demo:a', '/components/msm:on_break/event'],
      ['blocks-items.unknown-event', 'demo:a', '/components/msm:on_random_tick/event'],
      ['blocks-items.unknown-event', 'demo:a', '/components/msm:on_entity_inside/event'],
      ['blocks-items.unknown-event', 'demo:b', '/components/msm:on_hit/event'],
      ['blocks-items.unknown-event', 'demo:b', '/components/msm:on_use_on_block/event'],
      ['blocks-items.unknown-event', 'demo:b', '/components/msm:while_worn/event'],
    ]);
  });

  it('reports while_worn without msm:armor', async () => {
    const problems = await validate([
      item('demo:a', { components: { 'msm:while_worn': { event: 'demo:e' } }, events: NOISE }),
      item('demo:b', {
        components: {
          'msm:armor': { slot: 'helmet', material: 'iron' },
          'msm:while_worn': { event: 'demo:e' },
        },
        events: NOISE,
      }),
    ]);
    expect(summary(problems)).toEqual([
      ['blocks-items.while-worn-without-armor', 'error', 'demo:a', '/components/msm:while_worn'],
    ]);
  });

  it('warns about on_entity_inside on a full solid block only', async () => {
    const inside = (id: `${string}:${string}`, shape?: Record<string, unknown>) =>
      block(id, {
        components: {
          ...(shape === undefined ? {} : { 'msm:shape': shape }),
          'msm:on_entity_inside': { event: 'demo:e' },
        },
        events: NOISE,
      });
    const problems = await validate([
      inside('demo:none'),
      inside('demo:full', { preset: 'full', see_through: true }),
      inside('demo:full_boxes', { boxes: [[0, 0, 0, 16, 16, 16]] }),
      inside('demo:carpet', { preset: 'carpet' }),
      inside('demo:cross', { preset: 'cross' }),
      inside('demo:ghost', { preset: 'full', collision: false }),
    ]);
    expect(summary(problems)).toEqual(
      ['demo:none', 'demo:full', 'demo:full_boxes'].map((id) => [
        'blocks-items.entity-inside-solid-block',
        'warning',
        id,
        '/components/msm:on_entity_inside',
      ]),
    );
  });

  it('reports fast tick triggers that run functions or scripts, through trigger_event', async () => {
    const problems = await validate([
      item('demo:fast', {
        components: {
          'msm:while_held': { event: 'demo:a', interval_ticks: 5 },
          'msm:on_hit': { event: 'demo:a' },
        },
        events: {
          'demo:a': { actions: [{ type: 'trigger_event', event: 'demo:b' }] },
          'demo:b': { actions: [{ type: 'run_function', function: 'demo:tick' }] },
        },
      }),
      item('demo:slow', {
        components: { 'msm:while_held': { event: 'demo:s', interval_ticks: 20 } },
        events: { 'demo:s': { actions: [{ type: 'run_script', handler: 'demo:s' }] } },
      }),
      item('demo:cheap', {
        components: { 'msm:while_held': { event: 'demo:e', interval_ticks: 5 } },
        events: NOISE,
      }),
      block('demo:pad', {
        components: {
          'msm:shape': { preset: 'carpet' },
          'msm:on_entity_inside': { event: 'demo:s', cooldown_ticks: 10 },
        },
        events: { 'demo:s': { actions: [{ type: 'run_script', handler: 'demo:s' }] } },
      }),
      element('msm:entity', 'demo:mob', {
        format: 1,
        components: { 'msm:on_tick': { event: 'demo:s', interval_ticks: 5 } },
        events: { 'demo:s': { actions: [{ type: 'run_script', handler: 'demo:s' }] } },
      } as never),
    ]);
    expect(summary(problems)).toEqual([
      [
        'blocks-items.fast-tick-trigger',
        'info',
        'demo:fast',
        '/components/msm:while_held/interval_ticks',
      ],
      [
        'blocks-items.fast-tick-trigger',
        'info',
        'demo:pad',
        '/components/msm:on_entity_inside/cooldown_ticks',
      ],
      [
        'blocks-items.fast-tick-trigger',
        'info',
        'demo:mob',
        '/components/msm:on_tick/interval_ticks',
      ],
    ]);
  });

  it('reports fuel and compost that clash with passthrough entries, on items and block items', async () => {
    const problems = await validate([
      item('demo:coal', {
        fuel: { burn_seconds: 10 },
        components: { 'msm:components': { 'minecraft:cooking_fuel': { burn_time: 1 } } },
      }),
      block('demo:log', {
        item: {
          compost: '30%',
          components: { 'msm:components': { compostable: { layers: 1 }, glider: {} } },
        },
      }),
      block('demo:clean', {
        item: { fuel: { burn_seconds: 1 }, components: { 'msm:components': { glider: {} } } },
      }),
    ]);
    expect(summary(problems)).toEqual([
      [
        'blocks-items.component-conflict',
        'error',
        'demo:coal',
        '/components/msm:components/minecraft:cooking_fuel',
      ],
      [
        'blocks-items.component-conflict',
        'error',
        'demo:log',
        '/item/components/msm:components/compostable',
      ],
    ]);
  });

  it('reports a spawn group whose largest size is below its smallest', async () => {
    const spawn = (min: number, max: number) => ({
      entity: 'minecraft:fox',
      category: 'creature',
      weight: 1,
      min_group: min,
      max_group: max,
    });
    const problems = await validate([
      biomeAddition('demo:a', { spawns: [spawn(1, 1), spawn(4, 2)] }),
    ]);
    expect(summary(problems)).toEqual([
      ['blocks-items.spawn-group-size', 'error', 'demo:a', '/spawns/1/max_group'],
    ]);
  });

  it('warns about a placed feature a project biome lists and an addition adds again', async () => {
    const problems = await validate([
      element('minecraft:worldgen/biome', 'demo:glade', {
        features: [[], ['demo:ore_placed', '#minecraft:x']],
      } as never),
      biomeAddition('demo:a', {
        biomes: ['demo:glade', '#minecraft:is_overworld'],
        features: [
          { feature: 'demo:other_placed', step: 'underground_ores' },
          { feature: 'demo:ore_placed', step: 'underground_ores' },
        ],
      }),
      biomeAddition('demo:b', {
        biomes: ['minecraft:plains'],
        features: [{ feature: 'demo:ore_placed', step: 'underground_ores' }],
      }),
    ]);
    expect(summary(problems)).toEqual([
      ['blocks-items.duplicate-biome-feature', 'warning', 'demo:a', '/features/1/feature'],
    ]);
  });

  it('checks the outline of loot addition pools and their item ids', async () => {
    const problems = await validate([
      lootAddition('demo:a', [
        { rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }] },
        {
          rolls: { type: 'minecraft:uniform', min: 1, max: 2 },
          entries: [{ type: 'minecraft:empty' }],
        },
        'pool',
        { entries: [{ type: 'minecraft:empty' }] },
        { rolls: 'one', entries: [{ type: 'minecraft:empty' }] },
        { rolls: 1, entries: [] },
        { rolls: 1, entries: [{ name: 'minecraft:emerald' }] },
        {
          rolls: 1,
          entries: [
            { type: 'item', name: 'demo:nothing' },
            { type: 'minecraft:item', name: 'example:ruby' },
          ],
        },
      ]),
    ]);
    expect(summary(problems)).toEqual([
      ['blocks-items.bad-loot-pool', 'error', 'demo:a', '/pools/2'],
      ['blocks-items.bad-loot-pool', 'error', 'demo:a', '/pools/3'],
      ['blocks-items.bad-loot-pool', 'error', 'demo:a', '/pools/4/rolls'],
      ['blocks-items.bad-loot-pool', 'error', 'demo:a', '/pools/5/entries'],
      ['blocks-items.bad-loot-pool', 'error', 'demo:a', '/pools/6/entries/0'],
      ['blocks-items.unknown-loot-item', 'warning', 'demo:a', '/pools/7/entries/0/name'],
    ]);
  });
});
