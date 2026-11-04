import type {
  RawAttribute,
  RawConcreteType,
  RawDispatcherType,
  RawIndexedType,
  RawMcdocType,
  RawNumericRange,
  RawReferenceType,
  RawStructType,
  RawTemplateType,
} from '../symbols/raw-types';
import { isVersionInRange } from '../version/compare';
import type { DiscriminatorStep, NumericRange, SchemaField, SchemaNode } from './schema-node';

/**
 * What the normaliser needs from its index. `createSchemaIndex` provides the memoised
 * implementation; tests may provide a stub.
 */
export interface NormaliseContext {
  readonly mcVersion: string;
  /** Memoised normalised node for a type path; throws for an unknown path. */
  resolvePath(path: string): SchemaNode;
  /**
   * Whether `path` is currently being normalised, plain or as an instantiation (used to
   * break spread cycles).
   */
  isResolving(path: string): boolean;
  /** Version-gated, sorted keys of a dispatcher registry (`[]` when unknown). */
  dispatcherKeys(registry: string): string[];
  /** Version-gated, memoised member of a dispatcher registry. */
  dispatch(registry: string, key: string): SchemaNode | undefined;
  /** The raw type stored at `path`, or `undefined` when the export lacks it. */
  rawType(path: string): RawMcdocType | undefined;
  /** Whether `path` names a template's type parameter (e.g. `::java::util::T`). */
  isTypeParam(path: string): boolean;
  /**
   * Type parameter paths that the raw type at `path` mentions, directly or through other
   * non-template paths (anonymous types hoisted out of a template body). Empty for a
   * template itself, which binds its own parameters.
   */
  freeTypeParams(path: string): ReadonlySet<string>;
  /**
   * Normalises the type at `path` with `bindings` (type parameter path -> closed raw type).
   * For a template, its `child` is normalised. Memoised per `(path, bindings)`; a recursive
   * instantiation returns a lazy `reference` instead of looping.
   */
  instantiate(path: string, bindings: ReadonlyMap<string, RawMcdocType>): SchemaNode;
  /**
   * A dispatcher member instantiated with type arguments, for a generic dispatcher such as
   * `minecraft:int_provider[[type]]<int>` whose members are templates. Memoised; a member that
   * is not generic is the plain `dispatch` result. When absent, arguments are ignored.
   */
  dispatchInstance?(
    registry: string,
    key: string,
    args: readonly RawMcdocType[],
  ): SchemaNode | undefined;
}

/** Type parameter path -> raw type argument. Values are closed (no free parameters). */
export type TypeBindings = ReadonlyMap<string, RawMcdocType>;

const NO_BINDINGS: TypeBindings = new Map();

const UNSUPPORTED_REASONS: Readonly<Record<string, string>> = {
  mapped: 'mapped types are not modelled',
  unsafe: 'unsafe types carry no schema',
};

/** Attributes that are modelled elsewhere and therefore never become `tags`. */
const UNTAGGED_ATTRIBUTES: ReadonlySet<string> = new Set(['since', 'until', 'deprecated', 'id']);

const PRIMITIVE_ARRAY_ITEMS = {
  byte_array: 'byte',
  int_array: 'int',
  long_array: 'long',
} as const;

/**
 * The string value of an attribute whose value is a string literal, e.g. `#[since="1.0"]`.
 * Returns `undefined` when the attribute is absent or has another form.
 */
export function attributeString(
  attributes: readonly RawAttribute[] | undefined,
  name: string,
): string | undefined {
  const attribute = attributes?.find((a) => a.name === name);
  return literalString(attribute?.value);
}

function literalString(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as { kind?: unknown; value?: unknown };
  if (node.kind !== 'literal' || typeof node.value !== 'object' || node.value === null) {
    return undefined;
  }
  const literal = node.value as { kind?: unknown; value?: unknown };
  return literal.kind === 'string' && typeof literal.value === 'string' ? literal.value : undefined;
}

