/**
 * Rules from the Studios of a thing (ADR 0082 D7 (b), (c)), pure and testable without a DOM:
 *
 * - **Which book.** "Add a rule" and "Turn into rules" write into the book that already holds
 *   the thing's rules (the first in id order), else into the project's default book
 *   `<namespace of the thing>:rules`, created on demand ({@link bookForSubject}).
 * - **The first trigger** a new rule on a thing starts with ({@link firstTriggerFor}).
 * - **"Turn into rules"** ({@link planTurnIntoRules}): a hand-made event whose actions all map
 *   to rule steps becomes one rule per trigger that names it. The rules are added, the event
 *   removed and its trigger left to the rules (the trigger's options move onto the rule), as one
 *   changeset, so one undo step. It is offered only when the compiler turns the new rules back
 *   into the same actions (`plainActions`), so the game behaves the same.
 * - **The shared Rules view** of a project with its rule events expanded ({@link subjectRules}),
 *   cached per project state, which the Rules section and the events editor's "From rules" list
 *   read (here rather than in the lazy `RulesSection.tsx`, so the events editor does not load it).
 *
 * @packageDocumentation
 */

import {
  type Element,
  expandProjectSync,
  type Json,
  type Problem,
  type Project,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import rulesPlugin, {
  plainActions,
  RULES_KIND,
  ruleEventId,
  stepById,
  TRIGGERS,
  type TriggerEntry,
} from '@msm/plugin-rules';
import type { ChangeItem } from '../../changeset/changeset';
import { createRulesView, type RulesView, ruleBooks } from '../../session/rules-view';
import {
  asArray,
  asObject,
  type JsonObject,
  type RuleBookData,
  rulesOf,
  uniqueKey,
} from './rules-model';

/** The data of a new rule book (the kind's `defaultData`). */
export const NEW_BOOK_DATA: Readonly<RuleBookData> = Object.freeze({
  counters: [],
  format: 1,
  rules: [],
});

/** The rule books of a project, sorted by id (the order the compiler reads them in). */
export function sortedBooks(project: Project): Element[] {
  return project.namespaces
    .flatMap((namespace) => namespace.elements.filter((element) => element.kind === RULES_KIND))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const subjectOf = (rule: Json | undefined): string | undefined => {
  const subject = asObject(asObject(rule)?.when)?.subject;
  return typeof subject === 'string' ? subject : undefined;
};

/** The id of the project's default book for things of `namespace`: `<namespace>:rules`. */
export const defaultBookId = (namespace: string): ResourceLocation =>
  `${namespace}:rules` as ResourceLocation;

/** Where new rules on a thing go. */
export interface BookChoice {
  readonly id: ResourceLocation;
  /** The book's saved data, or `undefined` when the book does not exist yet (create it). */
  readonly data: RuleBookData | undefined;
}

/**
 * The book new rules on `subjectId` go into: the first book (in id order) that already has a
 * rule on it, else the default book `<namespace of subjectId>:rules`, existing or to create.
 */
export function bookForSubject(project: Project, subjectId: string): BookChoice {
  const books = sortedBooks(project);
  const holder = books.find((book) =>
    rulesOf(asObject(book.data) ?? {}).some((rule) => subjectOf(rule) === subjectId),
  );
  if (holder !== undefined) return { id: holder.id, data: asObject(holder.data) ?? {} };
  const colon = subjectId.indexOf(':');
  const id = defaultBookId(colon < 0 ? 'minecraft' : subjectId.slice(0, colon));
  const existing = books.find((book) => book.id === id);
  return { id, data: existing === undefined ? undefined : (asObject(existing.data) ?? {}) };
}

/** The definition triggers a thing of `kind` (with `data`) can have, in catalogue order. */
export function triggersFor(kind: string, data: Json | undefined): TriggerEntry[] {
  const object = asObject(data) ?? {};
  const components = asObject(object.components) ?? {};
  const portal = kind === 'msm:block' && object.type === 'portal';
  return TRIGGERS.filter((trigger) => {
    const definition = trigger.definition;
    if (definition === undefined || !trigger.subjectKinds.includes(kind)) return false;
    if (definition.blockType !== undefined) return object.type === definition.blockType;
    if (portal) return false;
    if (definition.required === true && definition.component !== undefined) {
      return components[definition.component] !== undefined;
    }
    if (definition.needs !== undefined) return components[definition.needs] !== undefined;
    return true;
  });
}

/**
 * The trigger a new rule on a thing starts with: the first definition trigger the thing can
 * have (a portal block's travel, a block's "used", an item's "used", ...), or `undefined`.
 */
export function firstTriggerFor(
  kind: string,
  data: Json | undefined,
  options: { veryEasy?: boolean } = {},
): TriggerEntry | undefined {
  return triggersFor(kind, data).find((trigger) => options.veryEasy !== true || trigger.veryEasy);
}

// ---------------------------------------------------------------------------------------------
// The shared Rules view
// ---------------------------------------------------------------------------------------------

/** A project's Rules view with its expansion, and the compiler's problems by book. */
export interface SubjectRules {
  readonly view: RulesView;
  /** The expansion's problems (compile problems on the books, with pointers into them). */
  readonly problems: readonly Problem[];
}

const cache = new WeakMap<Project, { target: TargetFacts; value: SubjectRules }>();

/**
 * The Rules view of `project` with the rule events expanded for `target` (ADR 0082 D3), cached
 * per project state and target, so the Rules section and the events editor of one Studio share
 * one expansion. A project without rule books is not expanded.
 */
export function subjectRules(project: Project, target: TargetFacts): SubjectRules {
  const cached = cache.get(project);
  if (cached !== undefined && cached.target === target) return cached.value;
  let value: SubjectRules;
  if (ruleBooks(project).length === 0) {
    value = { view: createRulesView(project), problems: [] };
  } else {
    try {
      const expansion = expandProjectSync(project, [rulesPlugin], target);
      value = { view: createRulesView(project, expansion), problems: expansion.problems };
    } catch {
      value = { view: createRulesView(project), problems: [] };
    }
  }
  cache.set(project, { target, value });
  return value;
}

// ---------------------------------------------------------------------------------------------
// Turn into rules
// ---------------------------------------------------------------------------------------------

/** The defaults of the format actions' optional fields (ADR 0025 D4), for comparing actions. */
const ACTION_DEFAULTS: Readonly<Record<string, Readonly<JsonObject>>> = {
  play_sound: { pitch: 1, volume: 1 },
  spawn_particle: { count: 1, speed: 0, spread: 0 },
  set_block_state: { offset: [0, 0, 0] },
  give_item: { count: 1 },
  apply_effect: { amplifier: 0, target: 'self' },
  launch: { direction: 'look', target: 'self', up: 0 },
  damage: { target: 'self' },
  heal: { target: 'self' },
};

/** An action with its absent optional fields filled with their defaults. */
function withDefaults(action: JsonObject): JsonObject {
  const type = typeof action.type === 'string' ? action.type : '';
  return { ...(ACTION_DEFAULTS[type] ?? {}), ...action };
}

/** Whether two action lists do the same (absent optional fields read as their defaults). */
export function sameActions(a: readonly Json[], b: readonly Json[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((action, index) => {
    const left = asObject(action);
    const right = asObject(b[index]);
    if (left === undefined || right === undefined) return false;
    return stableStringify(withDefaults(left)) === stableStringify(withDefaults(right));
  });
}

/** The actor whose action target on `trigger` is `target` (the player first), or undefined. */
function actorFor(trigger: TriggerEntry, target: Json | undefined): string | undefined {
  const wanted = target ?? 'self';
  for (const actor of ['player', 'mob', 'other'] as const) {
    if (trigger.actionTargets[actor] === wanted) return actor;
  }
  return undefined;
}

/** `step` with `who` set for `actor` (left out for the player, every step's default). */
function withWho(step: JsonObject, actor: string): JsonObject {
  return actor === 'player' ? step : { ...step, who: actor };
}

/** Copies the fields named in `keys` that `from` has. */
function pick(from: JsonObject, keys: readonly string[]): JsonObject {
  const out: JsonObject = {};
  for (const key of keys) if (from[key] !== undefined) out[key] = from[key] as Json;
  return out;
}

/** The rule step of one format action on `trigger`, or undefined when there is none. */
export function stepOfAction(action: Json, trigger: TriggerEntry): JsonObject | undefined {
  const object = asObject(action);
  if (object === undefined) return undefined;
  switch (object.type) {
    case 'give_item':
      return { step: 'give_item', ...pick(object, ['count', 'item']) };
    case 'heal':
    case 'damage': {
      const actor = actorFor(trigger, object.target);
      if (actor === undefined) return undefined;
      const step = object.type === 'heal' ? 'heal' : 'hurt';
      return withWho({ step, ...pick(object, ['amount']) }, actor);
    }
    case 'launch': {
      const actor = actorFor(trigger, object.target);
      if (actor === undefined) return undefined;
      return withWho({ step: 'launch', ...pick(object, ['direction', 'strength', 'up']) }, actor);
    }
    case 'apply_effect': {
      const actor = actorFor(trigger, object.target);
      if (actor === undefined) return undefined;
      const amplifier = object.amplifier;
      if (amplifier !== undefined && (typeof amplifier !== 'number' || amplifier < 0)) {
        return undefined;
      }
      const level = typeof amplifier === 'number' && amplifier > 0 ? amplifier + 1 : undefined;
      return withWho(
        {
          step: 'give_effect',
          ...pick(object, ['effect', 'seconds']),
          ...(level === undefined ? {} : { level }),
        },
        actor,
      );
    }
    case 'set_block_state': {
      const offset = asArray(object.offset);
      const where: Json | undefined =
        object.offset === undefined || offset.every((part) => part === 0)
          ? undefined
          : offset.length === 3 && offset[0] === 0 && offset[1] === 1 && offset[2] === 0
            ? 'above_here'
            : { offset: [...offset], place: 'offset' };
      return {
        step: 'place_block',
        ...(typeof object.state === 'string' ? { block: object.state } : {}),
        ...(where === undefined ? {} : { where }),
      };
    }
    case 'run_function':
      return { step: 'run_function', ...pick(object, ['function']) };
    case 'light_portal':
      return { step: 'light_portal', ...pick(object, ['portal']) };
    case 'play_sound':
      return { step: 'play_sound', ...pick(object, ['pitch', 'sound', 'volume']) };
    case 'spawn_particle':
      return { step: 'spawn_particles', ...pick(object, ['count', 'particle', 'speed', 'spread']) };
    case 'play_animation':
      return { step: 'play_animation', ...pick(object, ['animation', 'controller']) };
    default:
      return undefined;
  }
}

/** Whether `step`'s numbers fit its slots (the rule book format's ranges). */
function fitsSlots(step: JsonObject): boolean {
  const entry = stepById(typeof step.step === 'string' ? step.step : '');
  if (entry === undefined) return false;
  return entry.slots.every((slot) => {
    const value = step[slot.name];
    if (typeof value !== 'number') return true;
    if (slot.min !== undefined && value < slot.min) return false;
    if (slot.max !== undefined && value > slot.max) return false;
    return slot.whole !== true || Number.isInteger(value);
  });
}

/** Where a trigger keeps its event id in a thing's data, and its value there. */
function eventAt(data: JsonObject, trigger: TriggerEntry): string | undefined {
  const definition = trigger.definition;
  if (definition === undefined) return undefined;
  if (definition.component === undefined) {
    const value = data[definition.field ?? ''];
    return typeof value === 'string' ? value : undefined;
  }
  const component = asObject(asObject(data.components)?.[definition.component]);
  const value =
    definition.field === undefined
      ? component?.event
      : definition.fieldIsObject === true
        ? asObject(component?.[definition.field])?.event
        : component?.[definition.field];
  return typeof value === 'string' ? value : undefined;
}

/** The slot of a trigger option, for its range. */
function optionSlot(trigger: TriggerEntry, option: string) {
  return trigger.slots.find((slot) => slot.name === option);
}

/**
 * `data` with `trigger`'s reference to its event taken away: the component's `event` (and the
 * option fields that move to the rule) or the trigger's field. A component left empty is
 * removed unless the trigger needs it to exist. Returns the rule's `options`.
 */
function releaseTrigger(data: JsonObject, trigger: TriggerEntry): JsonObject | undefined {
  const definition = trigger.definition;
  if (definition === undefined) return undefined;
  if (definition.component === undefined) {
    delete data[definition.field ?? ''];
    return undefined;
  }
  const components = { ...(asObject(data.components) ?? {}) };
  const component = { ...(asObject(components[definition.component]) ?? {}) };
  let options: JsonObject | undefined;
  if (definition.field === undefined) {
    delete component.event;
    for (const mapping of trigger.options) {
      const value = component[mapping.field];
      if (value === undefined) continue;
      const optionValue: Json =
        mapping.convert === 'ticks' && typeof value === 'number' ? value / 20 : value;
      const slot = optionSlot(trigger, mapping.option);
      if (typeof optionValue === 'number' && slot !== undefined) {
        if (slot.min !== undefined && optionValue < slot.min) continue;
        if (slot.max !== undefined && optionValue > slot.max) continue;
      }
      // The compiler turns seconds back into the same ticks (times 20, rounded).
      if (
        mapping.convert === 'ticks' &&
        typeof value === 'number' &&
        Math.round((optionValue as number) * 20) !== value
      ) {
        continue;
      }
      options = { ...(options ?? {}), [mapping.option]: optionValue };
      delete component[mapping.field];
    }
  } else if (definition.fieldIsObject === true) {
    const field = { ...(asObject(component[definition.field]) ?? {}) };
    delete field.event;
    if (Object.keys(field).length === 0) delete component[definition.field];
    else component[definition.field] = field;
  } else {
    delete component[definition.field];
  }
  if (
    Object.keys(component).length === 0 &&
    definition.required !== true &&
    definition.field === undefined
  ) {
    delete components[definition.component];
  } else {
    components[definition.component] = component;
  }
  if (Object.keys(components).length === 0) delete data.components;
  else data.components = components;
  return options;
}

/** The outcome of {@link planTurnIntoRules}. */
export type TurnIntoRulesPlan =
  | {
      readonly ok: true;
      /** The changeset: the thing updated (event and trigger references gone), the book. */
      readonly items: ChangeItem[];
      /** The undo label. */
      readonly label: string;
      /** The book the rules went into, and the indexes of the new rules there. */
      readonly bookId: ResourceLocation;
      readonly ruleIndexes: readonly number[];
    }
  | { readonly ok: false; readonly reason: string };

/** Whether another event of `data` runs `eventName` (`trigger_event`). */
function triggeredElsewhere(data: JsonObject, eventName: string): boolean {
  const events = asObject(data.events) ?? {};
  return Object.entries(events).some(
    ([name, event]) =>
      name !== eventName &&
      asArray(asObject(event)?.actions).some((action) => {
        const object = asObject(action);
        return object?.type === 'trigger_event' && object.event === eventName;
      }),
  );
}

/** A readable rule name from an event id: its last part, words with spaces. */
function nameOfEvent(eventName: string): string {
  const path = eventName.includes(':') ? eventName.slice(eventName.indexOf(':') + 1) : eventName;
  const last = path.split('/').pop() ?? path;
  const words = last.replace(/_/g, ' ').trim();
  return words.length === 0 ? eventName : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Plans "Turn into rules" for the hand-made event `eventName` of `subject`: one rule per
 * trigger that names the event, with a step for every action. Not offered (`ok: false`, with
 * the reason) when no trigger names the event, another event runs it, an action has no step,
 * the steps would not compile back to the same actions, or Rules' own event id is taken.
 *
 * The rules go into {@link bookForSubject}'s book, or before the first rule already on the same
 * thing and trigger (so they run first, as the hand-made event did).
 */
export function planTurnIntoRules(
  project: Project,
  subject: Element,
  eventName: string,
): TurnIntoRulesPlan {
  const data = asObject(subject.data) ?? {};
  const events = asObject(data.events) ?? {};
  const event = asObject(events[eventName]);
  if (event === undefined) return { ok: false, reason: `No event "${eventName}".` };
  const actions = asArray(event.actions);
  if (actions.length === 0) return { ok: false, reason: 'The event has no actions.' };
  if (triggeredElsewhere(data, eventName)) {
    return { ok: false, reason: 'Another event runs this one ("Trigger event").' };
  }
  const triggers = triggersFor(subject.kind, data).filter(
    (trigger) => eventAt(data, trigger) === eventName,
  );
  if (triggers.length === 0) {
    return { ok: false, reason: 'No trigger runs this event, so a rule would have no "When".' };
  }

  const nextData: JsonObject = structuredClone(data);
  const nextEvents = { ...(asObject(nextData.events) ?? {}) };
  delete nextEvents[eventName];
  if (Object.keys(nextEvents).length === 0) delete nextData.events;
  else nextData.events = nextEvents;

  const books = sortedBooks(project);
  const choice = bookForSubject(project, subject.id);
  const bookData = new Map<string, RuleBookData>();
  for (const book of books) bookData.set(book.id, asObject(book.data) ?? {});
  if (choice.data === undefined) bookData.set(choice.id, structuredClone(NEW_BOOK_DATA));
  const touched = new Set<string>();
  const placed: { bookId: string; index: number }[] = [];

  for (const trigger of triggers) {
    if (Object.hasOwn(nextEvents, ruleEventId(subject.id, trigger.id))) {
      return {
        ok: false,
        reason: `The event id Rules use, "${ruleEventId(subject.id, trigger.id)}", is taken.`,
      };
    }
    const steps: JsonObject[] = [];
    for (const action of actions) {
      const step = stepOfAction(action, trigger);
      if (step === undefined || !fitsSlots(step)) {
        const type = asObject(action)?.type;
        return {
          ok: false,
          reason: `The action "${typeof type === 'string' ? type : '?'}" has no rule step here.`,
        };
      }
      steps.push(step);
    }
    const options = releaseTrigger(nextData, trigger);
    const when: JsonObject = {
      ...(options === undefined ? {} : { options }),
      subject: subject.id,
      trigger: trigger.id,
    };
    // Into the book whose rules on this thing and trigger run first, before them; else the
    // thing's book, at the end.
    let target = choice.id as string;
    let at: number | undefined;
    for (const [id, book] of [...bookData].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const index = rulesOf(book).findIndex((rule) => {
        const ruleWhen = asObject(asObject(rule)?.when);
        return ruleWhen?.subject === subject.id && ruleWhen.trigger === trigger.id;
      });
      if (index >= 0) {
        target = id;
        at = index;
        break;
      }
    }
    const book = bookData.get(target) ?? structuredClone(NEW_BOOK_DATA);
    const rule: JsonObject = {
      do: steps,
      key: uniqueKey(book, eventName.slice(eventName.indexOf(':') + 1)),
      name: nameOfEvent(eventName),
      when,
    };
    const compiled = plainActions(rule, trigger);
    if (compiled === undefined || !sameActions(compiled, actions)) {
      return { ok: false, reason: 'Rules would not do exactly what the event does.' };
    }
    const rules = [...rulesOf(book)];
    const index = at ?? rules.length;
    rules.splice(index, 0, rule);
    for (const entry of placed) {
      if (entry.bookId === target && entry.index >= index) entry.index += 1;
    }
    placed.push({ bookId: target, index });
    bookData.set(target, { ...book, rules });
    touched.add(target);
  }

  const items: ChangeItem[] = [
    {
      itemId: 'turn-into-rules-subject',
      op: 'update',
      elementId: subject.id,
      kind: subject.kind,
      before: subject.data,
      after: nextData,
      accepted: true,
      problems: [],
    },
  ];
  for (const id of [...touched].sort()) {
    const saved = books.find((book) => book.id === id);
    const after = bookData.get(id) as RuleBookData;
    items.push(
      saved === undefined
        ? {
            itemId: `turn-into-rules-book-${id}`,
            op: 'create',
            elementId: id as ResourceLocation,
            kind: RULES_KIND,
            after,
            accepted: true,
            problems: [],
          }
        : {
            itemId: `turn-into-rules-book-${id}`,
            op: 'update',
            elementId: id as ResourceLocation,
            kind: RULES_KIND,
            before: saved.data,
            after,
            accepted: true,
            problems: [],
          },
    );
  }
  const first = placed[0];
  return {
    ok: true,
    items,
    label: `Turn ${eventName} into rules`,
    bookId: (first?.bookId ?? choice.id) as ResourceLocation,
    ruleIndexes: placed.filter((entry) => entry.bookId === first?.bookId).map((e) => e.index),
  };
}
