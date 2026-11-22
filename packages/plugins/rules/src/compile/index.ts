/**
 * The rule book compiler (ADR 0082 D3): `compileRuleBook(book, elements, target)` turns one
 * `msm:rules` element into patches to its subjects' definitions and, when needed, one generated
 * TypeScript script. Pure: no I/O, no clock, the same input gives the same output.
 *
 * - Definition triggers: per subject and trigger, one event `<subject id>_rules_<trigger>` set
 *   on the trigger component. When every enabled rule there is plain (`plain.ts`), the event holds
 *   their actions in rule order; otherwise one `run_script` action whose handler is
 *   `<book namespace>:rules/<book path>/<subject path>/<trigger>`. A hand-made event already on
 *   the trigger runs first through `trigger_event`. Trigger options: the subject's own component
 *   values win, else the first rule's (R16).
 * - Definition triggers with a Script API event of their own (the key and vehicle triggers of
 *   ADR 0088 D6 and ADR 0090 D11, Script API 1.5): a book's part that is not plain becomes an
 *   `msm.events.on` listener of that event filtered to the subject, which runs after the
 *   definition's event; the plain parts still go into the event. A held key has no such event
 *   and uses `run_script`. The command trigger (B458) keeps `run_script` for its rules that are
 *   not plain, so the command always has its `event`; a command with a `function` cannot have
 *   one, and all its rules listen to the Script API 1.6 `command` event instead.
 * - Script-only triggers: `msm.events.on` handlers in the script, one per trigger and subject.
 * - "What the player typed" (ADR 0111 D1) is checked against the subject command's `arguments`
 *   and read in either route from the event's `args` (`commandArgs(e)`); the kinds of project
 *   game rules (`msm:game_rule`) check what "Set a game rule" and "The game rule is" take.
 */
import type {
  Element,
  ElementPatch,
  Json,
  JsonObject,
  Problem,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';
import {
  asArray,
  asObject,
  bookCounters,
  bookRules,
  pointer,
  ruleEnabled,
  stepList,
  str,
} from '../book';
import { COMMAND_KIND, type TriggerEntry, triggerById } from '../catalogue';
import { ruleSentence, whenSentence } from '../sentence';
import { type CheckContext, checkRule, Reporter } from './check';
import { plainActions } from './plain';
import { ScriptBuilder, type ScriptRule } from './script';
import {
  RULES_COMPILE_CODES as CODES,
  type CompiledRuleBook,
  type CompiledRuleBooks,
} from './types';

export { READABLE_ARGUMENT_TYPES } from './check';
export { plainAction, plainActions } from './plain';
export { literal } from './script';
export * from './types';

/** One enabled, checked rule. */
interface Compiled {
  readonly rule: JsonObject;
  readonly index: number;
  readonly key: string;
}

interface ScriptGroup {
  readonly trigger: TriggerEntry;
  readonly subject: string | undefined;
  readonly rules: Compiled[];
}

const PORTAL_COMPONENTS = new Set([
  'msm:breakable',
  'msm:light_emitter',
  'msm:on_break',
  'msm:on_place',
  'msm:on_random_tick',
  'msm:on_entity_inside',
]);

/** Display names of project elements, for the sentences in the script's comments. */
export function namesFromElements(
  elements: readonly Element[],
): (id: string) => string | undefined {
  const names = new Map<string, string>();
  for (const element of elements) {
    const data = asObject(element.data);
    const name = str(data, 'display_name');
    if (name !== undefined && name.trim().length > 0) names.set(element.id, name);
    // A command is named as it is typed: "/hello" (B458).
    const literal = element.kind === COMMAND_KIND ? str(data, 'name') : undefined;
    if (literal !== undefined && literal.length > 0) names.set(element.id, `/${literal}`);
  }
  return (id) => names.get(id);
}

/** The element kind of project game rules (ADR 0111 D5). */
const GAME_RULE_KIND = 'msm:game_rule';

/** The arguments of a command element, name to type (ADR 0096 D1). */
function commandArguments(command: Element): ReadonlyMap<string, string> {
  const args = new Map<string, string>();
  for (const entry of asArray(asObject(command.data)?.arguments)) {
    const name = str(asObject(entry), 'name');
    const type = str(asObject(entry), 'type');
    if (name !== undefined && type !== undefined && !args.has(name)) args.set(name, type);
  }
  return args;
}

const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);
const namespaceOf = (id: string): string => id.slice(0, id.indexOf(':'));

