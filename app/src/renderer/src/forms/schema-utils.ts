/**
 * Pure helpers over `SchemaNode` for the form generator: reference resolution, union
 * flattening and variant inference, struct flattening (spreads and dispatchers) and default
 * values. Nodes are shared and cached by `@msm/schemas`; nothing here mutates them.
 */
import type { Json } from '@msm/core';
import { describeSchemaNode, type SchemaField, type SchemaNode, validateJson } from '@msm/schemas';
import { isJsonObject } from './pointer';

/** Hop limit when following reference chains. */
const MAX_REFERENCE_HOPS = 32;
/** Nesting limit when building default values. */
const MAX_DEFAULT_DEPTH = 8;
const MC_PREFIX = 'minecraft:';

type UnsupportedNode = SchemaNode & { kind: 'unsupported' };
type StructNode = SchemaNode & { kind: 'struct' };
type DispatcherNode = SchemaNode & { kind: 'dispatcher' };
type JsonObject = { [key: string]: Json };

const resolved = new WeakMap<SchemaNode, SchemaNode>();

/**
 * Follows references until a non-reference node, memoised per node. A broken or cyclic
 * chain gives an `unsupported` node, which the form renders as a JSON fallback.
 */
export function resolveNode(node: SchemaNode): SchemaNode {
  if (node.kind !== 'reference') return node;
  const cached = resolved.get(node);
  if (cached !== undefined) return cached;
  let current: SchemaNode = node;
  let result: SchemaNode | undefined;
  for (let hop = 0; hop < MAX_REFERENCE_HOPS && result === undefined; hop++) {
    if (current.kind !== 'reference') {
      result = current;
    } else {
      const reference: SchemaNode & { kind: 'reference' } = current;
      try {
        current = reference.resolve();
      } catch (error) {
        result = unsupported(`Cannot resolve ${reference.path}: ${String(error)}`, 'reference');
      }
    }
  }
  const final =
    result ?? unsupported(`Reference chain from ${node.path} is too long.`, 'reference');
  resolved.set(node, final);
  return final;
}

function unsupported(reason: string, rawKind: string): UnsupportedNode {
  return { kind: 'unsupported', reason, rawKind };
}

/** A node's description, preferring the outer (reference) node's own. */
export function describeNode(node: SchemaNode): string | undefined {
  return node.desc ?? resolveNode(node).desc;
}

/** Short type label for pickers and messages. */
export function typeLabel(node: SchemaNode): string {
  const target = resolveNode(node);
  if (target.kind === 'literal') return JSON.stringify(target.value);
  if (target.kind === 'struct') {
    const required = target.fields.filter((field) => !field.optional && field.key !== '*');
    const literal = target.fields.find(
      (field) => field.key === 'type' && resolveNode(field.type).kind === 'literal',
    );
    if (literal !== undefined) {
      const value = resolveNode(literal.type);
      if (value.kind === 'literal') return `object (type ${JSON.stringify(value.value)})`;
    }
    if (required.length > 0) {
      return `object (${required
        .slice(0, 3)
        .map((field) => field.key)
        .join(', ')})`;
    }
  }
  return describeSchemaNode(target);
}

/** Members of a union with nested unions (also behind references) inlined, in order. */
export function flattenUnion(node: SchemaNode & { kind: 'union' }, depth = 0): SchemaNode[] {
  const out: SchemaNode[] = [];
  for (const member of node.members) {
    const target = resolveNode(member);
    if (target.kind === 'union' && depth < 8) out.push(...flattenUnion(target, depth + 1));
    else out.push(member);
  }
  return out;
}

/** The JSON kind of a value, for matching it against node kinds. */
export function jsonKind(
  value: Json | undefined,
): 'undefined' | 'null' | 'string' | 'number' | 'boolean' | 'array' | 'object' {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as 'string' | 'number' | 'boolean' | 'object';
}

/** True when a value of this JSON kind can satisfy `node` (shape only). */
export function acceptsKind(node: SchemaNode, kind: ReturnType<typeof jsonKind>): boolean {
  const target = resolveNode(node);
  switch (target.kind) {
    case 'struct':
    case 'dispatcher':
      return kind === 'object';
    case 'list':
    case 'tuple':
      return kind === 'array';
    case 'string':
      return kind === 'string';
    case 'number':
      return kind === 'number';
    case 'boolean':
      return kind === 'boolean';
    case 'enum':
      return target.values.some((entry) => typeof entry.value === kind);
    case 'literal':
      return typeof target.value === kind;
    case 'union':
      return flattenUnion(target).some((member) => acceptsKind(member, kind));
    case 'any':
    case 'unsupported':
      return true;
    case 'reference':
      return false;
  }
}

