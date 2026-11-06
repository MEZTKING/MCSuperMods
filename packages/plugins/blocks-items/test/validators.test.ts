import type { Element, Problem, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { BLOCKS_ITEMS_PROBLEM_CODES, blocksItemsValidators, RESERVED_MOD_IDS } from '../src/index';
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

describe('blocks-items validators', () => {
  it('lists every code it reports', () => {
    expect(BLOCKS_ITEMS_PROBLEM_CODES).toHaveLength(11);
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
});
