/**
 * `games.*` project validators of the game pieces: `msm:one_block`, `msm:team`, `msm:objective`,
 * `msm:timer` and `msm:area` (ADR 0113 D3 to D7, D9). Pure; they read the project's elements,
 * the registry index and the target's scoreboard facts (`TargetFacts.scoreboard`, plugin API
 * 1.22.0; the checks that need them are skipped when the target has none). Codes:
 *
 * - `games.too-many-one-blocks` (error): a fifth one block; a world has at most four (limit M6).
 * - `games.one-block-same-place` (error): two one blocks at the same position and dimension.
 * - `games.one-block-weight` (error): a block or mob weight that is not a whole number above zero.
 * - `games.one-block-chest-without-loot` (warning): a chest chance above zero with no loot table;
 *   no chest is placed.
 * - `games.one-block-mob-chance-without-mobs` (warning): a mob chance above zero with no mobs.
 * - `games.area-box-order` (error): an area whose `from` is above its `to` on an axis.
 * - `games.area-structure-missing` (error): a reset structure the project and the game do not
 *   have.
 * - `games.area-structure-outside` (warning): a project reset structure that does not fit in the
 *   area's box, so the area's reset does not clear all of it.
 * - `games.timer-seconds` (error): a timer not of 1 to 86,400 whole seconds (limit M9).
 * - `games.objective-criterion` (warning): a criterion the target's facts do not list: not a
 *   measured plain criterion, a statistic type's criterion or a project statistic.
 * - `games.objective-display` (error): a display slot or render type the target does not have.
 * - `games.team-option` (error): a team colour, name tag or collision value the target does not
 *   have.
 * - `games.name-clash` (error): two teams or two objectives with the same generated name
 *   (`a/b` and `a.b` both make `<ns>.a.b`).
 * - `games.reserved-name` (error): an objective whose path the generated objectives use. (ADR 0113
 *   D9's refusal of project functions under `<ns>:msm_games/` needs this validator to read
 *   `minecraft:function` elements, which the app's validator test does not yet expect; left for
 *   a follow-up.)
 */
import type { Element, Json, Problem, ProjectValidator, ValidationInput } from '@msm/plugin-api';
import {
  blockPos,
  dataOf,
  dotted,
  isRecord,
  num,
  RESERVED_OBJECTIVE_PATHS,
  str,
} from './lowering/shared-functions';

/** Every code these validators report. */
export const PIECES_PROBLEM_CODES = Object.freeze([
  'games.too-many-one-blocks',
  'games.one-block-same-place',
  'games.one-block-weight',
  'games.one-block-chest-without-loot',
  'games.one-block-mob-chance-without-mobs',
  'games.area-box-order',
  'games.area-structure-missing',
  'games.area-structure-outside',
  'games.timer-seconds',
  'games.objective-criterion',
  'games.objective-display',
  'games.team-option',
  'games.name-clash',
  'games.reserved-name',
] as const);

type PiecesCode = (typeof PIECES_PROBLEM_CODES)[number];

/** The most one blocks a world may have (limit M6). */
export const MAX_ONE_BLOCKS = 4;
/** The longest timer, in seconds (one day). */
export const MAX_TIMER_SECONDS = 86_400;

const ONE_BLOCK = 'msm:one_block';
const TEAM = 'msm:team';
const OBJECTIVE = 'msm:objective';
const TIMER = 'msm:timer';
const AREA = 'msm:area';
const STRUCTURE_TEMPLATE = 'minecraft:structure_template';
const AXES = ['x', 'y', 'z'] as const;

const problem = (
  severity: Problem['severity'],
  code: PiecesCode,
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

const ofKind = (elements: readonly Element[], kind: string): Element[] =>
  elements.filter((element) => element.kind === kind);

const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);
const namespaceOf = (id: string): string => id.slice(0, Math.max(0, id.indexOf(':')));