/** The generated event id of a subject and trigger (ADR 0082 D3). */
export const ruleEventId = (subjectId: string, trigger: string): ResourceLocation =>
  `${subjectId}_rules_${trigger}` as ResourceLocation;

/** The `run_script` handler id of a subject and trigger in a book (ADR 0082 D3). */
export const ruleHandlerId = (bookId: string, subjectId: string, trigger: string): string =>
  `${namespaceOf(bookId)}:rules/${pathOf(bookId)}/${pathOf(subjectId)}/${trigger}`;

/** Whether a step list holds a `light_portal` step anywhere. */
const hasLightPortal = (owner: JsonObject): boolean =>
  ['do', 'else'].some((field) =>
    stepList(owner, field).some(
      ({ step }) => str(step, 'step') === 'light_portal' || hasLightPortal(step),
    ),
  );

/**
 * The distinct hand-made events already on the trigger: none or one, except for a list trigger
 * (a vehicle's `weapons`), whose entries may each name their own.
 */
export function handMadeEvents(data: JsonObject, trigger: TriggerEntry): string[] {
  const definition = trigger.definition;
  if (definition === undefined) return [];
  const one = (value: string | undefined): string[] => (value === undefined ? [] : [value]);
  if (definition.list !== undefined) {
    const ids = asArray(data[definition.list]).map((entry) =>
      str(asObject(entry), definition.field ?? ''),
    );
    return [...new Set(ids.filter((id): id is string => id !== undefined))];
  }
  if (definition.component === undefined) {
    if (definition.fieldIsObject === true)
      return one(str(asObject(data[definition.field ?? '']), 'event'));
    return one(str(data, definition.field ?? ''));
  }
  const component = asObject(asObject(data.components)?.[definition.component]);
  if (definition.field === undefined) return one(str(component, 'event'));
  if (definition.fieldIsObject === true)
    return one(str(asObject(component?.[definition.field]), 'event'));
  return one(str(component, definition.field));
}

/** Converts a rule's trigger options to component fields (R16: the subject's own values win). */
export function optionFields(trigger: TriggerEntry, options: JsonObject | undefined): JsonObject {
  const fields: JsonObject = {};
  for (const mapping of trigger.options) {
    const value = options?.[mapping.option];
    if (value === undefined) continue;
    if (mapping.convert === 'ticks') {
      if (typeof value !== 'number') continue;
      const ticks = Math.max(mapping.min ?? 0, Math.round(value * 20));
      fields[mapping.field] = mapping.max === undefined ? ticks : Math.min(mapping.max, ticks);
    } else {
      fields[mapping.field] = value;
    }
  }
  return fields;
}

/**
 * Whether the subject has a field that rules out the trigger's event (`unusableWith`: a
 * command's `function`, ADR 0096 D1).
 */
function eventUnusable(subject: Element, trigger: TriggerEntry): boolean {
  const field = trigger.definition?.unusableWith;
  return field !== undefined && asObject(subject.data)?.[field] !== undefined;
}

/** "blocks", "items", "mobs", "effects", "key binds", "vehicles", "commands". */
const SUBJECT_PLURALS: Readonly<Record<string, string>> = {
  block: 'blocks',
  item: 'items',
  mob: 'mobs',
  effect: 'effects',
  key: 'key binds',
  vehicle: 'vehicles',
  command: 'commands',
};

/**
 * Compiles one rule book (an `msm:rules` element) against the project's elements and a target.
 * Disabled rules are left out; a rule with an error is reported and left out; the others still
 * compile. A project with several books compiles them together with {@link compileRuleBooks}.
 */
