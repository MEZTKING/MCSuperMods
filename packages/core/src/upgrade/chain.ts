/**
 * Moving a project across Minecraft versions (ADR 0136 D3, D7): the path of targets between two
 * versions, running each target's migration in order on an in-memory copy and merging the
 * reports, and the inverse for moving back. Pure: targets arrive as arguments, nothing here
 * knows a version.
 *
 * @packageDocumentation
 */

import type {
  Element,
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
} from '@msm/plugin-api';
import { parseJsonPointer } from '../commands/json-pointer';
import { stableStringify } from '../serialise/stable-json';

/** Problem codes of the upgrade helpers. */
export const UpgradeProblemCodes = Object.freeze({
  /** A value a move dropped or changed could not be put back. */
  notRestored: 'upgrade.not-restored',
  /** An element was edited after the move it is being moved back from. */
  editedSinceMove: 'upgrade.edited-since-move',
  /** Moving back without the saved report of the move up: nothing can be put back. */
  noSavedReport: 'upgrade.no-saved-report',
});

/** One hop of a {@link MigrationChain}. */
export interface ChainStep {
  /** The target the project is on before this hop. */
  from: Target;
  /** The target the project is on after this hop. */
  to: Target;
  /**
   * `up` when `to` follows `from` (`to.previous === from.id`): the hop runs `to.migrateFrom`.
   * `down` when moving back: nothing runs, {@link invert} puts values back from a saved report.
   */
  direction: 'up' | 'down';
}

/** The path between two targets, or why there is none. */
export type MigrationChain =
  | { ok: true; steps: ChainStep[] }
  | { ok: false; reason: 'unknown-target'; targetId: string }
  | { ok: false; reason: 'no-path' };

/**
 * The targets a project passes through on its way from `fromId` to `toId`, following the
 * targets' `previous` links up (to a newer target) or down (to an older one). A target and
 * itself give an empty chain. Targets on different branches (neither follows the other) have
 * no path.
 *
 * @param targets - Every target the host knows.
 * @param fromId - The target the project is on.
 * @param toId - The target to move to.
 * @returns The hops in order, or the reason there is no path.
 */
export function migrationChain(
  targets: readonly Target[],
  fromId: string,
  toId: string,
): MigrationChain {
  const byId = new Map(targets.map((target) => [target.id, target]));
  const from = byId.get(fromId);
  if (from === undefined) return { ok: false, reason: 'unknown-target', targetId: fromId };
  const to = byId.get(toId);
  if (to === undefined) return { ok: false, reason: 'unknown-target', targetId: toId };
  if (fromId === toId) return { ok: true, steps: [] };
  const up = ancestry(byId, to, fromId);
  if (up !== undefined) {
    const path = [...up].reverse();
    return {
      ok: true,
      steps: path.slice(1).map((target, index) => ({
        from: path[index] as Target,
        to: target,
        direction: 'up' as const,
      })),
    };
  }
  const down = ancestry(byId, from, toId);
  if (down !== undefined) {
    return {
      ok: true,
      steps: down.slice(1).map((target, index) => ({
        from: down[index] as Target,
        to: target,
        direction: 'down' as const,
      })),
    };
  }
  return { ok: false, reason: 'no-path' };
}

/** `start` and its `previous` targets up to and including `stopId`, or undefined. */
function ancestry(
  byId: ReadonlyMap<string, Target>,
  start: Target,
  stopId: string,
): Target[] | undefined {
  const path: Target[] = [start];
  const seen = new Set([start.id]);
  let current = start;
  while (current.previous !== undefined) {
    const next = byId.get(current.previous);
    if (next === undefined || seen.has(next.id)) return undefined;
    path.push(next);
    seen.add(next.id);
    if (next.id === stopId) return path;
    current = next;
  }
  return undefined;
}

/** One hop's own report, as {@link runChain} ran it. */
export interface ChainHop {
  /** The target id before the hop. */
  from: string;
  /** The target id after the hop. */
  to: string;
  /** Whether the hop moved up or down. */
  direction: 'up' | 'down';
  /** What the hop's migration returned (empty for a down hop or a target without a hook). */
  report: MigrationReport;
}

