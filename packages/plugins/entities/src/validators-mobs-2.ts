/**
 * Cross-element checks of fish buckets, flight modes and the five habits (ADR 0109 D1, D3 and
 * D4, as amended after the B524 spike). Every validator is pure and reads only the project's
 * elements, the target's facts and the registry ids. Codes:
 *
 * - `entities.bucketable-needs-swim` (error): `msm:bucketable` on a mob whose `msm:movement`
 *   `mode` is not `swim`; the runtime drops the component with a warning.
 * - `entities.bucket-fields-unused` (info): `bucket_display_name` or `bucket_texture` on a mob
 *   without `msm:bucketable`, so there is no bucket for them.
 * - `entities.dash-needs-walk` (error): `msm:rideable.dash` on a mob that neither walks nor is
 *   amphibious; the runtime does not apply the component.
 * - `entities.swoop-needs-flight` (error): a `swoop` goal on a mob that does not move by `fly`,
 *   `hover` or `phase`; it cannot circle above its target.
 * - `entities.hover-height-unused` (info): `msm:movement.hover_height` on a mob whose `mode` is
 *   not `hover`, so the height is not used.
 * - `entities.habit-loot-table-unknown` (warning): the `loot_table` of a `barter` or `dig_items`
 *   goal is neither a project loot table (nor a project block's own `blocks/` table) nor a loot
 *   table of the target, so each roll drops nothing. Skipped when the registry index has no loot
 *   tables.
 * - `entities.dig-block-unknown` (warning): a `dig_items` goal's `dig_blocks` entry is neither a
 *   block nor a block tag of the project or the target, so the mob never digs there. Skipped
 *   for vanilla ids when the registry index has no blocks (or block tags).
 * - `entities.collect-without-owner` (info): a `collect_items` goal on a mob without
 *   `msm:tameable` and with `note_blocks` `false`, so it has nobody and nowhere to bring items to.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import { ENTITY_KIND } from './kinds';
import { BUCKET_ELEMENT_ONLY_FIELDS, BUCKETABLE_COMPONENT } from './lowering/bucket';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const ENTITIES_MOB2_PROBLEM_CODES = Object.freeze([
  'entities.bucketable-needs-swim',
  'entities.bucket-fields-unused',
  'entities.dash-needs-walk',
  'entities.swoop-needs-flight',
  'entities.hover-height-unused',
  'entities.habit-loot-table-unknown',
  'entities.dig-block-unknown',
  'entities.collect-without-owner',
] as const);

/** Kinds of other plugins, read by kind string only. */
const BLOCK_KIND = 'msm:block';
const LOOT_TABLE_KIND = 'minecraft:loot_table';
const BLOCK_TAG_KIND = 'minecraft:tag/block';

const MOVEMENT = 'msm:movement';
const RIDEABLE = 'msm:rideable';
const AI_GOALS = 'msm:ai_goals';

/** Movement modes that may dash (ADR 0109 D4). */
const DASH_MODES: ReadonlySet<string> = new Set(['walk', 'amphibious']);
/** Movement modes that may swoop (ADR 0109 D3). */
const SWOOP_MODES: ReadonlySet<string> = new Set(['fly', 'hover', 'phase']);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

const entities = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === ENTITY_KIND);

const component = (element: Element, name: string): JsonObject | undefined =>
  record(record(dataOf(element).components)?.[name]);

/** The mob's movement mode; absent means `walk` (ADR 0070 D3). */
const modeOf = (element: Element): string => {
  const mode = component(element, MOVEMENT)?.mode;
  return typeof mode === 'string' ? mode : 'walk';
};

/** The goals of `msm:ai_goals`, with their index. */
function goalsOf(element: Element): { goal: JsonObject; index: number }[] {
  const goals = component(element, AI_GOALS)?.goals;
  if (!Array.isArray(goals)) return [];
  const found: { goal: JsonObject; index: number }[] = [];
  goals.forEach((goal, index) => {
    const fields = record(goal);
    if (fields !== undefined) found.push({ goal: fields, index });
  });
  return found;
}

/** `minecraft:` added to a bare id, as the game reads it. */
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/**
 * A test for block references (`<id>` or `#<tag>`): true for a project `msm:block` (or block
 * tag element), a block or block tag in the registry index, and any vanilla-looking id when the
 * index has no ids of that registry (nothing to check against). An empty string is never known.
 */
export function blockReferenceTest(
  elements: readonly Element[],
  registry: ValidationRegistry,
): (reference: string) => boolean {
  const blocks = new Set<string>();
  const tags = new Set<string>();
  for (const element of elements) {
    if (element.kind === BLOCK_KIND) blocks.add(element.id);
    if (element.kind === BLOCK_TAG_KIND) tags.add(element.id);
  }
  const checkBlocks = registry.ids('block').length > 0;
  const checkTags = registry.ids('tag/block').length > 0;
  return (reference) => {
    if (reference.length === 0 || reference === '#') return false;
    if (reference.startsWith('#')) {
      const id = namespaced(reference.slice(1));
      return tags.has(id) || !checkTags || registry.has('tag/block', id);
    }
    const id = namespaced(reference);
    return blocks.has(id) || !checkBlocks || registry.has('block', id);
  };
}

function bucketChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const bucketable = component(element, BUCKETABLE_COMPONENT);
    if (bucketable !== undefined) {
      const mode = modeOf(element);
      if (mode !== 'swim') {
        problems.push({
          severity: 'error',
          code: 'entities.bucketable-needs-swim',
          elementId: element.id,
          path: pointer('components', BUCKETABLE_COMPONENT),
          message: `Only swimming mobs can be caught in a bucket, and this mob's movement is "${mode}"; the game leaves "${BUCKETABLE_COMPONENT}" out. Set "msm:movement" "mode" to "swim", or remove the component.`,
        });
      }
      continue;
    }
    const data = dataOf(element);
    for (const field of BUCKET_ELEMENT_ONLY_FIELDS) {
      if (data[field] === undefined) continue;
      problems.push({
        severity: 'info',
        code: 'entities.bucket-fields-unused',
        elementId: element.id,
        path: pointer(field),
        message: `"${field}" is for the bucket this mob is caught in, but it has no "${BUCKETABLE_COMPONENT}" component, so there is no bucket. Add the component, or remove the field.`,
      });
    }
  }
  return problems;
}

function flightChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const mode = modeOf(element);
    const dash = component(element, RIDEABLE)?.dash;
    if (dash !== undefined && !DASH_MODES.has(mode)) {
      problems.push({
        severity: 'error',
        code: 'entities.dash-needs-walk',
        elementId: element.id,
        path: pointer('components', RIDEABLE, 'dash'),
        message: `A dash is a leap along the ground, and this mob's movement is "${mode}"; the game leaves "${RIDEABLE}" out. Use "walk" or "amphibious" movement, or remove "dash".`,
      });
    }
    for (const { goal, index } of goalsOf(element)) {
      if (goal.type !== 'swoop' || SWOOP_MODES.has(mode)) continue;
      problems.push({
        severity: 'error',
        code: 'entities.swoop-needs-flight',
        elementId: element.id,
        path: pointer('components', AI_GOALS, 'goals', index),
        message: `Only flying mobs can swoop, and this mob's movement is "${mode}", so it cannot circle above its target. Set "msm:movement" "mode" to "fly", "hover" or "phase", or remove the goal.`,
      });
    }
    const height = component(element, MOVEMENT)?.hover_height;
    if (height !== undefined && mode !== 'hover') {
      problems.push({
        severity: 'info',
        code: 'entities.hover-height-unused',
        elementId: element.id,
        path: pointer('components', MOVEMENT, 'hover_height'),
        message: `"hover_height" is only used by hovering mobs, and this mob's movement is "${mode}". Set "mode" to "hover", or remove the field.`,
      });
    }
  }
  return problems;
}

function lootTableTest(
  elements: readonly Element[],
  registry: ValidationRegistry,
): ((id: string) => boolean) | undefined {
  if (registry.ids('loot_table').length === 0) return undefined;
  const known = new Set<string>();
  for (const element of elements) {
    if (element.kind === LOOT_TABLE_KIND) known.add(element.id);
    if (element.kind === BLOCK_KIND) {
      const colon = element.id.indexOf(':');
      known.add(`${element.id.slice(0, colon)}:blocks/${element.id.slice(colon + 1)}`);
    }
  }
  return (id) => known.has(namespaced(id)) || registry.has('loot_table', namespaced(id));
}

function habitChecks(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const lootKnown = lootTableTest(elements, registry);
  const blockKnown = blockReferenceTest(elements, registry);
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const tameable = component(element, 'msm:tameable') !== undefined;
    for (const { goal, index } of goalsOf(element)) {
      const at = (...keys: (string | number)[]): string =>
        pointer('components', AI_GOALS, 'goals', index, ...keys);
      if (goal.type === 'barter' || goal.type === 'dig_items') {
        const table = goal.loot_table;
        if (typeof table === 'string' && lootKnown !== undefined && !lootKnown(table)) {
          problems.push({
            severity: 'warning',
            code: 'entities.habit-loot-table-unknown',
            elementId: element.id,
            path: at('loot_table'),
            message: `Loot table "${table}" is not in the project or in the game, so the mob ${goal.type === 'barter' ? 'takes the item and gives nothing back' : 'digs up nothing'}. Make the loot table, or pick one such as ${goal.type === 'barter' ? 'minecraft:gameplay/piglin_bartering' : 'minecraft:gameplay/sniffer_digging'}.`,
          });
        }
      }
      if (goal.type === 'dig_items' && Array.isArray(goal.dig_blocks)) {
        goal.dig_blocks.forEach((block, blockIndex) => {
          if (typeof block !== 'string' || blockKnown(block)) return;
          problems.push({
            severity: 'warning',
            code: 'entities.dig-block-unknown',
            elementId: element.id,
            path: at('dig_blocks', blockIndex),
            message: `"${block}" is not a block or block tag of the project or the game, so the mob never digs there. Pick a block such as minecraft:moss_block, or a tag such as #minecraft:dirt.`,
          });
        });
      }
      if (goal.type === 'collect_items' && goal.note_blocks === false && !tameable) {
        problems.push({
          severity: 'info',
          code: 'entities.collect-without-owner',
          elementId: element.id,
          path: at(),
          message:
            'This mob collects items, but it has no owner (no "msm:tameable") and does not listen to note blocks, so it has nobody to bring them to and keeps them. Add "msm:tameable", or set "note_blocks" to true.',
        });
      }
    }
  }
  return problems;
}

/** The validators of ADR 0109, registered after the mob validators of `validators-mobs.ts`. */
export const entitiesMob2Validators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.entities.bucketable',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => bucketChecks(elements),
  },
  {
    id: 'msm.entities.flight',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => flightChecks(elements),
  },
  {
    id: 'msm.entities.habits',
    kinds: [ENTITY_KIND, BLOCK_KIND, LOOT_TABLE_KIND, BLOCK_TAG_KIND],
    validate: ({ elements, registry }) => habitChecks(elements, registry),
  },
] satisfies ProjectValidator[]);