export function compileRuleBook(
  book: Element,
  elements: readonly Element[],
  target: TargetFacts,
): CompiledRuleBook {
  const result = compileRuleBooks([book], elements, target);
  return {
    patches: result.patches,
    script: result.scripts.get(book.id) ?? null,
    problems: result.problems,
  };
}

/** One book's part of a compilation. */
interface BookPass {
  readonly book: Element;
  readonly reporter: Reporter;
  readonly builder: ScriptBuilder;
  readonly scriptGroups: Map<string, ScriptGroup>;
}

/** The rules of every book on one subject and trigger. */
interface SharedGroup {
  readonly trigger: TriggerEntry;
  readonly subject: Element;
  readonly parts: { readonly pass: BookPass; readonly rules: Compiled[] }[];
}

/**
 * Compiles every rule book of a project together (ADR 0082 D3). Books are taken in the order
 * given. When several books have rules on the same subject and trigger, they share the one
 * generated event `<subject id>_rules_<trigger>`: a hand-made event first, then each book's
 * part in book order (its plain actions, or a `run_script` to that book's own handler); the
 * trigger options come from the first book's first rule (R16). So no element path is patched
 * twice, however many books there are.
 */
export function compileRuleBooks(
  books: readonly Element[],
  elements: readonly Element[],
  target: TargetFacts,
): CompiledRuleBooks {
  const names = namesFromElements(elements);
  const byId = new Map(elements.map((element) => [element.id as string, element]));
  const argumentsOf = (subject: Element | undefined): ReadonlyMap<string, string> | undefined =>
    subject?.kind === COMMAND_KIND ? commandArguments(subject) : undefined;
  const gameRuleKind = (id: string): string | undefined => {
    const element = byId.get(id);
    return element?.kind === GAME_RULE_KIND ? str(asObject(element.data), 'kind') : undefined;
  };
  const shared = new Map<string, SharedGroup>();
  const passes: BookPass[] = [];

  for (const book of books) {
    const data = asObject(book.data) ?? {};
    const pass: BookPass = {
      book,
      reporter: new Reporter(book.id),
      builder: new ScriptBuilder(book.id, bookCounters(data)),
      scriptGroups: new Map(),
    };
    passes.push(pass);
    collectRules(pass, data, byId, shared, gameRuleKind);
  }

  const scriptRule = (compiled: Compiled): ScriptRule => ({
    rule: compiled.rule,
    key: compiled.key,
    sentence: ruleSentence(compiled.rule, names),
  });
  const subjects = new Map<string, SubjectPatches>();

  for (const group of shared.values()) {
    const { trigger, subject } = group;
    const parts: {
      pass: BookPass;
      rules: Compiled[];
      plain: (Json[] | undefined)[];
      isPlain: boolean;
    }[] = [];
    for (const part of group.parts) {
      const plain = part.rules.map((compiled) => plainActions(compiled.rule, trigger));
      const isPlain = plain.every((actions) => actions !== undefined);
      // The subject cannot run the trigger's event (a command with a function, B458), or the
      // rules are not plain and the trigger has a script event that is not only a fallback.
      const toListener =
        trigger.scriptEvent !== undefined &&
        (eventUnusable(subject, trigger) || (!isPlain && trigger.definition?.bridge !== true));
      let rules = part.rules;
      if (!isPlain || toListener) {
        rules = part.rules.filter((compiled) => {
          if (!hasLightPortal(compiled.rule)) return true;
          part.pass.reporter.error(
            CODES.needsPlain,
            pointer(`/rules/${compiled.index}`, 'do'),
            '"Light a portal" works only when every rule on this trigger is a plain one, without conditions, waits or other logic.',
          );
          return false;
        });
        if (rules.length === 0) continue;
      }
      if (toListener) {
        // A trigger with a Script API event of its own (the key and vehicle triggers): the
        // book's part becomes a listener of that event, which runs after the definition's
        // event, and the definition is left alone for it (B421). A command with a function
        // sends every rule here (B458).
        const groupKey = `${trigger.id}|${subject.id}`;
        let listener = part.pass.scriptGroups.get(groupKey);
        if (listener === undefined) {
          listener = { trigger, subject: subject.id, rules: [] };
          part.pass.scriptGroups.set(groupKey, listener);
        }
        listener.rules.push(...rules);
        continue;
      }
      parts.push({ pass: part.pass, rules, plain, isPlain });
    }
    const first = parts[0];
    if (first === undefined) continue;
    const subjectData = asObject(subject.data) ?? {};
    const eventId = ruleEventId(subject.id, trigger.id);
    const origin = {
      elementId: first.pass.book.id,
      pointer: `/rules/${first.rules[0]?.index ?? 0}`,
    };
    const existingEvents = asObject(subjectData.events) ?? {};
    const handMadeAll = handMadeEvents(subjectData, trigger);
    const handMade = handMadeAll[0];
    if (existingEvents[eventId] !== undefined || handMadeAll.includes(eventId)) {
      first.pass.reporter.error(
        CODES.eventIdClash,
        pointer(origin.pointer, 'when', 'subject'),
        `"${subject.id}" already has an event "${eventId}"; rename that event so Rules can use the id.`,
      );
      continue;
    }
    if (handMadeAll.length > 1) {
      first.pass.reporter.error(
        CODES.eventIdClash,
        pointer(origin.pointer, 'when', 'subject'),
        `The ${trigger.definition?.list ?? 'parts'} of "${subject.id}" already run different events of their own; give them one shared event so Rules can add to it.`,
      );
      continue;
    }
    const actions: Json[] = [];
    if (handMade !== undefined) actions.push({ type: 'trigger_event', event: handMade });
    for (const part of parts) {
      if (part.isPlain) {
        for (const list of part.plain) actions.push(...(list ?? []));
        continue;
      }
      const handler = ruleHandlerId(part.pass.book.id, subject.id, trigger.id);
      actions.push({ type: 'run_script', handler });
      part.pass.builder.addDefinitionHandler(
        handler,
        trigger,
        `${names(subject.id) ?? subject.id}: ${trigger.label.toLowerCase()}.`,
        part.rules.map(scriptRule),
        argumentsOf(subject),
      );
    }
    let patches = subjects.get(subject.id);
    if (patches === undefined) {
      patches = new SubjectPatches(subject);
      subjects.set(subject.id, patches);
    }
    patches.event(eventId, { actions }, origin);
    patches.trigger(
      trigger,
      eventId,
      asObject(asObject(first.rules[0]?.rule.when)?.options),
      origin,
    );
  }

  const scripts = new Map<ResourceLocation, string[]>();
  const problems: Problem[] = [];
  for (const pass of passes) {
    for (const group of pass.scriptGroups.values()) {
      const first = group.rules[0];
      const options = asObject(asObject(first?.rule.when)?.options) ?? {};
      pass.builder.addEventHandler(
        group.trigger,
        group.subject,
        options,
        `${whenSentence(asObject(first?.rule.when), names)}.`,
        group.rules.map(scriptRule),
        argumentsOf(byId.get(group.subject ?? '')),
      );
    }
    const script = pass.builder.lines();
    if (script !== null && target.fabric === undefined) {
      pass.reporter.error(
        CODES.noScripts,
        '/rules',
        `Some rules need a script, and ${target.mcVersion} has no script runtime in MSM.`,
      );
    } else if (script !== null) {
      scripts.set(pass.book.id, script);
    }
    problems.push(...pass.reporter.problems);
  }

  return {
    patches: [...subjects.values()].flatMap((subject) => subject.patches()),
    scripts,
    problems,
  };
}

