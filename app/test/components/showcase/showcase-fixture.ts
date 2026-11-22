/** Shared set-up of the showcase tests: the built-in registry, the library's examples, targets. */

import { ElementKindRegistry, registerPlugin } from '@msm/core';
import type { ExampleProject, Target } from '@msm/plugin-api';
import { libraryExamples } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { type ExampleFiles, exampleFiles } from '../../../src/renderer/src/showcase/example-files';

/** Both targets, as the showcase plays on each. */
export const TARGETS: readonly Target[] = builtInTargets.map((bundle) => bundle.target);

let registry: ElementKindRegistry | null = null;

/** The kind registry of the built-in plugins. */
export function theRegistry(): ElementKindRegistry {
  if (registry === null) {
    registry = new ElementKindRegistry();
    for (const plugin of builtInPlugins) registerPlugin(registry, plugin);
  }
  return registry;
}

/** A library example by id. */
export function exampleById(id: string): ExampleProject {
  const found = libraryExamples.find((example) => example.id === id);
  if (found === undefined) throw new Error(`no example ${id}`);
  return found;
}

/** The example's showcase files for `target`, through the session-wide cache. */
export function filesOf(id: string, target: Target): Promise<ExampleFiles> {
  return exampleFiles(exampleById(id), target, {
    registry: theRegistry(),
    plugins: builtInPlugins,
  });
}
