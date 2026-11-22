/**
 * The "Make a world" flows (ADR 0119 D11): five Creator flows that each make a World Type of
 * the project's own, a `minecraft:worldgen/world_preset` listed on the Create New World screen
 * through the `#minecraft:normal` world preset tag, with its English name.
 *
 * - **Islands**: islands in a sea, their size, how much sea, the biomes on land and how many
 *   trees.
 * - **Tall mountains**: how tall, how jagged, where the snow starts, the biomes.
 * - **One biome everywhere**: one vanilla biome over gentle hills, flat land or (needing the
 *   player's Minecraft files to preview) the overworld's own land.
 * - **Caves only**: rock with caverns and tunnels, a roof or an open top, the rock, lakes of
 *   water or lava and glowing patches on the cave roofs, with a dimension type of its own.
 * - **Empty sky with a start island**: an empty world of sky. The start island, its chest and
 *   kit are the game modes plan's Skyblock flow (ADR 0114); until MSM has it, this flow makes the
 *   empty world only and says so, and Home's tile hands over to Skyblock once it exists.
 *
 * The land is MSM's own recipe in every flow, not a copy of a vanilla file: each flow writes its
 * own noises (`<ns>:<id>/noise/<name>`), density functions (`<ns>:<id>/<name>`), noise settings
 * (`<ns>:<id>/terrain`, with the surface rule inline) and, for caves, a dimension type
 * (`<ns>:<id>_type`), so the live map draws the world without the player's Minecraft jar. Only
 * the density function types both targets have are used (no `interpolated`, which the newer
 * target dropped). The Nether and the End of the World Type are the vanilla ones, named by id.
 * Biomes are vanilla biomes, named by id; the game has them, and the preview draws their land
 * without their files.
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
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  type NameForms,
  nameForms,
  type ParameterValues,
  readValues,
  setValue,
  stringValue,
} from '../content/parameters';
import { ownDimensionType } from './dimension';

// ---------------------------------------------------------------------------------------------
// Flow ids and shared shapes
// ---------------------------------------------------------------------------------------------

/** The five flows' starter ids, in Home's order. */
export const WORLD_FLOW_IDS = [
  'world-islands',
  'world-mountains',
  'world-one-biome',
  'world-caves',
  'world-empty-sky',
] as const;

/** The overworld's height in a World Type of the overworld's dimension type. */
const OVERWORLD_RANGE = { minY: -64, height: 384 } as const;
/** The sea level of the islands, mountains and one-biome worlds. */
const SEA_LEVEL = 63;

/** Rounds a density value for the files (four decimals keep them short and stable). */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** A `minecraft:gradient` along y, clamped at both ends. */
function gradientY(fromY: number, fromValue: number, toY: number, toValue: number): JsonObject {
  return {
    type: 'minecraft:gradient',
    axis: 'y',
    from_coordinate: fromY,
    from_value: round(fromValue),
    to_coordinate: toY,
    to_value: round(toValue),
  };
}

/**
 * The gradient of a land surface at height `surface`: 0 at the surface, rising by one every
 * `scale` blocks below it and falling above it, across the whole height `minY` to `maxY`.
 */
function surfaceGradient(surface: number, scale: number, minY: number, maxY: number): JsonObject {
  return gradientY(minY, (surface - minY) / scale, maxY, (surface - maxY) / scale);
}

/** A noise sampled by a density function (`yScale` 0 makes it the same at every height). */
function noiseAt(noise: ResourceLocation, xzScale: number, yScale: number): JsonObject {
  return { type: 'minecraft:noise', noise, xz_scale: xzScale, y_scale: yScale };
}

const add = (left: Json, right: Json): JsonObject => ({ type: 'minecraft:add', left, right });
const mul = (left: Json, right: Json): JsonObject => ({ type: 'minecraft:mul', left, right });
const min = (left: Json, right: Json): JsonObject => ({ type: 'minecraft:min', left, right });
const max = (left: Json, right: Json): JsonObject => ({ type: 'minecraft:max', left, right });
const abs = (input: Json): JsonObject => ({ type: 'minecraft:abs', input });

/** A noise of the world's own: its lowest octave and the weight of each octave. */
interface NoiseRecipe {
  /** The path below `<id>/noise/`. */
  name: string;
  /** The lowest octave: -8 makes features about 256 blocks across. */
  baseOctave: number;
  /** One weight per octave, the first the largest. */
  amplitudes: readonly number[];
  /** What it shapes, for the notes. */
  words: string;
}

/** The pieces one flow's terrain is made of. */
interface Terrain {
  noises: readonly NoiseRecipe[];
  /** Density functions by path below `<id>/`, with what each does. */
  functions: readonly { name: string; data: Json; words: string }[];
  /** The noise settings without `default_block` (added per target). */
  settings: JsonObject;
  /** What the noise settings make, for their notes. */
  words: string;
}

/** The world's ids: the World Type, its noise settings, and the prefix of its other files. */
interface WorldIds {
  preset: ResourceLocation;
  settings: ResourceLocation;
  /** `<ns>:<id>/<path>`. */
  file(path: string): ResourceLocation;
  /** `<ns>:<id>/noise/<name>`. */
  noise(name: string): ResourceLocation;
}

function worldIds(namespace: string, name: NameForms): WorldIds {
  return {
    preset: rl(namespace, name.id),
    settings: rl(namespace, `${name.id}/terrain`),
    file: (path) => rl(namespace, `${name.id}/${path}`),
    noise: (noise) => rl(namespace, `${name.id}/noise/${noise}`),
  };
}

/**
 * Noise settings with the block every solid cell starts as where the target's noise settings
 * have that field (the surface rule ends with the same rock, for targets without it).
 */
function settingsFor(settings: JsonObject, rock: string, target: TargetFacts): JsonObject {
  const out: JsonObject = { ...structuredClone(settings) };
  if (target.worldgen.noiseSettingsDefaultBlock !== false) out.default_block = rock;
  return out;
}

/** The climate fields of a noise router that are not used: constant 0. */
function router(fields: JsonObject): JsonObject {
  return {
    temperature: 0,
    vegetation: 0,
    continents: 0,
    erosion: 0,
    depth: 0,
    ridges: 0,
    chunk_surface_level: 0,
    ...fields,
  };
}

