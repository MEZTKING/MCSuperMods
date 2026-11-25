/**
 * Moving back to an older Minecraft version (ADR 0136 D7, B820). The move back runs over the
 * saved moves up, newest first: each part of the way down is undone with the saved report of
 * the move that came up over it (`invert` of `@msm/core`), so two moves saved one at a time
 * (A to B, then B to C) are undone one after the other (C to B, then B to A), each against the
 * project as the part before left it. A part with no saved move (a move made before
 * MCSuperMods kept them, or one whose record was cleared) is undone from the newer version's
 * change set alone: the confirmed renames it applied by itself are renamed back, and every
 * other change it made by itself is listed as one that cannot be put back, with the things it
 * may have touched. Nothing is ever overwritten.
 *
 * Nothing here knows a Minecraft version: targets and their change sets arrive as arguments.
 *
 * @packageDocumentation
 */

import {
  applyMigration,
  type ChainStep,
  type InvertResult,
  invert,
  migrationChain,
  type Restored,
  runChain,
  stableStringify,
} from '@msm/core';
import type {
  Json,
  MigrationChange,
  MigrationDetail,
  MigrationReport,
  Problem,
  Project,
  ResourceLocation,
  Target,
  TargetChange,
} from '@msm/plugin-api';

/** What moving back needs of a saved move (`SavedUpgrade` of `saved-report` has it). */
export interface SavedMoveRecord {
  /** The move's folder, to name it. */
  folder?: string;
  from: { targetId: string };
  to: { targetId: string };
  /** The migration report that was applied (its reverses hold what it dropped). */
  migration: MigrationReport;
}

/** One part of the way down and the saved move that undoes it, when there is one. */
export interface MoveBackSegment {
  /** The newer end (where this part starts). */
  from: string;
  /** The older end. */
  to: string;
  /** The saved move up over this part (its folder), absent when none was found. */
  record?: string;
  /** Whether no saved move covers this part. */
  noRecord: boolean;
}

/** A change a move up made by itself that cannot be put back without its saved record. */
export interface UnrecordedChange {
  /** The newer target, whose change set holds it. */
  targetId: string;
  /** The change. */
  change: TargetChange;
  /** The things it may have touched (the elements of its kind); empty when unknown. */
  elementIds: ResourceLocation[];
}

/** {@link moveBack}'s outcome: `invert`'s, over every part of the way, with the parts. */
export interface MoveBackResult extends InvertResult {
  /** The parts of the way down, newest first, each with its saved move or none. */
  segments: MoveBackSegment[];
  /** What the parts with no saved move cannot put back. */
  unrecorded: UnrecordedChange[];
}

/** Kinds holding plain text, never searched for ids (ADR 0136 D3). */
const TEXT_KINDS: ReadonlySet<string> = new Set(['minecraft:lang']);
const NAMESPACE = 'minecraft:';
const RESOURCE = 'minecraft:resource/';
/**
 * The areas whose changes a migration makes in the project's own data; pack formats, what
 * players need and the rest follow the target and need nothing put back.
 */
const DATA_AREAS: ReadonlySet<string> = new Set(['ids', 'formats', 'block-states', 'commands']);

/** Whether a saved move went up along the targets' `previous` links. */
function wentUp(targets: readonly Target[], record: SavedMoveRecord): boolean {
  const chain = migrationChain(targets, record.from.targetId, record.to.targetId);
  return chain.ok && chain.steps[0]?.direction === 'up';
}

/**
 * The parts of a move back: from the project's target down, the newest saved move up that
 * ends at the current place and starts further down the way undoes the stretch it covers; a
 * place with no such move takes one hop with no record.
 *
 * @param targets - Every target the host knows.
 * @param steps - The down chain (`migrationChain`), in order.
 * @param saved - The saved moves, newest first.
 */
