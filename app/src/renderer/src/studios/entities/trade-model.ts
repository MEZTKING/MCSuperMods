/**
 * Pure helpers of the trade editor (ADR 0098 D1, D2, ADR 0101 D1) shared by the Mob Studio's
 * Trader section and the Profession Studio. Trades stay ADR 0060 data: each trade is a
 * `minecraft:villager_trade` element, each level lists its trades in a
 * `minecraft:tag/villager_trade` element, and a trader's level draws them through a
 * `minecraft:trade_set` element. The editor's actions are lists of change items for the host's
 * `applyChanges`, so each one is a single undo step.
 *
 * Ids (the level's "layout"):
 *
 * - a trader mob `<ns>:<path>`: level `n` uses the trade set `<ns>:<path>/level_<n>`, which draws
 *   every trade (`amount` follows the number of trades) from the tag `#<ns>:<path>/level_<n>_trades`;
 * - a profession `<ns>:<path>` without `trade_sets`: lowering writes the trade sets
 *   (`defaultTradeSets`), drawing two trades from the tags `#<ns>:<path>/level_<n>`, which
 *   project tag elements of the same id add to; the editor writes only those tags;
 * - a trade: `<ns>:<path>/level_<n>/<price>_<product>` (`_2`, `_3`, … when taken).
 *
 * No React, no session.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type { ChangeItem } from '../../changeset/changeset';
import { asObject } from '../blocks-items/blocks-items-model';

type JsonObject = { [key: string]: Json };

/** Kind ids of ADR 0060's trade data. */
export const VILLAGER_TRADE_KIND = 'minecraft:villager_trade';
export const TRADE_SET_KIND = 'minecraft:trade_set';
export const VILLAGER_TRADE_TAG_KIND = 'minecraft:tag/villager_trade';
/** The trader component (ADR 0098 D1). */
export const TRADER_COMPONENT = 'msm:trader';
/** The most trading levels a trader or profession has. */
export const MAX_TRADE_LEVELS = 5;
/** The currency vanilla traders take. */
export const EMERALD = 'minecraft:emerald';
/** How much demand changes the price of a new trade, as vanilla's common trades. */
export const NEW_TRADE_REPUTATION_DISCOUNT = 0.05;

/** Vanilla's names of the five trading levels. */
export const TRADE_LEVEL_LABELS: readonly string[] = Object.freeze([
  'Novice (level 1)',
  'Apprentice (level 2)',
  'Journeyman (level 3)',
  'Expert (level 4)',
  'Master (level 5)',
]);

/** An item and how many, as the editor shows a price or a product. */
export interface TradeStack {
  item: string;
  count: number;
}

/** One trade in the editor's words: price, optional second price, product, uses and XP. */
export interface TradeDraft {
  price: TradeStack;
  /** The second price; absent means none. */
  second?: TradeStack | undefined;
  product: TradeStack;
  /** Uses before the trader restocks (`max_uses`). */
  uses: number;
  /** Trading experience each use gives the trader (`xp`). */
  xp: number;
}

/** A new trade: one emerald for one thing, 12 uses, 2 XP. */
export function newTradeDraft(): TradeDraft {
  return { price: { item: EMERALD, count: 1 }, product: { item: '', count: 1 }, uses: 12, xp: 2 };
}

/** Where one trading level's data lives. */
export interface TradeLevelLayout {
  /** The level, 1 to 5. */
  level: number;
  /** The villager trade tag listing the level's trades (also the base of the trade ids). */
  tagId: string;
  /** The trade set drawing from the tag (traders only); absent when lowering writes it. */
  setId?: string;
}

