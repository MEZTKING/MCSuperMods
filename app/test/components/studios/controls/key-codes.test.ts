/**
 * "Press a key" (B420, B410's note): `KeyboardEvent.code` through the fixed HID usage table and
 * each target's `keyboardNamesByCode`, mouse buttons 0 to 4 as codes 1 to 5 through
 * `mouseNamesByCode`, never a reverse lookup, and the words shown for a name.
 */
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  HID_USAGE_BY_CODE,
  keyNameForCode,
  keyNameForMouseButton,
  keyWords,
} from '../../../../src/renderer/src/studios/controls/key-codes';

const targets = builtInTargets.map((bundle) => bundle.target);

describe.each(targets.map((target) => [target.id, target] as const))(
  'key codes on %s',
  (_id, target) => {
    const facts = target.controls;
    if (facts === undefined) throw new Error('The target has no control facts.');

    it('maps letters, digits and named keys by their physical code', () => {
      expect(keyNameForCode(facts, 'KeyA')).toBe('key.keyboard.a');
      expect(keyNameForCode(facts, 'KeyZ')).toBe('key.keyboard.z');
      expect(keyNameForCode(facts, 'Digit1')).toBe('key.keyboard.1');
      expect(keyNameForCode(facts, 'Digit0')).toBe('key.keyboard.0');
      expect(keyNameForCode(facts, 'Space')).toBe('key.keyboard.space');
      expect(keyNameForCode(facts, 'AltLeft')).toBe('key.keyboard.left.alt');
      expect(keyNameForCode(facts, 'ShiftRight')).toBe('key.keyboard.right.shift');
      expect(keyNameForCode(facts, 'ArrowUp')).toBe('key.keyboard.up');
      expect(keyNameForCode(facts, 'F3')).toBe('key.keyboard.f3');
      expect(keyNameForCode(facts, 'F13')).toBe('key.keyboard.f13');
      expect(keyNameForCode(facts, 'Numpad7')).toBe('key.keyboard.keypad.7');
      expect(keyNameForCode(facts, 'Backquote')).toBe('key.keyboard.grave.accent');
      expect(keyNameForCode(facts, 'Quote')).toBe('key.keyboard.apostrophe');
    });

    it('names every code of the table with a key name the target knows, or nothing', () => {
      for (const code of Object.keys(HID_USAGE_BY_CODE)) {
        const name = keyNameForCode(facts, code);
        if (name !== null) expect(facts.keyNames).toContain(name);
        expect(name).not.toBe(facts.unboundKey);
      }
      // The common keys all have names.
      for (const code of ['KeyQ', 'Digit5', 'Enter', 'Tab', 'ControlLeft', 'MetaLeft', 'Insert']) {
        expect(keyNameForCode(facts, code)).not.toBeNull();
      }
    });

    it('gives nothing for codes the game cannot be told', () => {
      expect(keyNameForCode(facts, 'MediaPlayPause')).toBeNull();
      expect(keyNameForCode(facts, 'BrowserBack')).toBeNull();
      expect(keyNameForCode(facts, '')).toBeNull();
    });

    it('maps mouse buttons 0, 1 and 2 to codes 1, 2 and 3', () => {
      expect(keyNameForMouseButton(facts, 0)).toBe(facts.mouseNamesByCode[1]);
      expect(keyNameForMouseButton(facts, 0)).toBe('key.mouse.left');
      expect(keyNameForMouseButton(facts, 1)).toBe('key.mouse.middle');
      expect(keyNameForMouseButton(facts, 2)).toBe('key.mouse.right');
      expect(keyNameForMouseButton(facts, 3)).toBe('key.mouse.4');
      expect(keyNameForMouseButton(facts, 4)).toBe('key.mouse.5');
      expect(keyNameForMouseButton(facts, -1)).toBeNull();
      expect(keyNameForMouseButton(facts, 40)).toBeNull();
    });

    it('never reads the digit names of codes 1 to 3 back as those codes', () => {
      // The target names HID codes 1-3 like the digits; the table maps Digit1 to 30, not 1.
      expect(HID_USAGE_BY_CODE.Digit1).toBe(30);
      expect(Object.values(HID_USAGE_BY_CODE)).not.toContain(1);
    });
  },
);

describe('keyWords', () => {
  it('says key names in words', () => {
    expect(keyWords('key.keyboard.k')).toBe('K');
    expect(keyWords('key.keyboard.left.alt')).toBe('Left Alt');
    expect(keyWords('key.keyboard.keypad.7')).toBe('Keypad 7');
    expect(keyWords('key.mouse.left')).toBe('Left mouse button');
    expect(keyWords('key.mouse.4')).toBe('Mouse button 4');
    expect(keyWords('jump')).toBeNull();
    expect(keyWords(undefined)).toBeNull();
  });
});
