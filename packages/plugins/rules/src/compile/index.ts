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
 * - Script-only triggers: `msm.events.on` handlers in the script, one per trigger and subject.
 */
import type { Element, Json, JsonObject, ResourceLocation, TargetFacts } from '@msm/plugin-api';
import { asObject, bookCounters, bookRules, pointer, ruleEnabled, stepList, str } from '../book';
import { type TriggerEntry, triggerById } from '../catalogue';
import { ruleSentence, whenSentence } from '../sentence';
import { checkRule, Reporter } from './check';
import { plainActions } from './plain';
import { ScriptBuilder, type ScriptRule } from './script';
import { RULES_COMPILE_CODES as CODES, type CompiledRuleBook, type ElementPatch } from './types';

export { plainAction, plainActions } from './plain';
export { literal } from './script';
export * from './types';

/** One enabled, checked rule. */
interface Compiled {
  readonly rule: JsonObject;
  readonly index: number;
  readonly key: string;
}

interface DefinitionGroup {
  readonly trigger: TriggerEntry;
  readonly subject: Element;
  readonly rules: Compiled[];
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
    const name = str(asObject(element.data), 'display_name');
    if (name !== undefined && name.trim().length > 0) names.set(element.id, name);
  }
  return (id) => names.get(id);
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

/** The hand-made event already on the trigger, if any. */
function handMadeEvent(data: JsonObject, trigger: TriggerEntry): string | undefined {
  const definition = trigger.definition;
  if (definition === undefined) return undefined;
  if (definition.component === undefined) return str(data, definition.field ?? '');
  const component = asObject(asObject(data.components)?.[definition.component]);
  if (definition.field === undefined) return str(component, 'event');
  if (definition.fieldIsObject === true)
    return str(asObject(component?.[definition.field]), 'event');
  return str(component, definition.field);
}

/** Converts a rule's trigger options to component fields (R16: the subject's own values win). */
function optionFields(trigger: TriggerEntry, options: JsonObject | undefined): JsonObject {
  const fields: JsonObject = {};
  for (const mapping of trigger.options) {
    const value = options?.[mapping.option];
    if (value === undefined) continue;
    if (mapping.convert === 'ticks') {
      if (typeof value !== 'number') continue;
      fields[mapping.field] = Math.max(mapping.min ?? 0, Math.round(value * 20));
    } else {
      fields[mapping.field] = value;
    }
  }
  return fields;
}

/**
 * Compiles one rule book (an `msm:rules` element) against the project's elements and a target.
 * Disabled rules are left out; a rule with an error is reported and left out; the others still
 * compile.
 */
export function compileRuleBook(
  book: Element,
  elements: readonly Element[],
  target: TargetFacts,
): CompiledRuleBook {
  const data = asObject(book.data) ?? {};
  const reporter = new Reporter(book.id);
  const names = namesFromElements(elements);
  const byId = new Map(elements.map((element) => [element.id as string, element]));
  const definitionGroups = new Map<string, DefinitionGroup>();
  const scriptGroups = new Map<string, ScriptGroup>();

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
    if (!checkRule(rule, base, trigger, reporter)) continue;
    const compiled: Compiled = { rule, index, key: str(rule, 'key') ?? '' };
    const subjectId = str(when, 'subject');
    if (trigger.definition === undefined) {
      const groupKey = `${trigger.id}|${subjectId ?? ''}`;
      let group = scriptGroups.get(groupKey);
      if (group === undefined) {
        group = { trigger, subject: subjectId, rules: [] };
        scriptGroups.set(groupKey, group);
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
          ? `"${trigger.label}" needs one of your ${trigger.subject === 'mob' ? 'mobs' : `${trigger.subject}s`}.`
          : `"${subjectId}" is not one of your ${trigger.subject === 'mob' ? 'mobs' : `${trigger.subject}s`}.`,
      );
      continue;
    }
    if (!subjectFits(subject, trigger, pointer(base, 'when'), reporter)) continue;
    const groupKey = `${subject.id}|${trigger.id}`;
    let group = definitionGroups.get(groupKey);
    if (group === undefined) {
      group = { trigger, subject, rules: [] };
      definitionGroups.set(groupKey, group);
    }
    group.rules.push(compiled);
  }

  const builder = new ScriptBuilder(book.id, bookCounters(data));
  const scriptRule = (compiled: Compiled): ScriptRule => ({
    rule: compiled.rule,
    key: compiled.key,
    sentence: ruleSentence(compiled.rule, names),
  });
  const subjects = new Map<string, SubjectPatches>();

  for (const group of definitionGroups.values()) {
    const { trigger, subject } = group;
    const plain = group.rules.map((compiled) => plainActions(compiled.rule, trigger));
    let rules = group.rules;
    const isPlain = plain.every((actions) => actions !== undefined);
    if (!isPlain) {
      rules = group.rules.filter((compiled) => {
        if (!hasLightPortal(compiled.rule)) return true;
        reporter.error(
          CODES.needsPlain,
          pointer(`/rules/${compiled.index}`, 'do'),
          '"Light a portal" works only when every rule on this trigger is a plain one, without conditions, waits or other logic.',
        );
        return false;
      });
      if (rules.length === 0) continue;
    }
    const subjectData = asObject(subject.data) ?? {};
    const eventId = ruleEventId(subject.id, trigger.id);
    const origin = { elementId: book.id, pointer: `/rules/${rules[0]?.index ?? 0}` };
    const existingEvents = asObject(subjectData.events) ?? {};
    const handMade = handMadeEvent(subjectData, trigger);
    if (existingEvents[eventId] !== undefined || handMade === eventId) {
      reporter.error(
        CODES.eventIdClash,
        pointer(origin.pointer, 'when', 'subject'),
        `"${subject.id}" already has an event "${eventId}"; rename that event so Rules can use the id.`,
      );
      continue;
    }
    const actions: Json[] = [];
    if (handMade !== undefined) actions.push({ type: 'trigger_event', event: handMade });
    if (isPlain) {
      for (const list of plain) actions.push(...(list ?? []));
    } else {
      const handler = ruleHandlerId(book.id, subject.id, trigger.id);
      actions.push({ type: 'run_script', handler });
      builder.addDefinitionHandler(
        handler,
        trigger,
        `${names(subject.id) ?? subject.id}: ${trigger.label.toLowerCase()}.`,
        rules.map(scriptRule),
      );
    }
    let patches = subjects.get(subject.id);
    if (patches === undefined) {
      patches = new SubjectPatches(subject);
      subjects.set(subject.id, patches);
    }
    patches.event(eventId, { actions }, origin);
    patches.trigger(trigger, eventId, asObject(asObject(rules[0]?.rule.when)?.options), origin);
  }

  for (const group of scriptGroups.values()) {
    const first = group.rules[0];
    const options = asObject(asObject(first?.rule.when)?.options) ?? {};
    builder.addEventHandler(
      group.trigger,
      group.subject,
      options,
      `${whenSentence(asObject(first?.rule.when), names)}.`,
      group.rules.map(scriptRule),
    );
  }

  let script = builder.lines();
  if (script !== null && target.fabric === undefined) {
    reporter.error(
      CODES.noScripts,
      '/rules',
      `Some rules need a script, and ${target.mcVersion} has no script runtime in MSM.`,
    );
    script = null;
  }

  return {
    patches: [...subjects.values()].flatMap((subject) => subject.patches()),
    script,
    problems: reporter.problems,
  };
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
    if (definition.component === undefined) {
      this.fields.set(definition.field ?? '', { value: eventId, origin });
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
