/**
 * The Dimension flow (ADR 0051): a new dimension a beginner can enter. The answers pick the
 * terrain (vanilla noise settings, or flat), the biome (one vanilla biome, or the overworld's
 * mix), the sky and rules (a vanilla dimension type) and how to travel: a key item whose use
 * runs a travel function (Fabric mod jar), the function alone (vanilla packs), or a portal
 * (ADR 0078 D2: the Portal flow's portal, frame block and lang with its default answers and the
 * dimension's colour; Fabric mod jar). The travel function takes the player there with
 * `spreadplayers`, so they land on solid ground, and back to the overworld when used inside the
 * dimension; it is written for every answer, so a vanilla data pack keeps a way in. Ids derive
 * from `dimension_name`: the dimension `<id>`, the function `<id>/travel`, the key `<id>_key`,
 * the portal `<id>_portal` and its frame block `<id>_portal_frame`.
 *
 * The answer "Give it its own sky and rules" (ADR 0100 D2, off by default, keeping ADR 0051 D1's
 * default) makes the dimension type `<id>_type`: a copy of the chosen vanilla one with the
 * user's sky colour, fog colour, time of day and bed answers, and points the dimension at it.
 * Environment attributes the target does not list are left out of the copy.
 *
 * {@link dimensionWorldParameters} and {@link dimensionContent} are shared with the Portal flow,
 * which makes the same dimension when its portal leads to a new one.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  Json,
  JsonObject,
  ResourceLocation,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import {
  COLOURS,
  element,
  itemModel,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  type NameForms,
  nameForms,
  type ParameterValues,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import { DEFAULT_PORTAL_ANSWERS, portalContent } from '../content/portal';

/** Terrain choices: the vanilla noise settings each uses, or `flat`. */
const TERRAINS: readonly {
  value: string;
  label: string;
  settings: string | null;
  words: string;
  /** Spawn search height limit (`spreadplayers … under`), for terrain with a ceiling. */
  under?: number;
}[] = [
  {
    value: 'overworld',
    label: 'Hills and mountains, like the overworld',
    settings: 'minecraft:overworld',
    words: 'overworld terrain',
  },
  {
    value: 'amplified',
    label: 'Amplified: towering peaks',
    settings: 'minecraft:amplified',
    words: 'amplified terrain with towering peaks',
  },
  {
    value: 'floating_islands',
    label: 'Floating islands over the void',
    settings: 'minecraft:floating_islands',
    words: 'floating islands over the void',
  },
  {
    value: 'caves',
    label: 'One big cave with a roof',
    settings: 'minecraft:caves',
    words: 'a cave world with a bedrock roof',
    under: 120,
  },
  {
    value: 'nether',
    label: 'Nether-like caverns',
    settings: 'minecraft:nether',
    words: 'nether-like caverns with lava seas',
    under: 120,
  },
  { value: 'end', label: 'End-like islands', settings: 'minecraft:end', words: 'end-like islands' },
  { value: 'flat', label: 'Completely flat', settings: null, words: 'flat grass land' },
];

/** Biome choices: one vanilla biome everywhere, or the overworld's mix. */
const BIOMES: readonly { value: string; label: string }[] = [
  { value: 'minecraft:cherry_grove', label: 'Cherry grove' },
  { value: 'minecraft:plains', label: 'Plains' },
  { value: 'minecraft:desert', label: 'Desert' },
  { value: 'minecraft:snowy_plains', label: 'Snowy plains' },
  { value: 'minecraft:jungle', label: 'Jungle' },
  { value: 'minecraft:mushroom_fields', label: 'Mushroom fields (no monsters)' },
  { value: 'minecraft:badlands', label: 'Badlands' },
  { value: 'minecraft:dark_forest', label: 'Dark forest' },
  { value: 'minecraft:pale_garden', label: 'Pale garden' },
  { value: 'minecraft:crimson_forest', label: 'Crimson forest' },
  { value: 'minecraft:end_highlands', label: 'End highlands' },
  { value: 'mix', label: 'The overworld mix of biomes' },
];

