/**
 * The One block Creator flow (ADR 0117 D2, ADR 0113 D3; B557): a game on a single block that
 * turns into the next block each time it is broken, in phases (plains, underground, the deep
 * dark, the Nether, the ocean, the End; vanilla blocks only), with a chest and a mob now and then.
 *
 * It makes a `msm:world_setup` (empty sky, or the game's own world with the block high above the
 * spawn) whose start is the block itself, a one-block `minecraft:structure_template` of grass
 * placed once at the first join with the spawn on it, and a `msm:one_block` at the same place
 * whose tick function refills it by phase. Everything lowers to plain data pack files.
 */
import type {
  BundleContext,
  ContentBundle,
  Json,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  setValue,
  stringValue,
} from '../content/parameters';
import { BoxBuilder, type Pos } from '../content/structures';
import { GAME_KINDS, SKY_START_AT } from './skyblock';

/** One phase the block can go through. */
interface Phase {
  value: string;
  label: string;
  blocks: readonly [string, number][];
  mobs: readonly [string, number][];
  chest: string;
}

/** The phases, in the order the block goes through them. */
export const ONE_BLOCK_PHASES: readonly Phase[] = Object.freeze([
  {
    value: 'plains',
    label: 'Plains',
    blocks: [
      ['minecraft:grass_block', 4],
      ['minecraft:dirt', 4],
      ['minecraft:oak_log', 3],
      ['minecraft:oak_leaves', 1],
      ['minecraft:melon', 1],
    ],
    mobs: [
      ['minecraft:cow', 1],
      ['minecraft:sheep', 1],
      ['minecraft:chicken', 1],
      ['minecraft:pig', 1],
    ],
    chest: 'minecraft:chests/village/village_plains_house',
  },
  {
    value: 'underground',
    label: 'Underground',
    blocks: [
      ['minecraft:stone', 10],
      ['minecraft:coal_ore', 3],
      ['minecraft:iron_ore', 2],
      ['minecraft:copper_ore', 2],
      ['minecraft:gold_ore', 1],
      ['minecraft:redstone_ore', 1],
      ['minecraft:lapis_ore', 1],
    ],
    mobs: [
      ['minecraft:zombie', 2],
      ['minecraft:skeleton', 1],
      ['minecraft:spider', 1],
    ],
    chest: 'minecraft:chests/simple_dungeon',
  },
  {
    value: 'deep_dark',
    label: 'Deep dark',
    blocks: [
      ['minecraft:deepslate', 8],
      ['minecraft:cobbled_deepslate', 3],
      ['minecraft:sculk', 4],
      ['minecraft:deepslate_iron_ore', 2],
      ['minecraft:deepslate_diamond_ore', 1],
    ],
    mobs: [],
    chest: 'minecraft:chests/ancient_city',
  },
  {
    value: 'nether',
    label: 'Nether',
    blocks: [
      ['minecraft:netherrack', 10],
      ['minecraft:soul_sand', 2],
      ['minecraft:nether_quartz_ore', 2],
      ['minecraft:nether_gold_ore', 2],
      ['minecraft:magma_block', 1],
      ['minecraft:glowstone', 1],
    ],
    mobs: [
      ['minecraft:piglin', 2],
      ['minecraft:zombified_piglin', 1],
    ],
    chest: 'minecraft:chests/nether_bridge',
  },
  {
    value: 'ocean',
    label: 'Ocean',
    blocks: [
      ['minecraft:sand', 6],
      ['minecraft:gravel', 3],
      ['minecraft:clay', 2],
      ['minecraft:prismarine', 2],
      ['minecraft:sea_lantern', 1],
      ['minecraft:tube_coral_block', 1],
    ],
    mobs: [
      ['minecraft:turtle', 1],
      ['minecraft:drowned', 1],
    ],
    chest: 'minecraft:chests/buried_treasure',
  },
  {
    value: 'end',
    label: 'End',
    blocks: [
      ['minecraft:end_stone', 10],
      ['minecraft:obsidian', 2],
      ['minecraft:purpur_block', 2],
      ['minecraft:end_stone_bricks', 1],
    ],
    mobs: [
      ['minecraft:enderman', 2],
      ['minecraft:shulker', 1],
    ],
    chest: 'minecraft:chests/end_city_treasure',
  },
]);

