/**
 * Lowering of a game's lobby (ADR 0132 D1): where players wait, the countdown once enough are
 * in and the even split into teams. B721 stub, filled by B724.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { GameLoweringContext } from './mechanics/index';

/** The files of the game's lobby; none until B724. */
export function lobbyFiles(_context: GameLoweringContext): OutputFile[] {
  return [];
}
