/**
 * Transport controls of the geo preview: the animation picker, play and pause, and a time
 * slider (seconds, 0 to `animation_length`). Time-based, so it is separate from the texture
 * `FrameScrubber`, which steps whole frames; it shares that component's layout and buttons.
 */

import { Pause, Play } from 'lucide-react';
import { useId } from 'react';
import { iconButtonClass } from '../../components/ui/Button';
import { type ParsedAnimation, playbackTime } from './keyframes';

/** Props of {@link AnimationTransport}. */
export interface AnimationTransportProps {
  animations: readonly ParsedAnimation[];
  selected: string | null;
  current: ParsedAnimation | undefined;
  elapsed: number;
  playing: boolean;
  onSelect(name: string | null): void;
  onPlayingChange(playing: boolean): void;
  onScrub(time: number): void;
}

/** Play, pause, a time slider and the animation picker. */
export function AnimationTransport(props: AnimationTransportProps) {
  const { animations, current, playing } = props;
  const pickerId = useId();
  const sliderId = useId();
  const length = current?.length ?? 0;
  const time = current === undefined ? 0 : playbackTime(current, props.elapsed).time;
  return (
    <fieldset
      data-testid="preview-geo-transport"
      className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0 text-xs"
      aria-label="Animation playback"
    >
      <div className="flex items-center gap-1">
        <label htmlFor={pickerId} className="sr-only">
          Animation
        </label>
        <select
          id={pickerId}
          data-testid="preview-geo-animation"
          className="min-w-0 flex-1 rounded border border-border bg-bg px-1 py-0.5"
          value={props.selected ?? ''}
          onChange={(event) =>
            props.onSelect(event.target.value === '' ? null : event.target.value)
          }
        >
          <option value="">No animation (rest pose)</option>
          {animations.map((animation) => (
            <option key={animation.name} value={animation.name}>
              {animation.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="preview-geo-play"
          className={iconButtonClass}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          aria-pressed={playing}
          title={playing ? 'Pause' : 'Play'}
          disabled={current === undefined}
          onClick={() => props.onPlayingChange(!playing)}
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
        <label htmlFor={sliderId} className="sr-only">
          Animation time
        </label>
        <input
          id={sliderId}
          data-testid="preview-geo-slider"
          type="range"
          className="min-w-0 flex-1"
          min={0}
          max={length}
          step={0.01}
          value={Math.min(time, length)}
          disabled={current === undefined || length === 0}
          onChange={(event) => props.onScrub(Number(event.target.value))}
        />
      </div>
      <p data-testid="preview-geo-time" className="text-muted">
        {current === undefined
          ? 'Rest pose'
          : `${current.name}: ${time.toFixed(2)} s of ${length.toFixed(2)} s (${
              current.loop === true
                ? 'loops'
                : current.loop === 'hold_on_last_frame'
                  ? 'holds the last frame'
                  : 'plays once'
            })`}
      </p>
    </fieldset>
  );
}