/** A climate range for a multi-noise biome entry. */
type Range = readonly [number, number];
const ALL: Range = [-2, 2];

/** A multi-noise biome entry over the given ranges (the others cover everything). */
function biomeEntry(
  biome: string,
  ranges: { temperature?: Range; humidity?: Range; continentalness?: Range },
): JsonObject {
  const range = (value: Range | undefined): Json => [...(value ?? ALL)].map(round);
  return {
    biome,
    parameters: {
      temperature: range(ranges.temperature),
      humidity: range(ranges.humidity),
      continentalness: range(ranges.continentalness),
      erosion: [...ALL],
      weirdness: [...ALL],
      depth: 0,
      offset: 0,
    },
  };
}

/**
 * `biomes` spread over the temperature: the first in the coldest part, the last in the warmest,
 * each over an equal share and every humidity, within `continentalness`.
 */
function spreadByTemperature(biomes: readonly string[], continentalness?: Range): JsonObject[] {
  const step = 2 / biomes.length;
  return biomes.map((biome, index) =>
    biomeEntry(biome, {
      temperature: [
        index === 0 ? -2 : -1 + step * index,
        index === biomes.length - 1 ? 2 : -1 + step * (index + 1),
      ],
      ...(continentalness === undefined ? {} : { continentalness }),
    }),
  );
}

/** The vanilla Nether and End of every World Type here, named by id (the game has them). */
const VANILLA_NETHER: JsonObject = {
  type: 'minecraft:the_nether',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:nether',
    biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
  },
};
const VANILLA_END: JsonObject = {
  type: 'minecraft:the_end',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:end',
    biome_source: { type: 'minecraft:the_end' },
  },
};

// ---------------------------------------------------------------------------------------------
// Surface rules
// ---------------------------------------------------------------------------------------------

const block = (id: string): JsonObject => ({ type: 'minecraft:block', result_state: id });
const when = (condition: Json, then: Json): JsonObject => ({
  type: 'minecraft:condition',
  if_true: condition,
  then_run: then,
});
const ON_FLOOR: JsonObject = {
  type: 'minecraft:stone_depth',
  offset: 0,
  surface_type: 'floor',
  add_surface_depth: false,
  secondary_depth_range: 0,
};
const UNDER_FLOOR: JsonObject = {
  type: 'minecraft:stone_depth',
  offset: 0,
  surface_type: 'floor',
  add_surface_depth: true,
  secondary_depth_range: 0,
};
const DEEP_UNDER_FLOOR: JsonObject = {
  type: 'minecraft:stone_depth',
  offset: 0,
  surface_type: 'floor',
  add_surface_depth: true,
  secondary_depth_range: 6,
};
const ON_CEILING: JsonObject = {
  type: 'minecraft:stone_depth',
  offset: 0,
  surface_type: 'ceiling',
  add_surface_depth: false,
  secondary_depth_range: 0,
};
/** Above the water, or at most one block under it. */
const ABOVE_WATER: JsonObject = {
  type: 'minecraft:water',
  offset: -1,
  surface_depth_multiplier: 0,
  add_stone_depth: false,
};
const biomeIs = (biomes: readonly string[]): JsonObject => ({
  type: 'minecraft:biome',
  biome_is: [...biomes],
});
const yAbove = (y: number): JsonObject => ({
  type: 'minecraft:y_above',
  anchor: { absolute: y },
  surface_depth_multiplier: 0,
  add_stone_depth: false,
});
/** Bedrock in the bottom five layers, thinning out upwards, as the overworld has it. */
const BEDROCK_FLOOR: JsonObject = when(
  {
    type: 'minecraft:vertical_gradient',
    random_name: 'minecraft:bedrock_floor',
    true_at_and_below: { above_bottom: 0 },
    false_at_and_above: { above_bottom: 5 },
  },
  block('minecraft:bedrock'),
);

/** Biomes whose ground is sand over sandstone. */
const SANDY = ['minecraft:desert', 'minecraft:beach', 'minecraft:snowy_beach'];
/** Biomes whose ground is red sand over terracotta. */
const RED_SANDY = ['minecraft:badlands'];
/** Biomes whose top is mycelium. */
const MYCELIUM = ['minecraft:mushroom_fields'];
/** Biomes whose ground is bare stone. */
const STONY = ['minecraft:stony_peaks'];

/**
 * The surface rule of a land world: bedrock at the bottom, snow above `snowLine` (when given),
 * then by biome sand over sandstone, red sand over terracotta, mycelium or bare stone, else
 * grass over dirt; sand under water; the rest stone.
 */
function landSurface(biomes: readonly string[], snowLine: number | null): JsonObject {
  const has = (list: readonly string[]) => list.filter((biome) => biomes.includes(biome));
  const sandy = has(SANDY);
  const redSandy = has(RED_SANDY);
  const mycelium = has(MYCELIUM);
  const stony = has(STONY);
  const sequence: Json[] = [BEDROCK_FLOOR];
  if (snowLine !== null) {
    sequence.push(when(yAbove(snowLine), when(UNDER_FLOOR, block('minecraft:snow_block'))));
  }
  if (sandy.length > 0) {
    sequence.push(
      when(biomeIs(sandy), {
        type: 'minecraft:sequence',
        sequence: [
          when(UNDER_FLOOR, block('minecraft:sand')),
          when(DEEP_UNDER_FLOOR, block('minecraft:sandstone')),
        ],
      }),
    );
  }
  if (redSandy.length > 0) {
    sequence.push(
      when(biomeIs(redSandy), {
        type: 'minecraft:sequence',
        sequence: [
          when(ON_FLOOR, block('minecraft:red_sand')),
          when(DEEP_UNDER_FLOOR, block('minecraft:terracotta')),
        ],
      }),
    );
  }
  if (stony.length > 0) sequence.push(when(biomeIs(stony), block('minecraft:stone')));
  sequence.push(
    when(ON_FLOOR, {
      type: 'minecraft:sequence',
      sequence: [
        when(ABOVE_WATER, {
          type: 'minecraft:sequence',
          sequence: [
            ...(mycelium.length > 0 ? [when(biomeIs(mycelium), block('minecraft:mycelium'))] : []),
            block('minecraft:grass_block'),
          ],
        }),
        block('minecraft:sand'),
      ],
    }),
    when(UNDER_FLOOR, {
      type: 'minecraft:sequence',
      sequence: [when(ABOVE_WATER, block('minecraft:dirt')), block('minecraft:sand')],
    }),
    block('minecraft:stone'),
  );
  return { type: 'minecraft:sequence', sequence };
}

