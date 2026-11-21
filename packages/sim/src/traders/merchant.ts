/**
 * One trader mob's merchant state in Try it (B483, ADR 0098 D1): its offers, trading level and
 * XP, and its last restock, as the runtime's `MobTrader` keeps them (B474), without items moving.
 *
 * - Offers are drawn per level from the level's trade set: the set's number of trades, picked
 *   with a seeded generator (without repeats unless the set allows them). The Wandering merchant
 *   flow's and the Trader section's own sets offer every trade they hold, so their offers are
 *   always the same.
 * - A trade uses the offer once; at `max_uses` it is out of stock until a restock. With `levels`
 *   it gives the trader its `xp`; enough XP raises the level at once and draws that level's
 *   offers. Shift-click repeats a trade until its offer runs out.
 * - `twice_a_day` refills used offers once in each half of the day (clock ticks 0 to 11999 and
 *   12000 to 23999, as the runtime's); `never` keeps a used offer used.
 */

import { SimRandom } from '../entities/wander.js';
import type { NumberSpec, TraderSpec, TradeSetSpec, TradeSpec, TradeStack } from './catalogue.js';

/**
 * Trading XP a villager needs to leave levels 1 to 4 (counted from the start), as the game shows
 * on its trading screen's bar; a level's `xp_to_next` replaces it. Observed numbers, unchanged in
 * every version MSM targets.
 */
export const VANILLA_LEVEL_XP: readonly number[] = Object.freeze([10, 70, 150, 250]);

/** The five trading levels' names, as the game's trading screen shows them. */
export const TRADE_LEVEL_NAMES: readonly string[] = Object.freeze([
  'Novice',
  'Apprentice',
  'Journeyman',
  'Expert',
  'Master',
]);

/** Ticks in half a day: one restock chance each (the runtime's `HALF_DAY`). */
export const HALF_DAY_TICKS = 12000;

/** An item and a drawn count, as an offer shows it. */
export interface OfferStack {
  readonly item: string;
  readonly count: number;
}

/** One offer on the merchant screen. */
export interface SimOffer {
  /** The villager trade it came from. */
  readonly trade: string;
  /** The level that drew it. */
  readonly level: number;
  readonly cost: OfferStack;
  readonly secondCost?: OfferStack;
  readonly result: OfferStack;
  readonly maxUses: number;
  readonly xp: number;
  /** Times used since the last restock. */
  uses: number;
}

/** What one trade click did. */
export interface TradeResult {
  /** How many trades went through (more than one for a shift-click). */
  readonly trades: number;
  /** Why none went through, in plain words. */
  readonly refused?: string;
  /** The levels reached on the way, in order. */
  readonly levelsReached: readonly number[];
}

/** Whether an offer is used up until the next restock. */
export const outOfStock = (offer: SimOffer): boolean => offer.uses >= offer.maxUses;

const draw = (spec: NumberSpec, random: SimRandom): number =>
  spec.min === spec.max ? spec.min : random.int(spec.min, spec.max);

const stack = (spec: TradeStack, random: SimRandom): OfferStack => ({
  item: spec.item,
  count: Math.max(1, draw(spec.count, random)),
});

/** The XP the level's bar starts and ends at, counted from the start. */
export function levelSpan(trader: TraderSpec, level: number): { min: number; max: number } {
  const xpToLeave = (one: number): number =>
    trader.levels[one - 1]?.xpToNext ?? VANILLA_LEVEL_XP[one - 1] ?? Number.POSITIVE_INFINITY;
  return { min: level <= 1 ? 0 : xpToLeave(level - 1), max: xpToLeave(level) };
}

/** The highest level the trader reaches: its last level with `levels`, else 1. */
export const maxLevelOf = (trader: TraderSpec): number =>
  trader.usesLevels ? trader.levels.length : 1;

/** A trader mob's offers, level, XP and restocks. */
export class Merchant {
  /** The mob's id in the area. */
  readonly mobId: number;
  private traderNow: TraderSpec;
  private readonly random: SimRandom;
  private levelNow = 1;
  private xpNow = 0;
  private readonly offersNow: SimOffer[] = [];
  private restockHalfDay: number | null = null;
  private restocksNow = 0;

  constructor(
    mobId: number,
    trader: TraderSpec,
    sets: (id: string) => TradeSetSpec | null,
    trades: (id: string) => TradeSpec | null,
    seed: number,
  ) {
    this.mobId = mobId;
    this.traderNow = trader;
    this.random = new SimRandom(seed);
    this.drawLevel(1, sets, trades);
  }

  get trader(): TraderSpec {
    return this.traderNow;
  }