/** Sky and rule choices: the vanilla dimension type each uses. */
const SKIES: readonly { value: string; label: string; type: string; words: string }[] = [
  {
    value: 'day',
    label: 'Overworld sky with day and night',
    type: 'minecraft:overworld',
    words: 'the overworld sky with day and night',
  },
  {
    value: 'caves',
    label: 'Overworld rules, no sky light (always dark)',
    type: 'minecraft:overworld_caves',
    words: 'no sky light, so it is dark without torches',
  },
  {
    value: 'nether',
    label: 'Nether haze (water evaporates, beds explode)',
    type: 'minecraft:the_nether',
    words: 'the nether haze, where water evaporates and beds explode',
  },
  { value: 'end', label: 'End sky', type: 'minecraft:the_end', words: 'the dark end sky' },
];

/** A vanilla bed rule: the overworld's (sleep at night, set the spawn) and the exploding one. */
const NO_SLEEP_MESSAGE: JsonObject = { translate: 'block.minecraft.bed.no_sleep' };
const BEDS_WORK: JsonObject = {
  bed: {
    can_set_spawn: 'always',
    can_sleep: 'when_dark',
    error_message: NO_SLEEP_MESSAGE,
  },
  straw: {
    can_set_spawn: 'never',
    can_sleep: 'when_dark',
    destroy_on_leave: true,
    error_message: NO_SLEEP_MESSAGE,
  },
};
const EXPLODES: JsonObject = { can_set_spawn: 'never', can_sleep: 'never', destroy_on_use: true };

const ATTRIBUTE = {
  ambientSounds: 'minecraft:audio/ambient_sounds',
  music: 'minecraft:audio/background_music',
  bedRule: 'minecraft:gameplay/bed_rule',
  strawBedRule: 'minecraft:gameplay/straw_bed_rule',
  skyColour: 'minecraft:visual/sky_color',
  fogColour: 'minecraft:visual/fog_color',
  sunAngle: 'minecraft:visual/sun_angle',
  moonAngle: 'minecraft:visual/moon_angle',
  starAngle: 'minecraft:visual/star_angle',
  starBrightness: 'minecraft:visual/star_brightness',
  skyLightColour: 'minecraft:visual/sky_light_color',
  skyLightFactor: 'minecraft:visual/sky_light_factor',
  skyLightLevel: 'minecraft:gameplay/sky_light_level',
  monstersBurn: 'minecraft:gameplay/monsters_burn',
} as const;

/** The overworld's cave mood sound and music, shared by both overworld types. */
const OVERWORLD_SOUNDS: JsonObject = {
  [ATTRIBUTE.ambientSounds]: {
    mood: { block_search_extent: 8, offset: 2, sound: 'minecraft:ambient.cave', tick_delay: 6000 },
  },
  [ATTRIBUTE.music]: {
    creative: { max_delay: 24000, min_delay: 12000, sound: 'minecraft:music.creative' },
    default: { max_delay: 24000, min_delay: 12000, sound: 'minecraft:music.game' },
  },
};

/** The overworld dimension type's attributes (`has_ceiling` aside, also overworld_caves'). */
const OVERWORLD_ATTRIBUTES: JsonObject = {
  ...OVERWORLD_SOUNDS,
  [ATTRIBUTE.bedRule]: BEDS_WORK.bed as JsonObject,
  'minecraft:gameplay/nether_portal_spawns_piglin': true,
  'minecraft:gameplay/respawn_anchor_works': false,
  [ATTRIBUTE.strawBedRule]: BEDS_WORK.straw as JsonObject,
  'minecraft:visual/ambient_light_color': '#0a0a0a',
  'minecraft:visual/cloud_color': '#ccffffff',
  'minecraft:visual/cloud_height': 192.33,
  [ATTRIBUTE.fogColour]: '#c0d8ff',
  // Only targets that list it keep it (the newer target adds it, plan F31).
  'minecraft:visual/has_sky_occluder': true,
  [ATTRIBUTE.skyColour]: '#78a7ff',
};

