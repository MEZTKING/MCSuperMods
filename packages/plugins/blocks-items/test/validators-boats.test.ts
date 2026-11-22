/**
 * The boat and cauldron validators (ADR 0110 D1, ADR 0108 D2; B531): `blocks-items.boat-*`,
 * `cauldron-*` and the shared `component-conflict` and `max-stack-size` for boats, run through
 * every validator of the plugin as the app does, on both built-in targets.
 */
import type { Element, Problem, TargetFacts } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  BOAT_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  FLUID_MIXING_PROBLEM_CODES,
  FLUID_PROBLEM_CODES,
  FURNITURE_PROBLEM_CODES,
  PARTICLE_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
} from '../src/index';
import { element, indexesFor, PROJECT_IDS } from './support';

type Id = `${string}:${string}`;

/** Runs every validator of the plugin, as the app does, with `items` and `textures` added. */
async function validate(
  elements: Element[],
  bundle: TargetBundle,
  extra: { item?: string[]; texture?: string[] } = {},
): Promise<Problem[]> {
  const { vanilla } = await indexesFor(bundle);
  const registry = createRegistryIndex({
    vanilla,
    project: {
      ...PROJECT_IDS,
      item: [...(PROJECT_IDS.item ?? []), ...elements.map((e) => e.id), ...(extra.item ?? [])],
      texture: [...(PROJECT_IDS.texture ?? []), ...(extra.texture ?? [])],
    },
  });
  const target: TargetFacts = bundle.target;
  const results = await Promise.all(
    (plugin.contributes.validators ?? []).map((validator) =>
      validator.validate({ elements, target, registry }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): [string, string | undefined, string][] =>
  problems
    .filter((problem) => problem.code === `blocks-items.${code}`)
    .map((problem) => [problem.elementId as string, problem.path, problem.severity]);

const item = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/oak_boat', ...data } as never);
const boat = (id: Id, boatData: Record<string, unknown> = {}, data: Record<string, unknown> = {}) =>
  item(id, {
    components: { 'msm:boat': { wood_texture: 'minecraft:oak', ...boatData } },
    ...data,
  });
const fluid = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:fluid', id, {
    format: 1,
    textures: {
      still: 'minecraft:block/water_still',
      flowing: 'minecraft:block/water_flow',
      bucket: 'minecraft:item/water_bucket',
    },
    ...data,
  } as never);
const block = (id: Id): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone' } as never);

describe('boat validators', () => {
  it('lists codes not used by the other blocks-items validators', () => {
    const others = new Set([
      ...BLOCKS_ITEMS_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...PARTICLE_PROBLEM_CODES,
      ...FURNITURE_PROBLEM_CODES,
      ...FLUID_PROBLEM_CODES,
      ...FLUID_MIXING_PROBLEM_CODES,
    ]);
    expect(BOAT_PROBLEM_CODES.filter((code) => others.has(code))).toEqual([]);
    expect(BOAT_PROBLEM_CODES).toEqual([
      'blocks-items.boat-chest-clash',
      'blocks-items.boat-planks-missing',
      'blocks-items.boat-texture-missing',
      'blocks-items.boat-fields-unused',
      'blocks-items.cauldron-id-clash',
      'blocks-items.cauldron-levels-ignored',
    ]);
  });

  describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'on %s',
    (_, bundle) => {
      it('reports nothing for a boat beside its planks, drawn with vanilla oak', async () => {
        const problems = await validate(
          [boat('demo:maple_boat', { chest: true }), block('demo:maple_planks')],
          bundle,
        );
        expect(problems).toEqual([]);
      });

      it('reports a chest boat id taken by an element or another boat', async () => {
        const problems = await validate(
          [
            boat('demo:maple_boat', { chest: true }),
            item('demo:maple_chest_boat'),
            boat('demo:elm_boat', { chest: true }),
            boat('demo:elm_raft', { chest: true }),
            boat('demo:fir_boat', { chest: true, raft: true }),
            boat('demo:fir_raft', { chest: true }),
          ],
          bundle,
          { item: ['demo:maple_planks', 'demo:elm_planks', 'demo:fir_planks'] },
        );
        expect(withCode(problems, 'boat-chest-clash')).toEqual([
          ['demo:maple_boat', '/components/msm:boat/chest', 'error'],
          ['demo:elm_raft', '/components/msm:boat/chest', 'error'],
        ]);
      });

      it('warns about a boat whose planks are nowhere', async () => {
        const problems = await validate(
          [boat('demo:maple_boat'), boat('demo:birch_boat'), boat('demo:woods/elm_boat')],
          bundle,
          { item: ['demo:birch_planks'] },
        );
        expect(withCode(problems, 'boat-planks-missing')).toEqual([
          ['demo:maple_boat', undefined, 'warning'],
          ['demo:woods/elm_boat', undefined, 'warning'],
        ]);
        expect(problems.find((p) => p.elementId === 'demo:maple_boat')?.message).toContain(
          'demo:maple_planks',
        );
      });

      it('warns about a boat or chest boat without a picture anywhere', async () => {
        const problems = await validate(
          [
            item('demo:ash_boat', { components: { 'msm:boat': { chest: true } } }),
            item('demo:yew_boat', {
              components: { 'msm:boat': { chest: true } },
              boat_textures: { boat: 'demo:pics/yew', chest_boat: 'demo:pics/yew_chest' },
            }),
            item('demo:fir_boat', { components: { 'msm:boat': {} } }),
            boat('demo:oak_like_boat', { chest: true }),
          ],
          bundle,
          {
            item: ['demo:ash_planks', 'demo:yew_planks', 'demo:fir_planks', 'demo:oak_like_planks'],
            texture: ['demo:entity/boat/fir'],
          },
        );
        expect(withCode(problems, 'boat-texture-missing')).toEqual([
          ['demo:ash_boat', '/boat_textures/boat', 'warning'],
          ['demo:ash_boat', '/boat_textures/chest_boat', 'warning'],
        ]);
      });

      it('warns about boat fields on an item that is not a boat, or chest fields without chest', async () => {
        const problems = await validate(
          [
            item('demo:stick', { boat_textures: { boat: 'demo:a' }, chest_boat_display_name: 'X' }),
            boat(
              'demo:maple_boat',
              {},
              {
                boat_textures: { chest_boat: 'demo:b', chest_boat_item: 'demo:c' },
                chest_boat_display_name: 'Y',
              },
            ),
          ],
          bundle,
          { item: ['demo:maple_planks'] },
        );
        expect(withCode(problems, 'boat-fields-unused')).toEqual([
          ['demo:stick', '/boat_textures', 'warning'],
          ['demo:stick', '/chest_boat_display_name', 'warning'],
          ['demo:maple_boat', '/boat_textures/chest_boat', 'warning'],
          ['demo:maple_boat', '/boat_textures/chest_boat_item', 'warning'],
          ['demo:maple_boat', '/chest_boat_display_name', 'warning'],
        ]);
      });

      it('reports a boat with a component that owns the use, and a stack above 1', async () => {
        const problems = await validate(
          [
            item('demo:maple_boat', {
              max_stack_size: 16,
              components: {
                'msm:boat': { wood_texture: 'minecraft:oak' },
                'msm:food': { nutrition: 1, saturation: 0.1 },
                'msm:bundle': {},
              },
            }),
          ],
          bundle,
          { item: ['demo:maple_planks'] },
        );
        expect(
          withCode(problems, 'component-conflict').filter(([id]) => id === 'demo:maple_boat'),
        ).toEqual(
          expect.arrayContaining([
            ['demo:maple_boat', '/components/msm:food', 'error'],
            ['demo:maple_boat', '/components/msm:bundle', 'error'],
          ]),
        );
        expect(
          withCode(problems, 'max-stack-size').filter(([id]) => id === 'demo:maple_boat'),
        ).toContainEqual(['demo:maple_boat', '/max_stack_size', 'error']);
      });
    },
  );
});

