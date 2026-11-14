import type { Element, Problem, TargetFacts, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  blockTypeValidators,
  CONTAINER_PROBLEM_CODES,
  containerValidators,
} from '../src/index';
import { element, indexesFor } from './support';

const firstBundle = builtInTargets[0] as TargetBundle;

async function validate(
  elements: Element[],
  options: { target?: TargetFacts; vanilla?: boolean } = {},
): Promise<Problem[]> {
  const { registries } = await indexesFor(firstBundle);
  const registry: ValidationInput['registry'] =
    options.vanilla === false ? createRegistryIndex({ vanilla: {} }) : registries;
  const target = options.target ?? firstBundle.target;
  const results = await Promise.all(
    [...containerValidators, ...blockTypeValidators].map((validator) =>
      validator.validate({ elements, target, registry }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): [string, string | undefined, string][] =>
  problems
    .filter((problem) => problem.code === `blocks-items.${code}`)
    .map((problem) => [problem.elementId as string, problem.path, problem.severity]);

type Id = `${string}:${string}`;
const block = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/barrel', ...data } as never);
const container = (id: Id, fields: Record<string, unknown> = {}, data = {}): Element =>
  block(id, { components: { 'msm:container': fields }, ...data });
const machine = (id: Id, fields: Record<string, unknown> = {}, data = {}): Element =>
  block(id, { components: { 'msm:machine': fields }, ...data });
const recipe = { ingredient: 'minecraft:gravel', result: 'minecraft:flint' };

describe('container and machine validators', () => {
  it('lists eleven codes, none shared with the other validators', () => {
    expect(CONTAINER_PROBLEM_CODES).toHaveLength(11);
    const all = [
      ...CONTAINER_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('reports nothing for a plain container and a machine with recipes', async () => {
    expect(
      await validate([
        container('demo:crate', { rows: 3, keep_contents: true }),
        machine('demo:mill', {}, { recipes: [recipe] }),
      ]),
    ).toEqual([]);
  });

  it('component-not-for-type: containers and machines only on the shaped types', async () => {
    const slab = { type: 'slab', model: undefined, textures: { all: 'minecraft:block/stone' } };
    const problems = await validate([
      container('demo:slab', {}, slab),
      machine('demo:fence', {}, { ...slab, type: 'fence' }),
      container('demo:pillar', {}, { type: 'pillar' }),
      machine('demo:horizontal', {}, { type: 'horizontal', recipes: [recipe] }),
    ]);
    expect(withCode(problems, 'component-not-for-type')).toEqual([
      ['demo:slab', '/components/msm:container', 'error'],
      ['demo:fence', '/components/msm:machine', 'error'],
    ]);
  });

  it('container-layout-fields: rows only on chest, size only on none', async () => {
    const problems = await validate([
      container('demo:a', { layout: 'hopper', rows: 2 }),
      container('demo:b', { layout: 'chest', size: 3 }),
      container('demo:c', { rows: 6 }),
      container('demo:d', { layout: 'none', size: 9 }),
    ]);
    expect(withCode(problems, 'container-layout-fields')).toEqual([
      ['demo:a', '/components/msm:container/rows', 'error'],
      ['demo:b', '/components/msm:container/size', 'error'],
    ]);
  });

  it('keep-contents-layout: keep_contents needs a 3-row chest', async () => {
    const problems = await validate([
      container('demo:a', { keep_contents: true, rows: 6 }),
      container('demo:b', { keep_contents: true, layout: 'hopper' }),
      container('demo:c', { keep_contents: true }),
      container('demo:d', { keep_contents: true, layout: 'chest', rows: 3 }),
      container('demo:e', { keep_contents: false, rows: 1 }),
    ]);
    expect(withCode(problems, 'keep-contents-layout')).toEqual([
      ['demo:a', '/components/msm:container/keep_contents', 'error'],
      ['demo:b', '/components/msm:container/keep_contents', 'error'],
    ]);
  });

  it('container-sound-unknown: vanilla sound events and project sound keys pass', async () => {
    const sounds = element('minecraft:sounds', 'demo:sounds', {
      'block.crate.open': { sounds: ['demo:crate_open'] },
    } as never);
    const problems = await validate([
      sounds,
      container('demo:a', { open_sound: 'minecraft:block.chest.open', close_sound: 'demo:nope' }),
      container('demo:b', {
        open_sound: 'demo:block.crate.open',
        close_sound: 'block.barrel.close',
      }),
    ]);
    expect(withCode(problems, 'container-sound-unknown')).toEqual([
      ['demo:a', '/components/msm:container/close_sound', 'warning'],
    ]);
  });

  it('container-sound-unknown: skipped when the registry knows no sound events', async () => {
    const problems = await validate([container('demo:a', { open_sound: 'demo:nope' })], {
      vanilla: false,
    });
    expect(withCode(problems, 'container-sound-unknown')).toEqual([]);
  });

  it('container-event-unknown: on_open and on_close must be declared events', async () => {
    const events = { events: { 'demo:opened': { actions: [] } } };
    const problems = await validate([
      container('demo:a', { on_open: 'demo:opened', on_close: 'demo:closed' }, events),
      container('demo:b', { on_open: 'demo:opened' }, events),
    ]);
    expect(withCode(problems, 'container-event-unknown')).toEqual([
      ['demo:a', '/components/msm:container/on_close', 'error'],
    ]);
  });

  it('machine-and-container: never both on one block', async () => {
    const problems = await validate([
      block('demo:a', {
        components: { 'msm:container': {}, 'msm:machine': {} },
        recipes: [recipe],
      }),
      machine('demo:b', {}, { recipes: [recipe] }),
    ]);
    expect(withCode(problems, 'machine-and-container')).toEqual([
      ['demo:a', '/components/msm:container', 'error'],
    ]);
  });

  it('machine-recipe-type-unknown: own id, project machines and target facts only', async () => {
    const problems = await validate([
      machine(
        'demo:a',
        {
          recipe_types: ['demo:a', 'demo:b', 'minecraft:smelting', 'minecraft:crafting_shaped'],
        },
        { recipes: [recipe] },
      ),
      machine('demo:b', { recipe_types: ['campfire_cooking', 'demo:unknown'] }),
    ]);
    expect(withCode(problems, 'machine-recipe-type-unknown')).toEqual([
      ['demo:a', '/components/msm:machine/recipe_types/3', 'error'],
      ['demo:b', '/components/msm:machine/recipe_types/1', 'error'],
    ]);
  });

  it('machine-recipe-type-unknown: skipped for other types when the target has no facts', async () => {
    const { blocks, ...rest } = firstBundle.target;
    if (blocks === undefined) throw new Error('the first target has block facts');
    const { machineRecipeTypes: _unused, ...withoutTypes } = blocks;
    const target: TargetFacts = { ...rest, blocks: withoutTypes };
    const problems = await validate(
      [machine('demo:a', { recipe_types: ['minecraft:crafting_shaped'] })],
      { target },
    );
    expect(withCode(problems, 'machine-recipe-type-unknown')).toEqual([]);
  });

  it('machine-recipe-item-unknown: ingredients and results must be vanilla or project items', async () => {
    const problems = await validate([
      element('msm:item', 'demo:dust', { format: 1, model: 'minecraft:item/stick' } as never),
      machine(
        'demo:a',
        {},
        {
          recipes: [
            { ingredient: ['minecraft:gravel', 'demo:missing'], result: 'demo:dust' },
            { ingredient: '#minecraft:logs', result: { id: 'demo:nothing', count: 2 } },
            { ingredient: 'demo:a', result: 'gravel' },
          ],
        },
      ),
    ]);
    expect(withCode(problems, 'machine-recipe-item-unknown')).toEqual([
      ['demo:a', '/recipes/0/ingredient/1', 'error'],
      ['demo:a', '/recipes/1/result/id', 'error'],
    ]);
  });

  it('machine-without-recipes: own type with no recipe in the project', async () => {
    const problems = await validate([
      machine('demo:a'),
      machine('demo:b', { recipe_types: ['minecraft:smelting'] }),
      machine('demo:c', {}, { recipes: [recipe] }),
      machine('demo:d', { recipe_types: ['demo:d'] }),
      element('minecraft:recipe', 'demo:d_recipe', { type: 'demo:d' } as never),
    ]);
    expect(withCode(problems, 'machine-without-recipes')).toEqual([
      ['demo:a', '/components/msm:machine', 'warning'],
    ]);
  });

  it('machine-fuel-unused: redstone or always with hoppers set', async () => {
    const problems = await validate([
      machine('demo:a', { power: 'redstone', hoppers: true }, { recipes: [recipe] }),
      machine('demo:b', { power: 'always' }, { recipes: [recipe] }),
      machine('demo:c', { power: 'fuel', hoppers: true }, { recipes: [recipe] }),
    ]);
    expect(withCode(problems, 'machine-fuel-unused')).toEqual([
      ['demo:a', '/components/msm:machine/hoppers', 'info'],
    ]);
  });

  it('machine-time-range: a time above 32767 ticks at the machine speed', async () => {
    const problems = await validate([
      machine(
        'demo:a',
        { speed: 0.5, default_time: 20000 },
        {
          recipes: [
            { ...recipe, time: 16000 },
            { ...recipe, time: 17000 },
          ],
        },
      ),
      machine('demo:b', { default_time: 32767 }, { recipes: [{ ...recipe, time: 32767 }] }),
    ]);
    expect(withCode(problems, 'machine-time-range')).toEqual([
      ['demo:a', '/components/msm:machine/default_time', 'warning'],
      ['demo:a', '/recipes/1/time', 'warning'],
    ]);
  });

  it('machine-event-unknown: on_start and on_finish must be declared events', async () => {
    const events = { events: { 'demo:done': { actions: [] } }, recipes: [recipe] };
    const problems = await validate([
      machine('demo:a', { on_start: 'demo:begun', on_finish: 'demo:done' }, events),
      machine('demo:b', { on_finish: 'demo:done' }, events),
    ]);
    expect(withCode(problems, 'machine-event-unknown')).toEqual([
      ['demo:a', '/components/msm:machine/on_start', 'error'],
    ]);
  });
});
