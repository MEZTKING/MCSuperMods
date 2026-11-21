/**
 * The registry view and vanilla pack safety of batch 2's kinds (B480, ADR 0098 D2, ADR 0099
 * D1; B476, B477 and B478 follow-ups): a fluid counts its liquid block, its bucket and, on a
 * two-fluid target, its `flowing_` id; a profession counts its point of interest type and,
 * without `trade_sets`, the default trade sets and their villager trade tags; the vanilla data
 * pack export treats them as mod-only (`fluidProfessionIdsOf`).
 */
import { createMemoryFileSystem, type Element, type Project } from '@msm/core';
import { fluidProfessionIdsOf, MOD_ONLY_REFERENCE } from '@msm/exporters';
import type { Json, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { withExtraIds } from '../src/renderer/src/session/project-session';
import { dataRegistryIds, projectRegistryIds } from '../src/renderer/src/session/schema-context';
import { newSession } from './session-fixture';

const TWO = builtInTargets.find(
  (entry) => entry.target.blocks?.fluidModel === 'two_fluids',
)?.target;
const ONE = builtInTargets.find((entry) => entry.target.blocks?.fluidModel === 'one_fluid')?.target;

const element = (id: string, kind: string, data: Json): Element =>
  ({ formatVersion: 1, id, kind, data, meta: {} }) as unknown as Element;
const project = (...elements: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements, assets: [] }],
});

const OIL = element('demo:oil', 'msm:fluid', { format: 1, behaves_like: 'water' });
const SMITH = element('demo:smith', 'msm:villager_profession', {
  format: 1,
  job_site: 'demo:anvil_block',
});

describe('registry view of fluids and professions', () => {
  it('counts the liquid block, the bucket and the flowing id by target', () => {
    if (TWO === undefined || ONE === undefined) throw new Error('Both fluid models expected.');
    const two = dataRegistryIds(project(OIL), undefined, TWO);
    expect(two.fluid).toEqual(['demo:flowing_oil', 'demo:oil']);
    expect(two.block).toEqual(['demo:oil']);
    expect(two.item).toEqual(['demo:oil_bucket']);
    expect(dataRegistryIds(project(OIL), undefined, ONE).fluid).toEqual(['demo:oil']);
    // Without a target, no flowing id.
    expect(dataRegistryIds(project(OIL)).fluid).toEqual(['demo:oil']);
    const all = projectRegistryIds(project(OIL), undefined, TWO);
    expect(all.item).toEqual(['demo:oil_bucket']);
    // The two models lowering writes (B481's finding: else `schema.unknown-id` twice).
    expect(all.model).toEqual(['demo:block/oil', 'demo:item/oil_bucket']);
  });

  it("counts a profession's point of interest type and its default trade sets and tags", () => {
    const ids = dataRegistryIds(project(SMITH));
    const levels = [1, 2, 3, 4, 5].map((n) => `demo:smith/level_${n}`);
    expect(ids.villager_profession).toEqual(['demo:smith']);
    expect(ids.point_of_interest_type).toEqual(['demo:smith']);
    expect(ids.trade_set).toEqual(levels);
    expect(ids['tag/villager_trade']).toEqual(levels);
    // With its own trade sets, lowering writes none.
    const named = element('demo:smith', 'msm:villager_profession', {
      format: 1,
      job_site: 'demo:anvil_block',
      trade_sets: ['minecraft:mason/level_1'],
    });
    const own = dataRegistryIds(project(named));
    expect(own.trade_set).toBeUndefined();
    expect(own.point_of_interest_type).toEqual(['demo:smith']);
  });

  it('merges the exporter’s ids into the registry ids', () => {
    if (TWO === undefined) throw new Error('No two-fluid target.');
    const merged = withExtraIds(
      { block: ['demo:anvil_block'], item: ['demo:oil_bucket'] },
      fluidProfessionIdsOf([OIL, SMITH] as { id: ResourceLocation; kind: string }[], true),
    );
    expect(merged.block).toEqual(['demo:anvil_block', 'demo:oil']);
    expect(merged.item).toEqual(['demo:oil_bucket']);
    expect(merged.fluid).toEqual(['demo:flowing_oil', 'demo:oil']);
    expect(merged.point_of_interest_type).toEqual(['demo:smith']);
  });
});

describe('ProjectSession: vanilla data pack with a fluid', () => {
  it('leaves out a recipe that makes the fluid’s bucket', async () => {
    const fixture = newSession(createMemoryFileSystem());
    await fixture.session.newProject();
    fixture.session.addElement({ id: 'demo:oil' as ResourceLocation, kind: 'msm:fluid' });
    fixture.session.addElement({
      id: 'demo:oil_bucket_recipe' as ResourceLocation,
      kind: 'minecraft:recipe',
      data: {
        type: 'minecraft:crafting_shapeless',
        category: 'misc',
        ingredients: ['minecraft:bucket', 'minecraft:coal'],
        result: { id: 'demo:oil_bucket', count: 1 },
      },
    });
    await fixture.session.flushValidation();
    const result = await fixture.session.exportPack('data', 'zip');
    expect(
      result.problems
        .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
        .map((problem) => problem.elementId),
    ).toEqual(['demo:oil_bucket_recipe']);
    expect(result.files).not.toContain('data/demo/recipe/oil_bucket_recipe.json');
  }, 60_000);
});
