/**
 * The checks of the `shop` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.shop.unknown-team` (error): a team the project does not have.
 * - `games.shop.trader-team` (info): a trader serves every team (vanilla trading cannot ask for
 *   one); a menu sells only to its team.
 * - `games.shop.same-place` (warning): two shops at one place; a hit opens either.
 * - `games.shop.no-offers` (warning): a shop whose offers all lack a cost or an item bought; it
 *   is not made.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readShops } from '../lowering/game/mechanics/shop';
import { isRecord } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the shop check reports. */
export const SHOP_PROBLEM_CODES = Object.freeze([
  'games.shop.unknown-team',
  'games.shop.trader-team',
  'games.shop.same-place',
  'games.shop.no-offers',
] as const);

type ShopCode = (typeof SHOP_PROBLEM_CODES)[number];

/** Checks one `shop` mechanic. */
export const checkShop: MechanicCheck = (
  mechanic: JsonObject,
  { game, path, input },
): Problem[] => {
  const problems: Problem[] = [];
  const report = (severity: Problem['severity'], code: ShopCode, at: string, message: string) => {
    problems.push({ severity, code, elementId: game.id, path: `${path}${at}`, message });
  };
  const teams = new Set<string>(
    input.elements.filter((one) => one.kind === 'msm:team').map((one) => one.id),
  );
  const list = Array.isArray(mechanic.shops) ? mechanic.shops : [];
  list.forEach((shop, i) => {
    if (!isRecord(shop) || typeof shop.team !== 'string') return;
    if (!teams.has(shop.team)) {
      report(
        'error',
        'games.shop.unknown-team',
        `/shops/${i}/team`,
        `The team ${JSON.stringify(shop.team)} is not one of your project's teams. Pick one, or make it first.`,
      );
    } else if (shop.way !== 'menu') {
      report(
        'info',
        'games.shop.trader-team',
        `/shops/${i}/team`,
        'A trader sells to every team; only a menu can sell to one team alone.',
      );
    }
  });
  const places = new Set<string>();
  readShops(mechanic).forEach((shop, i) => {
    const key = shop.at.join(' ');
    if (places.has(key)) {
      report(
        'warning',
        'games.shop.same-place',
        `/shops/${i}/at`,
        'Another shop stands here. Move one of them.',
      );
    }
    places.add(key);
    if (shop.offers.length === 0) {
      report(
        'warning',
        'games.shop.no-offers',
        `/shops/${i}/offers`,
        `${shop.name} has no offer with both a cost and an item to buy, so it is not set up.`,
      );
    }
  });
  return problems;
};
