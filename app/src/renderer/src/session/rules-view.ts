/**
 * A read-only view of a project's Rules (ADR 0082 D3, D7, D10) for the Studios' Rules sections
 * and the events editor's "From rules" list (B375): which rules name a subject, and which
 * events Rules generate on it. Rule events are made at lowering time and never saved, so they
 * are read from an expansion of the project (`expandProject` of `@msm/core`), never from the
 * saved elements. Also the session's two Rules notes on exports: `rules.needs-jar` (a vanilla
 * pack carries no rules, R8) and `rules.not-in-eject` (rules that need a script are left out of
 * the Java eject, R9).
 *
 * @packageDocumentation
 */

import {
  type Element,
  type ExpandProjectResult,
  type Json,
  type JsonObject,
  originForProblem,
  type Problem,
  type Project,
  type ResourceLocation,
  toJsonPointer,
} from '@msm/core';
import type { ElementPatchOrigin } from '@msm/plugin-api';
import { RULES_KIND } from '@msm/plugin-rules';
import { ruleScriptSource } from './scripting-problems';

/** Problem codes of the session's Rules notes on exports. */
export const RulesSessionProblemCodes = {
  /** A vanilla pack export of a project with rules: they need the Fabric mod jar (info). */
  needsJar: 'rules.needs-jar',
  /** A rule left out of the Java eject because it needs a script (warning). */
  notInEject: 'rules.not-in-eject',
} as const;

/** One rule of a rule book, as {@link RulesView.rulesFor} lists it. */
export interface RuleEntry {
  /** The rule book. */
  bookId: ResourceLocation;
  /** The rule's index in the book's `rules`. */
  index: number;
  /** The pointer of the rule in the book, `/rules/<index>`. */
  pointer: string;
  /** The rule's stable key (may be empty in a hand-edited file). */
  key: string;
  /** The rule's own name, when it has one. */
  name?: string;
  /** The `when.trigger` id. */
  trigger: string;
  /** Whether the rule runs (`enabled` is not `false`). */
  enabled: boolean;
  /** The saved rule, read only. */
  rule: JsonObject;
}

/** One event Rules generate on a subject, as {@link RulesView.ruleEventsFor} lists it. */
export interface RuleEventEntry {
  /** The event id, `<subject id>_rules_<trigger>`. */
  eventId: string;
  /** The trigger id, read from the event id. */
  trigger: string;
  /** The generated event (`{ actions: [...] }`), read only. */
  event: Json;
  /** The rule the event comes from (its book and `/rules/<index>`). */
  origin: ElementPatchOrigin;
}

/** What the Studios read about Rules. */
export interface RulesView {
  /** The rule books of the project, in namespace order, then stored order. */
  readonly books: readonly Element[];
  /**
   * Every rule whose `when.subject` is `subjectId`, book by book (books in id order), rules in
   * book order; disabled rules included.
   */
  rulesFor(subjectId: string): RuleEntry[];
  /**
   * The events Rules generate on `subjectId`, in event id order; empty without an expansion or
   * when no enabled rule names the subject.
   */
  ruleEventsFor(subjectId: string): RuleEventEntry[];
  /**
   * The keys of a book's rules that run in its generated script (so are not in the Java
   * eject); empty for a book whose rules are all plain, or without an expansion.
   */
  scriptRuleKeys(bookId: string): ReadonlySet<string>;
}

const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

const byId = (a: Element, b: Element): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The rule books of a project, in namespace order, then stored order. */
export function ruleBooks(project: Project | null): Element[] {
  return (
    project?.namespaces.flatMap((namespace) =>
      namespace.elements.filter((element) => element.kind === RULES_KIND),
    ) ?? []
  );
}

/** The rules of one book's data, in order (entries that are not objects are skipped). */
export function bookRuleEntries(book: Element): RuleEntry[] {
  const rules = asObject(book.data)?.rules;
  if (!Array.isArray(rules)) return [];
  const entries: RuleEntry[] = [];
  rules.forEach((value, index) => {
    const rule = asObject(value);
    if (rule === undefined) return;
    const when = asObject(rule.when);
    const entry: RuleEntry = {
      bookId: book.id,
      index,
      pointer: `/rules/${index}`,
      key: typeof rule.key === 'string' ? rule.key : '',
      trigger: typeof when?.trigger === 'string' ? when.trigger : '',
      enabled: rule.enabled !== false,
      rule,
    };
    if (typeof rule.name === 'string') entry.name = rule.name;
    entries.push(entry);
  });
  return entries;
}

