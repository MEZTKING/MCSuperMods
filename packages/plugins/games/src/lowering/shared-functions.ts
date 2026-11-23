/**
 * The games plugin's shared `load` and `tick` (ADR 0113 D9) and the generated names its kinds
 * use. A kind lowers one element at a time and function files cannot merge, so the plugin's one
 * `load` and one `tick` are function tags: `#<ns>:msm_games/load` and `#<ns>:msm_games/tick`,
 * which join `#minecraft:load` and `#minecraft:tick`. Every element contributes its own function
 * under `<ns>:msm_games/<kind>/<path>/` and adds it to the plugin's tag; all tag files are written
 * with `merge: 'tag'`, so the export holds one tag of each with every element's entry, in element
 * order. Callers run them with `function #<ns>:msm_games/load` like a function.
 *
 * Contributions: a lowering module (this plugin's pieces, and B551's world setup) builds a list
 * of {@link SharedContribution} (a phase, a path under `msm_games/`, the lines) and passes it to
 * {@link sharedFunctionFiles}; helper functions that run from those go through
 * {@link functionFile}, and the points Rules (B553) attach to through {@link hookTagFile}.
 *
 * Every command comes from `target.commands.forms` (plugin API 1.22.0; the `execute`,
 * `function`, `tag`, `kill`, `setblock`, `summon`, `tellraw` and other line forms since 1.26.0)
 * through {@link fillForm}; only `#` comment lines are written as they are.
 */
import type {
  CommandFormName,
  Json,
  JsonObject,
  OutputFile,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';

/** Thrown when a games element cannot be lowered. */
export class GamesLoweringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GamesLoweringError';
  }
}

/** True for a JSON object (not an array or null). */
export const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The data of an element as an object (empty when it is not one). */
export const dataOf = (data: Json): JsonObject => (isRecord(data) ? data : {});

/** A string, or `fallback`. */
export const str = (value: Json | undefined, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/** A boolean, or `fallback`. */
export const bool = (value: Json | undefined, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** A finite number, or `fallback`. */
export const num = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** A block position `[x, y, z]` of whole numbers, or `fallback`. */
export function blockPos(
  value: Json | undefined,
  fallback: readonly [number, number, number] = [0, 0, 0],
): [number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isInteger(n))
  ) {
    return [value[0] as number, value[1] as number, value[2] as number];
  }
  return [...fallback];
}

/** The folder of every generated function, predicate and tag under a namespace (ADR 0113 D9). */
export const GAMES_FUNCTION_ROOT = 'msm_games';

/** The text language of a function file. */
export const MCFUNCTION_LANGUAGE = 'mcfunction';

/** The schema of a function tag file. */
export const FUNCTION_TAG_SCHEMA = 'tag:function';

/** The two phases a contribution joins: once at every load, or every tick. */
export type SharedPhase = 'load' | 'tick';

/** One function run by the plugin's `load` or `tick` tag. */
export interface SharedContribution {
  /** Whether it runs at every load or every tick. */
  phase: SharedPhase;
  /**
   * Its path below `<ns>:msm_games/`, for example `team/red/load`; its id is
   * `<ns>:msm_games/<path>`.
   */
  path: string;
  /** Its commands, without a leading slash. */
  lines: readonly string[];
}

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

/**
 * The namespace and path of an element id.
 *
 * @throws {@link GamesLoweringError} If `id` is not a safe lower-case resource location.
 */
export function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  const namespace = colon < 0 ? '' : id.slice(0, colon);
  const path = colon < 0 ? '' : id.slice(colon + 1);
  if (
    !NAMESPACE_PATTERN.test(namespace) ||
    !PATH_PATTERN.test(path) ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new GamesLoweringError(
      `Invalid element id ${JSON.stringify(id)}: expected <namespace>:<path> in lower case.`,
    );
  }
  return { namespace, path };
}

/** A path with `/` written as `.`: the plain names of teams, objectives, holders and tags. */
export const dotted = (path: string): string => path.replaceAll('/', '.');

/** The id of a generated function: `<ns>:msm_games/<path>`. */
export const gamesFunctionId = (namespace: string, path: string): ResourceLocation =>
  `${namespace}:${GAMES_FUNCTION_ROOT}/${path}`;

/** The plugin's `load` or `tick` tag of a namespace, with its `#`. */
export const phaseTag = (namespace: string, phase: SharedPhase): string =>
  `#${gamesFunctionId(namespace, phase)}`;

/** The team name of an `msm:team` element: `<ns>.<path>` with `/` as `.`. */
export function teamName(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}.${dotted(path)}`;
}

/** The objective name of an `msm:objective` element: `<ns>.<path>` with `/` as `.`. */
export function objectiveName(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}.${dotted(path)}`;
}

/** The objective holding every timer of a namespace (ADR 0113 D6). */
export const timersObjective = (namespace: string): string => `${namespace}.msm_timers`;

/** The objective holding every one block's phase and breaks of a namespace. */
export const oneBlocksObjective = (namespace: string): string => `${namespace}.msm_one_block`;

/**
 * The objective paths a project objective may not take, because the generated objectives of the
 * same namespace use them.
 */
export const RESERVED_OBJECTIVE_PATHS: readonly string[] = Object.freeze([
  'msm_timers',
  'msm_one_block',
]);

