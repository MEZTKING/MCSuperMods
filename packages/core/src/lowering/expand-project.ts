/**
 * Project expansion (ADR 0082 D9): runs every plugin's `projectExpanders` over the saved
 * elements and applies their patches to a structural copy of the project, so that lowering,
 * validation, export and eject see the patched data while the saved project never changes.
 *
 * @packageDocumentation
 */

import type {
  Element,
  ElementPatch,
  ElementPatchOrigin,
  ExpansionResult,
  Json,
  Plugin,
  Problem,
  Project,
  ProjectExpander,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';
import { toJsonPointer } from '../commands/json-pointer';
import { ProblemCodes } from '../problems/codes';
import { elementsInLoweringOrder, isPromiseLike } from './lower-project';

/** The result of {@link expandProject} and {@link expandProjectSync}. */
export interface ExpandProjectResult {
  /**
   * A structural copy of the project with every applied patch: new project, namespace and
   * element arrays; each patched element is a new object with its own deep-copied `data`;
   * unpatched elements and assets are the saved objects, shared (read only).
   */
  project: Project;
  /**
   * Where each applied patch came from, keyed by {@link expansionOriginKey} of the patched
   * element id and the RFC 6901 pointer of the patch path. Read it with
   * {@link originForProblem} or {@link mapProblemsToOrigins}.
   */
  origins: Map<string, ElementPatchOrigin>;
  /**
   * The expanders' own problems, in plugin and expander order, with the expansion problems
   * (`core.expansion-conflict`, `core.expansion-failed`, `core.expansion-invalid-patch`) at
   * the place they arose.
   */
  problems: Problem[];
}

/**
 * The key of {@link ExpandProjectResult.origins}: the patched element's id and the pointer of
 * the patch path, joined by `#` (which neither a resource location nor the start of a pointer
 * holds).
 *
 * @param elementId - The patched element's id.
 * @param pointer - The RFC 6901 pointer into its `data`; `''` for the whole of `data`.
 */
export function expansionOriginKey(elementId: string, pointer: string): string {
  return `${elementId}#${pointer}`;
}

/**
 * Every project expander of the plugins, in plugin order and then contribution order: the order
 * in which their patches are applied.
 *
 * @param plugins - The registered plugins, in registration order.
 */
export function projectExpanders(plugins: readonly Plugin[]): ProjectExpander[] {
  return plugins.flatMap((plugin) => plugin.contributes.projectExpanders ?? []);
}

/**
 * Expands a project: runs every plugin's `projectExpanders` and applies their patches.
 *
 * Each expander receives every element of the saved project in lowering order (namespace order,
 * then id order) with no other expander's patches applied, and the target. Patches are applied
 * in plugin order, then expander order, then the order each expander returns them, to deep
 * copies of the patched elements' `data` (the saved project and the expanders' patch values are
 * never changed). Path rules ({@link ElementPatch.path}): string segments are object keys and
 * number segments array indexes (0 to the array length); missing parent objects are created;
 * an empty path replaces the whole of `data` (the value must then be an object). A later patch
 * on an element and path an earlier patch already set is a `core.expansion-conflict` error on
 * the later patch's origin and is not applied (the first value is kept). A patch for an unknown
 * element, with a malformed path or one that runs through a value that is not an object or
 * array, is a `core.expansion-invalid-patch` error on its origin. An expander that throws,
 * rejects or returns a malformed result is a `core.expansion-failed` error on each element of
 * its {@link ProjectExpander.kinds} (or one problem without an element when there are none);
 * its patches are ignored.
 *
 * @param project - The saved project; not changed.
 * @param plugins - The registered plugins, in registration order.
 * @param target - The target being lowered for.
 * @returns The expanded copy, the origin of every applied patch and the problems.
 */
export async function expandProject(
  project: Project,
  plugins: readonly Plugin[],
  target: TargetFacts,
): Promise<ExpandProjectResult> {
  const state = new ExpansionState(project);
  for (const expander of projectExpanders(plugins)) {
    let result: unknown;
    try {
      result = await expander.expand({ elements: state.elements, target });
    } catch (error) {
      state.failed(expander, error);
      continue;
    }
    state.apply(expander, result);
  }
  return state.finish();
}

/**
 * The synchronous variant of {@link expandProject}, for the synchronous `lowerProject`: same
 * rules and problems, except that an expander returning a Promise (a sandboxed plugin, ADR
 * 0036) is a `core.expansion-failed` error and its patches are ignored; use
 * {@link expandProject} for projects with such plugins.
 *
 * @param project - The saved project; not changed.
 * @param plugins - The registered plugins, in registration order.
 * @param target - The target being lowered for.
 * @returns The expanded copy, the origin of every applied patch and the problems.
 */
export function expandProjectSync(
  project: Project,
  plugins: readonly Plugin[],
  target: TargetFacts,
): ExpandProjectResult {
  const state = new ExpansionState(project);
  for (const expander of projectExpanders(plugins)) {
    let result: unknown;
    try {
      result = expander.expand({ elements: state.elements, target });
    } catch (error) {
      state.failed(expander, error);
      continue;
    }
    if (isPromiseLike(result)) {
      // Keep an unobserved rejection from surfacing as an unhandled rejection.
      Promise.resolve(result).catch(() => undefined);
      state.failed(
        expander,
        new Error('it expands asynchronously, which synchronous lowering does not support'),
      );
      continue;
    }
    state.apply(expander, result);
  }
  return state.finish();
}

/**
 * The origin of the deepest applied patch that holds a problem's place: a patch on the
 * problem's element whose pointer equals the problem's `path` or is a parent of it (a patch
 * with the empty path holds every place of its element, including problems without a `path`).
 *
 * @param origins - {@link ExpandProjectResult.origins}.
 * @param problem - A problem found in the expanded project.
 * @returns The origin, or `undefined` when the place is not patched.
 */
export function originForProblem(
  origins: ReadonlyMap<string, ElementPatchOrigin>,
  problem: Problem,
): ElementPatchOrigin | undefined {
  if (problem.elementId === undefined || origins.size === 0) return undefined;
  let pointer = problem.path ?? '';
  for (;;) {
    const origin = origins.get(expansionOriginKey(problem.elementId, pointer));
    if (origin !== undefined) return origin;
    if (pointer === '') return undefined;
    pointer = pointer.slice(0, pointer.lastIndexOf('/'));
  }
}

/**
 * Reports problems found in patched data on the element the user edits: each problem whose
 * element and path fall inside an applied patch ({@link originForProblem}) gets the origin's
 * element id and pointer (no `path` for the empty pointer) and loses its `range`; its code,
 * severity, message and `file` are kept. Other problems are returned unchanged.
 *
 * @param problems - Problems found in the expanded project.
 * @param origins - {@link ExpandProjectResult.origins}.
 * @returns The problems, in the same order.
 */
export function mapProblemsToOrigins(
  problems: readonly Problem[],
  origins: ReadonlyMap<string, ElementPatchOrigin>,
): Problem[] {
  return problems.map((problem) => {
    const origin = originForProblem(origins, problem);
    if (origin === undefined) return problem;
    const { range: _range, path: _path, ...rest } = problem;
    const mapped: Problem = { ...rest, elementId: origin.elementId as ResourceLocation };
    if (origin.pointer !== '') mapped.path = origin.pointer;
    return mapped;
  });
}

type JsonContainer = Json[] | { [key: string]: Json };

function isObject(value: unknown): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Collects the patched copies, origins and problems of one expansion. */
class ExpansionState {
  readonly elements: readonly Element[];
  readonly #project: Project;
  readonly #byId = new Map<string, Element>();
  readonly #copies = new Map<string, Json>();
  readonly #origins = new Map<string, ElementPatchOrigin>();
  readonly #problems: Problem[] = [];

  constructor(project: Project) {
    this.#project = project;
    this.elements = elementsInLoweringOrder(project);
    for (const element of this.elements) this.#byId.set(element.id, element);
  }

  /** Reports a thrown, rejected or malformed expander on the elements of its kinds. */
  failed(expander: ProjectExpander, error: unknown): void {
    const kinds = new Set(Array.isArray(expander.kinds) ? expander.kinds : []);
    const owned = this.elements.filter((element) => kinds.has(element.kind));
    const reason = errorMessage(error);
    if (owned.length === 0) {
      this.#problems.push({
        severity: 'error',
        code: ProblemCodes.expansionFailed,
        message: `Project expander "${expander.id}" failed: ${reason}`,
      });
      return;
    }
    for (const element of owned) {
      this.#problems.push({
        severity: 'error',
        code: ProblemCodes.expansionFailed,
        elementId: element.id,
        message: `${element.id}: project expander "${expander.id}" failed: ${reason}`,
      });
    }
  }

  /** Checks an expander's result, records its problems and applies its patches in order. */
  apply(expander: ProjectExpander, result: unknown): void {
    if (
      !isObject(result) ||
      !Array.isArray((result as Partial<ExpansionResult>).patches) ||
      !Array.isArray((result as Partial<ExpansionResult>).problems)
    ) {
      this.failed(expander, new Error('it returned no { patches, problems } result'));
      return;
    }
    const { patches, problems } = result as unknown as ExpansionResult;
    this.#problems.push(...problems);
    for (const patch of patches) this.#applyPatch(expander, patch);
  }

  /** The expanded copy, the origins and the problems. */
  finish(): ExpandProjectResult {
    const project: Project = {
      ...this.#project,
      namespaces: this.#project.namespaces.map((namespace) => ({
        ...namespace,
        elements: namespace.elements.map((element) => {
          const data = this.#copies.get(element.id);
          return data === undefined ? element : { ...element, data };
        }),
        assets: [...namespace.assets],
      })),
      targets: [...this.#project.targets],
      plugins: [...this.#project.plugins],
    };
    return { project, origins: this.#origins, problems: this.#problems };
  }

  #applyPatch(expander: ProjectExpander, patch: ElementPatch): void {
    const origin = this.#originOf(patch);
    const invalid = (reason: string): void => {
      this.#problems.push({
        severity: 'error',
        code: ProblemCodes.expansionInvalidPatch,
        ...(origin === undefined ? {} : this.#at(origin)),
        message: `Project expander "${expander.id}" made a patch that cannot be applied: ${reason}.`,
      });
    };
    if (origin === undefined) {
      invalid('it has no origin { elementId, pointer }');
      return;
    }
    if (!isObject(patch) || typeof patch.elementId !== 'string') {
      invalid('it names no element');
      return;
    }
    const element = this.#byId.get(patch.elementId);
    if (element === undefined) {
      invalid(`element ${patch.elementId} does not exist`);
      return;
    }
    const path = patch.path;
    if (
      !Array.isArray(path) ||
      !path.every(
        (segment) =>
          typeof segment === 'string' || (Number.isInteger(segment) && (segment as number) >= 0),
      )
    ) {
      invalid(`its path for ${patch.elementId} is not a list of keys and indexes`);
      return;
    }
    if (patch.value === undefined) {
      invalid(`its value for ${patch.elementId} is missing`);
      return;
    }
    const pointer = toJsonPointer(path);
    const key = expansionOriginKey(patch.elementId, pointer);
    const earlier = this.#origins.get(key);
    if (earlier !== undefined) {
      this.#problems.push({
        severity: 'error',
        code: ProblemCodes.expansionConflict,
        ...this.#at(origin),
        message: `${patch.elementId} at "${pointer}" is already set by ${earlier.elementId}${earlier.pointer === '' ? '' : ` (${earlier.pointer})`}; the first value is kept.`,
      });
      return;
    }
    const data = this.#copies.get(element.id) ?? structuredClone(element.data);
    const written = setAt(data, path, structuredClone(patch.value));
    if (typeof written === 'string') {
      invalid(`${patch.elementId} at "${pointer}": ${written}`);
      return;
    }
    this.#copies.set(element.id, written.root);
    this.#origins.set(key, { elementId: origin.elementId, pointer: origin.pointer });
  }

  #originOf(patch: ElementPatch): ElementPatchOrigin | undefined {
    const origin: unknown = isObject(patch) ? patch.origin : undefined;
    if (
      !isObject(origin) ||
      typeof origin.elementId !== 'string' ||
      typeof origin.pointer !== 'string'
    ) {
      return undefined;
    }
    return { elementId: origin.elementId, pointer: origin.pointer };
  }

  /** The problem place of an origin: its element and, unless empty, its pointer. */
  #at(origin: ElementPatchOrigin): Pick<Problem, 'elementId' | 'path'> {
    const elementId = origin.elementId as ResourceLocation;
    return origin.pointer === '' ? { elementId } : { elementId, path: origin.pointer };
  }
}

