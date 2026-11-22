/**
 * The Wandering merchant Creator flow (ADR 0101 D2, ADR 0098 D1): a mob that trades with you
 * through vanilla's trading screen (`msm:trader`). Its own wares are up to three
 * `minecraft:villager_trade` elements (an item sold for emeralds) gathered in one
 * `minecraft:trade_set` (`<ns>:<id>/wares`) that offers all of them at the first level; if
 * chosen, the two levels after it are vanilla's wandering trader sets
 * (`minecraft:wandering_trader/common` and `/uncommon`), unlocked as players trade. Base `mob`
 * (no `base`), category `creature`, renderer `auto` on a preset model, a spawn egg and, if
 * chosen, rare spawns. Ids derive from `merchant_name`. New mobs need the Fabric mod jar export;
 * the vanilla data pack keeps the trades and the trade set.
 *
 * Since ADR 0107 and ADR 0109 (B539), if chosen: it remembers how each player treats it
 * (`reputation`: trades and a gift it likes make that player's prices lower, hitting it makes
 * them higher, and it forgets a little each day), its prices rise with heavy buying as a
 * villager's do (`demand`, on unless turned off), it restocks at a block near it instead of where
 * it stands (`work_site`), and it barters for gold as a piglin does (the `barter` goal with
 * vanilla's piglin bartering loot).
 *
 * Limits (ADR 0107 limit N10): its memory of a player is its own and is never shared with other
 * mobs, as vanilla's gossip is.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl } from '../content/bundle';
import {
  behaviourNumber,
  LAND_SPAWNS,
  mobFlowBundle,
  mobNameParameter,
  presetParameter,
  presetValue,
  skinParameters,
  spawnChoice,
  spawnField,
  spawnParameter,
} from '../content/mob-flows';
import type { MobPresetName } from '../content/mob-presets';
import {
  booleanValue,
  imageValue,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

const PRESETS: readonly MobPresetName[] = ['biped', 'quadruped', 'bird', 'cube_creature'];

/** How many wares the flow asks for. */
export const MERCHANT_WARE_SLOTS = 3;

/** An item id, with or without its namespace. */
const ITEM_PATTERN = '^([a-z0-9_.-]+:)?[a-z0-9_.-]+(/[a-z0-9_.-]+)*$';
/** The same, or empty for "nothing". */
const OPTIONAL_ITEM_PATTERN = '^(([a-z0-9_.-]+:)?[a-z0-9_.-]+(/[a-z0-9_.-]+)*)?$';

const EMERALD = 'minecraft:emerald';

/** The default wares: what, how many and for how many emeralds. */
const DEFAULT_WARES: readonly { item: string; count: number; emeralds: number }[] = [
  { item: 'minecraft:glow_berries', count: 6, emeralds: 1 },
  { item: 'minecraft:name_tag', count: 1, emeralds: 5 },
  { item: '', count: 1, emeralds: 1 },
];

/** The questions of one ware slot, group "Trades". */
function wareParameters(slot: number): StarterParameter[] {
  const ware = DEFAULT_WARES[slot - 1] ?? { item: '', count: 1, emeralds: 1 };
  const first = slot === 1;
  return [
    {
      id: `ware_${slot}`,
      label: first ? 'What does it sell?' : `Also sells (${slot})`,
      description: first
        ? 'An item id, such as minecraft:glow_berries or one of your own items.'
        : 'Another item id, or leave it empty to sell nothing more.',
      group: 'Trades',
      type: 'string',
      default: ware.item,
      pattern: first ? ITEM_PATTERN : OPTIONAL_ITEM_PATTERN,
      maxLength: 96,
    },
    {
      id: `ware_${slot}_count`,
      label: 'How many at a time?',
      group: 'Trades',
      type: 'number',
      default: ware.count,
      min: 1,
      max: 64,
      step: 1,
    },
    {
      id: `ware_${slot}_emeralds`,
      label: 'For how many emeralds?',
      group: 'Trades',
      type: 'number',
      default: ware.emeralds,
      min: 1,
      max: 64,
      step: 1,
    },
  ];
}