export function moveBackParts(
  targets: readonly Target[],
  steps: readonly ChainStep[],
  saved: readonly SavedMoveRecord[],
): { steps: ChainStep[]; record?: SavedMoveRecord }[] {
  const path = steps.length === 0 ? [] : [steps[0]?.from.id, ...steps.map((s) => s.to.id)];
  const parts: { steps: ChainStep[]; record?: SavedMoveRecord }[] = [];
  let at = 0;
  while (at < steps.length) {
    const here = path[at];
    let found: { record: SavedMoveRecord; end: number } | undefined;
    for (const record of saved) {
      if (record.to.targetId !== here) continue;
      const end = path.indexOf(record.from.targetId, at + 1);
      if (end === -1 || !wentUp(targets, record)) continue;
      found = { record, end };
      break;
    }
    if (found === undefined) {
      parts.push({ steps: steps.slice(at, at + 1) });
      at += 1;
    } else {
      parts.push({ steps: steps.slice(at, found.end), record: found.record });
      at = found.end;
    }
  }
  return parts;
}

/**
 * Works out moving `project` back along `steps` (ADR 0136 D7): each part undone with its saved
 * move up ({@link moveBackParts}, `invert`), or, with none, from the newer version's change set
 * ({@link invertWithoutRecord}). The parts' reports are merged into one to apply as one undo
 * step: one `update` per element with its data after the last part.
 *
 * @param project - The project as it is, on the newer target; not changed.
 * @param targets - Every target the host knows.
 * @param steps - The down chain, in order.
 * @param saved - The saved moves, newest first.
 */
export function moveBack(
  project: Project,
  targets: readonly Target[],
  steps: readonly ChainStep[],
  saved: readonly SavedMoveRecord[],
): MoveBackResult {
  const parts = moveBackParts(targets, steps, saved);
  const segments: MoveBackSegment[] = [];
  const results: InvertResult[] = [];
  const unrecorded: UnrecordedChange[] = [];
  let current = project;
  for (const part of parts) {
    const first = part.steps[0];
    const last = part.steps[part.steps.length - 1];
    if (first === undefined || last === undefined) continue;
    const run = runChain(current, part.steps);
    let result: InvertResult;
    if (part.record === undefined) {
      const without = invertWithoutRecord(run.report, part.steps, current);
      result = without;
      unrecorded.push(...without.unrecorded);
    } else {
      result = invert(run.report, part.record.migration, current);
    }
    results.push(result);
    segments.push({
      from: first.from.id,
      to: last.to.id,
      ...(part.record?.folder === undefined ? {} : { record: part.record.folder }),
      noRecord: part.record === undefined,
    });
    current = applyMigration(current, result.report, last.to.id);
  }
  const [only] = results;
  if (results.length === 1 && only !== undefined) return { ...only, segments, unrecorded };
  return { ...mergeResults(results, project, current), segments, unrecorded };
}

/** The parts' results as one: changes per element with the last data, the lists joined. */
function mergeResults(results: readonly InvertResult[], before: Project, after: Project) {
  const data = elementDataOf(after);
  const kept = elementDataOf(before);
  const changes = new Map<string, MigrationChange>();
  const problems: Problem[] = [];
  const edited = new Set<ResourceLocation>();
  for (const result of results) {
    for (const change of result.report.changes) {
      const now = data.get(change.elementId);
      if (change.kind === 'remove' || now === undefined) {
        changes.set(change.elementId, { ...change });
        continue;
      }
      if (jsonEqual(now, kept.get(change.elementId))) {
        changes.delete(change.elementId);
        continue;
      }
      changes.set(change.elementId, {
        elementId: change.elementId,
        kind: 'update',
        description: change.description,
        data: structuredClone(now),
      });
    }
    problems.push(...result.report.problems);
    for (const id of result.edited) edited.add(id);
  }
  return {
    report: { changes: [...changes.values()], problems },
    restored: results.flatMap((result) => result.restored),
    notRestored: results.flatMap((result) => result.notRestored),
    edited: [...edited],
    noRecord: results.some((result) => result.noRecord),
  };
}

/**
 * Undoes one part of the way down with no saved move: `invert` with no record (nothing put
 * back, the `upgrade.no-saved-report` warning), then each newer version's confirmed renames that
 * its migration applied by itself (`member-renamed`, handled `auto`) renamed back where the new
 * id stands as a whole string, and every other change to the project's data that migration
 * made by itself listed with the things of its kind.
 *
 * @param report - The down chain's own report for this part.
 * @param steps - The part's down hops, in order.
 * @param project - The project as it is.
 */
