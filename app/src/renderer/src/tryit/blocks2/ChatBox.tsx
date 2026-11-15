/**
 * Try it's chat box (B463, ADR 0096 D1, Q29: commands are logged, not shown): T or / opens it
 * over the bottom of the picture, as the game's chat does; Enter runs the line through the
 * simulation's command runner (checked as the runtime's command tree checks it, the command's
 * event fired), Esc closes it, Up and Down step through what was typed. Above the line it shows
 * the answers in the game's words and, while typing a command, its usage.
 *
 * Part of the lazy Try it chunk.
 */

import type { ChatLine, SimCommand } from '@msm/sim';
import { usageOf } from '@msm/sim';
import { useEffect, useMemo, useRef, useState } from 'react';

/** How many answers the box shows. */
export const CHAT_SHOWN = 6;

/** Props of {@link ChatBox}. */
export interface ChatBoxProps {
  /** The line to start with (`/` when opened with the slash key). */
  readonly start: string;
  readonly history: readonly ChatLine[];
  readonly commands: readonly SimCommand[];
  onRun(line: string): void;
  onClose(): void;
}

/** The usage lines of the commands whose name or alias starts like the line typed. */
export function usageHints(line: string, commands: readonly SimCommand[]): string[] {
  if (!line.startsWith('/')) return [];
  const literal = line.slice(1).split(' ')[0] ?? '';
  return commands
    .filter((one) => [one.name, ...one.aliases].some((name) => name.startsWith(literal)))
    .map(usageOf)
    .slice(0, 4);
}

/** The chat box; see the module comment. */
export function ChatBox({ start, history, commands, onRun, onClose }: ChatBoxProps) {
  const [line, setLine] = useState(start);
  const [back, setBack] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const typed = useMemo(
    () => history.map((one) => one.typed).filter((one) => one !== ''),
    [history],
  );
  const hints = usageHints(line, commands);
  return (
    <div
      role="dialog"
      aria-label="Chat"
      data-testid="tryit-chat"
      className="absolute right-2 bottom-12 left-2 z-30 flex flex-col gap-1 text-sm"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ol data-testid="tryit-chat-lines" className="flex max-w-xl flex-col gap-0.5">
        {history.slice(-CHAT_SHOWN).map((one, index) => (
          <li
            key={index}
            data-testid="tryit-chat-line"
            data-result={one.result}
            className="rounded bg-black/60 px-2 py-0.5 text-white"
          >
            <span className="text-white/70">{one.typed}</span>
            {one.answer.map((answer) => (
              <span
                key={answer}
                className={`block ${one.result === 'error' ? 'text-[#ff8080]' : one.result === 'game' ? 'text-[#ffd479]' : ''}`}
              >
                {answer}
              </span>
            ))}
          </li>
        ))}
      </ol>
      {hints.length > 0 && (
        <ul
          data-testid="tryit-chat-hints"
          className="max-w-xl rounded bg-black/60 px-2 py-0.5 text-white/80"
        >
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        aria-label="Chat: type a command"
        data-testid="tryit-chat-input"
        value={line}
        className="w-full rounded bg-black/70 px-2 py-1 font-mono text-white outline-none"
        onChange={(event) => setLine(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            onRun(line);
            setLine('');
            setBack(0);
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const next = Math.max(
              0,
              Math.min(typed.length, back + (event.key === 'ArrowUp' ? 1 : -1)),
            );
            setBack(next);
            setLine(next === 0 ? '' : (typed[typed.length - next] ?? ''));
          }
        }}
        onKeyUp={(event) => event.stopPropagation()}
      />
      <p className="text-xs text-white/80 [text-shadow:0_0_2px_#000]">
        Your mod's commands run here as in the game; the game's own commands run only in Minecraft.
      </p>
    </div>
  );
}