/** The Wandering merchant's questions, steps "Mob", "Trades", "Behaviour" and "Spawning". */
export const WANDERING_MERCHANT_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  mobNameParameter('merchant_name', 'What is it called?', 'Travelling Merchant'),
  { ...presetParameter(PRESETS), label: 'What does it look like?' },
  ...skinParameters(COLOURS.violet),
  ...Array.from({ length: MERCHANT_WARE_SLOTS }, (_, index) => wareParameters(index + 1)).flat(),
  {
    id: 'uses',
    label: 'Sales before it runs out',
    description: 'How many times each trade works before the merchant has to restock.',
    group: 'Trades',
    type: 'number',
    default: 8,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'vanilla_wares',
    label: "Also sells the wandering trader's wares",
    description:
      'Two more levels of trades, unlocked as you trade with it: the common and then the rare wares of the wandering trader.',
    group: 'Trades',
    type: 'boolean',
    default: true,
  },
  {
    id: 'restock',
    label: 'Restocks',
    group: 'Trades',
    type: 'choice',
    default: 'twice_a_day',
    choices: [
      { value: 'twice_a_day', label: 'Twice a day' },
      { value: 'work_site', label: 'Twice a day, at a block near it' },
      { value: 'never', label: 'Never: each trade runs out for good' },
    ],
  },
  {
    id: 'work_site',
    label: 'Restocks at its work site',
    description:
      'The block it walks to, within 16 blocks, to restock, as a villager at its workstation; only with "Twice a day, at a block near it".',
    group: 'Trades',
    type: 'string',
    default: 'minecraft:barrel',
    pattern: ITEM_PATTERN,
    maxLength: 96,
  },
  {
    id: 'demand',
    label: 'Prices rise when you buy a lot',
    description:
      'As with villagers: a trade bought out costs more after the next restock, and settles again when you buy less.',
    group: 'Trades',
    type: 'boolean',
    default: true,
  },
  {
    id: 'remembers',
    label: 'Remembers how you treat it',
    description:
      'Trading and gifts make its prices lower for you, hitting it makes them higher; it forgets a little each day.',
    group: 'Trades',
    type: 'boolean',
    default: false,
  },
  {
    id: 'gift',
    label: 'A gift it likes',
    description:
      'An item you give it by using it on the merchant, which makes your prices lower; leave it empty for no gifts.',
    group: 'Trades',
    type: 'string',
    default: 'minecraft:sweet_berries',
    pattern: OPTIONAL_ITEM_PATTERN,
    maxLength: 96,
  },
  {
    id: 'barters',
    label: 'Barters for gold',
    description:
      'Hand it a gold ingot, or drop one near it, and after a moment it gives you something back, as a piglin does.',
    group: 'Behaviour',
    type: 'boolean',
    default: false,
  },
  behaviourNumber('health', 'Health', 'Maximum health in half hearts; a villager has 20.', 20, {
    min: 2,
    max: 100,
    step: 1,
  }),
  behaviourNumber(
    'speed',
    'Speed',
    'The movement speed attribute; a villager has 0.5, a wandering trader 0.7 when fleeing.',
    0.4,
    { min: 0.1, max: 0.7, step: 0.01 },
  ),
  spawnParameter(LAND_SPAWNS, 'plains'),
]);

