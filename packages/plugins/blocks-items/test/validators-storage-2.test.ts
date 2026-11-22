/**
 * The storage 2 validators (ADR 0104 D3 to D6; B515): one test per code of
 * `STORAGE2_PROBLEM_CODES`, each with cases that must stay quiet, on both built-in targets.
 */
import type { Element, Problem } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  PLANT3_PROBLEM_CODES,
  SOUND_PROBLEM_CODES,
  STORAGE2_PROBLEM_CODES,
  storage2Validators,
  WEATHERING_PROBLEM_CODES,
} from '../src/index';
import { element, indexesFor } from './support';

type Id = `${string}:${string}`;

const block = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/barrel', ...data } as never);
const chest = (id: Id, fields: Record<string, unknown> = {}, data: Record<string, unknown> = {}) =>
  block(id, { ...data, components: { 'msm:container': fields, ...(data.components ?? {}) } });

describe('storage 2 validator codes', () => {
  it('lists five codes, none shared with the other validators', () => {
    expect(STORAGE2_PROBLEM_CODES).toEqual([
      'blocks-items.double-chest-layout',
      'blocks-items.double-chest-type',
      'blocks-items.per-player-conflict',
      'blocks-items.per-player-hoppers',
      'blocks-items.ageing-container-mismatch',
    ]);
    const all = [
      ...STORAGE2_PROBLEM_CODES,
      ...SOUND_PROBLEM_CODES,
      ...PLANT3_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...WEATHERING_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(storage2Validators.map((validator) => validator.id)).toEqual([
      'msm.blocks-items.storage-2',
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'storage 2 validators on %s',
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

    it('reports nothing for the storage the runtime takes', async () => {
      const problems = await validate([
        chest(
          'demo:double',
          { double: true },
          { type: 'horizontal', textures: { all: 'demo:block/c' } },
        ),
        chest('demo:double_block', { rows: 3, double: true }),
        chest('demo:mine', { per_player: true, hoppers: false }),
        chest('demo:wet', {}, { components: { 'msm:waterloggable': {} } }),
        block('demo:wet_mill', {
          components: {
            'msm:machine': { recipe_types: ['minecraft:smelting'] },
            'msm:waterloggable': {},
          },
        }),
      ]);
      expect(problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(problems.filter((problem) => STORAGE2_PROBLEM_CODES.includes(problem.code))).toEqual(
        [],
      );
    });

    it('double-chest-layout: double needs 3 rows and no keep_contents', async () => {
      const problems = await validate([
        chest('demo:six', { rows: 6, double: true }),
        chest('demo:keep', { keep_contents: true, double: true }),
        chest('demo:ok', { rows: 3, double: true }),
        chest('demo:off', { rows: 6, double: false }),
      ]);
      expect(withCode(problems, 'double-chest-layout')).toEqual([
        ['demo:six', '/components/msm:container/double', 'error'],
        ['demo:keep', '/components/msm:container/double', 'error'],
      ]);
    });

    it('double-chest-type: not on pillars or six-way blocks', async () => {
      const problems = await validate([
        chest('demo:pillar', { double: true }, { type: 'pillar' }),
        chest('demo:dir', { double: true }, { type: 'directional' }),
        chest('demo:side', { double: true }, { type: 'horizontal' }),
        chest('demo:plain', { double: true }),
        chest('demo:pillar_single', {}, { type: 'pillar' }),
      ]);
      expect(withCode(problems, 'double-chest-type')).toEqual([
        ['demo:pillar', '/components/msm:container/double', 'error'],
        ['demo:dir', '/components/msm:container/double', 'error'],
      ]);
    });

    it('per-player-conflict: not with keep_contents or double', async () => {
      const problems = await validate([
        chest('demo:keep', { per_player: true, keep_contents: true }),
        chest('demo:double', { per_player: true, double: true }),
        chest('demo:ok', { per_player: true }),
        chest('demo:off', { per_player: false, double: true }),
      ]);
      expect(withCode(problems, 'per-player-conflict')).toEqual([
        ['demo:keep', '/components/msm:container/per_player', 'error'],
        ['demo:double', '/components/msm:container/per_player', 'error'],
      ]);
    });

    it('per-player-hoppers: hoppers and comparators reach no player store', async () => {
      const problems = await validate([
        chest('demo:both', { per_player: true, hoppers: true, comparator: true }),
        chest('demo:off', { per_player: true, hoppers: false, comparator: false }),
        chest('demo:shared', { hoppers: true, comparator: true }),
      ]);
      expect(withCode(problems, 'per-player-hoppers')).toEqual([
        ['demo:both', '/components/msm:container/hoppers', 'info'],
        ['demo:both', '/components/msm:container/comparator', 'info'],
      ]);
    });

    it('ageing-container-mismatch: the next stage and the waxed block keep the slots', async () => {
      const ageing = (id: Id, next: string, waxed?: string) =>
        chest(
          id,
          {},
          {
            components: {
              'msm:weathering': { stage: 'unaffected', next },
              ...(waxed === undefined ? {} : { 'msm:waxable': { into: waxed } }),
            },
          },
        );
      const problems = await validate([
        ageing('demo:tin_chest', 'demo:exposed_tin_chest', 'demo:waxed_tin_chest'),
        chest(
          'demo:exposed_tin_chest',
          {},
          { components: { 'msm:weathering': { stage: 'exposed' } } },
        ),
        block('demo:waxed_tin_chest', {}),
        ageing('demo:big_chest', 'demo:exposed_big_chest'),
        chest(
          'demo:exposed_big_chest',
          { rows: 6 },
          { components: { 'msm:weathering': { stage: 'exposed' } } },
        ),
        ageing('demo:vanilla_next', 'minecraft:copper_block'),
      ]);
      expect(withCode(problems, 'ageing-container-mismatch')).toEqual([
        ['demo:tin_chest', '/components/msm:waxable/into', 'warning'],
        ['demo:big_chest', '/components/msm:weathering/next', 'warning'],
      ]);
    });
  },
);
