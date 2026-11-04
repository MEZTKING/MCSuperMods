/**
 * Project validators of `@msm/plugin-structures` (ADR 0022, plan D8). Codes `structures.*`:
 *
 * - `set-spacing` (error): a `random_spread` structure set whose `separation` is not less than
 *   its `spacing`.
 * - `unplaced-structure` (warning): a project structure in no project structure set.
 * - `pool-empty` (warning): a template pool with no elements and the `minecraft:empty`
 *   fallback.
 * - `jigsaw-target-missing` (warning): a jigsaw whose `target` names no jigsaw in the target
 *   pool's pieces or its fallback chain; skipped when the pool or one of its pieces is not in
 *   the project.
 * - `template-too-large` (warning): a structure template larger than 48 blocks on an axis.
 *
 * `structures.newer-data-version` is reported by the importers, not here. Unknown ids stay
 * `schema.unknown-id` warnings of the registry index.
 */
import type { Element, Problem, ProjectValidator } from '@msm/plugin-api';
import { STRUCTURE_TEMPLATE_KIND } from './kinds/structure-template';
import { sizeProblems } from './nbt/structure-template';

const POOL_KIND = 'minecraft:worldgen/template_pool';
const STRUCTURE_KIND = 'minecraft:worldgen/structure';
const SET_KIND = 'minecraft:worldgen/structure_set';

/** The jigsaw name a feature pool element offers (the game's default for feature pieces). */
const FEATURE_JIGSAW_NAME = 'minecraft:bottom';

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** `minecraft:` added to an id without a namespace; non-strings become undefined. */
const normalise = (value: unknown): string | undefined =>
  typeof value !== 'string' ? undefined : value.includes(':') ? value : `minecraft:${value}`;

const ofKind = (elements: readonly Element[], kind: string): Element[] =>
  elements.filter((element) => element.kind === kind);

const byId = (elements: readonly Element[]): Map<string, Element> =>
  new Map(elements.map((element) => [element.id, element]));

/** `structures.set-spacing`. */
export const setSpacingValidator: ProjectValidator = {
  id: 'msm.structures.set-spacing',
  kinds: [SET_KIND],
  validate({ elements }) {
    const problems: Problem[] = [];
    for (const set of ofKind(elements, SET_KIND)) {
      const placement = isObj(set.data) ? set.data.placement : undefined;
      if (!isObj(placement) || normalise(placement.type) !== 'minecraft:random_spread') continue;
      const { spacing, separation } = placement;
      if (typeof spacing !== 'number' || typeof separation !== 'number') continue;
      if (separation < spacing) continue;
      problems.push({
        severity: 'error',
        code: 'structures.set-spacing',
        elementId: set.id,
        path: '/placement/separation',
        message: `${set.id}: separation (${separation}) must be less than spacing (${spacing}), or the game fails to load the structure set.`,
      });
    }
    return problems;
  },
};

/** `structures.unplaced-structure`. */
export const unplacedStructureValidator: ProjectValidator = {
  id: 'msm.structures.unplaced-structure',
  kinds: [STRUCTURE_KIND, SET_KIND],
  validate({ elements }) {
    const placed = new Set<string>();
    for (const set of ofKind(elements, SET_KIND)) {
      if (!isObj(set.data)) continue;
      for (const entry of arr(set.data.structures)) {
        const id = isObj(entry) ? normalise(entry.structure) : undefined;
        if (id !== undefined) placed.add(id);
      }
    }
    return ofKind(elements, STRUCTURE_KIND)
      .filter((structure) => !placed.has(structure.id))
      .map(
        (structure): Problem => ({
          severity: 'warning',
          code: 'structures.unplaced-structure',
          elementId: structure.id,
          message: `${structure.id} is in no structure set of the project, so it never generates on its own.`,
        }),
      );
  },
};

/** `structures.pool-empty`. */
export const poolEmptyValidator: ProjectValidator = {
  id: 'msm.structures.pool-empty',
  kinds: [POOL_KIND],
  validate({ elements }) {
    return ofKind(elements, POOL_KIND)
      .filter((pool) => {
        if (!isObj(pool.data)) return false;
        return (
          arr(pool.data.elements).length === 0 &&
          normalise(pool.data.fallback ?? 'minecraft:empty') === 'minecraft:empty'
        );
      })
      .map(
        (pool): Problem => ({
          severity: 'warning',
          code: 'structures.pool-empty',
          elementId: pool.id,
          path: '/elements',
          message: `${pool.id} has no elements and falls back to minecraft:empty, so it never places anything.`,
        }),
      );
  },
};

