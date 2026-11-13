/**
 * Villager trade templates (ADR 0060 D5): two trades, a trade set and the tag that adds a
 * trade to a vanilla villager. Only vanilla ids are used. A trade becomes a candidate for a
 * villager once its id is listed in a `minecraft:<profession>/level_<n>` tag; the villager's
 * trade set draws `amount` trades from that tag, so an added trade is not guaranteed.
 */
import type { ElementTemplate } from '@msm/plugin-api';

const TRADES = 'Trades';

export const tradeTemplates: readonly ElementTemplate[] = [
  {
    id: 'trade_emeralds_for_item',
    kind: 'minecraft:villager_trade',
    category: TRADES,
    title: 'Trade: emeralds for an item',
    description:
      'The villager sells an item for emeralds. List it in a villager trade tag to add it to a villager.',
    data: () => ({
      wants: { id: 'minecraft:emerald', count: 3 },
      gives: { id: 'minecraft:arrow', count: 16 },
      max_uses: 12,
      xp: 5,
      reputation_discount: 0.05,
    }),
  },
  {
    id: 'trade_item_for_emeralds',
    kind: 'minecraft:villager_trade',
    category: TRADES,
    title: 'Trade: item for emeralds',
    description:
      'The villager buys an item for emeralds. List it in a villager trade tag to add it to a villager.',
    data: () => ({
      wants: { id: 'minecraft:string', count: 20 },
      gives: { id: 'minecraft:emerald', count: 1 },
      max_uses: 16,
      xp: 2,
      reputation_discount: 0.05,
    }),
  },
  {
    id: 'trade_set',
    kind: 'minecraft:trade_set',
    category: TRADES,
    title: 'Trade set',
    description:
      'Draws a number of trades from a trade tag. A project set with a vanilla name replaces the vanilla one.',
    data: () => ({ trades: '#minecraft:fletcher/level_1', amount: 2 }),
  },
  {
    id: 'tag_villager_trade_fletcher',
    kind: 'minecraft:tag/villager_trade',
    category: TRADES,
    title: 'Villager trade tag: fletcher, level 1',
    description:
      'Adds trades to novice fletchers (minecraft:fletcher/level_1); add trade ids to "values". Each is a candidate, not a certainty.',
    defaultNamespace: 'minecraft',
    defaultName: 'fletcher/level_1',
    data: () => ({ replace: false, values: [] }),
  },
];
