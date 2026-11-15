/**
 * The plain-language text of a rule (ADR 0082 D1): "When a player uses Ruby Block, if the player
 * is sneaking, give the player 2 Ruby and play Chime here." Used by the generated script's
 * comments, the AI helper and the cards. Names come from the caller (project display names,
 * vanilla names); an id without a name is shown in words made from its path.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { asArray, asObject, bool, conditionList, num, stepList, str } from './book';
import {
  conditionById,
  placeById,
  type SlotSpec,
  stepById,
  type TriggerEntry,
  triggerById,
  valueById,
  whoById,
} from './catalogue';

/** Display names by id; `undefined` falls back to words made from the id. */
export type RuleNames = (id: string) => string | undefined;

/** Words made from an id: `minecraft:block.note_block.chime` is "Chime", `a:ruby_ore` "Ruby ore". */
export function humanizeId(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const last =
    path
      .split(/[/.]/)
      .filter((part) => part.length > 0)
      .pop() ?? path;
  const words = last.replace(/_/g, ' ').trim();
  return words.length === 0 ? id : words.charAt(0).toUpperCase() + words.slice(1);
}

/** A number as people write it: no trailing zeros, at most two decimals. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

/** A key bind's own default `hold_interval_ticks` (10) in seconds, as "every" of a held key. */
const KEY_HOLD_SECONDS = 0.5;

const seconds = (value: number): string =>
  `${formatNumber(value)} ${value === 1 ? 'second' : 'seconds'}`;

/** What the words of a slot depend on: names and the trigger (its actor labels). */
export interface SentenceContext {
  readonly names: RuleNames;
  readonly trigger: TriggerEntry | undefined;
}

const nameOf = (context: SentenceContext, id: string): string =>
  context.names(id) ?? humanizeId(id);

const COUNTER_OWNERS: Record<string, string> = {
  player: "the player's",
  mob: "the mob's",
  world: "the world's",
};

const counterWords = (object: JsonObject): string => {
  const name = str(object, 'counter') ?? 'counter';
  const owner = COUNTER_OWNERS[str(object, 'scope') ?? ''] ?? 'the';
  return `${owner} ${name.replace(/_/g, ' ')}`;
};

/** Whose facing a `facing` value or an "is facing" condition reads. */
const FACING_WORDS: Record<string, string> = {
  here: 'the block here',
  player: 'the player',
  mob: 'the mob',
  other: 'the other one',
};

/** The words of a number slot: a number or a reading. */
export function valueSentence(value: Json | undefined, context: SentenceContext): string {
  if (typeof value === 'number') return formatNumber(value);
  const object = asObject(value);
  const kind = str(object, 'value');
  if (object === undefined || kind === undefined) return 'a number';
  const entry = valueById(kind);
  if (entry === undefined) return `an unknown value (${kind})`;
  switch (kind) {
    case 'random':
      return `a random number from ${formatNumber(num(object, 'min') ?? 0)} to ${formatNumber(num(object, 'max') ?? 0)}`;
    case 'counter':
      return counterWords(object);
    case 'player_position':
      return `the player's ${str(object, 'axis') ?? 'x'} position`;
    case 'vehicle_ammo': {
      const weapon = str(object, 'weapon');
      return weapon === undefined
        ? "the vehicle's ammunition"
        : `the vehicle's ammunition for the weapon "${weapon}"`;
    }
    case 'facing':
      return `the way ${FACING_WORDS[str(object, 'of') ?? 'here'] ?? 'the block here'} faces`;
    case 'math': {
      const op = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' }[
        str(object, 'op') ?? '+'
      ];
      return `(${valueSentence(object.a, context)} ${op ?? 'plus'} ${valueSentence(object.b, context)})`;
    }
    default:
      return entry.sentence;
  }
}

/** The words of a text slot: its pieces, readings in square brackets, in quotes. */
export function textSentence(value: Json | undefined, context: SentenceContext): string {
  const pieces = asArray(value).map((piece) =>
    typeof piece === 'string' ? piece : `[${valueSentence(piece, context)}]`,
  );
  return `"${pieces.join('')}"`;
}

const ACTOR_OF_WHO: Record<string, 'player' | 'mob' | 'other'> = {
  player: 'player',
  mob: 'mob',
  other: 'other',
};

