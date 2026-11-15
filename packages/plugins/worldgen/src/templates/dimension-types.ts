/**
 * Dimension type templates (ADR 0100): a moon (black sky full of stars, the sun standing still,
 * no sleeping) and a Nether-like type (no sky, a ceiling, fast lava, evaporating water and beds
 * that explode). Environment attributes the target does not list
 * (`worldgen.environmentAttributes`) are left out, so each template is valid on every target.
 * Vanilla has no gravity setting per dimension; the Rules can give players an effect there.
 */
import type { ElementTemplate, Json, TargetFacts } from '@msm/plugin-api';
import { DIMENSIONS } from './shared';

type JsonObject = { [key: string]: Json };

/** `attributes` without the ids the target does not list (all of them without a list). */
export function attributesFor(target: TargetFacts, attributes: JsonObject): JsonObject {
  const known = target.worldgen.environmentAttributes;
  if (known === undefined) return attributes;
  const set = new Set(known);
  return Object.fromEntries(Object.entries(attributes).filter(([id]) => set.has(id)));
}

/** A bed that explodes when used, as in the Nether and the End. */
const EXPLODING_BED: JsonObject = {
  can_set_spawn: 'never',
  can_sleep: 'never',
  destroy_on_use: true,
};

const moon = (target: TargetFacts): Json => ({
  has_skylight: true,
  has_ceiling: false,
  has_ender_dragon_fight: false,
  coordinate_scale: 1,
  ambient_light: 0.1,
  min_y: 0,
  height: 256,
  logical_height: 256,
  infiniburn: '#minecraft:infiniburn_overworld',
  monster_spawn_light_level: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 7 },
  monster_spawn_block_light_limit: 0,
  skybox: 'overworld',
  has_fixed_time: true,
  timelines: '#minecraft:universal',
  attributes: attributesFor(target, {
    'minecraft:visual/sky_color': '#000000',
    'minecraft:visual/fog_color': '#0b0b14',
    // Clouds fully see-through: a moon has no air.
    'minecraft:visual/cloud_color': '#00ffffff',
    'minecraft:visual/sun_angle': 60,
    'minecraft:visual/moon_angle': 240,
    'minecraft:visual/star_angle': 60,
    'minecraft:visual/star_brightness': 1,
    'minecraft:gameplay/monsters_burn': false,
    'minecraft:gameplay/bed_rule': { can_set_spawn: 'always', can_sleep: 'never' },
    'minecraft:gameplay/straw_bed_rule': { can_set_spawn: 'never', can_sleep: 'never' },
    'minecraft:gameplay/can_start_raid': false,
    'minecraft:gameplay/can_pillager_patrol_spawn': false,
  }),
});

const netherLike = (target: TargetFacts): Json => ({
  has_skylight: false,
  has_ceiling: true,
  has_ender_dragon_fight: false,
  coordinate_scale: 8,
  ambient_light: 0.1,
  min_y: 0,
  height: 256,
  logical_height: 128,
  infiniburn: '#minecraft:infiniburn_nether',
  monster_spawn_light_level: 7,
  monster_spawn_block_light_limit: 15,
  skybox: 'none',
  cardinal_light: 'nether',
  has_fixed_time: true,
  timelines: '#minecraft:in_nether',
  attributes: attributesFor(target, {
    'minecraft:visual/fog_color': '#3a0d06',
    'minecraft:visual/fog_start_distance': 10,
    'minecraft:visual/fog_end_distance': 96,
    'minecraft:visual/ambient_light_color': '#302821',
    'minecraft:visual/sky_light_color': '#7a7aff',
    'minecraft:visual/sky_light_factor': 0,
    'minecraft:gameplay/sky_light_level': 4,
    'minecraft:gameplay/fast_lava': true,
    'minecraft:gameplay/water_evaporates': true,
    'minecraft:gameplay/piglins_zombify': false,
    'minecraft:gameplay/respawn_anchor_works': true,
    'minecraft:gameplay/snow_golem_melts': true,
    'minecraft:gameplay/can_start_raid': false,
    'minecraft:gameplay/bed_rule': EXPLODING_BED,
    'minecraft:gameplay/straw_bed_rule': EXPLODING_BED,
  }),
});

export const dimensionTypeTemplates: readonly ElementTemplate[] = [
  {
    id: 'dimension_type_moon',
    kind: 'minecraft:dimension_type',
    category: DIMENSIONS,
    title: 'Moon dimension type',
    description:
      'A black sky full of stars with the sun standing still low in the sky, no clouds and no sleeping (beds still set your spawn). Point a dimension at it through its type. Vanilla has no gravity setting: give players Slow Falling or Jump Boost there with the Rules.',
    defaultName: 'moon',
    data: (context) => moon(context.target),
  },
  {
    id: 'dimension_type_nether_like',
    kind: 'minecraft:dimension_type',
    category: DIMENSIONS,
    title: 'Nether-like dimension type',
    description:
      'No sky and a bedrock ceiling, red fog, fast lava, water that evaporates, beds that explode, working respawn anchors and one block here for eight in the overworld. Point a dimension with Nether-like terrain at it through its type.',
    defaultName: 'nether_like',
    data: (context) => netherLike(context.target),
  },
];
