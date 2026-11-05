/**
 * The lowering driver: turns every element of a project into output files.
 *
 * @packageDocumentation
 */

import type { Element, OutputFile, Problem, Project, TargetFacts } from '@msm/plugin-api';
import { ProblemCodes } from '../problems/codes';
import type { ElementKindRegistry } from '../registry/element-kind-registry';
import { type MergeEntry, mergeOutputFiles } from './merge-outputs';

/** The result of {@link lowerProject}. */
export interface LowerResult {
  /** Every output file, sorted by layer and then by path. */
  files: OutputFile[];
  /** Lowering problems, in element order. */
  problems: Problem[];
}

/** Compares two strings by UTF-16 code units. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whether a value is a Promise or another thenable. */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** The elements of a project in lowering order: namespace order, then id order. */
export function elementsInLoweringOrder(project: Project): Element[] {
  const namespaces = [...project.namespaces].sort((a, b) => compare(a.name, b.name));
  return namespaces.flatMap((namespace) =>
    [...namespace.elements].sort((a, b) => compare(a.id, b.id)),
  );
}

/** The problem reported for an element whose kind is not registered. */
export function unknownKindProblem(element: Element): Problem {
  return {
    severity: 'error',
    code: ProblemCodes.loweringUnknownKind,
    elementId: element.id,
    message: `${element.id}: kind "${element.kind}" is not registered, so the element cannot be exported.`,
  };
}

/** The problem reported for a `lower` call that threw or rejected. */
export function loweringFailedProblem(element: Element, error: unknown): Problem {
  return {
    severity: 'error',
    code: ProblemCodes.loweringFailed,
    elementId: element.id,
    message: `${element.id}: lowering failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/** Merges the lowered entries and appends the merge problems to `problems`. */
export function finishLowering(entries: MergeEntry[], problems: Problem[]): LowerResult {
  const merged = mergeOutputFiles(entries);
  problems.push(...merged.problems);
  return { files: merged.files, problems };
}

/**
 * Lowers every element of a project with its kind's `lower` function, synchronously.
 *
 * Elements are lowered in namespace order and then id order. An element whose kind is not
 * registered yields a `lowering.unknown-kind` error; a `lower` call that throws yields a
 * `lowering.failed` error with the thrown message and contributes no files; a `lower` call
 * that returns a Promise (a sandboxed plugin, ADR 0036) yields a
 * `lowering.async-not-supported` error naming the element and contributes no files: use
 * {@link lowerProjectAsync} for projects that may hold such kinds. Files that share
 * a layer and path go through {@link mergeOutputFiles}: they merge when all declare the same
 * `merge` mode (a disagreeing key is a `lowering.merge-conflict` error); otherwise the first
 * is kept and a `lowering.conflict` error names both elements. Files are returned as produced
 * (including `schema`) or merged, sorted by layer then path; merge problems follow the
 * per-element problems.
 *
 * @param project - The project to lower.
 * @param registry - The kind registry.
 * @param target - The Minecraft target to lower for.
 * @returns The output files and the problems found.
 */
export function lowerProject(
  project: Project,
  registry: ElementKindRegistry,
  target: TargetFacts,
): LowerResult {
  const problems: Problem[] = [];
  const entries: MergeEntry[] = [];
  for (const element of elementsInLoweringOrder(project)) {
    for (const file of lowerElement(element, registry, target, problems)) {
      entries.push({ file, source: element.id, elementId: element.id });
    }
  }
  return finishLowering(entries, problems);
}

function lowerElement(
  element: Element,
  registry: ElementKindRegistry,
  target: TargetFacts,
  problems: Problem[],
): OutputFile[] {
  const kind = registry.get(element.kind);
  if (kind === undefined) {
    problems.push(unknownKindProblem(element));
    return [];
  }
  try {
    const result = kind.lower(element, target);
    if (isPromiseLike(result)) {
      // Keep an unobserved rejection from surfacing as an unhandled rejection.
      Promise.resolve(result).catch(() => undefined);
      problems.push({
        severity: 'error',
        code: ProblemCodes.loweringAsyncNotSupported,
        elementId: element.id,
        message: `${element.id}: kind "${element.kind}" lowers asynchronously, which synchronous lowering does not support; the element was not exported.`,
      });
      return [];
    }
    return result;
  } catch (error) {
    problems.push(loweringFailedProblem(element, error));
    return [];
  }
}