/** The outcome of {@link runChain}. */
export interface ChainRun {
  /** The moved copy: every change applied, `targets` set to the last hop's target. */
  project: Project;
  /**
   * One report for the whole chain: one change per element (its last data, its details in the
   * order the hops made them), every hop's problems and in-game checks, and every dropped value
   * as a reverse whose `afterHash` is {@link elementDataHash} of the element's data in the moved
   * copy.
   */
  report: MigrationReport;
  /** Each hop's own report, in order. */
  hops: ChainHop[];
}

/**
 * Runs a chain on an in-memory copy (ADR 0136 D3): each up hop's `to.migrateFrom(from, copy)`,
 * its changes applied before the next hop, and the reports merged so the host applies them as
 * one undo step. Down hops run nothing (moving back goes through {@link invert}). `project` is
 * not changed.
 *
 * @param project - The project on the chain's first target.
 * @param steps - The hops, from {@link migrationChain}.
 * @returns The moved copy, the merged report and each hop's report.
 */
export function runChain(project: Project, steps: readonly ChainStep[]): ChainRun {
  let copy = cloneProject(project);
  const hops: ChainHop[] = [];
  for (const step of steps) {
    const own =
      step.direction === 'up' && step.to.migrateFrom !== undefined
        ? step.to.migrateFrom(step.from, { ...copy, targets: [step.from.id] })
        : { changes: [], problems: [] };
    const report = structuredClone(own);
    hops.push({ from: step.from.id, to: step.to.id, direction: step.direction, report });
    copy = applyMigration(copy, report, step.to.id);
  }
  return {
    project: copy,
    report: mergeReports(
      hops.map((hop) => hop.report),
      copy,
    ),
    hops,
  };
}

/**
 * Applies a migration report to a copy of `project`, as the host applies it in one undo step:
 * an `update` change with `data` replaces its element's data, a `remove` change deletes the
 * element, and changes for elements the project does not have are skipped.
 *
 * @param project - The project; not changed.
 * @param report - The report to apply.
 * @param targetId - When given, the copy's `targets` become `[targetId]`.
 * @returns The changed copy.
 */
export function applyMigration(
  project: Project,
  report: MigrationReport,
  targetId?: string,
): Project {
  const copy = cloneProject(project);
  if (targetId !== undefined) copy.targets = [targetId];
  const updates = new Map<string, Json>();
  const removes = new Set<string>();
  for (const change of report.changes) {
    if (change.kind === 'remove') removes.add(change.elementId);
    else if (change.data !== undefined) updates.set(change.elementId, change.data);
  }
  for (const namespace of copy.namespaces) {
    namespace.elements = namespace.elements.filter((element) => !removes.has(element.id));
    for (const element of namespace.elements) {
      const data = updates.get(element.id);
      if (data !== undefined) element.data = structuredClone(data);
    }
  }
  return copy;
}

/** Merges hop reports into one; `moved` is the project after the last hop. */
function mergeReports(reports: readonly MigrationReport[], moved: Project): MigrationReport {
  const merged = new Map<string, MigrationChange>();
  const problems: Problem[] = [];
  const checks = new Map<string, MigrationInGameCheck>();
  const reverses: MigrationReverse[] = [];
  for (const report of reports) {
    for (const change of report.changes) {
      const known = merged.get(change.elementId);
      if (known === undefined) {
        merged.set(change.elementId, structuredClone(change));
        continue;
      }
      known.description = `${known.description} ${change.description}`.trim();
      if (change.kind === 'remove') {
        known.kind = 'remove';
        delete known.data;
      } else if (change.data !== undefined && known.kind !== 'remove') {
        known.data = structuredClone(change.data);
        known.kind = 'update';
      }
      if (change.details !== undefined) {
        known.details = [...(known.details ?? []), ...structuredClone(change.details)];
      }
    }
    problems.push(...structuredClone(report.problems));
    for (const check of report.inGameChecks ?? []) {
      const known = checks.get(check.changeId);
      if (known === undefined) {
        checks.set(check.changeId, structuredClone(check));
      } else if (check.elementIds !== undefined) {
        known.elementIds = [...new Set([...(known.elementIds ?? []), ...check.elementIds])];
      }
    }
    reverses.push(...reversesOf(report));
  }
  const after = elementData(moved);
  const result: MigrationReport = { changes: [...merged.values()], problems };
  if (checks.size > 0) result.inGameChecks = [...checks.values()];
  if (reverses.length > 0) {
    result.reverses = reverses.map((reverse) => {
      const data = after.get(reverse.elementId);
      return { ...reverse, afterHash: data === undefined ? '' : elementDataHash(data) };
    });
  }
  return result;
}