export function invertWithoutRecord(
  report: MigrationReport,
  steps: readonly ChainStep[],
  project: Project,
): InvertResult & { unrecorded: UnrecordedChange[] } {
  const base = invert(report, undefined, project);
  const working = new Map<string, Json>();
  const details = new Map<string, MigrationDetail[]>();
  const restored: Restored[] = [];
  const unrecorded: UnrecordedChange[] = [];
  const elements = project.namespaces.flatMap((namespace) => namespace.elements);
  for (const step of steps) {
    // The newer end's change set describes the move up over this hop.
    const set = step.from.changes;
    if (set === undefined || set.from !== step.to.id) continue;
    for (const change of set.changes) {
      if (change.handling !== 'auto' || !DATA_AREAS.has(change.area)) continue;
      const rename = renameOf(change);
      if (rename === undefined) {
        const kind = kindOfSubject(change.subject);
        unrecorded.push({
          targetId: step.from.id,
          change,
          elementIds:
            kind === undefined
              ? []
              : elements.filter((element) => element.kind === kind).map((element) => element.id),
        });
        continue;
      }
      for (const element of elements) {
        if (TEXT_KINDS.has(element.kind)) continue;
        const data = working.get(element.id) ?? element.data;
        const changed = replaceWhole(data, [], rename.after, rename.before, (path) => {
          const list = details.get(element.id) ?? [];
          list.push({
            op: 'rename-id',
            path,
            before: rename.after,
            after: rename.before,
            changeId: change.id,
          });
          details.set(element.id, list);
          restored.push({ elementId: element.id, path, op: 'undo-rename-id', changeId: change.id });
        });
        if (changed !== data) working.set(element.id, changed);
      }
    }
  }
  const changes = [...base.report.changes];
  for (const [elementId, data] of working) {
    changes.push({
      elementId: elementId as ResourceLocation,
      kind: 'update',
      description: 'Renamed back what the move to the newer version renamed.',
      data,
      details: details.get(elementId) ?? [],
    });
  }
  return {
    ...base,
    report: { ...base.report, changes },
    restored,
    unrecorded,
  };
}

/** The whole-string ids a confirmed rename wrote (`after`) and wrote over (`before`). */
function renameOf(change: TargetChange): { before: string; after: string } | undefined {
  if (change.area !== 'ids' || change.what !== 'member-renamed') return undefined;
  const registry = change.registry;
  if (registry === undefined || typeof change.to !== 'string') return undefined;
  const member =
    typeof change.from === 'string'
      ? change.from
      : change.subject.startsWith(`${registry}/`)
        ? change.subject.slice(registry.length + 1)
        : undefined;
  if (member === undefined) return undefined;
  const prefix = registry.startsWith('tag/') ? '#' : '';
  return { before: `${prefix}${NAMESPACE}${member}`, after: `${prefix}${NAMESPACE}${change.to}` };
}

/** The element kind a data format change names (`minecraft:resource/<kind>`), if any. */
function kindOfSubject(subject: string): string | undefined {
  return subject.startsWith(RESOURCE) ? `${NAMESPACE}${subject.slice(RESOURCE.length)}` : undefined;
}

/**
 * `node` with every string equal to `from` replaced by `to` (a copy only where something
 * changed); `found` is told each place.
 */
function replaceWhole(
  node: Json,
  segments: readonly (string | number)[],
  from: string,
  to: string,
  found: (path: string) => void,
): Json {
  if (typeof node === 'string') {
    if (node !== from) return node;
    found(pointer(segments));
    return to;
  }
  if (Array.isArray(node)) {
    let out: Json[] | undefined;
    node.forEach((item, index) => {
      const next = replaceWhole(item, [...segments, index], from, to, found);
      if (next !== item) {
        out ??= [...node];
        out[index] = next;
      }
    });
    return out ?? node;
  }
  if (node !== null && typeof node === 'object') {
    let out: { [key: string]: Json } | undefined;
    for (const [key, item] of Object.entries(node)) {
      const next = replaceWhole(item, [...segments, key], from, to, found);
      if (next !== item) {
        out ??= { ...node };
        out[key] = next;
      }
    }
    return out ?? node;
  }
  return node;
}

function pointer(segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

function elementDataOf(project: Project): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) out.set(element.id, element.data);
  }
  return out;
}

function jsonEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return stableStringify(a) === stableStringify(b);
}
