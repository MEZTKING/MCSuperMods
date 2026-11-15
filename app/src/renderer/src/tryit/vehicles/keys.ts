/**
 * The vehicle keys of Try it (B428): the movement keys drive (W and S, A and D steer, Space
 * climbs, Shift gets out), and Left Alt is the runtime's "Vehicle: descend" (ADR 0088 D5),
 * held while it is down. Fire, second weapon and horn are the game's (said by the simulation).
 */

/** The code of the descend key (the runtime's default, Left Alt). */
export const DESCEND_CODE = 'AltLeft';

/** The vehicle lines of the keys list (and the guide). */
export const VEHICLE_KEYS: readonly { readonly keys: string; readonly does: string }[] = [
  { keys: 'Right click or C on a vehicle', does: 'Get in (or use fuel or a repair item on it)' },
  { keys: 'W A S D in a vehicle', does: 'Drive and steer' },
  { keys: 'Space, Left Alt in a vehicle', does: 'Climb, go down (hovering vehicles)' },
  { keys: 'Shift in a vehicle', does: 'Get out' },
  { keys: 'Left click or X on a vehicle', does: 'Hit it; with Shift, pick it up' },
];

/**
 * Handles a key for the vehicles before the view's own keys; true when it took the key (the
 * view then does nothing more with it).
 */
export function vehicleKey(
  event: { readonly code: string; preventDefault(): void },
  down: boolean,
  vehicles: { setDescend(held: boolean): void },
): boolean {
  if (event.code !== DESCEND_CODE) return false;
  event.preventDefault();
  vehicles.setDescend(down);
  return true;
}
