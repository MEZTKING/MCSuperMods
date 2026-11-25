/**
 * The id step's tables (ADR 0136 D3): which registry members are gone, which registries moved,
 * which ids another registry still has and which renames are confirmed, as data read from a
 * change set; and the id steps built from them.
 *
 * @packageDocumentation
 */

import type { TargetChange, TargetChangeSet } from '@msm/plugin-api';
import type { IdStep } from '../types';
import type { IdEntry, IdLookup } from '../walk';

/** A removed id with a confirmed replacement (ADR 0037 D3). */
export interface KnownRename {
  /** The registry the id was removed from. */
  registry: string;
  /** The removed id, without namespace. */
  from: string;
  /** The replacement id in the same registry, without namespace. */
  to: string;
  /**
   * Whether the replacement takes exactly the same fields, proved against the newer target's
   * schemas by that target's test. Only then does the migration rewrite the id; otherwise it
   * reports the id and names the replacement.
   */
  sameShape: boolean;
  /** What the user has to change, in British English. */
  hint?: string;
}

/** The removed-id tables of one version step, as the id steps read them. */
export interface RemovedIdTables {
  /** Registry to the ids removed from it, both sorted. */
  removed: Readonly<Record<string, readonly string[]>>;
  /** Registries gone while every member lives on, unchanged, in the named registry. */
  moved: Readonly<Record<string, string>>;
  /** Removed ids still members of other registries: registry → id → those registries. */
  stillRegistered: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  /** Confirmed renames. */
  renames: readonly KnownRename[];
}

/** The change id of a removed member: `ids:<registry>/<id>` (as `tools/diff-targets` writes it). */
export function removedIdChangeId(registry: string, id: string): string {
  return `ids:${registry}/${id}`;
}

function isRemoval(change: TargetChange): boolean {
  return (
    change.area === 'ids' &&
    (change.what === 'member-removed' || change.what === 'member-renamed') &&
    change.registry !== undefined &&
    typeof change.from === 'string'
  );
}

/**
 * The tables of a merged change set. A moved registry's members are not listed (the set records
 * the move, not its members); a rename is a `member-renamed` change whose `to` is one id, and its
 * `sameShape` is true only when the change's handling is `auto`.
 */
export function idTablesFromChangeSet(set: TargetChangeSet): RemovedIdTables {
  const removed: Record<string, string[]> = {};
  const moved: Record<string, string> = {};
  const stillRegistered: Record<string, Record<string, readonly string[]>> = {};
  const renames: KnownRename[] = [];
  for (const change of set.changes) {
    if (
      change.area === 'ids' &&
      change.what === 'registry-moved' &&
      typeof change.to === 'string'
    ) {
      moved[change.subject] = change.to;
      continue;
    }
    if (!isRemoval(change)) continue;
    const registry = change.registry as string;
    const id = change.from as string;
    removed[registry] = [...(removed[registry] ?? []), id];
    if (change.stillIn !== undefined && change.stillIn.length > 0) {
      stillRegistered[registry] = { ...stillRegistered[registry], [id]: change.stillIn };
    }
    if (change.what === 'member-renamed' && typeof change.to === 'string') {
      renames.push({
        registry,
        from: id,
        to: change.to,
        sameShape: change.handling === 'auto',
        ...(change.hint === undefined ? {} : { hint: change.hint }),
      });
    }
  }
  for (const ids of Object.values(removed)) ids.sort();
  return { removed, moved, stillRegistered, renames };
}

/** The id steps of `tables`, one per removed member outside a moved registry, in table order. */
export function idSteps(tables: RemovedIdTables): IdStep[] {
  const steps: IdStep[] = [];
  for (const [registry, ids] of Object.entries(tables.removed)) {
    if (registry in tables.moved) continue;
    for (const from of ids) {
      const rename = tables.renames.find((r) => r.registry === registry && r.from === from);
      const typeOnly = tables.stillRegistered[registry]?.[from] !== undefined;
      steps.push({
        op: 'rename-id',
        changeId: removedIdChangeId(registry, from),
        registry,
        from,
        apply: rename?.sameShape === true,
        ...(rename === undefined ? {} : { to: rename.to }),
        ...(typeOnly ? { typeOnly } : {}),
        ...(rename?.hint === undefined ? {} : { hint: rename.hint }),
      });
    }
  }
  return steps;
}

/** The walk's lookup over `steps`: id without namespace to its entries, in step order. */
export function idLookup(steps: readonly IdStep[]): IdLookup<IdStep> {
  const lookup = new Map<string, IdEntry<IdStep>[]>();
  for (const step of steps) {
    const entry: IdEntry<IdStep> = {
      tag: step.registry.startsWith('tag/'),
      typeOnly: step.typeOnly === true,
      value: step,
    };
    lookup.set(step.from, [...(lookup.get(step.from) ?? []), entry]);
  }
  return lookup;
}