/** The `// rule:<key>` markers of generated script lines. */
function markedKeys(lines: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const line of lines) {
    const key = /\/\/ rule:([a-z0-9_]{1,32})\s*$/.exec(line)?.[1];
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

/**
 * The Rules view of a project.
 *
 * @param project - The saved project (its books are read).
 * @param expansion - An expansion of that project, for the generated events and scripts;
 *   without it {@link RulesView.ruleEventsFor} and {@link RulesView.scriptRuleKeys} are empty.
 */
export function createRulesView(
  project: Project | null,
  expansion?: Pick<ExpandProjectResult, 'project' | 'origins'>,
): RulesView {
  const books = ruleBooks(project);
  const sorted = [...books].sort(byId);
  const expanded = new Map<string, Element>();
  for (const namespace of expansion?.project.namespaces ?? []) {
    for (const element of namespace.elements) expanded.set(element.id, element);
  }
  const saved = new Map<string, Element>();
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) saved.set(element.id, element);
  }
  const scriptKeys = new Map<string, ReadonlySet<string>>();
  return {
    books,
    rulesFor(subjectId) {
      return sorted.flatMap((book) =>
        bookRuleEntries(book).filter((entry) => asObject(entry.rule.when)?.subject === subjectId),
      );
    },
    ruleEventsFor(subjectId) {
      if (expansion === undefined) return [];
      const subject = expanded.get(subjectId);
      const events = asObject(asObject(subject?.data)?.events);
      if (events === undefined) return [];
      const savedEvents = asObject(asObject(saved.get(subjectId)?.data)?.events) ?? {};
      const stem = `${subjectId}_rules_`;
      const entries: RuleEventEntry[] = [];
      for (const [eventId, event] of Object.entries(events)) {
        // A rule event is patched in and never saved (a saved one would clash, ADR 0082 D6).
        if (Object.hasOwn(savedEvents, eventId)) continue;
        const origin = originForProblem(expansion.origins, {
          severity: 'info',
          code: '',
          message: '',
          elementId: subjectId as ResourceLocation,
          path: toJsonPointer(['events', eventId]),
        });
        if (origin === undefined) continue;
        entries.push({
          eventId,
          trigger: eventId.startsWith(stem) ? eventId.slice(stem.length) : '',
          event,
          origin: { elementId: origin.elementId, pointer: origin.pointer },
        });
      }
      return entries.sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
    },
    scriptRuleKeys(bookId) {
      const cached = scriptKeys.get(bookId);
      if (cached !== undefined) return cached;
      const book = expanded.get(bookId);
      const source = book === undefined ? undefined : ruleScriptSource(book);
      const keys = source === undefined ? new Set<string>() : markedKeys(source.lines);
      scriptKeys.set(bookId, keys);
      return keys;
    },
  };
}

/** Whether a project has a rule book with at least one rule. */
export function hasRules(project: Project): boolean {
  return ruleBooks(project).some((book) => bookRuleEntries(book).length > 0);
}

/**
 * The `rules.needs-jar` note (ADR 0082 D10, R8) for a vanilla pack export of `project`, or
 * `undefined` when it has no rules: packs carry no rules, which need the Fabric mod jar.
 */
export function rulesNeedJarProblem(project: Project): Problem | undefined {
  const book = ruleBooks(project).find((entry) => bookRuleEntries(entry).length > 0);
  if (book === undefined) return undefined;
  return {
    severity: 'info',
    code: RulesSessionProblemCodes.needsJar,
    elementId: book.id,
    message:
      'Rules are not in vanilla packs: they need the Fabric mod jar. Export the Fabric mod jar to play with your rules.',
  };
}

/**
 * The `rules.not-in-eject` warnings (ADR 0082 D10, R9) of a Java eject: one per enabled rule
 * that runs in a generated script, which the eject leaves out. Plain rules eject as events.
 *
 * @param project - The saved project.
 * @param expansion - Its expansion, as the eject received it.
 */
export function rulesNotInEjectProblems(
  project: Project,
  expansion: Pick<ExpandProjectResult, 'project' | 'origins'>,
): Problem[] {
  const view = createRulesView(project, expansion);
  const problems: Problem[] = [];
  for (const book of [...view.books].sort(byId)) {
    const keys = view.scriptRuleKeys(book.id);
    if (keys.size === 0) continue;
    for (const entry of bookRuleEntries(book)) {
      if (!entry.enabled || !keys.has(entry.key)) continue;
      const label = entry.name === undefined ? `"${entry.key}"` : `"${entry.name}"`;
      problems.push({
        severity: 'warning',
        code: RulesSessionProblemCodes.notInEject,
        elementId: book.id,
        path: entry.pointer,
        message: `The rule ${label} needs a script, and scripts are not in the Java project, so it does nothing there. Rules without logic are in it as events; "Copy as my own script" gives you the code to port by hand.`,
      });
    }
  }
  return problems;
}
