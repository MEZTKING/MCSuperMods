/**
 * The trader catalogue (B483, ADR 0098 D1, ADR 0101 D5): what the merchant mock-up reads from
 * the lowered files the game would get (ADR 0085 D3).
 *
 * - `msm:trader` of each project mob (`msm/<ns>/entity/<path>.json`): its levels and their trade
 *   sets, `levels`, `restock`, `trade_sound` and `on_trade`, and whether the mob is a `monster`.
 * - The project's trade sets (`data/<ns>/trade_set/<path>.json`, ADR 0060): their trades (one id,
 *   a list, or a `#` villager trade tag, read through `data/<ns>/tags/villager_trade/`), how many
 *   they offer and whether a trade may come twice.
 * - The project's villager trades (`data/<ns>/villager_trade/<path>.json`): `wants`,
 *   `additional_wants`, `gives`, `max_uses` (default 4) and `xp` (default 1).
 *
 * Batch 2 (B540, ADR 0107 D1 to D3 as amended after B524): a trader's `reputation` (the
 * runtime's defaults filled in), `demand` (default on) and `work_site`, and each villager
 * trade's `reputation_discount` (the offer's price multiplier, `0` by default as vanilla's).
 *
 * Minecraft's own trade sets and trades are not among the lowered files: a level drawing from
 * one has no offers here, and the area says so (ADR 0085 D5). Villager professions
 * (`msm/<ns>/villager_profession/<path>.json`) are read only for their names and job sites, to
 * be said out loud: villagers taking a job exist only in the game.
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import { plainEntityName } from '../entities/catalogue.js';
import type { SimFiles, SimOrigin } from '../types.js';

/** An item and how many: a price or a product. */
export interface TradeStack {
  readonly item: string;
  /** A whole number, or a range drawn when the offer is made. */
  readonly count: NumberSpec;
}

/** A number provider as the preview reads it: a constant, or a range drawn evenly. */
export type NumberSpec = { readonly min: number; readonly max: number };

/** One villager trade. */
export interface TradeSpec {
  readonly id: string;
  readonly wants: TradeStack;
  readonly additionalWants?: TradeStack;
  readonly gives: TradeStack;
  readonly maxUses: NumberSpec;
  readonly xp: number;
  /**
   * `reputation_discount`: how much demand and reputation change the price, per point (the
   * offer's price multiplier; vanilla's default `0`).
   */
  readonly priceMultiplier: number;
}

/**
 * A trader's `reputation` (ADR 0107 D1 as amended after B524), the runtime's defaults filled
 * in (`TraderParser.Reputation`): a hit costs `hurt`, a trade gains `trade` (at most
 * {@link TRADE_CAP}), a gift of `giftItem` gains `gift` (at most {@link GIFT_CAP}); each day hits
 * recover `decayPerDay` and trades fade by {@link TRADE_DECAY_PER_DAY}; gifts never fade.
 */
export interface ReputationSpec {
  readonly hurt: number;
  readonly trade: number;
  readonly giftItem?: string;
  readonly gift: number;
  readonly decayPerDay: number;
  /** With it, a price falls one item per `priceStep` points instead of by the multiplier. */
  readonly priceStep?: number;
}

/** The runtime's caps and fading (B528, `TraderParser.Reputation`, `TraderReputation`). */
export const HIT_CAP = 200;
export const TRADE_CAP = 25;
export const GIFT_CAP = 25;
export const TRADE_DECAY_PER_DAY = 2;

/** The defaults of `reputation` (vanilla's measured numbers, B524). */
export const REPUTATION_DEFAULTS = Object.freeze({
  hurt: 25,
  trade: 2,
  gift: 25,
  decayPerDay: 20,
});

/** One trade set the preview can read. */
export interface TradeSetSpec {
  readonly id: string;
  /** The trade ids it draws from, tags resolved, in the file's order. */
  readonly trades: readonly string[];
  /** How many offers one draw makes. */
  readonly amount: NumberSpec;
  readonly allowDuplicates: boolean;
  /** Trade ids it names that the preview cannot read (Minecraft's own, or missing). */
  readonly unreadable: readonly string[];
}

