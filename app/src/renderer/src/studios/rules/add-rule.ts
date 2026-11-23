/**
 * A rule added to a book from outside the Rule book Studio (ADR 0124 D9: the search's **Add this
 * rule**; B664). A "When", "Do", "Only if" or number of the Rules catalogue becomes a new rule in
 * the mod's rule book (its first book, or a new `<namespace>:rules` when it has none): a trigger
 * starts the rule, a step is held in its `do`, a condition in its `only_if`, and a number leaves a
 * rule whose trigger can read it. Steps, conditions and numbers start on a trigger that has the
 * actor they need (the default trigger when it does). The subject is asked for by the caller when
 * the trigger needs one (`subjectNeed`); the things it can be are the mod's own of the trigger's
 * kinds (`subjectChoices`).
 *
 * Pure: {@link planAddRule} returns change items for `applyChangeset` as one undo step.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import {
  type Actor,
  conditionById,
  RULES_KIND,
  stepById,
  TRIGGERS,
  type TriggerEntry,
  triggerById,
  valueById,
} from '@msm/plugin-rules';
import type { ChangeItem } from '../../changeset/changeset';
import { freeId, ruleBookData } from '../../changeset/make-flow';
import { displayNameOf } from '../../session/plain-problems';
import {
  asObject,
  DEFAULT_TRIGGER,
  type JsonObject,
  newCondition,
  newStep,
  type RuleBookData,
  rulesOf,
  uniqueKey,
} from './rules-model';

/** The parts of the Rules catalogue a rule can be added from. */
export type RulePartSort = 'trigger' | 'step' | 'condition' | 'value';

/** Whether a trigger's rule needs a subject, may have one, or has none. */
export type SubjectNeed = 'required' | 'optional' | 'none';

/** One thing of the mod a rule can be about. */
export interface RuleSubjectChoice {
  readonly id: ResourceLocation;
  /** Its display name. */
  readonly name: string;
  readonly kind: string;
}

/** What {@link planAddRule} is asked for. */
export interface AddRuleRequest {
  readonly part: RulePartSort;
  /** The catalogue id of the part. */
  readonly id: string;
  /** The rule's subject, when its trigger takes one. */
  readonly subject?: string;
  /** The book to add to (default: the mod's first rule book, else a new one). */
  readonly bookId?: ResourceLocation;
  /** The namespace of a new book (default: the project's first own namespace). */
  readonly namespace?: string;
}

/** What {@link planAddRule} returns. */
export interface AddRulePlan {
  /** The book the rule goes into. */
  readonly bookId: ResourceLocation;
  /** Whether the book is new. */
  readonly newBook: boolean;
  /** The index of the new rule in the book. */
  readonly index: number;
  readonly rule: JsonObject;
  /** The trigger the rule starts with. */
  readonly trigger: string;
  /** One change item: the book created or updated. */
  readonly items: ChangeItem[];
  /** The undo label. */
  readonly label: string;
  /** A plain line on what is left to do in the Rule book, when anything is. */
  readonly note?: string;
}

/** The catalogue label of a part, or its id when the catalogue does not know it. */
export function partLabel(part: RulePartSort, id: string): string {
  switch (part) {
    case 'trigger':
      return triggerById(id)?.label ?? id;
    case 'step':
      return stepById(id)?.label ?? id;
    case 'condition':
      return conditionById(id)?.label ?? id;
    case 'value':
      return valueById(id)?.label ?? id;
  }
}

/** Whether the catalogue knows the part. */
export function knowsPart(part: RulePartSort, id: string): boolean {
  switch (part) {
    case 'trigger':
      return triggerById(id) !== undefined;
    case 'step':
      return stepById(id) !== undefined;
    case 'condition':
      return conditionById(id) !== undefined;
    case 'value':
      return valueById(id) !== undefined;
  }
}

/** Whether a rule starting with `trigger` needs, may have or has no subject. */
export function subjectNeed(trigger: TriggerEntry | undefined): SubjectNeed {
  if (trigger === undefined || trigger.subject === 'none') return 'none';
  return trigger.subjectOptional ? 'optional' : 'required';
}

/** A trigger with no subject to ask for whose actors hold `actor`; Very easy ones first. */
function triggerWithActor(actor: Actor): TriggerEntry | undefined {
  const plain = (entry: TriggerEntry) => subjectNeed(entry) !== 'required';
  const fallback = triggerById(DEFAULT_TRIGGER);
  if (fallback?.actors.includes(actor)) return fallback;
  return (
    TRIGGERS.find((entry) => entry.veryEasy && plain(entry) && entry.actors.includes(actor)) ??
    TRIGGERS.find((entry) => plain(entry) && entry.actors.includes(actor)) ??
    TRIGGERS.find((entry) => entry.actors.includes(actor))
  );
}

/**
 * The trigger a new rule starts with for a part: the trigger itself; else the first trigger the
 * part works on when it names some; else one with the actor it needs; else the default trigger.
 */
