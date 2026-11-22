/**
 * The frame every live view sits in (ADR 0120 D2): the Preview tag, the fidelity level, the notes
 * that name what the view left out, and the set-up banner when a vanilla file is needed. A view
 * that draws without this frame is refused at review. B608 builds the situation picker and the
 * sample slots on top of it.
 */

import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { FIDELITY_HINTS, FIDELITY_LABELS, type Fidelity } from './fidelity';

/** Props of {@link LiveViewFrame}. */
export interface LiveViewFrameProps {
  /** What the view is of, in plain words ("Loot table", "Advancement tab"). */
  title: string;
  /** The level the whole view claims (the weakest of its parts). */
  fidelity: Fidelity;
  /** What the view drew only about right or left out, one plain line each. */
  notes?: readonly string[];
  /** True when a vanilla file is needed and the Minecraft folder is not set up. */
  needsSetUp?: boolean;
  /** Opens the Minecraft folder settings. */
  onSetup?(): void;
  children?: ReactNode;
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
  const { title, fidelity, notes = [], needsSetUp = false, onSetup, children } = props;
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
      {needsSetUp && onSetup !== undefined && (
        <div
          role="status"
          data-testid="live-view-set-up"
          className="flex flex-wrap items-center gap-2 rounded border border-warning px-3 py-2 text-sm"
        >
          <span>Set up your Minecraft folder to see Minecraft’s own data here.</span>
          <Button onClick={onSetup}>Set up Minecraft folder</Button>
        </div>
      )}
      {children}
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