/** The words of a "who". */
export function whoSentence(value: Json | undefined, context: SentenceContext): string {
  if (typeof value === 'string') {
    const actor = ACTOR_OF_WHO[value];
    const label = actor === undefined ? undefined : context.trigger?.actorLabels[actor];
    return label ?? whoById(value)?.sentence ?? `someone unknown (${value})`;
  }
  const object = asObject(value);
  if (str(object, 'who') === 'players_nearby') {
    return `every player within ${formatNumber(num(object, 'radius') ?? 0)} blocks`;
  }
  return 'someone unknown';
}

const OFFSET_FROM: Record<string, string> = {
  here: 'here',
  above_here: 'above here',
  player: 'the player',
  mob: 'the mob',
};

/** The words of a place. */
export function placeSentence(value: Json | undefined, _context?: SentenceContext): string {
  if (typeof value === 'string') return placeById(value)?.sentence ?? `an unknown place (${value})`;
  const object = asObject(value);
  const kind = str(object, 'place');
  if (kind === 'player_looking') {
    const distance = num(object, 'distance');
    return distance === undefined
      ? 'where the player looks'
      : `where the player looks, up to ${formatNumber(distance)} blocks away`;
  }
  if (kind === 'offset') {
    const offset = asArray(object?.offset).map((part) =>
      typeof part === 'number' ? formatNumber(part) : '0',
    );
    const from = typeof object?.from === 'string' ? object.from : 'here';
    return `${offset.join(', ')} blocks from ${OFFSET_FROM[from] ?? 'here'}`;
  }
  return 'an unknown place';
}

/** Fills `{slot}` blanks of `template` and tidies the spaces. */
function fill(template: string, words: (name: string) => string): string {
  return template
    .replace(/\{([a-z_]+)\}/g, (_match, name: string) => words(name))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

/** The words of one slot of an object (step, condition, trigger options). */
function slotWords(
  slot: SlotSpec | undefined,
  name: string,
  object: JsonObject,
  context: SentenceContext,
  defaults: Readonly<Record<string, Json>> = {},
): string {
  const raw = object[name] ?? defaults[name];
  if (slot === undefined) return raw === undefined ? '' : String(raw);
  if (raw === undefined) return '';
  const words = valueWords(slot, name, raw, object, context);
  return slot.prefix === undefined ? words : `${slot.prefix} ${words}`;
}

function valueWords(
  slot: SlotSpec,
  name: string,
  raw: Json,
  object: JsonObject,
  context: SentenceContext,
): string {
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
    case 'command':
      return typeof raw === 'string' ? nameOf(context, raw) : '';
    case 'weapon':
      return typeof raw === 'string' ? `the weapon "${raw}"` : '';
    case 'particle': {
      const id = typeof raw === 'string' ? raw : str(asObject(raw), 'type');
      return id === undefined ? 'particles' : nameOf(context, id);
    }
    case 'number':
      if (name === 'level' && typeof raw === 'number') return `level ${formatNumber(raw)}`;
      return valueSentence(raw, context);
    case 'seconds':
      return typeof raw === 'number' ? seconds(raw) : `${valueSentence(raw, context)} seconds`;
    case 'percent':
      return typeof raw === 'number' ? `${formatNumber(raw)}%` : `${valueSentence(raw, context)}%`;
    case 'text':
      return Array.isArray(raw) ? textSentence(raw, context) : `"${String(raw)}"`;
    case 'counter':
      return counterWords(object);
    case 'place':
      return placeSentence(raw, context);
    case 'who':
      return whoSentence(raw, context);
    case 'choice':
      return slot.choices?.find((choice) => choice.value === raw)?.label ?? String(raw);
  }
}

/** The words of a list of conditions joined by "and" or "or". */
export function conditionsSentence(
  owner: JsonObject | undefined,
  context: SentenceContext,
): string {
  const { match, conditions } = conditionList(owner);
  if (conditions.length === 0) return 'always';
  return joinWords(
    conditions.map(({ condition }) => conditionSentence(condition, context)),
    match === 'any' ? 'or' : 'and',
  );
}

