/**
 * The four worldgen JSON kinds of `@msm/plugin-structures` (ADR 0022): template pools,
 * structures, structure sets and processor lists. Kind id `minecraft:worldgen/<name>`, schema
 * `resource:worldgen/<name>`, kind-folder `worldgen/<name>`, output
 * `data/<ns>/<target.folders.data.worldgen>/<name>/<path>.json`. The kind id without
 * `minecraft:` equals the registry, so `registry` is not set.
 */
import type { ElementKind, Json } from '@msm/plugin-api';
import { lowerWorldgenJson } from '../lowering/json-data';

/** The registries below `worldgen/` with a kind in this plugin, in a stable order. */
export const STRUCTURE_WORLDGEN_REGISTRIES = Object.freeze([
  'template_pool',
  'structure',
  'structure_set',
  'processor_list',
] as const);

/** A registry of {@link STRUCTURE_WORLDGEN_REGISTRIES}. */
export type StructureWorldgenRegistry = (typeof STRUCTURE_WORLDGEN_REGISTRIES)[number];

/** Minimal valid data per kind; only vanilla ids. */
const DEFAULTS: Readonly<Record<StructureWorldgenRegistry, Json>> = {
  template_pool: {
    fallback: 'minecraft:empty',
    elements: [
      {
        weight: 1,
        element: {
          element_type: 'minecraft:single_pool_element',
          location: 'minecraft:village/plains/terminators/terminator_01',
          processors: 'minecraft:empty',
          projection: 'terrain_matching',
        },
      },
    ],
  },
  structure: {
    type: 'minecraft:jigsaw',
    biomes: '#minecraft:is_forest',
    step: 'surface_structures',
    spawn_overrides: {},
    terrain_adaptation: 'none',
    start_pool: 'minecraft:village/plains/town_centers',
    size: 1,
    start_height: { absolute: 0 },
    project_start_to_heightmap: 'WORLD_SURFACE_WG',
    max_distance_from_center: 80,
    use_expansion_hack: false,
  },
  structure_set: {
    structures: [{ structure: 'minecraft:village_plains', weight: 1 }],
    placement: { type: 'minecraft:random_spread', spacing: 32, separation: 8, salt: 14357617 },
  },
  processor_list: { processors: [] },
};

/**
 * Creates the kind of one worldgen registry.
 *
 * @param registry - One of {@link STRUCTURE_WORLDGEN_REGISTRIES}.
 * @returns The element kind.
 */
export function structureWorldgenKind(registry: StructureWorldgenRegistry): ElementKind {
  const name = `worldgen/${registry}`;
  const schema = `resource:${name}`;
  return {
    id: `minecraft:${name}`,
    schema,
    folder: name,
    defaultData: structuredClone(DEFAULTS[registry]),
    lower: (element, target) => lowerWorldgenJson(element, target, registry, schema),
  };
}

/** `minecraft:worldgen/template_pool`. */
export const templatePoolKind: ElementKind = structureWorldgenKind('template_pool');
/** `minecraft:worldgen/structure`. */
export const structureKind: ElementKind = structureWorldgenKind('structure');
/** `minecraft:worldgen/structure_set`. */
export const structureSetKind: ElementKind = structureWorldgenKind('structure_set');
/** `minecraft:worldgen/processor_list`. */
export const processorListKind: ElementKind = structureWorldgenKind('processor_list');