/** Whether `#[since]` / `#[until]` on these attributes admit `mcVersion`. */
export function isAvailable(
  attributes: readonly RawAttribute[] | undefined,
  mcVersion: string,
): boolean {
  return isVersionInRange(
    mcVersion,
    attributeString(attributes, 'since'),
    attributeString(attributes, 'until'),
  );
}

function hasAttribute(attributes: readonly RawAttribute[] | undefined, name: string): boolean {
  return attributes?.some((a) => a.name === name) ?? false;
}

/**
 * Maps a Spyglass numeric range to ours. `kind` is `RangeKind` from `@spyglassmc/mcdoc`
 * (`lib/node/index.js`, checked against 0.3.61): `0b10` = minimum exclusive (`<..`),
 * `0b01` = maximum exclusive (`..<`), `0b11` = both, `0b00` = both inclusive.
 */
export function normaliseRange(raw: RawNumericRange): NumericRange {
  const range: NumericRange = {};
  if (raw.min !== undefined) range.min = raw.min;
  if (raw.max !== undefined) range.max = raw.max;
  if ((raw.kind & 0b10) !== 0) range.minExclusive = true;
  if ((raw.kind & 0b01) !== 0) range.maxExclusive = true;
  return range;
}

/** `#[id="registry"]` or `#[id(registry="registry", ...)]`. */
function idRegistry(attributes: readonly RawAttribute[] | undefined): string | undefined {
  const attribute = attributes?.find((a) => a.name === 'id');
  const value = attribute?.value;
  if (value === undefined) return undefined;
  if (value.kind === 'tree') return literalString(value.values.registry);
  return literalString(value);
}

/** The tree form's `path`, e.g. `entity/banner/` in `#[id(registry="texture", path=...)]`. */
function idPath(attributes: readonly RawAttribute[] | undefined): string | undefined {
  const value = attributes?.find((a) => a.name === 'id')?.value;
  if (value === undefined || value.kind !== 'tree') return undefined;
  const path = literalString(value.values.path);
  return path === undefined || path === '' ? undefined : path;
}

function tagsOf(attributes: readonly RawAttribute[] | undefined): string[] {
  if (attributes === undefined) return [];
  const names = new Set<string>();
  for (const attribute of attributes) {
    if (!UNTAGGED_ATTRIBUTES.has(attribute.name)) names.add(attribute.name);
  }
  return [...names].sort();
}

/** `#[id]` on a type that is not a plain string (a string records it as `idRegistry`). */
const marksResourceId = (node: SchemaNode, raw: RawMcdocType): boolean =>
  node.kind !== 'string' && hasAttribute(raw.attributes, 'id');

function withBase<N extends SchemaNode>(node: N, raw: RawMcdocType): N {
  if (hasAttribute(raw.attributes, 'deprecated')) node.deprecated = true;
  if (marksResourceId(node, raw)) node.resourceId = true;
  const tags = tagsOf(raw.attributes);
  if (tags.length > 0) node.tags = [...new Set([...(node.tags ?? []), ...tags])].sort();
  return node;
}

/**
 * Applies `raw`'s base properties to a node that may be shared (memoised instantiations),
 * copying it first when there is anything to add.
 */
function decorate(node: SchemaNode, raw: RawMcdocType): SchemaNode {
  const adds =
    hasAttribute(raw.attributes, 'deprecated') ||
    marksResourceId(node, raw) ||
    tagsOf(raw.attributes).length > 0;
  return adds ? withBase({ ...node }, raw) : node;
}

/**
 * Normalises one raw mcdoc type for `ctx.mcVersion`. Nested references stay lazy, except
 * where generics need them instantiated eagerly.
 *
 * `bindings` maps template type parameter paths to their (closed) raw arguments: a
 * `reference` to a bound path normalises the bound type instead, and a `concrete` type
 * instantiates its template with its arguments. A template reached without an
 * instantiation is `unsupported` ("uninstantiated template").
 */
