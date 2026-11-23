/**
 * The Item Studio's "Adventure mode" section (ADR 0117 Y16): the vanilla components
 * `minecraft:can_break` and `minecraft:can_place_on` in the item's `msm:components` passthrough
 * (ADR 0044 D1). Each is one block predicate or a list of them; the section edits the plain
 * case, predicates with only `blocks` (a block id, a list of block ids or one `#tag`), and
 * writes the blocks as one predicate and each tag as its own, a single predicate as an object
 * and more than one as a list, the forms B547 measured on both targets. The old
 * `{ predicates: [...] }` form, block states, block entity data or a predicate without `blocks`
 * are kept as they are and shown, not edited. Keys are read with or without the `minecraft:`
 * prefix and written with it.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { passthroughOf, withPassthrough } from './item-wear-model';

export const CAN_BREAK = 'minecraft:can_break';
export const CAN_PLACE_ON = 'minecraft:can_place_on';

/** One of the two adventure mode components. */
export type AdventureComponent = typeof CAN_BREAK | typeof CAN_PLACE_ON;

/** What the section shows of one component. */
export interface AdventureList {
  /** Block ids, then `#` block tags, each once, in the file's order. */
  readonly entries: readonly string[];
  /**
   * False when the value holds more than blocks and tags (block states, block entity data, a
   * predicate without blocks, the old form): the section shows it and does not change it.
   */
  readonly simple: boolean;
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An id written without a namespace means `minecraft:` (a tag keeps its `#`). */
export function namespacedEntry(entry: string): string {
  const tag = entry.startsWith('#');
  const id = tag ? entry.slice(1) : entry;
  const full = id.includes(':') ? id : `minecraft:${id}`;
  return tag ? `#${full}` : full;
}

/** The value of component `id` in the item's `msm:components`, with or without the prefix. */
function componentValue(components: JsonObject, id: AdventureComponent): Json | undefined {
  const passthrough = passthroughOf(components);
  return passthrough[id] ?? passthrough[id.slice('minecraft:'.length)];
}

/** The blocks and tags of component `id` of an item's `components`. */
export function adventureListOf(components: JsonObject, id: AdventureComponent): AdventureList {
  const value = componentValue(components, id);
  if (value === undefined) return { entries: [], simple: true };
  const blocks: string[] = [];
  const tags: string[] = [];
  let simple = true;
  for (const predicate of Array.isArray(value) ? value : [value]) {
    if (!isObject(predicate) || Object.keys(predicate).some((key) => key !== 'blocks')) {
      simple = false;
      continue;
    }
    const set = predicate.blocks;
    if (typeof set === 'string') {
      (set.startsWith('#') ? tags : blocks).push(set);
    } else if (
      Array.isArray(set) &&
      set.every((entry) => typeof entry === 'string' && !entry.startsWith('#'))
    ) {
      blocks.push(...(set as string[]));
    } else {
      simple = false;
    }
  }
  return { entries: [...new Set([...blocks, ...tags])], simple };
}

/**
 * The component value of a list of block ids and `#` tags: the blocks as one predicate, each
 * tag as its own; one predicate is written as an object, more as a list; undefined when empty.
 */
export function adventureValue(entries: readonly string[]): Json | undefined {
  const unique = [...new Set(entries.filter((entry) => entry.trim() !== ''))];
  const blocks = unique.filter((entry) => !entry.startsWith('#'));
  const predicates: JsonObject[] = [
    ...(blocks.length > 0 ? [{ blocks }] : []),
    ...unique.filter((entry) => entry.startsWith('#')).map((tag) => ({ blocks: tag })),
  ];
  if (predicates.length === 0) return undefined;
  return predicates.length === 1 ? (predicates[0] as JsonObject) : predicates;
}

/** `msm:components` with component `id` set to the list (removed when empty). */
export function withAdventureList(
  components: JsonObject,
  id: AdventureComponent,
  entries: readonly string[],
): JsonObject | undefined {
  return withPassthrough(components, id, adventureValue(entries));
}

/** The tooltip header the game shows above each list (`item.canBreak`, `item.canPlace`). */
export const ADVENTURE_TOOLTIP_HEADERS: Readonly<Record<AdventureComponent, string>> = {
  [CAN_BREAK]: 'Can break:',
  [CAN_PLACE_ON]: 'Can be placed on:',
};
