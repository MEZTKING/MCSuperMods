/**
 * Cross-element checks of blocks, items and mod metadata (ADR 0025 D8). Every validator is
 * pure and reads only the project's elements, the target and the registry ids. Codes:
 *
 * - `blocks-items.missing-model` (warning): a block or item without `model`; it renders as the
 *   missing-model cube and gets no block state or item model definition.
 * - `blocks-items.unknown-event` (error): an `event` field of a trigger component
 *   (`msm:on_interact`, `msm:on_step`, `msm:on_use`, the `on_powered` and `on_unpowered` of
 *   `msm:redstone`) or a `trigger_event` action naming an event the element does not declare.
 * - `blocks-items.event-cycle` (error): events whose `trigger_event` actions call each other in
 *   a loop; the runtime would stop the chain at 16 levels with a logged error.
 * - `blocks-items.bad-mod-id` (error): an `msm:mod` whose `mod_id` breaks Fabric's rule
 *   `^[a-z][a-z0-9_-]{1,63}$` (the schema checks the length only).
 * - `blocks-items.unknown-tool-tier` (error): a `min_tier` of `msm:breakable` or a `tier` of
 *   `msm:tool` that the target has no tool material for (no
 *   `minecraft:incorrect_for_<tier>_tool` block tag). Skipped when the registry has no block
 *   tags at all.
 * - `blocks-items.item-collision` (error): an `msm:item` with the id of an `msm:block` that
 *   registers its own block item (`item` is not `false`).
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND, MOD_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { incorrectForTierTag } from './lowering/tools';

/** The Fabric mod id rule (ADR 0025 D6). */
export const MOD_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

/** Every code the validators report. */
export const BLOCKS_ITEMS_PROBLEM_CODES = Object.freeze([
  'blocks-items.missing-model',
  'blocks-items.unknown-event',
  'blocks-items.event-cycle',
  'blocks-items.bad-mod-id',
  'blocks-items.unknown-tool-tier',
  'blocks-items.item-collision',
] as const);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

const definitions = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === BLOCK_KIND || element.kind === ITEM_KIND);

/** The trigger component fields that name an event, per kind: `[component, field]`. */
const EVENT_FIELDS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  [BLOCK_KIND]: [
    ['msm:on_interact', 'event'],
    ['msm:on_step', 'event'],
    ['msm:redstone', 'on_powered'],
    ['msm:redstone', 'on_unpowered'],
  ],
  [ITEM_KIND]: [['msm:on_use', 'event']],
};

/** One event reference inside an element. */
interface EventReference {
  event: string;
  path: string;
  /** The event whose action makes the reference, for `trigger_event`; absent for components. */
  from?: string;
}

function eventReferences(element: Element): EventReference[] {
  const data = dataOf(element);
  const references: EventReference[] = [];
  const components = record(data.components);
  for (const [component, field] of EVENT_FIELDS[element.kind] ?? []) {
    const value = record(components?.[component])?.[field];
    if (typeof value === 'string') {
      references.push({ event: value, path: pointer('components', component, field) });
    }
  }
  const events = record(data.events) ?? {};
  for (const [name, event] of Object.entries(events)) {
    const actions = record(event)?.actions;
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      const fields = record(action);
      if (fields?.type === 'trigger_event' && typeof fields.event === 'string') {
        references.push({
          event: fields.event,
          path: pointer('events', name, 'actions', index, 'event'),
          from: name,
        });
      }
    });
  }
  return references;
}

const declaredEvents = (element: Element): Set<string> =>
  new Set(Object.keys(record(dataOf(element).events) ?? {}));

function unknownEvents(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of definitions(elements)) {
    const declared = declaredEvents(element);
    for (const reference of eventReferences(element)) {
      if (declared.has(reference.event)) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.unknown-event',
        elementId: element.id,
        path: reference.path,
        message: `Event "${reference.event}" is not declared in this element's "events". Add it there or pick an existing event.`,
      });
    }
  }
  return problems;
}

/** Strongly connected components with more than one node or a self-loop, each sorted. */
function cycles(nodes: readonly string[], edges: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, index.get(next) as number));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || edges.get(node)?.has(node) === true) found.push(component.sort());
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return found;
}

