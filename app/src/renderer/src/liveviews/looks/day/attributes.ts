/**
 * Which environment attributes the day strip can draw, derived from the target's own schema
 * (ADR 0121 D6; B619 3S10), not from a hand list: each member of the `minecraft:environment_attribute`
 * dispatcher is read for the type of its `value`, and of a track's keyframe value under a
 * `modifier` (the keyframe's value dispatcher, keyed by the modifier). A value is drawn as a
 * line (numbers), bands (true or false), a colour ribbon (colours) or named steps (a choice: an
 * enum, a literal, a registry id); anything else (a struct, a list, a particle) is structured and
 * the strip names it rather than drawing it.
 */

import type { SchemaField, SchemaIndex, SchemaNode } from '@msm/schemas';

/** The dispatcher of the environment attributes. */
export const ENVIRONMENT_ATTRIBUTE_REGISTRY = 'minecraft:environment_attribute';

/** How a value is drawn on the strip. */
export type ValueKind = 'boolean' | 'number' | 'colour' | 'choice' | 'structured';

/** The value type of an attribute, or of a track's keyframes under a modifier. */
export interface ValueType {
  readonly kind: ValueKind;
  /** For a colour: whether it has an alpha channel (ARGB). */
  readonly alpha?: boolean;
  /** For a choice: the values the schema names (enum values and literals), when it names them. */
  readonly choices?: readonly string[];
  /** For a choice of registry ids: the registry. */
  readonly registry?: string;
  /** For a number: the schema's range, when it gives one. */
  readonly min?: number;
  readonly max?: number;
  /** In plain words, what the type is ("a number", "a structured value: loop, mood, additions"). */
  readonly words: string;
}

/** One attribute of the target. */
export interface AttributeInfo {
  /** The attribute id with its namespace (`minecraft:visual/sky_color`). */
  readonly id: string;
  /** The type of its `value`. */
  readonly value: ValueType;
  /** The modifiers a track may name (`override`, `multiply`, ...), from the schema. */
  readonly modifiers: readonly string[];
}

/** The attributes of one target, by id. */
export interface AttributeTable {
  readonly attributes: ReadonlyMap<string, AttributeInfo>;
  /** The keyframe value type of `attribute`'s track under `modifier` (none: the plain value). */
  keyframeType(attribute: string, modifier: string | undefined): ValueType | null;
  /** The easings the schema names (`linear`, `in_out_sine`, ...). */
  readonly easings: readonly string[];
}

const MAX_DEPTH = 12;

function resolved(node: SchemaNode, depth = 0): SchemaNode {
  let current = node;
  let steps = depth;
  while (current.kind === 'reference' && steps < MAX_DEPTH) {
    current = current.resolve();
    steps += 1;
  }
  return current;
}

/** The leaves of a union (nested unions and references opened). */
function leaves(node: SchemaNode, depth = 0): SchemaNode[] {
  const open = resolved(node);
  if (open.kind !== 'union' || depth > MAX_DEPTH) return [open];
  return open.members.flatMap((member) => leaves(member, depth + 1));
}

function field(node: SchemaNode | undefined, key: string): SchemaField | undefined {
  if (node === undefined) return undefined;
  const open = resolved(node);
  return open.kind === 'struct' ? open.fields.find((entry) => entry.key === key) : undefined;
}

function isColour(node: SchemaNode): boolean {
  return node.tags?.includes('color') ?? false;
}

function structWords(node: SchemaNode): string {
  if (node.kind === 'struct') {
    const keys = node.fields.map((entry) => entry.key).filter((key) => key !== '*');
    return keys.length > 0 ? `a structured value (${keys.join(', ')})` : 'a structured value';
  }
  if (node.kind === 'list' || node.kind === 'tuple') return 'a list';
  if (node.kind === 'dispatcher') return `a ${node.registry.replace(/^minecraft:/, '')} value`;
  return `a ${node.kind} value`;
}

