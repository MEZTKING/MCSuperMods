/**
 * Traders in one Try it area (B483, ADR 0098, ADR 0101 D5): what `LocalWorldSource` hands to
 * this part of the simulation.
 *
 * - Using a trader mob opens its merchant screen, a mock-up the view draws (`tryit/traders/`),
 *   in the runtime's order (B474, B479): a sneaking use of a mob with `msm:storage` is its store
 *   (said, not simulated); otherwise the trader opens unless it refuses, and a mob with no offer
 *   to show passes the click on to its `msm:on_interact`.
 * - Refusals: a `monster` trader at night. Babies, angry mobs and ridden mobs refuse in the game
 *   too; the preview has none of them, and says so once.
 * - The area keeps a time of day for restocking and the night: it starts at 1000 (morning, as a
 *   new world), runs with the clock, and the "Time-lapse a day" step moves it on a whole day.
 * - Said out loud: Minecraft's own trade sets (not among the lowered files), price changes by
 *   demand, reputation and discounts (limit Q21), payment and products (no items move), mount
 *   storage and shoulder pets, and villager professions (villagers taking a job at a job site).
 */

import type { EntityWorld } from '../entities/entity-world.js';
import { type EventContext, PLAYER } from '../events/actions.js';
import type { TriggerEngine } from '../events/triggers.js';
import type { BlockPos, SimEffect, SimFiles, SimLog, SimOrigin } from '../types.js';
import {
  type ProfessionSpec,
  readProfessions,
  readTrade,
  readTraders,
  readTradeSet,
  type TraderSpec,
  type TradersTarget,
  type TradeSetSpec,
  type TradeSpec,
} from './catalogue.js';
import { Merchant, type OfferStack, outOfStock, TRADE_LEVEL_NAMES } from './merchant.js';

/** The time of day a new area starts at (morning, as a new world's first day). */
export const TRADER_START_TIME = 1000;
/** Clock ticks of a whole day. */
export const DAY_TICKS = 24000;
/**
 * The part of the day a `monster` trader does not trade in: the game's dark hours, approximately
 * (it asks whether the sky is dark).
 */
export const NIGHT_START = 13000;
export const NIGHT_END = 23000;

/** What the trader part works with. */
export interface TraderHost {
  readonly entities: EntityWorld;
  readonly triggers: () => TriggerEngine;
  readonly log: SimLog;
  readonly effect: (effect: SimEffect) => void;
  readonly seed: number;
}

/** The merchant screen open now (the view's mock-up). */
export interface OpenMerchant {
  readonly mobId: number;
  readonly displayName: string;
  readonly merchant: Merchant;
  readonly origin: SimOrigin;
}

/** What a use of a mob did. */
export type MobUse = 'opened' | 'refused' | 'taken' | 'passed';

/** `6 Glow Berries` from an offer stack. */
export function stackWords(stack: OfferStack, nameOf: (id: string) => string): string {
  return `${stack.count} ${nameOf(stack.item)}`;
}

/** Plain words for a trade set id (`minecraft:wandering_trader/common` → `Wandering trader, common`). */
export function tradeSetWords(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const [who = path, ...rest] = path.split('/');
  const head = who.replaceAll('_', ' ');
  const tail = rest.join(', ').replaceAll('_', ' ');
  const name = head.charAt(0).toUpperCase() + head.slice(1);
  return tail === '' ? name : `${name}, ${tail}`;
}

/** The traders of an area; see the module comment. */
export class TraderArea {
  private readonly host: TraderHost;
  private files: SimFiles;
  private target: TradersTarget;
  private traders: Map<string, TraderSpec>;
  private professions: Map<string, ProfessionSpec>;
  private readonly merchants = new Map<number, Merchant>();
  private readonly setCache = new Map<string, TradeSetSpec | null>();
  private readonly tradeCache = new Map<string, TradeSpec | null>();
  private openNow: OpenMerchant | null = null;
  private time = TRADER_START_TIME;
  private readonly said = new Set<string>();
  /** Mobs with `msm:storage` (read when first asked). */
  private storageOnly: Set<string> | null = null;

  constructor(files: SimFiles, target: TradersTarget, host: TraderHost) {
    this.host = host;
    this.files = files;
    this.target = target;
    this.traders = readTraders(files, target);
    this.professions = readProfessions(files, target);
  }

  /** The project's trader mobs, by entity type id. */
  get specs(): ReadonlyMap<string, TraderSpec> {
    return this.traders;
  }

  /** The merchant screen open now, or `null`. */
  get open(): OpenMerchant | null {
    return this.openNow;
  }

