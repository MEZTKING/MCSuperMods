/**
 * Constructors and lookups for the in-memory project model.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/plugin-api';
import { parseResourceLocation } from './resource-location';

/** The current version of the `msm.project.json` format. */
export const PROJECT_FORMAT_VERSION = 1;

/** The current version of the element file format. */
export const ELEMENT_FORMAT_VERSION = 1;

/**
 * Creates a new, empty project.
 *
 * @param name - Human-readable project name.
 * @param options - Optional target and plugin ids.
 * @returns A project with no namespaces and no settings.
 */
export function createEmptyProject(
  name: string,
  options: { targets?: string[]; plugins?: string[] } = {},
): Project {
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    name,
    namespaces: [],
    plugins: [...(options.plugins ?? [])],
    settings: {},
    targets: [...(options.targets ?? [])],
  };
}

/**
 * Creates a new element at the current element format version.
 *
 * @param input - The element's id, kind, data and optional metadata. `now` supplies the
 *   creation timestamp and defaults to the current time.
 * @returns The new element.
 * @throws `InvalidResourceLocationError` If `id` is malformed.
 */
export function createElement<D extends Json>(input: {
  id: ResourceLocation;
  kind: string;
  data: D;
  now?: () => string;
  notes?: string;
  tags?: string[];
}): Element<D> {
  parseResourceLocation(input.id);
  const now = input.now ?? (() => new Date().toISOString());
  const element: Element<D> = {
    data: input.data,
    formatVersion: ELEMENT_FORMAT_VERSION,
    id: input.id,
    kind: input.kind,
    meta: { createdAt: now() },
  };
  if (input.notes !== undefined) element.meta.notes = input.notes;
  if (input.tags !== undefined) element.meta.tags = [...input.tags];
  return element;
}

/**
 * Finds an element by id.
 *
 * @param project - The project to search.
 * @param id - The element id.
 * @returns The element, or `undefined` if no element has that id.
 */
export function findElement(project: Project, id: ResourceLocation): Element | undefined {
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.id === id) return element;
    }
  }
  return undefined;
}
