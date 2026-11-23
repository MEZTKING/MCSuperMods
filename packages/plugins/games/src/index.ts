/**
 * `@msm/plugin-games`: built-in MSM plugin (ADR 0113): the six games kinds.
 */
import { definePlugin } from '@msm/plugin-api';
import { gamesKinds } from './kinds/index';

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
export { gamesValidators } from './validators';

export default definePlugin({
  id: 'msm.games',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...gamesKinds],
  },
});
