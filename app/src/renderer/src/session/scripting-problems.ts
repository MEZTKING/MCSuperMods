/**
 * Live script problems and the script parts of the export (ADRs 0031 D5, 0032 D5). TypeScript
 * runs in the main process; the session only sees an injected {@link ScriptingChecker} (the
 * platform's `scripting` service in the app, a stub or the Node service in tests). This module
 * maps its diagnostics onto MSM {@link Problem}s of the same shape as mcfunction problems:
 * `elementId`, `file` (the lowered `.ts`), `path: /lines/<n>` and a `range` within that line.
 * The scripts Rules generate (ADR 0082 D3, `msm/<ns>/script/rules/<book path>.ts`) are checked
 * and transpiled the same way; their problems land on the rule book, at the rule whose
 * `// rule:<key>` marker the line carries ({@link RuleScriptSource}).
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project, ResourceLocation } from '@msm/core';
import { outputFileBytes, type ScriptTranspileResult } from '@msm/exporters';
import type { OutputFile } from '@msm/plugin-api';
import { generatedScript, RULES_KIND, ruleScriptPath } from '@msm/plugin-rules';
import { SCRIPT_KIND, scriptPath } from '@msm/plugin-scripting';
import type { ScriptDiagnostic, ScriptTranspileOutcome } from '../../../shared/platform';

export type { ScriptDiagnostic };

/** The kind of script elements (`{ lines: string[] }`, ADR 0032 D3). */
export { SCRIPT_KIND };

/** The injected TypeScript service: `platform.scripting` in the app. */
export interface ScriptingChecker {
  transpile(source: string, name: string): Promise<ScriptTranspileOutcome>;
  check(source: string, name: string, typings: string): Promise<ScriptDiagnostic[]>;
}

/** Where the session writes the typings in the project (ADR 0032 D5). */
export const SCRIPT_TYPINGS_FILE = '.msm/msm-runtime.d.ts';

/** The lines of a script element, or `undefined` when its data is not `{ lines: string[] }`. */
export function scriptLines(element: Element): string[] | undefined {
  const data = element.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const lines = data.lines;
  if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) return undefined;
  return lines as string[];
}

/** The lowered path of a script element: `msm/<ns>/script/<path>.ts`. */
export function scriptOutputPath(id: ResourceLocation): string {
  const colon = id.indexOf(':');
  return scriptPath(id.slice(0, colon), id.slice(colon + 1));
}

/**
 * The element id of a lowered script file `msm/<ns>/script/<path>.ts`, or `undefined` for any
 * other path.
 */
export function scriptIdOfOutput(path: string): ResourceLocation | undefined {
  const match = /^msm\/([^/]+)\/script\/(.+)\.ts$/.exec(path);
  if (match === null) return undefined;
  return `${match[1]}:${match[2]}`;
}

/** The message of a diagnostic, with TypeScript's number. */
function messageOf(diagnostic: Pick<ScriptDiagnostic, 'message' | 'tsCode'>): string {
  return `${diagnostic.message} (TS${diagnostic.tsCode})`;
}

/**
 * One diagnostic as an MSM problem: `path: /lines/<n>` and a `range` within that line.
 *
 * @param diagnostic - The checker's diagnostic.
 * @param elementId - The script element, when known.
 * @param file - The lowered `.ts` path.
 */
export function scriptProblem(
  diagnostic: ScriptDiagnostic,
  elementId: ResourceLocation | undefined,
  file: string,
): Problem {
  const out: Problem = {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: messageOf(diagnostic),
    file,
    path: `/lines/${diagnostic.line}`,
    range: { start: diagnostic.start, end: diagnostic.end },
  };
  if (elementId !== undefined) out.elementId = elementId;
  return out;
}

/**
 * Checks one script element's source.
 *
 * @returns The problems, mapped by {@link scriptProblem}.
 */
export async function checkScriptElement(
  checker: ScriptingChecker,
  element: Element,
  lines: readonly string[],
  typings: string,
): Promise<Problem[]> {
  const file = scriptOutputPath(element.id);
  const diagnostics = await checker.check(lines.join('\n'), file, typings);
  return diagnostics.map((diagnostic) => scriptProblem(diagnostic, element.id, file));
}

const decoder = new TextDecoder('utf-8');

/** The source of a lowered script file (without the trailing newline lowering adds). */
function outputSource(file: OutputFile): string {
  return decoder.decode(outputFileBytes(file)).replace(/\n$/, '');
}

// Generated rule scripts (ADR 0082 D3) ---------------------------------------------------

/** The `// rule:<key>` marker the Rules compiler puts at the end of each rule's statements. */
const RULE_MARKER = /\/\/ rule:([a-z0-9_]{1,32})\s*$/;

/** A rule book's generated script, as the expanded project holds it. */
export interface RuleScriptSource {
  /** The rule book. */
  bookId: ResourceLocation;
  /** The lowered path, `msm/<ns>/script/rules/<book path>.ts`. */
  file: string;
  /** The generated lines. */
  lines: readonly string[];
  /** The index in the book's `rules` of each rule key. */
  ruleIndex: ReadonlyMap<string, number>;
}

/** The rule keys of a book's data, with their index in `rules`. */
function ruleIndexOf(data: Element['data']): Map<string, number> {
  const index = new Map<string, number>();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return index;
  const rules = data.rules;
  if (!Array.isArray(rules)) return index;
  rules.forEach((rule, position) => {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return;
    const key = rule.key;
    if (typeof key === 'string' && !index.has(key)) index.set(key, position);
  });
  return index;
}

