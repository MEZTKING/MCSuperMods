/**
 * Comparing a project before and after a move (ADR 0136 D4, B810 V11): problem identity
 * (code, element and path, with paths mapped through the migration's details), the problems a
 * move brings, and which change-set entries touch the project. Pure; no version known here.
 *
 * @packageDocumentation
 */

import type {
  Json,
  MigrationReport,
  Problem,
  ProblemSeverity,
  Project,
  ResourceLocation,
  TargetChange,
  TargetChangeSet,
} from '@msm/plugin-api';
import { parseJsonPointer, toJsonPointer } from '../commands/json-pointer';
import { isJsonObject, projectElements, valueAt } from './chain';

/**
 * A problem's identity across a move: its code, element, path and file. The message is not
 * part of it (it can carry the version), nor is the severity.
 *
 * @param problem - The problem.
 * @returns A key two problems share when they are the same problem.
 */
export function problemKey(problem: Problem): string {
  return [problem.code, problem.elementId ?? '', problem.path ?? '', problem.file ?? ''].join(
    '\u0000',
  );
}

/**
 * Where a problem found before a move sits after it: its path mapped through the migration's
 * details for its element, in order (a `move` carries the path along; a `drop` at or above the
 * path, or the element's removal, makes the problem go away).
 *
 * @param problem - A problem of the project before the move.
 * @param migration - The move's (merged) report.
 * @returns The problem at its place after the move, or undefined when the move took its place
 *   away.
 */
export function mapProblemThroughMigration(
  problem: Problem,
  migration: MigrationReport,
): Problem | undefined {
  if (problem.elementId === undefined) return problem;
  let path = problem.path;
  for (const change of migration.changes) {
    if (change.elementId !== problem.elementId) continue;
    if (change.kind === 'remove') return undefined;
    if (path === undefined) continue;
    for (const detail of change.details ?? []) {
      if (detail.op === 'drop' && isAtOrBelow(path, detail.path)) return undefined;
      if (detail.op === 'move' && detail.from !== undefined && isAtOrBelow(path, detail.from)) {
        path = detail.path + path.slice(detail.from.length);
      }
    }
  }
  return path === problem.path ? problem : { ...problem, ...(path === undefined ? {} : { path }) };
}

function isAtOrBelow(path: string, prefix: string): boolean {
  return prefix === '' || path === prefix || path.startsWith(`${prefix}/`);
}

/** Options of {@link newProblems}. */
export interface NewProblemsOptions {
  /** The severities that count; errors and warnings by default (removed ids in functions warn). */
  severities?: readonly ProblemSeverity[];
}

/**
 * The problems the moved project has that the project did not have before (B810 V11): keyed
 * by {@link problemKey}, the problems before mapped through the migration's details first, and
 * counted, so a second problem at the same place is new too.
 *
 * @param before - The project's problems on its own target.
 * @param after - The moved copy's problems on the new target.
 * @param migration - The move's report, to map paths; without it no path is mapped.
 * @param options - Which severities count.
 * @returns The new problems, in the order of `after`.
 */
