import type { VanillaMcdocSymbols } from '../symbols/parse';
import type { RawMcdocType } from '../symbols/raw-types';
import { isAvailable, type NormaliseContext, normaliseType, type TypeBindings } from './normalise';
import type { SchemaNode } from './schema-node';

/** Options for `createSchemaIndex`. `mcVersion` comes from the target, never from this package. */
export interface SchemaIndexOptions {
  mcVersion: string;
}

/**
 * Thrown by `SchemaIndex.resolve`, `resolveSchemaRef` (and lazy references) for a type path
 * or schema reference the export lacks.
 */
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
  /**
   * Resolves a schema reference as used by `OutputFile.schema` and element kinds: an mcdoc
   * type path (`::java::...`) or `resource:<category>`, which names a member of the
   * `minecraft:resource` dispatcher. Throws `SchemaNotFoundError` when either is absent.
   */
  resolveSchemaRef(ref: string): SchemaNode;
}

/** Nesting limit for generic instantiations whose arguments keep growing. */
const MAX_INSTANTIATION_DEPTH = 32;

const RESOURCE_REF_PREFIX = 'resource:';

/** Every type path that appears as a template parameter anywhere in `types`. */
function collectTypeParams(types: Iterable<unknown>): Set<string> {
  const params = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const node = value as Record<string, unknown>;
    if (node.kind === 'template' && Array.isArray(node.typeParams)) {
      for (const param of node.typeParams as { path?: unknown }[]) {
        if (typeof param.path === 'string') params.add(param.path);
      }
    }
    for (const entry of Object.values(node)) visit(entry);
  };
  for (const type of types) visit(type);
  return params;
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

  // Generics ---------------------------------------------------------------------------

  const typeParams = collectTypeParams([
    ...Object.values(symbols.mcdoc),
    ...Object.values(symbols.dispatchers).flatMap((members) => Object.values(members)),
  ]);
  const freeParamCache = new Map<string, ReadonlySet<string>>();
  const freeParamPending = new Set<string>();
  const EMPTY: ReadonlySet<string> = new Set();

  /**
   * Parameters mentioned by the raw type at `path`, following non-template references.
   * A reference cycle contributes nothing from the path already being visited.
   */
  const freeTypeParams = (typePath: string): ReadonlySet<string> => {
    const cached = freeParamCache.get(typePath);
    if (cached !== undefined) return cached;
    if (typeParams.size === 0 || !hasOwn(symbols.mcdoc, typePath)) return EMPTY;
    const raw = symbols.mcdoc[typePath];
    if (raw === undefined || raw.kind === 'template' || freeParamPending.has(typePath)) {
      return EMPTY;
    }
    freeParamPending.add(typePath);
    const found = new Set<string>();
    const visit = (value: unknown, shadowed: ReadonlySet<string>): void => {
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry, shadowed);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      const node = value as Record<string, unknown>;
      if (node.kind === 'reference' && typeof node.path === 'string') {
        const path = node.path;
        if (typeParams.has(path)) {
          if (!shadowed.has(path)) found.add(path);
        } else {
          for (const param of freeTypeParams(path)) if (!shadowed.has(param)) found.add(param);
        }
        return;
      }
      if (node.kind === 'template' && Array.isArray(node.typeParams)) {
        const inner = new Set(shadowed);
        for (const param of node.typeParams as { path: string }[]) inner.add(param.path);
        visit(node.child, inner);
        return;
      }
      for (const entry of Object.values(node)) visit(entry, shadowed);
    };
    try {
      visit(raw, EMPTY);
    } finally {
      freeParamPending.delete(typePath);
    }
    const result: ReadonlySet<string> = found.size === 0 ? EMPTY : found;
    freeParamCache.set(typePath, result);
    return result;
  };

  const instances = new Map<string, SchemaNode>();
  const instancesPending = new Set<string>();
  const instantiating = new Map<string, number>();
  let instantiationDepth = 0;

  const instantiate = (typePath: string, bindings: TypeBindings): SchemaNode => {
    const args = [...bindings].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const key = `${typePath}\u0000${JSON.stringify(args)}`;
    const cached = instances.get(key);
    if (cached !== undefined) return cached;
    if (instancesPending.has(key)) {
      return {
        kind: 'reference',
        path: typePath,
        resolve: () => {
          const node = instances.get(key);
          if (node === undefined) throw new SchemaNotFoundError(typePath);
          return node;
        },
      };
    }
    if (!hasOwn(symbols.mcdoc, typePath)) throw new SchemaNotFoundError(typePath);
    const raw = symbols.mcdoc[typePath];
    if (raw === undefined) throw new SchemaNotFoundError(typePath);
    if (instantiationDepth >= MAX_INSTANTIATION_DEPTH) {
      return {
        kind: 'unsupported',
        reason: 'generic instantiation nested too deeply',
        rawKind: 'concrete',
      };
    }
    const body: RawMcdocType = raw.kind === 'template' ? raw.child : raw;
    instancesPending.add(key);
    instantiating.set(typePath, (instantiating.get(typePath) ?? 0) + 1);
    instantiationDepth += 1;
    try {
      const node = normaliseType(body, ctx, bindings);
      instances.set(key, node);
      return node;
    } finally {
      instantiationDepth -= 1;
      const count = (instantiating.get(typePath) ?? 1) - 1;
      if (count === 0) instantiating.delete(typePath);
      else instantiating.set(typePath, count);
      instancesPending.delete(key);
    }
  };

  const ctx: NormaliseContext = {
    mcVersion,
    resolvePath,
    isResolving: (typePath) => resolving.has(typePath) || instantiating.has(typePath),
    dispatcherKeys,
    dispatch,
    rawType: (typePath) => (hasOwn(symbols.mcdoc, typePath) ? symbols.mcdoc[typePath] : undefined),
    isTypeParam: (typePath) => typeParams.has(typePath),
    freeTypeParams,
    instantiate,
  };

  const resolveSchemaRef = (ref: string): SchemaNode => {
    if (ref.startsWith(RESOURCE_REF_PREFIX)) {
      const category = ref.slice(RESOURCE_REF_PREFIX.length);
      const node = category === '' ? undefined : dispatch('minecraft:resource', category);
      if (node === undefined) throw new SchemaNotFoundError(ref);
      return node;
    }
    return resolvePath(ref);
  };

  return {
    ref: symbols.ref,
    mcVersion,
    has: (typePath) => hasOwn(symbols.mcdoc, typePath),
    typePaths: () => sortedPaths,
    resolve: resolvePath,
    dispatch,
    dispatcherKeys,
    resolveSchemaRef,
  };
}
