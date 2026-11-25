/**
 * Moving back (ADR 0136 D3, D7): the steps that have an exact inverse, run from the newer
 * target's change set, since the older target has nothing to say. A dropped field has none; its
 * value comes back from the saved report's `reverses` (the host's part, ADR 0136 D7).
 *
 * @packageDocumentation
 */

import type { MigrationPlan, MigrationStep } from './types';

/** The inverse of one step, or `undefined` when it has no exact one. */
export function inverseStep(step: MigrationStep): MigrationStep | undefined {
  switch (step.op) {
    case 'rename-id':
      // Only an applied rename changed anything; a reported id is put back by nobody.
      if (!step.apply || step.to === undefined) return undefined;
      return {
        op: 'rename-id',
        changeId: step.changeId,
        registry: step.registry,
        from: step.to,
        to: step.from,
        apply: true,
      };
    case 'move':
      return {
        op: 'move',
        changeId: step.changeId,
        places: step.places,
        from: step.to,
        to: step.from,
      };
    case 'set':
      return {
        op: 'drop',
        changeId: step.changeId,
        places: step.places,
        field: step.field,
        ifValue: step.value,
      };
    case 'block-state': {
      const values = Object.entries(step.values ?? {});
      const back = new Map(values.map(([from, to]) => [to, from]));
      // Two old values made one: the way back is not exact.
      if (back.size !== values.length) return undefined;
      return {
        op: 'block-state',
        changeId: step.changeId,
        block: step.block,
        property: step.renameTo ?? step.property,
        ...(step.renameTo === undefined ? {} : { renameTo: step.property }),
        ...(values.length === 0 ? {} : { values: Object.fromEntries(back) }),
      };
    }
    case 'drop':
      return undefined;
  }
}

/**
 * A plan back from `plan.to` to `plan.from`, and the change ids of steps with no exact inverse.
 *
 * @param version - The older end's Minecraft version, for the plan's messages.
 */
export function inversePlan(
  plan: MigrationPlan,
  version: string,
): { plan: MigrationPlan; inexact: string[] } {
  const steps: MigrationStep[] = [];
  const inexact: string[] = [];
  for (const step of [...plan.steps].reverse()) {
    const back = inverseStep(step);
    if (back !== undefined) steps.push(back);
    else if (step.op !== 'rename-id') inexact.push(step.changeId);
  }
  return {
    plan: {
      from: plan.to,
      to: plan.from,
      version,
      steps,
      ...(plan.changes === undefined ? {} : { changes: plan.changes }),
      ...(plan.plainTextKinds === undefined ? {} : { plainTextKinds: plan.plainTextKinds }),
    },
    inexact,
  };
}
