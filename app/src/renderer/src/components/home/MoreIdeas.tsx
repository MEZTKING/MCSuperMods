/**
 * Home's **More ideas** (ADR 0128 D1, D5): the heading with **Shuffle**, under the Showcase, and
 * the endless grid of idea cards. Only the heading is in Home's first paint: the grid, the
 * Surprise me generator's card code and the pictures load as a lazy chunk
 * (`ideas/IdeaList.tsx`) when the section first comes near the view (an intersection observer;
 * at once where there is none).
 *
 * Two looks: `grid` (the default), the endless grid; `row` (ADR 0129 D5, layout A), Home's last
 * gallery row, the same cards in one line that keeps loading as it scrolls sideways, with the
 * gallery's **Show all** in its header (`headerEnd`) opening the grid. While the list's chunk
 * loads, the row shows skeleton cards of the cards' size, so nothing moves when they come.
 *
 * Test ids: `more-ideas`, `more-ideas-shuffle`, `more-ideas-loading`, and the list's
 * (`IdeaList.tsx`).
 *
 * @packageDocumentation
 */

import { Shuffle } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useEffect, useId, useRef, useState } from 'react';
import type { IdeaListProps } from '../../ideas/IdeaList';
import { IDEA_CARD_HEIGHT, IDEA_CARD_WIDTH, IDEA_GAP } from '../../ideas/idea-seeds';
import { Button } from '../ui/Button';

const LazyIdeaList = lazy(() => import('../../ideas/IdeaList'));

/** The heading of the section. */
export const MORE_IDEAS = 'More ideas';

/** How far below the view the section starts loading, in CSS pixels. */
const NEAR = '800px';

/** Props of {@link MoreIdeas}: the list's, plus Shuffle. */
export interface MoreIdeasProps extends Omit<IdeaListProps, 'layout'> {
  /** `grid` (the default) or `row` (Home's gallery row). */
  readonly variant?: 'grid' | 'row';
  /** Shown at the right of the heading (the gallery's **Show all**). */
  readonly headerEnd?: ReactNode;
  /** **Shuffle**: a new base seed. */
  readonly onShuffle: () => void;
  /** Test hook: load the list at once. */
  readonly eager?: boolean;
}

/** Skeleton cards of the row's size while its list loads (no layout shift). */
function RowSkeleton() {
  return (
    <div
      aria-hidden
      className="flex overflow-hidden pt-1 pb-2"
      style={{ gap: IDEA_GAP, height: IDEA_CARD_HEIGHT + 12 }}
      data-testid="more-ideas-loading"
    >
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <span
          key={index}
          className="block shrink-0 animate-pulse rounded-md border border-border bg-border/30 motion-reduce:animate-none"
          style={{ width: IDEA_CARD_WIDTH, height: IDEA_CARD_HEIGHT }}
        />
      ))}
    </div>
  );
}

/** The More ideas section. */
export function MoreIdeas(props: MoreIdeasProps) {
  const { onShuffle, eager, variant, headerEnd, ...list } = props;
  const row = variant === 'row';
  const headingId = useId();
  const section = useRef<HTMLElement | null>(null);
  const [near, setNear] = useState(eager === true);
  useEffect(() => {
    if (near) return;
    const element = section.current;
    if (element === null) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: `0px 0px ${NEAR} 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return (
    <section
      ref={section}
      id="home-more-ideas"
      aria-labelledby={headingId}
      className="flex w-full flex-col gap-2"
      data-testid="more-ideas"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="font-semibold text-base">
          {MORE_IDEAS}
        </h2>
        <Button
          data-testid="more-ideas-shuffle"
          aria-label="Shuffle: show other ideas"
          onClick={() => {
            onShuffle();
            if (!row) section.current?.scrollIntoView?.({ block: 'start' });
          }}
        >
          <Shuffle size={14} aria-hidden />
          Shuffle
        </Button>
        {headerEnd !== undefined && headerEnd !== null && (
          <span className="ml-auto">{headerEnd}</span>
        )}
      </div>
      <p className="text-muted text-sm">
        Mods you could make, one after another. Make this starts a new mod from that idea.
      </p>
      {row ? (
        <Suspense fallback={<RowSkeleton />}>
          {near ? <LazyIdeaList {...list} layout="row" /> : <RowSkeleton />}
        </Suspense>
      ) : (
        near && (
          <Suspense fallback={<p className="text-muted text-sm">Thinking of ideas…</p>}>
            <LazyIdeaList {...list} />
          </Suspense>
        )
      )}
    </section>
  );
}