/** `<ns>` and `<path>` of an id. */
function split(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** The layout of level `level` of a trader mob `mobId`. */
export function traderLevelLayout(mobId: string, level: number): TradeLevelLayout {
  return {
    level,
    tagId: `${mobId}/level_${level}_trades`,
    setId: `${mobId}/level_${level}`,
  };
}

/** The layout of level `level` of a profession `professionId` using its own trade sets. */
export function professionLevelLayout(professionId: string, level: number): TradeLevelLayout {
  return { level, tagId: `${professionId}/level_${level}` };
}

/** Every element id of the project. */
function idsOf(project: Project): Set<string> {
  return new Set(project.namespaces.flatMap((namespace) => namespace.elements.map((e) => e.id)));
}

/** The element `id` of the project, or `undefined`. */
export function elementOf(project: Project, id: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((entry) => entry.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `id` when free, else `id_2`, `id_3`, … */
function freeId(id: string, taken: ReadonlySet<string>): string {
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The last path segment of an item id, for a trade id. */
function itemWord(id: string): string {
  const path = split(id).path;
  return path.slice(path.lastIndexOf('/') + 1).replace(/[^a-z0-9_.-]/g, '_') || 'item';
}

/** `minecraft:` added to an item id without a namespace. */
export function itemIdOf(text: string): string {
  const trimmed = text.trim();
  return trimmed === '' || trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

/** A whole number from `value`, else `fallback`. */
function whole(value: Json | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function stackOf(value: Json | undefined, fallbackItem: string): TradeStack {
  const object = asObject(value);
  return {
    item: typeof object.id === 'string' ? object.id : fallbackItem,
    count: whole(object.count, 1),
  };
}

/** The editor's view of `minecraft:villager_trade` data. Number providers read as defaults. */
export function tradeDraftOf(data: Json | undefined): TradeDraft {
  const object = asObject(data);
  const draft: TradeDraft = {
    price: stackOf(object.wants, EMERALD),
    product: stackOf(object.gives, ''),
    uses: whole(object.max_uses, 4),
    xp: whole(object.xp, 1),
  };
  if (object.additional_wants !== undefined) {
    draft.second = stackOf(object.additional_wants, EMERALD);
  }
  return draft;
}

/** A stack written over an existing one (keeping its other fields, such as components). */
function stackData(stack: TradeStack, before: Json | undefined): JsonObject {
  return { ...asObject(before), id: itemIdOf(stack.item), count: Math.max(1, stack.count) };
}

/**
 * `minecraft:villager_trade` data for `draft`, over `before` (so fields the editor does not show,
 * such as `merchant_predicate`, are kept). A new trade gets vanilla's common price change by
 * demand (`reputation_discount` 0.05).
 */
export function tradeData(draft: TradeDraft, before?: Json): JsonObject {
  const old = asObject(before);
  const out: JsonObject = {
    ...old,
    wants: stackData(draft.price, old.wants),
    gives: stackData(draft.product, old.gives),
    max_uses: Math.max(1, draft.uses),
    xp: Math.max(0, draft.xp),
  };
  if (draft.second === undefined || itemIdOf(draft.second.item) === '') {
    delete out.additional_wants;
  } else {
    out.additional_wants = stackData(draft.second, old.additional_wants);
  }
  if (before === undefined) out.reputation_discount = NEW_TRADE_REPUTATION_DISCOUNT;
  return out;
}

/** Why `draft` cannot be saved yet, in plain words; `undefined` when it can. */
export function tradeDraftProblem(draft: TradeDraft): string | undefined {
  if (itemIdOf(draft.price.item) === '') return 'Pick what the trade costs.';
  if (itemIdOf(draft.product.item) === '') return 'Pick what the trade gives.';
  if (draft.second !== undefined && draft.second.item.trim() !== '' && draft.second.count < 1) {
    return 'The second price needs at least one item.';
  }
  if (draft.price.count < 1 || draft.product.count < 1) return 'Counts start at 1.';
  if (draft.uses < 1) return 'A trade can be used at least once before restocking.';
  if (draft.xp < 0) return 'Trading XP cannot be below 0.';
  return undefined;
}

/** The entries of a villager trade tag element's `values` (ids, `#tags` and `{ id }` objects). */
function tagValues(data: Json | undefined): Json[] {
  const values = asObject(data).values;
  return Array.isArray(values) ? values : [];
}

function valueId(value: Json): string | undefined {
  if (typeof value === 'string') return value;
  const id = asObject(value).id;
  return typeof id === 'string' ? id : undefined;
}

/** The trade ids a level's tag lists (not `#tags`), in order. */
export function levelTradeIds(project: Project, layout: TradeLevelLayout): string[] {
  const tag = elementOf(project, layout.tagId);
  if (tag === undefined || tag.kind !== VILLAGER_TRADE_TAG_KIND) return [];
  return tagValues(tag.data)
    .map(valueId)
    .filter((id): id is string => id !== undefined && !id.startsWith('#'));
}

/** One row of a level's trade list. */
export interface TradeRow {
  id: string;
  /** The project's trade element, when the trade is the project's. */
  element?: Element;
  /** The trade in the editor's words (defaults for a trade that is not the project's). */
  draft: TradeDraft;
}

/** The trades of a level: the tag's trade ids with the project's trade elements. */
export function levelTrades(project: Project, layout: TradeLevelLayout): TradeRow[] {
  return levelTradeIds(project, layout).map((id) => {
    const element = elementOf(project, id);
    const own = element !== undefined && element.kind === VILLAGER_TRADE_KIND;
    return own
      ? { id, element, draft: tradeDraftOf(element.data) }
      : { id, draft: newTradeDraft() };
  });
}

/** The amount a trader's own trade set draws: every trade, at least one. */
export function drawAmount(trades: number): number {
  return Math.max(1, trades);
}

let itemCounter = 0;
const itemId = (what: string) => `trade-${what}-${++itemCounter}`;

function createItem(id: string, kind: string, data: Json): ChangeItem {
  return {
    itemId: itemId('create'),
    op: 'create',
    elementId: id as ResourceLocation,
    kind,
    after: data,
    accepted: true,
    problems: [],
  };
}

function updateItem(element: Element, after: Json): ChangeItem {
  return {
    itemId: itemId('update'),
    op: 'update',
    elementId: element.id,
    kind: element.kind,
    before: element.data,
    after,
    accepted: true,
    problems: [],
  };
}

function deleteItem(element: Element): ChangeItem {
  return {
    itemId: itemId('delete'),
    op: 'delete',
    elementId: element.id,
    kind: element.kind,
    before: element.data,
    accepted: true,
    problems: [],
  };
}

/** A tag's data with `values` replaced. */
function withValues(data: Json | undefined, values: Json[]): JsonObject {
  return { ...asObject(data), values };
}

/** The trade set data of a trader level drawing `count` trades from its tag. */
export function ownTradeSetData(layout: TradeLevelLayout, count: number): JsonObject {
  return { trades: `#${layout.tagId}`, amount: drawAmount(count) };
}

/**
 * The items making sure the level's tag and (for a trader) trade set exist: a missing tag is
 * created empty, a missing trade set drawing from it. Existing elements are left alone.
 */
export function ensureLevelItems(project: Project, layout: TradeLevelLayout): ChangeItem[] {
  const items: ChangeItem[] = [];
  if (elementOf(project, layout.tagId) === undefined) {
    items.push(createItem(layout.tagId, VILLAGER_TRADE_TAG_KIND, { values: [] }));
  }
  if (layout.setId !== undefined && elementOf(project, layout.setId) === undefined) {
    const count = levelTradeIds(project, layout).length;
    items.push(createItem(layout.setId, TRADE_SET_KIND, ownTradeSetData(layout, count)));
  }
  return items;
}

/**
 * The trade set item after the level's trade count goes from `before` to `after`: its `amount`
 * follows the count while it drew every trade; a set drawing fewer is left alone.
 */
function setAmountItems(
  project: Project,
  layout: TradeLevelLayout,
  before: number,
  after: number,
): ChangeItem[] {
  if (layout.setId === undefined) return [];
  const set = elementOf(project, layout.setId);
  if (set === undefined || set.kind !== TRADE_SET_KIND) return [];
  const data = asObject(set.data);
  if (data.amount !== drawAmount(before) || drawAmount(after) === drawAmount(before)) return [];
  return [updateItem(set, { ...data, amount: drawAmount(after) })];
}

/**
 * "Add the trade": the new trade element, the level's tag listing it (created when missing) and,
 * for a trader, its trade set (created, or its `amount` raised). One undo step.
 */
export function addTradeChange(
  project: Project,
  layout: TradeLevelLayout,
  draft: TradeDraft,
): { items: ChangeItem[]; tradeId: string } {
  const taken = idsOf(project);
  const pair = `${itemWord(itemIdOf(draft.price.item))}_${itemWord(itemIdOf(draft.product.item))}`;
  const { namespace, path } = split(layout.tagId);
  const base = layout.setId === undefined ? `${namespace}:${path}` : layout.setId;
  const tradeId = freeId(`${base}/${pair}`, taken);
  const items: ChangeItem[] = [createItem(tradeId, VILLAGER_TRADE_KIND, tradeData(draft))];
  const before = levelTradeIds(project, layout).length;
  const tag = elementOf(project, layout.tagId);
  if (tag === undefined) {
    items.push(createItem(layout.tagId, VILLAGER_TRADE_TAG_KIND, { values: [tradeId] }));
  } else {
    items.push(updateItem(tag, withValues(tag.data, [...tagValues(tag.data), tradeId])));
  }
  if (layout.setId !== undefined) {
    if (elementOf(project, layout.setId) === undefined) {
      items.push(createItem(layout.setId, TRADE_SET_KIND, ownTradeSetData(layout, before + 1)));
    } else {
      items.push(...setAmountItems(project, layout, before, before + 1));
    }
  }
  return { items, tradeId };
}

/** "Save the trade": the trade element updated over its data. */
export function updateTradeChange(
  project: Project,
  tradeId: string,
  draft: TradeDraft,
): ChangeItem[] {
  const trade = elementOf(project, tradeId);
  if (trade === undefined || trade.kind !== VILLAGER_TRADE_KIND) return [];
  return [updateItem(trade, tradeData(draft, trade.data))];
}

/**
 * "Remove": the trade out of the level's tag, the trade element deleted when no other tag of the
 * project lists it, and a trader's trade set `amount` lowered. One undo step.
 */
export function removeTradeChange(
  project: Project,
  layout: TradeLevelLayout,
  tradeId: string,
): ChangeItem[] {
  const tag = elementOf(project, layout.tagId);
  if (tag === undefined) return [];
  const before = levelTradeIds(project, layout).length;
  const values = tagValues(tag.data).filter((value) => valueId(value) !== tradeId);
  const items: ChangeItem[] = [updateItem(tag, withValues(tag.data, values))];
  const trade = elementOf(project, tradeId);
  const listedElsewhere = project.namespaces.some((namespace) =>
    namespace.elements.some(
      (entry) =>
        entry.id !== tag.id &&
        entry.kind === VILLAGER_TRADE_TAG_KIND &&
        tagValues(entry.data).some((value) => valueId(value) === tradeId),
    ),
  );
  if (trade !== undefined && trade.kind === VILLAGER_TRADE_KIND && !listedElsewhere) {
    items.push(deleteItem(trade));
  }
  items.push(...setAmountItems(project, layout, before, before - 1));
  return items;
}

// Traders -------------------------------------------------------------------------------------

/** The trader component of mob data, or `undefined` when the mob does not trade. */
export function traderOf(data: Json | undefined): JsonObject | undefined {
  const component = asObject(asObject(data).components)[TRADER_COMPONENT];
  return component === undefined ? undefined : asObject(component);
}

/** The trader's levels (`trade_sets`), as objects. */
export function traderLevelsOf(data: Json | undefined): JsonObject[] {
  const sets = traderOf(data)?.trade_sets;
  return Array.isArray(sets) ? sets.map(asObject) : [];
}

/** The trade set of a trader level entry. */
export function levelSetOf(entry: JsonObject | undefined): string {
  return typeof entry?.trade_set === 'string' ? entry.trade_set : '';
}

/** Mob data with the trader component set to `trader` (absent removes it). */
export function withTrader(data: Json | undefined, trader: JsonObject | undefined): JsonObject {
  const object = asObject(data);
  const components = { ...asObject(object.components) };
  if (trader === undefined) delete components[TRADER_COMPONENT];
  else components[TRADER_COMPONENT] = trader;
  return { ...object, components };
}

/**
 * "Trades with players" switched on: the trader component with `remembered` (the value last
 * switched off) or one level of the mob's own trades, plus that level's tag and trade set when
 * missing. One undo step.
 */
export function traderOnChange(
  project: Project,
  mob: Element,
  remembered?: JsonObject,
): ChangeItem[] {
  const trader = remembered ?? {
    trade_sets: [{ trade_set: traderLevelLayout(mob.id, 1).setId as string }],
  };
  const items: ChangeItem[] = [updateItem(mob, withTrader(mob.data, trader))];
  const sets = Array.isArray(trader.trade_sets) ? trader.trade_sets.map(asObject) : [];
  sets.forEach((entry, index) => {
    const layout = traderLevelLayout(mob.id, index + 1);
    if (levelSetOf(entry) === layout.setId) items.push(...ensureLevelItems(project, layout));
  });
  return items;
}

/**
 * A different number of levels: the levels past `count` are dropped (their trade data stays in
 * the project), and new levels use the mob's own trades, created when missing. One undo step.
 */
export function levelCountChange(project: Project, mob: Element, count: number): ChangeItem[] {
  const trader = traderOf(mob.data);
  if (trader === undefined) return [];
  const wanted = Math.min(MAX_TRADE_LEVELS, Math.max(1, Math.round(count)));
  const levels = traderLevelsOf(mob.data);
  if (wanted === levels.length) return [];
  const next = levels.slice(0, wanted);
  const items: ChangeItem[] = [];
  for (let level = next.length + 1; level <= wanted; level++) {
    const layout = traderLevelLayout(mob.id, level);
    next.push({ trade_set: layout.setId as string });
    items.push(...ensureLevelItems(project, layout));
  }
  return [updateItem(mob, withTrader(mob.data, { ...trader, trade_sets: next })), ...items];
}

/**
 * Level `level` switched to the mob's own trades (`setId` undefined) or to another trade set
 * (a villager's): the level entry's `trade_set`, keeping `xp_to_next`, plus the own level's data
 * when it is missing. One undo step.
 */
export function levelSourceChange(
  project: Project,
  mob: Element,
  level: number,
  setId: string | undefined,
): ChangeItem[] {
  const trader = traderOf(mob.data);
  const levels = traderLevelsOf(mob.data);
  if (trader === undefined || level < 1 || level > levels.length) return [];
  const layout = traderLevelLayout(mob.id, level);
  const target = setId ?? (layout.setId as string);
  const next = levels.map((entry, index) =>
    index === level - 1 ? { ...entry, trade_set: target } : entry,
  );
  return [
    updateItem(mob, withTrader(mob.data, { ...trader, trade_sets: next })),
    ...(setId === undefined ? ensureLevelItems(project, layout) : []),
  ];
}

/** Whether a trader level uses the mob's own trades (its trade set is the mob's own). */
export function isOwnLevel(mobId: string, level: number, entry: JsonObject | undefined): boolean {
  return levelSetOf(entry) === traderLevelLayout(mobId, level).setId;
}

/** Plain words for a vanilla trade set id (`minecraft:mason/level_3` → "Mason, level 3"). */
export function tradeSetWords(id: string): string {
  const { path } = split(id);
  const [who = path, what = ''] = path.split('/');
  const name = who.replaceAll('_', ' ');
  const level = /^level_(\d)$/.exec(what);
  const tail = level === null ? what.replaceAll('_', ' ') : `level ${level[1]}`;
  const head = name.charAt(0).toUpperCase() + name.slice(1);
  return tail === '' ? head : `${head}, ${tail}`;
}
