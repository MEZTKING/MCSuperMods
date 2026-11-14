/**
 * `msm:potion` lowering (ADR 0063 D3): the file count of every variant and bottle combination,
 * every emitted recipe validated as `resource:recipe` on every target with the project potion
 * ids in the registry view, the definitions of the longer and stronger versions, and the
 * potion validators.
 */
import type { Json, JsonObject, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  blocksItemsValidators,
  lowerPotion,
  POTION_NEEDS_JAR_CODE,
  potionBrewingSteps,
  potionNeedsJarProblem,
} from '../src/index';
import { blockingProblems, element, indexesFor } from './support';

const firstTarget = (builtInTargets[0] as TargetBundle).target;

const EFFECTS = [{ id: 'minecraft:haste', duration_ticks: 3600 }];

interface Combination {
  brewing: boolean;
  long: boolean;
  strong: boolean;
  splash: boolean;
  lingering: boolean;
}

const combinations: Combination[] = [];
for (let bits = 0; bits < 32; bits += 1) {
  combinations.push({
    brewing: (bits & 1) !== 0,
    long: (bits & 2) !== 0,
    strong: (bits & 4) !== 0,
    splash: (bits & 8) !== 0,
    lingering: (bits & 16) !== 0,
  });
}

function dataOf(combination: Combination, displayName = true): JsonObject {
  return {
    format: 1,
    ...(displayName ? { display_name: 'Sample' } : {}),
    effects: EFFECTS,
    ...(combination.brewing ? { brewing: { reagent: 'minecraft:honeycomb' } } : {}),
    ...(combination.long ? { long: { duration_ticks: 9600 } } : {}),
    ...(combination.strong ? { strong: { amplifier: 1, duration_ticks: 1800 } } : {}),
    splash: combination.splash,
    lingering: combination.lingering,
  };
}

/** Recipes the brief expects: per bottle the brew and upgrades, per entry the conversions. */
function expectedRecipes(c: Combination): number {
  const bottles = 1 + (c.splash ? 1 : 0) + (c.lingering ? 1 : 0);
  const entries = 1 + (c.long ? 1 : 0) + (c.strong ? 1 : 0);
  const steps = (c.brewing ? 1 : 0) + (c.long ? 1 : 0) + (c.strong ? 1 : 0);
  return steps * bottles + entries * ((c.splash ? 1 : 0) + (c.lingering ? 1 : 0));
}

const label = (c: Combination): string =>
  Object.entries(c)
    .filter(([, on]) => on)
    .map(([key]) => key)
    .join('+') || 'none';

const byLayer = (files: OutputFile[], layer: OutputFile['layer']) =>
  files.filter((file) => file.layer === layer);