const overworldLike = (ceiling: boolean): JsonObject => ({
  ambient_light: 0,
  attributes: OVERWORLD_ATTRIBUTES,
  coordinate_scale: 1,
  default_clock: 'minecraft:overworld',
  has_ceiling: ceiling,
  has_ender_dragon_fight: false,
  has_skylight: true,
  height: 384,
  infiniburn: '#minecraft:infiniburn_overworld',
  logical_height: 384,
  min_y: -64,
  monster_spawn_block_light_limit: 0,
  monster_spawn_light_level: { type: 'minecraft:uniform', max_inclusive: 7, min_inclusive: 0 },
  timelines: '#minecraft:in_overworld',
});

/**
 * The vanilla dimension types the "own sky" answer copies, per {@link SKIES} value: their
 * fields and attributes as the game's own files have them on the supported targets.
 */
const VANILLA_TYPES: Readonly<Record<string, JsonObject>> = {
  day: overworldLike(false),
  caves: overworldLike(true),
  nether: {
    ambient_light: 0.1,
    attributes: {
      [ATTRIBUTE.bedRule]: EXPLODES,
      'minecraft:gameplay/can_start_raid': false,
      'minecraft:gameplay/fast_lava': true,
      'minecraft:gameplay/piglins_zombify': false,
      'minecraft:gameplay/respawn_anchor_works': true,
      [ATTRIBUTE.skyLightLevel]: 4,
      'minecraft:gameplay/snow_golem_melts': true,
      [ATTRIBUTE.strawBedRule]: EXPLODES,
      'minecraft:gameplay/water_evaporates': true,
      'minecraft:visual/ambient_light_color': '#302821',
      'minecraft:visual/default_dripstone_particle': {
        type: 'minecraft:dripping_dripstone_lava',
      },
      'minecraft:visual/fog_end_distance': 96,
      'minecraft:visual/fog_start_distance': 10,
      [ATTRIBUTE.skyLightColour]: '#7a7aff',
      [ATTRIBUTE.skyLightFactor]: 0,
    },
    cardinal_light: 'nether',
    coordinate_scale: 8,
    has_ceiling: true,
    has_ender_dragon_fight: false,
    has_fixed_time: true,
    has_skylight: false,
    height: 256,
    infiniburn: '#minecraft:infiniburn_nether',
    logical_height: 128,
    min_y: 0,
    monster_spawn_block_light_limit: 15,
    monster_spawn_light_level: 7,
    skybox: 'none',
    timelines: '#minecraft:in_nether',
  },
  end: {
    ambient_light: 0.25,
    attributes: {
      [ATTRIBUTE.ambientSounds]: OVERWORLD_SOUNDS[ATTRIBUTE.ambientSounds] as Json,
      [ATTRIBUTE.music]: {
        default: {
          max_delay: 24000,
          min_delay: 6000,
          replace_current_music: true,
          sound: 'minecraft:music.end',
        },
      },
      [ATTRIBUTE.bedRule]: EXPLODES,
      'minecraft:gameplay/respawn_anchor_works': false,
      [ATTRIBUTE.strawBedRule]: EXPLODES,
      'minecraft:visual/ambient_light_color': '#3f473f',
      [ATTRIBUTE.fogColour]: '#181318',
      [ATTRIBUTE.skyColour]: '#000000',
      [ATTRIBUTE.skyLightColour]: '#ac60cd',
      [ATTRIBUTE.skyLightFactor]: 0,
    },
    coordinate_scale: 1,
    default_clock: 'minecraft:the_end',
    has_ceiling: false,
    // Vanilla's End type has the dragon fight; a new dimension does not start one.
    has_ender_dragon_fight: false,
    has_fixed_time: true,
    has_skylight: true,
    height: 256,
    infiniburn: '#minecraft:infiniburn_end',
    logical_height: 256,
    min_y: 0,
    monster_spawn_block_light_limit: 0,
    monster_spawn_light_level: 15,
    skybox: 'end',
    timelines: '#minecraft:in_end',
  },
};

