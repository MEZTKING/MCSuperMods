import type { ProjectValidator } from '@msm/plugin-api';
import { GAME_KIND_LISTED } from './kinds/game';
import { KIT_KIND_LISTED } from './kinds/kit';
import { gameValidator } from './validators-game';
import { kitValidator } from './validators-kit';

/**
 * The games plugin's own project validators: the Game and map Studio's `msm:game` and `msm:kit`
 * (ADR 0132; B724 fills them), each listed once its kind is (B722). The pieces' and the world
 * setup's validators are in `validators-pieces.ts` and `validators-world-setup.ts`.
 */
export const gamesValidators: readonly ProjectValidator[] = Object.freeze([
  ...(GAME_KIND_LISTED ? [gameValidator] : []),
  ...(KIT_KIND_LISTED ? [kitValidator] : []),
]);
