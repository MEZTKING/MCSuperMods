/**
 * The registries this plugin has a kind for, in a stable order (ADR 0022 D4): tier A first,
 * then tier B. The kind id is `minecraft:<registry>`, so `ElementKind.registry` is left unset.
 */

/** Tier A: kinds with templates and (later) studios. */
export const TIER_A_REGISTRIES = Object.freeze([
  'worldgen/biome',
  'worldgen/feature',
  'worldgen/placed_feature',
  'dimension',
  'worldgen/world_preset',
] as const);

/** Tier B: schema-form kinds with one template each. */
export const TIER_B_REGISTRIES = Object.freeze([
  'worldgen/noise_settings',
  'worldgen/density_function',
  'worldgen/noise',
  'worldgen/carver',
  'worldgen/flat_level_generator_preset',
  'worldgen/multi_noise_biome_source_parameter_list',
  'worldgen/block_state_provider',
  'worldgen/material_condition',
  'worldgen/material_rule',
] as const);

/** Every registry with a kind, tier A then tier B. */
export const WORLDGEN_REGISTRIES = Object.freeze([...TIER_A_REGISTRIES, ...TIER_B_REGISTRIES]);

/** A registry with a worldgen kind. */
export type WorldgenRegistry =
  | (typeof TIER_A_REGISTRIES)[number]
  | (typeof TIER_B_REGISTRIES)[number];

/** Prefix of the registries whose folder lives below `target.folders.data.worldgen`. */
export const WORLDGEN_PREFIX = 'worldgen/';

/** The kind id of a registry. */
export const kindId = (registry: WorldgenRegistry): string => `minecraft:${registry}`;