/**
 * The jigsaw names a project pool can offer, following its fallback chain through project
 * pools, or `undefined` when a piece or a pool in the chain is not in the project (unknown).
 */
function poolJigsawNames(
  poolId: string,
  pools: Map<string, Element>,
  templates: Map<string, Element>,
  seen = new Set<string>(),
): Set<string> | undefined {
  if (poolId === 'minecraft:empty') return new Set();
  if (seen.has(poolId)) return new Set();
  seen.add(poolId);
  const pool = pools.get(poolId);
  if (pool === undefined || !isObj(pool.data)) return undefined;
  const names = new Set<string>();
  const addPiece = (piece: unknown): boolean => {
    if (!isObj(piece)) return true;
    const type = normalise(piece.element_type);
    if (type === 'minecraft:empty_pool_element') return true;
    if (type === 'minecraft:feature_pool_element') {
      names.add(FEATURE_JIGSAW_NAME);
      return true;
    }
    if (type === 'minecraft:list_pool_element') return arr(piece.elements).every(addPiece);
    const location = normalise(piece.location);
    const template = location === undefined ? undefined : templates.get(location);
    if (template === undefined || !isObj(template.data)) return false;
    for (const jigsaw of arr(template.data.jigsaws)) {
      if (isObj(jigsaw) && typeof jigsaw.name === 'string') names.add(jigsaw.name);
    }
    return true;
  };
  for (const entry of arr(pool.data.elements)) {
    if (!addPiece(isObj(entry) ? entry.element : undefined)) return undefined;
  }
  const fallback = normalise(pool.data.fallback ?? 'minecraft:empty') ?? 'minecraft:empty';
  const more = poolJigsawNames(fallback, pools, templates, seen);
  if (more === undefined) return undefined;
  for (const name of more) names.add(name);
  return names;
}

/** `structures.jigsaw-target-missing`. */
export const jigsawTargetValidator: ProjectValidator = {
  id: 'msm.structures.jigsaw-target-missing',
  kinds: [STRUCTURE_TEMPLATE_KIND, POOL_KIND],
  validate({ elements }) {
    const pools = byId(ofKind(elements, POOL_KIND));
    const templates = byId(ofKind(elements, STRUCTURE_TEMPLATE_KIND));
    const cache = new Map<string, Set<string> | undefined>();
    const problems: Problem[] = [];
    for (const template of templates.values()) {
      if (!isObj(template.data)) continue;
      for (const [index, jigsaw] of arr(template.data.jigsaws).entries()) {
        if (!isObj(jigsaw)) continue;
        const pool = normalise(jigsaw.pool);
        const target = jigsaw.target;
        if (pool === undefined || pool === 'minecraft:empty' || typeof target !== 'string')
          continue;
        if (target === 'minecraft:empty') continue;
        if (!cache.has(pool)) cache.set(pool, poolJigsawNames(pool, pools, templates));
        const names = cache.get(pool);
        if (names === undefined || names.has(target)) continue;
        problems.push({
          severity: 'warning',
          code: 'structures.jigsaw-target-missing',
          elementId: template.id,
          path: `/jigsaws/${index}/target`,
          message: `${template.id}: no piece of pool ${pool} (or its fallbacks) has a jigsaw named ${target}, so nothing attaches here.`,
        });
      }
    }
    return problems;
  },
};

/** `structures.template-too-large`. */
export const templateSizeValidator: ProjectValidator = {
  id: 'msm.structures.template-too-large',
  kinds: [STRUCTURE_TEMPLATE_KIND],
  validate({ elements }) {
    return ofKind(elements, STRUCTURE_TEMPLATE_KIND).flatMap((template) => {
      const size = isObj(template.data) ? arr(template.data.size) : [];
      const numbers = size.filter((axis): axis is number => typeof axis === 'number');
      return sizeProblems(numbers).map((problem) => ({
        ...problem,
        elementId: template.id,
        message: `${template.id}: ${problem.message}`,
      }));
    });
  },
};

/** Every validator of this plugin. */
export const structureValidators: readonly ProjectValidator[] = Object.freeze([
  setSpacingValidator,
  unplacedStructureValidator,
  poolEmptyValidator,
  jigsawTargetValidator,
  templateSizeValidator,
]);
