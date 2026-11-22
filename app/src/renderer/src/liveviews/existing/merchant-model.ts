/**
 * The trader state the merchant screen shows, built from a project's lowered files without Try
 * it's world (B615; spike answer 2S14): the elements that make trades (trader mobs, villager
 * professions, trade sets, villager trades and their tags, and the language files) are lowered
 * by their own built-in kinds, then read by `@msm/sim`'s trader catalogue, as Try it reads them.
 *
 * - A trader mob (`msm:entity` with `msm:trader`) is its own trader.
 * - A villager profession trades its five levels (its `trade_sets`, else the five sets lowering
 *   makes for it).
 * - A trade set, a villager trade and a villager trade tag are shown as one trader of one level
 *   offering them (a made-up trade set of the preview's own namespace; never exported).
 *
 * Minecraft's own trades are not among the project's files: they are named in a line, not drawn.
 * Pure apart from lowering; nothing is written.
 *
 * @packageDocumentation
 */

import {
  type Element,
  ElementKindRegistry,
  lowerProjectAsync,
  type Project,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import type { JsonObject, TargetFacts } from '@msm/plugin-api';
import {
  Merchant,
  readProfessions,
  readTrade,
  readTraders,
  readTradeSet,
  type SimFiles,
  type TraderSpec,
  type TradeSetSpec,
  type TradeSpec,
} from '@msm/sim';
import { builtInPlugins } from '../../plugins/built-in';

/** The kinds whose elements the merchant reads. */
export const MERCHANT_KINDS = Object.freeze([
  'msm:entity',
  'msm:villager_profession',
  'minecraft:trade_set',
  'minecraft:villager_trade',
  'minecraft:tag/villager_trade',
] as const);

const LANG_KIND = 'minecraft:lang';

/** The namespace of the made-up trade set of a single trade or tag. */
export const PREVIEW_NAMESPACE = 'msm_live_view';

let registry: ElementKindRegistry | null = null;

/** The built-in kinds, registered once. */
function builtInRegistry(): ElementKindRegistry {
  if (registry !== null) return registry;
  const made = new ElementKindRegistry();
  for (const plugin of builtInPlugins) {
    for (const kind of plugin.contributes.elementKinds ?? []) made.register(kind);
  }
  registry = made;
  return made;
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether an `msm:entity`'s data has `msm:trader`. */
export function isTraderMob(data: unknown): boolean {
  return isRecord(data) && isRecord(data.components) && isRecord(data.components['msm:trader']);
}

/**
 * The project's trade files as Try it reads them: the trade-making elements and the language
 * files, lowered for `facts`.
 */
export async function merchantFiles(project: Project, facts: TargetFacts): Promise<SimFiles> {
  const keep = (element: Element) =>
    element.kind === LANG_KIND ||
    (element.kind === 'msm:entity'
      ? isTraderMob(element.data)
      : (MERCHANT_KINDS as readonly string[]).includes(element.kind));
  const sub: Project = {
    ...project,
    namespaces: project.namespaces.map((namespace) => ({
      ...namespace,
      elements: namespace.elements.filter(keep),
    })),
  };
  const lowered = await lowerProjectAsync(sub, builtInRegistry(), facts);
  const out = new Map<string, string | Uint8Array>();
  for (const file of lowered.files) {
    out.set(
      file.path,
      file.contents instanceof Uint8Array ? file.contents : stableStringify(file.contents),
    );
  }
  return out;
}

/** What the screen needs: the trader, and how to read its sets and trades. */
export interface MerchantSource {
  readonly trader: TraderSpec;
  readonly sets: (id: string) => TradeSetSpec | null;
  readonly trades: (id: string) => TradeSpec | null;
  /** Trade sets and trades the files do not hold (Minecraft's own), each once. */
  readonly unreadable: readonly string[];
}

const split = (id: string): { namespace: string; path: string } => {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

function madeUpTrader(
  id: string,
  displayName: string,
  levels: readonly string[],
  usesLevels: boolean,
): TraderSpec {
  return Object.freeze({
    id,
    displayName,
    levels: Object.freeze(levels.map((tradeSet) => Object.freeze({ tradeSet }))),
    usesLevels,
    restock: 'twice_a_day' as const,
    demand: true,
    monster: false,
    storage: false,
    shoulder: false,
    origin: Object.freeze({ elementId: id }),
  });
}

/**
 * The trader the element shows over `files` (from {@link merchantFiles}), or `null` when it makes
 * none (a mob without `msm:trader`).
 */
export function merchantSource(
  element: Pick<Element, 'id' | 'kind' | 'data'>,
  files: SimFiles,
  facts: TargetFacts,
  displayName: string,
): MerchantSource | null {
  let all: Map<string, string | Uint8Array> | null = null;
  let trader: TraderSpec | undefined;
  if (element.kind === 'msm:entity') {
    trader = readTraders(files, facts).get(element.id);
  } else if (element.kind === 'msm:villager_profession') {
    const own = isRecord(element.data) ? element.data.trade_sets : undefined;
    const sets = Array.isArray(own)
      ? own.filter((entry): entry is string => typeof entry === 'string')
      : [1, 2, 3, 4, 5].map((level) => `${element.id}/level_${level}`);
    const name = readProfessions(files, facts).get(element.id)?.displayName ?? displayName;
    trader = madeUpTrader(element.id, name, sets, true);
  } else if (element.kind === 'minecraft:trade_set') {
    trader = madeUpTrader(element.id, displayName, [element.id], false);
  } else if (
    element.kind === 'minecraft:villager_trade' ||
    element.kind === 'minecraft:tag/villager_trade'
  ) {
    const { path } = split(element.id);
    const setId = `${PREVIEW_NAMESPACE}:${split(element.id).namespace}/${path}`;
    const setPath = `data/${PREVIEW_NAMESPACE}/${facts.folders.data.trade_set}/${split(setId).path}.json`;
    const trades = element.kind === 'minecraft:villager_trade' ? element.id : `#${element.id}`;
    all = new Map(files);
    all.set(setPath, JSON.stringify({ trades }));
    trader = madeUpTrader(element.id, displayName, [setId], false);
  }
  if (trader === undefined) return null;
  const read: SimFiles = all ?? files;
  const setCache = new Map<string, TradeSetSpec | null>();
  const tradeCache = new Map<string, TradeSpec | null>();
  const sets = (id: string) => {
    if (!setCache.has(id)) setCache.set(id, readTradeSet(read, facts, id));
    return setCache.get(id) ?? null;
  };
  const trades = (id: string) => {
    if (!tradeCache.has(id)) tradeCache.set(id, readTrade(read, facts, id));
    return tradeCache.get(id) ?? null;
  };
  const unreadable = new Set<string>();
  for (const level of trader.levels) {
    const set = sets(level.tradeSet);
    if (set === null) unreadable.add(level.tradeSet);
    else for (const entry of set.unreadable) unreadable.add(entry);
  }
  return { trader, sets, trades, unreadable: [...unreadable] };
}

/** A fresh merchant of `source` at `seed` (level 1's offers drawn). */
export function newMerchant(source: MerchantSource, seed: number): Merchant {
  return new Merchant(0, source.trader, source.sets, source.trades, seed);
}

/** The id of a made-up trader, for tests. */
export function previewSetId(id: ResourceLocation | string): string {
  const { namespace, path } = split(id);
  return `${PREVIEW_NAMESPACE}:${namespace}/${path}`;
}