/** The entity tag a player carries while inside an `msm:area`: `<ns>.area.<path>`. */
export function areaTag(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}.area.${dotted(path)}`;
}

/** The score holder of a timer or one block's values: `#<path>` with `/` as `.`. */
export const holderOf = (path: string, suffix?: string): string =>
  `#${dotted(path)}${suffix === undefined ? '' : `.${suffix}`}`;

/** A plain text component, written as JSON (which the game reads as SNBT). */
export const textComponent = (text: string, extra: Record<string, Json> = {}): string =>
  JSON.stringify({ text, ...extra });

/** `ores/Ruby Ore` becomes `Ruby Ore`: the last path segment in title case. */
export function titleOf(path: string): string {
  const last = path.split('/').pop() ?? path;
  const words = last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  return words.length === 0 ? last : words.join(' ');
}

const PLACEHOLDER = /<([a-z_0-9]+)>|\[([a-z_0-9]+)\]/g;

/**
 * Fills one of the target's command forms (`target.commands.forms`, plugin API 1.22.0): every
 * `<name>` is replaced by its value; an optional `[name]` is written only when it and every
 * optional placeholder before it has a value, and the form ends before the first one without.
 *
 * @throws {@link GamesLoweringError} If the target has no forms, or a required value is missing.
 */
export function fillForm(
  target: TargetFacts,
  name: CommandFormName,
  values: Readonly<Record<string, string | number | boolean>>,
): string {
  const form = target.commands?.forms?.[name];
  if (form === undefined) {
    throw new GamesLoweringError(
      `The target ${target.id} has no command form "${name}" (plugin API 1.22.0), so the game kits cannot be lowered for it.`,
    );
  }
  let text = '';
  let last = 0;
  for (const match of form.matchAll(PLACEHOLDER)) {
    const [whole, required, optional] = match;
    const key = (required ?? optional) as string;
    const value = values[key];
    if (optional !== undefined && value === undefined)
      return `${text}${form.slice(last, match.index)}`.trimEnd();
    if (value === undefined) {
      throw new GamesLoweringError(`The command form "${name}" needs a value for <${key}>.`);
    }
    text += `${form.slice(last, match.index)}${String(value)}`;
    last = match.index + whole.length;
  }
  return `${text}${form.slice(last)}`;
}

/** The path of a function file under the target's function folder. */
const functionPath = (target: TargetFacts, namespace: string, path: string): string =>
  `data/${namespace}/${target.folders.data.function}/${GAMES_FUNCTION_ROOT}/${path}.mcfunction`;

/** The path of a function tag file under the target's tags folder. */
const functionTagPath = (target: TargetFacts, namespace: string, path: string): string =>
  `data/${namespace}/${target.folders.data.tags}/${target.folders.data.function}/${path}.json`;

/** A generated function `<ns>:msm_games/<path>` holding `lines`. */
export function functionFile(
  target: TargetFacts,
  namespace: string,
  path: string,
  lines: readonly string[],
): OutputFile {
  const text = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  return {
    path: functionPath(target, namespace, path),
    contents: new TextEncoder().encode(text),
    layer: 'datapack',
    language: MCFUNCTION_LANGUAGE,
  };
}

/** A function tag file at `<ns>:<path>` holding `values`, merged with every other one there. */
function tagFile(
  target: TargetFacts,
  namespace: string,
  path: string,
  values: readonly string[],
): OutputFile {
  return {
    path: functionTagPath(target, namespace, path),
    contents: { values: [...values] },
    layer: 'datapack',
    schema: FUNCTION_TAG_SCHEMA,
    merge: 'tag',
  };
}

/**
 * A hook: the function tag `#<ns>:msm_games/<path>`, empty here, that a generated function runs
 * when something happens (a timer ends, a player enters an area, the one block is broken). Rules
 * (B553) add their functions to it by writing the same tag file with `merge: 'tag'`.
 */
export function hookTagFile(
  target: TargetFacts,
  namespace: string,
  path: string,
  values: readonly string[] = [],
): OutputFile {
  return tagFile(target, namespace, `${GAMES_FUNCTION_ROOT}/${path}`, values);
}

/** The line that runs a hook tag. */
export const runHook = (target: TargetFacts, namespace: string, path: string): string =>
  fillForm(target, 'run_function', { function: `#${gamesFunctionId(namespace, path)}` });

/**
 * The files of a list of contributions: each contribution's function, its entry in the plugin's
 * `load` or `tick` tag, and the plugin's tag's entry in `#minecraft:load` or `#minecraft:tick`.
 * Every tag file merges, so any number of elements (and B551's world setup) may call this.
 */
export function sharedFunctionFiles(
  target: TargetFacts,
  namespace: string,
  contributions: readonly SharedContribution[],
): OutputFile[] {
  const files: OutputFile[] = [];
  const phases = new Set<SharedPhase>();
  for (const contribution of contributions) {
    files.push(functionFile(target, namespace, contribution.path, contribution.lines));
    files.push(
      tagFile(target, namespace, `${GAMES_FUNCTION_ROOT}/${contribution.phase}`, [
        gamesFunctionId(namespace, contribution.path),
      ]),
    );
    phases.add(contribution.phase);
  }
  for (const phase of (['load', 'tick'] as const).filter((p) => phases.has(p))) {
    files.push(tagFile(target, 'minecraft', phase, [phaseTag(namespace, phase)]));
  }
  return files;
}