/** One level of a trader: the trade set its offers come from. */
export interface TraderLevelSpec {
  readonly tradeSet: string;
  /** Trading XP to leave this level, counted from the start; absent means vanilla's. */
  readonly xpToNext?: number;
}

/** A project mob with `msm:trader`. */
export interface TraderSpec {
  /** The entity type's id. */
  readonly id: string;
  readonly displayName: string;
  readonly levels: readonly TraderLevelSpec[];
  /** Whether trading gives XP and unlocks the next level (`levels`, default true). */
  readonly usesLevels: boolean;
  readonly restock: 'twice_a_day' | 'never';
  /** The sound a trade plays, when the definition or the target names one. */
  readonly tradeSound?: string;
  /** The event `on_trade` names. */
  readonly onTrade?: string;
  /** `reputation`, when the trader remembers how the player treats it (B540). */
  readonly reputation?: ReputationSpec;
  /** `demand` (default true): prices rise after heavy trading and settle at each restock. */
  readonly demand: boolean;
  /** `work_site`: a block id or `#` block tag the trader restocks at (B540). */
  readonly workSite?: string;
  /** Whether the mob's `base` is `monster` (no trading at night). */
  readonly monster: boolean;
  /** Whether it also has `msm:storage` or `msm:shoulder_riding` (said, not simulated). */
  readonly storage: boolean;
  readonly shoulder: boolean;
  readonly origin: SimOrigin;
}

/** A project villager profession, said out loud only. */
export interface ProfessionSpec {
  readonly id: string;
  readonly displayName: string;
  /** Its job site block. */
  readonly jobSite?: string;
  readonly origin: SimOrigin;
}

/** The facts the trader catalogue reads from a target. */
export type TradersTarget = Pick<TargetFacts, 'folders'> & {
  readonly entities?: Pick<NonNullable<TargetFacts['entities']>, 'tradeSounds'>;
};

/** The highest level of a trader (ADR 0098 D1: one to five). */
export const MAX_TRADER_LEVEL = 5;

const ENTITY_PATH = /^msm\/([a-z0-9_.-]+)\/entity\/([a-z0-9_./-]+)\.json$/;
const PROFESSION_PATH = /^msm\/([a-z0-9_.-]+)\/villager_profession\/([a-z0-9_./-]+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const split = (id: string): { namespace: string; path: string } => {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

/** A number provider (`3`, `{min, max}`, `minecraft:constant`, `minecraft:uniform`); `null` when unread. */
export function numberSpec(value: Json | undefined): NumberSpec | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.round(value);
    return { min: n, max: n };
  }
  if (!isRecord(value)) return null;
  const type = nonEmpty(value.type);
  if ((type === undefined || type === 'minecraft:constant') && typeof value.value === 'number') {
    const n = Math.round(value.value);
    return { min: n, max: n };
  }
  if (type === undefined || type === 'minecraft:uniform') {
    const min = numberSpec(value.min);
    const max = numberSpec(value.max);
    if (min !== null && max !== null) return { min: min.min, max: Math.max(min.min, max.max) };
  }
  if (type === 'minecraft:binomial' && typeof value.n === 'number') {
    return { min: 0, max: Math.max(0, Math.round(value.n)) };
  }
  return null;
}

/** An item cost or product (`{ id, count }`); `null` without an item. */
function stackOf(value: Json | undefined): TradeStack | null {
  if (!isRecord(value)) return null;
  const item = nonEmpty(value.id);
  if (item === undefined) return null;
  return { item, count: numberSpec(value.count) ?? { min: 1, max: 1 } };
}

