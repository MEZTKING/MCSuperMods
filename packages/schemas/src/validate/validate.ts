/**
 * MSM's structural JSON validator over the version-gated `SchemaNode` model (ADR 0009).
 * Pure: no I/O, never mutates nodes (instantiated nodes are shared). Used live by the editor
 * and as the export gate on lowered JSON files.
 */

import type { Json } from '@msm/plugin-api';
import type { NumericRange, SchemaField, SchemaNode } from '../form/schema-node';
import type { RegistryIndex } from '../registry/registry-index';

/** Machine-readable problem codes produced by `validateJson`. */
export type SchemaProblemCode =
  | 'schema.type-mismatch'
  | 'schema.missing-field'
  | 'schema.unknown-field'
  | 'schema.out-of-range'
  | 'schema.invalid-enum'
  | 'schema.invalid-literal'
  | 'schema.no-union-match'
  | 'schema.unknown-dispatch-key'
  | 'schema.missing-discriminator'
  | 'schema.invalid-length'
  | 'schema.unknown-id'
  | 'schema.not-integer';

/** One validation finding. */
export interface SchemaProblem {
  severity: 'error' | 'warning';
  code: SchemaProblemCode;
  /**
   * RFC 6901 pointer into the validated value (`''` for the root). For a missing field it
   * points at where the field belongs, e.g. `/elements/0/from`.
   */
  path: string;
  /** British English; names the expected shape. */
  message: string;
  /** Short type description for the UI. */
  expected?: string;
}

