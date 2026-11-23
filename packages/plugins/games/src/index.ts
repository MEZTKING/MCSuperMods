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
  GAMES_KIND_IDS,
  type GamesKindId,
  gamesKinds,
  objectiveKind,
  oneBlockKind,
  teamKind,
  timerKind,
  worldSetupKind,
} from './kinds/index';
export {
  lowerWorldSetup,
  worldSetupGeneratedIds,
  worldSetupLoadFunction,
} from './lowering/world-setup';
export { piecesTemplates } from './templates/pieces';
export { worldSetupTemplates } from './templates/world-setup';
export { gamesValidators } from './validators';
export {
  MAX_ONE_BLOCKS,
  MAX_TIMER_SECONDS,
  PIECES_PROBLEM_CODES,
  piecesValidator,
  piecesValidators,
} from './validators-pieces';
export { worldSetupValidators } from './validators-world-setup';

export default definePlugin({
  id: 'msm.games',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...gamesKinds],
    validators: [...gamesValidators, ...piecesValidators, ...worldSetupValidators],
    elementTemplates: [...piecesTemplates, ...worldSetupTemplates],
  },
});