/** Sorts one book's enabled, checked rules into the shared and the script-only groups. */
function collectRules(
  pass: BookPass,
  data: JsonObject,
  byId: ReadonlyMap<string, Element>,
  shared: Map<string, SharedGroup>,
  gameRuleKind: (id: string) => string | undefined,
): void {
  const { reporter } = pass;
  for (const { rule, index } of bookRules(data)) {
    if (!ruleEnabled(rule)) continue;
    const base = `/rules/${index}`;
    const when = asObject(rule.when);
    const triggerId = str(when, 'trigger') ?? '';
    const trigger = triggerById(triggerId);
    if (trigger === undefined) {
      reporter.error(
        CODES.unknownTrigger,
        pointer(base, 'when', 'trigger'),
        `Unknown trigger "${triggerId}": it may come from a newer MSM.`,
      );
      continue;
    }
    const subjectId = str(when, 'subject');
    const command = trigger.subject === 'command' ? byId.get(subjectId ?? '') : undefined;
    const context: CheckContext = {
      gameRuleKind,
      ...(command?.kind === COMMAND_KIND ? { commandArguments: commandArguments(command) } : {}),
    };
    if (!checkRule(rule, base, trigger, reporter, context)) continue;
    const compiled: Compiled = { rule, index, key: str(rule, 'key') ?? '' };
    if (trigger.definition === undefined) {
      const groupKey = `${trigger.id}|${subjectId ?? ''}`;
      let group = pass.scriptGroups.get(groupKey);
      if (group === undefined) {
        group = { trigger, subject: subjectId, rules: [] };
        pass.scriptGroups.set(groupKey, group);
      }
      group.rules.push(compiled);
      continue;
    }
    const subject = subjectId === undefined ? undefined : byId.get(subjectId);
    if (subject === undefined || !trigger.subjectKinds.includes(subject.kind)) {
      reporter.error(
        CODES.unknownSubject,
        pointer(base, 'when', 'subject'),
        subjectId === undefined
          ? `"${trigger.label}" needs one of your ${SUBJECT_PLURALS[trigger.subject] ?? 'things'}.`
          : `"${subjectId}" is not one of your ${SUBJECT_PLURALS[trigger.subject] ?? 'things'}.`,
      );
      continue;
    }
    if (!subjectFits(subject, trigger, pointer(base, 'when'), reporter)) continue;
    const groupKey = `${subject.id}|${trigger.id}`;
    let group = shared.get(groupKey);
    if (group === undefined) {
      group = { trigger, subject, parts: [] };
      shared.set(groupKey, group);
    }
    let part = group.parts[group.parts.length - 1];
    if (part?.pass !== pass) {
      part = { pass, rules: [] };
      group.parts.push(part);
    }
    part.rules.push(compiled);
  }
}

