/**
 * The Dimension flow (ADR 0051): a new dimension a beginner can enter. The answers pick the
 * terrain (vanilla noise settings, or flat), the biome (one vanilla biome, or the overworld's
 * mix), the sky and rules (a vanilla dimension type) and how to travel: a key item whose use
 * runs a travel function (Fabric mod jar), or the function alone (vanilla packs). The travel
 * function takes the player there with `spreadplayers`, so they land on solid ground, and back
 * to the overworld when used inside the dimension. No portal block: that needs new runtime
 * code. Ids derive from `dimension_name`: the dimension `<id>`, the function `<id>/travel`,
 * the key `<id>_key`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
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
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

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
  {
    id: 'terrain',
    label: 'Terrain',
    group: 'World',
    type: 'choice',
    default: 'overworld',
    choices: TERRAINS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'biome',
    label: 'Biome',
    description: 'One biome everywhere, with its plants, trees and mobs, or the overworld mix.',
    group: 'World',
    type: 'choice',
    default: 'minecraft:cherry_grove',
    choices: BIOMES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'sky',
    label: 'Sky and rules',
    group: 'World',
    type: 'choice',
    default: 'day',
    choices: SKIES.map(({ value, label }) => ({ value, label })),
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
    ],
  },
  {
    id: 'colour',
    label: 'Key colour',
    description: 'The colour of the key item on its placeholder texture.',
    group: 'Travel',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
]);

export function dimensionBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(DIMENSION_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'dimension_name'));
  const terrain =
    TERRAINS.find((entry) => entry.value === stringValue(values, 'terrain')) ??
    (TERRAINS[0] as (typeof TERRAINS)[number]);
  const biomeValue = stringValue(values, 'biome');
  const biome =
    BIOMES.find((entry) => entry.value === biomeValue) ?? (BIOMES[0] as (typeof BIOMES)[number]);
  const sky =
    SKIES.find((entry) => entry.value === stringValue(values, 'sky')) ??
    (SKIES[0] as (typeof SKIES)[number]);
  const withItem = stringValue(values, 'travel') !== 'command';
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);

  const dimension = rl(namespace, name.id);
  const travel = rl(namespace, `${name.id}/travel`);
  const key = rl(namespace, `${name.id}_key`);
  const keyModel = rl(namespace, `item/${name.id}_key`);
  const event = rl(namespace, `${name.id}_key_used`);

  const biomeSource: JsonObject =
    biome.value === 'mix'
      ? { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
      : { type: 'minecraft:fixed', biome: biome.value };
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
    `# Travels to ${name.display} and back. Run with /function ${travel}${withItem ? ', or use the key' : ''}.`,
    `execute if dimension ${dimension} in minecraft:overworld run return run spreadplayers ~ ~ 0 64 false @s`,
    `execute in ${dimension} run spreadplayers ~ ~ 0 64${under} false @s`,
  ];

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
  ];
  if (withItem) {
    elements.push(
      modElement(
        namespace,
        projectName,
        `Adds the dimension ${name.display} and a key to travel there.`,
      ),
    );
  }
  elements.push(
    element(
      dimension,
      KINDS.dimension,
      { type: sky.type, generator },
      `The dimension ${name.display}: ${terrain.words} with ${biomeWords}, and ${sky.words} (the vanilla dimension type ${sky.type}). The game loads a new dimension when a world opens, so open or reload a world after adding it.${terrain.value === 'floating_islands' || terrain.value === 'end' ? ' Islands leave gaps: the travel function looks up to 64 blocks around you for ground and says so when it finds none.' : ''}`,
    ),
    element(
      travel,
      KINDS.function,
      { lines: travelLines },
      `The travel function. execute in ${dimension} runs spreadplayers in the dimension, which puts you on solid ground within 64 blocks${under === '' ? '' : ` below height ${terrain.under}, under the roof`}. Run inside the dimension, the first line takes you back to the overworld the same way (if dimension …, then return).`,
    ),
  );
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
  return {
    elements,
    assets: withItem ? [texture(namespace, `item/${name.id}_key`, 'gem', colour)] : [],
  };
}