/** Notes for the surface rule of a land world. */
const LAND_SURFACE_WORDS =
  'The surface rule (material_rule) puts bedrock at the bottom, then grass over dirt on land, sand over sandstone in deserts and on beaches, sand under water, and stone everywhere else.';

// ---------------------------------------------------------------------------------------------
// Common questions and the World Type
// ---------------------------------------------------------------------------------------------

function nameParameter(defaultName: string): StarterParameter {
  return {
    id: 'world_name',
    label: 'Name',
    description:
      'The name of the World Type on the Create New World screen. Ids derive from it: Sunny Isles gives sunny_isles.',
    group: 'World',
    type: 'string',
    default: defaultName,
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  };
}

/** What the flow's World Type is made of. */
interface WorldParts {
  name: NameForms;
  ids: WorldIds;
  /** The overworld of the World Type. */
  overworld: JsonObject;
  /** The terrain files, or `null` when the World Type uses vanilla's own settings by id. */
  terrain: Terrain | null;
  /** The rock every solid cell starts as. */
  rock: string;
  /** What the world is like, in words for the notes. */
  words: string;
  /** Elements written after the World Type (a dimension type). */
  extra?: ContentBundleElement[];
  /** A sentence added to the World Type's notes. */
  more?: string;
}

/** The World Type, its terrain files, the world preset tag and its English name. */
function worldElements(
  namespace: string,
  target: TargetFacts,
  parts: WorldParts,
): ContentBundleElement[] {
  const { name, ids, terrain } = parts;
  const elements: ContentBundleElement[] = [
    element(
      ids.preset,
      KINDS.worldPreset,
      {
        dimensions: {
          'minecraft:overworld': parts.overworld,
          'minecraft:the_nether': structuredClone(VANILLA_NETHER),
          'minecraft:the_end': structuredClone(VANILLA_END),
        },
      },
      `The World Type ${name.display}: ${parts.words}. Choose it under More > World Type when creating a world. The Nether and the End are the vanilla ones.${parts.more === undefined ? '' : ` ${parts.more}`} Open it to see the world on the live map.`,
    ),
  ];
  if (terrain !== null) {
    elements.push(
      element(
        ids.settings,
        KINDS.noiseSettings,
        settingsFor(terrain.settings, parts.rock, target),
        `The land of ${name.display}, MSM's own recipe rather than a copy of a vanilla file: ${terrain.words}`,
      ),
      ...terrain.functions.map((entry) =>
        element(ids.file(entry.name), KINDS.densityFunction, entry.data, entry.words),
      ),
      ...terrain.noises.map((noise) =>
        element(
          ids.noise(noise.name),
          KINDS.noise,
          {
            base_octave: noise.baseOctave,
            octave_count: noise.amplitudes.length,
            amplitude_modifiers: [...noise.amplitudes],
          },
          `A noise of ${name.display}'s own: ${noise.words}. Its lowest octave (${noise.baseOctave}) sets how large the shapes are; each further octave adds smaller detail.`,
        ),
      ),
    );
  }
  elements.push(...(parts.extra ?? []));
  elements.push(
    element(
      'minecraft:normal',
      KINDS.tagWorldgenWorldPreset,
      { values: [ids.preset] },
      'The Create New World screen offers the World Types in this vanilla tag. Adding ours here (replace stays false) keeps every vanilla World Type.',
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [`generator.${namespace}.${name.id}`]: name.display },
      'The English name of the World Type button. Install the resource pack too, or the screen shows the raw key.',
    ),
  );
  return elements;
}

/** A noise-generator overworld over the world's own settings. */
function noiseOverworld(type: string, settings: string, biomeSource: JsonObject): JsonObject {
  return { type, generator: { type: 'minecraft:noise', settings, biome_source: biomeSource } };
}

