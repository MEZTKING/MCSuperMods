/**
 * The bag mock-up screen (B463, ADR 0095, B450 notes): the slots of the screen the game opens
 * for a bag in the hand (the shulker box screen for three rows of a chest layout, the generic
 * chest screens for other rows, the hopper's five, the dispenser's three by three), as plain
 * frames of MSM's own labelled "Mock-up", above the player's own nine hotbar slots. No item
 * moves. Close, Esc or E closes it and fires the bag's `on_close`.
 *
 * Part of the lazy Try it chunk.
 */

import { bagScreenWords, bagSlots, type OpenBag } from '@msm/sim';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** The line under the slots. */
export const BAG_NOTE =
  'The game opens its own screen from your hand. Items do not move in the preview.';

function Slot(props: { label: string; testId: string; locked?: boolean }) {
  return (
    <span
      data-testid={props.testId}
      role="img"
      aria-label={props.label}
      title={props.label}
      className={`block size-8 rounded-sm border-2 border-t-black/50 border-r-white/40 border-b-white/40 border-l-black/50 ${props.locked === true ? 'bg-warning/30' : 'bg-black/20'}`}
    />
  );
}

/** Props of {@link BagScreen}. */
export interface BagScreenProps {
  readonly bag: OpenBag;
  /** The hotbar slot the bag is held in (locked while open, B450). */
  readonly heldSlot: number;
  onClose(): void;
}

/** The screen; see the module comment. */
export function BagScreen({ bag, heldSlot, onClose }: BagScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const { spec } = bag;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${bag.displayName}: Mock-up`}
      data-testid="tryit-bag-screen"
      data-screen={spec.screen}
      data-slots={bagSlots(spec)}
      tabIndex={-1}
      className="absolute top-1/2 left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded border border-border bg-panel p-3 text-sm shadow-lg outline-none"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' || event.code === 'KeyE') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <strong data-testid="tryit-bag-title">{bag.displayName}</strong>
        <span className="rounded border border-warning px-1 text-xs text-warning">Mock-up</span>
        <span className="ml-auto" />
        <button
          type="button"
          aria-label="Close"
          data-testid="tryit-bag-close"
          className="cursor-pointer text-muted hover:text-text"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted" data-testid="tryit-bag-words">
        Stands for the game's {bagScreenWords(spec)}.
      </p>
      <div
        className="grid w-fit gap-0.5 self-center"
        style={{ gridTemplateColumns: `repeat(${spec.columns}, max-content)` }}
      >
        {Array.from({ length: bagSlots(spec) }, (_, index) => (
          <Slot key={index} label={`Slot ${index + 1}`} testId="tryit-bag-slot" />
        ))}
      </div>
      <p className="text-xs text-muted">Your hotbar (the bag's own slot is locked while open):</p>
      <div className="grid w-fit grid-cols-9 gap-0.5 self-center">
        {Array.from({ length: 9 }, (_, index) => (
          <Slot
            key={index}
            label={
              index === heldSlot ? `Hotbar slot ${index + 1}, the bag` : `Hotbar slot ${index + 1}`
            }
            locked={index === heldSlot}
            testId={index === heldSlot ? 'tryit-bag-own-slot' : 'tryit-bag-hotbar-slot'}
          />
        ))}
      </div>
      <p className="text-xs text-muted">{BAG_NOTE}</p>
    </div>
  );
}
