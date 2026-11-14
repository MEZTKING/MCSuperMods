/**
 * One commented example per tag kind.
 */
import type { ExampleProject, Json } from '@msm/plugin-api';
import { element, KINDS, rl } from '../content/bundle';
import { defineExample } from './define';

interface TagExample {
  registry: string;
  kind: string;
  title: string;
  description: string;
  path: string;
  values: Json[];
  /** What the tag is used for; completes the shared notes. */
  usage: (id: string) => string;
}

const TAGS: readonly TagExample[] = [
  {
    registry: 'block',
    kind: KINDS.tagBlock,
    title: 'Block tag',
    description: 'A group of blocks, used in commands, predicates and other tags.',
    path: 'emerald_ores',
    values: ['minecraft:emerald_ore', 'minecraft:deepslate_emerald_ore'],
    usage: (id) =>
      `Use it wherever a block or block tag is accepted, for example execute if block ~ ~-1 ~ #${id} run say Standing on emerald ore.`,
  },
  {
    registry: 'item',
    kind: KINDS.tagItem,
    title: 'Item tag',
    description: 'A group of items, used as a recipe ingredient or in item predicates.',
    path: 'gems',
    values: ['minecraft:emerald', 'minecraft:diamond', 'minecraft:amethyst_shard'],
    usage: (id) =>
      `Use it as a recipe ingredient (#${id}), in advancement item conditions or in clear @s #${id}.`,
  },
  {
    registry: 'entity_type',
    kind: KINDS.tagEntityType,
    title: 'Entity type tag',
    description: 'A group of mobs, used in target selectors and entity predicates.',
    path: 'bosses',
    values: ['minecraft:ender_dragon', 'minecraft:wither', 'minecraft:elder_guardian'],
    usage: (id) => `Use it in a selector: kill @e[type=#${id}].`,
  },
  {
    registry: 'fluid',
    kind: KINDS.tagFluid,
    title: 'Fluid tag',
    description: 'A group of fluids, used in location predicates.',
    path: 'liquids',
    values: ['minecraft:water', 'minecraft:lava'],
    usage: (id) => `Use it in location predicates that check fluids, as #${id}.`,
  },
  {
    registry: 'game_event',
    kind: KINDS.tagGameEvent,
    title: 'Game event tag',
    description: 'A group of game events, such as those a sculk sensor can hear.',
    path: 'loud_actions',
    values: ['minecraft:block_place', 'minecraft:block_destroy', 'minecraft:explode'],
    usage: (id) =>
      `Vanilla uses game event tags for vibrations (minecraft:vibrations); this one, #${id}, is ready for your own predicates and tags.`,
  },
  {
    registry: 'function',
    kind: KINDS.tagFunction,
    title: 'Function tag',
    description: 'A group of functions run together with /function #<tag>.',
    path: 'every_greeting',
    values: [],
    usage: (id) => `/function #${id} runs every listed function in order.`,
  },
  {
    registry: 'damage_type',
    kind: KINDS.tagDamageType,
    title: 'Damage type tag',
    description: 'A group of damage types, used in damage predicates and enchantments.',
    path: 'hot',
    values: ['minecraft:in_fire', 'minecraft:on_fire', 'minecraft:lava', 'minecraft:hot_floor'],
    usage: (id) =>
      `Use it in damage source predicates (tags: [{ id: "${id}", expected: true }]) or in enchantment effects.`,
  },
  {
    registry: 'enchantment',
    kind: KINDS.tagEnchantment,
    title: 'Enchantment tag',
    description: 'A group of enchantments, used for exclusivity and enchanting tables.',
    path: 'favourites',
    values: ['minecraft:sharpness', 'minecraft:unbreaking', 'minecraft:mending'],
    usage: (id) =>
      `Enchantments refer to tags like #${id} in exclusive_set, and loot functions such as enchant_randomly take one in options.`,
  },
  {
    registry: 'painting_variant',
    kind: KINDS.tagPaintingVariant,
    title: 'Painting variant tag',
    description:
      'A group of painting variants; minecraft:placeable lists those a placed painting can pick.',
    path: 'landscapes',
    values: ['minecraft:sunset', 'minecraft:sea', 'minecraft:lowmist'],
    usage: (id) =>
      `A placed painting item picks a random variant from the vanilla tag #minecraft:placeable; a tag of your own such as #${id} is for grouping and reuse.`,
  },
  {
    registry: 'worldgen/biome',
    kind: KINDS.tagWorldgenBiome,
    title: 'Biome tag',
    description: 'A group of biomes, used to decide where structures generate.',
    path: 'has_structure/meadow_cabin',
    values: ['minecraft:meadow', 'minecraft:cherry_grove'],
    usage: (id) =>
      `A structure lists a biome tag in its biomes field, so pointing a structure at #${id} lets it generate in exactly these biomes.`,
  },
  {
    registry: 'worldgen/structure',
    kind: KINDS.tagWorldgenStructure,
    title: 'Structure tag',
    description: 'A group of structures, used by /locate, maps and explorer trades.',
    path: 'villages_i_like',
    values: ['minecraft:village_plains', 'minecraft:village_taiga'],
    usage: (id) => `Find the nearest one with /locate structure #${id}.`,
  },
  {
    registry: 'worldgen/world_preset',
    kind: KINDS.tagWorldgenWorldPreset,
    title: 'World preset tag',
    description: 'A group of world presets; minecraft:normal lists the World Type choices.',
    path: 'my_presets',
    values: ['minecraft:normal', 'minecraft:large_biomes'],
    usage: (id) =>
      `Only presets in the vanilla tag #minecraft:normal appear on the World Type button; a tag of your own such as #${id} is for grouping and reuse.`,
  },
  {
    registry: 'villager_trade',
    kind: KINDS.tagVillagerTrade,
    title: 'Villager trade tag',
    description:
      'A group of villager trades; vanilla villagers draw theirs from tags such as minecraft:fletcher/level_1.',
    path: 'arrow_trades',
    values: ['minecraft:fletcher/1/emerald_arrow', 'minecraft:fletcher/2/emerald_bow'],
    usage: (id) =>
      `A trade set draws its trades from a tag ("trades": "#${id}"). To offer a trade to a vanilla villager, add it to the vanilla tag of its profession and level, such as minecraft:fletcher/level_1, without replace.`,
  },
  {
    registry: 'banner_pattern',
    kind: KINDS.tagBannerPattern,
    title: 'Banner pattern tag',
    description:
      'A group of banner patterns, such as those a banner pattern item unlocks in the loom.',
    path: 'borders',
    values: ['minecraft:border', 'minecraft:curly_border'],
    usage: (id) =>
      `A banner pattern item's minecraft:provides_banner_patterns component names a tag like #${id}, and the loom then offers its patterns; vanilla's minecraft:no_item_required lists the patterns the loom offers without one.`,
  },
  {
    registry: 'dialog',
    kind: KINDS.tagDialog,
    title: 'Dialog tag',
    description:
      'A group of dialogs; vanilla tags put dialogs on the pause screen and the quick actions key.',
    path: 'help_screens',
    values: ['minecraft:server_links'],
    usage: (id) =>
      `Dialogs in the vanilla tags #minecraft:pause_screen_additions and #minecraft:quick_actions get a button on the pause screen or open with the quick actions key; a tag of your own such as #${id} is for grouping and reuse, for example in a dialog list.`,
  },
  {
    registry: 'instrument',
    kind: KINDS.tagInstrument,
    title: 'Instrument tag',
    description: 'A group of goat horn calls, used by goats and by loot that hands out horns.',
    path: 'calm_horns',
    values: ['minecraft:ponder_goat_horn', 'minecraft:feel_goat_horn', 'minecraft:dream_goat_horn'],
    usage: (id) =>
      `The set_instrument loot function picks a random call from a tag such as #${id}; goats drop a horn from #minecraft:regular_goat_horns, or #minecraft:screaming_goat_horns when they scream.`,
  },
  {
    registry: 'point_of_interest_type',
    kind: KINDS.tagPointOfInterestType,
    title: 'Point of interest tag',
    description:
      'A group of point of interest types, the job sites, beds and nests villagers and bees look for.',
    path: 'ranged_job_sites',
    values: ['minecraft:fletcher', 'minecraft:cartographer'],
    usage: (id) =>
      `Vanilla uses #minecraft:acquirable_job_site for the blocks a villager can take a job at and #minecraft:bee_home for hives and nests; a tag of your own such as #${id} is for grouping and reuse.`,
  },
  {
    registry: 'potion',
    kind: KINDS.tagPotion,
    title: 'Potion tag',
    description: 'A group of potions, used by brewing recipes and by the trader potion list.',
    path: 'swiftness_potions',
    values: ['minecraft:swiftness', 'minecraft:long_swiftness', 'minecraft:strong_swiftness'],
    usage: (id) =>
      `A brewing recipe's input can take every potion of a tag ("potion_contents": { "potions": "#${id}" }). Vanilla's #minecraft:tradeable lists the potions villagers sell as tipped arrows.`,
  },
  {
    registry: 'timeline',
    kind: KINDS.tagTimeline,
    title: 'Timeline tag',
    description: 'A group of timelines; a dimension type runs the timelines of its tag.',
    path: 'calm_skies',
    values: ['minecraft:day', 'minecraft:moon'],
    usage: (id) =>
      `A dimension type names a tag in its timelines field, so a dimension type with "timelines": "#${id}" runs the day and moon timelines only. The overworld uses #minecraft:in_overworld.`,
  },
  {
    registry: 'worldgen/feature',
    kind: KINDS.tagWorldgenFeature,
    title: 'Feature tag',
    description: 'A group of configured features, such as the flowers bone meal can grow.',
    path: 'meadow_flowers',
    values: ['minecraft:flower_meadow', 'minecraft:flower_plain'],
    usage: (id) =>
      `Vanilla's #minecraft:can_spawn_from_bone_meal lists the flower features bone meal on grass can grow; a tag of your own such as #${id} is for grouping and reuse.`,
  },
  {
    registry: 'worldgen/flat_level_generator_preset',
    kind: KINDS.tagWorldgenFlatLevelGeneratorPreset,
    title: 'Superflat preset tag',
    description:
      'A group of superflat presets; minecraft:visible lists those on the Presets screen.',
    path: 'favourite_flats',
    values: ['minecraft:classic_flat', 'minecraft:the_void'],
    usage: (id) =>
      `Only presets in the vanilla tag #minecraft:visible appear under Customise, then Presets, for a Superflat world; a tag of your own such as #${id} is for grouping and reuse.`,
  },
];