function eventCycles(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of definitions(elements)) {
    const declared = declaredEvents(element);
    const edges = new Map<string, Set<string>>();
    for (const reference of eventReferences(element)) {
      if (reference.from === undefined || !declared.has(reference.event)) continue;
      const targets = edges.get(reference.from) ?? new Set<string>();
      targets.add(reference.event);
      edges.set(reference.from, targets);
    }
    for (const cycle of cycles([...declared].sort(), edges)) {
      const names = cycle.map((name) => `"${name}"`).join(', ');
      problems.push({
        severity: 'error',
        code: 'blocks-items.event-cycle',
        elementId: element.id,
        path: pointer('events', cycle[0] as string),
        message: `Events ${names} trigger each other in a loop. The game stops such a chain after 16 steps and logs an error; remove one of the "trigger_event" actions.`,
      });
    }
  }
  return problems;
}

function badModIds(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== MOD_KIND) continue;
    const modId = dataOf(element).mod_id;
    if (typeof modId !== 'string' || MOD_ID_PATTERN.test(modId)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.bad-mod-id',
      elementId: element.id,
      path: '/mod_id',
      message: `Mod id "${modId}" is not valid for Fabric: use a lower-case letter, then 1 to 63 lower-case letters, digits, "_" or "-".`,
    });
  }
  return problems;
}

function unknownToolTiers(
  elements: readonly Element[],
  registry: ValidationRegistry,
  targetId: string,
): Problem[] {
  if (registry.ids('tag/block').length === 0) return [];
  const problems: Problem[] = [];
  const check = (element: Element, tier: Json | undefined, path: string): void => {
    if (typeof tier !== 'string' || registry.has('tag/block', incorrectForTierTag(tier))) return;
    problems.push({
      severity: 'error',
      code: 'blocks-items.unknown-tool-tier',
      elementId: element.id,
      path,
      message: `Tool tier "${tier}" does not exist in ${targetId}: the target has no "${incorrectForTierTag(tier)}" block tag.`,
    });
  };
  for (const element of definitions(elements)) {
    const components = record(dataOf(element).components);
    if (element.kind === BLOCK_KIND) {
      const breakable = record(components?.['msm:breakable']);
      check(element, breakable?.min_tier, pointer('components', 'msm:breakable', 'min_tier'));
    } else {
      const tool = record(components?.['msm:tool']);
      check(element, tool?.tier, pointer('components', 'msm:tool', 'tier'));
    }
  }
  return problems;
}

function missingModels(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of definitions(elements)) {
    const model = dataOf(element).model;
    if (typeof model === 'string' && model.length > 0) continue;
    const what = element.kind === BLOCK_KIND ? 'block' : 'item';
    problems.push({
      severity: 'warning',
      code: 'blocks-items.missing-model',
      elementId: element.id,
      path: '/model',
      message: `This ${what} has no model, so it shows as the purple and black missing-model cube. Pick a model.`,
    });
  }
  return problems;
}

function itemCollisions(elements: readonly Element[]): Problem[] {
  const blocksWithItems = new Set(
    elements
      .filter((element) => element.kind === BLOCK_KIND && dataOf(element).item !== false)
      .map((element) => element.id),
  );
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== ITEM_KIND || !blocksWithItems.has(element.id)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.item-collision',
      elementId: element.id,
      message: `Block "${element.id}" already registers an item with this id. Rename the item, or set "item": false on the block.`,
    });
  }
  return problems;
}

const DEFINITION_KINDS = [BLOCK_KIND, ITEM_KIND] as const;

export const blocksItemsValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.missing-model',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => missingModels(elements),
  },
  {
    id: 'msm.blocks-items.unknown-event',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => unknownEvents(elements),
  },
  {
    id: 'msm.blocks-items.event-cycle',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => eventCycles(elements),
  },
  {
    id: 'msm.blocks-items.mod-id',
    kinds: [MOD_KIND],
    validate: ({ elements }) => badModIds(elements),
  },
  {
    id: 'msm.blocks-items.tool-tier',
    kinds: DEFINITION_KINDS,
    validate: ({ elements, registry, target }) => unknownToolTiers(elements, registry, target.id),
  },
  {
    id: 'msm.blocks-items.item-collision',
    kinds: DEFINITION_KINDS,
    validate: ({ elements }) => itemCollisions(elements),
  },
] satisfies ProjectValidator[]);
