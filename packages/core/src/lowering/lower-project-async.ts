/**
 * The asynchronous lowering driver (ADR 0036): awaits every kind's `lower`, so that kinds of
 * sandboxed plugins, whose functions resolve through a worker, lower like built-ins.
 *
 * @packageDocumentation
 */

import type { Element, OutputFile, Problem, Project, TargetFacts } from '@msm/plugin-api';
import type { ElementKindRegistry } from '../registry/element-kind-registry';
import { expandProject } from './expand-project';
import {
  elementsInLoweringOrder,
  finishLowering,
  type LowerProjectOptions,
  type LowerResult,
  loweringFailedProblem,
  unknownKindProblem,
  withExpansion,
} from './lower-project';
import type { MergeEntry } from './merge-outputs';

/**
 * Lowers every element of a project with its kind's `lower` function, awaiting each result.
 *
 * Same result shape and problem codes as {@link lowerProject}: elements in namespace order
 * and then id order, `lowering.unknown-kind` for an unregistered kind, `lowering.failed` for
 * a `lower` call that throws or whose Promise rejects (the element contributes no files),
 * and the same merge of files that share a layer and path. Elements are lowered one after
 * another, so output order and problem order do not depend on timing. With `options.plugins`
 * the project is expanded first with `expandProject` (expanders are awaited), as in
 * `lowerProject`.
 *
 * @param project - The project to lower; never changed.
 * @param registry - The kind registry.
 * @param target - The Minecraft target to lower for.
 * @param options - The plugins whose project expanders run first.
 * @returns The output files and the problems found.
 */
export async function lowerProjectAsync(
  project: Project,
  registry: ElementKindRegistry,
  target: TargetFacts,
  options: LowerProjectOptions = {},
): Promise<LowerResult> {
  if (options.plugins !== undefined) {
    const expansion = await expandProject(project, options.plugins, target);
    return withExpansion(await lowerProjectAsync(expansion.project, registry, target), expansion);
  }
  const problems: Problem[] = [];
  const entries: MergeEntry[] = [];
  for (const element of elementsInLoweringOrder(project)) {
    for (const file of await lowerElement(element, registry, target, problems)) {
      entries.push({ file, source: element.id, elementId: element.id });
    }
  }
  return finishLowering(entries, problems);
}

async function lowerElement(
  element: Element,
  registry: ElementKindRegistry,
  target: TargetFacts,
  problems: Problem[],
): Promise<OutputFile[]> {
  const kind = registry.get(element.kind);
  if (kind === undefined) {
    problems.push(unknownKindProblem(element));
    return [];
  }
  try {
    return await kind.lower(element, target);
  } catch (error) {
    problems.push(loweringFailedProblem(element, error));
    return [];
  }
}
