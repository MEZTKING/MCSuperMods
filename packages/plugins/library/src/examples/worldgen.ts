/**
 * One commented example per worldgen kind (ADR 0022): biome, configured feature, placed
 * feature, dimension and world preset, then one per tier-B registry (the template content with
 * notes). Feature lists in biomes are vanilla-ordered subsequences of the forest biome, so the
 * examples never cause a "Feature order cycle".
 */
import type { ExampleProject, Json } from '@msm/plugin-api';
import { element, KINDS, rl } from '../content/bundle';
import { defineExample } from './define';

const CATEGORY = 'Worldgen';
const ADVANCED = 'Worldgen (advanced)';

const uniform = (min: Json, max: Json): Json => ({
  type: 'minecraft:uniform',
  min_inclusive: min,
  max_inclusive: max,
});

const VANILLA_NETHER: Json = {
  type: 'minecraft:the_nether',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:nether',
    biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
  },
};

const VANILLA_END: Json = {
  type: 'minecraft:the_end',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:end',
    biome_source: { type: 'minecraft:the_end' },
  },
};

/** A surface rule: bedrock at the bottom, grass on top, dirt below the top block. */
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

/** An example whose bundle is one element. */
function single(input: {
  id: string;
  title: string;
  description: string;
  kind: string;
  category: string;
  tags: string[];
  path: string;
  data: Json;
  notes: (id: string) => string;
}): ExampleProject {
  return defineExample({
    id: input.id,
    title: input.title,
    description: input.description,
    kind: input.kind,
    category: input.category,
    tags: input.tags,
    build: ({ namespace }) => {
      const id = rl(namespace, input.path);
      return {
        elements: [element(id, input.kind, structuredClone(input.data), input.notes(id))],
        assets: [],
      };
    },
  });
}

