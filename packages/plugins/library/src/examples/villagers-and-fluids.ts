/**
 * The examples of vanilla parity batch 2 (ADR 0101 D3; B481): the per-kind examples of
 * `msm:villager_profession` (Village blacksmith job: a job, its forge block and trades at every
 * level) and `msm:fluid` (Oil well: a slow dark liquid, its bucket and lakes in deserts), and the
 * Roadside merchant, a trader mob (`msm:trader`) with two levels of its own trade sets and a
 * sound on every trade. Every id differs from every other example's, so the mirror projects hold
 * them in one project. Pictures are MSM's own (`assets/vanilla-parity/batch2`); the merchant's
 * skin is the preset placeholder. Jobs, fluids and mobs need the Fabric mod jar export; the
 * vanilla packs keep the trades, tags, pictures and language keys.
 */
import type { ContentBundleElement, ExampleProject, ResourceLocation } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import {
  bucketItemPng,
  jobSiteBottomPng,
  jobSiteSidePng,
  jobSiteTopPng,
  liquidPng,
  professionApronPng,
} from '../assets/vanilla-parity/batch2';
import { COLOURS, element, KINDS, rl } from '../content/bundle';
import { hasFabric } from '../content/supports';
import { lakeFeatureData } from '../starters/fluid';
import { defineExample } from './define';
import { presetMob } from './entities';

const PROFESSION_KIND = 'msm:villager_profession';
const FLUID_KIND = 'msm:fluid';

const JAR_ONLY =
  'It needs the Fabric mod jar export; the vanilla packs keep only its trades, tags, pictures and language keys.';

// Village blacksmith job -----------------------------------------------------------------------

const SOOT: Rgb = [64, 62, 66];
const FORGE_WOOD: Rgb = [110, 76, 48];
const LEATHER: Rgb = [92, 58, 36];

/** A villager trade element: `count` of `wants` for `gives`. */
const trade = (
  id: ResourceLocation,
  wants: { id: string; count: number },
  gives: { id: string; count: number },
  fields: { maxUses: number; xp: number },
  notes: string,
): ContentBundleElement =>
  element(
    id,
    KINDS.villagerTrade,
    { wants, gives, max_uses: fields.maxUses, xp: fields.xp, reputation_discount: 0.05 },
    notes,
  );

const villageBlacksmithJob = defineExample({
  id: 'example_msm_villager_profession',
  title: 'Village blacksmith job',
  description:
    "A blacksmith job for villagers: a villager takes it at a forge block, wears a leather apron and trades coal, iron and a toolsmith's wares as it levels up.",
  kind: PROFESSION_KIND,
  category: 'Villagers',
  tags: ['villager', 'profession', 'job site', 'trade', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const job = rl(namespace, 'blacksmith');
    const forge = rl(namespace, 'blacksmith_forge');
    const model = rl(namespace, 'block/blacksmith_forge');
    const face = (name: string) => rl(namespace, `block/blacksmith_forge_${name}`);
    const buysCoal = rl(namespace, 'blacksmith/1/coal_emerald');
    const sellsIron = rl(namespace, 'blacksmith/1/emerald_iron_ingot');
    const sellsChain = rl(namespace, 'blacksmith/3/emerald_iron_chain');
    const level = (n: number) => rl(namespace, `blacksmith/level_${n}`);
    const own: Record<number, ResourceLocation[]> = { 1: [buysCoal, sellsIron], 3: [sellsChain] };
    const elements: ContentBundleElement[] = [
      element(
        job,
        PROFESSION_KIND,
        {
          format: 1,
          display_name: 'Blacksmith',
          job_site: forge,
          work_sound: 'minecraft:block.anvil.use',
          requested_items: ['minecraft:coal'],
          textures: {
            villager: rl(namespace, 'entity/villager/profession/blacksmith'),
            zombie_villager: rl(namespace, 'entity/zombie_villager/profession/blacksmith'),
          },
        },
        `A villager profession. A villager without a job that finds the block in "job_site" takes the job; the job site must be a block of the project that no other job (vanilla's included) uses. "work_sound" plays while it works there, and "requested_items" are items it picks up and shares with other villagers. "trade_sets" is left out, so the five levels are the trade sets ${level(1)} to ${level(5)}, made when the project is exported, each drawing two trades from the villager trade tag of the same name. The pictures in "textures" are drawn over the villager and the zombie villager; they are already where the game reads them (entity/villager/profession/ and entity/zombie_villager/profession/). ${JAR_ONLY}`,
      ),
      element(
        forge,
        KINDS.block,
        {
          format: 1,
          display_name: 'Blacksmith Forge',
          model,
          sound_type: 'stone',
          loot: 'self',
          item: { creative_tab: 'minecraft:functional_blocks' },
          components: {
            'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
            'msm:light_emitter': { level: 7 },
          },
        },
        'The job site: a forge with a sooty iron top that glows a little. Breaking it makes the blacksmith lose the job, as with any workstation.',
      ),
      element(
        model,
        KINDS.model,
        {
          parent: 'minecraft:block/cube_bottom_top',
          textures: { top: face('top'), side: face('side'), bottom: face('bottom') },
        },
        'A full cube with its own top, sides and bottom.',
      ),
      trade(
        buysCoal,
        { id: 'minecraft:coal', count: 15 },
        { id: 'minecraft:emerald', count: 1 },
        { maxUses: 16, xp: 2 },
        'A novice trade: the blacksmith buys fifteen coal for an emerald.',
      ),
      trade(
        sellsIron,
        { id: 'minecraft:emerald', count: 2 },
        { id: 'minecraft:iron_ingot', count: 3 },
        { maxUses: 12, xp: 2 },
        'A novice trade: the blacksmith sells three iron ingots for two emeralds.',
      ),
      trade(
        sellsChain,
        { id: 'minecraft:emerald', count: 1 },
        { id: 'minecraft:iron_chain', count: 4 },
        { maxUses: 12, xp: 10 },
        'A journeyman trade: four chains for an emerald.',
      ),
    ];
    for (let n = 1; n <= 5; n += 1) {
      elements.push(
        element(
          level(n),
          KINDS.tagVillagerTrade,
          { values: [...(own[n] ?? []), `#minecraft:toolsmith/level_${n}`] },
          `The trades blacksmiths draw from at level ${n}: ${own[n] === undefined ? '' : "the job's own, and "}every toolsmith trade of the level (#minecraft:toolsmith/level_${n}). The job's trade set of the same name picks two of them.`,
        ),
      );
    }
    const apron = professionApronPng(LEATHER);
    return {
      elements,
      assets: [
        { namespace, path: 'textures/block/blacksmith_forge_top.png', bytes: jobSiteTopPng(SOOT) },
        {
          namespace,
          path: 'textures/block/blacksmith_forge_side.png',
          bytes: jobSiteSidePng(FORGE_WOOD, SOOT),
        },
        {
          namespace,
          path: 'textures/block/blacksmith_forge_bottom.png',
          bytes: jobSiteBottomPng(FORGE_WOOD),
        },
        { namespace, path: 'textures/entity/villager/profession/blacksmith.png', bytes: apron },
        {
          namespace,
          path: 'textures/entity/zombie_villager/profession/blacksmith.png',
          bytes: apron,
        },
      ],
    };
  },
});

