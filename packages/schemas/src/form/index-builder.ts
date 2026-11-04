import type { VanillaMcdocSymbols } from '../symbols/parse';
import { isAvailable, type NormaliseContext, normaliseType } from './normalise';
import type { SchemaNode } from './schema-node';

/** Options for `createSchemaIndex`. `mcVersion` comes from the target, never from this package. */
export interface SchemaIndexOptions {
  mcVersion: string;
}

/** Thrown by `SchemaIndex.resolve` (and lazy references) for a type path the export lacks. */
export class SchemaNotFoundError extends Error {
  readonly typePath: string;

  constructor(typePath: string) {
    super(`Unknown mcdoc type path: ${typePath}`);
    this.name = 'SchemaNotFoundError';
    this.typePath = typePath;
  }
}

/** Version-gated, memoised view of a vanilla-mcdoc symbol export. */
export interface SchemaIndex {
  readonly ref: string;
  readonly mcVersion: string;
  has(typePath: string): boolean;
  /** Every type path, sorted; anonymous types (`<anonymous N>`) included. */
  typePaths(): readonly string[];
  /** The normalised node for a path; the same object on every call. Throws SchemaNotFoundError. */
  resolve(typePath: string): SchemaNode;
  /**
   * A dispatcher member, e.g. `('minecraft:resource', 'recipe')`. A `minecraft:` prefix on
   * `key` is accepted. A member that is a plain reference is returned resolved, so it is the
   * same object as `resolve(path)`. `undefined` when absent or outside `mcVersion`.
   */
  dispatch(registry: string, key: string): SchemaNode | undefined;
  /** Keys of a registry available in `mcVersion`, sorted; `[]` for an unknown registry. */
  dispatcherKeys(registry: string): string[];
}

const hasOwn = (record: object, key: string): boolean => Object.hasOwn(record, key);

/** Builds a schema index over `symbols` for one game version. Nodes are normalised lazily. */
export function createSchemaIndex(
  symbols: VanillaMcdocSymbols,
  options: SchemaIndexOptions,
): SchemaIndex {
  const { mcVersion } = options;
  const sortedPaths = Object.freeze(Object.keys(symbols.mcdoc).sort());
  const resolved = new Map<string, SchemaNode>();
  const resolving = new Set<string>();
  const dispatched = new Map<string, SchemaNode>();
  const keyCache = new Map<string, string[]>();

  const resolvePath = (typePath: string): SchemaNode => {
    const cached = resolved.get(typePath);
    if (cached !== undefined) return cached;
    if (!hasOwn(symbols.mcdoc, typePath)) throw new SchemaNotFoundError(typePath);
    const raw = symbols.mcdoc[typePath];
    if (raw === undefined) throw new SchemaNotFoundError(typePath);
    resolving.add(typePath);
    try {
      const node = normaliseType(raw, ctx);
      resolved.set(typePath, node);
      return node;
    } finally {
      resolving.delete(typePath);
    }
  };

  const dispatcherKeys = (registry: string): string[] => {
    const cached = keyCache.get(registry);
    if (cached !== undefined) return [...cached];
    const members = hasOwn(symbols.dispatchers, registry)
      ? symbols.dispatchers[registry]
      : undefined;
    const keys =
      members === undefined
        ? []
        : Object.keys(members)
            .filter((key) => isAvailable(members[key]?.attributes, mcVersion))
            .sort();
    keyCache.set(registry, keys);
    return [...keys];
  };

  /** Follows a chain of references; stops on a cycle and returns the last reference. */
  const unwrap = (node: SchemaNode): SchemaNode => {
    const visited = new Set<string>();
    let current = node;
    while (current.kind === 'reference') {
      if (visited.has(current.path)) return current;
      visited.add(current.path);
      current = current.resolve();
    }
    return current;
  };

  const dispatch = (registry: string, key: string): SchemaNode | undefined => {
    const members = hasOwn(symbols.dispatchers, registry)
      ? symbols.dispatchers[registry]
      : undefined;
    if (members === undefined) return undefined;
    let memberKey = key;
    if (!hasOwn(members, memberKey) && memberKey.startsWith('minecraft:')) {
      memberKey = memberKey.slice('minecraft:'.length);
    }
    if (!hasOwn(members, memberKey)) return undefined;
    const raw = members[memberKey];
    if (raw === undefined || !isAvailable(raw.attributes, mcVersion)) return undefined;
    const cacheKey = `${registry}\u0000${memberKey}`;
    const cached = dispatched.get(cacheKey);
    if (cached !== undefined) return cached;
    const node = unwrap(normaliseType(raw, ctx));
    dispatched.set(cacheKey, node);
    return node;
  };

  const ctx: NormaliseContext = {
    mcVersion,
    resolvePath,
    isResolving: (typePath) => resolving.has(typePath),
    dispatcherKeys,
    dispatch,
  };

  return {
    ref: symbols.ref,
    mcVersion,
    has: (typePath) => hasOwn(symbols.mcdoc, typePath),
    typePaths: () => sortedPaths,
    resolve: resolvePath,
    dispatch,
    dispatcherKeys,
  };
}
