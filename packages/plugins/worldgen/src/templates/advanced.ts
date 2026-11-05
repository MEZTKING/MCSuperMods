/**
 * One template per tier-B registry (ADR 0022 D4): a minimal file that loads, built from
 * constants and vanilla ids only, for the schema form to take further.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { noiseSettingsFor } from '../kinds/per-target';
import { ADVANCED, fixed } from './shared';

/** A surface rule: bedrock at the bottom, grass and dirt on top above sea level, else stone. */
const SURFACE_RULE: Json = {
  type: 'minecraft:sequence',
  sequence: [
    {
      type: 'minecraft:condition',
      if_true: {
        type: 'minecraft:vertical_gradient',
        random_name: 'minecraft:bedrock_floor',
        true_at_and_below: { above_bottom: 0 },
        false_at_and_above: { above_bottom: 5 },
      },
      then_run: { type: 'minecraft:block', result_state: 'minecraft:bedrock' },
    },
    {
      type: 'minecraft:condition',
      if_true: {
        type: 'minecraft:stone_depth',
        offset: 0,
        surface_type: 'floor',
        add_surface_depth: false,
        secondary_depth_range: 0,
      },
      then_run: {
        type: 'minecraft:condition',
        if_true: {
          type: 'minecraft:water',
          offset: -1,
          surface_depth_multiplier: 0,
          add_stone_depth: false,
        },
        then_run: { type: 'minecraft:block', result_state: 'minecraft:grass_block' },
      },
    },
    {
      type: 'minecraft:condition',
      if_true: {
        type: 'minecraft:stone_depth',
        offset: 0,
        surface_type: 'floor',
        add_surface_depth: true,
        secondary_depth_range: 0,
      },
      then_run: { type: 'minecraft:block', result_state: 'minecraft:dirt' },
    },
  ],
};

/**
 * A noise settings template: `data` carries `default_block` and is shaped per target
 * (ADR 0036 D8).
 */
function perTargetNoiseSettings(fields: Omit<ElementTemplate, 'data'>, data: Json): ElementTemplate {
  return { ...fields, data: (context) => noiseSettingsFor(data, context.target) };
}

export const advancedTemplates: readonly ElementTemplate[] = [
  perTargetNoiseSettings(
    {
      id: 'noise_settings',
      kind: 'minecraft:worldgen/noise_settings',
      category: ADVANCED,
      title: 'Noise settings: gentle hills',
      description:
        'Terrain from a height gradient plus one noise, with water at sea level and a simple grass, dirt and bedrock surface.',
    },
    {
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
          type: 'minecraft:add',
          left: {
            type: 'minecraft:gradient',
            axis: 'y',
            from_coordinate: 32,
            to_coordinate: 96,
            from_value: 1,
            to_value: -1,
          },
          right: {
            type: 'minecraft:noise',
            noise: 'minecraft:surface',
            xz_scale: 0.25,
            y_scale: 0,
          },
        },
      },
      spawn_target: [],
      material_rule: SURFACE_RULE,
    },
  ),
  fixed(
    {
      id: 'density_function',
      kind: 'minecraft:worldgen/density_function',
      category: ADVANCED,
      title: 'Density function: noise',
      description:
        'Samples a vanilla noise, scaled horizontally; reference it from noise settings.',
    },
    { type: 'minecraft:noise', noise: 'minecraft:surface', xz_scale: 0.5, y_scale: 0 },
  ),
  fixed(
    {
      id: 'noise',
      kind: 'minecraft:worldgen/noise',
      category: ADVANCED,
      title: 'Noise',
      description: 'Noise parameters with three octaves starting at a large scale.',
    },
    { base_octave: -7, octave_count: 3, amplitude_modifiers: [1, 1, 0.5] },
  ),
  fixed(
    {
      id: 'carver',
      kind: 'minecraft:worldgen/carver',
      category: ADVANCED,
      title: 'Carver: caves',
      description: 'Cave tunnels between the bottom of the world and y 180; list it in a biome.',
    },
    {
      type: 'minecraft:cave',
      probability: 0.15,
      y: {
        type: 'minecraft:uniform',
        min_inclusive: { above_bottom: 8 },
        max_inclusive: { absolute: 180 },
      },
      count: { type: 'minecraft:uniform', min_inclusive: 1, max_inclusive: 3 },
      thickness: { type: 'minecraft:uniform', min_inclusive: 0.1, max_exclusive: 0.9 },
      room_vertical_radius_multiplier: 1,
      horizontal_radius_multiplier: 1,
      vertical_radius_multiplier: 1,
      floor_level: -0.7,
    },
  ),
  fixed(
    {
      id: 'flat_level_generator_preset',
      kind: 'minecraft:worldgen/flat_level_generator_preset',
      category: ADVANCED,
      title: 'Superflat preset',
      description: 'A superflat preset of bedrock, stone, dirt and grass in the plains biome.',
    },
    {
      display: 'minecraft:grass_block',
      settings: {
        biome: 'minecraft:plains',
        lakes: false,
        features: false,
        layers: [
          { block: 'minecraft:bedrock', height: 1 },
          { block: 'minecraft:stone', height: 3 },
          { block: 'minecraft:dirt', height: 2 },
          { block: 'minecraft:grass_block', height: 1 },
        ],
      },
    },
  ),
  fixed(
    {
      id: 'multi_noise_biome_source_parameter_list',
      kind: 'minecraft:worldgen/multi_noise_biome_source_parameter_list',
      category: ADVANCED,
      title: 'Multi-noise parameter list',
      description: 'A named parameter list using the vanilla overworld biome layout.',
    },
    { preset: 'minecraft:overworld' },
  ),
  fixed(
    {
      id: 'block_state_provider',
      kind: 'minecraft:worldgen/block_state_provider',
      category: ADVANCED,
      title: 'Block state provider: stone mix',
      description: 'Picks stone, andesite or cobblestone by weight; reference it from features.',
    },
    {
      type: 'minecraft:weighted',
      entries: [
        { data: 'minecraft:stone', weight: 3 },
        { data: 'minecraft:andesite', weight: 1 },
        { data: 'minecraft:cobblestone', weight: 1 },
      ],
    },
  ),
  fixed(
    {
      id: 'material_condition',
      kind: 'minecraft:worldgen/material_condition',
      category: ADVANCED,
      title: 'Material condition: above sea level',
      description: 'True at and above y 63; use it in surface rules.',
    },
    {
      type: 'minecraft:y_above',
      anchor: { absolute: 63 },
      surface_depth_multiplier: 0,
      add_stone_depth: false,
    },
  ),
  fixed(
    {
      id: 'material_rule',
      kind: 'minecraft:worldgen/material_rule',
      category: ADVANCED,
      title: 'Material rule: grass and dirt',
      description: 'A surface rule that places bedrock at the bottom and grass over dirt on top.',
    },
    SURFACE_RULE,
  ),
];