/**
 * Index of the union member that best fits `value`: the first member for `undefined`,
 * otherwise the shape-compatible member with the fewest validation errors (ties go to the
 * earlier member). `-1` when no member accepts the value's JSON kind.
 */
export function inferMember(members: readonly SchemaNode[], value: Json | undefined): number {
  if (value === undefined) return members.length > 0 ? 0 : -1;
  const kind = jsonKind(value);
  let best = -1;
  let bestErrors = Number.POSITIVE_INFINITY;
  members.forEach((member, index) => {
    if (!acceptsKind(member, kind)) return;
    const errors = validateJson(value, member, { maxDepth: 16 }).filter(
      (problem) => problem.severity === 'error',
    ).length;
    if (errors < bestErrors) {
      best = index;
      bestErrors = errors;
    }
  });
  return best;
}

/** Literal values when every member of a (flattened) union is a literal, else `undefined`. */
export function literalChoices(
  node: SchemaNode & { kind: 'union' },
): (string | number | boolean)[] | undefined {
  const members = flattenUnion(node).map(resolveNode);
  if (members.length === 0) return undefined;
  const values: (string | number | boolean)[] = [];
  for (const member of members) {
    if (member.kind !== 'literal') return undefined;
    values.push(member.value);
  }
  return values;
}

/** Dispatcher keys a user may pick (static `%` keywords removed). */
export function pickableKeys(node: DispatcherNode): string[] {
  return node.keys().filter((key) => !key.startsWith('%'));
}

/** Strips a `minecraft:` prefix, as dispatcher keys are stored unprefixed. */
export function stripMinecraft(value: string): string {
  return value.startsWith(MC_PREFIX) ? value.slice(MC_PREFIX.length) : value;
}

/** The member a dispatcher selects for `key`, falling back to `%unknown`. */
export function dispatchMember(
  node: DispatcherNode,
  key: string | undefined,
): SchemaNode | undefined {
  const keys = node.keys();
  if (key === undefined) return keys.includes('%none') ? node.dispatch('%none') : undefined;
  return node.dispatch(key) ?? (keys.includes('%unknown') ? node.dispatch('%unknown') : undefined);
}

/**
 * Where a value sits, for dispatchers that choose their member from outside the value: the
 * object that contains it (a struct field or map entry; absent for the root and list items)
 * and the key it sits under. Mirrors the validator's `siblings` and `parentKey`.
 */
export interface DispatchContext {
  siblings?: JsonObject | undefined;
  parentKey?: string | undefined;
}

/** How a field-position dispatcher resolves for the current sibling or key value. */
export type FieldDispatch =
  | { kind: 'member'; member: SchemaNode; key: string | undefined }
  | {
      kind: 'unresolved';
      reason: 'missing-key' | 'unknown-key' | 'no-keys';
      /** The sibling field name, or `%key`. */
      discriminator: string;
      key: string | undefined;
    };

function scalarKey(raw: Json | undefined): string | undefined {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return undefined;
}

/**
 * A dispatcher in field position whose member is chosen by a sibling field
 * (`minecraft:environment_attribute[[attribute]][value]` under `value`) or by the key the
 * value sits under (`%key`), as `validateJson` reads it. `undefined` when the dispatcher
 * reads its key from the value itself (the root, list items, spreads) or uses an accessor
 * the form does not model; such dispatchers are edited as structs.
 */
export function fieldDispatch(
  node: DispatcherNode,
  context: DispatchContext | undefined,
): FieldDispatch | undefined {
  const steps = node.discriminator;
  const step = steps[0];
  if (steps.length !== 1 || step === undefined || step === '%parent') return undefined;
  let key: string | undefined;
  if (step === '%key') {
    key = context?.parentKey;
    if (key === undefined) return undefined;
  } else {
    const siblings = context?.siblings;
    if (siblings === undefined) return undefined;
    key = scalarKey(Object.hasOwn(siblings, step) ? siblings[step] : undefined);
  }
  if (node.keys().length === 0) {
    return { kind: 'unresolved', reason: 'no-keys', discriminator: step, key };
  }
  const member =
    key === undefined || key === ''
      ? dispatchMember(node, undefined)
      : (node.dispatch(key) ?? node.dispatch(stripMinecraft(key)) ?? dispatchMember(node, key));
  if (member !== undefined) return { kind: 'member', member, key };
  return {
    kind: 'unresolved',
    reason: key === undefined || key === '' ? 'missing-key' : 'unknown-key',
    discriminator: step,
    key,
  };
}

