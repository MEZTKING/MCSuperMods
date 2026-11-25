/**
 * The practice players' state (B728, ADR 0132 D10): who stands in beside Try it's own player,
 * where, with what in their hands, and whether they are in the game. Commands read it through
 * `CommandState.games.practice` (selectors, scores, items, deaths); `PracticePlayers`
 * (`practice.ts`) moves them and acts for them.
 *
 * A practice player's position is in the area's coordinates, as the player's own is; its score
 * holder key and its name in the chat are its name. What only a real client does (looking
 * around, swinging, picking up items) is said, never pretended.
 */

import { SimInventory } from '../events/actions.js';
import type { Vec3 } from '../types.js';
import { type PracticeActor, practiceActor } from './actor.js';

/** The most practice players Try it stands in beside the user (D10). */
export const MAX_PRACTICE_PLAYERS = 7;

/** The names the panel offers, in order (short, plain, none a real server's or person's brand). */
export const PRACTICE_NAMES: readonly string[] = Object.freeze([
  'Alex',
  'Sam',
  'Kai',
  'Noor',
  'Ravi',
  'Mia',
  'Jo',
]);

/** A name a practice player may have: what the game allows for a player name. */
export const PRACTICE_NAME = /^[A-Za-z0-9_]{1,16}$/;

/** One practice player as commands and the panel see it. */
export interface PracticeState {
  readonly name: string;
  readonly actor: PracticeActor;
  /** The feet, in the area's coordinates. */
  pos: Vec3;
  /** Degrees, as the player's look. */
  yaw: number;
  pitch: number;
  /** The hotbar (named slots such as armour are `GamesCommandState.slots` by name). */
  readonly inventory: SimInventory;
  /** In the game: a player who left is found by no selector until they join again. */
  online: boolean;
  /** Where a walk goes, or `null` when standing. */
  walkTo: Vec3 | null;
  /** Downward speed while falling, in blocks a tick. */
  fall: number;
}

/** The practice players; see the module comment. */
export class PracticeRoster {
  private readonly byName = new Map<string, PracticeState>();
  /**
   * Try it's own player is out of the game while a round is watched (Watch a round, a headless
   * round): no selector finds them, as if they had left; their own commands still run.
   */
  userAway = false;

  /** How many practice players there are (online or not). */
  get size(): number {
    return this.byName.size;
  }

  /** A practice player by name. */
  get(name: string): PracticeState | undefined {
    return this.byName.get(name);
  }

  /** Every practice player, in the order they were added. */
  all(): readonly PracticeState[] {
    return [...this.byName.values()];
  }

  /** The practice players in the game now. */
  online(): readonly PracticeState[] {
    return this.all().filter((one) => one.online);
  }

  /**
   * Adds a practice player standing at `pos`: `undefined` when the roster is full, the name is
   * taken or not a player name.
   */
  add(name: string, pos: Vec3, reserved: readonly string[] = []): PracticeState | undefined {
    if (this.byName.size >= MAX_PRACTICE_PLAYERS) return undefined;
    if (!PRACTICE_NAME.test(name) || this.byName.has(name) || reserved.includes(name)) {
      return undefined;
    }
    const state: PracticeState = {
      name,
      actor: practiceActor(name),
      pos: { ...pos },
      yaw: 0,
      pitch: 0,
      inventory: new SimInventory(),
      online: true,
      walkTo: null,
      fall: 0,
    };
    this.byName.set(name, state);
    return state;
  }

  /** Takes a practice player away altogether. */
  remove(name: string): boolean {
    return this.byName.delete(name);
  }

  /** Takes every practice player away. */
  removeAll(): void {
    this.byName.clear();
    this.userAway = false;
  }

  /** "Clear the area": everyone stays, standing still with empty hands. */
  reset(): void {
    for (const one of this.byName.values()) {
      one.inventory.clear();
      one.walkTo = null;
      one.fall = 0;
    }
  }

  /** The next name of {@link PRACTICE_NAMES} not taken, or `undefined` when all are. */
  nextName(reserved: readonly string[] = []): string | undefined {
    return PRACTICE_NAMES.find((one) => !this.byName.has(one) && !reserved.includes(one));
  }
}
