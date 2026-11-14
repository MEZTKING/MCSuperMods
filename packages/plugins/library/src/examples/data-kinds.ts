/**
 * One commented example per data kind of the data kinds sweep (ADR 0064 D1): the seven mob
 * variants (the wolf one is "Snowy wolf skin", ADR 0064 D6), the four sound variants, the
 * instrument ("Custom goat horn", with its recipe and the goat horn tag), the enchantment
 * provider, the timeline and the world clock. Mob textures are generated two-tone
 * placeholders of the vanilla sizes; sound fields name vanilla sound events. All of them work
 * in a vanilla data pack.
 */
import type { ExampleProject } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { COLOURS, element, KINDS, mobSkinTexture, rl } from '../content/bundle';
import { mobSkinVariant, type SkinAnimal, spawnConditions } from '../content/mob-skins';
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
      `A wolf variant: assets names the wild, tame and angry textures of a grown wolf and baby_assets those of a pup, as texture ids under textures/entity/wolf/ (64 by 32 pixels, pups 32 by 32). spawn_conditions decides where it appears: in a snowy taiga or a grove with priority 1, so it joins the vanilla wolves of those biomes and the game picks among the highest priority that matches. Paint over the placeholders to make it yours. Try /summon minecraft:wolf ~ ~ ~ {variant:"${id}"}.`,
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
          mobSkinTexture(namespace, 'entity/nautilus/slate_nautilus', 128, 128, COLOURS.slate),
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

/**
 * The per-kind examples of the data kinds sweep, in the data pack plugin's kind order: the mob
 * variants, the sound variants, then instrument, enchantment provider, timeline, world clock.
 */
export const dataKindExamples: readonly ExampleProject[] = [
  ...variantExamples,
  otherExamples[0] as ExampleProject,
  ...soundExamples,
  ...otherExamples.slice(1),
];