export function normaliseType(
  raw: RawMcdocType,
  ctx: NormaliseContext,
  bindings: TypeBindings = NO_BINDINGS,
): SchemaNode {
  switch (raw.kind) {
    case 'struct':
      return withBase(normaliseStruct(raw, ctx, bindings), raw);
    case 'list': {
      const node: SchemaNode = { kind: 'list', item: normaliseType(raw.item, ctx, bindings) };
      if (raw.lengthRange !== undefined) node.lengthRange = normaliseRange(raw.lengthRange);
      return withBase(node, raw);
    }
    case 'tuple':
      return withBase(
        { kind: 'tuple', items: raw.items.map((item) => normaliseType(item, ctx, bindings)) },
        raw,
      );
    case 'byte_array':
    case 'int_array':
    case 'long_array': {
      const numberKind = PRIMITIVE_ARRAY_ITEMS[raw.kind];
      const item: SchemaNode = { kind: 'number', numberKind };
      if (raw.valueRange !== undefined) item.range = normaliseRange(raw.valueRange);
      const node: SchemaNode = { kind: 'list', item, primitiveArray: numberKind };
      if (raw.lengthRange !== undefined) node.lengthRange = normaliseRange(raw.lengthRange);
      return withBase(node, raw);
    }
    case 'string': {
      const node: SchemaNode = { kind: 'string' };
      const registry = idRegistry(raw.attributes);
      if (registry !== undefined) {
        node.idRegistry = registry;
        const path = idPath(raw.attributes);
        if (path !== undefined) node.idPath = path;
      }
      if (raw.lengthRange !== undefined) node.lengthRange = normaliseRange(raw.lengthRange);
      return withBase(node, raw);
    }
    case 'byte':
    case 'short':
    case 'int':
    case 'long':
    case 'float':
    case 'double': {
      const node: SchemaNode = { kind: 'number', numberKind: raw.kind };
      if (raw.valueRange !== undefined) node.range = normaliseRange(raw.valueRange);
      return withBase(node, raw);
    }
    case 'boolean':
      return withBase({ kind: 'boolean' }, raw);
    case 'any':
      return withBase({ kind: 'any' }, raw);
    case 'enum':
      return withBase(
        {
          kind: 'enum',
          values: raw.values
            .filter((v) => isAvailable(v.attributes, ctx.mcVersion))
            .map((v) => {
              const value: { identifier: string; value: string | number; desc?: string } = {
                identifier: v.identifier,
                value: v.value,
              };
              if (v.desc !== undefined) value.desc = v.desc;
              return value;
            }),
        },
        raw,
      );
    case 'literal':
      return withBase({ kind: 'literal', value: raw.value.value }, raw);
    case 'union':
      return withBase(
        {
          kind: 'union',
          members: raw.members
            .filter((m) => isAvailable(m.attributes, ctx.mcVersion))
            .map((m) => normaliseType(m, ctx, bindings)),
        },
        raw,
      );
    case 'reference':
      return normaliseReference(raw, ctx, bindings);
    case 'dispatcher':
      return withBase(normaliseDispatcher(raw, ctx), raw);
    case 'concrete':
      return normaliseConcrete(raw, ctx, bindings);
    case 'indexed':
      return decorate(normaliseIndexed(raw, ctx, bindings), raw);
    case 'template':
      return withBase(
        { kind: 'unsupported', reason: 'uninstantiated template', rawKind: 'template' },
        raw,
      );
    default: {
      const rawKind = String((raw as { kind: unknown }).kind);
      const reason = UNSUPPORTED_REASONS[rawKind] ?? `unknown mcdoc kind "${rawKind}"`;
      return withBase({ kind: 'unsupported', reason, rawKind }, raw);
    }
  }
}

