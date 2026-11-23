/**
 * `@msm/plugin-games`: built-in MSM plugin.
 */
import { definePlugin } from '@msm/plugin-api';

export { GAMES_KIND_IDS, type GamesKindId } from './kinds/index';
export { gamesValidators } from './validators';

export default definePlugin({
  id: 'msm.games',
  apiVersion: '^1.0.0',
  contributes: {},
});
