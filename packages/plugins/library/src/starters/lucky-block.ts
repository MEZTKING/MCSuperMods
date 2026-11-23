/**
 * The Lucky block Creator flow (ADR 0117 D2, ADR 0115; B557): a block of the mod's own that does
 * something random when broken. What can happen, each as often as chosen (never, rarely,
 * sometimes or often): items rolled from a loot table, a mob, an explosion that breaks nothing,
 * a small building, an effect. Its look is drawn by MSM's art generator (ADR 0092 recipe
 * `lucky_block`: the colour and a question mark or a star on it).
 *
 * It makes the block (`msm:block` with no loot of its own), its model and picture, a recipe (eight
 * gold ingots round a chest), the loot table of its prizes, the building (a
 * `minecraft:structure_template` drawn from vanilla blocks), and a Rule book whose one rule picks
 * one outcome at random by weight when a player breaks the block (Rules 3: "Pick one at random",
 * "Drop from a loot table", "Place a structure"). A new block and Rules need the Fabric mod jar
 * export (limit M1).
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import { BoxBuilder } from '../content/structures';
import { drawnTexture } from './pattern-art';
import { GAME_KINDS } from './skyblock';

/** How often an outcome happens, as weights of the random pick. */
const HOW_OFTEN: readonly { value: string; label: string; weight: number }[] = [
  { value: 'never', label: 'Never', weight: 0 },
  { value: 'rarely', label: 'Rarely', weight: 1 },
  { value: 'sometimes', label: 'Sometimes', weight: 3 },
  { value: 'often', label: 'Often', weight: 6 },
];

/** The mobs a lucky block can bring. */
const MOBS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:zombie', label: 'A zombie' },
  { value: 'minecraft:creeper', label: 'A creeper' },
  { value: 'minecraft:skeleton', label: 'A skeleton' },
  { value: 'minecraft:chicken', label: 'A chicken' },
  { value: 'minecraft:pig', label: 'A pig' },
];

/** The effects a lucky block can give. */
const EFFECTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:speed', label: 'Speed' },
  { value: 'minecraft:regeneration', label: 'Healing over time' },
  { value: 'minecraft:jump_boost', label: 'Higher jumps' },
  { value: 'minecraft:levitation', label: 'Floating up' },
  { value: 'minecraft:blindness', label: 'Blindness' },
];

const often = (id: string, label: string, fallback: string): StarterParameter => ({
  id,
  label,
  group: 'What can happen',
  type: 'choice',
  default: fallback,
  choices: HOW_OFTEN.map(({ value, label: words }) => ({ value, label: words })),
});

/** The Lucky block flow's questions, groups "Block", "What can happen" and "Look". */
export const LUCKY_BLOCK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'block_name',
    label: 'What is the block called?',
    description: 'Its name in the game. Ids derive from it: Lucky Block gives lucky_block.',
    group: 'Block',
    type: 'string',
    default: 'Lucky Block',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  often('loot', 'Prizes from a loot table', 'often'),
  often('mob', 'A mob appears', 'sometimes'),
  {
    id: 'mob_kind',
    label: 'Which mob',
    group: 'What can happen',
    type: 'choice',
    default: 'minecraft:zombie',
    choices: MOBS.map((mob) => ({ ...mob })),
  },
  often('explosion', 'An explosion (breaks nothing)', 'rarely'),
  often('building', 'A small building appears', 'sometimes'),
  often('effect', 'An effect', 'sometimes'),
  {
    id: 'effect_kind',
    label: 'Which effect',
    group: 'What can happen',
    type: 'choice',
    default: 'minecraft:speed',
    choices: EFFECTS.map((effect) => ({ ...effect })),
  },
  {
    id: 'colour',
    label: 'Colour',
    group: 'Look',
    type: 'colour',
    default: '#e8b028',
  },
  {
    id: 'mark',
    label: 'The mark on it',
    group: 'Look',
    type: 'choice',
    default: 'question',
    choices: [
      { value: 'question', label: 'A question mark' },
      { value: 'star', label: 'A star' },
    ],
  },
]);

/** The weight of an answer of "how often". */
function weightOf(value: string): number {
  return HOW_OFTEN.find((entry) => entry.value === value)?.weight ?? 0;
}

/** The small building: a cobblestone hut five by five with a doorway and a roof of planks. */
function hut(): JsonObject {
  const builder = new BoxBuilder([5, 4, 5]);
  builder.fill([0, 0, 0], [4, 0, 4], 'minecraft:cobblestone');
  for (let y = 1; y <= 2; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      for (let z = 0; z < 5; z += 1) {
        const wall = x === 0 || z === 0 || x === 4 || z === 4;
        const door = x === 2 && z === 0;
        builder.set([x, y, z], wall && !door ? 'minecraft:cobblestone' : 'minecraft:air');
      }
    }
  }
  builder.fill([0, 3, 0], [4, 3, 4], 'minecraft:oak_planks');
  builder.set([2, 1, 2], 'minecraft:crafting_table');
  builder.set([1, 2, 3], 'minecraft:torch');
  return builder.build() as JsonObject;
}

