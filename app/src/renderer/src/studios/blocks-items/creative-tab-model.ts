/**
 * Pure helpers of the Creative Tab Studio (ADR 0096 D2, ADR 0101 D1): the project's things that
 * register an item (an `msm:item`, a block's item, a mob's spawn egg) with the tab their
 * `creative_tab` field names, the tab's members in the order the game shows them, and the
 * change items that move things into or out of a tab, applied by the host as one undo step.
 * No DOM, so it runs in Node tests.
 *
 * Tab field paths (B456): `/icon`, `/order`, `/display_name`; with `order` `by_hand` (ADR 0111
 * D7, B538) `/items/i`, the hand order.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import { blockItemId } from '@msm/plugin-blocks-items';
import type { ChangeItem } from '../../changeset/changeset';
import { thingWords } from '../../components/thing-picker/thing-sources';

type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The tab orders of the format, with their plain words. */
export const TAB_ORDERS = ['as_listed', 'by_name', 'by_hand'] as const;

/** A tab order. */
export type TabOrder = (typeof TAB_ORDERS)[number];

/** Each order in plain words, for the order picker. */
export const TAB_ORDER_LABELS: Readonly<Record<TabOrder, string>> = Object.freeze({
  as_listed: 'In the order the mod adds them',
  by_name: 'By name, A to Z',
  by_hand: 'In your own order',
});

/** The order of tab data `data` (`as_listed` when absent or unknown). */
export function tabOrderOf(data: Json | undefined): TabOrder {
  const order = isObject(data) ? data.order : undefined;
  return order === 'by_name' || order === 'by_hand' ? order : 'as_listed';
}

/** The hand order of tab data (`items`, ids only), or `[]`. */
export function handOrderOf(data: Json | undefined): string[] {
  const items = isObject(data) ? data.items : undefined;
  return Array.isArray(items)
    ? items.filter((id): id is string => typeof id === 'string').map(namespaced)
    : [];
}

/**
 * Tab data with `order` set to `order`: `by_hand` also starts the hand order (`items`) from the
 * tab's members in the order they show now when it has none; another order drops `items` (the
 * runtime ignores it there with a warning).
 */
export function withTabOrder(
  project: Project,
  tabId: string,
  data: Json | undefined,
  order: TabOrder,
): JsonObject {
  const object: JsonObject = isObject(data) ? { ...data } : {};
  if (order === 'as_listed') delete object.order;
  else object.order = order;
  if (order !== 'by_hand') {
    delete object.items;
    return object;
  }
  if (handOrderOf(data).length === 0) {
    const members = tabMembers(project, tabId, tabOrderOf(data)).map((member) => member.itemId);
    if (members.length > 0) object.items = members;
    else delete object.items;
  }
  return object;
}

/** Tab data with the hand order `items` (removed when empty). */
export function withHandOrder(data: Json | undefined, items: readonly string[]): JsonObject {
  const object: JsonObject = isObject(data) ? { ...data } : {};
  if (items.length === 0) delete object.items;
  else object.items = [...items];
  return object;
}

/** `items` with the entry at `from` moved to `to` (unchanged when either is out of range). */
export function movedItem(items: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry as string);
  return next;
}

/** One project thing that registers an item and may join a creative tab. */
export interface TabCandidate {
  /** The element that holds the `creative_tab` field. */
  readonly elementId: ResourceLocation;
  readonly kind: string;
  /** The item the game registers (a block's item id, `<mob>_spawn_egg`). */
  readonly itemId: string;
  /** The name shown in the list (the display name, or words from the id). */
  readonly name: string;
  /** Where the field sits in the element's data (keys from the root). */
  readonly fieldPath: readonly string[];
  /** The tab the field names now, namespaced, or `undefined` when it names none. */
  readonly tab: string | undefined;
}

const ITEM_KIND = 'msm:item';
const BLOCK_KIND = 'msm:block';
const ENTITY_KIND = 'msm:entity';

function displayName(data: Json | undefined, fallbackId: string): string {
  const name = isObject(data) ? data.display_name : undefined;
  return typeof name === 'string' && name.trim() !== '' ? name : thingWords(fallbackId, 'item');
}

