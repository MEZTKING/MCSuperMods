/**
 * The upgrade report model (ADR 0136 D4): six parts and the line on what does not touch the
 * mod, built from the chain's change sets, its merged migration report, the problems before
 * and after the dry run, and both targets' facts; and the After moving list's open items
 * (D6, B810 V12). Pure: no validation, lowering, files or words for the screen; the app words
 * every part from these records.
 *
 * @packageDocumentation
 */

import type {
  Json,
  MigrationDetail,
  MigrationInGameCheck,
  MigrationReport,
  Problem,
  Project,
  ResourceLocation,
  Target,
  TargetChange,
  TargetChangeArea,
  TargetChangeSet,
  TargetFacts,
} from '@msm/plugin-api';
import { parseJsonPointer } from '../commands/json-pointer';
import { elementData, jsonEqual, valueAt } from './chain';
import { type ChangeTouch, matchChanges, newProblems, problemKey } from './compare';

/** A place in the project: an element and, when known, a pointer into its data. */
export interface UpgradePlace {
  /** The element. */
  elementId: ResourceLocation;
  /** RFC 6901 pointer into its data; absent for the whole element. */
  path?: string;
}

/** Part 1: one change in Minecraft that touches the mod, named once. */
export interface UpgradeChangedItem {
  /** The target whose change set holds it. */
  targetId: string;
  /** The change-set entry. */
  change: TargetChange;
  /** Every place it touches, without repeats. */
  places: UpgradePlace[];
  /** The elements it touches, without repeats, in order of first place. */
  elementIds: ResourceLocation[];
}

/** Part 2: what the move changes in one element. */
export interface UpgradeDoneItem {
  /** The element. */
  elementId: ResourceLocation;
  /** `update` when its data changes, `remove` when it goes, `note` when only reported. */
  kind: 'update' | 'remove' | 'note';
  /** The migration's description. */
  description: string;
  /** What was done inside it, in order; empty when the hook gave no details. */
  details: MigrationDetail[];
  /** The change ids the details answer, without repeats. */
  changeIds: string[];
}

/** How an After moving item checks itself (B810 V12). */
export type UpgradeItemCheck =
  /** The same problem (code, element, path) is still reported. */
  | 'problem'
  /** The value at the element's path is still the one recorded. */
  | 'value'
  /** No check: the user ticks it. */
  | 'manual';

/** Part 3: one thing the user needs to change. */
export interface UpgradeTodoItem {
  /** Stable id within the report (from the problem's identity). */
  id: string;
  /**
   * `migration`: the migration found it and could not act; `validation`: a problem the moved
   * copy has that the project does not; `export`: the same from the export pass (`export.*`).
   */
  source: 'migration' | 'validation' | 'export';
  /** The problem. */
  problem: Problem;
  /** The change it comes from, when one is known. */
  changeId?: string;
  /** The target whose change set holds that change. */
  targetId?: string;
  /** The change's curated hint, when it has one. */
  hint?: string;
  /** How the item checks itself after the move. */
  check: UpgradeItemCheck;
  /** For `value` checks: the value at the place when the report was made. */
  value?: Json;
}

/** The rows of part 4. */
export type UpgradePlayerFact =
  | 'minecraft'
  | 'java'
  | 'resource-pack-format'
  | 'data-pack-format'
  | 'fabric-loader'
  | 'fabric-api'
  | 'runtime'
  | 'geckolib'
  | 'java-project';

/** One row of part 4: a fact before and after. */
export interface UpgradePlayerRow {
  /** Which fact. */
  fact: UpgradePlayerFact;
  /** Its value on the old target; absent when that target has none. */
  before?: string | boolean;
  /** Its value on the new target; absent when that target has none. */
  after?: string | boolean;
  /** Whether it differs. */
  changed: boolean;
}

/** Part 4: what players need. */
export interface UpgradePlayers {
  /** The facts, before and after. */
  rows: UpgradePlayerRow[];
  /** The change-set entries about packs and players (they touch every mod). */
  changes: { targetId: string; change: TargetChange }[];
  /** The new export problems that say an export cannot be made there (`export.no-*`). */
  exports: Problem[];
}

/** Part 5: what the new version adds. */
export interface UpgradeAdditions {
  /** How many additions in all. */
  total: number;
  /** The counts by kind and registry, as the change sets give them. */
  byKind: Record<string, number>;
}

/** The standing in-game checks of ADR 0136 D12; the app words them. */
export type UpgradeStandingCheck =
  /** Start the game once on the new version with the mod. */
  | 'start-game'
  /** Open or make a world (an old world cannot go back; offer a backup first). */
  | 'open-world'
  /** Look at each thing parts 2 and 3 name. */
  | 'look-at-changes';

