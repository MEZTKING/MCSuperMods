/**
 * Materials and tiers (ADR 0124 D5): the words of the tiers the gear flows take (wood to
 * netherite), the gems and metals flows are made of or crafted from, and their slang and
 * misspellings beyond the search's own typo limits. A group's idea is the word a flow's choice
 * label carries ("Netherite", "Iron pickaxe"), so the search reads "nethrite pick" as the
 * netherite tier. Vanilla ids name the material item; the host drops an id the open target
 * lacks, and `test/search.test.ts` checks every one against both targets.
 */

import type { SearchWordGroup } from '@msm/plugin-api';

/** Every material word group of the library. */
export const MATERIALS: SearchWordGroup[] = [
  {
    idea: 'wood',
    same: ['wooden', 'timber'],
    near: ['planks', 'log'],
    vanillaIds: ['minecraft:oak_planks'],
  },
  {
    idea: 'stone',
    same: ['rock', 'cobblestone'],
    slang: ['cobble'],
    vanillaIds: ['minecraft:cobblestone'],
  },
  {
    idea: 'copper',
    same: [],
    misspellings: ['coper', 'coppor'],
    vanillaIds: ['minecraft:copper_ingot'],
  },
  { idea: 'iron', same: [], misspellings: ['irn'], vanillaIds: ['minecraft:iron_ingot'] },
  {
    idea: 'gold',
    same: ['golden'],
    slang: ['gilded'],
    misspellings: ['goldan'],
    vanillaIds: ['minecraft:gold_ingot'],
  },
  {
    idea: 'diamond',
    same: ['diamonds'],
    slang: ['dia', 'dias', 'diamons'],
    misspellings: ['dimond', 'daimond', 'diamund'],
    vanillaIds: ['minecraft:diamond'],
  },
  {
    idea: 'netherite',
    same: [],
    slang: ['nethe', 'neth'],
    misspellings: ['nethrite', 'netherrite', 'netherit', 'neatherite', 'netharite'],
    vanillaIds: ['minecraft:netherite_ingot', 'minecraft:netherite_scrap'],
  },
  { idea: 'leather', same: ['hide'], vanillaIds: ['minecraft:leather'] },
  { idea: 'chainmail', same: ['chain mail'], vanillaIds: ['minecraft:chainmail_chestplate'] },
  {
    idea: 'emerald',
    same: ['emeralds'],
    slang: ['ems'],
    misspellings: ['emrald', 'emerold'],
    vanillaIds: ['minecraft:emerald'],
  },
  {
    idea: 'amethyst',
    same: ['amethyst shard'],
    misspellings: ['amythest', 'amethist', 'amathyst'],
    vanillaIds: ['minecraft:amethyst_shard'],
  },
  {
    idea: 'quartz',
    same: ['nether quartz'],
    misspellings: ['quarts', 'qaurtz'],
    vanillaIds: ['minecraft:quartz'],
  },
  { idea: 'lapis', same: ['lapis lazuli'], vanillaIds: ['minecraft:lapis_lazuli'] },
  {
    idea: 'obsidian',
    same: [],
    misspellings: ['obsidion', 'obsedian'],
    vanillaIds: ['minecraft:obsidian'],
  },
  { idea: 'redstone', same: ['redstone dust'], slang: ['rs'], vanillaIds: ['minecraft:redstone'] },
  { idea: 'glowstone', same: ['glowstone dust'], vanillaIds: ['minecraft:glowstone_dust'] },
  { idea: 'echo shard', same: ['echo'], vanillaIds: ['minecraft:echo_shard'] },
  { idea: 'prismarine', same: ['prismarine shard'], vanillaIds: ['minecraft:prismarine_shard'] },
  { idea: 'deepslate', same: [], vanillaIds: ['minecraft:deepslate'] },
  { idea: 'sandstone', same: [], vanillaIds: ['minecraft:sandstone'] },
  { idea: 'blackstone', same: [], vanillaIds: ['minecraft:blackstone'] },
  { idea: 'tuff', same: [], vanillaIds: ['minecraft:tuff'] },
  { idea: 'andesite', same: [], vanillaIds: ['minecraft:andesite'] },
  { idea: 'flint', same: [], vanillaIds: ['minecraft:flint'] },
  {
    idea: 'blaze',
    same: ['blaze rod', 'blaze powder'],
    vanillaIds: ['minecraft:blaze_rod', 'minecraft:blaze_powder'],
  },
  { idea: 'slime', same: ['slime ball', 'slimeball'], vanillaIds: ['minecraft:slime_ball'] },
  { idea: 'paper', same: [], vanillaIds: ['minecraft:paper'] },
  { idea: 'phantom membrane', same: ['membrane'], vanillaIds: ['minecraft:phantom_membrane'] },
  { idea: 'breeze rod', same: [], vanillaIds: ['minecraft:breeze_rod'] },
  { idea: 'ender pearl', same: ['enderpearl'], vanillaIds: ['minecraft:ender_pearl'] },
  { idea: 'clay', same: ['clay ball'], vanillaIds: ['minecraft:clay_ball'] },
  { idea: 'brick', same: ['bricks'], near: ['terracotta'], vanillaIds: ['minecraft:brick'] },
  {
    idea: 'honey',
    same: ['honeycomb', 'honey bottle'],
    vanillaIds: ['minecraft:honeycomb', 'minecraft:honey_bottle'],
  },
  {
    idea: 'gem',
    same: ['gems', 'gemstone', 'jewel', 'crystal'],
    near: ['ruby', 'sapphire', 'topaz', 'jade', 'opal', 'garnet', 'peridot', 'onyx'],
  },
  { idea: 'ruby', same: ['rubies'], misspellings: ['rubby', 'rubi'] },
  { idea: 'sapphire', same: ['sapphires'], misspellings: ['saphire', 'sapphyre'] },
  {
    idea: 'metal',
    same: ['alloy', 'ingot', 'ingots'],
    near: [
      'tin',
      'bronze',
      'steel',
      'silver',
      'brass',
      'aluminium',
      'titanium',
      'cobalt',
      'mithril',
    ],
  },
  { idea: 'tier', same: ['grade'], near: ['material', 'strength'] },
  {
    idea: 'overpowered',
    same: [],
    slang: ['op', 'godly', 'ultimate', 'legendary', 'mythic'],
    near: ['strong', 'powerful', 'best'],
  },
];
