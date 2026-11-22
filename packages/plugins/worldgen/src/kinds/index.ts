/**
 * Element kinds contributed by `@msm/plugin-worldgen` (ADR 0022 D4): one kind per worldgen
 * registry, id `minecraft:<registry>`, schema `resource:<registry>`, kind-folder `<registry>`.
 * Each lowers 1:1 to a JSON file: `dimension` under `target.folders.data.dimension`, the others
 * under `target.folders.data.worldgen` plus the registry name after `worldgen/`.
 */
import type { ElementKind, TargetFacts } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';
import { WORLDGEN_DEFAULTS } from './defaults';
import { noiseSettingsFor } from './per-target';
import { kindId, WORLDGEN_PREFIX, WORLDGEN_REGISTRIES, type WorldgenRegistry } from './registries';

export { VANILLA_END, VANILLA_NETHER, VANILLA_OVERWORLD } from './defaults';
export { noiseSettingsFor, noiseSettingsHaveDefaultBlock } from './per-target';
export {
  kindId,
  TIER_A_REGISTRIES,
  TIER_B_REGISTRIES,
  WORLDGEN_REGISTRIES,
  type WorldgenRegistry,
} from './registries';

/**
 * The registries the preview panel draws as a live world map (ADR 0119 D7, B582): dimensions
 * and world presets by themselves, the rest inside a world that uses them (the panel's "Seen
 * in"). The climate map is a tab of that view.
 */
export const WORLDGEN_MAP_REGISTRIES: readonly WorldgenRegistry[] = Object.freeze([
  'dimension',
  'worldgen/world_preset',
  'worldgen/noise_settings',
  'worldgen/biome',
  'worldgen/multi_noise_biome_source_parameter_list',
  'worldgen/flat_level_generator_preset',
  'worldgen/material_rule',
  'worldgen/material_condition',
]);

/**
 * The rest of the worldgen kinds the preview panel draws live (ADR 0119 D7, B585), also as
 * `previewKind: 'worldgen_map'` (the panel's map picks the view by the element's kind): a
 * **Value map** for density functions and noises, a **Scatter** of flat land for features, placed
 * features and block state providers, and for carvers a line saying their caves show only in the
 * game (limit WL4).
 */
export const WORLDGEN_VALUE_REGISTRIES: readonly WorldgenRegistry[] = Object.freeze([
  'worldgen/density_function',
  'worldgen/noise',
]);

/** See {@link WORLDGEN_VALUE_REGISTRIES}: the kinds drawn as a Scatter. */
export const WORLDGEN_SCATTER_REGISTRIES: readonly WorldgenRegistry[] = Object.freeze([
  'worldgen/feature',
  'worldgen/placed_feature',
  'worldgen/block_state_provider',
]);

/** Every registry with a live view in the preview panel (B582's maps and B585's views). */
export const WORLDGEN_PREVIEW_REGISTRIES: readonly WorldgenRegistry[] = Object.freeze([
  ...WORLDGEN_MAP_REGISTRIES,
  ...WORLDGEN_VALUE_REGISTRIES,
  ...WORLDGEN_SCATTER_REGISTRIES,
  'worldgen/carver',
]);

/**
 * Creates the kind of one registry.
 *
 * @param registry - One of {@link WORLDGEN_REGISTRIES}.
 * @returns The element kind.
 */
export function worldgenKind(registry: WorldgenRegistry): ElementKind {
  // Noise settings also get `defaultDataFor` (ADR 0036 D8): `defaultData` keeps the shape
  // with `default_block` for hosts that do not call it.
  const schema = `resource:${registry}`;
  const lower: ElementKind['lower'] = registry.startsWith(WORLDGEN_PREFIX)
    ? (element, target) =>
        lowerJsonData(element, target, 'worldgen', schema, registry.slice(WORLDGEN_PREFIX.length))
    : (element, target) => lowerJsonData(element, target, 'dimension', schema);
  return {
    id: kindId(registry),
    schema,
    folder: registry,
    defaultData: structuredClone(WORLDGEN_DEFAULTS[registry]),
    ...(registry === 'worldgen/noise_settings'
      ? {
          defaultDataFor: (target: TargetFacts) =>
            noiseSettingsFor(WORLDGEN_DEFAULTS[registry], target),
        }
      : {}),
    ...(WORLDGEN_PREVIEW_REGISTRIES.includes(registry) ? { previewKind: 'worldgen_map' } : {}),
    lower,
  };
}

/** Every kind this plugin contributes, tier A then tier B. */
export const worldgenKinds: readonly ElementKind[] = Object.freeze(
  WORLDGEN_REGISTRIES.map(worldgenKind),
);

/** The kind of `registry`. */
export function kindFor(registry: WorldgenRegistry): ElementKind {
  const kind = worldgenKinds.find((entry) => entry.id === kindId(registry));
  if (kind === undefined) throw new Error(`No worldgen kind for ${registry}.`);
  return kind;
}