/**
 * The generated script of an expanded rule book, or `undefined` for any other element and for
 * a book that needs no script (or has an unsafe id).
 */
export function ruleScriptSource(element: Element): RuleScriptSource | undefined {
  if (element.kind !== RULES_KIND) return undefined;
  const lines = generatedScript(element.data);
  if (lines === undefined) return undefined;
  let file: string;
  try {
    file = ruleScriptPath(element.id);
  } catch {
    return undefined;
  }
  return { bookId: element.id, file, lines, ruleIndex: ruleIndexOf(element.data) };
}

/**
 * Every generated rule script of an expanded project, by lowered path. The saved project has
 * none: the expander writes them (B368).
 */
export function ruleScriptSources(project: Project): Map<string, RuleScriptSource> {
  const sources = new Map<string, RuleScriptSource>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const source = ruleScriptSource(element);
      if (source !== undefined) sources.set(source.file, source);
    }
  }
  return sources;
}

/**
 * Where a line of a generated rule script belongs: the book and, when the line carries a
 * `// rule:<key>` marker of one of its rules, that rule (`/rules/<index>`). Shared lines (the
 * header and helpers, a handler's opening) belong to the book as a whole.
 *
 * @param source - The generated script.
 * @param line - The 0-based line.
 */
export function ruleScriptLocation(
  source: RuleScriptSource,
  line: number,
): { elementId: ResourceLocation; path?: string } {
  const key = RULE_MARKER.exec(source.lines[line] ?? '')?.[1];
  const index = key === undefined ? undefined : source.ruleIndex.get(key);
  return index === undefined
    ? { elementId: source.bookId }
    : { elementId: source.bookId, path: `/rules/${index}` };
}

/**
 * One diagnostic of a generated rule script as a problem on its book: `elementId` the book,
 * `path` the rule ({@link ruleScriptLocation}), `file` the lowered `.ts`, and the generated
 * line in the message (no `range`: the book has no text to point into).
 */
export function ruleScriptProblem(
  source: RuleScriptSource,
  diagnostic: Pick<ScriptDiagnostic, 'severity' | 'code' | 'message' | 'tsCode' | 'line'>,
): Problem {
  const out: Problem = {
    severity: diagnostic.severity,
    code: diagnostic.code,
    ...ruleScriptLocation(source, diagnostic.line),
    file: source.file,
    message: `The script Rules made for ${source.bookId}, line ${diagnostic.line + 1}: ${messageOf(diagnostic)}`,
  };
  return out;
}

/** Checks a generated rule script against the typings; problems land on the book. */
export async function checkRuleScript(
  checker: ScriptingChecker,
  source: RuleScriptSource,
  typings: string,
): Promise<Problem[]> {
  const diagnostics = await checker.check(source.lines.join('\n'), source.file, typings);
  return diagnostics.map((diagnostic) => ruleScriptProblem(source, diagnostic));
}

/** Finds the generated rule script of a lowered path, for the export's checks. */
export type RuleScriptLookup = (file: string) => RuleScriptSource | undefined;

const noRuleScripts: RuleScriptLookup = () => undefined;

/**
 * The export gate's `validateText` for `typescript` files (ADR 0031 D5): errors (syntax) block,
 * warnings (types) pass. Other languages yield no problems. A generated rule script's problems
 * land on its book (`ruleScripts`).
 */
export function scriptTextValidator(
  checker: ScriptingChecker,
  typings: string,
  ruleScripts: RuleScriptLookup = noRuleScripts,
): (file: OutputFile) => Promise<Problem[]> {
  return async (file) => {
    if (file.language !== 'typescript') return [];
    const diagnostics = await checker.check(outputSource(file), file.path, typings);
    const rules = ruleScripts(file.path);
    if (rules !== undefined) {
      return diagnostics.map((diagnostic) => ruleScriptProblem(rules, diagnostic));
    }
    const elementId = scriptIdOfOutput(file.path);
    return diagnostics.map((diagnostic) => scriptProblem(diagnostic, elementId, file.path));
  };
}

/**
 * The content jar's `transpileScript` over `checker`: the JavaScript, or the syntax errors as
 * problems with `range` in UTF-16 offsets of the source and the line in the message. A
 * generated rule script's errors land on its book and rule (`ruleScripts`, read at each call).
 */
export function scriptTranspiler(
  checker: ScriptingChecker,
  ruleScripts: RuleScriptLookup = noRuleScripts,
): (source: string, name: string) => Promise<ScriptTranspileResult> {
  return async (source, name) => {
    const outcome = await checker.transpile(source, name);
    if ('js' in outcome) return { js: outcome.js };
    const rules = ruleScripts(name);
    const elementId = scriptIdOfOutput(name);
    return {
      problems: outcome.problems.map((diagnostic) => {
        if (rules !== undefined) return ruleScriptProblem(rules, diagnostic);
        const problem: Problem = {
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: `Line ${diagnostic.line + 1}: ${messageOf(diagnostic)}`,
          file: name,
          range: { start: diagnostic.offset.start, end: diagnostic.offset.end },
        };
        if (elementId !== undefined) problem.elementId = elementId;
        return problem;
      }),
    };
  };
}