function normaliseReference(
  raw: RawReferenceType,
  ctx: NormaliseContext,
  bindings: TypeBindings,
): SchemaNode {
  const path = raw.path;
  if (path === undefined) {
    return withBase(
      { kind: 'unsupported', reason: 'reference without a path', rawKind: 'reference' },
      raw,
    );
  }
  const bound = bindings.get(path);
  // Bound arguments are closed, so they normalise without the current bindings.
  if (bound !== undefined) return decorate(normaliseType(bound, ctx), raw);
  if (ctx.isTypeParam(path)) {
    return withBase(
      { kind: 'unsupported', reason: `unbound type parameter ${path}`, rawKind: 'reference' },
      raw,
    );
  }
  if (bindings.size > 0) {
    const relevant = restrictBindings(bindings, ctx.freeTypeParams(path));
    if (relevant.size > 0) return decorate(ctx.instantiate(path, relevant), raw);
  }
  return withBase({ kind: 'reference', path, resolve: () => ctx.resolvePath(path) }, raw);
}

function normaliseConcrete(
  raw: RawConcreteType,
  ctx: NormaliseContext,
  bindings: TypeBindings,
): SchemaNode {
  const args = raw.typeArgs.map((arg) => substituteRaw(arg, bindings, ctx));
  const child = raw.child;
  if (child.kind === 'dispatcher' && args.length > 0 && ctx.dispatchInstance !== undefined) {
    return decorate(withBase(normaliseDispatcher(child, ctx, args), child), raw);
  }
  if (child.kind === 'template') {
    return decorate(normaliseType(child.child, ctx, bindParams(child, args)), raw);
  }
  if (child.kind === 'reference' && child.path !== undefined) {
    const target = ctx.rawType(child.path);
    if (target?.kind === 'template') {
      return decorate(ctx.instantiate(child.path, bindParams(target, args)), raw);
    }
  }
  // Not generic after all: the arguments have nothing to bind.
  return decorate(normaliseType(child, ctx, bindings), raw);
}

/** Binds a template's parameters to `args` by position; missing arguments stay unbound. */
export function bindParams(template: RawTemplateType, args: readonly RawMcdocType[]): TypeBindings {
  const bindings = new Map<string, RawMcdocType>();
  template.typeParams.forEach((param, i) => {
    const arg = args[i];
    if (arg !== undefined) bindings.set(param.path, arg);
  });
  return bindings;
}

function restrictBindings(bindings: TypeBindings, keep: ReadonlySet<string>): TypeBindings {
  const restricted = new Map<string, RawMcdocType>();
  for (const [path, type] of bindings) if (keep.has(path)) restricted.set(path, type);
  return restricted;
}

/**
 * Replaces bound type parameters in a raw type, so the result is closed and can key the
 * instantiation cache. A reference to another path that mentions a bound parameter (an
 * anonymous type hoisted out of a template) is inlined; recursive inlining stops at the
 * reference. Attributes on a replaced reference are kept on the replacement.
 */
function substituteRaw(
  raw: RawMcdocType,
  bindings: TypeBindings,
  ctx: NormaliseContext,
  inlining: ReadonlySet<string> = new Set(),
): RawMcdocType {
  if (bindings.size === 0) return raw;
  return substituteValue(raw, bindings, ctx, inlining) as RawMcdocType;
}

function substituteValue(
  value: unknown,
  bindings: TypeBindings,
  ctx: NormaliseContext,
  inlining: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) return value.map((v) => substituteValue(v, bindings, ctx, inlining));
  if (typeof value !== 'object' || value === null) return value;
  const node = value as Record<string, unknown>;
  if (node.kind === 'reference' && typeof node.path === 'string') {
    const path = node.path;
    let replacement: RawMcdocType | undefined = bindings.get(path);
    if (replacement === undefined && !inlining.has(path)) {
      const relevant = restrictBindings(bindings, ctx.freeTypeParams(path));
      const target = relevant.size > 0 ? ctx.rawType(path) : undefined;
      if (target !== undefined) {
        replacement = substituteRaw(target, relevant, ctx, new Set([...inlining, path]));
      }
    }
    if (replacement !== undefined) {
      const attributes = node.attributes as RawAttribute[] | undefined;
      if (attributes === undefined || attributes.length === 0) return replacement;
      return { ...replacement, attributes: [...(replacement.attributes ?? []), ...attributes] };
    }
    return node;
  }
  if (node.kind === 'template' && Array.isArray(node.typeParams)) {
    // An inline template shadows its own parameters.
    const shadowed = new Set((node.typeParams as { path: string }[]).map((p) => p.path));
    const inner = new Map([...bindings].filter(([path]) => !shadowed.has(path)));
    return { ...node, child: substituteValue(node.child, inner, ctx, inlining) };
  }
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(node)) {
    copy[key] = substituteValue(entry, bindings, ctx, inlining);
  }
  return copy;
}

