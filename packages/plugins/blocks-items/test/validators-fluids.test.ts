/**
 * The fluid validators (ADR 0099 D1, D4; B477): `blocks-items.generated-item-clash`,
 * `fluid-flow-range`, `fluid-texture-missing` and the one-fluid target's `fluid-no-fog`, run
 * through every validator of the plugin as the app does, on both built-in targets.
 */
import type { Element, Problem, TargetFacts } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  FLUID_PROBLEM_CODES,
  FURNITURE_PROBLEM_CODES,
  fluidKind,
  PARTICLE_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
} from '../src/index';
import { element, indexesFor } from './support';

const bundleWith = (model: 'two_fluids' | 'one_fluid'): TargetBundle => {
  const found = builtInTargets.find((bundle) => bundle.target.blocks?.fluidModel === model);
  if (found === undefined) throw new Error(`no target with ${model}`);
  return found;
};
const TWO = bundleWith('two_fluids');
const ONE = bundleWith('one_fluid');

/** Runs every validator of the plugin, as the app does. */
async function validate(elements: Element[], bundle: TargetBundle = TWO): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  const target: TargetFacts = bundle.target;
  const results = await Promise.all(
    (plugin.contributes.validators ?? []).map((validator) =>
      validator.validate({ elements, target, registry: registries }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): [string, string | undefined, string][] =>
  problems
    .filter((problem) => problem.code === `blocks-items.${code}`)
    .map((problem) => [problem.elementId as string, problem.path, problem.severity]);

type Id = `${string}:${string}`;
const TEXTURES = {
  still: 'minecraft:block/water_still',
  flowing: 'minecraft:block/water_flow',
  bucket: 'minecraft:item/water_bucket',
};
const fluid = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:fluid', id, { format: 1, textures: TEXTURES, ...data } as never);
const block = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const item = (id: Id): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick' } as never);

describe('fluid validators', () => {
  it('lists codes not used by the other blocks-items validators', () => {
    const others = new Set([
      ...BLOCKS_ITEMS_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...PARTICLE_PROBLEM_CODES,
      ...FURNITURE_PROBLEM_CODES,
    ]);
    expect(FLUID_PROBLEM_CODES.filter((code) => others.has(code))).toEqual([]);
    expect(FLUID_PROBLEM_CODES).toEqual([
      'blocks-items.generated-item-clash',
      'blocks-items.fluid-flow-range',
      'blocks-items.fluid-texture-missing',
      'blocks-items.fluid-no-fog',
    ]);
  });

  it.each([
    ['two-fluid', TWO],
    ['one-fluid', ONE],
  ] as const)('reports nothing for the kind default on the %s target', async (_, bundle) => {
    const created = element(
      'msm:fluid',
      'demo:goo',
      structuredClone(fluidKind.defaultData) as never,
    );
    expect(await validate([created], bundle)).toEqual([]);
  });

  describe('generated-item-clash', () => {
    it('reports a bucket id taken by an element, a block item or another bucket', async () => {
      const problems = await validate([
        fluid('demo:oil'),
        item('demo:oil_bucket'),
        fluid('demo:tar'),
        block('demo:tar_block', { item: { id: 'demo:tar_bucket' } }),
        fluid('demo:a/goo'),
        fluid('demo:goo'),
        fluid('demo:fine'),
      ]);
      expect(withCode(problems, 'generated-item-clash')).toEqual([
        ['demo:oil', undefined, 'error'],
        ['demo:tar', undefined, 'error'],
      ]);
      const twice = await validate([fluid('demo:slime'), fluid('demo:x/slime')]);
      expect(withCode(twice, 'generated-item-clash')).toEqual([]);
    });

    it('reports a second fluid whose bucket is the same id', async () => {
      // `demo:goo_bucket` is both an element (a fluid) and `demo:goo`'s bucket.
      const problems = await validate([fluid('demo:goo'), fluid('demo:goo_bucket')]);
      expect(withCode(problems, 'generated-item-clash')).toEqual([
        ['demo:goo', undefined, 'error'],
      ]);
    });

    it('stays quiet without fluids, even when a block item ends in _bucket', async () => {
      const problems = await validate([block('demo:pail', { item: { id: 'demo:pail_bucket' } })]);
      expect(withCode(problems, 'generated-item-clash')).toEqual([]);
    });
  });

  describe('fluid-flow-range', () => {
    it('reports a slope distance beyond how far the fluid spreads', async () => {
      const problems = await validate([
        fluid('demo:short', { flow: { drop_off: 4, slope_distance: 2 } }),
        fluid('demo:lava_far', { behaves_like: 'lava', flow: { slope_distance: 4 } }),
        fluid('demo:steep', { flow: { drop_off: 3 } }),
        fluid('demo:water'),
        fluid('demo:lava', { behaves_like: 'lava' }),
        fluid('demo:edge', { flow: { drop_off: 2, slope_distance: 3 } }),
      ]);
      expect(withCode(problems, 'fluid-flow-range')).toEqual([
        ['demo:short', '/flow/slope_distance', 'warning'],
        ['demo:lava_far', '/flow/slope_distance', 'warning'],
        ['demo:steep', '/flow/drop_off', 'warning'],
      ]);
      const message = problems.find((problem) => problem.elementId === 'demo:short')?.message;
      expect(message).toContain('only spreads 1 block');
    });
  });

  describe('fluid-texture-missing', () => {
    it('reports each missing still, flowing and bucket picture, never the overlay', async () => {
      const problems = await validate([
        element('msm:fluid', 'demo:bare', { format: 1 } as never),
        fluid('demo:half', { textures: { still: 'minecraft:block/water_still' } }),
        element('msm:fluid', 'demo:molten', {
          format: 1,
          behaves_like: 'lava',
          textures: { still: 'minecraft:block/lava_still', flowing: 'minecraft:block/lava_flow' },
        } as never),
        fluid('demo:full'),
      ]);
      expect(withCode(problems, 'fluid-texture-missing')).toEqual([
        ['demo:bare', '/textures/still', 'warning'],
        ['demo:bare', '/textures/flowing', 'warning'],
        ['demo:bare', '/textures/bucket', 'warning'],
        ['demo:half', '/textures/flowing', 'warning'],
        ['demo:half', '/textures/bucket', 'warning'],
        ['demo:molten', '/textures/bucket', 'warning'],
      ]);
      const molten = problems.find(
        (problem) =>
          problem.elementId === 'demo:molten' && problem.code.endsWith('fluid-texture-missing'),
      );
      expect(molten?.message).toContain("vanilla lava's");
    });
  });

  describe('fluid-no-fog', () => {
    it('warns about a fluid that behaves like nothing on the one-fluid target only', async () => {
      const elements = [
        fluid('demo:mist', { behaves_like: 'none' }),
        fluid('demo:water', { behaves_like: 'water' }),
        fluid('demo:plain'),
        fluid('demo:lava', { behaves_like: 'lava' }),
      ];
      expect(withCode(await validate(elements, ONE), 'fluid-no-fog')).toEqual([
        ['demo:mist', '/behaves_like', 'warning'],
      ]);
      expect(withCode(await validate(elements, TWO), 'fluid-no-fog')).toEqual([]);
      const { registries } = await indexesFor(ONE);
      const { blocks: _blocks, ...withoutFacts } = ONE.target;
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({
            elements,
            target: withoutFacts as TargetFacts,
            registry: registries,
          }),
        ),
      );
      expect(withCode(results.flat(), 'fluid-no-fog')).toEqual([]);
    });
  });
});
