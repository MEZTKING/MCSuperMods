/**
 * The words on a chip: what a slot of a step, condition or trigger says, in the same words as
 * the plugin's sentences (`@msm/plugin-rules` `ruleSentence`), with the defaults an absent
 * optional slot means, and the label that names the slot for screen readers.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import {
  formatNumber,
  placeSentence,
  type SentenceContext,
  type SlotSpec,
  type TriggerEntry,
  textSentence,
  valueSentence,
  whoSentence,
} from '@msm/plugin-rules';
import type { ThingSort } from '../../components/thing-picker/thing-sources';
import { asObject, type JsonObject } from './rules-model';

/** The sorts of thing a slot type picks; other slot types have their own editors. */
export const THING_SLOTS: Readonly<Partial<Record<SlotSpec['type'], ThingSort>>> = {
  item: 'item',
  block: 'block',
  mob: 'mob',
  sound: 'sound',
  particle: 'particle',
  effect: 'effect',
  function: 'function',
  dimension: 'dimension',
  key: 'key',
  vehicle: 'vehicle',
};

/** Names of slots for screen readers ("Item: Ruby"). */
const SLOT_LABELS: Readonly<Record<string, string>> = {
  subject: 'Thing',
  who: 'Who',
  where: 'Where',
  to: 'To',
  from: 'From',
  count: 'How many',
  amount: 'Amount',
  seconds: 'How long',
  interval_seconds: 'How often',
  cooldown_seconds: 'Wait before again',
  message_contains: 'Message contains',
  percent: 'Chance',
  chance: 'Chance',
  number: 'Number',
  compare: 'Compared',
  times: 'Times',
  radius: 'Distance',
  level: 'Level',
  text: 'Text',
  title: 'Title',
  subtitle: 'Subtitle',
  counter: 'Counter',
  drop_items: 'Drops',
  break_blocks: 'Breaking blocks',
  bar: 'Boss bar',
  hud: 'On screen',
  weapon: 'Weapon',
};

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/** The label naming a slot ("Item", "How many"). */
export function slotLabel(slot: SlotSpec): string {
  return SLOT_LABELS[slot.name] ?? capitalise(slot.name.replace(/_/g, ' '));
}

/** The words of an empty slot: what to pick ("pick an item"). */
export function emptyWords(slot: SlotSpec): string {
  switch (slot.type) {
    case 'item':
      return 'pick an item';
    case 'block':
      return 'pick a block';
    case 'mob':
      return 'pick a mob';
    case 'sound':
      return 'pick a sound';
    case 'particle':
      return 'pick particles';
    case 'effect':
      return 'pick an effect';
    case 'function':
      return 'pick a function';
    case 'dimension':
      return 'pick a dimension';
    case 'counter':
      return 'pick a counter';
    case 'key':
      return 'pick one of your keys';
    case 'vehicle':
      return 'pick one of your vehicles';
    case 'hud':
      return 'pick what to show';
    case 'weapon':
      return 'the first weapon';
    case 'text':
      return 'type some text';
    default:
      return `set ${slotLabel(slot).toLowerCase()}`;
  }
}

const seconds = (value: number): string =>
  `${formatNumber(value)} ${value === 1 ? 'second' : 'seconds'}`;

const COUNTER_OWNERS: Record<string, string> = {
  player: "the player's",
  mob: "the mob's",
  world: "the world's",
};

/** The words of a counter named in `object` (`counter` and `scope`). */
export function counterWords(object: JsonObject | undefined): string | undefined {
  const name = object?.counter;
  if (typeof name !== 'string') return undefined;
  const scope = typeof object?.scope === 'string' ? object.scope : '';
  return `${COUNTER_OWNERS[scope] ?? 'the'} ${name.replace(/_/g, ' ')}`;
}

/**
 * What a chip of `slot` says, given its owner object, with the slot's prefix ("for 5 seconds");
 * `undefined` when the slot is empty.
 */
export function slotWords(
  slot: SlotSpec,
  owner: JsonObject,
  context: SentenceContext,
  defaults: Readonly<Record<string, Json>> = {},
): string | undefined {
  const words = bareSlotWords(slot, owner, context, defaults);
  return words === undefined || slot.prefix === undefined ? words : `${slot.prefix} ${words}`;
}

function bareSlotWords(
  slot: SlotSpec,
  owner: JsonObject,
  context: SentenceContext,
  defaults: Readonly<Record<string, Json>> = {},
): string | undefined {
  if (slot.type === 'counter') return counterWords(owner);
  const raw = owner[slot.name] ?? defaults[slot.name];
  if (raw === undefined) return undefined;
  switch (slot.type) {
    case 'item':
    case 'block':
    case 'mob':
    case 'sound':
    case 'effect':
    case 'function':
    case 'dimension':
    case 'key':
    case 'vehicle':
    case 'hud':
      return typeof raw === 'string' ? (context.names(raw) ?? raw) : undefined;
    case 'particle': {
      const id = typeof raw === 'string' ? raw : asObject(raw)?.type;
      return typeof id === 'string' ? (context.names(id) ?? id) : undefined;
    }
    case 'number':
      if (slot.name === 'level' && typeof raw === 'number') return `level ${formatNumber(raw)}`;
      return valueSentence(raw, context);
    case 'seconds':
      return typeof raw === 'number' ? seconds(raw) : `${valueSentence(raw, context)} seconds`;
    case 'percent':
      return typeof raw === 'number' ? `${formatNumber(raw)}%` : `${valueSentence(raw, context)}%`;
    case 'text':
      return Array.isArray(raw) ? textSentence(raw, context) : `"${String(raw)}"`;
    case 'place':
      return placeSentence(raw, context);
    case 'who':
      return whoSentence(raw, context);
    case 'choice':
      return slot.choices?.find((choice) => choice.value === raw)?.label ?? String(raw);
    default:
      return String(raw);
  }
}

/** The defaults an absent optional slot means on a step (as the plugin's sentences read them). */
export function stepDefaults(defaultWho: string | undefined): Record<string, Json> {
  const defaults: Record<string, Json> = { count: 1, where: 'here' };
  if (defaultWho !== undefined) defaults.who = defaultWho;
  return defaults;
}

/** The defaults an absent trigger option means, and words for the ones without a default. */
export const WHEN_DEFAULTS: Readonly<Record<string, Json>> = { interval_seconds: 1, hand: 'main' };
export const WHEN_ABSENT_WORDS: Readonly<Record<string, string>> = {
  message_contains: 'with any message',
};

/** The defaults an absent optional slot means on a condition. */
export const CONDITION_DEFAULTS: Readonly<Record<string, Json>> = {
  count: 1,
  where: 'here',
  who: 'other',
};

/** A sentence context over display names and a trigger. */
export function sentenceContext(
  name: (id: string) => string,
  trigger: TriggerEntry | undefined,
): SentenceContext {
  return { names: (id) => name(id), trigger };
}

/** Splits a sentence template into text and `{slot}` parts, in order. */
export function sentenceParts(
  template: string,
): ({ text: string; slot?: undefined } | { slot: string; text?: undefined })[] {
  const parts: ({ text: string; slot?: undefined } | { slot: string; text?: undefined })[] = [];
  const pattern = /\{([a-z_]+)\}/g;
  let last = 0;
  for (let match = pattern.exec(template); match !== null; match = pattern.exec(template)) {
    if (match.index > last) parts.push({ text: template.slice(last, match.index) });
    parts.push({ slot: match[1] as string });
    last = match.index + match[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}
