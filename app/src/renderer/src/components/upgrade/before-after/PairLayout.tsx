/**
 * Two views of one thing, before and after a move (ADR 0136 D13, B819): side by side where
 * there is room, and on a narrow window one over the other with a slider that uncovers the
 * after side from the right. Each side is named in words (and its version).
 *
 * @packageDocumentation
 */

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/** Below this width (CSS pixels) the two views share one place and a slider. */
export const NARROW_WIDTH = 560;

/** Props of {@link PairLayout}. */
export interface PairLayoutProps {
  /** What each side is called ("Before the move, Minecraft 1.0"). */
  beforeLabel: string;
  afterLabel: string;
  before: ReactNode;
  after: ReactNode;
  /** Test hook and override: the layout (default: by the width there is). */
  layout?: 'wide' | 'narrow';
}

/** The width of the element `ref` holds, followed as it changes (0 before it is laid out). */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** The pair; see the module comment. */
export function PairLayout(props: PairLayoutProps) {
  const [ref, width] = useWidth();
  const layout = props.layout ?? (width > 0 && width < NARROW_WIDTH ? 'narrow' : 'wide');
  const [split, setSplit] = useState(50);
  const sliderId = useId();
  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-col gap-2"
      data-testid="upgrade-pair"
      data-layout={layout}
    >
      {layout === 'wide' ? (
        <div className="grid grid-cols-2 gap-2">
          <figure className="flex min-w-0 flex-col gap-1" data-testid="upgrade-pair-before">
            <figcaption className="font-medium text-xs">{props.beforeLabel}</figcaption>
            {props.before}
          </figure>
          <figure className="flex min-w-0 flex-col gap-1" data-testid="upgrade-pair-after">
            <figcaption className="font-medium text-xs">{props.afterLabel}</figcaption>
            {props.after}
          </figure>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{props.beforeLabel}</span>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              value={split}
              aria-label="How much of the after side shows"
              aria-valuetext={`${100 - split} % after`}
              data-testid="upgrade-pair-slider"
              className="min-w-0 flex-1"
              onChange={(event) => setSplit(Number(event.target.value))}
            />
            <span className="font-medium">{props.afterLabel}</span>
          </div>
          <div className="grid min-w-0">
            <section
              className="min-w-0 [grid-area:1/1]"
              data-testid="upgrade-pair-before"
              aria-label={props.beforeLabel}
            >
              {props.before}
            </section>
            <section
              className="min-w-0 bg-panel [grid-area:1/1]"
              data-testid="upgrade-pair-after"
              aria-label={props.afterLabel}
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            >
              {props.after}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