/** The flow's bundle: the pack element, then the world's elements. */
function bundleOf(context: BundleContext, parts: WorldParts): ContentBundle {
  return {
    elements: [
      packElement(
        context.namespace,
        `${context.projectName}: the ${parts.name.display} World Type`,
        'The pack description shown in the resource pack and data pack lists. Both packs are exported from this one element.',
      ),
      ...worldElements(context.namespace, context.target, parts),
    ],
    assets: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Islands
// ---------------------------------------------------------------------------------------------

/** Kinds of land on the islands: the biome with few trees and the one with many. */
const ISLAND_LANDS: readonly { value: string; label: string; few: string; many: string }[] = [
  { value: 'grass', label: 'Grass and woods', few: 'minecraft:plains', many: 'minecraft:forest' },
  {
    value: 'flowers',
    label: 'Flowers',
    few: 'minecraft:sunflower_plains',
    many: 'minecraft:flower_forest',
  },
  {
    value: 'cherry',
    label: 'Cherry blossom',
    few: 'minecraft:meadow',
    many: 'minecraft:cherry_grove',
  },
  { value: 'jungle', label: 'Jungle', few: 'minecraft:sparse_jungle', many: 'minecraft:jungle' },
  {
    value: 'dry',
    label: 'Sand and dry grass',
    few: 'minecraft:desert',
    many: 'minecraft:savanna',
  },
  { value: 'snowy', label: 'Snow', few: 'minecraft:snowy_plains', many: 'minecraft:snowy_taiga' },
  {
    value: 'mushroom',
    label: 'Mushrooms (no monsters)',
    few: 'minecraft:mushroom_fields',
    many: 'minecraft:mushroom_fields',
  },
];

/** Island sizes: the lowest octave of the land noise. */
const ISLAND_SIZES: readonly { value: string; label: string; octave: number; words: string }[] = [
  { value: 'small', label: 'Small: a short swim apart', octave: -7, words: 'small' },
  { value: 'medium', label: 'Medium', octave: -8, words: 'middle-sized' },
  { value: 'large', label: 'Large: room for a village', octave: -9, words: 'large' },
];

/** How much sea: the land noise value at the shore. */
const SEAS: readonly { value: string; label: string; shore: number; words: string }[] = [
  { value: 'little', label: 'A little: mostly land', shore: -0.2, words: 'a little sea' },
  { value: 'some', label: 'Some: about half sea', shore: 0.05, words: 'about half sea' },
  { value: 'lots', label: 'Lots: islands far apart', shore: 0.25, words: 'lots of sea' },
];

const TREES = [
  { value: 'few', label: 'Few' },
  { value: 'many', label: 'Many' },
];

export const WORLD_ISLANDS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  nameParameter('Sunny Isles'),
  {
    id: 'island_size',
    label: 'How big are the islands?',
    group: 'Islands',
    type: 'choice',
    default: 'medium',
    choices: ISLAND_SIZES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'sea',
    label: 'How much sea?',
    group: 'Islands',
    type: 'choice',
    default: 'some',
    choices: SEAS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'biomes',
    label: 'What grows on the islands?',
    description:
      'Each kind of land you pick gets its own islands, from the coldest to the warmest.',
    group: 'Islands',
    type: 'set',
    default: ['grass', 'cherry'],
    choices: ISLAND_LANDS.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
  {
    id: 'trees',
    label: 'Trees',
    group: 'Islands',
    type: 'choice',
    default: 'many',
    choices: TREES.map((entry) => ({ ...entry })),
  },
]);

/** Picks from a list by value, falling back to the entry `fallback`. */
function pick<T extends { value: string }>(list: readonly T[], value: string, fallback: string): T {
  return (list.find((entry) => entry.value === value) ??
    list.find((entry) => entry.value === fallback) ??
    list[0]) as T;
}

/** The chosen entries of a set answer, or the defaults when none is chosen. */
function picked<T extends { value: string }>(
  list: readonly T[],
  values: ParameterValues,
  id: string,
  defaults: readonly string[],
): T[] {
  const chosen = setValue(values, id);
  const wanted = chosen.length > 0 ? chosen : defaults;
  return list.filter((entry) => wanted.includes(entry.value));
}

function islandsParts(context: BundleContext): WorldParts {
  const values = readValues(WORLD_ISLANDS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'world_name'));
  const ids = worldIds(context.namespace, name);
  const size = pick(ISLAND_SIZES, stringValue(values, 'island_size'), 'medium');
  const sea = pick(SEAS, stringValue(values, 'sea'), 'some');
  const many = stringValue(values, 'trees') !== 'few';
  const lands = picked(ISLAND_LANDS, values, 'biomes', ['grass', 'cherry']);
  const landBiomes = [...new Set(lands.map((land) => (many ? land.many : land.few)))];

  // The land height: the sea level where the land noise equals the shore value, rising 48
  // blocks for every unit above it and sinking as much below it (scale 24 blocks a unit).
  const scale = 24;
  const rise = 48;
  const surface = SEA_LEVEL - rise * sea.shore;
  const maxY = OVERWORLD_RANGE.minY + OVERWORLD_RANGE.height;
  const continents = ids.file('continents');
  const finalDensity = add(
    add(
      surfaceGradient(surface, scale, OVERWORLD_RANGE.minY, maxY),
      mul(round(rise / scale), continents),
    ),
    mul(0.15, noiseAt(ids.noise('detail'), 1, 1)),
  );
  const shore = sea.shore;
  const biomes: JsonObject[] = [
    biomeEntry('minecraft:deep_ocean', { continentalness: [-2, shore - 0.35] }),
    biomeEntry('minecraft:ocean', { continentalness: [shore - 0.35, shore - 0.01] }),
    biomeEntry('minecraft:beach', { continentalness: [shore - 0.01, shore + 0.04] }),
    ...spreadByTemperature(landBiomes, [shore + 0.04, 2]),
  ];
  const allBiomes = biomes.map((entry) => String(entry.biome));
  const landWords = lands.map((land) => land.label.toLowerCase()).join(', ');
  const terrain: Terrain = {
    noises: [
      {
        name: 'land',
        baseOctave: size.octave,
        amplitudes: [1, 0.6, 0.3, 0.15],
        words: 'where the islands are (high values) and where the sea is (low values)',
      },
      {
        name: 'temperature',
        baseOctave: size.octave - 1,
        amplitudes: [1, 0.5],
        words: 'how warm each island is, which picks its biome',
      },
      {
        name: 'detail',
        baseOctave: -5,
        amplitudes: [1, 0.5],
        words: 'small bumps, cliffs and overhangs on the coasts',
      },
    ],
    functions: [
      {
        name: 'continents',
        data: noiseAt(ids.noise('land'), 1, 0),
        words: `Where land and sea lie: the land noise, the same at every height. The World Type's biome list reads it as continentalness, so the beaches follow the shore.`,
      },
      {
        name: 'temperature',
        data: noiseAt(ids.noise('temperature'), 1, 0),
        words:
          'How warm it is: the temperature noise, the same at every height. The biome list spreads the island biomes over it.',
      },
      {
        name: 'final_density',
        data: finalDensity,
        words: `Solid where positive, air where negative: a slope that is 0 at height ${round(surface)} and falls by one every ${scale} blocks upwards, plus ${round(rise / scale)} times the land noise (so land rises above the sea of height ${SEA_LEVEL} where the land noise is above ${shore}), plus a little 3D detail for cliffs.`,
      },
    ],
    settings: {
      sea_level: SEA_LEVEL,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_fluid: 'minecraft:water',
      noise: { min_y: OVERWORLD_RANGE.minY, height: OVERWORLD_RANGE.height },
      noise_router: router({
        continents,
        temperature: ids.file('temperature'),
        final_density: ids.file('final_density'),
      }),
      spawn_target: [{ [continents]: [round(shore + 0.1), 2] }],
      material_rule: landSurface(allBiomes, null),
    },
    words: `${size.words} islands in ${sea.words}. The noise router's final_density (${ids.file('final_density')}) shapes the land, its continents and temperature pick the biomes, and spawn_target starts players on an island. ${LAND_SURFACE_WORDS}`,
  };
  return {
    name,
    ids,
    rock: 'minecraft:stone',
    terrain,
    overworld: noiseOverworld('minecraft:overworld', ids.settings, {
      type: 'minecraft:multi_noise',
      biomes,
    }),
    words: `${size.words} islands in ${sea.words}, with ${many ? 'many' : 'few'} trees (${landWords}), beaches around them and ocean between`,
  };
}

