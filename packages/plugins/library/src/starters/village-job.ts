/**
 * The Village job Creator flow (ADR 0101 D2, ADR 0098 D2): a new job for vanilla villagers. One
 * `msm:villager_profession` and its job site, a new `msm:block` (a workbench with its model,
 * pictures, loot and recipe). A villager without a job takes the job at the block. Lowering
 * creates the job's five trade sets `<ns>:<id>/level_1` to `level_5`, each drawing two trades
 * from the villager trade tag of the same name; the flow fills those tags: its own two trades at
 * the first level (the villager buys an item, and sells one) and, if chosen, the trades of a
 * vanilla job at every level (the tag names `#minecraft:<job>/level_<n>`). The job's picture,
 * a working apron drawn over the villager and the zombie villager, is MSM's own and sits where
 * the game reads it (`entity/villager/profession/<id>` and `entity/zombie_villager/...`).
 * Ids derive from `job_name`. New jobs need the Fabric mod jar export; the vanilla data pack
 * keeps the trades and tags.
 *
 * Limits (ADR 0098 D6): no new villager types (biome looks); zombie villagers keep the job's
 * picture only.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import {
  jobSiteBottomPng,
  jobSiteSidePng,
  jobSiteTopPng,
  professionApronPng,
} from '../assets/vanilla-parity/batch2';
import {
  COLOURS,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
} from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** Kind ids of the entities plugin, named by string (the library imports no plugin). */
const PROFESSION_KIND = 'msm:villager_profession';

/** The number of trading levels of a job. */
export const JOB_LEVELS = 5;

/** The vanilla jobs whose trades a new job can share, with their English names. */
export const VANILLA_JOBS: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'toolsmith', label: 'Toolsmith' },
  { value: 'armorer', label: 'Armourer' },
  { value: 'weaponsmith', label: 'Weaponsmith' },
  { value: 'butcher', label: 'Butcher' },
  { value: 'cartographer', label: 'Cartographer' },
  { value: 'cleric', label: 'Cleric' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'fisherman', label: 'Fisherman' },
  { value: 'fletcher', label: 'Fletcher' },
  { value: 'leatherworker', label: 'Leatherworker' },
  { value: 'librarian', label: 'Librarian' },
  { value: 'mason', label: 'Mason' },
  { value: 'shepherd', label: 'Shepherd' },
]);

/** An item id, with or without its namespace. */
const ITEM_PATTERN = '^([a-z0-9_.-]+:)?[a-z0-9_.-]+(/[a-z0-9_.-]+)*$';

const EMERALD = 'minecraft:emerald';
const BENCH_WOOD: Rgb = [150, 108, 64];

/** The Village job's questions, groups "Job" and "Trades". */
export const VILLAGE_JOB_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'job_name',
    label: 'What is the job called?',
    description: 'Ids derive from it: Tinker gives the job tinker and its block tinker_workbench.',
    group: 'Job',
    type: 'string',
    default: 'Tinker',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Apron colour',
    description: 'The colour of the apron villagers wear in this job.',
    group: 'Job',
    type: 'colour',
    default: '#8c5a2e',
  },
  {
    id: 'metal_colour',
    label: 'Workbench colour',
    description: 'The colour of the metal top of the job block.',
    group: 'Job',
    type: 'colour',
    default: '#9aa0aa',
  },
  {
    id: 'recipe',
    label: 'Crafting recipe for the workbench',
    description: 'Two iron ingots over two planks of any wood make the workbench.',
    group: 'Job',
    type: 'boolean',
    default: true,
  },
  {
    id: 'buys',
    label: 'What does the villager buy?',
    description: 'An item id the villager pays an emerald for, at the first level.',
    group: 'Trades',
    type: 'string',
    default: 'minecraft:copper_ingot',
    pattern: ITEM_PATTERN,
    maxLength: 96,
  },
  {
    id: 'buys_count',
    label: 'How many for one emerald?',
    group: 'Trades',
    type: 'number',
    default: 8,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'sells',
    label: 'What does the villager sell?',
    description: 'An item id the villager sells, at the first level.',
    group: 'Trades',
    type: 'string',
    default: 'minecraft:lantern',
    pattern: ITEM_PATTERN,
    maxLength: 96,
  },
  {
    id: 'sells_emeralds',
    label: 'For how many emeralds?',
    group: 'Trades',
    type: 'number',
    default: 3,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'trades_like',
    label: 'Also trades like',
    description:
      'A vanilla job whose trades this job shares at every level, so its villagers have something to offer as they level up.',
    group: 'Trades',
    type: 'choice',
    default: 'toolsmith',
    choices: [
      ...VANILLA_JOBS.map(({ value, label }) => ({ value, label: `A ${label.toLowerCase()}` })),
      { value: 'none', label: 'Nobody: only its own two trades' },
    ],
  },
]);

