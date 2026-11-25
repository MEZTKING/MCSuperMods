/**
 * The migration engine (ADR 0136 D3): one target's `migrateFrom`, built from a plan of steps.
 * Pure: the project is never changed; the host applies the report as one undo step.
 *
 * For each element, in order: the field steps (drop, move, set) in plan order, the block state
 * steps, then the id walk over the result (a confirmed same-shape rename is applied, any other
 * removed id is reported where it stands, and an id inside longer text is only reported). One
 * `update` change per changed element carries the whole new data and a `details` entry per value
 * touched; every dropped value is kept in `reverses`; the curated in-game checks of the changes
 * that touched the project are in `inGameChecks`.
 *
 * @packageDocumentation
 */

import type {
  Json,
  MigrationChange,
  MigrationDetail,
  MigrationInGameCheck,
  MigrationReport,
  MigrationReverse,
  Problem,
  Project,
  ResourceLocation,
  Target,
  TargetChange,
} from '@msm/plugin-api';
import { dataHash } from './hash';
import { applyBlockStateStep } from './steps/block-states';
import { applyFieldStep } from './steps/fields';
import { idLookup } from './steps/ids';
import {
  DEFAULT_PLAIN_TEXT_KINDS,
  type FieldStep,
  type IdStep,
  type MigrationPlan,
  type MigrationStep,
} from './types';
import { findIds, lineAndColumn, pointer, replaceAt, valueAt } from './walk';

/** The problem codes the engine reports. */
export const MigrationProblemCodes = Object.freeze({
  /** A removed id in element data that the migration did not rename (an error). */
  removedId: 'target.removed-id',
  /** A removed id inside text (a function line, a script, SNBT); reported, never rewritten. */
  removedIdInText: 'target.removed-id-in-text',
  /** A move whose place is already taken; the value stays where it was. */
  fieldNotMoved: 'target.field-not-moved',
  /** The project's target is neither the plan's start nor its end. */
  noMigrationPath: 'target.no-migration-path',
});

const NAMESPACE = 'minecraft:';

/** How an id is shown: with its namespace and, for a tag, its `#`. */
function shownId(step: IdStep, id: string): string {
  return `${step.registry.startsWith('tag/') ? '#' : ''}${NAMESPACE}${id}`;
}

/** An id as written (`x`, `minecraft:x`, `#x`), shown with its namespace. */
function shown(written: string): string {
  const prefix = written.startsWith('#') ? '#' : '';
  const id = written.slice(prefix.length);
  return `${prefix}${id.includes(':') ? id : `${NAMESPACE}${id}`}`;
}

function isFieldStep(step: MigrationStep): step is FieldStep {
  return step.op === 'drop' || step.op === 'move' || step.op === 'set';
}

/** One element's description: what was renamed, removed, moved, set and changed, in that order. */
function describe(
  details: readonly MigrationDetail[],
  plan: MigrationPlan,
  because: ReadonlyMap<string, string>,
): string {
  const parts: string[] = [];
  const renamed = details.filter((d) => d.op === 'rename-id');
  if (renamed.length > 0) {
    parts.push(
      `Renamed ${renamed.map((d) => `${shown(String(d.before))} → ${String(d.after)}`).join(', ')}`,
    );
  }
  const dropped = details.filter((d) => d.op === 'drop');
  const reasons = [...new Set(dropped.map((d) => because.get(d.changeId) ?? ''))];
  for (const reason of reasons) {
    const paths = dropped
      .filter((d) => (because.get(d.changeId) ?? '') === reason)
      .map((d) => d.path);
    parts.push(
      `Removed ${paths.join(', ')}, ${reason === '' ? `which Minecraft ${plan.version} no longer has` : reason}`,
    );
  }
  const moved = details.filter((d) => d.op === 'move');
  if (moved.length > 0) {
    parts.push(`Moved ${moved.map((d) => `${d.from ?? ''} to ${d.path}`).join(', ')}`);
  }
  const set = details.filter((d) => d.op === 'set');
  if (set.length > 0) {
    parts.push(
      `Set ${set
        .map((d) =>
          d.before === undefined
            ? `${d.path} to ${JSON.stringify(d.after)}`
            : `${d.path} from ${JSON.stringify(d.before)} to ${JSON.stringify(d.after)}`,
        )
        .join(', ')}`,
    );
  }
  return `${parts.join('; ')} for Minecraft ${plan.version}.`;
}

/**
 * Builds a `migrateFrom` hook over `plan`. A project already on `plan.to` needs nothing; one on
 * any target but `plan.from` gets one `target.no-migration-path` warning.
 */
