/** B565 throwaway: lowering a library example in memory, as a clip would. */
import { createEmptyProject, ElementKindRegistry, lowerProjectAsync, registerPlugin } from '@msm/core';
import type { ContentBundle, ExampleProject, OutputFile, Target } from '@msm/plugin-api';
import { libraryExamples } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { bundleAssetReader, bundlePreviewProject } from '../../src/renderer/src/preview/bundle-source';
import { withTypedBlockModels } from '../../src/renderer/src/components/creator/set-preview';
import { toSimFiles } from '../../src/renderer/src/tryit/session-source';

export const TARGET_IDS = ['mc-26.3', 'mc-26.4'] as const;
export const NS = 'showcase';

export function targetOf(id: string): Target {
  const found = builtInTargets.find((bundle) => bundle.target.id === id);
  if (found === undefined) throw new Error(`no target ${id}`);
  return found.target;
}

let registry: ElementKindRegistry | null = null;
export function theRegistry(): ElementKindRegistry {
  if (registry === null) {
    registry = new ElementKindRegistry();
    for (const plugin of builtInPlugins) registerPlugin(registry, plugin);
  }
  return registry;
}

export function exampleById(id: string): ExampleProject {
  const found = libraryExamples.find((example) => example.id === id);
  if (found === undefined) throw new Error(`no example ${id}`);
  return found;
}

export interface LoweredExample {
  bundle: ContentBundle;
  files: OutputFile[];
  sim: Map<string, string | Uint8Array>;
  problems: { severity: string; message: string; code?: string }[];
  ms: { build: number; lower: number; sim: number; total: number };
  simBytes: number;
  readAsset: (namespace: string, path: string) => Promise<Uint8Array | null>;
}

export async function lowerExample(
  id: string,
  target: Target,
  options: { typedModels?: boolean } = {},
): Promise<LoweredExample> {
  const t0 = performance.now();
  const built = await exampleById(id).build({ namespace: NS, projectName: NS, target, values: {} });
  const bundle = options.typedModels === true ? withTypedBlockModels(built) : built;
  const project = bundlePreviewProject(createEmptyProject(NS), bundle);
  const t1 = performance.now();
  const lowered = await lowerProjectAsync(project, theRegistry(), target, {
    plugins: [...builtInPlugins],
  });
  const t2 = performance.now();
  const sim = toSimFiles(lowered.files);
  const t3 = performance.now();
  let simBytes = 0;
  for (const [path, value] of sim) simBytes += path.length + (typeof value === 'string' ? value.length : value.byteLength);
  return {
    bundle,
    files: lowered.files,
    sim,
    problems: lowered.problems as LoweredExample['problems'],
    ms: { build: t1 - t0, lower: t2 - t1, sim: t3 - t2, total: t3 - t0 },
    simBytes,
    readAsset: bundleAssetReader(bundle, async () => null),
  };
}

export const SHOWCASE_IDS = [
  'example_msm_wood_set',
  'example_msm_tameable_pet',
  'example_msm_crop',
  'example_msm_ore_crusher',
  'example_msm_vehicle',
  'example_msm_sky_portal',
  'example_msm_firefly_jar',
  'example_msm_roadside_merchant',
  'example_msm_fluid',
  'example_msm_rules',
] as const;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};