export function triggerForPart(part: RulePartSort, id: string): TriggerEntry | undefined {
  if (part === 'trigger') return triggerById(id);
  const entry =
    part === 'step' ? stepById(id) : part === 'condition' ? conditionById(id) : valueById(id);
  const only = entry?.triggers?.[0];
  if (only !== undefined) return triggerById(only);
  const actor = entry?.needsActor;
  if (actor !== undefined) return triggerWithActor(actor);
  return triggerById(DEFAULT_TRIGGER);
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

/** The things of the mod a rule starting with `trigger` can be about (its subject kinds). */
export function subjectChoices(
  project: Project,
  trigger: TriggerEntry | undefined,
): RuleSubjectChoice[] {
  if (trigger === undefined || trigger.subject === 'none') return [];
  const kinds = new Set(trigger.subjectKinds);
  return elementsOf(project)
    .filter((element) => kinds.has(element.kind))
    .map((element) => ({ id: element.id, name: displayNameOf(element), kind: element.kind }));
}

/** The mod's rule books, in project order. */
export function ruleBooksOf(project: Project): Element[] {
  return elementsOf(project).filter((element) => element.kind === RULES_KIND);
}

/** The project's first own namespace (not `minecraft`). */
function firstNamespace(project: Project): string {
  return project.namespaces.find((entry) => entry.name !== 'minecraft')?.name ?? 'minecraft';
}

/** The new rule for a part, its key unique in `book`. */
export function ruleWithPart(
  book: RuleBookData,
  part: RulePartSort,
  id: string,
  trigger: string,
  subject?: string,
): JsonObject {
  const when: JsonObject = { trigger };
  if (subject !== undefined) when.subject = subject;
  const rule: JsonObject = { do: [], key: uniqueKey(book, id), when };
  if (part === 'step') rule.do = [newStep(id)];
  if (part === 'condition') rule.only_if = { conditions: [newCondition(id)], match: 'all' };
  return rule;
}

/**
 * Plans a rule added from a catalogue part: into the given book, the mod's first rule book, or a
 * new book `<namespace>:rules` (`rules_2` and on when taken). One change item, for
 * `applyChangeset(items, label)` as one undo step labelled "Add a rule: <part label>".
 *
 * @throws Error If the part is unknown, no trigger fits it, a required subject is missing (when
 *   the mod has a thing it can be), the given book is not a rule book, or no book id is free.
 */
export function planAddRule(project: Project, request: AddRuleRequest): AddRulePlan {
  if (!knowsPart(request.part, request.id)) {
    throw new Error(`The Rules catalogue has no ${request.part} ${JSON.stringify(request.id)}.`);
  }
  const trigger = triggerForPart(request.part, request.id);
  if (trigger === undefined) throw new Error(`No "When" fits ${request.id}.`);
  const need = subjectNeed(trigger);
  const subject = need === 'none' ? undefined : request.subject;
  if (need === 'required' && subject === undefined && subjectChoices(project, trigger).length > 0) {
    throw new Error(`"${trigger.label}" needs the thing it is about.`);
  }

  let bookId: ResourceLocation;
  let before: Element | undefined;
  if (request.bookId !== undefined) {
    before = elementsOf(project).find((element) => element.id === request.bookId);
    if (before !== undefined && before.kind !== RULES_KIND) {
      throw new Error(`${request.bookId} is not a rule book.`);
    }
    bookId = request.bookId;
  } else {
    before = ruleBooksOf(project)[0];
    if (before !== undefined) bookId = before.id;
    else {
      const free = freeId(project, `${request.namespace ?? firstNamespace(project)}:rules`);
      if (free === null) throw new Error('Every rule book name is taken.');
      bookId = free;
    }
  }

  const book: RuleBookData =
    before === undefined
      ? (ruleBookData([]) as RuleBookData)
      : (asObject(before.data) ?? (ruleBookData([]) as RuleBookData));
  const rule = ruleWithPart(book, request.part, request.id, trigger.id, subject);
  const rules = [...rulesOf(book), rule];
  const after: RuleBookData = { ...book, rules };
  const label = `Add a rule: ${partLabel(request.part, request.id)}`;
  const item: ChangeItem =
    before === undefined
      ? {
          itemId: 'add-rule-1',
          op: 'create',
          elementId: bookId,
          kind: RULES_KIND,
          after,
          accepted: true,
          problems: [],
        }
      : {
          itemId: 'add-rule-1',
          op: 'update',
          elementId: bookId,
          kind: RULES_KIND,
          before: before.data as Json,
          after,
          accepted: true,
          problems: [],
        };
  const missingSubject = need === 'required' && subject === undefined;
  const note = missingSubject
    ? `Choose what "${trigger.label}" is about in the Rule book.`
    : request.part === 'value'
      ? `Put "${partLabel('value', request.id)}" into a step's number in the Rule book.`
      : request.part === 'trigger'
        ? 'Add what happens in the Rule book.'
        : undefined;
  return {
    bookId,
    newBook: before === undefined,
    index: rules.length - 1,
    rule,
    trigger: trigger.id,
    items: [item],
    label,
    ...(note !== undefined ? { note } : {}),
  };
}
