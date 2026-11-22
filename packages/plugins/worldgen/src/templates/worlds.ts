/**
 * Noise settings for whole worlds of their own (ADR 0119 D11): islands, tall mountains, caves
 * only and an empty sky. Each is one self-contained file of MSM's own recipe, not a copy of a
 * vanilla file: inline density functions over the vanilla `minecraft:surface` noise, named by id
 * (the game has it; the live map needs the player's Minecraft files for it), and an inline
 * surface rule ending in stone, so it also works where noise settings have no `default_block`. Only density function
 * types both targets have are used (no `interpolated`). The Make a world flows of the library
 * write the same kind of land with noises of the project's own.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { noiseSettingsFor } from '../kinds/per-target';
import { ADVANCED } from './shared';

const MIN_Y = -64;
const MAX_Y = 320;

/** A gradient along y that is 0 at `surface` and changes by one every `scale` blocks. */
function surfaceGradient(surface: number, scale: number, minY = MIN_Y, maxY = MAX_Y): Json {
  return {
    type: 'minecraft:gradient',
    axis: 'y',
    from_coordinate: minY,
    from_value: Math.round(((surface - minY) / scale) * 10000) / 10000,
    to_coordinate: maxY,
    to_value: Math.round(((surface - maxY) / scale) * 10000) / 10000,
  };
}

/** The vanilla surface noise, stretched `xzScale` times, the same at every height when `y` is 0. */
const surfaceNoise = (xzScale: number, yScale = 0): Json => ({
  type: 'minecraft:noise',
  noise: 'minecraft:surface',
  xz_scale: xzScale,
  y_scale: yScale,
});

const add = (left: Json, right: Json): Json => ({ type: 'minecraft:add', left, right });
const mul = (left: Json, right: Json): Json => ({ type: 'minecraft:mul', left, right });

const block = (id: string): Json => ({ type: 'minecraft:block', result_state: id });
const BEDROCK_FLOOR: Json = {
  type: 'minecraft:condition',
  if_true: {
    type: 'minecraft:vertical_gradient',
    random_name: 'minecraft:bedrock_floor',
    true_at_and_below: { above_bottom: 0 },
    false_at_and_above: { above_bottom: 5 },
  },
  then_run: block('minecraft:bedrock'),
};

/** Bedrock at the bottom, grass over dirt above the water, sand under it, then stone. */
const LAND_RULE: Json = {
  type: 'minecraft:sequence',
  sequence: [
    BEDROCK_FLOOR,
    {
      type: 'minecraft:condition',
      if_true: {
        type: 'minecraft:stone_depth',
        offset: 0,
        surface_type: 'floor',
        add_surface_depth: true,
        secondary_depth_range: 0,
      },
      then_run: {
        type: 'minecraft:sequence',
        sequence: [
          {
            type: 'minecraft:condition',
            if_true: {
              type: 'minecraft:water',
              offset: -1,
              surface_depth_multiplier: 0,
              add_stone_depth: false,
            },
            then_run: {
              type: 'minecraft:condition',
              if_true: {
                type: 'minecraft:stone_depth',
                offset: 0,
                surface_type: 'floor',
                add_surface_depth: false,
                secondary_depth_range: 0,
              },
              then_run: block('minecraft:grass_block'),
            },
          },
          {
            type: 'minecraft:condition',
            if_true: {
              type: 'minecraft:water',
              offset: -1,
              surface_depth_multiplier: 0,
              add_stone_depth: false,
            },
            then_run: block('minecraft:dirt'),
          },
          block('minecraft:sand'),
        ],
      },
    },
    block('minecraft:stone'),
  ],
};

/** The climate fields every template leaves at 0. */
const QUIET_ROUTER = {
  temperature: 0,
  vegetation: 0,
  continents: 0,
  erosion: 0,
  depth: 0,
  ridges: 0,
  chunk_surface_level: 0,
};