/** Part 6: what to check in the game. */
export interface UpgradeInGame {
  /** The curated checks of the changes that touch the mod. */
  checks: MigrationInGameCheck[];
  /** The standing checks. */
  standing: UpgradeStandingCheck[];
}

/** The line on how much of Minecraft's change does not touch the mod. */
export interface UpgradeUntouched {
  /** How many change-set entries touch nothing in the mod. */
  total: number;
  /** The same by area. */
  byArea: Partial<Record<TargetChangeArea, number>>;
}

/** The upgrade report (ADR 0136 D4). */
export interface UpgradeReport {
  /** The target moved from. */
  from: { targetId: string; mcVersion: string };
  /** The target moved to. */
  to: { targetId: string; mcVersion: string };
  /** Part 1: what changed in Minecraft for this mod. */
  changed: UpgradeChangedItem[];
  /** Part 2: what MCSuperMods changes for you. */
  done: UpgradeDoneItem[];
  /** Part 3: what you need to change. */
  todo: UpgradeTodoItem[];
  /** Part 4: what your players need. */
  players: UpgradePlayers;
  /** Part 5: new in this version. */
  added: UpgradeAdditions;
  /** Part 6: what to check in the game. */
  inGame: UpgradeInGame;
  /** The seventh line: what does not touch the mod. */
  untouched: UpgradeUntouched;
}

/** The input of {@link buildUpgradeReport}. */
export interface UpgradeReportInput {
  /** The change sets of the chain's up hops, in order (empty when moving down). */
  changeSets: readonly TargetChangeSet[];
  /** The chain's merged migration report ({@link runChain}). */
  migration: MigrationReport;
  /** The project's problems on its own target (validation and export). */
  problemsBefore: readonly Problem[];
  /** The moved copy's problems on the new target (validation and export). */
  problemsAfter: readonly Problem[];
  /** The target moved from. */
  factsBefore: TargetFacts | Target;
  /** The target moved to. */
  factsAfter: TargetFacts | Target;
  /** The project before the move, to find what the change sets touch ({@link matchChanges}). */
  project?: Project;
  /** The moved copy, to record the values migration items check against. */
  moved?: Project;
  /** Places the host found itself (function and script text, vanilla files, Java). */
  touches?: readonly ChangeTouch[];
}

const PLAYER_AREAS: ReadonlySet<TargetChangeArea> = new Set(['packs', 'players']);
const EXPORT_PREFIX = 'export.';
const NO_EXPORT_PREFIX = 'export.no-';

/**
 * Builds the upgrade report (ADR 0136 D4). Part 1 holds each change-set entry that touches
 * the project once, with its places: from the migration's details, from {@link matchChanges}
 * over `project`, and from the host's `touches`. Part 2 is the migration's changes by element.
 * Part 3 is what the migration reported plus every new problem ({@link newProblems}: errors
 * and warnings, keyed by code, element and path). Part 4 compares the facts and carries the
 * pack and player entries and the `export.no-*` problems. Part 5 sums the additions. Part 6 is
 * the curated checks of the touching changes and the standing ones. Every other entry is only
 * counted, as not touching the mod.
 *
 * @param input - The dry run's results.
 * @returns The report.
 */
