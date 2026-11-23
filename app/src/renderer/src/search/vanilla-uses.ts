/**
 * **Make something with it** for a vanilla id (ADR 0124 D9; B664): the Creator flows whose
 * questions take that thing, each with the question already answered. A question takes it when
 * one of its choices is the id (a crafting ingredient, a base mob, an effect, a biome), or when it
 * is a free-text question whose default is an id of the same sort as the thing (a trader's goods,
 * an extra drop) and the id passes the wizard's own check. Questions the plugins mark `never` are left
 * alone. Flows the target cannot make, or whose kinds no plugin registers, are not offered.
 *
 * Data only: the sort of a default id comes from the host (the target's registries), so no
 * Minecraft word lives here.
 *
 * @packageDocumentation
 */

import type { Json, ProjectStarter, StarterParameter, TargetFacts } from '@msm/plugin-api';
import { checkAnswers } from '../changeset/make-flow';
import type { VanillaSort } from './sources/shared';

/** One flow that takes the thing, answered. */
export interface VanillaUse {
  readonly flowId: string;
  /** The flow's title ("Weapon"). */
  readonly title: string;
  /** The question that took the thing. */
  readonly question: string;
  /** Its label ("Crafting ingredient"). */
  readonly questionLabel: string;
  /** The answer, as `meta.creator.values` stores it. */
  readonly values: Readonly<Record<string, Json>>;
}

/** What {@link vanillaUses} reads. */
export interface VanillaUsesInput {
  /** The vanilla id (`minecraft:emerald`). */
  readonly id: string;
  /** Its sort, as the vanilla layer gives it. */
  readonly sort: VanillaSort;
  /** The library's starters (`session.library.starters`). */
  readonly starters: readonly ProjectStarter[];
  readonly target: TargetFacts;
  /** Whether a kind is registered. */
  readonly isKnownKind: (kind: string) => boolean;
  /** The sort of a vanilla id, for free-text questions; without it they are not read. */
  readonly sortOf?: (id: string) => VanillaSort | undefined;
  /** Question ids never answered from words, by starter id (the plugins' `never` hints). */
  readonly never?: Readonly<Record<string, readonly string[]>>;
}

/** `path` read as `minecraft:path`; a whole id as it is. */
export function wholeId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

const sameId = (a: string, b: string): boolean => wholeId(a) === wholeId(b);

const isId = (value: string): boolean => /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value);

function usable(starter: ProjectStarter, input: VanillaUsesInput): boolean {
  if (starter.creator === undefined) return false;
  if (!starter.requiresKinds.every((kind) => input.isKnownKind(kind))) return false;
  try {
    return starter.supports?.(input.target) ?? true;
  } catch {
    return false;
  }
}

/** The answer a question takes for the id, or undefined. */
function answerFor(parameter: StarterParameter, input: VanillaUsesInput): Json | undefined {
  switch (parameter.type) {
    case 'choice': {
      const choice = parameter.choices.find(
        (entry) => typeof entry.value === 'string' && sameId(entry.value, input.id),
      );
      return choice?.value as Json | undefined;
    }
    case 'set': {
      const choice = parameter.choices.find(
        (entry) => typeof entry.value === 'string' && sameId(entry.value, input.id),
      );
      return choice === undefined ? undefined : [choice.value as Json];
    }
    case 'string': {
      if (input.sortOf === undefined || !isId(parameter.default)) return undefined;
      if (input.sortOf(parameter.default) !== input.sort) return undefined;
      if (input.sortOf(wholeId(input.id)) !== input.sort) return undefined;
      return wholeId(input.id);
    }
    default:
      return undefined;
  }
}

/**
 * The flows that take the vanilla id, in the library's order, each answered on the first of its
 * questions that takes it (the answer checked by the wizard's `validateParameter`). Choices that
 * name the id come before free-text questions in each flow.
 */
export function vanillaUses(input: VanillaUsesInput): VanillaUse[] {
  const out: VanillaUse[] = [];
  for (const starter of input.starters) {
    if (!usable(starter, input)) continue;
    const never = new Set(input.never?.[starter.id] ?? []);
    const parameters = (starter.parameters ?? []).filter((entry) => !never.has(entry.id));
    const ordered = [
      ...parameters.filter((entry) => entry.type === 'choice' || entry.type === 'set'),
      ...parameters.filter((entry) => entry.type === 'string'),
    ];
    for (const parameter of ordered) {
      const answer = answerFor(parameter, input);
      if (answer === undefined) continue;
      const values = { [parameter.id]: answer };
      if (checkAnswers(starter.parameters, values).dropped.length > 0) continue;
      out.push({
        flowId: starter.id,
        title: starter.title,
        question: parameter.id,
        questionLabel: parameter.label,
        values,
      });
      break;
    }
  }
  return out;
}
