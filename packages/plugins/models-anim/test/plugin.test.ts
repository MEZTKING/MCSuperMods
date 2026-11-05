import { API_VERSION, type ElementKind, type Json, type Target } from '@msm/plugin-api';
import { createRegistryIndex, MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  animationPath,
  geoModelPath,
  lowerAnimation,
  lowerGeoModel,
  ModelsAnimLoweringError,
  modelsAnimKinds,
  modelsAnimTemplates,
  modelsAnimValidators,
  splitResourceLocation,
} from '../src/index';
import { blockingProblems, element, indexesFor } from './support';

const KIND_IDS = ['msm:geo_model', 'msm:animation'];
const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];
const firstTarget = (builtInTargets[0] as TargetBundle).target;

/** What `registerPlugin` in `@msm/core` checks (core is not a dependency of this package). */
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

describe('@msm/plugin-models-anim', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.models-anim');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(registrationProblems()).toEqual([]);
  });

  it('contributes the two kinds with their schemas, folders, registries and previews', () => {
    expect(kinds().map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(modelsAnimKinds.map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(
      kinds().map((kind) => [kind.schema, kind.folder, kind.registry, kind.previewKind]),
    ).toEqual([
      [MSM_SCHEMA_REFS.geoModel, 'geo_model', 'geo_model', 'geo_model'],
      [MSM_SCHEMA_REFS.animation, 'animation', 'animation', 'animation'],
    ]);
  });

  it('contributes its templates and the four validators', () => {
    expect(plugin.contributes.elementTemplates?.map((t) => t.id)).toEqual(
      modelsAnimTemplates.map((t) => t.id),
    );
    expect(plugin.contributes.validators?.map((v) => v.id)).toEqual([
      'msm.models-anim.cube-outside-texture',
      'msm.models-anim.bones',
      'msm.models-anim.animation-unknown-bone',
      'msm.models-anim.molang-unsupported',
    ]);
    expect(modelsAnimValidators).toHaveLength(4);
  });

  it('has the default data the brief asks for', () => {
    const [geo, animation] = modelsAnimKinds as [ElementKind, ElementKind];
    const geometry = (geo.defaultData as { 'minecraft:geometry': Json[] })['minecraft:geometry'];
    expect(geometry).toHaveLength(1);
    expect(geometry[0]).toMatchObject({
      description: { texture_width: 64, texture_height: 64 },
      bones: [{ name: 'body', cubes: [{ size: [16, 16, 16] }] }],
    });
    expect(geo.defaultData).toMatchObject({ format_version: '1.12.0' });
    expect(animation.defaultData).toMatchObject({
      format_version: '1.8.0',
      animations: { idle: { loop: true, animation_length: 2, bones: { body: {} } } },
    });
  });

  it('builds GeckoLib resource paths from the element id', () => {
    expect(geoModelPath('demo', 'entity/golem')).toBe(
      'assets/demo/geckolib/models/entity/golem.geo.json',
    );
    expect(animationPath('demo', 'entity/golem_animations')).toBe(
      'assets/demo/geckolib/animations/entity/golem_animations.animation.json',
    );
  });

  it('rejects unsafe ids and non-object data', () => {
    expect(() => splitResourceLocation('Bad:Id')).toThrow(ModelsAnimLoweringError);
    expect(() => splitResourceLocation('demo:a/../b')).toThrow(ModelsAnimLoweringError);
    expect(() => lowerGeoModel(element('msm:geo_model', 'demo:a', []), firstTarget)).toThrow(
      ModelsAnimLoweringError,
    );
    expect(() => lowerAnimation(element('msm:animation', 'demo:a', 'x'), firstTarget)).toThrow(
      ModelsAnimLoweringError,
    );
  });

  it('writes the data unchanged except a numeric format_version, without mutating it', () => {
    const data: Json = { format_version: 1.12, 'minecraft:geometry': [], extra: { a: 1 } };
    const [file] = lowerGeoModel(element('msm:geo_model', 'demo:x', data), firstTarget);
    expect(file?.contents).toEqual({
      format_version: '1.12',
      'minecraft:geometry': [],
      extra: { a: 1 },
    });
    expect((data as { format_version: number }).format_version).toBe(1.12);
    const [animation] = lowerAnimation(
      element('msm:animation', 'demo:x', { format_version: '1.8.0', animations: {} }),
      firstTarget,
    );
    expect(animation?.contents).toEqual({ format_version: '1.8.0', animations: {} });
  });

  it('lowers the same way for a target without GeckoLib facts', () => {
    const { geckolib: _geckolib, ...rest } = firstTarget;
    const noGeckolib: Target = rest;
    const sample = element('msm:geo_model', 'demo:x', { format_version: '1.12.0' });
    expect(lowerGeoModel(sample, noGeckolib)).toEqual(lowerGeoModel(sample, firstTarget));
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'default data for %s',
  (_targetId, bundle) => {
    it.each(KIND_IDS.map((id) => [id] as const))('%s validates and lowers', async (kindId) => {
      const kind = kinds().find((entry) => entry.id === kindId) as ElementKind;
      const indexes = await indexesFor(bundle);
      expect(blockingProblems(indexes, kind.schema, kind.defaultData as Json)).toEqual([]);
      const files = kind.lower(
        element(kind.id, 'demo:entity/sample', kind.defaultData as Json),
        bundle.target,
      );
      expect(files).toHaveLength(1);
      for (const file of files) {
        expect(file.layer).toBe('resourcepack');
        expect(
          blockingProblems(indexes, file.schema as string, file.contents as Json),
          file.path,
        ).toEqual([]);
      }
    });

    it('rejects data the schemas do not accept, so the checks above bite', async () => {
      const indexes = await indexesFor(bundle);
      expect(
        blockingProblems(indexes, MSM_SCHEMA_REFS.geoModel, { format_version: 1.12 }).length,
      ).toBeGreaterThan(0);
      expect(
        blockingProblems(indexes, MSM_SCHEMA_REFS.animation, {
          format_version: '1.8.0',
          animations: { a: { loop: 'sometimes' } },
        }).length,
      ).toBeGreaterThan(0);
    });

    it('passes the validators with its default data', () => {
      const elements = modelsAnimKinds.map((kind, index) =>
        element(kind.id, `demo:entity/sample_${index}`, kind.defaultData as Json),
      );
      expect(
        modelsAnimValidators.flatMap((validator) =>
          validator.validate({
            elements,
            target: bundle.target,
            registry: createRegistryIndex({ vanilla: {} }),
          }),
        ),
      ).toEqual([]);
    });
  },
);