describe('cauldron validators', () => {
  it.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'reports cauldron ids taken by vanilla, an element or another fluid on %s',
    async (_, bundle) => {
      const problems = await validate(
        [
          fluid('minecraft:water', { cauldron: {} }),
          fluid('demo:tea', { cauldron: {} }),
          block('demo:tea_cauldron'),
          fluid('demo:milk', { cauldron: {} }),
          fluid('demo:x/milk', { cauldron: {} }),
          fluid('demo:juice'),
          block('demo:juice_cauldron'),
        ],
        bundle,
      );
      expect(withCode(problems, 'cauldron-id-clash')).toEqual([
        ['minecraft:water', '/cauldron', 'error'],
        ['demo:tea', '/cauldron', 'error'],
      ]);
    },
  );

  it.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'warns about levels on a lava-like cauldron on %s',
    async (_, bundle) => {
      const problems = await validate(
        [
          fluid('demo:slag', { behaves_like: 'lava', cauldron: { levels: true } }),
          fluid('demo:tea', { cauldron: { levels: true } }),
          fluid('demo:ash', { behaves_like: 'lava', cauldron: {} }),
        ],
        bundle,
      );
      expect(withCode(problems, 'cauldron-levels-ignored')).toEqual([
        ['demo:slag', '/cauldron/levels', 'warning'],
      ]);
    },
  );
});
