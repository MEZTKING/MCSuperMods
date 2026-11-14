/**
 * Lowering for `msm:rules` (ADR 0082 D3). A rule book's events reach the game as patches to its
 * subjects' definitions (`../expander.ts`); the book itself lowers only its generated script,
 * `msm/<ns>/script/rules/<book path>.ts` (layer `msm`, `language: 'typescript'`), which the
 * content jar exporter transpiles like any script (ADR 0031 D5) and the vanilla pack exporters
 * skip with the rest of the `msm` layer.
 *
 * `lower(element, target)` sees one element only, while the script depends on the whole
 * project (the subjects, their names, the other books). So the expander, which sees the whole
 * project, compiles every book and writes each book's script lines into the expanded copy of
 * the book at {@link RULES_SCRIPT_FIELD}; lowering only turns those lines into the file. A book
 * that is lowered without expansion, or that needs no script, lowers to nothing.
 */
import type { Element, Json, OutputFile, TargetFacts } from '@msm/plugin-api';

/**
 * The field of an expanded rule book's copy that holds its generated script lines. It is
 * written by the expander only, never saved, and hidden in the editor (`hiddenPaths`).
 */
export const RULES_SCRIPT_FIELD = 'generated_script';

/** The text language id recorded on generated rule scripts, as on `msm:script` outputs. */
export const RULES_SCRIPT_LANGUAGE = 'typescript';

/** Thrown when a rule book cannot be lowered (an unsafe id). */
export class RulesLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesLoweringError';
  }
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

/**
 * The path of a book's generated script: `msm/<ns>/script/rules/<book path>.ts`.
 *
 * @throws {@link RulesLoweringError} If `bookId` is not a safe resource location.
 */
export function ruleScriptPath(bookId: string): string {
  const colon = bookId.indexOf(':');
  const namespace = colon < 0 ? '' : bookId.slice(0, colon);
  const path = colon < 0 ? '' : bookId.slice(colon + 1);
  if (
    !NAMESPACE_PATTERN.test(namespace) ||
    !PATH_PATTERN.test(path) ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new RulesLoweringError(
      `Invalid rule book id ${JSON.stringify(bookId)}: expected <namespace>:<path> in lower case.`,
    );
  }
  return `msm/${namespace}/script/rules/${path}.ts`;
}

/** The generated script lines on an expanded book's copy, or undefined. */
export function generatedScript(data: Json): string[] | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const lines = data[RULES_SCRIPT_FIELD];
  if (!Array.isArray(lines) || lines.length === 0) return undefined;
  return lines.every((line) => typeof line === 'string') ? (lines as string[]) : undefined;
}

/**
 * Lowers a rule book: its generated script as one TypeScript file, or nothing when the book
 * needs no script (empty, plain rules only) or was not expanded.
 *
 * @param element - The (expanded) rule book.
 * @param _target - Unused: the script folder does not depend on the target.
 */
export function lowerRuleBook(element: Element, _target: TargetFacts): OutputFile[] {
  const lines = generatedScript(element.data);
  if (lines === undefined) return [];
  return [
    {
      path: ruleScriptPath(element.id),
      contents: new TextEncoder().encode(`${lines.join('\n')}\n`),
      layer: 'msm',
      language: RULES_SCRIPT_LANGUAGE,
    },
  ];
}