/** Whether `subject` can have `trigger` (component and type checks). */
function subjectFits(
  subject: Element,
  trigger: TriggerEntry,
  path: string,
  reporter: Reporter,
): boolean {
  const definition = trigger.definition;
  if (definition === undefined) return true;
  const data = asObject(subject.data) ?? {};
  const components = asObject(data.components) ?? {};
  const isPortal = subject.kind === 'msm:block' && str(data, 'type') === 'portal';
  if (definition.blockType !== undefined && str(data, 'type') !== definition.blockType) {
    reporter.error(
      CODES.wrongTrigger,
      pointer(path, 'trigger'),
      `"${trigger.label}" works only on ${definition.blockType} blocks.`,
    );
    return false;
  }
  if (
    isPortal &&
    definition.component !== undefined &&
    !PORTAL_COMPONENTS.has(definition.component)
  ) {
    reporter.error(
      CODES.wrongTrigger,
      pointer(path, 'trigger'),
      `A portal block cannot have "${trigger.label}".`,
    );
    return false;
  }
  if (
    definition.required === true &&
    definition.component !== undefined &&
    components[definition.component] === undefined
  ) {
    reporter.error(
      CODES.needsComponent,
      pointer(path, 'subject'),
      `"${trigger.label}" needs ${subject.id} to have ${definition.component} first.`,
    );
    return false;
  }
  if (
    definition.list !== undefined &&
    definition.required === true &&
    asArray(data[definition.list]).length === 0
  ) {
    reporter.error(
      CODES.needsComponent,
      pointer(path, 'subject'),
      `"${trigger.label}" needs ${subject.id} to have ${definition.list} first.`,
    );
    return false;
  }
  if (definition.needs !== undefined && components[definition.needs] === undefined) {
    reporter.error(
      CODES.needsComponent,
      pointer(path, 'subject'),
      `"${trigger.label}" needs ${subject.id} to have ${definition.needs} first.`,
    );
    return false;
  }
  return true;
}

