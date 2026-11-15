/**
 * Pure helpers of the Dimension Type Studio (ADR 0100 D1, D4): which environment attribute
 * fields each section shows (only the ids the target lists, so the newer target's extra attribute appears
 * only there), colour and number reading, the bed rule presets and the sky swatch geometry.
 * No React, no session.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { isJsonObject } from '../../forms/pointer';

type JsonObject = { [key: string]: Json };

/** The kind the Studio edits. */
export const DIMENSION_TYPE_KIND = 'minecraft:dimension_type';

/** How an attribute field is edited. */
export type AttributeControl = 'rgb' | 'argb' | 'number' | 'flag';

/** The part of a target's facts the attribute helpers read. */
export interface AttributeTarget {
  worldgen: { environmentAttributes?: readonly string[] | undefined };
}

/** One environment attribute a section shows. */
export interface AttributeField {
  /** The namespaced attribute id, for example `minecraft:visual/sky_color`. */
  id: string;
  /** The label, in British English. */
  label: string;
  control: AttributeControl;
  /** The number step, for `number` fields. */
  step?: number;
  /** The lowest value, for `number` fields. */
  min?: number;
  /** The highest value, for `number` fields. */
  max?: number;
  /** A short explanation shown with the field. */
  hint?: string;
}

const id = (path: string): string => `minecraft:${path}`;

/** The Sky section's attributes, in display order (ADR 0100 D1). */
export const SKY_ATTRIBUTES: readonly AttributeField[] = [
  { id: id('visual/sky_color'), label: 'Sky colour', control: 'rgb' },
  { id: id('visual/fog_color'), label: 'Fog colour', control: 'rgb' },
  { id: id('visual/cloud_color'), label: 'Cloud colour', control: 'argb' },
  {
    id: id('visual/sunrise_sunset_color'),
    label: 'Sunrise colour',
    control: 'argb',
    hint: 'The day and night clock usually sets it; a value here holds it all day.',
  },
  { id: id('visual/cloud_height'), label: 'Cloud height', control: 'number', step: 1 },
  {
    id: id('visual/sun_angle'),
    label: 'Sun angle',
    control: 'number',
    step: 5,
    hint: '0 is noon, 90 sunset, 180 midnight.',
  },
  { id: id('visual/moon_angle'), label: 'Moon angle', control: 'number', step: 5 },
  { id: id('visual/star_angle'), label: 'Star angle', control: 'number', step: 5 },
  {
    id: id('visual/star_brightness'),
    label: 'Star brightness',
    control: 'number',
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    id: id('visual/has_sky_occluder'),
    label: 'Sky hidden above',
    control: 'flag',
    hint: 'Only some Minecraft versions have this setting.',
  },
];

/** The Light section's attributes. */
export const LIGHT_ATTRIBUTES: readonly AttributeField[] = [
  { id: id('visual/ambient_light_color'), label: 'Ambient light colour', control: 'rgb' },
  { id: id('visual/block_light_tint'), label: 'Block light tint', control: 'rgb' },
  { id: id('visual/sky_light_color'), label: 'Sky light colour', control: 'rgb' },
  {
    id: id('visual/sky_light_factor'),
    label: 'Sky light strength',
    control: 'number',
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    id: id('gameplay/sky_light_level'),
    label: 'Sky light level',
    control: 'number',
    step: 1,
    min: 0,
    max: 15,
  },
];

/** The Rules section's yes or no attributes (`gameplay/*`). */
export const RULE_ATTRIBUTES: readonly AttributeField[] = [
  { id: id('gameplay/respawn_anchor_works'), label: 'Respawn anchors work', control: 'flag' },
  { id: id('gameplay/piglins_zombify'), label: 'Piglins turn into zombies', control: 'flag' },
  { id: id('gameplay/monsters_burn'), label: 'Monsters burn in daylight', control: 'flag' },
  { id: id('gameplay/fast_lava'), label: 'Lava flows fast', control: 'flag' },
  { id: id('gameplay/water_evaporates'), label: 'Water evaporates', control: 'flag' },
  { id: id('gameplay/can_start_raid'), label: 'Raids can start', control: 'flag' },
  { id: id('gameplay/can_pillager_patrol_spawn'), label: 'Pillager patrols', control: 'flag' },
  {
    id: id('gameplay/nether_portal_spawns_piglin'),
    label: 'Portals spawn zombified piglins',
    control: 'flag',
  },
  { id: id('gameplay/snow_golem_melts'), label: 'Snow golems melt', control: 'flag' },
  { id: id('gameplay/increased_fire_burnout'), label: 'Fire burns out faster', control: 'flag' },
];

/** The ambient particles attribute (a list; edited as a schema sub-form). */
export const AMBIENT_PARTICLES = id('visual/ambient_particles');

