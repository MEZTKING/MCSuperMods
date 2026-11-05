/**
 * Pure helpers of the Script Studio and the `run_script` action (B137b): the events and
 * handlers a script registers, found textually as `@msm/plugin-scripting` finds handler
 * definitions (ADR 0032 D4), and the handler ids every script of a project defines.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { findHandlerDefinitions, SCRIPT_KIND } from '@msm/plugin-scripting';

export { SCRIPT_KIND };

const EVENT_PATTERN = /msm\s*\.\s*events\s*\.\s*on\s*\(\s*(?:"([^"\\\r\n]*)"|'([^'\\\r\n]*)')/g;

/** `data.lines` when it is a list of strings, else `undefined`. */
export function scriptLinesOf(data: Json): string[] | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const lines = data.lines;
  if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) return undefined;
  return lines as string[];
}

/** What a script registers: event names and handler ids, each once, in source order. */
export interface ScriptSummary {
  events: string[];
  handlers: string[];
}

/** The `msm.events.on("…")` names and `msm.actions.define("…")` ids of a script. */
export function summariseScript(lines: readonly string[]): ScriptSummary {
  const text = lines.join('\n');
  const events: string[] = [];
  for (const match of text.matchAll(EVENT_PATTERN)) {
    const name = match[1] ?? match[2] ?? '';
    if (name !== '' && !events.includes(name)) events.push(name);
  }
  const handlers: string[] = [];
  for (const definition of findHandlerDefinitions(lines)) {
    if (definition.handler !== '' && !handlers.includes(definition.handler)) {
      handlers.push(definition.handler);
    }
  }
  return { events, handlers };
}

/** Every script element of a project, in namespace then element order. */
export function projectScripts(project: Project | null | undefined): Element[] {
  if (project === null || project === undefined) return [];
  return project.namespaces.flatMap((namespace) =>
    namespace.elements.filter((element) => element.kind === SCRIPT_KIND),
  );
}

/** The handler ids the project's scripts define, sorted, each once. */
export function projectHandlers(project: Project | null | undefined): string[] {
  const out = new Set<string>();
  for (const script of projectScripts(project)) {
    for (const handler of summariseScript(scriptLinesOf(script.data) ?? []).handlers) {
      out.add(handler);
    }
  }
  return [...out].sort();
}
