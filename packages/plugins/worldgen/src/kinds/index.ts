/**
 * Element kinds contributed by `@msm/plugin-worldgen` (ADR 0022 D4): one kind per worldgen
 * registry, id `minecraft:<registry>`, schema `resource:<registry>`, kind-folder `<registry>`.
 * Each lowers 1:1 to a JSON file: `dimension` under `target.folders.data.dimension`, the others
 * under `target.folders.data.worldgen` plus the registry name after `worldgen/`.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';
import { WORLDGEN_DEFAULTS } from './defaults';
import { kindId, WORLDGEN_PREFIX, WORLDGEN_REGISTRIES, type WorldgenRegistry } from './registries';

export { VANILLA_END, VANILLA_NETHER, VANILLA_OVERWORLD } from './defaults';
export {
  kindId,
  TIER_A_REGISTRIES,
  TIER_B_REGISTRIES,
  WORLDGEN_REGISTRIES,
  type WorldgenRegistry,
} from './registries';

/**
 * Creates the kind of one registry.
 *
 * @param registry - One of {@link WORLDGEN_REGISTRIES}.
 * @returns The element kind.
 */
export function worldgenKind(registry: WorldgenRegistry): ElementKind {
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