/** Reads one villager trade; `null` when it is not among the files or cannot be read. */
export function readTrade(files: SimFiles, target: TradersTarget, id: string): TradeSpec | null {
  const { namespace, path } = split(id);
  const json = readJsonFile(
    files,
    `data/${namespace}/${target.folders.data.villager_trade}/${path}.json`,
  );
  if (!isRecord(json)) return null;
  const wants = stackOf(json.wants);
  const gives = stackOf(json.gives);
  if (wants === null || gives === null) return null;
  const additional = stackOf(json.additional_wants);
  const xp = typeof json.xp === 'number' && Number.isFinite(json.xp) ? Math.round(json.xp) : 1;
  const discount = json.reputation_discount;
  const multiplier =
    typeof discount === 'number' && Number.isFinite(discount)
      ? discount
      : isRecord(discount) && typeof discount.value === 'number'
        ? discount.value
        : 0;
  return Object.freeze({
    id,
    wants,
    ...(additional === null ? {} : { additionalWants: additional }),
    gives,
    maxUses: numberSpec(json.max_uses) ?? { min: 4, max: 4 },
    xp: Math.max(0, xp),
    priceMultiplier: multiplier,
  });
}

/** The trade ids a villager trade tag lists, nested tags followed. */
function tagTrades(
  files: SimFiles,
  target: TradersTarget,
  tag: string,
  seen: Set<string>,
): string[] | null {
  if (seen.has(tag)) return [];
  seen.add(tag);
  const { namespace, path } = split(tag);
  const json = readJsonFile(
    files,
    `data/${namespace}/${target.folders.data.tags}/villager_trade/${path}.json`,
  );
  if (!isRecord(json) || !Array.isArray(json.values)) return null;
  const out: string[] = [];
  for (const value of json.values as Json[]) {
    const entry =
      typeof value === 'string' ? value : isRecord(value) ? nonEmpty(value.id) : undefined;
    if (entry === undefined) continue;
    if (entry.startsWith('#')) {
      const inner = tagTrades(files, target, entry.slice(1), seen);
      if (inner === null) out.push(entry);
      else out.push(...inner);
    } else {
      out.push(entry);
    }
  }
  return out;
}

/** Reads one trade set; `null` when it is not among the files (Minecraft's own, or missing). */
export function readTradeSet(
  files: SimFiles,
  target: TradersTarget,
  id: string,
): TradeSetSpec | null {
  const { namespace, path } = split(id);
  const json = readJsonFile(
    files,
    `data/${namespace}/${target.folders.data.trade_set}/${path}.json`,
  );
  if (!isRecord(json)) return null;
  const listed: string[] = [];
  const unreadable: string[] = [];
  const add = (entry: string): void => {
    if (entry.startsWith('#')) {
      const inner = tagTrades(files, target, entry.slice(1), new Set());
      if (inner === null) unreadable.push(entry);
      else for (const one of inner) add(one);
      return;
    }
    if (readTrade(files, target, entry) === null) unreadable.push(entry);
    else listed.push(entry);
  };
  const trades = json.trades;
  if (typeof trades === 'string') add(trades);
  else if (Array.isArray(trades)) {
    for (const entry of trades) if (typeof entry === 'string') add(entry);
  }
  return Object.freeze({
    id,
    trades: Object.freeze(listed),
    amount: numberSpec(json.amount) ?? { min: listed.length, max: listed.length },
    allowDuplicates: json.allow_duplicates === true,
    unreadable: Object.freeze(unreadable),
  });
}