/** The bed rule attributes: the plain bed's, then the straw bed's (when the target has it). */
export const BED_RULES = [id('gameplay/bed_rule'), id('gameplay/straw_bed_rule')] as const;

/**
 * The fields of `fields` the target lists (`worldgen.environmentAttributes`); every field when
 * the target has no list.
 */
export function shownAttributes(
  fields: readonly AttributeField[],
  target: AttributeTarget,
): AttributeField[] {
  const known = target.worldgen.environmentAttributes;
  if (known === undefined) return [...fields];
  const set = new Set(known);
  return fields.filter((field) => set.has(field.id));
}

/** Whether the target lists the attribute `attribute` (true without a list). */
export function hasAttribute(target: AttributeTarget, attribute: string): boolean {
  const known = target.worldgen.environmentAttributes;
  return known === undefined || known.includes(attribute);
}

/** The value of `attribute` in `attributes`, with or without its `minecraft:` namespace. */
export function attributeValue(attributes: JsonObject, attribute: string): Json | undefined {
  if (Object.hasOwn(attributes, attribute)) return attributes[attribute];
  const bare = attribute.startsWith('minecraft:')
    ? attribute.slice('minecraft:'.length)
    : attribute;
  return Object.hasOwn(attributes, bare) ? attributes[bare] : undefined;
}

/** The key `attribute` is stored under: the bare form when the element already uses it. */
export function attributeKey(attributes: JsonObject, attribute: string): string {
  const bare = attribute.startsWith('minecraft:')
    ? attribute.slice('minecraft:'.length)
    : attribute;
  return !Object.hasOwn(attributes, attribute) && Object.hasOwn(attributes, bare)
    ? bare
    : attribute;
}

/** A colour as the Studio shows it: `#rrggbb` plus an alpha 0–255 (255 for RGB values). */
export interface ShownColour {
  hex: string;
  alpha: number;
}

/**
 * A colour attribute's plain value: `#rrggbb`, `#aarrggbb` or an integer (RGB, or ARGB when
 * `argb`). `null` for anything else (a modifier object), which the Advanced form edits.
 */
export function readColour(value: Json | undefined, argb = false): ShownColour | null {
  if (typeof value === 'string') {
    if (/^#[0-9a-f]{6}$/i.test(value)) return { hex: value.toLowerCase(), alpha: 255 };
    if (/^#[0-9a-f]{8}$/i.test(value)) {
      return {
        hex: `#${value.slice(3).toLowerCase()}`,
        alpha: Number.parseInt(value.slice(1, 3), 16),
      };
    }
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    if (argb && value <= 0xffffffff) {
      return {
        hex: `#${(value & 0xffffff).toString(16).padStart(6, '0')}`,
        alpha: Math.floor(value / 0x1000000),
      };
    }
    if (value <= 0xffffff) return { hex: `#${value.toString(16).padStart(6, '0')}`, alpha: 255 };
  }
  return null;
}

/** The value the Studio writes for a colour: `#rrggbb`, or `#aarrggbb` for ARGB attributes. */
export function writeColour(hex: string, argb: boolean, alpha = 255): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Not a #rrggbb colour: ${hex}`);
  if (!argb) return hex.toLowerCase();
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  return `#${a.toString(16).padStart(2, '0')}${hex.slice(1).toLowerCase()}`;
}

