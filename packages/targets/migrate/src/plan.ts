/**
 * From a change set to a plan (ADR 0136 D2, D3): the generated and curated halves merged, the
 * steps read from the merged set and the curated file, and the checks a target's test runs on
 * its curated file.
 *
 * @packageDocumentation
 */

import type { TargetChange, TargetChangeSet } from '@msm/plugin-api';
import { idSteps, idTablesFromChangeSet } from './steps/ids';
import type { CuratedChangeSet, CuratedStep, MigrationPlan, MigrationStep } from './types';
import { parsePointer } from './walk';

/**
 * The generated set with the curated entries laid over it: a curated entry with a generated
 * change's id overrides its handling and adds its sentence, hint and in-game check; a confirmed
 * rename turns a `member-removed` into a `member-renamed` whose `to` is the new id, handled
 * `auto` only when the shape is the same and `manual` otherwise; an entry with `change` is added
 * with source `curated`. The result is sorted by id, as a change set is.
 */
export function mergeChangeSet(
  generated: TargetChangeSet,
  curated: CuratedChangeSet,
): TargetChangeSet {
  const byId = new Map<string, TargetChange>(generated.changes.map((c) => [c.id, { ...c }]));
  for (const entry of curated.changes) {
    const base = byId.get(entry.id);
    let change: TargetChange;
    if (base !== undefined) {
      change = base;
    } else if (entry.change !== undefined) {
      change = {
        ...entry.change,
        id: entry.id,
        source: 'curated',
        handling: entry.change.handling ?? 'none',
      };
    } else {
      throw new Error(
        `Curated change ${entry.id} answers no generated change and has no change of its own.`,
      );
    }
    if (entry.rename !== undefined) {
      change.what = 'member-renamed';
      change.to = entry.rename.to;
      change.handling = entry.rename.shape === 'same' ? 'auto' : 'manual';
    }
    if (entry.handling !== undefined && entry.rename === undefined)
      change.handling = entry.handling;
    if (entry.sentence !== undefined) change.sentence = entry.sentence;
    if (entry.hint !== undefined) change.hint = entry.hint;
    if (entry.inGameCheck !== undefined) change.inGameCheck = entry.inGameCheck;
    byId.set(entry.id, change);
  }
  const changes = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ...generated, changes };
}

/** The curated steps of `curated`, each with the id of the entry that holds it, in file order. */
export function curatedSteps(curated: CuratedChangeSet): MigrationStep[] {
  return curated.changes.flatMap((entry) =>
    (entry.steps ?? []).map(
      (step: CuratedStep) => ({ ...step, changeId: entry.id }) as MigrationStep,
    ),
  );
}

/**
 * The plan of a merged change set: the curated field and block state steps first, in file order,
 * then one id step per removed member (outside moved registries).
 */
export function planFromChangeSet(
  merged: TargetChangeSet,
  curated: CuratedChangeSet,
  version: string,
): MigrationPlan {
  return {
    from: merged.from,
    to: merged.to,
    version,
    steps: [...curatedSteps(curated), ...idSteps(idTablesFromChangeSet(merged))],
    changes: merged.changes,
  };
}

/** The kinds of {@link TargetChange.what} each curated step type may answer. */
const STEP_ANSWERS: Readonly<Record<CuratedStep['op'], readonly TargetChange['what'][]>> = {
  drop: ['field-removed'],
  move: ['field-removed', 'field-addedRequired', 'field-retyped'],
  set: ['field-addedRequired', 'field-madeRequired'],
  'block-state': ['property-removed', 'values-changed', 'default-changed'],
};

/**
 * What is wrong with a curated set against its generated set, one sentence each (empty when
 * nothing): ends that differ; an id answering no generated change without a change of its own, or
 * twice; a rename on anything but a removed member; a rename to the id itself; `handling: 'auto'`
 * on an entry with no step and no same-shape rename (nothing would do it); a step whose type
 * cannot answer its change; a drop whose field is not the last segment of the removed field.
 * The shape proof of each rename against both versions' schemas is the target's own test.
 */
export function curatedErrors(generated: TargetChangeSet, curated: CuratedChangeSet): string[] {
  const errors: string[] = [];
  if (curated.from !== generated.from || curated.to !== generated.to) {
    errors.push(
      `The curated set runs ${curated.from} to ${curated.to}; the generated set ${generated.from} to ${generated.to}.`,
    );
  }
  const byId = new Map(generated.changes.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const entry of curated.changes) {
    if (seen.has(entry.id)) errors.push(`${entry.id} is curated twice.`);
    seen.add(entry.id);
    const base = byId.get(entry.id);
    if (base === undefined && entry.change === undefined) {
      errors.push(`${entry.id} answers no generated change and has no change of its own.`);
      continue;
    }
    if (base !== undefined && entry.change !== undefined) {
      errors.push(`${entry.id} is a generated change; curate it, do not write it again.`);
    }
    if (entry.rename !== undefined) {
      if (base?.what !== 'member-removed') {
        errors.push(`${entry.id}: only a removed registry member can be renamed.`);
      } else if (entry.rename.to === base.from) {
        errors.push(`${entry.id}: renamed to itself.`);
      }
      if (entry.rename.shape !== 'none' && entry.rename.dispatcher === undefined) {
        errors.push(`${entry.id}: a rename with a shape names the dispatcher that proves it.`);
      }
    }
    const steps = entry.steps ?? [];
    const sameRename = entry.rename?.shape === 'same';
    if (entry.handling === 'auto' && steps.length === 0 && !sameRename) {
      errors.push(`${entry.id} is handled auto, but no step does it.`);
    }
    if (entry.handling !== undefined && entry.rename !== undefined) {
      errors.push(`${entry.id}: a rename's handling follows its shape; do not set it.`);
    }
    const what = base?.what ?? entry.change?.what;
    for (const step of steps) {
      if (what === undefined || !STEP_ANSWERS[step.op].includes(what)) {
        errors.push(`${entry.id}: a ${step.op} step cannot answer a ${what ?? 'missing'} change.`);
        continue;
      }
      if (step.op === 'drop' && base?.field !== undefined) {
        const segments = parsePointer(base.field);
        if (segments[segments.length - 1] !== step.field) {
          errors.push(`${entry.id}: drops ${step.field}, but the change removes ${base.field}.`);
        }
      }
    }
  }
  return errors;
}

/**
 * How a newer struct's fields compare with an older one's (`key` required, `key?` optional), as
 * a rename's shape: `same`, `superset` (every old field is still there and accepted as before,
 * with new ones), `subset` (fields were taken away and nothing was added) or `differs`.
 */
export function compareShapes(
  before: readonly string[],
  after: readonly string[],
): 'same' | 'superset' | 'subset' | 'differs' {
  const a = new Set(before);
  const b = new Set(after);
  const lost = [...a].filter((key) => !b.has(key));
  const gained = [...b].filter((key) => !a.has(key));
  if (lost.length === 0 && gained.length === 0) return 'same';
  if (lost.length === 0) return 'superset';
  if (gained.length === 0) return 'subset';
  return 'differs';
}
