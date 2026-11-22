/**
 * One commented example per data kind of the data kinds sweep (ADR 0064 D1): the seven mob
 * variants (the wolf one is "Snowy wolf skin", ADR 0064 D6), the four sound variants, the
 * instrument ("Custom goat horn", with its recipe and the goat horn tag), the enchantment
 * provider, the timeline and the world clock; then those of the data kinds sweep 2 (ADR 0106
 * D1, D2; B508): the pot pattern, the block transformer, the test environment and instance,
 * the sulfur cube archetype, the two context providers, and the resource pack's post effect,
 * waypoint style and shader program (the wolf sound variant waits: the game requires a
 * `step_sound` the vendored schema does not know, so no example can be valid in both). Mob textures are drawn even
 * coats of the vanilla sizes and the pot face is drawn by the art generator (ADR 0092); sound
 * fields name vanilla sound events. All of them work in vanilla packs.
 */
import type { ExampleProject } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { COLOURS, element, KINDS, mobSkinTexture, rl } from '../content/bundle';
import { mobSkinVariant, type SkinAnimal, spawnConditions } from '../content/mob-skins';
import { drawnTexture } from '../starters/pattern-art';
import { defineExample } from './define';

const MOBS = 'Mob variants';
const SOUNDS = 'Mob sounds';

interface VariantExample {
  animal: SkinAnimal;
  title: string;
  description: string;
  path: string;
  colour: Rgb;
  biomes?: string | readonly string[];
  /** The notes of the variant element; `id` is its id. */
  notes: (id: string) => string;
  tags: string[];
}

const VARIANTS: readonly VariantExample[] = [
  {
    animal: 'wolf',
    title: 'Snowy wolf skin',
    description:
      'A frost-white wolf skin, tame and angry looks and baby textures included, for snowy taigas and groves.',
    path: 'frost',
    colour: COLOURS.frost,
    biomes: ['minecraft:snowy_taiga', 'minecraft:grove'],
    notes: (id) =>
      `A wolf variant: assets names the wild, tame and angry textures of a grown wolf and baby_assets those of a pup, as texture ids under textures/entity/wolf/ (64 by 32 pixels, pups 32 by 32). spawn_conditions decides where it appears: in a snowy taiga or a grove with priority 1, so it joins the vanilla wolves of those biomes and the game picks among the highest priority that matches. Paint over the drawn textures to make it yours. Try /summon minecraft:wolf ~ ~ ~ {variant:"${id}"}.`,
    tags: ['wolf', 'skin', 'texture', 'spawn_conditions'],
  },
  {
    animal: 'cat',
    title: 'Cat variant',
    description: 'A ruby-red cat skin that stray cats can have anywhere.',
    path: 'ruby_cat',
    colour: COLOURS.ruby,
    notes: (id) =>
      `A cat variant: asset_id is the grown cat's texture (64 by 32 pixels) and baby_asset_id the kitten's (32 by 32), under textures/entity/cat/. One spawn condition with priority 0 and no condition puts it among the vanilla cats wherever cats spawn, in villages and swamp huts. Try /summon minecraft:cat ~ ~ ~ {variant:"${id}"}.`,
    tags: ['cat', 'skin', 'texture'],
  },
  {
    animal: 'pig',
    title: 'Pig variant',
    description: 'A pink-violet pig skin for cherry groves.',
    path: 'blossom_pig',
    colour: COLOURS.violet,
    biomes: 'minecraft:cherry_grove',
    notes: (id) =>
      `A pig variant: asset_id is the grown pig's texture (64 by 64 pixels) and baby_asset_id the piglet's (32 by 32), under textures/entity/pig/. Its spawn condition picks cherry groves with priority 1, above the everywhere variant. An optional model chooses the vanilla cold or warm body shape. Try /summon minecraft:pig ~ ~ ~ {variant:"${id}"}.`,
    tags: ['pig', 'skin', 'texture', 'farm animal'],
  },
  {
    animal: 'cow',
    title: 'Cow variant',
    description: 'An amber cow skin for meadows.',
    path: 'meadow_cow',
    colour: COLOURS.amber,
    biomes: 'minecraft:meadow',
    notes: (id) =>
      `A cow variant: asset_id and baby_asset_id name the textures of a grown cow and a calf (both 64 by 64 pixels) under textures/entity/cow/. Its spawn condition picks meadows with priority 1. An optional model chooses the vanilla cold or warm body shape. Try /summon minecraft:cow ~ ~ ~ {variant:"${id}"}.`,
    tags: ['cow', 'skin', 'texture', 'farm animal'],
  },
  {
    animal: 'chicken',
    title: 'Chicken variant',
    description: 'A jade-green chicken skin for flower forests.',
    path: 'jade_chicken',
    colour: COLOURS.jade,
    biomes: 'minecraft:flower_forest',
    notes: (id) =>
      `A chicken variant: asset_id is the grown chicken's texture (64 by 32 pixels) and baby_asset_id the chick's (16 by 16), under textures/entity/chicken/. Its spawn condition picks flower forests with priority 1. Eggs thrown by a chicken hatch chicks of its variant. Try /summon minecraft:chicken ~ ~ ~ {variant:"${id}"}.`,
    tags: ['chicken', 'skin', 'texture', 'farm animal'],
  },
  {
    animal: 'frog',
    title: 'Frog variant',
    description: 'A sapphire frog skin for mangrove swamps.',
    path: 'sapphire_frog',
    colour: COLOURS.sapphire,
    biomes: 'minecraft:mangrove_swamp',
    notes: (id) =>
      `A frog variant: asset_id is its texture (48 by 48 pixels) under textures/entity/frog/; frogs have no baby texture, as tadpoles are a mob of their own. A tadpole picks its variant from the biome it grows up in, here a mangrove swamp with priority 1. Try /summon minecraft:frog ~ ~ ~ {variant:"${id}"}.`,
    tags: ['frog', 'skin', 'texture'],
  },
];

