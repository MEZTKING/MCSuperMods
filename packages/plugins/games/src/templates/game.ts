/**
 * "New element" templates of the Game and map Studio's kinds (ADR 0132 D1, D3): an empty game
 * and an empty kit, in the category "Games", each starting from its kind's default data. Each
 * is listed only once its kind is (`GAME_KIND_LISTED`, `KIT_KIND_LISTED`, B722), so the Add
 * dialog does not show them before the kinds have a schema. B721 made this file so that
 * `pieces.ts` never changes for them.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { GAME_KIND_LISTED, gameKind } from '../kinds/game';
import { KIT_KIND_LISTED, kitKind } from '../kinds/kit';

const CATEGORY = 'Games';

/** An empty game: its type, round and mechanics are chosen in the Game Studio. */
const emptyGame: ElementTemplate = {
  id: 'msm_games_game_empty',
  kind: gameKind.id,
  category: CATEGORY,
  title: 'Game',
  description:
    'A whole game in one place: how a round starts and is won, the lobby, the roles and what happens in it. Pick a game type in the Game and map Studio for a working one.',
  defaultName: 'game',
  data: (): Json => structuredClone(gameKind.defaultData ?? {}),
};

/** An empty kit. */
const emptyKit: ElementTemplate = {
  id: 'msm_games_kit_empty',
  kind: kitKind.id,
  category: CATEGORY,
  title: 'Kit',
  description:
    'Items, armour, the off hand and effects a player gets in one go, at the start of a round or when they come back.',
  defaultName: 'kit',
  data: (): Json => structuredClone(kitKind.defaultData ?? {}),
};

/** The Game and map Studio's templates that are listed today. */
export const gameTemplates: readonly ElementTemplate[] = Object.freeze([
  ...(GAME_KIND_LISTED ? [emptyGame] : []),
  ...(KIT_KIND_LISTED ? [emptyKit] : []),
]);