  /** The trading level, 1 to 5. */
  get level(): number {
    return this.levelNow;
  }

  /** Trading XP, counted from the start (0 without `levels`). */
  get xp(): number {
    return this.xpNow;
  }

  /** The offers, level 1's first. */
  get offers(): readonly SimOffer[] {
    return this.offersNow;
  }

  /** How many restocks refilled something. */
  get restocks(): number {
    return this.restocksNow;
  }

  /** How far the XP bar is filled in this level, 0 to 1; 1 at the last level. */
  get progress(): number {
    if (this.levelNow >= maxLevelOf(this.traderNow)) return 1;
    const { min, max } = levelSpan(this.traderNow, this.levelNow);
    if (!Number.isFinite(max) || max <= min) return 1;
    return Math.min(1, Math.max(0, (this.xpNow - min) / (max - min)));
  }

  /** The trader's definition after an edit (the offers already drawn stay). */
  setTrader(trader: TraderSpec): void {
    this.traderNow = trader;
  }

  /** Adds the offers of one draw from level `level`'s trade set; returns how many. */
  drawLevel(
    level: number,
    sets: (id: string) => TradeSetSpec | null,
    trades: (id: string) => TradeSpec | null,
  ): number {
    const entry = this.traderNow.levels[level - 1];
    if (entry === undefined) return 0;
    const set = sets(entry.tradeSet);
    if (set === null) return 0;
    const pool = [...set.trades];
    const wanted = Math.max(0, draw(set.amount, this.random));
    let added = 0;
    while (added < wanted && pool.length > 0) {
      const index = this.pickIndex(pool.length, set);
      const id = pool[index] as string;
      const trade = trades(id);
      if (trade === null || !set.allowDuplicates) pool.splice(index, 1);
      if (trade === null) continue;
      const second = trade.additionalWants;
      this.offersNow.push({
        trade: id,
        level,
        cost: stack(trade.wants, this.random),
        ...(second === undefined ? {} : { secondCost: stack(second, this.random) }),
        result: stack(trade.gives, this.random),
        maxUses: Math.max(1, draw(trade.maxUses, this.random)),
        xp: trade.xp,
        uses: 0,
      });
      added += 1;
    }
    return added;
  }

  /**
   * A set offering every trade it holds keeps the file's order (the screen reads as the Trader
   * section lists it); otherwise trades are picked at random, as the game picks them.
   */
  private pickIndex(left: number, set: TradeSetSpec): number {
    const everyTrade = !set.allowDuplicates && set.amount.max >= set.trades.length;
    return everyTrade ? 0 : this.random.int(0, left - 1);
  }

  /**
   * Trades offer `index` once, or with `all` (shift-click) until it runs out. Draws the next
   * level's offers on a level-up.
   */
  trade(
    index: number,
    all: boolean,
    sets: (id: string) => TradeSetSpec | null,
    trades: (id: string) => TradeSpec | null,
  ): TradeResult {
    const offer = this.offersNow[index];
    if (offer === undefined)
      return { trades: 0, refused: 'there is no such offer', levelsReached: [] };
    if (outOfStock(offer)) {
      return {
        trades: 0,
        refused:
          this.traderNow.restock === 'never'
            ? 'this offer is used up for good (it never restocks)'
            : 'this offer is used up until the trader restocks',
        levelsReached: [],
      };
    }
    const times = all ? offer.maxUses - offer.uses : 1;
    const levelsReached: number[] = [];
    for (let i = 0; i < times; i += 1) {
      offer.uses += 1;
      if (!this.traderNow.usesLevels) continue;
      this.xpNow += offer.xp;
      const top = maxLevelOf(this.traderNow);
      while (this.levelNow < top && this.xpNow >= levelSpan(this.traderNow, this.levelNow).max) {
        this.levelNow += 1;
        levelsReached.push(this.levelNow);
        this.drawLevel(this.levelNow, sets, trades);
      }
    }
    return { trades: times, levelsReached };
  }

  /**
   * Restocks when the clock has entered a new half day since the last check (the first check
   * only notes the half day, as the runtime's). Returns whether a used offer was refilled.
   */
  restockIfDue(clockTicks: number): boolean {
    if (this.traderNow.restock === 'never') return false;
    const halfDay = Math.floor(clockTicks / HALF_DAY_TICKS);
    if (this.restockHalfDay === halfDay) return false;
    const first = this.restockHalfDay === null;
    this.restockHalfDay = halfDay;
    if (first) return false;
    let refilled = false;
    for (const offer of this.offersNow) {
      if (offer.uses > 0) refilled = true;
      offer.uses = 0;
    }
    if (refilled) this.restocksNow += 1;
    return refilled;
  }
}
