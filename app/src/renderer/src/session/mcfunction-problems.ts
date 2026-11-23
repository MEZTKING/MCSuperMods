/**
 * Live mcfunction problems (ADR 0014). The Spyglass service runs in the main process; the
 * session only sees an injected {@link McfunctionChecker}, so tests can pass the Node service
 * or a stub. This module maps the checker's problems onto MSM {@link Problem}s that share
 * one shape with schema problems: `elementId`, `path: /lines/<n>` and a `range` within that
 * line.
 *
 * Only *types* come from `@msm/schemas/mcfunction`; a value import would pull Spyglass into
 * the renderer bundle.
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project, ResourceLocation } from '@msm/core';
import { commandLiteralsOf, outputFileBytes } from '@msm/exporters';
import type { OutputFile, Target } from '@msm/plugin-api';
import { RULES_KIND, rulesGeneratedIds } from '@msm/plugin-rules';
import type { McfunctionCompletion, McfunctionProblem } from '../../../shared/platform';
import { dataRegistryIds, gamesCheckerIds } from './schema-context';

export type { McfunctionCompletion, McfunctionProblem };

/** The kind of function elements (`{ lines: string[] }`, ADR 0015). */
export const FUNCTION_KIND = 'minecraft:function';

/** Options of one {@link McfunctionChecker.check} call. */
export interface McfunctionCheckRequest {
  /** The function's document URI (see {@link functionUri}). */
  uri: string;
  /** Ids the project declares per Spyglass symbol category (see {@link mcfunctionProjectIds}). */
  projectIds: Record<string, string[]>;
}

/** The injected mcfunction checker: the IPC-backed one in the app, the Node service in tests. */
export interface McfunctionChecker {
  check(source: string, options: McfunctionCheckRequest): Promise<McfunctionProblem[]>;
}

/**
 * The slice of the platform's `mcfunction` service {@link mcfunctionCheckerFromPlatform}
 * needs. Structural, so it matches `PlatformAdapter['mcfunction']`.
 */
export interface McfunctionPlatformService {
  check(
    targetId: string,
    source: string,
    options: { uri: string; projectIds: Record<string, string[]> },
  ): Promise<McfunctionProblem[]>;
}

/**
 * A checker over the platform's IPC-backed service, for the target `targetId()` names at
 * call time (the open project's target can change).
 *
 * @param service - `platform.mcfunction`.
 * @param targetId - Returns the current target id, for example `() => session.target.id`.
 */
export function mcfunctionCheckerFromPlatform(
  service: McfunctionPlatformService,
  targetId: () => string,
): McfunctionChecker {
  return { check: (source, options) => service.check(targetId(), source, options) };
}

/**
 * Function tags the game always runs. mcmeta lists no vanilla `tag/function` ids, so these
 * are seeded so `#minecraft:tick` and `#minecraft:load` never warn.
 */
export const KNOWN_FUNCTION_TAGS: readonly string[] = Object.freeze([
  'minecraft:load',
  'minecraft:tick',
]);

/**
 * `file:///msm/data/<ns>/<folder>/<path>.mcfunction`, the same URI as `defaultFunctionUri`
 * in `@msm/schemas/mcfunction` (duplicated because the renderer must not import values from
 * that subpath).
 */
export function functionUri(namespace: string, path: string, folder: string): string {
  return `file:///msm/data/${namespace}/${folder}/${path}.mcfunction`;
}

/** The document URI of a function element for `target`. */
export function functionElementUri(id: ResourceLocation, target: Target): string {
  const colon = id.indexOf(':');
  return functionUri(id.slice(0, colon), id.slice(colon + 1), target.folders.data.function);
}

/** `scoreboard objectives add <name>` anywhere on a line (also after `execute ... run`). */
const OBJECTIVE_ADD = /(?:^|\s)scoreboard\s+objectives\s+add\s+([^\s$]+)(?=\s|$)/g;

/**
 * The scoreboard objectives the project's function elements create with
 * `scoreboard objectives add <name>`, skipping comment lines and macro names. The same scan as
 * `collectProjectObjectives` in `@msm/schemas/mcfunction` (duplicated because the renderer
 * must not import values from that subpath). Sorted, without duplicates.
 */
export function projectObjectives(project: Project): string[] {
  const found = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== FUNCTION_KIND) continue;
      for (const line of functionLines(element) ?? []) {
        if (/^\s*#/.test(line)) continue;
        for (const match of line.matchAll(OBJECTIVE_ADD)) {
          const name = match[1];
          if (name !== undefined) found.add(name);
        }
      }
    }
  }
  return [...found].sort();
}

/**
 * The ids the project declares for the checker: every data registry of
 * {@link dataRegistryIds} (`function`, `recipe`, `tag/<registry>`, …), plus
 * {@link KNOWN_FUNCTION_TAGS} under `tag/function` and, under `objective`, the scoreboard
 * objectives any project function creates ({@link projectObjectives}), so an objective made
 * in `load` does not warn in other functions, and the objectives, teams, entity tags and boss
 * bars the games kinds' lowered functions make ({@link gamesCheckerIds}, B551b). The games
 * kinds' functions and function tags come through {@link dataRegistryIds}. Sorted; ids
 * namespaced, objectives, teams and entity tags plain.
 */
export function mcfunctionProjectIds(project: Project): Record<string, string[]> {
  const ids = dataRegistryIds(project);
  ids['tag/function'] = [
    ...new Set([...(ids['tag/function'] ?? []), ...KNOWN_FUNCTION_TAGS]),
  ].sort();
  const games = gamesCheckerIds(project);
  const objectives = [
    ...new Set([...projectObjectives(project), ...(games.objective ?? [])]),
  ].sort();
  if (objectives.length > 0) ids.objective = objectives;
  for (const category of ['team', 'tag', 'bossbar'] as const) {
    const names = games[category];
    if (names !== undefined)
      ids[category] = [...new Set([...(ids[category] ?? []), ...names])].sort();
  }
  return ids;
}

