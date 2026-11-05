/**
 * Project validators (ADR 0022, `@msm/plugin-api` 0.5.0) as the session runs them: collected
 * from the registered plugins, re-run when an element of one of their kinds changes, and
 * guarded so that one failing validator becomes a warning instead of breaking validation.
 * Their error problems block exports like schema errors do.
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import type {
  MaybePromise,
  OutputLayer,
  Plugin,
  ProjectValidator,
  Target,
  ValidationRegistry,
} from '@msm/plugin-api';

/** Problem codes the validator runner reports itself. */
export const ValidatorProblemCodes = {
  /** A validator threw; its checks did not run. */
  failed: 'validator.failed',
} as const;

/** A validator with the plugin that contributed it. */
export interface RegisteredValidator {
  pluginId: string;
  validator: ProjectValidator;
}

/**
 * Every validator of `plugins`, in plugin order. The first validator with a given id wins.
 *
 * @param plugins - The registered plugins.
 */
export function collectValidators(plugins: readonly Plugin[]): RegisteredValidator[] {
  const seen = new Set<string>();
  const out: RegisteredValidator[] = [];
  for (const plugin of plugins) {
    for (const validator of plugin.contributes.validators ?? []) {
      if (seen.has(validator.id)) continue;
      seen.add(validator.id);
      out.push({ pluginId: plugin.id, validator });
    }
  }
  return out;
}

/** Every element of a project, namespace by namespace, in stored order. */
export function projectElements(project: Project | null): Element[] {
  return project?.namespaces.flatMap((namespace) => namespace.elements) ?? [];
}

/**
 * The kinds of the elements that differ between two project states: added, removed or
 * changed (by identity) elements, by kind; a changed kind counts for both its old and its new
 * kind.
 */
export function changedKinds(before: Project | null, after: Project | null): Set<string> {
  const old = new Map(projectElements(before).map((element) => [element.id, element]));
  const kinds = new Set<string>();
  for (const element of projectElements(after)) {
    const previous = old.get(element.id);
    old.delete(element.id);
    if (previous === element) continue;
    kinds.add(element.kind);
    if (previous !== undefined) kinds.add(previous.kind);
  }
  for (const element of old.values()) kinds.add(element.kind);
  return kinds;
}

/**
 * The validators whose `kinds` intersect `kinds`.
 *
 * @param validators - The registered validators.
 * @param kinds - The changed kinds.
 */
export function validatorsFor(
  validators: readonly RegisteredValidator[],
  kinds: ReadonlySet<string>,
): RegisteredValidator[] {
  return validators.filter((entry) => entry.validator.kinds.some((kind) => kinds.has(kind)));
}

/**
 * Runs one validator over the project, awaiting a validator that resolves later (a
 * third-party plugin's, through its worker; ADR 0035 D3). A throw or rejection becomes one
 * `validator.failed` warning.
 *
 * @param entry - The validator.
 * @param input - The project's elements, the target and the registry ids.
 */
export async function runValidator(
  entry: RegisteredValidator,
  input: { elements: readonly Element[]; target: Target; registry: ValidationRegistry },
): Promise<Problem[]> {
  try {
    const problems = await entry.validator.validate(input);
    return problems.map((problem) => ({ ...problem }));
  } catch (error) {
    return [
      {
        severity: 'warning',
        code: ValidatorProblemCodes.failed,
        message: `The check ${entry.validator.id} (${entry.pluginId}) failed and was skipped: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
}

/**
 * The validator errors that block an export of `layers`: errors without an element, and
 * errors of elements that lower to at least one of `layers` (or fail to lower, or are gone).
 *
 * @param problems - The current validator problems.
 * @param project - The project being exported.
 * @param lower - Lowers one element for the export's target; may throw.
 * @param layers - The layers the exporter packages.
 */
export async function blockingValidatorErrors(
  problems: readonly Problem[],
  project: Project,
  lower: (element: Element) => MaybePromise<readonly { layer: OutputLayer }[]>,
  layers: readonly OutputLayer[],
): Promise<Problem[]> {
  const elements = new Map(projectElements(project).map((element) => [element.id, element]));
  const wanted = new Set(layers);
  const blocking: Problem[] = [];
  for (const problem of problems) {
    if (problem.severity !== 'error') continue;
    const element = problem.elementId === undefined ? undefined : elements.get(problem.elementId);
    if (element === undefined) {
      blocking.push(problem);
      continue;
    }
    try {
      if ((await lower(element)).some((file) => wanted.has(file.layer))) blocking.push(problem);
    } catch {
      blocking.push(problem);
    }
  }
  return blocking;
}
