/**
 * One showcase card (ADR 0118 D1, D9–D11; B568): the picture (a live clip or a still) with the
 * **Preview** tag and a Play or Pause chip, the title, the sentence, **Make this** and **See
 * the example**. The Rules card has no flow, so **See the example** is its main button.
 *
 * The picture is a button named "Clip: <title>": a click, Space or Enter plays or pauses it.
 * Without WebGL it is a plain picture with the line "This computer cannot show moving pictures
 * here." Presentational: the gallery decides which card plays.
 *
 * Test ids: `showcase-card-<id>`, `showcase-picture-<id>`, `showcase-still-<id>`,
 * `showcase-make-<id>`, `showcase-example-<id>`, `showcase-no-webgl-<id>`.
 *
 * @packageDocumentation
 */

import { Pause, Play } from 'lucide-react';
import type { FocusEvent, ReactNode, Ref } from 'react';
import { Button } from '../components/ui/Button';
import type { ShowcaseClip } from './clip';

/** The line under a card's still without WebGL (ADR 0118 D9). */
export const NO_MOVING_PICTURES = 'This computer cannot show moving pictures here.';

/** Props of {@link ShowcaseCard}. */
export interface ShowcaseCardProps {
  readonly clip: ShowcaseClip;
  /** The still to show when not live: taken, else drawn; `null` while it is being drawn. */
  readonly still: string | null;
  /** The live clip, when this card plays. */
  readonly live?: ReactNode;
  /** Whether clips can play here at all (WebGL). */
  readonly webgl: boolean;
  readonly onTogglePlay?: () => void;
  /** Absent hides **Make this** (the Rules card). */
  readonly onMake?: () => void;
  readonly onSeeExample: () => void;
  readonly onHover?: (inside: boolean) => void;
  readonly onFocusChange?: (inside: boolean) => void;
  readonly cardRef?: Ref<HTMLLIElement>;
}

/** A showcase card. */
export function ShowcaseCard(props: ShowcaseCardProps) {
  const { clip, still, live, webgl } = props;
  const playing = live !== undefined && live !== null && live !== false;
  const name = `Clip: ${clip.title}`;
  const onBlur = (event: FocusEvent<HTMLLIElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    props.onFocusChange?.(false);
  };
  const picture = (
    <>
      {playing ? (
        live
      ) : still === null ? (
        <span className="block size-full bg-bg" />
      ) : (
        <img
          src={still}
          alt=""
          className="block size-full object-cover [image-rendering:pixelated]"
          data-testid={`showcase-still-${clip.id}`}
        />
      )}
      <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/70 px-1 py-0.5 font-medium text-[10px] text-white uppercase tracking-wide">
        Preview
      </span>
      {webgl && (
        <span className="pointer-events-none absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
          {playing ? <Pause aria-hidden size={10} /> : <Play aria-hidden size={10} />}
          {playing ? 'Pause' : 'Play'}
        </span>
      )}
    </>
  );
  const pictureClass =
    'relative block aspect-video w-full overflow-hidden rounded border border-border bg-bg p-0';
  return (
    <li
      ref={props.cardRef}
      className="flex w-64 shrink-0 flex-col gap-1.5 rounded-md border border-border bg-panel p-2"
      data-testid={`showcase-card-${clip.id}`}
      onPointerEnter={() => props.onHover?.(true)}
      onPointerLeave={() => props.onHover?.(false)}
      onFocus={() => props.onFocusChange?.(true)}
      onBlur={onBlur}
    >
      {webgl ? (
        <button
          type="button"
          aria-label={name}
          aria-pressed={playing}
          className={`${pictureClass} cursor-pointer focus-visible:outline-2 focus-visible:outline-accent`}
          data-testid={`showcase-picture-${clip.id}`}
          onClick={() => props.onTogglePlay?.()}
        >
          {picture}
        </button>
      ) : (
        <div
          role="img"
          aria-label={name}
          className={pictureClass}
          data-testid={`showcase-picture-${clip.id}`}
        >
          {picture}
        </div>
      )}
      {!webgl && (
        <p className="text-muted text-xs" data-testid={`showcase-no-webgl-${clip.id}`}>
          {NO_MOVING_PICTURES}
        </p>
      )}
      <h3 className="font-semibold text-sm">{clip.title}</h3>
      <p className="text-sm">{clip.sentence}</p>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {props.onMake !== undefined && (
          <Button
            className="border-accent"
            data-testid={`showcase-make-${clip.id}`}
            onClick={() => props.onMake?.()}
          >
            Make this
          </Button>
        )}
        <Button
          {...(props.onMake === undefined ? { className: 'border-accent' } : {})}
          data-testid={`showcase-example-${clip.id}`}
          onClick={() => props.onSeeExample()}
        >
          See the example
        </Button>
      </div>
    </li>
  );
}