export function createMigration(
  plan: MigrationPlan,
): (previous: Target, project: Project) => MigrationReport {
  const idStepsInPlan = plan.steps.filter((step): step is IdStep => step.op === 'rename-id');
  const lookup = idLookup(idStepsInPlan);
  const changeById = new Map<string, TargetChange>(
    (plan.changes ?? []).map((change) => [change.id, change]),
  );
  const because = new Map<string, string>();
  for (const step of plan.steps) {
    if (step.op === 'drop' && step.because !== undefined) because.set(step.changeId, step.because);
  }
  const plainText = new Set(plan.plainTextKinds ?? DEFAULT_PLAIN_TEXT_KINDS);
  const sentence = (changeId: string): { sentence?: string } => {
    const text = changeById.get(changeId)?.sentence;
    return text === undefined ? {} : { sentence: text };
  };

  return (previous, project) => {
    if (previous.id === plan.to) return { changes: [], problems: [] };
    if (previous.id !== plan.from) {
      return {
        changes: [],
        problems: [
          {
            severity: 'warning',
            code: MigrationProblemCodes.noMigrationPath,
            message: `There is no migration from ${previous.id} to ${plan.to}; check the project's elements after the switch.`,
          },
        ],
      };
    }
    const changes: MigrationChange[] = [];
    const problems: Problem[] = [];
    const reverses: MigrationReverse[] = [];
    /** Change id → the elements it touched, in first-touch order. */
    const touched = new Map<string, string[]>();
    const touch = (changeId: string, elementId: string): void => {
      const list = touched.get(changeId) ?? [];
      if (!list.includes(elementId)) list.push(elementId);
      touched.set(changeId, list);
    };

    for (const namespace of project.namespaces) {
      for (const element of namespace.elements) {
        const elementId = element.id as ResourceLocation;
        let data: Json = element.data;
        let owned = false;
        const details: MigrationDetail[] = [];

        for (const step of plan.steps) {
          if (isFieldStep(step)) {
            const outcome = applyFieldStep(step, element.kind, data, owned);
            if (outcome.data !== data) owned = true;
            data = outcome.data;
            details.push(...outcome.details.map((d) => ({ ...d, ...sentence(d.changeId) })));
            for (const blocked of outcome.blocked) {
              touch(step.changeId, elementId);
              problems.push({
                severity: 'warning',
                code: MigrationProblemCodes.fieldNotMoved,
                message: `${blocked.path} was not moved to ${blocked.to} for Minecraft ${plan.version}, because ${blocked.to} is already set; move it by hand.`,
                elementId,
                path: blocked.path,
              });
            }
          } else if (step.op === 'block-state') {
            const outcome = applyBlockStateStep(step, data, owned);
            if (outcome.data !== data) owned = true;
            data = outcome.data;
            details.push(...outcome.details.map((d) => ({ ...d, ...sentence(d.changeId) })));
          }
        }

        if (!plainText.has(element.kind)) {
          for (const match of findIds(data, lookup)) {
            const step = match.entry.value;
            const written = match.value;
            const prefix = match.entry.tag ? '#' : '';
            const hint = step.hint ?? changeById.get(step.changeId)?.hint;
            const tail = hint === undefined ? '' : `; ${hint}`;
            touch(step.changeId, elementId);
            if (match.kind === 'whole' && step.apply && step.to !== undefined) {
              const after = `${prefix}${NAMESPACE}${step.to}`;
              if (!owned) {
                data = structuredClone(data);
                owned = true;
              }
              data = replaceAt(data, match.segments, after);
              details.push({
                op: 'rename-id',
                path: pointer(match.segments),
                before: written,
                after,
                changeId: step.changeId,
                ...sentence(step.changeId),
              });
              continue;
            }
            if (match.kind === 'whole') {
              problems.push({
                severity: 'error',
                code: MigrationProblemCodes.removedId,
                message: `${shown(written)} was removed from the registry ${step.registry} in Minecraft ${plan.version}${tail}.`,
                elementId,
                path: pointer(match.segments),
              });
              continue;
            }
            const text = valueAt(data, match.segments);
            const at =
              typeof text === 'string' && text.includes('\n')
                ? (() => {
                    const { line, column } = lineAndColumn(text, match.index);
                    return ` (line ${line}, column ${column})`;
                  })()
                : '';
            problems.push({
              severity: 'warning',
              code: MigrationProblemCodes.removedIdInText,
              message: `${shownId(step, step.from)}${at} was removed from the registry ${step.registry} in Minecraft ${plan.version}${tail}. MCSuperMods does not change text, so change it by hand.`,
              elementId,
              path: pointer(match.segments),
            });
          }
        }

        if (details.length === 0) continue;
        for (const detail of details) {
          touch(detail.changeId, elementId);
        }
        const afterHash = dataHash(data);
        for (const detail of details) {
          if (detail.op === 'drop' && detail.before !== undefined) {
            reverses.push({ elementId, path: detail.path, value: detail.before, afterHash });
          }
        }
        changes.push({
          elementId,
          kind: 'update',
          description: describe(details, plan, because),
          data,
          details,
        });
      }
    }

    const report: MigrationReport = { changes, problems };
    const checks: MigrationInGameCheck[] = [];
    for (const [changeId, elementIds] of touched) {
      const check = changeById.get(changeId)?.inGameCheck;
      if (check === undefined) continue;
      checks.push({ changeId, check, elementIds: elementIds as ResourceLocation[] });
    }
    if (checks.length > 0) report.inGameChecks = checks;
    if (reverses.length > 0) report.reverses = reverses;
    return report;
  };
}