export function worldIslandsBundle(context: BundleContext): ContentBundle {
  return bundleOf(context, islandsParts(context));
}

// ---------------------------------------------------------------------------------------------
// Tall mountains
// ---------------------------------------------------------------------------------------------

const HEIGHTS: readonly { value: string; label: string; top: number }[] = [
  { value: 'tall', label: 'Tall: up to about height 180', top: 180 },
  { value: 'taller', label: 'Very tall: about height 240', top: 240 },
  { value: 'tallest', label: 'As tall as the world allows: about height 290', top: 290 },
];

const JAGGED: readonly {
  value: string;
  label: string;
  ridges: number;
  detail: number;
  words: string;
}[] = [
  { value: 'smooth', label: 'Smooth and rounded', ridges: 0, detail: 0, words: 'smooth' },
  { value: 'rugged', label: 'Rugged', ridges: 0.6, detail: 0.12, words: 'rugged' },
  {
    value: 'jagged',
    label: 'Jagged: sharp spikes and cliffs',
    ridges: 1.2,
    detail: 0.25,
    words: 'jagged',
  },
];

const SNOW_LINES: readonly { value: string; label: string; y: number | null }[] = [
  { value: 'low', label: 'Low: snow on the high hills too', y: 110 },
  { value: 'middle', label: 'Halfway up', y: 150 },
  { value: 'high', label: 'Only on the highest peaks', y: 200 },
  { value: 'none', label: 'No snow', y: null },
];

const MOUNTAIN_BIOMES: readonly { value: string; label: string; biome: string }[] = [
  { value: 'meadow', label: 'Meadows', biome: 'minecraft:meadow' },
  { value: 'cherry', label: 'Cherry blossom', biome: 'minecraft:cherry_grove' },
  { value: 'pine', label: 'Pine woods', biome: 'minecraft:taiga' },
  { value: 'snowy_pine', label: 'Snowy pine woods', biome: 'minecraft:grove' },
  { value: 'stony', label: 'Bare stone', biome: 'minecraft:stony_peaks' },
  { value: 'windswept', label: 'Windswept hills', biome: 'minecraft:windswept_hills' },
];

export const WORLD_MOUNTAINS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  nameParameter('High Peaks'),
  {
    id: 'height',
    label: 'How tall?',
    group: 'Mountains',
    type: 'choice',
    default: 'taller',
    choices: HEIGHTS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'jagged',
    label: 'How jagged?',
    group: 'Mountains',
    type: 'choice',
    default: 'rugged',
    choices: JAGGED.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'snow_line',
    label: 'Where does the snow start?',
    group: 'Mountains',
    type: 'choice',
    default: 'middle',
    choices: SNOW_LINES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'biomes',
    label: 'What grows on the mountains?',
    description: 'Each one you pick gets its own mountains, from the coldest to the warmest.',
    group: 'Mountains',
    type: 'set',
    default: ['meadow', 'pine', 'stony'],
    choices: MOUNTAIN_BIOMES.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
]);

function mountainsParts(context: BundleContext): WorldParts {
  const values = readValues(WORLD_MOUNTAINS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'world_name'));
  const ids = worldIds(context.namespace, name);
  const height = pick(HEIGHTS, stringValue(values, 'height'), 'taller');
  const jagged = pick(JAGGED, stringValue(values, 'jagged'), 'rugged');
  const snow = pick(SNOW_LINES, stringValue(values, 'snow_line'), 'middle');
  const chosen = picked(MOUNTAIN_BIOMES, values, 'biomes', ['meadow', 'pine', 'stony']);
  const biomeIds = chosen.map((entry) => entry.biome);

  // Land at height 80 where the mountain noise is 0; peaks rise to `top` where it is about
  // 0.6, valleys sink up to 40 blocks below 80 where it is negative (scale 64 blocks a unit).
  const scale = 64;
  const base = 80;
  const maxY = OVERWORLD_RANGE.minY + OVERWORLD_RANGE.height;
  const mountains = ids.file('mountains');
  const peaks = max(mountains, 0);
  let finalDensity: JsonObject = add(
    add(
      surfaceGradient(base, scale, OVERWORLD_RANGE.minY, maxY),
      mul(round((height.top - base) / 0.6 / scale), peaks),
    ),
    mul(round(40 / scale), min(mountains, 0)),
  );
  const noises: NoiseRecipe[] = [
    {
      name: 'mountains',
      baseOctave: -8,
      amplitudes: [1, 0.5, 0.25],
      words: 'where the mountains rise (high values) and the valleys lie (low values)',
    },
    {
      name: 'temperature',
      baseOctave: -9,
      amplitudes: [1, 0.5],
      words: 'how warm each mountain range is, which picks its biome',
    },
  ];
  if (jagged.ridges > 0) {
    finalDensity = add(
      add(finalDensity, mul(jagged.ridges, mul(abs(noiseAt(ids.noise('ridges'), 1, 0)), peaks))),
      mul(jagged.detail, noiseAt(ids.noise('detail'), 1, 1)),
    );
    noises.push(
      {
        name: 'ridges',
        baseOctave: -6,
        amplitudes: [1, 0.5],
        words: 'sharp ridges and spikes along the peaks',
      },
      {
        name: 'detail',
        baseOctave: -5,
        amplitudes: [1, 0.5],
        words: 'cliffs and overhangs on the slopes',
      },
    );
  }
  const terrain: Terrain = {
    noises,
    functions: [
      {
        name: 'mountains',
        data: noiseAt(ids.noise('mountains'), 1, 0),
        words: 'Where the mountains are: the mountain noise, the same at every height.',
      },
      {
        name: 'temperature',
        data: noiseAt(ids.noise('temperature'), 1, 0),
        words:
          'How warm it is: the temperature noise, the same at every height. The biome list spreads the mountain biomes over it.',
      },
      {
        name: 'final_density',
        data: finalDensity,
        words: `Solid where positive, air where negative: a slope that is 0 at height ${base} and falls by one every ${scale} blocks upwards, plus the mountains (only where the mountain noise is above 0, up to about height ${height.top}) and the valleys (where it is below 0)${jagged.ridges > 0 ? ', plus ridges along the peaks and 3D detail for cliffs' : ''}.`,
      },
    ],
    settings: {
      sea_level: SEA_LEVEL,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_fluid: 'minecraft:water',
      noise: { min_y: OVERWORLD_RANGE.minY, height: OVERWORLD_RANGE.height },
      noise_router: router({
        temperature: ids.file('temperature'),
        final_density: ids.file('final_density'),
      }),
      spawn_target: [],
      material_rule: landSurface(biomeIds, snow.y),
    },
    words: `${jagged.words} mountains up to about height ${height.top}. The noise router's final_density (${ids.file('final_density')}) shapes the land and its temperature picks the biomes.${snow.y === null ? '' : ` Above height ${snow.y} the ground is snow.`} ${LAND_SURFACE_WORDS}`,
  };
  return {
    name,
    ids,
    rock: 'minecraft:stone',
    terrain,
    overworld: noiseOverworld('minecraft:overworld', ids.settings, {
      type: 'minecraft:multi_noise',
      biomes: spreadByTemperature(biomeIds),
    }),
    words: `${jagged.words} mountains up to about height ${height.top}${snow.y === null ? ' without snow' : `, snowy above height ${snow.y}`}, with ${chosen.map((entry) => entry.label.toLowerCase()).join(', ')}`,
  };
}

