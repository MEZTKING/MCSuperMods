/**
 * Home's "My things" (ADR 0083 D2): one card per Creator set (elements sharing
 * `meta.creator.setId`) or loose content element (blocks, items, mobs, effects, potions, portals
 * and rule books), with its name and the element its card opens. Technical elements (models,
 * item looks, block states, names, pack and mod settings, scripts that Rules made) are never
 * cards. Pure: no DOM, so it runs in Node tests.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import { RULES_KIND } from '@msm/plugin-rules';
import { displayNameOf } from '../../session/plain-problems';
import { creatorSets } from '../ElementSidebar';
import type { ThingSort } from '../thing-picker/thing-sources';

/** The kinds that are cards, in the order a set picks its main element, with words and icon. */
export const THING_KINDS: readonly { kind: string; word: string; sort: ThingSort }[] = [
  { kind: 'msm:block', word: 'Block', sort: 'block' },
  { kind: 'msm:item', word: 'Item', sort: 'item' },
  { kind: 'msm:entity', word: 'Mob', sort: 'mob' },
  { kind: 'msm:effect', word: 'Effect', sort: 'effect' },
  { kind: 'msm:potion', word: 'Potion', sort: 'item' },
  { kind: RULES_KIND, word: 'Rules', sort: 'function' },
];

const KIND_ORDER = new Map(THING_KINDS.map((entry, index) => [entry.kind, index]));

/** Whether an element is a card of its own (or the main element of a set). */
export function isThingKind(kind: string): boolean {
  return KIND_ORDER.has(kind);
}

/** One card of "My things". */
export interface ThingCard {
  /** Stable key: `set:<setId>` or the element id; the card's test id is `my-thing-<key>`. */
  readonly key: string;
  /** The name shown. */
  readonly name: string;
  /** What it is, in words ("Block", "Gear set"). */
  readonly what: string;
  /** The element the card opens. */
  readonly main: Element;
  /** Every element the card stands for (a whole set, or the one element). */
  readonly elements: readonly Element[];
  /** For the generic icon. */
  readonly sort: ThingSort;
}

type JsonObject = { [key: string]: Json };

const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** Whether a block is a portal (`type: "portal"`); its card then reads "Portal". */
function isPortal(element: Element): boolean {
  return element.kind === 'msm:block' && asObject(element.data)?.type === 'portal';
}

function kindWord(element: Element): string {
  if (isPortal(element)) return 'Portal';
  return THING_KINDS.find((entry) => entry.kind === element.kind)?.word ?? 'Thing';
}

function sortOf(element: Element): ThingSort {
  return THING_KINDS.find((entry) => entry.kind === element.kind)?.sort ?? 'item';
}

/** The set's main element: the first card kind in {@link THING_KINDS} order, then by id. */
function mainOf(elements: readonly Element[]): Element | undefined {
  return [...elements]
    .filter((element) => isThingKind(element.kind))
    .sort(
      (a, b) =>
        (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99) || a.id.localeCompare(b.id),
    )[0];
}

/** The set name stored in `meta.creator.values` (`name` or `*_name`), if any. */
function setName(element: Element): string | undefined {
  const values = element.meta.creator?.values;
  if (values === undefined) return undefined;
  const key = Object.keys(values)
    .sort()
    .find((entry) => entry === 'name' || entry.endsWith('_name'));
  const value = key === undefined ? undefined : values[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The cards of "My things": every Creator set with a card kind, then every loose element of a
 * card kind, by name. `flowTitles` names the sets' flows ("Gear set").
 */
export function thingCards(
  project: Project | null,
  flowTitles: Readonly<Record<string, string>> = {},
): ThingCard[] {
  if (project === null) return [];
  const elements = project.namespaces.flatMap((namespace) => namespace.elements);
  const cards: ThingCard[] = [];
  for (const set of creatorSets(elements, flowTitles)) {
    const main = mainOf(set.elements);
    if (main === undefined) continue;
    const flowId = main.meta.creator?.flowId ?? '';
    cards.push({
      key: `set:${set.setId}`,
      name: setName(main) ?? displayNameOf(main),
      what: flowTitles[flowId] ?? kindWord(main),
      main,
      elements: set.elements,
      sort: sortOf(main),
    });
  }
  for (const element of elements) {
    if (element.meta.creator !== undefined || !isThingKind(element.kind)) continue;
    cards.push({
      key: element.id,
      name: displayNameOf(element),
      what: kindWord(element),
      main: element,
      elements: [element],
      sort: sortOf(element),
    });
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/** A free id for a copy of `id`: `<id>_copy`, then `<id>_copy_2` and so on. */
export function copyId(project: Project, id: ResourceLocation): ResourceLocation {
  const taken = new Set(
    project.namespaces.flatMap((namespace) => namespace.elements.map((element) => element.id)),
  );
  let candidate: ResourceLocation = `${id}_copy`;
  for (let index = 2; taken.has(candidate); index += 1) candidate = `${id}_copy_${index}`;
  return candidate;
}

/** The data of a copy: the same, with " (copy)" after a string `display_name`. */
export function copyData(data: Json): Json {
  const object = asObject(data);
  if (object === undefined) return structuredClone(data);
  const copy = structuredClone(object);
  if (typeof copy.display_name === 'string') copy.display_name = `${copy.display_name} (copy)`;
  return copy;
}