function notes(id: string, tag: TagExample): string {
  return `A ${tag.registry} tag gives one name to several ${tag.registry} ids. values lists ids or other tags (written #namespace:path); set replace to true only to wipe what other packs put in a tag of the same id. ${tag.usage(id)}`;
}

export const tagExamples: readonly ExampleProject[] = TAGS.map((tag) =>
  defineExample({
    id: `example_tag_${tag.registry.replaceAll('/', '_')}`,
    title: tag.title,
    description: tag.description,
    kind: tag.kind,
    category: 'Tags',
    tags: ['tag', tag.registry.replaceAll('/', '_')],
    build: ({ namespace }) => {
      const id = rl(namespace, tag.path);
      if (tag.registry !== 'function') {
        return {
          elements: [element(id, tag.kind, { values: tag.values }, notes(id, tag))],
          assets: [],
        };
      }
      // The function tag lists two functions of its own bundle.
      const hello = rl(namespace, 'greetings/hello');
      const wave = rl(namespace, 'greetings/wave');
      return {
        elements: [
          element(id, tag.kind, { values: [hello, wave] }, notes(id, tag)),
          element(hello, KINDS.function, { lines: ['say Hello!'] }, 'Listed first in the tag.'),
          element(
            wave,
            KINDS.function,
            { lines: ['particle minecraft:heart ~ ~2 ~ 0.5 0.5 0.5 0 5'] },
            'Listed second in the tag.',
          ),
        ],
        assets: [],
      };
    },
  }),
);