export function worldMountainsBundle(context: BundleContext): ContentBundle {
  return bundleOf(context, mountainsParts(context));
}

// ---------------------------------------------------------------------------------------------
// One biome everywhere
// ---------------------------------------------------------------------------------------------

const ONE_BIOMES: readonly { value: string; label: string }[] = [
  { value: 'minecraft:cherry_grove', label: 'Cherry grove' },
  { value: 'minecraft:plains', label: 'Plains' },
  { value: 'minecraft:flower_forest', label: 'Flower forest' },
  { value: 'minecraft:birch_forest', label: 'Birch forest' },
  { value: 'minecraft:dark_forest', label: 'Dark forest' },
  { value: 'minecraft:pale_garden', label: 'Pale garden' },
  { value: 'minecraft:taiga', label: 'Pine woods' },
  { value: 'minecraft:jungle', label: 'Jungle' },
  { value: 'minecraft:savanna', label: 'Savanna' },
  { value: 'minecraft:desert', label: 'Desert' },
  { value: 'minecraft:badlands', label: 'Badlands' },
  { value: 'minecraft:snowy_plains', label: 'Snowy plains' },
  { value: 'minecraft:mushroom_fields', label: 'Mushroom fields (no monsters)' },
];

const SHAPES: readonly { value: string; label: string }[] = [
  { value: 'hills', label: 'Gentle hills' },
  { value: 'flat', label: 'Flat land' },
  { value: 'overworld', label: "Like the overworld (its preview needs Minecraft's own files)" },
];

export const WORLD_ONE_BIOME_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  nameParameter('Cherry World'),
  {
    id: 'biome',
    label: 'Which biome?',
    description: 'The whole world is this biome, with its plants, trees and mobs.',
    group: 'Land',
    type: 'choice',
    default: 'minecraft:cherry_grove',
    choices: ONE_BIOMES.map((entry) => ({ ...entry })),
  },
  {
    id: 'shape',
    label: 'What shape is the land?',
    group: 'Land',
    type: 'choice',
    default: 'hills',
    choices: SHAPES.map((entry) => ({ ...entry })),
  },
]);

function oneBiomeParts(context: BundleContext): WorldParts {
  const values = readValues(WORLD_ONE_BIOME_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'world_name'));
  const ids = worldIds(context.namespace, name);
  const biome = pick(ONE_BIOMES, stringValue(values, 'biome'), 'minecraft:cherry_grove');
  const shape = pick(SHAPES, stringValue(values, 'shape'), 'hills');
  const biomeSource: JsonObject = { type: 'minecraft:fixed', biome: biome.value };
  const words = `${biome.label.toLowerCase()} everywhere`;
  if (shape.value === 'overworld') {
    return {
      name,
      ids,
      rock: 'minecraft:stone',
      terrain: null,
      overworld: noiseOverworld('minecraft:overworld', 'minecraft:overworld', biomeSource),
      words: `${words}, over land shaped like the overworld's`,
      more: "Its land uses the vanilla overworld's noise settings (minecraft:overworld) by id: the game has them, and the live map draws them once your Minecraft folder is set up.",
    };
  }
  const maxY = OVERWORLD_RANGE.minY + OVERWORLD_RANGE.height;
  const hills = shape.value === 'hills';
  const surface = hills ? 72 : 64;
  const scale = 32;
  const gradient = surfaceGradient(surface, scale, OVERWORLD_RANGE.minY, maxY);
  const finalDensity = hills
    ? add(
        add(gradient, mul(0.6, noiseAt(ids.noise('hills'), 1, 0))),
        mul(0.08, noiseAt(ids.noise('detail'), 1, 1)),
      )
    : gradient;
  const terrain: Terrain = {
    noises: hills
      ? [
          {
            name: 'hills',
            baseOctave: -7,
            amplitudes: [1, 0.5, 0.25],
            words: 'where the hills rise and the hollows sink',
          },
          {
            name: 'detail',
            baseOctave: -4,
            amplitudes: [1],
            words: 'small bumps on the slopes',
          },
        ]
      : [],
    functions: [
      {
        name: 'final_density',
        data: finalDensity,
        words: hills
          ? `Solid where positive, air where negative: a slope that is 0 at height ${surface} and falls by one every ${scale} blocks upwards, plus the hills noise (hills about 20 blocks high, hollows below the sea of height ${SEA_LEVEL} fill as lakes) and a little 3D detail.`
          : `Solid where positive, air where negative: a slope that is 0 at height ${surface}, so the land is flat with its top at height ${surface - 1}.`,
      },
    ],
    settings: {
      sea_level: SEA_LEVEL,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_fluid: 'minecraft:water',
      noise: { min_y: OVERWORLD_RANGE.minY, height: OVERWORLD_RANGE.height },
      noise_router: router({ final_density: ids.file('final_density') }),
      spawn_target: [],
      material_rule: landSurface([biome.value], null),
    },
    words: `${hills ? 'gentle hills with lakes' : 'flat land'}. The noise router's final_density (${ids.file('final_density')}) shapes it. ${LAND_SURFACE_WORDS}`,
  };
  return {
    name,
    ids,
    rock: 'minecraft:stone',
    terrain,
    overworld: noiseOverworld('minecraft:overworld', ids.settings, biomeSource),
    words: `${words}, over ${hills ? 'gentle hills' : 'flat land'}`,
  };
}