function settings(
  fields: Omit<ElementTemplate, 'data' | 'kind' | 'category'>,
  data: Json,
): ElementTemplate {
  return {
    ...fields,
    kind: 'minecraft:worldgen/noise_settings',
    category: ADVANCED,
    data: (context) => noiseSettingsFor(data, context.target),
  };
}

export const worldTemplates: readonly ElementTemplate[] = [
  settings(
    {
      id: 'noise_settings_islands',
      title: 'Noise settings: islands',
      description:
        'Islands in a sea at height 63: land rises where a stretched surface noise is high and sinks under water where it is low. Grass over dirt on land, sand under water.',
    },
    {
      sea_level: 63,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_block: 'minecraft:stone',
      default_fluid: 'minecraft:water',
      noise: { min_y: MIN_Y, height: MAX_Y - MIN_Y },
      noise_router: {
        ...QUIET_ROUTER,
        final_density: add(
          add(surfaceGradient(61, 24), mul(2, surfaceNoise(0.25))),
          mul(0.15, surfaceNoise(2, 2)),
        ),
      },
      spawn_target: [],
      material_rule: LAND_RULE,
    },
  ),
  settings(
    {
      id: 'noise_settings_mountains',
      title: 'Noise settings: tall mountains',
      description:
        'Tall mountains up to about height 230 over valleys at height 80, with cliffs from a 3D noise. Grass over dirt, stone beneath.',
    },
    {
      sea_level: 63,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_block: 'minecraft:stone',
      default_fluid: 'minecraft:water',
      noise: { min_y: MIN_Y, height: MAX_Y - MIN_Y },
      noise_router: {
        ...QUIET_ROUTER,
        final_density: add(
          add(
            surfaceGradient(80, 64),
            mul(4, { type: 'minecraft:max', left: surfaceNoise(0.12), right: 0 }),
          ),
          mul(0.2, surfaceNoise(1.5, 1.5)),
        ),
      },
      spawn_target: [],
      material_rule: LAND_RULE,
    },
  ),
  settings(
    {
      id: 'noise_settings_caves',
      title: 'Noise settings: caves only',
      description:
        'Solid stone from height 0 to 127 with caverns where a 3D surface noise is high, water lakes below height 20 and bedrock at the bottom. Use it with a dimension type 128 high, without sky light.',
    },
    {
      sea_level: 20,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_block: 'minecraft:stone',
      default_fluid: 'minecraft:water',
      noise: { min_y: 0, height: 128 },
      noise_router: {
        ...QUIET_ROUTER,
        final_density: {
          type: 'minecraft:max',
          left: {
            type: 'minecraft:gradient',
            axis: 'y',
            from_coordinate: 0,
            from_value: 2,
            to_coordinate: 10,
            to_value: -2,
          },
          right: {
            type: 'minecraft:max',
            left: add(0.25, mul(-1, surfaceNoise(1.5, 3))),
            right: {
              type: 'minecraft:gradient',
              axis: 'y',
              from_coordinate: 104,
              from_value: -2,
              to_coordinate: 120,
              to_value: 2,
            },
          },
        },
      },
      spawn_target: [],
      material_rule: {
        type: 'minecraft:sequence',
        sequence: [BEDROCK_FLOOR, block('minecraft:stone')],
      },
    },
  ),
  settings(
    {
      id: 'noise_settings_empty',
      title: 'Noise settings: empty sky',
      description:
        'Nothing at all: air everywhere and no water, for a Skyblock or a world you build from scratch.',
    },
    {
      sea_level: MIN_Y,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_block: 'minecraft:stone',
      default_fluid: 'minecraft:air',
      noise: { min_y: MIN_Y, height: MAX_Y - MIN_Y },
      noise_router: { ...QUIET_ROUTER, final_density: -1 },
      spawn_target: [],
      material_rule: block('minecraft:stone'),
    },
  ),
];
