/**
 * The frame every live view sits in (ADR 0120 D2): the Preview tag, the fidelity level, the view's
 * controls (the situation picker, the seed box), the set-up banner when a vanilla file is needed,
 * the parts an evaluator could not work out (each named, never dropped silently) and the notes
 * that name what the view left out. A view that draws without this frame is refused at review.
 */

import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import {
  distinctParts,
  FIDELITY_HINTS,
  FIDELITY_LABELS,
  type Fidelity,
  type UnsupportedPart,
  unsupportedLine,
} from './fidelity';

/** The words of the set-up banner. */
export const SET_UP_DATA_WORDS = 'Set up your Minecraft folder to see Minecraft’s own data here.';

/**
 * Whether the frame shows the set-up banner (B603's rule): only when a read of vanilla's files
 * answered `not_set_up` and the view names a vanilla file. Project-only data draws in full
 * without the Minecraft folder and says nothing about it.
 */
export function needsSetUpBanner(
  readStatus: 'ready' | 'not_set_up' | 'loading' | null,
  namesVanillaFile: boolean,
): boolean {
  return readStatus === 'not_set_up' && namesVanillaFile;
}

/** Props of {@link LiveViewFrame}. */
export interface LiveViewFrameProps {
  /** What the view is of, in plain words ("Loot table", "Advancement tab"). */
  title: string;
  /** The level the whole view claims (the weakest of its parts). */
  fidelity: Fidelity;
  /** What the view drew only about right or left out, one plain line each. */
  notes?: readonly string[];
  /** True when a vanilla file is needed and the Minecraft folder is not set up ({@link needsSetUpBanner}). */
  needsSetUp?: boolean;
  /** Opens the Minecraft folder settings. */
  onSetup?(): void;
  /** What the evaluators reported they could not work out (`@msm/sim`'s `Unsupported`). */
  unsupported?: readonly UnsupportedPart[];
  /** The view's controls (situation picker, seed box), drawn above its body. */
  controls?: ReactNode;
  children?: ReactNode;
}

/** The list of parts only the game knows. */
function UnsupportedList({ parts }: { parts: readonly UnsupportedPart[] }) {
  const { shown, more } = distinctParts(parts);
  if (shown.length === 0) return null;
  return (
    <div data-testid="live-view-unsupported" className="flex flex-col gap-1 text-xs">
      <span className="font-medium">{FIDELITY_LABELS.only_in_game}</span>
      <ul
        aria-label="Only in the game"
        className="flex flex-col gap-1 text-muted [overflow-wrap:anywhere]"
      >
        {shown.map((part) => (
          <li
            key={`${part.kind}|${part.type}|${part.path}|${part.reason}`}
            data-type={part.type}
            data-reason={part.reason}
          >
            {unsupportedLine(part)}
          </li>
        ))}
        {more > 0 && <li>{`and ${more} more`}</li>}
      </ul>
    </div>
  );
}

/** The Preview tag (the plan's limit WL1). */
function PreviewTag() {
  return (
    <span
      data-testid="live-view-tag"
      title="Worked out by MSM from your files, not made by the game. Play is the real check."
      className="rounded border border-border px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted"
    >
      Preview
    </span>
  );
}

/** The frame: tag, level, body, notes. */
export function LiveViewFrame(props: LiveViewFrameProps) {
  const {
    title,
    fidelity,
    notes = [],
    needsSetUp = false,
    onSetup,
    unsupported = [],
    controls,
    children,
  } = props;
  return (
    <section aria-label={title} data-testid="live-view" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <PreviewTag />
        <span
          data-testid="live-view-fidelity"
          data-fidelity={fidelity}
          title={FIDELITY_HINTS[fidelity]}
          className="text-xs text-muted"
        >
          {FIDELITY_LABELS[fidelity]}
        </span>
      </header>
      {controls}
      {needsSetUp && onSetup !== undefined && (
        <div
          role="status"
          data-testid="live-view-set-up"
          className="flex flex-wrap items-center gap-2 rounded border border-warning px-3 py-2 text-sm"
        >
          <span>{SET_UP_DATA_WORDS}</span>
          <Button onClick={onSetup}>Set up Minecraft folder</Button>
        </div>
      )}
      {children}
      <UnsupportedList parts={unsupported} />
      {notes.length > 0 && (
        <ul
          aria-label="What this view leaves out"
          data-testid="live-view-notes"
          className="flex flex-col gap-1 text-xs text-muted [overflow-wrap:anywhere]"
        >
          {notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What every stub view of B601 says inside the frame, until its own brief builds it. */
export function NotYet({ title, brief }: { title: string; brief: string }) {
  return (
    <LiveViewFrame
      title={title}
      fidelity="only_in_game"
      notes={[`This view is not built yet (${brief}); the data is saved as you made it.`]}
    >
      <p data-testid="live-view-not-yet" className="text-sm text-muted">
        Not yet: this view is on its way.
      </p>
    </LiveViewFrame>
  );
}