export function worldOneBiomeBundle(context: BundleContext): ContentBundle {
  return bundleOf(context, oneBiomeParts(context));
}

// ---------------------------------------------------------------------------------------------
// Caves only
// ---------------------------------------------------------------------------------------------

const TOPS: readonly { value: string; label: string }[] = [
  { value: 'roof', label: 'A roof of rock over everything' },
  { value: 'open', label: 'Open to the sky, with land on top' },
];

const ROCKS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:stone', label: 'Stone' },
  { value: 'minecraft:deepslate', label: 'Deepslate: darker and harder' },
  { value: 'minecraft:tuff', label: 'Tuff' },
  { value: 'minecraft:andesite', label: 'Andesite' },
  { value: 'minecraft:blackstone', label: 'Blackstone' },
];

const LAKES: readonly { value: string; label: string; fluid: string; words: string }[] = [
  { value: 'water', label: 'Water', fluid: 'minecraft:water', words: 'water' },
  { value: 'lava', label: 'Lava', fluid: 'minecraft:lava', words: 'lava' },
  { value: 'none', label: 'No lakes', fluid: 'minecraft:air', words: '' },
];

const GLOWS: readonly { value: string; label: string; block: string | null }[] = [
  { value: 'glowstone', label: 'Glowstone on the cave roofs', block: 'minecraft:glowstone' },
  { value: 'shroomlight', label: 'Shroomlight on the cave roofs', block: 'minecraft:shroomlight' },
  { value: 'none', label: 'Nothing glows: bring torches', block: null },
];

export const WORLD_CAVES_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  nameParameter('Deep Caverns'),
  {
    id: 'top',
    label: 'Roof or open top?',
    group: 'Caves',
    type: 'choice',
    default: 'roof',
    choices: TOPS.map((entry) => ({ ...entry })),
  },
  {
    id: 'rock',
    label: 'What is the rock?',
    group: 'Caves',
    type: 'choice',
    default: 'minecraft:stone',
    choices: ROCKS.map((entry) => ({ ...entry })),
  },
  {
    id: 'lakes',
    label: 'Lakes at the bottom',
    group: 'Caves',
    type: 'choice',
    default: 'water',
    choices: LAKES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'glow',
    label: 'What glows?',
    group: 'Caves',
    type: 'choice',
    default: 'glowstone',
    choices: GLOWS.map(({ value, label }) => ({ value, label })),
  },
]);

/** The cave world's height range: under a roof as the Nether's, open taller for the land. */
const CAVE_RANGES = { roof: { minY: 0, height: 128 }, open: { minY: 0, height: 192 } } as const;
/** The lakes fill every cave below this height. */
const CAVE_LAKE_LEVEL = 20;