/** A report's reverses, plus one for each `drop` detail with a `before` that has none. */
function reversesOf(report: MigrationReport): MigrationReverse[] {
  const out = structuredClone(report.reverses ?? []);
  const has = new Set(out.map((reverse) => `${reverse.elementId}\u0000${reverse.path}`));
  for (const change of report.changes) {
    for (const detail of change.details ?? []) {
      if (detail.op !== 'drop' || detail.before === undefined) continue;
      const key = `${change.elementId}\u0000${detail.path}`;
      if (has.has(key)) continue;
      has.add(key);
      out.push({
        elementId: change.elementId,
        path: detail.path,
        value: structuredClone(detail.before),
        afterHash: '',
      });
    }
  }
  return out;
}

/**
 * The hash {@link MigrationReverse.afterHash} holds: of the element's data in its stable
 * serialisation, so key order does not matter. One function writes and checks it.
 *
 * @param data - An element's data.
 * @returns 16 lower-case hex characters.
 */
export function elementDataHash(data: Json): string {
  const text = stableStringify(data);
  // Two 32-bit FNV-1a passes with different offsets: no crypto API is needed in the renderer.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x01000193) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Why a value was not put back by {@link invert}. */
export type NotRestoredReason =
  /** The element no longer exists. */
  | 'element-gone'
  /** The move up removed the element; its data is not in the saved report. */
  | 'removed'
  /** The object that held the value no longer exists. */
  | 'parent-gone'
  /** Something else is at the value's place now. */
  | 'place-taken'
  /** The value the move wrote was changed since, so the step is not undone. */
  | 'changed-since';

/** A value {@link invert} did not put back. */
export interface NotRestored {
  /** The element. */
  elementId: ResourceLocation;
  /** Where, as an RFC 6901 pointer into its data; absent for a whole element. */
  path?: string;
  /** Why not. */
  reason: NotRestoredReason;
  /** The change the value came from, when known. */
  changeId?: string;
}

/** A value {@link invert} put back or a step it undid. */
export interface Restored {
  /** The element. */
  elementId: ResourceLocation;
  /** Where, as an RFC 6901 pointer into its data. */
  path: string;
  /** What was done: a dropped value put back, or a step undone. */
  op: 'put-back' | 'undo-rename-id' | 'undo-move' | 'undo-set';
  /** The change the step answered, when known. */
  changeId?: string;
}

/** The outcome of {@link invert}. */
export interface InvertResult {
  /**
   * The report to apply for the move back: the down chain's own changes, then one `update` per
   * element with something put back; its problems are the down chain's plus one per value not
   * put back and per element edited since the move.
   */
  report: MigrationReport;
  /** Every value put back and step undone. */
  restored: Restored[];
  /** Every value not put back, with the reason. */
  notRestored: NotRestored[];
  /** Elements whose data changed after the move up (their hash differs from the saved one). */
  edited: ResourceLocation[];
  /** Whether there was no saved report to work from. */
  noRecord: boolean;
}

/**
 * Works out moving back (ADR 0136 D7): the inverse of each step the saved report of the move
 * up records (a renamed id renamed back, a moved value moved back, a set field unset), and
 * every value the move dropped put back from the saved reverses. A value goes back only when
 * the element exists, its parent object exists and the key is absent; a step is undone only
 * when the value is still as the move left it. Everything else is listed, never overwritten.
 * The steps are undone last first, across hops.
 *
 * @param report - The down chain's own report ({@link runChain} over the down hops; usually
 *   empty).
 * @param savedReport - The merged report of the move up, as saved beside the kept copy; absent
 *   when the move up predates saved reports, in which case nothing is put back.
 * @param project - The project as it is now, on the newer target.
 * @returns The report to apply and what was and was not put back.
 */
export function invert(
  report: MigrationReport,
  savedReport: MigrationReport | undefined,
  project: Project,
): InvertResult {
  const base = structuredClone(report);
  if (savedReport === undefined) {
    return {
      report: {
        ...base,
        problems: [
          ...base.problems,
          {
            severity: 'warning',
            code: UpgradeProblemCodes.noSavedReport,
            message:
              'There is no saved record of the move to this version, so nothing it dropped can be put back.',
          },
        ],
      },
      restored: [],
      notRestored: [],
      edited: [],
      noRecord: true,
    };
  }
  const current = elementData(applyMigration(project, base));
  const working = new Map<string, Json>();
  const restored: Restored[] = [];
  const notRestored: NotRestored[] = [];
  const reverses = new Map<string, MigrationReverse>();
  for (const reverse of savedReport.reverses ?? []) {
    reverses.set(`${reverse.elementId}\u0000${reverse.path}`, reverse);
  }
  const usedReverses = new Set<string>();

  const edited = new Set<ResourceLocation>();
  for (const reverse of savedReport.reverses ?? []) {
    const data = current.get(reverse.elementId);
    if (data !== undefined && reverse.afterHash !== '') {
      if (elementDataHash(data) !== reverse.afterHash) edited.add(reverse.elementId);
    }
  }

  const dataFor = (elementId: string): Json | undefined => {
    if (working.has(elementId)) return working.get(elementId);
    const data = current.get(elementId);
    if (data === undefined) return undefined;
    const copy = structuredClone(data);
    working.set(elementId, copy);
    return copy;
  };
  const putBack = (elementId: ResourceLocation, path: string, value: Json, changeId?: string) => {
    const data = dataFor(elementId);
    if (data === undefined) {
      notRestored.push(withChange({ elementId, path, reason: 'element-gone' }, changeId));
      return;
    }
    const placed = placeValue(data, path, value);
    if (placed === 'ok') restored.push(withChange({ elementId, path, op: 'put-back' }, changeId));
    else notRestored.push(withChange({ elementId, path, reason: placed }, changeId));
  };

  const changes = [...savedReport.changes].reverse();
  for (const change of changes) {
    if (change.kind === 'remove') {
      notRestored.push({ elementId: change.elementId, reason: 'removed' });
      continue;
    }
    const details = [...(change.details ?? [])].reverse();
    for (const detail of details) {
      if (detail.op === 'drop') {
        const key = `${change.elementId}\u0000${detail.path}`;
        const reverse = reverses.get(key);
        const value = reverse?.value ?? detail.before;
        if (reverse !== undefined) usedReverses.add(key);
        if (value === undefined) continue;
        putBack(change.elementId, detail.path, value, detail.changeId);
        continue;
      }
      const data = dataFor(change.elementId);
      if (data === undefined) {
        notRestored.push({
          elementId: change.elementId,
          path: detail.path,
          reason: 'element-gone',
          changeId: detail.changeId,
        });
        continue;
      }
      const outcome = undoStep(data, detail);
      if (outcome === 'ok') {
        restored.push({
          elementId: change.elementId,
          path: detail.op === 'move' && detail.from !== undefined ? detail.from : detail.path,
          op: `undo-${detail.op}`,
          changeId: detail.changeId,
        });
      } else {
        notRestored.push({
          elementId: change.elementId,
          path: detail.path,
          reason: outcome,
          changeId: detail.changeId,
        });
      }
    }
  }
  // Reverses a hook gave without a matching `drop` detail.
  for (const reverse of [...(savedReport.reverses ?? [])].reverse()) {
    const key = `${reverse.elementId}\u0000${reverse.path}`;
    if (usedReverses.has(key)) continue;
    if (savedReport.changes.some((c) => c.elementId === reverse.elementId && c.kind === 'remove')) {
      continue;
    }
    putBack(reverse.elementId, reverse.path, reverse.value);
  }

  const touched = new Set([...restored.map((entry) => entry.elementId)]);
  const backChanges = [...base.changes];
  const byElement = new Map(backChanges.map((change) => [change.elementId, change]));
  for (const elementId of touched) {
    const data = working.get(elementId);
    if (data === undefined) continue;
    const existing = byElement.get(elementId);
    if (existing !== undefined && existing.kind !== 'remove') {
      existing.data = structuredClone(data);
      existing.kind = 'update';
    } else if (existing === undefined) {
      backChanges.push({
        elementId,
        kind: 'update',
        description: 'Put back what the move to the newer version changed.',
        data: structuredClone(data),
      });
    }
  }
  const problems: Problem[] = [...base.problems];
  for (const entry of notRestored) {
    problems.push({
      severity: 'warning',
      code: UpgradeProblemCodes.notRestored,
      message: notRestoredMessage(entry.reason),
      elementId: entry.elementId,
      ...(entry.path === undefined ? {} : { path: entry.path }),
    });
  }
  for (const elementId of edited) {
    problems.push({
      severity: 'info',
      code: UpgradeProblemCodes.editedSinceMove,
      message: 'This was changed after the move; check it once it is moved back.',
      elementId,
    });
  }
  return {
    report: { ...base, changes: backChanges, problems },
    restored,
    notRestored,
    edited: [...edited],
    noRecord: false,
  };
}

function withChange<T extends object>(entry: T, changeId: string | undefined): T {
  return changeId === undefined ? entry : { ...entry, changeId };
}

function notRestoredMessage(reason: NotRestoredReason): string {
  switch (reason) {
    case 'element-gone':
      return 'Not put back: this thing no longer exists.';
    case 'removed':
      return 'Not put back: the move removed this thing and did not keep it.';
    case 'parent-gone':
      return 'Not put back: the part that held this value no longer exists.';
    case 'place-taken':
      return 'Not put back: something else is in its place now.';
    case 'changed-since':
      return 'Not undone: the value was changed after the move.';
  }
}

/** Undoes one non-drop step in place; `data` is a working copy. */
function undoStep(data: Json, detail: MigrationDetail): 'ok' | NotRestoredReason {
  const segments = parseJsonPointer(detail.path);
  const now = valueAt(data, segments);
  switch (detail.op) {
    case 'rename-id':
    case 'set': {
      if (detail.after !== undefined && !jsonEqual(now, detail.after)) {
        return now === undefined ? 'parent-gone' : 'changed-since';
      }
      if (detail.before === undefined) {
        return removeValue(data, segments) ? 'ok' : 'parent-gone';
      }
      return replaceValue(data, segments, structuredClone(detail.before)) ? 'ok' : 'parent-gone';
    }
    case 'move': {
      if (detail.from === undefined) return 'changed-since';
      if (now === undefined) return 'parent-gone';
      if (detail.after !== undefined && !jsonEqual(now, detail.after)) return 'changed-since';
      const value = structuredClone(now);
      const placed = placeValue(data, detail.from, detail.before ?? value);
      if (placed !== 'ok') return placed;
      removeValue(data, segments);
      return 'ok';
    }
    case 'drop':
      return 'ok';
  }
}

type JsonObject = { [key: string]: Json };

/** Whether a value is a plain JSON object. */
export function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at pointer segments, or undefined. */
export function valueAt(root: Json, segments: readonly string[]): Json | undefined {
  let node: Json | undefined = root;
  for (const segment of segments) {
    if (Array.isArray(node)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return undefined;
      node = node[Number(segment)];
    } else if (isJsonObject(node)) {
      node = Object.hasOwn(node, segment) ? node[segment] : undefined;
    } else {
      return undefined;
    }
  }
  return node;
}

/** Deep equality of two JSON values (object key order ignored). */
export function jsonEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (isJsonObject(a)) {
    if (!isJsonObject(b)) return false;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
    );
  }
  return false;
}

