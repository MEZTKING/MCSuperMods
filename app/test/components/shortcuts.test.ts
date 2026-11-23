import { describe, expect, it } from 'vitest';
import {
  createCommandDeduper,
  DEDUPE_WINDOW_MS,
  type ShortcutKeyEvent,
  shortcutFor,
} from '../../src/renderer/src/shortcuts';

function key(k: string, mods: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...mods,
  };
}

describe('shortcutFor', () => {
  it('maps Ctrl and Cmd shortcuts', () => {
    expect(shortcutFor(key('s', { ctrlKey: true }))).toBe('save');
    expect(shortcutFor(key('s', { metaKey: true }))).toBe('save');
    expect(shortcutFor(key('z', { ctrlKey: true }))).toBe('undo');
    expect(shortcutFor(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutFor(key('y', { ctrlKey: true }))).toBe('redo');
    expect(shortcutFor(key('n', { metaKey: true }))).toBe('newElement');
  });

  it('maps F5 to Play and Ctrl/Cmd+R to Reload in game, leaving Ctrl/Cmd+Shift+R alone', () => {
    expect(shortcutFor(key('F5'))).toBe('play');
    expect(shortcutFor(key('F5', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('F5', { shiftKey: true }))).toBeNull();
    expect(shortcutFor(key('r', { ctrlKey: true }))).toBe('reloadGame');
    expect(shortcutFor(key('R', { metaKey: true }))).toBe('reloadGame');
    expect(shortcutFor(key('R', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFor(key('r'))).toBeNull();
  });

  it('maps F6 to Try it (ADR 0085 D13)', () => {
    expect(shortcutFor(key('F6'))).toBe('tryIt');
    expect(shortcutFor(key('F6', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('F6', { shiftKey: true }))).toBeNull();
  });

  it('maps the command palette and rename shortcuts', () => {
    expect(shortcutFor(key('P', { ctrlKey: true, shiftKey: true }))).toBe('commandPalette');
    expect(shortcutFor(key('p', { metaKey: true, shiftKey: true }))).toBe('commandPalette');
    expect(shortcutFor(key('p', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('F2'))).toBe('renameElement');
    expect(shortcutFor(key('F2', { ctrlKey: true }))).toBeNull();
    // New project stays with the menu's Ctrl/Cmd+Shift+N.
    expect(shortcutFor(key('N', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it('maps Ctrl/Cmd+K to search everything (ADR 0124 D10, SQ9)', () => {
    expect(shortcutFor(key('k', { ctrlKey: true }))).toBe('search');
    expect(shortcutFor(key('K', { metaKey: true }))).toBe('search');
    expect(shortcutFor(key('k', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFor(key('k', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutFor(key('k'))).toBeNull();
    // Monaco stops Ctrl+K for its chords before the window listener sees it.
    expect(shortcutFor(key('k', { ctrlKey: true, defaultPrevented: true }))).toBeNull();
  });

  it('maps Ctrl/Cmd+Shift+A to the AI helper but leaves Ctrl/Cmd+A alone', () => {
    expect(shortcutFor(key('A', { ctrlKey: true, shiftKey: true }))).toBe('toggleAiHelper');
    expect(shortcutFor(key('a', { metaKey: true, shiftKey: true }))).toBe('toggleAiHelper');
    expect(shortcutFor(key('a', { ctrlKey: true }))).toBeNull();
  });

  it('ignores plain keys, Alt combinations and consumed events', () => {
    expect(shortcutFor(key('s'))).toBeNull();
    expect(shortcutFor(key('s', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutFor(key('z', { ctrlKey: true, defaultPrevented: true }))).toBeNull();
    expect(shortcutFor(key('q', { ctrlKey: true }))).toBeNull();
  });
});

describe('createCommandDeduper', () => {
  it('drops the menu echo of a key press but not repeated key presses', () => {
    let now = 0;
    const deduper = createCommandDeduper(() => now);
    expect(deduper.shouldRun('undo', 'keyboard')).toBe(true);
    now += 5;
    expect(deduper.shouldRun('undo', 'menu')).toBe(false);
    now += 5;
    expect(deduper.shouldRun('undo', 'keyboard')).toBe(true);
    now += 5;
    expect(deduper.shouldRun('undo', 'keyboard')).toBe(true);
  });

  it('runs the other path after the window has passed', () => {
    let now = 0;
    const deduper = createCommandDeduper(() => now);
    expect(deduper.shouldRun('save', 'menu')).toBe(true);
    now += DEDUPE_WINDOW_MS + 1;
    expect(deduper.shouldRun('save', 'keyboard')).toBe(true);
  });
});