  /** The time of day, 0 to 23999. */
  get timeOfDay(): number {
    return ((this.time % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  }

  /** Whether it is night now (a `monster` trader refuses). */
  get night(): boolean {
    const time = this.timeOfDay;
    return time >= NIGHT_START && time < NIGHT_END;
  }

  /** The merchant of a mob, once it has been used. */
  merchantOf(mobId: number): Merchant | undefined {
    return this.merchants.get(mobId);
  }

  /** New lowered files after an edit: offers already drawn stay; new levels read the new sets. */
  setFiles(files: SimFiles, target: TradersTarget): void {
    this.files = files;
    this.target = target;
    this.traders = readTraders(files, target);
    this.professions = readProfessions(files, target);
    this.setCache.clear();
    this.tradeCache.clear();
    this.storageOnly = null;
    for (const [mobId, merchant] of [...this.merchants]) {
      const mob = this.host.entities.entity(mobId);
      const spec = mob === undefined ? undefined : this.traders.get(mob.kind.id);
      if (spec === undefined) {
        this.merchants.delete(mobId);
        if (this.openNow?.mobId === mobId) this.openNow = null;
      } else {
        merchant.setTrader(spec);
      }
    }
  }

  /** One tick: the time of day moves on; open merchants restock at the half-day mark. */
  tick(): void {
    this.time += 1;
    if (this.openNow !== null && this.host.entities.entity(this.openNow.mobId) === undefined) {
      this.openNow = null;
    }
    for (const [mobId, merchant] of this.merchants) {
      if (this.host.entities.entity(mobId) === undefined) {
        this.merchants.delete(mobId);
        continue;
      }
      this.restock(merchant);
    }
  }

  /** "Time-lapse a day": a whole day goes by (two restocks for a `twice_a_day` trader). */
  passTime(ticks: number): void {
    const halves = Math.floor(ticks / (DAY_TICKS / 2));
    for (let i = 0; i < halves; i += 1) {
      this.time += DAY_TICKS / 2;
      for (const merchant of this.merchants.values()) this.restock(merchant);
    }
    this.time += ticks - halves * (DAY_TICKS / 2);
  }

  /** Forgets every merchant ("Clear the area"); the time of day goes on. */
  clear(): void {
    this.merchants.clear();
    this.openNow = null;
  }

  /** Closes the merchant screen. */
  close(): void {
    this.openNow = null;
  }

  /**
   * The player used mob `mobId` (sneaking or not): its store (said), its merchant screen, or
   * `passed` for a mob that is no trader or has no offer to show.
   */
  use(mobId: number, sneaking: boolean): MobUse {
    const mob = this.host.entities.entity(mobId);
    if (mob === undefined) return 'passed';
    const spec = this.traders.get(mob.kind.id);
    const { log } = this.host;
    if (sneaking && this.hasStorage(mob.kind.id)) {
      log.onlyInMinecraft(
        `${mob.kind.displayName}'s storage opens on a sneaking use (or the inventory key while riding it); the preview does not show what it carries`,
        mob.kind.origin,
      );
      return 'taken';
    }
    if (spec === undefined) return 'passed';
    this.sayOnce(
      'refusals',
      'Babies, angry mobs and ridden mobs do not trade; the preview has none of them',
      spec.origin,
    );
    if (spec.monster && this.night) {
      log.info(
        `${spec.displayName} does not trade at night: it is a monster. Come back in the day.`,
        spec.origin,
      );
      return 'refused';
    }
    let merchant = this.merchants.get(mobId);
    if (merchant === undefined) {
      merchant = new Merchant(mobId, spec, this.setOf, this.tradeOf, this.host.seed + mobId * 7919);
      this.merchants.set(mobId, merchant);
      this.sayUnreadable(spec, 1);
    }
    this.restock(merchant);
    if (merchant.offers.length === 0) {
      log.info(`${spec.displayName} has no offers the preview can show.`, spec.origin);
      return 'passed';
    }
    this.openNow = { mobId, displayName: spec.displayName, merchant, origin: spec.origin };
    this.sayOnce(
      'prices',
      'Prices that change with demand, reputation and discounts, and paying with the items in your inventory; in the preview a trade costs nothing and gives nothing',
      spec.origin,
    );
    log.info(
      `You opened ${spec.displayName}'s trading screen (${TRADE_LEVEL_NAMES[merchant.level - 1]}).`,
      spec.origin,
    );
    return 'opened';
  }

  /**
   * Trades offer `index` of the open screen once, or with `all` (shift-click) until it runs out:
   * the line, the trade sound, `on_trade` for each trade, and the new level's offers.
   */
  trade(index: number, all: boolean, nameOf: (id: string) => string): number {
    const open = this.openNow;
    if (open === null) return 0;
    const { merchant } = open;
    const spec = merchant.trader;
    const offer = merchant.offers[index];
    const result = merchant.trade(index, all, this.setOf, this.tradeOf);
    const { log } = this.host;
    if (offer === undefined) return 0;
    if (result.trades === 0) {
      log.info(
        `${spec.displayName} cannot make that trade: ${result.refused ?? 'it refused'}.`,
        spec.origin,
      );
      return 0;
    }
    const price = [offer.cost, ...(offer.secondCost === undefined ? [] : [offer.secondCost])]
      .map((one) => stackWords(one, nameOf))
      .join(' and ');
    log.info(
      `You traded ${price} for ${stackWords(offer.result, nameOf)} with ${spec.displayName}${result.trades > 1 ? ` ${result.trades} times` : ''}.${outOfStock(offer) ? ' That offer is now out of stock.' : ''}`,
      spec.origin,
    );
    const mob = this.host.entities.entity(open.mobId);
    const position = mob?.position ?? { x: 0, y: 0, z: 0 };
    if (spec.tradeSound !== undefined) {
      this.host.effect({ kind: 'sound', id: spec.tradeSound, position, origin: spec.origin });
    }
    for (const level of result.levelsReached) {
      log.info(
        `${spec.displayName} reached ${TRADE_LEVEL_NAMES[level - 1]} (level ${level}) and has new offers.`,
        spec.origin,
      );
      this.sayUnreadable(spec, level);
    }
    if (spec.onTrade !== undefined) {
      const base = {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(position.z),
      };
      const ctx: EventContext = {
        source: 'entity',
        base,
        origin: position,
        player: true,
        entity: open.mobId,
        other: PLAYER,
      };
      for (let i = 0; i < result.trades; i += 1) {
        this.host
          .triggers()
          .fireTrigger(
            'entity',
            spec.id,
            'entity:msm:trader.on_trade',
            ctx,
            `You traded with ${spec.displayName}`,
          );
      }
    }
    return result.trades;
  }

  /** A project block was placed: a profession's job site is said out loud (B483). */
  placed(block: string, _pos: BlockPos, nameOf: (id: string) => string): void {
    for (const profession of this.professions.values()) {
      if (profession.jobSite !== block) continue;
      this.sayOnce(
        `profession:${profession.id}`,
        `A villager without a job takes the ${profession.displayName} job at ${nameOf(block)} and trades from its levels; the preview has no villagers`,
        profession.origin,
      );
    }
  }

  private hasStorage(type: string): boolean {
    const spec = this.traders.get(type);
    if (spec !== undefined) return spec.storage;
    return this.storageMobs().has(type);
  }

  /** Mobs with `msm:storage` that are not traders (read when first asked). */
  private storageMobs(): Set<string> {
    if (this.storageOnly === null) {
      this.storageOnly = new Set();
      for (const [path, raw] of this.files) {
        const match = /^msm\/([a-z0-9_.-]+)\/entity\/([a-z0-9_./-]+)\.json$/.exec(path);
        if (match === null) continue;
        const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        if (text.includes('"msm:storage"')) this.storageOnly.add(`${match[1]}:${match[2]}`);
      }
    }
    return this.storageOnly;
  }

  private restock(merchant: Merchant): void {
    if (merchant.restockIfDue(this.time)) {
      this.host.log.info(
        `${merchant.trader.displayName} restocked its offers (half a day went by).`,
        merchant.trader.origin,
      );
    }
  }

  /** Says once when a level's trade set (or some of its trades) cannot be read here. */
  private sayUnreadable(spec: TraderSpec, level: number): void {
    const entry = spec.levels[level - 1];
    if (entry === undefined) return;
    const set = this.setOf(entry.tradeSet);
    const levelName = `${TRADE_LEVEL_NAMES[level - 1]} (level ${level})`;
    if (set === null) {
      this.sayOnce(
        `set:${spec.id}:${level}`,
        `${spec.displayName}'s ${levelName} offers come from ${entry.tradeSet.startsWith('minecraft:') ? 'Minecraft’s' : 'the'} trade set "${tradeSetWords(entry.tradeSet)}", which the preview cannot read`,
        spec.origin,
      );
      return;
    }
    if (set.unreadable.length > 0) {
      this.sayOnce(
        `trades:${spec.id}:${level}`,
        `${spec.displayName}'s ${levelName} offers also draw from ${set.unreadable.length} trade${set.unreadable.length === 1 ? '' : 's'} the preview cannot read (Minecraft’s own)`,
        spec.origin,
      );
    }
  }

  private sayOnce(key: string, what: string, origin: SimOrigin): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.host.log.onlyInMinecraft(what, origin);
  }

  private readonly setOf = (id: string): TradeSetSpec | null => {
    if (!this.setCache.has(id)) this.setCache.set(id, readTradeSet(this.files, this.target, id));
    return this.setCache.get(id) ?? null;
  };

  private readonly tradeOf = (id: string): TradeSpec | null => {
    if (!this.tradeCache.has(id)) this.tradeCache.set(id, readTrade(this.files, this.target, id));
    return this.tradeCache.get(id) ?? null;
  };
}