const isWholeAbove = (value: Json | undefined, min: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= min;

function oneBlocks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  const blocks = ofKind(elements, ONE_BLOCK);
  blocks.slice(MAX_ONE_BLOCKS).forEach((element) => {
    problems.push(
      problem(
        'error',
        'games.too-many-one-blocks',
        element,
        undefined,
        `A world can have at most ${MAX_ONE_BLOCKS} one blocks, and this is number ${blocks.indexOf(element) + 1}. Take one out, or join their phases into one.`,
      ),
    );
  });
  const places = new Map<string, Element>();
  for (const element of blocks) {
    const data = dataOf(element.data);
    const place = `${str(data.dimension, 'minecraft:overworld')} ${blockPos(data.at, [0, 64, 0]).join(' ')}`;
    const first = places.get(place);
    if (first === undefined) places.set(place, element);
    else {
      problems.push(
        problem(
          'error',
          'games.one-block-same-place',
          element,
          '/at',
          `The one block ${first.id} is already at this place, so the two would fill the same block. Move one of them.`,
        ),
      );
    }
    const phases = Array.isArray(data.phases) ? data.phases : [];
    phases.forEach((phaseValue, index) => {
      const phase = dataOf(phaseValue);
      for (const [list, key] of [
        ['blocks', 'block'],
        ['mobs', 'mob'],
      ] as const) {
        const entries = Array.isArray(phase[list]) ? phase[list] : [];
        entries.forEach((entry, at) => {
          if (isRecord(entry) && isWholeAbove(entry.weight, 1)) return;
          problems.push(
            problem(
              'error',
              'games.one-block-weight',
              element,
              `/phases/${index}/${list}/${at}/weight`,
              `Each ${key} needs a weight of 1 or more (a whole number); a higher weight is picked more often.`,
            ),
          );
        });
      }
      if (num(phase.chest_chance, 0) > 0 && typeof phase.chest_loot !== 'string') {
        problems.push(
          problem(
            'warning',
            'games.one-block-chest-without-loot',
            element,
            `/phases/${index}/chest_chance`,
            'This phase has a chest chance but no loot table for the chest, so no chest is placed. Pick a loot table, or set the chance to 0.',
          ),
        );
      }
      const mobs = Array.isArray(phase.mobs) ? phase.mobs : [];
      if (num(phase.mob_chance, 0) > 0 && mobs.length === 0) {
        problems.push(
          problem(
            'warning',
            'games.one-block-mob-chance-without-mobs',
            element,
            `/phases/${index}/mob_chance`,
            'This phase has a mob chance but no mobs, so no mob comes. Add a mob, or set the chance to 0.',
          ),
        );
      }
    });
  }
  return problems;
}

/** The size `[x, y, z]` of each project structure template, by id. */
function templateSizes(elements: readonly Element[]): Map<string, [number, number, number]> {
  const sizes = new Map<string, [number, number, number]>();
  for (const element of ofKind(elements, STRUCTURE_TEMPLATE)) {
    const size = dataOf(element.data).size;
    if (Array.isArray(size) && size.length === 3 && size.every((n) => typeof n === 'number')) {
      sizes.set(element.id, size as [number, number, number]);
    }
  }
  return sizes;
}

function areas(elements: readonly Element[], has: (id: string) => boolean | undefined): Problem[] {
  const problems: Problem[] = [];
  const sizes = templateSizes(elements);
  for (const element of ofKind(elements, AREA)) {
    const data = dataOf(element.data);
    const from = blockPos(data.from);
    const to = blockPos(data.to);
    AXES.forEach((axis, i) => {
      if ((from[i] as number) <= (to[i] as number)) return;
      problems.push(
        problem(
          'error',
          'games.area-box-order',
          element,
          `/from/${i}`,
          `The corner "from" has a higher ${axis} (${from[i]}) than "to" (${to[i]}). Put the lower corner in "from" and the higher in "to".`,
        ),
      );
    });
    const min = from.map((n, i) => Math.min(n, to[i] as number));
    const max = from.map((n, i) => Math.max(n, to[i] as number));
    const reset = isRecord(data.reset) ? data.reset : {};
    const structures = Array.isArray(reset.structures) ? reset.structures : [];
    structures.forEach((entryValue, index) => {
      const entry = dataOf(entryValue);
      if (typeof entry.structure !== 'string') return;
      const size = sizes.get(entry.structure);
      if (size === undefined && has(entry.structure) === false) {
        problems.push(
          problem(
            'error',
            'games.area-structure-missing',
            element,
            `/reset/structures/${index}/structure`,
            `The structure ${entry.structure} is not in the project or the game, so the reset cannot place it. Import or make it, or pick another.`,
          ),
        );
        return;
      }
      if (size === undefined) return;
      const at = blockPos(entry.at);
      const outside = AXES.some(
        (_axis, i) =>
          (at[i] as number) < (min[i] as number) ||
          (at[i] as number) + (size[i] as number) - 1 > (max[i] as number),
      );
      if (!outside) return;
      problems.push(
        problem(
          'warning',
          'games.area-structure-outside',
          element,
          `/reset/structures/${index}/at`,
          `The structure ${entry.structure} (${size.join(' by ')}) placed at ${at.join(' ')} goes outside the area, so resetting the area does not clear the part outside first. Move it, or make the area bigger.`,
        ),
      );
    });
  }
  return problems;
}

function timers(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, TIMER)) {
    const seconds = dataOf(element.data).seconds;
    if (isWholeAbove(seconds, 1) && typeof seconds === 'number' && seconds <= MAX_TIMER_SECONDS) {
      continue;
    }
    problems.push(
      problem(
        'error',
        'games.timer-seconds',
        element,
        '/seconds',
        `A timer runs for 1 to ${MAX_TIMER_SECONDS.toLocaleString('en-GB')} whole seconds (one day).`,
      ),
    );
  }
  return problems;
}

