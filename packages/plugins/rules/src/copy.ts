/**
 * "Copy as my own script" (ADR 0082 D7 (d)): what a rule book becomes when the user takes its
 * output over as ordinary project content, so the game keeps doing the same without the book.
 *
 * A book's output has three parts, and each is kept:
 *
 * - **The generated script** (handlers for `run_script` and `msm.events.on` listeners) becomes
 *   the lines of a normal `msm:script` element, `<book ns>:<book path>_script` or a free variant.
 *   Only the header comment changes; the handler ids, counters and log lines stay as they were.
 * - **The generated events** on the subjects exist only while the book is on. Each becomes a
 *   hand-made event on its subject, `<subject id>_script_<trigger>` (or a free variant), with the
 *   same actions (a `trigger_event` to an older hand-made event first, then the book's plain
 *   actions or its `run_script`), and the trigger is pointed at it. The trigger options in force
 *   (the subject's own, else the first rule's, R16) are written onto the component. So the
 *   handlers the script defines are still called from the same triggers. Turning `run_script`
 *   handlers into `msm.events.on` listeners instead is rejected: definition triggers (an item's
 *   use, a block's random tick, a mob's attack) have no script event, and plain rules have no
 *   handler at all.
 * - **The book** is turned off: every rule gets `enabled: false` (the format's own switch), so
 *   it compiles to nothing and can be turned back on.
 *
 * Other books keep compiling. When another book with an earlier id shares a subject and
 * trigger, its part ran before this book's and now runs after it (the copied event is
 * hand-made, and hand-made events run first); the result says so in `warnings`.
 */
