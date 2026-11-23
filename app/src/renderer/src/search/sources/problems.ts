/**
 * The Things to fix source (ADR 0124 D3; B660): one entry per live problem of the open mod (load,
 * schema and validator problems, duplicates once), in the plain words of `PLAIN_PROBLEMS` with the
 * thing named by its display name, else the problem's own message. Errors and warnings only; an
 * info is not a thing to fix. The action shows the thing at its field and offers the one-step fix.
 *
 * @packageDocumentation
 */

import type { Problem, Project } from '@msm/core';
import type { SearchEntry } from '@msm/search';
import {
  PLAIN_FIX_LABELS,
  PLAIN_PROBLEMS,
  plainProblem,
  problemThingName,
} from '../../session/plain-problems';
import { asAction, asPreview, entryIds, sentenceField, wordsField } from './shared';

/** A problem's identity (duplicates are shown once, as Things to fix does). */
export function problemKey(problem: Problem): string {
  return [problem.code, problem.elementId ?? '', problem.path ?? '', problem.file ?? ''].join('|');
}

/** The Things to fix entries of `problems` on `project`. */
export function problemEntries(
  project: Project | null,
  problems: readonly Problem[],
): SearchEntry[] {
  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  for (const problem of problems) {
    if (problem.severity !== 'error' && problem.severity !== 'warning') continue;
    const key = problemKey(problem);
    if (seen.has(key)) continue;
    seen.add(key);
    const thing = problemThingName(project, problem);
    const plain = plainProblem(problem, thing);
    const title = plain.known ? plain.text : `Something in ${thing} needs fixing.`;
    const action = {
      type: 'problem',
      code: problem.code,
      ...(problem.elementId !== undefined ? { element: problem.elementId } : {}),
      ...(problem.path !== undefined ? { path: problem.path } : {}),
      ...(problem.file !== undefined ? { file: problem.file } : {}),
    } as const;
    out.push({
      id: entryIds.problem(key),
      source: 'problem',
      title,
      ...sentenceField(plain.known ? thing : problem.message),
      ...wordsField([
        'fix',
        'problem',
        problem.severity === 'error' ? 'error' : 'warning',
        plain.fix !== undefined ? PLAIN_FIX_LABELS[plain.fix] : undefined,
      ]),
      ...(plain.known ? { body: problem.message } : {}),
      ids: [problem.code, ...(problem.elementId !== undefined ? [problem.elementId] : [])],
      available: true,
      action: asAction(action),
      preview: asPreview(action),
    });
  }
  return out;
}

/** Whether the plain words table knows a code (for tests). */
export function knowsProblem(code: string): boolean {
  return PLAIN_PROBLEMS[code] !== undefined;
}