describe('msm:potion lowering', () => {
  it.each(combinations.map((c) => [label(c), c] as const))('%s', (_label, combination) => {
    const files = lowerPotion(
      element('msm:potion', 'demo:sample', dataOf(combination)),
      firstTarget,
    );
    const entries = 1 + (combination.long ? 1 : 0) + (combination.strong ? 1 : 0);
    expect(byLayer(files, 'msm')).toHaveLength(entries);
    const recipes = byLayer(files, 'datapack');
    expect(recipes).toHaveLength(expectedRecipes(combination));
    expect(recipes.length).toBeLessThanOrEqual(15);
    expect(new Set(recipes.map((file) => file.path)).size).toBe(recipes.length);
    expect(byLayer(files, 'resourcepack')).toHaveLength(1);
    expect(files).toHaveLength(entries + recipes.length + 1);
  });

  it('writes 15 recipes with every option on and no lang file without a display name', () => {
    const all = { brewing: true, long: true, strong: true, splash: true, lingering: true };
    const files = lowerPotion(
      element('msm:potion', 'demo:sample', dataOf(all, false)),
      firstTarget,
    );
    expect(byLayer(files, 'datapack')).toHaveLength(15);
    expect(byLayer(files, 'resourcepack')).toHaveLength(0);
  });

  it('makes the lingering version from the splash one, or from the potion without splash', () => {
    const steps = (splash: boolean) =>
      potionBrewingSteps(
        element('msm:potion', 'demo:sample', {
          format: 1,
          effects: EFFECTS,
          splash,
          lingering: true,
        }),
      ).filter((step) => step.source === 'lingering');
    expect(steps(true).map((step) => step.inputBottle)).toEqual(['splash_potion']);
    expect(steps(false).map((step) => step.inputBottle)).toEqual(['potion']);
  });

  it('writes the longer and stronger definitions with the shared name', () => {
    const files = lowerPotion(
      element('msm:potion', 'demo:magic/sample', {
        format: 1,
        effects: [
          { id: 'minecraft:haste', duration_ticks: 3600 },
          { id: 'minecraft:speed', duration_ticks: 1200, amplifier: 0, show_icon: false },
        ],
        long: { duration_ticks: 9600 },
        strong: { amplifier: 1, duration_ticks: 1800 },
      }),
      firstTarget,
    );
    const definitions = byLayer(files, 'msm');
    expect(definitions.map((file) => file.path)).toEqual([
      'msm/demo/potion/magic/sample.json',
      'msm/demo/potion/long_magic/sample.json',
      'msm/demo/potion/strong_magic/sample.json',
    ]);
    expect(definitions.map((file) => (file.contents as JsonObject).name)).toEqual([
      'demo.magic.sample',
      'demo.magic.sample',
      'demo.magic.sample',
    ]);
    expect(((definitions[1] as OutputFile).contents as JsonObject).effects).toEqual([
      { id: 'minecraft:haste', duration_ticks: 9600 },
      { id: 'minecraft:speed', duration_ticks: 9600, amplifier: 0, show_icon: false },
    ]);
    expect(((definitions[2] as OutputFile).contents as JsonObject).effects).toEqual([
      { id: 'minecraft:haste', duration_ticks: 1800, amplifier: 1 },
      { id: 'minecraft:speed', duration_ticks: 1800, amplifier: 1, show_icon: false },
    ]);
    for (const file of definitions) {
      const keys = Object.keys(file.contents as JsonObject).sort();
      expect(keys).toEqual(['effects', 'format', 'name']);
    }
  });

  it('writes the four name keys of vanilla potions', () => {
    const files = lowerPotion(
      element('msm:potion', 'demo:sample', { format: 1, display_name: 'Haste', effects: EFFECTS }),
      firstTarget,
    );
    const lang = byLayer(files, 'resourcepack')[0];
    expect(lang?.merge).toBe('object');
    expect(lang?.contents).toEqual({
      'item.minecraft.potion.effect.demo.sample': 'Potion of Haste',
      'item.minecraft.splash_potion.effect.demo.sample': 'Splash Potion of Haste',
      'item.minecraft.lingering_potion.effect.demo.sample': 'Lingering Potion of Haste',
      'item.minecraft.tipped_arrow.effect.demo.sample': 'Arrow of Haste',
    });
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'msm:potion recipes on %s',
  (_targetId, bundle) => {
    it('validates every recipe of every combination as resource:recipe', async () => {
      const indexes = await indexesFor(bundle);
      for (const combination of combinations) {
        const files = lowerPotion(
          element('msm:potion', 'demo:sample', dataOf(combination)),
          bundle.target,
        );
        for (const file of files) {
          expect(file.schema, file.path).toBeDefined();
          expect(
            blockingProblems(indexes, file.schema as string, file.contents as Json),
            `${label(combination)} ${file.path}`,
          ).toEqual([]);
        }
      }
    });

    it('accepts a tag as the ingredient and rejects an unknown potion', async () => {
      const indexes = await indexesFor(bundle);
      const files = lowerPotion(
        element('msm:potion', 'demo:sample', {
          format: 1,
          effects: EFFECTS,
          brewing: { reagent: '#minecraft:small_flowers' },
        }),
        bundle.target,
      );
      const recipe = files.find((file) => file.path.endsWith('/brewing/potion_sample.json'));
      expect(recipe?.path).toBe(
        `data/demo/${bundle.target.folders.data.recipe}/brewing/potion_sample.json`,
      );
      expect(blockingProblems(indexes, 'resource:recipe', recipe?.contents as Json)).toEqual([]);
      const unknown = lowerPotion(
        element('msm:potion', 'demo:unknown', { format: 1, effects: EFFECTS }),
        bundle.target,
      ).find((file) => file.layer === 'datapack');
      expect(
        blockingProblems(indexes, 'resource:recipe', unknown?.contents as Json).map(
          (problem) => problem.code,
        ),
      ).toContain('schema.unknown-id');
    });
  },
);

describe('potion validators', () => {
  const run = async (
    elements: ReturnType<typeof element>[],
    bundle = builtInTargets[0] as TargetBundle,
  ) => {
    const indexes = await indexesFor(bundle);
    const problems = await Promise.all(
      blocksItemsValidators.map((validator) =>
        validator.validate({ elements, target: bundle.target, registry: indexes.registries }),
      ),
    );
    return problems.flat();
  };
  const potion = (id: string, data: Json) => element('msm:potion', id as ResourceLocation, data);

  it('reports an effect that is neither vanilla nor in the project', async () => {
    const problems = await run([
      potion('demo:a', {
        format: 1,
        effects: [
          { id: 'minecraft:haste', duration_ticks: 20 },
          { id: 'demo:nope', duration_ticks: 20 },
          { id: 'demo:own', duration_ticks: 20 },
        ],
      }),
      element('msm:effect', 'demo:own', { format: 1, category: 'neutral', color: 0 }),
    ]);
    expect(problems).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'blocks-items.potion-effect-missing',
        elementId: 'demo:a',
        path: '/effects/1/id',
      }),
    ]);
  });

  it('reports two potions brewed from the same base and ingredient', async () => {
    const problems = await run([
      potion('demo:a', { format: 1, effects: EFFECTS, brewing: { reagent: 'honeycomb' } }),
      potion('demo:b', {
        format: 1,
        effects: EFFECTS,
        brewing: { base: 'minecraft:awkward', reagent: 'minecraft:honeycomb' },
      }),
      potion('demo:c', { format: 1, effects: EFFECTS, brewing: { reagent: 'minecraft:sugar' } }),
    ]);
    expect(problems).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'blocks-items.potion-duplicate-brewing',
        elementId: 'demo:b',
        path: '/brewing/reagent',
      }),
    ]);
  });

  it('reports a longer and a stronger version with one ingredient', async () => {
    const problems = await run([
      potion('demo:a', {
        format: 1,
        effects: EFFECTS,
        long: { duration_ticks: 100, reagent: 'minecraft:redstone' },
        strong: { amplifier: 1, duration_ticks: 50, reagent: 'minecraft:redstone' },
      }),
    ]);
    expect(problems.map((problem) => [problem.code, problem.path])).toEqual([
      ['blocks-items.potion-duplicate-brewing', '/strong'],
    ]);
  });

  it('reports a version id that another potion has', async () => {
    const problems = await run([
      potion('demo:a', { format: 1, effects: EFFECTS, long: { duration_ticks: 100 } }),
      potion('demo:long_a', { format: 1, effects: EFFECTS }),
      potion('demo:strong_a', { format: 1, effects: EFFECTS }),
    ]);
    expect(problems.map((problem) => [problem.code, problem.elementId, problem.path])).toEqual([
      ['blocks-items.potion-id-collision', 'demo:a', '/long'],
    ]);
  });

  it('owns the vanilla pack warning', () => {
    expect(potionNeedsJarProblem()).toEqual(
      expect.objectContaining({ severity: 'warning', code: POTION_NEEDS_JAR_CODE }),
    );
    expect(potionNeedsJarProblem('demo:a').elementId).toBe('demo:a');
  });
});