export const worldgenExamples: readonly ExampleProject[] = [
  single({
    id: 'example_biome',
    title: 'Biome',
    description: 'A quiet meadow: no trees, flowers and grass, the usual ores and caves.',
    kind: KINDS.biome,
    category: CATEGORY,
    tags: ['biome', 'worldgen', 'climate'],
    path: 'quiet_meadow',
    data: {
      has_precipitation: true,
      temperature: 0.5,
      downfall: 0.6,
      attributes: {
        'minecraft:visual/sky_color': 7972607,
        'minecraft:visual/fog_color': 12638463,
        'minecraft:visual/water_fog_color': 329011,
      },
      effects: { water_color: 4159204, grass_color: 8573004 },
      carvers: ['minecraft:cave', 'minecraft:cave_extra_underground', 'minecraft:canyon'],
      features: [
        [],
        ['minecraft:lake_lava_underground', 'minecraft:lake_lava_surface'],
        [],
        ['minecraft:monster_room'],
        [],
        [],
        [
          'minecraft:ore_dirt',
          'minecraft:ore_gravel',
          'minecraft:ore_coal_upper',
          'minecraft:ore_coal_lower',
          'minecraft:ore_iron_upper',
          'minecraft:ore_iron_middle',
          'minecraft:ore_copper',
        ],
        [],
        ['minecraft:spring_water'],
        ['minecraft:forest_flowers', 'minecraft:flower_default', 'minecraft:patch_grass_forest'],
        ['minecraft:freeze_top_layer'],
      ],
    },
    notes: (id) =>
      `temperature and downfall drive snow, rain and the default grass colour; attributes hold the sky and fog colours and, if you add it, minecraft:gameplay/natural_mob_spawns. features has one list of placed features per decoration step in the game's order, and carvers cut caves and canyons. Keep vanilla features in vanilla's order across biomes, or the game stops with a "Feature order cycle" error. A biome appears only where a dimension or world preset lists it, for example a dimension whose biome source is fixed to ${id}.`,
  }),
  single({
    id: 'example_feature',
    title: 'Configured feature',
    description: 'Clay pockets in dirt: an ore feature that replaces dirt with clay.',
    kind: KINDS.feature,
    category: CATEGORY,
    tags: ['feature', 'ore', 'worldgen'],
    path: 'clay_pocket',
    data: {
      type: 'minecraft:ore',
      size: 20,
      discard_chance_on_air_exposure: 0,
      targets: [
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:dirt' },
          state: 'minecraft:clay',
        },
      ],
    },
    notes: (id) =>
      `A configured feature says what to place: type picks the generator, and the other fields are its settings. The ore generator replaces each block that matches a target with that target's state, here dirt with clay, in a blob of about size blocks. It does nothing on its own; a placed feature decides where and how often, and a biome lists that placed feature. Try /place feature ${id} near some dirt.`,
  }),
  defineExample({
    id: 'example_placed_feature',
    title: 'Placed feature',
    description: 'Scatters poppies in patches on the surface.',
    kind: KINDS.placedFeature,
    category: CATEGORY,
    tags: ['feature', 'placement', 'flowers'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'poppy_patch');
      const poppy = rl(namespace, 'poppy');
      return {
        elements: [
          element(
            id,
            KINDS.placedFeature,
            {
              feature: poppy,
              placement: [
                { type: 'minecraft:rarity_filter', chance: 4 },
                { type: 'minecraft:in_square' },
                { type: 'minecraft:heightmap', heightmap: 'MOTION_BLOCKING' },
                { type: 'minecraft:count', count: 32 },
                {
                  type: 'minecraft:offset',
                  x: uniform(-7, 7),
                  y: uniform(-3, 3),
                  z: uniform(-7, 7),
                },
                {
                  type: 'minecraft:block_predicate_filter',
                  predicate: { type: 'minecraft:matching_blocks', blocks: 'minecraft:air' },
                },
                { type: 'minecraft:biome' },
              ],
            },
            `placement is a pipeline that turns one position per chunk into the positions where ${poppy} runs. rarity_filter keeps one chunk in four, in_square moves to a random spot, heightmap lifts it to the surface, then count and offset spread 32 tries around it. block_predicate_filter keeps tries in air and biome keeps those inside biomes that list ${id}. Add it to a biome's vegetal decoration list to use it.`,
          ),
          element(
            poppy,
            KINDS.feature,
            {
              type: 'minecraft:simple_block',
              to_place: { type: 'minecraft:simple', state: 'minecraft:poppy' },
            },
            'One poppy wherever it is placed.',
          ),
        ],
        assets: [],
      };
    },
  }),
  single({
    id: 'example_dimension',
    title: 'Dimension',
    description: 'A new dimension where the whole world is a cherry grove.',
    kind: KINDS.dimension,
    category: CATEGORY,
    tags: ['dimension', 'worldgen', '/execute in'],
    path: 'cherry_realm',
    data: {
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biome_source: { type: 'minecraft:fixed', biome: 'minecraft:cherry_grove' },
      },
    },
    notes: (id) =>
      `A dimension pairs a dimension type (sky, light, height) with a generator. This one uses the overworld type and terrain, but a fixed biome source makes every column a cherry grove. The game loads new dimensions when a world opens. Visit it with /execute in ${id} run tp @s ~ 150 ~.`,
  }),
  defineExample({
    id: 'example_world_preset',
    title: 'World preset',
    description: 'A World Type with amplified terrain covered in cherry groves.',
    kind: KINDS.worldPreset,
    category: CATEGORY,
    tags: ['world preset', 'world type', 'worldgen'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'amplified_cherries');
      return {
        elements: [
          element(
            id,
            KINDS.worldPreset,
            {
              dimensions: {
                'minecraft:overworld': {
                  type: 'minecraft:overworld',
                  generator: {
                    type: 'minecraft:noise',
                    settings: 'minecraft:amplified',
                    biome_source: { type: 'minecraft:fixed', biome: 'minecraft:cherry_grove' },
                  },
                },
                'minecraft:the_nether': structuredClone(VANILLA_NETHER),
                'minecraft:the_end': structuredClone(VANILLA_END),
              },
            },
            `A world preset is a World Type on the Create New World screen: one entry per dimension of the new world. The overworld here uses the amplified noise settings with a fixed cherry grove biome; the nether and the end are the vanilla ones. It is offered only because the minecraft:normal tag lists it. The button shows the language key generator.${id.replace(':', '.')} until a resource pack names it.`,
          ),
          element(
            'minecraft:normal',
            KINDS.tagWorldgenWorldPreset,
            { values: [id] },
            'Adds the preset to the World Type list; replace stays false, so the vanilla types remain.',
          ),
        ],
        assets: [],
      };
    },
  }),
  single({
    id: 'example_noise_settings',
    title: 'Noise settings',
    description: 'Gentle hills from a height gradient plus one noise, with a simple surface.',
    kind: KINDS.noiseSettings,
    category: ADVANCED,
    tags: ['noise', 'terrain', 'worldgen'],
    path: 'gentle_hills',
    data: {
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
    notes: (id) =>
      `Noise settings shape the terrain of a noise generator. final_density decides solid or empty at each block: positive is default_block, negative is air or, below sea_level, default_fluid. Here a gradient from y 32 to y 96 plus a gentle noise makes low hills, and material_rule paints grass, dirt and bedrock. Use it as the settings of a dimension's generator, for example settings: ${id}.`,
  }),
  single({
    id: 'example_density_function',
    title: 'Density function',
    description: 'A reusable density function: one vanilla noise, stretched horizontally.',
    kind: KINDS.densityFunction,
    category: ADVANCED,
    tags: ['density', 'terrain', 'noise'],
    path: 'rolling_noise',
    data: { type: 'minecraft:noise', noise: 'minecraft:surface', xz_scale: 0.5, y_scale: 0 },
    notes: (id) =>
      `A density function returns a number for every block position; noise settings combine them into terrain. This one samples the vanilla surface noise, with xz_scale stretching it sideways and y_scale 0 keeping it the same at every height. Refer to it by id (${id}) wherever a density function is expected, for example inside final_density.`,
  }),
  single({
    id: 'example_noise',
    title: 'Noise',
    description: 'Noise parameters: three octaves starting at a large scale.',
    kind: KINDS.noise,
    category: ADVANCED,
    tags: ['noise', 'octaves'],
    path: 'wide_noise',
    data: { base_octave: -7, octave_count: 3, amplitude_modifiers: [1, 1, 0.5] },
    notes: (id) =>
      `A noise is the random pattern density functions sample. base_octave sets the scale of the first octave, and lower numbers make larger features. amplitude_modifiers holds one weight per octave, so the third octave counts half as much. Sample it with a density function of type minecraft:noise and noise: ${id}.`,
  }),
  single({
    id: 'example_carver',
    title: 'Carver',
    description: 'Wide cave tunnels between the bottom of the world and y 180.',
    kind: KINDS.carver,
    category: ADVANCED,
    tags: ['carver', 'caves'],
    path: 'big_caves',
    data: {
      type: 'minecraft:cave',
      probability: 0.15,
      y: uniform({ above_bottom: 8 }, { absolute: 180 }),
      count: uniform(1, 3),
      thickness: {
        type: 'minecraft:uniform',
        min_inclusive: 0.1,
        max_exclusive: 0.9,
      },
      room_vertical_radius_multiplier: 1,
      horizontal_radius_multiplier: 1.5,
      vertical_radius_multiplier: 1,
      floor_level: -0.7,
    },
    notes: (id) =>
      `A carver cuts caves or canyons out of the terrain after it is shaped. probability is the chance a chunk starts a cave system, y and count where and how many tunnels, and the radius multipliers make them wider or taller. List ${id} in a biome's carvers to use it.`,
  }),
  single({
    id: 'example_flat_level_generator_preset',
    title: 'Superflat preset',
    description: 'A superflat preset: bedrock, stone, dirt and grass in the plains biome.',
    kind: KINDS.flatLevelGeneratorPreset,
    category: ADVANCED,
    tags: ['superflat', 'preset'],
    path: 'classic_flat',
    data: {
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
    notes: () =>
      'A superflat preset appears under Customize > Presets when the World Type is Superflat. layers are listed from the bottom up, each with a block and a height. display is the item shown beside the name, and features turns trees and ores on or off.',
  }),
  single({
    id: 'example_multi_noise_biome_source_parameter_list',
    title: 'Multi-noise parameter list',
    description: 'A named biome layout using the vanilla overworld parameters.',
    kind: KINDS.multiNoiseBiomeSourceParameterList,
    category: ADVANCED,
    tags: ['biome source', 'climate'],
    path: 'overworld_layout',
    data: { preset: 'minecraft:overworld' },
    notes: (id) =>
      `A parameter list names a set of biomes and climate points for a multi_noise biome source. preset reuses the built-in overworld layout; vanilla's own overworld refers to such a list instead of listing every biome. Use it in a biome source as { type: minecraft:multi_noise, preset: ${id} }.`,
  }),
  single({
    id: 'example_block_state_provider',
    title: 'Block state provider',
    description: 'Picks stone, andesite or cobblestone by weight.',
    kind: KINDS.blockStateProvider,
    category: ADVANCED,
    tags: ['block state provider', 'features'],
    path: 'stone_mix',
    data: {
      type: 'minecraft:weighted',
      entries: [
        { data: 'minecraft:stone', weight: 3 },
        { data: 'minecraft:andesite', weight: 1 },
        { data: 'minecraft:cobblestone', weight: 1 },
      ],
    },
    notes: (id) =>
      `A block state provider chooses a block each time a feature asks for one. weighted picks an entry by weight, so stone comes up three times in five. Features such as trees and simple blocks take a provider, and naming ${id} reuses this one instead of repeating it inline.`,
  }),
  single({
    id: 'example_material_condition',
    title: 'Material condition',
    description: 'True at and above y 63; a building block of surface rules.',
    kind: KINDS.materialCondition,
    category: ADVANCED,
    tags: ['surface rule', 'condition'],
    path: 'above_sea_level',
    data: {
      type: 'minecraft:y_above',
      anchor: { absolute: 63 },
      surface_depth_multiplier: 0,
      add_stone_depth: false,
    },
    notes: (id) =>
      `A material condition is the test of a surface rule: here, whether the block is at or above y 63. Surface rules use conditions in their if_true fields. Naming ${id} there lets several rules share it.`,
  }),
  single({
    id: 'example_material_rule',
    title: 'Material rule',
    description: 'A surface rule: bedrock at the bottom, grass over dirt on top.',
    kind: KINDS.materialRule,
    category: ADVANCED,
    tags: ['surface rule', 'terrain'],
    path: 'grass_and_dirt',
    data: SURFACE_RULE,
    notes: (id) =>
      `A material rule (surface rule) decides which block replaces stone near the surface. sequence tries its rules in order and the first that applies wins: bedrock near the bottom, grass on the top block above water, dirt just below. Noise settings refer to one in material_rule, and naming ${id} there reuses this one.`,
  }),
];