/**
 * A dispatcher node. With `args` (a generic dispatcher), members are instantiated with them
 * through `ctx.dispatchInstance`.
 */
function normaliseDispatcher(
  raw: RawDispatcherType,
  ctx: NormaliseContext,
  args?: readonly RawMcdocType[],
): SchemaNode {
  const registry = raw.registry;
  const member = (key: string): SchemaNode | undefined =>
    args !== undefined && ctx.dispatchInstance !== undefined
      ? ctx.dispatchInstance(registry, key, args)
      : ctx.dispatch(registry, key);
  // Only the first parallel index is modelled; vanilla-mcdoc uses one almost everywhere.
  const index = raw.parallelIndices[0];
  if (index?.kind === 'static') {
    const staticKey = index.value;
    const lookup = (): string | undefined => {
      const keys = ctx.dispatcherKeys(registry);
      if (keys.includes(staticKey)) return staticKey;
      // Static keywords such as `fallback` are stored as `%fallback`.
      const keyword = `%${staticKey}`;
      return keys.includes(keyword) ? keyword : undefined;
    };
    return {
      kind: 'dispatcher',
      registry,
      discriminator: [],
      keys: () => {
        const key = lookup();
        return key === undefined ? [] : [key];
      },
      dispatch: () => {
        const key = lookup();
        return key === undefined ? undefined : member(key);
      },
    };
  }
  const discriminator: DiscriminatorStep[] =
    index?.kind === 'dynamic'
      ? index.accessor.map((step) =>
          typeof step === 'string' ? step : step.keyword === 'key' ? '%key' : '%parent',
        )
      : [];
  return {
    kind: 'dispatcher',
    registry,
    discriminator,
    keys: () => ctx.dispatcherKeys(registry),
    dispatch: (key) => member(key),
  };
}

/**
 * An mcdoc indexed access `child[index]`. The child is normally a dispatcher, so the result is
 * a dispatcher over the same registry and discriminator whose members are the selected
 * member's field named by the index (`minecraft:environment_attribute[[attribute]][value]`).
 * A struct child yields its field directly. A dynamic index (`[%key]`) cannot be resolved
 * statically: it selects the member's `'*'` field, or else a union of all its field types.
 * Shared nodes are never mutated; references are followed with `resolve()`.
 */
function normaliseIndexed(
  raw: RawIndexedType,
  ctx: NormaliseContext,
  bindings: TypeBindings,
): SchemaNode {
  const index = Array.isArray(raw.parallelIndices) ? raw.parallelIndices[0] : undefined;
  if (raw.child === undefined || index === undefined) {
    return {
      kind: 'unsupported',
      reason: 'indexed type without a child or index',
      rawKind: 'indexed',
    };
  }
  const child = derefForIndex(normaliseType(raw.child, ctx, bindings));
  const fieldName = index.kind === 'static' ? index.value : undefined;
  if (child.kind === 'struct') {
    return (
      selectField(child, fieldName) ?? {
        kind: 'unsupported',
        reason: `indexed field ${fieldName ?? '%key'} not found`,
        rawKind: 'indexed',
      }
    );
  }
  if (child.kind !== 'dispatcher') {
    return { kind: 'unsupported', reason: `cannot index a ${child.kind}`, rawKind: 'indexed' };
  }
  const members = new Map<string, SchemaNode | undefined>();
  return {
    kind: 'dispatcher',
    registry: child.registry,
    discriminator: child.discriminator,
    keys: () => child.keys(),
    dispatch: (key) => {
      if (members.has(key)) return members.get(key);
      const member = child.dispatch(key);
      const target = member === undefined ? undefined : derefForIndex(member);
      let selected: SchemaNode | undefined;
      if (target?.kind === 'struct') selected = selectField(target, fieldName);
      else if (target?.kind === 'any') selected = target;
      members.set(key, selected);
      return selected;
    },
  };
}