/** Options for `validateJson`. */
export interface ValidateOptions {
  /** When given, `#[id]` strings are checked against it (warnings). */
  registries?: RegistryIndex;
  /**
   * Nesting limit, default 64. It bounds both the depth of the value and the number of
   * reference, union or dispatcher hops taken without descending into the value; beyond it
   * the value is accepted.
   */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 64;
const MAX_LISTED_KEYS = 10;
const MC_PREFIX = 'minecraft:';

/**
 * The registry id of `value` under an `#[id(path=...)]` prefix: `ns:name` becomes
 * `ns:<path>name` (`minecraft` when no namespace is written). Tag references and values
 * without a path are returned unchanged.
 */
function registryId(value: string, path: string | undefined): string {
  if (path === undefined || value.startsWith('#')) return value;
  const colon = value.indexOf(':');
  const namespace = colon === -1 ? 'minecraft' : value.slice(0, colon);
  const name = colon === -1 ? value : value.slice(colon + 1);
  return `${namespace}:${path}${name}`;
}

const MAX_DESCRIBE_DEPTH = 3;

type JsonObject = { [key: string]: Json };

/** The object a dynamic dispatcher reads its discriminator from, and its pointer. */
interface Siblings {
  value: JsonObject;
  path: string;
}

/** Keys a struct and its spreads declare for one object (see `State.claims`). */
interface Claims {
  /** Keys of the object that a struct field or `'*'` field matched. */
  matched: Set<string>;
  /** Every named field key the struct and its spreads declare, for messages. */
  declared: Set<string>;
  /** A spread could not be resolved to fields (any, unknown member, ...): allow every key. */
  open: boolean;
}

/** Marks the spread being walked as unresolvable, so the owner allows unknown keys. */
const openClaims = (state: State): void => {
  if (state.claims !== undefined) state.claims.open = true;
};

interface State {
  path: string;
  depth: number;
  hops: number;
  /** Key under which the value sits in its parent object (`%key` discriminators). */
  parentKey?: string;
  /** The struct object that contains the value, or the value itself inside a spread. */
  siblings?: Siblings;
  /** Unknown keys are allowed (validating a struct spread against the whole object). */
  open: boolean;
  /**
   * Set while a struct's spreads are validated against the whole object: the keys they
   * declare, so the owning struct can report keys that neither it nor a spread knows.
   */
  claims?: Claims;
  /**
   * The value is a dispatcher discriminator (a resource location such as `"type"`), so an
   * enum also accepts it with a `minecraft:` prefix, as the game does.
   */
  dispatchKey?: boolean;
  /**
   * The value sits under an `#[id]` type that is not a plain string (`#[id] SomeEnum`), so its
   * enum values are resource locations and also accepted with a `minecraft:` prefix.
   */
  resourceId?: boolean;
  /**
   * Discriminator fields of the containing struct whose value is a valid member of a closed
   * (enum or literal) field type. A dispatcher reading one of them treats a missing member as
   * "no extra fields" instead of an unknown key: the enum is the authority on valid values
   * (e.g. `minecraft:empty` item models, which have no dispatcher member).
   */
  acceptedKeys?: ReadonlySet<string>;
  /** The value is an object key checked against a `'*'` field's key type. */
  isKey?: boolean;
}

/** One `#[id]` string found by `collectReferences`. */
export interface CollectedReference {
  /** RFC 6901 pointer to the string; for a map key, the pointer to its entry. */
  path: string;
  /** The `#[id]` registry, without a `minecraft:` prefix, e.g. `item`. */
  registry: string;
  /**
   * The registry id: the string as written, or, under `#[id(path=...)]`, `ns:<path>name`
   * (e.g. `minecraft:entity/banner/creeper` for `creeper`). A tag reference keeps its `#`.
   */
  id: string;
  /** The string as written, set only when it differs from `id` (an `#[id(path=...)]` prefix). */
  written?: string;
  /** Set when the id is an object key (map-like struct) rather than a string value. */
  key?: true;
}

interface Context {
  registries?: RegistryIndex;
  maxDepth: number;
  /**
   * When set, `#[id]` strings are appended here (`collectReferences`). Branches that are
   * tried and discarded (union members, wildcard key types) collect into their own arrays.
   */
  refs?: CollectedReference[];
}

/**
 * Validates `value` against `node`. Problems are sorted by path, then code. Schema violations
 * are errors; unknown registry ids are warnings. `any` and `unsupported` nodes accept anything.
 */
export function validateJson(
  value: Json,
  node: SchemaNode,
  options: ValidateOptions = {},
): SchemaProblem[] {
  const ctx: Context = { maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH };
  if (options.registries !== undefined) ctx.registries = options.registries;
  const out: SchemaProblem[] = [];
  validate(value, node, { path: '', depth: 0, hops: 0, open: false }, ctx, out);
  return sortProblems(dedupe(out));
}

/** Options for `collectReferences`. */
export interface CollectReferencesOptions {
  /** Nesting limit, default 64, with the same meaning as `ValidateOptions.maxDepth`. */
  maxDepth?: number;
}

/**
 * Every string in `value` whose schema node carries an `#[id]` registry, found by walking
 * `value` with `node` exactly as `validateJson` does (dispatchers, unions, map keys). Values
 * that do not match the schema are walked as far as the validator goes; in a union, the
 * matching member (or else the closest one) supplies the references. Sorted by path; pure.
 */
export function collectReferences(
  value: Json,
  node: SchemaNode,
  options: CollectReferencesOptions = {},
): CollectedReference[] {
  const refs: CollectedReference[] = [];
  const ctx: Context = { maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH, refs };
  validate(value, node, { path: '', depth: 0, hops: 0, open: false }, ctx, []);
  const seen = new Set<string>();
  const unique = refs.filter((ref) => {
    const id = `${ref.path}\u0000${ref.key === true ? 'k' : 'v'}\u0000${ref.registry}\u0000${ref.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return unique.sort((a, b) => compare(a.path, b.path));
}

// Helpers -------------------------------------------------------------------------------

const isObject = (value: Json): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** RFC 6901 reference token escaping. */
const escapeToken = (token: string): string => token.replace(/~/g, '~0').replace(/\//g, '~1');

const child = (path: string, token: string | number): string =>
  `${path}/${typeof token === 'number' ? token : escapeToken(token)}`;

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sortProblems(problems: SchemaProblem[]): SchemaProblem[] {
  return problems.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
}

function dedupe(problems: SchemaProblem[]): SchemaProblem[] {
  if (problems.length < 2) return problems;
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = `${problem.path}\u0000${problem.code}\u0000${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jsonKind(value: Json): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return 'a string';
  if (typeof value === 'number') return 'a number';
  return 'a boolean';
}

function formatRange(range: NumericRange): string {
  const { min, max, minExclusive, maxExclusive } = range;
  if (min !== undefined && max !== undefined) {
    if (min === max && !minExclusive && !maxExclusive) return `exactly ${min}`;
    return `${minExclusive ? '>' : ''}${min}..${maxExclusive ? '<' : ''}${max}`;
  }
  if (min !== undefined) return `${minExclusive ? 'greater than' : 'at least'} ${min}`;
  if (max !== undefined) return `${maxExclusive ? 'less than' : 'at most'} ${max}`;
  return 'any';
}

function inRange(n: number, range: NumericRange): boolean {
  const { min, max, minExclusive, maxExclusive } = range;
  if (min !== undefined && (minExclusive ? n <= min : n < min)) return false;
  if (max !== undefined && (maxExclusive ? n >= max : n > max)) return false;
  return true;
}

const literalText = (value: string | number | boolean): string =>
  typeof value === 'string' ? JSON.stringify(value) : String(value);

/** A short description of the shape `node` expects, for messages and `expected`. */
export function describeSchemaNode(node: SchemaNode, depth = 0): string {
  switch (node.kind) {
    case 'struct':
      return 'object';
    case 'list':
      return node.primitiveArray !== undefined ? `${node.primitiveArray} array` : 'list';
    case 'tuple':
      return `list of ${node.items.length}`;
    case 'string':
      return node.idRegistry !== undefined ? `${node.idRegistry} id` : 'string';
    case 'number':
      return node.numberKind;
    case 'boolean':
      return 'boolean';
    case 'enum':
      return `one of ${node.values.map((entry) => literalText(entry.value)).join(', ')}`;
    case 'literal':
      return literalText(node.value);
    case 'union':
      if (depth >= MAX_DESCRIBE_DEPTH) return 'union';
      return node.members.map((member) => describeSchemaNode(member, depth + 1)).join(' | ');
    case 'reference': {
      if (depth >= MAX_DESCRIBE_DEPTH) return node.path.split('::').pop() ?? node.path;
      try {
        return describeSchemaNode(node.resolve(), depth + 1);
      } catch {
        return node.path.split('::').pop() ?? node.path;
      }
    }
    case 'dispatcher':
      return `${node.registry} member`;
    case 'any':
    case 'unsupported':
      return 'any';
  }
}

function mismatch(value: Json, node: SchemaNode, state: State, out: SchemaProblem[]): void {
  const expected = describeSchemaNode(node);
  out.push({
    severity: 'error',
    code: 'schema.type-mismatch',
    path: state.path,
    message: `Expected ${expected}, found ${jsonKind(value)}.`,
    expected,
  });
}

/** Per-struct lookup tables, built once per (shared) node. */
interface StructInfo {
  byKey: Map<string, SchemaField>;
  wildcards: SchemaField[];
  required: SchemaField[];
  /** Field names a spread dispatcher reads its key from (`minecraft:item_model[[type]]`). */
  discriminators: Set<string>;
}

const structInfoCache = new WeakMap<SchemaNode, StructInfo>();

function structInfo(node: SchemaNode & { kind: 'struct' }): StructInfo {
  const cached = structInfoCache.get(node);
  if (cached !== undefined) return cached;
  const info: StructInfo = {
    byKey: new Map(),
    wildcards: [],
    required: [],
    discriminators: new Set(),
  };
  for (const field of node.fields) {
    if (field.key === '*') {
      info.wildcards.push(field);
      continue;
    }
    if (!info.byKey.has(field.key)) info.byKey.set(field.key, field);
    if (!field.optional) info.required.push(field);
  }
  for (const spread of node.spreads) {
    const step = spread.kind === 'dispatcher' ? spread.discriminator : [];
    const key = step.length === 1 ? step[0] : undefined;
    if (key !== undefined && key !== '%key' && key !== '%parent') info.discriminators.add(key);
  }
  structInfoCache.set(node, info);
  return info;
}

const hasError = (problems: readonly SchemaProblem[]): boolean =>
  problems.some((problem) => problem.severity === 'error');

const errorCount = (problems: readonly SchemaProblem[]): number =>
  problems.reduce((count, problem) => count + (problem.severity === 'error' ? 1 : 0), 0);

/** A hop that does not descend into the value: same path, one more hop. */
const hop = (state: State): State => ({ ...state, hops: state.hops + 1 });

// Core ----------------------------------------------------------------------------------

function validate(
  value: Json,
  node: SchemaNode,
  state: State,
  ctx: Context,
  out: SchemaProblem[],
): void {
  if (state.depth > ctx.maxDepth || state.hops > ctx.maxDepth) {
    openClaims(state);
    return;
  }
  switch (node.kind) {
    case 'any':
    case 'unsupported':
      openClaims(state);
      return;
    case 'struct':
      validateStruct(value, node, state, ctx, out);
      return;
    case 'list': {
      if (!Array.isArray(value)) {
        mismatch(value, node, state, out);
        return;
      }
      checkLength(value.length, node.lengthRange, node, state, out);
      for (let i = 0; i < value.length; i += 1) {
        validate(value[i] as Json, node.item, itemState(state, i), ctx, out);
      }
      return;
    }
    case 'tuple': {
      if (!Array.isArray(value)) {
        mismatch(value, node, state, out);
        return;
      }
      if (value.length !== node.items.length) {
        out.push({
          severity: 'error',
          code: 'schema.invalid-length',
          path: state.path,
          message: `Expected exactly ${node.items.length} items, found ${value.length}.`,
          expected: describeSchemaNode(node),
        });
      }
      const count = Math.min(value.length, node.items.length);
      for (let i = 0; i < count; i += 1) {
        validate(value[i] as Json, node.items[i] as SchemaNode, itemState(state, i), ctx, out);
      }
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        mismatch(value, node, state, out);
        return;
      }
      checkLength(value.length, node.lengthRange, node, state, out, 'characters');
      if (ctx.refs !== undefined && node.idRegistry !== undefined) {
        const registry = node.idRegistry.startsWith(MC_PREFIX)
          ? node.idRegistry.slice(MC_PREFIX.length)
          : node.idRegistry;
        const id = registryId(value, node.idPath);
        const ref: CollectedReference = { path: state.path, registry, id };
        if (id !== value) ref.written = value;
        if (state.isKey === true) ref.key = true;
        ctx.refs.push(ref);
      }
      const registries = ctx.registries;
      if (node.idRegistry !== undefined && registries !== undefined) {
        const registry = node.idRegistry;
        const known = registries.registries();
        const name = registry.startsWith('minecraft:') ? registry.slice(10) : registry;
        const id = registryId(value, node.idPath);
        if (known.includes(name) && !registries.has(name, id)) {
          const shown = id === value ? '' : ` (${JSON.stringify(id)})`;
          out.push({
            severity: 'warning',
            code: 'schema.unknown-id',
            path: state.path,
            message: `Unknown ${name} id ${JSON.stringify(value)}${shown}.`,
            expected: `${name} id`,
          });
        }
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number') {
        mismatch(value, node, state, out);
        return;
      }
      const integral = node.numberKind !== 'float' && node.numberKind !== 'double';
      if (integral && !Number.isInteger(value)) {
        out.push({
          severity: 'error',
          code: 'schema.not-integer',
          path: state.path,
          message: `Expected a whole number (${node.numberKind}), found ${value}.`,
          expected: node.numberKind,
        });
      }
      if (node.range !== undefined && !inRange(value, node.range)) {
        out.push({
          severity: 'error',
          code: 'schema.out-of-range',
          path: state.path,
          message: `Expected ${node.numberKind} in range ${formatRange(node.range)}, found ${value}.`,
          expected: `${node.numberKind} ${formatRange(node.range)}`,
        });
      }
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') mismatch(value, node, state, out);
      return;
    case 'enum': {
      const expected = describeSchemaNode(node);
      const first = node.values[0];
      const valueType = first === undefined ? 'string' : typeof first.value;
      if (typeof value !== valueType) {
        mismatch(value, node, state, out);
        return;
      }
      const namespaced =
        state.dispatchKey === true || state.resourceId === true || node.resourceId === true;
      const prefixed = namespaced && typeof value === 'string' && value.startsWith(MC_PREFIX);
      const bare = prefixed ? value.slice(MC_PREFIX.length) : value;
      if (!node.values.some((entry) => entry.value === value || entry.value === bare)) {
        out.push({
          severity: 'error',
          code: 'schema.invalid-enum',
          path: state.path,
          message: `Expected ${expected}, found ${literalText(value as string | number)}.`,
          expected,
        });
      }
      return;
    }
    case 'literal': {
      if (value === node.value) return;
      if (typeof value !== typeof node.value) {
        mismatch(value, node, state, out);
        return;
      }
      const expected = literalText(node.value);
      out.push({
        severity: 'error',
        code: 'schema.invalid-literal',
        path: state.path,
        message: `Expected ${expected}, found ${literalText(value as string | number | boolean)}.`,
        expected,
      });
      return;
    }
    case 'union':
      validateUnion(value, node, state, ctx, out);
      return;
    case 'reference': {
      let target: SchemaNode;
      try {
        target = node.resolve();
      } catch {
        // An unknown path (e.g. a dangling reference in the export) cannot be checked.
        openClaims(state);
        return;
      }
      const next = hop(state);
      if (node.resourceId === true) next.resourceId = true;
      validate(value, target, next, ctx, out);
      return;
    }
    case 'dispatcher':
      validateDispatcher(value, node, state, ctx, out);
      return;
  }
}

function itemState(state: State, index: number): State {
  return { path: child(state.path, index), depth: state.depth + 1, hops: 0, open: false };
}

function checkLength(
  length: number,
  range: NumericRange | undefined,
  node: SchemaNode,
  state: State,
  out: SchemaProblem[],
  unit = 'items',
): void {
  if (range === undefined || inRange(length, range)) return;
  out.push({
    severity: 'error',
    code: 'schema.invalid-length',
    path: state.path,
    message: `Expected ${formatRange(range)} ${unit}, found ${length}.`,
    expected: describeSchemaNode(node),
  });
}

function validateStruct(
  value: Json,
  node: SchemaNode & { kind: 'struct' },
  state: State,
  ctx: Context,
  out: SchemaProblem[],
): void {
  if (!isObject(value)) {
    mismatch(value, node, state, out);
    return;
  }
  const info = structInfo(node);
  const siblings: Siblings = { value, path: state.path };
  const allowUnknown = state.open || node.spreads.length > 0;
  // The outermost struct with spreads owns the claims; spread structs add to them.
  const owner = state.claims === undefined && node.spreads.length > 0;
  const claims: Claims | undefined =
    state.claims ?? (owner ? { matched: new Set(), declared: new Set(), open: false } : undefined);
  if (claims !== undefined) for (const key of info.byKey.keys()) claims.declared.add(key);

  for (const field of info.required) {
    if (!Object.hasOwn(value, field.key)) {
      const expected = describeSchemaNode(field.type);
      out.push({
        severity: 'error',
        code: 'schema.missing-field',
        path: child(state.path, field.key),
        message: `Missing required field "${field.key}" (${expected}).`,
        expected,
      });
    }
  }

  for (const key of Object.keys(value)) {
    const entry = value[key] as Json;
    const entryState: State = {
      path: child(state.path, key),
      depth: state.depth + 1,
      hops: 0,
      parentKey: key,
      siblings,
      open: false,
    };
    if (info.discriminators.has(key)) entryState.dispatchKey = true;
    const field = info.byKey.get(key);
    if (field !== undefined) {
      claims?.matched.add(key);
      validate(entry, field.type, entryState, ctx, out);
      continue;
    }
    const wildcard = matchWildcard(key, info.wildcards, entryState, ctx, out);
    if (wildcard !== undefined) {
      claims?.matched.add(key);
      validate(entry, wildcard.type, entryState, ctx, out);
      continue;
    }
    if (!allowUnknown) {
      const known = [...info.byKey.keys()];
      out.push({
        severity: 'error',
        code: 'schema.unknown-field',
        path: entryState.path,
        message:
          known.length === 0
            ? `Unknown field "${key}".`
            : `Unknown field "${key}"; expected one of ${known.slice(0, MAX_LISTED_KEYS).join(', ')}${known.length > MAX_LISTED_KEYS ? ', ...' : ''}.`,
      });
    }
  }

  // Spreads that could not be inlined (dispatchers, mostly) apply to the whole object; their
  // own keys are checked there. A key is unknown when neither the struct nor any spread
  // declares it; when a spread cannot be resolved to fields, every key is allowed.
  const acceptedKeys = acceptedDiscriminators(value, info, state, ctx);
  for (const spread of node.spreads) {
    const spreadState: State = { ...hop(state), siblings, open: true };
    if (claims !== undefined) spreadState.claims = claims;
    if (acceptedKeys.size > 0) spreadState.acceptedKeys = acceptedKeys;
    validate(value, spread, spreadState, ctx, out);
  }
  if (!owner || claims === undefined || claims.open || state.open) return;
  const known = [...claims.declared].sort(compare);
  for (const key of Object.keys(value)) {
    if (claims.matched.has(key)) continue;
    out.push({
      severity: 'error',
      code: 'schema.unknown-field',
      path: child(state.path, key),
      message:
        known.length === 0
          ? `Unknown field "${key}".`
          : `Unknown field "${key}"; expected one of ${known.slice(0, MAX_LISTED_KEYS).join(', ')}${known.length > MAX_LISTED_KEYS ? ', ...' : ''}.`,
    });
  }
}

const MAX_CLOSED_DEPTH = 8;

/** True when `node` only admits a fixed set of values (enum, literal, or a union of them). */
function isClosedType(node: SchemaNode, depth = 0): boolean {
  if (depth > MAX_CLOSED_DEPTH) return false;
  switch (node.kind) {
    case 'enum':
    case 'literal':
      return true;
    case 'union':
      return node.members.length > 0 && node.members.every((m) => isClosedType(m, depth + 1));
    case 'reference':
      try {
        return isClosedType(node.resolve(), depth + 1);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * True when `value` is an id the registry index knows in a registry named by an `#[id]` string
 * in `node` (looking through references and unions), e.g. `minecraft:survives_explosion` for
 * `#[id="loot_condition_type"] string`. False without a registry index.
 */
function isRegisteredId(value: Json, node: SchemaNode, ctx: Context, depth = 0): boolean {
  const registries = ctx.registries;
  if (registries === undefined || typeof value !== 'string' || value.startsWith('#')) return false;
  if (depth > MAX_CLOSED_DEPTH) return false;
  switch (node.kind) {
    case 'string': {
      if (node.idRegistry === undefined) return false;
      const name = node.idRegistry.startsWith(MC_PREFIX)
        ? node.idRegistry.slice(MC_PREFIX.length)
        : node.idRegistry;
      return (
        registries.registries().includes(name) &&
        registries.has(name, registryId(value, node.idPath))
      );
    }
    case 'union':
      return node.members.some((member) => isRegisteredId(value, member, ctx, depth + 1));
    case 'reference':
      try {
        return isRegisteredId(value, node.resolve(), ctx, depth + 1);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * The struct's discriminator fields whose value is valid for a closed field type, or is an id
 * the registry index knows for an `#[id]` string field. Those keys are known to the game even
 * when the dispatcher has no member for them (it then adds no fields).
 */
function acceptedDiscriminators(
  value: JsonObject,
  info: StructInfo,
  state: State,
  ctx: Context,
): ReadonlySet<string> {
  const accepted = new Set<string>();
  for (const key of info.discriminators) {
    const field = info.byKey.get(key);
    if (field === undefined || !Object.hasOwn(value, key)) continue;
    const entry = value[key] as Json;
    if (isRegisteredId(entry, field.type, ctx)) {
      accepted.add(key);
      continue;
    }
    if (!isClosedType(field.type)) continue;
    const problems: SchemaProblem[] = [];
    const fieldState: State = {
      path: child(state.path, key),
      depth: state.depth + 1,
      hops: 0,
      parentKey: key,
      open: false,
      dispatchKey: true,
    };
    // The field itself was already walked; do not collect its references twice.
    const refs = ctx.refs;
    delete ctx.refs;
    try {
      validate(entry, field.type, fieldState, ctx, problems);
    } finally {
      if (refs !== undefined) ctx.refs = refs;
    }
    if (!hasError(problems)) accepted.add(key);
  }
  return accepted;
}

/**
 * Picks the first `'*'` field whose key type accepts `key`. When none does, reports the first
 * one's key problems and still returns it so the value is checked.
 */
function matchWildcard(
  key: string,
  wildcards: readonly SchemaField[],
  state: State,
  ctx: Context,
  out: SchemaProblem[],
): SchemaField | undefined {
  if (wildcards.length === 0) return undefined;
  let firstProblems: SchemaProblem[] | undefined;
  const refs = ctx.refs;
  let firstRefs: CollectedReference[] | undefined;
  try {
    for (const field of wildcards) {
      if (field.keyType === undefined) return field;
      const problems: SchemaProblem[] = [];
      const fieldRefs: CollectedReference[] | undefined = refs === undefined ? undefined : [];
      if (fieldRefs !== undefined) ctx.refs = fieldRefs;
      validate(key, field.keyType, { ...state, open: false, isKey: true }, ctx, problems);
      if (!hasError(problems)) {
        out.push(...problems);
        if (fieldRefs !== undefined) refs?.push(...fieldRefs);
        return field;
      }
      firstProblems ??= problems;
      firstRefs ??= fieldRefs;
    }
  } finally {
    if (refs !== undefined) ctx.refs = refs;
  }
  for (const problem of firstProblems ?? []) {
    out.push({ ...problem, message: `Invalid key "${key}": ${problem.message}` });
  }
  if (firstRefs !== undefined) refs?.push(...firstRefs);
  return wildcards[0];
}

/** Codes that mean "this member does not describe this kind of value at all". */
const SHAPE_CODES: ReadonlySet<SchemaProblemCode> = new Set([
  'schema.type-mismatch',
  'schema.invalid-literal',
  'schema.invalid-enum',
  'schema.no-union-match',
]);

function validateUnion(
  value: Json,
  node: SchemaNode & { kind: 'union' },
  state: State,
  ctx: Context,
  out: SchemaProblem[],
): void {
  if (node.members.length === 0) return;
  let best: SchemaProblem[] | undefined;
  let bestErrors = Number.POSITIVE_INFINITY;
  const memberState = hop(state);
  // References are kept from the member that matched, or else from the closest one.
  const refs = ctx.refs;
  let bestRefs: CollectedReference[] | undefined;
  try {
    for (const member of node.members) {
      const problems: SchemaProblem[] = [];
      const memberRefs: CollectedReference[] | undefined = refs === undefined ? undefined : [];
      if (memberRefs !== undefined) ctx.refs = memberRefs;
      validate(value, member, memberState, ctx, problems);
      if (!hasError(problems)) {
        out.push(...problems);
        if (memberRefs !== undefined) refs?.push(...memberRefs);
        return;
      }
      // A member whose shape does not fit at all ranks below every member that does.
      const shapeMiss = problems.some(
        (problem) => problem.path === state.path && SHAPE_CODES.has(problem.code),
      );
      if (shapeMiss) continue;
      const errors = errorCount(problems);
      if (errors < bestErrors) {
        best = problems;
        bestErrors = errors;
        bestRefs = memberRefs;
      }
    }
  } finally {
    if (refs !== undefined) ctx.refs = refs;
  }
  if (bestRefs !== undefined) refs?.push(...bestRefs);
  const expected = describeSchemaNode(node);
  if (best === undefined) {
    out.push({
      severity: 'error',
      code: 'schema.no-union-match',
      path: state.path,
      message: `No union member matched: expected ${expected}, found ${jsonKind(value)}.`,
      expected,
    });
    return;
  }
  for (const problem of best) {
    out.push({ ...problem, message: `No union member matched; closest: ${problem.message}` });
  }
}

/** Reads a discriminator value; `undefined` when absent or not a scalar. */
function readDiscriminator(
  value: Json,
  steps: readonly string[],
  state: State,
): { key: string | undefined; path: string } {
  if (steps.length === 1 && steps[0] === '%key') {
    return { key: state.parentKey, path: state.path };
  }
  // Without a containing struct (the root, a list item) the value itself is read.
  let current: Json | undefined = state.siblings?.value ?? value;
  let path = state.siblings?.path ?? state.path;
  for (const step of steps) {
    if (current === undefined || !isObject(current)) return { key: undefined, path };
    current = Object.hasOwn(current, step) ? current[step] : undefined;
    path = child(path, step);
  }
  if (typeof current === 'string') return { key: current, path };
  if (typeof current === 'number' || typeof current === 'boolean') {
    return { key: String(current), path };
  }
  return { key: undefined, path };
}

function validateDispatcher(
  value: Json,
  node: SchemaNode & { kind: 'dispatcher' },
  state: State,
  ctx: Context,
  out: SchemaProblem[],
): void {
  const keys = node.keys();
  // A registry the export lacks (or that has nothing in this version) cannot be checked.
  if (keys.length === 0) {
    openClaims(state);
    return;
  }
  const next = hop(state);

  if (node.discriminator.length === 0) {
    const member = node.dispatch('');
    if (member !== undefined) validate(value, member, next, ctx, out);
    else openClaims(state);
    return;
  }
  // Accessors that climb to the parent's parent are not modelled in Phase 1.
  if (
    node.discriminator.includes('%parent') ||
    (node.discriminator.includes('%key') && node.discriminator.length > 1)
  ) {
    openClaims(state);
    return;
  }

  const { key, path } = readDiscriminator(value, node.discriminator, state);
  if (key === undefined) {
    const none = keys.includes('%none') ? node.dispatch('%none') : undefined;
    if (none !== undefined) {
      validate(value, none, next, ctx, out);
      return;
    }
    openClaims(state);
    const name = node.discriminator.join('.');
    out.push({
      severity: 'error',
      code: 'schema.missing-discriminator',
      path,
      message:
        name === '%key'
          ? `Cannot choose a ${node.registry} member without a key.`
          : `Missing "${name}", which selects the ${node.registry} member.`,
      expected: `${node.registry} key`,
    });
    return;
  }
  const member = node.dispatch(key);
  if (member !== undefined) {
    validate(value, member, next, ctx, out);
    return;
  }
  const unknown = keys.includes('%unknown') ? node.dispatch('%unknown') : undefined;
  if (unknown !== undefined) {
    validate(value, unknown, next, ctx, out);
    return;
  }
  // The struct's own field accepted the key (a closed type, or an id the registry index knows):
  // the member simply adds no fields.
  const only = node.discriminator.length === 1 ? node.discriminator[0] : undefined;
  if (only !== undefined && state.acceptedKeys?.has(only) === true) return;
  openClaims(state);
  const listed = keys.filter((entry) => !entry.startsWith('%'));
  const shown = listed.slice(0, MAX_LISTED_KEYS).join(', ');
  out.push({
    severity: 'error',
    code: 'schema.unknown-dispatch-key',
    path,
    message: `Unknown ${node.registry} key ${JSON.stringify(key)}; expected one of ${shown}${listed.length > MAX_LISTED_KEYS ? ', ...' : ''}.`,
    expected: `${node.registry} key`,
  });
}
