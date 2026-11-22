/**
 * The villager validators of ADR 0098 (`validators-villagers.ts`): one positive and one negative
 * case per code, on every built-in target where the target's facts matter.
 */
import type { Element, Json, Problem, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  ENTITIES_PROBLEM_CODES,
  ENTITIES_VILLAGER_PROBLEM_CODES,
  entitiesVillagerValidators,
  VEHICLE_PROBLEM_CODES,
} from '../src/index';
import { element, indexesFor } from './support';

const FIRST = builtInTargets[0] as TargetBundle;

async function validate(elements: Element[], bundle: TargetBundle = FIRST): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  return (
    await Promise.all(
      entitiesVillagerValidators.map((validator) =>
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

const trader = (id: ResourceLocation, sets: string[], extra: Record<string, Json> = {}) =>
  mob(id, { 'msm:trader': { trade_sets: sets.map((trade_set) => ({ trade_set })) } }, extra);

const profession = (id: ResourceLocation, data: Record<string, Json>) =>
  element('msm:villager_profession', id, data);

const block = (id: ResourceLocation) => element('msm:block', id, { format: 1 });

describe('villager validators', () => {
  it('lists fourteen codes, apart from the entity and vehicle codes, and is contributed last', () => {
    expect(ENTITIES_VILLAGER_PROBLEM_CODES).toEqual([
      'entities.trade-set-unknown',
      'entities.trade-set-villager-only',
      'entities.trader-monster',
      'entities.job-site-taken',
      'entities.job-site-unknown',
      'entities.shoulder-too-wide',
      'entities.shoulder-needs-tameable',
      'entities.storage-rows',
      'entities.work-site-unknown',
      'entities.work-site-without-restock',
      'entities.gift-without-item',
      'entities.villager-type-taken',
      'entities.villager-type-biome-shared',
      'entities.villager-type-texture-missing',
    ]);
    for (const code of ENTITIES_VILLAGER_PROBLEM_CODES) {
      expect(ENTITIES_PROBLEM_CODES as readonly string[]).not.toContain(code);
      expect(VEHICLE_PROBLEM_CODES as readonly string[]).not.toContain(code);
    }
    expect(plugin.contributes.validators?.slice(-6)).toEqual([...entitiesVillagerValidators]);
  });

  it('reports nothing for an empty project', async () => {
    expect(await validate([])).toEqual([]);
  });

  describe('entities.trade-set-unknown', () => {
    it('accepts vanilla sets, project sets and a profession default set', async () => {
      const problems = await validate([
        trader('demo:a', ['minecraft:mason/level_1', 'demo:own_set', 'demo:miner/level_3']),
        element('minecraft:trade_set', 'demo:own_set', { trades: '#demo:own', amount: 1 }),
        profession('demo:miner', { job_site: 'demo:drill' }),
        block('demo:drill'),
      ]);
      expect(only(problems, 'entities.trade-set-unknown')).toEqual([]);
    });

    it('reports a trader level and a profession entry naming no set', async () => {
      const problems = await validate([
        trader('demo:a', ['minecraft:mason/level_1', 'demo:nowhere']),
        profession('demo:smith', {
          job_site: 'demo:anvil',
          trade_sets: [
            'minecraft:armorer/level_1',
            'demo:missing',
            'minecraft:armorer/level_3',
            'minecraft:armorer/level_4',
            'minecraft:armorer/level_5',
          ],
        }),
        block('demo:anvil'),
        // A profession with its own sets creates no defaults.
        trader('demo:b', ['demo:smith/level_1']),
      ]);
      expect(only(problems, 'entities.trade-set-unknown')).toEqual([
        ['demo:a', 'error', '/components/msm:trader/trade_sets/1/trade_set'],
        ['demo:b', 'error', '/components/msm:trader/trade_sets/0/trade_set'],
        ['demo:smith', 'error', '/trade_sets/1'],
      ]);
    });

    it('falls back on the registry index for a target without trade set facts', async () => {
      const { entities: _entities, ...noFacts } = FIRST.target;
      const registry = createRegistryIndex({ vanilla: { trade_set: ['mason/level_1'] } });
      const problems = (
        await Promise.all(
          entitiesVillagerValidators.map((validator) =>
            validator.validate({
              elements: [trader('demo:a', ['minecraft:mason/level_1', 'minecraft:mason/level_9'])],
              target: noFacts,
              registry,
            }),
          ),
        )
      ).flat();
      expect(only(problems, 'entities.trade-set-unknown')).toEqual([
        ['demo:a', 'error', '/components/msm:trader/trade_sets/1/trade_set'],
      ]);
      expect(only(problems, 'entities.trade-set-villager-only')).toEqual([]);
    });
  });

  describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'entities.trade-set-villager-only on %s',
    (_id, bundle) => {
      const facts = bundle.target.entities?.vanillaTradeSets ?? {};
      const villagerOnly = Object.keys(facts).filter((id) => facts[id]?.villagerOnly);
      const plain = Object.keys(facts).filter((id) => !facts[id]?.villagerOnly);

      it('has villager-only and plain sets in the facts', () => {
        expect(villagerOnly).toContain('minecraft:cartographer/level_2');
        expect(plain).toContain('minecraft:wandering_trader/common');
      });

      it('warns about a vanilla set only villagers fully offer, not about others', async () => {
        const problems = await validate(
          [
            trader('demo:a', [
              'minecraft:wandering_trader/common',
              'minecraft:cartographer/level_2',
            ]),
            // A project set with the vanilla name replaces it.
            trader('demo:b', ['minecraft:fisherman/level_5']),
            element('minecraft:trade_set', 'minecraft:fisherman/level_5', {
              trades: '#minecraft:fisherman/level_5',
              amount: 1,
            }),
          ],
          bundle,
        );
        expect(only(problems, 'entities.trade-set-villager-only')).toEqual([
          ['demo:a', 'warning', '/components/msm:trader/trade_sets/1/trade_set'],
        ]);
      });
    },
  );

  describe('entities.trader-monster', () => {
    it('informs about a monster trader only', async () => {
      const problems = await validate([
        trader('demo:a', ['minecraft:mason/level_1'], { base: 'monster' }),
        trader('demo:b', ['minecraft:mason/level_1'], { base: 'animal' }),
        trader('demo:c', ['minecraft:mason/level_1']),
        mob('demo:d', {}, { base: 'monster' }),
      ]);
      expect(only(problems, 'entities.trader-monster')).toEqual([['demo:a', 'info', '/base']]);
    });
  });

  describe('entities.unknown-event on on_trade', () => {
    it('reports an undeclared on_trade event and accepts a declared one', async () => {
      const withEvent = (id: ResourceLocation, events: Record<string, Json>) =>
        mob(
          id,
          {
            'msm:trader': {
              trade_sets: [{ trade_set: 'minecraft:mason/level_1' }],
              on_trade: 'demo:traded',
            },
          },
          { events },
        );
      const problems = await validate([
        withEvent('demo:a', {}),
        withEvent('demo:b', { 'demo:traded': { actions: [] } }),
      ]);
      expect(only(problems, 'entities.unknown-event')).toEqual([
        ['demo:a', 'error', '/components/msm:trader/on_trade'],
      ]);
    });
  });

  describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'job sites on %s',
    (_id, bundle) => {
      it('refuses a vanilla block with a point of interest and a block two jobs share', async () => {
        const problems = await validate(
          [
            profession('demo:a', { job_site: 'minecraft:lectern' }),
            profession('demo:b', { job_site: 'minecraft:red_bed' }),
            profession('demo:c', { job_site: 'demo:drill' }),
            profession('demo:d', { job_site: 'demo:drill' }),
            profession('demo:e', { job_site: 'demo:bench' }),
            block('demo:drill'),
            block('demo:bench'),
          ],
          bundle,
        );
        expect(only(problems, 'entities.job-site-taken')).toEqual([
          ['demo:a', 'error', '/job_site'],
          ['demo:b', 'error', '/job_site'],
          ['demo:d', 'error', '/job_site'],
        ]);
        expect(only(problems, 'entities.job-site-unknown')).toEqual([]);
      });

      it('asks for a project block', async () => {
        const problems = await validate(
          [
            profession('demo:a', { job_site: 'demo:nowhere' }),
            profession('demo:b', { job_site: '' }),
            // A vanilla block without a point of interest is not a project block either.
            profession('demo:c', { job_site: 'minecraft:crafting_table' }),
            profession('demo:d', { job_site: 'demo:drill' }),
            block('demo:drill'),
          ],
          bundle,
        );
        expect(only(problems, 'entities.job-site-unknown')).toEqual([
          ['demo:a', 'error', '/job_site'],
          ['demo:b', 'error', '/job_site'],
          ['demo:c', 'error', '/job_site'],
        ]);
        expect(only(problems, 'entities.job-site-taken')).toEqual([]);
      });
    },
  );

  describe('shoulder pets', () => {
    const tameable = { 'msm:tameable': { items: ['minecraft:apple'] } };
    const shoulder = { 'msm:shoulder_riding': {} };

    it('entities.shoulder-too-wide: only above 0.7 blocks', async () => {
      const problems = await validate([
        mob(
          'demo:a',
          { ...tameable, ...shoulder },
          { base: 'animal', size: { width: 0.71, height: 0.5 } },
        ),
        mob(
          'demo:b',
          { ...tameable, ...shoulder },
          { base: 'animal', size: { width: 0.7, height: 0.5 } },
        ),
        mob('demo:c', { ...tameable }, { base: 'animal', size: { width: 2, height: 2 } }),
      ]);
      expect(only(problems, 'entities.shoulder-too-wide')).toEqual([
        ['demo:a', 'error', '/size/width'],
      ]);
    });

    it('entities.shoulder-needs-tameable: needs msm:tameable and the animal base', async () => {
      const problems = await validate([
        mob('demo:a', { ...shoulder }, { base: 'animal' }),
        mob('demo:b', { ...tameable, ...shoulder }, { base: 'mob' }),
        mob('demo:c', { ...tameable, ...shoulder }),
        mob('demo:d', { ...tameable, ...shoulder }, { base: 'animal' }),
      ]);
      expect(only(problems, 'entities.shoulder-needs-tameable')).toEqual([
        ['demo:a', 'error', '/components/msm:shoulder_riding'],
        ['demo:b', 'error', '/components/msm:shoulder_riding'],
        ['demo:c', 'error', '/components/msm:shoulder_riding'],
      ]);
    });
  });

  describe('entities.storage-rows', () => {
    it('informs when one chest gives more than three rows', async () => {
      const problems = await validate([
        mob('demo:a', { 'msm:storage': { rows: 4, needs_chest: true } }),
        mob('demo:b', { 'msm:storage': { rows: 3, needs_chest: true } }),
        mob('demo:c', { 'msm:storage': { needs_chest: true } }),
        mob('demo:d', { 'msm:storage': { rows: 6 } }),
      ]);
      expect(only(problems, 'entities.storage-rows')).toEqual([
        ['demo:a', 'info', '/components/msm:storage/rows'],
      ]);
    });
  });

  describe('work sites and gifts (ADR 0107 D1, D3)', () => {
    const withTrader = (id: ResourceLocation, fields: Record<string, Json>) =>
      mob(id, { 'msm:trader': { trade_sets: [], ...fields } });

    it('entities.work-site-unknown: accepts vanilla and project blocks and tags', async () => {
      const problems = await validate([
        withTrader('demo:a', { work_site: 'minecraft:barrel' }),
        withTrader('demo:b', { work_site: '#minecraft:logs' }),
        withTrader('demo:c', { work_site: 'demo:stall' }),
        block('demo:stall'),
        withTrader('demo:d', { work_site: 'demo:nowhere' }),
        withTrader('demo:e', { work_site: '' }),
        withTrader('demo:f', { work_site: '#demo:no_tag' }),
        withTrader('demo:g', { work_site: '#demo:stalls' }),
        element('minecraft:tag/block', 'demo:stalls', { values: ['demo:stall'] }),
        withTrader('demo:h', {}),
      ]);
      expect(only(problems, 'entities.work-site-unknown')).toEqual([
        ['demo:d', 'error', '/components/msm:trader/work_site'],
        ['demo:e', 'error', '/components/msm:trader/work_site'],
        ['demo:f', 'error', '/components/msm:trader/work_site'],
      ]);
    });

    it('entities.work-site-without-restock: warns unless restock is twice a day', async () => {
      const problems = await validate([
        withTrader('demo:a', { work_site: 'minecraft:barrel', restock: 'never' }),
        withTrader('demo:b', { work_site: 'minecraft:barrel', restock: 'twice_a_day' }),
        withTrader('demo:c', { work_site: 'minecraft:barrel' }),
        withTrader('demo:d', { restock: 'never' }),
      ]);
      expect(only(problems, 'entities.work-site-without-restock')).toEqual([
        ['demo:a', 'warning', '/components/msm:trader/work_site'],
      ]);
    });

    it('entities.gift-without-item: informs about a gift value with nothing to give', async () => {
      const problems = await validate([
        withTrader('demo:a', { reputation: { gift: 10 } }),
        withTrader('demo:b', { reputation: { gift: 10, gift_item: 'minecraft:emerald' } }),
        withTrader('demo:c', { reputation: {} }),
      ]);
      expect(only(problems, 'entities.gift-without-item')).toEqual([
        ['demo:a', 'info', '/components/msm:trader/reputation/gift'],
      ]);
    });
  });

  describe('villager types (ADR 0107 D5)', () => {
    const type = (id: ResourceLocation, biomes: string[], villager?: string) =>
      element('msm:villager_type', id, {
        format: 1,
        biomes,
        ...(villager === undefined ? {} : { textures: { villager } }),
      });

    describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
      'entities.villager-type-taken on %s',
      (_id, bundle) => {
        it('refuses a vanilla id only', async () => {
          expect(bundle.target.entities?.villagerTypes).toContain('plains');
          const problems = await validate(
            [
              type('minecraft:plains', ['minecraft:plains'], 'example:entity/ruby_golem'),
              type('minecraft:moor', ['minecraft:swamp'], 'example:entity/ruby_golem'),
              type('demo:plains', ['minecraft:meadow'], 'example:entity/ruby_golem'),
            ],
            bundle,
          );
          expect(only(problems, 'entities.villager-type-taken')).toEqual([
            ['minecraft:plains', 'error', undefined],
          ]);
        });
      },
    );

    it('entities.villager-type-biome-shared: warns on the later type by id', async () => {
      const problems = await validate([
        type('demo:b', ['minecraft:desert', '#minecraft:is_jungle'], 'example:entity/ruby_golem'),
        type('demo:a', ['minecraft:desert', 'minecraft:desert'], 'example:entity/ruby_golem'),
        type('demo:c', ['minecraft:meadow'], 'example:entity/ruby_golem'),
      ]);
      expect(only(problems, 'entities.villager-type-biome-shared')).toEqual([
        ['demo:b', 'warning', '/biomes/0'],
      ]);
    });

    it('entities.villager-type-texture-missing: no picture, or one with no PNG', async () => {
      const problems = await validate([
        type('demo:a', ['minecraft:desert']),
        type('demo:b', ['minecraft:meadow'], 'demo:entity/villager/type/b'),
        type('demo:c', ['minecraft:taiga'], 'example:entity/ruby_golem'),
      ]);
      expect(only(problems, 'entities.villager-type-texture-missing')).toEqual([
        ['demo:a', 'warning', '/textures'],
        ['demo:b', 'warning', '/textures/villager'],
      ]);
    });
  });
});