export function luckyBlockBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(LUCKY_BLOCK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'block_name'));
  const id = name.id;
  const block = rl(namespace, id);
  const model = rl(namespace, `block/${id}`);
  const loot = rl(namespace, `${id}/prizes`);
  const building = rl(namespace, `${id}/surprise_hut`);
  const mob = stringValue(values, 'mob_kind');
  const effect = stringValue(values, 'effect_kind');
  const colour = rgbFromHex(stringValue(values, 'colour'), [232, 176, 40]);
  const mark = stringValue(values, 'mark') === 'star' ? 'star' : 'question';

  const outcomes: { weight: number; step: JsonObject; words: string }[] = [
    {
      weight: weightOf(stringValue(values, 'loot')),
      step: { loot_table: loot, step: 'drop_loot', where: 'here' },
      words: `drops prizes rolled from ${loot}`,
    },
    {
      weight: weightOf(stringValue(values, 'mob')),
      step: { count: 1, mob, step: 'spawn_mob', where: 'here' },
      words: `brings ${MOBS.find((entry) => entry.value === mob)?.label.toLowerCase() ?? mob}`,
    },
    {
      weight: weightOf(stringValue(values, 'explosion')),
      step: { break_blocks: false, power: 2, step: 'explode', where: 'here' },
      words: 'makes an explosion that breaks no blocks',
    },
    {
      weight: weightOf(stringValue(values, 'building')),
      step: { step: 'place_structure', structure: building, where: 'here' },
      words: `places the building ${building}`,
    },
    {
      weight: weightOf(stringValue(values, 'effect')),
      step: { effect, level: 1, seconds: 30, step: 'give_effect' },
      words: `gives ${EFFECTS.find((entry) => entry.value === effect)?.label.toLowerCase() ?? effect} for 30 seconds`,
    },
  ].filter((outcome) => outcome.weight > 0);
  if (outcomes.length === 0) {
    outcomes.push({
      weight: 1,
      step: { loot_table: loot, step: 'drop_loot', where: 'here' },
      words: `drops prizes rolled from ${loot}`,
    });
  }
  const usesBuilding = outcomes.some((outcome) => outcome.step.step === 'place_structure');

  const elements = [
    packElement(namespace, `${projectName}: the ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds the ${name.lower}.`),
    element(
      block,
      KINDS.block,
      {
        format: 1,
        model,
        display_name: name.display,
        sound_type: 'stone',
        item: { creative_tab: 'minecraft:building_blocks' },
        components: { 'msm:breakable': { hardness: 0.5, resistance: 0.5 } },
      },
      `The ${name.lower}. It has no loot of its own (no loot field), so breaking it drops only what the rule book decides; the book adds the break event (msm:on_break) when the project is exported.`,
    ),
    element(
      model,
      KINDS.model,
      { parent: 'minecraft:block/cube_all', textures: { all: model } },
      `A full cube with the same picture on every side: MSM's drawn lucky block, with ${mark === 'star' ? 'a star' : 'a question mark'} on it.`,
    ),
    element(
      rl(namespace, `${id}_from_gold`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shaped',
        category: 'building',
        pattern: ['GGG', 'GCG', 'GGG'],
        key: { G: 'minecraft:gold_ingot', C: 'minecraft:chest' },
        result: { id: block, count: 1 },
      },
      `Eight gold ingots round a chest make one ${name.lower}.`,
    ),
    element(
      loot,
      KINDS.lootTable,
      {
        type: 'minecraft:chest',
        pools: [
          {
            rolls: { type: 'minecraft:uniform', min: 2, max: 4 },
            entries: [
              {
                type: 'minecraft:item',
                name: 'minecraft:iron_ingot',
                weight: 5,
                modifier: {
                  type: 'minecraft:set_count',
                  count: { type: 'minecraft:uniform', min: 1, max: 4 },
                },
              },
              {
                type: 'minecraft:item',
                name: 'minecraft:gold_ingot',
                weight: 4,
                modifier: {
                  type: 'minecraft:set_count',
                  count: { type: 'minecraft:uniform', min: 1, max: 3 },
                },
              },
              { type: 'minecraft:item', name: 'minecraft:diamond', weight: 2 },
              { type: 'minecraft:item', name: 'minecraft:golden_apple', weight: 2 },
              { type: 'minecraft:item', name: 'minecraft:ender_pearl', weight: 2 },
              {
                type: 'minecraft:item',
                name: 'minecraft:cookie',
                weight: 4,
                modifier: { type: 'minecraft:set_count', count: 6 },
              },
            ],
          },
        ],
      },
      'The prizes: two to four rolls of iron, gold, a diamond, a golden apple, an ender pearl or cookies. Change the entries and weights to change the prizes.',
    ),
    ...(usesBuilding
      ? [
          element(
            building,
            KINDS.structureTemplate,
            hut(),
            'The surprise building: a cobblestone hut five by five with a doorway, a roof of planks, a crafting table and a torch, drawn from vanilla blocks named by id. It is placed with its corner where the block was.',
          ),
        ]
      : []),
    element(
      rl(namespace, `${id}_rules`),
      GAME_KINDS.rules,
      {
        counters: [],
        format: 1,
        rules: [
          {
            do: [
              {
                do: outcomes.map((outcome) => outcome.step),
                step: 'pick_random',
                weights: outcomes.map((outcome) => outcome.weight),
              },
            ],
            key: `open_${id}`,
            name: `Open the ${name.lower}`,
            when: { subject: block, trigger: 'block_broken' },
          },
        ],
      },
      `When a player breaks ${block}, one thing happens, picked at random by weight: it ${outcomes.map((outcome) => `${outcome.words} (weight ${outcome.weight})`).join(', or ')}. On export the book becomes the block's break event and a generated script, so it needs the Fabric mod jar export.`,
    ),
  ];
  return {
    elements,
    assets: [
      {
        ...drawnTexture(namespace, `block/${id}`, 'lucky_block', colour, mark),
      },
    ],
  };
}