/** The candidate `element` gives, or `undefined` when it registers no item that can join. */
export function tabCandidateOf(element: Element): TabCandidate | undefined {
  const data = isObject(element.data) ? element.data : {};
  let holder: Json | undefined;
  let fieldPath: string[];
  let itemId: string;
  if (element.kind === ITEM_KIND) {
    holder = data;
    fieldPath = ['creative_tab'];
    itemId = element.id;
  } else if (element.kind === BLOCK_KIND) {
    const id = blockItemId(element);
    if (id === undefined) return undefined;
    holder = data.item;
    fieldPath = ['item', 'creative_tab'];
    itemId = namespaced(id);
  } else if (element.kind === ENTITY_KIND) {
    if (data.spawn_egg === false) return undefined;
    holder = data.spawn_egg;
    fieldPath = ['spawn_egg', 'creative_tab'];
    itemId = `${element.id}_spawn_egg`;
  } else {
    return undefined;
  }
  const tab = isObject(holder) ? holder.creative_tab : undefined;
  const name =
    element.kind === ENTITY_KIND
      ? `${displayName(element.data, element.id)} spawn egg`
      : displayName(element.data, itemId);
  return {
    elementId: element.id,
    kind: element.kind,
    itemId,
    name,
    fieldPath,
    tab: typeof tab === 'string' && tab !== '' ? namespaced(tab) : undefined,
  };
}

/** Every candidate of the project, in the project's order (namespaces, then ids). */
export function tabCandidates(project: Project): TabCandidate[] {
  return project.namespaces.flatMap((namespace) =>
    namespace.elements.flatMap((element) => {
      const candidate = tabCandidateOf(element);
      return candidate === undefined ? [] : [candidate];
    }),
  );
}

/**
 * The tab's members in the order the game shows them: the project's order for `as_listed`
 * (verify at implementation against the runtime's registration order), by name for `by_name`,
 * and for `by_hand` those in `handOrder` first in its order, then the others.
 */
export function tabMembers(
  project: Project,
  tabId: string,
  order: TabOrder,
  handOrder: readonly string[] = [],
): TabCandidate[] {
  const members = tabCandidates(project).filter((candidate) => candidate.tab === tabId);
  if (order === 'by_name') return [...members].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (order === 'by_hand') {
    // Listed members first in the hand order, then the rest in registration order (ADR 0111 D7).
    const rank = (candidate: TabCandidate) => {
      const at = handOrder.indexOf(candidate.itemId);
      return at < 0 ? handOrder.length : at;
    };
    return members
      .map((member, index) => ({ member, index }))
      .sort((a, b) => rank(a.member) - rank(b.member) || a.index - b.index)
      .map((entry) => entry.member);
  }
  return members;
}

/** The candidates that can be added: not in this tab yet. */
export function tabNonMembers(project: Project, tabId: string): TabCandidate[] {
  return tabCandidates(project).filter((candidate) => candidate.tab !== tabId);
}

/** `data` with the field at `path` set to `value`, or removed when `value` is `undefined`. */
function withField(data: Json | undefined, path: readonly string[], value: string | undefined) {
  const [key, ...rest] = path;
  const object: JsonObject = isObject(data) ? { ...data } : {};
  if (key === undefined) return object;
  if (rest.length === 0) {
    if (value === undefined) delete object[key];
    else object[key] = value;
    return object;
  }
  const child = withField(object[key], rest, value);
  // A holder left empty (a block's item, a spawn egg) is removed: its defaults are the same.
  if (value === undefined && Object.keys(child).length === 0) delete object[key];
  else object[key] = child;
  return object;
}

/**
 * The change items that set the `creative_tab` of `elementIds` to `tabId` (or clear it with
 * `undefined`), one update per element with its data before and after, for the host to apply
 * as one undo step. Elements that are not candidates, or already there, are skipped.
 */
export function tabMembershipItems(
  project: Project,
  elementIds: readonly string[],
  tabId: string | undefined,
): ChangeItem[] {
  const items: ChangeItem[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (!elementIds.includes(element.id)) continue;
      const candidate = tabCandidateOf(element);
      if (candidate === undefined || candidate.tab === tabId) continue;
      const after = withField(element.data, candidate.fieldPath, tabId);
      items.push({
        itemId: `creative-tab-${element.id}`,
        op: 'update',
        elementId: element.id,
        kind: element.kind,
        before: structuredClone(element.data),
        after,
        accepted: true,
        problems: [],
      });
    }
  }
  return items;
}

/** The undo label of a membership change. */
export function tabMembershipLabel(count: number, joining: boolean): string {
  const things = count === 1 ? 'one thing' : `${count} things`;
  return joining ? `Add ${things} to the tab` : `Take ${things} out of the tab`;
}