/** Time of day choices of the own sky answer. */
const TIMES: readonly { value: string; label: string; words: string }[] = [
  { value: 'as_sky', label: 'As the chosen sky has it', words: '' },
  { value: 'day', label: 'Always day: the sun stands at noon', words: 'always day' },
  { value: 'night', label: 'Always night: moon and stars', words: 'always night' },
];

/** Bed choices of the own sky answer. */
const BEDS: readonly { value: string; label: string; words: string }[] = [
  { value: 'as_sky', label: 'As the chosen sky has them', words: '' },
  { value: 'explode', label: 'Beds explode here', words: 'beds explode' },
  { value: 'work', label: 'Beds work: sleep at night and set your spawn', words: 'beds work' },
];

/**
 * The fixed time attributes: the sun, moon and stars where vanilla's day timeline puts them at
 * noon (sun angle 0) or midnight (180), and at midnight the night's sky light.
 */
function fixedTimeAttributes(time: 'day' | 'night'): JsonObject {
  if (time === 'day') {
    return {
      [ATTRIBUTE.sunAngle]: 0,
      [ATTRIBUTE.moonAngle]: 180,
      [ATTRIBUTE.starAngle]: 0,
      [ATTRIBUTE.starBrightness]: 0,
      [ATTRIBUTE.monstersBurn]: true,
    };
  }
  return {
    [ATTRIBUTE.sunAngle]: 180,
    [ATTRIBUTE.moonAngle]: 0,
    [ATTRIBUTE.starAngle]: 180,
    [ATTRIBUTE.starBrightness]: 0.5,
    [ATTRIBUTE.skyLightColour]: '#7a7aff',
    [ATTRIBUTE.skyLightFactor]: 0.24,
    [ATTRIBUTE.skyLightLevel]: 4,
    [ATTRIBUTE.monstersBurn]: false,
  };
}

/** The own sky answers of a dimension, from {@link DIMENSION_PARAMETERS}. */
export interface OwnSkyAnswers {
  sky: string;
  skyColour: string;
  fogColour: string;
  time: string;
  beds: string;
}

/**
 * The project dimension type for the own sky answers: a copy of the chosen vanilla type with
 * the sky and fog colours, the time of day (a fixed time drops the clock and keeps only the
 * universal timelines, so the day timeline no longer moves the sun) and the bed rules. On a
 * target with `worldgen.environmentAttributes`, attributes it does not list are left out.
 */