/** The words of one condition. */
export function conditionSentence(condition: JsonObject, context: SentenceContext): string {
  const id = str(condition, 'condition') ?? '';
  const entry = conditionById(id);
  if (entry === undefined) return `an unknown condition (${id})`;
  const negated = bool(condition, 'not') === true;
  const slots = new Map(entry.slots.map((slot) => [slot.name, slot]));
  const defaults: Record<string, Json> = {
    where: 'here',
    who: id === 'is_riding' ? 'player' : 'other',
    count: 1,
    of: 'here',
  };
  return fill(negated ? entry.notSentence : entry.sentence, (name) => {
    if (name === 'mount' && condition.mount === undefined) return 'something';
    if (name === 'cause' && condition.cause === 'block') return 'a block';
    return slotWords(slots.get(name), name, condition, context, defaults);
  });
}

/** The words of one step, logic steps with their nested steps. */
export function stepSentence(step: JsonObject, context: SentenceContext): string {
  const id = str(step, 'step') ?? '';
  const entry = stepById(id);
  if (entry === undefined) return `an unknown step (${id})`;
  if (id === 'if') {
    const then = stepsSentence(step, 'do', context);
    const otherwise = stepList(step, 'else');
    return otherwise.length === 0
      ? `if ${conditionsSentence(step, context)}, then ${grouped(then, step, 'do')}`
      : `if ${conditionsSentence(step, context)}, then ${grouped(then, step, 'do')}, otherwise ${grouped(stepsSentence(step, 'else', context), step, 'else')}`;
  }
  if (id === 'repeat') {
    return `repeat ${formatNumber(num(step, 'times') ?? 1)} times: ${grouped(stepsSentence(step, 'do', context), step, 'do')}`;
  }
  if (id === 'for_each_player') {
    const radius = num(step, 'radius');
    const where = radius === undefined ? 'in the world' : `within ${formatNumber(radius)} blocks`;
    return `for each player ${where}: ${grouped(stepsSentence(step, 'do', context), step, 'do')}`;
  }
  const slots = new Map(entry.slots.map((slot) => [slot.name, slot]));
  const defaults: Record<string, Json> = { count: 1, where: 'here' };
  if (entry.defaultWho !== undefined) defaults.who = entry.defaultWho;
  return fill(entry.sentence, (name) => slotWords(slots.get(name), name, step, context, defaults));
}

const grouped = (words: string, owner: JsonObject, field: string): string =>
  stepList(owner, field).length > 1 ? `(${words})` : words;

/** The words of a list of steps: "A, B and C", or "nothing". */
export function stepsSentence(owner: JsonObject, field: string, context: SentenceContext): string {
  const steps = stepList(owner, field);
  if (steps.length === 0) return 'nothing';
  return joinWords(
    steps.map(({ step }) => stepSentence(step, context)),
    'and',
  );
}

/** "A, B and C". */
export function joinWords(parts: readonly string[], word: string): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} ${word} ${parts[parts.length - 1]}`;
}

/** The words of a rule's `when`. */
export function whenSentence(when: JsonObject | undefined, names: RuleNames): string {
  const id = str(when, 'trigger') ?? '';
  const trigger = triggerById(id);
  if (trigger === undefined || when === undefined) return `When something unknown happens (${id})`;
  const context: SentenceContext = { names, trigger };
  const options = asObject(when.options) ?? {};
  const slots = new Map(trigger.slots.map((slot) => [slot.name, slot]));
  return fill(trigger.sentence, (name) => {
    if (name === 'subject') {
      const subject = str(when, 'subject');
      if (subject === undefined)
        return `any ${trigger.subject === 'none' ? 'thing' : trigger.subject}`;
      return nameOf(context, subject);
    }
    if (name === 'interval_seconds') {
      return seconds(num(options, name) ?? (trigger.id === 'key_held' ? KEY_HOLD_SECONDS : 1));
    }
    return slotWords(slots.get(name), name, options, context);
  });
}

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The plain-language sentence of a rule, ending with a full stop: When, then "if" and the
 * conditions when there are any, then the steps.
 */
export function ruleSentence(rule: JsonObject, names: RuleNames = () => undefined): string {
  const when = asObject(rule.when);
  const trigger = triggerById(str(when, 'trigger') ?? '');
  const context: SentenceContext = { names, trigger };
  const onlyIf = asObject(rule.only_if);
  const condition =
    onlyIf !== undefined && conditionList(onlyIf).conditions.length > 0
      ? `, if ${conditionsSentence(onlyIf, context)}`
      : '';
  return `${capitalise(whenSentence(when, names))}${condition}, ${stepsSentence(rule, 'do', context)}.`;
}
