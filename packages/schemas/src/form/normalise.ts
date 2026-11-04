import type {
  RawAttribute,
  RawDispatcherType,
  RawMcdocType,
  RawNumericRange,
  RawStructType,
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
  /** Whether `path` is currently being normalised (used to break spread cycles). */
  isResolving(path: string): boolean;
  /** Version-gated, sorted keys of a dispatcher registry (`[]` when unknown). */
  dispatcherKeys(registry: string): string[];
  /** Version-gated, memoised member of a dispatcher registry. */
  dispatch(registry: string, key: string): SchemaNode | undefined;
}

const UNSUPPORTED_REASONS: Readonly<Record<string, string>> = {
  template: 'generic type templates are not modelled in Phase 0',
  concrete: 'generic type instantiations are not modelled in Phase 0',
  indexed: 'indexed types are not modelled in Phase 0',
  mapped: 'mapped types are not modelled in Phase 0',
  tuple: 'tuples are not modelled in Phase 0',
  unsafe: 'unsafe types carry no schema',
  byte_array: 'primitive arrays are not modelled in Phase 0',
  int_array: 'primitive arrays are not modelled in Phase 0',
  long_array: 'primitive arrays are not modelled in Phase 0',
};

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

function withBase<N extends SchemaNode>(node: N, raw: RawMcdocType): N {
  if (hasAttribute(raw.attributes, 'deprecated')) node.deprecated = true;
  return node;
}

/** Normalises one raw mcdoc type for `ctx.mcVersion`. Nested references stay lazy. */
export function normaliseType(raw: RawMcdocType, ctx: NormaliseContext): SchemaNode {
  switch (raw.kind) {
    case 'struct':
      return withBase(normaliseStruct(raw, ctx), raw);
    case 'list': {
      const node: SchemaNode = { kind: 'list', item: normaliseType(raw.item, ctx) };
      if (raw.lengthRange !== undefined) node.lengthRange = normaliseRange(raw.lengthRange);
      return withBase(node, raw);
    }
    case 'string': {
      const node: SchemaNode = { kind: 'string' };
      const registry = idRegistry(raw.attributes);
      if (registry !== undefined) node.idRegistry = registry;
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
            .map((m) => normaliseType(m, ctx)),
        },
        raw,
      );
    case 'reference': {
      const path = raw.path;
      if (path === undefined) {
        return withBase(
          { kind: 'unsupported', reason: 'reference without a path', rawKind: 'reference' },
          raw,
        );
      }
      return withBase({ kind: 'reference', path, resolve: () => ctx.resolvePath(path) }, raw);
    }
    case 'dispatcher':
      return withBase(normaliseDispatcher(raw, ctx), raw);
    default: {
      const rawKind = String((raw as { kind: unknown }).kind);
      const reason = UNSUPPORTED_REASONS[rawKind] ?? `unknown mcdoc kind "${rawKind}"`;
      return withBase({ kind: 'unsupported', reason, rawKind }, raw);
    }
  }
}

function normaliseDispatcher(raw: RawDispatcherType, ctx: NormaliseContext): SchemaNode {
  const registry = raw.registry;
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
        return key === undefined ? undefined : ctx.dispatch(registry, key);
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
    dispatch: (key) => ctx.dispatch(registry, key),
  };
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
        type: normaliseType(entry.type, ctx),
        optional: typeof entry.key === 'string' ? entry.optional === true : true,
      };
      if (entry.desc !== undefined) field.desc = entry.desc;
      if (entry.deprecated === true || hasAttribute(entry.attributes, 'deprecated')) {
        field.deprecated = true;
      }
      addField(field);
      continue;
    }
    const target = derefForSpread(normaliseType(entry.type, ctx), ctx);
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
    current = ctx.resolvePath(current.path);
  }
  return current;
}