export function buildUpgradeReport(input: UpgradeReportInput): UpgradeReport {
  const { changeSets, migration } = input;
  const lookup = new Map<string, { targetId: string; change: TargetChange }>();
  for (const set of changeSets) {
    for (const change of set.changes) {
      if (!lookup.has(change.id)) lookup.set(change.id, { targetId: set.to, change });
    }
  }

  // Every place each change touches.
  const touches: ChangeTouch[] = [];
  for (const change of migration.changes) {
    for (const detail of change.details ?? []) {
      const found = lookup.get(detail.changeId);
      if (found === undefined) continue;
      touches.push({
        targetId: found.targetId,
        changeId: detail.changeId,
        elementId: change.elementId,
        path: detail.op === 'move' && detail.from !== undefined ? detail.from : detail.path,
      });
    }
  }
  if (input.project !== undefined) touches.push(...matchChanges(changeSets, input.project));
  touches.push(...(input.touches ?? []));

  const changedByKey = new Map<string, UpgradeChangedItem>();
  const seenPlaces = new Set<string>();
  for (const touch of touches) {
    const key = `${touch.targetId}\u0000${touch.changeId}`;
    let item = changedByKey.get(key);
    if (item === undefined) {
      const found = lookup.get(touch.changeId);
      const change =
        found?.targetId === touch.targetId
          ? found.change
          : changeSets
              .find((set) => set.to === touch.targetId)
              ?.changes.find((entry) => entry.id === touch.changeId);
      if (change === undefined || PLAYER_AREAS.has(change.area)) continue;
      item = { targetId: touch.targetId, change, places: [], elementIds: [] };
      changedByKey.set(key, item);
    }
    const placeKey = `${key}\u0000${touch.elementId}\u0000${touch.path ?? ''}`;
    if (seenPlaces.has(placeKey)) continue;
    seenPlaces.add(placeKey);
    item.places.push({
      elementId: touch.elementId,
      ...(touch.path === undefined ? {} : { path: touch.path }),
    });
    if (!item.elementIds.includes(touch.elementId)) item.elementIds.push(touch.elementId);
  }
  const changed = [...changedByKey.values()].sort(
    (a, b) => compareText(a.targetId, b.targetId) || compareText(a.change.id, b.change.id),
  );

  // Part 2.
  const done: UpgradeDoneItem[] = migration.changes.map((change) => {
    const details = structuredClone(change.details ?? []);
    return {
      elementId: change.elementId,
      kind: change.kind === 'remove' ? 'remove' : change.data !== undefined ? 'update' : 'note',
      description: change.description,
      details,
      changeIds: [...new Set(details.map((detail) => detail.changeId))],
    };
  });

  // Part 3.
  const placeOwner = new Map<string, string>();
  for (const touch of touches) {
    const key = `${touch.elementId}\u0000${touch.path ?? ''}`;
    if (!placeOwner.has(key)) placeOwner.set(key, `${touch.targetId}\u0000${touch.changeId}`);
  }
  const movedData = input.moved === undefined ? undefined : elementData(input.moved);
  const beforeData = input.project === undefined ? undefined : elementData(input.project);
  const ids = new Map<string, number>();
  const makeId = (problem: Problem): string => {
    const base = problemKey(problem);
    const count = ids.get(base) ?? 0;
    ids.set(base, count + 1);
    return count === 0 ? `todo:${base}` : `todo:${base}\u0000${count}`;
  };
  const todo: UpgradeTodoItem[] = [];
  for (const problem of migration.problems) {
    const item: UpgradeTodoItem = {
      id: makeId(problem),
      source: 'migration',
      problem: structuredClone(problem),
      check: 'manual',
    };
    if (problem.elementId !== undefined) {
      const owner = placeOwner.get(`${problem.elementId}\u0000${problem.path ?? ''}`);
      if (owner !== undefined) {
        const [targetId, changeId] = owner.split('\u0000') as [string, string];
        const change = changedByKey.get(owner)?.change;
        item.changeId = changeId;
        item.targetId = targetId;
        if (change?.hint !== undefined) item.hint = change.hint;
      }
      if (problem.path !== undefined) {
        const data = movedData?.get(problem.elementId) ?? beforeData?.get(problem.elementId);
        const value = data === undefined ? undefined : safeValueAt(data, problem.path);
        if (value !== undefined) {
          item.check = 'value';
          item.value = structuredClone(value);
        }
      }
    }
    todo.push(item);
  }
  const fresh = newProblems(input.problemsBefore, input.problemsAfter, migration);
  for (const problem of fresh) {
    const item: UpgradeTodoItem = {
      id: makeId(problem),
      source: problem.code.startsWith(EXPORT_PREFIX) ? 'export' : 'validation',
      problem: structuredClone(problem),
      check: 'problem',
    };
    if (problem.elementId !== undefined) {
      const owner = placeOwner.get(`${problem.elementId}\u0000${problem.path ?? ''}`);
      if (owner !== undefined) {
        const [targetId, changeId] = owner.split('\u0000') as [string, string];
        item.changeId = changeId;
        item.targetId = targetId;
        const hint = changedByKey.get(owner)?.change.hint;
        if (hint !== undefined) item.hint = hint;
      }
    }
    todo.push(item);
  }

  // Part 4.
  const playerChanges: { targetId: string; change: TargetChange }[] = [];
  for (const set of changeSets) {
    for (const change of set.changes) {
      if (PLAYER_AREAS.has(change.area)) playerChanges.push({ targetId: set.to, change });
    }
  }
  const players: UpgradePlayers = {
    rows: playerRows(input.factsBefore, input.factsAfter),
    changes: playerChanges,
    exports: fresh.filter((problem) => problem.code.startsWith(NO_EXPORT_PREFIX)),
  };

  // Part 5.
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const set of changeSets) {
    for (const [kind, count] of Object.entries(set.additions)) {
      byKind[kind] = (byKind[kind] ?? 0) + count;
      total += count;
    }
  }

  // Part 6.
  const checks = new Map<string, MigrationInGameCheck>();
  for (const check of migration.inGameChecks ?? []) {
    checks.set(check.changeId, structuredClone(check));
  }
  for (const item of changed) {
    if (item.change.inGameCheck === undefined) continue;
    const known = checks.get(item.change.id);
    if (known === undefined) {
      checks.set(item.change.id, {
        changeId: item.change.id,
        check: item.change.inGameCheck,
        elementIds: [...item.elementIds],
      });
    } else {
      known.elementIds = [...new Set([...(known.elementIds ?? []), ...item.elementIds])];
    }
  }
  const standing: UpgradeStandingCheck[] = ['start-game', 'open-world'];
  if (done.length > 0 || todo.length > 0) standing.push('look-at-changes');

  // The seventh line.
  const byArea: Partial<Record<TargetChangeArea, number>> = {};
  let untouched = 0;
  for (const set of changeSets) {
    for (const change of set.changes) {
      if (PLAYER_AREAS.has(change.area)) continue;
      if (changedByKey.has(`${set.to}\u0000${change.id}`)) continue;
      byArea[change.area] = (byArea[change.area] ?? 0) + 1;
      untouched++;
    }
  }

  return {
    from: { targetId: input.factsBefore.id, mcVersion: input.factsBefore.mcVersion },
    to: { targetId: input.factsAfter.id, mcVersion: input.factsAfter.mcVersion },
    changed,
    done,
    todo,
    players,
    added: { total, byKind },
    inGame: { checks: [...checks.values()], standing },
    untouched: { total: untouched, byArea },
  };
}

