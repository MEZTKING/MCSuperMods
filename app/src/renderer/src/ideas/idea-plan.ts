/**
 * What each **More ideas** card is (ADR 0129 D3): card *n* of a base seed has its seed
 * (`ideaSeed`, unchanged), a lead group, a lead flow in that group and a theme. Pure and cheap:
 * the same base and *n* give the same card, without walking the cards before it.
 *
 * Groups and themes are dealt like cards from a deck: each run of as many cards as there are
 * groups (or themes) holds each one once, in an order shuffled from the base seed, so no group
 * dominates. Where two runs meet, the start of the later run is mended so that any
 * {@link GROUP_WINDOW} cards in a row have different groups and any {@link THEME_WINDOW} cards
 * in a row different themes; neighbouring cards therefore never share a lead flow or a theme,
 * and as names are made from the theme word, never a name either.
 *
 * @packageDocumentation
 */

import type { LeadGroup, LeadRecipe } from '../surprise/leads';
import { SURPRISE_THEMES } from '../surprise/themes';
import { ideaSeed } from './idea-seeds';

/** Cards in a row that never share a lead group (so never a lead flow). */
export const GROUP_WINDOW = 5;
/** Cards in a row that never share a theme. */
export const THEME_WINDOW = 4;

/** One card's plan. */
export interface IdeaSpec {
  /** Surprise me's seed of the card. */
  readonly seed: number;
  /** The lead flow's id. */
  readonly lead: string;
  readonly group: LeadGroup;
  /** The theme's id. */
  readonly themeId: string;
}

/** A 32-bit mix of the numbers (the same everywhere). */
function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x01000193) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
  }
  return h >>> 0;
}

/** A shuffled order of `0..size-1` for run `run` (Fisher-Yates on a mixed seed). */
function shuffled(size: number, base: number, salt: number, run: number): number[] {
  const order = Array.from({ length: size }, (_, index) => index);
  for (let at = size - 1; at > 0; at -= 1) {
    const other = mix(base, salt, run, at) % (at + 1);
    [order[at], order[other]] = [order[other] as number, order[at] as number];
  }
  return order;
}

/**
 * The run `run` of a deck of `size`, mended against the run before it: its first `window - 1`
 * places never hold what the previous run's last `window - 1` places hold, so any `window`
 * cards in a row differ. Only the middle of a run is swapped into, never its last places, so a
 * run's tail is its shuffled tail and each run needs only the one before it.
 */
function run(size: number, window: number, base: number, salt: number, at: number): number[] {
  const order = shuffled(size, base, salt, at);
  const span = Math.min(window - 1, Math.floor((size - 1) / 3));
  if (at === 0 || span <= 0) return order;
  const before = shuffled(size, base, salt, at - 1);
  const tail = new Set(before.slice(size - span));
  for (let place = 0; place < span; place += 1) {
    if (!tail.has(order[place] as number)) continue;
    for (let middle = span; middle < size - span; middle += 1) {
      if (tail.has(order[middle] as number)) continue;
      [order[place], order[middle]] = [order[middle] as number, order[place] as number];
      break;
    }
  }
  return order;
}

/** The entry of a deck of `size` dealt at card `index`. */
export function dealt(
  size: number,
  window: number,
  base: number,
  salt: number,
  index: number,
): number {
  if (size <= 1) return 0;
  const at = Math.floor(index / size);
  return run(size, window, base, salt, at)[index % size] as number;
}

const GROUP_SALT = 0x6a09e667;
const THEME_SALT = 0x3c6ef372;
const FLOW_SALT = 0x510e527f;

/** The lead groups present in `leads`, each with its flows. */
export function leadGroups(leads: readonly LeadRecipe[]): [LeadGroup, LeadRecipe[]][] {
  const groups = new Map<LeadGroup, LeadRecipe[]>();
  for (const recipe of leads) {
    const list = groups.get(recipe.group) ?? [];
    list.push(recipe);
    groups.set(recipe.group, list);
  }
  return [...groups.entries()];
}

/** Plans a planner keeps, so a card asked for again gets the same object. */
const KEPT_PLANS = 1000;

/**
 * The planner of a list of cards over the usable `leads`: card `index` of `base`. Groups are
 * dealt evenly; a flow within its group by its weight, from the card's seed. The same card asked
 * for again is the same object (the last {@link KEPT_PLANS} are kept), so a view can key on it.
 */
export function ideaPlanner(
  leads: readonly LeadRecipe[],
): (base: number, index: number) => IdeaSpec | null {
  const groups = leadGroups(leads);
  const kept = new Map<string, IdeaSpec | null>();
  return (base, index) => {
    const key = `${base}:${index}`;
    if (kept.has(key)) return kept.get(key) ?? null;
    const spec = plan(base, index);
    kept.set(key, spec);
    if (kept.size > KEPT_PLANS) {
      const oldest = kept.keys().next().value;
      if (oldest !== undefined) kept.delete(oldest);
    }
    return spec;
  };

  function plan(base: number, index: number): IdeaSpec | null {
    const seed = ideaSeed(base, index);
    if (groups.length === 0) return null;
    const [group, flows] = groups[dealt(groups.length, GROUP_WINDOW, base, GROUP_SALT, index)] as [
      LeadGroup,
      LeadRecipe[],
    ];
    const total = flows.reduce((sum, recipe) => sum + (recipe.weight ?? 1), 0);
    let left = (mix(seed, FLOW_SALT) / 4_294_967_296) * total;
    let lead = flows[flows.length - 1] as LeadRecipe;
    for (const recipe of flows) {
      left -= recipe.weight ?? 1;
      if (left < 0) {
        lead = recipe;
        break;
      }
    }
    const theme = SURPRISE_THEMES[
      dealt(SURPRISE_THEMES.length, THEME_WINDOW, base, THEME_SALT, index)
    ] as (typeof SURPRISE_THEMES)[number];
    return { seed, lead: lead.flowId, group, themeId: theme.id };
  }
}