/** A plain number, or `undefined` (absent, or a modifier object). */
export function readNumber(value: Json | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The bed presets of the Rules section. */
export type BedPreset = 'work' | 'explode' | 'no_sleep';

/** The bed presets with their labels, in display order. */
export const BED_PRESETS: readonly { value: BedPreset; label: string }[] = [
  { value: 'work', label: 'Beds work: sleep at night and set your spawn' },
  { value: 'explode', label: 'Beds explode when used' },
  { value: 'no_sleep', label: 'No sleeping, but beds set your spawn' },
];

/**
 * The bed rule value of each preset, as vanilla's dimension types write them: the overworld's
 * (sleep when dark, always set spawn, with the "You can sleep only at night" message), the
 * Nether's and the End's (never, destroyed on use, which is the explosion), and one that only
 * sets the spawn point.
 */
export function bedRule(preset: BedPreset): JsonObject {
  if (preset === 'explode') {
    return { can_set_spawn: 'never', can_sleep: 'never', destroy_on_use: true };
  }
  if (preset === 'no_sleep') return { can_set_spawn: 'always', can_sleep: 'never' };
  return {
    can_set_spawn: 'always',
    can_sleep: 'when_dark',
    error_message: { translate: 'block.minecraft.bed.no_sleep' },
  };
}

/**
 * The straw bed's rule for each preset: vanilla's overworld straw bed never sets the spawn and
 * is destroyed when its sleeper leaves; it explodes as the plain bed does.
 */
export function strawBedRule(preset: BedPreset): JsonObject {
  if (preset === 'explode') return bedRule('explode');
  if (preset === 'no_sleep') return { can_set_spawn: 'never', can_sleep: 'never' };
  return {
    can_set_spawn: 'never',
    can_sleep: 'when_dark',
    destroy_on_leave: true,
    error_message: { translate: 'block.minecraft.bed.no_sleep' },
  };
}

/** The preset a bed rule value matches, or `null` (absent or another rule). */
export function bedPresetOf(value: Json | undefined): BedPreset | null {
  if (!isJsonObject(value)) return null;
  for (const { value: preset } of BED_PRESETS) {
    const rule = bedRule(preset);
    const keys = new Set([...Object.keys(rule), ...Object.keys(value)]);
    if ([...keys].every((key) => JSON.stringify(rule[key]) === JSON.stringify(value[key]))) {
      return preset;
    }
  }
  return null;
}

/** A tri-state choice for a yes or no attribute: not set, yes or no. */
export type FlagChoice = '' | 'yes' | 'no';

export function flagChoice(value: Json | undefined): FlagChoice | null {
  if (value === undefined) return '';
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return null;
}

/** The monster spawn light level as a range, or `null` for another provider form. */
export function lightRange(value: Json | undefined): [number, number] | null {
  if (typeof value === 'number' && Number.isInteger(value)) return [value, value];
  if (
    isJsonObject(value) &&
    (value.type === 'minecraft:uniform' || value.type === 'uniform') &&
    typeof value.min_inclusive === 'number' &&
    typeof value.max_inclusive === 'number'
  ) {
    return [value.min_inclusive, value.max_inclusive];
  }
  return null;
}

/** The light level value for a range: a number when both ends are equal, else a uniform. */
export function lightValue(min: number, max: number): Json {
  const low = Math.max(0, Math.min(15, Math.min(min, max)));
  const high = Math.max(0, Math.min(15, Math.max(min, max)));
  return low === high
    ? low
    : { type: 'minecraft:uniform', min_inclusive: low, max_inclusive: high };
}

/** The sky swatch of ADR 0100 D4: two colours and where the sun and moon stand. */
export interface SkySwatch {
  /** The top of the swatch: the sky colour. */
  top: string;
  /** The horizon: the fog colour. */
  horizon: string;
  /** The sun, on a 0–1 square (x right, y down; above the horizon when `y < 0.5`). */
  sun: { x: number; y: number; shown: boolean };
  moon: { x: number; y: number; shown: boolean };
  /** Whether the sky is drawn at all (`skybox` `none` draws only fog). */
  skybox: 'overworld' | 'end' | 'none';
}

/** Overworld-like colours for a swatch whose dimension type sets none. */
const DEFAULT_SKY = '#78a7ff';
const DEFAULT_FOG = '#c0d8ff';

/** A point on the sky circle for an angle in degrees (0 overhead, 180 underfoot). */
function onCircle(angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: 0.5 + 0.4 * Math.sin(radians), y: 0.5 - 0.4 * Math.cos(radians) };
}

/**
 * The swatch for a dimension type's data: the sky colour fading to the fog colour, the sun at
 * `visual/sun_angle` (noon when unset) and the moon at `visual/moon_angle` (opposite the sun
 * when unset). The End's skybox has no sun or moon.
 */
export function skySwatch(data: Json | undefined): SkySwatch {
  const object = isJsonObject(data) ? data : {};
  const attributes = isJsonObject(object.attributes) ? object.attributes : {};
  const skyboxValue = typeof object.skybox === 'string' ? object.skybox : 'overworld';
  const skybox = skyboxValue === 'end' || skyboxValue === 'none' ? skyboxValue : 'overworld';
  const top = readColour(attributeValue(attributes, id('visual/sky_color')))?.hex ?? DEFAULT_SKY;
  const horizon =
    readColour(attributeValue(attributes, id('visual/fog_color')))?.hex ?? DEFAULT_FOG;
  const sunAngle = readNumber(attributeValue(attributes, id('visual/sun_angle'))) ?? 0;
  const moonAngle =
    readNumber(attributeValue(attributes, id('visual/moon_angle'))) ?? sunAngle + 180;
  const sun = onCircle(sunAngle);
  const moon = onCircle(moonAngle);
  const lit = skybox === 'overworld';
  return {
    top: skybox === 'none' ? horizon : top,
    horizon,
    sun: { ...sun, shown: lit && sun.y < 0.5 },
    moon: { ...moon, shown: lit && moon.y < 0.5 },
    skybox,
  };
}