function cavesParts(context: BundleContext): WorldParts {
  const values = readValues(WORLD_CAVES_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'world_name'));
  const ids = worldIds(context.namespace, name);
  const roof = stringValue(values, 'top') !== 'open';
  const rock = pick(ROCKS, stringValue(values, 'rock'), 'minecraft:stone');
  const lakes = pick(LAKES, stringValue(values, 'lakes'), 'water');
  const glow = pick(GLOWS, stringValue(values, 'glow'), 'glowstone');
  const range = roof ? CAVE_RANGES.roof : CAVE_RANGES.open;
  const top = range.minY + range.height;

  // Caverns where the cavern noise is above 0.2, tunnels where both tunnel noises are near 0,
  // always solid at the floor, and under the roof or below the land surface on top.
  const caverns = add(0.2, mul(-1, noiseAt(ids.noise('caverns'), 1, 1.6)));
  const tunnels = add(
    mul(
      5,
      max(abs(noiseAt(ids.noise('tunnels_a'), 1, 1)), abs(noiseAt(ids.noise('tunnels_b'), 1, 1))),
    ),
    -0.35,
  );
  let open: JsonObject = min(caverns, tunnels);
  if (roof) {
    open = max(open, gradientY(top - 24, -2, top - 8, 2));
  } else {
    open = min(
      open,
      add(gradientY(110, 1.5, 160, -1.5), mul(0.5, noiseAt(ids.noise('hills'), 1, 0))),
    );
  }
  const finalDensity = max(gradientY(range.minY, 2, range.minY + 10, -2), open);
  const noises: NoiseRecipe[] = [
    {
      name: 'caverns',
      baseOctave: -6,
      amplitudes: [1, 0.5],
      words: 'the big caverns, where it is high',
    },
    { name: 'tunnels_a', baseOctave: -5, amplitudes: [1], words: 'one half of the tunnels' },
    { name: 'tunnels_b', baseOctave: -5, amplitudes: [1], words: 'the other half of the tunnels' },
  ];
  if (!roof) {
    noises.push({
      name: 'hills',
      baseOctave: -7,
      amplitudes: [1, 0.5],
      words: 'the hills of the land on top',
    });
  }
  const sequence: Json[] = [BEDROCK_FLOOR];
  if (glow.block !== null) {
    noises.push({
      name: 'glow',
      baseOctave: -4,
      amplitudes: [1],
      words: 'where the cave roofs glow',
    });
    sequence.push(
      when(
        ON_CEILING,
        when(
          {
            type: 'minecraft:noise_threshold',
            noise: ids.noise('glow'),
            min_threshold: 0.35,
            max_threshold: 9,
          },
          block(glow.block),
        ),
      ),
    );
  }
  if (!roof) {
    sequence.push(
      when(yAbove(100), {
        type: 'minecraft:sequence',
        sequence: [
          when(ON_FLOOR, block('minecraft:grass_block')),
          when(UNDER_FLOOR, block('minecraft:dirt')),
        ],
      }),
    );
  }
  sequence.push(block(rock.value));
  const lakeWords =
    lakes.value === 'none'
      ? 'no lakes'
      : `lakes of ${lakes.words} in every cave below height ${CAVE_LAKE_LEVEL}`;
  const terrain: Terrain = {
    noises,
    functions: [
      {
        name: 'final_density',
        data: finalDensity,
        words: `Solid where positive, air where negative: caverns where the cavern noise is above 0.2, tunnels where both tunnel noises are near 0, always solid in the bottom ten layers, and ${roof ? `solid in the top layers (a roof from height ${top - 24} up)` : 'air above the land surface on top (around height 135, with hills)'}.`,
      },
    ],
    settings: {
      sea_level: lakes.value === 'none' ? range.minY : CAVE_LAKE_LEVEL,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_fluid: lakes.fluid,
      noise: { min_y: range.minY, height: range.height },
      noise_router: router({ final_density: ids.file('final_density') }),
      spawn_target: [],
      material_rule: { type: 'minecraft:sequence', sequence },
    },
    words: `${rock.label.split(':')[0]?.toLowerCase()} caves with ${lakeWords}. The noise router's final_density (${ids.file('final_density')}) carves them; sea_level ${lakes.value === 'none' ? 'at the bottom and default_fluid air leave the caves dry' : `${CAVE_LAKE_LEVEL} with default_fluid ${lakes.fluid} makes the lakes`}. The surface rule (material_rule) puts bedrock at the bottom${glow.block === null ? '' : `, ${glow.block} in patches on the cave roofs`}${roof ? '' : ', grass over dirt on the land on top'} and ${rock.value} everywhere else.`,
  };
  const typeId = rl(context.namespace, `${name.id}_type`);
  const dimensionType = ownDimensionType(
    { sky: 'caves', skyColour: '#000000', fogColour: '#16161c', time: 'as_sky', beds: 'as_sky' },
    context.target,
  );
  dimensionType.has_ceiling = roof;
  dimensionType.has_skylight = !roof;
  dimensionType.min_y = range.minY;
  dimensionType.height = range.height;
  dimensionType.logical_height = range.height;
  return {
    name,
    ids,
    rock: rock.value,
    terrain,
    overworld: noiseOverworld(typeId, ids.settings, {
      type: 'minecraft:fixed',
      biome: 'minecraft:dripstone_caves',
    }),
    words: `caves in ${rock.label.split(':')[0]?.toLowerCase()} ${roof ? 'under a roof of rock' : 'open to the sky, with land on top'}, with ${lakeWords}${glow.block === null ? '' : ' and glowing patches on the cave roofs'}, all of it the dripstone caves biome`,
    more: roof
      ? 'Players start on top of the roof: dig down into the caves, which have no daylight.'
      : 'Players start on the land on top and find the caves below.',
    extra: [
      element(
        typeId,
        KINDS.dimensionType,
        dimensionType,
        `The sky and rules of ${name.display}: the overworld's rules ${roof ? 'with a ceiling and no sky light, so it is dark without torches and monsters spawn anywhere dark' : 'with sky light over the open top'}, from height ${range.minY} to ${top - 1} (the noise settings fill the same range). Open it in the Dimension Type Studio for the fog, light and rules.`,
      ),
    ],
  };
}

export function worldCavesBundle(context: BundleContext): ContentBundle {
  return bundleOf(context, cavesParts(context));
}

// ---------------------------------------------------------------------------------------------
// Empty sky with a start island
// ---------------------------------------------------------------------------------------------

const SKY_BIOMES: readonly { value: string; label: string }[] = [
  { value: 'minecraft:plains', label: 'Plains' },
  { value: 'minecraft:forest', label: 'Forest' },
  { value: 'minecraft:cherry_grove', label: 'Cherry grove' },
  { value: 'minecraft:snowy_plains', label: 'Snowy plains' },
  { value: 'minecraft:desert', label: 'Desert' },
  { value: 'minecraft:mushroom_fields', label: 'Mushroom fields (no monsters)' },
];

/** The words that say where the start island comes from (ADR 0119 D11, ADR 0114). */
export const START_ISLAND_WORDS =
  'The start island, its chest and the things you start with come from the Skyblock flow; until MSM has it, this makes the empty world only.';

export const WORLD_EMPTY_SKY_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  nameParameter('Sky World'),
  {
    id: 'biome',
    label: 'Which biome?',
    description:
      "The sky's biome decides which animals and monsters appear on what you build, the grass and water colours, and the weather.",
    group: 'Sky',
    type: 'choice',
    default: 'minecraft:plains',
    choices: SKY_BIOMES.map((entry) => ({ ...entry })),
  },
]);

function emptySkyParts(context: BundleContext): WorldParts {
  const values = readValues(WORLD_EMPTY_SKY_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'world_name'));
  const ids = worldIds(context.namespace, name);
  const biome = pick(SKY_BIOMES, stringValue(values, 'biome'), 'minecraft:plains');
  const terrain: Terrain = {
    noises: [],
    functions: [
      {
        name: 'final_density',
        data: -1,
        words: 'Air everywhere: final_density is -1 at every place, so no block is ever solid.',
      },
    ],
    settings: {
      sea_level: OVERWORLD_RANGE.minY,
      disable_mob_generation: false,
      legacy_random_source: false,
      default_fluid: 'minecraft:air',
      noise: { min_y: OVERWORLD_RANGE.minY, height: OVERWORLD_RANGE.height },
      noise_router: router({ final_density: ids.file('final_density') }),
      spawn_target: [],
      material_rule: block('minecraft:stone'),
    },
    words: `an empty world: final_density (${ids.file('final_density')}) is air everywhere, sea_level is at the bottom and default_fluid is air, so there is no water either.`,
  };
  return {
    name,
    ids,
    rock: 'minecraft:stone',
    terrain,
    overworld: noiseOverworld('minecraft:overworld', ids.settings, {
      type: 'minecraft:fixed',
      biome: biome.value,
    }),
    words: `an empty sky, all of it the ${biome.label.toLowerCase()} biome`,
    more: `${START_ISLAND_WORDS} Players start in the air and fall: play it in Creative, or build a start island with the Structure Studio.`,
  };
}

export function worldEmptySkyBundle(context: BundleContext): ContentBundle {
  return bundleOf(context, emptySkyParts(context));
}
