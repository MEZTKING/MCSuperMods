/**
 * Project key binds in Try it (B429, ADR 0088 D4), firing as the runtime's `KeyBinds` does
 * (read only to match it):
 *
 * - **Press.** Ignored while a screen is open (the game's key mappings do not fire then) and
 *   while the key is already held. Then `when` (always, on foot, in a vehicle, driving; the
 *   vehicle type when given) and `cooldown_ticks` are checked at press time. A press that fails
 *   either holds nothing and runs nothing (the game says nothing; the preview writes one
 *   "skipped" line so the user knows why). A press that passes holds the key and runs
 *   `msm:on_press`.
 * - **Release.** Runs `msm:on_release` of a held key. A tap is a press and a release.
 * - **Hold.** `msm:while_held` runs every `hold_interval_ticks`, the first one interval after
 *   the press, at the end of a tick.
 * - **Screens and focus.** The game's client sends a release for every held key when a screen
 *   opens or the window loses focus, so {@link KeyBindEngine.releaseAll} runs their
 *   `msm:on_release`; "Clear the area" forgets held keys and cooldowns without events.
 *
 * Every event runs with the player's item context (the runtime's `EventContext.forItem`): the
 * block below the player is the base, effects happen at the player, the player is self and
 * other. The runtime's own vehicle keys (fire, second weapon, horn: R, V, H by default) are the
 * game's: pressing one in a vehicle says so once (weapons and the horn are not simulated).
 */
import type { RuntimeKeyFacts } from '@msm/plugin-api';
import type { EventContext } from '../events/actions.js';
import type { EventOwner } from '../events/definitions.js';
import type { SimTrace } from '../events/trace.js';
import type { SimLog } from '../types.js';
import type { CatalogueVehicle } from '../vehicles/catalogue.js';
import type { CatalogueKeyBind, KeyBindCatalogue } from './key-binds.js';
import { keyLabel } from './key-binds.js';

/** What the player rides now, for `when`. */
export interface KeyRiding {
  /** The vehicle type's id. */
  readonly type: string;
  /** Whether the player drives it. */
  readonly driving: boolean;
}

/** What a {@link KeyBindEngine} works with. */
export interface KeyHost {
  /** The current tick. */
  now(): number;
  /** The vehicle the player sits in, or `null` on foot. */
  riding(): KeyRiding | null;
  /** Whether a screen (a container's mock-up) is open. */
  screenOpen(): boolean;
  /** The context the key's events run with. */
  context(): EventContext;
  /** Runs one event of an owner (the trigger engine's `fireOwned`). */
  fire(owner: EventOwner, eventId: string, ctx: EventContext, sentence: string): void;
  /** Where "skipped" lines go. */
  readonly trace: SimTrace;
  readonly log: SimLog;
  /** A vehicle type of the project. */
  vehicle(type: string): CatalogueVehicle | undefined;
  /** The runtime's vehicle keys of the target, when it has them. */
  runtimeKeys(): RuntimeKeyFacts | undefined;
}

/** A held key bind: the tick of its press and of its next `msm:while_held`. */
interface Held {
  readonly since: number;
  nextHold: number;
}

/** What a press did. */
export interface KeyPressResult {
  /** The key binds whose press fired, by id. */
  readonly fired: readonly string[];
  /** The key binds on the key that did not fire (screen, `when`, cooldown, already held). */
  readonly refused: readonly string[];
}

const NOTHING: KeyPressResult = Object.freeze({ fired: [], refused: [] });

