/**
 * Try it's keys and mouse (ADR 0085 D12, B390): walking keys are held, every other key is one
 * command, and every mouse action also has a key, so the view works (and is tested) without a
 * mouse. Keys are read by `KeyboardEvent.code`, so they sit in the same place on every layout.
 * Pure: the view keeps the held keys and sends the commands.
 */

import type { PlayerInput } from '@msm/sim';

/** One thing a key or mouse button asks for (walking keys are held instead). */
export type TryItCommand =
  | { readonly type: 'slot'; readonly index: number }
  | { readonly type: 'break' }
  | { readonly type: 'use' }
  | { readonly type: 'tool'; readonly tool: 'grow' | 'power' }
  | { readonly type: 'picker' }
  | { readonly type: 'toggleFly' }
  | { readonly type: 'turn'; readonly yaw: number; readonly pitch: number }
  | { readonly type: 'pause' }
  | { readonly type: 'step' };

/** How far an arrow key turns the look, in degrees. */
export const TURN_STEP = 15;
/** How far one pixel of mouse movement turns the look, in degrees. */
export const MOUSE_DEGREES_PER_PIXEL = 0.15;
/** Two presses of Space closer than this toggle flying, as in the game. */
export const DOUBLE_TAP_MS = 300;
/** The hotbar's size. */
export const HOTBAR_SIZE = 9;

/** The keys that are held for walking, by code. */
export const MOVEMENT_CODES: ReadonlySet<string> = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ShiftLeft',
  'ShiftRight',
]);

/** The command of a key, or `null` for a key Try it does not use (or a held walking key). */
export function commandForKey(code: string): TryItCommand | null {
  const digit = /^Digit([1-9])$/.exec(code);
  if (digit !== null) return { type: 'slot', index: Number(digit[1]) - 1 };
  switch (code) {
    case 'KeyX':
      return { type: 'break' };
    case 'KeyC':
      return { type: 'use' };
    case 'KeyG':
      return { type: 'tool', tool: 'grow' };
    case 'KeyP':
      return { type: 'tool', tool: 'power' };
    case 'KeyE':
      return { type: 'picker' };
    case 'KeyF':
      return { type: 'toggleFly' };
    case 'ArrowLeft':
      return { type: 'turn', yaw: -TURN_STEP, pitch: 0 };
    case 'ArrowRight':
      return { type: 'turn', yaw: TURN_STEP, pitch: 0 };
    case 'ArrowUp':
      return { type: 'turn', yaw: 0, pitch: -TURN_STEP };
    case 'ArrowDown':
      return { type: 'turn', yaw: 0, pitch: TURN_STEP };
    case 'KeyZ':
      return { type: 'pause' };
    case 'KeyN':
      return { type: 'step' };
    default:
      return null;
  }
}

/** The command of a mouse button (`MouseEvent.button`): left breaks or hits, right uses. */
export function commandForButton(button: number): TryItCommand | null {
  if (button === 0) return { type: 'break' };
  if (button === 2) return { type: 'use' };
  return null;
}

/** The walking input of one tick from the held keys and the look. */
export function inputFromHeld(
  held: ReadonlySet<string>,
  look: { readonly yaw: number; readonly pitch: number },
  toggleFly = false,
): PlayerInput {
  const on = (code: string): number => (held.has(code) ? 1 : 0);
  return {
    forward: on('KeyW') - on('KeyS'),
    strafe: on('KeyD') - on('KeyA'),
    jump: held.has('Space'),
    sneak: held.has('ShiftLeft') || held.has('ShiftRight'),
    toggleFly,
    yaw: look.yaw,
    pitch: look.pitch,
  };
}

/** Turns a look by a yaw and pitch change: yaw kept in 0..360, pitch clamped to ±90. */
export function turnLook(
  look: { readonly yaw: number; readonly pitch: number },
  yaw: number,
  pitch: number,
): { yaw: number; pitch: number } {
  const nextYaw = (((look.yaw + yaw) % 360) + 360) % 360;
  const nextPitch = Math.max(-90, Math.min(90, look.pitch + pitch));
  return { yaw: nextYaw, pitch: nextPitch };
}

/** Whether a Space press at `now` is the second of a double tap after one at `last`. */
export function isDoubleTap(last: number | null, now: number): boolean {
  return last !== null && now - last <= DOUBLE_TAP_MS;
}

/** The keys list the view shows (and the guide names), in plain words. */
export const TRYIT_KEYS: readonly { readonly keys: string; readonly does: string }[] = [
  { keys: 'W A S D', does: 'Walk' },
  { keys: 'Space', does: 'Jump; while flying, go up' },
  { keys: 'Space twice, or F', does: 'Fly, or stop flying' },
  { keys: 'Shift', does: 'Sneak; while flying, go down' },
  {
    keys: 'Mouse or arrow keys',
    does: 'Look around (click the picture first; Esc frees the mouse)',
  },
  { keys: 'Left click or X', does: 'Break a block or hit a mob' },
  { keys: 'Right click or C', does: 'Place, open a door, press a button or hatch a spawn egg' },
  { keys: '1 to 9', does: 'Choose a hotbar slot' },
  { keys: 'E', does: 'Choose what is in the slot' },
  { keys: 'G', does: 'Grow the block you point at' },
  { keys: 'P', does: 'Power the block you point at' },
  { keys: 'T or /', does: 'Open the chat box to type a command' },
  { keys: 'Z', does: 'Pause the clock, or start it again' },
  { keys: 'N', does: 'Move the paused clock on by one twentieth of a second' },
  { keys: 'F6', does: 'Open Try it' },
];
