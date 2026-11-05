/**
 * Live script problems and the script parts of the export (ADRs 0031 D5, 0032 D5). TypeScript
 * runs in the main process; the session only sees an injected {@link ScriptingChecker} (the
 * platform's `scripting` service in the app, a stub or the Node service in tests). This module
 * maps its diagnostics onto MSM {@link Problem}s of the same shape as mcfunction problems:
 * `elementId`, `file` (the lowered `.ts`), `path: /lines/<n>` and a `range` within that line.
 *
 * @packageDocumentation
 */

import type { Element, Problem, ResourceLocation } from '@msm/core';
import { outputFileBytes, type ScriptTranspileResult } from '@msm/exporters';
import type { OutputFile } from '@msm/plugin-api';
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
function messageOf(diagnostic: ScriptDiagnostic): string {
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

/**
 * The export gate's `validateText` for `typescript` files (ADR 0031 D5): errors (syntax) block,
 * warnings (types) pass. Other languages yield no problems.
 */
export function scriptTextValidator(
  checker: ScriptingChecker,
  typings: string,
): (file: OutputFile) => Promise<Problem[]> {
  return async (file) => {
    if (file.language !== 'typescript') return [];
    const diagnostics = await checker.check(outputSource(file), file.path, typings);
    const elementId = scriptIdOfOutput(file.path);
    return diagnostics.map((diagnostic) => scriptProblem(diagnostic, elementId, file.path));
  };
}

/**
 * The content jar's `transpileScript` over `checker`: the JavaScript, or the syntax errors as
 * problems with `range` in UTF-16 offsets of the source and the line in the message.
 */
export function scriptTranspiler(
  checker: ScriptingChecker,
): (source: string, name: string) => Promise<ScriptTranspileResult> {
  return async (source, name) => {
    const outcome = await checker.transpile(source, name);
    if ('js' in outcome) return { js: outcome.js };
    const elementId = scriptIdOfOutput(name);
    return {
      problems: outcome.problems.map((diagnostic) => {
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