/** Writes an own property, safely for keys such as `__proto__`. */
function defineKey(target: { [key: string]: Json }, key: string, value: Json): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** The child of a container at a segment, or `undefined` if absent or the wrong segment type. */
function childAt(parent: JsonContainer, segment: string | number): Json | undefined {
  if (Array.isArray(parent)) return typeof segment === 'number' ? parent[segment] : undefined;
  return typeof segment === 'string' && Object.hasOwn(parent, segment)
    ? parent[segment]
    : undefined;
}

/** Sets one segment of a container; returns why it cannot, or `undefined`. */
function setChild(
  parent: JsonContainer,
  segment: string | number,
  value: Json,
): string | undefined {
  if (Array.isArray(parent)) {
    if (typeof segment !== 'number') return `key "${segment}" names an item of a list`;
    if (segment > parent.length) {
      return `index ${segment} is past the end of a list of ${parent.length}`;
    }
    parent[segment] = value;
    return undefined;
  }
  if (typeof segment !== 'string') return `index ${segment} names a field of an object`;
  defineKey(parent, segment, value);
  return undefined;
}

/**
 * Sets `value` at `path` inside `root` (mutating it), creating missing parent objects. The
 * empty path replaces the root, which must stay an object.
 *
 * @returns The (possibly new) root, or why the path cannot be set.
 */
function setAt(
  root: Json,
  path: readonly (string | number)[],
  value: Json,
): { root: Json } | string {
  if (path.length === 0) {
    return isObject(value) ? { root: value } : 'an empty path must set an object';
  }
  if (!isObject(root) && !Array.isArray(root)) return 'the data is not an object';
  let parent: JsonContainer = root;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index] as string | number;
    let child = childAt(parent, segment);
    if (child === undefined) {
      child = {};
      const reason = setChild(parent, segment, child);
      if (reason !== undefined) return reason;
    }
    if (!isObject(child) && !Array.isArray(child)) {
      return `${toJsonPointer(path.slice(0, index + 1))} is not an object or a list`;
    }
    parent = child;
  }
  const reason = setChild(parent, path[path.length - 1] as string | number, value);
  return reason === undefined ? { root } : reason;
}