const variantExamples: readonly ExampleProject[] = VARIANTS.map((variant) =>
  defineExample({
    id: variant.animal === 'wolf' ? 'example_snowy_wolf_skin' : `example_${variant.animal}_variant`,
    title: variant.title,
    description: variant.description,
    kind: `minecraft:${variant.animal}_variant`,
    category: MOBS,
    tags: variant.tags,
    build: ({ namespace }) => {
      const id = rl(namespace, variant.path);
      const built = mobSkinVariant(
        variant.animal,
        namespace,
        variant.path,
        variant.colour,
        spawnConditions(variant.biomes),
      );
      return {
        elements: [
          element(id, `minecraft:${variant.animal}_variant`, built.data, variant.notes(id)),
        ],
        assets: built.assets,
      };
    },
  }),
);

/** The vanilla sound ids of one animal: `<prefix>.<name>` under `<name>_sound`. */
function vanillaSounds(prefix: string, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [`${name}_sound`, `minecraft:entity.${prefix}.${name}`]),
  );
}

const CAT_SOUNDS = [
  'ambient',
  'beg_for_food',
  'death',
  'eat',
  'hiss',
  'hurt',
  'purr',
  'purreow',
  'stray_ambient',
];

const soundExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_cat_sound_variant',
    title: 'Cat sound variant',
    description: 'A cat that purrs like the royal cat but meows like the classic one.',
    kind: KINDS.catSoundVariant,
    category: SOUNDS,
    tags: ['cat', 'sounds'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'mixed_cat'),
          KINDS.catSoundVariant,
          {
            adult_sounds: {
              ...vanillaSounds('cat', CAT_SOUNDS),
              purr_sound: 'minecraft:entity.cat_royal.purr',
              purreow_sound: 'minecraft:entity.cat_royal.purreow',
            },
            baby_sounds: vanillaSounds('baby_cat', CAT_SOUNDS),
          },
          'A cat sound variant: adult_sounds and baby_sounds name the sound event of each noise a grown cat and a kitten make. This one mixes the classic cat with the royal cat purr. The cat keeps it in its minecraft:cat/sound_variant component, which new cats get from the registered variants. Each value is a vanilla sound event id; a sound of your own needs the object form { "sound_id": "<namespace>:<event>" }.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_pig_sound_variant',
    title: 'Pig sound variant',
    description: 'A pig that grunts like the big pig and squeals like the mini one when hurt.',
    kind: KINDS.pigSoundVariant,
    category: SOUNDS,
    tags: ['pig', 'sounds'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'mixed_pig'),
          KINDS.pigSoundVariant,
          {
            adult_sounds: {
              ambient_sound: 'minecraft:entity.pig_big.ambient',
              death_sound: 'minecraft:entity.pig_big.death',
              eat_sound: 'minecraft:entity.pig_big.eat',
              hurt_sound: 'minecraft:entity.pig_mini.hurt',
              step_sound: 'minecraft:entity.pig.step',
            },
            baby_sounds: vanillaSounds('baby_pig', ['ambient', 'death', 'eat', 'hurt', 'step']),
          },
          'A pig sound variant: adult_sounds and baby_sounds name the sound event of each noise a grown pig and a piglet make. This one grunts like the vanilla big pig and squeals like the mini pig when hurt. The pig keeps it in its minecraft:pig/sound_variant component. Each value is a vanilla sound event id; a sound of your own needs the object form { "sound_id": "<namespace>:<event>" }.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_cow_sound_variant',
    title: 'Cow sound variant',
    description: 'A cow that moos like the moody cow but steps like the classic one.',
    kind: KINDS.cowSoundVariant,
    category: SOUNDS,
    tags: ['cow', 'sounds'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'grumpy_cow'),
          KINDS.cowSoundVariant,
          {
            ambient_sound: 'minecraft:entity.cow_moody.ambient',
            death_sound: 'minecraft:entity.cow_moody.death',
            hurt_sound: 'minecraft:entity.cow.hurt',
            step_sound: 'minecraft:entity.cow.step',
          },
          'A cow sound variant names the sound event of each noise a cow makes; unlike cats, pigs and chickens, cows have one set for every age. This one moos and dies like the vanilla moody cow and keeps the classic hurt and step sounds. The cow keeps it in its minecraft:cow/sound_variant component. Each value is a vanilla sound event id; a sound of your own needs the object form { "sound_id": "<namespace>:<event>" }.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_chicken_sound_variant',
    title: 'Chicken sound variant',
    description: 'A chicken that clucks like the picky chicken.',
    kind: KINDS.chickenSoundVariant,
    category: SOUNDS,
    tags: ['chicken', 'sounds'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'fussy_chicken'),
          KINDS.chickenSoundVariant,
          {
            adult_sounds: {
              ambient_sound: 'minecraft:entity.chicken_picky.ambient',
              death_sound: 'minecraft:entity.chicken.death',
              hurt_sound: 'minecraft:entity.chicken_picky.hurt',
              step_sound: 'minecraft:entity.chicken.step',
            },
            baby_sounds: vanillaSounds('baby_chicken', ['ambient', 'death', 'hurt', 'step']),
          },
          'A chicken sound variant: adult_sounds and baby_sounds name the sound event of each noise a grown chicken and a chick make. This one clucks and squawks like the vanilla picky chicken. The chicken keeps it in its minecraft:chicken/sound_variant component. Each value is a vanilla sound event id; a sound of your own needs the object form { "sound_id": "<namespace>:<event>" }.',
        ),
      ],
      assets: [],
    }),
  }),
];

const otherExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_zombie_nautilus_variant',
    title: 'Zombie nautilus variant',
    description: 'A slate-grey zombie nautilus skin that can appear in any ocean.',
    kind: KINDS.zombieNautilusVariant,
    category: MOBS,
    tags: ['zombie nautilus', 'skin', 'texture'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'slate_nautilus');
      return {
        elements: [
          element(
            id,
            KINDS.zombieNautilusVariant,
            {
              asset_id: rl(namespace, 'entity/nautilus/slate_nautilus'),
              spawn_conditions: spawnConditions(undefined),
            },
            `A zombie nautilus variant: asset_id is its texture (128 by 128 pixels) under textures/entity/nautilus/. An optional model chooses the vanilla warm body shape with its coral. One spawn condition with priority 0 mixes it in wherever no variant of a higher priority matches. Try /summon minecraft:zombie_nautilus ~ ~ ~ {variant:"${id}"}.`,
          ),
        ],
        assets: [
          mobSkinTexture(
            namespace,
            'entity/nautilus/slate_nautilus',
            128,
            128,
            COLOURS.slate,
            'smooth',
          ),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_custom_goat_horn',
    title: 'Custom goat horn',
    description:
      'A goat horn with its own call, length and range, crafted from a goat horn and an echo shard, that goats can drop.',
    kind: KINDS.instrument,
    category: 'Goat horns',
    tags: ['goat horn', 'instrument', 'sound', 'recipe'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'echo_call');
      return {
        elements: [
          element(
            id,
            KINDS.instrument,
            {
              description: { text: 'Echo Call' },
              sound_event: 'minecraft:item.goat_horn.sound.7',
              use_duration: 5,
              range: 128,
            },
            `An instrument is what a goat horn plays. sound_event is the call, here the vanilla Dream horn; for a sound of your own use the object form { "sound_id": "${namespace}:<event>" }. use_duration is how long one blow lasts and how long the horn then cools down, in seconds, and range how far away players hear it, in blocks. description is the tooltip line; a translate key works too. A goat horn plays it when its minecraft:instrument component names ${id}.`,
          ),
          element(
            rl(namespace, 'echo_call_goat_horn'),
            KINDS.recipe,
            {
              type: 'minecraft:crafting_shapeless',
              category: 'misc',
              ingredients: ['minecraft:goat_horn', 'minecraft:echo_shard'],
              result: { id: 'minecraft:goat_horn', components: { 'minecraft:instrument': id } },
            },
            'Any goat horn and an echo shard make a goat horn that plays the new call: the result carries the minecraft:instrument component.',
          ),
          element(
            'minecraft:regular_goat_horns',
            KINDS.tagInstrument,
            { values: [id] },
            "Adds the call to the vanilla tag goats pick from when they ram a tree or stone and drop a horn. The export merges it into vanilla's tag, so the eight vanilla calls stay.",
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_trial_spawner',
    title: 'Trial spawner wave',
    description:
      'A trial spawner configuration that sends husks and baby zombies, with its own rewards.',
    kind: KINDS.trialSpawner,
    category: 'Mob variants',
    tags: ['trial spawner', 'trial chamber', 'mob', 'loot'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'desert_wave');
      return {
        elements: [
          element(
            id,
            KINDS.trialSpawner,
            {
              spawn_range: 4,
              total_mobs: 6,
              simultaneous_mobs: 2,
              total_mobs_added_per_player: 2,
              simultaneous_mobs_added_per_player: 1,
              ticks_between_spawn: 40,
              spawn_potentials: [
                { weight: 3, data: { entity: { id: 'minecraft:husk' } } },
                { weight: 1, data: { entity: { id: 'minecraft:zombie', IsBaby: 1 } } },
              ],
              loot_tables_to_eject: [
                { weight: 3, data: 'minecraft:spawners/trial_chamber/consumables' },
                { weight: 1, data: 'minecraft:spawners/trial_chamber/key' },
              ],
              items_to_drop_when_ominous:
                'minecraft:spawners/trial_chamber/items_to_drop_when_ominous',
            },
            `A trial spawner configuration: the wave a trial spawner sends. spawn_potentials picks each mob by weight, here mostly husks and now and then a baby zombie (IsBaby: 1, written as vanilla's own files do). total_mobs and simultaneous_mobs grow with each extra player. When the wave is beaten the spawner ejects one of loot_tables_to_eject. A trial spawner block uses it when its normal_config names ${id}, for example /setblock ~ ~ ~ minecraft:trial_spawner{normal_config:"${id}"}.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_enchantment_provider',
    title: 'Enchantment provider',
    description: 'A rule that enchants gear like a level 5 to 20 enchanting table.',
    kind: KINDS.enchantmentProvider,
    category: 'Enchantments',
    tags: ['enchantment', 'mob equipment'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'table_like'),
          KINDS.enchantmentProvider,
          {
            type: 'minecraft:by_cost_with_difficulty',
            enchantments: '#minecraft:in_enchanting_table',
            min_cost: 5,
            max_cost_span: 15,
          },
          "An enchantment provider is a rule the game uses to enchant items it hands out itself. by_cost_with_difficulty enchants as an enchanting table would at a cost from min_cost up to min_cost plus max_cost_span, higher on harder local difficulty, picking from the enchantments listed. Vanilla uses providers such as minecraft:mob_spawn_equipment for the gear of spawned mobs and minecraft:raid/vindicator for raid axes. A project provider with one of those names replaces vanilla's; under a name of its own, like this one, nothing uses it yet.",
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_timeline',
    title: 'Timeline: slime moons',
    description:
      'A timeline that doubles the surface slime chance every other day, added to the overworld timelines.',
    kind: KINDS.timeline,
    category: 'Time',
    tags: ['timeline', 'environment attributes', 'slime'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'slime_days');
      return {
        elements: [
          element(
            id,
            KINDS.timeline,
            {
              clock: 'minecraft:overworld',
              period_ticks: 48000,
              tracks: {
                'minecraft:gameplay/surface_slime_spawn_chance': {
                  ease: 'constant',
                  modifier: 'maximum',
                  keyframes: [
                    { ticks: 0, value: 1 },
                    { ticks: 24000, value: 0 },
                  ],
                },
              },
            },
            'A timeline changes environment attributes over time. clock is the world clock it follows and period_ticks how long one round lasts, here two days. Each track sets one attribute through keyframes; ease constant holds each value until the next keyframe, and modifier maximum keeps the higher of this value and the one before. So every other day, slimes spawn on the surface as on a full moon.',
          ),
          element(
            'minecraft:in_overworld',
            KINDS.tagTimeline,
            { values: [id] },
            "The overworld's dimension type runs the timelines of this vanilla tag, so adding the timeline here makes it count. The export merges it into vanilla's tag.",
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_world_clock',
    title: 'World clock',
    description: 'A clock of its own that timelines and dimension types can follow.',
    kind: KINDS.worldClock,
    category: 'Time',
    tags: ['clock', 'timeline', 'time'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'tide_clock');
      return {
        elements: [
          element(
            id,
            KINDS.worldClock,
            {},
            `A world clock is a counter of ticks with no settings of its own, which is why its data is empty. The game keeps one value per clock and advances it every tick; vanilla has minecraft:overworld and minecraft:the_end. A timeline follows a clock through its clock field, and a dimension type names its default_clock, the one /time changes. A timeline with "clock": "${id}" runs on its own time, untouched by /time set or sleeping.`,
          ),
        ],
        assets: [],
      };
    },
  }),
];

const SHADERS = 'Shaders';
const TESTS = 'Game tests';
const NUMBERS = 'Numbers the game reads';

/** The examples of the data kinds sweep 2 (ADR 0106 D1, D2; B508), in kind order. */
const sweep2Examples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_decorated_pot_pattern',
    title: 'Pot pattern',
    description: 'A fish picture for the sides of decorated pots, drawn on fired clay.',
    kind: 'minecraft:decorated_pot_pattern',
    category: 'Decorations',
    tags: ['decorated pot', 'sherd', 'texture'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'wave');
      const face = 'wave_pottery_pattern';
      return {
        elements: [
          element(
            id,
            'minecraft:decorated_pot_pattern',
            { asset_id: rl(namespace, face) },
            `A decorated pot pattern: asset_id names its picture, textures/entity/decorated_pot/${face}.png (16 by 16), here a fish drawn by MSM on fired clay. A pot shows it on each side whose sherd carries the component minecraft:provides_pottery_pattern naming ${id}. Try /give @s minecraft:brick[minecraft:provides_pottery_pattern="${id}"] and craft a decorated pot from four of it; the Pot pattern flow adds a recipe, a name and a picture for the sherd too.`,
          ),
        ],
        assets: [
          drawnTexture(
            namespace,
            `entity/decorated_pot/${face}`,
            'pot_pattern',
            COLOURS.sapphire,
            'fish',
          ),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_block_transformer',
    title: 'Block transformer',
    description: 'A rule that turns coarse dirt into a dirt path, as a shovel flattens grass.',
    kind: 'minecraft:block_transformer',
    category: 'Tools',
    tags: ['block transformer', 'shovel', 'tool'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'coarse_path'),
          'minecraft:block_transformer',
          [
            {
              block_state_provider: {
                type: 'minecraft:rule_based',
                rules: [
                  {
                    if_true: { type: 'minecraft:matching_blocks', blocks: 'minecraft:coarse_dirt' },
                    // biome-ignore lint/suspicious/noThenProperty: the game's own key for what a rule gives
                    then: { type: 'minecraft:simple', state: { id: 'minecraft:dirt_path' } },
                  },
                ],
              },
              sound: 'minecraft:item.shovel.flatten',
            },
          ],
          'A block transformer says what using a tool on a block does: a list of transforms, tried in order, each with a block state provider whose rules pick the new block and the sound it plays. This one turns coarse dirt into a dirt path with the shovel sound. Vanilla tools read the transformers named after them, so naming one minecraft:shovel would replace what every shovel does; under a name of its own, like this one, nothing uses it yet.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_test_environment',
    title: 'Test environment',
    description: 'Rainy weather on hard difficulty, for game tests that name it.',
    kind: 'minecraft:test_environment',
    category: TESTS,
    tags: ['game test', 'map making'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'stormy_hard');
      return {
        elements: [
          element(
            id,
            'minecraft:test_environment',
            {
              type: 'minecraft:all_of',
              definitions: [
                { type: 'minecraft:weather', weather: 'rain' },
                { type: 'minecraft:difficulty', difficulty: 'hard' },
              ],
            },
            `A test environment sets up the world before a game test runs and puts it back after: all_of applies each definition in turn, here rain and hard difficulty. A test instance uses it when its environment names ${id}. Map makers use game tests to check their contraptions with /test.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_test_instance',
    title: 'Test instance',
    description: 'A game test that places a structure and waits for a test block to pass.',
    kind: 'minecraft:test_instance',
    category: TESTS,
    tags: ['game test', 'map making', 'structure'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'door_check');
      return {
        elements: [
          element(
            id,
            'minecraft:test_instance',
            {
              type: 'minecraft:block_based',
              environment: 'minecraft:default',
              structure: 'minecraft:empty',
              max_ticks: 200,
              setup_ticks: 10,
              required: true,
            },
            `A test instance is one game test. block_based places the structure named in structure (here the vanilla empty one; save your contraption with a structure block and name it here) and passes when a test block in it set to "accept" gets power, failing after max_ticks. environment names a test environment, such as one of your own. Run it with /test run ${id}.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_sulfur_cube_archetype',
    title: 'Sulfur cube kind',
    description: 'A sulfur cube that turns hot when fed magma cream.',
    kind: 'minecraft:sulfur_cube_archetype',
    category: MOBS,
    tags: ['sulfur cube', 'mob'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'magma_cube_kind'),
          'minecraft:sulfur_cube_archetype',
          {
            items: ['minecraft:magma_cream'],
            knockback_modifiers: { horizontal_power: 0.8, vertical_power: 0.6 },
            attribute_modifiers: [],
            sound_settings: {
              hit_sound: 'minecraft:entity.sulfur_cube.hot.hit',
              push_sound: 'minecraft:entity.sulfur_cube.hot.push',
              push_sound_impulse_threshold: 0.1,
              push_sound_cooldown: 0.5,
            },
          },
          'A sulfur cube archetype is what a sulfur cube becomes when it swallows one of its items, here magma cream. knockback_modifiers change how far it flies when hit, and attribute_modifiers can change its attributes (none here). sound_settings name the sounds of a hit and a push, here the vanilla hot cube sounds.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_context_int_provider',
    title: 'Whole-number provider',
    description: 'A named whole number the game can read: a random value from 2 to 4.',
    kind: 'minecraft:context_int_provider',
    category: NUMBERS,
    tags: ['number', 'compost'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'two_to_four'),
          'minecraft:context_int_provider',
          { type: 'minecraft:uniform', min: 2, max: 4 },
          'A context int provider is a whole number the game reads by name, rolled each time it is read. uniform picks one from min to max. Vanilla reads providers such as minecraft:compostable/low for how likely a composter is to fill. A project provider with that name changes the value; one under a name of its own, like this one, waits for something to name it.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_context_float_provider',
    title: 'Decimal-number provider',
    description: 'A named decimal number the game can read: always one and a half.',
    kind: 'minecraft:context_float_provider',
    category: NUMBERS,
    tags: ['number'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'one_and_a_half'),
          'minecraft:context_float_provider',
          { type: 'minecraft:constant', value: 1.5 },
          'A context float provider is a decimal number the game reads by name. constant always gives value. A project provider named after a vanilla one changes what the game reads there; under a name of its own, like this one, it waits for something to name it.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_post_effect',
    title: 'Screen effect',
    description: 'A warm sepia tint over the whole screen, from the vanilla copy shader.',
    kind: 'minecraft:post_effect',
    category: SHADERS,
    tags: ['post effect', 'shader', 'screen'],
    build: ({ namespace }) => {
      const swap = rl(namespace, 'swap');
      const pass = (input: string, output: string, tint: number[]) => ({
        vertex_shader: 'minecraft:core/screenquad',
        fragment_shader: 'minecraft:post/blit',
        inputs: [{ sampler_name: 'In', target: input }],
        output,
        uniforms: { BlitConfig: [{ name: 'ColorModulate', type: 'vec4', value: tint }] },
      });
      return {
        elements: [
          element(
            rl(namespace, 'sepia'),
            'minecraft:post_effect',
            {
              targets: { [swap]: {} },
              passes: [
                pass('minecraft:main', swap, [1, 0.86, 0.66, 1]),
                pass(swap, 'minecraft:main', [1, 1, 1, 1]),
              ],
            },
            `A post effect draws passes over the finished screen. The first pass copies the screen (minecraft:main) into the target ${swap} through the vanilla copy shader with a warm tint (ColorModulate multiplies red, green, blue and alpha); the second copies it back. The game uses post effects it knows by name, such as minecraft:creeper while spectating a creeper: name a project effect after one to replace it. MSM does not check shader files, so look at the result in game.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_waypoint_style',
    title: 'Waypoint style',
    description: 'A locator bar dot that shrinks over a long way.',
    kind: 'minecraft:waypoint_style',
    category: 'Locator bar',
    tags: ['waypoint', 'locator bar', 'hud'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'far_dots');
      return {
        elements: [
          element(
            id,
            'minecraft:waypoint_style',
            {
              near_distance: 32,
              far_distance: 512,
              sprites: [
                'minecraft:default_0',
                'minecraft:default_1',
                'minecraft:default_2',
                'minecraft:default_3',
              ],
            },
            `A waypoint style is how a player or mob shows on the locator bar. sprites are the dots from near to far, here the vanilla dots under textures/gui/sprites/hud/locator_bar_dot/. The first is used closer than near_distance and the last beyond far_distance. Try /waypoint modify @s style set ${id}.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_shader',
    title: 'Shader program',
    description: 'A shader program definition naming the vanilla textured shaders.',
    kind: 'minecraft:shader',
    category: SHADERS,
    tags: ['shader', 'glsl'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'program/textured'),
          'minecraft:shader',
          {
            vertex: 'minecraft:core/position_tex',
            fragment: 'minecraft:core/position_tex',
            samplers: [{ name: 'Sampler0' }],
            uniforms: [],
          },
          'A shader program definition names a vertex and a fragment shader (.vsh and .fsh files under shaders/), the samplers it reads and its uniforms. This one names the vanilla textured shaders. Shader files of your own go under shaders/ in the project; MSM copies them as they are without checking them, so a mistake shows only in game.',
        ),
      ],
      assets: [],
    }),
  }),
];

/**
 * The per-kind examples of the data kinds sweeps, in the data pack plugin's kind order: the mob
 * variants, the sound variants, then instrument, enchantment provider, timeline, world clock,
 * then seven data kinds and the three resource pack kinds of sweep 2 (B508).
 */
export const dataKindExamples: readonly ExampleProject[] = [
  ...variantExamples,
  otherExamples[0] as ExampleProject,
  ...soundExamples,
  ...otherExamples.slice(1),
  ...sweep2Examples,
];