/** `20` is "1 second", `600` is "30 seconds". */
function ticksWords(ticks: number): string {
  const seconds = Math.round((ticks / 20) * 100) / 100;
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

/** The key binds of one area; see the module comment. */
export class KeyBindEngine {
  private catalogue: KeyBindCatalogue;
  private readonly host: KeyHost;
  private readonly heldNow = new Map<string, Held>();
  /** The tick of the last press that fired, by key bind id. */
  private readonly lastFired = new Map<string, number>();
  /** Keys (game key names) down now, whether or not a key bind fired. */
  private readonly down = new Set<string>();

  constructor(catalogue: KeyBindCatalogue, host: KeyHost) {
    this.catalogue = catalogue;
    this.host = host;
  }

  /** The key binds of the current files. */
  get binds(): KeyBindCatalogue {
    return this.catalogue;
  }

  /** Takes the key binds of new files; a held key bind that is gone stops holding. */
  setCatalogue(catalogue: KeyBindCatalogue): void {
    this.catalogue = catalogue;
    for (const id of [...this.heldNow.keys()]) {
      if (catalogue.get(id) === undefined) this.heldNow.delete(id);
    }
  }

  /** The ids of the key binds held now, sorted. */
  held(): readonly string[] {
    return [...this.heldNow.keys()].sort();
  }

  /** Whether any key bind of the project uses `key` (a game key name) as its default. */
  uses(key: string): boolean {
    return this.catalogue.onKey(key).length > 0;
  }

  /** The key `key` (a game key name such as `key.keyboard.k`) went down. */
  press(key: string): KeyPressResult {
    if (this.down.has(key)) return NOTHING;
    this.down.add(key);
    this.runtimeKey(key);
    const binds = this.catalogue.onKey(key);
    if (binds.length === 0) return NOTHING;
    const fired: string[] = [];
    const refused: string[] = [];
    for (const bind of binds) {
      if (this.pressOne(bind)) fired.push(bind.id);
      else refused.push(bind.id);
    }
    return { fired, refused };
  }

  /** The key `key` came up. */
  release(key: string): void {
    if (!this.down.delete(key)) return;
    for (const bind of this.catalogue.onKey(key)) this.releaseOne(bind);
  }

  /**
   * Every held key comes up with its `msm:on_release` (a screen opened or the view lost the
   * keyboard, as the game's client releases them).
   */
  releaseAll(): void {
    for (const key of [...this.down]) this.release(key);
  }

  /** Forgets held keys and cooldowns without events ("Clear the area"). */
  clear(): void {
    this.down.clear();
    this.heldNow.clear();
    this.lastFired.clear();
  }

  /** `msm:while_held` of every held key that is due (call at the end of each tick). */
  tick(): void {
    const now = this.host.now();
    for (const [id, held] of [...this.heldNow]) {
      const bind = this.catalogue.get(id);
      if (bind?.whileHeld === undefined) continue;
      if (now < held.nextHold) continue;
      held.nextHold = now + bind.holdIntervalTicks;
      this.host.fire(
        bind.owner,
        bind.whileHeld,
        this.host.context(),
        `You held ${this.words(bind)}`,
      );
    }
  }

  private words(bind: CatalogueKeyBind): string {
    return `${bind.displayName} (${keyLabel(bind.defaultKey)})`;
  }

  private skipped(bind: CatalogueKeyBind, why: string): void {
    this.host.trace.add({
      kind: 'skipped',
      text: `You pressed ${this.words(bind)}, but ${why}; nothing ran.`,
      origin: bind.origin,
    });
  }

  private pressOne(bind: CatalogueKeyBind): boolean {
    if (this.heldNow.has(bind.id)) return false;
    if (this.host.screenOpen()) return false;
    const riding = this.host.riding();
    if (!this.whenHolds(bind, riding)) {
      const vehicle =
        bind.vehicle === undefined
          ? undefined
          : (this.host.vehicle(bind.vehicle)?.displayName ?? bind.vehicle);
      const where =
        bind.when === 'on_foot'
          ? 'on foot'
          : bind.when === 'in_vehicle'
            ? vehicle === undefined
              ? 'in a vehicle'
              : `in ${vehicle}`
            : vehicle === undefined
              ? 'while driving'
              : `while driving ${vehicle}`;
      this.skipped(bind, `it works only ${where}`);
      return false;
    }
    const now = this.host.now();
    const last = this.lastFired.get(bind.id);
    if (bind.cooldownTicks > 0 && last !== undefined && now - last < bind.cooldownTicks) {
      this.skipped(
        bind,
        `it rests for ${ticksWords(bind.cooldownTicks)} after each press (${ticksWords(bind.cooldownTicks - (now - last))} left)`,
      );
      return false;
    }
    this.lastFired.set(bind.id, now);
    this.heldNow.set(bind.id, { since: now, nextHold: now + bind.holdIntervalTicks });
    if (bind.onPress !== undefined) {
      this.host.fire(
        bind.owner,
        bind.onPress,
        this.host.context(),
        `You pressed ${this.words(bind)}`,
      );
    }
    return true;
  }

  private releaseOne(bind: CatalogueKeyBind): void {
    if (!this.heldNow.delete(bind.id)) return;
    if (bind.onRelease !== undefined) {
      this.host.fire(
        bind.owner,
        bind.onRelease,
        this.host.context(),
        `You let go of ${this.words(bind)}`,
      );
    }
  }

  private whenHolds(bind: CatalogueKeyBind, riding: KeyRiding | null): boolean {
    const matches = riding !== null && (bind.vehicle === undefined || bind.vehicle === riding.type);
    switch (bind.when) {
      case 'on_foot':
        return riding === null;
      case 'in_vehicle':
        return matches;
      case 'driving':
        return matches && riding?.driving === true;
      default:
        return true;
    }
  }

  /** The runtime's vehicle keys: said once in a vehicle that has what they work. */
  private runtimeKey(key: string): void {
    const keys = this.host.runtimeKeys();
    const riding = this.host.riding();
    if (keys === undefined || riding === null) return;
    const vehicle = this.host.vehicle(riding.type);
    if (vehicle === undefined) return;
    const d = vehicle.definition;
    const label = keyLabel(key);
    if (key === keys.fire || key === keys.second) {
      const slot = key === keys.fire ? 'fire' : 'second';
      const weapons = Array.isArray(d.weapons)
        ? d.weapons.filter((weapon) => {
            if (typeof weapon !== 'object' || weapon === null || Array.isArray(weapon))
              return false;
            return (weapon.key ?? 'fire') === slot;
          })
        : [];
      if (weapons.length === 0) return;
      this.host.log.onlyInMinecraft(
        `${label} (${slot === 'fire' ? 'Vehicle: fire' : 'Vehicle: second weapon'}) fires ${vehicle.displayName}'s ${weapons.length === 1 ? 'weapon' : 'weapons'} only in the game; the preview shoots nothing`,
        vehicle.origin,
      );
      return;
    }
    if (key === keys.horn) {
      const engine = d.engine;
      const horn =
        typeof engine === 'object' && engine !== null && !Array.isArray(engine)
          ? engine.horn
          : undefined;
      if (typeof horn !== 'string' || horn === '') return;
      this.host.log.onlyInMinecraft(
        `${label} (Vehicle: horn) sounds ${vehicle.displayName}'s horn only in the game`,
        vehicle.origin,
      );
    }
  }
}
