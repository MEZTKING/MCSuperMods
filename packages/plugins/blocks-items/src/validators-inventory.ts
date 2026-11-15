/**
 * `blocks-items.*` project validators of item inventories and bundles (ADR 0095 D1, D4). They
 * read the item elements only:
 *
 * - `blocks-items.max-stack-size` (error): a bag (`msm:item_inventory`) or a bundle
 *   (`msm:bundle`) whose `max_stack_size` is above 1. It holds its things in one stack, so the
 *   runtime and lowering force 1.
 *
 * They also report codes of the other validators, with the same meaning:
 *
 * - `blocks-items.component-conflict` (error): an item with both `msm:item_inventory` and
 *   `msm:bundle`, or either of them with one of {@link INVENTORY_CONFLICT_COMPONENTS} (the
 *   tool, weapon, armour, shield, throwable, food and consumable components: each owns the
 *   item's use or class; the same list as the Item Studio's Inventory hints, B453), or an
 *   `msm:components` entry for the vanilla component the bag or bundle sets (`container`,
 *   `bundle_contents`, and `max_stack_size` when the item does not set it itself; the plain
 *   `max_stack_size` field is `msm.blocks-items.component-conflict`'s).
 * - `blocks-items.container-layout-fields` (warning): a bag's `rows` with a layout other than
 *   `chest`; lowering drops them.
 * - `blocks-items.container-event-unknown` (error): a bag's `on_open` or `on_close` naming an
 *   event the item does not declare in `events`.
 *
 * `msm:durability` combines with both (it only forces the stack of 1 too); `msm:on_use` still
 * fires after a bag opens. Sound ids are the schema's (`schema.unknown-id`).
 */
import type { Element, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { ITEM_KIND } from './kinds';
import {
  BUNDLE_COMPONENT,
  bagLayoutOf,
  ITEM_INVENTORY_COMPONENT,
  isBundle,
  itemInventoryOf,
} from './lowering/item-inventory';
import { isRecord } from './lowering/paths';

/** Every code these validators report besides the shared ones. */
export const INVENTORY_PROBLEM_CODES = Object.freeze(['blocks-items.max-stack-size'] as const);

/**
 * The components a bag or a bundle cannot be combined with (ADR 0095 D1, D4; "weapon" covers
 * ranged weapons and shields), in the order of the Item Studio's `INVENTORY_CONFLICTS`.
 */
export const INVENTORY_CONFLICT_COMPONENTS: readonly string[] = Object.freeze([
  'msm:tool',
  'msm:ranged_weapon',
  'msm:armor',
  'msm:shield',
  'msm:throwable',
  'msm:food',
  'msm:consumable',
]);

/** The events of a bag, in the order checked. */
const BAG_EVENT_FIELDS = ['on_open', 'on_close'] as const;

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: string[]): string => keys.map((key) => `/${token(key)}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});

interface HoldingItem {
  element: Element;
  data: JsonObject;
  components: JsonObject;
  bag: JsonObject | undefined;
  bundle: boolean;
  /** The component the item's problems point at: the bag's, else the bundle's. */
  own: string;
}

const holdingItems = (elements: readonly Element[]): HoldingItem[] =>
  elements.flatMap((element) => {
    if (element.kind !== ITEM_KIND) return [];
    const data = dataOf(element);
    const bag = itemInventoryOf(data);
    const bundle = isBundle(data);
    if (bag === undefined && !bundle) return [];
    const components = isRecord(data.components) ? data.components : {};
    const own = bag !== undefined ? ITEM_INVENTORY_COMPONENT : BUNDLE_COMPONENT;
    return [{ element, data, components, bag, bundle, own }];
  });

const what = (item: HoldingItem): string => (item.bag !== undefined ? 'A bag' : 'A bundle');

function stackSizes(items: readonly HoldingItem[]): Problem[] {
  return items.flatMap((item) => {
    const stack = item.data.max_stack_size;
    if (typeof stack !== 'number' || stack <= 1) return [];
    return [
      {
        severity: 'error',
        code: 'blocks-items.max-stack-size',
        elementId: item.element.id,
        path: '/max_stack_size',
        message: `${what(item)} holds its things in one item, so it stacks to 1, not ${stack}. Set "max_stack_size" to 1.`,
      } satisfies Problem,
    ];
  });
}

/** The vanilla components the bag and the bundle set, without the `minecraft:` prefix. */
const SET_BY_BAG = 'container';
const SET_BY_BUNDLE = 'bundle_contents';

function conflicts(items: readonly HoldingItem[]): Problem[] {
  const problems: Problem[] = [];
  for (const item of items) {
    const { element, components, own } = item;
    if (item.bag !== undefined && item.bundle) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: element.id,
        path: pointer('components', BUNDLE_COMPONENT),
        message: `An item cannot be both a bag ("${ITEM_INVENTORY_COMPONENT}") and a bundle ("${BUNDLE_COMPONENT}"). Remove one of them.`,
      });
    }
    for (const other of INVENTORY_CONFLICT_COMPONENTS) {
      if (components[other] === undefined) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: element.id,
        path: pointer('components', other),
        message: `An item cannot have both "${own}" and "${other}": both decide what the item is and what using it does. Remove one of them.`,
      });
    }
    const passthrough = isRecord(components['msm:components'])
      ? components['msm:components']
      : undefined;
    if (passthrough === undefined) continue;
    const setters = new Map<string, string>();
    if (item.bag !== undefined) setters.set(SET_BY_BAG, ITEM_INVENTORY_COMPONENT);
    if (item.bundle) setters.set(SET_BY_BUNDLE, BUNDLE_COMPONENT);
    if (item.data.max_stack_size === undefined) setters.set('max_stack_size', own);
    for (const key of Object.keys(passthrough).sort()) {
      const id = key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : key;
      const setter = setters.get(id);
      if (setter === undefined) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: element.id,
        path: pointer('components', 'msm:components', key),
        message: `"${setter}" and the "msm:components" entry "${key}" both set the vanilla "${id}" component; "${setter}" wins. Remove "${key}" from "msm:components".`,
      });
    }
  }
  return problems;
}

function bagFields(items: readonly HoldingItem[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, bag } of items) {
    if (bag === undefined) continue;
    const layout = bagLayoutOf(bag);
    if (bag.rows !== undefined && layout !== 'chest') {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.container-layout-fields',
        elementId: element.id,
        path: pointer('components', ITEM_INVENTORY_COMPONENT, 'rows'),
        message: `"rows" is only used by the chest layout; a ${layout} bag has a fixed number of slots, so the rows are ignored. Remove "rows" or pick the chest layout.`,
      });
    }
    const events = isRecord(data.events) ? data.events : {};
    for (const field of BAG_EVENT_FIELDS) {
      const event = bag[field];
      if (typeof event !== 'string' || events[event] !== undefined) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.container-event-unknown',
        elementId: element.id,
        path: pointer('components', ITEM_INVENTORY_COMPONENT, field),
        message: `Event "${event}" is not declared in this item's "events". Add it there or pick an existing event.`,
      });
    }
  }
  return problems;
}

/** The validators. */
export const inventoryValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.item-inventory',
    kinds: [ITEM_KIND],
    validate: ({ elements }) => {
      const items = holdingItems(elements);
      return [...stackSizes(items), ...conflicts(items), ...bagFields(items)];
    },
  },
] satisfies ProjectValidator[]);
