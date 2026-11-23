/**
 * Lowering of a game's roles (ADR 0132 D1): the roles dealt at random at the start of a round,
 * by count or as the rest, with their teams and kits. B721 stub, filled by B724.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { GameLoweringContext } from './mechanics/index';

/** The files of the game's roles; none until B724. */
export function rolesFiles(_context: GameLoweringContext): OutputFile[] {
  return [];
}
