import { describe, expect, it } from 'vitest';
import {
  commandForButton,
  commandForKey,
  inputFromHeld,
  isDoubleTap,
  TRYIT_KEYS,
  turnLook,
} from '../../../src/renderer/src/tryit/input';

describe('Try it keys', () => {
  it('maps every command key', () => {
    for (let n = 1; n <= 9; n += 1) {
      expect(commandForKey(`Digit${n}`)).toEqual({ type: 'slot', index: n - 1 });
    }
    expect(commandForKey('Digit0')).toBeNull();
    expect(commandForKey('KeyX')).toEqual({ type: 'break' });
    expect(commandForKey('KeyC')).toEqual({ type: 'use' });
    expect(commandForKey('KeyG')).toEqual({ type: 'tool', tool: 'grow' });
    expect(commandForKey('KeyP')).toEqual({ type: 'tool', tool: 'power' });
    expect(commandForKey('KeyE')).toEqual({ type: 'picker' });
    expect(commandForKey('KeyF')).toEqual({ type: 'toggleFly' });
    expect(commandForKey('KeyZ')).toEqual({ type: 'pause' });
    expect(commandForKey('KeyN')).toEqual({ type: 'step' });
    expect(commandForKey('ArrowLeft')).toEqual({ type: 'turn', yaw: -15, pitch: 0 });
    expect(commandForKey('ArrowRight')).toEqual({ type: 'turn', yaw: 15, pitch: 0 });
    expect(commandForKey('ArrowUp')).toEqual({ type: 'turn', yaw: 0, pitch: -15 });
    expect(commandForKey('ArrowDown')).toEqual({ type: 'turn', yaw: 0, pitch: 15 });
    // Walking keys are held, not commands.
    expect(commandForKey('KeyW')).toBeNull();
    expect(commandForKey('Space')).toBeNull();
  });

  it('gives each mouse action a button and a key', () => {
    expect(commandForButton(0)).toEqual({ type: 'break' });
    expect(commandForButton(2)).toEqual({ type: 'use' });
    expect(commandForButton(1)).toBeNull();
    const listed = TRYIT_KEYS.map((entry) => entry.keys).join(' | ');
    expect(listed).toContain('Left click or X');
    expect(listed).toContain('Right click or C');
    expect(listed).toContain('F6');
  });

  it('turns held keys into one tick of walking', () => {
    const held = new Set(['KeyW', 'KeyD', 'Space', 'ShiftLeft']);
    expect(inputFromHeld(held, { yaw: 30, pitch: 10 }, true)).toEqual({
      forward: 1,
      strafe: 1,
      jump: true,
      sneak: true,
      toggleFly: true,
      yaw: 30,
      pitch: 10,
    });
    expect(inputFromHeld(new Set(['KeyS', 'KeyA']), { yaw: 0, pitch: 0 })).toMatchObject({
      forward: -1,
      strafe: -1,
      jump: false,
      sneak: false,
      toggleFly: false,
    });
  });

  it('keeps the yaw in a circle and clamps the pitch', () => {
    expect(turnLook({ yaw: 350, pitch: 80 }, 20, 20)).toEqual({ yaw: 10, pitch: 90 });
    expect(turnLook({ yaw: 5, pitch: -80 }, -10, -20)).toEqual({ yaw: 355, pitch: -90 });
  });

  it('counts a double tap of Space', () => {
    expect(isDoubleTap(null, 100)).toBe(false);
    expect(isDoubleTap(100, 350)).toBe(true);
    expect(isDoubleTap(100, 500)).toBe(false);
  });
});