function playerRows(before: TargetFacts | Target, after: TargetFacts | Target): UpgradePlayerRow[] {
  const format = (value: { major: number; minor: number }) =>
    value.minor === 0 ? String(value.major) : `${value.major}.${value.minor}`;
  const javaProject = (facts: TargetFacts | Target): boolean =>
    'javaProject' in facts
      ? facts.javaProject !== undefined || facts.loadJavaProject !== undefined
      : false;
  const rows: [UpgradePlayerFact, string | boolean | undefined, string | boolean | undefined][] = [
    ['minecraft', before.mcVersion, after.mcVersion],
    ['java', String(before.java), String(after.java)],
    [
      'resource-pack-format',
      format(before.packFormats.resource),
      format(after.packFormats.resource),
    ],
    ['data-pack-format', format(before.packFormats.data), format(after.packFormats.data)],
    ['fabric-loader', before.fabric?.loader, after.fabric?.loader],
    ['fabric-api', before.fabric?.api, after.fabric?.api],
    ['runtime', before.mcVersion, after.mcVersion],
    ['geckolib', before.geckolib?.version, after.geckolib?.version],
    ['java-project', javaProject(before), javaProject(after)],
  ];
  return rows.map(([fact, a, b]) => ({
    fact,
    ...(a === undefined ? {} : { before: a }),
    ...(b === undefined ? {} : { after: b }),
    changed: a !== b,
  }));
}

/**
 * The After moving list (ADR 0136 D6, B810 V12): the part 3 items still open in the project as
 * it is now. A `problem` item is open while a current problem has its identity; a `value` item
 * while its element exists and still holds the recorded value at its place (or the problem is
 * still reported); a `manual` item until the user ticks it.
 *
 * @param report - The report saved with the move.
 * @param currentProblems - The project's problems now (validation and export).
 * @param project - The project now.
 * @param ticked - Ids of the items the user ticked.
 * @returns The open items, in the report's order.
 */
export function openItems(
  report: UpgradeReport,
  currentProblems: readonly Problem[],
  project: Project,
  ticked: ReadonlySet<string> = new Set(),
): UpgradeTodoItem[] {
  const current = new Set(currentProblems.map(problemKey));
  const data = elementData(project);
  return report.todo.filter((item) => {
    switch (item.check) {
      case 'problem':
        return current.has(problemKey(item.problem));
      case 'value': {
        if (current.has(problemKey(item.problem))) return true;
        const elementId = item.problem.elementId;
        const path = item.problem.path;
        if (elementId === undefined || path === undefined) return false;
        const now = data.get(elementId);
        if (now === undefined) return false;
        return jsonEqual(safeValueAt(now, path), item.value);
      }
      default:
        return !ticked.has(item.id);
    }
  });
}

function safeValueAt(data: Json, path: string): Json | undefined {
  try {
    return valueAt(data, parseJsonPointer(path));
  } catch {
    return undefined;
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