/** The One block flow's questions, groups "Game", "The magic block" and "World". */
export const ONE_BLOCK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'game_name',
    label: 'What is your game called?',
    description: 'The World Type has this name on the Create New World screen.',
    group: 'Game',
    type: 'string',
    default: 'One Block',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'phases',
    label: 'Phases',
    description: 'What the magic block turns into, phase after phase, in this order.',
    group: 'The magic block',
    type: 'set',
    default: ['plains', 'underground', 'deep_dark', 'nether', 'ocean', 'end'],
    min: 1,
    choices: ONE_BLOCK_PHASES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'breaks',
    label: 'Breaks in each phase',
    group: 'The magic block',
    type: 'number',
    default: 100,
    min: 10,
    max: 1000,
    step: 10,
  },
  {
    id: 'chests',
    label: 'Chests now and then',
    description: 'One break in fifty gives a chest of loot of the phase.',
    group: 'The magic block',
    type: 'boolean',
    default: true,
  },
  {
    id: 'mobs',
    label: 'Mobs now and then',
    description: 'One break in twenty brings a mob of the phase on top of the block.',
    group: 'The magic block',
    type: 'boolean',
    default: true,
  },
  {
    id: 'loop',
    label: 'Start again after the last phase',
    group: 'The magic block',
    type: 'boolean',
    default: true,
  },
  {
    id: 'world',
    label: 'How my world starts',
    group: 'World',
    type: 'choice',
    default: 'void',
    choices: [
      { value: 'void', label: 'Empty sky' },
      { value: 'vanilla', label: 'As normal, with the block high above the spawn' },
    ],
  },
]);

/** Where the magic block is in a world of the game's own (above the land at the spawn). */
const HIGH_START: Pos = [0, 120, 0];

export function oneBlockBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(ONE_BLOCK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'game_name'));
  const id = name.id;
  const empty = stringValue(values, 'world') !== 'vanilla';
  const at: Pos = empty ? [...SKY_START_AT] : [...HIGH_START];
  const breaks = Math.max(10, Math.min(1000, Math.round(numberValue(values, 'breaks'))));
  const chests = booleanValue(values, 'chests');
  const mobs = booleanValue(values, 'mobs');
  const picked = setValue(values, 'phases');
  const phases = ONE_BLOCK_PHASES.filter((phase) => picked.includes(phase.value));
  const used = phases.length > 0 ? phases : [ONE_BLOCK_PHASES[0] as Phase];

  const phaseData: Json[] = used.map((phase) => {
    const data: JsonObject = {
      name: phase.label,
      breaks,
      blocks: phase.blocks.map(([block, weight]) => ({ block, weight })),
      mob_chance: 0,
      chest_chance: chests ? 0.02 : 0,
    };
    if (chests) data.chest_loot = phase.chest;
    if (mobs && phase.mobs.length > 0) {
      data.mobs = phase.mobs.map(([mob, weight]) => ({ mob, weight }));
      data.mob_chance = 0.05;
    }
    return data;
  });

  const start = rl(namespace, `${id}/start`);
  const block = rl(namespace, `${id}/magic_block`);
  const template = new BoxBuilder([1, 1, 1]).set([0, 0, 0], 'minecraft:grass_block[snowy=false]');
  const phaseWords = used.map((phase) => phase.label.toLowerCase()).join(', ');
  return {
    elements: [
      packElement(namespace, `${projectName}: ${name.display}, a one block game`),
      element(
        rl(namespace, id),
        GAME_KINDS.worldSetup,
        {
          world: { type: empty ? 'void' : 'vanilla', nether: 'vanilla', end: 'vanilla' },
          start: { structure: start, at: [...at], spawn: [0, 1, 0] },
          spawn_radius: 0,
          game_mode: 'survival',
          difficulty: 'normal',
          game_rules: {},
          new_player: { message: `Welcome to ${name.display}! Break the block under you.` },
        },
        `How the world starts: ${empty ? `a World Type called ${name.display} of empty sky (void), listed on the Create New World screen` : "the game's own world (no World Type of its own)"}. When the first player joins, the start ${start} is placed at ${at.join(' ')}, the world spawn set on top of it and the player sent there; each new player gets a welcome, once. Everything lowers to plain data pack files.`,
      ),
      element(
        start,
        KINDS.structureTemplate,
        template.build(),
        'The start: one grass block, where the magic block is. The magic block refills itself from here on.',
      ),
      element(
        block,
        GAME_KINDS.oneBlock,
        { at: [...at], phases: phaseData, loop: booleanValue(values, 'loop'), announce: true },
        `The magic block at ${at.join(' ')}: each time it is broken it turns into a block of its phase, picked by weight (${phaseWords}), ${breaks} breaks a phase${chests ? ', now and then a chest of loot of the phase' : ''}${mobs ? ', now and then a mob on top' : ''}. The name of each phase shows in chat when it starts${booleanValue(values, 'loop') ? ', and after the last phase the first comes again' : ''}. Its tick function runs in a vanilla data pack.`,
      ),
    ],
    assets: [],
  };
}
