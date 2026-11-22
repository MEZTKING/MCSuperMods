/**
 * The validators of ADR 0109 (`validators-mobs-2.ts`): one positive and one negative case per
 * code.
 */
import type { Element, Json, Problem, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  blockReferenceTest,
  ENTITIES_MOB_PROBLEM_CODES,
  ENTITIES_MOB2_PROBLEM_CODES,
  ENTITIES_PROBLEM_CODES,
  ENTITIES_VILLAGER_PROBLEM_CODES,
  entitiesMob2Validators,
} from '../src/index';
import { element, indexesFor } from './support';

const FIRST = builtInTargets[0] as TargetBundle;

async function validate(elements: Element[], bundle: TargetBundle = FIRST): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  return (
    await Promise.all(
      entitiesMob2Validators.map((validator) =>
        validator.validate({ elements, target: bundle.target, registry: registries }),
      ),
    )
  ).flat();
}

const only = (problems: Problem[], code: string) =>
  problems.filter((problem) => problem.code === code).map((p) => [p.elementId, p.severity, p.path]);

const model = { model: 'demo:entity/x', texture: 'demo:entity/x' };

/** An entity with `components` and optional top-level fields. */
const mob = (
  id: ResourceLocation,
  components: Record<string, Json>,
  extra: Record<string, Json> = {},
) =>
  element('msm:entity', id, {
    format: 1,
    category: 'creature',
    size: { width: 0.5, height: 0.5 },
    ...extra,
    components: { ...components, 'msm:animated_model': model },
  });

const moving = (mode?: string): Record<string, Json> =>
  mode === undefined ? {} : { 'msm:movement': { mode } };
const goals = (...list: Json[]): Record<string, Json> => ({ 'msm:ai_goals': { goals: list } });