export function newProblems(
  before: readonly Problem[],
  after: readonly Problem[],
  migration?: MigrationReport,
  options: NewProblemsOptions = {},
): Problem[] {
  const severities = new Set(options.severities ?? ['error', 'warning']);
  const counts = new Map<string, number>();
  for (const problem of before) {
    if (!severities.has(problem.severity)) continue;
    const mapped =
      migration === undefined ? problem : mapProblemThroughMigration(problem, migration);
    if (mapped === undefined) continue;
    const key = problemKey(mapped);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: Problem[] = [];
  for (const problem of after) {
    if (!severities.has(problem.severity)) continue;
    const key = problemKey(problem);
    const left = counts.get(key) ?? 0;
    if (left > 0) counts.set(key, left - 1);
    else out.push(problem);
  }
  return out;
}

/** One place in the project a change-set entry touches. */
export interface ChangeTouch {
  /** The target whose change set holds the change. */
  targetId: string;
  /** The {@link TargetChange.id}. */
  changeId: string;
  /** The element touched. */
  elementId: ResourceLocation;
  /** Where in its data, as an RFC 6901 pointer; absent for the whole element. */
  path?: string;
}

const NAMESPACE = 'minecraft:';
/** Kinds holding plain text, never searched for ids (ADR 0136 D3). */
const TEXT_KINDS = new Set(['minecraft:lang']);

/**
 * The places in a project that each change-set entry touches, by rules over the entry's shape
 * alone (no version fact):
 *
 * - `ids`, `member-removed` or `member-renamed`: whole strings equal to the member (bare or
 *   `minecraft:`, `#` for a `tag/` registry; only as a `type` value when the id is still in
 *   another registry);
 * - `formats` in a dispatcher (`type-removed`, `type-changed`): `type` values naming the
 *   member; for `minecraft:resource` members, the elements of that kind, and for field changes
 *   (`field-removed`, `field-retyped`, `field-madeRequired`) those holding the field, for
 *   `field-addedRequired` those lacking it;
 * - `block-states` (`property-removed`, `values-changed`): block states naming the block with
 *   that property; `default-changed`: those naming the block without it;
 * - `commands` (`root-removed`, `path-removed`): text lines starting with the command's words.
 *
 * Other entries (struct fields known only to mcdoc, packs, players, Java, vanilla files) are
 * matched by the migration's details or by the host.
 *
 * @param changeSets - The change sets of the chain's hops.
 * @param project - The project before the move.
 * @returns Every place found, one per change and place.
 */
export function matchChanges(
  changeSets: readonly TargetChangeSet[],
  project: Project,
): ChangeTouch[] {
  const out: ChangeTouch[] = [];
  const elements = projectElements(project).filter((element) => !TEXT_KINDS.has(element.kind));
  for (const set of changeSets) {
    for (const change of set.changes) {
      const add = (elementId: ResourceLocation, path?: string) => {
        out.push({
          targetId: set.to,
          changeId: change.id,
          elementId,
          ...(path === undefined ? {} : { path }),
        });
      };
      for (const element of elements) {
        for (const path of placesIn(change, element.kind, element.data)) add(element.id, path);
      }
    }
  }
  return out;
}

/** The pointers (`''` for the whole element) in one element's data a change touches. */
function placesIn(change: TargetChange, kind: string, data: Json): string[] {
  switch (change.area) {
    case 'ids':
      if (change.what !== 'member-removed' && change.what !== 'member-renamed') return [];
      return idPlaces(change, data);
    case 'formats':
      return formatPlaces(change, kind, data);
    case 'block-states':
      return blockStatePlaces(change, data);
    case 'commands':
      if (change.what !== 'root-removed' && change.what !== 'path-removed') return [];
      return commandPlaces(change.subject, data);
    default:
      return [];
  }
}

function memberOf(change: TargetChange): { registry: string; member: string } | undefined {
  const registry = change.registry;
  if (registry === undefined || !change.subject.startsWith(`${registry}/`)) return undefined;
  return { registry, member: change.subject.slice(registry.length + 1) };
}

function bareId(value: string): string | undefined {
  if (value.startsWith(NAMESPACE)) return value.slice(NAMESPACE.length);
  return value.includes(':') ? undefined : value;
}

function idPlaces(change: TargetChange, data: Json): string[] {
  const found = memberOf(change);
  if (found === undefined) return [];
  const tag = found.registry.startsWith('tag/');
  const typeOnly = (change.stillIn ?? []).length > 0;
  const out: string[] = [];
  walkStrings(data, (value, segments, key) => {
    if (tag !== value.startsWith('#')) return;
    if (typeOnly && key !== 'type') return;
    if (bareId(tag ? value.slice(1) : value) === found.member) out.push(toJsonPointer(segments));
  });
  return out;
}

function formatPlaces(change: TargetChange, kind: string, data: Json): string[] {
  const found = memberOf(change);
  if (found === undefined) return [];
  if (found.registry === `${NAMESPACE}resource`) {
    if (kind !== `${NAMESPACE}${found.member}`) return [];
    if (change.what === 'type-removed' || change.what === 'type-changed') return [''];
    if (change.field === undefined) return [];
    const field = change.field.startsWith('/') ? change.field : `/${change.field}`;
    const present = valueAt(data, parseJsonPointer(field)) !== undefined;
    if (
      change.what === 'field-removed' ||
      change.what === 'field-retyped' ||
      change.what === 'field-madeRequired'
    ) {
      return present ? [field] : [];
    }
    if (change.what === 'field-addedRequired') return present ? [] : [field];
    return [];
  }
  if (change.what !== 'type-removed' && change.what !== 'type-changed') return [];
  if (found.registry.startsWith('mcdoc:')) return [];
  const out: string[] = [];
  walkStrings(data, (value, segments, key) => {
    if (key === 'type' && bareId(value) === found.member) {
      out.push(toJsonPointer(segments.slice(0, -1)));
    }
  });
  return out;
}

function blockStatePlaces(change: TargetChange, data: Json): string[] {
  const property = change.field;
  if (property === undefined) return [];
  const wanted = change.what;
  if (
    wanted !== 'property-removed' &&
    wanted !== 'values-changed' &&
    wanted !== 'default-changed'
  ) {
    return [];
  }
  const out: string[] = [];
  const visit = (node: Json, segments: (string | number)[]): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        visit(item, [...segments, index]);
      });
      return;
    }
    if (!isJsonObject(node)) return;
    const name = node.Name;
    if (typeof name === 'string' && bareId(name) === change.subject) {
      const properties = node.Properties;
      const has = isJsonObject(properties) && Object.hasOwn(properties, property);
      if (wanted === 'default-changed' ? !has : has) {
        out.push(
          toJsonPointer(
            wanted === 'default-changed' ? segments : [...segments, 'Properties', property],
          ),
        );
      }
    }
    for (const [key, item] of Object.entries(node)) visit(item, [...segments, key]);
  };
  visit(data, []);
  return out;
}

function commandPlaces(subject: string, data: Json): string[] {
  const words: string[] = [];
  for (const word of subject.split(/\s+/)) {
    if (word === '' || word.startsWith('<')) break;
    words.push(word);
  }
  if (words.length === 0) return [];
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const pattern = new RegExp(`^\\s*/?${escaped}(\\s|$)`, 'm');
  const out: string[] = [];
  walkStrings(data, (value, segments) => {
    if (pattern.test(value)) out.push(toJsonPointer(segments));
  });
  return out;
}

function walkStrings(
  data: Json,
  visit: (value: string, segments: (string | number)[], key: string | undefined) => void,
): void {
  const walk = (node: Json, segments: (string | number)[], key: string | undefined): void => {
    if (typeof node === 'string') {
      visit(node, segments, key);
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, [...segments, index], undefined);
      });
    } else if (isJsonObject(node)) {
      for (const [name, item] of Object.entries(node)) walk(item, [...segments, name], name);
    }
  };
  walk(data, [], undefined);
}
