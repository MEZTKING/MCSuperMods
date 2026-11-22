/**
 * The growing plant validators (ADR 0103; B511): one test per code of `PLANT3_PROBLEM_CODES`,
 * each with cases that must stay quiet, run on both built-in targets; and the companion clash
 * check of the furniture validators over the new companions.
 */
import type { Element, Problem } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  FURNITURE_PROBLEM_CODES,
  PLANT2_PROBLEM_CODES,
  PLANT3_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
  plants3Validators,
} from '../src/index';
import { element, indexesFor } from './support';

type Id = `${string}:${string}`;

const typed = (id: Id, type: string, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, type, ...data } as never);
const leaf = (id: Id, size: string, data: Record<string, unknown> = {}) =>
  typed(id, 'dripleaf', { size, textures: { top: 'demo:block/leaf' }, ...data });
const column = (id: Id, data: Record<string, unknown>) =>
  typed(id, 'column_plant', { textures: { all: 'demo:block/reed' }, ...data });
const feature = (id: Id, data: Record<string, unknown>): Element =>
  element('minecraft:worldgen/feature', id, data as never);
const placed = (id: Id, data: Record<string, unknown>): Element =>
  element('minecraft:worldgen/placed_feature', id, data as never);
const simpleBlock = (block: string) => ({
  type: 'minecraft:simple_block',
  config: { to_place: { type: 'minecraft:simple_state_provider', state: { Name: block } } },
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'growing plant validators on %s',
  (_targetId, bundle: TargetBundle) => {
    async function validate(elements: Element[]): Promise<Problem[]> {
      const { registries } = await indexesFor(bundle);
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({ elements, target: bundle.target, registry: registries }),
        ),
      );
      return results.flat();
    }

    const withCode = (problems: Problem[], code: string) =>
      problems
        .filter((problem) => problem.code === `blocks-items.${code}`)
        .map((problem) => [problem.elementId, problem.path, problem.severity]);

    it('dripleaf-grows-into-missing: a small dripleaf that grows into nothing', async () => {
      const problems = await validate([
        leaf('demo:small', 'small'),
        leaf('demo:small_ok', 'small', { grows_into: 'demo:big' }),
        leaf('demo:big', 'big'),
      ]);
      expect(withCode(problems, 'dripleaf-grows-into-missing')).toEqual([
        ['demo:small', '/grows_into', 'error'],
      ]);
    });

    it('dripleaf-grows-into-big: a big dripleaf with grows_into', async () => {
      const problems = await validate([
        leaf('demo:big', 'big', { grows_into: 'demo:other' }),
        leaf('demo:other', 'big'),
      ]);
      expect(withCode(problems, 'dripleaf-grows-into-big')).toEqual([
        ['demo:big', '/grows_into', 'error'],
      ]);
    });

    it('dripleaf-tilt-small: tilt timings on a small dripleaf', async () => {
      const problems = await validate([
        leaf('demo:small', 'small', { grows_into: 'demo:big', tilt_ticks: [2, 10, 10] }),
        leaf('demo:big', 'big', { tilt_ticks: [2, 10, 10] }),
      ]);
      expect(withCode(problems, 'dripleaf-tilt-small')).toEqual([
        ['demo:small', '/tilt_ticks', 'error'],
      ]);
    });

    it('dripleaf-grows-into-not-big: grows into a project block that is no big dripleaf', async () => {
      const problems = await validate([
        leaf('demo:to_small', 'small', { grows_into: 'demo:other_small' }),
        leaf('demo:other_small', 'small', { grows_into: 'demo:big' }),
        leaf('demo:to_block', 'small', { grows_into: 'demo:stone' }),
        typed('demo:stone', 'block', { model: 'minecraft:block/stone' }),
        leaf('demo:to_big', 'small', { grows_into: 'demo:big' }),
        leaf('demo:big', 'big'),
        leaf('demo:to_vanilla', 'small', { grows_into: 'minecraft:big_dripleaf' }),
      ]);
      expect(withCode(problems, 'dripleaf-grows-into-not-big')).toEqual([
        ['demo:to_small', '/grows_into', 'error'],
        ['demo:to_block', '/grows_into', 'error'],
      ]);
    });

    it('column-min-above-max: the shortest stop above the tallest', async () => {
      const problems = await validate([
        column('demo:cane', { style: 'cane', min_height: 4 }),
        column('demo:cane_ok', { style: 'cane', min_height: 3 }),
        column('demo:tall', { style: 'cane', max_height: 6, min_height: 5 }),
        column('demo:bamboo', { style: 'bamboo', min_height: 14 }),
        column('demo:bamboo_low', { style: 'bamboo', max_height: 10, min_height: 12 }),
      ]);
      expect(withCode(problems, 'column-min-above-max')).toEqual([
        ['demo:cane', '/min_height', 'error'],
        ['demo:bamboo_low', '/min_height', 'error'],
      ]);
    });

    it('water-plant-feature-dry: a water plant placed with no water check', async () => {
      const kelp = typed('demo:kelp', 'growing_plant', {
        needs_water: true,
        textures: { head: 'demo:block/kelp' },
      });
      const vine = typed('demo:vine', 'growing_plant', { textures: { head: 'demo:block/vine' } });
      const cane = column('demo:cane', { style: 'cane' });
      const dryCane = column('demo:dry_cane', { style: 'cane', needs_water_nearby: false });
      const problems = await validate([
        kelp,
        vine,
        cane,
        dryCane,
        feature('demo:kelp_patch', simpleBlock('demo:kelp')),
        feature('demo:kelp_strand', simpleBlock('demo:kelp_plant')),
        feature('demo:kelp_wet', simpleBlock('demo:kelp')),
        placed('demo:kelp_wet_placed', {
          feature: 'demo:kelp_wet',
          placement: [
            {
              type: 'minecraft:block_predicate_filter',
              predicate: { type: 'minecraft:matching_fluids', fluids: 'minecraft:water' },
            },
          ],
        }),
        feature('demo:cane_patch', simpleBlock('demo:cane')),
        placed('demo:cane_inline', {
          feature: simpleBlock('demo:cane'),
          placement: [
            {
              type: 'minecraft:block_predicate_filter',
              predicate: { type: 'minecraft:would_survive', state: { Name: 'demo:cane' } },
            },
          ],
        }),
        feature('demo:vine_patch', simpleBlock('demo:vine')),
        feature('demo:dry_cane_patch', simpleBlock('demo:dry_cane')),
      ]);
      expect(withCode(problems, 'water-plant-feature-dry')).toEqual([
        ['demo:kelp_patch', undefined, 'warning'],
        ['demo:kelp_strand', undefined, 'warning'],
        ['demo:cane_patch', undefined, 'warning'],
      ]);
    });

    it('generated-block-clash: the strand, shoot and stem ids are reserved', async () => {
      const problems = await validate([
        typed('demo:moss', 'growing_plant', { textures: { head: 'demo:block/moss' } }),
        typed('demo:moss_plant', 'block', { model: 'minecraft:block/stone' }),
        column('demo:bamboo', { style: 'bamboo', textures: { stalk: 'demo:block/bamboo' } }),
        typed('demo:bamboo_shoot', 'block', { model: 'minecraft:block/stone' }),
        column('demo:cane', { style: 'cane' }),
        typed('demo:cane_shoot', 'block', { model: 'minecraft:block/stone' }),
        leaf('demo:leaf', 'big'),
        typed('demo:leaf_stem', 'block', { model: 'minecraft:block/stone' }),
      ]);
      expect(withCode(problems, 'generated-block-clash').map(([elementId]) => elementId)).toEqual(
        expect.arrayContaining(['demo:moss', 'demo:bamboo', 'demo:leaf']),
      );
      expect(
        withCode(problems, 'generated-block-clash').map(([elementId]) => elementId),
      ).not.toContain('demo:cane');
    });

    it('water-plant-grows-down and berries-ignore-bonemeal: what the runtime warns about', async () => {
      const strand = (id: Id, data: Record<string, unknown>) =>
        typed(id, 'growing_plant', { textures: { all: 'demo:block/strand' }, ...data });
      const problems = await validate([
        strand('demo:kelp_down', { needs_water: true, direction: 'down' }),
        strand('demo:vine_down', { direction: 'down' }),
        strand('demo:kelp_up', { needs_water: true, direction: 'up' }),
        strand('demo:berry_vine', {
          berries: { item: 'minecraft:glow_berries' },
          bonemeal_growth: { min: 1, max: 2 },
        }),
        strand('demo:fast_vine', { bonemeal_growth: { min: 1, max: 2 } }),
      ]);
      expect(withCode(problems, 'water-plant-grows-down')).toEqual([
        ['demo:kelp_down', '/direction', 'warning'],
      ]);
      expect(withCode(problems, 'berries-ignore-bonemeal')).toEqual([
        ['demo:berry_vine', '/bonemeal_growth', 'warning'],
      ]);
    });

    const pot = (id: Id, plants: string[]) => typed(id, 'flower_pot', { model: undefined, plants });
    const potted = (id: Id, plant: string, pot?: string) =>
      typed(id, 'potted_plant', { plant, ...(pot === undefined ? {} : { pot }) });

    it('pot-plant-repeated: a plant listed twice or two plants of one name', async () => {
      const problems = await validate([
        pot('demo:clay_pot', [
          'minecraft:poppy',
          'minecraft:dandelion',
          'poppy',
          'demo:dandelion',
          'demo:fern',
        ]),
        typed('demo:dandelion', 'plant', { textures: { all: 'demo:block/dandelion' } }),
        typed('demo:fern', 'plant', { textures: { all: 'demo:block/fern' } }),
      ]);
      expect(withCode(problems, 'pot-plant-repeated')).toEqual([
        ['demo:clay_pot', '/plants/2', 'warning'],
        ['demo:clay_pot', '/plants/3', 'warning'],
      ]);
    });

    it('pot-plant-unfit: no item, or two blocks high', async () => {
      const problems = await validate([
        pot('demo:clay_pot', [
          'demo:tall',
          'demo:no_item',
          'demo:sprout',
          'minecraft:potted_poppy',
          'minecraft:poppy',
        ]),
        typed('demo:tall', 'tall_plant', {
          textures: { top: 'demo:block/t', bottom: 'demo:block/b' },
        }),
        typed('demo:no_item', 'plant', { item: false, textures: { all: 'demo:block/n' } }),
        typed('demo:sprout', 'plant', { textures: { all: 'demo:block/s' } }),
      ]);
      expect(withCode(problems, 'pot-plant-unfit')).toEqual([
        ['demo:clay_pot', '/plants/0', 'error'],
        ['demo:clay_pot', '/plants/1', 'error'],
        ['demo:clay_pot', '/plants/3', 'error'],
      ]);
    });

    it('pot-plant-also-potted: a potted_plant for a plant its pot lists', async () => {
      const problems = await validate([
        pot('demo:clay_pot', ['minecraft:poppy']),
        potted('demo:clay_pot_poppy_too', 'minecraft:poppy', 'demo:clay_pot'),
        potted('demo:clay_pot_allium', 'minecraft:allium', 'demo:clay_pot'),
        potted('demo:vanilla_pot_poppy', 'minecraft:poppy'),
      ]);
      expect(withCode(problems, 'pot-plant-also-potted')).toEqual([
        ['demo:clay_pot_poppy_too', '/plant', 'error'],
      ]);
    });

    it('potted-plant-pot-not-pot: pot names a block that is not a flower pot', async () => {
      const problems = await validate([
        pot('demo:clay_pot', ['minecraft:poppy']),
        typed('demo:crate', 'block', { model: 'minecraft:block/barrel' }),
        potted('demo:a', 'minecraft:allium', 'demo:crate'),
        potted('demo:b', 'minecraft:allium', 'minecraft:stone'),
        potted('demo:c', 'minecraft:allium', 'demo:clay_pot'),
        potted('demo:d', 'minecraft:allium', 'minecraft:flower_pot'),
      ]);
      expect(withCode(problems, 'potted-plant-pot-not-pot')).toEqual([
        ['demo:a', '/pot', 'error'],
        ['demo:b', '/pot', 'error'],
      ]);
    });
  },
);

describe('growing plant validator codes', () => {
  it('lists twelve codes, none shared with the other validators', () => {
    expect(PLANT3_PROBLEM_CODES).toEqual([
      'blocks-items.dripleaf-grows-into-missing',
      'blocks-items.dripleaf-grows-into-big',
      'blocks-items.dripleaf-tilt-small',
      'blocks-items.dripleaf-grows-into-not-big',
      'blocks-items.column-min-above-max',
      'blocks-items.water-plant-feature-dry',
      'blocks-items.water-plant-grows-down',
      'blocks-items.berries-ignore-bonemeal',
      'blocks-items.pot-plant-repeated',
      'blocks-items.pot-plant-unfit',
      'blocks-items.pot-plant-also-potted',
      'blocks-items.potted-plant-pot-not-pot',
    ]);
    const all = [
      ...PLANT3_PROBLEM_CODES,
      ...FURNITURE_PROBLEM_CODES,
      ...PLANT2_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(plants3Validators.map((validator) => validator.id)).toEqual([
      'msm.blocks-items.plants-3',
    ]);
  });
});
