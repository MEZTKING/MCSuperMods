/**
 * The plant and food validators (ADR 0094 D11; B447): one test per code of
 * `PLANT2_PROBLEM_CODES`, each with cases that must stay quiet, run on both built-in targets.
 */
import type { Element, Problem } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  PLANT2_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
  plants2Validators,
} from '../src/index';
import { element, indexesFor } from './support';

type Id = `${string}:${string}`;

const typed = (id: Id, type: string, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, type, ...data } as never);
const block = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const item = (id: Id): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick' } as never);
const model = (id: Id, parent: string): Element =>
  element('minecraft:model', id, { parent, textures: { cross: 'demo:block/x' } } as never);

const bush = (id: Id, berry: string) =>
  typed(id, 'berry_bush', { berry, textures: { stages: ['demo:block/bush'] } });
const pot = (id: Id, plant: string) => typed(id, 'potted_plant', { plant });

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'plant and food validators on %s',
  (_targetId, bundle: TargetBundle) => {
    async function validate(elements: Element[], vanilla = true): Promise<Problem[]> {
      const { registries } = await indexesFor(bundle);
      const registry = vanilla ? registries : createRegistryIndex({ vanilla: {} });
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({ elements, target: bundle.target, registry }),
        ),
      );
      return results.flat();
    }

    const withCode = (problems: Problem[], code: string) =>
      problems
        .filter((problem) => problem.code === `blocks-items.${code}`)
        .map((problem) => [problem.elementId, problem.path, problem.severity]);

    it('berry-unknown: a berry that is no project or vanilla item', async () => {
      const problems = await validate([
        bush('demo:vanilla_berry', 'minecraft:sweet_berries'),
        bush('demo:own_item', 'demo:blue_berry'),
        item('demo:blue_berry'),
        typed('demo:block_item', 'berry_bush', {
          berry: 'demo:planted_berry',
          item: { id: 'demo:planted_berry' },
          textures: { stages: ['demo:block/bush'] },
        }),
        bush('demo:other_block', 'demo:vanilla_berry'),
        bush('demo:missing', 'demo:no_such_berry'),
        bush('demo:bad_vanilla', 'minecraft:no_such_berry'),
      ]);
      expect(withCode(problems, 'berry-unknown')).toEqual([
        ['demo:missing', '/berry', 'error'],
        ['demo:bad_vanilla', '/berry', 'error'],
      ]);
      // Without vanilla ids only project ids are checked, and vanilla ones pass.
      expect(
        withCode(await validate([bush('demo:x', 'minecraft:anything')], false), 'berry-unknown'),
      ).toEqual([]);
    });

    it('potted-plant-unknown: a plant that is no project or vanilla block', async () => {
      const problems = await validate([
        pot('demo:pot_vanilla', 'minecraft:short_grass'),
        pot('demo:pot_missing', 'demo:no_such_plant'),
        pot('demo:pot_bad_vanilla', 'minecraft:no_such_plant'),
      ]);
      expect(withCode(problems, 'potted-plant-unknown')).toEqual([
        ['demo:pot_missing', '/plant', 'error'],
        ['demo:pot_bad_vanilla', '/plant', 'error'],
      ]);
      expect(
        withCode(await validate([pot('demo:p', 'demo:nothing')], false), 'potted-plant-unknown'),
      ).toEqual([]);
    });

    it('potted-plant-not-plant: a non-plant, a tall plant or a plant vanilla pots', async () => {
      const problems = await validate([
        typed('demo:sapling', 'sapling', {
          tree: 'minecraft:oak',
          textures: { sapling: 'demo:block/sapling' },
        }),
        bush('demo:bush', 'minecraft:sweet_berries'),
        block('demo:flower', { components: { 'msm:shape': { preset: 'cross' } } }),
        block('demo:modelled_flower', { model: 'demo:block/flower_cross' }),
        model('demo:block/flower_cross', 'minecraft:block/cross'),
        block('demo:cube'),
        typed('demo:tall', 'tall_plant', { textures: { top: 'demo:block/tall' } }),
        pot('demo:pot_sapling', 'demo:sapling'),
        pot('demo:pot_bush', 'demo:bush'),
        pot('demo:pot_flower', 'demo:flower'),
        pot('demo:pot_modelled', 'demo:modelled_flower'),
        pot('demo:pot_grass', 'minecraft:short_grass'),
        pot('demo:pot_cube', 'demo:cube'),
        pot('demo:pot_tall', 'demo:tall'),
        pot('demo:pot_dandelion', 'minecraft:dandelion'),
      ]);
      expect(withCode(problems, 'potted-plant-not-plant')).toEqual([
        ['demo:pot_cube', '/plant', 'warning'],
        ['demo:pot_tall', '/plant', 'warning'],
        ['demo:pot_dandelion', '/plant', 'warning'],
      ]);
    });

    it('light-fixed-by-state: a light emitter on a candle or sea pickle', async () => {
      const light = { components: { 'msm:light_emitter': { level: 10 } } };
      const problems = await validate([
        typed('demo:candle', 'candle', { textures: { candle: 'demo:block/c' }, ...light }),
        typed('demo:pickle', 'sea_pickle', { textures: { all: 'demo:block/p' }, ...light }),
        typed('demo:carpet', 'carpet', { textures: { all: 'demo:block/r' }, ...light }),
        typed('demo:plain_candle', 'candle', { textures: { candle: 'demo:block/c' } }),
      ]);
      expect(withCode(problems, 'light-fixed-by-state')).toEqual([
        ['demo:candle', '/components/msm:light_emitter', 'warning'],
        ['demo:pickle', '/components/msm:light_emitter', 'warning'],
      ]);
    });
  },
);

describe('plant and food validator codes', () => {
  it('lists four codes, none shared with the other validators', () => {
    expect(PLANT2_PROBLEM_CODES).toEqual([
      'blocks-items.berry-unknown',
      'blocks-items.potted-plant-unknown',
      'blocks-items.potted-plant-not-plant',
      'blocks-items.light-fixed-by-state',
    ]);
    const all = [
      ...PLANT2_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(plants2Validators.map((validator) => validator.id)).toEqual([
      'msm.blocks-items.plants-2',
    ]);
  });
});
