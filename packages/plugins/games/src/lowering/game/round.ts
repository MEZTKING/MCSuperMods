/**
 * Lowering of a game's round (ADR 0132 D1): the state machine every type shares (lobby,
 * countdown, playing, ending), its `start`, `stop` and `end` functions, a hook tag for each
 * change of state and the win conditions. B721 stub, filled by B724.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { GameLoweringContext } from './mechanics/index';

/** The files of the game's round; none until B724. */
export function roundFiles(_context: GameLoweringContext): OutputFile[] {
  return [];
}
