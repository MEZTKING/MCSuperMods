/**
 * `game-rules.*` project validators of `msm:game_rule` and `msm:stat` elements (ADR 0111 D5, D6).
 * Every validator is pure and reads only the project's elements and the target's game rule and
 * statistic facts (`TargetFacts.gameRules`, `TargetFacts.stats`, plugin API 1.20.0; the vanilla
 * name checks are skipped when the target has none). Codes:
 *
 * - `game-rules.min-above-max` (error): an integer game rule whose `min` is above its `max`.
 * - `game-rules.default-out-of-range` (error): an integer game rule whose `default` is below its
 *   `min` or above its `max`.
 * - `game-rules.range-on-boolean` (error): `min` or `max` on a `boolean` game rule; an on or
 *   off rule has no range, and the runtime's parser and the Java eject refuse it.
 * - `game-rules.vanilla-clash` (error): a game rule or statistic in the `minecraft` namespace
 *   whose name vanilla already has; the game refuses to register it twice.
 * - `game-rules.vanilla-name` (info): a game rule or statistic in another namespace with a
 *   vanilla name; it is a separate setting (`/gamerule <ns>:<name>`, the namespace required),
 *   which players may mix up with vanilla's.
 * - `game-rules.no-name` (info): a game rule or statistic without `display_name`; the game rule
 *   and Statistics screens show its language key instead.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { GAME_RULE_KIND, STAT_KIND } from './kinds';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const GAME_RULE_PROBLEM_CODES = Object.freeze([
  'game-rules.min-above-max',
  'game-rules.default-out-of-range',
  'game-rules.range-on-boolean',
  'game-rules.vanilla-clash',
  'game-rules.vanilla-name',
  'game-rules.no-name',
] as const);

type GameRuleCode = (typeof GAME_RULE_PROBLEM_CODES)[number];

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const integer = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const problem = (
  severity: Problem['severity'],
  code: GameRuleCode,
  element: Element,
  path: string | undefined,
  message: string,
): Problem => ({
  severity,
  code,
  elementId: element.id,
  ...(path === undefined ? {} : { path }),
  message,
});

/** The namespace and path of an element id; the path is empty for a malformed id. */
function splitId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: '', path: '' }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

function ranges(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== GAME_RULE_KIND) continue;
    const data = dataOf(element);
    if (data.kind === 'boolean') {
      for (const bound of ['min', 'max'] as const) {
        if (data[bound] === undefined) continue;
        problems.push(
          problem(
            'error',
            'game-rules.range-on-boolean',
            element,
            `/${bound}`,
            `An on or off game rule has no ${bound === 'min' ? 'lowest' : 'highest'} value, so "${bound}" is not allowed. Remove it, or make the rule a number.`,
          ),
        );
      }
      continue;
    }
    if (data.kind !== 'integer') continue;
    const min = integer(data.min);
    const max = integer(data.max);
    if (min !== undefined && max !== undefined && min > max) {
      problems.push(
        problem(
          'error',
          'game-rules.min-above-max',
          element,
          '/min',
          `The game rule's lowest value (${min}) is above its highest value (${max}).`,
        ),
      );
      continue;
    }
    const value = integer(data.default);
    if (value === undefined) continue;
    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
      const range =
        min !== undefined && max !== undefined
          ? `between ${min} and ${max}`
          : min !== undefined
            ? `at least ${min}`
            : `at most ${max}`;
      problems.push(
        problem(
          'error',
          'game-rules.default-out-of-range',
          element,
          '/default',
          `A new world starts the game rule at ${value}, but it must be ${range}. Change the starting value or the range.`,
        ),
      );
    }
  }
  return problems;
}

function vanillaNames(
  elements: readonly Element[],
  kind: string,
  vanilla: ReadonlySet<string>,
  what: string,
): Problem[] {
  const problems: Problem[] = [];
  if (vanilla.size === 0) return problems;
  for (const element of elements) {
    if (element.kind !== kind) continue;
    const { namespace, path } = splitId(element.id);
    if (!vanilla.has(path)) continue;
    problems.push(
      namespace === 'minecraft'
        ? problem(
            'error',
            'game-rules.vanilla-clash',
            element,
            undefined,
            `Minecraft already has the ${what} "${path}"; the game cannot have two. Give this one another name or namespace.`,
          )
        : problem(
            'info',
            'game-rules.vanilla-name',
            element,
            undefined,
            `Minecraft has a ${what} called "${path}" too. This one is separate and is named with its namespace ("${element.id}"), so players may mix the two up.`,
          ),
    );
  }
  return problems;
}

function missingNames(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== GAME_RULE_KIND && element.kind !== STAT_KIND) continue;
    const name = dataOf(element).display_name;
    if (typeof name === 'string' && name.length > 0) continue;
    const screen = element.kind === GAME_RULE_KIND ? 'game rule screen' : 'Statistics screen';
    problems.push(
      problem(
        'info',
        'game-rules.no-name',
        element,
        '/display_name',
        `Without a display name the ${screen} shows its language key instead of a name. Give it a display name.`,
      ),
    );
  }
  return problems;
}

export const gameRuleValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.scripting.game-rules',
    kinds: [GAME_RULE_KIND],
    validate: ({ elements, target }) => [
      ...ranges(elements),
      ...vanillaNames(
        elements,
        GAME_RULE_KIND,
        new Set(target.gameRules?.vanillaNames ?? []),
        'game rule',
      ),
    ],
  },
  {
    id: 'msm.scripting.stats',
    kinds: [STAT_KIND],
    validate: ({ elements, target }) =>
      vanillaNames(
        elements,
        STAT_KIND,
        new Set(target.stats?.vanillaCustomStats ?? []),
        'statistic',
      ),
  },
  {
    id: 'msm.scripting.game-rule-names',
    kinds: [GAME_RULE_KIND, STAT_KIND],
    validate: ({ elements }) => missingNames(elements),
  },
] satisfies ProjectValidator[]);
