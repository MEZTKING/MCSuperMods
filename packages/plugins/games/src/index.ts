/**
 * `@msm/plugin-games`: built-in MSM plugin (ADR 0113): the six games kinds.
 */
import { definePlugin } from '@msm/plugin-api';
import { gamesKinds } from './kinds/index';
import { piecesTemplates } from './templates/pieces';
import { gamesValidators } from './validators';
import { piecesValidators } from './validators-pieces';

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
export { piecesTemplates } from './templates/pieces';
export { gamesValidators } from './validators';
export {
  MAX_ONE_BLOCKS,
  MAX_TIMER_SECONDS,
  PIECES_PROBLEM_CODES,
  piecesValidator,
  piecesValidators,
} from './validators-pieces';

export default definePlugin({
  id: 'msm.games',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...gamesKinds],
    validators: [...gamesValidators, ...piecesValidators],
    elementTemplates: [...piecesTemplates],
  },
});
