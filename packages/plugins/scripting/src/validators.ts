/**
 * Cross-element checks of scripts (ADR 0032 D4). Every validator is pure and reads only the
 * project's elements. Scripts are not executed in the app, so handler definitions are found
 * textually: a script defines a handler when its text contains `msm.actions.define("<id>"` or
 * `msm.actions.define('<id>'` (whitespace around the dots and the parenthesis is allowed).
 * Blocks, items and entities are `msm:block`, `msm:item` and `msm:entity` elements, read by
 * kind string only (they belong to other plugins). Codes:
 *
 * - `scripting.unknown-handler` (warning): a `run_script` action of a block, item or entity
 *   event names a handler that no script of the project defines. The runtime logs the missing
 *   handler once when the event runs.
 * - `scripting.duplicate-handler` (warning): two or more scripts define the same handler; the
 *   one loaded last replaces the others. Reported on every script involved.
 * - `scripting.empty-script` (info): a script without a non-blank line.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { SCRIPT_KIND } from './kinds';
import { isRecord } from './lowering/paths';

/** Every code the validators report. */
export const SCRIPTING_PROBLEM_CODES = Object.freeze([
  'scripting.unknown-handler',
  'scripting.duplicate-handler',
  'scripting.empty-script',
] as const);

/** The definition kinds whose events may hold `run_script` actions. */
export const RUN_SCRIPT_OWNER_KINDS: readonly string[] = Object.freeze([
  'msm:block',
  'msm:item',
  'msm:entity',
]);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

/** The script's lines, or an empty list when `data.lines` is not a string array. */
function linesOf(element: Element): string[] {
  const lines = record(element.data)?.lines;
  return Array.isArray(lines) && lines.every((line) => typeof line === 'string') ? lines : [];
}

const DEFINE_PATTERN =
  /msm\s*\.\s*actions\s*\.\s*define\s*\(\s*(?:"([^"\\\r\n]*)"|'([^'\\\r\n]*)')/g;

/** One handler definition found in a script. */
export interface HandlerDefinition {
  /** The handler id as written. */
  handler: string;
  /** The index of the line holding the id. */
  line: number;
  /** The id's span within that line (without the quotes). */
  range: { start: number; end: number };
}

/**
 * The handlers a script defines, in source order (ADR 0032 D4: a textual check).
 *
 * @param lines - The script's lines.
 * @returns Every `msm.actions.define("<id>"` found, with the line and span of the id.
 */
export function findHandlerDefinitions(lines: readonly string[]): HandlerDefinition[] {
  const text = lines.join('\n');
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const found: HandlerDefinition[] = [];
  for (const match of text.matchAll(DEFINE_PATTERN)) {
    const handler = match[1] ?? match[2] ?? '';
    // The id ends just before the closing quote, which ends the match.
    const end = (match.index ?? 0) + match[0].length - 1;
    const start = end - handler.length;
    let line = 0;
    while (line + 1 < lineStarts.length && (lineStarts[line + 1] as number) <= start) line += 1;
    const lineStart = lineStarts[line] ?? 0;
    found.push({ handler, line, range: { start: start - lineStart, end: end - lineStart } });
  }
  return found;
}

const scripts = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === SCRIPT_KIND);

/** One `run_script` action inside a definition element. */
interface RunScriptAction {
  handler: string;
  path: string;
}

function runScriptActions(element: Element): RunScriptAction[] {
  const found: RunScriptAction[] = [];
  const events = record(record(element.data)?.events) ?? {};
  for (const [name, event] of Object.entries(events)) {
    const actions = record(event)?.actions;
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      const fields = record(action);
      if (fields?.type === 'run_script' && typeof fields.handler === 'string') {
        found.push({
          handler: fields.handler,
          path: pointer('events', name, 'actions', index, 'handler'),
        });
      }
    });
  }
  return found;
}

function unknownHandlers(elements: readonly Element[]): Problem[] {
  const defined = new Set<string>();
  for (const script of scripts(elements)) {
    for (const definition of findHandlerDefinitions(linesOf(script))) {
      defined.add(definition.handler);
    }
  }
  const problems: Problem[] = [];
  for (const element of elements) {
    if (!RUN_SCRIPT_OWNER_KINDS.includes(element.kind)) continue;
    for (const action of runScriptActions(element)) {
      if (defined.has(action.handler)) continue;
      problems.push({
        severity: 'warning',
        code: 'scripting.unknown-handler',
        elementId: element.id,
        path: action.path,
        message: `No script defines the handler "${action.handler}". Add msm.actions.define("${action.handler}", (e) => { ... }) to a script, or pick a handler a script defines; until then the game logs the missing handler when the event runs.`,
      });
    }
  }
  return problems;
}

function duplicateHandlers(elements: readonly Element[]): Problem[] {
  const byHandler = new Map<string, { element: Element; definition: HandlerDefinition }[]>();
  for (const script of scripts(elements)) {
    const seen = new Set<string>();
    for (const definition of findHandlerDefinitions(linesOf(script))) {
      if (seen.has(definition.handler)) continue;
      seen.add(definition.handler);
      const entries = byHandler.get(definition.handler) ?? [];
      entries.push({ element: script, definition });
      byHandler.set(definition.handler, entries);
    }
  }
  const problems: Problem[] = [];
  for (const [handler, entries] of byHandler) {
    if (entries.length < 2) continue;
    for (const { element, definition } of entries) {
      const others = entries
        .filter((entry) => entry.element !== element)
        .map((entry) => entry.element.id)
        .sort()
        .join(', ');
      problems.push({
        severity: 'warning',
        code: 'scripting.duplicate-handler',
        elementId: element.id,
        path: pointer('lines', definition.line),
        range: definition.range,
        message: `The handler "${handler}" is also defined in ${others}. Only the definition loaded last is used; give each handler its own id.`,
      });
    }
  }
  return problems;
}

function emptyScripts(elements: readonly Element[]): Problem[] {
  return scripts(elements)
    .filter((script) => linesOf(script).every((line) => line.trim() === ''))
    .map((script) => ({
      severity: 'info' as const,
      code: 'scripting.empty-script',
      elementId: script.id,
      path: '/lines',
      message: 'This script is empty and does nothing in the game.',
    }));
}

export const scriptingValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.scripting.unknown-handler',
    kinds: [SCRIPT_KIND, ...RUN_SCRIPT_OWNER_KINDS],
    validate: ({ elements }) => unknownHandlers(elements),
  },
  {
    id: 'msm.scripting.duplicate-handler',
    kinds: [SCRIPT_KIND],
    validate: ({ elements }) => duplicateHandlers(elements),
  },
  {
    id: 'msm.scripting.empty-script',
    kinds: [SCRIPT_KIND],
    validate: ({ elements }) => emptyScripts(elements),
  },
] satisfies ProjectValidator[]);
