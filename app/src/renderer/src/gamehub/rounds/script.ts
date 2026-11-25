/**
 * What a round script is made of (B728, ADR 0132 D10): a short timed list of practice players'
 * actions for one game type, read against the game itself (`facts.ts`), so a script plays the
 * user's own game with its own numbers and places. Players are named (`Alex`) or found by what
 * the game made of them: a role it dealt or the team it put them on.
 */

import type { RoundFacts, WorldPos } from './facts';

/** A player a step names: by name, by a role the game dealt, or beside another on a team. */
export type PlayerRef =
  | string
  | { readonly role: string; readonly index?: number }
  | { readonly teamOf: string; readonly other?: boolean; readonly index?: number };

/** A place a step names. */
export type ScriptPlace =
  | { readonly pos: WorldPos }
  | { readonly area: string }
  | { readonly near: PlayerRef; readonly dx?: number; readonly dz?: number }
  /** The bed of a player's team (the game's `team_base`). */
  | { readonly bedOf: PlayerRef };

/** What a step does: a practice player's action with references, or the round's start. */
export type ScriptAction =
  | { readonly do: 'start' }
  | {
      readonly do: 'join';
      readonly who: string;
      readonly at?: ScriptPlace;
      /** A team by scoreboard name, or the team of the game's base at that index. */
      readonly team?: string | { readonly base: number };
    }
  | { readonly do: 'leave'; readonly who: PlayerRef }
  | { readonly do: 'walk'; readonly who: PlayerRef; readonly to: ScriptPlace }
  | { readonly do: 'hit'; readonly who: PlayerRef; readonly target: PlayerRef }
  | { readonly do: 'knock_out'; readonly who: PlayerRef; readonly by: PlayerRef }
  | { readonly do: 'break_under'; readonly who: PlayerRef; readonly target: PlayerRef }
  | { readonly do: 'break'; readonly who: PlayerRef; readonly at: ScriptPlace }
  | { readonly do: 'hit_thing'; readonly who: PlayerRef; readonly type: string }
  | { readonly do: 'type'; readonly who: PlayerRef; readonly line: string };

/** One step of a round script. */
export interface RoundScriptStep {
  /** When the step happens, in ticks from the start of the round. */
  readonly at: number;
  readonly action: ScriptAction;
  /** What the step shows while it plays, in plain words ("Alex takes a heart from Sam"). */
  readonly caption?: string;
}

/** A round script: who plays, and the steps of one type's practice round, in order. */
export interface RoundScript {
  /** The game type it plays (`msm:game`'s `type`). */
  readonly type: string;
  /** The type's starter id in the library (`bed-wars`). */
  readonly starter: string;
  /** The practice players it brings, in the order they join. */
  readonly players: readonly string[];
  /** The steps for this game, read from its own mechanics and places. */
  steps(facts: RoundFacts): readonly RoundScriptStep[];
  /**
   * The places a headless round fits in the 48 by 48 test area, when not all of the game's
   * (a game wider than the area plays where these are).
   */
  focus?(facts: RoundFacts): readonly WorldPos[];
}

/** A number of a mechanic's data, or `fallback`. */
export function numberIn(data: unknown, key: string, fallback: number): number {
  if (typeof data !== 'object' || data === null) return fallback;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
