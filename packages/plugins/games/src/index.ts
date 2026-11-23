/**
 * `@msm/plugin-games`: built-in MSM plugin (ADR 0113): the six games kinds.
 */
import { definePlugin } from '@msm/plugin-api';
import { gamesKinds } from './kinds/index';
import { piecesTemplates } from './templates/pieces';
import { worldSetupTemplates } from './templates/world-setup';
import { gamesValidators } from './validators';
import { piecesValidators } from './validators-pieces';
import { worldSetupValidators } from './validators-world-setup';

export {
  areaKind,
  GAME_KIND_LISTED,
  GAMES_KIND_IDS,
  type GamesKindId,
  gameKind,
  gamesKinds,
  KIT_KIND_LISTED,
  kitKind,
  objectiveKind,
  oneBlockKind,
  teamKind,
  timerKind,
  worldSetupKind,
} from './kinds/index';
export { GAMES_CHECKER_CATEGORIES, gamesGeneratedIds } from './lowering/generated-ids';
export {
  type GameLoweringContext,
  lowerGame,
  lowerKit,
  lowerMechanic,
  MECHANIC_LOWERINGS,
  MECHANIC_TYPES,
  type MechanicLowering,
  type MechanicType,
} from './lowering/index';
export {
  lowerWorldSetup,
  worldSetupGeneratedIds,
  worldSetupLoadFunction,
} from './lowering/world-setup';
export { piecesTemplates } from './templates/pieces';
export { worldSetupTemplates } from './templates/world-setup';
export { gamesValidators } from './validators';
export { gameValidator } from './validators-game';
export { kitValidator } from './validators-kit';
export {
  MECHANIC_CHECKS,
  type MechanicCheck,
  type MechanicCheckContext,
} from './validators-mechanics/index';
export {
  MAX_ONE_BLOCKS,
  MAX_TIMER_SECONDS,
  PIECES_PROBLEM_CODES,
  piecesValidator,
  piecesValidators,
} from './validators-pieces';
export { worldSetupValidators } from './validators-world-setup';

import { floorAreaExpander } from './lowering/game/mechanics/floor';

export default definePlugin({
  id: 'msm.games',
  apiVersion: '^1.0.0',
  contributes: {
    searchData: () => import('./search').then((m) => m.SEARCH),
    elementKinds: [...gamesKinds],
    validators: [...gamesValidators, ...piecesValidators, ...worldSetupValidators],
    elementTemplates: [...piecesTemplates, ...worldSetupTemplates],
    // The floor mechanic's area corners, copied onto the game before lowering (B726).
    projectExpanders: [floorAreaExpander],
  },
});
