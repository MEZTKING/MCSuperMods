/**
 * Minimal valid data for a new element of each worldgen kind. Only `minecraft:` ids, so a new
 * element loads before the user points it at their own biomes or features. No version facts:
 * a biome starts with an empty `features` list (the schema accepts up to one list per
 * decoration step, so fewer lists are valid) and the steps are labelled from
 * `target.worldgen.featureSteps` by the host.
 */
import type { Json } from '@msm/plugin-api';
import type { WorldgenRegistry } from './registries';

/** A vanilla dimension as the default world preset writes it: the overworld. */
export const VANILLA_OVERWORLD: Json = {
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:overworld',
    biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
  },
};

/** The vanilla nether dimension. */
export const VANILLA_NETHER: Json = {
  type: 'minecraft:the_nether',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:nether',
    biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
  },
};

/** The vanilla end dimension. */
export const VANILLA_END: Json = {
  type: 'minecraft:the_end',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:end',
    biome_source: { type: 'minecraft:the_end' },
  },
};

export const WORLDGEN_DEFAULTS: Readonly<Record<WorldgenRegistry, Json>> = {
  'worldgen/biome': {
    has_precipitation: true,
    temperature: 0.8,
    downfall: 0.4,
    effects: { water_color: 4159204 },
    carvers: [],
    features: [],
  },
  'worldgen/feature': {
    type: 'minecraft:simple_block',
    to_place: { type: 'minecraft:simple', state: 'minecraft:short_grass' },
  },
  'worldgen/placed_feature': {
    feature: 'minecraft:oak',
    placement: [],
  },
  dimension: {
    type: 'minecraft:overworld',
    generator: {
      type: 'minecraft:noise',
      settings: 'minecraft:overworld',
      biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' },
    },
  },
  'worldgen/world_preset': {
    dimensions: {
      'minecraft:overworld': VANILLA_OVERWORLD,
      'minecraft:the_nether': VANILLA_NETHER,
      'minecraft:the_end': VANILLA_END,
    },
  },
  'worldgen/noise_settings': {
    sea_level: 63,
    disable_mob_generation: false,
    legacy_random_source: false,
    default_block: 'minecraft:stone',
    default_fluid: 'minecraft:water',
    noise: { min_y: -64, height: 384 },
    noise_router: {
      temperature: 0,
      vegetation: 0,
      continents: 0,
      erosion: 0,
      depth: 0,
      ridges: 0,
      chunk_surface_level: 0,
      final_density: {
        type: 'minecraft:gradient',
        axis: 'y',
        from_coordinate: -64,
        to_coordinate: 320,
        from_value: 1,
        to_value: -1,
      },
    },
    spawn_target: [],
    material_rule: { type: 'minecraft:block', result_state: 'minecraft:stone' },
  },
  'worldgen/density_function': { type: 'minecraft:constant', value: 0 },
  'worldgen/noise': { base_octave: -7, octave_count: 2 },
  'worldgen/carver': {
    type: 'minecraft:cave',
    probability: 0.1,
    y: {
      type: 'minecraft:uniform',
      min_inclusive: { above_bottom: 8 },
      max_inclusive: { absolute: 180 },
    },
    count: 1,
    thickness: 1,
    room_vertical_radius_multiplier: 1,
    horizontal_radius_multiplier: 1,
    vertical_radius_multiplier: 1,
    floor_level: -0.7,
  },
  'worldgen/flat_level_generator_preset': {
    display: 'minecraft:grass_block',
    settings: {
      biome: 'minecraft:plains',
      layers: [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:dirt', height: 2 },
        { block: 'minecraft:grass_block', height: 1 },
      ],
    },
  },
  'worldgen/multi_noise_biome_source_parameter_list': { preset: 'minecraft:overworld' },
  'worldgen/block_state_provider': {
    type: 'minecraft:simple',
    state: 'minecraft:stone',
  },
  'worldgen/material_condition': {
    type: 'minecraft:y_above',
    anchor: { absolute: 63 },
    surface_depth_multiplier: 0,
    add_stone_depth: false,
  },
  'worldgen/material_rule': { type: 'minecraft:block', result_state: 'minecraft:stone' },
};
