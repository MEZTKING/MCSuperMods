/**
 * The checks of the `hearts` mechanic of `msm:game` (ADR 0132 D2; B725). The fields B722 left to
 * the validators (withdraw needs the Heart item; kept out needs a time, starting again a number of
 * hearts) are the game validator's (`../validators-game.ts`, B724). Codes:
 *
 * - `games.hearts.most-below-start` (error): fewer most hearts than starting hearts.
 * - `games.hearts.above-most` (warning): a fresh start or a revive with more hearts than the most;
 *   the player gets the most.
 * - `games.hearts.out-for-good` (warning): an endless game whose players watch as spectators
 *   "until the next round" at zero: there is no next round, so they are out for good.
 * - `games.hearts.recipe` (error): a Heart or revive recipe the game would refuse to load: rows of
 *   different widths, a character with no item, or an item character the pattern does not use.
 * - `games.hearts.same-item` (warning): the Heart and the revive item are made from the same
 *   vanilla item with the same name, so players cannot tell them apart.
 */
import type { Json, JsonObject, Problem } from '@msm/plugin-api';
import { readHearts } from '../lowering/game/mechanics/hearts';
import { dataOf, isRecord } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the hearts check reports. */
export const HEARTS_PROBLEM_CODES = Object.freeze([
  'games.hearts.most-below-start',
  'games.hearts.above-most',
  'games.hearts.out-for-good',
  'games.hearts.recipe',
  'games.hearts.same-item',
] as const);

type HeartsCode = (typeof HEARTS_PROBLEM_CODES)[number];

/** What is wrong with a shaped recipe's pattern and key, in plain words; empty when nothing. */
export function shapedRecipeFaults(recipe: Json | undefined): string[] {
  if (!isRecord(recipe)) return [];
  const pattern = Array.isArray(recipe.pattern)
    ? recipe.pattern.filter((row): row is string => typeof row === 'string')
    : [];
  const key = isRecord(recipe.key) ? recipe.key : {};
  const faults: string[] = [];
  if (pattern.length > 0 && new Set(pattern.map((row) => row.length)).size > 1) {
    faults.push('every row of the pattern must be as long as the others');
  }
  const used = new Set(pattern.join('').replaceAll(' ', ''));
  for (const character of used) {
    if (!Object.hasOwn(key, character)) faults.push(`"${character}" in the pattern has no item`);
  }
  for (const character of Object.keys(key)) {
    if (character.length !== 1 || character === ' ') {
      faults.push(`"${character}" is not one character other than a space`);
    } else if (!used.has(character)) {
      faults.push(`"${character}" has an item but is not in the pattern`);
    }
  }
  return faults;
}

/** Checks one `hearts` mechanic. */
export const checkHearts: MechanicCheck = (mechanic: JsonObject, { game, path }): Problem[] => {
  const problems: Problem[] = [];
  const report = (
    severity: Problem['severity'],
    code: HeartsCode,
    at: string,
    message: string,
  ): void => {
    problems.push({ severity, code, elementId: game.id, path: `${path}${at}`, message });
  };
  const settings = readHearts(mechanic);
  if (typeof mechanic.start === 'number' && typeof mechanic.most === 'number') {
    if (mechanic.most < mechanic.start) {
      report(
        'error',
        'games.hearts.most-below-start',
        '/most',
        `Players start with ${mechanic.start} hearts but can have at most ${mechanic.most}. Raise the most hearts or lower the starting hearts.`,
      );
    }
  }
  if (
    mechanic.at_zero === 'start_again' &&
    typeof mechanic.start_again_hearts === 'number' &&
    mechanic.start_again_hearts > settings.most
  ) {
    report(
      'warning',
      'games.hearts.above-most',
      '/start_again_hearts',
      `A fresh start gives ${mechanic.start_again_hearts} hearts, more than the most (${settings.most}); players get ${settings.most}.`,
    );
  }
  const revive = isRecord(mechanic.revive) ? mechanic.revive : undefined;
  if (typeof revive?.hearts === 'number' && revive.hearts > settings.most) {
    report(
      'warning',
      'games.hearts.above-most',
      '/revive/hearts',
      `The revive item gives ${revive.hearts} hearts, more than the most (${settings.most}); players get ${settings.most}.`,
    );
  }
  const round = dataOf(dataOf(game.data).round ?? null);
  if (settings.atZero === 'spectate' && round.kind === 'endless') {
    report(
      'warning',
      'games.hearts.out-for-good',
      '/at_zero',
      'This game never ends, so a player with no hearts left watches for good. Keep them out for a time or let them start again, or give the game rounds.',
    );
  }
  const items: [string, Json | undefined][] = [
    ['/heart_item', mechanic.heart_item],
    ['/revive/item', revive?.item],
  ];
  for (const [at, item] of items) {
    if (!isRecord(item)) continue;
    const faults = shapedRecipeFaults(item.recipe);
    if (faults.length > 0) {
      report(
        'error',
        'games.hearts.recipe',
        `${at}/recipe`,
        `The recipe would not load in the game: ${faults.join('; ')}.`,
      );
    }
  }
  const heart = settings.heartItem;
  const reviveItem = settings.revive?.item;
  if (
    heart !== undefined &&
    reviveItem !== undefined &&
    heart.item === reviveItem.item &&
    heart.name === reviveItem.name &&
    heart.model === reviveItem.model
  ) {
    report(
      'warning',
      'games.hearts.same-item',
      '/revive/item',
      'The Heart and the revive item look the same. Give the revive item another name or look.',
    );
  }
  return problems;
};
