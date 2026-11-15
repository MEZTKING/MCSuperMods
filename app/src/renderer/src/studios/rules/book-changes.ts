/**
 * Change items a rule card sends through the host's `applyChanges` (one undo step): the book's
 * next data, and things the card makes along with it, such as the on-screen number that "Show a
 * number on screen" makes inline (B424a).
 *
 * @packageDocumentation
 */

import type { Json, Project, ResourceLocation } from '@msm/core';
import { HUD_KIND, RULES_KIND } from '@msm/plugin-rules';
import type { ChangeItem } from '../../changeset/changeset';
import type { RuleBookData } from './rules-model';

/** The change item that writes `after` into book `bookId` (created when `before` is missing). */
export function bookChange(
  bookId: string,
  before: Json | undefined,
  after: RuleBookData,
): ChangeItem {
  return {
    itemId: `rules-book-${bookId}`,
    op: before === undefined ? 'create' : 'update',
    elementId: bookId as ResourceLocation,
    kind: RULES_KIND,
    after,
    accepted: true,
    problems: [],
  };
}

/** A project element a card makes along with a book change. */
export interface NewElement {
  readonly id: string;
  readonly kind: string;
  readonly data: Json;
}

/** The change item that creates `element`. */
export function createChange(element: NewElement): ChangeItem {
  return {
    itemId: `rules-new-${element.id}`,
    op: 'create',
    elementId: element.id as ResourceLocation,
    kind: element.kind,
    after: element.data,
    accepted: true,
    problems: [],
  };
}

/**
 * The data of a new on-screen number: a text HUD element without `text` (the HUD Studio's
 * "Number" look) whose value only a `set_hud` action, a script or a Rules step sets.
 */
export const NEW_NUMBER_HUD: Json = Object.freeze({
  format: 1,
  type: 'text',
  value: Object.freeze({ source: 'set' }),
}) as Json;

/** Every element id of the project. */
function projectIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) ids.add(element.id);
  }
  return ids;
}

/** A free id for a new on-screen number in `namespace`: `number`, then `number_2`, ... */
export function newHudId(project: Project, namespace: string): string {
  const taken = projectIds(project);
  for (let n = 1; ; n += 1) {
    const id = `${namespace}:${n === 1 ? 'number' : `number_${n}`}`;
    if (!taken.has(id)) return id;
  }
}

/** A new on-screen number in `namespace`, with a free id. */
export function newNumberHud(project: Project, namespace: string): NewElement {
  return {
    id: newHudId(project, namespace),
    kind: HUD_KIND,
    data: structuredClone(NEW_NUMBER_HUD),
  };
}
