/**
 * `migrateFrom` of this target (ADR 0037 D3): moving a project from `mc-26.3` reports every
 * id that the 26.4 registries no longer have and applies known renames whose replacement takes
 * the same fields. Pure: the project is never changed; the host applies the report.
 */
import type {
  Json,
  MigrationChange,
  MigrationReport,
  Problem,
  Project,
  ResourceLocation,
  Target,
} from '@msm/plugin-api';
import {
  KNOWN_RENAMES,
  type KnownRename,
  MOVED_REGISTRIES,
  REMOVED_IDS,
  STILL_REGISTERED_ELSEWHERE,
} from './removed-ids';

/** The problem codes this hook reports (fixed in the Phase 7 plan). */
export const MigrationProblemCodes = Object.freeze({
  removedId: 'target.removed-id',
  noMigrationPath: 'target.no-migration-path',
});

/** The data a migration hook is built from; the defaults are this target's tables. */
export interface MigrationTables {
  /** The target id this hook migrates from. */
  fromTargetId: string;
  /** This target's id; a project already on it needs nothing. */
  toTargetId: string;
  /** This target's Minecraft version, for messages. */
  toVersion: string;
  removed: Readonly<Record<string, readonly string[]>>;
  moved: Readonly<Record<string, string>>;
  stillRegistered: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  renames: readonly KnownRename[];
}

interface RemovedEntry {
  registry: string;
  /** A tag registry (`tag/<registry>`): matched only by `#` references. */
  tag: boolean;
  /** Still an id elsewhere: matched only as the value of a `type` field. */
  typeOnly: boolean;
  rename: KnownRename | undefined;
}

const NAMESPACE = 'minecraft:';

/** RFC 6901 pointer of `segments`. */
function pointer(segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`)
    .join('');
}

function buildLookup(tables: MigrationTables): Map<string, RemovedEntry[]> {
  const lookup = new Map<string, RemovedEntry[]>();
  for (const [registry, ids] of Object.entries(tables.removed)) {
    if (registry in tables.moved) continue;
    for (const id of ids) {
      const entry: RemovedEntry = {
        registry,
        tag: registry.startsWith('tag/'),
        typeOnly: tables.stillRegistered[registry]?.[id] !== undefined,
        rename: tables.renames.find((rename) => rename.registry === registry && rename.from === id),
      };
      lookup.set(id, [...(lookup.get(id) ?? []), entry]);
    }
  }
  return lookup;
}

interface Match {
  segments: (string | number)[];
  value: string;
  entry: RemovedEntry;
}

/** Every string in `data` that names a removed id, depth first in document order. */
function findRemoved(data: Json, lookup: Map<string, RemovedEntry[]>): Match[] {
  const matches: Match[] = [];
  const visit = (value: Json, segments: (string | number)[], key: string | undefined): void => {
    if (typeof value === 'string') {
      const tag = value.startsWith('#');
      let id = tag ? value.slice(1) : value;
      if (id.startsWith(NAMESPACE)) id = id.slice(NAMESPACE.length);
      else if (id.includes(':')) return;
      for (const entry of lookup.get(id) ?? []) {
        if (entry.tag !== tag) continue;
        if (entry.typeOnly && key !== 'type') continue;
        matches.push({ segments, value, entry });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...segments, index], undefined);
      });
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [name, item] of Object.entries(value)) {
        if (item !== undefined) visit(item, [...segments, name], name);
      }
    }
  };
  visit(data, [], undefined);
  return matches;
}

/** Replaces the value at `segments` inside `root` (a clone the caller owns). */
function replaceAt(root: Json, segments: readonly (string | number)[], value: Json): Json {
  if (segments.length === 0) return value;
  let node = root as Record<string | number, Json>;
  for (const segment of segments.slice(0, -1)) node = node[segment] as Record<string, Json>;
  node[segments[segments.length - 1] as string | number] = value;
  return root;
}

/** Builds a `migrateFrom` hook over `tables`. */
export function createMigrateFrom(
  tables: MigrationTables,
): (previous: Target, project: Project) => MigrationReport {
  const lookup = buildLookup(tables);
  return (previous, project) => {
    if (previous.id === tables.toTargetId) return { changes: [], problems: [] };
    if (previous.id !== tables.fromTargetId) {
      return {
        changes: [],
        problems: [
          {
            severity: 'warning',
            code: MigrationProblemCodes.noMigrationPath,
            message: `There is no migration from ${previous.id} to ${tables.toTargetId}; check the project's elements after the switch.`,
          },
        ],
      };
    }
    const changes: MigrationChange[] = [];
    const problems: Problem[] = [];
    for (const namespace of project.namespaces) {
      for (const element of namespace.elements) {
        const matches = findRemoved(element.data, lookup);
        let data: Json | undefined;
        const renamed: string[] = [];
        for (const match of matches) {
          const { entry } = match;
          const prefix = entry.tag ? '#' : '';
          const id = match.value.slice(prefix.length);
          const shown = `${prefix}${id.startsWith(NAMESPACE) ? id : `${NAMESPACE}${id}`}`;
          if (entry.rename?.sameShape === true) {
            const to = `${prefix}${NAMESPACE}${entry.rename.to}`;
            data = replaceAt(data ?? structuredClone(element.data), match.segments, to);
            renamed.push(`${shown} → ${to}`);
            continue;
          }
          const hint = entry.rename?.hint === undefined ? '' : `; ${entry.rename.hint}`;
          problems.push({
            severity: 'error',
            code: MigrationProblemCodes.removedId,
            message: `${shown} was removed from the registry ${entry.registry} in Minecraft ${tables.toVersion}${hint}.`,
            elementId: element.id as ResourceLocation,
            path: pointer(match.segments),
          });
        }
        if (data !== undefined) {
          changes.push({
            elementId: element.id,
            kind: 'update',
            description: `Renamed ${renamed.join(', ')} for Minecraft ${tables.toVersion}.`,
            data,
          });
        }
      }
    }
    return { changes, problems };
  };
}

/** The tables of this target: from `mc-26.3`, with the removed-id data of `removed-ids.ts`. */
export function migrationTables(toTargetId: string, toVersion: string): MigrationTables {
  return {
    fromTargetId: 'mc-26.3',
    toTargetId,
    toVersion,
    removed: REMOVED_IDS,
    moved: MOVED_REGISTRIES,
    stillRegistered: STILL_REGISTERED_ELSEWHERE,
    renames: KNOWN_RENAMES,
  };
}
