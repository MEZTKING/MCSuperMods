/**
 * The waterlogging, weathering and waxing validators (ADR 0094 D7 to D9, D11) and the item
 * inventory and bundle validators (ADR 0095 D1, D4): one test per code, and zero problems from
 * every plugin validator for valid cases on both targets.
 */
import type { Element, Problem, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  INVENTORY_CONFLICT_COMPONENTS,
  INVENTORY_PROBLEM_CODES,
  inventoryValidators,
  PARTICLE_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
  WEATHERING_PROBLEM_CODES,
  weatheringValidators,
} from '../src/index';
import { element, indexesFor } from './support';

const firstBundle = builtInTargets[0] as TargetBundle;

async function validate(
  elements: Element[],
  options: { bundle?: TargetBundle; all?: boolean; vanilla?: boolean } = {},
): Promise<Problem[]> {
  const bundle = options.bundle ?? firstBundle;
  const { registries } = await indexesFor(bundle);
  const registry: ValidationInput['registry'] =
    options.vanilla === false ? createRegistryIndex({ vanilla: {} }) : registries;
  const validators =
    options.all === true
      ? (plugin.contributes?.validators ?? [])
      : [...weatheringValidators, ...inventoryValidators];
  const results = await Promise.all(
    validators.map((validator) =>
      validator.validate({ elements, target: bundle.target, registry }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): [string, string | undefined, string][] =>
  problems
    .filter((problem) => problem.code === `blocks-items.${code}`)
    .map((problem) => [problem.elementId as string, problem.path, problem.severity]);

type Id = `${string}:${string}`;
const block = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/copper_block', ...data } as never);
const weathering = (
  id: Id,
  stage: string,
  next?: string,
  into?: string,
  data: Record<string, unknown> = {},
): Element =>
  block(id, {
    ...data,
    components: {
      'msm:weathering': next === undefined ? { stage } : { stage, next },
      ...(into === undefined ? {} : { 'msm:waxable': { into } }),
    },
  });
const item = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/bundle', ...data } as never);
const bag = (id: Id, fields: Record<string, unknown> = {}, data: Record<string, unknown> = {}) =>
  item(id, {
    max_stack_size: 1,
    ...data,
    components: {
      'msm:item_inventory': fields,
      ...((data.components as Record<string, unknown> | undefined) ?? {}),
    },
  });

const TIN_SET: Element[] = [
  weathering('demo:tin', 'unaffected', 'demo:exposed_tin', 'demo:waxed_tin'),
  weathering('demo:exposed_tin', 'exposed', 'demo:weathered_tin', 'demo:waxed_exposed_tin'),
  weathering('demo:weathered_tin', 'weathered', 'demo:oxidized_tin', 'demo:waxed_weathered_tin'),
  weathering('demo:oxidized_tin', 'oxidized', undefined, 'demo:waxed_oxidized_tin'),
  block('demo:waxed_tin'),
  block('demo:waxed_exposed_tin'),
  block('demo:waxed_weathered_tin'),
  block('demo:waxed_oxidized_tin'),
];

const VALID: Element[] = [
  ...TIN_SET,
  block('demo:wet_lamp', { components: { 'msm:waterloggable': {} } }),
  block('demo:wet_log', { type: 'pillar', components: { 'msm:waterloggable': {} } }),
  weathering('demo:tin_chain', 'oxidized', undefined, 'minecraft:waxed_copper_chain', {
    type: 'chain',
    model: undefined,
    textures: { all: 'minecraft:block/copper_block' },
  }),
  weathering('demo:into_vanilla', 'weathered', 'minecraft:oxidized_copper', undefined),
  bag(
    'demo:satchel',
    { rows: 6, on_open: 'demo:go', on_close: 'demo:go' },
    {
      events: { 'demo:go': { actions: [] } },
    },
  ),
  bag('demo:hopper_bag', { layout: 'hopper' }),
  item('demo:pouch', { components: { 'msm:bundle': {}, 'msm:durability': { max_damage: 10 } } }),
  item('demo:sack', { max_stack_size: 1, components: { 'msm:bundle': {} } }),
];

describe('waterlogging, weathering and inventory validators', () => {
  it('lists their own codes, none shared with the other validators', () => {
    expect(WEATHERING_PROBLEM_CODES).toHaveLength(6);
    expect(INVENTORY_PROBLEM_CODES).toEqual(['blocks-items.max-stack-size']);
    const all = [
      ...WEATHERING_PROBLEM_CODES,
      ...INVENTORY_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...PARTICLE_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    // The shared codes they report belong to the other lists.
    for (const code of ['component-not-for-type', 'component-conflict', 'container-layout-fields'])
      expect(all).toContain(`blocks-items.${code}`);
    expect(all).toContain('blocks-items.container-event-unknown');
  });

  it('uses the Item Studio’s conflict list', () => {
    expect(INVENTORY_CONFLICT_COMPONENTS).toEqual([
      'msm:tool',
      'msm:ranged_weapon',
      'msm:armor',
      'msm:shield',
      'msm:throwable',
      'msm:food',
      'msm:consumable',
    ]);
  });

  it.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'reports nothing for valid cases from any plugin validator on %s',
    async (_id, bundle) => {
      expect(await validate(VALID, { bundle, all: true })).toEqual([]);
    },
  );
});

describe('waterlogging (ADR 0094 D7)', () => {
  it('component-not-for-type: only on block, pillar, horizontal and directional', async () => {
    const problems = await validate([
      block('demo:wet_slab', {
        type: 'slab',
        model: undefined,
        textures: { all: 'minecraft:block/stone' },
        components: { 'msm:waterloggable': {} },
      }),
      block('demo:wet_dir', { type: 'directional', components: { 'msm:waterloggable': {} } }),
    ]);
    expect(withCode(problems, 'component-not-for-type')).toEqual([
      ['demo:wet_slab', '/components/msm:waterloggable', 'error'],
    ]);
  });

  it('allows a container or a machine to hold water (ADR 0104 D3, limit Q8 lifted)', async () => {
    const problems = await validate([
      block('demo:wet_crate', { components: { 'msm:waterloggable': {}, 'msm:container': {} } }),
      block('demo:wet_mill', { components: { 'msm:waterloggable': {}, 'msm:machine': {} } }),
    ]);
    expect(withCode(problems, 'component-conflict')).toEqual([]);
    expect(withCode(problems, 'component-not-for-type')).toEqual([]);
  });
});

describe('weathering and waxing (ADR 0094 D8, D9, D11)', () => {
  it('component-not-for-type: only on the types that age', async () => {
    const problems = await validate([
      weathering('demo:tin_carpet', 'unaffected', undefined, 'demo:waxed_carpet', {
        type: 'carpet',
        model: undefined,
        textures: { all: 'minecraft:block/copper_block' },
      }),
      block('demo:waxed_carpet'),
    ]);
    expect(withCode(problems, 'component-not-for-type')).toEqual([
      ['demo:tin_carpet', '/components/msm:weathering', 'error'],
      ['demo:tin_carpet', '/components/msm:waxable', 'error'],
    ]);
  });

  it('component-not-for-type: rods, buttons, plates, fences, gates and walls age (ADR 0104 D1)', async () => {
    const types = ['rod', 'button', 'pressure_plate', 'fence', 'fence_gate', 'wall'];
    const problems = await validate(
      types.flatMap((type) => [
        weathering(
          `demo:tin_${type}`,
          'unaffected',
          `demo:exposed_tin_${type}`,
          `demo:waxed_tin_${type}`,
          {
            type,
            model: undefined,
            textures: { all: 'minecraft:block/copper_block' },
          },
        ),
        weathering(`demo:exposed_tin_${type}`, 'exposed', undefined, undefined, {
          type,
          model: undefined,
          textures: { all: 'minecraft:block/exposed_copper' },
        }),
        block(`demo:waxed_tin_${type}`, {
          type,
          model: undefined,
          textures: { all: 'minecraft:block/copper_block' },
        }),
      ]),
    );
    expect(problems).toEqual([]);
  });

  it('weathering-next-unknown: next is neither a project nor a vanilla block', async () => {
    const problems = await validate([
      weathering('demo:a', 'unaffected', 'demo:missing'),
      weathering('demo:b', 'unaffected', 'minecraft:exposed_copper'),
      weathering('demo:c', 'unaffected', 'exposed_copper'),
      weathering('demo:d', 'unaffected', 'not_a_block'),
    ]);
    expect(withCode(problems, 'weathering-next-unknown')).toEqual([
      ['demo:a', '/components/msm:weathering/next', 'error'],
      ['demo:d', '/components/msm:weathering/next', 'error'],
    ]);
    // Without vanilla ids, only project ids are checked.
    const blind = await validate([weathering('demo:d', 'unaffected', 'not_a_block')], {
      vanilla: false,
    });
    expect(withCode(blind, 'weathering-next-unknown')).toEqual([]);
  });

  it('weathering-cycle: every block of a loop, self-loops included', async () => {
    const problems = await validate([
      weathering('demo:a', 'unaffected', 'demo:b'),
      weathering('demo:b', 'exposed', 'demo:a'),
      weathering('demo:c', 'unaffected', 'demo:a'),
      weathering('demo:self', 'unaffected', 'demo:self'),
    ]);
    expect(withCode(problems, 'weathering-cycle')).toEqual([
      ['demo:a', '/components/msm:weathering/next', 'error'],
      ['demo:b', '/components/msm:weathering/next', 'error'],
      ['demo:self', '/components/msm:weathering/next', 'error'],
    ]);
  });

  it('weathering-stage-order: next one stage later, nothing after oxidized', async () => {
    const problems = await validate([
      weathering('demo:a', 'unaffected', 'demo:b'),
      weathering('demo:b', 'weathered', 'demo:c'),
      weathering('demo:c', 'oxidized', 'minecraft:copper_block'),
      weathering('demo:d', 'exposed', 'demo:e'),
      block('demo:e'),
    ]);
    expect(withCode(problems, 'weathering-stage-order')).toEqual([
      ['demo:a', '/components/msm:weathering/next', 'warning'],
      ['demo:c', '/components/msm:weathering/next', 'warning'],
    ]);
  });

  it('waxable-not-weathering: only a weathering block is waxable', async () => {
    const problems = await validate([
      block('demo:a', { components: { 'msm:waxable': { into: 'demo:b' } } }),
      block('demo:b'),
    ]);
    expect(withCode(problems, 'waxable-not-weathering')).toEqual([
      ['demo:a', '/components/msm:waxable', 'error'],
    ]);
  });

  it('waxable-target-unknown: into is neither a project nor a vanilla block', async () => {
    const problems = await validate([
      weathering('demo:a', 'unaffected', undefined, 'demo:missing'),
      weathering('demo:b', 'unaffected', undefined, 'minecraft:waxed_copper_block'),
    ]);
    expect(withCode(problems, 'waxable-target-unknown')).toEqual([
      ['demo:a', '/components/msm:waxable/into', 'error'],
    ]);
  });

  it('waxed-block-invalid: a waxed block that ages, or one shared by two blocks', async () => {
    const problems = await validate([
      weathering('demo:a', 'unaffected', undefined, 'demo:b'),
      weathering('demo:b', 'unaffected'),
      weathering('demo:c', 'exposed', undefined, 'demo:waxed'),
      weathering('demo:d', 'weathered', undefined, 'demo:waxed'),
      block('demo:waxed'),
    ]);
    expect(withCode(problems, 'waxed-block-invalid')).toEqual([
      ['demo:a', '/components/msm:waxable/into', 'error'],
      ['demo:c', '/components/msm:waxable/into', 'error'],
      ['demo:d', '/components/msm:waxable/into', 'error'],
    ]);
  });
});

describe('bags and bundles (ADR 0095 D1, D4)', () => {
  it('max-stack-size: a bag or bundle that stacks above 1', async () => {
    const problems = await validate([
      bag('demo:a', {}, { max_stack_size: 16 }),
      item('demo:b', { max_stack_size: 64, components: { 'msm:bundle': {} } }),
      item('demo:c', { max_stack_size: 64 }),
      bag('demo:d', {}, { max_stack_size: undefined }),
    ]);
    expect(withCode(problems, 'max-stack-size')).toEqual([
      ['demo:a', '/max_stack_size', 'error'],
      ['demo:b', '/max_stack_size', 'error'],
    ]);
  });

  it('component-conflict: bag and bundle, the Studio’s list, and the passthrough', async () => {
    const problems = await validate([
      bag('demo:both', {}, { components: { 'msm:bundle': {} } }),
      bag('demo:sword', {}, { components: { 'msm:tool': { type: 'sword', tier: 'iron' } } }),
      item('demo:snack', {
        max_stack_size: 1,
        components: { 'msm:bundle': {}, 'msm:food': { nutrition: 2, saturation: 0.1 } },
      }),
      bag(
        'demo:raw',
        {},
        {
          max_stack_size: undefined,
          components: {
            'msm:components': { 'minecraft:container': [], max_stack_size: 1, rarity: 'rare' },
          },
        },
      ),
      item('demo:raw_bundle', {
        max_stack_size: 1,
        components: { 'msm:bundle': {}, 'msm:components': { bundle_contents: [] } },
      }),
    ]);
    expect(withCode(problems, 'component-conflict')).toEqual([
      ['demo:both', '/components/msm:bundle', 'error'],
      ['demo:sword', '/components/msm:tool', 'error'],
      ['demo:snack', '/components/msm:food', 'error'],
      ['demo:raw', '/components/msm:components/max_stack_size', 'error'],
      ['demo:raw', '/components/msm:components/minecraft:container', 'error'],
      ['demo:raw_bundle', '/components/msm:components/bundle_contents', 'error'],
    ]);
  });

  it('container-layout-fields: rows only with the chest layout', async () => {
    const problems = await validate([
      bag('demo:a', { layout: 'dispenser', rows: 2 }),
      bag('demo:b', { layout: 'chest', rows: 2 }),
      bag('demo:c', { rows: 1 }),
    ]);
    expect(withCode(problems, 'container-layout-fields')).toEqual([
      ['demo:a', '/components/msm:item_inventory/rows', 'warning'],
    ]);
  });

  it('container-event-unknown: on_open and on_close name declared events', async () => {
    const problems = await validate([
      bag(
        'demo:a',
        { on_open: 'demo:missing', on_close: 'demo:go' },
        {
          events: { 'demo:go': { actions: [] } },
        },
      ),
    ]);
    expect(withCode(problems, 'container-event-unknown')).toEqual([
      ['demo:a', '/components/msm:item_inventory/on_open', 'error'],
    ]);
  });
});
