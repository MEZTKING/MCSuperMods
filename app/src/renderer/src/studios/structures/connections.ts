/**
 * Jigsaw connections of a template pool (plan D7, Template Pool Studio): for each project
 * structure template the pool places, its jigsaw blocks with the status of their target pool
 * and whether that pool has a piece with a jigsaw named the jigsaw's `target`; plus what in
 * the project uses the pool. Pure: reads the project only.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';

/** The structure template kind. */
export const STRUCTURE_TEMPLATE_KIND = 'minecraft:structure_template';
/** The template pool kind. */
export const TEMPLATE_POOL_KIND = 'minecraft:worldgen/template_pool';
/** The structure kind. */
export const STRUCTURE_KIND = 'minecraft:worldgen/structure';

/** Where a jigsaw's target pool is defined. */
export type PoolStatus = 'project' | 'vanilla' | 'missing';

/** One jigsaw block of a piece. */
export interface JigsawConnection {
  /** The pool the jigsaw attaches pieces from, as written. */
  pool: string;
  /** The jigsaw's own name. */
  name: string;
  /** The name of the jigsaw it connects to in a piece of {@link pool}. */
  target: string;
  status: PoolStatus;
  /**
   * Whether a project structure template placed by the target pool has a jigsaw named
   * {@link target}; `null` when the target pool is not a project pool (not checked).
   */
  targetFound: boolean | null;
}

/** One project structure template the pool places. */
export interface PieceConnections {
  templateId: ResourceLocation;
  jigsaws: JigsawConnection[];
}

/** The result of {@link poolConnections}. */
export interface PoolConnections {
  pieces: PieceConnections[];
  usedBy: {
    /** Structures whose `start_pool` is the pool. */
    structures: ResourceLocation[];
    /** Pools placing a project template with a jigsaw that targets the pool. */
    pools: ResourceLocation[];
  };
}

/** Options of {@link poolConnections}. */
export interface PoolConnectionsOptions {
  /** Vanilla template pool ids (namespaced or not); others outside the project are missing. */
  vanillaPools?: Iterable<string>;
}

type JsonObject = { [key: string]: Json };

function asObject(value: Json | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

/** An id with its namespace: `minecraft:` is added when it has none. */
export function normaliseId(id: string): ResourceLocation {
  const trimmed = id.trim();
  return (trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`) as ResourceLocation;
}

/** The `location` ids of one pool element, including those nested in `list_pool_element`. */
function elementLocations(value: Json | undefined, out: string[], depth = 0): void {
  const element = asObject(value);
  if (element === undefined || depth > 8) return;
  if (typeof element.location === 'string') out.push(element.location);
  if (Array.isArray(element.elements)) {
    for (const nested of element.elements) elementLocations(nested, out, depth + 1);
  }
}

/**
 * Every structure template id a pool's pieces place, in order, without duplicates.
 *
 * @param pool - The pool element's data.
 */
export function poolLocations(pool: Json): string[] {
  const out: string[] = [];
  const pieces = asObject(pool)?.elements;
  if (!Array.isArray(pieces)) return [];
  for (const piece of pieces) elementLocations(asObject(piece)?.element, out);
  return [...new Set(out.map(normaliseId))];
}

/** The jigsaws of a structure template's data (entries with a string `pool`). */
export function templateJigsaws(template: Json): { pool: string; name: string; target: string }[] {
  const jigsaws = asObject(template)?.jigsaws;
  if (!Array.isArray(jigsaws)) return [];
  const out: { pool: string; name: string; target: string }[] = [];
  for (const entry of jigsaws) {
    const jigsaw = asObject(entry);
    if (jigsaw === undefined || typeof jigsaw.pool !== 'string') continue;
    out.push({
      pool: jigsaw.pool,
      name: typeof jigsaw.name === 'string' ? jigsaw.name : '',
      target: typeof jigsaw.target === 'string' ? jigsaw.target : '',
    });
  }
  return out;
}

function elementsOfKind(project: Project, kind: string): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === kind) out.set(element.id, element);
    }
  }
  return out;
}

/** The status of a pool id against the project's pools and the vanilla pools. */
export function poolStatus(
  id: string,
  projectPools: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  vanillaPools: ReadonlySet<string>,
): PoolStatus {
  const normalised = normaliseId(id);
  if (projectPools.has(normalised)) return 'project';
  if (vanillaPools.has(normalised)) return 'vanilla';
  return 'missing';
}

/** Namespaced vanilla ids from a list of (possibly unnamespaced) ids. */
export function vanillaIdSet(ids: Iterable<string> | undefined): Set<string> {
  const out = new Set<string>();
  for (const id of ids ?? []) out.add(normaliseId(id));
  return out;
}

/**
 * The jigsaw connections and users of one template pool.
 *
 * @param project - The project.
 * @param poolId - The pool's element id.
 * @param options - The vanilla pool ids, for the `vanilla` status.
 */
export function poolConnections(
  project: Project,
  poolId: string,
  options: PoolConnectionsOptions = {},
): PoolConnections {
  const pools = elementsOfKind(project, TEMPLATE_POOL_KIND);
  const templates = elementsOfKind(project, STRUCTURE_TEMPLATE_KIND);
  const vanilla = vanillaIdSet(options.vanillaPools);
  const self = normaliseId(poolId);

  /** Jigsaw names of the project templates each project pool places, built on demand. */
  const namesCache = new Map<string, Set<string>>();
  const jigsawNamesOf = (pool: string): Set<string> => {
    let names = namesCache.get(pool);
    if (names === undefined) {
      names = new Set();
      const element = pools.get(pool);
      for (const location of element === undefined ? [] : poolLocations(element.data)) {
        const template = templates.get(location);
        if (template === undefined) continue;
        for (const jigsaw of templateJigsaws(template.data)) names.add(normaliseId(jigsaw.name));
      }
      namesCache.set(pool, names);
    }
    return names;
  };

  const pieces: PieceConnections[] = [];
  const own = pools.get(self);
  for (const location of own === undefined ? [] : poolLocations(own.data)) {
    const template = templates.get(location);
    if (template === undefined) continue;
    pieces.push({
      templateId: template.id,
      jigsaws: templateJigsaws(template.data).map((jigsaw) => {
        const status = poolStatus(jigsaw.pool, pools, vanilla);
        return {
          pool: jigsaw.pool,
          name: jigsaw.name,
          target: jigsaw.target,
          status,
          targetFound:
            status === 'project'
              ? jigsawNamesOf(normaliseId(jigsaw.pool)).has(normaliseId(jigsaw.target))
              : null,
        };
      }),
    });
  }

  const structures: ResourceLocation[] = [];
  for (const structure of elementsOfKind(project, STRUCTURE_KIND).values()) {
    const start = asObject(structure.data)?.start_pool;
    if (typeof start === 'string' && normaliseId(start) === self) structures.push(structure.id);
  }
  const users: ResourceLocation[] = [];
  for (const pool of pools.values()) {
    const targets = poolLocations(pool.data).some((location) => {
      const template = templates.get(location);
      return (
        template !== undefined &&
        templateJigsaws(template.data).some((jigsaw) => normaliseId(jigsaw.pool) === self)
      );
    });
    if (targets) users.push(pool.id);
  }
  return {
    pieces,
    usedBy: { structures: structures.sort(), pools: users.sort() },
  };
}