describe('ADR 0109 mob validators', () => {
  it('lists eight codes apart from the other entity codes, contributed after the mob checks', () => {
    expect(ENTITIES_MOB2_PROBLEM_CODES).toEqual([
      'entities.bucketable-needs-swim',
      'entities.bucket-fields-unused',
      'entities.dash-needs-walk',
      'entities.swoop-needs-flight',
      'entities.hover-height-unused',
      'entities.habit-loot-table-unknown',
      'entities.dig-block-unknown',
      'entities.collect-without-owner',
    ]);
    for (const code of ENTITIES_MOB2_PROBLEM_CODES) {
      for (const other of [
        ENTITIES_PROBLEM_CODES,
        ENTITIES_MOB_PROBLEM_CODES,
        ENTITIES_VILLAGER_PROBLEM_CODES,
      ]) {
        expect(other as readonly string[]).not.toContain(code);
      }
    }
    expect(plugin.contributes.validators?.slice(14, 17)).toEqual([...entitiesMob2Validators]);
  });

  it('reports nothing for an empty project', async () => {
    expect(await validate([])).toEqual([]);
  });

  it('entities.bucketable-needs-swim: only swimming mobs', async () => {
    const problems = await validate([
      mob('demo:a', { ...moving('swim'), 'msm:bucketable': {} }),
      mob('demo:b', { ...moving('amphibious'), 'msm:bucketable': {} }),
      mob('demo:c', { 'msm:bucketable': { water: false } }),
      mob('demo:d', { ...moving('fly') }),
    ]);
    expect(only(problems, 'entities.bucketable-needs-swim')).toEqual([
      ['demo:b', 'error', '/components/msm:bucketable'],
      ['demo:c', 'error', '/components/msm:bucketable'],
    ]);
  });

  it('entities.bucket-fields-unused: bucket fields without the component', async () => {
    const problems = await validate([
      mob('demo:a', moving('swim'), { bucket_display_name: 'B', bucket_texture: 'demo:item/a' }),
      mob(
        'demo:b',
        { ...moving('swim'), 'msm:bucketable': {} },
        { bucket_display_name: 'B', bucket_texture: 'demo:item/b' },
      ),
    ]);
    expect(only(problems, 'entities.bucket-fields-unused')).toEqual([
      ['demo:a', 'info', '/bucket_display_name'],
      ['demo:a', 'info', '/bucket_texture'],
    ]);
  });

  it('entities.dash-needs-walk: walking and amphibious mobs only', async () => {
    const rideable = (dash?: Json) => ({
      'msm:rideable': { saddle: true, ...(dash === undefined ? {} : { dash }) },
    });
    const problems = await validate([
      mob('demo:a', { ...rideable({}) }),
      mob('demo:b', { ...moving('amphibious'), ...rideable({ power: 2 }) }),
      mob('demo:c', { ...moving('fly'), ...rideable({}) }),
      mob('demo:d', { ...moving('swim'), ...rideable({}) }),
      mob('demo:e', { ...moving('fly'), ...rideable() }),
    ]);
    expect(only(problems, 'entities.dash-needs-walk')).toEqual([
      ['demo:c', 'error', '/components/msm:rideable/dash'],
      ['demo:d', 'error', '/components/msm:rideable/dash'],
    ]);
  });

  it('entities.swoop-needs-flight: fly, hover and phase only', async () => {
    const swoop = goals({ type: 'wander' }, { type: 'swoop', targets: ['minecraft:player'] });
    const problems = await validate([
      mob('demo:a', { ...moving('fly'), ...swoop }),
      mob('demo:b', { ...moving('hover'), ...swoop }),
      mob('demo:c', { ...moving('phase'), ...swoop }),
      mob('demo:d', { ...swoop }),
      mob('demo:e', { ...moving('swim'), ...swoop }),
    ]);
    expect(only(problems, 'entities.swoop-needs-flight')).toEqual([
      ['demo:d', 'error', '/components/msm:ai_goals/goals/1'],
      ['demo:e', 'error', '/components/msm:ai_goals/goals/1'],
    ]);
  });

  it('entities.hover-height-unused: only hovering mobs use the height', async () => {
    const problems = await validate([
      mob('demo:a', { 'msm:movement': { mode: 'hover', hover_height: 6 } }),
      mob('demo:b', { 'msm:movement': { mode: 'fly', hover_height: 6 } }),
      mob('demo:c', { 'msm:movement': { mode: 'hover' } }),
    ]);
    expect(only(problems, 'entities.hover-height-unused')).toEqual([
      ['demo:b', 'info', '/components/msm:movement/hover_height'],
    ]);
  });

  it('entities.habit-loot-table-unknown: barter and dig tables', async () => {
    const barter = (table: string) =>
      goals({ type: 'barter', item: 'minecraft:gold_ingot', loot_table: table });
    const dig = (table: string) =>
      goals({ type: 'dig_items', dig_blocks: ['minecraft:moss_block'], loot_table: table });
    const problems = await validate([
      mob('demo:a', barter('minecraft:gameplay/piglin_bartering')),
      mob('demo:b', barter('example:entities/ruby_golem_rare')),
      mob('demo:c', barter('demo:own_loot')),
      element('minecraft:loot_table', 'demo:own_loot', { pools: [] }),
      mob('demo:d', dig('demo:blocks/ore')),
      element('msm:block', 'demo:ore', { format: 1 }),
      mob('demo:e', barter('demo:nothing')),
      mob('demo:f', dig('minecraft:gameplay/nowhere')),
    ]);
    expect(only(problems, 'entities.habit-loot-table-unknown')).toEqual([
      ['demo:e', 'warning', '/components/msm:ai_goals/goals/0/loot_table'],
      ['demo:f', 'warning', '/components/msm:ai_goals/goals/0/loot_table'],
    ]);
  });

  it('entities.habit-loot-table-unknown: skipped when the index has no loot tables', async () => {
    const registry = createRegistryIndex({ vanilla: { block: ['stone'] } });
    const problems = (
      await Promise.all(
        entitiesMob2Validators.map((validator) =>
          validator.validate({
            elements: [
              mob(
                'demo:a',
                goals({ type: 'barter', item: 'minecraft:gold_ingot', loot_table: 'x:y' }),
              ),
            ],
            target: FIRST.target,
            registry,
          }),
        ),
      )
    ).flat();
    expect(problems).toEqual([]);
  });

  it('entities.dig-block-unknown: blocks and tags of the project or the game', async () => {
    const problems = await validate([
      mob(
        'demo:a',
        goals({
          type: 'dig_items',
          dig_blocks: [
            'minecraft:moss_block',
            '#minecraft:dirt',
            'demo:loam',
            'minecraft:no_block',
            '#demo:no_tag',
            'grass_block',
          ],
          loot_table: 'minecraft:gameplay/sniffer_digging',
        }),
      ),
      element('msm:block', 'demo:loam', { format: 1 }),
    ]);
    expect(only(problems, 'entities.dig-block-unknown')).toEqual([
      ['demo:a', 'warning', '/components/msm:ai_goals/goals/0/dig_blocks/3'],
      ['demo:a', 'warning', '/components/msm:ai_goals/goals/0/dig_blocks/4'],
    ]);
  });

  it('entities.collect-without-owner: neither an owner nor note blocks', async () => {
    const problems = await validate([
      mob('demo:a', goals({ type: 'collect_items', note_blocks: false })),
      mob('demo:b', goals({ type: 'collect_items' })),
      mob(
        'demo:c',
        {
          'msm:tameable': { items: ['minecraft:cookie'] },
          ...goals({ type: 'collect_items', note_blocks: false }),
        },
        { base: 'animal' },
      ),
    ]);
    expect(only(problems, 'entities.collect-without-owner')).toEqual([
      ['demo:a', 'info', '/components/msm:ai_goals/goals/0'],
    ]);
  });

  it('blockReferenceTest accepts anything when the index has no blocks, never an empty id', () => {
    const known = blockReferenceTest([], createRegistryIndex({ vanilla: {} }));
    expect(known('minecraft:anything')).toBe(true);
    expect(known('#minecraft:anything')).toBe(true);
    expect(known('')).toBe(false);
    expect(known('#')).toBe(false);
  });
});