/** Puts `value` at `path` when the parent object exists and the key is absent. */
function placeValue(data: Json, path: string, value: Json): 'ok' | 'parent-gone' | 'place-taken' {
  const segments = parseJsonPointer(path);
  if (segments.length === 0) return 'place-taken';
  const parent = valueAt(data, segments.slice(0, -1));
  const key = segments[segments.length - 1] as string;
  if (!isJsonObject(parent)) return 'parent-gone';
  if (Object.hasOwn(parent, key)) return 'place-taken';
  parent[key] = structuredClone(value);
  return 'ok';
}

function replaceValue(data: Json, segments: readonly string[], value: Json): boolean {
  if (segments.length === 0) return false;
  const parent = valueAt(data, segments.slice(0, -1));
  const key = segments[segments.length - 1] as string;
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) return false;
    parent[index] = value;
    return true;
  }
  if (!isJsonObject(parent)) return false;
  parent[key] = value;
  return true;
}

function removeValue(data: Json, segments: readonly string[]): boolean {
  if (segments.length === 0) return false;
  const parent = valueAt(data, segments.slice(0, -1));
  const key = segments[segments.length - 1] as string;
  if (!isJsonObject(parent) || !Object.hasOwn(parent, key)) return false;
  delete parent[key];
  return true;
}

/** Every element's data by id. */
export function elementData(project: Project): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) out.set(element.id, element.data);
  }
  return out;
}

/** Every element of a project, in order. */
export function projectElements(project: Project): Element[] {
  return project.namespaces.flatMap((namespace) => namespace.elements);
}

function cloneProject(project: Project): Project {
  return structuredClone(project);
}