type Origin = ElementPatch['origin'];

/** The patches of one subject, merged per component so no path is patched twice. */
class SubjectPatches {
  private readonly subject: Element;
  private readonly data: JsonObject;
  private readonly events = new Map<string, { value: Json; origin: Origin }>();
  private readonly components = new Map<string, { value: JsonObject; origin: Origin }>();
  private readonly fields = new Map<string, { value: Json; origin: Origin }>();

  constructor(subject: Element) {
    this.subject = subject;
    this.data = asObject(subject.data) ?? {};
  }

  event(id: string, value: Json, origin: Origin): void {
    this.events.set(id, { value, origin });
  }

  trigger(
    trigger: TriggerEntry,
    eventId: string,
    options: JsonObject | undefined,
    origin: Origin,
  ): void {
    const definition = trigger.definition;
    if (definition === undefined) return;
    const field = definition.field ?? '';
    if (definition.list !== undefined) {
      // Every entry of the list (each weapon) names the event.
      const list = asArray(this.data[definition.list]).map((entry) => {
        const object = asObject(entry);
        return object === undefined ? entry : { ...object, [field]: eventId };
      });
      this.fields.set(definition.list, { value: list, origin });
      return;
    }
    if (definition.component === undefined) {
      const fields = optionFields(trigger, options);
      if (definition.fieldIsObject === true) {
        // An `{ event, ...options }` object of the data (a vehicle's `on_tick`).
        const existing = asObject(this.data[field]) ?? {};
        const value: JsonObject = { ...existing };
        for (const [name, option] of Object.entries(fields)) {
          if (value[name] === undefined) value[name] = option;
        }
        value.event = eventId;
        this.fields.set(field, { value, origin });
        return;
      }
      // A field of the data (a key bind's `msm:on_press`); options are fields of the data too.
      this.fields.set(field, { value: eventId, origin });
      for (const [name, option] of Object.entries(fields)) {
        if (this.data[name] === undefined && !this.fields.has(name)) {
          this.fields.set(name, { value: option, origin });
        }
      }
      return;
    }
    const key = definition.component;
    let entry = this.components.get(key);
    if (entry === undefined) {
      const existing = asObject(asObject(this.data.components)?.[key]) ?? {};
      entry = { value: { ...existing }, origin };
      this.components.set(key, entry);
    }
    const component = entry.value;
    if (definition.field === undefined) {
      const fields = optionFields(trigger, options);
      for (const [name, value] of Object.entries(fields)) {
        if (component[name] === undefined) component[name] = value;
      }
      component.event = eventId;
    } else if (definition.fieldIsObject === true) {
      component[definition.field] = {
        ...(asObject(component[definition.field]) ?? {}),
        event: eventId,
      };
    } else {
      component[definition.field] = eventId;
    }
  }

  patches(): ElementPatch[] {
    const out: ElementPatch[] = [];
    const elementId = this.subject.id;
    const group = (field: string, entries: Map<string, { value: Json; origin: Origin }>): void => {
      if (entries.size === 0) return;
      if (asObject(this.data[field]) !== undefined) {
        for (const [key, { value, origin }] of entries) {
          out.push({ elementId, path: [field, key], value, origin });
        }
        return;
      }
      const value: JsonObject = {};
      let origin: Origin | undefined;
      for (const [key, entry] of entries) {
        value[key] = entry.value;
        origin ??= entry.origin;
      }
      if (origin !== undefined) out.push({ elementId, path: [field], value, origin });
    };
    group('events', this.events);
    group('components', this.components);
    for (const [field, { value, origin }] of this.fields) {
      out.push({ elementId, path: [field], value, origin });
    }
    return out;
  }
}
