/**
 * Predicates, conditions and the situation they are tried in (ADR 0120 D4; B601 stubs the
 * interface B600 reported, B604 fills it; B605's loot code uses it too).
 *
 * A condition answers yes, no or **unknown** (the situation does not hold what it asks about, or
 * the type is not supported). Unknown is never turned into no. Pure and seeded: no `Math.random`,
 * no `Date`; the random source is passed in.
 */

import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import type { SimRandom } from '../entities/wander.js';
import type { DataLookup, ResolvedTag } from '../tags/api.js';
import { testCondition } from './conditions.js';

/** The seeded random source the evaluators draw from. */
export type SeededRandom = SimRandom;

/** What a condition answers. */
export type Answer = 'yes' | 'no' | 'unknown';

/** An item the situation holds. */
export interface ItemSample {
  readonly id: string;
  readonly count: number;
  readonly enchantments?: Readonly<Record<string, number>>;
  readonly components?: JsonObject;
}

/** An entity the situation holds. */
export interface EntitySample {
  readonly type: string;
  readonly [field: string]: unknown;
}

/** The place a predicate, loot table or item modifier is tried in; the user picks it. */
export interface Situation {
  /** A `context_key_set` id (`minecraft:block`, `minecraft:entity`, `minecraft:chest`, ...). */
  readonly context: string;
  readonly tool?: ItemSample;
  readonly block?: { readonly id: string; readonly state?: Readonly<Record<string, string>> };
  readonly thisEntity?: EntitySample;
  readonly killer?: EntitySample & { readonly player: boolean; readonly weapon?: ItemSample };
  readonly directKiller?: EntitySample;
  readonly damage?: { readonly type: string };
  readonly explosion?: { readonly power: number; readonly decays: boolean };
  readonly weather?: { readonly raining: boolean; readonly thundering: boolean };
  readonly time?: { readonly clock: string; readonly ticks: number };
  readonly dimension?: string;
  readonly biome?: string;
  readonly position?: readonly [number, number, number];
  readonly luck?: number;
}

/** Why a part could not be worked out (never dropped silently). */
export interface Unsupported {
  readonly kind:
    | 'entry'
    | 'condition'
    | 'function'
    | 'number'
    | 'level_value'
    | 'formula'
    | 'reference';
  readonly type: string;
  /** Where in the data (an RFC 6901 pointer or a dotted path). */
  readonly path: string;
  readonly reason: 'not_supported' | 'needs_world' | 'missing_file';
}

/** Builds an {@link Unsupported}. */
export function unsupported(
  kind: Unsupported['kind'],
  type: string,
  path: string,
  reason: Unsupported['reason'],
): Unsupported {
  return { kind, type, path, reason };
}

/** What every evaluator is given. */
export interface EvalContext {
  readonly random: SeededRandom;
  /** One data file by registry folder key and id (project over vanilla). */
  readonly lookup: DataLookup;
  readonly resolveTag: (registry: string, id: string) => ResolvedTag;
  /** The target's facts (its registries); evaluators hold no version literal. */
  readonly types: TargetFacts;
}

/** The answer of one part of a predicate and of the parts nested in it. */
export interface PartResult {
  readonly path: string;
  readonly type: string;
  readonly answer: Answer;
  readonly parts: readonly PartResult[];
  /**
   * The chance of yes in this situation, its random draws taken independently (B604; absent
   * when it is not known, such as under an unknown part or a drawn number).
   */
  readonly chance?: number;
}

/** What {@link testPredicate} answers. */
export interface PredicateResult {
  readonly answer: Answer;
  readonly parts: PartResult;
  readonly unsupported: readonly Unsupported[];
}

/** The note the stubs report until B604 and B605 land. */
export const NOT_YET = (kind: Unsupported['kind'], path: string): Unsupported =>
  unsupported(kind, 'not_yet', path, 'not_supported');

/**
 * Tries a predicate (or condition) in a situation (B604): an object with a `type`, a list (all
 * must pass) or a predicate id. Random parts draw from `ctx.random`, so the answer is one sample
 * and `parts.chance` says how likely yes is. Every part not worked out is in `unsupported`.
 */
export function testPredicate(
  predicate: Json,
  situation: Situation,
  ctx: EvalContext,
): PredicateResult {
  const unsupported: Unsupported[] = [];
  const parts = testCondition(predicate, '', { situation, ctx, unsupported, refs: [] });
  return { answer: parts.answer, parts, unsupported };
}
