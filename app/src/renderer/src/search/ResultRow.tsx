/**
 * One result row (ADR 0124 D6, D11): an option of the panel's listbox with a source picture and
 * word, the title, the understood answers as a sentence (or the entry's own sentence), what the
 * behaviour adds, the id in Advanced, and the reason when the target cannot make it (greyed and
 * said, never by colour alone). Rows never take focus: a press keeps focus in the field.
 *
 * @packageDocumentation
 */

import type { SearchHit, SearchMode, Understood } from '@msm/search';
import type { ReactNode } from 'react';
import { rowText, type SourcePicture } from './wording';

/** The small picture of each source, drawn in the text colour (the word beside it says the same). */
export function SourceIcon({ picture }: { picture: SourcePicture }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      data-picture={picture}
    >
      {SOURCE_SHAPES[picture]}
    </svg>
  );
}

/** The shapes of each source picture. */
const SOURCE_SHAPES: Readonly<Record<SourcePicture, ReactNode>> = {
  make: <path d="M8 3v10M3 8h10" />,
  mine: (
    <>
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <path d="M6 8h4" />
    </>
  ),
  minecraft: <path d="M8 2l5 3v6l-5 3-5-3V5z M3 5l5 3 5-3 M8 8v6" />,
  help: <path d="M3 3h4a1 1 0 011 1v9a1 1 0 00-1-1H3z M13 3H9a1 1 0 00-1 1v9a1 1 0 011-1h4z" />,
  setting: (
    <>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" />
    </>
  ),
  command: <path d="M3 4l4 4-4 4M8 12h5" />,
  fix: <path d="M8 2l6 11H2z M8 6v4 M8 11.5v.5" />,
};

export interface ResultRowProps {
  readonly hit: SearchHit;
  readonly understood: Understood;
  readonly mode: SearchMode;
  /** The option's id (the field's `aria-activedescendant`). */
  readonly id: string;
  readonly active: boolean;
  /** Whether the list may animate (off with reduced motion). */
  readonly motion: boolean;
  /** A press runs the main action. */
  readonly onPick: () => void;
  /** The pointer over the row makes it the active one. */
  readonly onHover: () => void;
}

export function ResultRow({
  hit,
  understood,
  mode,
  id,
  active,
  motion,
  onPick,
  onHover,
}: ResultRowProps) {
  const text = rowText(hit, understood, mode);
  const unavailable = hit.entry.available === false;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keys reach rows through the field (combobox, aria-activedescendant).
    <div
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      aria-disabled={unavailable || undefined}
      data-testid={`search-row-${hit.entry.id}`}
      data-source={hit.entry.source}
      data-active={active || undefined}
      className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm ${
        motion ? 'transition-colors duration-100' : ''
      } ${active ? 'bg-bg outline outline-1 outline-accent' : ''} ${
        unavailable ? 'opacity-60' : ''
      }`}
      onMouseDown={(event) => {
        // Keep focus (and every typed letter) in the field.
        event.preventDefault();
      }}
      onClick={onPick}
      onMouseMove={() => {
        if (!active) onHover();
      }}
    >
      <span className="mt-0.5 flex w-20 shrink-0 items-center gap-1 text-muted text-xs">
        <SourceIcon picture={text.source.picture} />
        <span>{text.source.word}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className={`break-words ${active ? 'font-semibold' : ''}`}>{text.title}</span>
          {text.id !== null && (
            <code className="break-all text-muted text-xs" data-testid="search-row-id">
              {text.id}
            </code>
          )}
        </span>
        {text.detail !== null && (
          <span className="flex flex-wrap items-center gap-1 break-words text-muted text-xs">
            {text.answers
              .filter((answer) => answer.swatch !== undefined)
              .map((answer) => (
                <span
                  key={answer.question}
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-sm border border-border"
                  style={{ backgroundColor: answer.swatch }}
                />
              ))}
            <span>{text.detail}</span>
          </span>
        )}
        {text.behaviour !== null && (
          <span className="break-words text-muted text-xs" data-testid="search-row-behaviour">
            {text.behaviour}
          </span>
        )}
        {text.reason !== null && (
          <span className="text-muted text-xs italic" data-testid="search-row-reason">
            {text.reason}
          </span>
        )}
      </span>
    </div>
  );
}