/** How a schema node is drawn. */
export function valueTypeOf(node: SchemaNode): ValueType {
  const parts = leaves(node);
  if (parts.length > 0 && parts.every(isColour)) {
    const alpha = parts.some((part) => part.kind === 'list' && part.lengthRange?.max === 4);
    return { kind: 'colour', alpha, words: alpha ? 'a colour with alpha' : 'a colour' };
  }
  if (parts.length === 1) {
    const only = parts[0] as SchemaNode;
    if (only.kind === 'boolean') return { kind: 'boolean', words: 'true or false' };
    if (only.kind === 'number') {
      return {
        kind: 'number',
        ...(only.range?.min !== undefined ? { min: only.range.min } : {}),
        ...(only.range?.max !== undefined ? { max: only.range.max } : {}),
        words: 'a number',
      };
    }
    if (only.kind === 'string' && only.idRegistry !== undefined) {
      const registry = only.idRegistry.replace(/^minecraft:/, '');
      const name = registry.replaceAll('_', ' ');
      return {
        kind: 'choice',
        registry,
        words: `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name} id`,
      };
    }
  }
  if (
    parts.length > 0 &&
    parts.every(
      (part) =>
        part.kind === 'boolean' ||
        part.kind === 'literal' ||
        part.kind === 'enum' ||
        part.kind === 'string',
    )
  ) {
    const choices: string[] = [];
    for (const part of parts) {
      if (part.kind === 'boolean') choices.push('true', 'false');
      if (part.kind === 'literal') choices.push(String(part.value));
      if (part.kind === 'enum') choices.push(...part.values.map((value) => String(value.value)));
    }
    return { kind: 'choice', choices, words: `one of ${choices.length} values` };
  }
  return { kind: 'structured', words: structWords(resolved(node)) };
}

function enumValues(node: SchemaNode | undefined): string[] {
  if (node === undefined) return [];
  const out: string[] = [];
  for (const part of leaves(node)) {
    if (part.kind === 'enum') out.push(...part.values.map((value) => String(value.value)));
    if (part.kind === 'literal') out.push(String(part.value));
  }
  return out;
}

/** The id with `minecraft:` when it has no namespace. */
export function attributeId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** Reads the attributes of a target's schema. */
export function attributeTable(index: SchemaIndex): AttributeTable {
  const attributes = new Map<string, AttributeInfo>();
  const tracks = new Map<string, SchemaField | undefined>();
  for (const key of index.dispatcherKeys(ENVIRONMENT_ATTRIBUTE_REGISTRY)) {
    if (key.startsWith('%')) continue;
    const node = index.dispatch(ENVIRONMENT_ATTRIBUTE_REGISTRY, key);
    if (node === undefined) continue;
    const id = attributeId(key);
    const value = field(node, 'value');
    const track = field(node, 'attribute_track');
    tracks.set(id, track);
    attributes.set(id, {
      id,
      value:
        value === undefined ? { kind: 'structured', words: 'no value' } : valueTypeOf(value.type),
      modifiers: enumValues(field(track?.type, 'modifier')?.type),
    });
  }
  const easings = enumValues(
    index.has('::java::data::timeline::SimpleEasingType')
      ? index.resolve('::java::data::timeline::SimpleEasingType')
      : undefined,
  );
  return {
    attributes,
    easings,
    keyframeType(attribute, modifier) {
      const id = attributeId(attribute);
      const info = attributes.get(id);
      if (info === undefined) return null;
      const keyframes = field(tracks.get(id)?.type, 'keyframes');
      const list = keyframes === undefined ? undefined : resolved(keyframes.type);
      const item = list?.kind === 'list' ? list.item : undefined;
      const value = field(item, 'value');
      if (value === undefined) return info.value;
      const open = resolved(value.type);
      if (open.kind !== 'dispatcher') return valueTypeOf(open);
      const member =
        open.dispatch(modifier ?? '%none') ?? open.dispatch('%none') ?? open.dispatch('%unknown');
      return member === undefined ? info.value : valueTypeOf(member);
    },
  };
}
