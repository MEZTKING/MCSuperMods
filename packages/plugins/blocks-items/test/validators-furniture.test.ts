/**
 * The furniture, light, sign and stem validators (ADR 0094 D3, D11; B448): one test per code of
 * `FURNITURE_PROBLEM_CODES`, each with cases that must stay quiet, and what
 * `component-not-for-type` and `type-needs-appearance` say about the twenty types of ADR 0094,
 * run on both built-in targets.
 */
import type { Element, Problem } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  FURNITURE_PROBLEM_CODES,
  furnitureValidators,
  PLANT2_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
  VANILLA_PARITY_TYPES,
} from '../src/index';
import { element, indexesFor } from './support';

type Id = `${string}:${string}`;

const typed = (id: Id, type: string, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, type, ...data } as never);
const block = (id: Id): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone' } as never);
const item = (id: Id): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick' } as never);

const torch = (id: Id, data: Record<string, unknown> = {}) =>
  typed(id, 'torch', { textures: { texture: 'demo:block/torch' }, ...data });
const sign = (id: Id, type = 'sign') =>
  typed(id, type, { wood_type: 'oak', textures: { all: 'demo:block/sign' } });
const stem = (id: Id, fruit: string) =>
  typed(id, 'stem', { fruit, textures: { stem: 'demo:block/stem' } });

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'furniture validators on %s',
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

    it('generated-block-clash: a companion id taken by an element or another companion', async () => {
      const problems = await validate([
        torch('demo:lamp'),
        block('demo:lamp_wall'),
        sign('demo:board'),
        item('demo:board_wall'),
        stem('demo:gourd', 'minecraft:melon'),
        torch('demo:quiet'),
        block('demo:quiet_attached'),
      ]);
      expect(withCode(problems, 'generated-block-clash')).toEqual([
        ['demo:lamp', '/type', 'error'],
        ['demo:board', '/type', 'error'],
      ]);
      // Two elements whose companions share an id (built in memory, so ids repeat).
      const twins = await validate([torch('demo:twin'), sign('demo:twin')]);
      expect(withCode(twins, 'generated-block-clash')).toEqual([['demo:twin', '/type', 'error']]);
    });

    it('stem-fruit-unknown: a fruit that is no project or vanilla block', async () => {
      const problems = await validate([
        stem('demo:melon_like', 'minecraft:melon'),
        stem('demo:own_fruit', 'demo:gourd'),
        block('demo:gourd'),
        stem('demo:companion_fruit', 'demo:lamp_wall'),
        torch('demo:lamp'),
        stem('demo:missing', 'demo:no_such_fruit'),
        stem('demo:bad_vanilla', 'minecraft:no_such_fruit'),
      ]);
      expect(withCode(problems, 'stem-fruit-unknown')).toEqual([
        ['demo:missing', '/fruit', 'error'],
        ['demo:bad_vanilla', '/fruit', 'error'],
      ]);
      expect(
        withCode(
          await validate([stem('demo:x', 'minecraft:anything')], false),
          'stem-fruit-unknown',
        ),
      ).toEqual([]);
    });

    it('torch-particle-not-simple: a torch flame that takes options', async () => {
      const problems = await validate([
        torch('demo:default'),
        torch('demo:soul', { particle: 'minecraft:soul_fire_flame' }),
        torch('demo:own', { particle: 'demo:spark' }),
        torch('demo:dust', { particle: 'minecraft:dust' }),
        torch('demo:short_dust', { particle: 'dust' }),
      ]);
      expect(withCode(problems, 'torch-particle-not-simple')).toEqual([
        ['demo:dust', '/particle', 'error'],
        ['demo:short_dust', '/particle', 'error'],
      ]);
      // Without particle facts the check is skipped.
      const { particles: _particles, ...withoutParticles } = bundle.target;
      const results = await Promise.all(
        furnitureValidators.map((validator) =>
          validator.validate({
            elements: [torch('demo:dust', { particle: 'minecraft:dust' })],
            target: withoutParticles,
            registry: createRegistryIndex({ vanilla: {} }),
          }),
        ),
      );
      expect(results.flat()).toEqual([]);
    });

    it('component-not-for-type: the twenty types take no shaped-only component or strippable', async () => {
      const problems = await validate([
        torch('demo:shaped', { components: { 'msm:shape': { boxes: [[0, 0, 0, 16, 8, 16]] } } }),
        typed('demo:strip_ladder', 'ladder', {
          textures: { texture: 'demo:block/ladder' },
          components: { 'msm:strippable': { into: 'minecraft:stone' } },
        }),
        typed('demo:lit_lantern', 'lantern', {
          textures: { texture: 'demo:block/lantern' },
          components: { 'msm:light_emitter': { level: 12 }, 'msm:flammable': {} },
        }),
        typed('demo:strip_pillar', 'pillar', {
          textures: { all: 'demo:block/log' },
          components: { 'msm:strippable': { into: 'minecraft:stone' } },
        }),
      ]);
      expect(withCode(problems, 'component-not-for-type')).toEqual([
        ['demo:shaped', '/components/msm:shape', 'error'],
        ['demo:strip_ladder', '/components/msm:strippable', 'error'],
      ]);
    });

    it('type-needs-appearance: every one of the twenty types needs a look', async () => {
      const bare = VANILLA_PARITY_TYPES.map((type) => typed(`demo:bare_${type}`, type));
      const found = withCode(await validate(bare), 'type-needs-appearance').map(([id]) => id);
      expect(found).toEqual(VANILLA_PARITY_TYPES.map((type) => `demo:bare_${type}`));
      // A potted plant takes its look from its plant; the others from textures or models.
      const dressed = await validate([
        typed('demo:pot', 'potted_plant', { plant: 'minecraft:short_grass' }),
        typed('demo:bed', 'bed', { textures: { bed: 'demo:block/bed' } }),
        typed('demo:sign_models', 'sign', {
          wood_type: 'oak',
          models: { rot0: 'minecraft:block/oak_sign_rot_0' },
        }),
      ]);
      expect(withCode(dressed, 'type-needs-appearance')).toEqual([]);
    });
  },
);

describe('furniture validator codes', () => {
  it('lists three codes, none shared with the other validators', () => {
    expect(FURNITURE_PROBLEM_CODES).toEqual([
      'blocks-items.generated-block-clash',
      'blocks-items.stem-fruit-unknown',
      'blocks-items.torch-particle-not-simple',
    ]);
    const all = [
      ...FURNITURE_PROBLEM_CODES,
      ...PLANT2_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(furnitureValidators.map((validator) => validator.id)).toEqual([
      'msm.blocks-items.furniture',
    ]);
    expect(VANILLA_PARITY_TYPES).toHaveLength(20);
  });
});