export function ownDimensionType(answers: OwnSkyAnswers, target?: TargetFacts): JsonObject {
  const base = structuredClone(
    VANILLA_TYPES[answers.sky] ?? (VANILLA_TYPES.day as JsonObject),
  ) as JsonObject;
  let attributes: JsonObject = {
    ...(base.attributes as JsonObject),
    [ATTRIBUTE.skyColour]: answers.skyColour,
    [ATTRIBUTE.fogColour]: answers.fogColour,
  };
  if (answers.time === 'day' || answers.time === 'night') {
    base.has_fixed_time = true;
    delete base.default_clock;
    base.timelines = '#minecraft:universal';
    attributes = { ...attributes, ...fixedTimeAttributes(answers.time) };
  }
  if (answers.beds === 'explode') {
    attributes[ATTRIBUTE.bedRule] = EXPLODES;
    attributes[ATTRIBUTE.strawBedRule] = EXPLODES;
  } else if (answers.beds === 'work') {
    attributes[ATTRIBUTE.bedRule] = BEDS_WORK.bed as JsonObject;
    attributes[ATTRIBUTE.strawBedRule] = BEDS_WORK.straw as JsonObject;
  }
  const known = target?.worldgen.environmentAttributes;
  if (known !== undefined) {
    const listed = new Set(known);
    attributes = Object.fromEntries(Object.entries(attributes).filter(([id]) => listed.has(id)));
  }
  base.attributes = Object.fromEntries(
    Object.entries(attributes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return base;
}

/**
 * The Terrain, Biome and Sky and rules questions of a new dimension, in `group`; the Dimension
 * flow asks them under "World", the Portal flow under "Where it goes".
 */
export function dimensionWorldParameters(group: string): StarterParameter[] {
  return [
    {
      id: 'terrain',
      label: 'Terrain',
      group,
      type: 'choice',
      default: 'overworld',
      choices: TERRAINS.map(({ value, label }) => ({ value, label })),
    },
    {
      id: 'biome',
      label: 'Biome',
      description: 'One biome everywhere, with its plants, trees and mobs, or the overworld mix.',
      group,
      type: 'choice',
      default: 'minecraft:cherry_grove',
      choices: BIOMES.map(({ value, label }) => ({ value, label })),
    },
    {
      id: 'sky',
      label: 'Sky and rules',
      group,
      type: 'choice',
      default: 'day',
      choices: SKIES.map(({ value, label }) => ({ value, label })),
    },
  ];
}

/** The Dimension flow's questions, groups "World" and "Travel". */
export const DIMENSION_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'dimension_name',
    label: 'Dimension name',
    description: 'The English name. Ids derive from it: Ruby Realm gives ruby_realm.',
    group: 'World',
    type: 'string',
    default: 'Ruby Realm',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  ...dimensionWorldParameters('World'),
  {
    id: 'own_sky',
    label: 'Give it its own sky and rules',
    description:
      'Copies the chosen sky and rules into a dimension type of your own with the colours, time and beds below. Off: the dimension uses the vanilla one as it is.',
    group: 'World',
    type: 'boolean',
    default: false,
  },
  {
    id: 'sky_colour',
    label: 'Sky colour',
    description: 'Used when it has its own sky. The day and night clock darkens it at night.',
    group: 'World',
    type: 'colour',
    default: '#78a7ff',
  },
  {
    id: 'fog_colour',
    label: 'Fog colour',
    description: 'Used when it has its own sky: the colour of the far distance and the horizon.',
    group: 'World',
    type: 'colour',
    default: '#c0d8ff',
  },
  {
    id: 'time',
    label: 'Time of day',
    description: 'Used when it has its own sky.',
    group: 'World',
    type: 'choice',
    default: 'as_sky',
    choices: TIMES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'beds',
    label: 'Beds',
    description: 'Used when it has its own sky.',
    group: 'World',
    type: 'choice',
    default: 'as_sky',
    choices: BEDS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'travel',
    label: 'How to get there',
    group: 'Travel',
    type: 'choice',
    default: 'item',
    choices: [
      {
        value: 'item',
        label: 'A key item: use it to travel there and back (needs the Fabric mod jar)',
      },
      { value: 'command', label: 'A command only (works in vanilla packs)' },
      {
        value: 'portal',
        label: 'A portal (needs the Fabric mod jar)',
      },
    ],
  },
  {
    id: 'colour',
    label: 'Key or portal colour',
    description:
      'The colour of the key item, or of the portal and its frame, on their drawn textures.',
    group: 'Travel',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
]);

/** A new dimension and its travel function, from {@link dimensionContent}. */
export interface DimensionContent {
  /** The dimension and the travel function elements, in that order. */
  elements: ContentBundleElement[];
  /** The dimension's id. */
  dimension: ResourceLocation;
  /** The travel function's id. */
  travel: ResourceLocation;
  /** What the dimension is like, in words for notes: `overworld terrain with …`. */
  words: string;
  /** The project dimension type's id, when the own sky answer made one (ADR 0100 D2). */
  dimensionType?: ResourceLocation;
}

/**
 * The dimension `<ns>:<name.id>` the `terrain`, `biome` and `sky` answers in `values` describe,
 * and its travel function `<ns>:<name.id>/travel`. `via` says in the function's first comment
 * line how else players travel (", or use the key"; empty for none). With `own_sky` on (the
 * Dimension flow's answer; the Portal flow never sets it) it also makes the dimension type
 * `<ns>:<name.id>_type` from {@link ownDimensionType} for `target`, after the travel function.
 */
export function dimensionContent(
  namespace: string,
  name: NameForms,
  values: ParameterValues,
  via: string,
  target?: TargetFacts,
): DimensionContent {
  const terrain =
    TERRAINS.find((entry) => entry.value === stringValue(values, 'terrain')) ??
    (TERRAINS[0] as (typeof TERRAINS)[number]);
  const biomeValue = stringValue(values, 'biome');
  const biome =
    BIOMES.find((entry) => entry.value === biomeValue) ?? (BIOMES[0] as (typeof BIOMES)[number]);
  const sky =
    SKIES.find((entry) => entry.value === stringValue(values, 'sky')) ??
    (SKIES[0] as (typeof SKIES)[number]);

  const dimension = rl(namespace, name.id);
  const travel = rl(namespace, `${name.id}/travel`);

  const biomeSource: JsonObject =
    biome.value === 'mix'
      ? { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
      : { type: 'minecraft:fixed', biome: biome.value };
  // Flat layers are vanilla blocks only: a mod block there would leave the whole dimension out
  // of a vanilla data pack (ADR 0066).
  const generator: JsonObject =
    terrain.settings === null
      ? {
          type: 'minecraft:flat',
          settings: {
            biome: biome.value === 'mix' ? 'minecraft:plains' : biome.value,
            layers: [
              { block: 'minecraft:bedrock', height: 1 },
              { block: 'minecraft:dirt', height: 3 },
              { block: 'minecraft:grass_block', height: 1 },
            ],
            features: true,
            lakes: false,
            structure_overrides: [],
          },
        }
      : { type: 'minecraft:noise', settings: terrain.settings, biome_source: biomeSource };
  const biomeWords =
    biome.value === 'mix'
      ? 'the overworld mix of biomes'
      : `${biome.label.toLowerCase()} everywhere`;

  // spreadplayers lands the player on the highest solid block near them; `under` keeps it
  // below a roof. Used inside the dimension, the function goes back to the overworld.
  const under = terrain.under === undefined ? '' : ` under ${terrain.under}`;
  const travelLines = [
    `# Travels to ${name.display} and back. Run with /function ${travel}${via}.`,
    `execute if dimension ${dimension} in minecraft:overworld run return run spreadplayers ~ ~ 0 64 false @s`,
    `execute in ${dimension} run spreadplayers ~ ~ 0 64${under} false @s`,
  ];
  const ownSky = booleanValue(values, 'own_sky');
  const dimensionType = ownSky ? rl(namespace, `${name.id}_type`) : undefined;
  const time =
    TIMES.find((entry) => entry.value === values.time) ?? (TIMES[0] as (typeof TIMES)[number]);
  const beds =
    BEDS.find((entry) => entry.value === values.beds) ?? (BEDS[0] as (typeof BEDS)[number]);
  const ownWords = [time.words, beds.words].filter((part) => part !== '').join(' and ');
  const words = `${terrain.words} with ${biomeWords}, and ${sky.words}${ownSky ? `, in its own colours${ownWords === '' ? '' : ` (${ownWords})`}` : ''}`;
  const typeWords =
    dimensionType === undefined
      ? `the vanilla dimension type ${sky.type}`
      : `its own dimension type ${dimensionType}, copied from ${sky.type}`;
  const typeElements: ContentBundleElement[] =
    dimensionType === undefined
      ? []
      : [
          element(
            dimensionType,
            KINDS.dimensionType,
            ownDimensionType(
              {
                sky: sky.value,
                skyColour: typeof values.sky_colour === 'string' ? values.sky_colour : '#78a7ff',
                fogColour: typeof values.fog_colour === 'string' ? values.fog_colour : '#c0d8ff',
                time: time.value,
                beds: beds.value,
              },
              target,
            ),
            `The sky and rules of ${name.display}, copied from the vanilla dimension type ${sky.type}: its sky colour (minecraft:visual/sky_color) and fog colour (minecraft:visual/fog_color) are yours${time.value === 'as_sky' ? '' : `, and has_fixed_time holds it at ${time.value === 'day' ? 'noon' : 'midnight'} (the sun, moon and star angles say where they stand)`}${beds.value === 'as_sky' ? '' : `; the bed rules make ${beds.value === 'explode' ? 'beds explode' : 'beds work as in the overworld'}`}. Open it in the Dimension Type Studio for the clouds, light, rules and height.`,
          ),
        ];
  return {
    dimension,
    travel,
    words,
    ...(dimensionType === undefined ? {} : { dimensionType }),
    elements: [
      element(
        dimension,
        KINDS.dimension,
        { type: dimensionType ?? sky.type, generator },
        `The dimension ${name.display}: ${words} (${typeWords}). The game loads a new dimension when a world opens, so open or reload a world after adding it.${terrain.value === 'floating_islands' || terrain.value === 'end' ? ' Islands leave gaps: the travel function looks up to 64 blocks around you for ground and says so when it finds none.' : ''}`,
      ),
      element(
        travel,
        KINDS.function,
        { lines: travelLines },
        `The travel function. execute in ${dimension} runs spreadplayers in the dimension, which puts you on solid ground within 64 blocks${under === '' ? '' : ` below height ${terrain.under}, under the roof`}. Run inside the dimension, the first line takes you back to the overworld the same way (if dimension …, then return).`,
      ),
      ...typeElements,
    ],
  };
}

export function dimensionBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(DIMENSION_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'dimension_name'));
  const travelBy = stringValue(values, 'travel');
  const withItem = travelBy === 'item';
  const withPortal = travelBy === 'portal';
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);

  const key = rl(namespace, `${name.id}_key`);
  const keyModel = rl(namespace, `item/${name.id}_key`);
  const event = rl(namespace, `${name.id}_key_used`);
  const world = dimensionContent(
    namespace,
    name,
    values,
    withItem ? ', or use the key' : withPortal ? ', or step through the portal' : '',
    context.target,
  );
  const { travel } = world;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
  ];
  if (withItem || withPortal) {
    elements.push(
      modElement(
        namespace,
        projectName,
        `Adds the dimension ${name.display} and ${withPortal ? 'a portal' : 'a key'} to travel there.`,
      ),
    );
  }
  elements.push(...world.elements);
  if (withItem) {
    elements.push(
      element(
        key,
        KINDS.item,
        {
          format: 1,
          model: keyModel,
          max_stack_size: 1,
          rarity: 'rare',
          creative_tab: 'minecraft:tools_and_utilities',
          components: { 'msm:on_use': { event, cooldown_ticks: 60 } },
          events: { [event]: { actions: [{ type: 'run_function', function: travel }] } },
        },
        `The key: using it runs the event ${event}, whose run_function action runs ${travel} as the player, so it takes them to ${name.display} and back. It waits three seconds (cooldown_ticks 60) between uses. Take it from the Tools and Utilities tab of the creative menu, or add a recipe.`,
      ),
      itemModel(
        namespace,
        `${name.id}_key`,
        'minecraft:item/generated',
        `The key's flat item model, drawn from textures/item/${name.id}_key.png.`,
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        { [`item.${namespace}.${name.id}_key`]: `${name.display} Key` },
        'The English name of the key.',
      ),
    );
  }
  const assets = withItem ? [texture(namespace, `item/${name.id}_key`, 'gem', colour)] : [];
  if (withPortal) {
    const portal = portalContent(
      namespace,
      nameForms(`${name.display} Portal`),
      { dimension: world.dimension, words: `${name.display} (${world.words})`, travel },
      { ...DEFAULT_PORTAL_ANSWERS, colour },
    );
    elements.push(...portal.elements);
    assets.push(...portal.assets);
  }
  return { elements, assets };
}
