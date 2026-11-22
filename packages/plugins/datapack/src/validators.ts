/**
 * `datapack.*` project validators: forms the vendored mcdoc accepts but the real servers of both
 * built-in targets refuse, found by the B600 spike (`docs/reference/spikes/b600/README.md`). Each is an
 * error, because the game stops starting on any registry file it cannot parse:
 *
 * - `datapack.predicate-not-object` / `datapack.item-modifier-not-object`: the file of a
 *   `minecraft:predicate` or `minecraft:item_modifier` must be one JSON object ("Not a JSON
 *   object"). A list or a bare id is fine inside a table, a `sequence` or an `all_of`, never as
 *   the file.
 * - `datapack.time-check-no-clock`: a `time_check` condition needs `clock`.
 * - `datapack.damage-tag-no-hash`: a damage tag in a `tags` list of a damage source predicate
 *   (`{ id, expected }`) is written `#namespace:path`; a bare id that is not a damage type is a
 *   tag written without its `#`.
 * - `datapack.block-transformer-state`: a block state in a block transformer is `{ id,
 *   properties }`; the old `{ Name }` form (or no `id`) stops the server ("List is too short: 0").
 */
import type { Element, Json, Problem, ProjectValidator } from '@msm/plugin-api';

/** Every code these validators report. */
export const DATAPACK_PROBLEM_CODES: readonly string[] = Object.freeze([
  'datapack.predicate-not-object',
  'datapack.item-modifier-not-object',
  'datapack.time-check-no-clock',
  'datapack.damage-tag-no-hash',
  'datapack.block-transformer-state',
]);

const PREDICATE = 'minecraft:predicate';
const ITEM_MODIFIER = 'minecraft:item_modifier';
const BLOCK_TRANSFORMER = 'minecraft:block_transformer';
/** Kinds whose data holds conditions: the walk looks for `time_check` and damage tags there. */
const CONDITION_KINDS: readonly string[] = [
  PREDICATE,
  ITEM_MODIFIER,
  'minecraft:loot_table',
  'minecraft:advancement',
  'minecraft:enchantment',
];

const isRecord = (value: unknown): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pointer = (parent: string, key: string | number): string =>
  `${parent}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;

function topLevel(element: Element, what: string, code: string): Problem[] {
  const data = element.data;
  if (isRecord(data)) return [];
  const form = Array.isArray(data) ? 'a list' : 'a single id';
  return [
    {
      severity: 'error',
      code,
      elementId: element.id,
      path: '',
      message: `A ${what} file must be one JSON object, but this one is ${form}. The game refuses to start with it. Put the ${Array.isArray(data) ? 'entries inside one object (for example an "all_of" or "sequence" of them)' : 'object itself here, not a reference to another file'}.`,
    },
  ];
}

function walkConditions(
  element: Element,
  value: Json,
  at: string,
  isDamageTagKnown: (id: string) => boolean,
  out: Problem[],
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      walkConditions(element, item, pointer(at, index), isDamageTagKnown, out);
    }
    return;
  }
  if (!isRecord(value)) return;
  const condition = value.condition;
  if (
    (condition === 'minecraft:time_check' || condition === 'time_check') &&
    value.clock === undefined
  ) {
    out.push({
      severity: 'error',
      code: 'datapack.time-check-no-clock',
      elementId: element.id,
      path: at,
      message:
        'A time check must say which clock it reads. Add "clock": "minecraft:overworld" (or another world clock); without it the game refuses to start.',
    });
  }
  const tags = value.tags;
  if (Array.isArray(tags)) {
    tags.forEach((tag, index) => {
      if (!isRecord(tag) || typeof tag.id !== 'string' || typeof tag.expected !== 'boolean') return;
      if (tag.id.startsWith('#') || isDamageTagKnown(tag.id)) return;
      out.push({
        severity: 'error',
        code: 'datapack.damage-tag-no-hash',
        elementId: element.id,
        path: pointer(pointer(pointer(at, 'tags'), index), 'id'),
        message: `"${tag.id}" is not a damage type, so it reads as a damage tag, and a tag is written with a "#" in front: "#${tag.id}". The game refuses to start without it.`,
      });
    });
  }
  for (const [key, child] of Object.entries(value)) {
    walkConditions(element, child, pointer(at, key), isDamageTagKnown, out);
  }
}

function walkStates(element: Element, value: Json, at: string, out: Problem[]): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) walkStates(element, item, pointer(at, index), out);
    return;
  }
  if (!isRecord(value)) return;
  const state = value.state;
  if (isRecord(state) && typeof state.id !== 'string') {
    out.push({
      severity: 'error',
      code: 'datapack.block-transformer-state',
      elementId: element.id,
      path: pointer(at, 'state'),
      message:
        'A block state here is written {"id": "namespace:block", "properties": {...}}; "Name" is the old form. The game refuses to start with it.',
    });
  }
  for (const [key, child] of Object.entries(value))
    walkStates(element, child, pointer(at, key), out);
}

export const datapackValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.datapack.formats',
    kinds: [...CONDITION_KINDS, BLOCK_TRANSFORMER],
    validate: ({ elements, registry }) => {
      const problems: Problem[] = [];
      const damageTypeKnown = (id: string): boolean => registry.has('damage_type', id);
      for (const element of elements) {
        if (element.kind === PREDICATE) {
          problems.push(...topLevel(element, 'predicate', 'datapack.predicate-not-object'));
        } else if (element.kind === ITEM_MODIFIER) {
          problems.push(...topLevel(element, 'item modifier', 'datapack.item-modifier-not-object'));
        }
        if (CONDITION_KINDS.includes(element.kind)) {
          walkConditions(element, element.data as Json, '', damageTypeKnown, problems);
        } else if (element.kind === BLOCK_TRANSFORMER) {
          walkStates(element, element.data as Json, '', problems);
        }
      }
      return problems;
    },
  },
]);