/**
 * The commands of the project's own, by their literals: the names and aliases of its
 * `msm:command` elements (ADR 0096 D1) and the signal command of Rules' function bridge on an
 * expanded rule book (`msm_signal_<ns>`, ADR 0115 D5; `rulesGeneratedIds`, B557 follow-up). The
 * mod jar adds them; the checker knows only vanilla's command tree, so
 * {@link maskProjectCommands} hides their calls from it. Sorted, without duplicates.
 */
export function projectCommandLiterals(project: Project): string[] {
  const elements = project.namespaces.flatMap((namespace) => namespace.elements);
  const out = new Set(commandLiteralsOf(elements));
  for (const element of elements) {
    if (element.kind !== RULES_KIND) continue;
    for (const literal of rulesGeneratedIds(element.data).command) out.add(literal);
  }
  return [...out].sort();
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `source` with each call of a project command (one of `literals`, at the start of a line or
 * after `run`) and the rest of its line written as a vanilla command the checker accepts:
 * `say` and filler, or `list` for a bare literal. Text before the call, and so every range the
 * checker reports there, is unchanged; a project command's own arguments are left to the mod
 * jar, which checks them when the function loads. Comment and macro lines are kept as they are.
 *
 * @param source - The function's text.
 * @param literals - The project's command literals ({@link projectCommandLiterals}).
 */
export function maskProjectCommands(source: string, literals: readonly string[]): string {
  if (literals.length === 0) return source;
  const call = new RegExp(`(^\\s*/?|\\brun\\s+)(${literals.map(escapeRegExp).join('|')})(?=\\s|$)`);
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*[#$]/.test(line)) return line;
      const match = call.exec(line);
      if (match === null) return line;
      const start = match.index + (match[1] as string).length;
      const rest = line.slice(start + (match[2] as string).length).trim();
      const filler = 'x'.repeat(Math.max(1, line.length - start - 4));
      return `${line.slice(0, start)}${rest === '' ? 'list' : `say ${filler}`}`;
    })
    .join('\n');
}

/** The lines of a function element, or `undefined` when its data is not `{ lines: string[] }`. */
export function functionLines(element: Element): string[] | undefined {
  const data = element.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const lines = data.lines;
  if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) return undefined;
  return lines as string[];
}

/**
 * One checker problem as an MSM problem: `path: /lines/<n>` and a `range` within that line.
 *
 * @param problem - The checker's problem.
 * @param elementId - The function element.
 * @param file - The output file, for export problems.
 */
export function toProblem(
  problem: McfunctionProblem,
  elementId: ResourceLocation | undefined,
  file?: string,
): Problem {
  const out: Problem = {
    severity: problem.severity,
    code: problem.code,
    message: problem.message,
    path: `/lines/${problem.line}`,
    range: { start: problem.start, end: problem.end },
  };
  if (elementId !== undefined) out.elementId = elementId;
  if (file !== undefined) out.file = file;
  return out;
}

/**
 * Checks one function element's source with `checker`.
 *
 * @returns The problems, mapped by {@link toProblem}.
 */
export async function checkFunctionElement(
  checker: McfunctionChecker,
  element: Element,
  lines: readonly string[],
  target: Target,
  projectIds: Record<string, string[]>,
): Promise<Problem[]> {
  const problems = await checker.check(lines.join('\n'), {
    uri: functionElementUri(element.id, target),
    projectIds,
  });
  return problems.map((problem) => toProblem(problem, element.id));
}

/**
 * The element id of a lowered function file `data/<ns>/<folder>/<path>.mcfunction`, or
 * `undefined` for any other path.
 */
export function functionIdOfOutput(path: string, target: Target): ResourceLocation | undefined {
  const prefix = 'data/';
  const suffix = '.mcfunction';
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const rest = path.slice(prefix.length, path.length - suffix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return undefined;
  const namespace = rest.slice(0, slash);
  const folder = `${target.folders.data.function}/`;
  const inner = rest.slice(slash + 1);
  if (!inner.startsWith(folder) || inner.length === folder.length) return undefined;
  return `${namespace}:${inner.slice(folder.length)}`;
}

const decoder = new TextDecoder('utf-8');

/**
 * The export gate's `validateText` over `checker` (ADR 0014): `mcfunction` files are checked
 * with the project's ids, calls of the project's own commands masked
 * ({@link maskProjectCommands}); problems carry the output `file`, the function's `elementId` and
 * `path: /lines/<n>` with a `range` within that line. Other languages yield no problems.
 *
 * @param checker - The injected checker.
 * @param project - The exported project state.
 * @param target - The export target.
 */
export function mcfunctionTextValidator(
  checker: McfunctionChecker,
  project: Project,
  target: Target,
): (file: OutputFile) => Promise<Problem[]> {
  const projectIds = mcfunctionProjectIds(project);
  const commands = projectCommandLiterals(project);
  return async (file) => {
    if (file.language !== 'mcfunction') return [];
    const source = maskProjectCommands(
      decoder.decode(outputFileBytes(file)).replace(/\n$/, ''),
      commands,
    );
    const problems = await checker.check(source, { uri: `file:///msm/${file.path}`, projectIds });
    const elementId = functionIdOfOutput(file.path, target);
    return problems.map((problem) => toProblem(problem, elementId, file.path));
  };
}
