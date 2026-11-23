/**
 * Change items a rule card sends through the host's `applyChanges` (one undo step): the book's
 * next data, and things the card makes along with it, such as the on-screen number that "Show a
 * number on screen" makes inline (B424a), and the team, score, timer, area, magic block or loot
 * table a games chip's "Make a new one" makes (B553's slot types).
 *
 * @packageDocumentation
 */

import type { Json, Project, ResourceLocation } from '@msm/core';
import { HUD_KIND, RULES_KIND } from '@msm/plugin-rules';
import type { ChangeItem } from '../../changeset/changeset';
import { THING_WORDS, type ThingSort } from '../../components/thing-picker/thing-sources';
import { builtInPlugins } from '../../plugins/built-in';
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

/**
 * What a games chip's "Make a new one" makes, by sort: the kind, the id's first name (then
 * `_2`, `_3`...) and, for the kinds players see by name, the name (then " 2", " 3"...). A
 * structure has none: it is saved from the game or drawn in the Structure Workshop.
 */
const NEW_THINGS: Readonly<
  Partial<Record<ThingSort, { kind: string; path: string; name?: string; data?: Json }>>
> = Object.freeze({
  team: { kind: 'msm:team', path: 'team', name: 'My team' },
  objective: { kind: 'msm:objective', path: 'score', name: 'Score' },
  timer: { kind: 'msm:timer', path: 'timer', name: 'Timer' },
  area: { kind: 'msm:area', path: 'area', name: 'My area' },
  one_block: { kind: 'msm:one_block', path: 'one_block' },
  // An empty chest loot table, filled in its own Studio.
  loot_table: {
    kind: 'minecraft:loot_table',
    path: 'chests/loot',
    data: { pools: [], type: 'minecraft:chest' },
  },
});

/** The sorts a games chip can make a new one of. */
export const MAKEABLE_SORTS: ReadonlySet<ThingSort> = new Set(
  Object.keys(NEW_THINGS) as ThingSort[],
);

/** The undo label and button words of "Make a new one" for `sort` ("Make a new team"). */
export function newThingLabel(sort: ThingSort): string {
  return `Make a new ${THING_WORDS[sort].one.replace(/^an? /, '')}`;
}

/** The default data of kind `kindId` from the built-in plugins, deep-copied. */
function kindDefault(kindId: string): Json | undefined {
  for (const plugin of builtInPlugins) {
    const kind = plugin.contributes.elementKinds?.find((entry) => entry.id === kindId);
    if (kind?.defaultData !== undefined) return structuredClone(kind.defaultData as Json);
  }
  return undefined;
}

/** The display names the project's elements of `kind` already use. */
function namesOf(project: Project, kind: string): Set<string> {
  const names = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const name = (element.data as { name?: Json } | null)?.name;
      if (element.kind === kind && typeof name === 'string') names.add(name);
    }
  }
  return names;
}

/**
 * A new thing of `sort` in `namespace` with a free id and, where players see one, a free name
 * ("My team", then "My team 2"); `undefined` for a sort that cannot be made here.
 */
export function newGameThing(
  project: Project,
  sort: ThingSort,
  namespace: string,
): NewElement | undefined {
  const plan = NEW_THINGS[sort];
  if (plan === undefined) return undefined;
  const taken = projectIds(project);
  let id = '';
  for (let n = 1; ; n += 1) {
    id = `${namespace}:${n === 1 ? plan.path : `${plan.path}_${n}`}`;
    if (!taken.has(id)) break;
  }
  const base = plan.data ?? kindDefault(plan.kind) ?? {};
  const data: Json =
    typeof base === 'object' && base !== null && !Array.isArray(base) ? structuredClone(base) : {};
  if (
    plan.name !== undefined &&
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data)
  ) {
    const used = namesOf(project, plan.kind);
    let name = plan.name;
    for (let n = 2; used.has(name); n += 1) name = `${plan.name} ${n}`;
    data.name = name;
  }
  return { id, kind: plan.kind, data };
}