/** A field-keyed dispatcher (`registry[[field]]`) whose key the form edits as a select. */
export interface DiscriminatorField {
  key: string;
  dispatcher: DispatcherNode;
  optional: boolean;
  /** The struct's own field type for `key`, when it declares one. */
  declared?: SchemaField;
}

/** A dispatcher whose member could not be turned into fields. */
export interface OpaqueDispatch {
  dispatcher: DispatcherNode;
  key: string | undefined;
  reason: 'missing-key' | 'unknown-key' | 'not-struct' | 'unsupported-accessor';
}

/** A struct's editable shape for one value: own fields plus fields from spreads. */
export interface StructShape {
  /** Named fields in declaration order, own first; discriminator fields excluded. */
  fields: SchemaField[];
  /** `'*'` fields (map entries). */
  wildcards: SchemaField[];
  discriminators: DiscriminatorField[];
  opaque: OpaqueDispatch[];
  /** Spreads that are neither structs nor dispatchers (cycles, unsupported kinds). */
  unsupportedSpreads: number;
}

/**
 * Flattens a struct (or a bare dispatcher, treated as a struct with one spread) for the
 * given value: spread structs are inlined, and a dispatcher keyed by a field contributes the
 * fields of the member the value selects. `parentKey` feeds `%key` dispatchers.
 */
export function structShape(
  node: StructNode | DispatcherNode,
  value: Json | undefined,
  parentKey?: string,
): StructShape {
  const shape: StructShape = {
    fields: [],
    wildcards: [],
    discriminators: [],
    opaque: [],
    unsupportedSpreads: 0,
  };
  const seen = new Set<string>();
  const object = isJsonObject(value) ? value : undefined;
  const visit = (current: SchemaNode, depth: number): void => {
    const target = resolveNode(current);
    if (depth > 8) {
      shape.unsupportedSpreads += 1;
      return;
    }
    if (target.kind === 'struct') {
      for (const field of target.fields) {
        if (field.key === '*') {
          shape.wildcards.push(field);
        } else if (!seen.has(field.key)) {
          seen.add(field.key);
          shape.fields.push(field);
        }
      }
      for (const spread of target.spreads) visit(spread, depth + 1);
      return;
    }
    if (target.kind === 'dispatcher') {
      visitDispatcher(target, depth);
      return;
    }
    shape.unsupportedSpreads += 1;
  };
  const visitDispatcher = (dispatcher: DispatcherNode, depth: number): void => {
    const steps = dispatcher.discriminator;
    let key: string | undefined;
    if (steps.length === 0) {
      key = '';
    } else if (steps.length === 1 && steps[0] === '%key') {
      key = parentKey;
    } else if (steps.length === 1 && steps[0] !== '%parent') {
      const name = steps[0] as string;
      const raw = object?.[name];
      key = typeof raw === 'string' ? raw : raw === undefined ? undefined : String(raw);
      shape.discriminators.push({ key: name, dispatcher, optional: false });
    } else {
      shape.opaque.push({ dispatcher, key: undefined, reason: 'unsupported-accessor' });
      return;
    }
    const member = steps.length === 0 ? dispatcher.dispatch('') : dispatchMember(dispatcher, key);
    if (member === undefined) {
      // A registry with no keys in this version cannot be checked; say nothing.
      if (dispatcher.keys().length === 0) return;
      shape.opaque.push({
        dispatcher,
        key,
        reason: key === undefined ? 'missing-key' : 'unknown-key',
      });
      return;
    }
    const target = resolveNode(member);
    if (target.kind === 'struct' || target.kind === 'dispatcher') {
      visit(target, depth + 1);
      return;
    }
    if (target.kind === 'any') return;
    shape.opaque.push({ dispatcher, key, reason: 'not-struct' });
  };
  visit(node, 0);
  // A discriminator the struct also declares is edited as the dispatcher select.
  for (const discriminator of shape.discriminators) {
    const index = shape.fields.findIndex((field) => field.key === discriminator.key);
    if (index >= 0) {
      const [declared] = shape.fields.splice(index, 1);
      if (declared !== undefined) {
        discriminator.declared = declared;
        discriminator.optional = declared.optional;
      }
    }
  }
  return shape;
}

