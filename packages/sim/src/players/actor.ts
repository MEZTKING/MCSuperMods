/**
 * Who a command can run as or find (B728, ADR 0132 D10): the player and a mob as events know
 * them ({@link Actor}), and a practice player by name. Only commands see practice players
 * (`commands/`); events, rules and scripts keep the narrower {@link Actor}.
 */

import type { Actor } from '../events/actions.js';

/** A practice player as a command sees it: by its name, which is also its score holder key. */
export interface PracticeActor {
  readonly kind: 'practice';
  readonly name: string;
}

/** Someone a command runs as or finds: the player, a mob or thing, or a practice player. */
export type CommandActor = Actor | PracticeActor;

/** A practice player as a {@link CommandActor}. */
export function practiceActor(name: string): PracticeActor {
  return Object.freeze({ kind: 'practice', name });
}

/** Whether an actor is a player (Try it's own or a practice player). */
export function isPlayerActor(actor: CommandActor): boolean {
  return actor.kind === 'player' || actor.kind === 'practice';
}
