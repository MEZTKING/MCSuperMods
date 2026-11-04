/**
 * The project reference index (ADR 0016): which elements point at which ids.
 *
 * @packageDocumentation
 */

import type { Element, Project, ResourceLocation } from '@msm/plugin-api';
import { collectReferences, type SchemaNode } from '@msm/schemas';

/** One reference from an element to an id. */
export interface Reference {
  /** The referencing element. */
  from: ResourceLocation;
  /**
   * RFC 6901 pointer into the referencing element's data: to the string, to a map entry
   * whose key is the reference (`key`), or to a function line (`/lines/<n>`, with `range`).
   */
  path: string;
  /**
   * The registry of the reference without a `minecraft:` prefix, for example `item`; a tag
   * reference has `tag/<registry>`. Text references have the empty registry: a token match
   * in mcfunction text is not typed.
   */
  registry: string;
  /** The referenced id, normalised to `namespace:path` (`minecraft:` default, no `#`). */
  to: string;
  /** For a text reference, the UTF-16 range of the `namespace:path` token within the line. */
  range?: { start: number; end: number };
  /** Set when the reference is an object key at `path` rather than a string value. */
  key?: true;
}

/** Lookups over the references of one project state. */
export interface ReferenceIndex {
  /**
   * Every reference to `id` (normalised as {@link Reference.to}), optionally only those of
   * one registry, sorted by referencing element, path and range.
   */
  referencesTo(id: string, registry?: string): Reference[];
  /** Every reference made by one element, sorted by path and range. */
  referencesFrom(elementId: ResourceLocation): Reference[];
  /** Every reference in the project, sorted by referencing element, path and range. */
  all(): Reference[];
}

const MINECRAFT = 'minecraft:';

/**
 * Normalises a reference as written to `namespace:path`: drops a leading `#` and adds the
 * `minecraft:` namespace when none is written.
 *
 * @param written - The id as written, for example `#stone` or `my_mod:ruby`.
 */
export function normaliseReferenceId(written: string): string {
  const id = written.startsWith('#') ? written.slice(1) : written;
  return id.includes(':') ? id : `${MINECRAFT}${id}`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orders references by element, path, range start and then whether they are keys. */
export function compareReferences(a: Reference, b: Reference): number {
  return (
    compareText(a.from, b.from) ||
    compareText(a.path, b.path) ||
    (a.range?.start ?? -1) - (b.range?.start ?? -1) ||
    Number(a.key === true) - Number(b.key === true) ||
    compareText(a.to, b.to)
  );
}

/** The schema references of one element, or none when its kind has no schema. */
function schemaReferences(
  element: Element,
  resolveSchema: (kind: string) => SchemaNode | undefined,
): Reference[] {
  let node: SchemaNode | undefined;
  try {
    node = resolveSchema(element.kind);
  } catch {
    // An unresolvable schema contributes no references, as an unknown kind does.
    return [];
  }
  if (node === undefined) return [];
  return collectReferences(element.data, node).map((collected) => {
    const tag = collected.id.startsWith('#');
    const registry =
      tag && !collected.registry.startsWith('tag/')
        ? `tag/${collected.registry}`
        : collected.registry;
    const reference: Reference = {
      from: element.id,
      path: collected.path,
      registry,
      to: normaliseReferenceId(collected.id),
    };
    if (collected.key === true) reference.key = true;
    return reference;
  });
}

/**
 * Builds the reference index of a project: every string its kind's schema types with an id
 * registry (via `collectReferences`), plus whatever `textReferences` finds, for example in
 * function lines with {@link collectTextReferences}. Elements whose kind has no schema
 * contribute only text references. Pure; the result reflects `project` as passed.
 *
 * @param project - The project state.
 * @param resolveSchema - The schema of an element kind, or `undefined` when unknown.
 * @param textReferences - Extra references of one element, for text the schema cannot see.
 */
export function buildReferenceIndex(
  project: Project,
  resolveSchema: (kind: string) => SchemaNode | undefined,
  textReferences?: (element: Element) => Reference[],
): ReferenceIndex {
  const all: Reference[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      all.push(...schemaReferences(element, resolveSchema));
      if (textReferences !== undefined) all.push(...textReferences(element));
    }
  }
  all.sort(compareReferences);
  const byTarget = new Map<string, Reference[]>();
  const bySource = new Map<string, Reference[]>();
  for (const reference of all) {
    const to = byTarget.get(reference.to);
    if (to === undefined) byTarget.set(reference.to, [reference]);
    else to.push(reference);
    const from = bySource.get(reference.from);
    if (from === undefined) bySource.set(reference.from, [reference]);
    else from.push(reference);
  }
  const copy = (references: readonly Reference[]): Reference[] =>
    references.map((reference) => structuredClone(reference));
  return {
    referencesTo(id, registry) {
      const found = byTarget.get(normaliseReferenceId(id)) ?? [];
      return copy(
        registry === undefined
          ? found
          : found.filter((reference) => reference.registry === registry),
      );
    },
    referencesFrom(elementId) {
      return copy(bySource.get(elementId) ?? []);
    },
    all() {
      return copy(all);
    },
  };
}