function objectives(elements: readonly Element[], input: ValidationInput): Problem[] {
  const problems: Problem[] = [];
  const facts = input.target.scoreboard;
  const statPrefix = input.target.stats?.criterionPrefix;
  for (const element of ofKind(elements, OBJECTIVE)) {
    const data = dataOf(element.data);
    if (facts === undefined) continue;
    const criterion = str(data.criterion, '');
    const statMatch = /^minecraft\.([a-z_]+):[a-z0-9_.-]+\.[a-z0-9_./-]+$/.exec(criterion);
    const known =
      facts.criteria.includes(criterion) ||
      (statMatch !== null && facts.statTypes.includes(statMatch[1] as string)) ||
      (statPrefix !== undefined &&
        criterion.startsWith(statPrefix) &&
        criterion.length > statPrefix.length);
    if (!known) {
      problems.push(
        problem(
          'warning',
          'games.objective-criterion',
          element,
          '/criterion',
          `MSM does not know the criterion "${criterion}" on this version: it knows ${facts.criteria.join(', ')}, a statistic such as minecraft.mined:minecraft.stone, and the project's statistics. The game refuses the objective if the criterion is wrong.`,
        ),
      );
    }
    const display = str(data.display, 'none');
    if (display !== 'none' && !facts.displaySlots.includes(display)) {
      problems.push(
        problem(
          'error',
          'games.objective-display',
          element,
          '/display',
          `This version has no display slot "${display}".`,
        ),
      );
    }
    const render = str(data.render, 'integer');
    if (!facts.renderTypes.includes(render)) {
      problems.push(
        problem(
          'error',
          'games.objective-display',
          element,
          '/render',
          `This version draws scores only as ${facts.renderTypes.join(' or ')}.`,
        ),
      );
    }
  }
  return problems;
}

function teams(elements: readonly Element[], input: ValidationInput): Problem[] {
  const facts = input.target.scoreboard;
  if (facts === undefined) return [];
  const problems: Problem[] = [];
  const options = [
    ['colour', [...facts.teamColours, 'reset'], 'colour'],
    ['name_tags', facts.nameTagVisibility, 'name tag setting'],
    ['collision', facts.collisionRules, 'collision setting'],
  ] as const;
  for (const element of ofKind(elements, TEAM)) {
    const data = dataOf(element.data);
    for (const [key, values, words] of options) {
      const value = data[key];
      if (typeof value !== 'string' || values.includes(value)) continue;
      problems.push(
        problem(
          'error',
          'games.team-option',
          element,
          `/${key}`,
          `This version has no team ${words} "${value}"; it has ${values.join(', ')}.`,
        ),
      );
    }
  }
  return problems;
}

function names(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const [kind, words] of [
    [TEAM, 'team'],
    [OBJECTIVE, 'objective'],
  ] as const) {
    const seen = new Map<string, Element>();
    for (const element of ofKind(elements, kind)) {
      const name = `${namespaceOf(element.id)}.${dotted(pathOf(element.id))}`;
      const first = seen.get(name);
      if (first === undefined) {
        seen.set(name, element);
        continue;
      }
      problems.push(
        problem(
          'error',
          'games.name-clash',
          element,
          undefined,
          `This ${words} and ${first.id} both become the ${words} ${name} in the game. Rename one of them.`,
        ),
      );
    }
  }
  for (const element of ofKind(elements, OBJECTIVE)) {
    if (!RESERVED_OBJECTIVE_PATHS.includes(pathOf(element.id))) continue;
    problems.push(
      problem(
        'error',
        'games.reserved-name',
        element,
        undefined,
        `MSM uses the objective name ${pathOf(element.id)} for its own timers and one blocks. Rename this objective.`,
      ),
    );
  }
  return problems;
}

/** The pieces' validator. */
export const piecesValidator: ProjectValidator = {
  id: 'msm.games.pieces',
  kinds: [ONE_BLOCK, TEAM, OBJECTIVE, TIMER, AREA, STRUCTURE_TEMPLATE],
  validate: (input) => {
    const { elements, registry } = input;
    const structureIds = registry.ids('structure');
    const has = (id: string): boolean | undefined =>
      structureIds.length === 0 ? undefined : registry.has('structure', id);
    return [
      ...oneBlocks(elements),
      ...areas(elements, has),
      ...timers(elements),
      ...objectives(elements, input),
      ...teams(elements, input),
      ...names(elements),
    ];
  },
};

/** Every validator of the pieces. */
export const piecesValidators: readonly ProjectValidator[] = Object.freeze([piecesValidator]);
