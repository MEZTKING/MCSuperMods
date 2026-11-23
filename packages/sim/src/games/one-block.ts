/**
 * The one block in Try it (ADR 0117 D4, B558). The block refills by phase through its own
 * lowered functions (B552: the tick tests the block for air, `next` counts the break, moves the
 * phase on and fills by weight, rolling chances out of 10,000 with `random value`), which the
 * function engine runs every tick at the world position the void ground lands in the area. This
 * module reads what the functions keep, for the side panel: the phase and breaks on the
 * holders `#<path>.phase` and `#<path>.breaks` of `<ns>.msm_one_block`.
 *
 * Pure.
 */

import type { BlockPos } from '../types.js';
import {
  dimensionOf,
  elementsOf,
  type GamesProject,
  holderName,
  idWords,
  listOf,
  numberOf,
  ONE_BLOCK_KIND,
  OVERWORLD,
  objectOf,
  posOf,
  splitId,
  textOf,
} from './data.js';

/** The scores the functions keep (the engine's `CommandState`). */
export interface ScoreReader {
  score(holder: string, objective: string): number | undefined;
}

/** The objective a namespace's one blocks count on. */
export function oneBlocksObjective(namespace: string): string {
  return `${namespace}.msm_one_block`;
}

/** What the side panel shows of one one block. */
export interface OneBlockStatus {
  readonly id: string;
  /** Plain words. */
  readonly name: string;
  /** Its block in the area, or `null` when it lies outside it or in another dimension. */
  readonly pos: BlockPos | null;
  /** Why it is not in the area, in plain words, or `null`. */
  readonly away: string | null;
  /** Whether the functions have started it (the phase holder is set). */
  readonly started: boolean;
  /** The phase, from 0. */
  readonly phase: number;
  readonly phaseName: string;
  readonly phases: number;
  /** Breaks counted in this phase (the first fill is not a break). */
  readonly breaks: number;
  /** Breaks the phase lasts. */
  readonly breaksInPhase: number;
}

/** Each one block's status; `inArea` says whether a world position is inside the area. */
export function oneBlockStatuses(
  games: GamesProject,
  scores: ScoreReader,
  corner: BlockPos,
  inArea: (pos: BlockPos) => boolean,
): OneBlockStatus[] {
  return elementsOf(games, ONE_BLOCK_KIND).map((element) => {
    const data = objectOf(element.data);
    const phases = listOf(data.phases).map(objectOf);
    const objective = oneBlocksObjective(splitId(element.id).namespace);
    const rawPhase = scores.score(holderName(element.id, '.phase'), objective);
    const rawBreaks = scores.score(holderName(element.id, '.breaks'), objective);
    const phase = Math.min(Math.max(0, rawPhase ?? 0), Math.max(0, phases.length - 1));
    const at = posOf(data.at);
    const pos = { x: at[0] - corner.x, y: at[1] - corner.y, z: at[2] - corner.z };
    const other = dimensionOf(element.data) !== OVERWORLD;
    const away = other
      ? 'It is in another dimension: only in the game.'
      : inArea(pos)
        ? null
        : 'It is outside the test area: start on "Empty sky" to have it in the middle.';
    const current = phases[phase] ?? {};
    return {
      id: element.id,
      name: idWords(element.id),
      pos: away === null ? pos : null,
      away,
      started: rawPhase !== undefined,
      phase,
      phaseName: textOf(current.name) === '' ? `Phase ${phase + 1}` : textOf(current.name),
      phases: phases.length,
      breaks: Math.max(0, rawBreaks ?? 0),
      breaksInPhase: Math.max(1, Math.trunc(numberOf(current.breaks, 1))),
    };
  });
}
