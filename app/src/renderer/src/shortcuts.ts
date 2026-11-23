/**
 * Renderer keyboard shortcuts. The application menu registers accelerators for some of the
 * same keys, so a command that arrives from both paths for one key press is run once: the
 * second arrival within {@link DEDUPE_WINDOW_MS} is dropped.
 *
 * @packageDocumentation
 */

/** A command a shortcut can trigger. */
export type ShortcutCommand =
  | 'save'
  | 'undo'
  | 'redo'
  | 'newElement'
  | 'renameElement'
  | 'commandPalette'
  | 'search'
  | 'toggleAiHelper'
  | 'play'
  | 'reloadGame'
  | 'tryIt';

/** How long a command from one path suppresses the same command from the other path. */
export const DEDUPE_WINDOW_MS = 300;

/** Minimal keyboard event shape, so tests can pass plain objects. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * Maps a key press to a command: Ctrl/Cmd+S save, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and
 * Ctrl+Y redo, Ctrl/Cmd+N new element, Ctrl/Cmd+Shift+P command palette, Ctrl/Cmd+Shift+A
 * the AI helper, F2 rename element, F5 Play and Ctrl/Cmd+R Reload in game (ADR 0084 D1, D6),
 * F6 Try it (ADR 0085 D13), Ctrl/Cmd+K search everything (ADR 0124 D10, SQ9: Monaco keeps its
 * own Ctrl+K chords, since it stops the key before this listener sees it).
 * Ctrl/Cmd+Shift+R is left to the window reload. Events another handler already consumed (Monaco's own undo, for example) are
 * ignored.
 */
export function shortcutFor(event: ShortcutKeyEvent): ShortcutCommand | null {
  if (event.defaultPrevented || event.altKey) return null;
  if (event.key === 'F2' && !(event.ctrlKey || event.metaKey || event.shiftKey)) {
    return 'renameElement';
  }
  if (event.key === 'F5' && !(event.ctrlKey || event.metaKey || event.shiftKey)) return 'play';
  if (event.key === 'F6' && !(event.ctrlKey || event.metaKey || event.shiftKey)) return 'tryIt';
  if (!(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'p' && event.shiftKey) return 'commandPalette';
  if (key === 'a' && event.shiftKey) return 'toggleAiHelper';
  if (key === 'k' && !event.shiftKey) return 'search';
  if (key === 's' && !event.shiftKey) return 'save';
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return 'redo';
  if (key === 'n' && !event.shiftKey) return 'newElement';
  if (key === 'r' && !event.shiftKey) return 'reloadGame';
  return null;
}

/** Where a command came from. */
export type CommandSource = 'keyboard' | 'menu';

/**
 * Pairs a key press with its menu echo. A command is dropped only when the previous run
 * command was the same one, from the other source, within the window, and not already
 * paired; so repeated key presses on one path always run.
 */
export function createCommandDeduper(now: () => number = () => performance.now()) {
  let pending: { command: string; source: CommandSource; time: number } | null = null;
  return {
    /** Returns `true` when `command` should run, and records it. */
    shouldRun(command: string, source: CommandSource): boolean {
      const time = now();
      if (
        pending !== null &&
        pending.command === command &&
        pending.source !== source &&
        time - pending.time <= DEDUPE_WINDOW_MS
      ) {
        pending = null;
        return false;
      }
      pending = { command, source, time };
      return true;
    },
  };
}
