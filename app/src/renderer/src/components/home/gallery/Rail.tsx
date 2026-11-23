/**
 * A row of cards that scrolls sideways (ADR 0129 D5, the user's layout A "Store rows"): one line
 * that snaps to cards and shows part of the next one as a hint; it scrolls with a sideways wheel
 * or trackpad, with the arrow keys (focus moves to the next or previous card and the row follows)
 * and, for a mouse, with the **Scroll left** and **Scroll right** buttons shown on hover at its
 * ends while there is more that way.
 *
 * Test ids: `<testId>` on the list, `<testId>-left`, `<testId>-right`.
 *
 * @packageDocumentation
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { railClass } from './card-style';

/** Props of {@link Rail}. */
export interface RailProps {
  /** The cards (`li` elements). */
  readonly children: ReactNode;
  /** The row's accessible name ("Featured"). */
  readonly label: string;
  readonly testId: string;
  /** The list element, for the host's measuring. */
  readonly listRef?: Ref<HTMLUListElement>;
}

/** Moves focus to the next or previous card's first button on the arrow keys. */
export function onCardArrows(event: KeyboardEvent<HTMLElement>): void {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (step === 0) return;
  const item = (event.target as HTMLElement).closest('li');
  const sibling = step === 1 ? item?.nextElementSibling : item?.previousElementSibling;
  const button = sibling?.querySelector<HTMLButtonElement>('button');
  if (button === null || button === undefined) return;
  event.preventDefault();
  button.focus();
  sibling?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** A row's **Scroll left** or **Scroll right** button (shown on hover or focus). */
export const sideButton =
  'absolute top-[calc(50%-1rem)] z-10 hidden size-8 cursor-pointer items-center justify-center ' +
  'rounded-full border border-border bg-panel/95 shadow-md hover:border-accent group-hover/rail:flex ' +
  'focus-visible:flex focus-visible:outline-2 focus-visible:outline-accent';

/** A sideways-scrolling row of cards. */
export function Rail(props: RailProps) {
  const list = useRef<HTMLUListElement | null>(null);
  const [ends, setEnds] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const element = list.current;
    if (element === null) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setEnds((before) =>
      before.left === left && before.right === right ? before : { left, right },
    );
  }, []);
  useEffect(() => {
    const element = list.current;
    if (element === null) return;
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [update]);
  const setList = (element: HTMLUListElement | null): void => {
    list.current = element;
    const { listRef } = props;
    if (typeof listRef === 'function') listRef(element);
    else if (listRef !== null && listRef !== undefined) {
      (listRef as { current: HTMLUListElement | null }).current = element;
    }
  };
  const page = (direction: 1 | -1): void => {
    const element = list.current;
    if (element === null) return;
    const by = Math.max(240, element.clientWidth * 0.8) * direction;
    if (typeof element.scrollBy === 'function') element.scrollBy({ left: by, behavior: 'smooth' });
    else element.scrollLeft += by;
  };
  return (
    <div className="group/rail relative min-w-0">
      {ends.left && (
        <button
          type="button"
          aria-label={`Scroll ${props.label} left`}
          className={`${sideButton} -left-3`}
          data-testid={`${props.testId}-left`}
          onClick={() => page(-1)}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
      )}
      <ul
        ref={setList}
        aria-label={props.label}
        className={railClass}
        data-testid={props.testId}
        onKeyDown={onCardArrows}
      >
        {props.children}
      </ul>
      {ends.right && (
        <button
          type="button"
          aria-label={`Scroll ${props.label} right`}
          className={`${sideButton} -right-3`}
          data-testid={`${props.testId}-right`}
          onClick={() => page(1)}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}
