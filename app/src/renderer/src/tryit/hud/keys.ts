/**
 * The project's key binds in Try it (B429, ADR 0088): the browser's keys and mouse buttons as
 * the game's key names (through the Key bind Studio's `key-codes.ts` and the target's
 * `ControlFacts`), for the simulation's `controls.keys`, and the lines the keys list shows for
 * them. A project key wins over Try it's own one-press keys (Z pauses, X breaks and the rest),
 * whose buttons still work; the walking keys do both, as two controls on one key do in the game.
 *
 * @packageDocumentation
 */

import type { ControlFacts } from '@msm/plugin-api';
import type { KeyBindCatalogue } from '@msm/sim';
import { keyLabel } from '@msm/sim';
import { keyNameForCode, keyNameForMouseButton } from '../../studios/controls/key-codes';
import type { TryItCommand } from '../input';

/** The control facts a target may have. */
export type KeyFactsOf = { readonly controls?: ControlFacts | undefined };

/** The game's name of a keyboard key by its `KeyboardEvent.code`, or `null`. */
export function gameKeyName(target: KeyFactsOf, code: string): string | null {
  return target.controls === undefined ? null : keyNameForCode(target.controls, code);
}

/** The game's name of a mouse button by `MouseEvent.button`, or `null`. */
export function gameMouseName(target: KeyFactsOf, button: number): string | null {
  return target.controls === undefined ? null : keyNameForMouseButton(target.controls, button);
}

/** The keys list's lines for the project's key binds, sorted by id. */
export function projectKeyLines(
  binds: KeyBindCatalogue,
): { readonly keys: string; readonly does: string }[] {
  return binds.ids().flatMap((id) => {
    const bind = binds.get(id);
    if (bind === undefined) return [];
    return [{ keys: keyLabel(bind.defaultKey), does: `${bind.displayName} (your key)` }];
  });
}

/** The words of one of Try it's own commands, for {@link takenKeyLine}. */
export function commandWords(command: TryItCommand): string {
  switch (command.type) {
    case 'slot':
      return 'choose a hotbar slot';
    case 'break':
      return 'break or hit';
    case 'use':
      return 'use or place';
    case 'tool':
      return command.tool === 'grow' ? 'grow' : 'power';
    case 'picker':
      return 'choose what is in the slot';
    case 'toggleFly':
      return 'fly';
    case 'turn':
      return 'look around';
    case 'pause':
      return 'pause the clock';
    case 'step':
      return 'step the clock';
  }
}

/**
 * The line said once when a project key takes one of Try it's own keys, so the user knows where
 * that command went (the mouse and the buttons beside the picture still do it).
 */
export function takenKeyLine(key: string, bindName: string, command: TryItCommand): string {
  return `${keyLabel(key)} is your key ${bindName} here, so it does not ${commandWords(command)} in Try it; the mouse and the buttons beside the picture still do.`;
}

/** What {@link projectKey} needs of the simulation's key binds. */
export interface ProjectKeys {
  press(key: string): unknown;
  release(key: string): void;
  uses(key: string): boolean;
}

/**
 * Sends a key or mouse button going down or up to the project's key binds by its game name
 * (repeats of a held key are not presses); returns the name when a project key bind uses it, so
 * the view leaves its own command for that key alone.
 */
export function projectKey(
  keys: ProjectKeys,
  name: string | null,
  down: boolean,
  repeat = false,
): string | null {
  if (name === null) return null;
  if (down && !repeat) keys.press(name);
  else if (!down) keys.release(name);
  return keys.uses(name) ? name : null;
}