/** Follows references for an indexed access, stopping (and returning the reference) on a cycle. */
function derefForIndex(node: SchemaNode): SchemaNode {
  const visited = new Set<string>();
  let current = node;
  while (current.kind === 'reference') {
    if (visited.has(current.path)) return current;
    visited.add(current.path);
    current = current.resolve();
  }
  return current;
}

/**
 * The type of `struct`'s field `name`, falling back to its `'*'` field. Without a name (a
 * dynamic index): the `'*'` field, or a union of every field type. `undefined` when empty.
 */
function selectField(
  struct: SchemaNode & { kind: 'struct' },
  name: string | undefined,
): SchemaNode | undefined {
  const named = name === undefined ? undefined : struct.fields.find((f) => f.key === name);
  if (named !== undefined) return named.type;
  const wildcard = struct.fields.find((f) => f.key === '*');
  if (wildcard !== undefined) return wildcard.type;
  if (name !== undefined || struct.fields.length === 0) return undefined;
  if (struct.fields.length === 1) return struct.fields[0]?.type;
  return { kind: 'union', members: struct.fields.map((f) => f.type) };
}

/**
 * Struct normalisation:
 * - pairs outside `mcVersion` (`#[since]`/`#[until]`) are dropped;
 * - a pair whose key is a type (map-like struct) becomes an optional field with key `'*'`;
 * - a spread of a struct or of a reference that resolves to a struct is inlined (later keys
 *   replace earlier ones in place); anything else, and reference cycles, go to `spreads`.
 */
function normaliseStruct(
  raw: RawStructType,
  ctx: NormaliseContext,
  bindings: TypeBindings,
): SchemaNode & { kind: 'struct' } {
  const fields: SchemaField[] = [];
  const spreads: SchemaNode[] = [];
  const addField = (field: SchemaField): void => {
    const existing = field.key === '*' ? -1 : fields.findIndex((f) => f.key === field.key);
    if (existing === -1) fields.push(field);
    else fields[existing] = field;
  };

  for (const entry of raw.fields) {
    if (!isAvailable(entry.attributes, ctx.mcVersion)) continue;
    if (entry.kind === 'pair') {
      const field: SchemaField = {
        key: typeof entry.key === 'string' ? entry.key : '*',
        type: normaliseType(entry.type, ctx, bindings),
        optional: typeof entry.key === 'string' ? entry.optional === true : true,
      };
      if (typeof entry.key !== 'string') field.keyType = normaliseType(entry.key, ctx, bindings);
      if (entry.desc !== undefined) field.desc = entry.desc;
      if (entry.deprecated === true || hasAttribute(entry.attributes, 'deprecated')) {
        field.deprecated = true;
      }
      addField(field);
      continue;
    }
    const target = derefForSpread(normaliseType(entry.type, ctx, bindings), ctx);
    if (target.kind === 'struct') {
      for (const field of target.fields) addField(field);
      spreads.push(...target.spreads);
    } else {
      spreads.push(target);
    }
  }
  return { kind: 'struct', fields, spreads };
}

/** Follows references for a spread, stopping (and returning the reference) on a cycle. */
function derefForSpread(node: SchemaNode, ctx: NormaliseContext): SchemaNode {
  const visited = new Set<string>();
  let current = node;
  while (current.kind === 'reference') {
    if (visited.has(current.path) || ctx.isResolving(current.path)) return current;
    visited.add(current.path);
    current = current.resolve();
  }
  return current;
}