// Oil well -------------------------------------------------------------------------------------

const OIL: Rgb = [34, 30, 38];

const oilWell = defineExample({
  id: 'example_msm_fluid',
  title: 'Oil well',
  description:
    'Oil: a thick dark liquid that flows slowly and never refills, slows down whoever wades in, comes in a bucket and lies in lakes in deserts.',
  kind: FLUID_KIND,
  category: 'Fluids',
  tags: ['fluid', 'bucket', 'lake', 'worldgen', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const oil = rl(namespace, 'oil');
    const sticky = rl(namespace, 'oil_sticky');
    const lake = rl(namespace, 'oil_lake');
    const placed = rl(namespace, 'oil_lake_placed');
    return {
      elements: [
        element(
          oil,
          FLUID_KIND,
          {
            format: 1,
            display_name: 'Oil',
            bucket_display_name: 'Bucket of Oil',
            behaves_like: 'water',
            flow: { tick_delay: 20, slope_distance: 2, drop_off: 2, infinite: false },
            explosion_resistance: 100,
            on_entity_inside: sticky,
            events: {
              [sticky]: {
                actions: [
                  {
                    type: 'apply_effect',
                    effect: 'minecraft:slowness',
                    seconds: 2,
                    amplifier: 1,
                    target: 'other',
                  },
                ],
              },
            },
            textures: {
              still: rl(namespace, 'block/oil_still'),
              flowing: rl(namespace, 'block/oil_flow'),
              bucket: rl(namespace, 'item/oil_bucket'),
            },
          },
          `A fluid. One element makes the fluid, its liquid block (the same id, ${oil}) and its bucket (${oil}_bucket). "behaves_like" water joins the water tag, so you swim in it and drown in it; "flow" makes it slow (one block every 20 ticks), short (it finds slopes two blocks away and loses two levels a block) and finite (no new sources). "on_entity_inside" names an event in the fluid's own "events": whoever is inside gets Slowness II, at most every ten ticks each. "textures" are the still and flowing pictures and the bucket's; "tint" is left out because the pictures are already dark. ${JAR_ONLY}`,
        ),
        element(
          lake,
          KINDS.feature,
          lakeFeatureData(oil, 'minecraft:sandstone'),
          'A lake of oil: the lake feature hollows out a rounded pool, fills it with the liquid block (fluid) and lines the edges with sandstone (barrier) where the oil would leak out; the predicates keep it away from blocks features never replace.',
        ),
        element(
          placed,
          KINDS.placedFeature,
          {
            feature: lake,
            placement: [
              { type: 'minecraft:rarity_filter', chance: 80 },
              { type: 'minecraft:in_square' },
              { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
              { type: 'minecraft:biome' },
            ],
          },
          'One chunk in 80 tries for a lake, at a random spot on the surface; the biome filter keeps it to the biomes that list it.',
        ),
        element(
          rl(namespace, 'oil_lakes'),
          KINDS.biomeAddition,
          {
            format: 1,
            biomes: ['minecraft:desert'],
            features: [{ feature: placed, step: 'lakes' }],
          },
          'A world addition: it adds the oil lakes to deserts at the lakes step, without replacing any vanilla file. Only chunks generated after the mod is installed get them.',
        ),
      ],
      assets: [
        { namespace, path: 'textures/block/oil_still.png', bytes: liquidPng(OIL, false) },
        { namespace, path: 'textures/block/oil_flow.png', bytes: liquidPng(OIL, true) },
        { namespace, path: 'textures/item/oil_bucket.png', bytes: bucketItemPng(OIL) },
      ],
    };
  },
});

/** The per-kind examples of `msm:villager_profession` and `msm:fluid`. */
export const villagerFluidKindExamples: readonly ExampleProject[] = [villageBlacksmithJob, oilWell];

// Roadside merchant ---------------------------------------------------------------------------

/** The Roadside merchant: a trader mob with two levels of its own wares. */
export const villagerBehaviourExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_roadside_merchant',
    supports: hasFabric,
    title: 'Roadside merchant',
    description:
      'A merchant by the road who sells bread and apples, then saddles and leads once you have traded with it, and rings a bell with every sale.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['msm:trader', 'trade', 'trade set', 'mod'],
    build: ({ namespace }) => {
      const id = (path: string) => rl(namespace, path);
      const sold = id('roadside_merchant_sold');
      const sets = [id('roadside_merchant/level_1'), id('roadside_merchant/level_2')];
      const wares: [string, string, number, number, number][] = [
        ['bread', 'minecraft:bread', 3, 1, 1],
        ['apples', 'minecraft:apple', 4, 1, 1],
        ['saddle', 'minecraft:saddle', 1, 6, 2],
        ['lead', 'minecraft:lead', 2, 3, 2],
      ];
      const mob = presetMob({
        namespace,
        name: 'roadside_merchant',
        preset: 'biped',
        colour: COLOURS.amber,
        entity: {
          display_name: 'Roadside Merchant',
          category: 'creature',
          events: {
            [sold]: {
              actions: [
                { type: 'play_sound', sound: 'minecraft:block.bell.use', volume: 0.6, pitch: 1.4 },
              ],
            },
          },
        },
        components: {
          'msm:health': { max: 20 },
          'msm:movement': { speed: 0.4 },
          'msm:trader': {
            trade_sets: [
              { trade_set: sets[0] as string, xp_to_next: 10 },
              { trade_set: sets[1] as string },
            ],
            levels: true,
            restock: 'twice_a_day',
            trade_sound: 'minecraft:entity.wandering_trader.yes',
            on_trade: sold,
          },
          'msm:ai_goals': {
            goals: [
              { type: 'panic', speed: 1.3 },
              { type: 'wander', speed: 0.5 },
              { type: 'look_at_player', distance: 8 },
              { type: 'look_around' },
            ],
          },
        },
        notes: {
          entity: `A trader mob. msm:trader opens the villager trading screen when a player uses it with an empty hand. "trade_sets" lists its levels: level 1 offers ${sets[0]}, and 10 trading experience ("xp_to_next") unlocks level 2, ${sets[1]}. "levels" true makes trading earn experience; "restock" twice_a_day refills the trades at the mob, with no workstation. "trade_sound" plays on each trade and "on_trade" fires ${sold} (self is the merchant, other the player), which rings a bell. It refuses to trade while a baby, fleeing or ridden, and keeps its offers when the world is saved. It has a spawn egg and never spawns on its own. ${JAR_ONLY}`,
          model:
            'The two-legged preset model: head, body, arms and legs over a 64x64 texture. Import your own Blockbench model to replace it.',
          animations: 'The two-legged preset animations: idle, walk, sit, attack and shoot.',
        },
      });
      const trades = wares.map(([word, item, count, emeralds, level]) =>
        element(
          id(`roadside_merchant/${word}`),
          KINDS.villagerTrade,
          {
            wants: { id: 'minecraft:emerald', count: emeralds },
            gives: { id: item, count },
            max_uses: 8,
            xp: level === 1 ? 3 : 5,
          },
          `${count} ${item} for ${emeralds} emerald${emeralds === 1 ? '' : 's'}, offered at level ${level}.`,
        ),
      );
      const setElements = [1, 2].map((level) =>
        element(
          sets[level - 1] as ResourceLocation,
          KINDS.tradeSet,
          {
            trades: wares
              .filter((ware) => ware[4] === level)
              .map(([word]) => id(`roadside_merchant/${word}`)),
            amount: 2,
          },
          `The merchant's level ${level} wares: a trade set listing its trades by id, offering both (amount 2). A trade set can also draw from a villager trade tag (#namespace:path).`,
        ),
      );
      return {
        elements: [...mob.elements, ...trades, ...setElements],
        assets: mob.assets,
      };
    },
  }),
];
