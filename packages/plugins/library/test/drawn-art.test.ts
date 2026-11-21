/**
 * No library asset is drawn by the placeholder fallback (ADR 0092 D10 (a), D14; B497): every
 * starter and example on every built-in target, with its defaults and with each choice of each
 * choice question in turn, is built while the placeholder painters of `assets/png.ts` are
 * watched. Only paintings may call one (`paintingPng`, plan limit A2), and `artPng` reaching
 * `placeholderPng` for a stub recipe counts as a fallback too, since it calls the watched
 * function. Byte checks against the placeholders live in `content.test.ts`.
 */
import type { ContentBundle, ExampleProject, Json, ProjectStarter } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The placeholder painters a library asset could come from, and how often each was called. */
const calls = vi.hoisted(() => new Map<string, number>());

vi.mock('../src/assets/png', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/assets/png')>();
  const watch = <F extends (...args: never[]) => unknown>(name: string, painter: F): F =>
    ((...args: Parameters<F>) => {
      calls.set(name, (calls.get(name) ?? 0) + 1);
      return painter(...args);
    }) as F;
  return {
    ...original,
    placeholderPng: watch('placeholderPng', original.placeholderPng),
    placeholderPixels: watch('placeholderPixels', original.placeholderPixels),
    placeholderSkinPng: watch('placeholderSkinPng', original.placeholderSkinPng),
    placeholderSkinPixels: watch('placeholderSkinPixels', original.placeholderSkinPixels),
    mobSkinPng: watch('mobSkinPng', original.mobSkinPng),
    boxSkinPng: watch('boxSkinPng', original.boxSkinPng),
    boxSkinPixels: watch('boxSkinPixels', original.boxSkinPixels),
    armorLayerPng: watch('armorLayerPng', original.armorLayerPng),
    bodyArmorLayerPng: watch('bodyArmorLayerPng', original.bodyArmorLayerPng),
    // Allowed (plan limit A2); watched to show the watch reaches the library's own modules.
    paintingPng: watch('paintingPng', original.paintingPng),
  };
});

const { libraryExamples, libraryStarters } = await import('../src/index');

const entries: readonly (ProjectStarter | ExampleProject)[] = [
  ...libraryStarters,
  ...libraryExamples,
];

/** The defaults, then each other choice of each choice question on its own. */
function answerSets(entry: ProjectStarter | ExampleProject): Record<string, Json>[] {
  const sets: Record<string, Json>[] = [{}];
  const parameters = 'parameters' in entry ? (entry.parameters ?? []) : [];
  for (const parameter of parameters) {
    if (parameter.type !== 'choice') continue;
    for (const choice of parameter.choices) {
      if (choice.value !== parameter.default) sets.push({ [parameter.id]: choice.value });
    }
  }
  return sets;
}

describe.each(builtInTargets.map((entry) => [entry.target.id, entry.target] as const))(
  'drawn library pictures on %s',
  (_id, target) => {
    beforeEach(() => calls.clear());

    it('watches the painters the library modules call (the Painting flow paints)', async () => {
      const painting = libraryStarters.find((entry) => entry.id === 'painting');
      await painting?.build({ namespace: 'demo', projectName: 'Demo Project', target, values: {} });
      expect(calls.get('paintingPng')).toBe(1);
    });

    it.each(entries.map((entry) => [entry.id, entry] as const))(
      '%s draws every picture but paintings without a placeholder',
      async (_entryId, entry) => {
        for (const values of answerSets(entry)) {
          const bundle: ContentBundle = await entry.build({
            namespace: 'demo',
            projectName: 'Demo Project',
            target,
            values,
          });
          const painting = bundle.assets.some((asset) =>
            asset.path.startsWith('textures/painting/'),
          );
          if (calls.has('paintingPng')) expect(painting, JSON.stringify(values)).toBe(true);
          calls.delete('paintingPng');
          expect(Object.fromEntries(calls), JSON.stringify(values)).toEqual({});
        }
      },
    );
  },
);
