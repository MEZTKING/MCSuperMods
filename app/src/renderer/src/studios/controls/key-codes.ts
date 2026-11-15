/**
 * "Press a key" for the Key bind Studio (B420, ADR 0088 D8, B410's note): a fixed table from the
 * browser's `KeyboardEvent.code` (the physical key, whatever the layout) to its USB HID usage id,
 * then the target's `keyboardNamesByCode` (indexed by that usage id) for the game's key name. A
 * mouse button `n` of a `MouseEvent` (0 left, 1 middle, 2 right, 3 and 4 the side buttons) is the
 * game's mouse code `n + 1`, looked up in `mouseNamesByCode`.
 *
 * Names are never mapped back to codes: the target's table names codes 1 to 3 like the digit
 * keys, so a reverse lookup would be ambiguous. The words shown for a name come from the name.
 *
 * @packageDocumentation
 */

import type { ControlFacts } from '@msm/plugin-api';

/**
 * `KeyboardEvent.code` to USB HID usage id (keyboard page 0x07), after the UI Events
 * KeyboardEvent code values specification's table. Codes outside the keyboard page (media and
 * browser keys) are not listed: the game cannot be told them by usage id.
 */
export const HID_USAGE_BY_CODE: Readonly<Record<string, number>> = Object.freeze({
  ...Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, index) => [`Key${letter}`, 4 + index]),
  ),
  ...Object.fromEntries('123456789'.split('').map((digit, index) => [`Digit${digit}`, 30 + index])),
  Digit0: 39,
  Enter: 40,
  Escape: 41,
  Backspace: 42,
  Tab: 43,
  Space: 44,
  Minus: 45,
  Equal: 46,
  BracketLeft: 47,
  BracketRight: 48,
  Backslash: 49,
  Semicolon: 51,
  Quote: 52,
  Backquote: 53,
  Comma: 54,
  Period: 55,
  Slash: 56,
  CapsLock: 57,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, 58 + index])),
  PrintScreen: 70,
  ScrollLock: 71,
  Pause: 72,
  Insert: 73,
  Home: 74,
  PageUp: 75,
  Delete: 76,
  End: 77,
  PageDown: 78,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82,
  NumLock: 83,
  NumpadDivide: 84,
  NumpadMultiply: 85,
  NumpadSubtract: 86,
  NumpadAdd: 87,
  NumpadEnter: 88,
  ...Object.fromEntries(
    '123456789'.split('').map((digit, index) => [`Numpad${digit}`, 89 + index]),
  ),
  Numpad0: 98,
  NumpadDecimal: 99,
  IntlBackslash: 100,
  ContextMenu: 101,
  Power: 102,
  NumpadEqual: 103,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`F${index + 13}`, 104 + index])),
  Help: 117,
  Again: 121,
  Undo: 122,
  Cut: 123,
  Copy: 124,
  Paste: 125,
  Find: 126,
  AudioVolumeMute: 127,
  AudioVolumeUp: 128,
  AudioVolumeDown: 129,
  NumpadComma: 133,
  IntlRo: 135,
  KanaMode: 136,
  IntlYen: 137,
  Convert: 138,
  NonConvert: 139,
  Lang1: 144,
  Lang2: 145,
  Lang3: 146,
  Lang4: 147,
  Lang5: 148,
  NumpadParenLeft: 182,
  NumpadParenRight: 183,
  NumpadBackspace: 187,
  NumpadMemoryStore: 208,
  NumpadMemoryRecall: 209,
  NumpadMemoryClear: 210,
  NumpadMemoryAdd: 211,
  NumpadMemorySubtract: 212,
  NumpadClear: 216,
  NumpadClearEntry: 217,
  ControlLeft: 224,
  ShiftLeft: 225,
  AltLeft: 226,
  MetaLeft: 227,
  OSLeft: 227,
  ControlRight: 228,
  ShiftRight: 229,
  AltRight: 230,
  MetaRight: 231,
  OSRight: 231,
});

/** The facts "Press a key" reads. */
export type KeyCodeFacts = Pick<
  ControlFacts,
  'keyboardNamesByCode' | 'mouseNamesByCode' | 'unboundKey' | 'keyNames'
>;

/** A name the game can bind: in the target's names and not "no key". */
function bindable(facts: KeyCodeFacts, name: string | undefined): string | null {
  if (name === undefined || name === facts.unboundKey) return null;
  return facts.keyNames.includes(name) ? name : null;
}

/**
 * The game's key name of a pressed keyboard key, from its `KeyboardEvent.code`, or `null` when
 * the game has no name for it (the key cannot be a default key).
 */
export function keyNameForCode(facts: KeyCodeFacts, code: string): string | null {
  const usage = HID_USAGE_BY_CODE[code];
  if (usage === undefined) return null;
  return bindable(facts, facts.keyboardNamesByCode[usage]);
}

/**
 * The game's key name of a pressed mouse button, from `MouseEvent.button` (0 left, 1 middle,
 * 2 right, then the side buttons), or `null` when the game has no name for it.
 */
export function keyNameForMouseButton(facts: KeyCodeFacts, button: number): string | null {
  if (!Number.isInteger(button) || button < 0) return null;
  return bindable(facts, facts.mouseNamesByCode[button + 1]);
}

/** Mouse button words by the name's last part. */
const MOUSE_WORDS: Readonly<Record<string, string>> = {
  left: 'Left mouse button',
  middle: 'Middle mouse button',
  right: 'Right mouse button',
};

/**
 * The words of a key name: `key.keyboard.left.alt` is "Left Alt", `key.keyboard.k` is "K",
 * `key.mouse.4` is "Mouse button 4". `null` for something that is not a key name.
 */
export function keyWords(name: string | undefined): string | null {
  if (name === undefined) return null;
  const match = /^key\.(keyboard|mouse)\.(.+)$/.exec(name);
  if (match === null) return null;
  const [, device, rest = ''] = match;
  if (device === 'mouse') {
    return MOUSE_WORDS[rest] ?? `Mouse button ${rest}`;
  }
  return rest
    .split('.')
    .map((part) => (part.length === 0 ? part : `${part[0]?.toUpperCase()}${part.slice(1)}`))
    .join(' ');
}
