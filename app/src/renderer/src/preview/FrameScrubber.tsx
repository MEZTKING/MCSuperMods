/**
 * Steps through an animated texture's frames: a play toggle, previous and next buttons and a
 * slider. While playing, each frame shows for its `time` in ticks (`time × 50 ms`); frames
 * step, they are never blended.
 */

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useId } from 'react';
import { iconButtonClass } from '../components/ui/Button';
import { type AnimationFrame, TICK_MS } from './animation';

/** Props of {@link FrameScrubber}. */
export interface FrameScrubberProps {
  /** The animated texture's id, shown as the label. */
  textureId: string;
  /** The playback sequence. */
  frames: readonly AnimationFrame[];
  /** The current step of the sequence. */
  step: number;
  playing: boolean;
  onStepChange(step: number): void;
  onPlayingChange(playing: boolean): void;
}

/** Frame controls for the preview of an animated texture. */
export function FrameScrubber(props: FrameScrubberProps) {
  const { frames, step, playing, onStepChange } = props;
  const count = frames.length;
  const current = frames[Math.min(step, count - 1)];
  const sliderId = useId();

  useEffect(() => {
    if (!playing || current === undefined || count < 2) return;
    const timer = setTimeout(() => onStepChange((step + 1) % count), current.time * TICK_MS);
    return () => clearTimeout(timer);
  }, [playing, current, count, step, onStepChange]);

  if (current === undefined) return null;
  const go = (next: number): void => onStepChange(((next % count) + count) % count);

  return (
    <fieldset
      data-testid="preview-frame-scrubber"
      className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0 text-xs"
      aria-label={`Animation of ${props.textureId}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="preview-frame-play"
          className={iconButtonClass}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          aria-pressed={playing}
          title={playing ? 'Pause' : 'Play'}
          disabled={count < 2}
          onClick={() => props.onPlayingChange(!playing)}
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
        <button
          type="button"
          data-testid="preview-frame-previous"
          className={iconButtonClass}
          aria-label="Previous frame"
          title="Previous frame"
          onClick={() => go(step - 1)}
        >
          <SkipBack size={14} aria-hidden />
        </button>
        <button
          type="button"
          data-testid="preview-frame-next"
          className={iconButtonClass}
          aria-label="Next frame"
          title="Next frame"
          onClick={() => go(step + 1)}
        >
          <SkipForward size={14} aria-hidden />
        </button>
        <label htmlFor={sliderId} className="sr-only">
          Frame
        </label>
        <input
          id={sliderId}
          data-testid="preview-frame-slider"
          type="range"
          className="min-w-0 flex-1"
          min={0}
          max={count - 1}
          step={1}
          value={Math.min(step, count - 1)}
          onChange={(event) => {
            props.onPlayingChange(false);
            go(Number(event.target.value));
          }}
        />
      </div>
      <p data-testid="preview-frame-label" className="text-muted">
        {props.textureId}: frame {Math.min(step, count - 1) + 1} of {count} (strip index{' '}
        {current.index}, {current.time} {current.time === 1 ? 'tick' : 'ticks'})
      </p>
    </fieldset>
  );
}
