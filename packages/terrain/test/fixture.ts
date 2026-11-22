/**
 * Hand-written worldgen files for the engine's tests: MSM's own, written for these tests, with no
 * vanilla file. A small noise world (rolling hills from one noise over a falling gradient, a sea,
 * grass over dirt over stone, sand in one biome) and helpers to vary it.
 */

import type { TerrainSource, TerrainWorldInput, WorldgenFileMap } from '../src/api';

export const FACTS = { dataFolders: [], approximate: [] } as const;

/** The hills: a gradient from +1 at y 0 to -1 at y 128, plus a noise. */
export function hills(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sea_level: 60,
    default_block: { Name: 'minecraft:stone' },
    default_fluid: { Name: 'minecraft:water', Properties: { level: '0' } },
    legacy_random_source: false,
    noise: { min_y: 0, height: 128 },
    noise_router: {
      temperature: 0,
      vegetation: 0,
      continents: 0,
      erosion: 0,
      depth: 0,
      ridges: 0,
      preliminary_surface_level: 64,
      final_density: {
        type: 'minecraft:interpolated',
        cell_size_xz: 4,
        cell_size_y: 8,
        input: {
          type: 'minecraft:add',
          left: {
            type: 'minecraft:gradient',
            axis: 'y',
            from_coordinate: 0,
            from_value: 1,
            to_coordinate: 128,
            to_value: -1,
          },
          right: 'msm:hills/bumps',
        },
      },
    },
    material_rule: 'msm:hills/surface',
    ...extra,
  };
}

export const HILLS_FILES: Record<string, Record<string, unknown>> = {
  'worldgen/noise_settings': { 'msm:hills': hills() },
  'worldgen/density_function': {
    'msm:hills/bumps': {
      type: 'minecraft:mul',
      left: 0.5,
      right: { type: 'minecraft:noise', noise: 'msm:bumps', xz_scale: 1, y_scale: 0 },
    },
  },
  'worldgen/noise': {
    'msm:bumps': {
      base_amplitude: 1,
      base_octave: -5,
      octave_count: 2,
      amplitude_modifiers: [1, 1],
    },
  },
  'worldgen/material_rule': {
    'msm:hills/surface': {
      type: 'minecraft:sequence',
      sequence: [
        {
          type: 'minecraft:condition',
          if_true: { type: 'minecraft:biome', biome_is: ['msm:beach'] },
          then_run: {
            type: 'minecraft:condition',
            if_true: {
              type: 'minecraft:stone_depth',
              offset: 2,
              surface_type: 'floor',
              add_surface_depth: false,
              secondary_depth_range: 0,
            },
            then_run: { type: 'minecraft:block', result_state: { Name: 'minecraft:sand' } },
          },
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
              offset: 0,
              surface_depth_multiplier: 0,
              add_stone_depth: false,
            },
            then_run: {
              type: 'minecraft:block',
              result_state: { Name: 'minecraft:grass_block', Properties: { snowy: 'false' } },
            },
          },
        },
        {
          type: 'minecraft:condition',
          if_true: {
            type: 'minecraft:stone_depth',
            offset: 3,
            surface_type: 'floor',
            add_surface_depth: false,
            secondary_depth_range: 0,
          },
          then_run: { type: 'minecraft:block', result_state: { Name: 'minecraft:dirt' } },
        },
      ],
    },
  },
  'worldgen/biome': { 'msm:meadow': {}, 'msm:beach': {} },
  dimension_type: { 'msm:hills': { min_y: 0, height: 128 } },
};

/** A dimension over the hills with a biome source. */
export function dimension(biomeSource: Record<string, unknown>, settings: unknown = 'msm:hills') {
  return {
    type: 'msm:hills',
    generator: { type: 'minecraft:noise', settings, biome_source: biomeSource },
  };
}

/** Files with the hills and one dimension `msm:test`. */
export function hillsFiles(
  biomeSource: Record<string, unknown> = { type: 'minecraft:fixed', biome: 'msm:meadow' },
  overrides: Record<string, Record<string, unknown>> = {},
): WorldgenFileMap {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [folder, files] of Object.entries(HILLS_FILES)) out[folder] = { ...files };
  out.dimension = { 'msm:test': dimension(biomeSource) };
  for (const [folder, files] of Object.entries(overrides)) {
    out[folder] = { ...(out[folder] ?? {}), ...files };
  }
  return out;
}

/** A world input for the project files alone. */
export function input(
  project: WorldgenFileMap,
  seed = 0n,
  source: TerrainSource = { dimension: 'msm:test' },
  vanilla: WorldgenFileMap | null = null,
): TerrainWorldInput {
  return { files: { vanilla, project }, source, seed, facts: FACTS };
}