const wholeAtLeast = (value: Json | undefined, min: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined;

/** `reputation` with the runtime's defaults; `undefined` without it. */
function reputationOf(value: Json | undefined): ReputationSpec | undefined {
  if (!isRecord(value)) return undefined;
  const giftItem = nonEmpty(value.gift_item);
  const priceStep = wholeAtLeast(value.price_step, 1);
  return Object.freeze({
    hurt: wholeAtLeast(value.hurt, 0) ?? REPUTATION_DEFAULTS.hurt,
    trade: wholeAtLeast(value.trade, 0) ?? REPUTATION_DEFAULTS.trade,
    ...(giftItem === undefined ? {} : { giftItem }),
    gift: wholeAtLeast(value.gift, 0) ?? REPUTATION_DEFAULTS.gift,
    decayPerDay: wholeAtLeast(value.decay_per_day, 0) ?? REPUTATION_DEFAULTS.decayPerDay,
    ...(priceStep === undefined ? {} : { priceStep }),
  });
}

/** Every project mob with `msm:trader`, by entity type id. */
export function readTraders(files: SimFiles, target: TradersTarget): Map<string, TraderSpec> {
  const out = new Map<string, TraderSpec>();
  const langs = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(
        files,
        `assets/${namespace}/${target.folders.resource.lang}/en_us.json`,
      );
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return lang;
  };
  const defaultSound = target.entities?.tradeSounds?.yes;
  for (const path of [...files.keys()].filter((one) => ENTITY_PATH.test(one)).sort()) {
    const match = ENTITY_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const entityPath = match[2] as string;
    const id = `${namespace}:${entityPath}`;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition)) continue;
    const components = isRecord(definition.components) ? definition.components : {};
    const trader = components['msm:trader'];
    if (!isRecord(trader) || !Array.isArray(trader.trade_sets)) continue;
    const levels: TraderLevelSpec[] = [];
    for (const entry of (trader.trade_sets as Json[]).slice(0, MAX_TRADER_LEVEL)) {
      if (!isRecord(entry)) continue;
      const tradeSet = nonEmpty(entry.trade_set);
      if (tradeSet === undefined) continue;
      const xp = entry.xp_to_next;
      levels.push(
        Object.freeze({
          tradeSet,
          ...(typeof xp === 'number' && Number.isInteger(xp) && xp >= 1 ? { xpToNext: xp } : {}),
        }),
      );
    }
    if (levels.length === 0) continue;
    const sound = nonEmpty(trader.trade_sound) ?? defaultSound;
    const onTrade = nonEmpty(trader.on_trade);
    const reputation = reputationOf(trader.reputation);
    const workSite = nonEmpty(trader.work_site);
    const lang = langOf(namespace);
    out.set(
      id,
      Object.freeze({
        id,
        displayName:
          nonEmpty(lang[`entity.${namespace}.${entityPath.replaceAll('/', '.')}`]) ??
          plainEntityName(id),
        levels: Object.freeze(levels),
        usesLevels: trader.levels !== false,
        restock: trader.restock === 'never' ? 'never' : 'twice_a_day',
        ...(sound === undefined ? {} : { tradeSound: sound }),
        ...(onTrade === undefined ? {} : { onTrade }),
        ...(reputation === undefined ? {} : { reputation }),
        demand: trader.demand !== false,
        ...(workSite === undefined ? {} : { workSite }),
        monster: definition.base === 'monster',
        storage: isRecord(components['msm:storage']),
        shoulder: isRecord(components['msm:shoulder_riding']),
        origin: Object.freeze({ elementId: id }),
      }),
    );
  }
  return out;
}

/** Every project villager profession, by id (said out loud only). */
export function readProfessions(
  files: SimFiles,
  target: TradersTarget,
): Map<string, ProfessionSpec> {
  const out = new Map<string, ProfessionSpec>();
  for (const path of [...files.keys()].filter((one) => PROFESSION_PATH.test(one)).sort()) {
    const match = PROFESSION_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const professionPath = match[2] as string;
    const id = `${namespace}:${professionPath}`;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition)) continue;
    const lang = readJsonFile(
      files,
      `assets/${namespace}/${target.folders.resource.lang}/en_us.json`,
    );
    const key = `entity.${namespace}.villager.${professionPath.replaceAll('/', '.')}`;
    const jobSite = nonEmpty(definition.job_site);
    out.set(
      id,
      Object.freeze({
        id,
        displayName: (isRecord(lang) ? nonEmpty(lang[key]) : undefined) ?? plainEntityName(id),
        ...(jobSite === undefined ? {} : { jobSite }),
        origin: Object.freeze({ elementId: id }),
      }),
    );
  }
  return out;
}
