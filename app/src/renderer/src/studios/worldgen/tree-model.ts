/**
 * Pure helpers of the Tree Feature Studio (ADR 0068 D5, B270): which configured features are
 * trees, the placer and decorator types of the target's vendored registries, the three shapes
 * a block state provider takes (one block, a reference to a registered provider, or another
 * typed provider) and the leaf state a tree's project leaves need. No React, no session.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { isJsonObject } from '../../forms/pointer';
import { normaliseId } from './worldgen-model';

type JsonObject = { [key: string]: Json };

/** The configured feature kind; the Studio edits its `minecraft:tree` elements. */
export const FEATURE_KIND = 'minecraft:worldgen/feature';
/** The feature type the Studio edits. */
export const TREE_TYPE = 'minecraft:tree';
/** The block kind whose `leaves` elements get the tree leaf state. */
const BLOCK_KIND = 'msm:block';

/** The vendored registries the Studio's pickers read (mcmeta `registries.json` names). */
export const TREE_REGISTRIES = {
  trunkPlacer: 'worldgen/trunk_placer_type',
  foliagePlacer: 'worldgen/foliage_placer_type',
  decorator: 'worldgen/tree_decorator_type',
  provider: 'worldgen/block_state_provider',
} as const;

/**
 * The leaf state vanilla trees place (`oak.json`): as far from a log as leaves count, and not
 * persistent, so the leaves decay once the trunk is gone. Project leaves get it filled in.
 */
export const TREE_LEAVES_STATE: Readonly<Record<string, string>> = {
  distance: '7',
  persistent: 'false',
};

/** Whether `data` is a configured feature of type `minecraft:tree`. */
export function isTreeFeature(data: Json | undefined): boolean {
  return (
    isJsonObject(data) && typeof data.type === 'string' && normaliseId(data.type) === TREE_TYPE
  );
}

/**
 * The namespaced ids of one vendored registry, sorted (`straight_trunk_placer` becomes
 * `minecraft:straight_trunk_placer`); `[]` when the target does not vendor it.
 *
 * @param vanilla - `SchemaContext.vanillaRegistries` of the project's target.
 * @param registry - A registry name such as {@link TREE_REGISTRIES}.trunkPlacer.
 */
export function registryTypes(
  vanilla: Readonly<Record<string, readonly string[]>>,
  registry: string,
): string[] {
  return (vanilla[registry] ?? []).map(normaliseId).sort();
}

/** A block state provider as the Studio sees it. */
export type ProviderShape =
  /** One block: `{ id, properties? }`, or a `minecraft:simple` provider of one block. */
  | {
      mode: 'block';
      id: string;
      properties: Readonly<Record<string, string>>;
      /** Whether it is written as a `minecraft:simple` provider. */
      simple: boolean;
    }
  /** A registered provider such as `minecraft:soil_beneath_tree`. */
  | { mode: 'reference'; id: string }
  /** Any other typed provider (weighted, noise, rule based…), edited under Advanced. */
  | { mode: 'other'; type: string }
  /** No provider. */
  | { mode: 'absent' };

function stringProperties(value: Json | undefined): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return null;
    out[key] = entry;
  }
  return out;
}

/** A full block state `{ id, properties? }` with string properties, or `null`. */
function fullBlockState(
  value: Json | undefined,
): { id: string; properties: Record<string, string> } | null {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.type !== undefined) return null;
  const properties = stringProperties(value.properties);
  return properties === null ? null : { id: value.id, properties };
}

/** How the provider `value` reads. */
export function readProvider(value: Json | undefined): ProviderShape {
  if (value === undefined) return { mode: 'absent' };
  if (typeof value === 'string') return { mode: 'reference', id: value };
  const full = fullBlockState(value);
  if (full !== null) return { mode: 'block', ...full, simple: false };
  if (isJsonObject(value) && typeof value.type === 'string') {
    if (normaliseId(value.type) === 'minecraft:simple') {
      const state = value.state;
      if (typeof state === 'string') {
        return { mode: 'block', id: state, properties: {}, simple: true };
      }
      const inner = fullBlockState(state);
      if (inner !== null) return { mode: 'block', ...inner, simple: true };
    }
    return { mode: 'other', type: value.type };
  }
  return { mode: 'other', type: '' };
}

/**
 * The provider of one block, in the form `previous` used (`minecraft:simple` stays simple,
 * anything else becomes `{ id, properties? }`, as vanilla's tree features write it).
 */
export function blockProvider(
  id: string,
  properties: Readonly<Record<string, string>>,
  previous: Json | undefined,
): Json {
  const state: JsonObject =
    Object.keys(properties).length === 0 ? { id } : { id, properties: { ...properties } };
  const shape = readProvider(previous);
  if (shape.mode === 'block' && shape.simple && isJsonObject(previous)) {
    return { ...previous, state: Object.keys(properties).length === 0 ? id : state };
  }
  return state;
}

/** The ids of the project's `msm:block` elements of type `leaves`, normalised. */
export function projectLeaves(project: Project): Set<string> {
  const out = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== BLOCK_KIND || !isJsonObject(element.data)) continue;
      if (element.data.type === 'leaves') out.add(normaliseId(element.id));
    }
  }
  return out;
}

/** `properties` with {@link TREE_LEAVES_STATE} filled in (its values win). */
export function withLeavesState(
  properties: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...properties, ...TREE_LEAVES_STATE };
}

/**
 * Whether a block provider names project leaves without the tree leaf state, so the Studio
 * offers to fill it in.
 */
export function lacksLeavesState(shape: ProviderShape, leaves: ReadonlySet<string>): boolean {
  if (shape.mode !== 'block' || !leaves.has(normaliseId(shape.id))) return false;
  return Object.entries(TREE_LEAVES_STATE).some(([key, value]) => shape.properties[key] !== value);
}
