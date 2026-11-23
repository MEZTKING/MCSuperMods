/**
 * Lowering of `msm:game` (ADR 0132 D1, D2): the round engine every game type shares (`round.ts`,
 * `lobby.ts`, `roles.ts`) and the game's mechanics (`mechanics/`), as functions under
 * `<ns>:msm_games/game/`. B721 stub: a game lowers to nothing until B724 (the round engine)
 * and B725 and B726 (the mechanics) fill it.
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';
import { dataOf, isRecord, splitId } from '../shared-functions';
import { lobbyFiles } from './lobby';
import { lowerMechanic } from './mechanics/index';
import { rolesFiles } from './roles';
import { roundFiles } from './round';

/** Lowers one game: its round, lobby, roles and every mechanic, in that order. */
export function lowerGame(element: Element, target: TargetFacts): OutputFile[] {
  const data = dataOf(element.data);
  const { namespace } = splitId(element.id);
  const context = { element, namespace, target };
  const mechanics = Array.isArray(data.mechanics) ? data.mechanics.filter(isRecord) : [];
  return [
    ...roundFiles(context),
    ...lobbyFiles(context),
    ...rolesFiles(context),
    ...mechanics.flatMap((mechanic) => lowerMechanic(mechanic, context)),
  ];
}
