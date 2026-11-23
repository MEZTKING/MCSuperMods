/**
 * Vanilla parity 2, batch 2 (B478; ADR 0098 D2, D5, ADR 0099 D4): traders, professions and fluids
 * in the vanilla packs and the Java eject, built from hand-made lowered files.
 *
 * - fluid, bucket and profession ids are mod-only: a recipe using the bucket is left out;
 * - a trade set naming a project item is left out of the vanilla data pack (with its trade,
 *   and the level tag entry naming it becomes optional);
 * - the acquirable job site tag entry is written as `required: false`;
 * - the eject generates every batch 2 mob component (traders and shoulder pets since eject 2c)
 *   with no `export.not-in-eject`; professions and fluids are ejected since B537
 *   (`ModProfessions`, `ModFluids`).
 */
import type { Json, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createJavaProjectExporter,
  createMemorySink,
  ExportProblemCodes,
  fluidProfessionIdsOf,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  runExport,
  vanillaSafeDataFiles,
} from '../src/index';
import { fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';
import { defaultTarget } from './selected-target';

const folders = defaultTarget().target.folders.data;
const tagsFolder = folders.tags;

const json = (path: string, contents: Json): OutputFile => ({
  path,
  contents,
  layer: 'datapack',
});

const ids = fluidProfessionIdsOf(
  [
    { id: 'demo:smith', kind: 'msm:villager_profession' },
    { id: 'demo:honey', kind: 'msm:fluid' },
    { id: 'demo:ruby', kind: 'msm:block' },
  ],
  true,
);
const modOnly = modOnlyIdsOf({ ...ids, item: [...(ids.item ?? []), 'demo:ruby'] });

describe('fluidProfessionIdsOf', () => {
  it('lists fluid, flowing fluid, liquid block, bucket, profession and point of interest', () => {
    expect(ids).toEqual({
      block: ['demo:honey'],
      fluid: ['demo:flowing_honey', 'demo:honey'],
      item: ['demo:honey_bucket'],
      point_of_interest_type: ['demo:smith'],
      villager_profession: ['demo:smith'],
    });
  });

  it('has no flowing fluid on a one-fluid target', () => {
    expect(fluidProfessionIdsOf([{ id: 'demo:honey', kind: 'msm:fluid' }], false).fluid).toEqual([
      'demo:honey',
    ]);
  });

  it('is empty for a project without them', () => {
    expect(fluidProfessionIdsOf([{ id: 'demo:ruby', kind: 'msm:block' }], true)).toEqual({});
  });
});

describe('vanilla data pack with traders, professions and fluids', () => {
  it('leaves out a recipe using a project bucket', () => {
    const recipe = json(`data/demo/${folders.recipe}/pail.json`, {
      type: 'minecraft:crafting_shapeless',
      ingredients: ['demo:honey_bucket'],
      result: { id: 'minecraft:honey_bottle', count: 1 },
    });
    const result = vanillaSafeDataFiles([recipe], modOnly, folders);
    expect(result.files).toEqual([]);
    expect(result.problems.map((problem) => problem.code)).toEqual([MOD_ONLY_REFERENCE]);
  });

  it('leaves out a trade set naming a project item, with its trade, once per element', () => {
    const trade = json(`data/demo/${folders.villager_trade}/smith/ruby_for_emerald.json`, {
      gives: { id: 'demo:ruby', count: 1 },
      wants: { id: 'minecraft:emerald' },
    });
    const plain = json(`data/demo/${folders.villager_trade}/smith/plain.json`, {
      gives: { id: 'minecraft:iron_ingot', count: 1 },
      wants: { id: 'minecraft:emerald' },
    });
    const set1 = json(`data/demo/${folders.trade_set}/smith/level_1.json`, {
      trades: ['demo:smith/ruby_for_emerald'],
      amount: 1,
    });
    const set2 = json(`data/demo/${folders.trade_set}/smith/level_2.json`, {
      trades: ['demo:smith/plain'],
      amount: 1,
    });
    const tag1 = json(`data/demo/${tagsFolder}/trade_set/smith/level_1.json`, {
      values: ['demo:smith/level_1'],
    });
    const owners: Record<string, `${string}:${string}`> = {
      [trade.path]: 'demo:smith',
      [set1.path]: 'demo:smith',
    };
    const result = vanillaSafeDataFiles(
      [trade, plain, set1, set2, tag1],
      modOnly,
      folders,
      (path) => owners[path],
    );
    expect(result.files.map((file) => file.path)).toEqual([plain.path, set2.path, tag1.path]);
    // The trade set that names the left-out trade is left out too: one warning for the element.
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.elementId).toBe('demo:smith');
    expect(result.problems[0]?.code).toBe(MOD_ONLY_REFERENCE);
    // The level tag entry that named the left-out set is optional now.
    expect(result.files[2]?.contents).toEqual({
      values: [{ id: 'demo:smith/level_1', required: false }],
    });
  });

  it('writes the acquirable job site tag entry as required: false', () => {
    const tag = json(
      `data/minecraft/${tagsFolder}/point_of_interest_type/acquirable_job_site.json`,
      {
        values: ['demo:smith', 'minecraft:armorer'],
      },
    );
    const result = vanillaSafeDataFiles([tag], modOnly, folders);
    expect(result.files[0]?.contents).toEqual({
      values: [{ id: 'demo:smith', required: false }, 'minecraft:armorer'],
    });
    expect(result.problems).toEqual([]);
  });

  it('writes a fluid tag entry as required: false', () => {
    const tag = json(`data/minecraft/${tagsFolder}/fluid/water.json`, {
      values: ['demo:honey', 'demo:flowing_honey'],
    });
    const result = vanillaSafeDataFiles([tag], modOnly, folders);
    expect(result.files[0]?.contents).toEqual({
      values: [
        { id: 'demo:honey', required: false },
        { id: 'demo:flowing_honey', required: false },
      ],
    });
  });
});

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.loadJavaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('Java eject with batch 2 features (%s)', (_id, bundle) => {
  const component = (name: string): Json => ({
    'msm:animated_model': { model: 'd:m', texture: 'd:t' },
    [name]: {},
  });
  const mob = raw('demo:mob', {
    path: 'msm/demo/entity/merchant.json',
    layer: 'msm',
    json: {
      format: 1,
      category: 'creature',
      size: { width: 0.6, height: 1.8 },
      components: {
        ...(component('msm:trader') as Record<string, Json>),
        'msm:trader': { trade_sets: [{ trade_set: 'demo:merchant/level_1' }] },
        'msm:storage': { rows: 2 },
        'msm:shoulder_riding': {},
      },
    },
  });
  const plainMob = raw('demo:plain', {
    path: 'msm/demo/entity/plain.json',
    layer: 'msm',
    json: {
      format: 1,
      category: 'creature',
      size: { width: 1, height: 1 },
      components: { 'msm:animated_model': { model: 'd:m', texture: 'd:t' } },
    },
  });
  const profession = raw('demo:smith', {
    path: 'msm/demo/villager_profession/smith.json',
    layer: 'msm',
    json: { format: 1, job_site: 'demo:forge' },
  });
  const fluid = raw('demo:honey', {
    path: 'msm/demo/fluid/honey.json',
    layer: 'msm',
    json: { format: 1 },
  });

  it('ejects the mob, the profession and the fluid with no warning or error', async () => {
    const { schemaIndex, registries } = await indexesFor(bundle);
    const sink = createMemorySink();
    const report = await runExport({
      project: project([mob, plainMob, profession, fluid]),
      registry: testRegistry(),
      target: bundle.target,
      schemaIndex,
      registries,
      exporter: createJavaProjectExporter({ loadGradleWrapper: async () => undefined }),
      sink,
      readAsset: fakeAsset,
      meta,
    });
    expect(
      report.problems.filter((problem) => problem.code === ExportProblemCodes.notInEject),
    ).toEqual([]);
    const paths = [...sink.files().keys()];
    // A shoulder pet that is not a tameable animal never perches (the runtime warns in its log).
    expect(paths.some((path) => path.endsWith('/entity/MerchantEntity.java'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/entity/MobShoulder.java'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/ModProfessions.java'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/ModFluids.java'))).toBe(true);
    expect(
      report.problems.filter((problem) => problem.code === ExportProblemCodes.javaGenerationFailed),
    ).toEqual([]);
  });
});
