/**
 * The session's view of the core reference index (ADR 0016): schema references through the
 * registered kinds' schemas, and text references inside function lines.
 *
 * @packageDocumentation
 */

import {
  buildReferenceIndex,
  collectTextReferences,
  type Element,
  type ElementKindRegistry,
  type Project,
  type Reference,
  type ReferenceIndex,
  type ResourceLocation,
} from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { FUNCTION_KIND, functionLines } from './mcfunction-problems';
import {
  BUILT_IN_KIND_LOOKUP,
  type KindRegistryLookup,
  kindRegistry,
  type SchemaContext,
} from './schema-context';

/** Every element id of `project` (the ids text references are matched against). */
export function projectElementIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) ids.add(element.id);
  }
  return ids;
}

/**
 * Builds the reference index of `project`. Without a loaded schema context only text
 * references are found.
 *
 * @param project - The project state.
 * @param registry - The element kinds (for each kind's schema ref).
 * @param context - The loaded schema context, or `null` while schemas load.
 */
export function buildSessionReferenceIndex(
  project: Project,
  registry: ElementKindRegistry,
  context: SchemaContext | null,
): ReferenceIndex {
  const knownIds = projectElementIds(project);
  const resolveSchema = (kindId: string): SchemaNode | undefined => {
    if (context === null) return undefined;
    const kind = registry.get(kindId);
    return kind === undefined ? undefined : context.schemaIndex.resolveSchemaRef(kind.schema);
  };
  const textReferences = (element: Element): Reference[] => {
    if (element.kind !== FUNCTION_KIND) return [];
    const lines = functionLines(element);
    return lines === undefined ? [] : collectTextReferences(element, lines, knownIds);
  };
  return buildReferenceIndex(project, resolveSchema, textReferences);
}

/**
 * The references a rename of `element` must rewrite: every text reference (function lines are
 * untyped) and every schema reference in the registry of the element's kind, so a recipe
 * `demo:ruby` and an item `demo:ruby` written elsewhere are not confused.
 *
 * @param index - The project's reference index.
 * @param element - The element being renamed.
 * @param kinds - The registered kinds (the session's kind registry); defaults to the built-in
 *   plugins' kinds.
 */
export function referencesForRename(
  index: ReferenceIndex,
  element: Element,
  kinds: KindRegistryLookup = BUILT_IN_KIND_LOOKUP,
): Reference[] {
  const registry = kindRegistry(element.kind, kinds);
  return index
    .referencesTo(element.id)
    .filter((reference) => reference.registry === '' || reference.registry === registry);
}

/** Lookups the session exposes over the current project's references. */
export interface SessionReferences {
  /** Every reference to `id`, optionally only those of one registry (`''` for text). */
  to(id: string, registry?: string): Reference[];
  /** Every reference made by one element. */
  from(elementId: ResourceLocation): Reference[];
}
