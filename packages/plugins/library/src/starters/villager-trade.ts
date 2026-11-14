/**
 * The Villager trade flow (ADR 0060 D5): one `minecraft:villager_trade` and the vanilla
 * villager trade tag that offers it, `minecraft:<profession>/level_<n>` (or
 * `minecraft:wandering_trader/common`). The tag lists only the new trade and does not set
 * `replace`, so the export merges it into vanilla's tag and the vanilla trades stay. The
 * villager's trade set draws a fixed number of trades from that tag, so the new trade is a
 * candidate, not a certainty. No runtime: it works in a data pack. The trade id derives from
 * the villager and the two items, as vanilla names its trades:
 * `<ns>:<profession>/<level>/<wants>_<gives>` (`<ns>:wandering_trader/<wants>_<gives>`).
 */
import type { BundleContext, ContentBundle, StarterParameter } from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import { numberValue, readValues, stringValue } from '../content/parameters';

/** The value of the profession choice that means the wandering trader. */
const WANDERING_TRADER = 'wandering_trader';

/** The villager professions that trade, with their English names. */
const PROFESSIONS: readonly { value: string; label: string }[] = [
  { value: 'armorer', label: 'Armourer' },
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
  { value: 'toolsmith', label: 'Toolsmith' },
  { value: 'weaponsmith', label: 'Weaponsmith' },
  { value: WANDERING_TRADER, label: 'Wandering trader' },
];

/** The villager levels, 1 to 5. */
const LEVELS: readonly { value: string; label: string }[] = [
  { value: '1', label: 'Novice (level 1)' },
  { value: '2', label: 'Apprentice (level 2)' },
  { value: '3', label: 'Journeyman (level 3)' },
  { value: '4', label: 'Expert (level 4)' },
  { value: '5', label: 'Master (level 5)' },
];

/** An item id, with or without its namespace (`spectral_arrow`, `minecraft:spectral_arrow`). */
const ITEM_PATTERN = '^([a-z0-9_.-]+:)?[a-z0-9_.-]+(/[a-z0-9_.-]+)*$';

const EMERALD = 'minecraft:emerald';

/** The Villager trade flow's questions, groups "Villager" and "Trade". */
export const VILLAGER_TRADE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'profession',
    label: 'Villager',
    description: 'The villager profession that offers the trade, or the wandering trader.',
    group: 'Villager',
    type: 'choice',
    default: 'fletcher',
    choices: PROFESSIONS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'level',
    label: 'Level',
    description:
      'The villager level that unlocks the trade. The wandering trader has no levels, so this is ignored for it.',
    group: 'Villager',
    type: 'choice',
    default: '1',
    choices: LEVELS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'direction',
    label: 'The villager',
    group: 'Trade',
    type: 'choice',
    default: 'sells',
    choices: [
      { value: 'sells', label: 'Sells the item for emeralds' },
      { value: 'buys', label: 'Buys the item for emeralds' },
    ],
  },
  {
    id: 'item',
    label: 'Item',
    description: 'The item id, such as minecraft:spectral_arrow or a project item.',
    group: 'Trade',
    type: 'string',
    default: 'minecraft:spectral_arrow',
    pattern: ITEM_PATTERN,
    maxLength: 96,
  },
  {
    id: 'item_count',
    label: 'Number of items',
    group: 'Trade',
    type: 'number',
    default: 4,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'emeralds',
    label: 'Number of emeralds',
    description: "The price before demand and the player's reputation change it.",
    group: 'Trade',
    type: 'number',
    default: 2,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'max_uses',
    label: 'Uses before restocking',
    group: 'Trade',
    type: 'number',
    default: 12,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'xp',
    label: 'Villager experience per trade',
    group: 'Trade',
    type: 'number',
    default: 2,
    min: 0,
    max: 30,
    step: 1,
  },
]);

/** `minecraft:` added to an item id without a namespace. */
function itemId(value: string): string {
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** The last path segment of an item id, for the trade id. */
function itemWord(id: string): string {
  return id.slice(id.indexOf(':') + 1).replaceAll('/', '_');
}

/** A whole number in `[min, max]` from a number answer. */
function wholeNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

export function villagerTradeBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(VILLAGER_TRADE_PARAMETERS, context);
  const profession =
    PROFESSIONS.find((entry) => entry.value === stringValue(values, 'profession')) ??
    (PROFESSIONS[6] as (typeof PROFESSIONS)[number]);
  const level =
    LEVELS.find((entry) => entry.value === stringValue(values, 'level')) ??
    (LEVELS[0] as (typeof LEVELS)[number]);
  const sells = stringValue(values, 'direction') !== 'buys';
  const item = itemId(stringValue(values, 'item'));
  const itemCount = wholeNumber(numberValue(values, 'item_count'), 1, 64);
  const emeralds = wholeNumber(numberValue(values, 'emeralds'), 1, 64);
  const maxUses = wholeNumber(numberValue(values, 'max_uses'), 1, 64);
  const xp = wholeNumber(numberValue(values, 'xp'), 0, 30);

  const wandering = profession.value === WANDERING_TRADER;
  const wants = sells ? { id: EMERALD, count: emeralds } : { id: item, count: itemCount };
  const gives = sells ? { id: item, count: itemCount } : { id: EMERALD, count: emeralds };
  const pair = `${itemWord(wants.id)}_${itemWord(gives.id)}`;
  const tradeId = rl(
    namespace,
    wandering ? `${WANDERING_TRADER}/${pair}` : `${profession.value}/${level.value}/${pair}`,
  );
  const tagId = rl(
    'minecraft',
    wandering ? `${WANDERING_TRADER}/common` : `${profession.value}/level_${level.value}`,
  );
  const who = wandering
    ? 'the wandering trader'
    : `${profession.label.toLowerCase()}s at ${level.label.replace(/ \(.*/, '').toLowerCase()} level`;
  const deal = sells
    ? `sells ${itemCount} ${item} for ${emeralds} emerald${emeralds === 1 ? '' : 's'}`
    : `buys ${itemCount} ${item} for ${emeralds} emerald${emeralds === 1 ? '' : 's'}`;

  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: a new villager trade`,
        'The pack description shown in the data pack list.',
      ),
      element(
        tradeId,
        KINDS.villagerTrade,
        {
          wants,
          gives,
          max_uses: maxUses,
          xp,
          reputation_discount: 0.05,
        },
        `A trade: the villager ${deal}. wants is the price, which demand and the player's reputation change (reputation_discount says by how much); gives is what the player gets. max_uses is how often it can be used before the villager restocks, and xp the villager experience it earns. On its own a trade does nothing: the tag ${tagId} offers it.`,
      ),
      element(
        tagId,
        KINDS.tagVillagerTrade,
        { values: [tradeId] },
        `Adds ${tradeId} to the vanilla trade tag ${tagId}, from which ${who} draw their trades. The export merges it into vanilla's tag (replace stays false), so the vanilla trades stay. Each villager draws only a few trades from the tag, so the new one is a candidate, not a certainty: some villagers offer it and others do not. A guaranteed trade needs a trade set of the same name, which replaces vanilla's.`,
      ),
    ],
    assets: [],
  };
}