/**
 * A default value for a newly added field, item or variant. `context` places the value (its
 * containing object and key) so field-position dispatchers default to the selected member.
 */
export function defaultValue(node: SchemaNode, depth = 0, context?: DispatchContext): Json {
  const target = resolveNode(node);
  if (depth > MAX_DEFAULT_DEPTH) return target.kind === 'list' || target.kind === 'tuple' ? [] : {};
  switch (target.kind) {
    case 'string':
      return '';
    case 'number':
      return defaultNumber(target.range, target.numberKind);
    case 'boolean':
      return false;
    case 'literal':
      return target.value;
    case 'enum':
      return target.values[0]?.value ?? '';
    case 'list': {
      const count = target.lengthRange?.min ?? 0;
      return Array.from({ length: Math.max(0, Math.min(count, 64)) }, () =>
        defaultValue(target.item, depth + 1),
      );
    }
    case 'tuple':
      return target.items.map((item) => defaultValue(item, depth + 1));
    case 'union': {
      const first = flattenUnion(target)[0];
      return first === undefined ? null : defaultValue(first, depth + 1, context);
    }
    case 'dispatcher': {
      const field = fieldDispatch(target, context);
      if (field?.kind === 'member') return defaultValue(field.member, depth + 1, context);
      if (field !== undefined) return {};
      return defaultObject(target, {}, depth);
    }
    case 'struct':
      return defaultObject(target, {}, depth);
    case 'any':
    case 'unsupported':
    case 'reference':
      return {};
  }
}

/**
 * Fills the required fields of `node` that `base` lacks, choosing the first dispatcher key
 * for a missing discriminator. `base` is copied, never mutated.
 */
export function defaultObject(
  node: StructNode | DispatcherNode,
  base: { [key: string]: Json },
  depth = 0,
): { [key: string]: Json } {
  const out: { [key: string]: Json } = { ...base };
  // Pick discriminators first so the member's required fields are known.
  for (let round = 0; round < 4; round++) {
    const shape = structShape(node, out);
    let changed = false;
    for (const discriminator of shape.discriminators) {
      if (out[discriminator.key] !== undefined || discriminator.optional) continue;
      const first = pickableKeys(discriminator.dispatcher)[0];
      if (first !== undefined) {
        out[discriminator.key] = first;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const shape = structShape(node, out);
  const declared = new Set(shape.fields.map((field) => field.key));
  // A required field whose dispatcher reads a sibling: choose the sibling's key first.
  for (const field of shape.fields) {
    if (field.optional || out[field.key] !== undefined) continue;
    const target = resolveNode(field.type);
    if (target.kind !== 'dispatcher' || target.discriminator.length !== 1) continue;
    const sibling = target.discriminator[0];
    if (sibling === undefined || sibling.startsWith('%') || !declared.has(sibling)) continue;
    if (out[sibling] !== undefined && out[sibling] !== '') continue;
    const first = pickableKeys(target)[0];
    if (first !== undefined) out[sibling] = first;
  }
  for (const field of shape.fields) {
    if (field.optional || out[field.key] !== undefined) continue;
    out[field.key] = defaultValue(field.type, depth + 1, { siblings: out, parentKey: field.key });
  }
  return out;
}

function defaultNumber(
  range: { min?: number; max?: number; minExclusive?: boolean } | undefined,
  numberKind: string,
): number {
  const integer = numberKind !== 'float' && numberKind !== 'double';
  let value = 0;
  if (range?.min !== undefined && value <= range.min) {
    value = range.min + (range.minExclusive === true ? (integer ? 1 : 0.1) : 0);
  }
  if (range?.max !== undefined && value > range.max) value = range.max;
  return value;
}

/** True for float and double numbers. */
export function isFractional(numberKind: string): boolean {
  return numberKind === 'float' || numberKind === 'double';
}

/** Scalar node kinds that sit inline in a compact row. */
export function isScalar(node: SchemaNode): boolean {
  const target = resolveNode(node);
  return (
    target.kind === 'number' ||
    target.kind === 'string' ||
    target.kind === 'boolean' ||
    target.kind === 'enum' ||
    target.kind === 'literal'
  );
}

/** A short fixed-length list of scalars (a vector such as `from`), edited as one row. */
export function isInlineList(node: SchemaNode & { kind: 'list' }): boolean {
  const min = node.lengthRange?.min;
  return min !== undefined && min === node.lengthRange?.max && min <= 4 && isScalar(node.item);
}
