/**
 * The seed of a live view's roll (B608): the seed as typed and a button that rolls a new one
 * ("Roll again"). Views are pure and seeded: the same seed gives the same roll every time, and
 * the seed is kept with the view preferences, never in the project. Rolling is the user's
 * action, so `Math.random` is used here and never in an evaluator. The worker turns the text
 * into the number it rolls with (`seedNumber` in `client.ts`).
 */

import { Dices } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';

/** A new seed: a whole number below a billion, as text. */
export function newSeed(random: () => number = Math.random): string {
  return String(Math.floor(random() * 1_000_000_000));
}

/** Props of {@link SeedBox}. */
export interface SeedBoxProps {
  /** The seed as typed. */
  readonly seed: string;
  onSeed(seed: string): void;
  /** The button's words (default "Roll again"). */
  readonly rollLabel?: string;
  /** A source of numbers for the button (tests). */
  readonly random?: () => number;
}

/** The seed box and its roll button. Enter or leaving the box keeps what was typed. */
export function SeedBox({ seed, onSeed, rollLabel = 'Roll again', random }: SeedBoxProps) {
  const [text, setText] = useState(seed);
  useEffect(() => setText(seed), [seed]);
  const commit = (): void => {
    const trimmed = text.trim();
    if (trimmed !== '' && trimmed !== seed) onSeed(trimmed);
    else setText(seed);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        Seed
        <input
          data-testid="live-view-seed"
          className="w-32 min-w-0 max-w-full rounded border border-border bg-bg px-1 tabular-nums"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setText(seed);
          }}
        />
      </label>
      <Button data-testid="live-view-roll" onClick={() => onSeed(newSeed(random))}>
        <Dices size={14} aria-hidden />
        {rollLabel}
      </Button>
    </div>
  );
}
