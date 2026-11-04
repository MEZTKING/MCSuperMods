/**
 * The command palette: a Radix dialog with a fuzzy-filtered command list. Arrow keys move
 * the selection, Enter runs the selected command and closes, Escape closes.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { useEffect, useId, useState } from 'react';

/** One command the palette offers. */
export interface PaletteCommand {
  id: string;
  title: string;
  /** Display text such as `Ctrl+S`. */
  shortcut?: string;
  run(): void;
}

/**
 * Fuzzy match score of `query` against `text`, or `null` when the characters of `query` do
 * not all appear in order. Higher is better: consecutive characters and matches at word
 * starts score more, and an exact prefix scores most.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  let position = 0;
  let previous = -2;
  for (const char of needle) {
    if (char === ' ') continue;
    const found = haystack.indexOf(char, position);
    if (found === -1) return null;
    score += 1;
    if (found === previous + 1) score += 3;
    if (found === 0 || /[\s\-_/:.]/.test(haystack.charAt(found - 1))) score += 2;
    previous = found;
    position = found + 1;
  }
  if (haystack.startsWith(needle)) score += 10;
  return score - haystack.length / 100;
}

/** Commands matching `query`, best first (ties keep their order). */
export function filterCommands<T extends { title: string; id: string }>(
  commands: readonly T[],
  query: string,
): T[] {
  return commands
    .map((command, index) => ({
      command,
      index,
      score: fuzzyScore(query, command.title) ?? fuzzyScore(query, command.id),
    }))
    .filter((entry): entry is { command: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

export interface CommandPaletteProps {
  open: boolean;
  commands: readonly PaletteCommand[];
  onClose(): void;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = filterCommands(commands, query);
  const selected = matches[Math.min(active, matches.length - 1)];

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const run = (command: PaletteCommand | undefined) => {
    if (command === undefined) return;
    onClose();
    command.run();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="command-palette"
          className="fixed top-[15vh] left-1/2 z-50 flex w-[min(94vw,520px)] -translate-x-1/2 flex-col gap-1 rounded-md border border-border bg-panel p-2 text-text shadow-lg"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <input
            type="text"
            role="combobox"
            aria-label="Command"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={selected === undefined ? undefined : `${listId}-${selected.id}`}
            data-testid="command-palette-input"
            placeholder="Type a command"
            className="rounded border border-border bg-bg px-2 py-1 text-sm"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (matches.length > 0) setActive((active + 1) % matches.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (matches.length > 0) setActive((active - 1 + matches.length) % matches.length);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(selected);
              }
            }}
          />
          <div
            id={listId}
            role="listbox"
            aria-label="Commands"
            className="flex max-h-80 flex-col overflow-auto"
          >
            {matches.map((command) => (
              <div
                key={command.id}
                id={`${listId}-${command.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={command === selected}
                data-testid={`command-${command.id}`}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm ${command === selected ? 'bg-bg text-accent' : ''}`}
                onMouseDown={(event) => {
                  // Keep focus in the input; a pointer press runs the command.
                  event.preventDefault();
                  run(command);
                }}
              >
                <span>{command.title}</span>
                {command.shortcut !== undefined && (
                  <kbd className="text-muted text-xs">{command.shortcut}</kbd>
                )}
              </div>
            ))}
          </div>
          {matches.length === 0 && (
            <p className="px-2 py-1 text-muted text-sm">No matching commands.</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