/** `minecraft:` added to an item id without a namespace. */
function itemId(value: string): string {
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** A whole number in `[min, max]` from a number answer. */
function wholeNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

/** One ware: what is sold, how many and the price. */
interface Ware {
  item: string;
  count: number;
  emeralds: number;
}

/** The wares the answers give: slot 1 always, slots 2 and 3 when an item is named. */
function readWares(values: Parameters<typeof stringValue>[0]): Ware[] {
  const wares: Ware[] = [];
  for (let slot = 1; slot <= MERCHANT_WARE_SLOTS; slot += 1) {
    const raw = stringValue(values, `ware_${slot}`).trim();
    if (raw === '' && slot > 1) continue;
    wares.push({
      item: itemId(raw === '' ? (DEFAULT_WARES[0] as Ware).item : raw),
      count: wholeNumber(numberValue(values, `ware_${slot}_count`), 1, 64),
      emeralds: wholeNumber(numberValue(values, `ware_${slot}_emeralds`), 1, 64),
    });
  }
  return wares;
}

/** The vanilla wandering trader's sets, unlocked after the merchant's own wares. */
export const WANDERING_TRADER_SETS = Object.freeze([
  'minecraft:wandering_trader/common',
  'minecraft:wandering_trader/uncommon',
]);

export function wanderingMerchantBundle(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const values = readValues(WANDERING_MERCHANT_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'merchant_name'));
  const preset = presetValue(values, PRESETS);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.violet);
  const wares = readWares(values);
  const uses = wholeNumber(numberValue(values, 'uses'), 1, 64);
  const vanillaWares = booleanValue(values, 'vanilla_wares');
  const restockAnswer = stringValue(values, 'restock');
  const restock = restockAnswer === 'never' ? 'never' : 'twice_a_day';
  const workSite =
    restockAnswer === 'work_site'
      ? itemId(stringValue(values, 'work_site').trim() || 'barrel')
      : '';
  const demand = booleanValue(values, 'demand');
  const remembers = booleanValue(values, 'remembers');
  const giftAnswer = stringValue(values, 'gift').trim();
  const gift = remembers && giftAnswer !== '' ? itemId(giftAnswer) : '';
  const barters = booleanValue(values, 'barters');
  const spawn = spawnChoice(values, LAND_SPAWNS);
  const id = name.id;

  const tradeIds = wares.map((_, index) => rl(namespace, `${id}/ware_${index + 1}`));
  const tradeSet = rl(namespace, `${id}/wares`);
  const levels: JsonObject[] = [
    { trade_set: tradeSet },
    ...(vanillaWares ? WANDERING_TRADER_SETS.map((set) => ({ trade_set: set })) : []),
  ];
  const tradeElements: ContentBundleElement[] = wares.map((ware, index) =>
    element(
      tradeIds[index] as ResourceLocation,
      KINDS.villagerTrade,
      {
        wants: { id: EMERALD, count: ware.emeralds },
        gives: { id: ware.item, count: ware.count },
        max_uses: uses,
        xp: 2,
      },
      `One of the ${name.lower}'s wares: ${ware.count} ${ware.item} for ${ware.emeralds} emerald${ware.emeralds === 1 ? '' : 's'}. wants is the price and gives what the player gets; max_uses (${uses}) is how often it works before the merchant restocks, and xp the trading experience each sale earns. The trade set ${tradeSet} offers it.`,
    ),
  );
  tradeElements.push(
    element(
      tradeSet,
      KINDS.tradeSet,
      { trades: [...tradeIds], amount: tradeIds.length },
      `The ${name.lower}'s own wares: the trade set lists ${tradeIds.length === 1 ? 'its one trade' : `its ${tradeIds.length} trades`} and offers all of them (amount ${tradeIds.length}). Add a trade here, and raise the amount, to sell more.`,
    ),
  );

  const components: JsonObject = {
    'msm:health': { max: wholeNumber(numberValue(values, 'health'), 2, 100) },
    'msm:movement': { speed: numberValue(values, 'speed') },
    'msm:trader': {
      trade_sets: levels,
      levels: true,
      restock,
      ...(demand ? {} : { demand: false }),
      ...(remembers ? { reputation: gift === '' ? {} : { gift_item: gift } } : {}),
      ...(workSite === '' ? {} : { work_site: workSite }),
    },
    'msm:ai_goals': {
      goals: [
        { type: 'panic', speed: 1.3 },
        ...(barters
          ? [
              {
                type: 'barter',
                item: 'minecraft:gold_ingot',
                loot_table: 'minecraft:gameplay/piglin_bartering',
                ticks: 120,
                from_ground: true,
              },
            ]
          : []),
        { type: 'wander', speed: 0.6 },
        { type: 'look_at_player', distance: 8 },
        { type: 'look_around' },
      ],
    },
  };
  const wareWords = wares
    .map(
      (ware) =>
        `${ware.count} ${ware.item} for ${ware.emeralds} emerald${ware.emeralds === 1 ? '' : 's'}`,
    )
    .join(', ');
  const notes = `A merchant: msm:trader opens the villager trading screen when a player uses it with an empty hand. Its first level offers its own wares from ${tradeSet} (${wareWords})${vanillaWares ? `; trading earns it experience, which unlocks the wandering trader's common wares (${WANDERING_TRADER_SETS[0]}) and then its rare ones (${WANDERING_TRADER_SETS[1]})` : ''}. ${restock === 'never' ? 'Its trades never restock.' : workSite === '' ? 'Its trades restock twice a day, without a workstation.' : `Its trades restock twice a day at its work site: it walks to the nearest ${workSite} within 16 blocks and restocks once it is within 2 blocks of it (work_site), as a villager at its workstation.`}${demand ? '' : ' Demand is off (demand false): buying a trade out never raises its price.'}${remembers ? ` It remembers each player (reputation, vanilla's numbers): each trade lowers that player's prices a little and each hit raises them${gift === '' ? '' : `, and a gift of ${gift} (used on it) lowers them`}; the memory fades a little each day and is never shared with other mobs.` : ''}${barters ? ' The barter goal takes a gold ingot handed to it or dropped near it and, after six seconds, drops a roll of minecraft:gameplay/piglin_bartering, as a piglin.' : ''} It does not trade while it is a baby, hurt and fleeing, or ridden, and keeps its offers when the world is saved. ${spawn.biomes.length === 0 ? 'It never spawns on its own: use its spawn egg.' : `It spawns now and then on its own in ${spawn.words} (rule animal: on grass in daylight).`}`;

  return mobFlowBundle({
    context,
    name,
    preset,
    colour,
    picture: imageValue(values, 'picture'),
    scale: 1,
    entity: {
      category: 'creature',
      ...spawnField(spawn, { weight: 2, min: 1, max: 1, rule: 'animal' }),
      components,
    },
    variants: [],
    modDescription: `Adds the ${name.display}, a merchant who trades with you.`,
    entityNotes: notes,
    extra: { elements: tradeElements, assets: [] },
  });
}
