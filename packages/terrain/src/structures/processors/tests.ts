/**
 * Rule tests and position rule tests of the `rule` processor (B638), as the spike B634 observed them
 * on both targets: `always_true`, `block_match`, `blockstate_match`, `tag_match`, the two random
 * matches (seeded with MSM's own random), `all_of`, `any_of`, `not` and `height_match` (the
 * block's world y, both ends inclusive) exactly; the two linear position tests about right (the
 * chance grows linearly with the distance from the piece's origin; only the start piece was
 * observed). The registry of rule tests has two names across the targets (a target fact); the ids
 * inside it are the same, so the engine reads only the ids.
 */

import type { BlockTags } from '../../features/blocks';
import { isObject } from '../../features/blocks';
import type { FeatureRandom } from '../../features/random';
import type { Vec3 } from '../boxes';
import { idOfState, readProcessorState, stateMatches } from './cells';
import { type Report, typeId } from './report';

/** What a rule test reads: a block state and where it stands in the world. */
export type RuleTestFn = (state: string, worldY: number, random: FeatureRandom) => boolean;

/** What a position test reads: the block's world position and the piece's origin. */
export type PosTestFn = (pos: Vec3, origin: Vec3, random: FeatureRandom) => boolean;

/** The rule tests MSM applies, with how faithfully (the schema walk reads this list). */
export const RULE_TESTS = Object.freeze({
  'minecraft:always_true': 'exact',
  'minecraft:block_match': 'exact',
  'minecraft:blockstate_match': 'exact',
  'minecraft:tag_match': 'exact',
  'minecraft:random_block_match': 'exact',
  'minecraft:random_blockstate_match': 'exact',
  'minecraft:all_of': 'exact',
  'minecraft:any_of': 'exact',
  'minecraft:not': 'exact',
  'minecraft:height_match': 'exact',
} as const);

/** The position rule tests MSM applies, with how faithfully. */
export const POSITION_RULE_TESTS = Object.freeze({
  'minecraft:always_true': 'exact',
  'minecraft:linear_pos': 'about_right',
  'minecraft:axis_aligned_linear_pos': 'about_right',
} as const);

const LINEAR_NOTE =
  'The chance of a linear position test grows with the distance from the piece’s origin as the game showed for a start piece; for other pieces it is about right.';

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function tagName(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^#/, '') : '';
}

/** Compiles a rule test; an unknown or broken one never matches and is reported. */
export function compileRuleTest(json: unknown, tags: BlockTags, report: Report): RuleTestFn {
  const never: RuleTestFn = () => false;
  if (!isObject(json)) {
    report.mark('only_in_game', 'A rule test is missing, so its rule never matches here.');
    return never;
  }
  const type = typeId(json.predicate_type);
  switch (type) {
    case 'minecraft:always_true':
      return () => true;
    case 'minecraft:block_match': {
      const id =
        typeof json.block === 'string'
          ? idOfState(readProcessorState(json.block, 'block_match'))
          : '';
      return (state) => idOfState(state) === id;
    }
    case 'minecraft:blockstate_match': {
      const want = readProcessorState(json.block_state, 'blockstate_match');
      return (state) => stateMatches(state, want);
    }
    case 'minecraft:tag_match': {
      const tag = tagName(json.tag);
      return (state) => tags.has(tag, idOfState(state));
    }
    case 'minecraft:random_block_match': {
      const id =
        typeof json.block === 'string'
          ? idOfState(readProcessorState(json.block, 'random_block_match'))
          : '';
      const p = num(json.probability, 0);
      return (state, _y, random) => idOfState(state) === id && random.nextFloat() < p;
    }
    case 'minecraft:random_blockstate_match': {
      const want = readProcessorState(json.block_state, 'random_blockstate_match');
      const p = num(json.probability, 0);
      return (state, _y, random) => stateMatches(state, want) && random.nextFloat() < p;
    }
    case 'minecraft:all_of':
    case 'minecraft:any_of': {
      const list = Array.isArray(json.rules)
        ? json.rules
        : Array.isArray(json.predicates)
          ? json.predicates
          : [];
      const parts = list.map((p) => compileRuleTest(p, tags, report));
      return type === 'minecraft:all_of'
        ? (state, y, random) => parts.every((t) => t(state, y, random))
        : (state, y, random) => parts.some((t) => t(state, y, random));
    }
    case 'minecraft:not': {
      const inner = compileRuleTest(json.rule ?? json.predicate, tags, report);
      return (state, y, random) => !inner(state, y, random);
    }
    case 'minecraft:height_match': {
      const min = num(json.min_inclusive, Number.NEGATIVE_INFINITY);
      const max = num(json.max_inclusive, Number.POSITIVE_INFINITY);
      return (_state, y) => y >= min && y <= max;
    }
    default:
      report.mark(
        'only_in_game',
        `The rule test ${type || '(unnamed)'} is only in the game, so its rule never matches here.`,
      );
      return never;
  }
}

/** Compiles a position test; `always_true` when the rule names none. */
export function compilePosTest(json: unknown, report: Report): PosTestFn {
  if (json === undefined) return () => true;
  if (!isObject(json)) {
    report.mark('only_in_game', 'A position test is broken, so its rule never matches here.');
    return () => false;
  }
  const type = typeId(json.predicate_type);
  if (type === 'minecraft:always_true') return () => true;
  if (type !== 'minecraft:linear_pos' && type !== 'minecraft:axis_aligned_linear_pos') {
    report.mark(
      'only_in_game',
      `The position test ${type || '(unnamed)'} is only in the game, so its rule never matches here.`,
    );
    return () => false;
  }
  report.mark('about_right', LINEAR_NOTE);
  const minDist = num(json.min_dist, 0);
  const maxDist = num(json.max_dist, 0);
  const minChance = num(json.min_chance, 0);
  const maxChance = num(json.max_chance, 0);
  const axis = json.axis === 'x' ? 0 : json.axis === 'z' ? 2 : 1;
  const aligned = type === 'minecraft:axis_aligned_linear_pos';
  return (pos, origin, random) => {
    const d = aligned
      ? Math.abs(pos[axis] - origin[axis])
      : Math.hypot(pos[0] - origin[0], pos[1] - origin[1], pos[2] - origin[2]);
    let t: number;
    if (maxDist <= minDist) t = d >= maxDist ? 1 : 0;
    else t = Math.min(1, Math.max(0, (d - minDist) / (maxDist - minDist)));
    const chance = minChance + (maxChance - minChance) * t;
    return random.nextFloat() < chance;
  };
}
