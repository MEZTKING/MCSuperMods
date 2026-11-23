/**
 * Home's **More ideas** (ADR 0128 D1, D5): the heading with **Shuffle**, under the Showcase, and
 * the endless grid of idea cards. Only the heading is in Home's first paint: the grid, the
 * Surprise me generator's card code and the pictures load as a lazy chunk
 * (`ideas/IdeaList.tsx`) when the section first comes near the view (an intersection observer;
 * at once where there is none).
 *
 * Test ids: `more-ideas`, `more-ideas-shuffle`, and the list's (`IdeaList.tsx`).
 *
 * @packageDocumentation
 */

import { Shuffle } from 'lucide-react';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import type { IdeaListProps } from '../../ideas/IdeaList';
import { Button } from '../ui/Button';

const LazyIdeaList = lazy(() => import('../../ideas/IdeaList'));

/** The heading of the section. */
export const MORE_IDEAS = 'More ideas';

/** How far below the view the section starts loading, in CSS pixels. */
const NEAR = '800px';

/** Props of {@link MoreIdeas}: the list's, plus Shuffle. */
export interface MoreIdeasProps extends IdeaListProps {
  /** **Shuffle**: a new base seed. */
  readonly onShuffle: () => void;
  /** Test hook: load the list at once. */
  readonly eager?: boolean;
}

/** The More ideas section. */
export function MoreIdeas(props: MoreIdeasProps) {
  const { onShuffle, eager, ...list } = props;
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
            section.current?.scrollIntoView?.({ block: 'start' });
          }}
        >
          <Shuffle size={14} aria-hidden />
          Shuffle
        </Button>
      </div>
      <p className="text-muted text-sm">
        Mods you could make, one after another. Make this starts a new mod from that idea.
      </p>
      {near && (
        <Suspense fallback={<p className="text-muted text-sm">Thinking of ideas…</p>}>
          <LazyIdeaList {...list} />
        </Suspense>
      )}
    </section>
  );
}
