import { API_VERSION, type Element, type ElementKind, type Json } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  dataPath,
  lowerJsonData,
  splitResourceLocation,
  TIER_A_REGISTRIES,
  TIER_B_REGISTRIES,
  WorldgenLoweringError,
  worldgenKind,
  worldgenKinds,
  worldgenTemplates,
  worldgenValidators,
} from '../src/index';
import { blockingProblems, indexesFor } from './support';

/** The fourteen kinds of ADR 0022 D4, in order: tier A, then tier B. */
const KIND_IDS = [
  'minecraft:worldgen/biome',
  'minecraft:worldgen/feature',
  'minecraft:worldgen/placed_feature',
  'minecraft:dimension',
  'minecraft:worldgen/world_preset',
  'minecraft:worldgen/noise_settings',
  'minecraft:worldgen/density_function',
  'minecraft:worldgen/noise',
  'minecraft:worldgen/carver',
  'minecraft:worldgen/flat_level_generator_preset',
  'minecraft:worldgen/multi_noise_biome_source_parameter_list',
  'minecraft:worldgen/block_state_provider',
  'minecraft:worldgen/material_condition',
  'minecraft:worldgen/material_rule',
];

const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];

const element = (kind: string, id: `${string}:${string}`, data: Json): Element => ({
  formatVersion: 1,
  id,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const firstTarget = (builtInTargets[0] as TargetBundle).target;

/**
 * What `registerPlugin` in `@msm/core` checks (the package is not a dependency of this one):
 * the API range admits the host version, and kind ids and kind-folders are unique.
 */
function registrationProblems(): string[] {
  const problems: string[] = [];
  const [major, minor] = API_VERSION.split('.');
  if (plugin.apiVersion !== `^${major}.${minor}.0`) problems.push(`range ${plugin.apiVersion}`);
  const ids = new Set<string>();
  const folders = new Set<string>();
  for (const kind of kinds()) {
    if (ids.has(kind.id)) problems.push(`duplicate id ${kind.id}`);
    if (folders.has(kind.folder)) problems.push(`duplicate folder ${kind.folder}`);
    ids.add(kind.id);
    folders.add(kind.folder);
  }
  return problems;
}

describe('@msm/plugin-worldgen', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.worldgen');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes the fourteen documented kinds in order', () => {
    expect(kinds().map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(worldgenKinds.map((kind) => kind.id)).toEqual(KIND_IDS);
    expect([...TIER_A_REGISTRIES, ...TIER_B_REGISTRIES].map((r) => `minecraft:${r}`)).toEqual(
      KIND_IDS,
    );
  });

  it('gives every kind its registry schema and folder, and no registry override', () => {
    for (const kind of kinds()) {
      const registry = kind.id.slice('minecraft:'.length);
      expect(kind.schema, kind.id).toBe(`resource:${registry}`);
      expect(kind.folder, kind.id).toBe(registry);
      expect(kind.registry, kind.id).toBeUndefined();
      expect(kind.defaultData, kind.id).toBeDefined();
      const climate = registry === 'dimension' || registry === 'worldgen/world_preset';
      expect(kind.previewKind, kind.id).toBe(climate ? 'climate_map' : undefined);
    }
  });

  it('passes the host registration checks', () => {
    expect(registrationProblems()).toEqual([]);
  });

  it('contributes its templates and the five validators', () => {
    expect(plugin.contributes.elementTemplates?.map((t) => t.id)).toEqual(
      worldgenTemplates.map((t) => t.id),
    );
    expect(plugin.contributes.validators?.map((v) => v.id)).toEqual([
      'msm.worldgen.feature-order',
      'msm.worldgen.biome-reachability',
      'msm.worldgen.preset-selectable',
      'msm.worldgen.preset-overworld',
      'msm.worldgen.placed-feature-usage',
    ]);
    expect(worldgenValidators).toHaveLength(5);
  });

  it('returns a fresh copy of the default data for every kind', () => {
    const a = worldgenKind('worldgen/biome');
    const b = worldgenKind('worldgen/biome');
    expect(a.defaultData).toEqual(b.defaultData);
    expect(a.defaultData).not.toBe(b.defaultData);
  });

  it('rejects unsafe ids and subfolders', () => {
    expect(() => splitResourceLocation('Bad:Id')).toThrow(WorldgenLoweringError);
    expect(() => splitResourceLocation('demo:a/../b')).toThrow(WorldgenLoweringError);
    expect(() => dataPath(firstTarget, 'worldgen', 'demo', 'x', '../biome')).toThrow(
      WorldgenLoweringError,
    );
    expect(() =>
      lowerJsonData(
        element('minecraft:worldgen/biome', 'demo:a/./b', {}),
        firstTarget,
        'worldgen',
        'resource:worldgen/biome',
        'biome',
      ),
    ).toThrow(WorldgenLoweringError);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'default data for %s',
  (_targetId, bundle) => {
    it.each(KIND_IDS.map((id) => [id] as const))(
      '%s lowers to its folder and validates',
      async (kindId) => {
        const kind = kinds().find((entry) => entry.id === kindId) as ElementKind;
        const files = await kind.lower(
          element(kind.id, 'demo:nested/sample', kind.defaultData as Json),
          bundle.target,
        );
        expect(files).toHaveLength(1);
        const [file] = files;
        if (file === undefined) throw new Error('no output');
        const registry = kind.id.slice('minecraft:'.length);
        const { data } = bundle.target.folders;
        const folder = registry.startsWith('worldgen/')
          ? `${data.worldgen}/${registry.slice('worldgen/'.length)}`
          : data.dimension;
        expect(file.path).toBe(`data/demo/${folder}/nested/sample.json`);
        expect(file.layer).toBe('datapack');
        expect(file.schema).toBe(kind.schema);
        expect(file.contents).toEqual(kind.defaultData);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, kind.schema, kind.defaultData as Json)).toEqual([]);
        expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
      },
    );
  },
);
