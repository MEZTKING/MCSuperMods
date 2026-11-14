import type { Element, Problem, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPE_PROBLEM_CODES,
  blocksItemsValidators,
  blockTypeValidators,
} from '../src/index';
import { element, indexesFor } from './support';

const firstBundle = builtInTargets[0] as TargetBundle;

async function validate(
  elements: Element[],
  options: { bundle?: TargetBundle; vanilla?: boolean } = {},
): Promise<Problem[]> {
  const bundle = options.bundle ?? firstBundle;
  const { registries } = await indexesFor(bundle);
  const registry: ValidationInput['registry'] =
    options.vanilla === false ? createRegistryIndex({ vanilla: {} }) : registries;
  const results = await Promise.all(
    blockTypeValidators.map((validator) =>
      validator.validate({ elements, target: bundle.target, registry }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): Problem[] =>
  problems.filter((problem) => problem.code === `blocks-items.${code}`);

type Id = `${string}:${string}`;
const block = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:block', id, { format: 1, ...data } as never);
const typed = (id: Id, type: string, data: Record<string, unknown> = {}): Element =>
  block(id, { type, textures: { all: 'minecraft:block/stone' }, ...data });
const item = (id: Id): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick' } as never);
const model = (id: Id): Element =>
  element('minecraft:model', id, { parent: 'minecraft:block/cube_all' } as never);
const feature = (id: Id, data: Record<string, unknown>): Element =>
  element('minecraft:worldgen/feature', id, data as never);
const blockTag = (id: Id, values: unknown[]): Element =>
  element('minecraft:tag/block', id, { values } as never);
const tree = (trunk: string, leaves: string): Record<string, unknown> => ({
  type: 'minecraft:tree',
  trunk_provider: { type: 'minecraft:simple', state: { Name: trunk } },
  foliage_provider: { type: 'minecraft:simple', state: leaves },
});

describe('block type validators', () => {
  it('lists the eighteen codes, none shared with the other validators', () => {
    expect(BLOCK_TYPE_PROBLEM_CODES).toHaveLength(18);
    expect(new Set(BLOCK_TYPE_PROBLEM_CODES).size).toBe(18);
  });

  it('reports nothing for plain blocks', async () => {
    expect(await validate([block('demo:plain', { model: 'minecraft:block/stone' })])).toEqual([]);
  });

  it('component-not-for-type: msm:shape and msm:redstone only on the shaped types', async () => {
    const problems = await validate([
      typed('demo:slab', 'slab', {
        components: { 'msm:shape': { boxes: [[0, 0, 0, 16, 8, 16]] }, 'msm:redstone': {} },
      }),
      typed('demo:pillar', 'pillar', {
        components: { 'msm:shape': { boxes: [[2, 0, 2, 14, 16, 14]] }, 'msm:redstone': {} },
      }),
      typed('demo:door', 'door', { set_type: 'wood', components: { 'msm:flammable': {} } }),
    ]);
    const found = withCode(problems, 'component-not-for-type');
    expect(found.map((problem) => [problem.elementId, problem.path, problem.severity])).toEqual([
      ['demo:slab', '/components/msm:shape', 'error'],
      ['demo:slab', '/components/msm:redstone', 'error'],
    ]);
  });

  it('type-needs-appearance: a type other than block needs textures or models', async () => {
    const problems = await validate([
      block('demo:bare', { type: 'stairs' }),
      block('demo:by_models', { type: 'stairs', models: { straight: 'minecraft:block/stone' } }),
      block('demo:by_model', { type: 'pillar', model: 'minecraft:block/oak_log' }),
      block('demo:plain', {}),
    ]);
    const found = withCode(problems, 'type-needs-appearance');
    expect(found.map((problem) => problem.elementId)).toEqual(['demo:bare']);
    expect(found[0]?.severity).toBe('error');
  });

  it('generated-model-clash: a project model with a generated model id', async () => {
    const problems = await validate([
      typed('demo:steps', 'stairs'),
      model('demo:block/steps_inner'),
      model('demo:block/other'),
      typed('demo:gate', 'door', { set_type: 'wood' }),
      model('demo:item/gate'),
      typed('demo:other_stairs', 'stairs', { models: { inner: 'demo:block/other' } }),
    ]);
    const found = withCode(problems, 'generated-model-clash');
    expect(found.map((problem) => [problem.elementId, problem.severity])).toEqual([
      ['demo:steps', 'error'],
      ['demo:gate', 'error'],
    ]);
    expect(found[0]?.message).toContain('"demo:block/steps_inner"');
    expect(found[1]?.message).toContain('"demo:item/gate"');
  });

  it('unknown-model-slot: slot names come from BLOCK_TYPE_MODEL_SLOTS', async () => {
    const [stairsSlot] = BLOCK_TYPE_MODEL_SLOTS.stairs;
    const problems = await validate([
      typed('demo:good', 'stairs', {
        models: { [stairsSlot as string]: 'minecraft:block/stone', item: 'minecraft:block/stone' },
      }),
      typed('demo:bad', 'stairs', { models: { sideways: 'minecraft:block/stone' } }),
    ]);
    const found = withCode(problems, 'unknown-model-slot');
    expect(found.map((problem) => [problem.elementId, problem.path])).toEqual([
      ['demo:bad', '/models/sideways'],
    ]);
    expect(found[0]?.severity).toBe('error');
    for (const slot of BLOCK_TYPE_MODEL_SLOTS.stairs) expect(found[0]?.message).toContain(slot);
  });

  it('missing-model-slot: models leaving a required slot empty without textures', async () => {
    const problems = await validate([
      block('demo:partial', { type: 'slab', models: { bottom: 'minecraft:block/stone_slab' } }),
      block('demo:full', {
        type: 'slab',
        models: {
          bottom: 'minecraft:block/stone_slab',
          top: 'minecraft:block/stone_slab_top',
          double: 'minecraft:block/stone',
        },
      }),
      typed('demo:mixed', 'slab', { models: { double: 'minecraft:block/stone' } }),
    ]);
    const found = withCode(problems, 'missing-model-slot');
    expect(found.map((problem) => problem.elementId)).toEqual(['demo:partial']);
    expect(found[0]?.severity).toBe('warning');
    expect(found[0]?.message).toContain('"top", "double"');
  });

  it('unknown-set-type and unknown-wood-type: against the target facts of both targets', async () => {
    for (const bundle of builtInTargets) {
      const facts = bundle.target.blocks;
      expect(facts).toBeDefined();
      const problems = await validate(
        [
          typed('demo:door', 'door', { set_type: 'wood' }),
          typed('demo:bad_door', 'door', { set_type: 'oak' }),
          typed('demo:bad_button', 'button', { set_type: 'diamond' }),
          typed('demo:gate', 'fence_gate', { wood_type: 'oak' }),
          typed('demo:bad_gate', 'fence_gate', { wood_type: 'wood' }),
        ],
        { bundle },
      );
      expect(withCode(problems, 'unknown-set-type').map((p) => p.elementId)).toEqual([
        'demo:bad_door',
        'demo:bad_button',
      ]);
      const wood = withCode(problems, 'unknown-wood-type');
      expect(wood.map((p) => [p.elementId, p.path])).toEqual([['demo:bad_gate', '/wood_type']]);
      expect(wood[0]?.message).toContain(bundle.target.id);
    }
  });

  it('stairs-base-unknown: neither a project block nor a vanilla block', async () => {
    const problems = await validate([
      typed('demo:vanilla_base', 'stairs', { base_block: 'minecraft:oak_planks' }),
      typed('demo:default_base', 'stairs'),
      block('demo:planks', { model: 'minecraft:block/oak_planks' }),
      typed('demo:project_base', 'stairs', { base_block: 'demo:planks' }),
      typed('demo:missing_base', 'stairs', { base_block: 'demo:nothing' }),
      typed('demo:typo_base', 'stairs', { base_block: 'minecraft:oak_plank' }),
    ]);
    const found = withCode(problems, 'stairs-base-unknown');
    expect(found.map((problem) => [problem.elementId, problem.path])).toEqual([
      ['demo:missing_base', '/base_block'],
      ['demo:typo_base', '/base_block'],
    ]);
    expect(withCode(problems, 'stairs-base-cycle')).toEqual([]);
  });

  it('stairs-base-cycle: stairs based on themselves through other stairs', async () => {
    const problems = await validate([
      typed('demo:a', 'stairs', { base_block: 'demo:b' }),
      typed('demo:b', 'stairs', { base_block: 'demo:a' }),
      typed('demo:self', 'stairs', { base_block: 'demo:self' }),
      typed('demo:chain', 'stairs', { base_block: 'demo:a' }),
      typed('demo:fine', 'stairs', { base_block: 'demo:fine_base' }),
      typed('demo:fine_base', 'stairs'),
    ]);
    const found = withCode(problems, 'stairs-base-cycle');
    expect(found.map((problem) => problem.elementId)).toEqual(['demo:a', 'demo:b', 'demo:self']);
    expect(found[0]?.message).toContain('"demo:a" -> "demo:b" -> "demo:a"');
  });

  it('strippable-target-unknown: into names a project or vanilla block', async () => {
    const strip = (into: string) => ({ components: { 'msm:strippable': { into } } });
    const problems = await validate([
      typed('demo:log', 'pillar', strip('demo:stripped_log')),
      typed('demo:stripped_log', 'pillar'),
      typed('demo:vanilla', 'pillar', strip('minecraft:stripped_oak_log')),
      typed('demo:broken', 'pillar', strip('demo:nowhere')),
    ]);
    const found = withCode(problems, 'strippable-target-unknown');
    expect(found.map((problem) => [problem.elementId, problem.path])).toEqual([
      ['demo:broken', '/components/msm:strippable/into'],
    ]);
  });

  it('skips the vanilla block check when the registry has no blocks', async () => {
    const problems = await validate(
      [typed('demo:stairs', 'stairs', { base_block: 'minecraft:oak_plank' })],
      { vanilla: false },
    );
    expect(withCode(problems, 'stairs-base-unknown')).toEqual([]);
  });

  it('crop-stage-heights-length: one height per stage', async () => {
    const crop = (id: Id, data: Record<string, unknown>) =>
      block(id, { type: 'crop', textures: { stages: ['minecraft:block/wheat_stage0'] }, ...data });
    const problems = await validate([
      crop('demo:default_ok', { stage_heights: [2, 4, 6, 8, 10, 12, 14, 16] }),
      crop('demo:short_ok', { max_age: 2, stage_heights: [4, 8, 16] }),
      crop('demo:default_bad', { stage_heights: [2, 4, 6] }),
      crop('demo:short_bad', { max_age: 3, stage_heights: [4, 8, 16] }),
    ]);
    const found = withCode(problems, 'crop-stage-heights-length');
    expect(found.map((problem) => [problem.elementId, problem.severity])).toEqual([
      ['demo:default_bad', 'warning'],
      ['demo:short_bad', 'warning'],
    ]);
    expect(found[1]?.message).toContain('4 stages');
  });

  it('crop-bonemeal-range: min above max is an error', async () => {
    const problems = await validate([
      typed('demo:ok', 'crop', { bonemeal_growth: { min: 1, max: 1 } }),
      typed('demo:bad', 'crop', { bonemeal_growth: { min: 5, max: 2 } }),
    ]);
    const found = withCode(problems, 'crop-bonemeal-range');
    expect(found.map((problem) => [problem.elementId, problem.path, problem.severity])).toEqual([
      ['demo:bad', '/bonemeal_growth/min', 'error'],
    ]);
  });

  it('crop-without-produce: the crop loot preset needs produce', async () => {
    const problems = await validate([
      typed('demo:ok', 'crop', { loot: 'crop', crop_drops: { produce: 'minecraft:wheat' } }),
      typed('demo:self', 'crop', { loot: 'self' }),
      typed('demo:bare', 'crop', { loot: 'crop' }),
      typed('demo:empty', 'crop', { loot: 'crop', crop_drops: { seed_bonus: false } }),
    ]);
    const found = withCode(problems, 'crop-without-produce');
    expect(found.map((problem) => [problem.elementId, problem.severity])).toEqual([
      ['demo:bare', 'error'],
      ['demo:empty', 'error'],
    ]);
  });

  it('sapling-tree-unknown: a project feature or a vanilla configured feature', async () => {
    const problems = await validate([
      typed('demo:oak_like', 'sapling', {
        tree: 'minecraft:oak',
        mega_tree: 'minecraft:mega_spruce',
      }),
      typed('demo:own', 'sapling', { tree: 'demo:tree' }),
      feature('demo:tree', tree('minecraft:oak_log', 'minecraft:oak_leaves')),
      typed('demo:missing', 'sapling', { tree: 'demo:no_tree', flower_tree: 'minecraft:oaak' }),
    ]);
    const found = withCode(problems, 'sapling-tree-unknown');
    expect(found.map((problem) => [problem.elementId, problem.path, problem.severity])).toEqual([
      ['demo:missing', '/tree', 'error'],
      ['demo:missing', '/flower_tree', 'error'],
    ]);
  });

  it('sapling-tree-not-tree: a project feature of another type warns', async () => {
    const problems = await validate([
      typed('demo:odd', 'sapling', { tree: 'demo:rock' }),
      feature('demo:rock', { type: 'minecraft:forest_rock', state: 'minecraft:stone' }),
      typed('demo:fine', 'sapling', { tree: 'demo:tree' }),
      feature('demo:tree', tree('minecraft:oak_log', 'minecraft:oak_leaves')),
    ]);
    const found = withCode(problems, 'sapling-tree-not-tree');
    expect(found.map((problem) => [problem.elementId, problem.path, problem.severity])).toEqual([
      ['demo:odd', '/tree', 'warning'],
    ]);
  });

  it('leaves-will-decay: project leaves on a project trunk outside #minecraft:logs', async () => {
    const parts = [
      typed('demo:leaves', 'leaves'),
      typed('demo:log', 'pillar'),
      typed('demo:tagged_log', 'pillar'),
      typed('demo:nested_log', 'pillar'),
      blockTag('minecraft:logs' as Id, [
        '#demo:my_logs',
        { id: 'demo:tagged_log', required: false },
      ]),
      blockTag('demo:my_logs', ['demo:nested_log']),
      feature('demo:decays', tree('demo:log', 'demo:leaves')),
      feature('demo:tagged', tree('demo:tagged_log', 'demo:leaves')),
      feature('demo:nested', tree('demo:nested_log', 'demo:leaves')),
      feature('demo:vanilla_trunk', tree('minecraft:oak_log', 'demo:leaves')),
      feature('demo:vanilla_leaves', tree('demo:log', 'minecraft:oak_leaves')),
      typed('demo:a', 'sapling', { tree: 'demo:decays' }),
      typed('demo:b', 'sapling', { tree: 'demo:tagged' }),
      typed('demo:c', 'sapling', { tree: 'demo:nested' }),
      typed('demo:d', 'sapling', { tree: 'demo:vanilla_trunk' }),
      typed('demo:e', 'sapling', { tree: 'demo:vanilla_leaves' }),
    ];
    const found = withCode(await validate(parts), 'leaves-will-decay');
    expect(found.map((problem) => [problem.elementId, problem.severity])).toEqual([
      ['demo:a', 'warning'],
    ]);
    expect(found[0]?.message).toContain('"demo:log"');
  });

  it('block-item-id-clash: an own item id taken by an item or another block item', async () => {
    const problems = await validate([
      typed('demo:tomatoes', 'crop', { item: { id: 'demo:tomato_seeds' } }),
      typed('demo:carrots', 'crop', { item: { id: 'demo:carrot' } }),
      item('demo:carrot'),
      typed('demo:beans', 'crop', { item: { id: 'demo:bean' } }),
      typed('demo:more_beans', 'crop', { item: { id: 'demo:bean' } }),
      typed('demo:onions', 'crop', { item: { id: 'demo:onion_block' } }),
      block('demo:onion_block', { model: 'minecraft:block/stone' }),
      typed('demo:no_item', 'crop', { item: false }),
      block('demo:shared', { model: 'minecraft:block/stone', item: { id: 'demo:no_item' } }),
    ]);
    const found = withCode(problems, 'block-item-id-clash');
    expect(found.map((problem) => [problem.elementId, problem.path])).toEqual([
      ['demo:carrots', '/item/id'],
      ['demo:beans', '/item/id'],
      ['demo:more_beans', '/item/id'],
      ['demo:onions', '/item/id'],
    ]);
    expect(found[0]?.message).toContain('item "demo:carrot"');
  });

  it('particle-on-tinted-leaves: falling_particle only without a tint', async () => {
    const problems = await validate([
      typed('demo:cherry_like', 'leaves', { falling_particle: 'minecraft:cherry_leaves' }),
      typed('demo:tinted', 'leaves', { tint: 'foliage' }),
      typed('demo:both', 'leaves', { tint: 0x48b518, falling_particle: 'minecraft:cherry_leaves' }),
    ]);
    const found = withCode(problems, 'particle-on-tinted-leaves');
    expect(found.map((problem) => [problem.elementId, problem.severity])).toEqual([
      ['demo:both', 'warning'],
    ]);
  });

  it('model-not-cube skips the family and plant types (ADR 0067 D8)', async () => {
    const elements = [
      element('minecraft:model', 'demo:block/half', {
        parent: 'minecraft:block/slab',
      } as never),
      block('demo:plain', { model: 'demo:block/half' }),
      block('demo:facing', { type: 'horizontal', model: 'demo:block/half' }),
      block('demo:slab', { type: 'slab', model: 'demo:block/half', textures: { all: 'x:y' } }),
      block('demo:crop', { type: 'crop', model: 'demo:block/half', textures: { stages: ['x:y'] } }),
    ];
    const { registries } = await indexesFor(firstBundle);
    const validator = blocksItemsValidators.find(
      (entry) => entry.id === 'msm.blocks-items.model-not-cube',
    );
    const problems = await validator?.validate({
      elements,
      target: firstBundle.target,
      registry: registries,
    });
    expect(problems?.map((problem) => problem.elementId)).toEqual(['demo:plain', 'demo:facing']);
  });
});

describe('missing-model with types', () => {
  it('skips typed blocks (type-needs-appearance covers them, ADR 0067 D7)', async () => {
    const { registries } = await indexesFor(firstBundle);
    const validator = blocksItemsValidators.find(
      (entry) => entry.id === 'msm.blocks-items.missing-model',
    );
    const problems = await validator?.validate({
      elements: [
        block('demo:plain', {}),
        block('demo:explicit', { type: 'block' }),
        typed('demo:slab', 'slab'),
      ],
      target: firstBundle.target,
      registry: registries,
    });
    expect(problems?.map((problem) => problem.elementId)).toEqual(['demo:plain', 'demo:explicit']);
  });
});