import type {
  Element,
  ElementPatch,
  Json,
  JsonObject,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';
import { asObject, bookRules, ruleEnabled } from './book';
import { TRIGGERS, type TriggerEntry } from './catalogue';
import { compileRuleBooks, ruleEventId } from './compile';
import { RULES_KIND } from './kinds';
import { RULES_SCRIPT_FIELD, ruleScriptPath } from './lowering';

/** One subject's data after the copy. */
export interface CopiedSubject {
  readonly elementId: ResourceLocation;
  /** The subject's saved data with the copied events and trigger references. */
  readonly data: JsonObject;
  /** The events written, by trigger id. */
  readonly events: readonly { readonly trigger: string; readonly eventId: string }[];
}

/** What "Copy as my own script" changes. */
export interface RuleBookCopy {
  /** The id of the new script element (free in the project). */
  readonly scriptId: ResourceLocation;
  /** Its lines, or `null` when every rule is plain (no script: events only). */
  readonly scriptLines: string[] | null;
  /** The subjects that get hand-made copies of the book's events, in id order. */
  readonly subjects: readonly CopiedSubject[];
  /** The book's data with every rule turned off. */
  readonly book: JsonObject;
  /** Behaviour that differs from before (plain words), usually none. */
  readonly warnings: readonly string[];
}

/** The outcome of {@link copyRuleBookAsScript}. */
export type RuleBookCopyResult =
  | ({ readonly ok: true } & RuleBookCopy)
  | { readonly ok: false; readonly reason: string };

const byId = (a: Element, b: Element): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** `data` with `patches` (of one element) applied, as `@msm/core` applies them. */
function patched(data: Json, patches: readonly ElementPatch[]): JsonObject {
  const out = structuredClone(asObject(data) ?? {});
  for (const patch of patches) {
    let node: JsonObject = out;
    for (const key of patch.path.slice(0, -1)) {
      const next = asObject(node[String(key)]);
      if (next === undefined) {
        const created: JsonObject = {};
        node[String(key)] = created;
        node = created;
      } else {
        node = next;
      }
    }
    const last = String(patch.path[patch.path.length - 1]);
    if (patch.value === null) delete node[last];
    else node[last] = structuredClone(patch.value);
  }
  return out;
}

/** The event id a definition trigger names in `data`, if any. */
function eventAt(data: JsonObject, trigger: TriggerEntry): string | undefined {
  const definition = trigger.definition;
  if (definition === undefined) return undefined;
  const read = (value: Json | undefined) => (typeof value === 'string' ? value : undefined);
  if (definition.component === undefined) return read(data[definition.field ?? '']);
  const component = asObject(asObject(data.components)?.[definition.component]);
  if (definition.field === undefined) return read(component?.event);
  if (definition.fieldIsObject === true)
    return read(asObject(component?.[definition.field])?.event);
  return read(component?.[definition.field]);
}

/**
 * Points `trigger` of `data` at `eventId`, copying the option fields in force from `expanded`
 * (the subject as every book's expansion leaves it) where the saved component lacks them.
 */
function pointTrigger(
  data: JsonObject,
  trigger: TriggerEntry,
  eventId: string,
  expanded: JsonObject,
): void {
  const definition = trigger.definition;
  if (definition === undefined) return;
  if (definition.component === undefined) {
    data[definition.field ?? ''] = eventId;
    return;
  }
  const components = { ...(asObject(data.components) ?? {}) };
  const component = { ...(asObject(components[definition.component]) ?? {}) };
  if (definition.field === undefined) {
    const inForce = asObject(asObject(expanded.components)?.[definition.component]) ?? {};
    for (const mapping of trigger.options) {
      const value = inForce[mapping.field];
      if (component[mapping.field] === undefined && value !== undefined) {
        component[mapping.field] = structuredClone(value);
      }
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
  components[definition.component] = component;
  data.components = components;
}

/** `base`, or `base_2`, `base_3`, ... : the first that `taken` refuses. */
function freeName(base: string, taken: (candidate: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken(candidate)) return candidate;
  }
}

/** The actions of an event, or none. */
const actionsOf = (event: Json | undefined): readonly Json[] => {
  const actions = asObject(event)?.actions;
  return Array.isArray(actions) ? actions : [];
};

const sameJson = (a: Json, b: Json): boolean => JSON.stringify(a) === JSON.stringify(b);

const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);
const namespaceOf = (id: string): string => id.slice(0, id.indexOf(':'));

/** The path a `msm:script` element lowers to (`msm/<ns>/script/<path>.ts`). */
const scriptPathOf = (id: string): string => `msm/${namespaceOf(id)}/script/${pathOf(id)}.ts`;

/**
 * Works out "Copy as my own script" for the rule book `bookId` of a project's `elements` on
 * `target` (pure). Not offered (`ok: false`, with the reason) when the book is missing, has no
 * rule turned on, or has compile errors (its output would not be what the user sees).
 */
export function copyRuleBookAsScript(
  bookId: string,
  elements: readonly Element[],
  target: TargetFacts,
): RuleBookCopyResult {
  const book = elements.find((element) => element.id === bookId && element.kind === RULES_KIND);
  if (book === undefined) return { ok: false, reason: `No rule book "${bookId}".` };
  const bookData = asObject(book.data) ?? {};
  const rules = bookRules(bookData);
  if (!rules.some(({ rule }) => ruleEnabled(rule))) {
    return { ok: false, reason: 'No rule in this book is turned on, so there is nothing to copy.' };
  }
  const books = elements.filter((element) => element.kind === RULES_KIND).sort(byId);
  const full = compileRuleBooks(books, elements, target);
  if (
    full.problems.some((problem) => problem.elementId === bookId && problem.severity === 'error')
  ) {
    return { ok: false, reason: 'Fix the problems in this rule book first.' };
  }
  // The book alone gives its own part of every event it shares with other books (a hand-made
  // event first, then its plain actions or its `run_script`); the full compilation gives the
  // trigger options in force and the script, exactly as the expander makes them.
  const solo = compileRuleBooks([book], elements, target);
  const generated = full.scripts.get(book.id as ResourceLocation);

  const byElement = new Map(elements.map((element) => [element.id as string, element]));
  const soloSubjects = [...new Set(solo.patches.map((patch) => patch.elementId as string))].sort();
  const subjects: CopiedSubject[] = [];
  const warnings: string[] = [];

  for (const subjectId of soloSubjects) {
    const subject = byElement.get(subjectId);
    if (subject === undefined) continue;
    const saved = asObject(subject.data) ?? {};
    const mine = patched(
      saved,
      solo.patches.filter((patch) => patch.elementId === subjectId),
    );
    const expanded = patched(
      saved,
      full.patches.filter((patch) => patch.elementId === subjectId),
    );
    const data: JsonObject = structuredClone(saved);
    const events: JsonObject = { ...(asObject(data.events) ?? {}) };
    const written: { trigger: string; eventId: string }[] = [];
    for (const trigger of TRIGGERS) {
      if (trigger.definition === undefined || !trigger.subjectKinds.includes(subject.kind))
        continue;
      const generatedId = ruleEventId(subject.id, trigger.id);
      if (eventAt(mine, trigger) !== generatedId) continue;
      const event = asObject(mine.events)?.[generatedId];
      if (event === undefined) continue;
      const eventId = freeName(`${subject.id}_script_${trigger.id}`, (candidate) =>
        Object.hasOwn(events, candidate),
      );
      events[eventId] = structuredClone(event);
      data.events = events;
      pointTrigger(data, trigger, eventId, expanded);
      written.push({ trigger: trigger.id, eventId });
      // Another book with an earlier id on this subject and trigger ran first; now it runs after.
      const handMade = eventAt(saved, trigger) === undefined ? 0 : 1;
      const own = actionsOf(event).slice(handMade);
      const shared = actionsOf(asObject(expanded.events)?.[generatedId]).slice(handMade);
      if (shared.length > own.length && !sameJson(shared.slice(0, own.length), own)) {
        warnings.push(
          `On ${subject.id}, "${trigger.label}": the rules of an earlier rule book now run after these, not before.`,
        );
      }
    }
    if (written.length > 0) {
      subjects.push({ elementId: subject.id as ResourceLocation, data, events: written });
    }
  }

  const bookPaths = new Set(books.map((other) => ruleScriptPath(other.id)));
  const ids = new Set(elements.map((element) => element.id as string));
  const scriptId = freeName(
    `${namespaceOf(book.id)}:${pathOf(book.id)}_script`,
    (candidate) => ids.has(candidate) || bookPaths.has(scriptPathOf(candidate)),
  ) as ResourceLocation;

  const scriptLines =
    generated === undefined
      ? null
      : [
          `// Copied from the rule book ${book.id} with "Copy as my own script": this is your own script now, and the book's rules are turned off.`,
          ...generated.slice(1),
        ];

  const nextBook: JsonObject = structuredClone(bookData);
  delete nextBook[RULES_SCRIPT_FIELD];
  nextBook.rules = (Array.isArray(bookData.rules) ? bookData.rules : []).map((rule) => {
    const object = asObject(rule);
    return object === undefined
      ? structuredClone(rule)
      : { ...structuredClone(object), enabled: false };
  });

  return { ok: true, scriptId, scriptLines, subjects, book: nextBook, warnings };
}
