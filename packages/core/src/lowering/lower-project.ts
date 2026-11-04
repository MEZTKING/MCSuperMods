/**
 * The lowering driver: turns every element of a project into output files.
 *
 * @packageDocumentation
 */

import type { Element, OutputFile, Problem, Project, Target } from '@msm/plugin-api';
import { ProblemCodes } from '../problems/codes';
import type { ElementKindRegistry } from '../registry/element-kind-registry';

/** The result of {@link lowerProject}. */
export interface LowerResult {
  /** Every output file, sorted by layer and then by path. */
  files: OutputFile[];
  /** Lowering problems, in element order. */
  problems: Problem[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Lowers every element of a project with its kind's `lower` function.
 *
 * Elements are lowered in namespace order and then id order. An element whose kind is not
 * registered yields a `lowering.unknown-kind` error; a `lower` call that throws yields a
 * `lowering.failed` error with the thrown message and contributes no files. When two files
 * share a layer and path, the first is kept and a `lowering.conflict` error names both
 * elements. Files are returned as produced (including `schema`), sorted by layer then path.
 *
 * @param project - The project to lower.
 * @param registry - The kind registry.
 * @param target - The Minecraft target to lower for.
 * @returns The output files and the problems found.
 */
export function lowerProject(
  project: Project,
  registry: ElementKindRegistry,
  target: Target,
): LowerResult {
  const problems: Problem[] = [];
  const owners = new Map<string, { file: OutputFile; elementId: string }>();

  const namespaces = [...project.namespaces].sort((a, b) => compare(a.name, b.name));
  for (const namespace of namespaces) {
    const elements = [...namespace.elements].sort((a, b) => compare(a.id, b.id));
    for (const element of elements) {
      for (const file of lowerElement(element, registry, target, problems)) {
        const key = `${file.layer}\u0000${file.path}`;
        const owner = owners.get(key);
        if (owner !== undefined) {
          problems.push({
            severity: 'error',
            code: ProblemCodes.loweringConflict,
            elementId: element.id,
            file: file.path,
            message: `${element.id} and ${owner.elementId} both produce ${file.layer} file ${file.path}; only the output of ${owner.elementId} was kept.`,
          });
          continue;
        }
        owners.set(key, { file, elementId: element.id });
      }
    }
  }

  const files = [...owners.values()]
    .map((owner) => owner.file)
    .sort((a, b) => compare(a.layer, b.layer) || compare(a.path, b.path));
  return { files, problems };
}

function lowerElement(
  element: Element,
  registry: ElementKindRegistry,
  target: Target,
  problems: Problem[],
): OutputFile[] {
  const kind = registry.get(element.kind);
  if (kind === undefined) {
    problems.push({
      severity: 'error',
      code: ProblemCodes.loweringUnknownKind,
      elementId: element.id,
      message: `${element.id}: kind "${element.kind}" is not registered, so the element cannot be exported.`,
    });
    return [];
  }
  try {
    return kind.lower(element, target);
  } catch (error) {
    problems.push({
      severity: 'error',
      code: ProblemCodes.loweringFailed,
      elementId: element.id,
      message: `${element.id}: lowering failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return [];
  }
}