/** `minecraft:` added to an item id without a namespace. */
function itemId(value: string): string {
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** The last path segment of an item id, for trade ids. */
function itemWord(id: string): string {
  return id.slice(id.indexOf(':') + 1).replaceAll('/', '_');
}

/** A whole number in `[min, max]` from a number answer. */
function wholeNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

/** The ids a job of `id` in `namespace` writes. */
export function villageJobIds(namespace: string, id: string) {
  return {
    profession: rl(namespace, id),
    block: rl(namespace, `${id}_workbench`),
    model: rl(namespace, `block/${id}_workbench`),
    villagerPicture: rl(namespace, `entity/villager/profession/${id}`),
    zombiePicture: rl(namespace, `entity/zombie_villager/profession/${id}`),
    levelTag: (level: number): ResourceLocation => rl(namespace, `${id}/level_${level}`),
  };
}

export function villageJobBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(VILLAGE_JOB_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'job_name'));
  const apron = rgbFromHex(stringValue(values, 'colour'), COLOURS.wood);
  const metal = rgbFromHex(stringValue(values, 'metal_colour'), COLOURS.slate);
  const buys = itemId(stringValue(values, 'buys'));
  const buysCount = wholeNumber(numberValue(values, 'buys_count'), 1, 64);
  const sells = itemId(stringValue(values, 'sells'));
  const sellsEmeralds = wholeNumber(numberValue(values, 'sells_emeralds'), 1, 64);
  const like = VANILLA_JOBS.find((job) => job.value === stringValue(values, 'trades_like'));
  const ids = villageJobIds(namespace, name.id);
  const bench = `${name.display} Workbench`;
  const texture = (face: string): ResourceLocation =>
    rl(namespace, `block/${name.id}_workbench_${face}`);

  const buyTrade = rl(namespace, `${name.id}/1/${itemWord(buys)}_emerald`);
  const sellTrade = rl(namespace, `${name.id}/1/emerald_${itemWord(sells)}`);
  const job = name.lower;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: the ${job}, a new village job`, PACK_NOTES),
    modElement(namespace, projectName, `Adds the ${job}, a new job for villagers.`),
    element(
      ids.profession,
      PROFESSION_KIND,
      {
        format: 1,
        display_name: name.display,
        job_site: ids.block,
        ...(like === undefined
          ? {}
          : { work_sound: `minecraft:entity.villager.work_${like.value}` }),
        textures: { villager: ids.villagerPicture, zombie_villager: ids.zombiePicture },
      },
      `A new job for vanilla villagers: a villager without a job that finds a ${bench.toLowerCase()} (job_site) takes the job, wears its apron (the pictures in textures, at the places the game reads them) and trades. Its five levels are the trade sets ${ids.levelTag(1)} to ${ids.levelTag(JOB_LEVELS)}, created for you; each draws two trades from the villager trade tag of the same name, so add trades to those tags.${like === undefined ? '' : ` work_sound is the ${like.label.toLowerCase()}'s, played while the villager works at its block.`} Breaking the workbench makes the villager lose the job, as with any workstation. Jobs need the Fabric mod jar export.`,
    ),
    element(
      ids.block,
      KINDS.block,
      {
        format: 1,
        display_name: bench,
        model: ids.model,
        sound_type: 'wood',
        loot: 'self',
        item: { creative_tab: 'minecraft:functional_blocks' },
        components: { 'msm:breakable': { hardness: 2.5, resistance: 2.5, tool: 'axe' } },
      },
      `The ${job}'s job site: a workbench of boards under a metal top. Any block of yours can be a job site, but only one job each, and never a block that already has one (a vanilla workstation, a bed or a bell).`,
    ),
    element(
      ids.model,
      KINDS.model,
      {
        parent: 'minecraft:block/cube_bottom_top',
        textures: { top: texture('top'), side: texture('side'), bottom: texture('bottom') },
      },
      'A full cube with its own top, sides and bottom.',
    ),
    element(
      buyTrade,
      KINDS.villagerTrade,
      {
        wants: { id: buys, count: buysCount },
        gives: { id: EMERALD, count: 1 },
        max_uses: 16,
        xp: 2,
        reputation_discount: 0.05,
      },
      `A first-level trade: the villager buys ${buysCount} ${buys} for an emerald. wants is what the player hands over, gives what the player gets.`,
    ),
    element(
      sellTrade,
      KINDS.villagerTrade,
      {
        wants: { id: EMERALD, count: sellsEmeralds },
        gives: { id: sells, count: 1 },
        max_uses: 12,
        xp: 5,
        reputation_discount: 0.05,
      },
      `A first-level trade: the villager sells one ${sells} for ${sellsEmeralds} emerald${sellsEmeralds === 1 ? '' : 's'}. Demand and the player's reputation change the price, by reputation_discount per point.`,
    ),
  ];
  for (let level = 1; level <= JOB_LEVELS; level += 1) {
    const tag = ids.levelTag(level);
    const entries: string[] = [
      ...(level === 1 ? [buyTrade, sellTrade] : []),
      ...(like === undefined ? [] : [`#minecraft:${like.value}/level_${level}`]),
    ];
    elements.push(
      element(
        tag,
        KINDS.tagVillagerTrade,
        { values: entries },
        `The trades ${job}s draw from at level ${level}: the trade set of the same name, made for the job, picks two of them.${level === 1 ? " The two trades above are the job's own." : ''}${like === undefined ? (level === 1 ? '' : ' Empty: add trades here to give the job more to offer as it levels up.') : ` #minecraft:${like.value}/level_${level} adds every trade of a ${like.label.toLowerCase()} at this level.`}`,
      ),
    );
  }
  if (booleanValue(values, 'recipe')) {
    elements.push(
      element(
        rl(namespace, `${name.id}_workbench_from_iron_ingot`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          key: { I: 'minecraft:iron_ingot', P: '#minecraft:planks' },
          pattern: ['II', 'PP'],
          result: { id: ids.block },
        },
        `Two iron ingots over two planks of any wood make the ${bench.toLowerCase()}.`,
      ),
    );
  }
  const picture = professionApronPng(apron);
  return {
    elements,
    assets: [
      {
        namespace,
        path: `textures/block/${name.id}_workbench_top.png`,
        bytes: jobSiteTopPng(metal),
      },
      {
        namespace,
        path: `textures/block/${name.id}_workbench_side.png`,
        bytes: jobSiteSidePng(BENCH_WOOD, metal),
      },
      {
        namespace,
        path: `textures/block/${name.id}_workbench_bottom.png`,
        bytes: jobSiteBottomPng(BENCH_WOOD),
      },
      { namespace, path: `textures/entity/villager/profession/${name.id}.png`, bytes: picture },
      {
        namespace,
        path: `textures/entity/zombie_villager/profession/${name.id}.png`,
        bytes: picture,
      },
    ],
  };
}
