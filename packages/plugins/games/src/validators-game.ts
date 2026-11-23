/**
 * `games.*` project validators of `msm:game` (ADR 0132 D1, D2, D6): unknown references, more
 * roles than players, a round with no way to end (`games.game.never-ends`), more than one game
 * (`games.too-many-games`) and each mechanic's own checks (`validators-mechanics/`). B721 stub,
 * filled by B724; listed by `validators.ts` once `GAME_KIND_LISTED` is `true`.
 */
import type { Element, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { gameKind } from './kinds/game';
import type { MechanicType } from './lowering/game/mechanics/index';
import { dataOf, isRecord } from './lowering/shared-functions';
import { MECHANIC_CHECKS } from './validators-mechanics/index';

/** The mechanics of one game with their pointers. */
function mechanicsOf(game: Element): { mechanic: JsonObject; path: string }[] {
  const list = dataOf(game.data).mechanics;
  if (!Array.isArray(list)) return [];
  return list.flatMap((mechanic, index) =>
    isRecord(mechanic) ? [{ mechanic, path: `/mechanics/${index}` }] : [],
  );
}

/** The game validator; until B724 it only runs the mechanics' checks, which find nothing. */
export const gameValidator: ProjectValidator = {
  id: 'msm.games.game',
  kinds: [gameKind.id],
  validate: (input) => {
    const problems: Problem[] = [];
    for (const game of input.elements) {
      if (game.kind !== gameKind.id) continue;
      for (const { mechanic, path } of mechanicsOf(game)) {
        const type = mechanic.type;
        if (typeof type !== 'string' || !Object.hasOwn(MECHANIC_CHECKS, type)) continue;
        const check = MECHANIC_CHECKS[type as MechanicType];
        problems.push(...check(mechanic, { game, path, input }));
      }
    }
    return problems;
  },
};
