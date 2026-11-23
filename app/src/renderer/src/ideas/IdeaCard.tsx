/**
 * One card of **More ideas** (ADR 0128 D1, D2): the drawn picture (or the live clip), the mod's
 * name, its line in words and **Make this**; the names of its things are the line's tip. While
 * the idea is being rolled the card shows a plain frame and "Thinking of an idea…".
 *
 * The card is the gallery's card (D7 of the plan after 1.5.8, `card-style.ts`): the same frame,
 * 240 by 150 picture box, tag, title and sentence type and the accent **Make this**, so a More
 * ideas row lines up with the gallery's rows; {@link IDEA_CARD_WIDTH} by
 * {@link IDEA_CARD_HEIGHT} is that card's size.
 *
 * The picture is a button named "Clip: <name>" when the idea has a clip and clips can play
 * (WebGL): a click, Space or Enter plays or pauses it. The card's **Make this** carries the
 * keyboard navigation of the grid (the arrow keys move between cards, `IdeaList.tsx`).
 * Presentational: the list decides which card plays.
 *
 * Test ids: `idea-card-<n>`, `idea-picture-<n>`, `idea-still-<n>`, `idea-name-<n>`,
 * `idea-line-<n>`, `idea-make-<n>` (n from 0, the card's place in the list).
 *
 * @packageDocumentation
 */

import { Pause, Play } from 'lucide-react';
import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode } from 'react';
import {
  pixelImageClass,
  primaryButtonClass,
  storeActionsClass,
  storeBodyClass,
  storeCardClass,
  storePictureClass,
  storeSentenceClass,
  storeTagClass,
  storeTitleClass,
} from '../components/home/gallery/card-style';
import { IDEA_CARD_HEIGHT, IDEA_CARD_WIDTH } from './idea-seeds';
import { IDEA_PICTURE_HEIGHT, IDEA_PICTURE_WIDTH, type Idea, listInWords } from './ideas';

/** The words of a card still being rolled. */
export const IDEA_THINKING = 'Thinking of an idea…';
/** The tag above an idea's name. */
export const IDEA_TAG = 'Idea';
/** At most this many thing names on a card. */
const MAX_NAMES = 4;

/** "Ruby Ore, Ruby Sword, Ruby Fox and 3 more". */
export function namesLine(names: readonly string[]): string {
  if (names.length <= MAX_NAMES) return listInWords(names);
  return `${names.slice(0, MAX_NAMES).join(', ')} and ${names.length - MAX_NAMES} more`;
}

/** Props of {@link IdeaCard}. */
export interface IdeaCardProps {
  /** The card's place in the list (from 0). */
  readonly index: number;
  /** The rolled idea, or `null` while it is being rolled. */
  readonly idea: Idea | null;
  /** The drawn picture, or `null` while it is being drawn. */
  readonly picture: string | null;
  /** The live clip, when this card plays. */
  readonly live?: ReactNode;
  /** Whether the picture is a play button (the idea has a clip and WebGL is there). */
  readonly playable: boolean;
  readonly style?: CSSProperties;
  readonly onMake: (idea: Idea) => void;
  readonly onTogglePlay?: () => void;
  readonly onHover?: (inside: boolean) => void;
  readonly onFocusChange?: (inside: boolean) => void;
  /** The grid's arrow keys, from the card's buttons. */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

/** An idea card. */
export function IdeaCard(props: IdeaCardProps) {
  const { idea, index, picture, live } = props;
  const playing = live !== undefined && live !== null && live !== false;
  const onBlur = (event: FocusEvent<HTMLLIElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    props.onFocusChange?.(false);
  };
  const frame = (
    <>
      {playing ? (
        live
      ) : picture === null ? (
        <span aria-hidden className="block size-full bg-border/40" />
      ) : (
        <img
          src={picture}
          alt=""
          width={IDEA_PICTURE_WIDTH}
          height={IDEA_PICTURE_HEIGHT}
          className={pixelImageClass}
          data-testid={`idea-still-${index}`}
        />
      )}
      {props.playable && (
        <span className="pointer-events-none absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
          {playing ? <Pause aria-hidden size={10} /> : <Play aria-hidden size={10} />}
          {playing ? 'Pause' : 'Play'}
        </span>
      )}
    </>
  );
  const makes = idea === null || idea.makes.length === 0 ? null : `Makes ${namesLine(idea.makes)}.`;
  return (
    <li
      className={`${storeCardClass} absolute`}
      style={{ width: IDEA_CARD_WIDTH, height: IDEA_CARD_HEIGHT, ...props.style }}
      data-testid={`idea-card-${index}`}
      aria-busy={idea === null}
      onPointerEnter={() => props.onHover?.(true)}
      onPointerLeave={() => props.onHover?.(false)}
      onFocus={() => props.onFocusChange?.(true)}
      onBlur={onBlur}
    >
      {props.playable && idea !== null ? (
        <button
          type="button"
          aria-label={`Clip: ${idea.name}`}
          aria-pressed={playing}
          className={`${storePictureClass} shrink-0 cursor-pointer p-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
          data-testid={`idea-picture-${index}`}
          onClick={() => props.onTogglePlay?.()}
          onKeyDown={props.onKeyDown}
        >
          {frame}
        </button>
      ) : (
        <div
          role="img"
          aria-label={idea === null ? IDEA_THINKING : `Picture: ${idea.name}`}
          className={`${storePictureClass} shrink-0`}
          data-testid={`idea-picture-${index}`}
        >
          {frame}
        </div>
      )}
      <div className={storeBodyClass}>
        <span className={storeTagClass}>{IDEA_TAG}</span>
        <h3
          className={storeTitleClass}
          title={idea?.name}
          {...(idea === null ? {} : { 'data-testid': `idea-name-${index}` })}
        >
          {idea === null ? IDEA_THINKING : idea.name}
        </h3>
        <p
          className={storeSentenceClass}
          {...(makes === null ? {} : { title: makes })}
          {...(idea === null ? {} : { 'data-testid': `idea-line-${index}` })}
        >
          {idea === null ? '' : idea.line}
        </p>
        <div className={storeActionsClass}>
          <button
            type="button"
            className={`${primaryButtonClass} aria-disabled:cursor-default aria-disabled:opacity-60`}
            aria-disabled={idea === null}
            aria-label={idea === null ? 'Make this (still thinking)' : `Make this: ${idea.name}`}
            data-testid={`idea-make-${index}`}
            data-idea-index={index}
            onClick={() => {
              if (idea !== null) props.onMake(idea);
            }}
            onKeyDown={props.onKeyDown}
          >
            Make this
          </button>
        </div>
      </div>
    </li>
  );
}
