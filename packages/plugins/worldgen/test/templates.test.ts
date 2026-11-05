import { readdir, readFile } from 'node:fs/promises';
import type {
  ElementTemplate,
  Json,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { worldgenKinds, worldgenTemplates } from '../src/index';
import { blockingProblems, indexesFor, NOISE_SETTINGS_SCHEMA, schemaHasField } from './support';

/** The first target's facts without its hooks: a template context is plain data. */
const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

/** The template ids, in picker order (ADR 0022 D9). */
const IDS = [
  'biome_temperate_forest',
  'biome_desert',
  'feature_ore_vein',
  'feature_tree',
  'feature_flower_patch',
  'feature_single_block',
  'placed_feature_ore',
  'placed_feature_tree',
  'placed_feature_patch',
  'dimension_multi_noise',
  'dimension_single_biome',
  'world_preset',
  'noise_settings',
  'density_function',
  'noise',
  'carver',
  'flat_level_generator_preset',
  'multi_noise_biome_source_parameter_list',
  'block_state_provider',
  'material_condition',
  'material_rule',
];

const CATEGORIES = new Set(['Biomes', 'Features', 'Dimensions', 'Worldgen (advanced)']);

const kindOf = (template: ElementTemplate) => {
  const kind = worldgenKinds.find((entry) => entry.id === template.kind);
  if (kind === undefined) throw new Error(`no kind ${template.kind}`);
  return kind;
};

/** The id the host gives a new element: default namespace and name, then the prefix. */
function elementId(template: ElementTemplate): ResourceLocation {
  const namespace = template.defaultNamespace ?? 'demo';
  const name = template.defaultName ?? 'sample';
  const prefix = template.prefix ?? '';
  return `${namespace}:${name.startsWith(prefix) ? name : `${prefix}${name}`}`;
}

/**
 * The context the host builds (`app/src/renderer/src/studios/templates.ts`); `kindDefault` is
 * the kind's `defaultDataFor(target)` when it has one (ADR 0036 D8; built-ins return it
 * synchronously).
 */
function contextFor(
  template: ElementTemplate,
  target: TargetFacts = FIRST_TARGET,
): TemplateContext {
  const id = elementId(template);
  const colon = id.indexOf(':');
  const kind = kindOf(template);
  const kindDefault = kind.defaultDataFor
    ? (kind.defaultDataFor(target) as Json)
    : kind.defaultData;
  return {
    id,
    namespace: id.slice(0, colon),
    path: id.slice(colon + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: kindDefault === undefined ? undefined : structuredClone(kindDefault),
    target,
  };
}

const firstBundle = builtInTargets[0] as TargetBundle;

describe('worldgen templates', () => {
  it('has the ids in picker order, unique, and contributed by the plugin', () => {
    expect(worldgenTemplates.map((template) => template.id)).toEqual(IDS);
    expect(new Set(IDS).size).toBe(IDS.length);
    expect(plugin.contributes.elementTemplates?.map((template) => template.id)).toEqual(IDS);
  });

  it('creates only kinds this plugin registers, and covers every kind', () => {
    const kinds = new Set(worldgenKinds.map((kind) => kind.id));
    for (const template of worldgenTemplates)
      expect(kinds.has(template.kind), template.id).toBe(true);
    expect(new Set(worldgenTemplates.map((template) => template.kind))).toEqual(kinds);
  });

  it('has a title, description and one of the four categories for every template', () => {
    for (const template of worldgenTemplates) {
      expect(template.title, template.id).not.toBe('');
      expect(template.description, template.id).not.toBe('');
      expect(CATEGORIES.has(template.category), template.id).toBe(true);
    }
  });

  it('returns fresh data on every call and never mutates the context', async () => {
    for (const template of worldgenTemplates) {
      const context = contextFor(template);
      const before = structuredClone(context);
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      if (typeof first === 'object' && first !== null) expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('uses only vanilla ids or the new element id', () => {
    for (const template of worldgenTemplates) {
      const context = { ...contextFor(template), id: 'zz:own' as const, projectNamespace: 'zz' };
      const text = JSON.stringify(template.data(context)).replaceAll('"zz:own"', '');
      expect(text, template.id).not.toMatch(/"(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/);
    }
  });

  it('derives references from the new element id where it says so', () => {
    const context = {
      ...contextFor(worldgenTemplates[0] as ElementTemplate),
      id: 'zz:ruby' as const,
    };
    for (const id of ['placed_feature_ore', 'placed_feature_tree', 'placed_feature_patch']) {
      const template = worldgenTemplates.find((entry) => entry.id === id) as ElementTemplate;
      expect((template.data(context) as { feature: string }).feature, id).toBe('zz:ruby');
    }
    const single = worldgenTemplates.find((entry) => entry.id === 'dimension_single_biome');
    expect(JSON.stringify(single?.data(context))).toContain('"biome":"zz:ruby"');
  });

  it('places biome features at the steps the target names', () => {
    const steps = firstBundle.target.worldgen.featureSteps;
    const at = (name: string): number => steps.indexOf(name);
    for (const id of ['biome_temperate_forest', 'biome_desert']) {
      const template = worldgenTemplates.find((entry) => entry.id === id) as ElementTemplate;
      const { features } = template.data(contextFor(template)) as { features: string[][] };
      expect(features.length, id).toBeLessThanOrEqual(steps.length);
      const stepOf = (feature: string): string =>
        steps[features.findIndex((list) => list.includes(feature))] ?? 'none';
      expect(stepOf('minecraft:ore_iron_upper'), id).toBe(steps[at('underground_ores')]);
      expect(stepOf('minecraft:lake_lava_surface'), id).toBe(steps[at('lakes')]);
      expect(stepOf('minecraft:monster_room'), id).toBe(steps[at('underground_structures')]);
      expect(stepOf('minecraft:spring_water'), id).toBe(steps[at('fluid_springs')]);
      expect(stepOf('minecraft:flower_default'), id).toBe(steps[at('vegetal_decoration')]);
      expect(stepOf('minecraft:freeze_top_layer'), id).toBe(steps[at('top_layer_modification')]);
    }
  });

  it('keeps src free of @msm/targets and @msm/core imports and of version literals', async () => {
    const root = new URL('../src/', import.meta.url);
    const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(new URL(file, root), 'utf8');
      expect(text, file).not.toMatch(/from '@msm\/(targets|target-|core)/);
      expect(text, file).not.toMatch(/\b26\.\d/);
      expect(text, file).not.toMatch(/configured_(feature|carver)/);
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'worldgen templates for %s',
  (_targetId, bundle: TargetBundle) => {
    it('reports an unknown id (the check is live)', async () => {
      const indexes = await indexesFor(bundle);
      const problems = blockingProblems(indexes, 'resource:worldgen/placed_feature', {
        feature: 'zz:missing',
        placement: [],
      });
      expect(problems.map((problem) => problem.code)).toContain('schema.unknown-id');
    });

    it('the target fact noiseSettingsDefaultBlock matches the vendored schema (ADR 0036 D8)', async () => {
      const indexes = await indexesFor(bundle);
      expect(bundle.target.worldgen.noiseSettingsDefaultBlock !== false).toBe(
        schemaHasField(indexes, NOISE_SETTINGS_SCHEMA, 'default_block'),
      );
    });

    it('noise settings default data and template carry default_block exactly where the schema has it', async () => {
      const indexes = await indexesFor(bundle);
      const hasField = schemaHasField(indexes, NOISE_SETTINGS_SCHEMA, 'default_block');
      const template = worldgenTemplates.find((entry) => entry.id === 'noise_settings');
      if (template === undefined) throw new Error('no noise_settings template');
      const kind = kindOf(template);
      if (kind.defaultDataFor === undefined) throw new Error('no defaultDataFor');
      const fromKind = await kind.defaultDataFor(bundle.target);
      const fromTemplate = await template.data(contextFor(template, bundle.target));
      for (const data of [fromKind, fromTemplate]) {
        expect(Object.hasOwn(data as object, 'default_block')).toBe(hasField);
        expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);
      }
      // `defaultData` keeps the shape with the field; it is not mutated by defaultDataFor.
      expect(kind.defaultData).toHaveProperty('default_block');
    });

    it.each(worldgenTemplates.map((template) => [template.id, template] as const))(
      '%s validates and lowers cleanly',
      async (_id, template) => {
        const indexes = await indexesFor(bundle);
        const kind = kindOf(template);
        const context = contextFor(template, bundle.target);
        const data = await template.data(context);
        expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);
        const files = await kind.lower(
          {
            formatVersion: 1,
            id: context.id,
            kind: kind.id,
            data,
            meta: { createdAt: '2026-01-01T00:00:00.000Z' },
          },
          bundle.target,
        );
        expect(files).toHaveLength(1);
        const [file] = files;
        if (file === undefined) throw new Error('no output');
        expect(file.layer).toBe('datapack');
        expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
      },
    );
  },
);
