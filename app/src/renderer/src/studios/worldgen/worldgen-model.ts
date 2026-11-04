/**
 * Pure helpers of the worldgen Studios (plan D7, B80): colour conversion, labels, writes into
 * absent parents, schema navigation and "Used in" for placed features. No React, no session.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { SchemaField, SchemaNode } from '@msm/schemas';
import { childPointer, isJsonObject } from '../../forms/pointer';
import { fieldDispatch, flattenUnion, resolveNode, structShape } from '../../forms/schema-utils';

type JsonObject = { [key: string]: Json };

/** The kind ids the worldgen Studios edit or read. */
export const BIOME_KIND = 'minecraft:worldgen/biome';
export const PLACED_FEATURE_KIND = 'minecraft:worldgen/placed_feature';

/** The highest RGB value a colour field holds. */
const MAX_RGB = 0xffffff;

/**
 * A colour value as `#rrggbb`: an integer RGB, a `#rrggbb` string or a list of three 0–1
 * floats. `null` for anything else (an attribute in its modifier or keyframe form).
 */
export function colourToHex(value: Json | undefined): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RGB) {
    return `#${value.toString(16).padStart(6, '0')}`;
  }
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => typeof part === 'number' && part >= 0 && part <= 1)
  ) {
    return `#${(value as number[])
      .map((part) =>
        Math.round(part * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  }
  return null;
}

/** `#rrggbb` (as an `<input type="color">` reports it) as the integer RGB the game writes. */
export function hexToColour(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Not a #rrggbb colour: ${hex}`);
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * A readable label from a schema key or id: the path after any namespace and `/`, underscores
 * as spaces, `color` spelt `colour`, first letter capitalised (`minecraft:visual/sky_color` is
 * "Sky colour", `underground_ores` is "Underground ores").
 */
export function humanise(key: string): string {
  const last =
    key
      .slice(key.lastIndexOf(':') + 1)
      .split('/')
      .pop() ?? key;
  const words = last.replaceAll('_', ' ').replace(/\bcolor\b/g, 'colour');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The last segment of a key or attribute id (`minecraft:visual/sky_color` is `sky_color`). */
export function shortKey(key: string): string {
  return (
    key
      .slice(key.lastIndexOf(':') + 1)
      .split('/')
      .pop() ?? key
  );
}

/**
 * The edit that sets `value` at `path` under `root`, creating absent objects on the way: the
 * pointer of the deepest existing object on the path and the value to write there.
 *
 * @param root - The element data.
 * @param path - Object keys from the root.
 */
export function writeAt(
  root: Json | undefined,
  path: readonly string[],
  value: Json,
): { pointer: string; value: Json } {
  let pointer = '';
  let current: Json | undefined = root;
  let index = 0;
  while (index < path.length - 1 && isJsonObject(current)) {
    const key = path[index] as string;
    const next: Json | undefined = current[key];
    if (!isJsonObject(next)) break;
    pointer = childPointer(pointer, key);
    current = next;
    index += 1;
  }
  if (!isJsonObject(current)) {
    // Only the root can be a non-object here; replace it.
    let built: Json = value;
    for (let at = path.length - 1; at >= 0; at -= 1) built = { [path[at] as string]: built };
    return { pointer: '', value: built };
  }
  let built: Json = value;
  for (let at = path.length - 1; at > index; at -= 1) built = { [path[at] as string]: built };
  return { pointer: childPointer(pointer, path[index] as string), value: built };
}

/** The struct field `key` of `node` for `value` (spreads and dispatchers included). */
export function fieldOf(
  node: SchemaNode | undefined,
  key: string,
  value?: Json,
): SchemaField | undefined {
  if (node === undefined) return undefined;
  const target = resolveNode(node);
  if (target.kind !== 'struct' && target.kind !== 'dispatcher') return undefined;
  return structShape(target, value).fields.find((field) => field.key === key);
}

/** The map (`'*'`) field of a struct node. */
export function wildcardOf(node: SchemaNode | undefined): SchemaField | undefined {
  if (node === undefined) return undefined;
  const target = resolveNode(node);
  if (target.kind !== 'struct' && target.kind !== 'dispatcher') return undefined;
  return structShape(target, undefined).wildcards[0];
}

/** The item node of a list node (through references and single-member unions). */
export function listItem(node: SchemaNode | undefined): SchemaNode | undefined {
  if (node === undefined) return undefined;
  const target = resolveNode(node);
  if (target.kind === 'list') return target.item;
  if (target.kind === 'union') {
    for (const member of flattenUnion(target)) {
      const resolved = resolveNode(member);
      if (resolved.kind === 'list') return resolved.item;
    }
  }
  return undefined;
}

/**
 * The plain-value node of a map entry keyed by `key` (a biome environment attribute): the
 * first member of the entry type that is a `%key` dispatcher with a member for `key`.
 */
export function entryValueNode(entry: SchemaNode | undefined, key: string): SchemaNode | undefined {
  if (entry === undefined) return undefined;
  const target = resolveNode(entry);
  const members = target.kind === 'union' ? flattenUnion(target) : [entry];
  for (const member of members) {
    const resolved = resolveNode(member);
    if (resolved.kind !== 'dispatcher') continue;
    const field = fieldDispatch(resolved, { parentKey: key });
    if (field?.kind === 'member') return field.member;
  }
  return undefined;
}

/** The literal or enum values of a key or value node (a map's key type, an enum field). */
export function choicesOf(node: SchemaNode | undefined): string[] {
  if (node === undefined) return [];
  const target = resolveNode(node);
  if (target.kind === 'enum') return target.values.map((entry) => String(entry.value));
  if (target.kind === 'literal') return [String(target.value)];
  if (target.kind === 'union') {
    return flattenUnion(target).flatMap((member) => choicesOf(member));
  }
  return [];
}

/** The ids of `feature_lists` (a biome's `features`), as lists of strings per step. */
export function stepLists(features: Json | undefined): (string[] | null)[] {
  if (!Array.isArray(features)) return [];
  return features.map((step) =>
    Array.isArray(step) && step.every((entry) => typeof entry === 'string')
      ? (step as string[])
      : null,
  );
}

/** `minecraft:x` for a bare `x`; other ids unchanged. */
export function normaliseId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** One place a placed feature is used: a biome and a decoration step index. */
export interface FeatureUse {
  biome: string;
  step: number;
}

/**
 * The project biomes whose `features` list `placedFeature`, with the step index of each use,
 * in project order.
 */
export function placedFeatureUses(project: Project, placedFeature: string): FeatureUse[] {
  const wanted = normaliseId(placedFeature);
  const uses: FeatureUse[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== BIOME_KIND || !isJsonObject(element.data)) continue;
      stepLists(element.data.features).forEach((list, step) => {
        if (list?.some((entry) => normaliseId(entry) === wanted)) {
          uses.push({ biome: element.id, step });
        }
      });
    }
  }
  return uses;
}

/** Moves the entry at `from` to `to` in a copy of `list`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/** The object at `value`, or an empty one. */
export function asObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}
