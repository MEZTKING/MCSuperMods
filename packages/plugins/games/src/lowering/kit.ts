/**
 * Lowering of `msm:kit` (ADR 0132 D3; B724): one function, `<ns>:msm_games/kit/<path>/give`, run
 * as the player who gets the kit (a role, the `kit_on` mechanic, a Rules step, a command). In
 * order: the inventory cleared (`clear_first`: `clear` takes the armour and the off hand too),
 * each item given (`give`, or `item replace` into its slot), the armour put on, the off hand
 * filled and the effects given. An item's components are written into the item argument
 * (`<item>[<component>=<value>,...]`), their JSON turned into SNBT.
 *
 * Effects are not cleared first: the target lists no form of `effect clear` without an effect
 * (verify at implementation: a bare `effect_clear_all` form for B723's facts); an effect the kit
 * gives replaces the player's own.
 */
import type { Element, Json, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { dataOf, fillForm, functionFile, isRecord, num, splitId } from './shared-functions';

/** The slot of each piece of armour, as `/item replace` names it. */
export const ARMOUR_SLOTS = Object.freeze({
  head: 'armor.head',
  chest: 'armor.chest',
  legs: 'armor.legs',
  feet: 'armor.feet',
} as const);

/** The off hand's slot. */
export const OFF_HAND_SLOT = 'weapon.offhand';

/** The most items `clear` takes: every one. */
const CLEAR_ALL = 2_147_483_647;

const UNQUOTED_KEY = /^[A-Za-z0-9_\-.+]+$/;

/** A JSON value written as SNBT (the form an item argument's components take). */
export function snbtOf(value: Json): string {
  if (value === null) return '{}';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(snbtOf).join(',')}]`;
  return `{${Object.entries(value)
    .map(([key, entry]) => `${UNQUOTED_KEY.test(key) ? key : JSON.stringify(key)}:${snbtOf(entry)}`)
    .join(',')}}`;
}

/** An item argument: the id, and its components when it has any. */
export function itemArgument(item: string, components: Json | undefined): string {
  if (!isRecord(components)) return item;
  const entries = Object.entries(components);
  if (entries.length === 0) return item;
  return `${item}[${entries.map(([id, value]) => `${id}=${snbtOf(value)}`).join(',')}]`;
}

/** A whole count from 1 to 99. */
const countOf = (value: Json | undefined): number =>
  Math.min(99, Math.max(1, Math.trunc(num(value, 1))));

/** The lines that give one stack to `@s`, into its slot or the first free one. */
function stackLine(target: TargetFacts, stack: JsonObject, slot: string | undefined): string[] {
  if (typeof stack.item !== 'string' || stack.item === '') return [];
  const item = itemArgument(stack.item, stack.components);
  const count = countOf(stack.count);
  return [
    slot === undefined || slot === ''
      ? fillForm(target, 'give', { players: '@s', item, count })
      : fillForm(target, 'item_replace_entity', { entities: '@s', item_slot: slot, item, count }),
  ];
}

/** The lines of a kit's `give` function. */
export function kitLines(data: Json, target: TargetFacts): string[] {
  const kit = dataOf(data);
  const lines: string[] = [];
  if (kit.clear_first === true) {
    lines.push(
      fillForm(target, 'clear', { players: '@s', item_predicate: '*', max_count: CLEAR_ALL }),
    );
  }
  for (const stack of Array.isArray(kit.items) ? kit.items.filter(isRecord) : []) {
    lines.push(
      ...stackLine(target, stack, typeof stack.slot === 'string' ? stack.slot : undefined),
    );
  }
  const armour = isRecord(kit.armour) ? kit.armour : {};
  for (const [piece, slot] of Object.entries(ARMOUR_SLOTS)) {
    const entry = armour[piece];
    if (isRecord(entry)) lines.push(...stackLine(target, entry, slot));
  }
  if (isRecord(kit.off_hand)) lines.push(...stackLine(target, kit.off_hand, OFF_HAND_SLOT));
  for (const effect of Array.isArray(kit.effects) ? kit.effects.filter(isRecord) : []) {
    if (typeof effect.effect !== 'string' || effect.effect === '') continue;
    lines.push(
      fillForm(target, 'effect_give', {
        entities: '@s',
        effect: effect.effect,
        seconds: Math.max(1, Math.trunc(num(effect.seconds, 30))),
        amplifier: Math.max(0, Math.trunc(num(effect.amplifier, 0))),
        hide_particles: effect.hide_particles === true,
      }),
    );
  }
  return lines;
}

/** Lowers one kit to its `give` function. */
export function lowerKit(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  return [functionFile(target, namespace, `kit/${path}/give`, kitLines(element.data, target))];
}
